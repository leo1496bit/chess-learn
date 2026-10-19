import { Chess } from "chess.js";
import type { Evaluation } from "./types";

// Utilitaires réservés aux tests.

/** FEN après une suite de coups SAN depuis la position initiale. */
export function fenAfterMoves(...sans: string[]): string {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
}

/** Évaluation (cp, point de vue Blancs) dont le % de gain Blancs vaut `win`. */
export function cpForWhiteWin(win: number): Evaluation {
  const x = (win - 50) / 50;
  const cp = -Math.log(2 / (x + 1) - 1) / 0.00368208;
  return { cp, mate: null };
}
