import { Chess } from "chess.js";
import { classifyMove, gameAccuracy, type ClassifyMoveResult } from "./classify";
import { moveToUci, playUci, uciLineToSan, validateLine } from "./lines";
import { phase } from "./phase";
import { detectThemes } from "./themes";
import type {
  Classification,
  Color,
  Evaluation,
  GameAnalysisSummary,
  MoveAnalysis,
  PositionAnalysis,
  Thresholds,
  ValidatedLine,
} from "./types";

export type GameMove = {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  legalMoveCount: number; // coups légaux dans la position avant
};

export type GamePositions = {
  /** N+1 positions : positions[i] = position avant le demi-coup i+1 ; la dernière est la position finale. */
  fens: string[];
  moves: GameMove[];
};

/** Rejoue le PGN avec chess.js et renvoie les N+1 positions. Lève une erreur si le PGN est illisible. */
export function extractPositions(pgn: string): GamePositions {
  const parsed = new Chess();
  try {
    parsed.loadPgn(pgn);
  } catch (error) {
    throw new Error(`PGN illisible : ${error instanceof Error ? error.message : String(error)}`);
  }
  const history = parsed.history({ verbose: true });
  const startFen = history[0]?.before ?? parsed.fen();

  const chess = new Chess(startFen);
  const fens = [chess.fen()];
  const moves: GameMove[] = [];
  history.forEach((move, index) => {
    const legalMoveCount = chess.moves().length;
    const fenBefore = chess.fen();
    chess.move(move.san);
    const fenAfter = chess.fen();
    fens.push(fenAfter);
    moves.push({ ply: index + 1, color: move.color, san: move.san, uci: moveToUci(move), fenBefore, fenAfter, legalMoveCount });
  });
  return { fens, moves };
}

/** Évaluation retenue pour une position : règles si terminale, sinon meilleure ligne MultiPV. */
export function bestEvaluation(analysis: PositionAnalysis): Evaluation {
  if (analysis.terminal) return analysis.terminal.evaluation;
  const best = analysis.lines[0];
  if (!best) throw new Error(`Analyse sans ligne moteur pour ${analysis.fen}`);
  return best.evaluation;
}

export type CandidateEvaluation = ClassifyMoveResult & {
  san: string;
  uci: string;
  isBest: boolean;
  bestUci: string | null;
  bestSan: string | null;
  punishLine: ValidatedLine | null;
};

/**
 * Juge un coup proposé (entraînement) avec les règles de perte de la skill §4.
 * `before` = analyse de `fenBefore`, `after` = analyse de la position après le coup.
 * Renvoie null si le coup est illégal.
 */
export function evaluateCandidateMove(
  fenBefore: string,
  uci: string,
  before: PositionAnalysis,
  after: PositionAnalysis,
  thresholds: Thresholds,
): CandidateEvaluation | null {
  const chess = new Chess(fenBefore);
  const legalMoveCount = chess.moves().length;
  const played = playUci(chess, uci);
  if (!played) return null;

  const bestUci = before.lines[0]?.pvUci[0] ?? null;
  const bestSan = bestUci ? (uciLineToSan(fenBefore, [bestUci], 1).san[0] ?? null) : null;
  const fenAfter = chess.fen();
  const result = classifyMove({
    color: played.color,
    evalBefore: bestEvaluation(before),
    evalAfter: bestEvaluation(after),
    playedUci: uci,
    bestUci,
    legalMoveCount,
    thresholds,
  });
  return {
    ...result,
    san: played.san,
    uci,
    isBest: bestUci === uci,
    bestUci,
    bestSan,
    punishLine: after.lines[0] ? validateLine(fenAfter, after.lines[0]) : null,
  };
}

/** Analyse d'un demi-coup à partir des analyses moteur de la position avant et après. */
export function analyzeMove(
  move: GameMove,
  before: PositionAnalysis,
  after: PositionAnalysis,
  playerColor: Color,
  thresholds: Thresholds,
): MoveAnalysis {
  const candidates = before.lines.map((line) => validateLine(move.fenBefore, line)).filter((line) => line.uci.length > 0);
  const bestUci = candidates[0]?.uci[0] ?? null;
  const bestSan = candidates[0]?.san[0] ?? null;
  const punishLine = after.lines[0] ? validateLine(move.fenAfter, after.lines[0]) : null;
  const evalBefore = bestEvaluation(before);
  const evalAfter = bestEvaluation(after);

  const result = classifyMove({
    color: move.color,
    evalBefore,
    evalAfter,
    playedUci: move.uci,
    bestUci,
    legalMoveCount: move.legalMoveCount,
    thresholds,
  });
  const movePhase = phase(move.fenBefore, move.ply);
  const themes = detectThemes({
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    color: move.color,
    ply: move.ply,
    playedUci: move.uci,
    candidates,
    punishLine: punishLine && punishLine.uci.length > 0 ? punishLine : null,
    loss: result.loss,
    classification: result.classification,
    missedWin: result.missedWin,
    phase: movePhase,
    thresholds,
  });

  return {
    ply: move.ply,
    color: move.color,
    isPlayerMove: move.color === playerColor,
    san: move.san,
    uci: move.uci,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    evalBefore,
    evalAfter,
    bestUci,
    bestSan,
    candidates,
    punishLine,
    winBefore: result.winBefore,
    winAfter: result.winAfter,
    loss: result.loss,
    accuracy: result.accuracy,
    classification: result.classification,
    missedWin: result.missedWin,
    missedSave: result.missedSave,
    phase: movePhase,
    themes,
  };
}

const CLASSIFICATIONS: readonly Classification[] = ["forced", "best", "excellent", "good", "inaccuracy", "mistake", "blunder"];

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;
}

export function summarizeMoves(moves: readonly MoveAnalysis[]): GameAnalysisSummary {
  const side = (isPlayer: boolean) => {
    const own = moves.filter((m) => m.isPlayerMove === isPlayer);
    const counts = emptyCounts();
    for (const m of own) counts[m.classification]++;
    return { ...counts, missedWin: own.filter((m) => m.missedWin).length, accuracy: gameAccuracy(own.map((m) => m.accuracy)) };
  };
  return { player: side(true), opponent: side(false) };
}

/**
 * Analyse complète d'une partie. `positionAnalyses` doit contenir les N+1 analyses,
 * dans l'ordre des positions renvoyées par `extractPositions(pgn).fens`.
 */
export function buildGameAnalysis(
  pgn: string,
  playerColor: Color,
  positionAnalyses: readonly PositionAnalysis[],
  thresholds: Thresholds,
): { moves: MoveAnalysis[]; summary: GameAnalysisSummary } {
  const { fens, moves } = extractPositions(pgn);
  if (positionAnalyses.length !== fens.length) {
    throw new Error(`Analyses attendues : ${fens.length}, reçues : ${positionAnalyses.length}`);
  }
  positionAnalyses.forEach((analysis, i) => {
    if (analysis.fen !== fens[i]) throw new Error(`Analyse ${i} décalée : ${analysis.fen} au lieu de ${fens[i]}`);
  });
  const analyzed = moves.map((move, i) => analyzeMove(move, positionAnalyses[i], positionAnalyses[i + 1], playerColor, thresholds));
  return { moves: analyzed, summary: summarizeMoves(analyzed) };
}
