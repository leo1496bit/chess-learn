import type { Granularity } from "./aggregate";

const pctFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 62,4 → « 62 % » */
export function formatPct(value: number): string {
  return `${pctFormat.format(value)} %`;
}

/** Précision : « 81,3 » */
export function formatAccuracy(value: number): string {
  return decimalFormat.format(value);
}

/** Variation signée : « +2,1 » / « −0,8 » */
export function formatDelta(value: number, digits: 1 | 2 = 1): string {
  const abs = digits === 2 ? twoDecimals.format(Math.abs(value)) : decimalFormat.format(Math.abs(value));
  if (Math.abs(value) < (digits === 2 ? 0.005 : 0.05)) return digits === 2 ? "0,00" : "0,0";
  return `${value > 0 ? "+" : "−"}${abs}`;
}

/** Moyenne par partie : « 0,42 » */
export function formatPerGame(value: number): string {
  return twoDecimals.format(value);
}

export function formatCount(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString("fr-FR")} ${value > 1 ? plural : singular}`;
}

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatPeriod(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  return granularity === "month" ? monthFormat.format(d) : `sem. du ${dayFormat.format(d)}`;
}

export function formatShortPeriod(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  return granularity === "month" ? monthFormat.format(d) : dayFormat.format(d);
}

export function formatDate(iso: string): string {
  return longDate.format(new Date(iso));
}

const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/** « hier », « il y a 3 jours », « il y a 2 mois » */
export function formatRelative(iso: string, now: Date): string {
  const days = Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return relative.format(months, "month");
  return relative.format(Math.round(days / 365), "year");
}
