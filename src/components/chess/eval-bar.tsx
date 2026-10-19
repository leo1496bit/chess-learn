import { formatEvaluation, winPercent } from "@/lib/analysis/win";
import type { Color, Evaluation } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

/**
 * Barre d'évaluation basée sur le % de gain des Blancs : verticale à partir de `lg`,
 * horizontale en dessous. `orientation` place le camp du bas (comme l'échiquier).
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
        "h-6 w-full lg:h-full lg:w-7",
        nearIsWhite ? "bg-eval-black" : "bg-eval-white",
        className,
      )}
    >
      <div
        className={cn(
          "absolute transition-[width,height] duration-300 ease-out",
          "inset-y-0 left-0 lg:inset-x-0 lg:top-auto lg:bottom-0",
          "w-(--near) lg:h-(--near) lg:w-full",
          nearIsWhite ? "bg-eval-white" : "bg-eval-black",
        )}
        style={{ "--near": `${near}%` } as React.CSSProperties}
      />
      <span
        className={cn(
          "tabular absolute z-10 top-1/2 -translate-y-1/2 text-[0.65rem] leading-none font-bold lg:left-1/2 lg:-translate-x-1/2 lg:translate-y-0",
          whiteAhead === nearIsWhite ? "left-1.5 lg:top-auto lg:bottom-1.5" : "right-1.5 lg:right-auto lg:top-1.5",
          whiteAhead ? "text-eval-black" : "text-eval-white",
        )}
      >
        {label}
      </span>
    </div>
  );
}
