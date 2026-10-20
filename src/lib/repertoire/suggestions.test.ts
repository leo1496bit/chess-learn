import { describe, expect, it } from "vitest";
import { selectSuggestions, toPositionStat, type PositionStat } from "./suggestions";
import type { OpeningBook } from "@/lib/openings/identify";

const book: OpeningBook = {
  e1: ["B00", "King's Pawn Game", 1],
  e2: ["B12", "Caro-Kann Defense", 1],
  e3: ["B12", "Caro-Kann Defense: Two Knights Attack", 1],
  e4: ["C00", "French Defense", 1],
  e5: ["C00", "", 1],
  e6: ["C01", "Approx", 0],
};

const stat = (o: Partial<PositionStat>): PositionStat => ({
  epd: "e3", playerColor: "b", games: 54, wins: 10, draws: 9, losses: 35, topPath: "e2e4 c7c6 b1c3", ...o,
});

describe("selectSuggestions", () => {
  it("exclut les chemins de moins de 3 demi-coups", () => {
    expect(selectSuggestions([stat({ epd: "e1", games: 700, topPath: "e2e4" })], book, new Set())).toEqual([]);
  });
  it("garde une position exacte avec son nom et lossRate", () => {
    const [s] = selectSuggestions([stat({})], book, new Set());
    expect(s.name).toBe("Caro-Kann Defense: Two Knights Attack");
    expect(s.eco).toBe("B12");
    expect(s.lossRate).toBeCloseTo(35 / 54);
  });
  it("exclut les positions non exactes, inconnues ou sans nom", () => {
    const out = selectSuggestions(
      [stat({ epd: "e6" }), stat({ epd: "zz" }), stat({ epd: "e5" })], book, new Set());
    expect(out).toEqual([]);
  });
  it("retire un ancêtre dont un descendant réunit 80 % des parties", () => {
    const anc = stat({ epd: "e2", games: 60, topPath: "e2e4 c7c6 d2d4" });
    const desc = stat({ epd: "e3", games: 54, topPath: "e2e4 c7c6 d2d4 d7d5" });
    expect(selectSuggestions([anc, desc], book, new Set()).map((s) => s.epd)).toEqual(["e3"]);
  });
  it("garde l'ancêtre si le descendant est en dessous de 80 %", () => {
    const anc = stat({ epd: "e2", games: 100, topPath: "e2e4 c7c6 d2d4" });
    const desc = stat({ epd: "e3", games: 79, topPath: "e2e4 c7c6 d2d4 d7d5" });
    expect(selectSuggestions([anc, desc], book, new Set())).toHaveLength(2);
  });
  it("compare les coups entiers, pas les caractères, et la couleur", () => {
    const a = stat({ epd: "e2", games: 10, topPath: "e2e4 c7c6 d2d4" });
    const b = stat({ epd: "e3", games: 10, topPath: "e2e4 c7c6 d2d45" });
    const c = stat({ epd: "e4", games: 10, playerColor: "w", topPath: "e2e4 c7c6 d2d4 d7d5" });
    expect(selectSuggestions([a, b, c], book, new Set())).toHaveLength(3);
  });
  it("retire les positions déjà dans la bibliothèque", () => {
    expect(selectSuggestions([stat({})], book, new Set(["e3"]))).toEqual([]);
  });
  it("trie par parties décroissantes puis lossRate", () => {
    const a = stat({ epd: "e2", games: 20, losses: 5, topPath: "a1a2 a2a3 a3a4" });
    const b = stat({ epd: "e3", games: 30, topPath: "b1b2 b2b3 b3b4" });
    const c = stat({ epd: "e4", games: 20, losses: 15, topPath: "c1c2 c2c3 c3c4" });
    expect(selectSuggestions([a, b, c], book, new Set()).map((s) => s.epd)).toEqual(["e3", "e4", "e2"]);
  });
});

describe("toPositionStat", () => {
  it("convertit une ligne de la RPC", () => {
    expect(toPositionStat({ epd: "x", player_color: "w", games: 1, wins: 1, draws: 0, losses: 0, top_path: "e2e4" }))
      .toEqual({ epd: "x", playerColor: "w", games: 1, wins: 1, draws: 0, losses: 0, topPath: "e2e4" });
  });
});
