"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizedUser } from "@/lib/db/server";
import { createChesscomClient } from "@/lib/chesscom/client";
import { checkChesscomAccount } from "@/lib/chesscom/verify";
import { getSettings } from "@/lib/db/settings";
import { SettingsFormSchema, type SettingsActionState, type SettingsField } from "@/components/settings/settings-schema";

export async function saveSettings(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const auth = await getAuthorizedUser();
  if (!auth) return { status: "error", message: "Ta session a expiré. Reconnecte-toi puis enregistre à nouveau.", fieldErrors: {} };

  const parsed = SettingsFormSchema.safeParse({
    chesscomUsername: formData.get("chesscomUsername") ?? "",
    engineDepth: formData.get("engineDepth"),
    engineMultipv: formData.get("engineMultipv"),
    excellent: formData.get("excellent"),
    good: formData.get("good"),
    inaccuracy: formData.get("inaccuracy"),
    mistake: formData.get("mistake"),
    blunder: formData.get("blunder"),
    aiEnabled: formData.get("aiEnabled") === "on",
    aiDailyCallLimit: formData.get("aiDailyCallLimit"),
    aiMonthlyBudgetUsd: formData.get("aiMonthlyBudgetUsd"),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<SettingsField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SettingsField | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    const count = Object.keys(fieldErrors).length;
    return {
      status: "error",
      message: count > 1 ? `Corrige les ${count} champs signalés, puis enregistre.` : "Corrige le champ signalé, puis enregistre.",
      fieldErrors,
    };
  }

  const values = parsed.data;
  try {
    const current = await getSettings(auth.supabase);
    if (current.chesscomUsername.toLowerCase() !== values.chesscomUsername.toLowerCase()) {
      const account = await checkChesscomAccount(createChesscomClient(), values.chesscomUsername);
      if (account.status !== "ok") {
        return { status: "error", message: "Corrige le champ signalé, puis enregistre.", fieldErrors: { chesscomUsername: account.message } };
      }
    }
    const { error } = await auth.supabase
      .from("settings")
      .update({
        chesscom_username: values.chesscomUsername,
        engine_depth: values.engineDepth,
        engine_multipv: values.engineMultipv,
        thresholds: {
          excellent: values.excellent,
          good: values.good,
          inaccuracy: values.inaccuracy,
          mistake: values.mistake,
          blunder: values.blunder,
        },
        ai_enabled: values.aiEnabled,
        ai_daily_call_limit: values.aiDailyCallLimit,
        ai_monthly_budget_usd: values.aiMonthlyBudgetUsd,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[settings] save", error);
    return { status: "error", message: "Enregistrement impossible : la base de données n'a pas répondu. Réessaie dans un instant.", fieldErrors: {} };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Paramètres enregistrés.", savedAt: Date.now() };
}
