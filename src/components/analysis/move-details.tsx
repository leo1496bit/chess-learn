"use client";

import { ClassificationBadge, MissedWinBadge } from "@/components/chess/classification-badge";
import { ARROW_COLORS } from "@/components/chess/chess-board";
import { ExplanationPanel } from "@/components/ai/explanation-panel";
import type { MoveLink } from "@/lib/ai/move-links";
import { isErrorClassification } from "@/lib/analysis/classify";
import { PHASE_LABELS, THEME_LABELS, formatSanLine, moveNumberLabel, themeKind } from "@/lib/analysis/labels";
import { formatEvaluation } from "@/lib/analysis/win";
import type { MoveAnalysis } from "@/lib/analysis/types";
import type { MoveTheory } from "@/lib/openings/identify";
import { cn } from "@/lib/utils";

const NO_CHANGE = new Set(["best", "forced"]);

function EvalCell({ label, value, win }: { label: string; value: string; win: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-lg font-semibold">
        {value}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{Math.round(win)} %</span>
      </dd>
    </div>
  );
}

/** Détail du coup sélectionné : coup joué, meilleur coup, évaluations, variantes, thèmes, explication. */
function TheoryNote({ theory }: { theory: MoveTheory | null }) {
  if (!theory || theory.kind === "none" || theory.kind === "out") return null;
  if (theory.kind === "book") {
    return (
      <p className="text-sm">
        <span className="font-semibold text-primary">Théorie. </span>
        Coup du livre d&apos;ouvertures{theory.name ? <> : {theory.name}</> : null}
        {theory.eco ? <span className="tabular text-muted-foreground"> ({theory.eco})</span> : null}.
      </p>
    );
  }
  return (
    <p className="text-sm">
      <span className="font-semibold text-cls-inaccuracy">Sortie de la théorie. </span>
      Premier coup hors du livre d&apos;ouvertures
      {theory.lastBookName ? <> (dernière ligne connue : {theory.lastBookName})</> : null}.
    </p>
  );
}

export function MoveDetails({
  move,
  gameId,
  theory,
  onPreviewMove,
  previewKey,
}: {
  move: MoveAnalysis | null;
  gameId: string;
  theory: MoveTheory | null;
  onPreviewMove?: (link: MoveLink) => void;
  previewKey?: string | null;
}) {
  if (!move) {
    return (
      <div className="space-y-1">
        <p className="font-semibold">Position initiale</p>
        <p className="text-sm text-muted-foreground">Avancez d&apos;un coup avec → ou cliquez dans la feuille de notation.</p>
      </div>
    );
  }

  const opponentToMove = move.color === "w" ? "b" : "w";
  const isError = isErrorClassification(move.classification) || move.missedWin;
  const showBest = !NO_CHANGE.has(move.classification) && move.bestSan !== null;
  const playerWord = move.isPlayerMove ? "Vous avez joué" : "L'adversaire a joué";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">
            <span className="tabular mr-1 text-muted-foreground">{moveNumberLabel(move.ply)}</span>
            {move.san}
          </h2>
          <ClassificationBadge classification={move.classification} withLabel />
          {move.missedWin ? <MissedWinBadge withLabel /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {playerWord} {move.san}
          {showBest ? (
            <>
              {" "}
              ; Stockfish recommandait{" "}
              <strong className="font-semibold text-foreground">
                <span aria-hidden className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: ARROW_COLORS.best }} />
                {move.bestSan}
              </strong>
            </>
          ) : move.classification === "forced" ? (
            " : c'était le seul coup légal."
          ) : (
            " : c'est le meilleur coup selon Stockfish."
          )}
          {showBest ? "." : null}
        </p>
        <TheoryNote theory={theory} />
        {move.missedSave ? (
          <p className="text-sm text-cls-blunder">La position restait défendable avant ce coup : l&apos;occasion de sauver la partie est passée.</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-3 border-y py-3">
        <EvalCell label="Avant le coup" value={formatEvaluation(move.evalBefore, move.color)} win={move.color === "w" ? move.winBefore : 100 - move.winBefore} />
        <EvalCell label="Après le coup" value={formatEvaluation(move.evalAfter, opponentToMove)} win={move.color === "w" ? move.winAfter : 100 - move.winAfter} />
        <div>
          <dt className="text-xs text-muted-foreground">Perte</dt>
          <dd className={cn("tabular text-lg font-semibold", move.loss >= 5 && "text-cls-mistake")}>
            {move.loss < 0.5 ? "0" : `−${move.loss.toFixed(1)}`}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">précision {Math.round(move.accuracy)}</span>
          </dd>
        </div>
      </dl>
      <p className="-mt-3 text-xs text-muted-foreground">
        Évaluations du point de vue des Blancs ; pourcentages de gain des Blancs. {PHASE_LABELS[move.phase]}.
      </p>

      {move.candidates.length > 0 ? (
        <section className="space-y-2" aria-labelledby={`candidates-${move.ply}`}>
          <h3 id={`candidates-${move.ply}`} className="text-sm font-semibold">
            Coups candidats de Stockfish
          </h3>
          <ol className="space-y-1.5">
            {move.candidates.map((line, i) => (
              <li key={line.uci.join(" ") || i} className="flex gap-3 text-sm">
                <span className="tabular w-12 shrink-0 font-semibold">{formatEvaluation(line.evaluation, move.color)}</span>
                <span className={cn(line.uci[0] === move.uci && "font-semibold underline decoration-dotted underline-offset-4")}>
                  {formatSanLine(move.fenBefore, line.san)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {isError && move.punishLine && move.punishLine.san.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">Suite attendue après {move.san}</h3>
          <p className="text-sm">
            <span className="tabular mr-3 font-semibold">{formatEvaluation(move.punishLine.evaluation, opponentToMove)}</span>
            {formatSanLine(move.fenAfter, move.punishLine.san)}
          </p>
        </section>
      ) : null}

      {move.themes.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Thèmes</h3>
          <ul className="flex flex-wrap gap-1.5">
            {move.themes.map((theme) => (
              <li
                key={theme}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                  themeKind(theme) === "tactical" ? "bg-cls-blunder/8 text-cls-blunder ring-cls-blunder/25" : "bg-primary/6 text-primary ring-primary/20",
                )}
              >
                {THEME_LABELS[theme]}
                <span className="sr-only">{{ tactical: " (tactique)", strategic: " (stratégique)", other: "" }[themeKind(theme)]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="border-t pt-5">
        <ExplanationPanel gameId={gameId} move={move} onPreviewMove={onPreviewMove} previewKey={previewKey} />
      </div>
    </div>
  );
}
