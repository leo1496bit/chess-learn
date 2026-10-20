import { getAuthorizedUser, type SupabaseServerClient } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { parseEngineLines } from "@/lib/analysis/rows";
import { terminalAnalysis } from "@/lib/analysis/terminal";
import { ENGINE_VERSION, type PositionAnalysis } from "@/lib/analysis/types";
import { AttemptBodySchema, judgeAttempt, positionAfter } from "@/lib/training/attempt";
import { scheduleReview } from "@/lib/training/sm2";

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

const RETRY = "Réessaie dans un instant.";

/** Analyse Stockfish en cache d'une position (ou évaluation par les règles si la partie est finie). */
async function cachedAnalysis(
  supabase: SupabaseServerClient,
  fen: string,
  depth: number,
  multipv: number,
): Promise<PositionAnalysis | null> {
  const terminal = terminalAnalysis(fen, depth, multipv);
  if (terminal) return terminal;
  const { data, error } = await supabase
    .from("position_analyses")
    .select("lines")
    .eq("fen", fen)
    .eq("depth", depth)
    .eq("multipv", multipv)
    .eq("engine_version", ENGINE_VERSION)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lines = parseEngineLines(data.lines);
  return lines.length > 0 ? { fen, depth, multipv, engineVersion: ENGINE_VERSION, lines } : null;
}

/**
 * Enregistre une réponse d'exercice. Le verdict est calculé ici à partir des analyses Stockfish
 * mises en cache par le navigateur : la requête ne contient que le coup joué.
 */
export async function POST(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour enregistrer ta réponse.");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(400, "Corps de requête JSON invalide.");
  }
  const input = AttemptBodySchema.safeParse(json);
  if (!input.success) {
    return errorResponse(400, "Paramètres invalides : { exerciseId, answerUci } attendus.");
  }
  const body = input.data;
  const { supabase } = auth;

  try {
    const [{ data: exercise, error: readError }, settings] = await Promise.all([
      supabase
        .from("exercises")
        .select("id, fen, accepted_uci, interval_days, attempts, successes")
        .eq("id", body.exerciseId)
        .maybeSingle(),
      getSettings(supabase),
    ]);
    if (readError) throw readError;
    if (!exercise) return errorResponse(404, "Exercice introuvable. Recharge la page d'entraînement.");

    const next = positionAfter(exercise.fen, body.answerUci);
    if (!next) return errorResponse(422, "Ce coup n'est pas légal dans la position de l'exercice.");

    const [before, after] = await Promise.all([
      cachedAnalysis(supabase, exercise.fen, settings.engineDepth, settings.engineMultipv),
      cachedAnalysis(supabase, next.fenAfter, settings.engineDepth, 1),
    ]);
    if (!before || !after) {
      return errorResponse(409, "L'analyse Stockfish de cette position n'est pas encore enregistrée. Relance l'évaluation.");
    }

    const judgement = judgeAttempt(exercise, body.answerUci, before, after, settings.thresholds);
    if (!judgement.ok) return errorResponse(422, judgement.error);

    const review = scheduleReview(
      { intervalDays: Number(exercise.interval_days), attempts: exercise.attempts, successes: exercise.successes },
      judgement.correct,
      new Date(),
    );

    const { error: insertError } = await supabase.from("exercise_attempts").insert({
      exercise_id: exercise.id,
      answer_uci: body.answerUci,
      answer_san: judgement.answerSan,
      correct: judgement.correct,
      loss: judgement.loss,
    });
    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("exercises")
      .update({
        attempts: review.attempts,
        successes: review.successes,
        last_result: review.lastResult,
        interval_days: review.intervalDays,
        due_at: review.dueAt,
      })
      .eq("id", exercise.id);
    if (updateError) throw updateError;

    return Response.json({
      correct: judgement.correct,
      verdict: judgement.verdict,
      loss: judgement.loss,
      answerSan: judgement.answerSan,
      bestSan: judgement.bestSan,
      isBest: judgement.isBest,
      intervalDays: review.intervalDays,
      dueAt: review.dueAt,
    });
  } catch (error) {
    console.error("[training/attempt]", error);
    return errorResponse(500, `Enregistrement de la réponse impossible. ${RETRY}`);
  }
}
