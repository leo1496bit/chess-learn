import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloc de page : titre, phrase d'explication, contenu. Séparé du précédent par un filet. */
export function StatsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("border-t pt-6", className)}>
      <div className="mb-5 space-y-1">
        <h2 id={id} className="text-lg font-bold tracking-tight text-primary">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Chiffre clé avec son libellé ; la note précise l'échantillon ou la comparaison. */
export function Figure({ label, value, note, className }: { label: string; value: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {note ? <div className="text-sm text-muted-foreground">{note}</div> : null}
    </div>
  );
}
