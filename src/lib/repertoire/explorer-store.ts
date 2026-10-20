import type { SupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/database.types";
import { EXPLORER_PARAMS, ExplorerError, fetchExplorer, isExplorerResult, type ExplorerResult } from "@/lib/lichess/explorer";
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
 * "unauthorized" : jeton refusé (401). "unavailable" : pas de jeton ou service indisponible
 * (5xx, réseau, délai).
 */
export async function getExplorer(
  supabase: SupabaseServerClient,
  epd: string,
  opts: ExplorerOpts,
): Promise<ExplorerResult | "missing" | "unavailable" | "unauthorized"> {
  const { data: row, error: readError } = await supabase
    .from("explorer_cache")
    .select("data, fetched_at")
    .eq("epd", epd)
    .eq("params", EXPLORER_PARAMS)
    .maybeSingle();
  if (readError) console.warn("explorer_cache lecture :", readError.message);
  if (row && isExplorerResult(row.data)) {
    const ageDays = (opts.now.getTime() - new Date(row.fetched_at).getTime()) / 86_400_000;
    if (ageDays < EXPLORER_TTL_DAYS) return row.data;
  }

  if (!opts.token) return "unavailable";
  if (opts.budget.left <= 0) return "missing";
  opts.budget.left -= 1;

  let result: ExplorerResult;
  try {
    result = await fetchExplorer(epd, opts.token, opts.fetchImpl);
  } catch (e) {
    if (e instanceof ExplorerError && e.code === "rate_limited") return "missing";
    if (e instanceof ExplorerError && e.code === "unauthorized") return "unauthorized";
    return "unavailable";
  }

  const { error: writeError } = await supabase.from("explorer_cache").upsert({
    epd,
    params: EXPLORER_PARAMS,
    data: result as unknown as Json,
    fetched_at: opts.now.toISOString(),
  });
  if (writeError) console.warn("explorer_cache écriture :", writeError.message);
  return result;
}
