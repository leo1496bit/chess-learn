"use server";

import { authErrorMessage, firstIssue, ForgotPasswordSchema, type AuthFormState } from "@/lib/auth/forms";
import { siteOrigin } from "@/lib/auth/origin";
import { createSupabaseServerClient } from "@/lib/db/server";

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error) return { status: "error", message: authErrorMessage(error), email };
  // Même réponse que l'adresse existe ou non : ne pas révéler les comptes inscrits.
  return { status: "sent", message: "Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe a été envoyé." };
}
