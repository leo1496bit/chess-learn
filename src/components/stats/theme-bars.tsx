import { MIN_OCCURRENCES, type ThemeWeakness } from "@/lib/stats/aggregate";
import { formatPct, formatPerGame } from "@/lib/stats/format";
import { THEME_LABELS } from "@/lib/stats/labels";
import { STRATEGIC_THEMES, TACTICAL_THEMES } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";
import { SERIES_BG } from "./chart-colors";

function nature(theme: ThemeWeakness["theme"]): string {
  if (TACTICAL_THEMES.includes(theme)) return "tactique";
  if (STRATEGIC_THEMES.includes(theme)) return "stratégique";
  return "calcul";
}

/** Thèmes d'erreur normalisés par partie analysée ; les thèmes trop rares restent grisés. */
export function ThemeBars({ themes }: { themes: ThemeWeakness[] }) {
  const max = Math.max(...themes.filter((t) => t.sufficient).map((t) => t.perGame), 0.0001);
  return (
    <ul className="space-y-3">
      {themes.map((t) => (
        <li key={t.theme} className="grid grid-cols-[minmax(7rem,10rem)_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_1fr_9rem]">
          <span className="text-sm">
            <span className="font-semibold">{THEME_LABELS[t.theme]}</span>
            <span className="block text-xs text-muted-foreground">Erreur {nature(t.theme)}</span>
          </span>
          <span className="h-3 rounded-r bg-muted/60">
            {t.sufficient ? (
              <span className={cn("block h-full rounded-r", SERIES_BG)} style={{ width: `${(t.perGame / max) * 100}%` }} />
            ) : null}
          </span>
          <span className="col-start-2 text-sm text-muted-foreground tabular sm:col-start-auto sm:text-right">
            {t.sufficient ? (
              <>
                <span className="font-semibold text-foreground">{formatPerGame(t.perGame)}</span> par partie ·{" "}
                {formatPct(t.gameShare)} des parties
              </>
            ) : (
              <>
                {t.occurrences} sur {MIN_OCCURRENCES} occurrences requises
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
