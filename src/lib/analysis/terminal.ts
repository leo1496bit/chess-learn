import { Chess } from "chess.js";
import { ENGINE_VERSION, type PositionAnalysis } from "./types";

/**
 * Position terminale évaluée par les règles (sans moteur) : mat → `mate: 0`
 * (le camp au trait est maté), pat ou matériel insuffisant → 0 cp. Sinon null.
 */
export function terminalAnalysis(fen: string, depth = 0, multipv = 1): PositionAnalysis | null {
  const chess = new Chess(fen);
  let terminal: PositionAnalysis["terminal"];
  if (chess.isCheckmate()) terminal = { evaluation: { cp: null, mate: 0 }, reason: "checkmate" };
  else if (chess.isStalemate()) terminal = { evaluation: { cp: 0, mate: null }, reason: "stalemate" };
  else if (chess.isInsufficientMaterial()) terminal = { evaluation: { cp: 0, mate: null }, reason: "draw" };
  else return null;
  return { fen, depth, multipv, engineVersion: ENGINE_VERSION, lines: [], terminal };
}
