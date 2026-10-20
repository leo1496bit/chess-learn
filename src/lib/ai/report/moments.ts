// Moments clés d'une partie pour le bilan (module pur, sans dépendance aux prompts : il est aussi
// utilisé côté client pour relier les coups cités dans le bilan).
import type { MoveAnalysis, Thresholds } from "@/lib/analysis/types";
import { isFlaggedMove } from "../eligibility";

/** Nombre maximal de moments clés transmis (les plus coûteux d'abord). */
export const MAX_KEY_MOMENTS = 12;

export type KeyMoment = { move: MoveAnalysis; unpunished: MoveAnalysis | null };

/**
 * Moments clés : écarts du joueur (les plus coûteux) et réponses du joueur qui n'ont pas puni une
 * erreur de l'adversaire. Triés dans l'ordre de la partie.
 */
export function selectKeyMoments(moves: readonly MoveAnalysis[], thresholds: Thresholds): KeyMoment[] {
  const byPly = new Map(moves.map((m) => [m.ply, m]));
  const candidates = new Map<number, KeyMoment>();

  for (const move of moves) {
    if (!move.isPlayerMove) continue;
    const previous = byPly.get(move.ply - 1);
    const unpunished =
      previous && !previous.isPlayerMove && (previous.classification === "mistake" || previous.classification === "blunder") && move.loss >= thresholds.inaccuracy
        ? previous
        : null;
    if (isFlaggedMove(move) || unpunished) candidates.set(move.ply, { move, unpunished });
  }

  return [...candidates.values()]
    .sort((a, b) => b.move.loss - a.move.loss)
    .slice(0, MAX_KEY_MOMENTS)
    .sort((a, b) => a.move.ply - b.move.ply);
}
