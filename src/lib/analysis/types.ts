// Contrat partagé entre moteur, analyse, IA, statistiques et entraînement.
// Règles détaillées : skill chess-analysis (.claude/skills/chess-analysis/SKILL.md).

export type Color = "w" | "b";

/** Évaluation Stockfish, toujours du point de vue des Blancs. Un seul champ non nul. */
export type Evaluation = { cp: number | null; mate: number | null };

/** Une ligne MultiPV renvoyée par le moteur pour une position. */
export type EngineLine = {
  multipv: number; // 1 = meilleure ligne
  depth: number;
  evaluation: Evaluation; // point de vue Blancs
  pvUci: string[];
};

/** Résultat moteur d'une position (stocké dans position_analyses.lines). */
export type PositionAnalysis = {
  fen: string;
  depth: number;
  multipv: number;
  engineVersion: string;
  lines: EngineLine[]; // triées par multipv
  /** Position terminale (mat/pat) : pas de ligne moteur, évaluation donnée par les règles. */
  terminal?: { evaluation: Evaluation; reason: "checkmate" | "stalemate" | "draw" };
};

/** Coup avec sa traduction SAN validée par chess.js. */
export type ValidatedLine = {
  evaluation: Evaluation;
  uci: string[];
  san: string[];
};

export type Classification =
  | "forced"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type Phase = "opening" | "middlegame" | "endgame";

export type Theme =
  | "tactics"
  | "hanging_piece"
  | "missed_tactic"
  | "king_safety"
  | "development"
  | "bad_exchange"
  | "endgame"
  | "strategy"
  | "calculation";

export const TACTICAL_THEMES: readonly Theme[] = ["tactics", "hanging_piece", "missed_tactic", "king_safety"];
export const STRATEGIC_THEMES: readonly Theme[] = ["strategy", "development", "bad_exchange", "endgame"];

/** Seuils de perte de % de gain (configurables dans Paramètres). */
export type Thresholds = {
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  excellent: 2,
  good: 5,
  inaccuracy: 5,
  mistake: 10,
  blunder: 20,
};

export type EngineSettings = { depth: number; multipv: number };
export const DEFAULT_ENGINE_SETTINGS: EngineSettings = { depth: 16, multipv: 3 };
export const ENGINE_VERSION = "sf19-lite-single";

/** Analyse complète d'un demi-coup (correspond à une ligne de move_analyses). */
export type MoveAnalysis = {
  ply: number; // 1 = premier coup des Blancs
  color: Color;
  isPlayerMove: boolean;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: Evaluation; // meilleure ligne de la position avant
  evalAfter: Evaluation; // meilleure ligne de la position après
  bestUci: string | null;
  bestSan: string | null;
  candidates: ValidatedLine[]; // MultiPV de la position avant (≤ 8 demi-coups)
  punishLine: ValidatedLine | null; // meilleure ligne de l'adversaire après le coup joué
  winBefore: number; // % de gain du joueur qui joue, avant (meilleur coup)
  winAfter: number; // % de gain du joueur qui joue, après le coup joué
  loss: number; // ≥ 0
  accuracy: number; // 0..100
  classification: Classification;
  missedWin: boolean;
  missedSave: boolean;
  phase: Phase;
  themes: Theme[];
};

export type GameAnalysisSummary = {
  player: Record<Classification, number> & { missedWin: number; accuracy: number | null };
  opponent: Record<Classification, number> & { missedWin: number; accuracy: number | null };
};
