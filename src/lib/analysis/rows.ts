import { z } from "zod";
import type { Json, Tables, TablesInsert } from "@/lib/db/database.types";
import type { EngineLine, GameAnalysisSummary, MoveAnalysis, ValidatedLine } from "./types";

// Conversion MoveAnalysis <-> ligne move_analyses (utilisable côté serveur comme navigateur).
// `punish_line` vaut `[]` quand il n'y a pas de ligne punitive (position finale de la partie).

const EvaluationSchema = z.object({ cp: z.number().nullable(), mate: z.number().nullable() });
const ValidatedLineSchema = z.object({
  evaluation: EvaluationSchema,
  uci: z.array(z.string()),
  san: z.array(z.string()),
});
export const EngineLinesSchema = z.array(
  z.object({ multipv: z.number(), depth: z.number(), evaluation: EvaluationSchema, pvUci: z.array(z.string()) }),
);

const ClassificationSchema = z.enum(["forced", "best", "excellent", "good", "inaccuracy", "mistake", "blunder"]);
const PhaseSchema = z.enum(["opening", "middlegame", "endgame"]);
const ThemeSchema = z.enum([
  "tactics",
  "hanging_piece",
  "missed_tactic",
  "king_safety",
  "development",
  "bad_exchange",
  "endgame",
  "strategy",
  "calculation",
]);
const ColorSchema = z.enum(["w", "b"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function moveAnalysisToRow(gameId: string, move: MoveAnalysis): TablesInsert<"move_analyses"> {
  return {
    game_id: gameId,
    ply: move.ply,
    color: move.color,
    is_player_move: move.isPlayerMove,
    san: move.san,
    uci: move.uci,
    fen_before: move.fenBefore,
    fen_after: move.fenAfter,
    eval_before: move.evalBefore as Json,
    eval_after: move.evalAfter as Json,
    best_uci: move.bestUci,
    best_san: move.bestSan,
    candidates: move.candidates as unknown as Json,
    punish_line: (move.punishLine ?? []) as unknown as Json,
    win_before: round2(move.winBefore),
    win_after: round2(move.winAfter),
    loss: round2(move.loss),
    accuracy: round2(move.accuracy),
    classification: move.classification,
    missed_win: move.missedWin,
    missed_save: move.missedSave,
    phase: move.phase,
    themes: move.themes,
  };
}

/** Lit une ligne move_analyses ; lève une erreur si son contenu JSON ne correspond pas au contrat. */
export function rowToMoveAnalysis(row: Tables<"move_analyses">): MoveAnalysis {
  const punish = Array.isArray(row.punish_line) ? null : ValidatedLineSchema.parse(row.punish_line);
  return {
    ply: row.ply,
    color: ColorSchema.parse(row.color),
    isPlayerMove: row.is_player_move,
    san: row.san,
    uci: row.uci,
    fenBefore: row.fen_before,
    fenAfter: row.fen_after,
    evalBefore: EvaluationSchema.parse(row.eval_before),
    evalAfter: EvaluationSchema.parse(row.eval_after),
    bestUci: row.best_uci,
    bestSan: row.best_san,
    candidates: z.array(ValidatedLineSchema).parse(row.candidates) satisfies ValidatedLine[],
    punishLine: punish,
    winBefore: Number(row.win_before),
    winAfter: Number(row.win_after),
    loss: Number(row.loss),
    accuracy: Number(row.accuracy),
    classification: ClassificationSchema.parse(row.classification),
    missedWin: row.missed_win,
    missedSave: row.missed_save,
    phase: PhaseSchema.parse(row.phase),
    themes: z.array(ThemeSchema).parse(row.themes),
  };
}

export function parseEngineLines(lines: Json): EngineLine[] {
  return EngineLinesSchema.parse(lines);
}

const SideSummarySchema = z.object({
  forced: z.number(),
  best: z.number(),
  excellent: z.number(),
  good: z.number(),
  inaccuracy: z.number(),
  mistake: z.number(),
  blunder: z.number(),
  missedWin: z.number(),
  accuracy: z.number().nullable(),
});

/** Lit `game_analyses.summary` ; null si absent ou invalide. */
export function parseGameSummary(summary: Json): GameAnalysisSummary | null {
  const parsed = z.object({ player: SideSummarySchema, opponent: SideSummarySchema }).safeParse(summary);
  return parsed.success ? parsed.data : null;
}
