import Link from "next/link";
import type { RecentGame } from "@/lib/stats/queries";
import { formatDate } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import { RESULT_BG } from "./chart-colors";

const MARK = { win: "1", draw: "½", loss: "0" } as const;
const WORD = { win: "Victoire", draw: "Nulle", loss: "Défaite" } as const;
// Texte posé sur le remplissage : blanc sur les pôles foncés, encre sur le gris clair des nulles.
const INK = { win: "text-white", draw: "text-[#1b2233] dark:text-white", loss: "text-white" } as const;

/**
 * Les dernières parties comme une ligne de feuille de notation : 1, ½, 0.
 * La plus ancienne à gauche, la plus récente à droite ; chaque case ouvre la partie.
 */
export function ResultStrip({ games }: { games: RecentGame[] }) {
  const ordered = [...games].reverse();
  return (
    <ol className="flex flex-wrap gap-0.5" aria-label="Résultats des dernières parties, de la plus ancienne à la plus récente">
      {ordered.map((g) => {
        const opponent = g.playerColor === "w" ? g.black : g.white;
        const label = `${WORD[g.result]} contre ${opponent}, ${formatDate(g.endTime)}`;
        return (
          <li key={g.id}>
            <Link
              href={`/games/${g.id}`}
              title={label}
              aria-label={label}
              className={cn(
                "grid size-8 place-items-center rounded text-sm font-bold transition-transform hover:-translate-y-0.5 sm:size-9",
                RESULT_BG[g.result],
                INK[g.result],
              )}
            >
              <span aria-hidden>{MARK[g.result]}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
