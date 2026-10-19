import type { Chess, PieceSymbol } from "chess.js";
import type { Color } from "./types";

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Matériel total de `color` (pions inclus, roi exclu). */
export function materialOf(chess: Chess, color: Color): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (square && square.color === color) total += PIECE_VALUES[square.type];
    }
  }
  return total;
}

/** Bilan matériel du point de vue de `color` (matériel de `color` - matériel adverse). */
export function materialBalance(chess: Chess, color: Color): number {
  return materialOf(chess, color) - materialOf(chess, color === "w" ? "b" : "w");
}

/** Matériel hors pions et roi, des deux camps (pour la phase de jeu). */
export function nonPawnMaterial(chess: Chess): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (square && square.type !== "p") total += PIECE_VALUES[square.type];
    }
  }
  return total;
}
