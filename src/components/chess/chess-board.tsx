"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";
import { cn } from "@/lib/utils";

export type BoardArrow = { from: string; to: string; color?: string };

/** Couleurs des flèches (attribut SVG : valeurs littérales, pas de variables CSS). */
export const ARROW_COLORS = {
  best: "rgb(31 122 77 / 0.85)",
  played: "rgb(180 35 24 / 0.75)",
  neutral: "rgb(79 99 144 / 0.8)",
} as const;

export type ChessBoardProps = {
  fen: string;
  orientation?: "white" | "black";
  arrows?: BoardArrow[];
  highlightSquares?: string[];
  /** Renvoie true si le coup est accepté (sinon la pièce revient). Une promotion ouvre le choix de la pièce. */
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean;
  interactive?: boolean;
  id?: string;
  className?: string;
};

const LIGHT = { backgroundColor: "var(--board-light)" };
const DARK = { backgroundColor: "var(--board-dark)" };
const HIGHLIGHT = { backgroundColor: "var(--board-highlight)" };

function isPromotion(pieceType: string, to: string) {
  return (pieceType === "wP" && to.endsWith("8")) || (pieceType === "bP" && to.endsWith("1"));
}

const PROMOTION_PIECES = [
  { code: "q", label: "Dame", white: "♕", black: "♛" },
  { code: "r", label: "Tour", white: "♖", black: "♜" },
  { code: "b", label: "Fou", white: "♗", black: "♝" },
  { code: "n", label: "Cavalier", white: "♘", black: "♞" },
] as const;

type PendingPromotion = { from: string; to: string; color: "w" | "b" };

function PromotionPicker({
  pending,
  onPick,
  onCancel,
}: {
  pending: PendingPromotion;
  onPick: (piece: string) => void;
  onCancel: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choisir la pièce de promotion"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className="space-y-3 rounded-lg border bg-card p-4 text-center shadow-lg">
        <p className="text-sm font-semibold text-primary">Promouvoir le pion en</p>
        <div className="flex gap-2">
          {PROMOTION_PIECES.map((piece, i) => (
            <button
              key={piece.code}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onPick(piece.code)}
              className="flex size-14 flex-col items-center justify-center rounded-md border bg-background hover:bg-accent"
            >
              <span aria-hidden className="text-3xl leading-none">
                {pending.color === "w" ? piece.white : piece.black}
              </span>
              <span className="text-[0.6875rem] text-muted-foreground">{piece.label}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">
          Annuler
        </button>
      </div>
    </div>
  );
}

export function ChessBoard({
  fen,
  orientation = "white",
  arrows,
  highlightSquares,
  onPieceDrop,
  interactive = false,
  id = "board",
  className,
}: ChessBoardProps) {
  const boardArrows = useMemo(
    () => (arrows ?? []).map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? ARROW_COLORS.neutral })),
    [arrows],
  );
  const squareStyles = useMemo(
    () => Object.fromEntries((highlightSquares ?? []).map((square) => [square, HIGHLIGHT])),
    [highlightSquares],
  );
  const canMove = interactive && onPieceDrop !== undefined;
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-md shadow-sm ring-1 ring-border", className)}>
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          arrows: boardArrows,
          squareStyles,
          lightSquareStyle: LIGHT,
          darkSquareStyle: DARK,
          allowDragging: canMove,
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          animationDurationInMs: 150,
          onPieceDrop: canMove
            ? ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
                if (!targetSquare || targetSquare === sourceSquare) return false;
                if (isPromotion(piece.pieceType, targetSquare)) {
                  // Le pion revient le temps de choisir la pièce ; le coup est joué au choix.
                  setPromotion({ from: sourceSquare, to: targetSquare, color: piece.pieceType.startsWith("w") ? "w" : "b" });
                  return false;
                }
                return onPieceDrop(sourceSquare, targetSquare);
              }
            : undefined,
        }}
      />
      {promotion && canMove ? (
        <PromotionPicker
          pending={promotion}
          onPick={(piece) => {
            setPromotion(null);
            onPieceDrop(promotion.from, promotion.to, piece);
          }}
          onCancel={() => setPromotion(null)}
        />
      ) : null}
    </div>
  );
}
