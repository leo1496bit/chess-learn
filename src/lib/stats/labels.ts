import type { Phase, Theme } from "@/lib/analysis/types";

// Libellés français partagés par les statistiques, le tableau de bord et l'entraînement.

export const THEME_LABELS: Record<Theme, string> = {
  tactics: "Tactique",
  hanging_piece: "Pièce en prise",
  missed_tactic: "Tactique manquée",
  king_safety: "Sécurité du roi",
  development: "Développement",
  bad_exchange: "Mauvais échange",
  endgame: "Finale",
  strategy: "Stratégie",
  calculation: "Calcul",
};

export const PHASE_LABELS: Record<Phase, string> = {
  opening: "Ouverture",
  middlegame: "Milieu de partie",
  endgame: "Finale",
};

export const TIME_CLASS_LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapide",
  daily: "Partie par jour",
  classical: "Classique",
};

export function timeClassLabel(timeClass: string | null): string {
  if (!timeClass) return "Cadence inconnue";
  return TIME_CLASS_LABELS[timeClass] ?? timeClass;
}

export const COLOR_LABELS = { w: "Blancs", b: "Noirs" } as const;
