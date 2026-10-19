import type { Theme } from "@/lib/analysis/types";

// Les six axes de progression demandés par le cahier des charges (§7), construits à partir des
// thèmes déterministes de la skill chess-analysis (§5).

export type ThemeGroup = "tactics" | "strategy" | "endgame" | "calculation" | "development" | "king_safety";

export const THEME_GROUPS: readonly { id: ThemeGroup; label: string; themes: readonly Theme[] }[] = [
  { id: "tactics", label: "Tactique", themes: ["tactics", "hanging_piece", "missed_tactic"] },
  { id: "strategy", label: "Stratégie", themes: ["strategy", "bad_exchange"] },
  { id: "endgame", label: "Finales", themes: ["endgame"] },
  { id: "calculation", label: "Calcul", themes: ["calculation"] },
  { id: "development", label: "Développement", themes: ["development"] },
  { id: "king_safety", label: "Sécurité du roi", themes: ["king_safety"] },
];

export const THEME_GROUP_IDS: readonly ThemeGroup[] = THEME_GROUPS.map((g) => g.id);

export function isThemeGroup(value: string): value is ThemeGroup {
  return (THEME_GROUP_IDS as readonly string[]).includes(value);
}

/** Groupes auxquels appartient un ensemble de thèmes (un exercice peut couvrir plusieurs axes). */
export function groupsForThemes(themes: readonly string[]): ThemeGroup[] {
  return THEME_GROUPS.filter((g) => g.themes.some((t) => themes.includes(t))).map((g) => g.id);
}

export function themeGroupLabel(id: ThemeGroup): string {
  return THEME_GROUPS.find((g) => g.id === id)?.label ?? id;
}
