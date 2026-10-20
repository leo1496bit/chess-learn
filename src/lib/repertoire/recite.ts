// Verdict d'un coup récité dans une ligne d'ouverture, et réussite d'une révision.
// Le verdict vient des analyses Stockfish en cache (jamais de l'IA, jamais du client).
import { Chess } from "chess.js";
import { terminalAnalysis } from "@/lib/analysis/terminal";
import type { Color, Evaluation, PositionAnalysis } from "@/lib/analysis/types";
import { moverWinPercent } from "@/lib/analysis/win";
import { positionAfter } from "@/lib/training/attempt";
import { NEAR_BEST_LOSS } from "./constants";

/** Position à analyser : `multipv: "line"` = le MultiPV de la ligne, sinon 1 (positions après coup). */
export type AnalysisNeed = { fen: string; multipv: "line" | 1 };

export type LineMoveVerdict =
  | { verdict: "expected" }
  | { verdict: "alternative" | "wrong"; loss: number }
  | { verdict: "needs_analysis"; needs: AnalysisNeed[] }
  | { verdict: "illegal" };

export type JudgeLineMoveInput = {
  fen: string;
  expectedUci: string;
  answerUci: string;
  color: Color;
  /** Analyse MultiPV de `fen`. */
  before?: PositionAnalysis;
  /** Analyses (multipv 1) des positions après le coup attendu / le coup joué. */
  expectedAfter?: PositionAnalysis;
  answerAfter?: PositionAnalysis;
};

/** Évaluation (point de vue Blancs) d'un coup : sa ligne MultiPV, sinon la position après le coup. */
function moveEvaluation(
  fen: string,
  fenAfter: string,
  before: PositionAnalysis | undefined,
  afterAnalysis: PositionAnalysis | undefined,
): Evaluation | null {
  for (const line of before?.lines ?? []) {
    const first = line.pvUci[0];
    if (first && positionAfter(fen, first)?.fenAfter === fenAfter) return line.evaluation;
  }
  const analysis = terminalAnalysis(fenAfter) ?? afterAnalysis;
  if (!analysis) return null;
  return analysis.terminal?.evaluation ?? analysis.lines[0]?.evaluation ?? null;
}

/**
 * Écriture UCI standard du roque : certaines interfaces écrivent « roi prend sa tour » (e1h1).
 * chess.js n'accepte que e1g1 / e1c1 : on convertit le roi qui « prend » sa propre tour.
 */
export function normalizeCastling(fen: string, uci: string): string {
  if (!/^[a-h][1-8][a-h][1-8]$/.test(uci)) return uci;
  try {
    const board = new Chess(fen);
    const from = board.get(uci.slice(0, 2) as never);
    const to = board.get(uci.slice(2, 4) as never);
    if (from?.type === "k" && to?.type === "r" && to.color === from.color) {
      const rank = uci[1];
      return `${uci.slice(0, 2)}${uci[2] > uci[0] ? "g" : "c"}${rank}`;
    }
  } catch {
    // FEN invalide : positionAfter renverra null.
  }
  return uci;
}

export function judgeLineMove(input: JudgeLineMoveInput): LineMoveVerdict {
  const { fen, color, before } = input;
  const answer = positionAfter(fen, normalizeCastling(fen, input.answerUci));
  if (!answer) return { verdict: "illegal" };
  const expected = positionAfter(fen, normalizeCastling(fen, input.expectedUci));
  if (!expected) throw new Error(`Coup attendu illégal (${input.expectedUci}) dans ${fen}`);
  // Même position obtenue : couvre le roque écrit e1g1 ou e1h1 (même coup pour chess.js).
  if (answer.fenAfter === expected.fenAfter) return { verdict: "expected" };

  const expectedEval = moveEvaluation(fen, expected.fenAfter, before, input.expectedAfter);
  const answerEval = moveEvaluation(fen, answer.fenAfter, before, input.answerAfter);
  if (!expectedEval || !answerEval) {
    const needs: AnalysisNeed[] = [];
    if (!expectedEval) needs.push({ fen: expected.fenAfter, multipv: 1 });
    if (!answerEval) needs.push({ fen: answer.fenAfter, multipv: 1 });
    if (!before) needs.push({ fen, multipv: "line" });
    return { verdict: "needs_analysis", needs };
  }

  const loss = Math.max(0, moverWinPercent(expectedEval, color) - moverWinPercent(answerEval, color));
  const rounded = Math.round(loss * 100) / 100;
  return { verdict: loss < NEAR_BEST_LOSS ? "alternative" : "wrong", loss: rounded };
}

/** Révision réussie : aucune réponse révélée et au plus un indice. */
export function reviewSucceeded(input: { hints: number; revealed: number }): boolean {
  return input.revealed === 0 && input.hints <= 1;
}

/** Remplace "line" par le MultiPV de la ligne : le navigateur reçoit des nombres. */
export function resolveNeeds(needs: readonly AnalysisNeed[], lineMultipv: number): { fen: string; multipv: number }[] {
  return needs.map((n) => ({ fen: n.fen, multipv: n.multipv === "line" ? lineMultipv : n.multipv }));
}
