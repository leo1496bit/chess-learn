"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import { serverEnv } from "@/lib/env";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const LoginSchema = z.object({ email: z.email() });

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", message: "Adresse e-mail invalide." };

  const email = parsed.data.email.toLowerCase();
  // Même réponse que pour un envoi réussi : ne pas révéler l'adresse autorisée.
  if (email !== serverEnv.allowedEmail.toLowerCase()) {
    return { status: "sent", message: "Si cette adresse est autorisée, un lien de connexion a été envoyé." };
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    return { status: "error", message: `Envoi impossible : ${error.message}` };
  }
  return { status: "sent", message: "Si cette adresse est autorisée, un lien de connexion a été envoyé." };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
