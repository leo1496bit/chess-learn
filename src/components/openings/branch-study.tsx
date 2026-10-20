"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ARROW_COLORS, ChessBoard } from "@/components/chess/chess-board";
import { LinkedText } from "@/components/ai/linked-text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { indexMoveLinks, moveLinkKey, type MoveLink } from "@/lib/ai/move-links";
import type { ApiErrorBody } from "@/lib/ai/schema";
import type { BranchIdeas } from "@/lib/ai/branch/schema";
import { branchMoveLinks, branchPositions, type LinePageBranch } from "@/lib/repertoire/line-view";
import { BoardLayout } from "./board-layout";

export type IdeasEntry =
  | { kind: "loading" }
  | { kind: "ready"; ideas: BranchIdeas; verified: boolean; cached: boolean }
  | { kind: "error"; message: string; code?: ApiErrorBody["code"] };

const LINK_OPTIONS = { ambiguous: "first" } as const;

/** « 3. Nf3 » ou « 3... d5 », d'après la position avant le coup. */
export function moveLabel(fenBefore: string, san: string): string {
  const [, side, , , , fullmove] = fenBefore.split(" ");
  return `${fullmove ?? ""}${side === "b" ? "..." : "."} ${san}`;
}

export function UnverifiedNote() {
  return (
    <p role="note" className="rounded-lg border border-cls-inaccuracy/40 bg-cls-inaccuracy/10 p-3 text-sm">
      <span className="font-semibold">Explication non vérifiée.</span> Elle cite au moins un coup absent des calculs de
      Stockfish : fie-toi aux coups de la branche plutôt qu&apos;au texte pour ce passage.
    </p>
  );
}

/** Étude d'une branche : coup par coup, avec l'idée de chaque coup puis le plan. */
export function BranchStudy({
  branch,
  rootFen,
  playerColor,
  entry,
  onRequestIdeas,
  onRecite,
  onBack,
}: {
  branch: LinePageBranch;
  rootFen: string;
  playerColor: "w" | "b";
  entry: IdeasEntry | undefined;
  /** Appel IA explicite (bouton) : jamais au chargement. */
  onRequestIdeas: () => void;
  onRecite: () => void;
  onBack: () => void;
}) {
  const { fens, san } = useMemo(() => branchPositions(rootFen, branch.pathUci), [rootFen, branch.pathUci]);
  const links = useMemo(() => indexMoveLinks(branchMoveLinks(rootFen, branch.pathUci)), [rootFen, branch.pathUci]);
  const last = san.length;
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<MoveLink | null>(null);

  const go = (target: number) => {
    setPreview(null);
    setStep(Math.max(0, Math.min(last, target)));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
      else if (event.key === "ArrowRight") setStep((s) => Math.min(last, s + 1));
      else if (event.key === "Escape") setPreview(null);
      else return;
      if (event.key !== "Escape") setPreview(null);
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const ideas = entry?.kind === "ready" ? entry.ideas : null;
  const ideaByIndex = useMemo(() => new Map((ideas?.moves ?? []).map((m) => [m.index, m.idea])), [ideas]);
  const moveIndex = step - 1;
  const lastMove = moveIndex >= 0 ? branch.pathUci[moveIndex] : null;
  const orientation = playerColor === "w" ? "white" : "black";
  const linkProps = { index: links, options: LINK_OPTIONS, onPreviewMove: setPreview, previewKey: preview ? moveLinkKey(preview) : null };

  const board = (
    <ChessBoard
      id={`study-${branch.id}`}
      fen={preview?.fen ?? fens[step]}
      orientation={orientation}
      arrows={
        preview ? [{ from: preview.uci.slice(0, 2), to: preview.uci.slice(2, 4), color: ARROW_COLORS.best }] : undefined
      }
      highlightSquares={!preview && lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : undefined}
    />
  );

  const controls = (
    <>
      <nav aria-label="Navigation dans la branche" className="flex items-center justify-center gap-2">
        <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0}>
          <ChevronLeft data-icon="inline-start" />
          <span className="max-sm:sr-only">Coup précédent</span>
        </Button>
        <span className="tabular min-w-16 text-center text-sm text-muted-foreground" aria-live="polite">
          {step} / {last}
        </span>
        <Button variant="outline" onClick={() => go(step + 1)} disabled={step === last}>
          <span className="max-sm:sr-only">Coup suivant</span>
          <ChevronRight data-icon="inline-end" />
        </Button>
      </nav>
      {preview ? (
        <p role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-accent px-3 py-2 text-sm">
          <span>
            Aperçu : <span className="tabular font-semibold">{moveLabel(preview.fen, preview.san)}</span>
          </span>
          <button type="button" onClick={() => setPreview(null)} className="font-medium text-primary underline-offset-4 hover:underline">
            Revenir à la branche
          </button>
        </p>
      ) : null}
    </>
  );

  return (
    <BoardLayout board={board} controls={controls}>
      <section aria-labelledby="study-title" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="study-title" className="font-semibold text-primary">
            {moveIndex >= 0 ? (
              <span className="tabular">{moveLabel(fens[moveIndex], san[moveIndex])}</span>
            ) : (
              "Position de départ"
            )}
            {moveIndex >= 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {moveIndex % 2 === 0 ? "ton coup" : "réponse adverse"}
              </span>
            ) : null}
          </h2>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Retour à l&apos;arbre
          </Button>
        </header>

        <IdeasBody entry={entry} onRequestIdeas={onRequestIdeas}>
          {ideas ? (
            <div className="space-y-4">
              {moveIndex < 0 ? (
                <p className="max-w-prose text-sm text-muted-foreground">
                  Avance coup par coup pour lire l&apos;idée de chaque coup. Le plan s&apos;affiche à la fin de la branche.
                </p>
              ) : (
                <p className="max-w-prose leading-relaxed">
                  {ideaByIndex.has(moveIndex) ? (
                    <LinkedText text={ideaByIndex.get(moveIndex)!} {...linkProps} />
                  ) : (
                    <span className="text-muted-foreground">Pas d&apos;idée rédigée pour ce coup.</span>
                  )}
                </p>
              )}
              {step === last ? (
                <div className="space-y-1 border-l-2 border-primary/30 pl-3">
                  <h3 className="text-sm font-semibold text-primary">Le plan</h3>
                  <p className="max-w-prose leading-relaxed">
                    <LinkedText text={ideas.plan} {...linkProps} />
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </IdeasBody>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={onRecite}>Réciter maintenant</Button>
        </div>
      </section>
    </BoardLayout>
  );
}

/** État des idées : chargement, erreur (étude sans texte) ou contenu, avec l'avertissement « non vérifiée ». */
function IdeasBody({
  entry,
  onRequestIdeas,
  children,
}: {
  entry: IdeasEntry | undefined;
  onRequestIdeas: () => void;
  children: ReactNode;
}) {
  if (!entry) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Les idées de cette branche n&apos;ont pas encore été rédigées.</p>
        <Button variant="outline" size="sm" onClick={onRequestIdeas}>
          Rédiger les idées
        </Button>
      </div>
    );
  }
  if (entry.kind === "loading") {
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-muted-foreground">Claude rédige les idées de la branche à partir des calculs de Stockfish…</p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  if (entry.kind === "error") {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="text-destructive">{entry.message}</p>
        <p className="text-muted-foreground">Tu peux étudier la branche sans texte : les coups restent ceux de Stockfish.</p>
        {entry.code === "limit_reached" || entry.code === "ai_disabled" ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/settings">Ouvrir les paramètres</Link>
          </Button>
        ) : entry.code !== "not_found" ? (
          <Button size="sm" variant="outline" onClick={onRequestIdeas}>
            Réessayer
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {!entry.verified ? (
        <>
          <UnverifiedNote />
          <Button variant="outline" size="sm" onClick={onRequestIdeas}>
            Générer une nouvelle explication
          </Button>
        </>
      ) : null}
      {children}
    </div>
  );
}
