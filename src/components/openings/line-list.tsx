import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SUGGESTION_MIN_GAMES } from "@/lib/repertoire/constants";
import { formatLineStats, kindLabel, type LibraryLine } from "@/lib/repertoire/library";
import { cn } from "@/lib/utils";

export function LineList({ lines }: { lines: LibraryLine[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {lines.map((line) => {
        const building = line.status !== "ready" || !line.kind;
        return (
          <li key={line.id}>
            <Link
              href={`/openings/${line.id}`}
              className="block h-full space-y-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-semibold leading-snug">
                  {line.name}
                  {line.eco ? <span className="ml-2 text-sm font-normal text-muted-foreground">{line.eco}</span> : null}
                </p>
                <Badge variant={building ? "outline" : line.kind === "punish" ? "destructive" : "secondary"} className="shrink-0">
                  {kindLabel(line.kind, line.status)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {line.playerColor === "w" ? "Avec les Blancs" : "Avec les Noirs"} · {formatLineStats(line, SUGGESTION_MIN_GAMES)}
              </p>
              <p className={cn("text-sm", line.dueCount > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
                {line.dueCount > 0
                  ? `${line.dueCount} branche${line.dueCount > 1 ? "s" : ""} à revoir aujourd'hui`
                  : "Rien à revoir aujourd'hui"}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
