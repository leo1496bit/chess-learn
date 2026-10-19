// Lecture rapide des en-têtes PGN (sans rejouer les coups).

const HEADER_RE = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;

export type PgnHeaders = Record<string, string>;

export function parsePgnHeaders(pgn: string): PgnHeaders {
  const headers: PgnHeaders = {};
  for (const match of pgn.matchAll(HEADER_RE)) {
    headers[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
  }
  return headers;
}

/** Valeur d'en-tête utile : absente, vide ou « ? » / « - » → null. */
export function headerValue(headers: PgnHeaders, name: string): string | null {
  const value = headers[name]?.trim();
  if (!value || value === "?" || value === "-") return null;
  return value;
}
