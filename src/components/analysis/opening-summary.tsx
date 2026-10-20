"use client";

import { moveNumberLabel } from "@/lib/analysis/labels";
import type { OpeningReport } from "@/lib/openings/identify";

/** Ouverture identifiée par le livre : nom, gambit, longueur de la théorie et sortie du livre. */
export function OpeningSummary({ opening, onSelectPly }: { opening: OpeningReport; onSelectPly: (ply: number) => void }) {
  const deviation = opening.deviation;
  return (
    <div className="space-y-1.5 rounded-lg border bg-card px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-lg font-bold tracking-tight text-primary">{opening.family ?? "Ouverture non répertoriée"}</span>
        {opening.variation ? <span className="font-medium text-foreground/80">{opening.variation}</span> : null}
        {opening.eco ? <span className="tabular text-sm text-muted-foreground">{opening.eco}</span> : null}
        {opening.gambit ? (
          <span className="rounded bg-cls-missed/10 px-1.5 py-0.5 text-xs font-semibold text-cls-missed ring-1 ring-inset ring-cls-missed/30">
            Gambit
          </span>
        ) : null}
      </p>
      <p className="text-sm text-muted-foreground">
        {opening.bookPlies > 0 ? (
          <>
            Théorie suivie jusqu&apos;au coup{" "}
            <button type="button" className="tabular font-medium text-foreground underline-offset-4 hover:underline" onClick={() => onSelectPly(opening.bookPlies)}>
              {moveNumberLabel(opening.bookPlies)}
            </button>
            .{" "}
          </>
        ) : null}
        {deviation ? (
          <>
            {deviation.byPlayer ? "Tu as quitté" : "Ton adversaire a quitté"} le livre avec{" "}
            <button type="button" className="tabular font-semibold text-cls-inaccuracy underline-offset-4 hover:underline" onClick={() => onSelectPly(deviation.ply)}>
              {moveNumberLabel(deviation.ply)} {deviation.san}
            </button>
            .
          </>
        ) : opening.bookPlies > 0 ? (
          "La partie n'est pas sortie du livre d'ouvertures."
        ) : null}
        {opening.gambit && opening.gambit !== opening.name ? <> Gambit rencontré : {opening.gambit}.</> : null}
      </p>
    </div>
  );
}
