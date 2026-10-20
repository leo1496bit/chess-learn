// Limites d'utilisation de l'IA (skill chess-analysis §8). Module pur : les totaux ai_usage sont
// agrégés en SQL (fonction ai_usage_summary) par store.ts, les calculs se font ici.

/** Fuseau utilisé pour « aujourd'hui » et « ce mois-ci ». */
export const USAGE_TIME_ZONE = "Europe/Paris";

/** Totaux d'une période renvoyés par la fonction SQL ai_usage_summary. */
export type UsageTotals = {
  calls: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export type UsageSummary = {
  callsToday: number;
  callsMonth: number;
  costToday: number;
  costMonth: number;
  inputTokensMonth: number;
  outputTokensMonth: number;
  cacheReadTokensMonth: number;
};

export type AiLimitSettings = {
  aiEnabled: boolean;
  aiDailyCallLimit: number;
  aiMonthlyBudgetUsd: number;
};

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "daily" | "budget"; message: string };

/** Décalage (ms) du fuseau par rapport à UTC à l'instant donné. */
function timeZoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Début (instant UTC) du jour ou du mois local contenant `now`. */
export function startOfPeriod(now: Date, period: "day" | "month", timeZone = USAGE_TIME_ZONE): Date {
  const local = new Date(now.getTime() + timeZoneOffsetMs(now.getTime(), timeZone));
  const localMidnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    period === "day" ? local.getUTCDate() : 1,
  );
  // Deux passes : le décalage peut changer entre `now` et minuit (heure d'été).
  let start = localMidnight - timeZoneOffsetMs(localMidnight, timeZone);
  start = localMidnight - timeZoneOffsetMs(start, timeZone);
  return new Date(start);
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Résumé jour/mois à partir des totaux SQL (toutes les lignes comptent : chaque ligne est un appel). */
export function combineUsageTotals(day: UsageTotals, month: UsageTotals): UsageSummary {
  return {
    callsToday: Number(day.calls) || 0,
    callsMonth: Number(month.calls) || 0,
    costToday: round6(Number(day.cost_usd) || 0),
    costMonth: round6(Number(month.cost_usd) || 0),
    inputTokensMonth: (Number(month.input_tokens) || 0) + (Number(month.cache_write_tokens) || 0),
    outputTokensMonth: Number(month.output_tokens) || 0,
    cacheReadTokensMonth: Number(month.cache_read_tokens) || 0,
  };
}

/** Peut-on lancer un nouvel appel ? Le budget est atteint dès que le coût du mois l'égale. */
export function checkLimits(settings: AiLimitSettings, usage: Pick<UsageSummary, "callsToday" | "costMonth">): LimitDecision {
  if (!settings.aiEnabled) {
    return {
      allowed: false,
      reason: "disabled",
      message: "Les explications IA sont désactivées. Active-les dans Paramètres pour obtenir une explication.",
    };
  }
  if (usage.callsToday >= settings.aiDailyCallLimit) {
    return {
      allowed: false,
      reason: "daily",
      message: `Limite quotidienne atteinte (${settings.aiDailyCallLimit} appels IA aujourd'hui). Reviens demain ou augmente la limite dans Paramètres.`,
    };
  }
  if (usage.costMonth >= settings.aiMonthlyBudgetUsd) {
    return {
      allowed: false,
      reason: "budget",
      message: `Budget mensuel atteint (${usage.costMonth.toFixed(4)} $ dépensés sur ${settings.aiMonthlyBudgetUsd.toFixed(2)} $). Augmente le budget dans Paramètres ou attends le mois prochain.`,
    };
  }
  return { allowed: true };
}
