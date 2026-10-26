"use server";

import { redirect } from "next/navigation";
import { authErrorMessage, firstIssue, SignupSchema, type AuthFormState } from "@/lib/auth/forms";
import { siteOrigin } from "@/lib/auth/origin";
import { createSupabaseServerClient } from "@/lib/db/server";

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), email };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) return { status: "error", message: authErrorMessage(error), email };
  // Confirmation d'e-mail désactivée dans Supabase : la session est ouverte tout de suite.
  if (data.session) redirect("/");
  // Adresse déjà inscrite : Supabase répond comme pour une inscription (pas de fuite), sans envoyer d'e-mail.
  return {
    status: "sent",
    message: "Compte créé : ouvre le lien de confirmation reçu par e-mail pour l'activer, puis connecte-toi.",
  };
}
