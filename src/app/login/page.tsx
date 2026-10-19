import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-3xl" aria-hidden>
            ♞
          </p>
          <h1 className="text-xl font-semibold">chess-learn</h1>
          <p className="text-sm text-muted-foreground">Connexion par lien envoyé par e-mail.</p>
        </div>
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Le lien est invalide ou a expiré. Demandez-en un nouveau.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
