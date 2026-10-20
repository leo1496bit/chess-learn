// Aides pures de la page /openings : tri des lignes et libellés.
export type LibraryLine = {
  id: string;
  name: string;
  eco: string | null;
  playerColor: "w" | "b";
  kind: string | null;
  status: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Branches à revoir aujourd'hui. */
  dueCount: number;
};

/** Lignes à revoir d'abord, puis par nombre de parties décroissant. */
export function sortLines<T extends Pick<LibraryLine, "dueCount" | "games">>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => Number(b.dueCount > 0) - Number(a.dueCount > 0) || b.games - a.games);
}

export function formatLineStats(
  line: Pick<LibraryLine, "games" | "wins" | "losses">,
  minGames: number,
): string {
  const games = `${line.games} partie${line.games > 1 ? "s" : ""}`;
  return line.games < minGames ? `${games} · données insuffisantes` : `${games} · ${line.wins} V / ${line.losses} D`;
}

export function kindLabel(kind: string | null, status: string): string {
  if (status !== "ready" || !kind) return "En construction";
  return kind === "punish" ? "À punir" : "À maîtriser";
}

/**
 * Camp de Leonel pour une ligne ajoutée par nom du livre (`uci` : coups séparés par des espaces).
 * La ligne s'arrête sur un coup adverse : nombre impair de coups → le dernier est blanc → Leonel joue
 * les Noirs ; nombre pair → les Blancs.
 */
export function playerColorForName(uci: string): "w" | "b" {
  return uci.split(" ").filter(Boolean).length % 2 === 1 ? "b" : "w";
}
