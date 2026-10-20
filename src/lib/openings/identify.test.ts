import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractPositions } from "@/lib/analysis/game";
import { identifyOpening, theoryForPly, toEpd, type OpeningBook } from "./identify";

const book = JSON.parse(readFileSync("src/lib/openings/book.json", "utf8")) as OpeningBook;

function run(pgn: string, player: "w" | "b" = "w") {
  const { fens, moves } = extractPositions(pgn);
  return identifyOpening(fens, moves.map((m) => m.san), player, book);
}

describe("identifyOpening (livre Lichess réel)", () => {
  it("nomme la Najdorf et compte la phase théorique", () => {
    const r = run("1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. h3 *");
    expect(r.family).toBe("Sicilian Defense");
    expect(r.variation).toContain("Najdorf");
    expect(r.eco).toMatch(/^B9/);
    expect(r.deviation).toBeNull();
    expect(r.bookPlies).toBe(11);
  });

  it("détecte un gambit et l'écart de théorie avec son auteur", () => {
    const r = run("1. e4 e5 2. f4 exf4 3. a3 *", "b");
    expect(r.gambit).toContain("King's Gambit");
    expect(r.deviation).toMatchObject({ ply: 5, color: "w", san: "a3", byPlayer: false });
    expect(r.deviation?.lastBookName).toContain("King's Gambit Accepted");
    expect(theoryForPly(r, 6)).toEqual({ kind: "out", since: { ply: 5, san: "a3" } });
    expect(theoryForPly(r, 5)).toMatchObject({ kind: "deviation" });
    expect(theoryForPly(r, 3)).toMatchObject({ kind: "book" });
  });

  it("signale un écart du joueur dès le début", () => {
    const r = run("1. e4 e5 2. Qh5 Ke7 *", "b");
    expect(r.deviation).toMatchObject({ ply: 4, byPlayer: true, san: "Ke7" });
    expect(r.plies[2].inBook).toBe(true);
    expect(r.plies[3].inBook).toBe(false);
  });

  it("reconnaît une transposition (compteurs de coups ignorés)", () => {
    expect(toEpd("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    );
    const r = run("1. Nf3 d5 2. d4 Nf6 3. c4 e6 4. Nc3 *");
    expect(r.deviation).toBeNull();
    expect(r.family).toMatch(/Queen's Gambit|Queen's Pawn/);
  });
});
