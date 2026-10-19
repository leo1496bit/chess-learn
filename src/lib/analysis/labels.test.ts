import { describe, expect, it } from "vitest";
import { formatSanLine, moveNumberLabel, themeKind } from "./labels";

describe("labels", () => {
  it("numérote une variante qui commence par un coup blanc ou noir", () => {
    expect(formatSanLine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e4", "e5", "Nf3"])).toBe("1. e4 e5 2. Nf3");
    expect(formatSanLine("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", ["g6", "Qf3", "Nf6"])).toBe(
      "3... g6 4. Qf3 Nf6",
    );
    expect(formatSanLine("8/8/8/8/8/8/8/K6k w - - 0 1", [])).toBe("");
  });

  it("numéro de coup", () => {
    expect(moveNumberLabel(1)).toBe("1.");
    expect(moveNumberLabel(6)).toBe("3...");
  });

  it("distingue tactique et stratégie", () => {
    expect(themeKind("hanging_piece")).toBe("tactical");
    expect(themeKind("endgame")).toBe("strategic");
    expect(themeKind("calculation")).toBe("other");
  });
});
