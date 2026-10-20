import "server-only";
import namesData from "./names.json";
import { searchNames, type OpeningName, type OpeningNameHit } from "./names-search";

/** Index [eco, nom, coups UCI] des lignes nommées du livre : côté serveur uniquement. */
export const OPENING_NAMES = namesData as unknown as OpeningName[];

export function searchOpenings(query: string, limit = 20): OpeningNameHit[] {
  return searchNames(OPENING_NAMES, query, limit);
}
