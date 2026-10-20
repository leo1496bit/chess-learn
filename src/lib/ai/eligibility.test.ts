import { describe, expect, it } from "vitest";
import { isFlaggedMove } from "./eligibility";
import { BLACK_MISTAKE } from "./test-fixtures";

describe("isFlaggedMove", () => {
  it("cadre en erreur les imprécisions, erreurs, gaffes et gains manqués, quel que soit le camp", () => {
    expect(isFlaggedMove(BLACK_MISTAKE)).toBe(true);
    expect(isFlaggedMove({ ...BLACK_MISTAKE, classification: "inaccuracy" })).toBe(true);
    expect(isFlaggedMove({ ...BLACK_MISTAKE, classification: "blunder" })).toBe(true);
    expect(isFlaggedMove({ ...BLACK_MISTAKE, classification: "good", missedWin: true })).toBe(true);
  });

  it("cadre en bon coup les autres classifications", () => {
    for (const classification of ["best", "excellent", "good", "forced"] as const) {
      expect(isFlaggedMove({ ...BLACK_MISTAKE, classification, missedWin: false })).toBe(false);
    }
  });
});
