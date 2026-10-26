import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { PASSWORD_MIN } from "@/lib/auth/forms";
import { requireUser } from "@/lib/db/server";
import { updatePassword } from "./actions";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/** Atteinte par le lien de réinitialisation (/auth/callback ouvre la session) ou depuis l'application. */
export default async function ResetPasswordPage() {
  const { user } = await requireUser();
  return (
    <AuthShell title="Nouveau mot de passe" subtitle={user.email}>
      <AuthForm
        action={updatePassword}
        fields={["new-password", "confirm"]}
        submitLabel="Enregistrer le mot de passe"
        pendingLabel="Enregistrement…"
        hint={`Au moins ${PASSWORD_MIN} caractères.`}
      />
      <p className="text-center text-sm">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          Annuler
        </Link>
      </p>
    </AuthShell>
  );
}
