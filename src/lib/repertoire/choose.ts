// Choix du coup de Leonel dans une ligne de répertoire, catégorie de la ligne, fin de branche.
// Fonctions pures : le livre est passé en paramètre, les évaluations sont au point de vue Blancs.
import { Chess } from "chess.js";
import { moveToUci } from "@/lib/analysis/lines";
import { phase } from "@/lib/analysis/phase";
import { terminalAnalysis } from "@/lib/analysis/terminal";
import type { Color, Evaluation, PositionAnalysis } from "@/lib/analysis/types";
import { moverWinPercent } from "@/lib/analysis/win";
import type { ExplorerResult } from "@/lib/lichess/explorer";
import { toEpd, type OpeningBook } from "@/lib/openings/identify";
import {
  EXPLORER_MIN_SHARE,
  GAMBIT_PUNISH_WIN,
  MAX_PLY,
  NEAR_BEST_LOSS,
  OWN_MIN_GAMES,
  PLAYER_CANDIDATES,
  PUNISH_LOSS,
  THIN_EXPLORER_GAMES,
} from "./constants";
import { byUciOrder } from "./replies";

/** Coups candidats de Leonel (UCI) : livre et explorateur d'abord, puis part de l'explorateur. */
export function playerCandidates(
  fen: string,
  book: OpeningBook,
  explorer: ExplorerResult | null,
): string[] {
  const shares = new Map<string, number>();
  for (const move of explorer?.moves ?? []) {
    if (move.share >= EXPLORER_MIN_SHARE) shares.set(move.uci, move.share);
  }

  const chess = new Chess(fen);
  const scored: { uci: string; both: boolean; share: number }[] = [];
  for (const move of chess.moves({ verbose: true })) {
    const uci = moveToUci(move);
    const inBook = toEpd(move.after) in book;
    const share = shares.get(uci);
    if (!inBook && share === undefined) continue;
    scored.push({ uci, both: inBook && share !== undefined, share: share ?? 0 });
  }
  scored.sort((a, b) => Number(b.both) - Number(a.both) || b.share - a.share || byUciOrder(a.uci, b.uci));
  return scored.slice(0, PLAYER_CANDIDATES).map((s) => s.uci);
}

/**
 * Premier candidat (dans l'ordre) dont la perte est < NEAR_BEST_LOSS, sinon le meilleur coup.
 * `candidates` : coups candidats (UCI) dans l'ordre de priorité (voir `playerCandidates`). L'évaluation
 * d'un candidat vient de sa ligne MultiPV si elle existe, sinon de `candidateEvals` (position après le
 * candidat, point de vue Blancs) ; sans évaluation, le candidat est ignoré.
 * `analysis.lines` ne doit pas être vide : les appelants testent `branchEnds` avant (lève une erreur sinon).
 */
export function choosePlayerMove(
  analysis: PositionAnalysis,
  candidateEvals: Map<string, Evaluation>,
  color: Color,
  candidates: string[],
): { uci: string; fromBook: boolean } {
  const best = analysis.lines[0];
  if (!best) throw new Error("choosePlayerMove : aucune ligne d'analyse (position terminale ?)");
  const bestUci = best.pvUci[0];
  const bestWin = moverWinPercent(best.evaluation, color);

  for (const uci of candidates) {
    const line = analysis.lines.find((l) => l.pvUci[0] === uci);
    const evaluation = line?.evaluation ?? candidateEvals.get(uci);
    if (!evaluation) continue;
    const loss = Math.max(0, bestWin - moverWinPercent(evaluation, color));
    if (loss < NEAR_BEST_LOSS) return { uci, fromBook: true };
  }
  // Le meilleur coup, s'il était candidat, a une perte nulle et est déjà retenu plus haut.
  return { uci: bestUci, fromBook: false };
}

/** Candidats absents de la MultiPV : leur position d'arrivée doit être évaluée. */
export function candidatesNeedingEval(analysis: PositionAnalysis, candidates: string[]): string[] {
  const known = new Set(analysis.lines.map((l) => l.pvUci[0]));
  return candidates.filter((uci) => !known.has(uci));
}

/** `lossOfDefiningMove` et `playerWinAtRoot` sont tous deux du point de vue de Leonel. */
export function lineKind(input: {
  lossOfDefiningMove: number;
  bookName: string | null;
  playerWinAtRoot: number;
}): "punish" | "master" {
  if (input.lossOfDefiningMove >= PUNISH_LOSS) return "punish";
  if (input.bookName?.includes("Gambit") && input.playerWinAtRoot >= GAMBIT_PUNISH_WIN) return "punish";
  return "master";
}

/** `ply` est compté depuis la position initiale, préfixe compris. */
export function branchEnds(input: {
  fen: string;
  ply: number;
  ownGames: number;
  explorerTotal: number | null;
}): boolean {
  if (terminalAnalysis(input.fen) !== null) return true;
  if (phase(input.fen, input.ply) !== "opening") return true;
  if (input.ply >= MAX_PLY) return true;
  return (
    input.explorerTotal !== null &&
    input.explorerTotal < THIN_EXPLORER_GAMES &&
    input.ownGames < OWN_MIN_GAMES
  );
}
