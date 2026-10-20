import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: { anthropicApiKey: "test-key" } }));

import Anthropic from "@anthropic-ai/sdk";
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import type { PositionAnalysis } from "@/lib/analysis/types";
import type { MessagesClient } from "../call";
import type { UsageSummary } from "../limits";
import type { UsageRecord } from "../store";
import { generateBranchIdeas, type BranchIdeasStore, type StoredBranchIdeas } from "./generate";
import { buildBranchInput, type BranchInfo, type BranchLineInfo } from "./input";
import { BRANCH_PROMPT_VERSION, BRANCH_SYSTEM_PROMPT } from "./prompt";
import type { BranchIdeas } from "./schema";
import { verifyBranchIdeas } from "./verify";

const ROOT = new Chess();
for (const uci of ["e2e4", "e7e5"]) playUci(ROOT, uci);
const ROOT_FEN = ROOT.fen();

const LINE: BranchLineInfo = {
  name: "King's Pawn Game: Open Game",
  eco: "C20",
  kind: "master",
  playerColor: "w",
  rootFen: ROOT_FEN,
  prefixSan: ["e4", "e5"],
};
const BRANCH: BranchInfo = { pathUci: ["g1f3", "b8c6", "f1b5", "a7a6"], pathSan: ["Nf3", "Nc6", "Bb5", "a6"] };

const fenAfter = (ucis: readonly string[]) => {
  const c = new Chess(ROOT_FEN);
  for (const u of ucis) playUci(c, u);
  return c.fen();
};
const analysis = (fen: string, pvs: readonly (readonly string[])[]): PositionAnalysis => ({
  fen,
  depth: 16,
  multipv: pvs.length,
  engineVersion: "test",
  lines: pvs.map((pvUci, i) => ({ multipv: i + 1, depth: 16, evaluation: { cp: 30 - i * 10, mate: null }, pvUci: [...pvUci] })),
});
const END_FEN = fenAfter(BRANCH.pathUci);
const ANALYSES = new Map<string, PositionAnalysis>([
  [ROOT_FEN, analysis(ROOT_FEN, [["g1f3", "b8c6", "f1b5"], ["f1c4", "g8f6"]])],
  [fenAfter(["g1f3", "b8c6"]), analysis(fenAfter(["g1f3", "b8c6"]), [["f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3"]])],
  [END_FEN, analysis(END_FEN, [["b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "d7d6", "c2c3"]])],
]);

describe("buildBranchInput", () => {
  const input = buildBranchInput(LINE, BRANCH, ANALYSES);

  it("transmet le nom du livre, la catégorie et la couleur", () => {
    expect(input.text).toContain("King's Pawn Game: Open Game (C20)");
    expect(input.text).toContain("Catégorie : à maîtriser.");
    expect(input.text).toContain("Leonel joue les Blancs.");
    expect(input.protectedPhrases).toEqual(["King's Pawn Game: Open Game"]);
  });

  it("autorise le préfixe, la branche et les variantes transmises (6 et 8 demi-coups au plus)", () => {
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bc4", "Nf6", "Ba4", "O-O", "Be7"]) expect(input.allowedMoves.has(san)).toBe(true);
    // 6 demi-coups depuis Nf3 Nc6 : Bb5 a6 Ba4 Nf6 O-O Be7 ; le 7e (Re1) n'est pas transmis.
    expect(input.allowedMoves.has("Re1")).toBe(true); // vient de la variante finale (8 demi-coups)
    expect(input.allowedMoves.has("Bb3")).toBe(true);
    expect(input.allowedMoves.has("c3")).toBe(false); // 9e demi-coup de la variante finale
    expect(input.allowedMoves.has("Qh5")).toBe(false);
  });

  it("indique l'auteur de chaque coup et les pièces de la position finale", () => {
    expect(input.text).toContain("index 0 : 2. Nf3 (Leonel)");
    expect(input.text).toContain("index 1 : 2... Nc6 (adversaire)");
    expect(input.text).toContain(END_FEN);
    expect(input.text).toContain("Pièces des Blancs :");
  });

  it("omet les évaluations quand les analyses manquent", () => {
    const bare = buildBranchInput(LINE, BRANCH, new Map());
    expect(bare.text).toContain("aucune analyse disponible");
    expect(bare.text).toContain("(non fournie)");
    expect(bare.allowedMoves.has("Nf3")).toBe(true);
  });
});

const IDEAS: BranchIdeas = {
  moves: [
    { index: 0, idea: "Nf3 développe le cavalier et attaque le pion e5." },
    { index: 1, idea: "Nc6 semble défendre le pion e5 en développant une pièce." },
    { index: 2, idea: "Bb5 met la pression sur le cavalier qui défend e5." },
    { index: 3, idea: "a6 interroge le fou : probablement une façon de gagner du temps." },
  ],
  plan: "Après Ba4, roque vite avec O-O puis prépare c3 et d4 pour contester le centre.",
  confidence: "high",
};
const allowed = () => buildBranchInput(LINE, BRANCH, ANALYSES);

describe("verifyBranchIdeas", () => {
  it("valide des idées qui ne citent que les données", () => {
    const { allowedMoves, protectedPhrases } = allowed();
    // « c3 » n'est pas transmis : on le retire du plan pour ce test.
    const ok = { ...IDEAS, plan: "Après Ba4, roque avec O-O." };
    expect(verifyBranchIdeas(ok, allowedMoves, protectedPhrases, 4)).toMatchObject({ valid: true, invalidMoves: [], invalidIndexes: [], missingIndexes: [] });
  });

  it("rejette un coup inventé", () => {
    const { allowedMoves, protectedPhrases } = allowed();
    const bad = { ...IDEAS, plan: "Joue Qh5 pour attaquer." };
    const check = verifyBranchIdeas(bad, allowedMoves, protectedPhrases, 4);
    expect(check.valid).toBe(false);
    expect(check.invalidMoves).toContain("Qh5");
  });

  it("rejette un index hors limites, en double ou manquant", () => {
    const { allowedMoves, protectedPhrases } = allowed();
    const ok = { ...IDEAS, plan: "Roque avec O-O." };
    const outOfRange = { ...ok, moves: [...ok.moves.slice(0, 3), { index: 4, idea: "Un coup de trop." }] };
    const check = verifyBranchIdeas(outOfRange, allowedMoves, protectedPhrases, 4);
    expect(check).toMatchObject({ valid: false, invalidIndexes: [4], missingIndexes: [3] });
    expect(verifyBranchIdeas({ ...ok, moves: [{ index: -1, idea: "x" }, ...ok.moves] }, allowedMoves, protectedPhrases, 4).invalidIndexes).toEqual([-1]);
    expect(verifyBranchIdeas({ ...ok, moves: [...ok.moves, ok.moves[0]] }, allowedMoves, protectedPhrases, 4).valid).toBe(false);
  });

  it("n'exige pas de SAN dans un nom du livre protégé", () => {
    const { allowedMoves } = allowed();
    const name = "King's Indian Attack: Symmetrical Defense, with Bf5";
    const ok = { ...IDEAS, plan: `C'est la ${name}.` };
    expect(verifyBranchIdeas(ok, allowedMoves, [name], 4).invalidMoves).toEqual([]);
  });
});

describe("generateBranchIdeas", () => {
  const EMPTY: UsageSummary = { callsToday: 0, callsMonth: 0, costToday: 0, costMonth: 0, inputTokensMonth: 0, outputTokensMonth: 0, cacheReadTokensMonth: 0 };
  const SETTINGS = { aiEnabled: true, aiDailyCallLimit: 50, aiMonthlyBudgetUsd: 1 };
  const input = allowed();
  const GOOD: BranchIdeas = { ...IDEAS, plan: "Après Ba4, roque avec O-O." };

  function fakeStore(cached: StoredBranchIdeas | null = null, summary: UsageSummary = EMPTY) {
    const usage: UsageRecord[] = [];
    const saved: { verified: boolean; ideas: BranchIdeas }[] = [];
    const store: BranchIdeasStore = {
      findIdeas: vi.fn(async () => cached),
      usageSummary: vi.fn(async () => summary),
      saveIdeas: vi.fn(async (_id, ideas, verified) => {
        saved.push({ verified, ideas });
        return { ideas, verified, createdAt: "2026-10-20T10:00:00Z" };
      }),
      recordUsage: vi.fn(async (record) => void usage.push(record)),
    };
    return { store, usage, saved };
  }

  const reply = (value: unknown): Anthropic.Message =>
    ({
      id: "msg",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: JSON.stringify(value), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2000, output_tokens: 800, cache_read_input_tokens: 0, cache_creation_input_tokens: 1200 },
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

  const run = (store: BranchIdeasStore, c: MessagesClient, force = false, settings = SETTINGS) =>
    generateBranchIdeas({ branchId: "b", input, branchLength: 4, settings, store, client: c, force });

  it("génère, vérifie, stocke et journalise une ligne ai_usage", async () => {
    const { store, usage, saved } = fakeStore();
    const { client: c, create } = client(reply(GOOD));
    expect(await run(store, c)).toMatchObject({ verified: true, cached: false });
    expect(saved).toEqual([{ verified: true, ideas: GOOD }]);
    expect(usage).toHaveLength(1);
    expect(usage[0].costUsd).toBeGreaterThan(0);
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(3000);
    expect(body.system).toEqual([{ type: "text", text: BRANCH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
  });

  it("sert le cache sans appel quand les idées sont vérifiées", async () => {
    const { store, usage } = fakeStore({ ideas: GOOD, verified: true, createdAt: "x" });
    const { client: c, create } = client();
    expect(await run(store, c)).toMatchObject({ cached: true });
    expect(create).not.toHaveBeenCalled();
    expect(usage).toHaveLength(0);
  });

  it("refait une tentative avec rappel quand une idée invente un coup", async () => {
    const bad = { ...GOOD, plan: "Joue Qh5 tout de suite." };
    const { store, usage } = fakeStore();
    const { client: c, create } = client(reply(bad), reply(GOOD));
    expect(await run(store, c)).toMatchObject({ verified: true, cached: false });
    expect(create).toHaveBeenCalledTimes(2);
    expect(String(create.mock.calls[1][0].messages[0].content)).toContain("RAPPEL IMPORTANT");
    expect(usage.map((u) => u.status)).toEqual(["unverified", "ok"]);
  });

  it("refait une tentative quand un demi-coup n'a pas d'idée", async () => {
    const short = { ...GOOD, moves: GOOD.moves.slice(0, 3) };
    const { store } = fakeStore();
    const { client: c, create } = client(reply(short), reply(GOOD));
    expect((await run(store, c)).verified).toBe(true);
    expect(String(create.mock.calls[1][0].messages[0].content)).toContain("aucune idée pour les index 3");
  });

  it("deux échecs de vérification donnent verified: false (deux lignes ai_usage)", async () => {
    const bad = { ...GOOD, plan: "Joue Qh5 tout de suite." };
    const { store, usage, saved } = fakeStore();
    const { client: c, create } = client(reply(bad), reply(bad));
    expect(await run(store, c)).toMatchObject({ verified: false, cached: false });
    expect(create).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([{ verified: false, ideas: bad }]);
    expect(usage.map((u) => u.status)).toEqual(["unverified", "unverified"]);
  });

  it("limite atteinte : AiError 429 sans appel", async () => {
    const { store } = fakeStore(null, { ...EMPTY, callsToday: 50 });
    const { client: c, create } = client(reply(GOOD));
    await expect(run(store, c)).rejects.toMatchObject({ status: 429, code: "limit_reached" });
    expect(create).not.toHaveBeenCalled();
  });

  it("IA désactivée : AiError 429 sans appel", async () => {
    const { store } = fakeStore();
    const { client: c, create } = client(reply(GOOD));
    await expect(run(store, c, false, { ...SETTINGS, aiEnabled: false })).rejects.toMatchObject({ status: 429, code: "ai_disabled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("régénère quand la ligne en cache n'est pas vérifiée", async () => {
    const { store, saved } = fakeStore({ ideas: { ...GOOD, plan: "Joue Qh5." }, verified: false, createdAt: "x" });
    const { client: c, create } = client(reply(GOOD));
    expect(await run(store, c)).toMatchObject({ verified: true, cached: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([{ verified: true, ideas: GOOD }]);
  });

  it("limite atteinte entre la première réponse et la nouvelle tentative : garde la première, un seul appel", async () => {
    const bad = { ...GOOD, plan: "Joue Qh5 tout de suite." };
    const { store, usage, saved } = fakeStore();
    const { client: c, create } = client(reply(bad), reply(GOOD));
    const result = await run(store, c, false, { ...SETTINGS, aiDailyCallLimit: 1 });
    expect(result).toMatchObject({ verified: false, cached: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);
    expect(saved).toEqual([{ verified: false, ideas: bad }]);
  });

  it("force avec échec de vérification : ne remplace pas la ligne vérifiée en cache", async () => {
    const bad = { ...GOOD, plan: "Joue Qh5 tout de suite." };
    const cachedRow = { ideas: GOOD, verified: true, createdAt: "x" };
    const { store, saved } = fakeStore(cachedRow);
    const { client: c, create } = client(reply(bad), reply(bad));
    const result = await run(store, c, true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([]);
    expect(result).toMatchObject({ ideas: GOOD, verified: true, cached: true });
  });

  it("est versionné", () => {
    expect(BRANCH_PROMPT_VERSION).toBe("branch-v1");
  });
});
