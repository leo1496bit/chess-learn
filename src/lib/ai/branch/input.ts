// Données d'une branche d'ouverture transmises à l'IA (module pur). Seuls les résultats de Stockfish et le
// livre d'ouvertures sont transmis ; l'IA ne peut citer que les coups listés ici.
import { Chess } from "chess.js";
import { playUci, uciLineToSan } from "@/lib/analysis/lines";
import { formatSanLine } from "@/lib/analysis/labels";
import type { Color, PositionAnalysis } from "@/lib/analysis/types";
import { formatEvaluation } from "@/lib/analysis/win";
import { COLOR_NAMES, describePieces } from "../prompt";
import { normalizeSan } from "../verify";

export type BranchLineInfo = {
  name: string;
  eco: string | null;
  kind: "punish" | "master" | null;
  playerColor: Color;
  rootFen: string;
  prefixSan: readonly string[];
};

export type BranchInfo = { pathUci: readonly string[]; pathSan: readonly string[] };

export type BranchInput = {
  /** Message utilisateur envoyé à l'IA. */
  text: string;
  /** Coups (SAN normalisé) que les textes peuvent citer. */
  allowedMoves: Set<string>;
  /** Noms du livre : peuvent contenir un SAN (« …, with Bf5 ») sans être des coups cités. */
  protectedPhrases: string[];
};

/** Demi-coups maximum des variantes MultiPV d'un coup de Leonel / de la position finale. */
export const OWN_MOVE_LINE_PLIES = 6;
export const FINAL_LINE_PLIES = 8;

export const KIND_NAMES = { punish: "à punir", master: "à maîtriser" } as const;

export function buildBranchInput(
  line: BranchLineInfo,
  branch: BranchInfo,
  analyses: ReadonlyMap<string, PositionAnalysis>,
): BranchInput {
  const allowedMoves = new Set<string>();
  const allow = (san: readonly string[]) => {
    for (const s of san) if (s) allowedMoves.add(normalizeSan(s));
  };
  allow(line.prefixSan);
  allow(branch.pathSan);

  const kindText = line.kind ? KIND_NAMES[line.kind] : "non classée";
  const lines: string[] = [
    `Ouverture (livre d'ouvertures) : ${line.name}${line.eco ? ` (${line.eco})` : ""}.`,
    `Catégorie : ${kindText}.`,
    `Le joueur joue les ${COLOR_NAMES[line.playerColor]}.`,
    `Coups avant la position de départ : ${line.prefixSan.length > 0 ? formatSanLine(new Chess().fen(), line.prefixSan) : "(aucun)"}.`,
    `Position de départ (FEN) : ${line.rootFen}`,
    "",
    "Coups de la branche (index = demi-coup après la position de départ ; joueur aux index pairs) :",
  ];

  const chess = new Chess(line.rootFen);
  const fens: string[] = [];
  branch.pathUci.forEach((uci, index) => {
    fens.push(chess.fen());
    const turn = chess.turn();
    if (!playUci(chess, uci)) throw new Error(`Branche : coup ${uci} illégal à l'index ${index}`);
    const by = turn === line.playerColor ? "joueur" : "adversaire";
    lines.push(`- index ${index} : ${formatSanLine(fens[index], [branch.pathSan[index] ?? ""])} (${by})`);
  });
  const endFen = chess.fen();

  lines.push("", "Analyse Stockfish des positions où le joueur joue (évaluations du point de vue des Blancs) :");
  let any = false;
  branch.pathUci.forEach((_, index) => {
    if (index % 2 !== 0) return;
    const fen = fens[index];
    const analysis = analyses.get(fen);
    if (!analysis || analysis.lines.length === 0) return;
    any = true;
    lines.push(`- index ${index} (avant ${branch.pathSan[index]}) :`);
    const turn = new Chess(fen).turn();
    for (const [n, l] of analysis.lines.entries()) {
      const validated = uciLineToSan(fen, l.pvUci, OWN_MOVE_LINE_PLIES);
      allow(validated.san);
      lines.push(`    ligne ${n + 1} : ${formatSanLine(fen, validated.san) || "(aucun coup)"} — évaluation ${formatEvaluation(l.evaluation, turn)}`);
    }
  });
  if (!any) lines.push("- aucune analyse disponible : ne commente pas d'évaluation.");

  const pieces = describePieces(endFen);
  lines.push(
    "",
    `Position finale de la branche (FEN) : ${endFen}`,
    `Pièces des Blancs : ${pieces.w}`,
    `Pièces des Noirs : ${pieces.b}`,
  );
  const finalLine = analyses.get(endFen)?.lines[0];
  if (finalLine) {
    const validated = uciLineToSan(endFen, finalLine.pvUci, FINAL_LINE_PLIES);
    allow(validated.san);
    lines.push(
      `Variante de Stockfish depuis la position finale : ${formatSanLine(endFen, validated.san) || "(aucun coup)"} — évaluation ${formatEvaluation(finalLine.evaluation, new Chess(endFen).turn())}.`,
    );
  } else {
    lines.push("Variante de Stockfish depuis la position finale : (non fournie).");
  }

  lines.push(
    "",
    `Nombre de demi-coups à commenter : ${branch.pathUci.length} (index 0 à ${branch.pathUci.length - 1}).`,
    `Coups autorisés (les seuls que tu peux citer) : ${[...allowedMoves].join(", ") || "aucun"}.`,
  );

  return { text: lines.join("\n"), allowedMoves, protectedPhrases: line.name ? [line.name] : [] };
}
