import { describe, expect, it } from "vitest";
import { searchNames, type OpeningName } from "./names-search";

const names: OpeningName[] = [
  ["B12", "Caro-Kann Defense: Two Knights Attack", "e2e4 c7c6 b1c3 d7d5 g1f3"],
  ["C55", "Italian Game: Two Knights Defense", "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6"],
  ["C00", "French Defense", "e2e4 e7e6"],
];

describe("searchNames", () => {
  it("cherche sans casse, tous les termes, plus court d'abord", () => {
    expect(searchNames(names, "TWO knights").map((r) => r.eco)).toEqual(["B12", "C55"]);
    expect(searchNames(names, "two french")).toEqual([]);
  });
  it("renvoie [] pour une requête vide et respecte limit", () => {
    expect(searchNames(names, "  ")).toEqual([]);
    expect(searchNames(names, "e", 1)).toHaveLength(1);
  });
  it("renvoie eco, name, uci", () => {
    expect(searchNames(names, "french")).toEqual([{ eco: "C00", name: "French Defense", uci: "e2e4 e7e6" }]);
  });
});
