import { Chess } from "chess.js";
import { nonPawnMaterial } from "./material";
import type { Phase } from "./types";

/**
 * Phase de jeu (skill §5) pour la position `fen` au demi-coup `ply` :
 * finale si matériel non-pion ≤ 26 ou sans dames avec ≤ 2 pièces (C, F, T) par camp ;
 * ouverture tant que ply ≤ 20 et matériel non-pion ≥ 50 ; sinon milieu de partie.
 */
export function phase(fen: string, ply: number): Phase {
  const chess = new Chess(fen);
  const material = nonPawnMaterial(chess);

  let queens = 0;
  const pieces = { w: 0, b: 0 };
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square) continue;
      if (square.type === "q") queens++;
      else if (square.type === "n" || square.type === "b" || square.type === "r") pieces[square.color]++;
    }
  }

  if (material <= 26 || (queens === 0 && pieces.w <= 2 && pieces.b <= 2)) return "endgame";
  if (ply <= 20 && material >= 50) return "opening";
  return "middlegame";
}
