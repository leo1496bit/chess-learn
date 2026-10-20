"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ARROW_COLORS, ChessBoard, type BoardArrow } from "@/components/chess/chess-board";
import { Button } from "@/components/ui/button";
import { playUci } from "@/lib/analysis/lines";
import { Chess } from "chess.js";
import { analyzePositionCached, isAbortError } from "@/lib/engine";
import { RECITE_OPPONENT_DELAY_MS } from "@/lib/repertoire/constants";
import { branchPositions, type LinePageBranch } from "@/lib/repertoire/line-view";
import { applyVerdict, opponentPlayed, startRecite, type ReciteState, type ReciteVerdict } from "@/lib/repertoire/recite-session";
import { formatDate } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import { BoardLayout } from "./board-layout";
import { moveLabel } from "./branch-study";

type MoveResponse =
  | { verdict: "expected" }
  | { verdict: "alternative"; expectedSan: string }
  | { verdict: "wrong" }
  | { verdict: "needs_analysis"; needs: { fen: string; multipv: number }[]; depth: number };

type ReviewResult = { correct: boolean; dueAt: string; intervalDays: number };

type Busy = { kind: "idle" } | { kind: "judging"; fen: string; uci: string } | { kind: "analysing"; fen: string; uci: string };
type Review = { kind: "pending" } | { kind: "saving" } | { kind: "saved"; result: ReviewResult } | { kind: "error"; message: string };

/** Nouvel envoi du coup après analyse : au plus deux fois (le serveur ne redemande rien d'enregistré). */
const MAX_ANALYSIS_ROUNDS = 2;

class ReciteError extends Error {}

/** Récitation : Leonel joue ses coups, l'adversaire répond seul ; chaque coup est jugé par le serveur (Stockfish). */
export function BranchRecite({
  branch,
  rootFen,
  playerColor,
  onBack,
  onStudy,
  onReviewed,
}: {
  branch: LinePageBranch;
  rootFen: string;
  playerColor: "w" | "b";
  onBack: () => void;
  onStudy: () => void;
  /** Révision enregistrée : rafraîchit l'état des branches. */
  onReviewed: () => void;
}) {
  const { fens, san } = useMemo(() => branchPositions(rootFen, branch.pathUci), [rootFen, branch.pathUci]);
  const path = useMemo(() => branch.pathUci.slice(0, san.length), [branch.pathUci, san.length]);
  const [session, setSession] = useState<ReciteState>(() => startRecite(path, san));
  const [busy, setBusy] = useState<Busy>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review>({ kind: "pending" });
  const controllerRef = useRef<AbortController | null>(null);

  // Interrompt une analyse ou une requête en cours quand on quitte la récitation.
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => controller.abort();
  }, []);

  // L'adversaire répond seul, après un court délai.
  useEffect(() => {
    if (session.phase !== "opponent") return;
    const timer = window.setTimeout(() => setSession((s) => opponentPlayed(s)), RECITE_OPPONENT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [session.phase, session.index]);

  const onReviewedRef = useRef(onReviewed);
  useEffect(() => {
    onReviewedRef.current = onReviewed;
  });

  const saveReview = useCallback(async (hints: number, revealed: number) => {
    setReview({ kind: "saving" });
    try {
      const response = await fetch(`/api/openings/branches/${branch.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hints, revealed }),
        signal: controllerRef.current?.signal,
      });
      const body = (await response.json().catch(() => null)) as (Partial<ReviewResult> & { error?: string }) | null;
      if (!response.ok || !body || typeof body.correct !== "boolean" || typeof body.dueAt !== "string") {
        setReview({ kind: "error", message: body?.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.` });
        return;
      }
      setReview({ kind: "saved", result: { correct: body.correct, dueAt: body.dueAt, intervalDays: body.intervalDays ?? 1 } });
      onReviewedRef.current();
    } catch (err) {
      if (isAbortError(err) || controllerRef.current?.signal.aborted) return;
      setReview({ kind: "error", message: "Le serveur ne répond pas. Vérifie ta connexion puis réessaie." });
    }
  }, [branch.id]);

  // Fin de branche : la révision est enregistrée une seule fois par récitation.
  const reviewStarted = useRef(false);
  useEffect(() => {
    if (session.phase !== "done" || reviewStarted.current) return;
    reviewStarted.current = true;
    void saveReview(session.hints, session.revealed);
  }, [session.phase, session.hints, session.revealed, saveReview]);

  async function judge(index: number, uci: string): Promise<ReciteVerdict> {
    const signal = controllerRef.current?.signal;
    for (let round = 0; ; round++) {
      const response = await fetch(`/api/openings/branches/${branch.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, answerUci: uci }),
        signal,
      });
      const body = (await response.json().catch(() => null)) as (Partial<MoveResponse> & { error?: string }) | null;
      if (response.status === 409 && body?.verdict === "needs_analysis" && round < MAX_ANALYSIS_ROUNDS) {
        const { needs, depth } = body as Extract<MoveResponse, { verdict: "needs_analysis" }>;
        setBusy((b) => (b.kind === "idle" ? b : { ...b, kind: "analysing" }));
        // Stockfish (navigateur) calcule et enregistre ; le serveur relit puis juge.
        for (const need of needs) {
          await analyzePositionCached(need.fen, { depth, multipv: need.multipv, awaitStore: true, signal });
        }
        setBusy((b) => (b.kind === "idle" ? b : { ...b, kind: "judging" }));
        continue;
      }
      if (response.status === 409) {
        throw new ReciteError("Les analyses de Stockfish n'ont pas pu être enregistrées. Rejoue le coup pour réessayer.");
      }
      if (!response.ok || !body?.verdict) {
        throw new ReciteError(body?.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.`);
      }
      if (body.verdict === "alternative") return { verdict: "alternative", expectedSan: (body as { expectedSan: string }).expectedSan };
      if (body.verdict === "expected" || body.verdict === "wrong") return { verdict: body.verdict };
      throw new ReciteError("Le verdict n'a pas pu être calculé. Réessaie dans un instant.");
    }
  }

  function onPieceDrop(from: string, to: string, promotion?: string): boolean {
    if (session.phase !== "player" || busy.kind !== "idle") return false;
    const uci = `${from}${to}${promotion ?? ""}`;
    const chess = new Chess(fens[session.index]);
    if (!playUci(chess, uci)) return false;
    const index = session.index;
    setError(null);
    setBusy({ kind: "judging", fen: chess.fen(), uci });
    judge(index, uci)
      .then((verdict) => setSession((s) => (s.index === index ? applyVerdict(s, verdict) : s)))
      .catch((err: unknown) => {
        if (isAbortError(err) || controllerRef.current?.signal.aborted) return;
        setError(err instanceof ReciteError ? err.message : "Le coup n'a pas pu être vérifié. Rejoue-le pour réessayer.");
      })
      .finally(() => setBusy({ kind: "idle" }));
    return true;
  }

  function restart() {
    reviewStarted.current = false;
    setReview({ kind: "pending" });
    setError(null);
    setSession(startRecite(path, san));
  }

  const feedback = session.feedback;
  const shownFen = busy.kind !== "idle" ? busy.fen : fens[session.index];
  const lastUci = busy.kind !== "idle" ? busy.uci : session.index > 0 ? path[session.index - 1] : null;
  const arrows: BoardArrow[] = [];
  let highlight: string[] | undefined = lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : undefined;
  if (busy.kind === "idle" && session.phase === "player" && feedback?.kind === "hint") highlight = [feedback.square];
  if (busy.kind === "idle" && session.phase === "player" && feedback?.kind === "revealed") {
    arrows.push({ from: feedback.uci.slice(0, 2), to: feedback.uci.slice(2, 4), color: ARROW_COLORS.best });
    highlight = [feedback.uci.slice(0, 2)];
  }
  const ownMoves = Math.ceil(path.length / 2);
  const ownPlayed = Math.min(ownMoves, Math.ceil(session.index / 2));

  const board = (
    <ChessBoard
      id={`recite-${branch.id}`}
      fen={shownFen}
      orientation={playerColor === "w" ? "white" : "black"}
      arrows={arrows}
      highlightSquares={highlight}
      interactive={session.phase === "player" && busy.kind === "idle"}
      onPieceDrop={onPieceDrop}
    />
  );

  const status =
    session.phase === "done"
      ? "Branche terminée."
      : busy.kind === "analysing"
        ? "Stockfish analyse la position pour juger ton coup…"
        : busy.kind === "judging"
          ? "Vérification de ton coup…"
          : session.phase === "opponent"
            ? "L'adversaire répond…"
            : "À toi de jouer.";

  return (
    <BoardLayout
      board={board}
      controls={
        <p role="status" aria-live="polite" className="text-center text-sm font-medium lg:text-left">
          {status}
          <span className="ml-2 font-normal text-muted-foreground tabular">
            {ownPlayed} / {ownMoves} coups
          </span>
        </p>
      }
    >
      <section aria-labelledby="recite-title" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recite-title" className="font-semibold text-primary">
            Réciter la branche
          </h2>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Retour à l&apos;arbre
          </Button>
        </header>

        {session.phase !== "done" ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Joue tes coups sur l&apos;échiquier. Une erreur donne un indice, une deuxième révèle le coup.
          </p>
        ) : null}

        {feedback && session.phase === "player" ? <Feedback feedback={feedback} label={moveLabel(fens[session.index], feedback.kind === "revealed" ? feedback.san : "")} /> : null}

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {session.phase === "done" ? (
          <ReviewOutcome review={review} hints={session.hints} revealed={session.revealed} onRetry={() => void saveReview(session.hints, session.revealed)} />
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {session.phase === "done" && review.kind !== "saving" ? <Button onClick={restart}>Réciter à nouveau</Button> : null}
          <Button variant="outline" onClick={onStudy}>
            Revoir les idées
          </Button>
        </div>
      </section>
    </BoardLayout>
  );
}

function Feedback({ feedback, label }: { feedback: NonNullable<ReciteState["feedback"]>; label: string }) {
  const tone =
    feedback.kind === "alternative"
      ? "border-cls-best/40 bg-cls-best/10"
      : feedback.kind === "hint"
        ? "border-cls-inaccuracy/40 bg-cls-inaccuracy/10"
        : "border-cls-mistake/40 bg-cls-mistake/10";
  return (
    <p role="status" className={cn("max-w-prose rounded-lg border p-3 text-sm", tone)}>
      {feedback.kind === "alternative" ? (
        <>
          Bon coup aussi, la ligne retenue est <span className="tabular font-semibold">{feedback.expectedSan}</span>. Joue-la pour
          continuer.
        </>
      ) : feedback.kind === "hint" ? (
        <>
          Ce n&apos;est pas le coup de la ligne. Indice : la pièce à jouer est sur la case{" "}
          <span className="tabular font-semibold">{feedback.square}</span>, mise en évidence.
        </>
      ) : (
        <>
          Le coup de la ligne est <span className="tabular font-semibold">{label}</span>, indiqué par la flèche. Joue-le pour
          continuer.
        </>
      )}
    </p>
  );
}

function ReviewOutcome({
  review,
  hints,
  revealed,
  onRetry,
}: {
  review: Review;
  hints: number;
  revealed: number;
  onRetry: () => void;
}) {
  const counts = `${hints} indice${hints > 1 ? "s" : ""}, ${revealed} coup${revealed > 1 ? "s" : ""} révélé${revealed > 1 ? "s" : ""}.`;
  if (review.kind === "error") {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="text-destructive">{review.message}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Réessayer
        </Button>
      </div>
    );
  }
  if (review.kind !== "saved") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Enregistrement de la révision…
      </p>
    );
  }
  const { correct, dueAt } = review.result;
  return (
    <div
      role="status"
      className={cn(
        "space-y-1 rounded-lg border p-4",
        correct ? "border-cls-best/40 bg-cls-best/10" : "border-cls-inaccuracy/40 bg-cls-inaccuracy/10",
      )}
    >
      <p className={cn("text-lg font-bold", correct ? "text-cls-best" : "text-cls-inaccuracy")}>{correct ? "Réussie" : "À revoir demain"}</p>
      <p className="text-sm">{counts}</p>
      <p className="text-sm">Prochaine révision : {formatDate(dueAt)}.</p>
    </div>
  );
}
