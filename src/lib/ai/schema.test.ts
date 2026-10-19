import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExplanationSchema } from "./schema";
import { VALID_EXPLANATION } from "./test-fixtures";

describe("ExplanationSchema", () => {
  it("accepte une explication complète", () => {
    expect(ExplanationSchema.parse(VALID_EXPLANATION)).toEqual(VALID_EXPLANATION);
  });

  it("refuse un type d'erreur ou une confiance inconnus", () => {
    expect(ExplanationSchema.safeParse({ ...VALID_EXPLANATION, errorType: "positional" }).success).toBe(false);
    expect(ExplanationSchema.safeParse({ ...VALID_EXPLANATION, confidence: "certain" }).success).toBe(false);
  });

  it("refuse une rubrique manquante", () => {
    const { lesson: _lesson, ...rest } = VALID_EXPLANATION;
    void _lesson;
    expect(ExplanationSchema.safeParse(rest).success).toBe(false);
  });

  it("se convertit en format de sortie structurée pour l'API", () => {
    const format = zodOutputFormat(ExplanationSchema);
    expect(format.type).toBe("json_schema");
    expect(format.schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(format.parse(JSON.stringify(VALID_EXPLANATION))).toEqual(VALID_EXPLANATION);
    expect(() => format.parse("{\"played\":")).toThrow();
  });
});
