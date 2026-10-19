import { ClassificationBadge, MissedWinBadge } from "@/components/chess/classification-badge";
import { ERROR_KINDS, PHASES, type ErrorKind, type ErrorMatrix } from "@/lib/stats/aggregate";
import { formatPerGame } from "@/lib/stats/format";
import { PHASE_LABELS } from "@/lib/stats/labels";

const KIND_LABELS: Record<ErrorKind, string> = {
  blunder: "Gaffes",
  mistake: "Erreurs",
  inaccuracy: "Imprécisions",
  missedWin: "Gains manqués",
};

function KindBadge({ kind }: { kind: ErrorKind }) {
  return kind === "missedWin" ? <MissedWinBadge /> : <ClassificationBadge classification={kind} />;
}

/** Erreurs du joueur par gravité et par phase, en nombre et en moyenne par partie analysée. */
export function ErrorMatrixTable({ matrix, analyzedGames }: { matrix: ErrorMatrix; analyzedGames: number }) {
  const max = Math.max(...ERROR_KINDS.flatMap((k) => PHASES.map((p) => matrix.counts[k][p])), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">
          Erreurs par gravité et par phase de jeu sur {analyzedGames} parties analysées
        </caption>
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 text-left font-medium">Gravité</th>
            {PHASES.map((p) => (
              <th key={p} scope="col" className="px-3 py-2 text-right font-medium">{PHASE_LABELS[p]}</th>
            ))}
            <th scope="col" className="py-2 pl-3 text-right font-medium">Par partie</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {ERROR_KINDS.map((k) => (
            <tr key={k} className="border-b last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="flex items-center gap-2">
                  <KindBadge kind={k} />
                  {KIND_LABELS[k]}
                </span>
              </th>
              {PHASES.map((p) => {
                const n = matrix.counts[k][p];
                return (
                  <td key={p} className="px-3 py-2 text-right">
                    <span className="relative inline-flex min-w-10 justify-end px-1.5 py-0.5">
                      {/* Intensité proportionnelle au nombre : une seule teinte, du clair au foncé. */}
                      <span aria-hidden className="absolute inset-0 rounded bg-primary" style={{ opacity: n === 0 ? 0 : 0.05 + (n / max) * 0.25 }} />
                      <span className="relative">{n}</span>
                    </span>
                  </td>
                );
              })}
              <td className="py-2 pl-3 text-right font-semibold">{formatPerGame(matrix.perGame[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
