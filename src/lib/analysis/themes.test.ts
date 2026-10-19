import { describe, expect, it } from "vitest";
import { validateLine } from "./lines";
import { detectThemes, type ThemeInput } from "./themes";
import { phase } from "./phase";
import { fenAfterMoves } from "./test-helpers";
import { DEFAULT_THRESHOLDS, type Evaluation, type ValidatedLine } from "./types";

const cp = (value: number): Evaluation => ({ cp: value, mate: null });

function line(fen: string, uci: string[], evaluation: Evaluation): ValidatedLine {
  return validateLine(fen, { multipv: 1, depth: 16, evaluation, pvUci: uci });
}

function input(moves: string[], played: string, playedUci: string, rest: Partial<ThemeInput> & { punish?: [string[], Evaluation]; best?: [string[], Evaluation][] }): ThemeInput {
  const fenBefore = fenAfterMoves(...moves);
  const fenAfter = fenAfterMoves(...moves, played);
  const ply = moves.length + 1;
  return {
    fenBefore,
    fenAfter,
    color: moves.length % 2 === 0 ? "w" : "b",
    ply,
    playedUci,
    candidates: (rest.best ?? []).map(([uci, e]) => line(fenBefore, uci, e)),
    punishLine: rest.punish ? line(fenAfter, rest.punish[0], rest.punish[1]) : null,
    loss: 25,
    classification: "blunder",
    missedWin: false,
    phase: phase(fenBefore, ply),
    thresholds: DEFAULT_THRESHOLDS,
    ...rest,
  };
}

describe("detectThemes", () => {
  it("aucun thème pour un bon coup", () => {
    const t = detectThemes(input(["e4"], "e5", "e7e5", { classification: "good", loss: 3 }));
    expect(t).toEqual([]);
  });

  it("mat du berger : tactique et sécurité du roi", () => {
    const t = detectThemes(
      input(["e4", "e5", "Qh5", "Nc6", "Bc4"], "Nf6", "g8f6", {
        punish: [["h5f7"], { cp: null, mate: 1 }],
        best: [[["g7g6", "h5f3", "g8f6"], cp(20)]],
      }),
    );
    expect(t).toEqual(["tactics", "king_safety"]);
  });

  it("pièce en prise et échange défavorable (3.Nxe5?? Nxe5)", () => {
    const t = detectThemes(
      input(["e4", "e5", "Nf3", "Nc6"], "Nxe5", "f3e5", {
        punish: [["c6e5", "d2d4", "e5g6"], cp(-250)],
        best: [[["f1b5", "a7a6"], cp(30)]],
      }),
    );
    expect(t).toEqual(["tactics", "hanging_piece", "development", "bad_exchange"]);
  });

  it("tactique manquée : le meilleur coup gagnait une pièce", () => {
    const t = detectThemes(
      input(["e4", "e5", "Nf3", "Nc6", "Nxe5"], "d6", "d7d6", {
        loss: 15,
        classification: "mistake",
        punish: [["e5f3", "g8f6"], cp(80)],
        best: [[["c6e5", "d2d4", "e5g6"], cp(-250)]],
      }),
    );
    expect(t).toEqual(["missed_tactic", "strategy"]);
  });

  it("sortie précoce de la dame : développement", () => {
    const t = detectThemes(
      input(["e4", "e5"], "Qh5", "d1h5", {
        loss: 6,
        classification: "inaccuracy",
        punish: [["b8c6", "f1c4", "g7g6"], cp(-20)],
        best: [[["g1f3", "b8c6"], cp(40)]],
      }),
    );
    expect(t).toEqual(["development", "strategy"]);
  });

  it("finale et calcul (coup joué en MultiPV 2)", () => {
    const fenBefore = "8/5k2/8/3K4/8/8/5P2/8 w - - 0 60";
    const fenAfter = "8/5k2/8/4K3/8/8/5P2/8 b - - 1 60";
    const t = detectThemes({
      fenBefore,
      fenAfter,
      color: "w",
      ply: 119,
      playedUci: "d5e5",
      candidates: [line(fenBefore, ["f2f4", "f7e7"], cp(500)), line(fenBefore, ["d5e5", "f7e7"], cp(300))],
      punishLine: line(fenAfter, ["f7e7", "f2f4"], cp(150)),
      loss: 12,
      classification: "mistake",
      missedWin: false,
      phase: phase(fenBefore, 119),
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(t).toEqual(["endgame", "strategy", "calculation"]);
  });

  it("gain manqué sans classification d'erreur reçoit tout de même des thèmes", () => {
    const t = detectThemes(
      input(["e4", "e5", "Nf3", "Nc6", "Nxe5"], "d6", "d7d6", {
        loss: 3,
        classification: "good",
        missedWin: true,
        punish: [["e5f3"], cp(80)],
        best: [[["c6e5"], cp(-250)]],
      }),
    );
    expect(t).toContain("missed_tactic");
  });
});
