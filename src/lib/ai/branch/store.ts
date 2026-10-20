import "server-only";
import type { SupabaseServerClient } from "@/lib/db/server";
import { AI_MODEL } from "../pricing";
import { loadUsageSummary, recordAiUsage } from "../store";
import type { BranchIdeasStore, StoredBranchIdeas } from "./generate";
import { BRANCH_PROMPT_VERSION } from "./prompt";
import { BranchIdeasSchema } from "./schema";

/** Idées en cache d'une branche (version de prompt et modèle courants), ou null. */
export async function loadBranchIdeas(supabase: SupabaseServerClient, branchId: string): Promise<StoredBranchIdeas | null> {
  const { data, error } = await supabase
    .from("opening_branch_explanations")
    .select("content, verified, created_at")
    .eq("branch_id", branchId)
    .eq("prompt_version", BRANCH_PROMPT_VERSION)
    .eq("model", AI_MODEL)
    .maybeSingle();
  if (error) throw new Error(`Lecture des idées de la branche impossible : ${error.message}`);
  if (!data) return null;
  const parsed = BranchIdeasSchema.safeParse(data.content);
  if (!parsed.success) return null;
  return { ideas: parsed.data, verified: data.verified, createdAt: data.created_at };
}

export function createSupabaseBranchIdeasStore(supabase: SupabaseServerClient): BranchIdeasStore {
  return {
    findIdeas: (branchId) => loadBranchIdeas(supabase, branchId),
    usageSummary: (now) => loadUsageSummary(supabase, now),
    async saveIdeas(branchId, ideas, verified) {
      const { data, error } = await supabase
        .from("opening_branch_explanations")
        .upsert(
          {
            branch_id: branchId,
            prompt_version: BRANCH_PROMPT_VERSION,
            model: AI_MODEL,
            content: ideas,
            verified,
            created_at: new Date().toISOString(),
          },
          { onConflict: "branch_id,prompt_version,model" },
        )
        .select("created_at")
        .single();
      if (error) throw new Error(`Enregistrement des idées de la branche impossible : ${error.message}`);
      return { ideas, verified, createdAt: data.created_at };
    },
    recordUsage: (record) => recordAiUsage(supabase, "branch", record),
  };
}
