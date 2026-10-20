// Suggestions de lignes à maîtriser, tirées des parties du joueur. Module pur : le livre est un paramètre.
import type { Color } from "@/lib/analysis/types";
import type { OpeningBook } from "@/lib/openings/identify";

export type PositionStat = {
  epd: string;
  playerColor: Color;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Coups UCI séparés par des espaces menant à la position. */
  topPath: string;
};

export type Suggestion = PositionStat & { name: string; eco: string; lossRate: number };

/** Ligne de la RPC `opening_position_stats`. */
export type PositionStatRow = {
  epd: string;
  player_color: Color;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  top_path: string;
};

export function toPositionStat(row: PositionStatRow): PositionStat {
  return {
    epd: row.epd,
    playerColor: row.player_color,
    games: row.games,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    topPath: row.top_path,
  };
}

const MIN_PATH_PLIES = 3;
const ANCESTOR_SHARE = 0.8;

const moves = (path: string) => path.split(" ").filter(Boolean);

function isStrictPrefix(a: string[], b: string[]): boolean {
  return a.length < b.length && a.every((m, i) => b[i] === m);
}

export function selectSuggestions(
  stats: PositionStat[],
  book: OpeningBook,
  existingRootEpds: Set<string>,
): Suggestion[] {
  const kept: Suggestion[] = [];
  const paths = new Map<Suggestion, string[]>();
  for (const s of stats) {
    const entry = book[s.epd];
    if (!entry || entry[2] !== 1 || !entry[1]) continue;
    const path = moves(s.topPath);
    if (path.length < MIN_PATH_PLIES) continue;
    if (existingRootEpds.has(s.epd)) continue;
    const sug: Suggestion = {
      ...s,
      eco: entry[0],
      name: entry[1],
      lossRate: s.games > 0 ? s.losses / s.games : 0,
    };
    kept.push(sug);
    paths.set(sug, path);
  }
  return kept
    .filter(
      (s) =>
        !kept.some(
          (d) =>
            d.playerColor === s.playerColor &&
            isStrictPrefix(paths.get(s)!, paths.get(d)!) &&
            d.games >= ANCESTOR_SHARE * s.games,
        ),
    )
    .sort((a, b) => b.games - a.games || b.lossRate - a.lossRate);
}
