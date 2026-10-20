import type { ReactNode } from "react";

/**
 * Échiquier épinglé (même principe que l'analyse de partie) :
 * - grand écran : colonne de l'échiquier collante, à une taille qui tient dans la hauteur de l'écran ;
 * - mobile : l'échiquier (≈ 34 % de la hauteur) et sa ligne de commandes restent sous l'en-tête pendant la lecture.
 */
export function BoardLayout({ board, controls, children }: { board: ReactNode; controls?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-start">
      {/* Fond prolongé jusqu'aux bords par une ombre (coupée en haut et en bas) : aucun débordement horizontal. */}
      <div className="sticky top-14 z-20 space-y-2 bg-background py-2 shadow-[0_0_0_100vmax_var(--background)] [clip-path:inset(0_-100vmax)] lg:top-6 lg:max-w-[calc(100dvh-12rem)] lg:space-y-3 lg:self-start lg:bg-transparent lg:py-0 lg:shadow-none lg:[clip-path:none]">
        <div className="mx-auto max-w-[min(100%,34dvh)] lg:max-w-none">{board}</div>
        {controls}
      </div>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
