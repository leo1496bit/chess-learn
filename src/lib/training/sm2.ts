// Répétition espacée type SM-2 simplifié (skill chess-analysis §9) :
// réussite → intervalle ×2,5 (1 j, 3 j, 7 j, 18 j…), échec → retour à 1 j.

export const FIRST_INTERVALS = [1, 3, 7] as const;
export const EASE_FACTOR = 2.5;
export const MAX_INTERVAL_DAYS = 180;
const DAY_MS = 86_400_000;

export type ReviewState = { intervalDays: number; attempts: number; successes: number };

export type ReviewUpdate = ReviewState & {
  lastResult: "correct" | "incorrect";
  dueAt: string; // ISO
};

/** Intervalle suivant après une réussite. */
export function nextSuccessInterval(current: number): number {
  const ladder = FIRST_INTERVALS.find((step) => step > current);
  if (ladder !== undefined) return ladder;
  return Math.min(MAX_INTERVAL_DAYS, Math.round(current * EASE_FACTOR));
}

export function scheduleReview(state: ReviewState, correct: boolean, now: Date): ReviewUpdate {
  const intervalDays = correct ? nextSuccessInterval(state.intervalDays) : FIRST_INTERVALS[0];
  return {
    intervalDays,
    attempts: state.attempts + 1,
    successes: state.successes + (correct ? 1 : 0),
    lastResult: correct ? "correct" : "incorrect",
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

export function isDue(dueAt: string, now: Date): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}
