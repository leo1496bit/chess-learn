import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { reviewSucceeded } from "@/lib/repertoire/recite";
import { scheduleReview } from "@/lib/training/sm2";

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

const BodySchema = z.object({
  hints: z.number().int().min(0).max(1000),
  revealed: z.number().int().min(0).max(1000),
});

/** Fin d'une récitation : planifie la prochaine révision de la branche (répétition espacée). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour enregistrer ta révision.");

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse(400, "Identifiant de branche invalide.");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(400, "Corps de requête JSON invalide.");
  }
  const input = BodySchema.safeParse(json);
  if (!input.success) return errorResponse(400, "Paramètres invalides : { hints, revealed } attendus.");
  const { supabase } = auth;

  try {
    const { data: branch, error } = await supabase
      .from("opening_branches")
      .select("id, interval_days, attempts, successes, studied_at")
      .eq("id", id.data)
      .eq("archived", false)
      .maybeSingle();
    if (error) throw error;
    if (!branch) return errorResponse(404, "Branche introuvable.");

    const now = new Date();
    const correct = reviewSucceeded(input.data);
    const review = scheduleReview(
      { intervalDays: Number(branch.interval_days), attempts: branch.attempts, successes: branch.successes },
      correct,
      now,
    );
    const { error: updateError } = await supabase
      .from("opening_branches")
      .update({
        due_at: review.dueAt,
        interval_days: review.intervalDays,
        attempts: review.attempts,
        successes: review.successes,
        last_result: review.lastResult,
        studied_at: branch.studied_at ?? now.toISOString(),
      })
      .eq("id", branch.id);
    if (updateError) throw updateError;

    return Response.json({ correct, dueAt: review.dueAt, intervalDays: review.intervalDays });
  } catch (error) {
    console.error("[openings/branches/review] Enregistrement impossible", error);
    return errorResponse(500, "La révision n'a pas pu être enregistrée. Réessaie dans un instant.");
  }
}
