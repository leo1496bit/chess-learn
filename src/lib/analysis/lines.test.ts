import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUci, uciLineToSan } from "./lines";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

afterEach(() => vi.restoreAllMocks());

describe("uciLineToSan", () => {
  it("convertit une variante en SAN", () => {
    expect(uciLineToSan(START, ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])).toEqual({
      san: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
      uci: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
    });
  });

  it("tronque au premier coup illégal et journalise", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = uciLineToSan(START, ["e2e4", "e7e5", "e4e5", "g8f6"]);
    expect(r.san).toEqual(["e4", "e5"]);
    expect(r.uci).toEqual(["e2e4", "e7e5"]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("rejette un coup UCI mal formé", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(uciLineToSan(START, ["e2e9"]).san).toEqual([]);
  });

  it("limite à 8 demi-coups par défaut", () => {
    const line = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6"];
    expect(uciLineToSan(START, line).san).toHaveLength(8);
    expect(uciLineToSan(START, line, 3).san).toEqual(["Nf3", "Nf6", "Ng1"]);
  });

  it("gère promotion, roque et mat", () => {
    expect(uciLineToSan("8/P6k/8/8/8/8/8/K7 w - - 0 1", ["a7a8q"]).san).toEqual(["a8=Q"]);
    expect(uciLineToSan("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", ["e1g1", "e8c8"]).san).toEqual(["O-O", "O-O-O"]);
    expect(uciLineToSan("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 3", ["h5f7"]).san).toEqual(["Qxf7#"]);
  });
});

describe("parseUci", () => {
  it("lit from/to/promotion", () => {
    expect(parseUci("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
    expect(parseUci("e2e4")).toEqual({ from: "e2", to: "e4" });
    expect(parseUci("(none)")).toBeNull();
  });
});
