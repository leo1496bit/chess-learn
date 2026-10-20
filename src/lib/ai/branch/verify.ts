// Vérification des idées d'une branche (module pur) : coups cités et index référencés.
import { verifyMoves } from "../verify";
import type { BranchIdeas } from "./schema";

export type BranchVerification = {
  valid: boolean;
  invalidMoves: string[];
  /** Index hors de la branche ou en double. */
  invalidIndexes: number[];
  /** Demi-coups de la branche sans idée. */
  missingIndexes: number[];
};

export function branchTexts(ideas: BranchIdeas): string[] {
  return [...ideas.moves.map((m) => m.idea), ideas.plan];
}

export function verifyBranchIdeas(
  ideas: BranchIdeas,
  allowed: Set<string>,
  protectedPhrases: readonly string[],
  branchLength: number,
): BranchVerification {
  const moves = verifyMoves(branchTexts(ideas), [], allowed, protectedPhrases);
  const seen = new Set<number>();
  const invalidIndexes = new Set<number>();
  for (const { index } of ideas.moves) {
    if (index < 0 || index >= branchLength || seen.has(index)) invalidIndexes.add(index);
    seen.add(index);
  }
  const missingIndexes: number[] = [];
  for (let i = 0; i < branchLength; i++) if (!seen.has(i)) missingIndexes.push(i);
  return {
    valid: moves.valid && invalidIndexes.size === 0 && missingIndexes.length === 0,
    invalidMoves: moves.invalid,
    invalidIndexes: [...invalidIndexes],
    missingIndexes,
  };
}
