import { getAuthorizedUser } from "@/lib/db/server";
import { AttemptBodySchema, checkAttempt } from "@/lib/training/attempt";
import { scheduleReview } from "@/lib/training/sm2";

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * Enregistre une réponse d'exercice. Le verdict vient de Stockfish (navigateur) ; le serveur
 * vérifie la légalité du coup et la cohérence du verdict, puis met à jour la répétition espacée.
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
    return errorResponse(400, "Paramètres invalides : { exerciseId, answerUci, correct, loss } attendus.");
  }
  const body = input.data;
  const { supabase } = auth;

  const { data: exercise, error: readError } = await supabase
    .from("exercises")
    .select("id, fen, accepted_uci, interval_days, attempts, successes")
    .eq("id", body.exerciseId)
    .maybeSingle();
  if (readError) return errorResponse(500, `Lecture de l'exercice impossible : ${readError.message}`);
  if (!exercise) return errorResponse(404, "Exercice introuvable. Recharge la page d'entraînement.");

  const check = checkAttempt(exercise, body);
  if (!check.ok) return errorResponse(422, check.error);

  const review = scheduleReview(
    { intervalDays: Number(exercise.interval_days), attempts: exercise.attempts, successes: exercise.successes },
    check.correct,
    new Date(),
  );

  const { error: insertError } = await supabase.from("exercise_attempts").insert({
    exercise_id: exercise.id,
    answer_uci: body.answerUci,
    answer_san: check.answerSan,
    correct: check.correct,
    loss: body.loss,
  });
  if (insertError) return errorResponse(500, `Enregistrement de la réponse impossible : ${insertError.message}`);

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
  if (updateError) return errorResponse(500, `Mise à jour de la révision impossible : ${updateError.message}`);

  return Response.json({
    correct: check.correct,
    answerSan: check.answerSan,
    intervalDays: review.intervalDays,
    dueAt: review.dueAt,
  });
}
