import type { ResultSummary } from "@/lib/stats/aggregate";
import { formatPct } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import { RESULT_BG } from "./chart-colors";

const SEGMENTS = [
  { key: "win", label: "Victoires", count: (r: ResultSummary) => r.wins, rate: (r: ResultSummary) => r.winRate },
  { key: "draw", label: "Nulles", count: (r: ResultSummary) => r.draws, rate: (r: ResultSummary) => r.drawRate },
  { key: "loss", label: "Défaites", count: (r: ResultSummary) => r.losses, rate: (r: ResultSummary) => r.lossRate },
] as const;

export function resultsSentence(r: ResultSummary): string {
  return `${r.wins} victoires (${formatPct(r.winRate)}), ${r.draws} nulles (${formatPct(r.drawRate)}), ${r.losses} défaites (${formatPct(r.lossRate)}) sur ${r.total} parties`;
}

/** Barre empilée victoires / nulles / défaites, séparées par un espace de 2 px. */
export function ResultBar({ results, className, thin = false }: { results: ResultSummary; className?: string; thin?: boolean }) {
  return (
    <div
      role="img"
      aria-label={resultsSentence(results)}
      className={cn("flex w-full gap-0.5 overflow-hidden rounded", thin ? "h-2" : "h-3", className)}
    >
      {results.total === 0 ? <div className="h-full w-full bg-muted" /> : null}
      {SEGMENTS.map((s) => {
        const rate = s.rate(results);
        if (rate === 0) return null;
        return (
          <div
            key={s.key}
            title={`${s.label} : ${s.count(results)} (${formatPct(rate)})`}
            className={cn("h-full first:rounded-l last:rounded-r", RESULT_BG[s.key])}
            style={{ width: `${rate}%` }}
          />
        );
      })}
    </div>
  );
}

export function ResultLegend({ results, className }: { results?: ResultSummary; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground", className)}>
      {SEGMENTS.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", RESULT_BG[s.key])} />
          <span>{s.label}</span>
          {results ? (
            <span className="tabular font-semibold text-foreground">
              {s.count(results)} · {formatPct(s.rate(results))}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
