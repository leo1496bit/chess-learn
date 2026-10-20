import "server-only";
import type { SupabaseServerClient } from "@/lib/db/server";
import { AI_MODEL } from "../pricing";
import { loadUsageSummary, recordAiUsage } from "../store";
import type { ReportStore, StoredReport } from "./generate";
import { REPORT_PROMPT_VERSION } from "./prompt";
import { GameReportSchema } from "./schema";

/** Bilan en cache d'une partie (version de prompt et modèle courants), ou null. */
export async function loadGameReport(supabase: SupabaseServerClient, gameId: string): Promise<StoredReport | null> {
  const { data, error } = await supabase
    .from("game_reports")
    .select("content, verified, created_at, analysis_created_at")
    .eq("game_id", gameId)
    .eq("prompt_version", REPORT_PROMPT_VERSION)
    .eq("model", AI_MODEL)
    .maybeSingle();
  if (error) throw new Error(`Lecture du bilan impossible : ${error.message}`);
  if (!data) return null;
  const parsed = GameReportSchema.safeParse(data.content);
  if (!parsed.success) return null;
  return { report: parsed.data, verified: data.verified, createdAt: data.created_at, analysisCreatedAt: data.analysis_created_at };
}

export function createSupabaseReportStore(supabase: SupabaseServerClient): ReportStore {
  return {
    findReport: (gameId) => loadGameReport(supabase, gameId),
    usageSummary: (now) => loadUsageSummary(supabase, now),
    async saveReport(gameId, report, verified, analysisCreatedAt) {
      const { data, error } = await supabase
        .from("game_reports")
        .upsert(
          {
            game_id: gameId,
            prompt_version: REPORT_PROMPT_VERSION,
            model: AI_MODEL,
            content: report,
            verified,
            analysis_created_at: analysisCreatedAt,
            created_at: new Date().toISOString(),
          },
          { onConflict: "game_id,prompt_version,model" },
        )
        .select("created_at")
        .single();
      if (error) throw new Error(`Enregistrement du bilan impossible : ${error.message}`);
      return { report, verified, createdAt: data.created_at, analysisCreatedAt };
    },
    recordUsage: (record) => recordAiUsage(supabase, "game_report", record),
  };
}
