import "server-only";
import type { SupabaseServerClient } from "@/lib/db/server";
import type { Classification, Color, Phase, Theme } from "@/lib/analysis/types";
import type { GameResult, StatsAttempt, StatsGame, StatsMove } from "./aggregate";

// Requêtes Supabase côté serveur (session utilisateur, RLS). Les agrégats sont calculés en
// TypeScript par ./aggregate.ts à partir des lignes réellement importées.

const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** PostgREST plafonne les réponses : on pagine jusqu'à épuisement. */
export async function fetchAllPages<T>(label: string, page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Lecture ${label} impossible : ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export type RecentGame = {
  id: string;
  white: string;
  black: string;
  whiteRating: number | null;
  blackRating: number | null;
  playerColor: Color;
  result: GameResult;
  timeClass: string | null;
  openingName: string | null;
  endTime: string;
  analysisStatus: string;
  playerAccuracy: number | null;
};

const GAME_COLUMNS =
  "id, white, black, white_rating, black_rating, player_color, result, time_class, eco, opening_name, end_time, analysis_status, player_accuracy";

type GameRow = {
  id: string;
  white: string;
  black: string;
  white_rating: number | null;
  black_rating: number | null;
  player_color: string;
  result: string;
  time_class: string | null;
  eco: string | null;
  opening_name: string | null;
  end_time: string;
  analysis_status: string;
  player_accuracy: number | null;
};

function toStatsGame(row: GameRow): StatsGame {
  return {
    id: row.id,
    playerColor: row.player_color === "b" ? "b" : "w",
    result: row.result === "win" || row.result === "draw" ? row.result : "loss",
    timeClass: row.time_class,
    eco: row.eco,
    openingName: row.opening_name,
    endTime: new Date(row.end_time).toISOString(),
    analyzed: row.analysis_status === "done",
    playerAccuracy: row.player_accuracy === null ? null : Number(row.player_accuracy),
  };
}

function toRecentGame(row: GameRow): RecentGame {
  const g = toStatsGame(row);
  return {
    id: row.id,
    white: row.white,
    black: row.black,
    whiteRating: row.white_rating,
    blackRating: row.black_rating,
    playerColor: g.playerColor,
    result: g.result,
    timeClass: row.time_class,
    openingName: row.opening_name,
    endTime: g.endTime,
    analysisStatus: row.analysis_status,
    playerAccuracy: g.playerAccuracy,
  };
}

/** Toutes les parties d'échecs standard importées (les variantes sont exclues des statistiques). */
export async function loadStatsGames(supabase: SupabaseServerClient): Promise<StatsGame[]> {
  const rows = await fetchAllPages<GameRow>("des parties", (from, to) =>
    supabase.from("games").select(GAME_COLUMNS).eq("rules", "chess").order("end_time", { ascending: false }).order("id").range(from, to),
  );
  return rows.map(toStatsGame);
}

export async function loadRecentGames(supabase: SupabaseServerClient, limit = 6): Promise<RecentGame[]> {
  const { data, error } = await supabase
    .from("games")
    .select(GAME_COLUMNS)
    .order("end_time", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Lecture des dernières parties impossible : ${error.message}`);
  return (data ?? []).map(toRecentGame);
}

/** Coups du joueur classés imprécision, erreur, gaffe ou gain manqué. */
export async function loadErrorMoves(supabase: SupabaseServerClient): Promise<StatsMove[]> {
  const rows = await fetchAllPages("des analyses de coups", (from, to) =>
    supabase
      .from("move_analyses")
      .select("id, game_id, classification, phase, themes, missed_win")
      .eq("is_player_move", true)
      .or("classification.in.(inaccuracy,mistake,blunder),missed_win.is.true")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    gameId: r.game_id,
    classification: r.classification as Classification,
    phase: r.phase as Phase,
    themes: r.themes as Theme[],
    missedWin: r.missed_win,
  }));
}

export async function loadAttempts(supabase: SupabaseServerClient): Promise<StatsAttempt[]> {
  const rows = await fetchAllPages("des tentatives d'exercices", (from, to) =>
    supabase
      .from("exercise_attempts")
      .select("id, exercise_id, correct, created_at, exercises(themes)")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    correct: r.correct,
    createdAt: new Date(r.created_at).toISOString(),
    themes: r.exercises?.themes ?? [],
  }));
}

export type StatsData = {
  games: StatsGame[];
  moves: StatsMove[];
  attempts: StatsAttempt[];
};

/** Jeu de données complet des statistiques ; ne garde que les coups des parties analysées. */
export async function loadStatsData(supabase: SupabaseServerClient): Promise<StatsData> {
  const [games, moves, attempts] = await Promise.all([
    loadStatsGames(supabase),
    loadErrorMoves(supabase),
    loadAttempts(supabase),
  ]);
  const analyzedIds = new Set(games.filter((g) => g.analyzed).map((g) => g.id));
  return { games, moves: moves.filter((m) => analyzedIds.has(m.gameId)), attempts };
}

/** Restreint les coups aux parties retenues par les filtres. */
export function movesForGames(moves: readonly StatsMove[], games: readonly StatsGame[]): StatsMove[] {
  const ids = new Set(games.filter((g) => g.analyzed).map((g) => g.id));
  return moves.filter((m) => ids.has(m.gameId));
}
