"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { analyzePositionCached, isAbortError } from "@/lib/engine";
import { startBuildGuard, stepBuildGuard, type BuildNeed } from "@/lib/repertoire/line-view";

type BuildResponse = {
  status: "building" | "ready";
  needs: BuildNeed[];
  /** `analysed` : positions déjà analysées utilisées par l'arbre (cumulé côté serveur). */
  progress: { branches: number; pending: number; analysed?: number };
  explorerUnavailable: boolean;
  depth: number;
  multipv: number;
  /** Après un 429 de l'explorateur Lichess : attendre avant l'étape suivante. */
  retryAfterMs?: number;
};

type RunState =
  | { kind: "running"; remaining: number; step: number; analysed: number; branches: number; bar: number }
  | { kind: "waiting"; analysed: number; branches: number }
  | { kind: "ready"; branches: number }
  | { kind: "stalled" }
  | { kind: "error"; message: string };

const STALLED_MESSAGE = "La construction n'avance plus. Réessaie dans quelques minutes.";
/** Taille typique d'une ligne : sert d'estimation au départ, le total réel n'étant connu qu'à la fin. */
const TYPICAL_POSITIONS = 150;

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

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** Ce que fait la construction en ce moment ; les compteurs affichés au-dessus sont cumulés. */
function currentLabel(remaining: number, step: number): string {
  if (remaining === 0) return "Lecture des réponses adverses (tes parties et l'explorateur Lichess)…";
  return `Stockfish analyse la position ${step - remaining + 1} sur ${step} de cette étape.`;
}

function elapsedLabel(startedAt: number, now: number): string {
  const minutes = Math.floor((now - startedAt) / 60_000);
  return minutes < 1 ? "commencée il y a moins d'une minute" : `commencée il y a ${plural(minutes, "minute")}`;
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
  const [state, setState] = useState<RunState>({ kind: "running", remaining: 0, step: 0, analysed: 0, branches: 0, bar: 0 });
  // Durée affichée : rafraîchie toutes les 15 s pour montrer que la construction vit.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
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
      // Avancement estimé (total inconnu) : jamais en recul, jamais plein avant la fin.
      let bar = 0;
      const estimate = (remaining: number) => {
        bar = Math.max(bar, Math.min(95, (analysed / Math.max(TYPICAL_POSITIONS, analysed + remaining)) * 100));
        return bar;
      };
      setState({ kind: "running", remaining: 0, step: 0, analysed: 0, branches: 0, bar: 0 });
      while (!signal.aborted) {
        const response = await fetch(`/api/openings/lines/${lineId}/build`, { method: "POST", signal });
        const body = (await response.json().catch(() => null)) as (Partial<BuildResponse> & { error?: string }) | null;
        if (!response.ok || !body || !body.status || !Array.isArray(body.needs) || typeof body.depth !== "number") {
          setState({ kind: "error", message: body?.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.` });
          return;
        }
        if (body.explorerUnavailable) setExplorerUnavailable(true);
        const branches = body.progress?.branches ?? 0;
        // Total cumulé du serveur (persiste entre les étapes et les visites) ; l'affichage ne recule jamais.
        analysed = Math.max(analysed, body.progress?.analysed ?? 0);
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
          setState({
            kind: "running",
            remaining: body.needs.length - i,
            step: body.needs.length,
            analysed,
            branches,
            bar: estimate(body.needs.length - i),
          });
          const need = body.needs[i];
          await analyzePositionCached(need.fen, { depth: body.depth, multipv: need.multipv, awaitStore: true, signal });
          analysed += 1;
        }
        if (retryAfterMs > 0) {
          setState({ kind: "waiting", analysed, branches });
          await wait(resumeAt - Date.now(), signal);
        }
        setState({ kind: "running", remaining: 0, step: 0, analysed, branches, bar: estimate(0) });
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
      {state.kind === "running" ? (
        <div className="space-y-2">
          {/* Seul le total est annoncé aux lecteurs d'écran : la ligne « position i sur n » changerait chaque seconde. */}
          <p role="status" aria-live="polite" className="text-sm font-medium">
            Construction de la ligne : {plural(state.analysed, "position analysée", "positions analysées")}
            {state.branches > 0 ? `, ${plural(state.branches, "branche terminée", "branches terminées")}` : ""}
          </p>
          <Progress aria-label="Avancement estimé de la construction" value={state.bar} />
          <p className="text-sm">{currentLabel(state.remaining, state.step)}</p>
          <p className="text-sm text-muted-foreground">
            Une ligne demande souvent une centaine de positions ou plus, soit plusieurs minutes ({elapsedLabel(startedAt, now)}).
            Garde la page ouverte ; si tu la fermes, la construction reprendra là où elle en est.
          </p>
        </div>
      ) : null}
      <div role="status" aria-live="polite" className="space-y-2">
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
