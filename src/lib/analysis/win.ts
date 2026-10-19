import type { Color, Evaluation } from "./types";

const CP_CLAMP = 1000;

/**
 * Pourcentage de gain (formule Lichess), point de vue Blancs.
 * `mate === 0` (position matée) : le camp au trait est maté. Passer `sideToMove`
 * pour lever l'ambiguïté ; sans lui, la valeur neutre 50 est renvoyée.
 */
export function winPercent(evaluation: Evaluation, sideToMove?: Color): number {
  if (evaluation.mate !== null) {
    if (evaluation.mate > 0) return 100;
    if (evaluation.mate < 0) return 0;
    if (sideToMove === undefined) return 50;
    return sideToMove === "w" ? 0 : 100;
  }
  const cp = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, evaluation.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * % de gain du point de vue de `color`.
 * `mate === 0` : on considère que `color` vient de mater (c'est le seul cas où l'on
 * évalue une position matée du point de vue d'un camp : juste après son coup).
 */
export function moverWinPercent(evaluation: Evaluation, color: Color): number {
  if (evaluation.mate === 0) return 100;
  const white = winPercent(evaluation);
  return color === "w" ? white : 100 - white;
}

/** Évaluation vue par `color` : positif = bon pour `color`. */
export function evaluationForColor(evaluation: Evaluation, color: Color): Evaluation {
  if (color === "w") return evaluation;
  return {
    cp: evaluation.cp === null ? null : -evaluation.cp,
    mate: evaluation.mate === null ? null : -evaluation.mate,
  };
}

/** `true` si l'évaluation (point de vue Blancs) donne un mat forcé pour `color`. */
export function isMateFor(evaluation: Evaluation, color: Color): boolean {
  if (evaluation.mate === null || evaluation.mate === 0) return false;
  return color === "w" ? evaluation.mate > 0 : evaluation.mate < 0;
}

/**
 * Affichage point de vue Blancs : "+1.35", "-0.40", "0.00", "#3", "#-2".
 * Position matée (`mate === 0`) : "1-0" / "0-1" si `sideToMove` est connu, sinon "#".
 */
export function formatEvaluation(evaluation: Evaluation, sideToMove?: Color): string {
  if (evaluation.mate !== null) {
    if (evaluation.mate === 0) {
      if (sideToMove === undefined) return "#";
      return sideToMove === "w" ? "0-1" : "1-0";
    }
    return evaluation.mate > 0 ? `#${evaluation.mate}` : `#-${Math.abs(evaluation.mate)}`;
  }
  const pawns = (evaluation.cp ?? 0) / 100;
  if (Math.abs(pawns) < 0.005) return "0.00";
  return `${pawns > 0 ? "+" : "-"}${Math.abs(pawns).toFixed(2)}`;
}
