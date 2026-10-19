import type { StatsGame } from "./aggregate";

export const PERIODS = [
  { id: "30d", label: "30 derniers jours", days: 30 },
  { id: "90d", label: "3 derniers mois", days: 90 },
  { id: "365d", label: "12 derniers mois", days: 365 },
  { id: "all", label: "Toute la période", days: null },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export type StatsFilters = { timeClass: string | null; period: PeriodId };

export const DEFAULT_FILTERS: StatsFilters = { timeClass: null, period: "all" };

/** Lit les filtres depuis les paramètres d'URL (valeurs inconnues ignorées). */
export function parseStatsFilters(params: Record<string, string | string[] | undefined>): StatsFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = first(params.periode);
  const timeClass = first(params.cadence);
  return {
    period: PERIODS.some((p) => p.id === period) ? (period as PeriodId) : DEFAULT_FILTERS.period,
    timeClass: timeClass && /^[a-z]{1,20}$/.test(timeClass) ? timeClass : null,
  };
}

/** Date ISO de début de la période (null = pas de borne). */
export function periodSince(period: PeriodId, now: Date): string | null {
  const days = PERIODS.find((p) => p.id === period)?.days ?? null;
  return days === null ? null : new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function filterGames(games: readonly StatsGame[], filters: StatsFilters, now: Date): StatsGame[] {
  const since = periodSince(filters.period, now);
  return games.filter(
    (g) => (filters.timeClass === null || g.timeClass === filters.timeClass) && (since === null || g.endTime >= since),
  );
}
