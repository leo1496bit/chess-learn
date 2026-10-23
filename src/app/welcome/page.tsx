import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/db/server";
import { hasSettings } from "@/lib/db/settings";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Bienvenue" };

/** Première connexion : choix de l'identifiant Chess.com avant d'accéder à l'application. */
export default async function WelcomePage() {
  const { user, supabase } = await requireUser();
  if (await hasSettings(supabase)) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-3xl" aria-hidden>
            ♞
          </p>
          <h1 className="text-xl font-semibold">Quel est ton pseudo Chess.com ?</h1>
          <p className="text-sm text-muted-foreground">
            Tes parties publiques seront importées depuis ce compte. Tu pourras le changer dans Paramètres.
          </p>
        </div>
        <WelcomeForm />
        <form action={signOut} className="text-center">
          <p className="truncate text-xs text-muted-foreground" title={user.email}>
            Connecté avec {user.email}
          </p>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
