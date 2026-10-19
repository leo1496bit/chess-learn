import { describe, expect, it } from "vitest";
import { evaluationForColor, formatEvaluation, isMateFor, moverWinPercent, winPercent } from "./win";

describe("winPercent", () => {
  it("vaut 50 à égalité et est symétrique", () => {
    expect(winPercent({ cp: 0, mate: null })).toBe(50);
    const plus = winPercent({ cp: 150, mate: null });
    const minus = winPercent({ cp: -150, mate: null });
    expect(plus + minus).toBeCloseTo(100, 10);
  });

  it("suit la formule Lichess", () => {
    expect(winPercent({ cp: 100, mate: null })).toBeCloseTo(59.1, 1);
    expect(winPercent({ cp: 300, mate: null })).toBeCloseTo(75.15, 1);
  });

  it("borne cp à ±1000", () => {
    expect(winPercent({ cp: 5000, mate: null })).toBe(winPercent({ cp: 1000, mate: null }));
    expect(winPercent({ cp: -5000, mate: null })).toBe(winPercent({ cp: -1000, mate: null }));
  });

  it("gère les mats (point de vue Blancs)", () => {
    expect(winPercent({ cp: null, mate: 3 })).toBe(100);
    expect(winPercent({ cp: null, mate: -2 })).toBe(0);
    // mate 0 : le camp au trait est maté.
    expect(winPercent({ cp: null, mate: 0 }, "b")).toBe(100);
    expect(winPercent({ cp: null, mate: 0 }, "w")).toBe(0);
    expect(winPercent({ cp: null, mate: 0 })).toBe(50);
  });
});

describe("moverWinPercent", () => {
  it("inverse le point de vue pour les Noirs", () => {
    const e = { cp: 200, mate: null };
    expect(moverWinPercent(e, "w")).toBeCloseTo(winPercent(e));
    expect(moverWinPercent(e, "b")).toBeCloseTo(100 - winPercent(e));
    expect(moverWinPercent({ cp: null, mate: -4 }, "b")).toBe(100);
  });

  it("donne 100 au camp qui vient de mater", () => {
    expect(moverWinPercent({ cp: null, mate: 0 }, "w")).toBe(100);
    expect(moverWinPercent({ cp: null, mate: 0 }, "b")).toBe(100);
  });
});

describe("evaluationForColor / isMateFor", () => {
  it("convertit vers le point de vue du joueur", () => {
    expect(evaluationForColor({ cp: 120, mate: null }, "b")).toEqual({ cp: -120, mate: null });
    expect(evaluationForColor({ cp: null, mate: -3 }, "b")).toEqual({ cp: null, mate: 3 });
    expect(isMateFor({ cp: null, mate: -3 }, "b")).toBe(true);
    expect(isMateFor({ cp: null, mate: -3 }, "w")).toBe(false);
    expect(isMateFor({ cp: null, mate: 0 }, "w")).toBe(false);
  });
});

describe("formatEvaluation", () => {
  it("formate en pions, point de vue Blancs", () => {
    expect(formatEvaluation({ cp: 135, mate: null })).toBe("+1.35");
    expect(formatEvaluation({ cp: -40, mate: null })).toBe("-0.40");
    expect(formatEvaluation({ cp: 0, mate: null })).toBe("0.00");
    expect(formatEvaluation({ cp: null, mate: 3 })).toBe("#3");
    expect(formatEvaluation({ cp: null, mate: -2 })).toBe("#-2");
    expect(formatEvaluation({ cp: null, mate: 0 }, "b")).toBe("1-0");
    expect(formatEvaluation({ cp: null, mate: 0 }, "w")).toBe("0-1");
  });
});
