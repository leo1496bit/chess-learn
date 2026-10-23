import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseServerClient } from "./server";
import { DEFAULT_ENGINE_SETTINGS, DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/analysis/types";

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

/** Vrai si l'utilisateur a déjà choisi son identifiant Chess.com (première connexion terminée). */
export async function hasSettings(supabase: SupabaseServerClient): Promise<boolean> {
  const { data, error } = await supabase.from("settings").select("user_id").maybeSingle();
  if (error) throw new Error(`Lecture des paramètres impossible : ${error.message}`);
  return data !== null;
}

/** Crée les paramètres (valeurs par défaut) avec l'identifiant choisi à la première connexion. */
export async function createSettings(supabase: SupabaseServerClient, chesscomUsername: string): Promise<void> {
  // Double envoi du formulaire : la première ligne créée est gardée.
  const { error } = await supabase
    .from("settings")
    .upsert({ chesscom_username: chesscomUsername }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error(`Création des paramètres impossible : ${error.message}`);
}

/** Paramètres de l'utilisateur ; sans paramètres, renvoie vers la première connexion (/welcome). */
export async function getSettings(supabase: SupabaseServerClient): Promise<AppSettings> {
  const { data: row, error } = await supabase.from("settings").select("*").maybeSingle();
  if (error) throw new Error(`Lecture des paramètres impossible : ${error.message}`);
  if (!row) redirect("/welcome");

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
