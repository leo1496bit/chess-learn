import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, type PositionAnalysis } from "@/lib/analysis/types";
import { NEAR_BEST_LOSS } from "./constants";
import { judgeLineMove, reviewSucceeded } from "./recite";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CASTLE = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
const PROMO = "8/P6k/8/8/8/8/8/K7 w - - 0 1";

function analysis(fen: string, lines: { uci: string; cp: number }[]): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multipv: lines.length,
    engineVersion: ENGINE_VERSION,
    lines: lines.map((l, i) => ({ multipv: i + 1, depth: 16, evaluation: { cp: l.cp, mate: null }, pvUci: [l.uci] })),
  };
}
const after = (fen: string, cp: number) => analysis(fen, [{ uci: "a2a3", cp }]);
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";

describe("judgeLineMove", () => {
  it("coup identique : expected, sans analyse", () => {
    expect(judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "e2e4", color: "w" })).toEqual({ verdict: "expected" });
  });

  it("roque e1g1 attendu et e1h1 joué : expected", () => {
    expect(judgeLineMove({ fen: CASTLE, expectedUci: "e1g1", answerUci: "e1h1", color: "w" })).toEqual({ verdict: "expected" });
    expect(judgeLineMove({ fen: CASTLE, expectedUci: "e1g1", answerUci: "e1g1", color: "w" })).toEqual({ verdict: "expected" });
  });

  it("promotion identique : expected ; promotion différente : pas expected", () => {
    expect(judgeLineMove({ fen: PROMO, expectedUci: "a7a8q", answerUci: "a7a8q", color: "w" })).toEqual({ verdict: "expected" });
    expect(judgeLineMove({ fen: PROMO, expectedUci: "a7a8q", answerUci: "a7a8n", color: "w" }).verdict).toBe("needs_analysis");
  });

  it("coup illégal : illegal", () => {
    expect(judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "e2e5", color: "w" })).toEqual({ verdict: "illegal" });
    expect(judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "zz", color: "w" })).toEqual({ verdict: "illegal" });
  });

  it("perte de 1,5 : alternative ; perte de 6 : wrong (évaluations du MultiPV)", () => {
    const near = analysis(START, [{ uci: "e2e4", cp: 0 }, { uci: "d2d4", cp: -16 }]);
    const nearRes = judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "d2d4", color: "w", before: near });
    expect(nearRes.verdict).toBe("alternative");
    if (nearRes.verdict === "alternative") expect(nearRes.loss).toBeGreaterThan(1.3);
    const far = analysis(START, [{ uci: "e2e4", cp: 0 }, { uci: "d2d4", cp: -100 }, { uci: "a2a3", cp: -300 }]);
    const res = judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "d2d4", color: "w", before: far });
    expect(res.verdict).toBe("wrong");
    if (res.verdict === "wrong") expect(res.loss).toBeGreaterThan(NEAR_BEST_LOSS);
  });

  it("utilise les positions après coup si le MultiPV ne contient pas le coup", () => {
    const before = analysis(START, [{ uci: "e2e4", cp: 0 }]);
    const res = judgeLineMove({
      fen: START, expectedUci: "e2e4", answerUci: "d2d4", color: "w",
      before, answerAfter: after(AFTER_D4, -170),
    });
    expect(res.verdict).toBe("wrong");
  });

  it("noirs : évaluation du point de vue des noirs", () => {
    const fen = AFTER_E4;
    const before = analysis(fen, [{ uci: "e7e5", cp: 0 }, { uci: "c7c5", cp: 16 }]);
    const res = judgeLineMove({ fen, expectedUci: "e7e5", answerUci: "c7c5", color: "b", before });
    expect(res.verdict).toBe("alternative");
    const bad = analysis(fen, [{ uci: "e7e5", cp: 0 }, { uci: "c7c5", cp: 300 }]);
    expect(judgeLineMove({ fen, expectedUci: "e7e5", answerUci: "c7c5", color: "b", before: bad }).verdict).toBe("wrong");
  });

  it("une meilleure réponse que l'attendu : perte 0, alternative", () => {
    const before = analysis(START, [{ uci: "d2d4", cp: 40 }, { uci: "e2e4", cp: 0 }]);
    expect(judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "d2d4", color: "w", before })).toEqual({
      verdict: "alternative",
      loss: 0,
    });
  });

  it("analyse manquante : needs_analysis avec les FEN à analyser", () => {
    const res = judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "d2d4", color: "w" });
    expect(res).toEqual({ verdict: "needs_analysis", needs: [
        { fen: AFTER_E4, multipv: 1 },
        { fen: AFTER_D4, multipv: 1 },
        { fen: START, multipv: "line" },
      ],
    });
  });

  it("MultiPV présent mais sans le coup joué : seule la position après ce coup est demandée", () => {
    const before = analysis(START, [{ uci: "e2e4", cp: 0 }]);
    const res = judgeLineMove({ fen: START, expectedUci: "e2e4", answerUci: "d2d4", color: "w", before });
    expect(res).toEqual({ verdict: "needs_analysis", needs: [{ fen: AFTER_D4, multipv: 1 }] });
  });
});

describe("reviewSucceeded", () => {
  it("réussi avec au plus un indice et sans révélation", () => {
    expect(reviewSucceeded({ hints: 0, revealed: 0 })).toBe(true);
    expect(reviewSucceeded({ hints: 1, revealed: 0 })).toBe(true);
    expect(reviewSucceeded({ hints: 2, revealed: 0 })).toBe(false);
    expect(reviewSucceeded({ hints: 0, revealed: 1 })).toBe(false);
  });
});
