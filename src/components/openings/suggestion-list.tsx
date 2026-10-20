"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SUGGESTION_MIN_GAMES } from "@/lib/repertoire/constants";
import { formatLineStats } from "@/lib/repertoire/library";
import type { Suggestion } from "@/lib/repertoire/suggestions";
import { createLine } from "./create-line";

export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [pendingEpd, setPendingEpd] = useState<string | null>(null);
  const [error, setError] = useState<{ epd: string; message: string } | null>(null);

  async function add(epd: string) {
    setPendingEpd(epd);
    setError(null);
    const result = await createLine({ source: "suggestion", epd });
    if (result.ok) {
      router.push(`/openings/${result.id}`);
      return; // on garde l'état « en cours » pendant la navigation
    }
    setError({ epd, message: result.error });
    setPendingEpd(null);
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {suggestions.map((s) => (
        <li key={`${s.epd}-${s.playerColor}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold leading-snug">
              {s.name} <span className="text-sm font-normal text-muted-foreground">{s.eco}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {s.playerColor === "w" ? "Avec les Blancs" : "Avec les Noirs"} · {formatLineStats(s, SUGGESTION_MIN_GAMES)}
            </p>
            {error?.epd === s.epd ? (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => add(s.epd)} disabled={pendingEpd !== null} className="shrink-0 self-start sm:self-center">
            {pendingEpd === s.epd ? "Ajout…" : "Ajouter"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
