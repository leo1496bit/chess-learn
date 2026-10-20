"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, RefreshCw } from "lucide-react";
import { ChessBoard } from "@/components/chess/chess-board";
import { Button } from "@/components/ui/button";
import type { ApiErrorBody } from "@/lib/ai/schema";
import type { BranchIdeasResponse } from "@/lib/ai/branch/schema";
import {
  BRANCH_STATUS_LABELS,
  branchPositions,
  branchStatus,
  passesThrough,
  type BranchStatus,
  type LinePageBranch,
  type LinePageLine,
  type TreeMove,
} from "@/lib/repertoire/line-view";
import { formatDate } from "@/lib/stats/format";
import { BoardLayout } from "./board-layout";
import { BranchRecite } from "./branch-recite";
import { BranchStudy, UnverifiedNote, type IdeasEntry } from "./branch-study";
import { BuildRunner } from "./build-runner";
import { LineTree, StatusDot } from "./line-tree";

/** « 5. » ou « 5... » selon le camp au trait dans la position qui précède le coup. */
function moveNumber(fenBefore: string): string {
  const [, side, , , , fullmove] = fenBefore.split(" ");
  return side === "w" ? `${fullmove}. ` : `${fullmove}... `;
}

type Mode = { kind: "browse" } | { kind: "study"; branchId: string } | { kind: "recite"; branchId: string };

/** Page d'une ligne : construction, arbre des branches, étude et récitation. */
export function LineWorkspace({
  line,
  branches,
  cachedIdeas,
}: {
  line: LinePageLine;
  branches: LinePageBranch[];
  cachedIdeas: Record<string, { ideas: BranchIdeasResponse["ideas"]; verified: boolean }>;
}) {
  const router = useRouter();
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [rebuildPending, setRebuildPending] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "browse" });
  const [selectedId, setSelectedId] = useState<string | null>(branches[0]?.id ?? null);
  const [requested, setRequested] = useState<Record<string, IdeasEntry>>({});
  const inFlight = useRef(new Set<string>());
  // Date figée au rendu initial : l'état des branches est recalculé à chaque rafraîchissement de la page.
  const [now] = useState(() => new Date());

  const building = rebuilding || line.status !== "ready" || !line.kind;
  const statuses = useMemo(
    () => Object.fromEntries(branches.map((b) => [b.id, branchStatus(b, now)])) as Record<string, BranchStatus>,
    [branches, now],
  );
  const selected = branches.find((b) => b.id === selectedId) ?? null;
  const active = mode.kind === "browse" ? null : (branches.find((b) => b.id === mode.branchId) ?? null);

  // Position affichée : demi-coups joués depuis la position de départ le long de la branche sélectionnée
  // (null = position finale de la branche).
  const [ply, setPly] = useState<number | null>(null);
  const positions = useMemo(
    () => (selected ? branchPositions(line.rootFen, selected.pathUci) : { fens: [line.rootFen], san: [] }),
    [selected, line.rootFen],
  );
  const lastPly = positions.fens.length - 1;
  const shownPly = ply === null ? lastPly : Math.min(ply, lastPly);
  const goTo = (target: number) => setPly(Math.max(0, Math.min(lastPly, target)));

  function selectBranch(id: string) {
    setSelectedId(id);
    setPly(null);
  }

  /** Clic sur un coup de l'arbre : garder la branche sélectionnée si elle passe par ce coup. */
  function showMove(move: TreeMove) {
    const via = branches.find((b) => b.id === move.branchId);
    const keep = selected !== null && via !== undefined && passesThrough(selected.pathSan, via.pathSan, move.index);
    if (!keep) setSelectedId(move.branchId);
    setPly(move.index + 1);
  }

  // ← / → parcourent la branche sélectionnée (hors étude et récitation, hors champs et widgets qui utilisent ces touches).
  useEffect(() => {
    if (mode.kind !== "browse") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (target?.closest('[role="slider"], [role="tab"], [role="tablist"], [role="listbox"], [role="menu"]')) return;
      if (event.key === "ArrowLeft") setPly((p) => Math.max(0, Math.min(p ?? lastPly, lastPly) - 1));
      else if (event.key === "ArrowRight") setPly((p) => Math.min(lastPly, Math.min(p ?? lastPly, lastPly) + 1));
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode.kind, lastPly]);

  function ideasFor(id: string): IdeasEntry | undefined {
    const entry = requested[id];
    if (entry) return entry;
    const cached = cachedIdeas[id];
    return cached
      ? {
          kind: "ready",
          ideas: cached.ideas,
          verified: cached.verified,
          cached: true,
        }
      : undefined;
  }

  /** Appel IA payant : uniquement sur une action explicite (« Étudier », « Réessayer »). */
  async function requestIdeas(id: string) {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    const previous = ideasFor(id);
    setRequested((r) => ({ ...r, [id]: { kind: "loading" } }));
    let next: IdeasEntry;
    try {
      const response = await fetch(`/api/openings/branches/${id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => null)) as (Partial<BranchIdeasResponse> & Partial<ApiErrorBody>) | null;
      if (response.ok && body?.ideas) {
        next = {
          kind: "ready",
          ideas: body.ideas,
          verified: body.verified === true,
          cached: body.cached === true,
        };
      } else {
        next = {
          kind: "error",
          message: body?.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.`,
          code: body?.code,
        };
      }
    } catch {
      next = {
        kind: "error",
        message: "Connexion au serveur impossible. Vérifie ta connexion puis réessaie.",
      };
    } finally {
      inFlight.current.delete(id);
    }
    // Une régénération ratée garde les idées déjà affichées.
    if (next.kind === "error" && previous?.kind === "ready") next = previous;
    setRequested((r) => ({ ...r, [id]: next }));
  }

  function study(id: string) {
    setSelectedId(id);
    setPly(null);
    setMode({ kind: "study", branchId: id });
    if (!ideasFor(id)) void requestIdeas(id);
  }

  async function rebuild() {
    setRebuildPending(true);
    setRebuildError(null);
    try {
      const response = await fetch(`/api/openings/lines/${line.id}/rebuild`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setRebuildError(body?.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.`);
        return;
      }
      setMode({ kind: "browse" });
      setRebuilding(true);
    } catch {
      setRebuildError("Le serveur ne répond pas. Vérifie ta connexion puis réessaie.");
    } finally {
      setRebuildPending(false);
    }
  }

  function onBuilt() {
    setRebuilding(false);
    router.refresh();
  }

  if (active && mode.kind === "study" && !building) {
    return (
      <BranchStudy
        key={active.id}
        branch={active}
        rootFen={line.rootFen}
        playerColor={line.playerColor}
        entry={ideasFor(active.id)}
        onRequestIdeas={() => void requestIdeas(active.id)}
        onRecite={() => setMode({ kind: "recite", branchId: active.id })}
        onBack={() => setMode({ kind: "browse" })}
      />
    );
  }
  if (active && mode.kind === "recite" && !building) {
    return (
      <BranchRecite
        key={active.id}
        branch={active}
        rootFen={line.rootFen}
        playerColor={line.playerColor}
        onBack={() => setMode({ kind: "browse" })}
        onStudy={() => study(active.id)}
        onReviewed={() => router.refresh()}
      />
    );
  }

  const selectedIdeas = selected ? ideasFor(selected.id) : undefined;
  const boardFen = positions.fens[shownPly];
  const lastMove = shownPly > 0 && selected ? selected.pathUci[shownPly - 1] : null;
  const positionLabel =
    shownPly === 0
      ? "Position de départ de la ligne"
      : `Après ${moveNumber(positions.fens[shownPly - 1])}${positions.san[shownPly - 1]}${shownPly === lastPly ? " (fin de la branche)" : ""}`;

  return (
    <div className="space-y-6">
      {building ? (
        <BuildRunner lineId={line.id} initialExplorerUnavailable={line.explorerUnavailable} onReady={onBuilt} />
      ) : line.explorerUnavailable ? (
        <p className="text-sm text-muted-foreground">Explorateur Lichess indisponible : la ligne s&apos;appuie sur tes parties.</p>
      ) : null}

      <BoardLayout
        board={
          <ChessBoard
            id={`line-${line.id}`}
            fen={boardFen}
            orientation={line.playerColor === "w" ? "white" : "black"}
            highlightSquares={lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : undefined}
          />
        }
        controls={
          <div className="space-y-1.5">
            <nav aria-label="Navigation dans l'arbre" className="flex items-center justify-center gap-1.5 lg:justify-start">
              <Button variant="outline" size="sm" onClick={() => goTo(0)} disabled={shownPly === 0}>
                <ChevronsLeft data-icon="inline-start" />
                <span className="max-sm:sr-only">Position de départ</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => goTo(shownPly - 1)} disabled={shownPly === 0} aria-label="Coup précédent">
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goTo(shownPly + 1)}
                disabled={shownPly === lastPly}
                aria-label="Coup suivant"
              >
                <ChevronRight />
              </Button>
            </nav>
            <p className="tabular text-center text-sm text-muted-foreground lg:text-left" aria-live="polite">
              {positionLabel}
            </p>
          </div>
        }
      >
        <section aria-labelledby="tree-title" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="tree-title" className="text-lg font-bold tracking-tight text-primary">
              Branches
            </h2>
            <Button variant="outline" size="sm" onClick={() => void rebuild()} disabled={building || rebuildPending}>
              <RefreshCw data-icon="inline-start" />
              Mettre à jour la ligne
            </Button>
          </header>
          {rebuildError ? (
            <p role="alert" className="text-sm text-destructive">
              {rebuildError}
            </p>
          ) : null}
          {branches.length > 0 ? (
            <>
              <LineTree
                rootFen={line.rootFen}
                prefixSan={line.prefixSan}
                branches={branches}
                statuses={statuses}
                selectedId={selectedId}
                onSelect={selectBranch}
                shownPly={shownPly}
                onMove={showMove}
                onStart={() => goTo(0)}
              />
              <p className="text-xs text-muted-foreground">
                Clique sur un coup pour afficher sa position ; les flèches ← et → du clavier parcourent la branche.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {building
                ? "Les branches apparaîtront à la fin de la construction."
                : "Aucune branche : tes parties et l'explorateur ne donnent pas assez de réponses adverses depuis cette position."}
            </p>
          )}
        </section>

        {selected ? (
          <section aria-labelledby="branch-title" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
            <div className="space-y-1">
              <h2 id="branch-title" className="font-semibold text-primary">
                Branche sélectionnée
              </h2>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <StatusDot status={statuses[selected.id]} />
                <span>{BRANCH_STATUS_LABELS[statuses[selected.id]]}</span>
                {selected.studiedAt ? (
                  <span className="text-muted-foreground">
                    {statuses[selected.id] === "due" ? "" : `Prochaine révision : ${formatDate(selected.dueAt)}.`}
                  </span>
                ) : null}
              </p>
            </div>
            {selectedIdeas?.kind === "ready" ? (
              <div className="space-y-2">
                {!selectedIdeas.verified ? <UnverifiedNote /> : null}
                <h3 className="text-sm font-semibold text-primary">Le plan</h3>
                <p className="max-w-prose leading-relaxed">{selectedIdeas.ideas.plan}</p>
              </div>
            ) : null}
            {building ? (
              <p className="text-sm text-muted-foreground">L&apos;étude et la récitation seront disponibles à la fin de la construction.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => study(selected.id)}>Étudier</Button>
                <Button variant="outline" onClick={() => setMode({ kind: "recite", branchId: selected.id })}>
                  Réciter
                </Button>
              </div>
            )}
          </section>
        ) : null}
      </BoardLayout>
    </div>
  );
}
