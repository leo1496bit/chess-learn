import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { AiUsage } from "@/components/settings/ai-usage";
import { requireUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { summarizeUsage } from "@/lib/ai/limits";
import { loadMonthUsage, loadRecentUsage } from "@/lib/ai/store";
import { saveSettings } from "./actions";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const now = new Date();
  const [settings, monthRows, recent] = await Promise.all([
    getSettings(supabase),
    loadMonthUsage(supabase, now),
    loadRecentUsage(supabase, 20),
  ]);

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Règle l'analyse Stockfish, la classification des coups et les limites des explications IA."
      />
      <SettingsForm initial={settings} action={saveSettings} />
      <AiUsage
        summary={summarizeUsage(monthRows, now)}
        recent={recent}
        dailyLimit={settings.aiDailyCallLimit}
        monthlyBudget={settings.aiMonthlyBudgetUsd}
      />
    </>
  );
}
