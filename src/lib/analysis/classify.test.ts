import { describe, expect, it } from "vitest";
import { classifyMove, gameAccuracy, moveAccuracy, type ClassifyMoveInput } from "./classify";
import { cpForWhiteWin } from "./test-helpers";
import { DEFAULT_THRESHOLDS } from "./types";

/** Coup blanc dont le % de gain passe de `before` à `after`. */
function white(before: number, after: number, extra: Partial<ClassifyMoveInput> = {}) {
  return classifyMove({
    color: "w",
    evalBefore: cpForWhiteWin(before),
    evalAfter: cpForWhiteWin(after),
    playedUci: "e2e4",
    bestUci: "d2d4",
    legalMoveCount: 20,
    thresholds: DEFAULT_THRESHOLDS,
    ...extra,
  });
}

describe("classifyMove — seuils", () => {
  it.each([
    [50, 49, "excellent"],
    [50, 47, "good"],
    [50, 44, "inaccuracy"],
    [50, 35, "mistake"],
    [50, 25, "blunder"],
  ] as const)("perte de %d → %d : %s", (before, after, expected) => {
    const r = white(before, after);
    expect(r.classification).toBe(expected);
    expect(r.loss).toBeCloseTo(before - after, 6);
  });

  it("respecte les bornes exactes des seuils", () => {
    expect(white(60, 54.99).classification).toBe("inaccuracy"); // 5 ≤ loss
    expect(white(60, 55.01).classification).toBe("good");
    expect(white(60, 50).classification).toBe("mistake"); // 10 ≤ loss
    expect(white(60, 40).classification).toBe("blunder"); // 20 ≤ loss
    expect(white(60, 58.01).classification).toBe("excellent"); // loss < 2
  });

  it("lit les seuils en paramètre", () => {
    const strict = { excellent: 1, good: 2, inaccuracy: 2, mistake: 4, blunder: 6 };
    expect(white(50, 45.5, { thresholds: strict }).classification).toBe("mistake");
    expect(white(50, 44, { thresholds: strict }).classification).toBe("blunder");
  });

  it("borne la perte à 0 quand le coup améliore la position", () => {
    const r = white(50, 55);
    expect(r.loss).toBe(0);
    expect(r.classification).toBe("excellent");
    expect(r.accuracy).toBeCloseTo(100, 3);
  });

  it("raisonne du point de vue des Noirs", () => {
    // Blancs passent de 50 % à 70 % : les Noirs perdent 20 points.
    const r = classifyMove({
      color: "b",
      evalBefore: cpForWhiteWin(50),
      evalAfter: cpForWhiteWin(70),
      playedUci: "e7e5",
      bestUci: "c7c5",
      legalMoveCount: 20,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(r.winBefore).toBeCloseTo(50);
    expect(r.winAfter).toBeCloseTo(30);
    expect(r.classification).toBe("blunder");
  });
});

describe("classifyMove — règles complémentaires", () => {
  it("meilleur coup du moteur → best", () => {
    expect(white(50, 46, { playedUci: "d2d4" }).classification).toBe("best");
  });

  it("coup unique légal → forced, jamais d'erreur", () => {
    const r = white(50, 10, { legalMoveCount: 1 });
    expect(r.classification).toBe("forced");
    expect(r.loss).toBe(0);
    expect(r.missedSave).toBe(false);
  });

  it("position déjà gagnée : pas d'erreur au-delà de good", () => {
    expect(white(99, 91).classification).toBe("good");
    expect(white(99, 85).classification).toBe("mistake"); // après < 90 : la règle ne s'applique pas
  });

  it("position déjà perdue : pas d'erreur au-delà de good", () => {
    // ±1000 cp borne le % de gain vers 2,4 % : seuils bas pour rendre la règle observable.
    const low = { excellent: 0.5, good: 1, inaccuracy: 1, mistake: 2, blunder: 2.5 };
    const r = white(3, 0, { evalAfter: { cp: null, mate: -2 }, thresholds: low });
    expect(r.loss).toBeCloseTo(3);
    expect(r.classification).toBe("good");
    expect(white(4, 0, { evalAfter: { cp: null, mate: -2 }, thresholds: low }).classification).toBe("blunder");
  });

  it("occasion manquée de gagner", () => {
    const r = white(85, 55);
    expect(r.missedWin).toBe(true);
    expect(r.classification).toBe("blunder");
    expect(white(85, 65).missedWin).toBe(false);
  });

  it("sauvetage manqué", () => {
    expect(white(45, 15).missedSave).toBe(true);
    expect(white(45, 25).missedSave).toBe(false);
  });

  it("mat raté → au minimum mistake", () => {
    const loose = { excellent: 2, good: 5, inaccuracy: 5, mistake: 20, blunder: 30 };
    const r = classifyMove({
      color: "w",
      evalBefore: { cp: null, mate: 3 },
      evalAfter: cpForWhiteWin(85),
      playedUci: "e2e4",
      bestUci: "d1h5",
      legalMoveCount: 30,
      thresholds: loose,
    });
    expect(r.missedMate).toBe(true);
    expect(r.classification).toBe("mistake");
  });

  it("donner le mat n'est pas un mat raté", () => {
    const r = classifyMove({
      color: "w",
      evalBefore: { cp: null, mate: 2 },
      evalAfter: { cp: null, mate: 0 },
      playedUci: "h5f7",
      bestUci: "c4f7",
      legalMoveCount: 30,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(r.missedMate).toBe(false);
    expect(r.loss).toBe(0);
  });
});

describe("précision", () => {
  it("précision par coup", () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 3);
    expect(moveAccuracy(10)).toBeCloseTo(103.1668 * Math.exp(-0.4354) - 3.1669, 6);
    expect(moveAccuracy(200)).toBe(0);
  });

  it("précision de partie = moyenne", () => {
    expect(gameAccuracy([100, 80, 60])).toBeCloseTo(80);
    expect(gameAccuracy([])).toBeNull();
  });
});
