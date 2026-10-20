// Positions d'ouverture d'une partie : une ligne par demi-coup joué (position AVANT le coup). Pur.
import { Chess } from "chess.js";
import type { Color } from "@/lib/analysis/types";
import { toEpd } from "@/lib/openings/identify";
import { INDEX_PLIES } from "./constants";

export type GamePosition = {
  ply: number;
  /** Position avant le coup, sans les compteurs. */
  epd: string;
  sideToMove: Color;
  /** Coups UCI menant à la position, séparés par des espaces ("" à la position initiale). */
  pathUci: string;
  moveUci: string;
  moveSan: string;
};

/** Renvoie [] si le PGN est invalide ou ne contient aucun coup. */
export function openingPositions(pgn: string, maxPlies: number = INDEX_PLIES): GamePosition[] {
  let moves;
  try {
    const parsed = new Chess();
    parsed.loadPgn(pgn);
    moves = parsed.history({ verbose: true });
  } catch {
    return [];
  }
  return moves.slice(0, maxPlies).map((move, ply) => {
    const uci = (m: { from: string; to: string; promotion?: string }) => `${m.from}${m.to}${m.promotion ?? ""}`;
    return {
      ply,
      epd: toEpd(move.before),
      sideToMove: move.color,
      pathUci: moves.slice(0, ply).map(uci).join(" "),
      moveUci: uci(move),
      moveSan: move.san,
    };
  });
}
