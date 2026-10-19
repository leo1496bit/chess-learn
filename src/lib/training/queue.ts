import { MIN_OCCURRENCES, type Measured } from "@/lib/stats/aggregate";
import type { Difficulty } from "./select";
import { isDue } from "./sm2";
import { groupsForThemes, THEME_GROUPS, type ThemeGroup } from "./theme-groups";

// Choix de la prochaine série d'exercices : d'abord les révisions dues, puis les nouveaux
// exercices, en commençant par les axes où le taux de réussite est le plus faible.

export type QueueExercise = {
  id: string;
  themes: string[];
  difficulty: Difficulty;
  dueAt: string;
  attempts: number;
  successes: number;
  createdAt: string;
};

export type GroupTrainingStats = {
  group: ThemeGroup;
  exercises: number;
  due: number;
  attempts: number;
  successes: number;
  successRate: Measured<number>;
};

export function groupTrainingStats(exercises: readonly QueueExercise[], now: Date): GroupTrainingStats[] {
  return THEME_GROUPS.map(({ id }) => {
    const list = exercises.filter((e) => groupsForThemes(e.themes).includes(id));
    const attempts = list.reduce((s, e) => s + e.attempts, 0);
    const successes = list.reduce((s, e) => s + e.successes, 0);
    const successRate: Measured<number> =
      attempts >= MIN_OCCURRENCES
        ? { status: "ok", value: (successes / attempts) * 100, sample: attempts }
        : { status: "insufficient", sample: attempts, required: MIN_OCCURRENCES };
    return {
      group: id,
      exercises: list.length,
      due: list.filter((e) => e.attempts > 0 && isDue(e.dueAt, now)).length,
      attempts,
      successes,
      successRate,
    };
  });
}

/** Taux de réussite utilisé pour prioriser : 50 % par défaut tant qu'il y a trop peu de tentatives. */
const NEUTRAL_RATE = 50;

function weakness(exercise: QueueExercise, rates: Map<ThemeGroup, number>): number {
  const groups = groupsForThemes(exercise.themes);
  if (groups.length === 0) return NEUTRAL_RATE;
  return Math.min(...groups.map((g) => rates.get(g) ?? NEUTRAL_RATE));
}

/** 0 = révision due, 1 = jamais tenté, 2 = pas encore dû (entraînement en avance). */
function bucket(exercise: QueueExercise, now: Date): 0 | 1 | 2 {
  if (exercise.attempts === 0) return 1;
  return isDue(exercise.dueAt, now) ? 0 : 2;
}

export type QueueOptions = {
  group?: ThemeGroup | null;
  difficulty?: Difficulty | null;
  limit?: number;
  now: Date;
};

export function selectNextExercises<T extends QueueExercise>(exercises: readonly T[], options: QueueOptions): T[] {
  const { group = null, difficulty = null, limit = 10, now } = options;
  const rates = new Map<ThemeGroup, number>();
  for (const s of groupTrainingStats(exercises, now)) {
    if (s.successRate.status === "ok") rates.set(s.group, s.successRate.value);
  }
  return exercises
    .filter((e) => (group === null || groupsForThemes(e.themes).includes(group)) && (difficulty === null || e.difficulty === difficulty))
    .map((e) => ({ e, bucket: bucket(e, now), weakness: weakness(e, rates) }))
    .sort(
      (a, b) =>
        a.bucket - b.bucket ||
        a.weakness - b.weakness ||
        a.e.dueAt.localeCompare(b.e.dueAt) ||
        a.e.createdAt.localeCompare(b.e.createdAt) ||
        a.e.id.localeCompare(b.e.id),
    )
    .slice(0, limit)
    .map((x) => x.e);
}

/** Exercices déjà tentés dont la révision est due aujourd'hui. */
export function dueExercises<T extends QueueExercise>(exercises: readonly T[], now: Date): T[] {
  return exercises.filter((e) => e.attempts > 0 && isDue(e.dueAt, now));
}
