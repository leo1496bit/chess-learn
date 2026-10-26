import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Compte de connexion : adresse e-mail et changement de mot de passe. */
export function AccountSection({ email }: { email: string }) {
  return (
    <section aria-labelledby="account-title" className="grid gap-4 border-t py-8 md:grid-cols-[16rem_1fr] md:gap-10">
      <div className="space-y-1">
        <h2 id="account-title" className="font-semibold text-primary">
          Compte
        </h2>
        <p className="text-sm text-muted-foreground">Adresse et mot de passe utilisés pour te connecter.</p>
      </div>
      <div className="min-w-0 space-y-3">
        <p className="truncate text-sm">{email}</p>
        <Button asChild variant="outline">
          <Link href="/reset-password">Changer mon mot de passe</Link>
        </Button>
      </div>
    </section>
  );
}
