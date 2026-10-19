import { describe, expect, it } from "vitest";
import { SettingsFormSchema } from "./settings-schema";

const valid = {
  chesscomUsername: "Leny_l",
  engineDepth: "16",
  engineMultipv: "3",
  excellent: "2",
  good: "5",
  inaccuracy: "5",
  mistake: "10",
  blunder: "20",
  aiEnabled: true,
  aiDailyCallLimit: "50",
  aiMonthlyBudgetUsd: "1,50",
};

const errorsOf = (input: Record<string, unknown>) => {
  const result = SettingsFormSchema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
};

describe("SettingsFormSchema", () => {
  it("accepte les valeurs par défaut et la virgule décimale", () => {
    const result = SettingsFormSchema.parse(valid);
    expect(result.engineDepth).toBe(16);
    expect(result.aiMonthlyBudgetUsd).toBe(1.5);
  });

  it("borne la profondeur et le MultiPV", () => {
    expect(errorsOf({ ...valid, engineDepth: "31" }).engineDepth).toContain("maximum 30");
    expect(errorsOf({ ...valid, engineDepth: "7" }).engineDepth).toContain("minimum 8");
    expect(errorsOf({ ...valid, engineMultipv: "2.5" }).engineMultipv).toContain("entier");
  });

  it("refuse un champ vide au lieu de le lire comme 0", () => {
    expect(errorsOf({ ...valid, aiDailyCallLimit: "" }).aiDailyCallLimit).toContain("saisis un nombre");
  });

  it("exige des seuils croissants", () => {
    expect(errorsOf({ ...valid, mistake: "4" }).mistake).toContain("« erreur »");
    expect(errorsOf({ ...valid, blunder: "10" }).blunder).toContain("« gaffe »");
  });

  it("valide l'identifiant Chess.com", () => {
    expect(errorsOf({ ...valid, chesscomUsername: "a b" }).chesscomUsername).toBeDefined();
  });
});
