import { describe, expect, it } from "vitest";
import { branchMoveLinks, branchPositions, branchStatus, buildLineTree, passesThrough, replyGamesLabel, startBuildGuard, stepBuildGuard } from "./line-view";

const ROOT_W = "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"; // après 1. e4 c6, Blancs au trait

describe("branchStatus", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("pas encore étudiée", () => {
    expect(branchStatus({ studiedAt: null, dueAt: "2026-10-01T00:00:00Z" }, now)).toBe("new");
  });
  it("à revoir aujourd'hui", () => {
    expect(branchStatus({ studiedAt: "2026-10-10T00:00:00Z", dueAt: "2026-10-20T08:00:00Z" }, now)).toBe("due");
  });
  it("maîtrisée", () => {
    expect(branchStatus({ studiedAt: "2026-10-10T00:00:00Z", dueAt: "2026-10-25T00:00:00Z" }, now)).toBe("mastered");
  });
});

describe("buildLineTree", () => {
  const branches = [
    { id: "a", pathSan: ["Nc3", "d5", "Nf3", "dxe4"], ownGames: 7 },
    { id: "b", pathSan: ["Nc3", "d5", "Nf3", "Bg4", "h3"], ownGames: 4 },
    { id: "c", pathSan: ["Nc3", "e5"], ownGames: 3 },
  ];

  it("fusionne les préfixes communs et sépare aux embranchements", () => {
    const tree = buildLineTree(ROOT_W, branches);
    expect(tree).toHaveLength(1);
    const [trunk] = tree;
    expect(trunk.moves.map((m) => m.san)).toEqual(["Nc3"]);
    expect(trunk.children.map((c) => c.moves.map((m) => m.san))).toEqual([["d5", "Nf3"], ["e5"]]);
    const [d5] = trunk.children;
    expect(d5.children.map((c) => c.moves.map((m) => m.san))).toEqual([["dxe4"], ["Bg4", "h3"]]);
    expect(d5.children.map((c) => c.branchIds)).toEqual([["a"], ["b"]]);
    expect(trunk.children[1].branchIds).toEqual(["c"]);
  });

  it("relie chaque coup à une branche qui passe par lui (pour afficher sa position au clic)", () => {
    const [trunk] = buildLineTree(ROOT_W, branches);
    expect(trunk.moves[0].branchId).toBe("a");
    const [d5, e5] = trunk.children;
    expect(d5.moves.map((m) => m.branchId)).toEqual(["a", "a"]);
    expect(d5.children[1].moves.map((m) => m.branchId)).toEqual(["b", "b"]);
    expect(e5.moves[0].branchId).toBe("c");
  });

  it("numérote les coups depuis la position de départ et marque ceux de Leonel", () => {
    const [trunk] = buildLineTree(ROOT_W, branches);
    const d5 = trunk.children[0];
    expect(trunk.moves[0]).toMatchObject({ index: 0, number: "2.", isPlayer: true });
    // Coup noir en tête de segment : numéro « 2... » ; coup blanc suivant : « 3. ».
    expect(d5.moves.map((m) => m.number)).toEqual(["2...", "3."]);
    expect(d5.moves.map((m) => m.isPlayer)).toEqual([false, true]);
    // Coup noir précédé du coup blanc dans le même segment : pas de numéro.
    const bg4 = d5.children[1];
    expect(bg4.moves.map((m) => m.number)).toEqual(["3...", "4."]);
  });

  it("place le nombre de parties sur la dernière réponse adverse de chaque branche", () => {
    const [trunk] = buildLineTree(ROOT_W, branches);
    const d5 = trunk.children[0];
    expect(d5.moves[0].ownGames).toBeNull();
    expect(d5.children[0].moves[0].ownGames).toBe(7);
    expect(d5.children[1].moves[0].ownGames).toBe(4); // Bg4, h3 est un coup de Leonel
    expect(d5.children[1].moves[1].ownGames).toBeNull();
    expect(trunk.children[1].moves[0].ownGames).toBe(3);
  });

  it("numérote correctement quand Leonel a les Noirs", () => {
    const rootB = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const [trunk] = buildLineTree(rootB, [{ id: "x", pathSan: ["c6", "d4", "d5"], ownGames: 2 }]);
    expect(trunk.moves.map((m) => m.number)).toEqual(["1...", "2.", ""]);
    expect(trunk.moves.map((m) => m.isPlayer)).toEqual([true, false, true]);
  });

  it("une branche préfixe d'une autre s'arrête sur le nœud et garde la suite", () => {
    const tree = buildLineTree(ROOT_W, [
      { id: "short", pathSan: ["Nc3", "d5"], ownGames: 5 },
      { id: "long", pathSan: ["Nc3", "d5", "Nf3"], ownGames: 5 },
    ]);
    expect(tree[0].moves.map((m) => m.san)).toEqual(["Nc3", "d5"]);
    expect(tree[0].branchIds).toEqual(["short"]);
    expect(tree[0].children[0].branchIds).toEqual(["long"]);
  });
});

describe("garde de la construction", () => {
  it("s'arrête après 5 étapes consécutives sans analyse demandée", () => {
    let guard = startBuildGuard();
    for (let i = 0; i < 4; i++) {
      const next = stepBuildGuard(guard, []);
      expect(next.stalled).toBe(false);
      guard = next.guard;
    }
    expect(stepBuildGuard(guard, []).stalled).toBe(true);
  });

  it("une étape avec des analyses remet le compteur à zéro", () => {
    let guard = startBuildGuard();
    for (let i = 0; i < 4; i++) guard = stepBuildGuard(guard, []).guard;
    guard = stepBuildGuard(guard, [{ fen: "f1", multipv: 3 }]).guard;
    expect(guard.emptySteps).toBe(0);
  });

  it("s'arrête si la même analyse est redemandée trois fois (analyse incomplète jamais enregistrée)", () => {
    let guard = startBuildGuard();
    guard = stepBuildGuard(guard, [{ fen: "f1", multipv: 3 }]).guard;
    guard = stepBuildGuard(guard, [{ fen: "f1", multipv: 3 }, { fen: "f2", multipv: 1 }]).guard;
    expect(stepBuildGuard(guard, [{ fen: "f1", multipv: 3 }]).stalled).toBe(true);
    expect(stepBuildGuard(guard, [{ fen: "f1", multipv: 1 }]).stalled).toBe(false);
  });
});

describe("branchPositions", () => {
  it("rejoue la branche et s'arrête au premier coup illégal", () => {
    const { fens, san } = branchPositions(ROOT_W, ["b1c3", "d7d5", "e1e8", "g1f3"]);
    expect(san).toEqual(["Nc3", "d5"]);
    expect(fens).toHaveLength(3);
    expect(fens[0]).toBe(ROOT_W);
  });

  it("relie chaque coup à la position qui le précède", () => {
    const links = branchMoveLinks(ROOT_W, ["b1c3", "d7d5"]);
    expect(links.map((l) => [l.san, l.uci, l.source])).toEqual([
      ["Nc3", "b1c3", "played"],
      ["d5", "d7d5", "played"],
    ]);
    expect(links[0].fen).toBe(ROOT_W);
  });
});

describe("replyGamesLabel", () => {
  it("compte les parties de Leonel quand il a rencontré la réponse", () => {
    expect(replyGamesLabel(1)).toBe("1 partie");
    expect(replyGamesLabel(31)).toBe("31 parties");
  });

  it("indique Lichess quand la réponse ne vient que de l'explorateur", () => {
    expect(replyGamesLabel(0)).toBe("Lichess");
  });
});

describe("passesThrough", () => {
  const a = ["Nc3", "d5", "Nf3", "dxe4"];
  it("vrai si la branche suit le même chemin jusqu'au coup cliqué", () => {
    expect(passesThrough(a, ["Nc3", "d5", "Nf3", "Bg4"], 2)).toBe(true);
  });
  it("faux si le chemin diverge avant le coup, ou si la branche est plus courte", () => {
    expect(passesThrough(a, ["Nc3", "e5"], 1)).toBe(false);
    expect(passesThrough(["Nc3"], a, 2)).toBe(false);
  });
});
