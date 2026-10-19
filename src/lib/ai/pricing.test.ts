import { describe, expect, it } from "vitest";
import { addUsage, EMPTY_USAGE, estimateCost } from "./pricing";

describe("estimateCost", () => {
  it("vaut 0 sans tokens", () => {
    expect(estimateCost(EMPTY_USAGE)).toBe(0);
  });

  it("applique 0,10 $/M en entrée et 0,50 $/M en sortie", () => {
    expect(estimateCost({ ...EMPTY_USAGE, inputTokens: 1_000_000 })).toBeCloseTo(0.1, 6);
    expect(estimateCost({ ...EMPTY_USAGE, outputTokens: 1_000_000 })).toBeCloseTo(0.5, 6);
  });

  it("facture la lecture du cache à 0,1× et l'écriture à 1,25× l'entrée", () => {
    expect(estimateCost({ ...EMPTY_USAGE, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.01, 6);
    expect(estimateCost({ ...EMPTY_USAGE, cacheWriteTokens: 1_000_000 })).toBeCloseTo(0.125, 6);
  });

  it("additionne un appel typique d'explication", () => {
    // 1 200 tokens hors cache, 900 lus en cache, 600 en sortie
    const cost = estimateCost({ inputTokens: 1200, outputTokens: 600, cacheReadTokens: 900, cacheWriteTokens: 0 });
    expect(cost).toBeCloseTo(0.000120 + 0.000300 + 0.000009, 6);
  });
});

describe("addUsage", () => {
  it("somme champ par champ", () => {
    expect(addUsage({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 })).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadTokens: 33,
      cacheWriteTokens: 44,
    });
  });
});
