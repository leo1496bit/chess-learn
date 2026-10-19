"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SyncResult } from "@/lib/chesscom/sync";

// Chaque appel s'arrête avant la limite de durée du serveur ; on enchaîne les appels tant que
// des archives restent à traiter.
const MAX_ROUNDS = 12;

class SyncRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function requestSync(body: { full?: boolean; resumeFrom?: string }): Promise<SyncResult> {
  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SyncRequestError("Le serveur est injoignable. Vérifie ta connexion puis réessaie.", 0);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `La synchronisation a échoué (HTTP ${response.status}). Réessaie dans un instant.`;
    throw new SyncRequestError(message, response.status);
  }
  return data as SyncResult;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function SyncButton({ hasGames }: { hasGames: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function sync(full: boolean) {
    if (running) return;
    setRunning(true);
    setProgress(0);
    const toastId = toast.loading(full ? "Revérification de toutes les archives…" : "Synchronisation avec Chess.com…");

    let imported = 0;
    let archivesChecked = 0;
    const errors: SyncResult["errors"] = [];
    let complete = false;
    let resumeFrom: string | undefined;

    try {
      for (let round = 0; round < MAX_ROUNDS && !complete; round++) {
        const result = await requestSync({ full, resumeFrom });
        imported += result.imported;
        archivesChecked += result.archivesChecked;
        errors.push(...result.errors);
        complete = result.complete;
        setProgress(imported);
        router.refresh();
        // Arrêt sur limite de requêtes ou erreur réseau : pas de nouvel essai immédiat.
        if (!result.resumeFrom || result.stoppedBy !== "time") break;
        resumeFrom = result.resumeFrom;
        toast.loading(`Import en cours : ${plural(imported, "partie importée", "parties importées")}…`, { id: toastId });
      }

      const summary =
        imported > 0
          ? `${plural(imported, "nouvelle partie importée", "nouvelles parties importées")}.`
          : "Aucune nouvelle partie : tout est à jour.";

      if (errors.length > 0) {
        toast.warning(summary, {
          id: toastId,
          description:
            errors.length === 1 ? errors[0].message : `${errors[0].message} (+${errors.length - 1} autre${errors.length > 2 ? "s" : ""} avertissement${errors.length > 2 ? "s" : ""})`,
          duration: 10_000,
        });
      } else if (!complete) {
        toast.info(summary, {
          id: toastId,
          description: "Des archives restent à importer. Relance la synchronisation pour continuer.",
          duration: 10_000,
        });
      } else {
        toast.success(summary, {
          id: toastId,
          description: `${plural(archivesChecked, "archive vérifiée", "archives vérifiées")}.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "La synchronisation a échoué.";
      const status = error instanceof SyncRequestError ? error.status : 0;
      toast.error(imported > 0 ? `${plural(imported, "partie importée", "parties importées")}, puis échec.` : "Synchronisation impossible", {
        id: toastId,
        description: message,
        duration: 12_000,
        action:
          status === 404
            ? { label: "Ouvrir les paramètres", onClick: () => router.push("/settings") }
            : status === 401
              ? { label: "Se reconnecter", onClick: () => router.push("/login") }
              : { label: "Réessayer", onClick: () => void sync(full) },
      });
      if (imported > 0) router.refresh();
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex items-center">
      <Button
        size="lg"
        onClick={() => void sync(false)}
        disabled={running}
        aria-busy={running}
        className="rounded-r-none px-3.5"
      >
        <RefreshCw className={running ? "animate-spin" : undefined} aria-hidden />
        {running
          ? progress
            ? `Import : ${progress} parties`
            : "Synchronisation…"
          : hasGames
            ? "Synchroniser mes parties"
            : "Importer mes parties"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-lg"
            disabled={running}
            className="rounded-l-none border-l border-primary-foreground/20"
            aria-label="Autres options de synchronisation"
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => void sync(true)} className="flex-col items-start gap-0.5">
            <span>Revérifier toutes les archives</span>
            <span className="text-xs text-muted-foreground">
              Retélécharge chaque mois et réimporte les parties manquantes. Plus long.
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
