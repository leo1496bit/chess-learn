// Coups cliquables dans une explication (module pur). Chaque coup cité est relié à la position où il
// est joué dans les données Stockfish du coup expliqué : coup joué, variantes candidates, suite
// attendue. Aucun coup n'est calculé ici, on ne fait que rejouer les variantes déjà validées.
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import type { MoveAnalysis, ValidatedLine } from "@/lib/analysis/types";
import { isFlaggedMove } from "./eligibility";
import { normalizeSan } from "./verify";

export type MoveLink = {
  /** Position juste avant le coup. */
  fen: string;
  uci: string;
  san: string;
  /** D'où vient le coup, pour le bandeau d'aperçu. */
  source: "played" | "candidate" | "reply";
  /** Rang du candidat (1 = meilleur coup), pour source « candidate ». */
  rank?: number;
};

type Source = Pick<MoveLink, "source" | "rank">;

function addLine(links: Map<string, MoveLink>, startFen: string, line: ValidatedLine, source: Source) {
  const chess = new Chess(startFen);
  line.uci.forEach((uci, i) => {
    const fen = chess.fen();
    if (!playUci(chess, uci)) return;
    const key = normalizeSan(line.san[i] ?? "");
    // Première occurrence retenue : l'ordre d'ajout fixe la priorité entre les variantes.
    if (key && !links.has(key)) links.set(key, { fen, uci, san: line.san[i], ...source });
  });
}

/**
 * Coups cliquables d'une explication, par SAN normalisé. Priorité : coup joué ; puis, pour un
 * écart, la suite punitive avant les candidats ; pour un bon coup, les candidats avant la suite.
 */
export function buildMoveLinks(move: MoveAnalysis): Map<string, MoveLink> {
  const links = new Map<string, MoveLink>();
  links.set(normalizeSan(move.san), { fen: move.fenBefore, uci: move.uci, san: move.san, source: "played" });

  const addCandidates = () =>
    move.candidates.forEach((line, i) => addLine(links, move.fenBefore, line, { source: "candidate", rank: i + 1 }));
  const addReply = () => {
    if (move.punishLine) addLine(links, move.fenAfter, move.punishLine, { source: "reply" });
  };
  if (isFlaggedMove(move)) {
    addReply();
    addCandidates();
  } else {
    addCandidates();
    addReply();
  }
  return links;
}
