import type { SupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/database.types";
import { EXPLORER_PARAMS, ExplorerError, fetchExplorer, type ExplorerResult } from "@/lib/lichess/explorer";
import { EXPLORER_TTL_DAYS } from "./constants";

export type ExplorerOpts = {
  token?: string;
  /** Appels restants pour cette étape ; décrémenté à chaque appel à l'API. */
  budget: { left: number };
  now: Date;
  fetchImpl?: typeof fetch;
};

/**
 * Cache `explorer_cache` puis API. "missing" : budget épuisé ou 429 (à retenter à l'étape suivante).
 * "unavailable" : pas de jeton, 401 ou service indisponible.
 */
export async function getExplorer(
  supabase: SupabaseServerClient,
  epd: string,
  opts: ExplorerOpts,
): Promise<ExplorerResult | "missing" | "unavailable"> {
  const { data: row } = await supabase
    .from("explorer_cache")
    .select("data, fetched_at")
    .eq("epd", epd)
    .eq("params", EXPLORER_PARAMS)
    .maybeSingle();
  if (row) {
    const ageDays = (opts.now.getTime() - new Date(row.fetched_at).getTime()) / 86_400_000;
    if (ageDays < EXPLORER_TTL_DAYS) return row.data as unknown as ExplorerResult;
  }

  if (!opts.token) return "unavailable";
  if (opts.budget.left <= 0) return "missing";
  opts.budget.left -= 1;

  let result: ExplorerResult;
  try {
    result = await fetchExplorer(epd, opts.token, opts.fetchImpl);
  } catch (e) {
    if (e instanceof ExplorerError && e.code === "rate_limited") return "missing";
    return "unavailable";
  }

  await supabase.from("explorer_cache").upsert({
    epd,
    params: EXPLORER_PARAMS,
    data: result as unknown as Json,
    fetched_at: opts.now.toISOString(),
  });
  return result;
}
