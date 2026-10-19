import { Chess } from "chess.js";
import type { EngineLine, ValidatedLine } from "./types";

export const MAX_LINE_PLIES = 8;

export type UciMove = { from: string; to: string; promotion?: string };

export function parseUci(uci: string): UciMove | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!match) return null;
  return match[3] ? { from: match[1], to: match[2], promotion: match[3] } : { from: match[1], to: match[2] };
}

/** Joue un coup UCI sur `chess` ; renvoie le coup chess.js ou null s'il est illégal. */
export function playUci(chess: Chess, uci: string) {
  const move = parseUci(uci);
  if (!move) return null;
  try {
    return chess.move(move);
  } catch {
    return null;
  }
}

/**
 * Convertit une variante UCI en SAN en la rejouant avec chess.js depuis `fen`.
 * La variante est tronquée au premier coup illégal (anomalie journalisée) et à `maxPlies`.
 */
export function uciLineToSan(fen: string, uci: readonly string[], maxPlies = MAX_LINE_PLIES): { san: string[]; uci: string[] } {
  const chess = new Chess(fen);
  const result = { san: [] as string[], uci: [] as string[] };
  for (const move of uci.slice(0, maxPlies)) {
    const played = playUci(chess, move);
    if (!played) {
      console.warn(`[analysis] Variante tronquée : coup illégal ${move} dans ${fen}`);
      break;
    }
    result.san.push(played.san);
    result.uci.push(move);
  }
  return result;
}

export function validateLine(fen: string, line: EngineLine, maxPlies = MAX_LINE_PLIES): ValidatedLine {
  return { evaluation: line.evaluation, ...uciLineToSan(fen, line.pvUci, maxPlies) };
}

/** UCI d'un coup chess.js (`e2e4`, `e7e8q`). */
export function moveToUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}
