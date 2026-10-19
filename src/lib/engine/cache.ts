import { getSupabaseBrowserClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/database.types";
import { parseEngineLines } from "@/lib/analysis/rows";
import { ENGINE_VERSION, type PositionAnalysis } from "@/lib/analysis/types";

// Cache position_analyses (clé unique user_id, fen, depth, multipv, engine_version).
// Les positions terminales ne sont jamais stockées : chess.js les évalue sans moteur.

export type CacheKey = { depth: number; multipv: number; engineVersion?: string };

const FEN_CHUNK = 40;

/** Lit en lot les analyses déjà en cache. Les lignes invalides sont ignorées (elles seront recalculées). */
export async function loadCachedAnalyses(fens: readonly string[], key: CacheKey): Promise<Map<string, PositionAnalysis>> {
  const engineVersion = key.engineVersion ?? ENGINE_VERSION;
  const supabase = getSupabaseBrowserClient();
  const found = new Map<string, PositionAnalysis>();
  const unique = [...new Set(fens)];

  for (let i = 0; i < unique.length; i += FEN_CHUNK) {
    const chunk = unique.slice(i, i + FEN_CHUNK);
    const { data, error } = await supabase
      .from("position_analyses")
      .select("fen, lines")
      .eq("depth", key.depth)
      .eq("multipv", key.multipv)
      .eq("engine_version", engineVersion)
      .in("fen", chunk);
    if (error) throw new Error(`Lecture du cache d'analyse impossible : ${error.message}. Vérifiez votre connexion puis relancez.`);
    for (const row of data) {
      try {
        const lines = parseEngineLines(row.lines);
        if (lines.length > 0) found.set(row.fen, { fen: row.fen, depth: key.depth, multipv: key.multipv, engineVersion, lines });
      } catch {
        console.warn(`[engine] Cache invalide ignoré pour ${row.fen}`);
      }
    }
  }
  return found;
}

/** Enregistre une analyse moteur (sans effet si elle existe déjà). */
export async function storeAnalysis(analysis: PositionAnalysis): Promise<void> {
  if (analysis.terminal) return;
  const { error } = await getSupabaseBrowserClient()
    .from("position_analyses")
    .upsert(
      {
        fen: analysis.fen,
        depth: analysis.depth,
        multipv: analysis.multipv,
        engine_version: analysis.engineVersion,
        lines: analysis.lines as unknown as Json,
      },
      { onConflict: "user_id,fen,depth,multipv,engine_version", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Enregistrement du cache d'analyse impossible : ${error.message}`);
}
