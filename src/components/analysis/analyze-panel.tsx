"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { EngineSettings } from "@/lib/analysis/types";
import type { AnalysisRunState } from "./use-game-analysis";

/** Lancement, progression, annulation et erreurs de l'analyse Stockfish. */
export function AnalyzePanel({
  state,
  positions,
  settings,
  analyzedWith,
  onStart,
  onCancel,
}: {
  state: AnalysisRunState;
  positions: number;
  settings: EngineSettings;
  analyzedWith: EngineSettings | null;
  onStart: () => void;
  onCancel: () => void;
}) {
  if (state.status === "running") {
    const { done, total, fromCache, stage } = state.progress;
    const percent = total > 0 ? (done / total) * 100 : 0;
    const label =
      stage === "cache"
        ? "Lecture du cache d'analyse…"
        : stage === "saving"
          ? "Enregistrement de l'analyse…"
          : `Stockfish analyse la position ${Math.min(done + 1, total)} sur ${total}`;
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium" aria-live="polite">
            {label}
          </p>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Annuler l&apos;analyse
          </Button>
        </div>
        <Progress value={percent} aria-label="Progression de l'analyse" />
        <p className="tabular text-xs text-muted-foreground">
          {done} / {total} positions prêtes
          {fromCache > 0 ? `, dont ${fromCache} reprises du cache` : ""}. Vous pouvez parcourir la partie pendant le calcul.
        </p>
      </div>
    );
  }

  const describe = `profondeur ${settings.depth}, ${settings.multipv} ${settings.multipv > 1 ? "lignes" : "ligne"} par position`;

  if (state.status === "error") {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">L&apos;analyse s&apos;est arrêtée.</p>
        <p className="text-sm">{state.message}</p>
        <Button onClick={onStart}>Relancer l&apos;analyse</Button>
      </div>
    );
  }

  if (!analyzedWith) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          Stockfish analyse les {positions} positions de la partie dans votre navigateur ({describe}). Les positions déjà
          analysées sont reprises du cache.
        </p>
        <Button size="lg" onClick={onStart}>
          Analyser cette partie
        </Button>
      </div>
    );
  }

  const differs = analyzedWith.depth !== settings.depth || analyzedWith.multipv !== settings.multipv;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        Analysée à la profondeur {analyzedWith.depth}, {analyzedWith.multipv} {analyzedWith.multipv > 1 ? "lignes" : "ligne"} par position.
        {differs ? ` Vos paramètres actuels demandent ${describe}.` : null}
      </p>
      <Button variant={differs ? "default" : "outline"} size="sm" onClick={onStart}>
        Relancer l&apos;analyse
      </Button>
    </div>
  );
}
