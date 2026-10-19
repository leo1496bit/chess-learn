import { isMateFor, moverWinPercent } from "./win";
import type { Classification, Color, Evaluation, Thresholds } from "./types";

export type ClassifyMoveInput = {
  color: Color; // camp qui joue le coup
  evalBefore: Evaluation; // meilleure ligne de la position avant (point de vue Blancs)
  evalAfter: Evaluation; // meilleure ligne de la position après le coup joué (point de vue Blancs)
  playedUci: string;
  bestUci: string | null;
  legalMoveCount: number;
  thresholds: Thresholds;
};

export type ClassifyMoveResult = {
  classification: Classification;
  winBefore: number;
  winAfter: number;
  loss: number;
  accuracy: number;
  missedWin: boolean;
  missedSave: boolean;
  /** Le meilleur coup matait et le coup joué non. */
  missedMate: boolean;
};

const ERROR_CLASSES: readonly Classification[] = ["inaccuracy", "mistake", "blunder"];
const SEVERITY: Record<Classification, number> = {
  forced: 0,
  best: 0,
  excellent: 1,
  good: 2,
  inaccuracy: 3,
  mistake: 4,
  blunder: 5,
};

export function isErrorClassification(classification: Classification): boolean {
  return ERROR_CLASSES.includes(classification);
}

/** Précision d'un coup (formule Lichess) à partir de la perte de % de gain. */
export function moveAccuracy(loss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/** Précision de partie : moyenne des précisions par coup, ou null sans coup. */
export function gameAccuracy(accuracies: readonly number[]): number | null {
  if (accuracies.length === 0) return null;
  return accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
}

/** Classe un coup par la perte de % de gain (seuils fournis), avec les règles complémentaires de la skill §4. */
export function classifyByLoss(loss: number, thresholds: Thresholds): Classification {
  if (loss >= thresholds.blunder) return "blunder";
  if (loss >= thresholds.mistake) return "mistake";
  if (loss >= thresholds.inaccuracy) return "inaccuracy";
  if (loss < thresholds.excellent) return "excellent";
  return "good";
}

export function classifyMove(input: ClassifyMoveInput): ClassifyMoveResult {
  const { color, evalBefore, evalAfter, playedUci, bestUci, legalMoveCount, thresholds } = input;
  const winBefore = moverWinPercent(evalBefore, color);
  const winAfter = moverWinPercent(evalAfter, color);

  if (legalMoveCount <= 1) {
    return { classification: "forced", winBefore, winAfter, loss: 0, accuracy: 100, missedWin: false, missedSave: false, missedMate: false };
  }

  const loss = Math.max(0, winBefore - winAfter);
  const accuracy = moveAccuracy(loss);

  if (bestUci !== null && playedUci === bestUci) {
    return { classification: "best", winBefore, winAfter, loss, accuracy, missedWin: false, missedSave: false, missedMate: false };
  }

  const deliveredMate = evalAfter.mate === 0 || isMateFor(evalAfter, color);
  const missedMate = isMateFor(evalBefore, color) && !deliveredMate;

  let classification = classifyByLoss(loss, thresholds);
  if (missedMate && SEVERITY[classification] < SEVERITY.mistake) classification = "mistake";

  // Position déjà décidée : aucun signalement au-delà de « good » (prime sur le mat raté).
  const decided = (winBefore >= 97 && winAfter >= 90) || winBefore <= 3;
  if (decided && SEVERITY[classification] > SEVERITY.good) classification = "good";

  return {
    classification,
    winBefore,
    winAfter,
    loss,
    accuracy,
    missedWin: winBefore >= 80 && winAfter < 60,
    missedSave: winBefore >= 40 && winAfter < 20,
    missedMate,
  };
}
