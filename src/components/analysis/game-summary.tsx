import { CLASSIFICATION_META, MISSED_WIN_META } from "@/components/chess/classification-badge";
import type { GameAnalysisSummary } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

type Side = GameAnalysisSummary["player"];

const COUNTS = [
  { key: "inaccuracy", ...CLASSIFICATION_META.inaccuracy, text: "text-cls-inaccuracy" },
  { key: "mistake", ...CLASSIFICATION_META.mistake, text: "text-cls-mistake" },
  { key: "blunder", ...CLASSIFICATION_META.blunder, text: "text-cls-blunder" },
  { key: "missedWin", ...MISSED_WIN_META, text: "text-cls-missed" },
] as const;

function SideSummary({ name, side, isPlayer }: { name: string; side: Side; isPlayer: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3", isPlayer && "bg-primary/4")}>
      <div className="min-w-0">
        <p className={cn("truncate text-sm", isPlayer ? "font-semibold" : "text-muted-foreground")}>
          {name}
          {isPlayer ? <span className="font-normal text-muted-foreground"> (vous)</span> : null}
        </p>
        <p className="tabular text-3xl font-bold tracking-tight text-primary">
          {side.accuracy === null ? "—" : side.accuracy.toFixed(1)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">de précision</span>
        </p>
      </div>
      <dl className="flex gap-4">
        {COUNTS.map((c) => (
          <div key={c.key} className="text-center" title={c.label}>
            <dt className={cn("text-sm font-bold", c.text)}>
              <span aria-hidden>{c.symbol}</span>
              <span className="sr-only">{c.label}</span>
            </dt>
            <dd className="tabular text-lg font-semibold">{side[c.key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Précision et nombre d'imprécisions, erreurs, gaffes et gains manqués pour chaque camp. */
export function GameSummary({ summary, playerName, opponentName }: { summary: GameAnalysisSummary; playerName: string; opponentName: string }) {
  return (
    <div className="grid divide-y overflow-hidden rounded-lg border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      <SideSummary name={playerName} side={summary.player} isPlayer />
      <SideSummary name={opponentName} side={summary.opponent} isPlayer={false} />
    </div>
  );
}
