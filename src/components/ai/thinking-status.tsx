"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";

/** Étapes affichées pendant une génération IA : la réflexion, puis la rédaction. */
export const THINKING_STEPS = {
  move: ["Lecture des calculs de Stockfish…", "Réflexion sur ce qui s'est joué ici…", "Rédaction de ton explication…"],
  report: ["Relecture de ta partie…", "Recherche des moments clés…", "Rédaction de ton bilan…"],
  branch: ["Étude de la ligne…", "Réflexion sur l'idée de chaque coup…", "Rédaction des idées et du plan…"],
} as const;

const STEP_MS = 2500;

/**
 * Message d'attente qui passe d'une étape à la suivante, puis reste sur la dernière.
 * Les étapes sont indicatives : elles ne suivent pas l'avancement réel de la génération.
 */
export function ThinkingStatus({ steps }: { steps: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= steps.length - 1) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [index, steps.length]);

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
      {steps[index]}
    </p>
  );
}
