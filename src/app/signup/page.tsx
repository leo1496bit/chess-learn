import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { PASSWORD_MIN } from "@/lib/auth/forms";
import { signUp } from "./actions";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignupPage() {
  return (
    <AuthShell title="Créer un compte" subtitle="Un e-mail de confirmation t'est envoyé pour activer le compte.">
      <AuthForm
        action={signUp}
        fields={["email", "new-password", "confirm"]}
        submitLabel="Créer mon compte"
        pendingLabel="Création…"
        hint={`Au moins ${PASSWORD_MIN} caractères.`}
      />
      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
