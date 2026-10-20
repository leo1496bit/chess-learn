// Construit le livre d'ouvertures indexé par EPD (FEN sans les compteurs de coups).
// Chaque position rencontrée dans une ligne nommée est « théorique ». Son nom est celui de la ligne
// nommée qui s'arrête exactement sur cette position ; sinon, celui de la dernière ligne nommée
// atteinte sur le chemin qui y mène (jamais celui d'une ligne plus profonde, dont les coups n'ont
// pas encore été joués).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";

const dir = "data/openings";
const lines = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsv")).sort()) {
  const rows = readFileSync(join(dir, file), "utf8").trim().split("\n").slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const moves = pgn.replace(/\d+\.\s*/g, "").trim().split(/\s+/);
    lines.push({ eco, name, moves });
  }
}
lines.sort((a, b) => a.moves.length - b.moves.length);

const epd = (fen) => fen.split(" ").slice(0, 4).join(" ");

// 1er passage : positions où s'arrête une ligne nommée (la ligne la plus courte l'emporte).
const exact = new Map();
for (const line of lines) {
  const chess = new Chess();
  for (const san of line.moves) chess.move(san);
  const key = epd(chess.fen());
  if (!exact.has(key)) exact.set(key, [line.eco, line.name]);
}

/** epd -> [eco, nom, exact (1 = une ligne nommée s'arrête ici)] ; nom vide si aucune ligne n'est encore atteinte. */
const book = {};
for (const line of lines) {
  const chess = new Chess();
  let reached = null;
  for (const san of line.moves) {
    chess.move(san);
    const key = epd(chess.fen());
    const named = exact.get(key);
    if (named) reached = named;
    if (book[key]) continue;
    book[key] = named ? [named[0], named[1], 1] : [reached?.[0] ?? "", reached?.[1] ?? "", 0];
  }
}
writeFileSync("src/lib/openings/book.json", JSON.stringify(book));
console.log(`${lines.length} lignes, ${Object.keys(book).length} positions`);
