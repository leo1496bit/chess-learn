"use client";

import { useEffect, useRef } from "react";
import { CLASSIFICATION_META, MISSED_WIN_META } from "@/components/chess/classification-badge";
import type { Classification } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

export type MoveListItem = {
  ply: number;
  san: string;
  classification?: Classification;
  missedWin?: boolean;
  /** Coup du joueur : mis en valeur dans la liste. */
  isPlayerMove?: boolean;
  /** Place dans la théorie : coup du livre d'ouvertures, ou premier coup qui en sort. */
  theory?: { kind: "book"; name: string | null } | { kind: "deviation" };
};

const ANNOTATION_TEXT: Partial<Record<Classification, string>> = {
  inaccuracy: "text-cls-inaccuracy",
  mistake: "text-cls-mistake",
  blunder: "text-cls-blunder",
};

function annotation(item: MoveListItem): { symbol: string; label: string; text: string } | null {
  const text = item.classification ? ANNOTATION_TEXT[item.classification] : undefined;
  if (item.classification && text) return { ...CLASSIFICATION_META[item.classification], text };
  if (item.missedWin) return { ...MISSED_WIN_META, text: "text-cls-missed" };
  return null;
}

/**
 * Feuille de notation : une ligne par numéro de coup, Blancs puis Noirs.
 * Les imprécisions, erreurs, gaffes et gains manqués portent leur symbole d'annotation ; les coups
 * théoriques sont teintés et la sortie de théorie est marquée d'un filet.
 * `currentPly` 0 = position initiale.
 */
export function MoveList({
  moves,
  currentPly,
  onSelect,
  className,
}: {
  moves: readonly MoveListItem[];
  currentPly: number;
  onSelect: (ply: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>(`[data-ply="${currentPly}"]`);
    if (!container || !active) return;
    // La liste est `relative` : offsetTop est mesuré depuis son bord supérieur.
    const top = active.offsetTop;
    if (top < container.scrollTop || top + active.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: top - container.clientHeight / 2, behavior: "smooth" });
    }
  }, [currentPly]);

  const rows: { number: number; white?: MoveListItem; black?: MoveListItem }[] = [];
  for (const move of moves) {
    const number = Math.ceil(move.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || row.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (move.ply % 2 === 1) row.white = move;
    else row.black = move;
  }

  return (
    <ol ref={containerRef} aria-label="Coups de la partie" className={cn("relative overflow-y-auto text-sm", className)}>
      {rows.map((row) => (
        <li key={row.number} className="grid grid-cols-[2.5rem_1fr_1fr] border-b border-border/60 last:border-b-0">
          <span className="tabular py-1.5 pr-2 text-right text-muted-foreground">{row.number}.</span>
          <MoveCell item={row.white} active={row.white?.ply === currentPly} onSelect={onSelect} />
          <MoveCell item={row.black} active={row.black?.ply === currentPly} onSelect={onSelect} />
        </li>
      ))}
    </ol>
  );
}

function MoveCell({ item, active, onSelect }: { item?: MoveListItem; active: boolean; onSelect: (ply: number) => void }) {
  if (!item) return <span />;
  const meta = annotation(item);
  const theoryLabel =
    item.theory?.kind === "book"
      ? `Coup théorique${item.theory.name ? ` : ${item.theory.name}` : ""}`
      : item.theory?.kind === "deviation"
        ? "Sortie de la théorie"
        : undefined;
  return (
    <button
      type="button"
      data-ply={item.ply}
      aria-current={active ? "step" : undefined}
      title={theoryLabel}
      onClick={() => onSelect(item.ply)}
      className={cn(
        "flex items-baseline gap-0.5 border-l-2 border-transparent px-2 py-1.5 text-left transition-colors hover:bg-accent",
        item.isPlayerMove ? "font-semibold text-foreground" : "text-foreground/80",
        item.theory?.kind === "book" && "bg-board-light/45",
        item.theory?.kind === "deviation" && "border-cls-inaccuracy",
        active && "bg-primary text-primary-foreground hover:bg-primary",
      )}
    >
      <span>{item.san}</span>
      {theoryLabel ? <span className="sr-only"> ({theoryLabel})</span> : null}
      {meta ? (
        <span
          title={meta.label}
          className={cn("text-xs font-bold", active ? "text-primary-foreground" : meta.text)}
        >
          {meta.symbol}
          <span className="sr-only"> {meta.label}</span>
        </span>
      ) : null}
    </button>
  );
}
