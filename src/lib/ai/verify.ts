// Vérification des coups cités par l'IA (skill chess-analysis §6). Module pur.
// Tout coup SAN cité doit appartenir à l'ensemble autorisé : coup joué, meilleur coup, coups des
// variantes transmises. Une case citée seule (« la case f7 ») n'est pas un coup.

import type { MoveAnalysis } from "@/lib/analysis/types";
import type { Explanation } from "./schema";

// Regex de la skill, avec `(?!\w)` en fin : `\b` après « + » ou « # » couperait le symbole.
const SAN_TOKEN = /\b(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)(?!\w)/g;
/**
 * Notation française (C, F, T, D) : interdite, on exige le SAN anglais. « R » (Roi) n'en fait pas
 * partie : en SAN anglais c'est la tour, et le coup est alors vérifié comme les autres.
 */
const FRENCH_PIECE_TOKEN = /\b[CFTD][a-h]?[1-8]?x?[a-h][1-8](=[CFTD])?[+#]?(?![\w-])/g;
const BARE_SQUARE = /^[a-h][1-8]$/;
/** Mots qui précèdent une case (et non un coup de pion). */
const SQUARE_CONTEXT = new Set([
  "case", "cases", "sur", "en", "vers", "de", "du", "des", "la", "le", "les", "à", "au", "aux",
  "pion", "pions", "roi", "dame", "tour", "tours", "fou", "fous", "cavalier", "cavaliers",
  "diagonale", "colonne", "rangée", "depuis",
]);
const FULL_SAN = /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?)$/;

/** Forme canonique : sans échec/mat ni annotations, roques en lettres O. */
export function normalizeSan(san: string): string {
  return san
    .trim()
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/[+#!?]+$/g, "")
    .replace(/[+#]/g, "");
}

/** Nombre de coups candidats transmis à l'IA (prompt.ts) : seuls ceux-là peuvent être cités. */
export const PROMPT_CANDIDATES = 3;

/** Coups (SAN normalisé) qu'une explication de ce coup a le droit de citer. */
export function allowedMovesFor(move: Pick<MoveAnalysis, "san" | "bestSan" | "candidates" | "punishLine">): Set<string> {
  const allowed = new Set<string>();
  const add = (san: string | null | undefined) => {
    if (san) allowed.add(normalizeSan(san));
  };
  add(move.san);
  add(move.bestSan);
  for (const line of move.candidates.slice(0, PROMPT_CANDIDATES)) line.san.forEach(add);
  move.punishLine?.san.forEach(add);
  return allowed;
}

/** Morceau de texte : texte libre, ou coup SAN cité (`san` = forme d'origine). */
export type TextSegment = { text: string; san?: string };

/**
 * Découpe un texte libre en morceaux, en isolant les coups SAN cités (cases isolées en contexte
 * « la case e4 » exclues). Sert à la vérification et à l'affichage des coups cliquables : les
 * deux reconnaissent exactement les mêmes coups.
 */
export function segmentSan(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(SAN_TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (BARE_SQUARE.test(token) && isSquareMention(text, index)) continue;
    if (index > last) segments.push({ text: text.slice(last, index) });
    segments.push({ text: token, san: token });
    last = index + token.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/** Coups SAN cités dans un texte libre (cases isolées en contexte « la case e4 » exclues). */
export function extractSanTokens(text: string): string[] {
  return segmentSan(text).flatMap((segment) => (segment.san ? [segment.san] : []));
}

function isSquareMention(text: string, index: number): boolean {
  const before = text.slice(0, index);
  // « a2-g8 », « e4/d5 » : plage ou liste de cases.
  if (/[a-h][1-8]\s*[-–/]\s*$/.test(before) || /^[a-h][1-8]\s*[-–/]\s*[a-h][1-8]/.test(text.slice(index))) return true;
  const previousWord = /([\p{L}']+)\s*$/u.exec(before)?.[1]?.toLowerCase().replace(/^.*'/, "");
  return previousWord !== undefined && SQUARE_CONTEXT.has(previousWord);
}

export type VerificationResult = {
  valid: boolean;
  /** Coups cités hors de l'ensemble autorisé (forme d'origine, sans doublon). */
  invalid: string[];
  /** Coups cités, normalisés. */
  referenced: string[];
};

export function verifyMoves(texts: string[], declared: string[], allowed: Set<string>): VerificationResult {
  const invalid = new Set<string>();
  const referenced = new Set<string>();

  const check = (raw: string) => {
    const san = normalizeSan(raw);
    if (!san) return;
    referenced.add(san);
    if (!allowed.has(san)) invalid.add(raw.trim());
  };

  for (const text of texts) {
    extractSanTokens(text).forEach(check);
    for (const match of text.matchAll(FRENCH_PIECE_TOKEN)) invalid.add(match[0]);
  }
  for (const san of declared) {
    // movesReferenced doit être du SAN pur ; une case seule y est un coup de pion.
    if (FULL_SAN.test(normalizeSan(san))) check(san);
    else if (san.trim()) invalid.add(san.trim());
  }

  return { valid: invalid.size === 0, invalid: [...invalid], referenced: [...referenced] };
}

/** Vérifie une explication complète (5 rubriques + movesReferenced). */
export function verifyExplanation(explanation: Explanation, allowed: Set<string>): VerificationResult {
  return verifyMoves(
    [explanation.played, explanation.problem, explanation.opponentIdea, explanation.bestMove, explanation.lesson],
    explanation.movesReferenced,
    allowed,
  );
}
