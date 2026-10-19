import "server-only";
import type { SupabaseServerClient } from "@/lib/db/server";
import { dayAfter, ECO_CODE_RE, likePattern, PAGE_SIZE, type GameFilters } from "./filters";

export const GAME_LIST_COLUMNS =
  "id, end_time, player_color, white, black, white_rating, black_rating, result, result_detail, time_class, time_control, eco, opening_name, analysis_status, player_accuracy, ply_count, chesscom_url" as const;

export async function listGames(supabase: SupabaseServerClient, filters: GameFilters) {
  let query = supabase.from("games").select(GAME_LIST_COLUMNS, { count: "exact" });

  if (filters.from) query = query.gte("end_time", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lt("end_time", dayAfter(filters.to));
  if (filters.color) query = query.eq("player_color", filters.color);
  if (filters.result) query = query.eq("result", filters.result);
  if (filters.tc) query = query.eq("time_class", filters.tc);
  if (filters.q) {
    query = ECO_CODE_RE.test(filters.q)
      ? query.eq("eco", filters.q.toUpperCase())
      : query.ilike("opening_name", likePattern(filters.q));
  }

  const offset = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("end_time", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`Lecture des parties impossible : ${error.message}`);
  return { games: data, total: count ?? 0 };
}

export type GameListItem = Awaited<ReturnType<typeof listGames>>["games"][number];

/** Nombre total de parties importées et date de la dernière synchronisation. */
export async function getLibraryState(supabase: SupabaseServerClient) {
  const [games, archives] = await Promise.all([
    supabase.from("games").select("id", { count: "exact", head: true }),
    supabase.from("chesscom_archives").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1),
  ]);
  if (games.error) throw new Error(`Lecture des parties impossible : ${games.error.message}`);
  return {
    totalGames: games.count ?? 0,
    lastSyncedAt: archives.data?.[0]?.last_synced_at ?? null,
  };
}
