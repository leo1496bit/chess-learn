import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { serverEnv } from "@/lib/env";
import { OPENING_BOOK } from "@/lib/openings/book";
import { createLine } from "@/lib/repertoire/build";
import { MAX_PLY } from "@/lib/repertoire/constants";
import { createSupabaseLineStore } from "@/lib/repertoire/store";

const BodySchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("suggestion"), epd: z.string().min(1).max(100) }),
  z.object({
    source: z.literal("manual"),
    uci: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).max(MAX_PLY),
    playerColor: z.enum(["w", "b"]),
  }),
]);

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Crée une ligne à maîtriser depuis une suggestion ou une suite de coups saisie. */
export async function POST(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour créer une ligne.");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(400, "Corps de requête JSON invalide.");
  }
  const input = BodySchema.safeParse(json);
  if (!input.success) {
    return errorResponse(400, "Paramètres invalides : { source: \"suggestion\", epd } ou { source: \"manual\", uci, playerColor } attendus.");
  }

  try {
    const { supabase } = auth;
    const settings = await getSettings(supabase);
    const store = createSupabaseLineStore(supabase, { token: serverEnv.lichessToken, now: new Date() });
    const result = await createLine(store, input.data, {
      book: OPENING_BOOK,
      depth: settings.engineDepth,
      multipv: settings.engineMultipv,
    });
    if (!result.ok) return errorResponse(result.status, result.error);
    return Response.json({ id: result.id, existing: result.existing }, { status: result.status });
  } catch (error) {
    console.error("[openings/lines] Création de ligne échouée", error);
    return errorResponse(500, "La création de la ligne a échoué. Réessaie dans un instant.");
  }
}
