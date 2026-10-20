export type CreateLineBody =
  | { source: "suggestion"; epd: string }
  | { source: "manual"; uci: string[]; playerColor: "w" | "b" };

export type CreateLineResult = { ok: true; id: string } | { ok: false; error: string };

/** POST /api/openings/lines ; renvoie l'identifiant de la ligne ou un message d'erreur affichable. */
export async function createLine(body: CreateLineBody): Promise<CreateLineResult> {
  try {
    const response = await fetch("/api/openings/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok || !json.id) {
      return { ok: false, error: json.error ?? `La création a échoué (erreur ${response.status}). Réessaie dans un instant.` };
    }
    return { ok: true, id: json.id };
  } catch {
    return { ok: false, error: "Le serveur ne répond pas. Vérifie ta connexion puis réessaie." };
  }
}
