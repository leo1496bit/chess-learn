import { describe, expect, it } from "vitest";
import { buildGameAnalysis, evaluateCandidateMove, extractPositions } from "./game";
import { moveAnalysisToRow, rowToMoveAnalysis } from "./rows";
import { terminalAnalysis } from "./terminal";
import { DEFAULT_THRESHOLDS, ENGINE_VERSION, type Evaluation, type PositionAnalysis } from "./types";
import type { Tables } from "@/lib/db/database.types";

// Mat du berger, avec en-têtes et commentaires d'horloge Chess.com.
const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[White "Leny_l"]
[Black "adversaire"]
[Result "1-0"]

1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:57]} 2. Qh5 {[%clk 0:09:55]} 2... Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const cp = (value: number): Evaluation => ({ cp: value, mate: null });

/** Analyses moteur simulées (évaluations point de vue Blancs). */
function engineAnalyses(fens: string[]): PositionAnalysis[] {
  const fake: [string[], Evaluation][][] = [
    [[["e2e4", "e7e5"], cp(30)], [["d2d4"], cp(25)]], // avant 1.e4
    [[["e7e5", "g1f3"], cp(30)], [["c7c5"], cp(35)]], // avant 1...e5
    [[["g1f3", "b8c6"], cp(35)], [["d1h5"], cp(0)]], // avant 2.Qh5
    [[["b8c6", "f1c4"], cp(0)], [["g8f6"], cp(60)]], // avant 2...Nc6
    [[["f1c4", "g7g6"], cp(10)], [["d2d4"], cp(5)]], // avant 3.Bc4
    [[["g7g6", "h5f3", "g8f6"], cp(20)], [["d8e7"], cp(30)]], // avant 3...Nf6??
    [[["h5f7"], { cp: null, mate: 1 }], [["c4f7", "e8e7"], cp(400)]], // avant 4.Qxf7#
  ];
  return fens.map((fen, i) => {
    const terminal = terminalAnalysis(fen, 16, 2);
    if (terminal) return terminal;
    return {
      fen,
      depth: 16,
      multipv: 2,
      engineVersion: ENGINE_VERSION,
      lines: fake[i].map(([pvUci, evaluation], k) => ({ multipv: k + 1, depth: 16, evaluation, pvUci })),
    };
  });
}

describe("extractPositions", () => {
  it("renvoie N+1 positions et les coups UCI", () => {
    const { fens, moves } = extractPositions(PGN);
    expect(fens).toHaveLength(8);
    expect(moves.map((m) => m.uci)).toEqual(["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"]);
    expect(moves[6].san).toBe("Qxf7#");
    expect(moves[0].fenBefore).toBe(fens[0]);
    expect(moves[6].fenAfter).toBe(fens[7]);
  });

  it("signale un PGN illisible", () => {
    expect(() => extractPositions("1. e4 e5 2. Ke3 Qxz9")).toThrow(/PGN illisible/);
  });
});

describe("buildGameAnalysis", () => {
  const { fens } = extractPositions(PGN);
  const result = buildGameAnalysis(PGN, "b", engineAnalyses(fens), DEFAULT_THRESHOLDS);

  it("analyse chaque demi-coup", () => {
    expect(result.moves).toHaveLength(7);
    expect(result.moves.map((m) => m.isPlayerMove)).toEqual([false, true, false, true, false, true, false]);
  });

  it("classe 3...Nf6?? comme gaffe avec ligne punitive et thèmes", () => {
    const nf6 = result.moves[5];
    expect(nf6.san).toBe("Nf6");
    expect(nf6.bestSan).toBe("g6");
    expect(nf6.classification).toBe("blunder");
    expect(nf6.evalAfter).toEqual({ cp: null, mate: 1 });
    expect(nf6.winAfter).toBe(0);
    expect(nf6.punishLine?.san).toEqual(["Qxf7#"]);
    expect(nf6.candidates.map((c) => c.san[0])).toEqual(["g6", "Qe7"]);
    expect(nf6.themes).toEqual(expect.arrayContaining(["tactics", "king_safety"]));
    expect(nf6.missedSave).toBe(true);
  });

  it("le coup qui mate est le meilleur et a une position terminale après", () => {
    const mate = result.moves[6];
    expect(mate.classification).toBe("best");
    expect(mate.evalAfter).toEqual({ cp: null, mate: 0 });
    expect(mate.winAfter).toBe(100);
    expect(mate.punishLine).toBeNull();
  });

  it("2.Qh5 n'est pas le meilleur coup", () => {
    expect(result.moves[2].classification).not.toBe("best");
    expect(result.moves[0].classification).toBe("best");
  });

  it("résumé par camp", () => {
    expect(result.summary.player.blunder).toBe(1);
    expect(result.summary.opponent.blunder).toBe(0);
    expect(result.summary.player.accuracy).not.toBeNull();
    expect(result.summary.player.accuracy!).toBeLessThan(result.summary.opponent.accuracy!);
  });

  it("refuse des analyses décalées", () => {
    const analyses = engineAnalyses(fens);
    expect(() => buildGameAnalysis(PGN, "w", analyses.slice(1), DEFAULT_THRESHOLDS)).toThrow();
  });

  it("aller-retour vers move_analyses", () => {
    const move = result.moves[5];
    const row = { ...moveAnalysisToRow("g1", move), id: 1, user_id: "u" } as Tables<"move_analyses">;
    const back = rowToMoveAnalysis(row);
    expect(back.punishLine).toEqual(move.punishLine);
    expect(back.candidates).toEqual(move.candidates);
    expect(back.loss).toBeCloseTo(move.loss, 2);
    const last = { ...moveAnalysisToRow("g1", result.moves[6]), id: 2, user_id: "u" } as Tables<"move_analyses">;
    expect(rowToMoveAnalysis(last).punishLine).toBeNull();
  });
});

describe("evaluateCandidateMove", () => {
  const { fens } = extractPositions(PGN);
  const analyses = engineAnalyses(fens);
  const fenBefore = fens[5]; // Noirs au trait avant 3...Nf6??

  it("juge un coup proposé avec les mêmes règles", () => {
    const after = analyses[6];
    const r = evaluateCandidateMove(fenBefore, "g8f6", analyses[5], after, DEFAULT_THRESHOLDS);
    expect(r?.san).toBe("Nf6");
    expect(r?.classification).toBe("blunder");
    expect(r?.isBest).toBe(false);
    expect(r?.bestSan).toBe("g6");
  });

  it("renvoie null pour un coup illégal", () => {
    expect(evaluateCandidateMove(fenBefore, "e1e2", analyses[5], analyses[6], DEFAULT_THRESHOLDS)).toBeNull();
  });
});
