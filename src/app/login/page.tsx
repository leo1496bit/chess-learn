import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <AuthShell title="chess-learn" subtitle="Connecte-toi pour analyser tes parties.">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Le lien est invalide ou a expiré. Connecte-toi, ou redemande un lien depuis « Mot de passe oublié ».
        </p>
      ) : null}
      <AuthForm action={signIn} fields={["email", "password"]} submitLabel="Se connecter" pendingLabel="Connexion…" />
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          Mot de passe oublié ?
        </Link>
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </div>
    </AuthShell>
  );
}
