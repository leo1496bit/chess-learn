import { z } from "zod";
import { getAuthorizedUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { AiError, createAnthropicClient } from "@/lib/ai/call";
import type { ApiErrorBody } from "@/lib/ai/schema";
import { buildReportInput } from "@/lib/ai/report/input";
import { generateGameReport, REPORT_TIMEOUT_MS } from "@/lib/ai/report/generate";
import type { GameReportResponse } from "@/lib/ai/report/schema";
import { createSupabaseReportStore, loadGameReport } from "@/lib/ai/report/store";
import { extractPositions } from "@/lib/analysis/game";
import { rowToMoveAnalysis } from "@/lib/analysis/rows";
import type { Color } from "@/lib/analysis/types";
import { OPENING_BOOK } from "@/lib/openings/book";
import { identifyOpening } from "@/lib/openings/identify";

export const maxDuration = 60;

function errorResponse(status: number, error: string, code?: ApiErrorBody["code"]) {
  const body: ApiErrorBody = { error, code };
  return Response.json(body, { status });
}

const UNAUTHORIZED = () => errorResponse(401, "Connecte-toi pour obtenir le bilan de la partie.", "unauthorized");

/** Bilan déjà généré pour une partie (aucun appel IA) ; 404 s'il n'existe pas encore. */
export async function GET(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return UNAUTHORIZED();
  const gameId = z.uuid().safeParse(new URL(request.url).searchParams.get("gameId"));
  if (!gameId.success) return errorResponse(400, "Paramètre gameId manquant ou invalide (UUID attendu).", "invalid");

  try {
    const [stored, analysis] = await Promise.all([
      loadGameReport(auth.supabase, gameId.data),
      auth.supabase.from("game_analyses").select("created_at").eq("game_id", gameId.data).maybeSingle(),
    ]);
    if (!stored) return errorResponse(404, "Aucun bilan pour cette partie.", "not_found");
    const body: GameReportResponse = {
      report: stored.report,
      verified: stored.verified,
      cached: true,
      createdAt: stored.createdAt,
      stale: analysis.data !== null && analysis.data.created_at !== stored.analysisCreatedAt,
    };
    return Response.json(body);
  } catch (error) {
    console.error("[game-report] GET", error);
    return errorResponse(500, "Lecture du bilan impossible. Réessaie dans un instant.");
  }
}

const PostBodySchema = z.object({ gameId: z.uuid(), force: z.boolean().optional() });

/** Génère le bilan d'une partie analysée. Toutes les données sont relues en base côté serveur. */
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
  if (!body.success) return errorResponse(400, "Requête invalide : gameId (UUID) est requis.", "invalid");
  const { gameId, force } = body.data;
  const { supabase } = auth;

  try {
    const [gameRes, movesRes, analysisRes, settings] = await Promise.all([
      supabase
        .from("games")
        .select("white, black, white_rating, black_rating, player_color, result, result_detail, time_class, time_control, pgn")
        .eq("id", gameId)
        .maybeSingle(),
      supabase.from("move_analyses").select("*").eq("game_id", gameId).order("ply"),
      supabase.from("game_analyses").select("created_at").eq("game_id", gameId).maybeSingle(),
      getSettings(supabase),
    ]);
    if (gameRes.error) throw gameRes.error;
    if (movesRes.error) throw movesRes.error;
    if (analysisRes.error) throw analysisRes.error;
    const game = gameRes.data;
    if (!game) return errorResponse(404, "Partie introuvable.", "not_found");
    if (!analysisRes.data || movesRes.data.length === 0) {
      return errorResponse(404, "Cette partie n'a pas encore été analysée. Lance l'analyse Stockfish, puis génère le bilan.", "not_found");
    }

    const playerColor: Color = game.player_color === "b" ? "b" : "w";
    const moves = movesRes.data.map(rowToMoveAnalysis);
    const { fens, moves: gameMoves } = extractPositions(game.pgn);
    const opening = identifyOpening(fens, gameMoves.map((m) => m.san), playerColor, OPENING_BOOK);
    const input = buildReportInput(
      {
        white: game.white,
        black: game.black,
        whiteRating: game.white_rating,
        blackRating: game.black_rating,
        playerColor,
        result: game.result,
        resultDetail: game.result_detail,
        timeClass: game.time_class,
        timeControl: game.time_control,
      },
      moves,
      opening,
      settings.thresholds,
    );

    const result = await generateGameReport({
      gameId,
      input,
      analysisCreatedAt: analysisRes.data.created_at,
      settings,
      store: createSupabaseReportStore(supabase),
      client: createAnthropicClient(REPORT_TIMEOUT_MS),
      force,
    });
    const response: GameReportResponse = {
      report: result.report,
      verified: result.verified,
      cached: result.cached,
      createdAt: result.createdAt,
      stale: false,
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof AiError) return errorResponse(error.status, error.message, error.code);
    console.error("[game-report] POST", error);
    return errorResponse(500, "Erreur interne pendant la génération du bilan. Réessaie dans un instant.");
  }
}
