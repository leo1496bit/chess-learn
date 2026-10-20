// Indexation des coups d'ouverture des parties (serveur : session utilisateur + RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { openingPositions } from "./positions";

export type IndexSupabase = SupabaseClient<Database>;

const INSERT_CHUNK = 500;
/** Identifiants par requête `in` : au-delà, l'URL PostgREST risque de dépasser la limite (~8 Ko). */
const MARK_CHUNK = 100;

/**
 * Enregistre les positions d'ouverture des parties puis les marque `positions_indexed`. Une partie au
 * PGN invalide n'a aucune position et une partie courte n'a que les siennes : toutes deux sont marquées
 * indexées, le rattrapage ne boucle jamais dessus. Si l'écriture des positions échoue, rien n'est marqué.
 * `user_id` est rempli par la base (auth.uid()).
 */
export async function indexGames(supabase: IndexSupabase, games: { id: string; pgn: string }[]): Promise<number> {
  if (games.length === 0) return 0;
  const rows = games.flatMap((game) =>
    openingPositions(game.pgn).map((p) => ({
      game_id: game.id,
      ply: p.ply,
      epd: p.epd,
      side_to_move: p.sideToMove,
      path_uci: p.pathUci,
      move_uci: p.moveUci,
      move_san: p.moveSan,
    })),
  );
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await supabase
      .from("game_positions")
      .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: "game_id,ply", ignoreDuplicates: true });
    if (error) throw new Error(`Enregistrement des positions impossible : ${error.message}`);
  }
  const ids = games.map((g) => g.id);
  for (let i = 0; i < ids.length; i += MARK_CHUNK) {
    const { error } = await supabase
      .from("games")
      .update({ positions_indexed: true })
      .in("id", ids.slice(i, i + MARK_CHUNK));
    if (error) throw new Error(`Marquage des parties indexées impossible : ${error.message}`);
  }
  return games.length;
}
