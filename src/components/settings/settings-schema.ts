// Validation du formulaire Paramètres (partagée entre le formulaire client et l'action serveur).
import { z } from "zod";
import { DEFAULT_ENGINE_SETTINGS, DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/analysis/types";

export const THRESHOLD_KEYS = ["excellent", "good", "inaccuracy", "mistake", "blunder"] as const satisfies readonly (keyof Thresholds)[];

const numberField = (label: string, min: number, max: number, integer = false) => {
  const base = z.coerce.number({ error: `${label} : saisis un nombre.` });
  const checked = integer ? base.int({ error: `${label} : saisis un nombre entier.` }) : base;
  const bounded = checked
    .min(min, { error: `${label} : minimum ${min.toLocaleString("fr-FR")}.` })
    .max(max, { error: `${label} : maximum ${max.toLocaleString("fr-FR")}.` });
  // Champ vide : erreur explicite (z.coerce.number transformerait "" en 0). Virgule décimale acceptée.
  return z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.replace(",", ".")) : v), bounded);
};

export const SettingsFormSchema = z
  .object({
    chesscomUsername: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{3,25}$/, {
        error: "Identifiant Chess.com : 3 à 25 caractères (lettres, chiffres, tiret ou tiret bas).",
      }),
    engineDepth: numberField("Profondeur", 8, 30, true),
    engineMultipv: numberField("Lignes candidates", 1, 5, true),
    excellent: numberField("Seuil « excellent »", 0, 100),
    good: numberField("Seuil « bon »", 0, 100),
    inaccuracy: numberField("Seuil « imprécision »", 0, 100),
    mistake: numberField("Seuil « erreur »", 0, 100),
    blunder: numberField("Seuil « gaffe »", 0, 100),
    aiEnabled: z.boolean(),
    aiDailyCallLimit: numberField("Appels par jour", 0, 1000, true),
    aiMonthlyBudgetUsd: numberField("Budget mensuel", 0, 100),
  })
  .superRefine((value, ctx) => {
    const order: [keyof Thresholds, keyof Thresholds, string][] = [
      ["excellent", "good", "Le seuil « bon » doit être supérieur au seuil « excellent »."],
      ["good", "inaccuracy", "Le seuil « imprécision » doit être au moins égal au seuil « bon »."],
      ["inaccuracy", "mistake", "Le seuil « erreur » doit être supérieur au seuil « imprécision »."],
      ["mistake", "blunder", "Le seuil « gaffe » doit être supérieur au seuil « erreur »."],
    ];
    for (const [lower, upper, message] of order) {
      const invalid = lower === "good" ? value[upper] < value[lower] : value[upper] <= value[lower];
      if (invalid) ctx.addIssue({ code: "custom", path: [upper], message });
    }
  });

export type SettingsFormValues = z.infer<typeof SettingsFormSchema>;
export type SettingsField = keyof SettingsFormValues;

export type SettingsActionState =
  | { status: "idle" }
  | { status: "success"; message: string; savedAt: number }
  | { status: "error"; message: string; fieldErrors: Partial<Record<SettingsField, string>> };

export const DEFAULT_FORM_THRESHOLDS: Thresholds = DEFAULT_THRESHOLDS;
export const DEFAULT_FORM_ENGINE = DEFAULT_ENGINE_SETTINGS;

/** Indication du compromis vitesse/précision pour une profondeur donnée. */
export function depthHint(depth: number): string {
  if (!Number.isFinite(depth)) return "";
  if (depth <= 12) return "Rapide, mais le moteur peut manquer des tactiques de plus de quelques coups.";
  if (depth <= 18) return "Bon compromis : quelques secondes par position, fiable pour repérer les erreurs.";
  if (depth <= 23) return "Précis, mais l'analyse d'une partie prend plusieurs minutes.";
  return "Très lent dans le navigateur : réserve-le aux parties importantes.";
}

export function multipvHint(multipv: number): string {
  if (!Number.isFinite(multipv)) return "";
  if (multipv === 1) return "Le plus rapide, mais sans coups candidats à comparer ni exercices à plusieurs solutions.";
  if (multipv <= 3) return "Recommandé : assez de candidats pour expliquer les erreurs et générer des exercices.";
  return "Plus de candidats, au prix d'une analyse sensiblement plus lente.";
}
