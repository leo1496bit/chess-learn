// Couleurs des graphiques. Les résultats forment une échelle divergente : victoire (bleu encre)
// et défaite (brique) aux pôles, nulle en gris neutre au milieu. Paires validées
// (validate_palette.js de la skill dataviz) en clair sur #ffffff et en sombre sur #182030 :
// séparation CVD ΔE ≥ 17, contraste ≥ 3:1.
export const RESULT_FILL = {
  win: "fill-[#3b5ba5] dark:fill-[#6684cc]",
  draw: "fill-[#a3abb8] dark:fill-[#5d6779]",
  loss: "fill-[#b4533c] dark:fill-[#d06a4f]",
} as const;

export const RESULT_BG = {
  win: "bg-[#3b5ba5] dark:bg-[#6684cc]",
  draw: "bg-[#a3abb8] dark:bg-[#5d6779]",
  loss: "bg-[#b4533c] dark:bg-[#d06a4f]",
} as const;

/** Série unique (précision, taux de réussite) : l'encre de la feuille de notation. */
export const SERIES_STROKE = "stroke-[#3b5ba5] dark:stroke-[#6684cc]";
export const SERIES_FILL = "fill-[#3b5ba5] dark:fill-[#6684cc]";
export const SERIES_BG = "bg-[#3b5ba5] dark:bg-[#6684cc]";
/** Contour « surface » des points : sépare les marqueurs de la ligne. */
export const SURFACE_STROKE = "stroke-card";
export const GRID_STROKE = "stroke-border";
