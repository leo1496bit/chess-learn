"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

const nf = new Intl.NumberFormat("fr-FR");

/** Indexe les parties par lots (POST /api/openings/backfill) tant qu'il en reste, puis rafraîchit la page. */
export function BackfillProgress({ total, remaining: initialRemaining }: { total: number; remaining: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      let left = initialRemaining;
      while (left > 0 && !cancelled) {
        try {
          const response = await fetch("/api/openings/backfill", { method: "POST" });
          const body = (await response.json().catch(() => ({}))) as { remaining?: number; error?: string };
          if (!response.ok || typeof body.remaining !== "number") {
            if (!cancelled) setError(body.error ?? `La lecture a échoué (erreur ${response.status}).`);
            return;
          }
          // Aucun progrès : on s'arrête plutôt que de boucler sans fin.
          if (body.remaining >= left) {
            if (!cancelled) setError("Certaines parties n'ont pas pu être lues.");
            return;
          }
          left = body.remaining;
          if (!cancelled) setRemaining(left);
        } catch {
          if (!cancelled) setError("Le serveur ne répond pas. Vérifie ta connexion puis réessaie.");
          return;
        }
      }
      if (!cancelled) router.refresh();
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [initialRemaining, router, attempt]);

  const done = Math.max(0, total - remaining);
  return (
    <div className="max-w-prose space-y-2 rounded-lg border bg-card p-4" role="status" aria-live="polite">
      <p className="text-sm font-medium">
        Lecture de tes parties : {nf.format(done)} / {nf.format(total)}
      </p>
      <Progress value={total > 0 ? (done / total) * 100 : 0} />
      {error ? (
        <p className="text-sm text-destructive">
          {error}{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
            Réessayer
          </button>
        </p>
      ) : null}
    </div>
  );
}
