import { describe, expect, it } from "vitest";
import { authErrorMessage, firstIssue, LoginSchema, ResetPasswordSchema, safeNextPath, SignupSchema } from "./forms";

describe("SignupSchema", () => {
  it("accepte un e-mail et deux mots de passe identiques", () => {
    expect(SignupSchema.safeParse({ email: "ami@example.com", password: "cavalier8", confirm: "cavalier8" }).success).toBe(true);
  });

  it("refuse un mot de passe trop court ou mal confirmé", () => {
    const short = SignupSchema.safeParse({ email: "ami@example.com", password: "court", confirm: "court" });
    expect(short.success || firstIssue(short.error)).toBe("Mot de passe : au moins 8 caractères.");

    const mismatch = ResetPasswordSchema.safeParse({ password: "cavalier8", confirm: "cavalier9" });
    expect(mismatch.success || firstIssue(mismatch.error)).toBe("Les deux mots de passe ne correspondent pas.");
  });

  it("refuse un e-mail invalide", () => {
    const parsed = SignupSchema.safeParse({ email: "pas-un-mail", password: "cavalier8", confirm: "cavalier8" });
    expect(parsed.success || firstIssue(parsed.error)).toBe("Adresse e-mail invalide.");
  });
});

describe("LoginSchema", () => {
  it("n'impose pas de longueur minimale à la connexion", () => {
    expect(LoginSchema.safeParse({ email: "ami@example.com", password: "abc" }).success).toBe(true);
    expect(LoginSchema.safeParse({ email: "ami@example.com", password: "" }).success).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("traduit les codes Supabase connus", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("E-mail ou mot de passe incorrect.");
    expect(authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" })).toMatch(/pas encore confirmée/);
  });

  it("garde le message d'origine pour un code inconnu", () => {
    expect(authErrorMessage({ message: "boom" })).toBe("Opération impossible : boom");
  });
});

describe("safeNextPath", () => {
  it("n'accepte que des chemins internes", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });
});
