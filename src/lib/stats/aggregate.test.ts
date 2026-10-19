import { describe, expect, it } from "vitest";
import {
  accuracyTrend,
  averageAccuracy,
  errorMatrix,
  errorsBeforeAfterTraining,
  mainWeakness,
  measureResults,
  resultsByColor,
  resultsByTimeClass,
  summarizeResults,
  themeWeaknesses,
  timeline,
  topOpenings,
  trainingProgress,
  type GameResult,
  type StatsGame,
  type StatsMove,
} from "./aggregate";
import { filterGames, parseStatsFilters } from "./filters";

let seq = 0;
function game(overrides: Partial<StatsGame> = {}): StatsGame {
  seq++;
  return {
    id: `g${seq}`,
    playerColor: "w",
    result: "win",
    timeClass: "blitz",
    eco: "C50",
    openingName: "Italian Game",
    endTime: new Date(Date.UTC(2026, 0, 1 + seq)).toISOString(),
    analyzed: true,
    playerAccuracy: 80,
    ...overrides,
  };
}

function games(results: GameResult[], overrides: Partial<StatsGame> = {}): StatsGame[] {
  return results.map((result) => game({ result, ...overrides }));
}

function move(overrides: Partial<StatsMove> = {}): StatsMove {
  return { gameId: "g1", classification: "mistake", phase: "middlegame", themes: ["tactics"], missedWin: false, ...overrides };
}

describe("résultats V/N/D", () => {
  it("compte victoires, nulles et défaites et calcule les taux", () => {
    const s = summarizeResults(games(["win", "win", "draw", "loss"]));
    expect(s).toMatchObject({ wins: 2, draws: 1, losses: 1, total: 4, winRate: 50, drawRate: 25, lossRate: 25, score: 62.5 });
  });

  it("renvoie des taux nuls sans partie", () => {
    expect(summarizeResults([])).toMatchObject({ total: 0, winRate: 0, score: 0 });
  });

  it("signale des données insuffisantes sous 10 parties", () => {
    const r = measureResults(games(Array(9).fill("win")));
    expect(r).toEqual({ status: "insufficient", sample: 9, required: 10 });
    const ok = measureResults(games(Array(10).fill("win")));
    expect(ok.status).toBe("ok");
  });

  it("sépare les performances avec les Blancs et les Noirs", () => {
    const list = [...games(Array(10).fill("win"), { playerColor: "w" }), ...games(["loss", "loss"], { playerColor: "b" })];
    const byColor = resultsByColor(list);
    expect(byColor.w.status).toBe("ok");
    if (byColor.w.status === "ok") expect(byColor.w.value.winRate).toBe(100);
    expect(byColor.b).toEqual({ status: "insufficient", sample: 2, required: 10 });
  });

  it("regroupe par cadence, la plus jouée d'abord", () => {
    const list = [...games(["win", "loss"], { timeClass: "rapid" }), ...games(["win"], { timeClass: "blitz" })];
    expect(resultsByTimeClass(list).map((g) => [g.timeClass, g.results.sample])).toEqual([
      ["rapid", 2],
      ["blitz", 1],
    ]);
  });
});

describe("précision", () => {
  it("ignore les parties non analysées et exige 10 parties", () => {
    const list = [...games(Array(9).fill("win")), game({ analyzed: false, playerAccuracy: null })];
    expect(averageAccuracy(list).status).toBe("insufficient");
    const enough = [...list, game({ playerAccuracy: 90 })];
    const avg = averageAccuracy(enough);
    expect(avg.status).toBe("ok");
    if (avg.status === "ok") expect(avg.value).toBeCloseTo(81, 5);
  });

  it("compare les 10 dernières parties aux 10 précédentes", () => {
    const older = Array.from({ length: 10 }, (_, i) => game({ playerAccuracy: 70, endTime: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
    const recent = Array.from({ length: 10 }, (_, i) => game({ playerAccuracy: 80, endTime: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
    const { recent: r, trend } = accuracyTrend([...older, ...recent]);
    expect(r.status === "ok" && r.value).toBe(80);
    expect(trend.status === "ok" && trend.value).toEqual({ recent: 80, previous: 70, delta: 10 });
    expect(accuracyTrend(recent).trend).toEqual({ status: "insufficient", sample: 10, required: 20 });
  });
});

describe("évolution dans le temps", () => {
  it("regroupe par mois et comble les mois vides", () => {
    const list = [
      game({ endTime: "2026-01-15T10:00:00.000Z", result: "win", playerAccuracy: 60 }),
      game({ endTime: "2026-01-20T10:00:00.000Z", result: "loss", playerAccuracy: 80 }),
      game({ endTime: "2026-03-02T10:00:00.000Z", result: "draw", analyzed: false, playerAccuracy: null }),
    ];
    const buckets = timeline(list, "month");
    expect(buckets.map((b) => b.key)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(buckets[0].results).toMatchObject({ wins: 1, losses: 1 });
    expect(buckets[0].accuracy).toBe(70);
    expect(buckets[1].results.total).toBe(0);
    expect(buckets[2].accuracy).toBeNull();
  });

  it("commence les semaines le lundi", () => {
    // 2026-01-04 est un dimanche, 2026-01-05 un lundi.
    const buckets = timeline([game({ endTime: "2026-01-04T23:00:00.000Z" }), game({ endTime: "2026-01-05T01:00:00.000Z" })], "week");
    expect(buckets.map((b) => b.key)).toEqual(["2025-12-29", "2026-01-05"]);
  });
});

describe("ouvertures", () => {
  it("classe les ouvertures les plus jouées avec leurs résultats", () => {
    const list = [
      ...games(["win", "win", "loss", "draw", "win"], { openingName: "Sicilian Defense", eco: "B20", playerColor: "b" }),
      ...games(["loss"], { openingName: "Italian Game", eco: "C50" }),
      game({ openingName: null, eco: null }),
    ];
    const top = topOpenings(list);
    expect(top[0]).toMatchObject({ name: "Sicilian Defense", eco: "B20", games: 5, asBlack: 5, sufficient: true });
    expect(top[0].results.wins).toBe(3);
    expect(top.find((o) => o.name === "Italian Game")?.sufficient).toBe(false);
    expect(top.some((o) => o.name === "Ouverture inconnue")).toBe(true);
  });
});

describe("erreurs et faiblesses", () => {
  it("croise classification et phase, normalisé par partie", () => {
    const moves = [
      move({ classification: "blunder", phase: "opening" }),
      move({ classification: "blunder", phase: "endgame", missedWin: true }),
      move({ classification: "inaccuracy", phase: "middlegame" }),
    ];
    const m = errorMatrix(moves, 10);
    expect(m.status).toBe("ok");
    if (m.status !== "ok") return;
    expect(m.value.counts.blunder).toEqual({ opening: 1, middlegame: 0, endgame: 1 });
    expect(m.value.totals.missedWin).toBe(1);
    expect(m.value.perGame.blunder).toBeCloseTo(0.2);
    expect(errorMatrix(moves, 9).status).toBe("insufficient");
  });

  it("exige 10 parties et 5 occurrences pour qu'un thème soit retenu", () => {
    const moves = [
      ...Array.from({ length: 5 }, (_, i) => move({ gameId: `a${i % 3}`, themes: ["tactics", "hanging_piece"] })),
      ...Array.from({ length: 4 }, () => move({ themes: ["endgame"] })),
    ];
    const w = themeWeaknesses(moves, 12);
    const tactics = w.themes.find((t) => t.theme === "tactics");
    expect(tactics).toMatchObject({ occurrences: 5, gamesAffected: 3, sufficient: true });
    expect(tactics?.perGame).toBeCloseTo(5 / 12);
    expect(w.themes.find((t) => t.theme === "endgame")?.sufficient).toBe(false);
    expect(themeWeaknesses(moves, 9).themes.every((t) => !t.sufficient)).toBe(true);
    expect(mainWeakness(moves, 12)?.theme).toBe("hanging_piece");
    expect(mainWeakness(moves, 9)).toBeNull();
  });
});

describe("progrès après entraînement", () => {
  it("calcule le taux de réussite par axe avec un seuil de 5 tentatives", () => {
    const attempts = [true, true, false, true, true].map((correct, i) => ({
      exerciseId: `e${i}`,
      correct,
      createdAt: "2026-02-03T10:00:00.000Z",
      themes: ["hanging_piece"],
    }));
    const progress = trainingProgress(attempts);
    const tactics = progress.find((p) => p.group === "tactics");
    expect(tactics?.successRate).toEqual({ status: "ok", value: 80, sample: 5 });
    expect(tactics?.timeline).toEqual([{ key: "2026-02-02", attempts: 5, successRate: 80 }]);
    expect(progress.find((p) => p.group === "endgame")?.successRate.status).toBe("insufficient");
  });

  it("compare les erreurs par partie avant et après le début de l'entraînement", () => {
    const before = Array.from({ length: 10 }, (_, i) => game({ id: `b${i}`, endTime: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
    const after = Array.from({ length: 10 }, (_, i) => game({ id: `a${i}`, endTime: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
    const moves = [
      ...before.map((g) => move({ gameId: g.id, themes: ["tactics"] })),
      move({ gameId: "a0", themes: ["tactics"] }),
    ];
    const r = errorsBeforeAfterTraining(moves, [...before, ...after], "2026-02-01T00:00:00.000Z");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const tactics = r.groups.find((g) => g.group === "tactics");
    expect(tactics?.before.perGame).toBe(1);
    expect(tactics?.after.perGame).toBeCloseTo(0.1);
    expect(tactics?.change.status === "ok" && tactics.change.value).toBeCloseTo(-0.9);
    expect(r.groups.find((g) => g.group === "endgame")?.change.status).toBe("insufficient");
    expect(errorsBeforeAfterTraining(moves, before, null)).toEqual({ status: "no-training" });
  });
});

describe("filtres", () => {
  it("lit les paramètres d'URL et ignore les valeurs inconnues", () => {
    expect(parseStatsFilters({ cadence: "blitz", periode: "90d" })).toEqual({ timeClass: "blitz", period: "90d" });
    expect(parseStatsFilters({ cadence: "<script>", periode: "x" })).toEqual({ timeClass: null, period: "all" });
  });

  it("filtre par cadence et période", () => {
    const now = new Date("2026-03-01T00:00:00.000Z");
    const list = [
      game({ timeClass: "blitz", endTime: "2026-02-20T00:00:00.000Z" }),
      game({ timeClass: "rapid", endTime: "2026-02-20T00:00:00.000Z" }),
      game({ timeClass: "blitz", endTime: "2025-01-01T00:00:00.000Z" }),
    ];
    expect(filterGames(list, { timeClass: "blitz", period: "30d" }, now)).toHaveLength(1);
    expect(filterGames(list, { timeClass: null, period: "all" }, now)).toHaveLength(3);
  });
});
