// Identification de l'ouverture d'une partie à partir du livre (données Lichess, CC0).
// Module pur : le livre est passé en paramètre (chargé côté serveur par ./book.ts).
import type { Color } from "@/lib/analysis/types";

/**
 * epd -> [eco, nom, exact] ; exact = 1 si une ligne nommée s'arrête sur cette position. Sinon, le nom
 * est celui de la dernière ligne nommée atteinte sur le chemin (vide s'il n'y en a pas encore).
 */
export type OpeningBook = Record<string, [string, string, number]>;

export type PlyOpening = {
  ply: number;
  /** La position après ce demi-coup figure dans le livre. */
  inBook: boolean;
  eco: string | null;
  name: string | null;
};

export type OpeningDeviation = {
  /** Premier demi-coup qui sort du livre. */
  ply: number;
  color: Color;
  san: string;
  byPlayer: boolean;
  /** Dernière ouverture connue avant l'écart. */
  lastBookName: string | null;
};

export type OpeningReport = {
  eco: string | null;
  /** Nom le plus précis atteint pendant la phase théorique. */
  name: string | null;
  /** Famille (partie du nom avant « : »), ex. « Sicilian Defense ». */
  family: string | null;
  /** Variante (partie après « : »), ex. « Najdorf Variation ». */
  variation: string | null;
  /** Gambit rencontré pendant la phase théorique (nom complet), sinon null. */
  gambit: string | null;
  /** Nombre de demi-coups consécutifs dans le livre depuis le début. */
  bookPlies: number;
  deviation: OpeningDeviation | null;
  plies: PlyOpening[];
};

/** FEN sans les compteurs de demi-coups et de coups : reconnaît les transpositions. */
export function toEpd(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function splitName(name: string | null): { family: string | null; variation: string | null } {
  if (!name) return { family: null, variation: null };
  const index = name.indexOf(":");
  return index === -1
    ? { family: name, variation: null }
    : { family: name.slice(0, index).trim(), variation: name.slice(index + 1).trim() };
}

/**
 * `fens` : les N+1 positions de la partie (position initiale incluse), `sans` : les N coups.
 */
export function identifyOpening(
  fens: readonly string[],
  sans: readonly string[],
  playerColor: Color,
  book: OpeningBook,
): OpeningReport {
  const plies: PlyOpening[] = [];
  let bookPlies = 0;
  let stillInBook = true;
  let deviation: OpeningDeviation | null = null;
  let eco: string | null = null;
  let name: string | null = null;
  let gambit: string | null = null;
  let lastName: string | null = null;

  for (let i = 1; i < fens.length; i++) {
    const entry = book[toEpd(fens[i])];
    const color: Color = i % 2 === 1 ? "w" : "b";
    // Nom vide : position théorique avant toute ligne nommée atteinte.
    const entryName = entry?.[1] || null;
    plies.push({ ply: i, inBook: Boolean(entry), eco: entry?.[0] || null, name: entryName });

    if (stillInBook && entry) {
      bookPlies = i;
      if (entryName) {
        eco = entry[0];
        name = entryName;
        lastName = entryName;
        if (/gambit/i.test(entryName)) gambit = entryName;
      }
    } else if (stillInBook) {
      stillInBook = false;
      deviation = { ply: i, color, san: sans[i - 1] ?? "", byPlayer: color === playerColor, lastBookName: lastName };
    }
  }

  return { eco, name, ...splitName(name), gambit, bookPlies, deviation, plies };
}

/** Place d'un coup par rapport au livre d'ouvertures. */
export type MoveTheory =
  | { kind: "book"; name: string | null; eco: string | null }
  | { kind: "deviation"; lastBookName: string | null }
  /** Coup joué après la sortie du livre (`since` = premier coup hors théorie). */
  | { kind: "out"; since: { ply: number; san: string } }
  | { kind: "none" };

export function theoryForPly(report: OpeningReport, ply: number): MoveTheory {
  if (report.deviation?.ply === ply) return { kind: "deviation", lastBookName: report.deviation.lastBookName };
  const entry = report.plies[ply - 1];
  // Après l'écart, une position du livre retrouvée par transposition reste théorique.
  if (entry?.inBook) return { kind: "book", name: entry.name, eco: entry.eco };
  if (report.deviation && ply > report.deviation.ply) {
    return { kind: "out", since: { ply: report.deviation.ply, san: report.deviation.san } };
  }
  return { kind: "none" };
}
