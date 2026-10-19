import { Chess } from "chess.js";
import { STRATEGIC_THEMES, TACTICAL_THEMES, type Phase, type Theme } from "./types";

export const THEME_LABELS: Record<Theme, string> = {
  tactics: "Tactique",
  hanging_piece: "Pièce en prise",
  missed_tactic: "Tactique manquée",
  king_safety: "Sécurité du roi",
  development: "Développement",
  bad_exchange: "Échange défavorable",
  endgame: "Finale",
  strategy: "Stratégie",
  calculation: "Calcul",
};

export const PHASE_LABELS: Record<Phase, string> = {
  opening: "Ouverture",
  middlegame: "Milieu de partie",
  endgame: "Finale",
};

export function themeKind(theme: Theme): "tactical" | "strategic" | "other" {
  if (TACTICAL_THEMES.includes(theme)) return "tactical";
  if (STRATEGIC_THEMES.includes(theme)) return "strategic";
  return "other";
}

/** Numéro de coup affiché pour un demi-coup : "12." (Blancs) ou "12..." (Noirs). */
export function moveNumberLabel(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "..."}`;
}

/** Variante SAN numérotée à partir de la position `fen` : "3... g6 4. Qf3 Nf6". */
export function formatSanLine(fen: string, san: readonly string[]): string {
  if (san.length === 0) return "";
  const chess = new Chess(fen);
  let number = Number(fen.split(" ")[5] ?? "1");
  let white = chess.turn() === "w";
  const parts: string[] = [];
  san.forEach((move, i) => {
    if (white) parts.push(`${number}. ${move}`);
    else parts.push(i === 0 ? `${number}... ${move}` : move);
    if (!white) number++;
    white = !white;
  });
  return parts.join(" ");
}
