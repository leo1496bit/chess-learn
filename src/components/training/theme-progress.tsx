import Link from "next/link";
import type { GroupTrainingStats } from "@/lib/training/queue";
import { formatPct } from "@/lib/stats/format";
import { themeGroupLabel, type ThemeGroup } from "@/lib/training/theme-groups";
import { cn } from "@/lib/utils";
import { SERIES_BG } from "@/components/stats/chart-colors";

/** Progression par axe : taux de réussite (à partir de 5 tentatives) et révisions dues. Chaque ligne filtre la série. */
export function ThemeProgress({ stats, active, hrefFor }: { stats: GroupTrainingStats[]; active: ThemeGroup | null; hrefFor: (g: ThemeGroup | null) => string }) {
  return (
    <ul className="divide-y border-y">
      {stats.map((s) => (
        <li key={s.group}>
          <Link
            href={hrefFor(active === s.group ? null : s.group)}
            aria-current={active === s.group ? "true" : undefined}
            className={cn("block space-y-1.5 px-2 py-2.5 hover:bg-muted/50", active === s.group && "bg-accent")}
          >
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{themeGroupLabel(s.group)}</span>
              <span className="text-muted-foreground tabular">
                {s.successRate.status === "ok" ? (
                  <span className="font-semibold text-foreground">{formatPct(s.successRate.value)}</span>
                ) : s.exercises === 0 ? (
                  "aucun exercice"
                ) : (
                  `${s.attempts}/${s.successRate.required} tentatives`
                )}
              </span>
            </span>
            <span className="block h-1.5 rounded-r bg-muted">
              {s.successRate.status === "ok" ? (
                <span className={cn("block h-full rounded-r", SERIES_BG)} style={{ width: `${s.successRate.value}%` }} />
              ) : null}
            </span>
            <span className="block text-xs text-muted-foreground tabular">
              {s.exercises} exercice{s.exercises > 1 ? "s" : ""}
              {s.due > 0 ? `, ${s.due} à réviser` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
