import type { Classification, Color, Phase, Theme, ValidatedLine } from "@/lib/analysis/types";
import { isMateFor, moverWinPercent } from "@/lib/analysis/win";

// Sélection des coups qui deviennent des exercices (skill chess-analysis §9).

/** Écart de % de gain entre le meilleur coup et le 2ᵉ candidat au-delà duquel la solution est nette. */
export const CLEAR_SOLUTION_GAP = 10;
/** Perte maximale (par rapport au meilleur coup) pour qu'un coup soit accepté. */
export const ACCEPTED_LOSS = 5;
/** Perte évitée au-delà de laquelle l'exercice est facile. */
export const EASY_AVOIDED_LOSS = 30;
export const HARD_LINE_PLIES = 6;

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Facile", medium: "Moyen", hard: "Difficile" };

export function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

export type ExerciseSourceMove = {
  id: number;
  gameId: string;
  isPlayerMove: boolean;
  color: Color;
  fenBefore: string;
  uci: string;
  loss: number;
  classification: Classification;
  missedWin: boolean;
  phase: Phase;
  themes: Theme[];
  /** MultiPV de la position avant, triées (meilleure d'abord), validées par chess.js. */
  candidates: ValidatedLine[];
};

export type SolutionStep = { uci: string; san: string };

export type ExerciseDraft = {
  source_move_id: number;
  game_id: string;
  fen: string;
  side_to_move: Color;
  played_uci: string;
  solution_uci: string;
  solution_san: string;
  solution_line: SolutionStep[];
  accepted_uci: string[];
  themes: Theme[];
  phase: Phase;
  difficulty: Difficulty;
};

export function isExerciseCandidate(move: Pick<ExerciseSourceMove, "isPlayerMove" | "classification" | "missedWin">): boolean {
  if (!move.isPlayerMove) return false;
  return move.missedWin || move.classification === "mistake" || move.classification === "blunder" || move.classification === "inaccuracy";
}

export type SolutionAnalysis = {
  clear: boolean;
  accepted: string[];
  /** Mat en N pour le joueur au trait si le meilleur coup mate, sinon null. */
  mateIn: number | null;
};

/**
 * Solution nette : écart ≥ 10 points de % de gain avec le 2ᵉ candidat, ou meilleur coup qui mate.
 * Coups acceptés : tout candidat dont la perte par rapport au meilleur est < 5 (le meilleur inclus).
 */
export function analyzeSolution(candidates: readonly ValidatedLine[], color: Color): SolutionAnalysis | null {
  const lines = candidates.filter((c) => c.uci.length > 0);
  const best = lines[0];
  if (!best) return null;
  const wins = lines.map((c) => moverWinPercent(c.evaluation, color));
  const mates = isMateFor(best.evaluation, color);
  const gap = lines.length < 2 ? Number.POSITIVE_INFINITY : wins[0] - wins[1];
  const accepted = [...new Set(lines.filter((_, i) => wins[0] - wins[i] < ACCEPTED_LOSS).map((c) => c.uci[0]))];
  return {
    clear: mates || gap >= CLEAR_SOLUTION_GAP,
    accepted,
    mateIn: mates && best.evaluation.mate !== null ? Math.abs(best.evaluation.mate) : null,
  };
}

export function exerciseDifficulty(input: {
  classification: Classification;
  loss: number;
  themes: readonly Theme[];
  mateIn: number | null;
  solution: ValidatedLine;
}): Difficulty {
  // Les imprécisions ne sont proposées qu'au niveau facile (skill §9).
  if (input.classification === "inaccuracy" && !input.themes.includes("calculation")) return "easy";
  if (input.mateIn !== null && input.mateIn <= 2) return "easy";
  const firstSan = input.solution.san[0] ?? "";
  const quiet = !/[x+#]/.test(firstSan);
  if (input.themes.includes("calculation") || (quiet && input.solution.uci.length >= HARD_LINE_PLIES)) return "hard";
  if (input.loss >= EASY_AVOIDED_LOSS) return "easy";
  return "medium";
}

/** Exercice tiré d'un coup analysé, ou null si le coup ne se prête pas à un exercice. */
export function buildExercise(move: ExerciseSourceMove): ExerciseDraft | null {
  if (!isExerciseCandidate(move)) return null;
  const solution = analyzeSolution(move.candidates, move.color);
  if (!solution) return null;
  // Une imprécision sans solution nette ne fait pas un bon exercice.
  if (move.classification === "inaccuracy" && !move.missedWin && !solution.clear) return null;
  // Le coup joué ne doit pas faire partie des réponses acceptées.
  if (solution.accepted.includes(move.uci)) return null;

  const best = move.candidates.find((c) => c.uci.length > 0);
  if (!best || !best.san[0]) return null;

  return {
    source_move_id: move.id,
    game_id: move.gameId,
    fen: move.fenBefore,
    side_to_move: move.color,
    played_uci: move.uci,
    solution_uci: best.uci[0],
    solution_san: best.san[0],
    solution_line: best.uci.map((uci, i) => ({ uci, san: best.san[i] ?? uci })),
    accepted_uci: solution.accepted,
    themes: [...new Set(move.themes)],
    phase: move.phase,
    difficulty: exerciseDifficulty({
      classification: move.classification,
      loss: move.loss,
      themes: move.themes,
      mateIn: solution.mateIn,
      solution: best,
    }),
  };
}
