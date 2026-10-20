import "server-only";
import { z } from "zod";
import type { SupabaseServerClient } from "@/lib/db/server";
import { rowToMoveAnalysis } from "@/lib/analysis";
import type { Color, MoveAnalysis, Phase } from "@/lib/analysis/types";
import { fetchAllPages } from "@/lib/stats/queries";
import { buildExercise, isDifficulty, type Difficulty, type ExerciseDraft, type SolutionStep } from "./select";
import type { QueueExercise } from "./queue";

const SolutionLineSchema = z.array(z.object({ uci: z.string(), san: z.string() }));

const UPSERT_CHUNK = 200;

export type GenerateResult = { scanned: number; generated: number; skipped: number; removed: number };

/**
 * Génère (ou rafraîchit) les exercices à partir des coups analysés du joueur.
 * Idempotent : `source_move_id` est unique ; un rafraîchissement met à jour le contenu sans
 * toucher à l'état de répétition (attempts, successes, interval_days, due_at, last_result).
 */
export async function generateExercises(supabase: SupabaseServerClient): Promise<GenerateResult> {
  const rows = await fetchAllPages("des coups à transformer en exercices", (from, to) =>
    supabase
      .from("move_analyses")
      .select("*")
      .eq("is_player_move", true)
      .or("classification.in.(inaccuracy,mistake,blunder),missed_win.is.true")
      .order("id")
      .range(from, to),
  );

  const drafts: ExerciseDraft[] = [];
  let invalid = 0;
  for (const row of rows) {
    let move: MoveAnalysis;
    try {
      move = rowToMoveAnalysis(row);
    } catch {
      invalid++;
      continue;
    }
    const draft = buildExercise({ ...move, id: row.id, gameId: row.game_id });
    if (draft) drafts.push(draft);
  }
  if (invalid > 0) console.warn(`[training] ${invalid} analyse(s) de coup illisible(s) ignorée(s)`);

  for (let i = 0; i < drafts.length; i += UPSERT_CHUNK) {
    const { error } = await supabase
      .from("exercises")
      .upsert(drafts.slice(i, i + UPSERT_CHUNK), { onConflict: "source_move_id" });
    if (error) throw new Error(`Enregistrement des exercices impossible : ${error.message}`);
  }

  // Exercices dont le coup source n'en produit plus (nouvelle analyse, autres seuils) : supprimés
  // avec leurs tentatives (cascade).
  const kept = new Set(drafts.map((d) => d.source_move_id));
  const existing = await fetchAllPages("des exercices existants", (from, to) =>
    supabase.from("exercises").select("id, source_move_id").order("id").range(from, to),
  );
  const orphans = existing.filter((e) => !kept.has(e.source_move_id)).map((e) => e.id);
  for (let i = 0; i < orphans.length; i += UPSERT_CHUNK) {
    const { error } = await supabase.from("exercises").delete().in("id", orphans.slice(i, i + UPSERT_CHUNK));
    if (error) throw new Error(`Suppression des exercices obsolètes impossible : ${error.message}`);
  }

  return { scanned: rows.length, generated: drafts.length, skipped: rows.length - drafts.length, removed: orphans.length };
}

export type TrainingExercise = QueueExercise & {
  gameId: string;
  fen: string;
  sideToMove: Color;
  playedUci: string;
  solutionUci: string;
  solutionSan: string;
  solutionLine: SolutionStep[];
  acceptedUci: string[];
  phase: Phase;
  intervalDays: number;
  lastResult: "correct" | "incorrect" | null;
  game: { white: string; black: string; endTime: string; chesscomUrl: string | null } | null;
};

export async function loadExercises(supabase: SupabaseServerClient): Promise<TrainingExercise[]> {
  const rows = await fetchAllPages("des exercices", (from, to) =>
    supabase
      .from("exercises")
      .select(
        "id, game_id, fen, side_to_move, played_uci, solution_uci, solution_san, solution_line, accepted_uci, themes, phase, difficulty, created_at, due_at, interval_days, attempts, successes, last_result, games(white, black, end_time, chesscom_url)",
      )
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => {
    const line = SolutionLineSchema.safeParse(r.solution_line);
    const difficulty: Difficulty = isDifficulty(r.difficulty) ? r.difficulty : "medium";
    return {
      id: r.id,
      gameId: r.game_id,
      fen: r.fen,
      sideToMove: r.side_to_move === "b" ? "b" : "w",
      playedUci: r.played_uci,
      solutionUci: r.solution_uci,
      solutionSan: r.solution_san,
      solutionLine: line.success ? line.data : [{ uci: r.solution_uci, san: r.solution_san }],
      acceptedUci: r.accepted_uci,
      themes: r.themes,
      phase: r.phase as Phase,
      difficulty,
      createdAt: r.created_at,
      dueAt: new Date(r.due_at).toISOString(),
      intervalDays: Number(r.interval_days),
      attempts: r.attempts,
      successes: r.successes,
      lastResult: r.last_result === "correct" || r.last_result === "incorrect" ? r.last_result : null,
      game: r.games
        ? { white: r.games.white, black: r.games.black, endTime: r.games.end_time, chesscomUrl: r.games.chesscom_url }
        : null,
    };
  });
}
