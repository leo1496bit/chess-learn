import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { moveToUci } from "@/lib/analysis/lines";
import type { PositionAnalysis } from "@/lib/analysis/types";
import type { ExplorerResult } from "@/lib/lichess/explorer";
import { toEpd } from "@/lib/openings/identify";
import { MAX_BRANCHES } from "./constants";
import { buildTree, type TreeDeps } from "./tree";

const START = new Chess().fen();

/** FEN atteinte depuis la position initiale après les coups UCI donnés. */
function fenAfter(moves: string[]): string {
  const chess = new Chess();
  for (const uci of moves) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return chess.fen();
}

function analysisOf(fen: string, bestUci: string, cp = 20, mate: number | null = null): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multipv: 3,
    engineVersion: "test",
    lines: [{ multipv: 1, depth: 16, evaluation: mate === null ? { cp, mate: null } : { cp: null, mate }, pvUci: [bestUci] }],
  };
}

type Own = { uci: string; san: string; games: number }[];

function fakeDeps(input: {
  analyses?: Map<string, PositionAnalysis>;
  own?: Map<string, Own>;
  explorer?: Map<string, ExplorerResult | null>;
  analysisFn?: (fen: string, multipv: number) => PositionAnalysis | undefined;
  ownFn?: (epd: string) => Own | undefined;
  explorerFn?: (epd: string) => ExplorerResult | null | undefined;
}): TreeDeps {
  return {
    analysis: input.analysisFn ?? ((fen, multipv) => input.analyses?.get(`${fen}|${multipv}`)),
    ownReplies: input.ownFn ?? ((epd) => input.own?.get(epd)),
    explorer: input.explorerFn ?? ((epd) => input.explorer?.get(epd)),
    book: {},
  };
}

function put(map: Map<string, PositionAnalysis>, moves: string[], best: string, multipv: number, cp = 20) {
  const fen = fenAfter(moves);
  map.set(`${fen}|${multipv}`, analysisOf(fen, best, cp));
}

const PREFIX = ["e2e4", "e7e5"];
const ROOT = { fen: fenAfter(PREFIX), ply: 16, playerColor: "w" as const, prefixUci: PREFIX, bookName: null };

/** Arbre jouet : 1. e4 e5 2. Nf3, puis 2… Nc6 3. Bc4 Nf6 4. d3 ou 2… d6 3. d4 exd4 4. Nxd4. */
function toyTree(withExplorer: boolean) {
  const analyses = new Map<string, PositionAnalysis>();
  put(analyses, ["e2e4"], "e7e5", 3, 30); // position avant le coup qui définit la ligne
  put(analyses, PREFIX, "g1f3", 3);
  put(analyses, [...PREFIX, "g1f3", "b8c6"], "f1c4", 3);
  put(analyses, [...PREFIX, "g1f3", "b8c6", "f1c4", "g8f6"], "d2d3", 3);
  put(analyses, [...PREFIX, "g1f3", "d7d6"], "d2d4", 3);
  put(analyses, [...PREFIX, "g1f3", "d7d6", "d2d4", "e5d4"], "f3d4", 3);
  // Positions finales (multipv 1).
  put(analyses, [...PREFIX, "g1f3", "b8c6", "f1c4", "g8f6", "d2d3"], "f8c5", 1);
  put(analyses, [...PREFIX, "g1f3", "d7d6", "d2d4", "e5d4", "f3d4"], "g8f6", 1);

  const own = new Map<string, Own>();
  own.set(toEpd(fenAfter([...PREFIX, "g1f3"])), [
    { uci: "b8c6", san: "Nc6", games: 5 },
    { uci: "d7d6", san: "d6", games: 4 },
  ]);
  own.set(toEpd(fenAfter([...PREFIX, "g1f3", "b8c6", "f1c4"])), [{ uci: "g8f6", san: "Nf6", games: 3 }]);
  own.set(toEpd(fenAfter([...PREFIX, "g1f3", "d7d6", "d2d4"])), [{ uci: "e5d4", san: "exd4", games: 4 }]);

  const explorerFn = (epd: string): ExplorerResult | null => {
    if (!withExplorer) return null;
    const moves = own.get(epd);
    if (!moves) return null; // positions où Leonel joue : candidats du livre seulement
    return { total: 1000, moves: moves.map((m) => ({ uci: m.uci, san: m.san, games: m.games * 100, share: 0.4 })) };
  };
  return fakeDeps({ analyses, own, explorerFn });
}

describe("buildTree", () => {
  it("cache vide : demande la racine (multipv 3) et la position précédente", () => {
    const result = buildTree(ROOT, fakeDeps({}), 3);
    expect(result.complete).toBe(false);
    expect(result.branches).toEqual([]);
    expect(result.kind).toBeNull();
    expect(result.needs).toContainEqual({ fen: ROOT.fen, multipv: 3 });
    expect(result.needs).toContainEqual({ fen: fenAfter(["e2e4"]), multipv: 3 });
    expect(result.needsReplies).toEqual([toEpd(ROOT.fen)]);
  });

  it("données complètes : 2 branches, chemins exacts, fin par la limite de demi-coups", () => {
    const result = buildTree(ROOT, toyTree(true), 3);
    expect(result.needs).toEqual([]);
    expect(result.needsReplies).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.kind).toBe("master");
    expect(result.branches).toEqual([
      {
        pathUci: ["g1f3", "b8c6", "f1c4", "g8f6", "d2d3"],
        pathSan: ["Nf3", "Nc6", "Bc4", "Nf6", "d3"],
        endFen: fenAfter([...PREFIX, "g1f3", "b8c6", "f1c4", "g8f6", "d2d3"]),
        ownGames: 3,
        explorerGames: 300,
      },
      {
        pathUci: ["g1f3", "d7d6", "d2d4", "e5d4", "f3d4"],
        pathSan: ["Nf3", "d6", "d4", "exd4", "Nxd4"],
        endFen: fenAfter([...PREFIX, "g1f3", "d7d6", "d2d4", "e5d4", "f3d4"]),
        ownGames: 4,
        explorerGames: 400,
      },
    ]);
  });

  it("explorateur null partout : l'arbre se construit avec les seules réponses propres", () => {
    const result = buildTree(ROOT, toyTree(false), 3);
    expect(result.complete).toBe(true);
    expect(result.branches.map((b) => b.pathSan)).toEqual([
      ["Nf3", "Nc6", "Bc4", "Nf6", "d3"],
      ["Nf3", "d6", "d4", "exd4", "Nxd4"],
    ]);
    expect(result.branches.map((b) => b.explorerGames)).toEqual([0, 0]);
  });

  it("budget : 3 réponses à chaque nœud sur 4 niveaux donnent au plus MAX_BRANCHES branches", () => {
    const firstLegal = (fen: string) => moveToUci(new Chess(fen).moves({ verbose: true })[0]);
    const deps = fakeDeps({
      analysisFn: (fen, multipv) => ({ ...analysisOf(fen, firstLegal(fen)), multipv }),
      ownFn: (epd) =>
        new Chess(`${epd} 0 1`)
          .moves({ verbose: true })
          .slice(0, 3)
          .map((m, i) => ({ uci: moveToUci(m), san: m.san, games: 10 - i })),
      explorerFn: () => null,
    });
    // Racine au demi-coup 12 : nœuds adverses aux demi-coups 13, 15, 17, 19 ; fin au 21 (phase).
    const result = buildTree({ fen: START, ply: 12, playerColor: "w", prefixUci: [], bookName: null }, deps, 3);
    expect(result.complete).toBe(true);
    expect(result.branches.length).toBe(MAX_BRANCHES);
    expect(new Set(result.branches.map((b) => b.pathUci.join(" "))).size).toBe(MAX_BRANCHES);
    for (const branch of result.branches) expect(branch.pathUci.length).toBe(9);
  });

  it("budget : jamais plus de MAX_BRANCHES branches même si les données arrivent par étapes", () => {
    const firstLegal = (fen: string) => moveToUci(new Chess(fen).moves({ verbose: true })[0]);
    let calls = 0;
    const deps = fakeDeps({
      analysisFn: (fen, multipv) => ({ ...analysisOf(fen, firstLegal(fen)), multipv }),
      ownFn: (epd) => {
        calls++;
        // Une position adverse sur deux n'est pas encore disponible.
        if (calls % 2 === 0) return undefined;
        return new Chess(`${epd} 0 1`)
          .moves({ verbose: true })
          .slice(0, 3)
          .map((m, i) => ({ uci: moveToUci(m), san: m.san, games: 10 - i }));
      },
      explorerFn: () => null,
    });
    const result = buildTree({ fen: START, ply: 0, playerColor: "w", prefixUci: [], bookName: null }, deps, 3);
    expect(result.complete).toBe(false);
    expect(result.branches.length).toBeLessThanOrEqual(MAX_BRANCHES);
    expect(result.branches.length + result.needsReplies.length).toBeLessThanOrEqual(MAX_BRANCHES);
  });

  it("élagage par fréquence sur tout l'arbre : parties propres d'abord, explorateur seul en dernier", () => {
    const firstLegal = (fen: string) => moveToUci(new Chess(fen).moves({ verbose: true })[0]);
    const after = (fen: string, uci: string) => {
      const chess = new Chess(fen);
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      return chess.fen();
    };
    const legalUci = (fen: string) => new Chess(fen).moves({ verbose: true }).map((m) => ({ uci: moveToUci(m), san: m.san }));
    const own = new Map<string, Own>();
    const explorer = new Map<string, ExplorerResult | null>();

    // Racine (Leonel au trait, demi-coup 16) → nœud adverse : r1 50 %, r2 30 %, r3 20 % (parties propres).
    const n0 = after(START, firstLegal(START));
    const roots = legalUci(n0).slice(0, 3);
    own.set(toEpd(n0), roots.map((m, i) => ({ ...m, games: [50, 30, 20][i] })));
    // Sous-réponses (demi-coup 19) ; la partie s'arrête au demi-coup 21 (phase).
    const subGames = [
      [60, 30, 10], // r1 : 0,30 / 0,15 / 0,05
      [90, 10], // r2 : 0,27 / 0,03, plus une réponse de l'explorateur seul (50 %)
      [40, 35, 25], // r3 : 0,08 / 0,07 / 0,05
    ];
    const subs: { uci: string; san: string }[][] = [];
    roots.forEach((r, i) => {
      const afterReply = after(n0, r.uci);
      const node = after(afterReply, firstLegal(afterReply));
      const moves = legalUci(node).slice(0, 3);
      subs.push(moves);
      own.set(toEpd(node), subGames[i].map((games, j) => ({ ...moves[j], games })));
      if (i === 1) {
        explorer.set(toEpd(node), { total: 1000, moves: [{ ...moves[2], games: 500, share: 0.5 }] });
      }
    });

    const deps = fakeDeps({
      analysisFn: (fen, multipv) => ({ ...analysisOf(fen, firstLegal(fen)), multipv }),
      ownFn: (epd) => own.get(epd) ?? [],
      explorerFn: (epd) => explorer.get(epd) ?? null,
    });
    const result = buildTree({ fen: START, ply: 16, playerColor: "w", prefixUci: [], bookName: null }, deps, 3);
    expect(result.complete).toBe(true);
    expect(result.branches.length).toBe(MAX_BRANCHES);
    const count = (i: number) => result.branches.filter((b) => b.pathUci[1] === roots[i].uci).length;
    expect([count(0), count(1), count(2)]).toEqual([3, 2, 3]);
    const taken = (i: number, j: number) =>
      result.branches.some((b) => b.pathUci[1] === roots[i].uci && b.pathUci[3] === subs[i][j].uci);
    // La réponse de l'explorateur seul (0,15) passe après la réponse propre la plus rare (r2 b, 0,03).
    expect(taken(1, 2)).toBe(false);
    expect(taken(1, 1)).toBe(true);
    // r3 c (0,05) est retenue, bien que r3 soit la réponse la moins fréquente à la racine.
    expect(taken(2, 2)).toBe(true);
    // Ordre stable : celui de l'arbre (réponse la plus fréquente d'abord à chaque nœud).
    expect(result.branches.map((b) => b.pathUci[1])).toEqual([
      roots[0].uci, roots[0].uci, roots[0].uci, roots[1].uci, roots[1].uci, roots[2].uci, roots[2].uci, roots[2].uci,
    ]);
  });

  it("mat dans une ligne-piège : la branche s'arrête sur la position de mat, sans analyse moteur", () => {
    // 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#
    const prefix = ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6"];
    const rootFen = fenAfter(prefix);
    const mateFen = fenAfter([...prefix, "h5f7"]);
    const analyses = new Map<string, PositionAnalysis>();
    put(analyses, prefix.slice(0, -1), "g7g6", 3, 0);
    analyses.set(`${rootFen}|3`, analysisOf(rootFen, "h5f7", 0, 1));
    const explorer = new Map<string, ExplorerResult | null>([[toEpd(rootFen), null]]);
    const deps = fakeDeps({ analyses, explorer });

    const result = buildTree({ fen: rootFen, ply: 6, playerColor: "w", prefixUci: prefix, bookName: null }, deps, 3);
    expect(result.complete).toBe(true);
    expect(result.needs.some((n) => n.fen === mateFen)).toBe(false);
    expect(result.needsReplies).toEqual([]);
    expect(result.kind).toBe("punish");
    expect(result.branches).toEqual([
      { pathUci: ["h5f7"], pathSan: ["Qxf7#"], endFen: mateFen, ownGames: 0, explorerGames: 0 },
    ]);
  });

  it("kind reste null tant que la position avant le coup qui définit la ligne n'est pas analysée", () => {
    const deps = toyTree(true);
    const beforeFen = fenAfter(["e2e4"]);
    const withoutBefore: TreeDeps = {
      ...deps,
      analysis: (fen, multipv) => (fen === beforeFen ? undefined : deps.analysis(fen, multipv)),
    };
    const result = buildTree(ROOT, withoutBefore, 3);
    expect(result.kind).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.needs).toEqual([{ fen: beforeFen, multipv: 3 }]);
    expect(result.branches.length).toBe(2);
  });

  it("préfixe vide : kind calculé avec une perte nulle", () => {
    const analyses = new Map<string, PositionAnalysis>();
    put(analyses, [], "e2e4", 3);
    const result = buildTree(
      { fen: START, ply: 0, playerColor: "w", prefixUci: [], bookName: null },
      fakeDeps({ analyses }),
      3,
    );
    expect(result.kind).toBe("master");
    expect(result.needs).toEqual([]);
    expect(result.needsReplies).toEqual([toEpd(START)]);
  });
});
