// Recherche pure dans l'index des noms du livre (voir ./names.ts pour les données, côté serveur).
export type OpeningName = [eco: string, name: string, uci: string];
export type OpeningNameHit = { eco: string; name: string; uci: string };

export function searchNames(names: readonly OpeningName[], query: string, limit = 20): OpeningNameHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return names
    .filter(([, name]) => {
      const lower = name.toLowerCase();
      return terms.every((t) => lower.includes(t));
    })
    .map(([eco, name, uci]) => ({ eco, name, uci }))
    .sort((a, b) => a.uci.split(" ").length - b.uci.split(" ").length || a.name.localeCompare(b.name))
    .slice(0, limit);
}
