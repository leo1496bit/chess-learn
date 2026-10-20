import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, type PositionAnalysis, type ValidatedLine } from "@/lib/analysis/types";
import { AttemptBodySchema, judgeAttempt, positionAfter } from "./attempt";
import { selectNextExercises, groupTrainingStats, type QueueExercise } from "./queue";
import { analyzeSolution, buildExercise, exerciseDifficulty, type ExerciseSourceMove } from "./select";
import { nextSuccessInterval, scheduleReview } from "./sm2";

// Position après 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 : les Blancs au trait.
const FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

function line(cp: number | null, uci: string[], san: string[], mate: number | null = null): ValidatedLine {
  return { evaluation: { cp, mate }, uci, san };
}

function source(overrides: Partial<ExerciseSourceMove> = {}): ExerciseSourceMove {
  return {
    id: 1,
    gameId: "game-1",
    isPlayerMove: true,
    color: "w",
    fenBefore: FEN,
    uci: "d2d3",
    loss: 15,
    classification: "mistake",
    missedWin: false,
    phase: "opening",
    themes: ["tactics"],
    candidates: [
      line(300, ["f3g5", "d7d5", "e4d5"], ["Ng5", "d5", "exd5"]),
      line(20, ["d2d3", "f8c5"], ["d3", "Bc5"]),
      line(10, ["b1c3", "f8b4"], ["Nc3", "Bb4"]),
    ],
    ...overrides,
  };
}

describe("sélection des exercices", () => {
  it("reconnaît une solution nette (écart ≥ 10) et n'accepte que le meilleur coup", () => {
    const s = analyzeSolution(source().candidates, "w");
    expect(s).toEqual({ clear: true, accepted: ["f3g5"], mateIn: null });
  });

  it("accepte plusieurs coups quand la solution n'est pas nette", () => {
    const s = analyzeSolution([line(100, ["a2a3"], ["a3"]), line(95, ["h2h3"], ["h3"]), line(-200, ["g2g4"], ["g4"])], "w");
    expect(s?.clear).toBe(false);
    expect(s?.accepted).toEqual(["a2a3", "h2h3"]);
  });

  it("considère un mat comme une solution nette, du point de vue du joueur au trait", () => {
    const black = analyzeSolution([line(null, ["d8h4"], ["Qh4#"], -1), line(null, ["d8h4"], ["Qh4#"], -1)], "b");
    expect(black).toMatchObject({ clear: true, mateIn: 1 });
    const whiteMated = analyzeSolution([line(null, ["a2a3"], ["a3"], -3)], "w");
    expect(whiteMated?.mateIn).toBeNull();
  });

  it("construit l'exercice depuis la position avant l'erreur", () => {
    const ex = buildExercise(source());
    expect(ex).toMatchObject({
      source_move_id: 1,
      fen: FEN,
      side_to_move: "w",
      played_uci: "d2d3",
      solution_uci: "f3g5",
      solution_san: "Ng5",
      accepted_uci: ["f3g5"],
      difficulty: "medium",
    });
    expect(ex?.solution_line).toEqual([
      { uci: "f3g5", san: "Ng5" },
      { uci: "d7d5", san: "d5" },
      { uci: "e4d5", san: "exd5" },
    ]);
  });

  it("écarte les coups qui ne se prêtent pas à un exercice", () => {
    expect(buildExercise(source({ isPlayerMove: false }))).toBeNull();
    expect(buildExercise(source({ classification: "good" }))).toBeNull();
    expect(buildExercise(source({ candidates: [] }))).toBeNull();
    // Le coup joué fait partie des coups acceptés.
    expect(buildExercise(source({ uci: "f3g5" }))).toBeNull();
    // Imprécision sans solution nette.
    const fuzzy = [line(100, ["a2a3"], ["a3"]), line(95, ["h2h3"], ["h3"])];
    expect(buildExercise(source({ classification: "inaccuracy", uci: "g2g4", candidates: fuzzy }))).toBeNull();
  });

  it("garde un gain manqué même classé imprécision", () => {
    expect(buildExercise(source({ classification: "inaccuracy", missedWin: true }))).not.toBeNull();
  });
});

describe("difficulté", () => {
  const solution = line(300, ["f3g5", "d7d5"], ["Ng5", "d5"]);
  const quietLong = line(300, ["a2a3", "a7a6", "b2b3", "b7b6", "c2c3", "c7c6"], ["a3", "a6", "b3", "b6", "c3", "c6"]);
  const base = { classification: "mistake" as const, loss: 15, themes: [] as never[], mateIn: null, solution };

  it("facile : mat en 1-2, perte évitée ≥ 30 ou imprécision", () => {
    expect(exerciseDifficulty({ ...base, mateIn: 2 })).toBe("easy");
    expect(exerciseDifficulty({ ...base, loss: 35 })).toBe("easy");
    expect(exerciseDifficulty({ ...base, classification: "inaccuracy" })).toBe("easy");
  });

  it("difficile : calcul ou coup calme avec une ligne de 6 demi-coups ou plus", () => {
    expect(exerciseDifficulty({ ...base, themes: ["calculation"] })).toBe("hard");
    expect(exerciseDifficulty({ ...base, solution: quietLong, loss: 40 })).toBe("hard");
  });

  it("moyen sinon", () => {
    expect(exerciseDifficulty(base)).toBe("medium");
  });
});

describe("répétition espacée (SM-2 simplifié)", () => {
  const now = new Date("2026-10-20T08:00:00.000Z");

  it("allonge l'intervalle après une réussite : 1, 3, 7 puis ×2,5", () => {
    expect([0, 1, 3, 7, 18].map(nextSuccessInterval)).toEqual([1, 3, 7, 18, 45]);
    expect(nextSuccessInterval(150)).toBe(180);
  });

  it("programme la prochaine révision et compte les réussites", () => {
    const r = scheduleReview({ intervalDays: 3, attempts: 2, successes: 2 }, true, now);
    expect(r).toEqual({
      intervalDays: 7,
      attempts: 3,
      successes: 3,
      lastResult: "correct",
      dueAt: "2026-10-27T08:00:00.000Z",
    });
  });

  it("revient à 1 jour après un échec", () => {
    const r = scheduleReview({ intervalDays: 18, attempts: 4, successes: 4 }, false, now);
    expect(r).toMatchObject({ intervalDays: 1, attempts: 5, successes: 4, lastResult: "incorrect", dueAt: "2026-10-21T08:00:00.000Z" });
  });
});

describe("file d'exercices", () => {
  const now = new Date("2026-10-20T08:00:00.000Z");
  function ex(overrides: Partial<QueueExercise>): QueueExercise {
    return {
      id: "x",
      themes: ["tactics"],
      difficulty: "medium",
      dueAt: "2026-10-19T00:00:00.000Z",
      attempts: 0,
      successes: 0,
      createdAt: "2026-10-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("place les révisions dues d'abord, puis les nouveaux, puis les autres", () => {
    const list = [
      ex({ id: "future", attempts: 1, successes: 1, dueAt: "2026-10-25T00:00:00.000Z" }),
      ex({ id: "new" }),
      ex({ id: "due", attempts: 1, successes: 0, dueAt: "2026-10-19T00:00:00.000Z" }),
    ];
    expect(selectNextExercises(list, { now }).map((e) => e.id)).toEqual(["due", "new", "future"]);
  });

  it("priorise les axes où le taux de réussite est le plus faible", () => {
    const history = [
      ex({ id: "t-hist", themes: ["tactics"], attempts: 5, successes: 5, dueAt: "2026-12-01T00:00:00.000Z" }),
      ex({ id: "e-hist", themes: ["endgame"], attempts: 5, successes: 1, dueAt: "2026-12-01T00:00:00.000Z" }),
    ];
    const list = [...history, ex({ id: "t-new", themes: ["tactics"] }), ex({ id: "e-new", themes: ["endgame"] })];
    expect(selectNextExercises(list, { now, limit: 2 }).map((e) => e.id)).toEqual(["e-new", "t-new"]);
  });

  it("filtre par axe et par difficulté", () => {
    const list = [
      ex({ id: "a", themes: ["king_safety"], difficulty: "hard" }),
      ex({ id: "b", themes: ["king_safety"], difficulty: "easy" }),
      ex({ id: "c", themes: ["strategy"], difficulty: "hard" }),
    ];
    expect(selectNextExercises(list, { now, group: "king_safety", difficulty: "hard" }).map((e) => e.id)).toEqual(["a"]);
  });

  it("compte les exercices dus et le taux de réussite par axe", () => {
    const stats = groupTrainingStats([ex({ attempts: 4, successes: 2 }), ex({ attempts: 2, successes: 2, dueAt: "2026-11-01T00:00:00.000Z" })], now);
    const tactics = stats.find((s) => s.group === "tactics");
    expect(tactics).toMatchObject({ exercises: 2, due: 1, attempts: 6, successes: 4 });
    expect(tactics?.successRate.status === "ok" && tactics.successRate.value).toBeCloseTo(66.67, 1);
  });
});

describe("jugement d'une réponse (serveur)", () => {
  const exercise = { fen: FEN, accepted_uci: ["f3g5"] };
  const analysis = (fen: string, cp: number, pv: string[]): PositionAnalysis => ({
    fen,
    depth: 16,
    multipv: 1,
    engineVersion: "sf19-lite-single",
    lines: [{ multipv: 1, depth: 16, evaluation: { cp, mate: null }, pvUci: pv }],
  });
  const before = analysis(FEN, 60, ["f3g5", "d7d5"]);
  const after = (uci: string, cp: number) => analysis(positionAfter(FEN, uci)!.fenAfter, cp, []);

  it("calcule la position obtenue et refuse un coup illégal", () => {
    expect(positionAfter(FEN, "e1g8")).toBeNull();
    expect(positionAfter(FEN, "f3g5")?.san).toBe("Ng5");
    expect(judgeAttempt(exercise, "e1g8", before, before, DEFAULT_THRESHOLDS)).toMatchObject({ ok: false });
  });

  it("juge correct un coup accepté", () => {
    expect(judgeAttempt(exercise, "f3g5", before, after("f3g5", 60), DEFAULT_THRESHOLDS)).toMatchObject({
      ok: true,
      answerSan: "Ng5",
      correct: true,
      verdict: "good",
      bestSan: "Ng5",
    });
  });

  it("juge par Stockfish un coup hors solution : perte faible = correct, forte = erreur", () => {
    expect(judgeAttempt(exercise, "b1c3", before, after("b1c3", 50), DEFAULT_THRESHOLDS)).toMatchObject({ ok: true, correct: true });
    const bad = judgeAttempt(exercise, "d2d3", before, after("d2d3", -300), DEFAULT_THRESHOLDS);
    expect(bad).toMatchObject({ ok: true, correct: false, verdict: "error" });
    if (bad.ok) expect(bad.loss).toBeGreaterThan(DEFAULT_THRESHOLDS.mistake);
  });

  it("valide le corps de la requête (le verdict n'en fait plus partie)", () => {
    const valid = { exerciseId: "6f1c1f53-7a0e-4f5e-9f0a-2a7c1f2b9e11", answerUci: "e7e8q" };
    expect(AttemptBodySchema.safeParse(valid).success).toBe(true);
    expect(AttemptBodySchema.safeParse({ ...valid, answerUci: "Nf3" }).success).toBe(false);
    expect(AttemptBodySchema.safeParse({ ...valid, exerciseId: "1" }).success).toBe(false);
    expect(Object.keys(AttemptBodySchema.parse({ ...valid, correct: true, loss: 0 }))).toEqual(["exerciseId", "answerUci"]);
  });
});
