"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ARROW_COLORS, ChessBoard, type BoardArrow } from "@/components/chess/chess-board";
import { Button } from "@/components/ui/button";
import { parseUci, playUci, uciLineToSan } from "@/lib/analysis/lines";
import { analyzePositionCached } from "@/lib/engine";
import { formatDate } from "@/lib/stats/format";
import { PHASE_LABELS, THEME_LABELS } from "@/lib/stats/labels";
import type { TrainingExercise } from "@/lib/training/queries";
import { DIFFICULTY_LABELS } from "@/lib/training/select";
import type { Verdict } from "@/lib/training/attempt";
import { cn } from "@/lib/utils";

type AttemptResponse = { correct: boolean; verdict: Verdict; loss: number; answerSan: string; bestSan: string | null };

type Answer = {
  uci: string;
  san: string;
  loss: number;
  verdict: Verdict;
  engineBestSan: string | null;
  save: "pending" | "saved" | { error: string };
};

type Status = { kind: "solving" } | { kind: "evaluating"; san: string } | { kind: "answered" } | { kind: "failed"; message: string };

const VERDICT_TEXT: Record<Verdict, { title: string; className: string }> = {
  good: { title: "Bon coup", className: "border-cls-best/40 bg-cls-best/10 text-cls-best" },
  inaccurate: { title: "Pas le meilleur", className: "border-cls-inaccuracy/40 bg-cls-inaccuracy/10 text-cls-inaccuracy" },
  error: { title: "Erreur", className: "border-cls-blunder/40 bg-cls-blunder/10 text-cls-blunder" },
};

const lossFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function arrowFor(uci: string, color: string): BoardArrow | null {
  const m = parseUci(uci);
  return m ? { from: m.from, to: m.to, color } : null;
}

export function TrainingSession({
  exercises,
  depth,
  multipv,
}: {
  exercises: TrainingExercise[];
  depth: number;
  multipv: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "solving" });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [revealStep, setRevealStep] = useState<number | null>(null);
  const [tally, setTally] = useState({ done: 0, good: 0 });
  // Ignore les résultats d'une évaluation lancée sur un exercice qu'on a quitté.
  const run = useRef(0);

  const exercise = exercises[index] ?? null;

  const revealFens = useMemo(() => {
    if (!exercise) return [];
    const chess = new Chess(exercise.fen);
    const fens = [chess.fen()];
    for (const step of exercise.solutionLine) {
      if (!playUci(chess, step.uci)) break;
      fens.push(chess.fen());
    }
    return fens;
  }, [exercise]);

  if (!exercise) {
    return (
      <div className="max-w-prose space-y-3 rounded-lg border border-dashed p-6">
        <p className="font-semibold">Série terminée</p>
        <p className="text-sm text-muted-foreground">
          {tally.done > 0
            ? `${tally.good} bonne${tally.good > 1 ? "s" : ""} réponse${tally.good > 1 ? "s" : ""} sur ${tally.done}. Les exercices manqués reviendront demain.`
            : "Aucun exercice ne correspond à ces filtres pour le moment."}
        </p>
        <Button
          onClick={() => {
            setIndex(0);
            setTally({ done: 0, good: 0 });
            router.refresh();
          }}
        >
          Lancer une nouvelle série
        </Button>
      </div>
    );
  }

  const sideLabel = exercise.sideToMove === "w" ? "les Blancs" : "les Noirs";
  const playedInGame = uciLineToSan(exercise.fen, [exercise.playedUci], 1).san[0] ?? exercise.playedUci;
  const revealing = revealStep !== null;
  const shownFen = revealing ? (revealFens[revealStep] ?? exercise.fen) : (boardFen ?? exercise.fen);
  const nextRevealMove = revealing ? exercise.solutionLine[revealStep] : undefined;

  const arrows: BoardArrow[] = [];
  if (revealing && nextRevealMove) {
    const a = arrowFor(nextRevealMove.uci, ARROW_COLORS.best);
    if (a) arrows.push(a);
  }
  const lastAnswer = answer && !revealing ? parseUci(answer.uci) : null;

  function reset(nextIndex: number) {
    run.current++;
    setIndex(nextIndex);
    setBoardFen(null);
    setStatus({ kind: "solving" });
    setAnswer(null);
    setRevealStep(null);
  }

  function onPieceDrop(from: string, to: string, promotion?: string): boolean {
    if (!exercise || status.kind !== "solving") return false;
    const uci = `${from}${to}${promotion ?? ""}`;
    const chess = new Chess(exercise.fen);
    const played = playUci(chess, uci);
    if (!played) return false;
    const fenAfter = chess.fen();
    setBoardFen(fenAfter);
    setStatus({ kind: "evaluating", san: played.san });
    void evaluate(exercise, uci, played.san, fenAfter);
    return true;
  }

  async function evaluate(ex: TrainingExercise, uci: string, san: string, fenAfter: string) {
    const current = ++run.current;
    try {
      // Jugement par Stockfish uniquement. Les analyses (avant et après le coup) sont écrites dans le
      // cache avant l'envoi : le serveur les relit et calcule lui-même le verdict.
      await analyzePositionCached(ex.fen, { depth, multipv, awaitStore: true });
      await analyzePositionCached(fenAfter, { depth, multipv: 1, awaitStore: true });
      if (current !== run.current) return;

      const response = await fetch("/api/training/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: ex.id, answerUci: uci }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<AttemptResponse> & { error?: string };
      if (current !== run.current) return;
      if (!response.ok || body.verdict === undefined || body.loss === undefined) {
        throw new Error(body.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.`);
      }
      const correct = body.correct === true;
      setAnswer({ uci, san, loss: body.loss, verdict: body.verdict, engineBestSan: body.bestSan ?? null, save: "saved" });
      setStatus({ kind: "answered" });
      setTally((t) => ({ done: t.done + 1, good: t.good + (correct ? 1 : 0) }));
    } catch (error) {
      if (current !== run.current) return;
      setStatus({
        kind: "failed",
        message: error instanceof Error ? error.message : "Stockfish n'a pas pu évaluer ce coup.",
      });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,32rem)_1fr]">
      <div className="space-y-2">
        <ChessBoard
          id="training-board"
          fen={shownFen}
          orientation={exercise.sideToMove === "w" ? "white" : "black"}
          interactive={status.kind === "solving"}
          onPieceDrop={onPieceDrop}
          arrows={arrows}
          highlightSquares={lastAnswer ? [lastAnswer.from, lastAnswer.to] : undefined}
        />
        <p className="text-sm text-muted-foreground tabular">
          Exercice {index + 1} sur {exercises.length}
          {tally.done > 0 ? `, ${tally.good} réussi${tally.good > 1 ? "s" : ""} sur ${tally.done}` : ""}
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-primary">Trouve le meilleur coup pour {sideLabel}</h2>
          <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Caractéristiques de l'exercice">
            <li className="rounded bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
              {DIFFICULTY_LABELS[exercise.difficulty]}
            </li>
            <li className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">{PHASE_LABELS[exercise.phase]}</li>
            {exercise.themes.map((t) => (
              <li key={t} className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">
                {THEME_LABELS[t as keyof typeof THEME_LABELS] ?? t}
              </li>
            ))}
          </ul>
          {exercise.game ? (
            <p className="text-sm text-muted-foreground">
              Position tirée de ta partie {exercise.game.white} – {exercise.game.black} du {formatDate(exercise.game.endTime)}.
            </p>
          ) : null}
        </div>

        {status.kind === "solving" ? (
          <p className="text-sm text-muted-foreground">
            Fais glisser une pièce pour jouer ton coup. Stockfish l&apos;évaluera, puis tu verras la solution.
          </p>
        ) : null}

        {status.kind === "evaluating" ? (
          <p role="status" className="text-sm">
            Stockfish évalue <span className="font-semibold">{status.san}</span>…
          </p>
        ) : null}

        {status.kind === "failed" ? (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-semibold text-destructive">L&apos;évaluation a échoué</p>
            <p>{status.message} Rejoue ton coup pour relancer Stockfish.</p>
            <Button size="sm" variant="outline" onClick={() => reset(index)}>
              Rejouer le coup
            </Button>
          </div>
        ) : null}

        {status.kind === "answered" && answer ? (
          <div aria-live="polite" className="space-y-4">
            <div className={cn("space-y-1 rounded-lg border p-4", VERDICT_TEXT[answer.verdict].className)}>
              <p className="text-lg font-bold">
                {VERDICT_TEXT[answer.verdict].title} : {answer.san}
              </p>
              <p className="text-sm text-foreground">
                {answer.loss < 0.05
                  ? "Aucune perte de pourcentage de gain par rapport au meilleur coup."
                  : `Perte de ${lossFormat.format(answer.loss)} points de pourcentage de gain par rapport au meilleur coup.`}
              </p>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Solution</dt>
              <dd className="font-semibold">{exercise.solutionSan}</dd>
              {exercise.acceptedUci.length > 1 ? (
                <>
                  <dt className="text-muted-foreground">Aussi accepté</dt>
                  <dd>
                    {exercise.acceptedUci
                      .filter((u) => u !== exercise.solutionUci)
                      .map((u) => uciLineToSan(exercise.fen, [u], 1).san[0] ?? u)
                      .join(", ")}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Joué dans la partie</dt>
              <dd>{playedInGame}</dd>
            </dl>

            {typeof answer.save === "object" ? (
              <p role="alert" className="text-sm text-destructive">
                Ta réponse n&apos;a pas été enregistrée : {answer.save.error}
              </p>
            ) : null}

            {revealing ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Meilleure continuation</p>
                <ol className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm tabular">
                  {exercise.solutionLine.map((step, i) => (
                    <li key={`${i}-${step.uci}`}>
                      <button
                        type="button"
                        onClick={() => setRevealStep(i + 1)}
                        aria-current={revealStep === i + 1 ? "step" : undefined}
                        className={cn(
                          "rounded px-1.5 py-0.5 hover:bg-muted",
                          revealStep === i + 1 && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                        )}
                      >
                        {step.san}
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={revealStep === 0} onClick={() => setRevealStep((s) => Math.max(0, (s ?? 0) - 1))}>
                    Coup précédent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revealStep >= revealFens.length - 1}
                    onClick={() => setRevealStep((s) => Math.min(revealFens.length - 1, (s ?? 0) + 1))}
                  >
                    Coup suivant
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!revealing ? (
                <Button variant="outline" onClick={() => setRevealStep(0)}>
                  Voir la meilleure continuation
                </Button>
              ) : null}
              <Button onClick={() => reset(index + 1)}>Exercice suivant</Button>
              <Button asChild variant="ghost">
                <Link href={`/games/${exercise.gameId}`}>Voir la partie d&apos;origine</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {status.kind === "solving" ? (
          <Button variant="ghost" size="sm" onClick={() => reset(index + 1)}>
            Passer cet exercice
          </Button>
        ) : null}
      </div>
    </div>
  );
}
