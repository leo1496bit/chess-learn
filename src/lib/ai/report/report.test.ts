import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: { anthropicApiKey: "test-key" } }));

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { DEFAULT_THRESHOLDS, type MoveAnalysis } from "@/lib/analysis/types";
import { extractPositions } from "@/lib/analysis/game";
import { identifyOpening, type OpeningBook } from "@/lib/openings/identify";
import type { MessagesClient } from "../call";
import type { UsageSummary } from "../limits";
import type { UsageRecord } from "../store";
import { BLACK_MISTAKE } from "../test-fixtures";
import { generateGameReport, type ReportStore, type StoredReport } from "./generate";
import { buildReportInput, type ReportGame } from "./input";
import { selectKeyMoments } from "./moments";
import { REPORT_PROMPT_VERSION, REPORT_SYSTEM_PROMPT } from "./prompt";
import type { GameReport } from "./schema";
import { verifyReport } from "./verify";

const book = JSON.parse(readFileSync("src/lib/openings/book.json", "utf8")) as OpeningBook;
const PGN = "1. e4 e5 2. Nf3 f6 3. Nxe5 Qe7 *";
const { fens, moves: gameMoves } = extractPositions(PGN);
const OPENING = identifyOpening(fens, gameMoves.map((m) => m.san), "b", book);

const GAME: ReportGame = {
  white: "adversaire42",
  black: "Leny_l",
  whiteRating: 1210,
  blackRating: 1195,
  playerColor: "b",
  result: "loss",
  resultDetail: "abandon",
  timeClass: "rapid",
  timeControl: "600",
};

const move = (overrides: Partial<MoveAnalysis>): MoveAnalysis => ({ ...BLACK_MISTAKE, ...overrides });

// 1. e4 (bon) 1... e5 (bon) 2. Nf3 (bon) 2... f6 (erreur du joueur) 3. Nxe5 (bon) 3... Qe7 (bon)
const MOVES: MoveAnalysis[] = [
  move({ ply: 1, color: "w", isPlayerMove: false, san: "e4", classification: "best", loss: 0, themes: [], bestSan: "e4" }),
  move({ ply: 2, color: "b", isPlayerMove: true, san: "e5", classification: "excellent", loss: 1, themes: [], bestSan: "e5" }),
  move({ ply: 3, color: "w", isPlayerMove: false, san: "Nf3", classification: "best", loss: 0, themes: [], bestSan: "Nf3" }),
  BLACK_MISTAKE,
  move({ ply: 5, color: "w", isPlayerMove: false, san: "Nxe5", classification: "best", loss: 0, themes: [], bestSan: "Nxe5" }),
  move({ ply: 6, color: "b", isPlayerMove: true, san: "Qe7", classification: "good", loss: 3, themes: [], bestSan: "Qe7" }),
];

describe("selectKeyMoments", () => {
  it("retient les écarts du joueur", () => {
    expect(selectKeyMoments(MOVES, DEFAULT_THRESHOLDS).map((k) => k.move.ply)).toEqual([4]);
  });

  it("retient la réponse du joueur qui ne punit pas une erreur adverse", () => {
    const moves = [
      ...MOVES.slice(0, 4),
      move({ ply: 5, color: "w", isPlayerMove: false, san: "Bc4", classification: "blunder", loss: 25 }),
      move({ ply: 6, color: "b", isPlayerMove: true, san: "Qe7", classification: "good", loss: 6 }),
    ];
    const moments = selectKeyMoments(moves, DEFAULT_THRESHOLDS);
    expect(moments.map((k) => k.move.ply)).toEqual([4, 6]);
    expect(moments[1].unpunished?.san).toBe("Bc4");
  });
});

describe("buildReportInput", () => {
  const input = buildReportInput(GAME, MOVES, OPENING, DEFAULT_THRESHOLDS);

  it("décrit la partie, la précision par phase et l'ouverture du livre", () => {
    expect(input.text).toContain("Joueur à conseiller : Leny_l, qui joue les Noirs.");
    expect(input.text).toContain("Résultat : défaite du joueur (abandon)");
    expect(input.text).toContain("- ouverture : 3 coups");
    expect(input.text).toContain("La partie n'a pas atteint de finale.");
    expect(input.text).toContain(OPENING.name ?? "");
  });

  it("détaille le moment clé avec meilleur coup et suite punitive", () => {
    expect(input.text).toContain("[demi-coup 4] 2... f6 — erreur, perte 11.6 points de % de gain");
    expect(input.text).toContain("Meilleur coup : Nc6 ; variante : 2... Nc6 3. Bb5 a6");
    expect(input.text).toContain("Suite attendue après le coup joué : 3. Nxe5 fxe5 4. Qh5+ Ke7 5. Qxe5+ Kf7");
  });

  it("n'autorise que les coups et demi-coups transmis", () => {
    expect(input.allowedPlies.has(4)).toBe(true);
    expect(input.allowedPlies.has(1)).toBe(false);
    for (const san of ["f6", "Nc6", "Bb5", "Nxe5", "Qh5+", "Ke7"]) expect(input.allowedMoves.has(san.replace("+", ""))).toBe(true);
    expect(input.allowedMoves.has("Bc4")).toBe(false);
    expect(input.text).toContain("Coups autorisés (les seuls que tu peux citer) :");
  });
});

const REPORT: GameReport = {
  summary: "Après f6, ton roi s'est retrouvé exposé et l'adversaire a pris l'initiative avec Nxe5.",
  opening: { name: OPENING.name ?? "inconnue", assessment: "Tu as quitté les principes avec f6.", theoryGap: null, studyAdvice: "Revois les défenses de e5." },
  tacticalErrors: [{ ply: 4, title: "Roi exposé", explanation: "f6 ouvre la diagonale de ton roi : Qh5+ devient possible." }],
  strategicErrors: [{ ply: null, title: "Développement", explanation: "Défends avec des pièces, comme Nc6." }],
  missedOpportunities: [],
  endgame: null,
  strengths: ["Tu as répondu juste à e4."],
  trainingPlan: [{ category: "opening", title: "Défendre la case e5 avec une pièce", why: "f6 a coûté cher.", plies: [4] }],
  confidence: "high",
};

describe("verifyReport", () => {
  const input = buildReportInput(GAME, MOVES, OPENING, DEFAULT_THRESHOLDS);

  it("valide un bilan qui ne cite que les données fournies", () => {
    expect(verifyReport(REPORT, input.allowedMoves, input.allowedPlies)).toEqual({ valid: true, invalidMoves: [], invalidPlies: [] });
  });

  it("rejette un coup ou un demi-coup inventé", () => {
    const bad: GameReport = {
      ...REPORT,
      tacticalErrors: [{ ply: 30, title: "Fourchette", explanation: "Après Bxf7+ tu perdais la dame." }],
    };
    const check = verifyReport(bad, input.allowedMoves, input.allowedPlies);
    expect(check.valid).toBe(false);
    expect(check.invalidMoves).toContain("Bxf7+");
    expect(check.invalidPlies).toEqual([30]);
  });
});

describe("generateGameReport", () => {
  const EMPTY: UsageSummary = { callsToday: 0, callsMonth: 0, costToday: 0, costMonth: 0, inputTokensMonth: 0, outputTokensMonth: 0, cacheReadTokensMonth: 0 };
  const SETTINGS = { aiEnabled: true, aiDailyCallLimit: 50, aiMonthlyBudgetUsd: 1 };
  const input = buildReportInput(GAME, MOVES, OPENING, DEFAULT_THRESHOLDS);

  function fakeStore(cached: StoredReport | null = null) {
    const usage: UsageRecord[] = [];
    const saved: { verified: boolean }[] = [];
    const store: ReportStore = {
      findReport: vi.fn(async () => cached),
      usageSummary: vi.fn(async () => EMPTY),
      saveReport: vi.fn(async (_id, report, verified, analysisCreatedAt) => {
        saved.push({ verified });
        return { report, verified, analysisCreatedAt, createdAt: "2026-10-20T10:00:00Z" };
      }),
      recordUsage: vi.fn(async (record) => void usage.push(record)),
    };
    return { store, usage, saved };
  }

  const reply = (report: unknown): Anthropic.Message =>
    ({
      id: "msg",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: JSON.stringify(report), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 3000, output_tokens: 1500, cache_read_input_tokens: 0, cache_creation_input_tokens: 1800 },
    }) as Anthropic.Message;

  const client = (...replies: Anthropic.Message[]) => {
    const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
      void body;
      const next = replies.shift();
      if (!next) throw new Error("appel inattendu");
      return next;
    });
    return { client: { messages: { create } } as MessagesClient, create };
  };

  const run = (store: ReportStore, c: MessagesClient, force = false) =>
    generateGameReport({ gameId: "g", input, analysisCreatedAt: "A1", settings: SETTINGS, store, client: c, force });

  it("génère, vérifie, stocke et journalise le coût", async () => {
    const { store, usage, saved } = fakeStore();
    const { client: c, create } = client(reply(REPORT));
    const result = await run(store, c);
    expect(result).toMatchObject({ verified: true, cached: false });
    expect(saved).toEqual([{ verified: true }]);
    expect(usage).toHaveLength(1);
    expect(usage[0].costUsd).toBeGreaterThan(0);
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.system).toEqual([{ type: "text", text: REPORT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
  });

  it("sert le cache sans appel quand le bilan est vérifié et à jour", async () => {
    const { store } = fakeStore({ report: REPORT, verified: true, createdAt: "x", analysisCreatedAt: "A1" });
    const { client: c, create } = client();
    expect(await run(store, c)).toMatchObject({ cached: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("régénère quand la partie a été réanalysée", async () => {
    const { store } = fakeStore({ report: REPORT, verified: true, createdAt: "x", analysisCreatedAt: "ANCIENNE" });
    const { client: c, create } = client(reply(REPORT));
    expect(await run(store, c)).toMatchObject({ cached: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("refait une tentative avec rappel quand le bilan invente un coup", async () => {
    const bad = { ...REPORT, summary: "Tu aurais dû jouer Bb4." };
    const { store, usage } = fakeStore();
    const { client: c, create } = client(reply(bad), reply(REPORT));
    const result = await run(store, c);
    expect(result.verified).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(String(create.mock.calls[1][0].messages[0].content)).toContain("RAPPEL IMPORTANT");
    expect(usage.map((u) => u.status)).toEqual(["unverified", "ok"]);
  });

  it("est versionné", () => {
    expect(REPORT_PROMPT_VERSION).toMatch(/^report-v\d+$/);
  });
});

describe("bilan — noms d'ouverture contenant un SAN", () => {
  it("valide un bilan qui reprend un nom d'ouverture transmis contenant un coup", () => {
    // Nom réel du livre Lichess, avec un coup dans le nom.
    const name = "King's Indian Attack: Symmetrical Defense, with Bf5";
    const opening = { ...OPENING, name, family: "King's Indian Attack", variation: "Symmetrical Defense, with Bf5" };
    const input = buildReportInput(GAME, MOVES, opening, DEFAULT_THRESHOLDS);
    const report: GameReport = { ...REPORT, opening: { ...REPORT.opening, name } };
    expect(verifyReport(report, input.allowedMoves, input.allowedPlies, input.protectedPhrases).valid).toBe(true);
  });
});
