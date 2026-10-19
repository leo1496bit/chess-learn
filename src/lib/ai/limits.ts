// Limites d'utilisation de l'IA (skill chess-analysis §8). Module pur : les lignes ai_usage sont
// lues par store.ts, les calculs se font ici.

/** Fuseau utilisé pour « aujourd'hui » et « ce mois-ci ». */
export const USAGE_TIME_ZONE = "Europe/Paris";

export type UsageRow = {
  created_at: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
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

/** Agrège les lignes ai_usage du mois (toutes les lignes comptent : chaque ligne est un appel). */
export function summarizeUsage(rows: UsageRow[], now: Date, timeZone = USAGE_TIME_ZONE): UsageSummary {
  const dayStart = startOfPeriod(now, "day", timeZone).getTime();
  const monthStart = startOfPeriod(now, "month", timeZone).getTime();
  const summary: UsageSummary = {
    callsToday: 0,
    callsMonth: 0,
    costToday: 0,
    costMonth: 0,
    inputTokensMonth: 0,
    outputTokensMonth: 0,
    cacheReadTokensMonth: 0,
  };
  for (const row of rows) {
    const at = new Date(row.created_at).getTime();
    if (Number.isNaN(at) || at < monthStart || at > now.getTime()) continue;
    const cost = Number(row.cost_usd) || 0;
    summary.callsMonth += 1;
    summary.costMonth += cost;
    summary.inputTokensMonth += row.input_tokens + row.cache_write_tokens;
    summary.outputTokensMonth += row.output_tokens;
    summary.cacheReadTokensMonth += row.cache_read_tokens;
    if (at >= dayStart) {
      summary.callsToday += 1;
      summary.costToday += cost;
    }
  }
  summary.costMonth = Math.round(summary.costMonth * 1e6) / 1e6;
  summary.costToday = Math.round(summary.costToday * 1e6) / 1e6;
  return summary;
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
