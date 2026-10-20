import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { rebuildLine } from "@/lib/repertoire/build";
import { createSupabaseLineStore } from "@/lib/repertoire/store";

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * « Mettre à jour la ligne » : repasse en construction avec la profondeur et le MultiPV actuels.
 * Les branches existantes restent intactes jusqu'à la fin de la construction, qui les fusionne.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour mettre à jour une ligne.");

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse(400, "Identifiant de ligne invalide.");

  try {
    const { supabase } = auth;
    const settings = await getSettings(supabase);
    const store = createSupabaseLineStore(supabase, { now: new Date() });
    const found = await rebuildLine(store, id.data, { depth: settings.engineDepth, multipv: settings.engineMultipv });
    if (!found) return errorResponse(404, "Ligne introuvable.");
    return Response.json({ status: "building" });
  } catch (error) {
    console.error("[openings/lines/rebuild] Mise à jour échouée", error);
    return errorResponse(500, "La mise à jour de la ligne a échoué. Réessaie dans un instant.");
  }
}
