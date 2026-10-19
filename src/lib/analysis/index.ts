// Fonctions pures d'analyse (skill chess-analysis). Utilisables côté serveur comme navigateur.
export * from "./types";
export { winPercent, moverWinPercent, evaluationForColor, isMateFor, formatEvaluation } from "./win";
export {
  classifyMove,
  classifyByLoss,
  moveAccuracy,
  gameAccuracy,
  isErrorClassification,
  type ClassifyMoveInput,
  type ClassifyMoveResult,
} from "./classify";
export { phase } from "./phase";
export { detectThemes, type ThemeInput } from "./themes";
export { uciLineToSan, validateLine, parseUci, playUci, moveToUci, MAX_LINE_PLIES } from "./lines";
export { PIECE_VALUES, materialOf, materialBalance, nonPawnMaterial } from "./material";
export { terminalAnalysis } from "./terminal";
export {
  extractPositions,
  bestEvaluation,
  evaluateCandidateMove,
  analyzeMove,
  summarizeMoves,
  buildGameAnalysis,
  type GameMove,
  type GamePositions,
  type CandidateEvaluation,
} from "./game";
export { moveAnalysisToRow, rowToMoveAnalysis, parseEngineLines, parseGameSummary } from "./rows";
