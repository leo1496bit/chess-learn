"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Crée ou met à jour les exercices à partir des coups analysés (POST /api/training/generate). */
export function GenerateExercisesButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    try {
      const response = await fetch("/api/training/generate", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { generated?: number; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? `La génération a échoué (erreur ${response.status}). Réessaie dans un instant.`);
        return;
      }
      toast.success(
        body.generated
          ? `${body.generated} exercice${body.generated > 1 ? "s" : ""} à jour.`
          : "Aucune erreur analysée ne donne d'exercice pour l'instant.",
      );
      router.refresh();
    } catch {
      toast.error("Le serveur ne répond pas. Vérifie ta connexion puis réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant={variant} onClick={generate} disabled={pending}>
      {pending ? "Création des exercices…" : "Mettre à jour mes exercices"}
    </Button>
  );
}
