import { describe, expect, it } from "vitest";
import { phase } from "./phase";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("phase", () => {
  it("ouverture au début de partie", () => {
    expect(phase(START, 1)).toBe("opening");
    expect(phase(START, 20)).toBe("opening");
  });

  it("milieu de partie après le 20e demi-coup", () => {
    expect(phase(START, 21)).toBe("middlegame");
  });

  it("finale avec peu de matériel", () => {
    expect(phase("8/8/4k3/8/8/8/4K3/R7 w - - 0 60", 119)).toBe("endgame");
    // Dames + tours : 2×(9+5) = 28 > 26, mais ≤ 26 sans une tour.
    expect(phase("3qk3/3r4/8/8/8/8/3R4/3QK3 w - - 0 40", 79)).toBe("middlegame");
    expect(phase("3qk3/8/8/8/8/8/3R4/3QK3 w - - 0 40", 79)).toBe("endgame");
  });

  it("finale sans dames avec au plus 2 pièces par camp", () => {
    expect(phase("2r1k1n1/pp3ppp/8/8/8/8/PP3PPP/2R1K1N1 w - - 0 30", 59)).toBe("endgame");
  });

  it("milieu de partie sans dames mais avec beaucoup de pièces", () => {
    expect(phase("r1b1kb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1B1KB1R w KQkq - 0 8", 30)).toBe("middlegame");
  });
});
