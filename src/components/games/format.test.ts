import { describe, expect, it } from "vitest";
import { describeResult, formatRelative, formatTimeControl } from "./format";

describe("formatTimeControl", () => {
  it.each([
    ["900+10", "15 min + 10 s"],
    ["180", "3 min"],
    ["180+2", "3 min + 2 s"],
    ["60", "1 min"],
    ["30", "30 s"],
    ["1/86400", "1 j par coup"],
    ["1/259200", "3 j par coup"],
  ])("%s → %s", (input, expected) => {
    expect(formatTimeControl(input)).toBe(expected);
  });

  it("renvoie null sans cadence", () => {
    expect(formatTimeControl("-")).toBeNull();
    expect(formatTimeControl(null)).toBeNull();
  });
});

describe("describeResult", () => {
  it("décrit la fin de partie", () => {
    expect(describeResult("win", "checkmated")).toBe("Gain par mat");
    expect(describeResult("loss", "timeout")).toBe("Perte au temps");
    expect(describeResult("draw", "repetition")).toBe("Nulle par répétition");
    expect(describeResult("loss", "code-inconnu")).toBe("Perte");
  });
});

describe("formatRelative", () => {
  it("formate une date passée en français", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(formatRelative("2026-10-20T11:59:30Z", now)).toBe("à l'instant");
    expect(formatRelative("2026-10-20T10:00:00Z", now)).toBe("il y a 2 heures");
  });
});
