import type { ReactNode } from "react";

/** Mise en page des écrans d'authentification : carte centrée sous le logo. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-3xl" aria-hidden>
            ♞
          </p>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

/** Message d'état d'un formulaire (erreur ou confirmation d'envoi). */
export function FormMessage({ status, message }: { status: "idle" | "sent" | "error"; message?: string }) {
  if (!message) return null;
  return status === "error" ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  );
}
