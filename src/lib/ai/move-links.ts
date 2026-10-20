// Coups cliquables dans les textes de l'IA (module pur). Chaque coup cité est relié à la position où
// il est joué dans les données Stockfish déjà validées : coups de la partie, variantes candidates,
// suites attendues. Aucun coup n'est calculé ici, on ne fait que rejouer les variantes.
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import type { MoveAnalysis, Thresholds, ValidatedLine } from "@/lib/analysis/types";
import { isFlaggedMove } from "./eligibility";
import { selectKeyMoments } from "./report/moments";
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
  /** Demi-coup de la partie auquel la variante se rattache. */
  momentPly?: number;
};

/** Variantes transmises au bilan : même longueur que dans report/input.ts. */
const REPORT_LINE_PLIES = 6;

type LinkMeta = Pick<MoveLink, "source" | "rank" | "momentPly">;

function lineLinks(startFen: string, line: ValidatedLine, meta: LinkMeta, maxPlies = Infinity): MoveLink[] {
  const chess = new Chess(startFen);
  const links: MoveLink[] = [];
  for (let i = 0; i < Math.min(line.uci.length, maxPlies); i++) {
    const fen = chess.fen();
    if (!playUci(chess, line.uci[i])) break;
    links.push({ fen, uci: line.uci[i], san: line.san[i], ...meta });
  }
  return links;
}

/**
 * Coups d'une explication de coup, par ordre de priorité : coup joué ; puis, pour un écart, la
 * suite punitive avant les candidats ; pour un bon coup, les candidats avant la suite.
 */
export function buildMoveLinks(move: MoveAnalysis): MoveLink[] {
  const played: MoveLink = { fen: move.fenBefore, uci: move.uci, san: move.san, source: "played", momentPly: move.ply };
  const candidates = move.candidates.flatMap((line, i) =>
    lineLinks(move.fenBefore, line, { source: "candidate", rank: i + 1, momentPly: move.ply }),
  );
  const reply = move.punishLine ? lineLinks(move.fenAfter, move.punishLine, { source: "reply", momentPly: move.ply }) : [];
  return [played, ...(isFlaggedMove(move) ? [...reply, ...candidates] : [...candidates, ...reply])];
}

/**
 * Coups du bilan de partie : tous les coups de la partie, puis, pour chaque moment clé transmis à
 * l'IA, la variante du meilleur coup et la suite attendue (mêmes données que report/input.ts).
 */
export function buildReportMoveLinks(moves: readonly MoveAnalysis[], thresholds: Thresholds): MoveLink[] {
  const game = moves.map<MoveLink>((m) => ({ fen: m.fenBefore, uci: m.uci, san: m.san, source: "played", momentPly: m.ply }));
  const variations = selectKeyMoments(moves, thresholds).flatMap(({ move }) => [
    ...(move.candidates[0]
      ? lineLinks(move.fenBefore, move.candidates[0], { source: "candidate", rank: 1, momentPly: move.ply }, REPORT_LINE_PLIES)
      : []),
    ...(move.punishLine ? lineLinks(move.fenAfter, move.punishLine, { source: "reply", momentPly: move.ply }, REPORT_LINE_PLIES) : []),
  ]);
  return [...game, ...variations];
}

export type MoveLinkIndex = {
  /** « numéro + camp + SAN » → coup (première occurrence). */
  numbered: Map<string, MoveLink>;
  /** SAN normalisé → occurrences, dans l'ordre de priorité. */
  bySan: Map<string, MoveLink[]>;
};

function numberedKey(fullmove: string, side: string, san: string): string {
  return `${fullmove}${side}${normalizeSan(san)}`;
}

export function indexMoveLinks(links: readonly MoveLink[]): MoveLinkIndex {
  const numbered = new Map<string, MoveLink>();
  const bySan = new Map<string, MoveLink[]>();
  for (const link of links) {
    const [, side, , , , fullmove] = link.fen.split(" ");
    const key = numberedKey(fullmove ?? "", side ?? "", link.san);
    if (!numbered.has(key)) numbered.set(key, link);
    const san = normalizeSan(link.san);
    const list = bySan.get(san) ?? [];
    list.push(link);
    bySan.set(san, list);
  }
  return { numbered, bySan };
}

/** Numéro de coup collé au coup cité : « 27... », « 27… », « 6. ». */
const NUMBER_BEFORE = /(\d+)\s*(\.\.\.|…|\.)\s*$/;

export type ResolveOptions = {
  /** Demi-coup auquel se rattache le passage (bilan) : départage un coup cité sans numéro. */
  contextPly?: number | null;
  /** Coup ambigu sans numéro ni contexte : premier par priorité (explication) ou aucun (bilan). */
  ambiguous: "first" | "none";
};

/** Coup désigné par un SAN cité dans un texte, d'après le texte qui le précède. */
export function resolveMoveLink(index: MoveLinkIndex, san: string, before: string, options: ResolveOptions): MoveLink | undefined {
  const number = NUMBER_BEFORE.exec(before);
  if (number) {
    const side = number[2] === "." ? "w" : "b";
    const exact = index.numbered.get(numberedKey(number[1], side, san));
    if (exact) return exact;
  }
  const candidates = index.bySan.get(normalizeSan(san)) ?? [];
  if (candidates.length === 0) return undefined;
  if (options.contextPly != null) {
    const inMoment = candidates.find((link) => link.momentPly === options.contextPly);
    if (inMoment) return inMoment;
  }
  if (candidates.length === 1) return candidates[0];
  return options.ambiguous === "first" ? candidates[0] : undefined;
}

/** Clé d'un aperçu de coup (position + coup), pour marquer le coup affiché. */
export function moveLinkKey(link: Pick<MoveLink, "fen" | "uci">): string {
  return `${link.fen}|${link.uci}`;
}
