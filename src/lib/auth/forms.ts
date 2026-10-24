// Validation des formulaires d'authentification et messages d'erreur (module pur, partagé client/serveur).
import { z } from "zod";

export const PASSWORD_MIN = 8;
/** Au-delà, bcrypt (Supabase Auth) ignore la fin du mot de passe. */
export const PASSWORD_MAX = 72;

const email = z.email({ error: "Adresse e-mail invalide." });
const password = z
  .string()
  .min(PASSWORD_MIN, { error: `Mot de passe : au moins ${PASSWORD_MIN} caractères.` })
  .max(PASSWORD_MAX, { error: `Mot de passe : au plus ${PASSWORD_MAX} caractères.` });

const confirmed = <T extends { password: string; confirm: string }>(value: T, ctx: z.RefinementCtx) => {
  if (value.password !== value.confirm) {
    ctx.addIssue({ code: "custom", path: ["confirm"], message: "Les deux mots de passe ne correspondent pas." });
  }
};

/** Connexion : on ne valide pas la longueur (un ancien mot de passe plus court reste accepté par Supabase). */
export const LoginSchema = z.object({ email, password: z.string().min(1, { error: "Saisis ton mot de passe." }) });
export const SignupSchema = z.object({ email, password, confirm: z.string() }).superRefine(confirmed);
export const ForgotPasswordSchema = z.object({ email });
export const ResetPasswordSchema = z.object({ password, confirm: z.string() }).superRefine(confirmed);

/** `email` : adresse saisie, réaffichée après une erreur (React réinitialise le formulaire après l'action). */
export type AuthFormState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

/** Premier message d'erreur de validation. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Formulaire invalide.";
}

/** Erreur Supabase Auth → message en français (codes : https://supabase.com/docs/guides/auth/debugging/error-codes). */
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Adresse pas encore confirmée : ouvre le lien reçu par e-mail à l'inscription.";
    case "user_already_exists":
    case "email_exists":
      return "Un compte existe déjà avec cette adresse. Connecte-toi ou réinitialise ton mot de passe.";
    case "weak_password":
      return "Mot de passe trop faible : choisis-en un plus long ou moins courant.";
    case "same_password":
      return "Le nouveau mot de passe doit être différent de l'ancien.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Trop de tentatives : réessaie dans quelques minutes.";
    case "signup_disabled":
      return "Les inscriptions sont fermées pour le moment.";
    default:
      return `Opération impossible : ${error.message}`;
  }
}

/** Chemin de retour après /auth/callback : uniquement un chemin interne (pas de redirection ouverte). */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
