// Moteur Stockfish — navigateur uniquement (Web Worker + WASM).
import { terminalAnalysis } from "@/lib/analysis/terminal";
import type { PositionAnalysis } from "@/lib/analysis/types";
import { loadCachedAnalyses, storeAnalysis } from "./cache";
import { UciEngine, type AnalyzeOptions, type StockfishEngine } from "./engine";
import { workerTransport } from "./worker-transport";

export { UciEngine, DEFAULT_TIMEOUT_MS, type StockfishEngine, type AnalyzeOptions, type UciTransport, type TransportFactory } from "./engine";
export { EngineError, isAbortError, type EngineErrorCode } from "./errors";
export { loadCachedAnalyses, storeAnalysis, type CacheKey } from "./cache";
export { parseInfoLine, parseBestMove, toWhitePerspective, SearchCollector } from "./uci";
export { analyzeGame, type AnalyzeGameOptions, type AnalyzeGameProgress, type AnalyzeGameResult } from "./game-pipeline";

let engine: StockfishEngine | null = null;

/** Singleton : un seul worker Stockfish pour toute l'application. */
export function getEngine(): StockfishEngine {
  if (typeof window === "undefined") throw new Error("Le moteur Stockfish ne fonctionne que dans le navigateur.");
  engine ??= new UciEngine(workerTransport);
  return engine;
}

/**
 * Analyse une position en consultant d'abord le cache `position_analyses`.
 * Une position déjà analysée (mêmes fen, profondeur, MultiPV, version) n'est jamais recalculée.
 */
export async function analyzePositionCached(
  fen: string,
  opts: {
    depth: number;
    multipv: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Attendre l'écriture du cache (et propager son échec) : nécessaire quand le serveur relit l'analyse. */
    awaitStore?: boolean;
  },
): Promise<PositionAnalysis> {
  const terminal = terminalAnalysis(fen, opts.depth, opts.multipv);
  if (terminal) return terminal;

  const key = { depth: opts.depth, multipv: opts.multipv };
  const engineOpts: AnalyzeOptions = { depth: opts.depth, multipv: opts.multipv, timeoutMs: opts.timeoutMs, signal: opts.signal };
  let cached: PositionAnalysis | undefined;
  try {
    cached = (await loadCachedAnalyses([fen], key)).get(fen);
  } catch (error) {
    console.warn("[engine] Cache indisponible, calcul direct", error);
  }
  if (cached) return cached;

  const analysis = await getEngine().analyze(fen, engineOpts);
  if (opts.awaitStore) {
    await storeAnalysis(analysis);
  } else {
    storeAnalysis(analysis).catch((error: unknown) => console.warn("[engine] Écriture du cache impossible", error));
  }
  return analysis;
}
