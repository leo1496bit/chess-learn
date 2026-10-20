"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { moveNumberLabel } from "@/lib/analysis/labels";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LABELS, type ApiErrorBody } from "@/lib/ai/schema";
import { TRAINING_CATEGORY_LABELS, type GameReport, type GameReportResponse } from "@/lib/ai/report/schema";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "generating"; previous: GameReportResponse | null }
  | { kind: "ready"; data: GameReportResponse }
  | { kind: "error"; message: string; code?: ApiErrorBody["code"]; previous: GameReportResponse | null };

// Bilans déjà chargés, par partie : revenir sur l'onglet ne relance pas de requête.
const reportCache = new Map<string, GameReportResponse>();

/** Bilan de partie : diagnostic tactique, stratégique et théorique + plan de travail. */
export function GameReportPanel({
  gameId,
  analyzed,
  sanByPly,
  onSelectPly,
}: {
  gameId: string;
  /** La partie a une analyse Stockfish enregistrée. */
  analyzed: boolean;
  sanByPly: ReadonlyMap<number, string>;
  onSelectPly: (ply: number) => void;
}) {
  const [state, setState] = useState<State>(() => {
    const hit = reportCache.get(gameId);
    return hit ? { kind: "ready", data: hit } : { kind: "loading" };
  });

  useEffect(() => {
    if (reportCache.has(gameId) || !analyzed) return;
    let active = true;
    fetch(`/api/game-report?gameId=${encodeURIComponent(gameId)}`)
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) return setState({ kind: "empty" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as GameReportResponse;
        reportCache.set(gameId, data);
        setState({ kind: "ready", data });
      })
      .catch(() => active && setState({ kind: "empty" }));
    return () => {
      active = false;
    };
  }, [gameId, analyzed]);

  const previous = state.kind === "ready" ? state.data : state.kind === "generating" || state.kind === "error" ? state.previous : null;

  async function generate(force: boolean) {
    setState({ kind: "generating", previous });
    try {
      const response = await fetch("/api/game-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, force }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = (body ?? {}) as Partial<ApiErrorBody>;
        setState({
          kind: "error",
          message: error.error ?? `Le serveur a répondu ${response.status}. Réessaie dans un instant.`,
          code: error.code,
          previous,
        });
        return;
      }
      const data = body as GameReportResponse;
      reportCache.set(gameId, data);
      setState({ kind: "ready", data });
    } catch {
      setState({ kind: "error", message: "Connexion au serveur impossible. Vérifie ta connexion puis réessaie.", previous });
    }
  }

  if (!analyzed) {
    return (
      <p className="text-sm text-muted-foreground">
        Le bilan s&apos;appuie sur l&apos;analyse Stockfish : lance d&apos;abord l&apos;analyse de la partie.
      </p>
    );
  }

  const plyButton = (ply: number) => (
    <button
      key={ply}
      type="button"
      onClick={() => onSelectPly(ply)}
      className="tabular rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground hover:bg-accent"
      title="Voir ce coup sur l'échiquier"
    >
      {moveNumberLabel(ply)} {sanByPly.get(ply) ?? ""}
    </button>
  );

  return (
    <section aria-label="Bilan de la partie" aria-busy={state.kind === "generating"} className="space-y-5">
      {state.kind === "loading" ? <Skeleton className="h-24 w-full" /> : null}

      {state.kind === "empty" ? (
        <div className="space-y-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            Claude rédige un bilan à partir des calculs de Stockfish et du livre d&apos;ouvertures : erreurs tactiques et
            stratégiques, maîtrise de la théorie, occasions manquées et axes de travail. Coût estimé : moins d&apos;un
            centime.
          </p>
          <Button onClick={() => generate(false)}>Générer le bilan</Button>
        </div>
      ) : null}

      {state.kind === "generating" ? (
        <div role="status" className="space-y-3">
          <p className="text-sm text-muted-foreground">Claude rédige le bilan à partir des calculs de Stockfish…</p>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{state.message}</p>
          {state.code === "limit_reached" || state.code === "ai_disabled" ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/settings">Ouvrir les paramètres</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => generate(false)}>
              Réessayer
            </Button>
          )}
        </div>
      ) : null}

      {state.kind === "ready" || (state.kind === "error" && state.previous) ? (
        <ReportBody
          data={state.kind === "ready" ? state.data : (state.previous as GameReportResponse)}
          plyButton={plyButton}
          onRegenerate={() => generate(true)}
        />
      ) : null}
    </section>
  );
}

function Block({ title, tone, children }: { title: string; tone?: "tactical" | "strategic" | "missed"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "space-y-2 border-l-2 pl-4",
        tone === "tactical" ? "border-cls-blunder/50" : tone === "missed" ? "border-cls-missed/50" : "border-primary/25",
      )}
    >
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {children}
    </div>
  );
}

function ReportBody({
  data,
  plyButton,
  onRegenerate,
}: {
  data: GameReportResponse;
  plyButton: (ply: number) => ReactNode;
  onRegenerate: () => void;
}) {
  const report: GameReport = data.report;
  const generatedOn = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap gap-x-3">
          <span>Bilan du {generatedOn}</span>
          <span>{CONFIDENCE_LABELS[report.confidence]}</span>
        </span>
        <Button variant="ghost" size="sm" onClick={onRegenerate}>
          <RefreshCw data-icon="inline-start" />
          Régénérer
        </Button>
      </div>

      {data.stale ? (
        <p role="note" className="rounded-lg border border-cls-inaccuracy/40 bg-cls-inaccuracy/10 p-3 text-sm">
          La partie a été réanalysée depuis ce bilan : régénère-le pour qu&apos;il corresponde à l&apos;analyse actuelle.
        </p>
      ) : null}
      {!data.verified ? (
        <p role="note" className="rounded-lg border border-cls-inaccuracy/40 bg-cls-inaccuracy/10 p-3 text-sm">
          <span className="font-semibold">Bilan non vérifié.</span> Il cite au moins un coup absent des calculs de Stockfish :
          fie-toi aux variantes du moteur pour ce passage.
        </p>
      ) : null}

      <p className="max-w-prose text-[1.0625rem] leading-relaxed">{report.summary}</p>

      <Block title={`Ouverture : ${report.opening.name}`}>
        <p className="max-w-prose leading-relaxed">{report.opening.assessment}</p>
        {report.opening.theoryGap ? (
          <p className="max-w-prose leading-relaxed">
            <span className="font-semibold text-cls-inaccuracy">Lacune théorique. </span>
            {report.opening.theoryGap}
          </p>
        ) : null}
        <p className="max-w-prose leading-relaxed text-muted-foreground">{report.opening.studyAdvice}</p>
      </Block>

      {report.tacticalErrors.length > 0 ? (
        <Block title="Erreurs tactiques" tone="tactical">
          <ul className="space-y-3">
            {report.tacticalErrors.map((e, i) => (
              <li key={i} className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {plyButton(e.ply)}
                  {e.title}
                </p>
                <p className="max-w-prose leading-relaxed text-foreground/90">{e.explanation}</p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {report.strategicErrors.length > 0 ? (
        <Block title="Erreurs stratégiques" tone="strategic">
          <ul className="space-y-3">
            {report.strategicErrors.map((e, i) => (
              <li key={i} className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {e.ply !== null ? plyButton(e.ply) : null}
                  {e.title}
                </p>
                <p className="max-w-prose leading-relaxed text-foreground/90">{e.explanation}</p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {report.missedOpportunities.length > 0 ? (
        <Block title="Occasions manquées" tone="missed">
          <ul className="space-y-3">
            {report.missedOpportunities.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                {plyButton(e.ply)}
                <span className="max-w-prose leading-relaxed">{e.explanation}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {report.endgame ? (
        <Block title="Finale">
          <p className="max-w-prose leading-relaxed">{report.endgame}</p>
        </Block>
      ) : null}

      {report.strengths.length > 0 ? (
        <Block title="Ce que tu as bien fait">
          <ul className="list-disc space-y-1 pl-4">
            {report.strengths.map((s, i) => (
              <li key={i} className="max-w-prose leading-relaxed">
                {s}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {report.trainingPlan.length > 0 ? (
        <div className="space-y-3 rounded-lg bg-secondary/60 p-4">
          <h3 className="font-semibold text-primary">À travailler</h3>
          <ol className="space-y-4">
            {report.trainingPlan.map((item, i) => (
              <li key={i} className="space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-background px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {TRAINING_CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="font-semibold">{item.title}</span>
                </p>
                <p className="max-w-prose leading-relaxed text-foreground/90">{item.why}</p>
                {item.plies.length > 0 ? <p className="flex flex-wrap gap-1.5">{item.plies.map((ply) => plyButton(ply))}</p> : null}
              </li>
            ))}
          </ol>
          <Button asChild size="sm" variant="outline">
            <Link href="/training">S&apos;entraîner sur mes erreurs</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
