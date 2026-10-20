// Sélection des réponses adverses à explorer : parties propres d'abord, puis explorateur Lichess.
import type { ExplorerResult } from "@/lib/lichess/explorer";
import { EXPLORER_MIN_SHARE, MAX_REPLIES, OWN_MIN_GAMES } from "./constants";

export type Reply = {
  uci: string;
  san: string;
  ownGames: number;
  explorerGames: number;
  explorerShare: number;
  source: "own" | "explorer";
};

export function mergeReplies(
  own: { uci: string; san: string; games: number }[],
  explorer: ExplorerResult | null,
): Reply[] {
  const byUci = new Map<string, Reply>();
  for (const move of own) {
    byUci.set(move.uci, {
      uci: move.uci,
      san: move.san,
      ownGames: move.games,
      explorerGames: 0,
      explorerShare: 0,
      source: "own",
    });
  }
  for (const move of explorer?.moves ?? []) {
    const existing = byUci.get(move.uci);
    if (existing) {
      existing.explorerGames = move.games;
      existing.explorerShare = move.share;
    } else {
      byUci.set(move.uci, {
        uci: move.uci,
        san: move.san,
        ownGames: 0,
        explorerGames: move.games,
        explorerShare: move.share,
        source: "explorer",
      });
    }
  }

  const all = [...byUci.values()];
  const fromOwn = all
    .filter((r) => r.ownGames >= OWN_MIN_GAMES)
    .map((r): Reply => ({ ...r, source: "own" }))
    .sort((a, b) => b.ownGames - a.ownGames);
  const fromExplorer = all
    .filter((r) => r.ownGames < OWN_MIN_GAMES && r.explorerShare >= EXPLORER_MIN_SHARE)
    .map((r): Reply => ({ ...r, source: "explorer" }))
    .sort((a, b) => b.explorerShare - a.explorerShare);
  return [...fromOwn, ...fromExplorer];
}

/** Au moins une réponse : une branche ne s'arrête jamais faute de budget au milieu d'un nœud adverse. */
export function takeReplies(merged: Reply[], leavesLeft: number): Reply[] {
  return merged.slice(0, Math.min(MAX_REPLIES, Math.max(1, leavesLeft)));
}
