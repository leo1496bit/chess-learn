import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { serverEnv } from "@/lib/env";
import { OPENING_BOOK } from "@/lib/openings/book";
import { buildStep } from "@/lib/repertoire/build";
import { createSupabaseLineStore } from "@/lib/repertoire/store";

export const maxDuration = 60;

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * Une étape de construction de l'arbre : renvoie les analyses que le navigateur doit encore calculer
 * (et enregistrer dans `position_analyses`) avant de rappeler cette route. Le navigateur analyse à la
 * `depth` renvoyée ici (celle de la ligne en base, qu'un `/rebuild` a pu changer), jamais à celle d'une
 * copie locale de la ligne. Une étape dure au plus ~45 s ; `status: "building"` : rappeler la route.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour construire une ligne.");

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse(400, "Identifiant de ligne invalide.");

  try {
    const now = new Date();
    const store = createSupabaseLineStore(auth.supabase, { token: serverEnv.lichessToken, now });
    const line = await store.getLine(id.data);
    if (!line) return errorResponse(404, "Ligne introuvable.");
    // `retryAfterMs` (429 de Lichess) est renvoyé tel quel : le navigateur attend avant de relancer.
    const explorerConfigured = Boolean(serverEnv.lichessToken);
    return Response.json(await buildStep(store, { book: OPENING_BOOK, now, explorerConfigured }, line));
  } catch (error) {
    console.error("[openings/lines/build] Étape de construction échouée", error);
    return errorResponse(500, "La construction de la ligne a échoué. Réessaie dans un instant.");
  }
}
