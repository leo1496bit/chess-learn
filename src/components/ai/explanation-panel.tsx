"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassificationBadge, MissedWinBadge } from "@/components/chess/classification-badge";
import { cn } from "@/lib/utils";
import type { MoveAnalysis } from "@/lib/analysis/types";
import { isFlaggedMove } from "@/lib/ai/eligibility";
import { buildMoveLinks, type MoveLink } from "@/lib/ai/move-links";
import { normalizeSan, segmentSan } from "@/lib/ai/verify";
import {
  CONFIDENCE_LABELS,
  ERROR_TYPE_LABELS,
  type ApiErrorBody,
  type CachedExplanation,
  type Explanation,
  type ExplanationResponse,
} from "@/lib/ai/schema";

type Loaded = { explanation: Explanation; verified: boolean; cached: boolean };
type State =
  | { kind: "loading-cache" }
  | { kind: "idle" }
  | { kind: "generating"; previous: Loaded | null }
  | { kind: "ready"; data: Loaded }
  | { kind: "error"; message: string; code?: ApiErrorBody["code"]; previous: Loaded | null };

// Cache client des explications déjà générées, partagé entre les panneaux d'une même partie.
const gameCache = new Map<string, Promise<Map<number, CachedExplanation>>>();

function loadGameCache(gameId: string): Promise<Map<number, CachedExplanation>> {
  let pending = gameCache.get(gameId);
  if (!pending) {
    pending = fetch(`/api/explanations?gameId=${encodeURIComponent(gameId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { explanations: CachedExplanation[] };
        return new Map(body.explanations.map((item) => [item.ply, item]));
      })
      .catch(() => {
        gameCache.delete(gameId); // nouvel essai au prochain affichage
        return new Map<number, CachedExplanation>();
      });
    gameCache.set(gameId, pending);
  }
  return pending;
}

async function rememberExplanation(gameId: string, ply: number, data: ExplanationResponse) {
  const map = await loadGameCache(gameId);
  map.set(ply, { ply, explanation: data.explanation, verified: data.verified, createdAt: new Date().toISOString() });
}

type Outcome =
  | { ok: true; data: Loaded }
  | { ok: false; message: string; code?: ApiErrorBody["code"] };

// Requêtes de génération en cours, par « gameId:ply » : quitter le coup puis y revenir ne relance
// pas un appel payant, le panneau se rebranche sur la requête existante.
const inFlight = new Map<string, Promise<Outcome>>();

function requestExplanation(gameId: string, ply: number): Promise<Outcome> {
  const key = `${gameId}:${ply}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = (async (): Promise<Outcome> => {
    try {
      const response = await fetch("/api/explanations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, ply }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = (body ?? {}) as Partial<ApiErrorBody>;
        return {
          ok: false,
          message: error.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.`,
          code: error.code,
        };
      }
      const data = body as ExplanationResponse;
      await rememberExplanation(gameId, ply, data);
      return { ok: true, data: { explanation: data.explanation, verified: data.verified, cached: data.cached } };
    } catch {
      return { ok: false, message: "Connexion au serveur impossible. Vérifie ta connexion puis réessaie." };
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, pending);
  return pending;
}

/** Oublie les explications en cache côté client d'une partie (après une nouvelle analyse). */
export function invalidateExplanationCache(gameId: string): void {
  gameCache.delete(gameId);
  for (const key of inFlight.keys()) {
    if (key.startsWith(`${gameId}:`)) inFlight.delete(key);
  }
}

type SectionKey = keyof Pick<Explanation, "played" | "problem" | "opponentIdea" | "bestMove" | "lesson">;

/** Intitulés selon le cadrage (écart ou bon coup) et l'auteur du coup. */
function sectionsFor(flagged: boolean, byPlayer: boolean): { key: SectionKey; title: string }[] {
  return [
    { key: "played", title: byPlayer ? "Ce que j'ai joué" : "Ce que l'adversaire a joué" },
    { key: "problem", title: flagged ? "Pourquoi c'est problématique" : "Pourquoi c'est un bon coup" },
    {
      key: "opponentIdea",
      title: flagged
        ? byPlayer
          ? "Ce que l'adversaire pouvait faire"
          : "Comment j'aurais pu en profiter"
        : "Ce que le coup menace ou empêche",
    },
    { key: "bestMove", title: flagged ? "Le meilleur coup" : "Les autres candidats" },
    { key: "lesson", title: "La leçon à retenir" },
  ];
}

/** Clé d'un aperçu de coup (position + coup), pour marquer le coup affiché. */
export const moveLinkKey = (link: Pick<MoveLink, "fen" | "uci">) => `${link.fen}|${link.uci}`;

export function ExplanationPanel({
  gameId,
  move,
  onPreviewMove,
  previewKey,
}: {
  gameId: string;
  move: MoveAnalysis;
  /** Affiche un coup cité sur l'échiquier (position avant le coup + flèche). */
  onPreviewMove?: (link: MoveLink) => void;
  /** Coup actuellement affiché en aperçu (voir moveLinkKey). */
  previewKey?: string | null;
}) {
  const key = `${gameId}:${move.ply}`;
  // L'état est rattaché au coup affiché : changer de coup repart de « chargement du cache ».
  const [entry, setEntry] = useState<{ key: string; state: State } | null>(null);
  // Sans état propre au coup : une génération lancée plus tôt et toujours en cours s'affiche comme telle.
  const state: State =
    entry?.key === key ? entry.state : inFlight.has(key) ? { kind: "generating", previous: null } : { kind: "loading-cache" };
  const currentKey = useRef(key);

  useEffect(() => {
    currentKey.current = key;
    let active = true;
    const running = inFlight.get(key);
    if (running) {
      // Une génération lancée plus tôt pour ce coup est toujours en cours : on attend son résultat.
      running.then((outcome) => {
        if (!active) return;
        setEntry({
          key,
          state: outcome.ok
            ? { kind: "ready", data: outcome.data }
            : { kind: "error", message: outcome.message, code: outcome.code, previous: null },
        });
      });
      return () => {
        active = false;
      };
    }
    loadGameCache(gameId).then((map) => {
      if (!active) return;
      const hit = map.get(move.ply);
      setEntry({
        key,
        state: hit ? { kind: "ready", data: { explanation: hit.explanation, verified: hit.verified, cached: true } } : { kind: "idle" },
      });
    });
    return () => {
      active = false;
    };
  }, [key, gameId, move.ply]);

  const previous = state.kind === "ready" ? state.data : state.kind === "error" || state.kind === "generating" ? state.previous : null;

  async function explain() {
    const requestKey = key;
    // Ignore la réponse si l'utilisateur est passé à un autre coup entre-temps.
    const setState = (next: State) => {
      if (currentKey.current === requestKey) setEntry({ key: requestKey, state: next });
    };
    setState({ kind: "generating", previous });
    const outcome = await requestExplanation(gameId, move.ply);
    setState(
      outcome.ok
        ? { kind: "ready", data: outcome.data }
        : { kind: "error", message: outcome.message, code: outcome.code, previous },
    );
  }

  return (
    <section aria-labelledby={`explanation-${move.ply}`} aria-busy={state.kind === "generating"} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`explanation-${move.ply}`} className="flex items-center gap-2 font-semibold text-primary">
          <span className="tabular">
            {Math.ceil(move.ply / 2)}
            {move.color === "w" ? "." : "…"} {move.san}
          </span>
          <ClassificationBadge classification={move.classification} withLabel />
          {move.missedWin ? <MissedWinBadge withLabel /> : null}
        </h2>
        {state.kind === "idle" ? (
          <Button onClick={explain}>Expliquer ce coup</Button>
        ) : state.kind === "ready" && !state.data.verified ? (
          <Button variant="outline" onClick={explain}>
            Générer une nouvelle explication
          </Button>
        ) : null}
      </header>

      {state.kind === "loading-cache" ? <Skeleton className="h-8 w-40" /> : null}

      {state.kind === "generating" ? (
        <div role="status" className="space-y-3">
          <p className="text-sm text-muted-foreground">Claude rédige l&apos;explication à partir des calculs de Stockfish…</p>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{state.message}</p>
          <div className="flex flex-wrap gap-2">
            {state.code === "limit_reached" || state.code === "ai_disabled" ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings">Ouvrir les paramètres</Link>
              </Button>
            ) : state.code !== "not_found" ? (
              <Button size="sm" variant="outline" onClick={explain}>
                Réessayer
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.kind === "ready" ? <ExplanationBody data={state.data} move={move} onPreviewMove={onPreviewMove} previewKey={previewKey} /> : null}
      {state.kind === "error" && state.previous ? (
        <ExplanationBody data={state.previous} move={move} onPreviewMove={onPreviewMove} previewKey={previewKey} />
      ) : null}
    </section>
  );
}

/** Texte d'une rubrique : les coups cités qui figurent dans les variantes deviennent des boutons. */
function LinkedText({
  text,
  links,
  onPreviewMove,
  previewKey,
}: {
  text: string;
  links: Map<string, MoveLink>;
  onPreviewMove?: (link: MoveLink) => void;
  previewKey?: string | null;
}): ReactNode {
  if (!onPreviewMove) return text;
  return segmentSan(text).map((segment, i) => {
    const link = segment.san ? links.get(normalizeSan(segment.san)) : undefined;
    if (!link) return segment.text;
    const active = previewKey === moveLinkKey(link);
    return (
      <button
        key={i}
        type="button"
        onClick={() => onPreviewMove(link)}
        aria-pressed={active}
        title="Voir ce coup sur l'échiquier"
        className={cn(
          "tabular rounded px-0.5 font-semibold text-primary underline decoration-dotted decoration-primary/50 underline-offset-4 hover:bg-accent",
          active && "bg-primary text-primary-foreground no-underline hover:bg-primary",
        )}
      >
        {segment.text}
      </button>
    );
  });
}

function ExplanationBody({
  data,
  move,
  onPreviewMove,
  previewKey,
}: {
  data: Loaded;
  move: MoveAnalysis;
  onPreviewMove?: (link: MoveLink) => void;
  previewKey?: string | null;
}) {
  const { explanation, verified, cached } = data;
  const links = useMemo(() => buildMoveLinks(move), [move]);
  const flagged = isFlaggedMove(move);
  const bestSan = flagged ? move.bestSan : null;
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{ERROR_TYPE_LABELS[explanation.errorType]}</span>
        <span className={cn("text-muted-foreground", explanation.confidence === "low" && "text-cls-inaccuracy")}>
          {CONFIDENCE_LABELS[explanation.confidence]}
        </span>
        {cached ? <span className="text-muted-foreground">Explication enregistrée, sans nouveau coût</span> : null}
      </p>

      {!verified ? (
        <p role="note" className="rounded-lg border border-cls-inaccuracy/40 bg-cls-inaccuracy/10 p-3 text-sm">
          <span className="font-semibold">Explication non vérifiée.</span> Elle cite au moins un coup absent des calculs de
          Stockfish : fie-toi aux variantes du moteur plutôt qu&apos;au texte pour ce passage.
        </p>
      ) : null}

      <dl className="divide-y border-l-2 border-primary/20">
        {sectionsFor(flagged, move.isPlayerMove).map(({ key, title }) => (
          <div key={key} className="space-y-1 py-3 pl-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-semibold text-primary">
              {title}
              {key === "bestMove" && bestSan ? <span className="tabular ml-2 text-cls-best">{bestSan}</span> : null}
            </dt>
            <dd className={cn("max-w-prose leading-relaxed", key === "lesson" && "font-medium")}><LinkedText text={explanation[key]} links={links} onPreviewMove={onPreviewMove} previewKey={previewKey} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
