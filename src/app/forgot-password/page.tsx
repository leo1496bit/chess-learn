import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Mot de passe oublié" subtitle="Tu recevras un lien pour choisir un nouveau mot de passe.">
      <AuthForm action={requestPasswordReset} fields={["email"]} submitLabel="Recevoir le lien" pendingLabel="Envoi…" />
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Retour à la connexion
        </Link>
      </p>
    </AuthShell>
  );
}
