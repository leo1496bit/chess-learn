import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EmptyState, NeedAnalysis } from "@/components/stats/empty-state";
import { ErrorMatrixTable } from "@/components/stats/error-matrix";
import { InsufficientData } from "@/components/stats/insufficient-data";
import { ResultBar, ResultLegend } from "@/components/stats/result-bar";
import { Figure, StatsSection } from "@/components/stats/section";
import { StatsFiltersBar } from "@/components/stats/stats-filters";
import { ThemeBars } from "@/components/stats/theme-bars";
import { TrendChart, type TrendPoint } from "@/components/stats/trend-chart";
import { requireUser } from "@/lib/db/server";
import {
  accuracyTrend,
  errorMatrix,
  errorsBeforeAfterTraining,
  measureResults,
  MIN_GAMES,
  MIN_GROUP_GAMES,
  resultsByColor,
  resultsByTimeClass,
  themeWeaknesses,
  timeline,
  topOpenings,
  trainingProgress,
  type Granularity,
  type Measured,
  type ResultSummary,
  type StatsGame,
} from "@/lib/stats/aggregate";
import { filterGames, parseStatsFilters, periodSince } from "@/lib/stats/filters";
import {
  formatAccuracy,
  formatCount,
  formatDate,
  formatDelta,
  formatPct,
  formatPerGame,
  formatPeriod,
  formatShortPeriod,
} from "@/lib/stats/format";
import { COLOR_LABELS, timeClassLabel } from "@/lib/stats/labels";
import { loadStatsData, movesForGames } from "@/lib/stats/queries";
import { themeGroupLabel } from "@/lib/training/theme-groups";

export const metadata: Metadata = { title: "Statistiques" };

const WEEKLY_SPAN_DAYS = 120;

function pickGranularity(games: readonly StatsGame[]): Granularity {
  if (games.length < 2) return "week";
  const times = games.map((g) => new Date(g.endTime).getTime());
  return (Math.max(...times) - Math.min(...times)) / 86_400_000 <= WEEKLY_SPAN_DAYS ? "week" : "month";
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const filters = parseStatsFilters(await searchParams);
  const data = await loadStatsData(supabase);
  const now = new Date();

  const timeClasses = [...new Set(data.games.map((g) => g.timeClass).filter((t): t is string => t !== null))].sort();
  const games = filterGames(data.games, filters, now);
  const analyzed = games.filter((g) => g.analyzed);
  const moves = movesForGames(data.moves, games);
  const since = periodSince(filters.period, now);
  const attempts = since ? data.attempts.filter((a) => a.createdAt >= since) : data.attempts;

  if (data.games.length === 0) {
    return (
      <>
        <PageHeader title="Statistiques" />
        <EmptyState
          title="Aucune partie importée"
          text="Les statistiques se calculent à partir de tes vraies parties Chess.com. Synchronise-les pour commencer."
          action={{ href: "/games", label: "Synchroniser mes parties" }}
        />
      </>
    );
  }

  const overall = measureResults(games);
  const byColor = resultsByColor(games);
  const byTimeClass = resultsByTimeClass(games);
  const { recent, trend } = accuracyTrend(games);
  const granularity = pickGranularity(games);
  const buckets = timeline(games, granularity);
  const openings = topOpenings(games, 10);
  const matrix = errorMatrix(moves, analyzed.length);
  const weaknesses = themeWeaknesses(moves, analyzed.length);
  const progress = trainingProgress(attempts);
  const firstAttempt = data.attempts[0]?.createdAt ?? null;
  const beforeAfter = errorsBeforeAfterTraining(moves, games, firstAttempt);

  const scorePoints: TrendPoint[] = buckets.map((b) => ({
    key: b.key,
    label: formatPeriod(b.start, granularity),
    shortLabel: formatShortPeriod(b.start, granularity),
    value: b.results.total > 0 ? b.results.score : null,
    detail: formatCount(b.results.total, "partie", "parties"),
  }));
  const accuracyPoints: TrendPoint[] = buckets.map((b) => ({
    key: b.key,
    label: formatPeriod(b.start, granularity),
    shortLabel: formatShortPeriod(b.start, granularity),
    value: b.accuracy,
    detail: formatCount(b.analyzedCount, "partie analysée", "parties analysées"),
  }));

  return (
    <>
      <PageHeader
        title="Statistiques"
        description={
          <>
            Calculées sur {formatCount(games.length, "partie importée", "parties importées")}, dont{" "}
            {formatCount(analyzed.length, "analysée", "analysées")} par Stockfish.
          </>
        }
      />
      <StatsFiltersBar filters={filters} timeClasses={timeClasses} />

      {games.length === 0 ? (
        <EmptyState
          title="Aucune partie pour ces filtres"
          text="Élargis la période ou choisis une autre cadence."
          action={{ href: "/stats", label: "Retirer les filtres" }}
        />
      ) : (
        <div className="space-y-12">
          <StatsSection
            id="resultats"
            title="Résultats"
            description="Score en points : une victoire vaut 1, une nulle ½. Les taux s'affichent à partir de 10 parties."
          >
            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-4">
                <MeasuredResults label="Toutes les parties" results={overall} large />
                {(["w", "b"] as const).map((c) => (
                  <MeasuredResults key={c} label={`Avec les ${COLOR_LABELS[c]}`} results={byColor[c]} />
                ))}
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">Par cadence</h3>
                <ul className="space-y-3">
                  {byTimeClass.map(({ timeClass, results }) => (
                    <li key={timeClass ?? "inconnue"}>
                      <MeasuredResults label={timeClassLabel(timeClass)} results={results} compact />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </StatsSection>

          <StatsSection
            id="evolution"
            title="Évolution"
            description={`Par ${granularity === "week" ? "semaine" : "mois"}. La précision ne compte que les parties analysées.`}
          >
            <div className="mb-8 grid gap-6 sm:grid-cols-2">
              <Figure
                label="Précision moyenne, 10 dernières parties analysées"
                value={recent.status === "ok" ? formatAccuracy(recent.value) : "—"}
                note={
                  recent.status === "ok" ? undefined : <InsufficientData sample={recent.sample} required={recent.required} />
                }
              />
              <Figure
                label="Tendance par rapport aux 10 précédentes"
                value={trend.status === "ok" ? formatDelta(trend.value.delta) : "—"}
                note={
                  trend.status === "ok" ? (
                    `${formatAccuracy(trend.value.previous)} avant, ${formatAccuracy(trend.value.recent)} maintenant`
                  ) : (
                    <InsufficientData sample={trend.sample} required={trend.required} />
                  )
                }
              />
            </div>
            <div className="grid gap-10 lg:grid-cols-2">
              <TrendChart id="score-chart" title="Score (%)" kind="column" points={scorePoints} format={formatPct} />
              <TrendChart
                id="accuracy-chart"
                title="Précision moyenne"
                kind="line"
                points={accuracyPoints}
                format={formatAccuracy}
                emptyLabel="Aucune partie analysée sur la période"
              />
            </div>
            {games.length < MIN_GAMES ? (
              <InsufficientData className="mt-4" sample={games.length} required={MIN_GAMES} unit="parties" />
            ) : null}
          </StatsSection>

          <StatsSection
            id="ouvertures"
            title="Ouvertures les plus jouées"
            description={`Le score par ouverture s'affiche à partir de ${MIN_GROUP_GAMES} parties.`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">Ouvertures les plus jouées et résultats associés</caption>
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">Ouverture</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Parties</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Blancs / Noirs</th>
                    <th scope="col" className="w-1/4 px-3 py-2 text-left font-medium">Résultats</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {openings.map((o) => (
                    <tr key={o.key} className="border-b last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <span className="font-semibold">{o.name}</span>
                        {o.eco && o.eco !== o.name ? <span className="ml-2 text-muted-foreground">{o.eco}</span> : null}
                      </th>
                      <td className="px-3 py-2 text-right">{o.games}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {o.asWhite} / {o.asBlack}
                      </td>
                      <td className="px-3 py-2">
                        <ResultBar results={o.results} thin />
                      </td>
                      <td className="py-2 pl-3 text-right font-semibold">
                        {o.sufficient ? formatPct(o.results.score) : <span className="font-normal text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ResultLegend className="mt-3" />
          </StatsSection>

          <StatsSection
            id="erreurs"
            title="Erreurs les plus fréquentes"
            description="Tes coups classés par Stockfish selon la perte de pourcentage de gain, répartis par phase de jeu."
          >
            {matrix.status === "ok" ? (
              <ErrorMatrixTable matrix={matrix.value} analyzedGames={analyzed.length} />
            ) : (
              <NeedAnalysis sample={matrix.sample} required={matrix.required} />
            )}
          </StatsSection>

          <StatsSection
            id="faiblesses"
            title="Faiblesses récurrentes"
            description="Thèmes détectés sur tes imprécisions, erreurs, gaffes et gains manqués, rapportés au nombre de parties analysées. Un thème compte à partir de 5 occurrences."
          >
            {!weaknesses.enoughGames ? (
              <NeedAnalysis sample={weaknesses.analyzedGames} required={MIN_GAMES} />
            ) : weaknesses.themes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune erreur thématique relevée sur ces parties.</p>
            ) : (
              <ThemeBars themes={weaknesses.themes} />
            )}
          </StatsSection>

          <StatsSection
            id="progres"
            title="Progrès après entraînement"
            description="Taux de réussite aux exercices par axe, et erreurs par partie avant et après ton premier exercice."
          >
            {data.attempts.length === 0 ? (
              <EmptyState
                title="Pas encore d'exercice résolu"
                text="Les exercices viennent de tes propres erreurs. Résous-en quelques-uns pour suivre tes progrès ici."
                action={{ href: "/training", label: "Commencer l'entraînement" }}
              />
            ) : (
              <div className="grid gap-10 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Réussite aux exercices</h3>
                  <ul className="divide-y">
                    {progress.map((p) => (
                      <li key={p.group} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                        <span className="font-semibold">{themeGroupLabel(p.group)}</span>
                        <span className="text-right tabular text-muted-foreground">
                          {p.successRate.status === "ok" ? (
                            <>
                              <span className="font-semibold text-foreground">{formatPct(p.successRate.value)}</span> sur{" "}
                              {formatCount(p.attempts, "tentative", "tentatives")}
                            </>
                          ) : (
                            `${p.attempts} sur ${p.successRate.required} tentatives requises`
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    Erreurs par partie, avant et après le {firstAttempt ? formatDate(firstAttempt) : ""}
                  </h3>
                  {beforeAfter.status === "ok" ? (
                    <table className="w-full text-sm">
                      <caption className="sr-only">Erreurs par partie analysée avant et après le début de l&apos;entraînement</caption>
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th scope="col" className="py-2 pr-3 text-left font-medium">Axe</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Avant</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Après</th>
                          <th scope="col" className="py-2 pl-3 text-right font-medium">Écart</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {beforeAfter.groups.map((g) => (
                          <tr key={g.group} className="border-b last:border-0">
                            <th scope="row" className="py-2 pr-3 text-left font-semibold">{themeGroupLabel(g.group)}</th>
                            <td className="px-3 py-2 text-right">{formatPerGame(g.before.perGame)}</td>
                            <td className="px-3 py-2 text-right">{formatPerGame(g.after.perGame)}</td>
                            <td className="py-2 pl-3 text-right">
                              {g.change.status === "ok" ? (
                                <span className="font-semibold">
                                  {formatDelta(g.change.value, 2)}
                                  <span className="sr-only">{g.change.value < 0 ? " (moins d'erreurs)" : " (plus d'erreurs)"}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">insuffisant</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  <p className="mt-3 text-sm text-muted-foreground">
                    Un écart négatif signifie moins d&apos;erreurs. Il faut au moins {MIN_GAMES} parties analysées de chaque
                    côté pour comparer.
                  </p>
                </div>
              </div>
            )}
          </StatsSection>
        </div>
      )}
    </>
  );
}

function MeasuredResults({
  label,
  results,
  large = false,
  compact = false,
}: {
  label: string;
  results: Measured<ResultSummary>;
  large?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={large ? "font-semibold" : "text-sm font-semibold"}>{label}</span>
        <span className="text-sm text-muted-foreground tabular">
          {results.status === "ok" ? (
            <>
              <span className={large ? "text-2xl font-semibold text-foreground" : "font-semibold text-foreground"}>
                {formatPct(results.value.score)}
              </span>{" "}
              sur {formatCount(results.sample, "partie", "parties")}
            </>
          ) : (
            formatCount(results.sample, "partie", "parties")
          )}
        </span>
      </div>
      {results.status === "ok" ? (
        <>
          <ResultBar results={results.value} thin={compact} />
          {compact ? null : <ResultLegend results={results.value} />}
        </>
      ) : (
        <InsufficientData sample={results.sample} required={results.required} unit="parties" />
      )}
    </div>
  );
}
