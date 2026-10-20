import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/stats/empty-state";
import { GenerateExercisesButton } from "@/components/training/generate-button";
import { ThemeProgress } from "@/components/training/theme-progress";
import { TrainingSession } from "@/components/training/training-session";
import { requireUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { dueExercises, groupTrainingStats, selectNextExercises } from "@/lib/training/queue";
import { loadExercises } from "@/lib/training/queries";
import { DIFFICULTIES, DIFFICULTY_LABELS, isDifficulty, type Difficulty } from "@/lib/training/select";
import { isThemeGroup, type ThemeGroup } from "@/lib/training/theme-groups";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Entraînement" };

const SERIES_LENGTH = 10;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function hrefWith(group: ThemeGroup | null, difficulty: Difficulty | null): string {
  const params = new URLSearchParams();
  if (group) params.set("axe", group);
  if (difficulty) params.set("niveau", difficulty);
  const query = params.toString();
  return query ? `/training?${query}` : "/training";
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const axe = first(params.axe);
  const niveau = first(params.niveau);
  const group = axe && isThemeGroup(axe) ? axe : null;
  const difficulty = niveau && isDifficulty(niveau) ? niveau : null;

  const [exercises, settings, analyzedCount] = await Promise.all([
    loadExercises(supabase),
    getSettings(supabase),
    supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("analysis_status", "done")
      .then(({ count, error }) => {
        if (error) throw new Error(`Lecture des parties impossible : ${error.message}`);
        return count ?? 0;
      }),
  ]);
  const now = new Date();

  const header = (
    <PageHeader
      title="Entraînement"
      description="Des positions tirées de tes propres erreurs. Trouve le coup que tu n'as pas vu ; Stockfish juge ta réponse."
      actions={exercises.length > 0 ? <GenerateExercisesButton variant="outline" /> : undefined}
    />
  );

  if (analyzedCount === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Aucune partie analysée"
          text="Les exercices naissent de tes erreurs repérées par Stockfish. Analyse au moins une partie pour obtenir tes premières positions."
          action={{ href: "/games", label: "Analyser une partie" }}
        />
      </>
    );
  }

  if (exercises.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Pas encore d'exercice"
          text={`Tu as ${analyzedCount} partie${analyzedCount > 1 ? "s" : ""} analysée${analyzedCount > 1 ? "s" : ""}. Transforme leurs erreurs en exercices.`}
        >
          <GenerateExercisesButton />
        </EmptyState>
      </>
    );
  }

  const queue = selectNextExercises(exercises, { group, difficulty, limit: SERIES_LENGTH, now });
  const stats = groupTrainingStats(exercises, now);
  const due = dueExercises(exercises, now).length;

  return (
    <>
      {header}
      <div className="grid gap-10 xl:grid-cols-[1fr_17rem]">
        <div className="min-w-0 space-y-6">
          <nav aria-label="Niveau de difficulté" className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-sm font-medium">Niveau</span>
            <Chip active={difficulty === null} href={hrefWith(group, null)}>
              Tous
            </Chip>
            {DIFFICULTIES.map((d) => (
              <Chip key={d} active={difficulty === d} href={hrefWith(group, d)}>
                {DIFFICULTY_LABELS[d]}
              </Chip>
            ))}
          </nav>
          {/* La clé relance la série quand les filtres changent. */}
          <TrainingSession
            key={`${group ?? "all"}-${difficulty ?? "all"}`}
            exercises={queue}
            depth={settings.engineDepth}
            multipv={settings.engineMultipv}
          />
        </div>

        <aside aria-labelledby="progression" className="space-y-3">
          <div className="space-y-1">
            <h2 id="progression" className="text-lg font-bold tracking-tight text-primary">
              Progression par axe
            </h2>
            <p className="text-sm text-muted-foreground">
              {due > 0 ? `${due} révision${due > 1 ? "s" : ""} due${due > 1 ? "s" : ""} aujourd'hui. ` : "Aucune révision due aujourd'hui. "}
              Choisis un axe pour cibler la série.
            </p>
          </div>
          <ThemeProgress stats={stats} active={group} hrefFor={(g) => hrefWith(g, difficulty)} />
        </aside>
      </div>
    </>
  );
}

function Chip({ active, href, children }: { active: boolean; href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1 text-sm transition-colors",
        active ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
