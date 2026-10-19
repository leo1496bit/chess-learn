"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CLASSIFICATION_META } from "@/components/chess/classification-badge";
import { formatEvaluation } from "@/lib/analysis/win";
import type { MoveAnalysis } from "@/lib/analysis/types";

const HEIGHT = 140;
const PAD_Y = 6;
const MARKER_FILL: Record<string, string> = {
  inaccuracy: "var(--cls-inaccuracy)",
  mistake: "var(--cls-mistake)",
  blunder: "var(--cls-blunder)",
  missed: "var(--cls-missed)",
};

/** % de gain des Blancs pour chaque position (0 = initiale, i = après le demi-coup i). */
export function whiteWinSeries(moves: readonly MoveAnalysis[]): number[] {
  if (moves.length === 0) return [50];
  const first = moves[0];
  const start = first.color === "w" ? first.winBefore : 100 - first.winBefore;
  return [start, ...moves.map((m) => (m.color === "w" ? m.winAfter : 100 - m.winAfter))];
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Courbe d'évaluation cliquable, avec les erreurs marquées sur la courbe. */
export function EvalGraph({
  moves,
  currentPly,
  onSelect,
}: {
  moves: readonly MoveAnalysis[];
  currentPly: number;
  onSelect: (ply: number) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const series = whiteWinSeries(moves);
  const steps = Math.max(1, series.length - 1);
  const x = (ply: number) => (ply / steps) * width;
  const y = (win: number) => PAD_Y + ((100 - win) / 100) * (HEIGHT - 2 * PAD_Y);

  const curve = series.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(" ");
  const area = `${curve} L${x(steps).toFixed(1)},${HEIGHT} L0,${HEIGHT} Z`;

  const markers = moves.flatMap((m) => {
    const kind = m.classification === "inaccuracy" || m.classification === "mistake" || m.classification === "blunder" ? m.classification : m.missedWin ? "missed" : null;
    return kind ? [{ move: m, kind }] : [];
  });

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    onSelect(Math.max(0, Math.min(steps, Math.round(ratio * steps))));
  };

  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Évolution de l'évaluation au fil de la partie. Cliquez pour aller au coup."
          onClick={handleClick}
          className="block cursor-pointer overflow-visible rounded-md"
        >
          <rect width={width} height={HEIGHT} fill="var(--eval-black)" rx={6} />
          <path d={area} fill="var(--eval-white)" />
          <line x1={0} x2={width} y1={y(50)} y2={y(50)} stroke="var(--board-dark)" strokeDasharray="3 4" strokeWidth={1} />
          <path d={curve} fill="none" stroke="var(--chart-2)" strokeWidth={1.5} />
          <line x1={x(currentPly)} x2={x(currentPly)} y1={0} y2={HEIGHT} stroke="var(--chart-4)" strokeWidth={2} />
          {markers.map(({ move, kind }) => (
            <circle
              key={move.ply}
              cx={x(move.ply)}
              cy={y(series[move.ply])}
              r={move.isPlayerMove ? 5 : 3.5}
              fill={move.isPlayerMove ? MARKER_FILL[kind] : "var(--card)"}
              stroke={MARKER_FILL[kind]}
              strokeWidth={move.isPlayerMove ? 1.5 : 2}
            >
              <title>
                {`${Math.ceil(move.ply / 2)}${move.color === "w" ? "." : "..."} ${move.san} : ${
                  kind === "missed" ? "gain manqué" : CLASSIFICATION_META[move.classification].label.toLowerCase()
                } (${formatEvaluation(move.evalBefore, move.color)} → ${formatEvaluation(move.evalAfter, move.color === "w" ? "b" : "w")})`}
              </title>
            </circle>
          ))}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
    </div>
  );
}
