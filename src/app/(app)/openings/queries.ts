import "server-only";
import type { SupabaseServerClient } from "@/lib/db/server";
import { OPENING_BOOK } from "@/lib/openings/book";
import { SUGGESTION_MIN_GAMES } from "@/lib/repertoire/constants";
import { sortLines, type LibraryLine } from "@/lib/repertoire/library";
import { selectSuggestions, toPositionStat, type Suggestion } from "@/lib/repertoire/suggestions";

const SUGGESTION_MAX_PLY = 16;
const SUGGESTION_COUNT = 15;

export type OpeningsData = {
  lines: LibraryLine[];
  suggestions: Suggestion[];
  totalGames: number;
  remaining: number;
};

function fail(what: string, message: string): never {
  throw new Error(`Lecture des ${what} impossible : ${message}`);
}

async function countGames(supabase: SupabaseServerClient, unindexedOnly: boolean): Promise<number> {
  let query = supabase.from("games").select("id", { count: "exact", head: true });
  if (unindexedOnly) query = query.eq("positions_indexed", false);
  const { count, error } = await query;
  if (error) fail("parties", error.message);
  return count ?? 0;
}

export async function loadOpenings(supabase: SupabaseServerClient, now: Date): Promise<OpeningsData> {
  const [linesRes, dueRes, statsRes, totalGames, remaining] = await Promise.all([
    supabase
      .from("opening_lines")
      .select("id, name, eco, player_color, kind, status, games, wins, draws, losses, root_epd"),
    // Branches à revoir : déjà étudiées (comme le lien vers /training), non archivées, échéance passée.
    supabase
      .from("opening_branches")
      .select("line_id")
      .eq("archived", false)
      .not("studied_at", "is", null)
      .lte("due_at", now.toISOString()),
    supabase.rpc("opening_position_stats", { p_min_games: SUGGESTION_MIN_GAMES, p_max_ply: SUGGESTION_MAX_PLY }),
    countGames(supabase, false),
    countGames(supabase, true),
  ]);
  if (linesRes.error) fail("lignes", linesRes.error.message);
  if (dueRes.error) fail("branches", dueRes.error.message);
  if (statsRes.error) fail("suggestions", statsRes.error.message);

  const dueByLine = new Map<string, number>();
  for (const { line_id } of dueRes.data) dueByLine.set(line_id, (dueByLine.get(line_id) ?? 0) + 1);

  const lines = sortLines(
    linesRes.data.map(
      (l): LibraryLine => ({
        id: l.id,
        name: l.name,
        eco: l.eco,
        playerColor: l.player_color === "b" ? "b" : "w",
        kind: l.kind,
        status: l.status,
        games: l.games,
        wins: l.wins,
        draws: l.draws,
        losses: l.losses,
        dueCount: dueByLine.get(l.id) ?? 0,
      }),
    ),
  );
  const existingRoots = new Set(linesRes.data.map((l) => l.root_epd));
  const suggestions = selectSuggestions(
    statsRes.data.map((row) => toPositionStat({ ...row, player_color: row.player_color === "b" ? "b" : "w" })),
    OPENING_BOOK,
    existingRoots,
  ).slice(0, SUGGESTION_COUNT);

  return { lines, suggestions, totalGames, remaining };
}
