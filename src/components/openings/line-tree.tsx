"use client";

import { useMemo } from "react";
import {
  BRANCH_STATUS_LABELS,
  buildLineTree,
  replyGamesLabel,
  type BranchStatus,
  type LinePageBranch,
  type TreeMove,
  type TreeSegment,
} from "@/lib/repertoire/line-view";
import { cn } from "@/lib/utils";

const DOT_CLASS: Record<BranchStatus, string> = {
  new: "border border-muted-foreground bg-transparent",
  due: "bg-cls-inaccuracy",
  mastered: "bg-cls-best",
};

export function StatusDot({ status }: { status: BranchStatus }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT_CLASS[status])} />;
}

/** Coups avant la position de départ de la ligne, numérotés depuis la position initiale. */
export function formatPrefix(prefixSan: readonly string[]): string {
  return prefixSan.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(" ");
}

type TreeProps = {
  rootFen: string;
  prefixSan: string[];
  branches: LinePageBranch[];
  statuses: Record<string, BranchStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Demi-coups joués depuis la position de départ dans la position affichée (sur la branche sélectionnée). */
  shownPly: number;
  /** Clic sur un coup : afficher la position qui suit ce coup. */
  onMove: (move: TreeMove) => void;
  /** Clic sur les coups de départ : revenir à la position de départ de la ligne. */
  onStart: () => void;
};

/** Arbre de la ligne façon feuille de notation : tronc commun, puis variantes en retrait. */
export function LineTree({ rootFen, prefixSan, branches, statuses, selectedId, onSelect, shownPly, onMove, onStart }: TreeProps) {
  const tree = useMemo(() => buildLineTree(rootFen, branches), [rootFen, branches]);
  const selected = branches.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-2">
      {prefixSan.length > 0 ? (
        <p className="text-sm">
          <button
            type="button"
            onClick={onStart}
            aria-current={shownPly === 0 ? "true" : undefined}
            className={cn(
              "tabular rounded px-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              shownPly === 0 && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <span className="sr-only">Position de départ, après les coups </span>
            {formatPrefix(prefixSan)}
          </button>
        </p>
      ) : null}
      <SegmentList
        segments={tree}
        depth={0}
        selectedSan={selected?.pathSan ?? null}
        onPath={selected !== null}
        statuses={statuses}
        branches={branches}
        selectedId={selectedId}
        onSelect={onSelect}
        shownPly={shownPly}
        onMove={onMove}
        root
      />
      <p className="text-xs text-muted-foreground">
        En gras : tes coups. Le nombre de parties indique combien de fois l&apos;adversaire a joué cette réponse contre toi ;
        « Lichess » : réponse courante sur Lichess que tu n&apos;as pas encore rencontrée.
      </p>
    </div>
  );
}

type ListProps = {
  segments: TreeSegment[];
  depth: number;
  /** Chemin SAN de la branche sélectionnée, pour souligner son parcours. */
  selectedSan: string[] | null;
  /** Le segment parent appartient au parcours sélectionné. */
  onPath: boolean;
  statuses: Record<string, BranchStatus>;
  branches: LinePageBranch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  shownPly: number;
  onMove: (move: TreeMove) => void;
  root?: boolean;
};

function SegmentList({ segments, root, ...props }: ListProps) {
  return (
    <ul className={cn("space-y-1.5", !root && "mt-1.5 ml-1 border-l-2 border-border pl-3")}>
      {segments.map((segment) => (
        <SegmentItem key={`${segment.moves[0].index}-${segment.moves[0].san}`} segment={segment} {...props} />
      ))}
    </ul>
  );
}

function SegmentItem({ segment, selectedSan, onPath, ...props }: Omit<ListProps, "segments" | "root"> & { segment: TreeSegment }) {
  const onSelectedPath = (i: number) =>
    onPath && selectedSan !== null && segment.moves.slice(0, i + 1).every((m) => selectedSan[m.index] === m.san);
  const childrenOnPath = onSelectedPath(segment.moves.length - 1);
  const byId = new Map(props.branches.map((b) => [b.id, b]));

  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 leading-relaxed">
        {segment.moves.map((move, i) => {
          const current = onSelectedPath(i) && props.shownPly === move.index + 1;
          return (
            <span key={move.index} className="tabular whitespace-nowrap">
              <button
                type="button"
                onClick={() => props.onMove(move)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "rounded px-0.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  onSelectedPath(i) && "bg-accent",
                  current && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {move.number ? <span className={current ? undefined : "text-muted-foreground"}>{move.number} </span> : null}
                <span className={cn(move.isPlayer && "font-bold", move.isPlayer && !current && "text-primary")}>{move.san}</span>
              </button>
              {move.ownGames !== null ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  {replyGamesLabel(move.ownGames)}
                </span>
              ) : null}
            </span>
          );
        })}
        {segment.branchIds.map((id) => {
          const branch = byId.get(id);
          const status = props.statuses[id] ?? "new";
          const active = props.selectedId === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => props.onSelect(id)}
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "border-primary bg-primary text-primary-foreground hover:bg-primary" : "bg-card",
              )}
            >
              <StatusDot status={status} />
              <span>{BRANCH_STATUS_LABELS[status]}</span>
              {branch ? <span className="sr-only">, branche de {branch.pathSan.length} demi-coups</span> : null}
            </button>
          );
        })}
      </div>
      {segment.children.length > 0 ? (
        <SegmentList segments={segment.children} selectedSan={selectedSan} onPath={childrenOnPath} {...props} depth={props.depth + 1} />
      ) : null}
    </li>
  );
}
