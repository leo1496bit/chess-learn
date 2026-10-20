import { describe, expect, it } from "vitest";
import { applyVerdict, opponentPlayed, startRecite, type ReciteState } from "./recite-session";

// 1. e4 c6 2. Nc3 d5 (Leonel joue les coups pairs)
const PATH = ["e2e4", "c7c6", "b1c3", "d7d5"];
const SAN = ["e4", "c6", "Nc3", "d5"];

function start(): ReciteState {
  return startRecite(PATH, SAN);
}

describe("startRecite", () => {
  it("commence au premier coup, Leonel au trait, sans compteur", () => {
    expect(start()).toEqual({ path: PATH, san: SAN, index: 0, phase: "player", wrongAtIndex: 0, hints: 0, revealed: 0, feedback: null });
  });

  it("une branche vide est déjà terminée", () => {
    expect(startRecite([], []).phase).toBe("done");
  });
});

describe("applyVerdict", () => {
  it("expected : avance au coup adverse et efface le message", () => {
    const s = applyVerdict({ ...start(), feedback: { kind: "alternative", expectedSan: "e4" } }, { verdict: "expected" });
    expect(s).toMatchObject({ index: 1, phase: "opponent", feedback: null, wrongAtIndex: 0 });
  });

  it("wrong une fois : indice sur la case de départ du coup attendu", () => {
    const s = applyVerdict(start(), { verdict: "wrong" });
    expect(s).toMatchObject({ index: 0, phase: "player", hints: 1, revealed: 0, wrongAtIndex: 1, feedback: { kind: "hint", square: "e2" } });
  });

  it("wrong deux fois : la réponse est révélée", () => {
    const s = applyVerdict(applyVerdict(start(), { verdict: "wrong" }), { verdict: "wrong" });
    expect(s).toMatchObject({ hints: 1, revealed: 1, wrongAtIndex: 2, feedback: { kind: "revealed", uci: "e2e4", san: "e4" } });
  });

  it("wrong après révélation : aucun compteur de plus", () => {
    let s = start();
    for (let i = 0; i < 4; i++) s = applyVerdict(s, { verdict: "wrong" });
    expect(s).toMatchObject({ hints: 1, revealed: 1, feedback: { kind: "revealed" } });
  });

  it("alternative : message avec le coup retenu, sans compteur, même coup à jouer", () => {
    const s = applyVerdict(start(), { verdict: "alternative", expectedSan: "e4" });
    expect(s).toMatchObject({ index: 0, phase: "player", hints: 0, revealed: 0, wrongAtIndex: 0, feedback: { kind: "alternative", expectedSan: "e4" } });
  });

  it("le compteur d'erreurs repart de zéro au coup suivant", () => {
    let s = applyVerdict(start(), { verdict: "wrong" });
    s = applyVerdict(s, { verdict: "expected" });
    s = opponentPlayed(s);
    s = applyVerdict(s, { verdict: "wrong" });
    expect(s).toMatchObject({ index: 2, hints: 2, revealed: 0, feedback: { kind: "hint", square: "b1" } });
  });

  it("dernier coup de la branche joué par Leonel : terminé", () => {
    const s = applyVerdict({ ...startRecite(["e2e4"], ["e4"]) }, { verdict: "expected" });
    expect(s.phase).toBe("done");
  });

  it("ignore un verdict hors du tour de Leonel", () => {
    const s = applyVerdict(start(), { verdict: "expected" });
    expect(applyVerdict(s, { verdict: "wrong" })).toBe(s);
  });
});

describe("opponentPlayed", () => {
  it("revient à Leonel après la réponse adverse", () => {
    const s = opponentPlayed(applyVerdict(start(), { verdict: "expected" }));
    expect(s).toMatchObject({ index: 2, phase: "player" });
  });

  it("dernière réponse adverse : terminé", () => {
    let s = start();
    s = opponentPlayed(applyVerdict(s, { verdict: "expected" }));
    s = opponentPlayed(applyVerdict(s, { verdict: "expected" }));
    expect(s).toMatchObject({ index: 4, phase: "done" });
  });

  it("ignoré hors du tour adverse", () => {
    const s = start();
    expect(opponentPlayed(s)).toBe(s);
  });
});
