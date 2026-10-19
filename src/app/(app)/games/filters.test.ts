import { describe, expect, it } from "vitest";
import { dayAfter, filtersToSearch, hasActiveFilters, likePattern, parseGameFilters } from "./filters";

describe("parseGameFilters", () => {
  it("lit les filtres valides", () => {
    expect(
      parseGameFilters({ from: "2026-09-01", to: "2026-09-30", color: "b", result: "loss", tc: "blitz", q: " Sicilian ", page: "3" }),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30", color: "b", result: "loss", tc: "blitz", q: "Sicilian", page: 3 });
  });

  it("ignore les valeurs invalides", () => {
    const filters = parseGameFilters({ from: "hier", color: "rouge", tc: "", page: "-2", result: ["win", "loss"] });
    expect(filters).toEqual({ page: 1, result: "win" } as typeof filters);
    expect(hasActiveFilters(parseGameFilters({ page: "2" }))).toBe(false);
  });
});

describe("helpers", () => {
  it("construit la query string sans valeurs vides", () => {
    expect(filtersToSearch(parseGameFilters({ color: "w", q: "Caro" }), { page: 2 })).toBe("?color=w&q=Caro&page=2");
    expect(filtersToSearch(parseGameFilters({}))).toBe("");
  });

  it("échappe les jokers ILIKE", () => {
    expect(likePattern("100%_ok")).toBe("%100\\%\\_ok%");
  });

  it("calcule la borne de fin exclusive", () => {
    expect(dayAfter("2026-10-31")).toBe("2026-11-01T00:00:00.000Z");
  });
});
