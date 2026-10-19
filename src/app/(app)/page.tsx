import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, NeedAnalysis } from "@/components/stats/empty-state";
import { InsufficientData } from "@/components/stats/insufficient-data";
import { ResultBar, ResultLegend } from "@/components/stats/result-bar";
import { ResultStrip } from "@/components/stats/result-strip";
import { Figure } from "@/components/stats/section";
import { requireUser } from "@/lib/db/server";
import { accuracyTrend, mainWeakness, measureResults, MIN_GAMES, themeWeaknesses } from "@/lib/stats/aggregate";
import { formatAccuracy, formatCount, formatDelta, formatPct, formatPerGame, formatRelative } from "@/lib/stats/format";
import { THEME_LABELS, timeClassLabel } from "@/lib/stats/labels";
import { loadRecentGames, loadStatsData, type RecentGame } from "@/lib/stats/queries";
import { dueExercises } from "@/lib/training/queue";
import { loadExercises } from "@/lib/training/queries";
import { groupsForThemes } from "@/lib/training/theme-groups";
import { cn } from "@/lib/utils";

const STRIP_GAMES = 20;
const LIST_GAMES = 6;
const RESULT_WORD = { win: "Victoire", draw: "Nulle", loss: "Défaite" } as const;

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const [data, recentGames, exercises] = await Promise.all([
    loadStatsData(supabase),
    loadRecentGames(supabase, STRIP_GAMES),
    loadExercises(supabase),
  ]);
  const now = new Date();

  if (data.games.length === 0) {
    return (
      <>
        <PageHeader title="Tableau de bord" />
        <EmptyState
          title="Aucune partie importée"
          text="Récupère tes parties Chess.com pour suivre tes résultats, analyser tes erreurs avec Stockfish et t'entraîner sur tes propres positions."
          action={{ href: "/games", label: "Synchroniser mes parties" }}
        />
      </>
    );
  }

  const analyzed = data.games.filter((g) => g.analyzed);
  const results = measureResults(data.games);
  const { recent, trend } = accuracyTrend(data.games);
  const weakness = mainWeakness(data.moves, analyzed.length);
  const weaknessSample = themeWeaknesses(data.moves, analyzed.length).themes[0] ?? null;
  const due = dueExercises(exercises, now);
  const fresh = exercises.filter((e) => e.attempts === 0);
  const weaknessGroup = weakness ? groupsForThemes([weakness.theme])[0] : undefined;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={`${formatCount(data.games.length, "partie importée", "parties importées")}, dont ${formatCount(analyzed.length, "analysée", "analysées")}.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/games">Synchroniser mes parties</Link>
          </Button>
        }
      />

      <section aria-labelledby="forme" className="mb-10 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="forme" className="text-lg font-bold tracking-tight text-primary">
            Forme récente
          </h2>
          <p className="text-sm text-muted-foreground">
            1 victoire, ½ nulle, 0 défaite. La plus récente à droite.
          </p>
        </div>
        <ResultStrip games={recentGames} />
      </section>

      <section aria-label="Progression générale" className="mb-12 grid gap-8 border-y py-6 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Victoires, nulles, défaites</p>
          {results.status === "ok" ? (
            <>
              <p className="text-3xl font-semibold tracking-tight">{formatPct(results.value.score)} de score</p>
              <ResultBar results={results.value} />
              <ResultLegend results={results.value} />
            </>
          ) : (
            <InsufficientData sample={results.sample} required={results.required} unit="parties" />
          )}
        </div>
        <Figure
          label="Précision moyenne récente"
          value={recent.status === "ok" ? formatAccuracy(recent.value) : "—"}
          note={
            recent.status === "ok" ? (
              "sur les 10 dernières parties analysées"
            ) : (
              <InsufficientData sample={recent.sample} required={recent.required} />
            )
          }
        />
        <Figure
          label="Tendance de la précision"
          value={trend.status === "ok" ? formatDelta(trend.value.delta) : "—"}
          note={
            trend.status === "ok" ? (
              `par rapport aux 10 parties analysées précédentes (${formatAccuracy(trend.value.previous)})`
            ) : (
              <InsufficientData sample={trend.sample} required={trend.required} />
            )
          }
        />
      </section>

      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="dernieres">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="dernieres" className="text-lg font-bold tracking-tight text-primary">
              Dernières parties
            </h2>
            <Link href="/games" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Toutes mes parties
            </Link>
          </div>
          <ul className="divide-y border-y">
            {recentGames.slice(0, LIST_GAMES).map((g) => (
              <RecentGameRow key={g.id} game={g} now={now} />
            ))}
          </ul>
        </section>

        <div className="space-y-10">
          <section aria-labelledby="faiblesse" className="space-y-3">
            <h2 id="faiblesse" className="text-lg font-bold tracking-tight text-primary">
              Faiblesse principale
            </h2>
            {analyzed.length < MIN_GAMES ? (
              <NeedAnalysis sample={analyzed.length} required={MIN_GAMES} />
            ) : weakness ? (
              <div className="space-y-2">
                <p className="text-2xl font-semibold tracking-tight">{THEME_LABELS[weakness.theme]}</p>
                <p className="text-sm text-muted-foreground">
                  {formatPerGame(weakness.perGame)} erreur par partie en moyenne, dans {formatPct(weakness.gameShare)} de tes{" "}
                  {analyzed.length} parties analysées.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm">
                    <Link href={weaknessGroup ? `/training?axe=${weaknessGroup}` : "/training"}>Travailler ce thème</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/stats#faiblesses">Voir toutes les faiblesses</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {weaknessSample
                  ? `Aucun thème n'atteint encore 5 occurrences (le plus fréquent : ${THEME_LABELS[weaknessSample.theme]}, ${weaknessSample.occurrences}).`
                  : "Aucune erreur thématique relevée dans tes parties analysées."}
              </p>
            )}
          </section>

          <section aria-labelledby="reviser" className="space-y-3">
            <h2 id="reviser" className="text-lg font-bold tracking-tight text-primary">
              À réviser aujourd&apos;hui
            </h2>
            {exercises.length === 0 ? (
              analyzed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Les exercices sont tirés de tes erreurs : analyse d&apos;abord une partie.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Transforme tes erreurs analysées en exercices.</p>
                  <Button asChild size="sm">
                    <Link href="/training">Créer mes exercices</Link>
                  </Button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <p>
                  <span className="text-2xl font-semibold tracking-tight">{due.length}</span>{" "}
                  <span className="text-muted-foreground">{due.length > 1 ? "révisions dues" : "révision due"}</span>
                  {fresh.length > 0 ? (
                    <span className="text-muted-foreground">, {formatCount(fresh.length, "nouvel exercice", "nouveaux exercices")}</span>
                  ) : null}
                </p>
                <Button asChild size="sm">
                  <Link href="/training">{due.length > 0 ? "Réviser maintenant" : "S'entraîner"}</Link>
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function RecentGameRow({ game, now }: { game: RecentGame; now: Date }) {
  const opponent = game.playerColor === "w" ? game.black : game.white;
  const opponentRating = game.playerColor === "w" ? game.blackRating : game.whiteRating;
  return (
    <li>
      <Link href={`/games/${game.id}`} className="flex items-center gap-3 py-3 hover:bg-muted/50 sm:px-2">
        <span
          aria-hidden
          className={cn(
            "size-3 shrink-0 rounded-full border-2",
            game.playerColor === "w" ? "border-foreground/40 bg-eval-white" : "border-eval-black bg-eval-black",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            <span className="sr-only">{game.playerColor === "w" ? "Avec les Blancs" : "Avec les Noirs"} contre </span>
            {opponent}
            {opponentRating ? <span className="ml-1.5 font-normal text-muted-foreground tabular">{opponentRating}</span> : null}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {[timeClassLabel(game.timeClass), game.openingName, formatRelative(game.endTime, now)].filter(Boolean).join(", ")}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm">
          <span className="block font-semibold">{RESULT_WORD[game.result]}</span>
          <span className="block text-muted-foreground tabular">
            {game.analysisStatus === "done" && game.playerAccuracy !== null
              ? `Précision ${formatAccuracy(game.playerAccuracy)}`
              : game.analysisStatus === "running"
                ? "Analyse en cours"
                : "Non analysée"}
          </span>
        </span>
      </Link>
    </li>
  );
}
