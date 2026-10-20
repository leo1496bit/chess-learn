import "server-only";
import type { SupabaseServerClient } from "@/lib/db/server";
import { combineUsageTotals, startOfPeriod, type UsageTotals, type UsageSummary } from "./limits";
import { AI_MODEL } from "./pricing";
import { PROMPT_VERSION } from "./prompt";
import { ExplanationSchema, type CachedExplanation, type Explanation } from "./schema";

export type UsageStatus = "ok" | "error" | "refused" | "unverified";

export type UsageRecord = {
  status: UsageStatus;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  error: string | null;
};

/** Accès aux données dont l'orchestration a besoin (remplacé par un double dans les tests). */
export interface ExplanationStore {
  findCached(gameId: string, ply: number): Promise<{ explanation: Explanation; verified: boolean } | null>;
  usageSummary(now: Date): Promise<UsageSummary>;
  saveExplanation(gameId: string, ply: number, explanation: Explanation, verified: boolean): Promise<void>;
  recordUsage(record: UsageRecord): Promise<void>;
}

const USAGE_COLUMNS = "created_at, status, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd";

const EMPTY_TOTALS: UsageTotals = {
  calls: 0,
  cost_usd: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
};

async function loadTotals(supabase: SupabaseServerClient, since: Date): Promise<UsageTotals> {
  const { data, error } = await supabase.rpc("ai_usage_summary", { since: since.toISOString() });
  if (error) throw new Error(`Lecture de la consommation IA impossible : ${error.message}`);
  return data[0] ?? EMPTY_TOTALS;
}

/** Consommation du jour et du mois, agrégée en SQL (pas de limite de lignes ; la RLS s'applique). */
export async function loadUsageSummary(supabase: SupabaseServerClient, now: Date): Promise<UsageSummary> {
  const [day, month] = await Promise.all([
    loadTotals(supabase, startOfPeriod(now, "day")),
    loadTotals(supabase, startOfPeriod(now, "month")),
  ]);
  return combineUsageTotals(day, month);
}

export async function loadRecentUsage(supabase: SupabaseServerClient, limit = 20) {
  const { data, error } = await supabase
    .from("ai_usage")
    .select(`id, purpose, model, error, ${USAGE_COLUMNS}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Lecture des derniers appels IA impossible : ${error.message}`);
  return data;
}

/** Explications en cache d'une partie (version de prompt et modèle courants). */
export async function loadGameExplanations(supabase: SupabaseServerClient, gameId: string): Promise<CachedExplanation[]> {
  const { data, error } = await supabase
    .from("explanations")
    .select("ply, content, verified, created_at")
    .eq("game_id", gameId)
    .eq("prompt_version", PROMPT_VERSION)
    .eq("model", AI_MODEL)
    .order("ply");
  if (error) throw new Error(`Lecture des explications impossible : ${error.message}`);
  const result: CachedExplanation[] = [];
  for (const row of data) {
    const parsed = ExplanationSchema.safeParse(row.content);
    if (parsed.success && row.ply !== null) {
      result.push({ ply: row.ply, explanation: parsed.data, verified: row.verified, createdAt: row.created_at });
    }
  }
  return result;
}

export function createSupabaseExplanationStore(supabase: SupabaseServerClient): ExplanationStore {
  const findRow = async (gameId: string, ply: number) => {
    const { data, error } = await supabase
      .from("explanations")
      .select("id, content, verified")
      .eq("game_id", gameId)
      .eq("ply", ply)
      .eq("prompt_version", PROMPT_VERSION)
      .eq("model", AI_MODEL)
      .maybeSingle();
    if (error) throw new Error(`Lecture du cache d'explications impossible : ${error.message}`);
    return data;
  };

  return {
    async findCached(gameId, ply) {
      const row = await findRow(gameId, ply);
      if (!row) return null;
      const parsed = ExplanationSchema.safeParse(row.content);
      return parsed.success ? { explanation: parsed.data, verified: row.verified } : null;
    },

    async usageSummary(now) {
      return loadUsageSummary(supabase, now);
    },

    async saveExplanation(gameId, ply, explanation, verified) {
      // L'index unique est partiel (game_id non nul) : PostgREST ne sait pas l'utiliser en upsert.
      const update = (id: number) =>
        supabase.from("explanations").update({ content: explanation, verified }).eq("id", id);
      const existing = await findRow(gameId, ply);
      let { error } = existing
        ? await update(existing.id)
        : await supabase.from("explanations").insert({
            game_id: gameId,
            ply,
            prompt_version: PROMPT_VERSION,
            model: AI_MODEL,
            content: explanation,
            verified,
          });
      // Requête concurrente pour le même coup : la ligne vient d'être créée, on la met à jour.
      if (error?.code === "23505") {
        const created = await findRow(gameId, ply);
        error = created ? (await update(created.id)).error : error;
      }
      if (error) throw new Error(`Enregistrement de l'explication impossible : ${error.message}`);
    },

    recordUsage: (record) => recordAiUsage(supabase, "move_explanation", record),
  };
}

/** Une ligne ai_usage par appel à l'API (succès, erreur ou refus). */
export async function recordAiUsage(supabase: SupabaseServerClient, purpose: string, record: UsageRecord): Promise<void> {
  const { error } = await supabase.from("ai_usage").insert({
    purpose,
    model: AI_MODEL,
    status: record.status,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    cache_read_tokens: record.cacheReadTokens,
    cache_write_tokens: record.cacheWriteTokens,
    cost_usd: record.costUsd,
    error: record.error,
  });
  if (error) throw new Error(`Enregistrement de la consommation IA impossible : ${error.message}`);
}
