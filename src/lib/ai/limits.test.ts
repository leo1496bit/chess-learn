import { describe, expect, it } from "vitest";
import { checkLimits, combineUsageTotals, startOfPeriod, type UsageTotals } from "./limits";

const totals = (calls: number, cost_usd: number): UsageTotals => ({
  calls,
  cost_usd,
  input_tokens: calls * 1000,
  output_tokens: calls * 500,
  cache_read_tokens: calls * 800,
  cache_write_tokens: calls * 100,
});

describe("startOfPeriod (Europe/Paris)", () => {
  it("prend minuit heure de Paris en heure d'été (UTC+2)", () => {
    const now = new Date("2026-07-15T10:00:00Z");
    expect(startOfPeriod(now, "day").toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(startOfPeriod(now, "month").toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("prend minuit heure de Paris en heure d'hiver (UTC+1)", () => {
    const now = new Date("2026-12-01T00:30:00Z"); // 1er décembre, 1 h 30 à Paris
    expect(startOfPeriod(now, "day").toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(startOfPeriod(now, "month").toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  it("gère le changement d'heure dans le mois", () => {
    // Le 28 octobre est en heure d'hiver (UTC+1) mais le 1er octobre était en heure d'été (UTC+2).
    expect(startOfPeriod(new Date("2026-10-28T12:00:00Z"), "month").toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });
});

describe("combineUsageTotals", () => {
  it("combine les totaux du jour et du mois", () => {
    const summary = combineUsageTotals(totals(2, 0.001), totals(4, 0.0060000004));
    expect(summary.callsToday).toBe(2);
    expect(summary.callsMonth).toBe(4);
    expect(summary.costToday).toBeCloseTo(0.001, 6);
    expect(summary.costMonth).toBe(0.006);
    expect(summary.inputTokensMonth).toBe(4400);
    expect(summary.outputTokensMonth).toBe(2000);
    expect(summary.cacheReadTokensMonth).toBe(3200);
  });

  it("accepte les numeric renvoyés en chaîne par PostgREST", () => {
    const month = { ...totals(1, 0), cost_usd: "0.25" as unknown as number };
    expect(combineUsageTotals(totals(0, 0), month).costMonth).toBe(0.25);
  });
});

describe("checkLimits", () => {
  const settings = { aiEnabled: true, aiDailyCallLimit: 3, aiMonthlyBudgetUsd: 1 };

  it("autorise sous les limites", () => {
    expect(checkLimits(settings, { callsToday: 2, costMonth: 0.9999 })).toEqual({ allowed: true });
  });

  it("bloque quand l'IA est désactivée", () => {
    const decision = checkLimits({ ...settings, aiEnabled: false }, { callsToday: 0, costMonth: 0 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("disabled");
  });

  it("bloque à la limite quotidienne", () => {
    const decision = checkLimits(settings, { callsToday: 3, costMonth: 0 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.message).toContain("3 appels");
  });

  it("bloque dès que le budget est exactement atteint", () => {
    const decision = checkLimits(settings, { callsToday: 0, costMonth: 1 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("budget");
  });

  it("une limite de 0 appel bloque tout", () => {
    expect(checkLimits({ ...settings, aiDailyCallLimit: 0 }, { callsToday: 0, costMonth: 0 }).allowed).toBe(false);
  });
});
