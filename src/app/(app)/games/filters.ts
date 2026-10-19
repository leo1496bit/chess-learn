// Filtres de la page « Mes parties », lus depuis les searchParams. Valeur invalide → filtre ignoré.

import { z } from "zod";

export const PAGE_SIZE = 25;
export const TIME_CLASSES = ["bullet", "blitz", "rapid", "daily"] as const;
export type TimeClass = (typeof TIME_CLASSES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

const FIELDS = {
  from: isoDate,
  to: isoDate,
  color: z.enum(["w", "b"]),
  result: z.enum(["win", "loss", "draw"]),
  tc: z.enum(TIME_CLASSES),
  q: z.string().trim().min(1).max(80),
  page: z.coerce.number().int().min(1).max(10_000),
};

export type GameFilters = {
  from?: string;
  to?: string;
  color?: "w" | "b";
  result?: "win" | "loss" | "draw";
  tc?: TimeClass;
  q?: string;
  page: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function field<K extends keyof typeof FIELDS>(raw: RawSearchParams, key: K): z.infer<(typeof FIELDS)[K]> | undefined {
  const value = raw[key];
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === "") return undefined;
  const parsed = FIELDS[key].safeParse(first);
  return parsed.success ? (parsed.data as z.infer<(typeof FIELDS)[K]>) : undefined;
}

export function parseGameFilters(raw: RawSearchParams): GameFilters {
  return {
    from: field(raw, "from"),
    to: field(raw, "to"),
    color: field(raw, "color"),
    result: field(raw, "result"),
    tc: field(raw, "tc"),
    q: field(raw, "q"),
    page: field(raw, "page") ?? 1,
  };
}

export function hasActiveFilters(filters: GameFilters): boolean {
  return Boolean(filters.from || filters.to || filters.color || filters.result || filters.tc || filters.q);
}

/** Query string des filtres (sans valeurs vides), pour les liens de pagination. */
export function filtersToSearch(filters: GameFilters, overrides: Partial<GameFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const key of ["from", "to", "color", "result", "tc", "q"] as const) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  if (merged.page > 1) params.set("page", String(merged.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Motif ILIKE littéral : %, _ et \ sont échappés. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Fin de plage exclusive : lendemain de `to` à minuit UTC. */
export function dayAfter(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export const ECO_CODE_RE = /^[A-E]\d{2}$/i;
