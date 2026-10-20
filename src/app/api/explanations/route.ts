import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { AiError, createAnthropicClient } from "@/lib/ai/call";
import { explainMove } from "@/lib/ai/explain";
import { rowToMoveAnalysis } from "@/lib/analysis/rows";
import { createSupabaseExplanationStore, loadGameExplanations } from "@/lib/ai/store";
import type { ApiErrorBody } from "@/lib/ai/schema";
import { extractPositions } from "@/lib/analysis/game";
import { OPENING_BOOK } from "@/lib/openings/book";
import { identifyOpening, theoryForPly, type MoveTheory } from "@/lib/openings/identify";
import type { Color } from "@/lib/analysis/types";

/** Place du coup dans la théorie, recalculée depuis le PGN et le livre (jamais fournie par le client). */
function theoryOf(pgn: string, playerColor: Color, ply: number): MoveTheory {
  try {
    const { fens, moves } = extractPositions(pgn);
    return theoryForPly(identifyOpening(fens, moves.map((m) => m.san), playerColor, OPENING_BOOK), ply);
  } catch {
    return { kind: "none" };
  }
}

const PostBodySchema = z.object({
  gameId: z.uuid(),
  ply: z.number().int().min(1),
});

function errorResponse(status: number, error: string, code?: ApiErrorBody["code"]) {
  const body: ApiErrorBody = { error, code };
  return Response.json(body, { status });
}

const UNAUTHORIZED = () => errorResponse(401, "Connecte-toi pour obtenir des explications.", "unauthorized");

/** Explications déjà en cache pour une partie (aucun appel IA). */
export async function GET(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return UNAUTHORIZED();

  const gameId = z.uuid().safeParse(new URL(request.url).searchParams.get("gameId"));
  if (!gameId.success) return errorResponse(400, "Paramètre gameId manquant ou invalide (UUID attendu).", "invalid");

  try {
    const explanations = await loadGameExplanations(auth.supabase, gameId.data);
    return Response.json({ explanations });
  } catch (error) {
    console.error("[explanations] GET", error);
    return errorResponse(500, "Lecture des explications impossible. Réessaie dans un instant.");
  }
}

/** Explique un coup (du joueur ou de l'adversaire) à la demande. Les données échiquéennes sont relues en base. */
export async function POST(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return UNAUTHORIZED();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(400, "Corps de requête JSON invalide.", "invalid");
  }
  const body = PostBodySchema.safeParse(json);
  if (!body.success) {
    return errorResponse(400, "Requête invalide : gameId (UUID) et ply (entier ≥ 1) sont requis.", "invalid");
  }
  const { gameId, ply } = body.data;
  const { supabase } = auth;

  try {
    const [gameResult, moveResult] = await Promise.all([
      supabase.from("games").select("white, black, player_color, opening_name, eco, pgn").eq("id", gameId).maybeSingle(),
      supabase.from("move_analyses").select("*").eq("game_id", gameId).eq("ply", ply).maybeSingle(),
    ]);
    if (gameResult.error) throw new Error(gameResult.error.message);
    if (moveResult.error) throw new Error(moveResult.error.message);
    if (!gameResult.data) return errorResponse(404, "Partie introuvable.", "not_found");
    if (!moveResult.data) {
      return errorResponse(404, "Ce coup n'a pas encore été analysé. Lance l'analyse de la partie, puis réessaie.", "not_found");
    }

    const move = rowToMoveAnalysis(moveResult.data);
    const game = gameResult.data;
    const playerColor: Color = game.player_color === "b" ? "b" : "w";
    const settings = await getSettings(supabase);
    const result = await explainMove({
      gameId,
      move,
      game: {
        white: game.white,
        black: game.black,
        playerColor,
        openingName: game.opening_name,
        eco: game.eco,
        theory: theoryOf(game.pgn, playerColor, ply),
      },
      settings,
      store: createSupabaseExplanationStore(supabase),
      client: createAnthropicClient(),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiError) return errorResponse(error.status, error.message, error.code);
    console.error("[explanations] POST", error);
    return errorResponse(500, "Erreur interne pendant la génération de l'explication. Réessaie dans un instant.");
  }
}
