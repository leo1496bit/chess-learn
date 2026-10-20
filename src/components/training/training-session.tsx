"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ARROW_COLORS, ChessBoard, type BoardArrow } from "@/components/chess/chess-board";
import { Button } from "@/components/ui/button";
import { formatSanLine } from "@/lib/analysis/labels";
import { parseUci, playUci, uciLineToSan } from "@/lib/analysis/lines";
import { formatEvaluation } from "@/lib/analysis/win";
import type { Color, Evaluation, PositionAnalysis } from "@/lib/analysis/types";
import { analyzePositionCached } from "@/lib/engine";
import { formatDate } from "@/lib/stats/format";
import { PHASE_LABELS, THEME_LABELS } from "@/lib/stats/labels";
import type { TrainingExercise } from "@/lib/training/queries";
import { DIFFICULTY_LABELS } from "@/lib/training/select";
import type { Verdict } from "@/lib/training/attempt";
import { cn } from "@/lib/utils";

type AttemptResponse = {
  correct: boolean;
  verdict: Verdict;
  loss: number;
  answerSan: string;
  bestSan: string | null;
  isBest: boolean;
};

/** Variante rejouable depuis la position de l'exercice (premier coup inclus), validée par chess.js. */
type Line = { uci: string[]; san: string[]; evaluation: Evaluation | null; sideToMoveAtEval: Color };

type Answer = {
  uci: string;
  san: string;
  loss: number;
  verdict: Verdict;
  correct: boolean;
  isBest: boolean;
  bestSan: string | null;
  /** Variante du meilleur coup de Stockfish. */
  bestLine: Line | null;
  /** Suite attendue après le coup joué (ton coup + meilleure réponse et suite). */
  yourLine: Line;
};

type Status = { kind: "solving" } | { kind: "evaluating"; san: string } | { kind: "answered" } | { kind: "failed"; message: string };
type Replay = { which: "best" | "yours"; step: number };

const VERDICT_TEXT: Record<Verdict, { title: string; className: string }> = {
  good: { title: "Bon coup", className: "border-cls-best/40 bg-cls-best/10 text-cls-best" },
  inaccurate: { title: "Pas le meilleur", className: "border-cls-inaccuracy/40 bg-cls-inaccuracy/10 text-cls-inaccuracy" },
  error: { title: "Erreur", className: "border-cls-blunder/40 bg-cls-blunder/10 text-cls-blunder" },
};

const lossFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const LINE_PLIES = 8;

function arrowFor(uci: string, color: string): BoardArrow | null {
  const m = parseUci(uci);
  return m ? { from: m.from, to: m.to, color } : null;
}

const other = (color: Color): Color => (color === "w" ? "b" : "w");

/** Lignes affichées après une réponse, à partir des analyses Stockfish déjà calculées. */
function buildLines(fen: string, uci: string, before: PositionAnalysis, after: PositionAnalysis): { bestLine: Line | null; yourLine: Line } {
  const side = fen.split(" ")[1] === "b" ? "b" : "w";
  const best = before.lines[0];
  const bestValidated = best ? uciLineToSan(fen, best.pvUci, LINE_PLIES) : null;
  const bestLine: Line | null =
    best && bestValidated && bestValidated.uci.length > 0
      ? { ...bestValidated, evaluation: best.evaluation, sideToMoveAtEval: side }
      : null;
  const reply = after.lines[0];
  const yours = uciLineToSan(fen, [uci, ...(reply?.pvUci ?? [])], LINE_PLIES);
  const yourEvaluation = reply?.evaluation ?? after.terminal?.evaluation ?? null;
  return { bestLine, yourLine: { ...yours, evaluation: yourEvaluation, sideToMoveAtEval: other(side) } };
}

function replayFens(fen: string, line: Line | null): string[] {
  const chess = new Chess(fen);
  const fens = [chess.fen()];
  for (const uci of line?.uci ?? []) {
    if (!playUci(chess, uci)) break;
    fens.push(chess.fen());
  }
  return fens;
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
  const [replay, setReplay] = useState<Replay | null>(null);
  const [tally, setTally] = useState({ done: 0, good: 0 });
  // Ignore les résultats d'une évaluation lancée sur un exercice qu'on a quitté.
  const run = useRef(0);

  const exercise = exercises[index] ?? null;
  const replayLine = answer && replay ? (replay.which === "best" ? answer.bestLine : answer.yourLine) : null;
  const fens = useMemo(() => (exercise && replayLine ? replayFens(exercise.fen, replayLine) : []), [exercise, replayLine]);

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
  const replaying = replay !== null && replayLine !== null;
  const shownFen = replaying ? (fens[replay.step] ?? exercise.fen) : (boardFen ?? exercise.fen);

  const arrows: BoardArrow[] = [];
  if (replaying) {
    const next = replayLine.uci[replay.step];
    const a = next ? arrowFor(next, replay.which === "best" ? ARROW_COLORS.best : ARROW_COLORS.neutral) : null;
    if (a) arrows.push(a);
  }
  const lastAnswer = answer && !replaying && boardFen ? parseUci(answer.uci) : null;

  function reset(nextIndex: number) {
    run.current++;
    setIndex(nextIndex);
    setBoardFen(null);
    setStatus({ kind: "solving" });
    setAnswer(null);
    setReplay(null);
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
      const before = await analyzePositionCached(ex.fen, { depth, multipv, awaitStore: true });
      const after = await analyzePositionCached(fenAfter, { depth, multipv: 1, awaitStore: true });
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
      setAnswer({
        uci,
        san,
        loss: body.loss,
        verdict: body.verdict,
        correct,
        isBest: body.isBest === true,
        bestSan: body.bestSan ?? null,
        ...buildLines(ex.fen, uci, before, after),
      });
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

  const startReplay = (which: Replay["which"]) => {
    setReplay({ which, step: 0 });
  };

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
            Fais glisser une pièce pour jouer ton coup. Stockfish l&apos;évaluera, puis tu verras le meilleur coup.
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
          <div aria-live="polite" className="space-y-5">
            <div className={cn("space-y-1 rounded-lg border p-4", VERDICT_TEXT[answer.verdict].className)}>
              <p className="text-lg font-bold">
                {VERDICT_TEXT[answer.verdict].title} : {answer.san}
              </p>
              <p className="text-sm text-foreground">
                {answer.isBest
                  ? "C'est le meilleur coup selon Stockfish."
                  : answer.correct
                    ? `Presque aussi fort que le meilleur coup (${answer.bestSan ?? "?"}) : perte de ${lossFormat.format(answer.loss)} point${answer.loss >= 2 ? "s" : ""} de pourcentage de gain seulement.`
                    : `Perte de ${lossFormat.format(answer.loss)} points de pourcentage de gain par rapport au meilleur coup.`}
              </p>
            </div>

            {!answer.isBest && answer.bestLine ? (
              <LineBlock
                title="Le meilleur coup"
                headline={answer.bestSan ?? answer.bestLine.san[0]}
                fen={exercise.fen}
                line={answer.bestLine}
                active={replay?.which === "best"}
                onReplay={() => startReplay("best")}
                replayLabel="Rejouer la variante du meilleur coup"
                tone="best"
              />
            ) : null}

            <LineBlock
              title={answer.isBest ? "La suite" : "Ta suite"}
              headline={null}
              fen={exercise.fen}
              line={answer.yourLine}
              active={replay?.which === "yours"}
              onReplay={() => startReplay("yours")}
              replayLabel={answer.isBest ? "Rejouer la suite" : "Rejouer ta suite"}
              tone="yours"
            />

            {replaying ? (
              <div className="space-y-2">
                <ol className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm tabular" aria-label="Coups de la variante">
                  {replayLine.san.map((san, i) => (
                    <li key={`${i}-${replayLine.uci[i]}`}>
                      <button
                        type="button"
                        onClick={() => setReplay({ ...replay, step: i + 1 })}
                        aria-current={replay.step === i + 1 ? "step" : undefined}
                        className={cn(
                          "rounded px-1.5 py-0.5 hover:bg-muted",
                          replay.step === i + 1 && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                        )}
                      >
                        {san}
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={replay.step === 0} onClick={() => setReplay({ ...replay, step: replay.step - 1 })}>
                    Coup précédent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={replay.step >= fens.length - 1}
                    onClick={() => setReplay({ ...replay, step: Math.min(fens.length - 1, replay.step + 1) })}
                  >
                    Coup suivant
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReplay(null)}>
                    Revenir à ma réponse
                  </Button>
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {exercise.acceptedUci.length > 1 ? (
                <>
                  <dt className="text-muted-foreground">Coups acceptés</dt>
                  <dd>{exercise.acceptedUci.map((u) => uciLineToSan(exercise.fen, [u], 1).san[0] ?? u).join(", ")}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Joué dans ta partie</dt>
              <dd>{playedInGame}</dd>
            </dl>

            <div className="flex flex-wrap gap-2">
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

function LineBlock({
  title,
  headline,
  fen,
  line,
  active,
  onReplay,
  replayLabel,
  tone,
}: {
  title: string;
  headline: string | null;
  fen: string;
  line: Line;
  active: boolean;
  onReplay: () => void;
  replayLabel: string;
  tone: "best" | "yours";
}) {
  return (
    <section className={cn("space-y-1.5 border-l-2 pl-4", tone === "best" ? "border-cls-best/60" : "border-primary/25")}>
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {headline ? <p className="tabular text-2xl font-bold text-cls-best">{headline}</p> : null}
      <p className="tabular text-sm">
        {line.evaluation ? (
          <span className="mr-2 font-semibold">{formatEvaluation(line.evaluation, line.sideToMoveAtEval)}</span>
        ) : null}
        {formatSanLine(fen, line.san)}
      </p>
      {line.uci.length > 0 ? (
        <Button size="sm" variant={active ? "secondary" : "outline"} onClick={onReplay}>
          {replayLabel}
        </Button>
      ) : null}
    </section>
  );
}
