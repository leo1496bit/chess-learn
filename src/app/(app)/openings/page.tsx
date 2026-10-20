import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AddLineDialog } from "@/components/openings/add-line-dialog";
import { BackfillProgress } from "@/components/openings/backfill-progress";
import { LineList } from "@/components/openings/line-list";
import { SuggestionList } from "@/components/openings/suggestion-list";
import { EmptyState } from "@/components/stats/empty-state";
import { requireUser } from "@/lib/db/server";
import { loadOpenings } from "./queries";

export const metadata: Metadata = { title: "Ouvertures" };

export default async function OpeningsPage() {
  const { supabase } = await requireUser();
  const { lines, suggestions, totalGames, remaining } = await loadOpenings(supabase, new Date());

  return (
    <>
      <PageHeader
        title="Ouvertures"
        description="Les lignes que tu rencontres le plus, à punir ou à maîtriser, avec leurs branches à revoir."
        actions={<AddLineDialog />}
      />
      <div className="space-y-10">
        {remaining > 0 ? <BackfillProgress total={totalGames} remaining={remaining} /> : null}

        {lines.length === 0 && suggestions.length === 0 ? (
          <EmptyState
            title="Aucune ligne pour l'instant"
            text="Importe et synchronise tes parties pour voir les lignes que tu rencontres."
            action={{ href: "/games", label: "Voir mes parties" }}
          />
        ) : null}

        {lines.length > 0 ? (
          <section aria-labelledby="mes-lignes" className="space-y-3">
            <h2 id="mes-lignes" className="text-lg font-bold tracking-tight text-primary">
              Mes lignes
            </h2>
            <LineList lines={lines} />
          </section>
        ) : null}

        {suggestions.length > 0 ? (
          <section aria-labelledby="suggestions" className="space-y-3">
            <div className="space-y-1">
              <h2 id="suggestions" className="text-lg font-bold tracking-tight text-primary">
                Suggestions
              </h2>
              <p className="max-w-prose text-sm text-muted-foreground">
                Des positions qui reviennent souvent dans tes parties et que tu n&apos;as pas encore ajoutées.
              </p>
            </div>
            <SuggestionList suggestions={suggestions} />
          </section>
        ) : null}
      </div>
    </>
  );
}
