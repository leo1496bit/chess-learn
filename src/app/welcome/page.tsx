import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireUser } from "@/lib/db/server";
import { hasSettings } from "@/lib/db/settings";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Bienvenue" };

/** Première connexion : choix de l'identifiant Chess.com avant d'accéder à l'application. */
export default async function WelcomePage() {
  const { user, supabase } = await requireUser();
  if (await hasSettings(supabase)) redirect("/");

  return (
    <AuthShell
      title="Quel est ton pseudo Chess.com ?"
      subtitle="Tes parties publiques seront importées depuis ce compte. Tu pourras le changer dans Paramètres."
    >
      <WelcomeForm />
      <form action={signOut} className="text-center">
        <p className="truncate text-xs text-muted-foreground" title={user.email}>
          Connecté avec {user.email}
        </p>
        <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
          Se déconnecter
        </button>
      </form>
    </AuthShell>
  );
}
