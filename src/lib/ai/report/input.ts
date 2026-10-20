// Données du bilan de partie (module pur). Seules les informations calculées par Stockfish et par le
// livre d'ouvertures sont transmises à l'IA ; elle ne peut citer que les coups et demi-coups listés ici.
import type { Classification, Color, MoveAnalysis, Phase, Theme, Thresholds, ValidatedLine } from "@/lib/analysis/types";
import { formatSanLine, moveNumberLabel } from "@/lib/analysis/labels";
import { formatEvaluation } from "@/lib/analysis/win";
import { gameAccuracy } from "@/lib/analysis/classify";
import type { OpeningReport } from "@/lib/openings/identify";
import { isFlaggedMove } from "../eligibility";
import { CLASSIFICATION_NAMES, COLOR_NAMES, PHASE_NAMES, THEME_NAMES } from "../prompt";
import { normalizeSan } from "../verify";

export type ReportGame = {
  white: string;
  black: string;
  whiteRating: number | null;
  blackRating: number | null;
  playerColor: Color;
  result: string;
  resultDetail: string | null;
  timeClass: string | null;
  timeControl: string | null;
};

export type ReportInput = {
  /** Message utilisateur envoyé à l'IA. */
  text: string;
  /** Coups (SAN normalisé) que le bilan peut citer. */
  allowedMoves: Set<string>;
  /** Demi-coups auxquels le bilan peut renvoyer. */
  allowedPlies: Set<number>;
};

/** Nombre maximal de moments clés transmis (les plus coûteux d'abord). */
export const MAX_KEY_MOMENTS = 12;
/** Longueur maximale des variantes transmises. */
const LINE_PLIES = 6;

const RESULT_NAMES: Record<string, string> = { win: "victoire du joueur", loss: "défaite du joueur", draw: "partie nulle" };
const ERROR_CLASSES: readonly Classification[] = ["inaccuracy", "mistake", "blunder"];

type KeyMoment = { move: MoveAnalysis; unpunished: MoveAnalysis | null };

function lineText(fen: string, line: ValidatedLine | null, maxPlies = LINE_PLIES): string | null {
  if (!line || line.san.length === 0) return null;
  return formatSanLine(fen, line.san.slice(0, maxPlies));
}

/**
 * Moments clés : écarts du joueur (les plus coûteux) et réponses du joueur qui n'ont pas puni une
 * erreur de l'adversaire. Triés dans l'ordre de la partie.
 */
export function selectKeyMoments(moves: readonly MoveAnalysis[], thresholds: Thresholds): KeyMoment[] {
  const byPly = new Map(moves.map((m) => [m.ply, m]));
  const candidates = new Map<number, KeyMoment>();

  for (const move of moves) {
    if (!move.isPlayerMove) continue;
    const previous = byPly.get(move.ply - 1);
    const unpunished =
      previous && !previous.isPlayerMove && (previous.classification === "mistake" || previous.classification === "blunder") && move.loss >= thresholds.inaccuracy
        ? previous
        : null;
    if (isFlaggedMove(move) || unpunished) candidates.set(move.ply, { move, unpunished });
  }

  return [...candidates.values()]
    .sort((a, b) => b.move.loss - a.move.loss)
    .slice(0, MAX_KEY_MOMENTS)
    .sort((a, b) => a.move.ply - b.move.ply);
}

function countBy<T extends string>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function classificationCounts(moves: readonly MoveAnalysis[]): string {
  const counts = countBy(moves.map((m) => m.classification));
  const parts = ERROR_CLASSES.map((c) => `${counts.get(c) ?? 0} ${CLASSIFICATION_NAMES[c]}${(counts.get(c) ?? 0) > 1 ? "s" : ""}`);
  const missed = moves.filter((m) => m.missedWin).length;
  return `${parts.join(", ")}, ${missed} gain${missed > 1 ? "s" : ""} manqué${missed > 1 ? "s" : ""}`;
}

function accuracyText(moves: readonly MoveAnalysis[]): string {
  const value = gameAccuracy(moves.map((m) => m.accuracy));
  return value === null ? "non calculée" : `${Math.round(value)} %`;
}

export function buildReportInput(
  game: ReportGame,
  moves: readonly MoveAnalysis[],
  opening: OpeningReport,
  thresholds: Thresholds,
): ReportInput {
  const allowedMoves = new Set<string>();
  const allowedPlies = new Set<number>();
  const allow = (san: readonly string[] | string | null | undefined) => {
    for (const s of typeof san === "string" ? [san] : (san ?? [])) if (s) allowedMoves.add(normalizeSan(s));
  };

  const player = game.playerColor;
  const playerName = player === "w" ? game.white : game.black;
  const opponentName = player === "w" ? game.black : game.white;
  const rating = (r: number | null) => (r ? ` (${r})` : "");
  const playerMoves = moves.filter((m) => m.isPlayerMove);
  const opponentMoves = moves.filter((m) => !m.isPlayerMove);
  const byPly = new Map(moves.map((m) => [m.ply, m]));

  const lines: string[] = [];
  lines.push(
    `Partie : ${game.white}${rating(game.whiteRating)} (Blancs) contre ${game.black}${rating(game.blackRating)} (Noirs).`,
    `Joueur à conseiller : ${playerName}, qui joue les ${COLOR_NAMES[player]}. Adversaire : ${opponentName}.`,
    `Résultat : ${RESULT_NAMES[game.result] ?? game.result}${game.resultDetail ? ` (${game.resultDetail})` : ""}. Cadence : ${game.timeClass ?? "inconnue"}${game.timeControl ? ` (${game.timeControl})` : ""}. ${moves.length} demi-coups.`,
    "",
    "Précision (Stockfish) :",
    `- Joueur : ${accuracyText(playerMoves)} ; ${classificationCounts(playerMoves)}.`,
    `- Adversaire : ${accuracyText(opponentMoves)} ; ${classificationCounts(opponentMoves)}.`,
    "",
    "Par phase (coups du joueur) :",
  );
  for (const phase of ["opening", "middlegame", "endgame"] as const satisfies readonly Phase[]) {
    const own = playerMoves.filter((m) => m.phase === phase);
    if (own.length === 0) continue;
    lines.push(`- ${PHASE_NAMES[phase]} : ${own.length} coups, précision ${accuracyText(own)} ; ${classificationCounts(own)}.`);
  }
  if (!playerMoves.some((m) => m.phase === "endgame")) lines.push("- La partie n'a pas atteint de finale.");

  // Ouverture et théorie (livre Lichess).
  lines.push("", "Ouverture (livre d'ouvertures) :");
  if (opening.name) {
    lines.push(`- Ligne la plus précise atteinte : ${opening.name}${opening.eco ? ` (${opening.eco})` : ""}.`);
    if (opening.gambit) lines.push(`- Gambit rencontré : ${opening.gambit}.`);
    lines.push(`- Coups théoriques consécutifs depuis le début : ${opening.bookPlies} demi-coups (jusqu'au coup ${moveNumberLabel(Math.max(1, opening.bookPlies))}).`);
  } else {
    lines.push("- Aucune ligne du livre reconnue dès le premier coup.");
  }
  const deviation = opening.deviation;
  if (deviation) {
    const devMove = byPly.get(deviation.ply);
    const who = deviation.byPlayer ? "le joueur" : "l'adversaire";
    allow(deviation.san);
    allowedPlies.add(deviation.ply);
    lines.push(
      `- Sortie de la théorie : demi-coup ${deviation.ply}, ${moveNumberLabel(deviation.ply)} ${deviation.san}, jouée par ${who}${devMove ? ` (classification Stockfish : ${CLASSIFICATION_NAMES[devMove.classification]}, perte ${devMove.loss.toFixed(1)} points de % de gain)` : ""}.`,
    );
    if (devMove?.bestSan) {
      allow(devMove.bestSan);
      lines.push(`- Meilleur coup selon Stockfish à ce moment : ${devMove.bestSan}.`);
    }
    const after = playerMoves.filter((m) => m.ply > deviation.ply && m.ply <= deviation.ply + 6);
    if (after.length > 0) {
      lines.push(
        `- Coups du joueur juste après la sortie de théorie : ${after
          .map((m) => {
            allow(m.san);
            allowedPlies.add(m.ply);
            return `${moveNumberLabel(m.ply)} ${m.san} (${CLASSIFICATION_NAMES[m.classification]}, perte ${m.loss.toFixed(1)} points)`;
          })
          .join(" ; ")}.`,
      );
    }
  } else if (opening.name) {
    lines.push("- La partie n'est pas sortie du livre pendant les coups analysés.");
  }

  // Thèmes des écarts du joueur (règles déterministes).
  const themeCounts = countBy(playerMoves.filter((m) => isFlaggedMove(m)).flatMap((m) => m.themes as Theme[]));
  lines.push("", "Thèmes des écarts du joueur (règles déterministes, nombre d'occurrences) :");
  lines.push(
    themeCounts.size === 0
      ? "- aucun"
      : [...themeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([theme, n]) => `- ${THEME_NAMES[theme]} : ${n}`)
          .join("\n"),
  );

  // Moments clés.
  const moments = selectKeyMoments(moves, thresholds);
  lines.push("", `Moments clés (${moments.length}, du premier au dernier) :`);
  if (moments.length === 0) lines.push("- aucun écart significatif du joueur.");
  for (const { move, unpunished } of moments) {
    allowedPlies.add(move.ply);
    allow(move.san);
    allow(move.bestSan);
    const best = move.candidates[0] ?? null;
    const bestLine = lineText(move.fenBefore, best);
    const punish = lineText(move.fenAfter, move.punishLine);
    allow(best?.san.slice(0, LINE_PLIES));
    allow(move.punishLine?.san.slice(0, LINE_PLIES));
    const tags = [CLASSIFICATION_NAMES[move.classification], move.missedWin ? "gain manqué" : null, move.missedSave ? "sauvetage manqué" : null]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `- [demi-coup ${move.ply}] ${moveNumberLabel(move.ply)} ${move.san} — ${tags}, perte ${move.loss.toFixed(1)} points de % de gain (chances de gain du joueur ${Math.round(move.winBefore)} % → ${Math.round(move.winAfter)} %), ${PHASE_NAMES[move.phase]}.`,
    );
    if (unpunished) {
      allow(unpunished.san);
      allowedPlies.add(unpunished.ply);
      lines.push(
        `  Ce coup répondait à une ${CLASSIFICATION_NAMES[unpunished.classification]} de l'adversaire (${moveNumberLabel(unpunished.ply)} ${unpunished.san}, demi-coup ${unpunished.ply}) que le joueur n'a pas punie.`,
      );
    }
    lines.push(
      `  Évaluation avant : ${formatEvaluation(move.evalBefore, move.color)} ; après : ${formatEvaluation(move.evalAfter, move.color === "w" ? "b" : "w")}.`,
    );
    if (move.themes.length > 0) lines.push(`  Thèmes : ${move.themes.join(", ")}.`);
    if (move.bestSan) lines.push(`  Meilleur coup : ${move.bestSan}${bestLine ? ` ; variante : ${bestLine}` : ""}.`);
    if (punish) lines.push(`  Suite attendue après le coup joué : ${punish}.`);
  }

  lines.push(
    "",
    `Demi-coups auxquels tu peux renvoyer (champ ply) : ${[...allowedPlies].sort((a, b) => a - b).join(", ") || "aucun"}.`,
    `Coups autorisés (les seuls que tu peux citer) : ${[...allowedMoves].join(", ") || "aucun"}.`,
  );

  return { text: lines.join("\n"), allowedMoves, allowedPlies };
}
