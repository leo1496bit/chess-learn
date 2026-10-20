import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { ChesscomError, createChesscomClient, DEFAULT_USER_AGENT, isArchiveUrl } from "@/lib/chesscom/client";
import { SyncAccountError, syncChesscomGames } from "@/lib/chesscom/sync";

// Le premier import peut compter des milliers de parties : on s'arrête avant la limite et le
// navigateur relance la synchronisation (les archives déjà traitées ne sont pas retéléchargées).
export const maxDuration = 60;
const WORK_BUDGET_MS = 40_000;
const HARD_TIMEOUT_MS = 55_000;

const BodySchema = z
  .object({
    full: z.boolean().optional(),
    /** Valeur `resumeFrom` renvoyée par l'appel précédent quand `complete` vaut false. */
    resumeFrom: z.string().refine(isArchiveUrl).optional(),
  })
  .strict();

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour synchroniser tes parties.");

  let body: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return errorResponse(400, "Corps de requête JSON invalide.");
    }
  }
  const input = BodySchema.safeParse(body);
  if (!input.success) return errorResponse(400, "Paramètres invalides : attendu { full?: boolean, resumeFrom?: string }.");

  const startedAt = Date.now();
  try {
    const settings = await getSettings(auth.supabase);
    const result = await syncChesscomGames({
      supabase: auth.supabase,
      userId: auth.user.id,
      username: settings.chesscomUsername,
      client: createChesscomClient({
        userAgent: `${DEFAULT_USER_AGENT} player=${settings.chesscomUsername.toLowerCase()}`,
      }),
      full: input.data.full ?? false,
      resumeFrom: input.data.resumeFrom,
      deadline: startedAt + WORK_BUDGET_MS,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(HARD_TIMEOUT_MS)]),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof SyncAccountError) return errorResponse(404, error.message);
    if (error instanceof ChesscomError) return errorResponse(502, error.message);
    console.error("[sync]", error);
    return errorResponse(500, "La synchronisation a échoué. Réessaie dans un instant ; les parties déjà importées sont conservées.");
  }
}
