"use server";

import { redirect } from "next/navigation";
import { authErrorMessage, firstIssue, LoginSchema, type AuthFormState } from "@/lib/auth/forms";
import { createSupabaseServerClient } from "@/lib/db/server";

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") ?? "" });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error) return { status: "error", message: authErrorMessage(error), email };
  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
