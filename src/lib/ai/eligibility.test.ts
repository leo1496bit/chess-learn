import { describe, expect, it } from "vitest";
import { isExplainable } from "./eligibility";
import { BLACK_MISTAKE } from "./test-fixtures";

describe("isExplainable", () => {
  it("n'accepte que les écarts du joueur", () => {
    expect(isExplainable(BLACK_MISTAKE)).toBe(true);
    expect(isExplainable({ ...BLACK_MISTAKE, classification: "inaccuracy" })).toBe(true);
    expect(isExplainable({ ...BLACK_MISTAKE, classification: "blunder" })).toBe(true);
    expect(isExplainable({ ...BLACK_MISTAKE, isPlayerMove: false })).toBe(false);
    expect(isExplainable({ ...BLACK_MISTAKE, classification: "good" })).toBe(false);
    expect(isExplainable({ ...BLACK_MISTAKE, classification: "good", missedWin: true })).toBe(true);
  });
});
