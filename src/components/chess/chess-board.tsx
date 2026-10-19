"use client";

import { useMemo } from "react";
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
  /** Renvoie true si le coup est accepté (sinon la pièce revient). Promotion automatique en dame. */
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

  return (
    <div className={cn("aspect-square w-full overflow-hidden rounded-md shadow-sm ring-1 ring-border", className)}>
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
                return onPieceDrop(sourceSquare, targetSquare, isPromotion(piece.pieceType, targetSquare) ? "q" : undefined);
              }
            : undefined,
        }}
      />
    </div>
  );
}
