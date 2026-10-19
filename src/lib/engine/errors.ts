export type EngineErrorCode = "unsupported" | "load" | "crash" | "timeout" | "aborted" | "no-result";

const MESSAGES: Record<EngineErrorCode, string> = {
  unsupported: "Ce navigateur ne prend pas en charge WebAssembly ou les Web Workers : ouvrez l'application dans un navigateur récent (Chrome, Firefox, Edge, Safari).",
  load: "Le moteur Stockfish n'a pas pu se charger. Vérifiez votre connexion puis rechargez la page.",
  crash: "Le moteur Stockfish s'est arrêté brutalement. Relancez l'analyse : le travail déjà fait est conservé en cache.",
  timeout: "Le moteur Stockfish ne répond plus. Relancez l'analyse ou baissez la profondeur dans Paramètres.",
  aborted: "Analyse annulée.",
  "no-result": "Le moteur Stockfish n'a renvoyé aucune ligne pour cette position.",
};

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    detail?: string,
  ) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = "EngineError";
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof EngineError && error.code === "aborted") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
