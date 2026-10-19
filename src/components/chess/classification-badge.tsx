import { cn } from "@/lib/utils";
import type { Classification } from "@/lib/analysis/types";

// Symboles d'annotation échiquéenne : le langage visuel des erreurs dans toute l'application.
export const CLASSIFICATION_META: Record<
  Classification,
  { label: string; symbol: string; className: string }
> = {
  best: { label: "Meilleur coup", symbol: "!", className: "text-cls-best bg-cls-best/10 ring-cls-best/30" },
  excellent: { label: "Excellent", symbol: "✓", className: "text-cls-excellent bg-cls-excellent/10 ring-cls-excellent/30" },
  good: { label: "Bon", symbol: "·", className: "text-cls-good bg-cls-good/10 ring-cls-good/30" },
  forced: { label: "Coup forcé", symbol: "□", className: "text-cls-forced bg-cls-forced/10 ring-cls-forced/30" },
  inaccuracy: { label: "Imprécision", symbol: "?!", className: "text-cls-inaccuracy bg-cls-inaccuracy/10 ring-cls-inaccuracy/30" },
  mistake: { label: "Erreur", symbol: "?", className: "text-cls-mistake bg-cls-mistake/10 ring-cls-mistake/30" },
  blunder: { label: "Gaffe", symbol: "??", className: "text-cls-blunder bg-cls-blunder/10 ring-cls-blunder/30" },
};

export const MISSED_WIN_META = {
  label: "Gain manqué",
  symbol: "⊘",
  className: "text-cls-missed bg-cls-missed/10 ring-cls-missed/30",
};

/** Symbole compact (liste des coups) ou pastille avec libellé. */
export function ClassificationBadge({
  classification,
  withLabel = false,
  className,
}: {
  classification: Classification;
  withLabel?: boolean;
  className?: string;
}) {
  const meta = CLASSIFICATION_META[classification];
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      <span aria-hidden>{meta.symbol}</span>
      {withLabel ? <span className="font-semibold">{meta.label}</span> : <span className="sr-only">{meta.label}</span>}
    </span>
  );
}

export function MissedWinBadge({ withLabel = false }: { withLabel?: boolean }) {
  return (
    <span
      title={MISSED_WIN_META.label}
      className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold ring-1 ring-inset", MISSED_WIN_META.className)}
    >
      <span aria-hidden>{MISSED_WIN_META.symbol}</span>
      {withLabel ? <span className="font-semibold">{MISSED_WIN_META.label}</span> : <span className="sr-only">{MISSED_WIN_META.label}</span>}
    </span>
  );
}
