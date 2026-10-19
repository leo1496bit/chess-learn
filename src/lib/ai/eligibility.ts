import type { MoveAnalysis } from "@/lib/analysis/types";

/** Seuls les écarts du joueur sont expliqués : imprécision, erreur, gaffe ou gain manqué. */
export function isExplainable(move: Pick<MoveAnalysis, "isPlayerMove" | "classification" | "missedWin">): boolean {
  if (!move.isPlayerMove) return false;
  return move.missedWin || move.classification === "inaccuracy" || move.classification === "mistake" || move.classification === "blunder";
}
