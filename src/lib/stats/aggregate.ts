import type { Classification, Color, Phase, Theme } from "@/lib/analysis/types";
import { groupsForThemes, THEME_GROUPS, type ThemeGroup } from "@/lib/training/theme-groups";

// Agrégats statistiques purs (testés). Les seuils « données insuffisantes » suivent la skill
// chess-analysis §10 : on renvoie un état explicite plutôt qu'un chiffre trompeur.

/** Nombre minimal de parties pour tirer une conclusion. */
export const MIN_GAMES = 10;
/** Nombre minimal d'occurrences d'un thème (ou de tentatives d'exercices). */
export const MIN_OCCURRENCES = 5;
/** Nombre minimal de parties pour un sous-groupe (une ouverture) : on affiche les effectifs, pas de taux en dessous. */
export const MIN_GROUP_GAMES = 5;

export type Measured<T> =
  | { status: "ok"; value: T; sample: number }
  | { status: "insufficient"; sample: number; required: number };

function measure<T>(sample: number, required: number, compute: () => T): Measured<T> {
  return sample >= required ? { status: "ok", value: compute(), sample } : { status: "insufficient", sample, required };
}

export type GameResult = "win" | "draw" | "loss";

export type StatsGame = {
  id: string;
  playerColor: Color;
  result: GameResult;
  timeClass: string | null;
  eco: string | null;
  openingName: string | null;
  endTime: string; // ISO
  analyzed: boolean;
  playerAccuracy: number | null;
};

/** Coup du joueur classé imprécision/erreur/gaffe ou gain manqué. */
export type StatsMove = {
  gameId: string;
  classification: Classification;
  phase: Phase;
  themes: Theme[];
  missedWin: boolean;
};

export type StatsAttempt = {
  exerciseId: string;
  correct: boolean;
  createdAt: string; // ISO
  themes: string[];
};

// ---------------------------------------------------------------------------------------------
// Résultats

export type ResultSummary = {
  wins: number;
  draws: number;
  losses: number;
  total: number;
  winRate: number; // 0..100
  drawRate: number;
  lossRate: number;
  score: number; // points marqués en %, nulle = ½
};

export function summarizeResults(games: readonly Pick<StatsGame, "result">[]): ResultSummary {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const g of games) {
    if (g.result === "win") wins++;
    else if (g.result === "draw") draws++;
    else losses++;
  }
  const total = wins + draws + losses;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return {
    wins,
    draws,
    losses,
    total,
    winRate: pct(wins),
    drawRate: pct(draws),
    lossRate: pct(losses),
    score: pct(wins + draws / 2),
  };
}

export function measureResults(games: readonly Pick<StatsGame, "result">[], required = MIN_GAMES): Measured<ResultSummary> {
  return measure(games.length, required, () => summarizeResults(games));
}

export function resultsByColor(games: readonly StatsGame[]): Record<Color, Measured<ResultSummary>> {
  return {
    w: measureResults(games.filter((g) => g.playerColor === "w")),
    b: measureResults(games.filter((g) => g.playerColor === "b")),
  };
}

export function resultsByTimeClass(games: readonly StatsGame[]): { timeClass: string | null; results: Measured<ResultSummary> }[] {
  const groups = new Map<string | null, StatsGame[]>();
  for (const g of games) {
    const list = groups.get(g.timeClass) ?? [];
    list.push(g);
    groups.set(g.timeClass, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([timeClass, list]) => ({ timeClass, results: measureResults(list) }));
}

// ---------------------------------------------------------------------------------------------
// Précision

function analyzedWithAccuracy(games: readonly StatsGame[]): (StatsGame & { playerAccuracy: number })[] {
  return games
    .filter((g): g is StatsGame & { playerAccuracy: number } => g.analyzed && g.playerAccuracy !== null)
    .sort((a, b) => b.endTime.localeCompare(a.endTime));
}

function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function averageAccuracy(games: readonly StatsGame[]): Measured<number> {
  const list = analyzedWithAccuracy(games);
  return measure(list.length, MIN_GAMES, () => mean(list.map((g) => g.playerAccuracy)));
}

export type AccuracyTrend = { recent: number; previous: number; delta: number };

/** Précision moyenne des `window` dernières parties analysées, comparée aux `window` précédentes. */
export function accuracyTrend(games: readonly StatsGame[], window = MIN_GAMES): {
  recent: Measured<number>;
  trend: Measured<AccuracyTrend>;
} {
  const list = analyzedWithAccuracy(games);
  const recentList = list.slice(0, window);
  const previousList = list.slice(window, window * 2);
  const recent = measure(list.length, window, () => mean(recentList.map((g) => g.playerAccuracy)));
  const trend = measure(list.length, window * 2, () => {
    const r = mean(recentList.map((g) => g.playerAccuracy));
    const p = mean(previousList.map((g) => g.playerAccuracy));
    return { recent: r, previous: p, delta: r - p };
  });
  return { recent, trend };
}

// ---------------------------------------------------------------------------------------------
// Évolution dans le temps

export type Granularity = "week" | "month";

export type TimelineBucket = {
  key: string; // AAAA-MM-JJ (début de période, UTC)
  start: string; // ISO
  results: ResultSummary;
  analyzedCount: number;
  /** Moyenne de précision des parties analysées de la période (null si aucune). */
  accuracy: number | null;
};

/** Début de période en UTC (lundi pour les semaines, 1er du mois sinon). */
export function periodStart(iso: string, granularity: Granularity): Date {
  const d = new Date(iso);
  if (granularity === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

function nextPeriod(d: Date, granularity: Granularity): Date {
  return granularity === "month"
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7));
}

const MAX_BUCKETS = 104;

/** Résultats et précision par période, périodes vides comprises (pour un axe du temps continu). */
export function timeline(games: readonly StatsGame[], granularity: Granularity): TimelineBucket[] {
  if (games.length === 0) return [];
  const groups = new Map<string, StatsGame[]>();
  for (const g of games) {
    const key = periodStart(g.endTime, granularity).toISOString().slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  }
  const keys = [...groups.keys()].sort();
  const buckets: TimelineBucket[] = [];
  const last = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
  for (let d = new Date(`${keys[0]}T00:00:00Z`); d <= last; d = nextPeriod(d, granularity)) {
    const key = d.toISOString().slice(0, 10);
    const list = groups.get(key) ?? [];
    const acc = list.filter((g) => g.analyzed && g.playerAccuracy !== null).map((g) => g.playerAccuracy as number);
    buckets.push({
      key,
      start: d.toISOString(),
      results: summarizeResults(list),
      analyzedCount: list.filter((g) => g.analyzed).length,
      accuracy: acc.length > 0 ? mean(acc) : null,
    });
  }
  return buckets.slice(-MAX_BUCKETS);
}

// ---------------------------------------------------------------------------------------------
// Ouvertures

export type OpeningStat = {
  key: string;
  name: string;
  eco: string | null;
  games: number;
  asWhite: number;
  asBlack: number;
  results: ResultSummary;
  /** Taux affichable seulement au-delà de MIN_GROUP_GAMES parties. */
  sufficient: boolean;
};

export const UNKNOWN_OPENING = "Ouverture inconnue";

export function topOpenings(games: readonly StatsGame[], limit = 8): OpeningStat[] {
  const groups = new Map<string, StatsGame[]>();
  for (const g of games) {
    const name = g.openingName?.trim() || (g.eco ? g.eco : UNKNOWN_OPENING);
    const list = groups.get(name) ?? [];
    list.push(g);
    groups.set(name, list);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const ecoCounts = new Map<string, number>();
      for (const g of list) if (g.eco) ecoCounts.set(g.eco, (ecoCounts.get(g.eco) ?? 0) + 1);
      const eco = [...ecoCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        key: name,
        name,
        eco,
        games: list.length,
        asWhite: list.filter((g) => g.playerColor === "w").length,
        asBlack: list.filter((g) => g.playerColor === "b").length,
        results: summarizeResults(list),
        sufficient: list.length >= MIN_GROUP_GAMES,
      };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------------------------
// Erreurs fréquentes

export type ErrorKind = "inaccuracy" | "mistake" | "blunder" | "missedWin";
export const ERROR_KINDS: readonly ErrorKind[] = ["blunder", "mistake", "inaccuracy", "missedWin"];
export const PHASES: readonly Phase[] = ["opening", "middlegame", "endgame"];

export type ErrorMatrix = {
  /** counts[kind][phase] */
  counts: Record<ErrorKind, Record<Phase, number>>;
  totals: Record<ErrorKind, number>;
  /** Moyenne par partie analysée. */
  perGame: Record<ErrorKind, number>;
};

/** Un coup peut être à la fois une erreur et un gain manqué : il est compté dans les deux lignes. */
export function errorMatrix(moves: readonly StatsMove[], analyzedGames: number): Measured<ErrorMatrix> {
  return measure(analyzedGames, MIN_GAMES, () => {
    const empty = (): Record<Phase, number> => ({ opening: 0, middlegame: 0, endgame: 0 });
    const counts: Record<ErrorKind, Record<Phase, number>> = {
      inaccuracy: empty(),
      mistake: empty(),
      blunder: empty(),
      missedWin: empty(),
    };
    for (const m of moves) {
      if (m.classification === "inaccuracy" || m.classification === "mistake" || m.classification === "blunder") {
        counts[m.classification][m.phase]++;
      }
      if (m.missedWin) counts.missedWin[m.phase]++;
    }
    const totals = Object.fromEntries(
      ERROR_KINDS.map((k) => [k, PHASES.reduce((s, p) => s + counts[k][p], 0)]),
    ) as Record<ErrorKind, number>;
    const perGame = Object.fromEntries(ERROR_KINDS.map((k) => [k, totals[k] / analyzedGames])) as Record<ErrorKind, number>;
    return { counts, totals, perGame };
  });
}

// ---------------------------------------------------------------------------------------------
// Faiblesses récurrentes (thèmes)

export type ThemeWeakness = {
  theme: Theme;
  occurrences: number;
  gamesAffected: number;
  /** Occurrences par partie analysée. */
  perGame: number;
  /** Part des parties analysées où le thème apparaît, en %. */
  gameShare: number;
  sufficient: boolean;
};

export function themeWeaknesses(moves: readonly StatsMove[], analyzedGames: number): {
  enoughGames: boolean;
  analyzedGames: number;
  themes: ThemeWeakness[];
} {
  const occurrences = new Map<Theme, number>();
  const games = new Map<Theme, Set<string>>();
  for (const m of moves) {
    for (const t of new Set(m.themes)) {
      occurrences.set(t, (occurrences.get(t) ?? 0) + 1);
      const set = games.get(t) ?? new Set<string>();
      set.add(m.gameId);
      games.set(t, set);
    }
  }
  const enoughGames = analyzedGames >= MIN_GAMES;
  const themes = [...occurrences.entries()]
    .map(([theme, n]) => ({
      theme,
      occurrences: n,
      gamesAffected: games.get(theme)?.size ?? 0,
      perGame: analyzedGames > 0 ? n / analyzedGames : 0,
      gameShare: analyzedGames > 0 ? ((games.get(theme)?.size ?? 0) / analyzedGames) * 100 : 0,
      sufficient: enoughGames && n >= MIN_OCCURRENCES,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.theme.localeCompare(b.theme));
  return { enoughGames, analyzedGames, themes };
}

/** Faiblesse principale : le thème suffisamment observé le plus fréquent, ou null. */
export function mainWeakness(moves: readonly StatsMove[], analyzedGames: number): ThemeWeakness | null {
  return themeWeaknesses(moves, analyzedGames).themes.find((t) => t.sufficient) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Progrès après entraînement

export type GroupProgress = {
  group: ThemeGroup;
  attempts: number;
  successes: number;
  successRate: Measured<number>;
  /** Taux de réussite par période (null si moins de MIN_OCCURRENCES tentatives sur la période). */
  timeline: { key: string; attempts: number; successRate: number | null }[];
};

export function trainingProgress(attempts: readonly StatsAttempt[], granularity: Granularity = "week"): GroupProgress[] {
  return THEME_GROUPS.map(({ id }) => {
    const list = attempts.filter((a) => groupsForThemes(a.themes).includes(id));
    const successes = list.filter((a) => a.correct).length;
    const byPeriod = new Map<string, { attempts: number; successes: number }>();
    for (const a of list) {
      const key = periodStart(a.createdAt, granularity).toISOString().slice(0, 10);
      const entry = byPeriod.get(key) ?? { attempts: 0, successes: 0 };
      entry.attempts++;
      if (a.correct) entry.successes++;
      byPeriod.set(key, entry);
    }
    return {
      group: id,
      attempts: list.length,
      successes,
      successRate: measure(list.length, MIN_OCCURRENCES, () => (successes / list.length) * 100),
      timeline: [...byPeriod.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, v]) => ({
          key,
          attempts: v.attempts,
          successRate: v.attempts >= MIN_OCCURRENCES ? (v.successes / v.attempts) * 100 : null,
        })),
    };
  });
}

export type BeforeAfter = {
  group: ThemeGroup;
  before: { games: number; errors: number; perGame: number };
  after: { games: number; errors: number; perGame: number };
  /** Variation des erreurs par partie (négatif = progrès), si les deux périodes sont suffisantes. */
  change: Measured<number>;
};

/**
 * Erreurs par partie analysée, par axe, avant et après le début de l'entraînement.
 * Il faut MIN_GAMES parties analysées de chaque côté et MIN_OCCURRENCES erreurs au total.
 */
export function errorsBeforeAfterTraining(
  moves: readonly StatsMove[],
  games: readonly StatsGame[],
  trainingStart: string | null,
): { status: "no-training" } | { status: "ok"; trainingStart: string; groups: BeforeAfter[] } {
  if (!trainingStart) return { status: "no-training" };
  const analyzed = games.filter((g) => g.analyzed);
  const afterIds = new Set(analyzed.filter((g) => g.endTime >= trainingStart).map((g) => g.id));
  const beforeIds = new Set(analyzed.filter((g) => g.endTime < trainingStart).map((g) => g.id));
  const groups = THEME_GROUPS.map(({ id }) => {
    let before = 0;
    let after = 0;
    for (const m of moves) {
      if (!groupsForThemes(m.themes).includes(id)) continue;
      if (afterIds.has(m.gameId)) after++;
      else if (beforeIds.has(m.gameId)) before++;
    }
    const b = { games: beforeIds.size, errors: before, perGame: beforeIds.size ? before / beforeIds.size : 0 };
    const a = { games: afterIds.size, errors: after, perGame: afterIds.size ? after / afterIds.size : 0 };
    const enough = b.games >= MIN_GAMES && a.games >= MIN_GAMES && before + after >= MIN_OCCURRENCES;
    const change: Measured<number> = enough
      ? { status: "ok", value: a.perGame - b.perGame, sample: before + after }
      : { status: "insufficient", sample: Math.min(b.games, a.games), required: MIN_GAMES };
    return { group: id, before: b, after: a, change };
  });
  return { status: "ok", trainingStart, groups };
}
