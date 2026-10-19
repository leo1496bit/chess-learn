// Données de test partagées par les tests du module IA (non importées par l'application).
import type { MoveAnalysis } from "@/lib/analysis/types";
import type { GameContext } from "./prompt";
import type { Explanation } from "./schema";

/** 1. e4 e5 2. Nf3 f6? — les Noirs affaiblissent e5 et la diagonale du roi. */
export const BLACK_MISTAKE: MoveAnalysis = {
  ply: 4,
  color: "b",
  isPlayerMove: true,
  san: "f6",
  uci: "f7f6",
  fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  fenAfter: "rnbqkbnr/pppp2pp/5p2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
  evalBefore: { cp: 30, mate: null },
  evalAfter: { cp: 160, mate: null },
  bestUci: "b8c6",
  bestSan: "Nc6",
  candidates: [
    { evaluation: { cp: 30, mate: null }, uci: ["b8c6", "f1b5", "a7a6"], san: ["Nc6", "Bb5", "a6"] },
    { evaluation: { cp: 40, mate: null }, uci: ["g8f6", "f3e5", "d7d6"], san: ["Nf6", "Nxe5", "d6"] },
    { evaluation: { cp: 45, mate: null }, uci: ["d7d6", "d2d4"], san: ["d6", "d4"] },
  ],
  punishLine: {
    evaluation: { cp: 160, mate: null },
    uci: ["f3e5", "f6e5", "d1h5", "e8e7", "h5e5", "e7f7", "f1c4"],
    san: ["Nxe5", "fxe5", "Qh5+", "Ke7", "Qxe5+", "Kf7", "Bc4+"],
  },
  winBefore: 47.2,
  winAfter: 35.6,
  loss: 11.6,
  accuracy: 58.4,
  classification: "mistake",
  missedWin: false,
  missedSave: false,
  phase: "opening",
  themes: ["king_safety", "development"],
};

export const GAME: GameContext = {
  white: "adversaire42",
  black: "Leny_l",
  playerColor: "b",
  openingName: "Défense Damiano",
  eco: "C40",
};

export const VALID_EXPLANATION: Explanation = {
  played: "Avec f6, tu sembles vouloir protéger le pion de la case e5 par un pion.",
  problem: "Ce coup affaiblit la diagonale e8-h5 et retire la case f6 à ton cavalier.",
  opponentIdea: "Les Blancs peuvent sacrifier avec Nxe5 : après fxe5, Qh5+ force Ke7 puis Qxe5+ récupère le pion avec une attaque.",
  bestMove: "Nc6 défend la case e5 tout en développant une pièce, sans affaiblir le roi.",
  lesson: "En ouverture, défends tes pions avec des pièces qui se développent plutôt qu'avec des pions qui exposent ton roi.",
  errorType: "mixed",
  confidence: "high",
  movesReferenced: ["f6", "Nxe5", "fxe5", "Qh5+", "Ke7", "Qxe5+", "Nc6"],
};
