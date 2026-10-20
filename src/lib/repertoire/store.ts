// Magasin Supabase des lignes d'ouverture (serveur, session de l'utilisateur : la RLS s'applique).
import "server-only";
import { parseEngineLines } from "@/lib/analysis/rows";
import { DEFAULT_ENGINE_SETTINGS, ENGINE_VERSION, type Color, type PositionAnalysis } from "@/lib/analysis/types";
import type { SupabaseServerClient } from "@/lib/db/server";
import type { LinePatch, LineRecord, LineStore } from "./build";
import { getExplorer } from "./explorer-store";

const FEN_CHUNK = 40;
const UNIQUE_VIOLATION = "23505";

/** Lit en lot les analyses Stockfish en cache (`position_analyses`) ; les lignes invalides sont ignorées. */
export async function loadServerAnalyses(
  supabase: SupabaseServerClient,
  fens: readonly string[],
  depth: number,
  multipv: number,
): Promise<Map<string, PositionAnalysis>> {
  const found = new Map<string, PositionAnalysis>();
  const unique = [...new Set(fens)];
  for (let i = 0; i < unique.length; i += FEN_CHUNK) {
    const { data, error } = await supabase
      .from("position_analyses")
      .select("fen, lines")
      .eq("depth", depth)
      .eq("multipv", multipv)
      .eq("engine_version", ENGINE_VERSION)
      .in("fen", unique.slice(i, i + FEN_CHUNK));
    if (error) throw new Error(`Lecture du cache d'analyse impossible : ${error.message}`);
    for (const row of data) {
      try {
        const lines = parseEngineLines(row.lines);
        if (lines.length > 0) found.set(row.fen, { fen: row.fen, depth, multipv, engineVersion: ENGINE_VERSION, lines });
      } catch {
        console.warn(`[openings] Cache d'analyse invalide ignoré pour ${row.fen}`);
      }
    }
  }
  return found;
}

function toPatchRow(patch: LinePatch) {
  return {
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.kind !== undefined && { kind: patch.kind }),
    ...(patch.builtAt !== undefined && { built_at: patch.builtAt }),
    ...(patch.explorerUnavailable !== undefined && { explorer_unavailable: patch.explorerUnavailable }),
    ...(patch.depth !== undefined && { depth: patch.depth }),
    ...(patch.multipv !== undefined && { multipv: patch.multipv }),
  };
}

/** `token` : jeton Lichess (serveur uniquement, jamais renvoyé ni journalisé). */
export function createSupabaseLineStore(
  supabase: SupabaseServerClient,
  opts: { token?: string; now: Date },
): LineStore {
  return {
    async findLineIdByRoot(rootEpd) {
      const { data, error } = await supabase.from("opening_lines").select("id").eq("root_epd", rootEpd).maybeSingle();
      if (error) throw new Error(`Lecture des lignes impossible : ${error.message}`);
      return data?.id ?? null;
    },

    async insertLine(line) {
      const { data, error } = await supabase
        .from("opening_lines")
        .insert({
          name: line.name,
          eco: line.eco,
          root_epd: line.rootEpd,
          root_fen: line.rootFen,
          prefix_uci: line.prefixUci,
          prefix_san: line.prefixSan,
          player_color: line.playerColor,
          depth: line.depth,
          multipv: line.multipv,
          games: line.games,
          wins: line.wins,
          draws: line.draws,
          losses: line.losses,
        })
        .select("id")
        .single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error) throw new Error(`Création de la ligne impossible : ${error.message}`);
      return data.id;
    },

    async rootStats(epd) {
      const { data, error } = await supabase.rpc("opening_root_stats", { p_epd: epd });
      if (error) throw new Error(`Statistiques de la position impossibles : ${error.message}`);
      const row = data?.[0];
      return {
        games: Number(row?.games ?? 0),
        wins: Number(row?.wins ?? 0),
        draws: Number(row?.draws ?? 0),
        losses: Number(row?.losses ?? 0),
        topPath: row?.top_path ?? null,
      };
    },

    async getLine(id) {
      const { data, error } = await supabase
        .from("opening_lines")
        .select("id, name, eco, root_fen, prefix_uci, player_color, status, depth, multipv, explorer_unavailable")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Lecture de la ligne impossible : ${error.message}`);
      if (!data) return null;
      const record: LineRecord = {
        id: data.id,
        name: data.name,
        eco: data.eco,
        rootFen: data.root_fen,
        prefixUci: data.prefix_uci,
        playerColor: data.player_color as Color,
        status: data.status === "ready" ? "ready" : "building",
        depth: data.depth ?? DEFAULT_ENGINE_SETTINGS.depth,
        multipv: data.multipv ?? DEFAULT_ENGINE_SETTINGS.multipv,
        explorerUnavailable: data.explorer_unavailable,
      };
      return record;
    },

    async updateLine(id, patch) {
      const { error } = await supabase.from("opening_lines").update(toPatchRow(patch)).eq("id", id);
      if (error) throw new Error(`Mise à jour de la ligne impossible : ${error.message}`);
    },

    loadAnalyses: (fens, depth, multipv) => loadServerAnalyses(supabase, fens, depth, multipv),

    async replyStats(epd) {
      const { data, error } = await supabase.rpc("opening_reply_stats", { p_epd: epd });
      if (error) throw new Error(`Réponses adverses impossibles : ${error.message}`);
      return (data ?? []).map((r) => ({ uci: r.move_uci, san: r.move_san, games: Number(r.games) }));
    },

    explorer: (epd, budget) => getExplorer(supabase, epd, { token: opts.token, budget, now: opts.now }),

    async listBranches(lineId) {
      const { data, error } = await supabase.from("opening_branches").select("id, path_uci, archived").eq("line_id", lineId);
      if (error) throw new Error(`Lecture des branches impossible : ${error.message}`);
      return data.map((b) => ({ id: b.id, pathUci: b.path_uci, archived: b.archived }));
    },

    async applyMerge(lineId, merge) {
      if (merge.keep.length > 0) {
        const { error } = await supabase
          .from("opening_branches")
          .update({ archived: false })
          .eq("line_id", lineId)
          .in("id", merge.keep);
        if (error) throw new Error(`Mise à jour des branches impossible : ${error.message}`);
      }
      if (merge.archive.length > 0) {
        const { error } = await supabase
          .from("opening_branches")
          .update({ archived: true })
          .eq("line_id", lineId)
          .in("id", merge.archive);
        if (error) throw new Error(`Archivage des branches impossible : ${error.message}`);
      }
      if (merge.insert.length > 0) {
        // Deux étapes concurrentes (deux onglets) peuvent insérer la même branche : on ignore le doublon.
        const { error } = await supabase.from("opening_branches").upsert(
          merge.insert.map((b) => ({
            line_id: lineId,
            path_uci: b.pathUci,
            path_san: b.pathSan,
            end_fen: b.endFen,
            own_games: b.ownGames,
            explorer_games: b.explorerGames,
          })),
          { onConflict: "line_id,path_uci", ignoreDuplicates: true },
        );
        if (error) throw new Error(`Enregistrement des branches impossible : ${error.message}`);
      }
    },
  };
}
