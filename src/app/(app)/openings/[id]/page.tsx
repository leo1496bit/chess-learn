import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { LineWorkspace } from "@/components/openings/line-workspace";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/db/server";
import { SUGGESTION_MIN_GAMES } from "@/lib/repertoire/constants";
import { formatLineStats, kindLabel } from "@/lib/repertoire/library";
import { loadLinePage } from "./queries";

export const metadata: Metadata = { title: "Ligne d'ouverture" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: PageProps<"/openings/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await requireUser();
  const data = await loadLinePage(supabase, id);
  if (!data) notFound();
  const { line, branches, ideas } = data;
  const building = line.status !== "ready" || !line.kind;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/openings" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Ouvertures
        </Link>
      </p>
      <PageHeader
        title={line.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant={building ? "outline" : line.kind === "punish" ? "destructive" : "secondary"}>
              {kindLabel(line.kind, line.status)}
            </Badge>
            <span>
              {line.eco ? `${line.eco}, ` : ""}
              {line.playerColor === "w" ? "avec les Blancs" : "avec les Noirs"}. {formatLineStats(line, SUGGESTION_MIN_GAMES)}
            </span>
          </span>
        }
      />
      <LineWorkspace line={line} branches={branches} cachedIdeas={ideas} />
    </>
  );
}
