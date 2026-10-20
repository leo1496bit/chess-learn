import { describe, expect, it } from "vitest";
import { formatLineStats, kindLabel, sortLines, type LibraryLine } from "./library";

const line = (o: Partial<LibraryLine>): LibraryLine => ({
  id: "a", name: "X", eco: null, playerColor: "w", kind: "master", status: "ready",
  games: 10, wins: 5, draws: 2, losses: 3, dueCount: 0, ...o,
});

describe("sortLines", () => {
  it("met les lignes à revoir d'abord, puis par nombre de parties décroissant", () => {
    const sorted = sortLines([
      line({ id: "a", games: 100 }),
      line({ id: "b", games: 20, dueCount: 2 }),
      line({ id: "c", games: 60 }),
      line({ id: "d", games: 80, dueCount: 1 }),
    ]);
    expect(sorted.map((l) => l.id)).toEqual(["d", "b", "a", "c"]);
  });
  it("ne modifie pas le tableau d'origine", () => {
    const input = [line({ id: "a", games: 1 }), line({ id: "b", games: 2 })];
    sortLines(input);
    expect(input[0].id).toBe("a");
  });
});

describe("formatLineStats", () => {
  it("affiche parties, victoires et défaites", () => {
    expect(formatLineStats({ games: 54, wins: 16, losses: 35 }, 5)).toBe("54 parties · 16 V / 35 D");
  });
  it("accorde le singulier", () => {
    expect(formatLineStats({ games: 1, wins: 1, losses: 0 }, 1)).toBe("1 partie · 1 V / 0 D");
  });
  it("signale les données insuffisantes sous le seuil", () => {
    expect(formatLineStats({ games: 3, wins: 1, losses: 2 }, 5)).toBe("3 parties · données insuffisantes");
  });
});

describe("kindLabel", () => {
  it("nomme la catégorie, ou l'état en construction", () => {
    expect(kindLabel("punish", "ready")).toBe("À punir");
    expect(kindLabel("master", "ready")).toBe("À maîtriser");
    expect(kindLabel(null, "building")).toBe("En construction");
    expect(kindLabel("master", "building")).toBe("En construction");
  });
});
