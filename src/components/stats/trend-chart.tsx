import { cn } from "@/lib/utils";
import { GRID_STROKE, SERIES_BG, SERIES_STROKE } from "./chart-colors";

export type TrendPoint = {
  key: string;
  /** Libellé complet (tableau, info-bulle). */
  label: string;
  /** Libellé court de l'axe des abscisses. */
  shortLabel: string;
  value: number | null;
  /** Détail affiché dans l'info-bulle et le tableau (ex. « 12 parties »). */
  detail: string;
};

const TICKS = [0, 25, 50, 75, 100];
const MAX_X_LABELS = 6;

/**
 * Série temporelle unique sur une échelle 0-100 : colonnes (score) ou ligne (précision).
 * Le tracé est décoratif pour les lecteurs d'écran ; le tableau qui suit porte toutes les valeurs.
 */
export function TrendChart({
  id,
  title,
  description,
  points,
  kind,
  format,
  emptyLabel = "Aucune partie sur la période",
}: {
  id: string;
  title: string;
  description?: string;
  points: TrendPoint[];
  kind: "column" | "line";
  format: (value: number) => string;
  emptyLabel?: string;
}) {
  const n = points.length;
  const labelEvery = Math.max(1, Math.ceil(n / MAX_X_LABELS));
  const xPct = (i: number) => (n === 1 ? 50 : ((i + 0.5) / n) * 100);
  const yPct = (v: number) => 100 - Math.max(0, Math.min(100, v));
  const last = [...points].reverse().find((p) => p.value !== null);

  // Segments de ligne continus (une période sans partie interrompt la ligne).
  const segments: { x: number; y: number }[][] = [];
  if (kind === "line") {
    let current: { x: number; y: number }[] = [];
    points.forEach((p, i) => {
      if (p.value === null) {
        if (current.length) segments.push(current);
        current = [];
      } else current.push({ x: xPct(i), y: yPct(p.value) });
    });
    if (current.length) segments.push(current);
  }

  return (
    <figure aria-labelledby={`${id}-title`} className="space-y-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id={`${id}-title`} className="font-semibold text-foreground">
          {title}
        </span>
        {last && last.value !== null ? (
          <span className="text-sm text-muted-foreground">
            Dernière période : <span className="font-semibold text-foreground">{format(last.value)}</span>
          </span>
        ) : null}
        {description ? <span className="basis-full text-sm text-muted-foreground">{description}</span> : null}
      </figcaption>

      <div aria-hidden className="grid grid-cols-[2.25rem_1fr] gap-x-2">
        {/* Axe des ordonnées */}
        <div className="relative h-44 text-right text-xs text-muted-foreground tabular">
          {TICKS.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(t)}%` }}>
              {t}
            </span>
          ))}
        </div>

        <div className="relative h-44">
          {TICKS.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${yPct(t)}%` }} />
          ))}

          {n === 0 ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : null}

          {kind === "column" ? (
            <div className="absolute inset-0 flex items-end gap-0.5">
              {points.map((p) => (
                <div key={p.key} className="flex h-full flex-1 items-end justify-center" title={`${p.label} : ${p.value === null ? "aucune partie" : format(p.value)} (${p.detail})`}>
                  {p.value !== null ? (
                    <div className={cn("w-full max-w-6 rounded-t", SERIES_BG)} style={{ height: `${Math.max(p.value, 0.75)}%` }} />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <>
              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                {segments.map((seg, i) => (
                  <polyline
                    key={i}
                    points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    className={SERIES_STROKE}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <line x1="0" x2="100" y1="100" y2="100" className={GRID_STROKE} vectorEffect="non-scaling-stroke" />
              </svg>
              {points.map((p, i) =>
                p.value === null ? null : (
                  <span
                    key={p.key}
                    title={`${p.label} : ${format(p.value)} (${p.detail})`}
                    className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center"
                    style={{ left: `${xPct(i)}%`, top: `${yPct(p.value)}%` }}
                  >
                    <span className={cn("size-2.5 rounded-full ring-2 ring-card", SERIES_BG)} />
                  </span>
                ),
              )}
            </>
          )}
        </div>

        {/* Axe des abscisses */}
        <div />
        <div className="relative h-5 text-xs text-muted-foreground">
          {points.map((p, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <span
                key={p.key}
                className={cn("absolute top-1 -translate-x-1/2 whitespace-nowrap", i !== n - 1 && n - 1 - i < labelEvery && "hidden")}
                style={{ left: `${xPct(i)}%` }}
              >
                {p.shortLabel}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Voir les valeurs en tableau</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Période</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Valeur</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Échantillon</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {points.map((p) => (
                <tr key={p.key} className="border-t">
                  <th scope="row" className="px-3 py-1.5 font-normal">{p.label}</th>
                  <td className="px-3 py-1.5 text-right">{p.value === null ? "—" : format(p.value)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
