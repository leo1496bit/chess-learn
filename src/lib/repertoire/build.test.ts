import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { PositionAnalysis } from "@/lib/analysis/types";
import { toEpd, type OpeningBook } from "@/lib/openings/identify";
import {
  BUILD_EXPLORER_CUTOFF_MS,
  BUILD_STEP_BUDGET_MS,
  buildStep,
  createLine,
  CUSTOM_LINE_NAME,
  LINE_START_ERROR,
  rebuildLine,
} from "./build";
import { EXPLORER_FETCHES_PER_STEP } from "./constants";
import type { BranchMerge, ExistingBranch } from "./merge";
import type { ExplorerLookup, LinePatch, LineRecord, LineStore, NewLine, RootStats } from "./build";

const NOW = new Date("2026-10-20T12:00:00Z");

function fenAfter(moves: string[]): string {
  const chess = new Chess();
  for (const uci of moves) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return chess.fen();
}

function analysis(fen: string, best: string, multipv: number, cp = 20): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multipv,
    engineVersion: "test",
    lines: [{ multipv: 1, depth: 16, evaluation: { cp, mate: null }, pvUci: [best] }],
  };
}

const PREFIX = ["e2e4", "e7e5"];
const ROOT_FEN = fenAfter(PREFIX);
const AFTER_NF3 = fenAfter([...PREFIX, "g1f3"]);
const AFTER_NC6 = fenAfter([...PREFIX, "g1f3", "b8c6"]);
const LEAF = fenAfter([...PREFIX, "g1f3", "b8c6", "f1b5"]);

/** Arbre jouet complet : 1. e4 e5 2. Nf3 Nc6 3. Bb5, aucune réponse connue ensuite (fin de branche). */
function toyAnalyses(): Map<string, PositionAnalysis> {
  const map = new Map<string, PositionAnalysis>();
  const put = (fen: string, best: string, multipv: number, cp?: number) =>
    map.set(`${fen}|${multipv}`, analysis(fen, best, multipv, cp));
  put(fenAfter(["e2e4"]), "e7e5", 3, 30);
  put(ROOT_FEN, "g1f3", 3);
  put(AFTER_NC6, "f1b5", 3);
  put(LEAF, "a7a6", 1);
  return map;
}

function line(overrides: Partial<LineRecord> = {}): LineRecord {
  return {
    id: "line-1",
    name: "King's Pawn Game",
    eco: "C20",
    rootFen: ROOT_FEN,
    prefixUci: PREFIX,
    playerColor: "w",
    status: "building",
    depth: 16,
    multipv: 3,
    explorerUnavailable: false,
    ...overrides,
  };
}

function fakeStore(input: {
  analyses?: Map<string, PositionAnalysis>;
  explorer?: (epd: string) => ExplorerLookup;
  rootStats?: Map<string, RootStats>;
  lines?: Map<string, string>;
  branches?: ExistingBranch[];
  record?: LineRecord;
  replies?: Map<string, { uci: string; san: string; games: number }[]>;
}) {
  const analyses = input.analyses ?? toyAnalyses();
  const replies = input.replies ?? new Map([[toEpd(AFTER_NF3), [{ uci: "b8c6", san: "Nc6", games: 5 }]]]);
  const calls = {
    loads: [] as { fens: string[]; depth: number; multipv: number }[],
    replyStats: [] as string[],
    explorer: [] as string[],
    inserted: [] as NewLine[],
    patches: [] as { id: string; patch: LinePatch }[],
    merges: [] as BranchMerge[],
  };
  const lines = input.lines ?? new Map<string, string>();
  const store: LineStore = {
    async findLineIdByRoot(rootEpd) {
      return lines.get(rootEpd) ?? null;
    },
    async insertLine(row) {
      calls.inserted.push(row);
      lines.set(row.rootEpd, "new-id");
      return "new-id";
    },
    async rootStats(epd) {
      return input.rootStats?.get(epd) ?? { games: 0, wins: 0, draws: 0, losses: 0, topPath: null };
    },
    async getLine(id) {
      return input.record && input.record.id === id ? input.record : null;
    },
    async updateLine(id, patch) {
      calls.patches.push({ id, patch });
    },
    async loadAnalyses(fens, depth, multipv) {
      calls.loads.push({ fens, depth, multipv });
      const found = new Map<string, PositionAnalysis>();
      for (const fen of fens) {
        const a = analyses.get(`${fen}|${multipv}`);
        if (a) found.set(fen, a);
      }
      return found;
    },
    async replyStats(epd) {
      calls.replyStats.push(epd);
      return replies.get(epd) ?? [];
    },
    async explorer(epd, budget) {
      calls.explorer.push(epd);
      expect(budget.left).toBeLessThanOrEqual(EXPLORER_FETCHES_PER_STEP);
      return input.explorer ? input.explorer(epd) : "unavailable";
    },
    async listBranches() {
      return input.branches ?? [];
    },
    async applyMerge(_lineId, merge) {
      calls.merges.push(merge);
    },
  };
  return { store, calls };
}

const BOOK: OpeningBook = {
  [toEpd(fenAfter(["e2e4"]))]: ["B00", "King's Pawn", 1],
  [toEpd(ROOT_FEN)]: ["C20", "King's Pawn Game", 1],
};
const DEPS = { book: BOOK, depth: 18, multipv: 3 };

describe("createLine", () => {
  it("renvoie la ligne existante si la racine est déjà une ligne", async () => {
    const { store, calls } = fakeStore({ lines: new Map([[toEpd(ROOT_FEN), "old-id"]]) });
    const result = await createLine(store, { source: "manual", uci: PREFIX, playerColor: "w" }, DEPS);
    expect(result).toEqual({ ok: true, status: 200, id: "old-id", existing: true });
    expect(calls.inserted).toEqual([]);
  });

  it("refuse un préfixe manuel qui se termine par un coup de Leonel", async () => {
    const { store, calls } = fakeStore({});
    const result = await createLine(store, { source: "manual", uci: ["e2e4"], playerColor: "w" }, DEPS);
    expect(result).toEqual({ ok: false, status: 400, error: LINE_START_ERROR });
    expect(calls.inserted).toEqual([]);
  });

  it("refuse un préfixe manuel vide", async () => {
    const { store } = fakeStore({});
    const result = await createLine(store, { source: "manual", uci: [], playerColor: "w" }, DEPS);
    expect(result).toEqual({ ok: false, status: 400, error: LINE_START_ERROR });
  });

  it("refuse un coup illégal", async () => {
    const { store } = fakeStore({});
    const result = await createLine(store, { source: "manual", uci: ["e2e5", "e7e5"], playerColor: "w" }, DEPS);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("crée une ligne manuelle avec le nom du livre et des statistiques nulles", async () => {
    const { store, calls } = fakeStore({});
    const result = await createLine(store, { source: "manual", uci: PREFIX, playerColor: "w" }, DEPS);
    expect(result).toEqual({ ok: true, status: 201, id: "new-id", existing: false });
    expect(calls.inserted).toEqual([
      {
        name: "King's Pawn Game",
        eco: "C20",
        rootEpd: toEpd(ROOT_FEN),
        rootFen: ROOT_FEN,
        prefixUci: PREFIX,
        prefixSan: ["e4", "e5"],
        playerColor: "w",
        depth: 18,
        multipv: 3,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      },
    ]);
  });

  it("nomme « Ligne personnalisée » une position absente du livre", async () => {
    const { store, calls } = fakeStore({});
    await createLine(store, { source: "manual", uci: ["a2a3", "h7h6"], playerColor: "w" }, DEPS);
    expect(calls.inserted[0]).toMatchObject({ name: CUSTOM_LINE_NAME, eco: null });
  });

  it("crée une ligne suggérée depuis le chemin le plus fréquent de ses parties", async () => {
    const epd = toEpd(ROOT_FEN);
    const { store, calls } = fakeStore({
      rootStats: new Map([[epd, { games: 7, wins: 3, draws: 1, losses: 3, topPath: "e2e4 e7e5" }]]),
    });
    const result = await createLine(store, { source: "suggestion", epd }, DEPS);
    expect(result).toEqual({ ok: true, status: 201, id: "new-id", existing: false });
    expect(calls.inserted[0]).toMatchObject({ playerColor: "w", prefixUci: PREFIX, games: 7, wins: 3, draws: 1, losses: 3 });
  });

  it("renvoie 404 pour une suggestion dont le chemin est vide (position initiale)", async () => {
    const epd = toEpd(new Chess().fen());
    const { store } = fakeStore({
      rootStats: new Map([[epd, { games: 9, wins: 3, draws: 3, losses: 3, topPath: "" }]]),
    });
    const result = await createLine(store, { source: "suggestion", epd }, DEPS);
    expect(result).toEqual({ ok: false, status: 404, error: "Position introuvable dans tes parties" });
  });

  it("renvoie 404 pour une suggestion jamais jouée", async () => {
    const { store } = fakeStore({});
    const result = await createLine(store, { source: "suggestion", epd: toEpd(ROOT_FEN) }, DEPS);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});

describe("buildStep", () => {
  it("termine l'arbre et écrit les branches quand toutes les données existent", async () => {
    const { store, calls } = fakeStore({ branches: [{ id: "gone", pathUci: ["d2d4"], archived: false }] });
    const result = await buildStep(store, { book: {}, now: NOW }, line());
    expect(result).toEqual({
      status: "ready",
      needs: [],
      progress: { branches: 1, pending: 0 },
      explorerUnavailable: false,
      depth: 16,
      multipv: 3,
    });
    expect(calls.merges).toHaveLength(1);
    expect(calls.merges[0].archive).toEqual(["gone"]);
    expect(calls.merges[0].insert).toEqual([
      { pathUci: ["g1f3", "b8c6", "f1b5"], pathSan: ["Nf3", "Nc6", "Bb5"], endFen: LEAF, ownGames: 5, explorerGames: 0 },
    ]);
    expect(calls.patches).toEqual([
      { id: "line-1", patch: { status: "ready", kind: "master", builtAt: NOW.toISOString() } },
    ]);
    // Analyses lues à la profondeur de la ligne ; RPC des réponses uniquement aux positions adverses.
    expect(calls.loads.every((l) => l.depth === 16)).toBe(true);
    expect(calls.replyStats).not.toContain(toEpd(ROOT_FEN));
  });

  it("renvoie les analyses manquantes, puis les mêmes à l'étape suivante (idempotent)", async () => {
    const analyses = toyAnalyses();
    analyses.delete(`${LEAF}|1`);
    const { store, calls } = fakeStore({ analyses });
    const first = await buildStep(store, { book: {}, now: NOW }, line());
    expect(first.status).toBe("building");
    expect(first.needs).toEqual([{ fen: LEAF, multipv: 1 }]);
    expect(first.progress).toEqual({ branches: 0, pending: 1 });
    const second = await buildStep(store, { book: {}, now: NOW }, line());
    expect(second).toEqual(first);
    expect(calls.merges).toEqual([]);
    expect(calls.patches).toEqual([]);
  });

  it("reste en construction sans échouer si l'explorateur est saturé (429)", async () => {
    const { store, calls } = fakeStore({ explorer: () => "missing" });
    const result = await buildStep(store, { book: {}, now: NOW }, line());
    expect(result.status).toBe("building");
    expect(result.explorerUnavailable).toBe(false);
    expect(calls.merges).toEqual([]);
    expect(calls.patches).toEqual([]);
    // Une seule tentative par position et par étape.
    expect(new Set(calls.explorer).size).toBe(calls.explorer.length);
  });

  it("après un 401, se passe de l'explorateur et termine l'arbre avec ses parties", async () => {
    const { store, calls } = fakeStore({ explorer: () => "unauthorized" });
    const result = await buildStep(store, { book: {}, now: NOW }, line());
    expect(result.status).toBe("ready");
    expect(result.explorerUnavailable).toBe(true);
    expect(result.progress.branches).toBe(1);
    expect(calls.explorer).toHaveLength(1);
    expect(calls.patches).toEqual([
      { id: "line-1", patch: { explorerUnavailable: true, status: "ready", kind: "master", builtAt: NOW.toISOString() } },
    ]);
  });

  it("reflète la colonne explorer_unavailable déjà posée", async () => {
    const { store } = fakeStore({});
    const result = await buildStep(store, { book: {}, now: NOW }, line({ explorerUnavailable: true }));
    expect(result.explorerUnavailable).toBe(true);
  });

  it("ne reconstruit pas une ligne déjà prête", async () => {
    const { store, calls } = fakeStore({
      branches: [
        { id: "a", pathUci: ["g1f3"], archived: false },
        { id: "b", pathUci: ["d2d4"], archived: true },
      ],
    });
    const result = await buildStep(store, { book: {}, now: NOW }, line({ status: "ready" }));
    expect(result).toEqual({
      status: "ready",
      needs: [],
      progress: { branches: 1, pending: 0 },
      explorerUnavailable: false,
      depth: 16,
      multipv: 3,
    });
    expect(calls.loads).toEqual([]);
    expect(calls.merges).toEqual([]);
  });
});

/** Espagnole fermée, 21 demi-coups : la phase d'ouverture se termine au demi-coup 21. */
const DEEP_GAME = (
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3 c6a5 b3c2 c7c5 d2d4"
).split(" ");

/**
 * Toutes les données d'une ligne profonde : chaque position mène au coup suivant de la partie. À chaque
 * coup de Leonel, un coup alternatif du livre hors MultiPV (nettement moins bon) demande sa propre
 * évaluation, comme en production : environ 1,5 assemblage par demi-coup.
 */
function deepData() {
  const analyses = new Map<string, PositionAnalysis>();
  const replies = new Map<string, { uci: string; san: string; games: number }[]>();
  const book: OpeningBook = {};
  const chess = new Chess();
  for (let i = 0; i <= DEEP_GAME.length; i++) {
    const fen = chess.fen();
    const next = DEEP_GAME[i] ?? chess.moves({ verbose: true })[0].lan;
    for (const multipv of [1, 3]) analyses.set(`${fen}|${multipv}`, analysis(fen, next, multipv));
    if (i % 2 === 0 && i < DEEP_GAME.length) {
      const alt = chess.moves({ verbose: true }).find((m) => m.lan !== next)!;
      book[toEpd(alt.after)] = ["A00", "Alternative", 1];
      analyses.set(`${alt.after}|1`, analysis(alt.after, "a7a6", 1, -300));
    }
    if (i < DEEP_GAME.length) {
      const move = chess.move({ from: next.slice(0, 2), to: next.slice(2, 4) });
      if (i % 2 === 1) replies.set(toEpd(fen), [{ uci: next, san: move.san, games: 5 }]);
    }
  }
  return { analyses, replies, book };
}

describe("buildStep : longueur et délai", () => {
  const deepLine = () => line({ rootFen: fenAfter(PREFIX), prefixUci: PREFIX });

  it("termine en une seule étape une ligne profonde dont toutes les données sont en cache", async () => {
    const data = deepData();
    const { store, calls } = fakeStore(data);
    const result = await buildStep(store, { book: data.book, now: NOW }, deepLine());
    expect(result.status).toBe("ready");
    expect(calls.merges[0].insert).toHaveLength(1);
    expect(calls.merges[0].insert[0].pathUci).toEqual(DEEP_GAME.slice(2));
  });

  it("ne lance plus d'appel à l'explorateur après BUILD_EXPLORER_CUTOFF_MS", async () => {
    let clock = 0;
    const { store, calls } = fakeStore({
      ...deepData(),
      explorer: () => {
        clock += BUILD_EXPLORER_CUTOFF_MS; // appel lent (délai de l'API)
        return "unavailable";
      },
    });
    const result = await buildStep(store, { book: {}, now: NOW, clock: () => clock }, deepLine());
    expect(calls.explorer).toHaveLength(1);
    expect(result.status).toBe("building");
    expect(calls.merges).toEqual([]);
  });

  it("s'arrête après BUILD_STEP_BUDGET_MS et reprend à l'étape suivante", async () => {
    let clock = 0;
    const data = deepData();
    const { store, calls } = fakeStore({
      ...data,
      explorer: () => "unavailable",
    });
    const slow = { ...store, loadAnalyses: async (fens: string[], depth: number, multipv: number) => {
      clock += BUILD_STEP_BUDGET_MS;
      return store.loadAnalyses(fens, depth, multipv);
    } };
    const first = await buildStep(slow, { book: {}, now: NOW, clock: () => clock }, deepLine());
    expect(first.status).toBe("building");
    expect(calls.loads).toHaveLength(1);
    const second = await buildStep(store, { book: {}, now: NOW }, deepLine());
    expect(second.status).toBe("ready");
  });
});

describe("rebuildLine", () => {
  it("repasse la ligne en construction avec les paramètres actuels", async () => {
    const { store, calls } = fakeStore({ record: line({ status: "ready" }) });
    expect(await rebuildLine(store, "line-1", { depth: 20, multipv: 2 })).toBe(true);
    expect(calls.patches).toEqual([{ id: "line-1", patch: { status: "building", depth: 20, multipv: 2 } }]);
    expect(calls.merges).toEqual([]);
  });

  it("renvoie false pour une ligne introuvable", async () => {
    const { store, calls } = fakeStore({});
    expect(await rebuildLine(store, "nope", { depth: 20, multipv: 2 })).toBe(false);
    expect(calls.patches).toEqual([]);
  });
});
