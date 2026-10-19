import { Chess, type Square } from "chess.js";
import { isErrorClassification } from "./classify";
import { PIECE_VALUES, materialBalance } from "./material";
import { playUci } from "./lines";
import { isMateFor } from "./win";
import type { Classification, Color, Phase, Theme, Thresholds, ValidatedLine } from "./types";

export type ThemeInput = {
  fenBefore: string;
  fenAfter: string;
  color: Color; // camp qui a joué le coup
  ply: number;
  playedUci: string;
  candidates: readonly ValidatedLine[]; // MultiPV de la position avant (candidates[0] = meilleur coup)
  punishLine: ValidatedLine | null; // meilleure ligne adverse après le coup joué
  loss: number;
  classification: Classification;
  missedWin: boolean;
  phase: Phase;
  thresholds: Thresholds;
};

const THEME_ORDER: readonly Theme[] = [
  "tactics",
  "hanging_piece",
  "missed_tactic",
  "king_safety",
  "development",
  "bad_exchange",
  "endgame",
  "strategy",
  "calculation",
];

const MATERIAL_SWING = 2;
const SHORT_PLIES = 4;
const MINOR_START: Record<Color, Record<"n" | "b", readonly Square[]>> = {
  w: { n: ["b1", "g1"], b: ["c1", "f1"] },
  b: { n: ["b8", "g8"], b: ["c8", "f8"] },
};

const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

type LineReplay = {
  /** Bilan matériel de `color` après k demi-coups, moins le bilan initial (index 0 = position de départ). */
  swings: number[];
  sans: string[];
  froms: Square[];
  tos: Square[];
  checks: boolean[];
};

/** Rejoue une variante (déjà validée) et mesure l'évolution du matériel du point de vue de `color`. */
function replay(fen: string, uci: readonly string[], color: Color): LineReplay {
  const chess = new Chess(fen);
  const start = materialBalance(chess, color);
  const out: LineReplay = { swings: [0], sans: [], froms: [], tos: [], checks: [] };
  for (const move of uci) {
    const played = playUci(chess, move);
    if (!played) break;
    out.swings.push(materialBalance(chess, color) - start);
    out.sans.push(played.san);
    out.froms.push(played.from);
    out.tos.push(played.to);
    out.checks.push(played.san.includes("+") || played.san.includes("#"));
  }
  return out;
}

const swingAt = (r: LineReplay, plies: number) => r.swings[Math.min(plies, r.swings.length - 1)];
const containsMate = (r: LineReplay, plies: number) => r.sans.slice(0, plies).some((s) => s.includes("#"));
const mateWithin = (line: ValidatedLine, color: Color, moves: number) =>
  isMateFor(line.evaluation, color) && Math.abs(line.evaluation.mate ?? 0) <= moves;

function undevelopedMinors(chess: Chess, color: Color): number {
  let count = 0;
  for (const type of ["n", "b"] as const) {
    for (const square of MINOR_START[color][type]) {
      const piece = chess.get(square);
      if (piece && piece.color === color && piece.type === type) count++;
    }
  }
  return count;
}

function kingZone(chess: Chess, color: Color): Set<string> {
  const zone = new Set<string>();
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece || piece.type !== "k" || piece.color !== color) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
          const rr = r + dr;
          const ff = f + df;
          if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) zone.add(`${"abcdefgh"[ff]}${8 - rr}`);
        }
      }
    }
  }
  return zone;
}

/**
 * Thèmes déterministes (skill §5), uniquement pour les imprécisions, erreurs, gaffes et gains manqués.
 * Les variantes doivent déjà être validées par chess.js (voir `validateLine`).
 */
export function detectThemes(input: ThemeInput): Theme[] {
  const { fenBefore, fenAfter, color, ply, playedUci, candidates, punishLine, loss, phase: gamePhase, thresholds } = input;
  if (!isErrorClassification(input.classification) && !input.missedWin) return [];

  const themes = new Set<Theme>();
  const opponent = opposite(color);
  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);

  // Ligne punitive, mesurée du point de vue du joueur (swing négatif = l'adversaire gagne du matériel).
  const punish = punishLine ? replay(fenAfter, punishLine.uci, color) : null;
  const punishMate = punishLine !== null && (isMateFor(punishLine.evaluation, opponent) || containsMate(punish!, punishLine.uci.length));
  const opponentGainShort = punish ? -swingAt(punish, SHORT_PLIES) : 0;
  const opponentGainFull = punish ? -Math.min(...punish.swings) : 0;

  // tactics
  if (punish && (opponentGainShort >= MATERIAL_SWING || punishMate)) themes.add("tactics");

  // hanging_piece : la première réponse adverse prend une pièce attaquée et insuffisamment défendue.
  if (punish && punish.tos.length > 0) {
    const target = punish.tos[0];
    const victim = after.get(target);
    if (victim && victim.color === color && victim.type !== "p" && victim.type !== "k") {
      const attackers = after.attackers(target, opponent);
      const defenders = after.attackers(target, color);
      const cheapest = Math.min(...attackers.map((sq) => PIECE_VALUES[after.get(sq)?.type ?? "k"] || 100));
      if (attackers.length > 0 && (defenders.length === 0 || cheapest < PIECE_VALUES[victim.type])) themes.add("hanging_piece");
    }
  }

  // missed_tactic : le meilleur coup gagnait du matériel ou matait vite, pas le coup joué.
  const best = candidates[0];
  if (best && best.uci.length > 0 && best.uci[0] !== playedUci) {
    const bestReplay = replay(fenBefore, best.uci, color);
    const bestWins =
      swingAt(bestReplay, SHORT_PLIES) >= MATERIAL_SWING || mateWithin(best, color, 2) || containsMate(bestReplay, SHORT_PLIES);
    if (bestWins) {
      const playedLine = [playedUci, ...(punishLine?.uci ?? [])];
      const playedReplay = replay(fenBefore, playedLine, color);
      const playedWins = swingAt(playedReplay, SHORT_PLIES) >= MATERIAL_SWING || containsMate(playedReplay, SHORT_PLIES);
      if (!playedWins) themes.add("missed_tactic");
    }
  }

  // king_safety : échecs répétés ou incursions autour du roi dans la ligne punitive.
  if (punish) {
    const zone = kingZone(after, color);
    let checks = 0;
    let intrusions = 0;
    for (let i = 0; i < punish.sans.length; i += 2) {
      if (punish.checks[i]) checks++;
      if (zone.has(punish.tos[i])) intrusions++;
    }
    if (checks >= 2 || intrusions >= 2 || punishMate) themes.add("king_safety");
  }

  // development
  if (gamePhase === "opening") {
    const from = playedUci.slice(0, 2) as Square;
    const piece = before.get(from);
    const rightsBefore = before.getCastlingRights(color);
    const rightsAfter = after.getCastlingRights(color);
    const playedMove = playUci(new Chess(fenBefore), playedUci);
    const isCastle = playedMove !== null && (playedMove.isKingsideCastle() || playedMove.isQueensideCastle());
    const lostCastling =
      !isCastle &&
      ((rightsBefore.k && !rightsAfter.k) || (rightsBefore.q && !rightsAfter.q)) &&
      !(rightsAfter.k || rightsAfter.q);
    const undeveloped = undevelopedMinors(after, color);
    const earlyQueen = piece?.type === "q" && ply <= 16 && undeveloped >= 2;
    const repeatMinor =
      piece !== undefined && (piece.type === "n" || piece.type === "b") && !MINOR_START[color][piece.type].includes(from) && undeveloped >= 2;
    const lateDevelopment = ply >= 16 && undeveloped >= 2;
    if (earlyQueen || lostCastling || repeatMinor || lateDevelopment) themes.add("development");
  }

  // bad_exchange : capture dont le bilan matériel (coup + 4 demi-coups) est négatif.
  {
    const playedMove = playUci(new Chess(fenBefore), playedUci);
    if (playedMove?.captured) {
      const exchange = replay(fenBefore, [playedUci, ...(punishLine?.uci ?? [])], color);
      if (swingAt(exchange, SHORT_PLIES + 1) <= -1) themes.add("bad_exchange");
    }
  }

  if (gamePhase === "endgame") themes.add("endgame");

  // strategy : perte significative sans gain matériel adverse ni mat.
  if (loss >= thresholds.inaccuracy && opponentGainFull <= 1 && !punishMate) themes.add("strategy");

  // calculation : coup joué parmi les candidats 2-3, ou réfutation qui n'apparaît qu'au-delà de 4 demi-coups.
  const playedRank = candidates.findIndex((c) => c.uci[0] === playedUci);
  const lateRefutation = punish !== null && punish.sans.length >= 6 && opponentGainShort < MATERIAL_SWING && opponentGainFull >= MATERIAL_SWING;
  if (playedRank === 1 || playedRank === 2 || lateRefutation) themes.add("calculation");

  return THEME_ORDER.filter((t) => themes.has(t));
}
