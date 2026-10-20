// Construit le livre d'ouvertures indexé par EPD (FEN sans les compteurs de coups).
// Chaque position rencontrée dans une ligne nommée est « théorique » ; son nom est celui de la
// ligne nommée la plus spécifique qui s'arrête exactement sur cette position, sinon celui de la
// ligne la plus courte qui la traverse.
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
/** epd -> [eco, name, exact (1 = une ligne nommée s'arrête ici)] */
const book = {};
for (const line of lines) {
  const chess = new Chess();
  line.moves.forEach((san, i) => {
    chess.move(san);
    const key = epd(chess.fen());
    const exact = i === line.moves.length - 1;
    const current = book[key];
    if (!current || (exact && !current[2])) book[key] = [line.eco, line.name, exact ? 1 : 0];
  });
}
writeFileSync("src/lib/openings/book.json", JSON.stringify(book));
console.log(`${lines.length} lignes, ${Object.keys(book).length} positions`);
