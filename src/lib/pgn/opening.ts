// Nom d'ouverture lisible à partir de l'URL ECOUrl de Chess.com.
// Ex. https://www.chess.com/openings/Pirc-Defense-Modern-Defense-Geller-System-2...Nf6-3.Nc3-e5
//   → { name: "Pirc Defense Modern Defense Geller System", line: "2...Nf6 3.Nc3 e5" }

export type Opening = {
  /** Nom de l'ouverture et de la variante, sans les coups (stable pour les statistiques). */
  name: string;
  /** Coups précisant la ligne, en notation anglaise telle que fournie par Chess.com. */
  line: string | null;
};

// Chess.com retire les apostrophes des URLs : on rétablit les possessifs courants.
const POSSESSIVES: Record<string, string> = {
  Kings: "King's",
  Queens: "Queen's",
  Bishops: "Bishop's",
  Birds: "Bird's",
  Petrovs: "Petrov's",
  Alekhines: "Alekhine's",
  Owens: "Owen's",
  Larsens: "Larsen's",
  Grobs: "Grob's",
  Amars: "Amar's",
  Durkins: "Durkin's",
};

// Noms composés dont le tiret disparaît avec les autres séparateurs.
const HYPHENATED: [RegExp, string][] = [
  [/\bCaro Kann\b/g, "Caro-Kann"],
  [/\bNimzo Indian\b/g, "Nimzo-Indian"],
  [/\bBogo Indian\b/g, "Bogo-Indian"],
  [/\bNimzo Larsen\b/g, "Nimzo-Larsen"],
  [/\bSmith Morra\b/g, "Smith-Morra"],
  [/\bMax Lange\b/g, "Max-Lange"],
];

// Premier numéro de coup (« 3.Nc3 », « 2...Nf6 »), précédé du début, d'un tiret ou de « ... ».
const FIRST_MOVE_RE = /(^|-|\.{3})(\d+\.)/;

function formatName(slug: string): string {
  let name = slug
    .replace(/(\w)-t-/g, "$1't ") // Van-t-Kruijs → Van't Kruijs
    .split("-")
    .filter(Boolean)
    .map((word) => POSSESSIVES[word] ?? word)
    .join(" ")
    .trim();
  for (const [pattern, replacement] of HYPHENATED) name = name.replace(pattern, replacement);
  return name;
}

function formatLine(slug: string): string {
  const tokens = slug.split("-").filter(Boolean);
  const merged: string[] = [];
  for (const token of tokens) {
    const previous = merged.at(-1);
    // Les tirets du roque (O-O, O-O-O) servent aussi de séparateurs : on les recolle.
    if (token === "O" && previous !== undefined && /(^|\.)O(-O)?$/.test(previous)) {
      merged[merged.length - 1] = `${previous}-O`;
    } else {
      merged.push(token);
    }
  }
  return merged.join(" ");
}

export function openingFromEcoUrl(url: string | null | undefined): Opening | null {
  if (!url) return null;
  const marker = "/openings/";
  const index = url.indexOf(marker);
  if (index === -1) return null;

  let slug = url.slice(index + marker.length).split(/[?#]/)[0].replace(/\/+$/, "");
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // URL mal encodée : on garde la forme brute.
  }
  if (!slug || slug.toLowerCase() === "undefined") return null;

  const match = FIRST_MOVE_RE.exec(slug);
  const namePart = match ? slug.slice(0, match.index) : slug;
  const linePart = match ? slug.slice(match.index + match[1].length) : "";

  const name = formatName(namePart.replace(/\.+$/, ""));
  if (!name) return null;
  return { name, line: linePart ? formatLine(linePart) : null };
}
