import "server-only";
import { z } from "zod";
import type { SupabaseServerClient } from "./server";
import { DEFAULT_ENGINE_SETTINGS, DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/analysis/types";
import { serverEnv } from "@/lib/env";

export const ThresholdsSchema = z
  .object({
    excellent: z.number().min(0).max(100),
    good: z.number().min(0).max(100),
    inaccuracy: z.number().min(0).max(100),
    mistake: z.number().min(0).max(100),
    blunder: z.number().min(0).max(100),
  })
  .refine((t) => t.excellent <= t.good && t.inaccuracy <= t.mistake && t.mistake <= t.blunder, {
    message: "Les seuils doivent être croissants",
  });

export type AppSettings = {
  chesscomUsername: string;
  engineDepth: number;
  engineMultipv: number;
  thresholds: Thresholds;
  aiDailyCallLimit: number;
  aiMonthlyBudgetUsd: number;
  aiEnabled: boolean;
};

/** Paramètres de l'utilisateur ; crée la ligne par défaut au premier accès. */
export async function getSettings(supabase: SupabaseServerClient): Promise<AppSettings> {
  const { data, error } = await supabase.from("settings").select("*").maybeSingle();
  if (error) throw new Error(`Lecture des paramètres impossible : ${error.message}`);

  let row = data;
  if (!row) {
    // Premier accès : deux rendus parallèles peuvent créer la ligne en même temps, d'où l'upsert.
    const created = await supabase
      .from("settings")
      .upsert({ chesscom_username: serverEnv.chesscomUsername }, { onConflict: "user_id", ignoreDuplicates: true });
    if (created.error) throw new Error(`Création des paramètres impossible : ${created.error.message}`);
    const reread = await supabase.from("settings").select("*").single();
    if (reread.error) throw new Error(`Lecture des paramètres impossible : ${reread.error.message}`);
    row = reread.data;
  }

  const thresholds = ThresholdsSchema.safeParse(row.thresholds);
  return {
    chesscomUsername: row.chesscom_username,
    engineDepth: row.engine_depth ?? DEFAULT_ENGINE_SETTINGS.depth,
    engineMultipv: row.engine_multipv ?? DEFAULT_ENGINE_SETTINGS.multipv,
    thresholds: thresholds.success ? thresholds.data : DEFAULT_THRESHOLDS,
    aiDailyCallLimit: row.ai_daily_call_limit,
    aiMonthlyBudgetUsd: Number(row.ai_monthly_budget_usd),
    aiEnabled: row.ai_enabled,
  };
}
