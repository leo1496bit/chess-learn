"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { analyzePositionCached, isAbortError } from "@/lib/engine";
import { startBuildGuard, stepBuildGuard, type BuildNeed } from "@/lib/repertoire/line-view";

type BuildResponse = {
  status: "building" | "ready";
  needs: BuildNeed[];
  progress: { branches: number; pending: number };
  explorerUnavailable: boolean;
  depth: number;
  multipv: number;
  /** Après un 429 de l'explorateur Lichess : attendre avant l'étape suivante. */
  retryAfterMs?: number;
};

type RunState =
  | { kind: "running"; remaining: number; analysed: number; branches: number }
  | { kind: "waiting"; analysed: number; branches: number }
  | { kind: "ready"; branches: number }
  | { kind: "stalled" }
  | { kind: "error"; message: string };

const STALLED_MESSAGE = "La construction n'avance plus. Réessaie dans quelques minutes.";
const RATE_LIMITED_MESSAGE = "Lichess limite les requêtes : reprise dans 1 min.";

/** Attente interruptible (quitter la page annule la boucle). */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

function remainingLabel(n: number): string {
  if (n === 0) return "Construction de la ligne : lecture des réponses adverses…";
  return `Construction de la ligne : ${n} analyse${n > 1 ? "s" : ""} restante${n > 1 ? "s" : ""}`;
}

/**
 * Boucle de construction : POST build → analyse Stockfish (navigateur) de chaque position demandée,
 * enregistrée dans `position_analyses` → nouvel appel, jusqu'à « ready ». Quitter la page interrompt
 * la boucle ; la rouvrir la reprend là où le serveur en est.
 */
export function BuildRunner({
  lineId,
  initialExplorerUnavailable,
  onReady,
}: {
  lineId: string;
  initialExplorerUnavailable: boolean;
  onReady: () => void;
}) {
  const [state, setState] = useState<RunState>({ kind: "running", remaining: 0, analysed: 0, branches: 0 });
  const [explorerUnavailable, setExplorerUnavailable] = useState(initialExplorerUnavailable);
  const [attempt, setAttempt] = useState(0);
  // Dernier rappel reçu, sans relancer la boucle quand le parent se rend à nouveau.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function run() {
      let guard = startBuildGuard();
      let analysed = 0;
      setState({ kind: "running", remaining: 0, analysed: 0, branches: 0 });
      while (!signal.aborted) {
        const response = await fetch(`/api/openings/lines/${lineId}/build`, { method: "POST", signal });
        const body = (await response.json().catch(() => null)) as (Partial<BuildResponse> & { error?: string }) | null;
        if (!response.ok || !body || !body.status || !Array.isArray(body.needs) || typeof body.depth !== "number") {
          setState({ kind: "error", message: body?.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.` });
          return;
        }
        if (body.explorerUnavailable) setExplorerUnavailable(true);
        const branches = body.progress?.branches ?? 0;
        if (body.status === "ready") {
          setState({ kind: "ready", branches });
          onReadyRef.current();
          return;
        }
        const retryAfterMs = typeof body.retryAfterMs === "number" ? body.retryAfterMs : 0;
        const resumeAt = Date.now() + retryAfterMs;
        // Une étape freinée par Lichess (429) sans analyse demandée ne compte pas comme une étape vide.
        if (retryAfterMs === 0 || body.needs.length > 0) {
          const step = stepBuildGuard(guard, body.needs);
          guard = step.guard;
          if (step.stalled) {
            setState({ kind: "stalled" });
            return;
          }
        }
        // Un seul worker Stockfish : analyses l'une après l'autre.
        for (let i = 0; i < body.needs.length; i++) {
          setState({ kind: "running", remaining: body.needs.length - i, analysed, branches });
          const need = body.needs[i];
          await analyzePositionCached(need.fen, { depth: body.depth, multipv: need.multipv, awaitStore: true, signal });
          analysed += 1;
        }
        if (retryAfterMs > 0) {
          setState({ kind: "waiting", analysed, branches });
          await wait(resumeAt - Date.now(), signal);
        }
        setState({ kind: "running", remaining: 0, analysed, branches });
      }
    }

    run().catch((error: unknown) => {
      if (signal.aborted || isAbortError(error)) return;
      console.error("[openings/build] Construction interrompue", error);
      setState({
        kind: "error",
        message:
          error instanceof TypeError
            ? "Le serveur ne répond pas. Vérifie ta connexion puis réessaie."
            : "L'analyse d'une position a échoué. Réessaie dans un instant.",
      });
    });
    return () => controller.abort();
  }, [lineId, attempt]);

  const resume = (
    <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
      Reprendre
    </Button>
  );

  return (
    <section aria-label="Construction de la ligne" className="max-w-prose space-y-3 rounded-lg border bg-card p-4">
      <div role="status" aria-live="polite" className="space-y-2">
        {state.kind === "running" ? (
          <>
            <p className="text-sm font-medium">{remainingLabel(state.remaining)}</p>
            <Progress
              aria-label="Avancement de la construction"
              value={state.analysed + state.remaining > 0 ? (state.analysed / (state.analysed + state.remaining)) * 100 : 0}
            />
            <p className="text-sm text-muted-foreground">
              Stockfish analyse les positions dans ton navigateur. Garde la page ouverte ; si tu la fermes, la
              construction reprendra à ton retour.
            </p>
          </>
        ) : null}
        {state.kind === "waiting" ? <p className="text-sm font-medium">{RATE_LIMITED_MESSAGE}</p> : null}
        {state.kind === "ready" ? (
          <p className="text-sm font-medium">
            Ligne prête : {state.branches} branche{state.branches > 1 ? "s" : ""}.
          </p>
        ) : null}
      </div>
      {state.kind === "stalled" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-destructive">{STALLED_MESSAGE}</p>
          {resume}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-destructive">{state.message}</p>
          {resume}
        </div>
      ) : null}
      {explorerUnavailable ? (
        <p className="text-sm text-muted-foreground">Explorateur Lichess indisponible : la ligne s&apos;appuie sur tes parties.</p>
      ) : null}
    </section>
  );
}
