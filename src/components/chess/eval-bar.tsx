import { formatEvaluation, winPercent } from "@/lib/analysis/win";
import type { Color, Evaluation } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

/**
 * Barre d'évaluation basée sur le % de gain des Blancs, verticale à côté de l'échiquier.
 * Sous `lg` elle est fine et sans libellé (la valeur est affichée à part, pour gagner de la
 * hauteur sur mobile). `orientation` place le camp du bas (comme l'échiquier).
 */
export function EvalBar({
  evaluation,
  orientation = "white",
  sideToMove,
  className,
}: {
  evaluation: Evaluation | null;
  orientation?: "white" | "black";
  sideToMove?: Color;
  className?: string;
}) {
  const white = evaluation ? winPercent(evaluation, sideToMove) : 50;
  const label = evaluation ? formatEvaluation(evaluation, sideToMove) : "—";
  const whiteAhead = white >= 50;
  // Part de la barre occupée par le camp affiché en bas (vertical) ou à gauche (horizontal).
  const near = orientation === "white" ? white : 100 - white;
  const nearIsWhite = orientation === "white";

  return (
    <div
      role="meter"
      aria-label="Évaluation de la position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={evaluation ? `${label}, ${Math.round(white)} % de gain pour les Blancs` : "Pas d'évaluation"}
      className={cn(
        "relative overflow-hidden rounded-sm ring-1 ring-border",
        "h-auto w-2.5 shrink-0 self-stretch lg:w-7",
        nearIsWhite ? "bg-eval-black" : "bg-eval-white",
        className,
      )}
    >
      <div
        className={cn(
          "absolute transition-[width,height] duration-300 ease-out",
          "inset-x-0 bottom-0",
          "h-(--near) w-full",
          nearIsWhite ? "bg-eval-white" : "bg-eval-black",
        )}
        style={{ "--near": `${near}%` } as React.CSSProperties}
      />
      <span
        className={cn(
          "tabular absolute z-10 left-1/2 -translate-x-1/2 text-[0.65rem] leading-none font-bold max-lg:hidden",
          whiteAhead === nearIsWhite ? "bottom-1.5" : "top-1.5",
          whiteAhead ? "text-eval-black" : "text-eval-white",
        )}
      >
        {label}
      </span>
    </div>
  );
}
