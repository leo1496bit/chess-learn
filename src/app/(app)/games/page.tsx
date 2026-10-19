import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { GamesFilters } from "@/components/games/games-filters";
import { GamesList } from "@/components/games/games-list";
import { GamesPagination } from "@/components/games/games-pagination";
import { SyncButton } from "@/components/games/sync-button";
import { formatRelative } from "@/components/games/format";
import { requireUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { hasActiveFilters, parseGameFilters } from "./filters";
import { getLibraryState, listGames } from "./queries";

export const metadata: Metadata = { title: "Mes parties" };

export default async function GamesPage({ searchParams }: PageProps<"/games">) {
  const { supabase } = await requireUser();
  const filters = parseGameFilters(await searchParams);
  const active = hasActiveFilters(filters);

  const [settings, library, { games, total }] = await Promise.all([
    getSettings(supabase),
    getLibraryState(supabase),
    listGames(supabase, filters),
  ]);

  const description =
    library.totalGames === 0 ? (
      <>Importe les parties publiques du compte Chess.com {settings.chesscomUsername} pour les analyser.</>
    ) : (
      <>
        <span className="tabular">{library.totalGames}</span> parties du compte {settings.chesscomUsername}
        {library.lastSyncedAt ? <>, synchronisées {formatRelative(library.lastSyncedAt)}</> : null}.
      </>
    );

  return (
    <>
      <PageHeader title="Mes parties" description={description} actions={<SyncButton hasGames={library.totalGames > 0} />} />

      {library.totalGames === 0 ? (
        <EmptyLibrary username={settings.chesscomUsername} />
      ) : (
        <div className="space-y-4">
          <GamesFilters filters={filters} active={active} />
          {games.length === 0 ? (
            <NoMatch />
          ) : (
            <>
              <p className="sr-only" aria-live="polite">
                {total} parties trouvées
              </p>
              <GamesList games={games} />
              <GamesPagination filters={filters} total={total} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function EmptyLibrary({ username }: { username: string }) {
  return (
    <section className="max-w-prose space-y-3 border-l-2 border-primary py-2 pl-5">
      <h2 className="text-lg font-semibold text-primary">Aucune partie importée pour l&apos;instant</h2>
      <p className="text-muted-foreground">
        Clique sur « Importer mes parties » : chess-learn récupère tout l&apos;historique public de {username} sur
        Chess.com, mois par mois. Le premier import peut prendre une à deux minutes.
      </p>
      <p className="text-sm text-muted-foreground">
        Ce n&apos;est pas le bon compte ?{" "}
        <Link href="/settings" className="text-primary underline underline-offset-4">
          Change l&apos;identifiant dans Paramètres
        </Link>
        .
      </p>
    </section>
  );
}

function NoMatch() {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <p className="font-medium">Aucune partie ne correspond à ces filtres.</p>
      <p className="text-sm text-muted-foreground">Élargis la période ou retire un filtre.</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/games">Effacer les filtres</Link>
      </Button>
    </div>
  );
}
