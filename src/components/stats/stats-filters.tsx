import type { ReactNode } from "react";
import Link from "next/link";
import { PERIODS, type StatsFilters } from "@/lib/stats/filters";
import { timeClassLabel } from "@/lib/stats/labels";
import { cn } from "@/lib/utils";

function href(filters: StatsFilters): string {
  const params = new URLSearchParams();
  if (filters.timeClass) params.set("cadence", filters.timeClass);
  if (filters.period !== "all") params.set("periode", filters.period);
  const query = params.toString();
  return query ? `/stats?${query}` : "/stats";
}

function Chip({ active, to, children }: { active: boolean; to: string; children: ReactNode }) {
  return (
    <Link
      href={to}
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

/** Une seule rangée de filtres, au-dessus de tout ce qu'elle restreint. */
export function StatsFiltersBar({ filters, timeClasses }: { filters: StatsFilters; timeClasses: string[] }) {
  return (
    <nav aria-label="Filtres des statistiques" className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm font-medium">Cadence</span>
        <Chip active={filters.timeClass === null} to={href({ ...filters, timeClass: null })}>
          Toutes
        </Chip>
        {timeClasses.map((tc) => (
          <Chip key={tc} active={filters.timeClass === tc} to={href({ ...filters, timeClass: tc })}>
            {timeClassLabel(tc)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm font-medium">Période</span>
        {PERIODS.map((p) => (
          <Chip key={p.id} active={filters.period === p.id} to={href({ ...filters, period: p.id })}>
            {p.label}
          </Chip>
        ))}
      </div>
    </nav>
  );
}
