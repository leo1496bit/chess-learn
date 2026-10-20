import { getAuthorizedUser } from "@/lib/db/server";
import { generateExercises } from "@/lib/training/queries";

export const maxDuration = 60;

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Génère ou rafraîchit les exercices à partir des coups analysés (idempotent). */
export async function POST() {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour générer tes exercices.");

  try {
    const result = await generateExercises(auth.supabase);
    return Response.json(result);
  } catch (error) {
    console.error("[training/generate]", error);
    return errorResponse(500, "La génération des exercices a échoué. Réessaie dans un instant.");
  }
}
