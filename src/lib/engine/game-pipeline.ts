import { getSupabaseBrowserClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/database.types";
import { buildGameAnalysis, extractPositions } from "@/lib/analysis/game";
import { moveAnalysisToRow } from "@/lib/analysis/rows";
import { terminalAnalysis } from "@/lib/analysis/terminal";
import { ENGINE_VERSION, type Color, type GameAnalysisSummary, type MoveAnalysis, type PositionAnalysis, type Thresholds } from "@/lib/analysis/types";
import { loadCachedAnalyses, storeAnalysis } from "./cache";
import type { StockfishEngine } from "./engine";
import { EngineError, isAbortError } from "./errors";

export type AnalyzeGameProgress = {
  /** Positions prêtes (cache, règles ou moteur) sur `total` (= N+1). */
  done: number;
  total: number;
  fromCache: number;
  stage: "cache" | "engine" | "saving";
};

export type AnalyzeGameOptions = {
  gameId: string;
  pgn: string;
  playerColor: Color;
  depth: number;
  multipv: number;
  thresholds: Thresholds;
  engine: StockfishEngine;
  /** Statut à rétablir si l'analyse est annulée (`none` ou `done`). */
  previousStatus: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: AnalyzeGameProgress) => void;
};

export type AnalyzeGameResult = { moves: MoveAnalysis[]; summary: GameAnalysisSummary };

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/**
 * Analyse complète d'une partie dans le navigateur : N+1 positions via le cache puis le moteur
 * (une recherche par position au plus), classification, puis persistance de move_analyses,
 * game_analyses et des précisions de la partie.
 */
export async function analyzeGame(options: AnalyzeGameOptions): Promise<AnalyzeGameResult> {
  const { gameId, pgn, playerColor, depth, multipv, thresholds, engine, signal, onProgress } = options;
  const supabase = getSupabaseBrowserClient();

  const setStatus = async (status: string) => {
    const { error } = await supabase.from("games").update({ analysis_status: status }).eq("id", gameId);
    if (error) console.warn(`[analysis] Statut ${status} non enregistré : ${error.message}`);
  };

  try {
    const { fens } = extractPositions(pgn);
    const total = fens.length;
    const lastIndex = fens.length - 1;
    // MultiPV complet pour les positions avant un coup ; MultiPV 1 suffit pour la position finale.
    const multipvAt = (i: number) => (i === lastIndex ? 1 : multipv);

    await setStatus("running");
    onProgress?.({ done: 0, total, fromCache: 0, stage: "cache" });

    const results: (PositionAnalysis | undefined)[] = fens.map((fen, i) => terminalAnalysis(fen, depth, multipvAt(i)) ?? undefined);
    const toLookup = (mpv: number) => fens.filter((fen, i) => !results[i] && multipvAt(i) === mpv);
    const cacheMain = await loadCachedAnalyses(toLookup(multipv), { depth, multipv });
    const cacheLast = multipv === 1 ? cacheMain : await loadCachedAnalyses(toLookup(1), { depth, multipv: 1 });
    fens.forEach((fen, i) => {
      results[i] ??= (multipvAt(i) === multipv ? cacheMain : cacheLast).get(fen);
    });

    let done = results.filter(Boolean).length;
    const fromCache = done;
    onProgress?.({ done, total, fromCache, stage: "engine" });

    const writes: Promise<void>[] = [];
    for (let i = 0; i < fens.length; i++) {
      if (results[i]) continue;
      if (signal?.aborted) throw new EngineError("aborted");
      const analysis = await engine.analyze(fens[i], { depth, multipv: multipvAt(i), signal, timeoutMs: options.timeoutMs });
      results[i] = analysis;
      writes.push(storeAnalysis(analysis).catch((error: unknown) => console.warn("[analysis] Cache non enregistré", error)));
      done++;
      onProgress?.({ done, total, fromCache, stage: "engine" });
    }

    onProgress?.({ done, total, fromCache, stage: "saving" });
    const { moves, summary } = buildGameAnalysis(pgn, playerColor, results as PositionAnalysis[], thresholds);
    await Promise.all(writes);

    if (moves.length > 0) {
      const { error } = await supabase
        .from("move_analyses")
        .upsert(moves.map((m) => moveAnalysisToRow(gameId, m)), { onConflict: "game_id,ply" });
      if (error) throw new Error(`Enregistrement des coups impossible : ${error.message}`);
    }
    const cleanup = await supabase.from("move_analyses").delete().eq("game_id", gameId).gt("ply", moves.length);
    if (cleanup.error) throw new Error(`Nettoyage des anciennes analyses impossible : ${cleanup.error.message}`);

    const gameAnalysis = await supabase.from("game_analyses").upsert(
      {
        game_id: gameId,
        depth,
        multipv,
        engine_version: ENGINE_VERSION,
        thresholds: thresholds as unknown as Json,
        summary: summary as unknown as Json,
        created_at: new Date().toISOString(),
      },
      { onConflict: "game_id" },
    );
    if (gameAnalysis.error) throw new Error(`Enregistrement du résumé impossible : ${gameAnalysis.error.message}`);

    const game = await supabase
      .from("games")
      .update({
        analysis_status: "done",
        player_accuracy: round2(summary.player.accuracy),
        opponent_accuracy: round2(summary.opponent.accuracy),
      })
      .eq("id", gameId);
    if (game.error) throw new Error(`Mise à jour de la partie impossible : ${game.error.message}`);

    return { moves, summary };
  } catch (error) {
    await setStatus(isAbortError(error) ? options.previousStatus : "error");
    throw error;
  }
}
