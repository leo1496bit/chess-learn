import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { PositionAnalysis } from "@/lib/analysis/types";
import type { OpeningBook } from "@/lib/openings/identify";
import { toEpd } from "@/lib/openings/identify";
import {
  branchEnds,
  candidatesNeedingEval,
  choosePlayerMove,
  lineKind,
  playerCandidates,
} from "./choose";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function after(fen: string, san: string): string {
  const chess = new Chess(fen);
  chess.move(san);
  return chess.fen();
}

function analysis(
  fen: string,
  lines: { uci: string; cp: number }[],
): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multipv: lines.length,
    engineVersion: "test",
    lines: lines.map((l, i) => ({
      multipv: i + 1,
      depth: 16,
      evaluation: { cp: l.cp, mate: null },
      pvUci: [l.uci],
    })),
  };
}

const book: OpeningBook = {
  [toEpd(after(START, "e4"))]: ["B00", "King's Pawn Game", 1],
  [toEpd(after(START, "c4"))]: ["A10", "English Opening", 1],
  [toEpd(after(START, "Nf3"))]: ["A04", "Zukertort Opening", 1],
};

describe("playerCandidates", () => {
  it("livre et explorateur d'abord, au plus PLAYER_CANDIDATES, sans doublon", () => {
    const explorer = {
      total: 1000,
      moves: [
        { uci: "c2c4", san: "c4", games: 300, share: 0.3 },
        { uci: "d2d4", san: "d4", games: 400, share: 0.4 },
        { uci: "g1f3", san: "Nf3", games: 20, share: 0.02 },
      ],
    };
    // c4 : livre + explorateur ; d4 : explorateur seul ; e4, Nf3 : livre seul
    expect(playerCandidates(START, book, explorer)).toEqual(["c2c4", "d2d4"]);
  });

  it("sans explorateur : coups du livre", () => {
    const result = playerCandidates(START, book, null);
    expect(result).toHaveLength(2);
    for (const uci of result) expect(["e2e4", "c2c4", "g1f3"]).toContain(uci);
  });

  it("départage les égalités par coup UCI, pas par l'ordre de génération de chess.js", () => {
    const tiedBook: OpeningBook = {
      [toEpd(after(START, "e4"))]: ["B00", "King's Pawn Game", 1],
      [toEpd(after(START, "Nc3"))]: ["A00", "Van Geet Opening", 1],
    };
    expect(playerCandidates(START, tiedBook, null)).toEqual(["b1c3", "e2e4"]);
    const explorer = {
      total: 100,
      moves: [
        { uci: "d2d4", san: "d4", games: 30, share: 0.3 },
        { uci: "b1c3", san: "Nc3", games: 30, share: 0.3 },
      ],
    };
    expect(playerCandidates(START, {}, explorer)).toEqual(["b1c3", "d2d4"]);
  });

  it("ignore un coup d'explorateur illégal", () => {
    const explorer = {
      total: 10,
      moves: [{ uci: "e2e5", san: "e5", games: 10, share: 1 }],
    };
    expect(playerCandidates(START, {}, explorer)).toEqual([]);
  });
});

describe("choosePlayerMove", () => {
  it("préfère le candidat du livre quasi meilleur", () => {
    const a = analysis(START, [{ uci: "d2d4", cp: 40 }]);
    const evals = new Map([["e2e4", { cp: 25, mate: null }]]);
    expect(choosePlayerMove(a, evals, "w", ["e2e4"])).toEqual({
      uci: "e2e4",
      fromBook: true,
    });
  });

  it("retient le meilleur coup si le candidat est trop faible", () => {
    const a = analysis(START, [{ uci: "d2d4", cp: 40 }]);
    const evals = new Map([["e2e4", { cp: -60, mate: null }]]);
    expect(choosePlayerMove(a, evals, "w", ["e2e4"])).toEqual({
      uci: "d2d4",
      fromBook: false,
    });
  });

  it("côté Noirs : scores convertis au point de vue du joueur", () => {
    const a = analysis(AFTER_E4, [{ uci: "c7c5", cp: -40 }]);
    expect(
      choosePlayerMove(a, new Map([["e7e5", { cp: -25, mate: null }]]), "b", [
        "e7e5",
      ]),
    ).toEqual({
      uci: "e7e5",
      fromBook: true,
    });
    expect(
      choosePlayerMove(a, new Map([["e7e5", { cp: 60, mate: null }]]), "b", [
        "e7e5",
      ]),
    ).toEqual({
      uci: "c7c5",
      fromBook: false,
    });
  });

  it("utilise la ligne MultiPV d'un candidat et signale le meilleur coup du livre", () => {
    const a = analysis(START, [
      { uci: "d2d4", cp: 40 },
      { uci: "e2e4", cp: 38 },
    ]);
    expect(choosePlayerMove(a, new Map(), "w", ["d2d4"])).toEqual({
      uci: "d2d4",
      fromBook: true,
    });
    expect(choosePlayerMove(a, new Map(), "w", ["e2e4"])).toEqual({
      uci: "e2e4",
      fromBook: true,
    });
  });

  it("lève une erreur sans ligne d'analyse", () => {
    const a = { ...analysis(START, []), lines: [] };
    expect(() => choosePlayerMove(a, new Map(), "w", ["e2e4"])).toThrow();
  });

  it("ignore un candidat sans évaluation", () => {
    const a = analysis(START, [{ uci: "d2d4", cp: 40 }]);
    expect(choosePlayerMove(a, new Map(), "w", ["e2e4"])).toEqual({
      uci: "d2d4",
      fromBook: false,
    });
  });
});

describe("candidatesNeedingEval", () => {
  it("exclut les candidats déjà en MultiPV", () => {
    const a = analysis(START, [
      { uci: "d2d4", cp: 40 },
      { uci: "e2e4", cp: 38 },
    ]);
    expect(candidatesNeedingEval(a, ["e2e4", "c2c4"])).toEqual(["c2c4"]);
  });
});

describe("lineKind", () => {
  it("punish si perte >= PUNISH_LOSS", () => {
    expect(
      lineKind({ lossOfDefiningMove: 12, bookName: null, playerWinAtRoot: 50 }),
    ).toBe("punish");
  });
  it("punish pour un gambit où le joueur est bien", () => {
    expect(
      lineKind({
        lossOfDefiningMove: 4,
        bookName: "Englund Gambit",
        playerWinAtRoot: 65,
      }),
    ).toBe("punish");
  });
  it("bornes : perte 10 et victoire 60 comptent", () => {
    expect(
      lineKind({ lossOfDefiningMove: 10, bookName: null, playerWinAtRoot: 50 }),
    ).toBe("punish");
    expect(
      lineKind({
        lossOfDefiningMove: 0,
        bookName: "Englund Gambit",
        playerWinAtRoot: 60,
      }),
    ).toBe("punish");
  });
  it("master sinon", () => {
    expect(
      lineKind({
        lossOfDefiningMove: 4,
        bookName: "Caro-Kann Defense: Two Knights Attack",
        playerWinAtRoot: 65,
      }),
    ).toBe("master");
    expect(
      lineKind({
        lossOfDefiningMove: 4,
        bookName: "Englund Gambit",
        playerWinAtRoot: 55,
      }),
    ).toBe("master");
  });
});

describe("branchEnds", () => {
  const mate = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  it("vrai au demi-coup 30", () => {
    expect(
      branchEnds({ fen: START, ply: 30, ownGames: 10, explorerTotal: 1000 }),
    ).toBe(true);
  });
  it("vrai pour un mat", () => {
    expect(
      branchEnds({ fen: mate, ply: 4, ownGames: 10, explorerTotal: 1000 }),
    ).toBe(true);
  });
  it("vrai pour un pat et pour roi+fou contre roi", () => {
    expect(
      branchEnds({
        fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
        ply: 4,
        ownGames: 9,
        explorerTotal: null,
      }),
    ).toBe(true);
    expect(
      branchEnds({
        fen: "8/8/4k3/8/8/3K4/3B4/8 w - - 0 1",
        ply: 4,
        ownGames: 9,
        explorerTotal: null,
      }),
    ).toBe(true);
  });
  it("vrai hors phase d'ouverture", () => {
    expect(
      branchEnds({ fen: START, ply: 21, ownGames: 10, explorerTotal: 1000 }),
    ).toBe(true);
  });
  it("vrai si explorateur mince et peu de parties propres", () => {
    expect(
      branchEnds({ fen: START, ply: 12, ownGames: 1, explorerTotal: 40 }),
    ).toBe(true);
  });
  it("faux sans explorateur et 1 partie propre en ouverture", () => {
    expect(
      branchEnds({ fen: START, ply: 12, ownGames: 1, explorerTotal: null }),
    ).toBe(false);
  });
});
