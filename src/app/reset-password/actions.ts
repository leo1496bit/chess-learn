"use server";

import { redirect } from "next/navigation";
import { authErrorMessage, firstIssue, ResetPasswordSchema, type AuthFormState } from "@/lib/auth/forms";
import { getAuthorizedUser } from "@/lib/db/server";

/** Nouveau mot de passe, une fois connecté par le lien de réinitialisation. */
export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const auth = await getAuthorizedUser();
  if (!auth) return { status: "error", message: "Lien expiré : redemande un lien de réinitialisation." };

  const parsed = ResetPasswordSchema.safeParse({ password: formData.get("password") ?? "", confirm: formData.get("confirm") ?? "" });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  const { error } = await auth.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };
  redirect("/");
}
