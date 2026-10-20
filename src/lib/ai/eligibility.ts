import type { MoveAnalysis } from "@/lib/analysis/types";

/**
 * Tous les coups analysés (du joueur comme de l'adversaire) peuvent être expliqués. Ce prédicat
 * choisit seulement le cadrage : un écart (imprécision, erreur, gaffe, gain manqué) est expliqué
 * comme une erreur, les autres coups comme de bons coups.
 */
export function isFlaggedMove(move: Pick<MoveAnalysis, "classification" | "missedWin">): boolean {
  return move.missedWin || move.classification === "inaccuracy" || move.classification === "mistake" || move.classification === "blunder";
}
