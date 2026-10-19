import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InsufficientData } from "./insufficient-data";

/** État vide qui dit quoi faire ensuite. */
export function EmptyState({
  title,
  text,
  action,
  children,
  className,
}: {
  title: string;
  text: string;
  action?: { href: string; label: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-prose space-y-3 rounded-lg border border-dashed p-6", className)}>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
      {action ? (
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
      {children}
    </div>
  );
}

/** Pas assez de parties analysées : on l'indique et on renvoie vers l'analyse. */
export function NeedAnalysis({ sample, required }: { sample: number; required: number }) {
  return (
    <div className="space-y-3">
      <InsufficientData sample={sample} required={required} />
      <Button asChild variant="outline">
        <Link href="/games">Analyser une partie</Link>
      </Button>
    </div>
  );
}
