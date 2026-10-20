// Aides pures de la page /openings/[id] : état des branches, arbre de la ligne, garde de la boucle
// de construction. Aucun coup n'est calculé ici : l'arbre ne fait que regrouper les branches enregistrées.
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import type { MoveLink } from "@/lib/ai/move-links";
import { isDue } from "@/lib/training/sm2";
import { BUILD_REPEAT_NEEDS, BUILD_STALL_STEPS } from "./constants";

export type BranchStatus = "new" | "due" | "mastered";

export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
  new: "Pas encore étudiée",
  due: "À revoir aujourd'hui",
  mastered: "Maîtrisée",
};

export function branchStatus(branch: { studiedAt: string | null; dueAt: string }, now: Date): BranchStatus {
  if (!branch.studiedAt) return "new";
  return isDue(branch.dueAt, now) ? "due" : "mastered";
}

export type TreeMove = {
  /** Demi-coup dans la branche (0 = premier coup après la position de départ). */
  index: number;
  san: string;
  /** « 3. », « 3... » ou "" (coup noir qui suit le coup blanc dans le même segment). */
  number: string;
  isPlayer: boolean;
  /** Parties de Leonel avec cette réponse adverse, quand elle termine une branche (sinon null). */
  ownGames: number | null;
  /** Une branche qui passe par ce coup : son chemin donne la position à afficher au clic. */
  branchId: string;
};

/** Libellé d'une réponse adverse : parties de Leonel, ou « Lichess » si elle ne vient que de l'explorateur. */
export function replyGamesLabel(ownGames: number): string {
  if (ownGames === 0) return "Lichess";
  return `${ownGames} partie${ownGames > 1 ? "s" : ""}`;
}

/** Suite de coups sans embranchement, puis ses variantes. */
export type TreeSegment = {
  moves: TreeMove[];
  /** Branches qui se terminent au dernier coup du segment. */
  branchIds: string[];
  children: TreeSegment[];
};

type TrieNode = { san: string; index: number; ownGames: number | null; via: string; ends: string[]; children: TrieNode[] };

/** Position de départ : numéro de coup et camp au trait, lus dans la FEN. */
function rootPly(rootFen: string): { fullmove: number; blackToMove: boolean } {
  const [, side, , , , fullmove] = rootFen.split(" ");
  return { fullmove: Number(fullmove) || 1, blackToMove: side === "b" };
}

export function buildLineTree(
  rootFen: string,
  branches: readonly { id: string; pathSan: readonly string[]; ownGames: number }[],
): TreeSegment[] {
  const root: TrieNode = { san: "", index: -1, ownGames: null, via: "", ends: [], children: [] };
  for (const branch of branches) {
    // Dernière réponse adverse de la branche (indices impairs : la racine a Leonel au trait).
    let lastReply = branch.pathSan.length - 1;
    if (lastReply % 2 === 0) lastReply -= 1;
    let node = root;
    branch.pathSan.forEach((san, index) => {
      let child = node.children.find((c) => c.san === san);
      if (!child) {
        child = { san, index, ownGames: null, via: branch.id, ends: [], children: [] };
        node.children.push(child);
      }
      if (index === lastReply) child.ownGames = branch.ownGames;
      node = child;
    });
    if (node !== root) node.ends.push(branch.id);
  }

  const start = rootPly(rootFen);
  const toMove = (node: TrieNode, first: boolean): TreeMove => {
    const half = node.index + (start.blackToMove ? 1 : 0);
    const fullmove = start.fullmove + Math.floor(half / 2);
    const white = half % 2 === 0;
    return {
      index: node.index,
      san: node.san,
      number: white ? `${fullmove}.` : first ? `${fullmove}...` : "",
      isPlayer: node.index % 2 === 0,
      ownGames: node.ownGames,
      branchId: node.via,
    };
  };

  const segment = (first: TrieNode): TreeSegment => {
    const moves = [toMove(first, true)];
    let current = first;
    while (current.children.length === 1 && current.ends.length === 0) {
      current = current.children[0];
      moves.push(toMove(current, false));
    }
    return { moves, branchIds: current.ends, children: current.children.map(segment) };
  };
  return root.children.map(segment);
}

export type BuildNeed = { fen: string; multipv: number };
export type BuildGuard = { emptySteps: number; requests: ReadonlyMap<string, number> };

export function startBuildGuard(): BuildGuard {
  return { emptySteps: 0, requests: new Map() };
}

/**
 * Garde de la boucle de construction du navigateur : arrêt après BUILD_STALL_STEPS étapes consécutives
 * sans analyse demandée, ou si une même analyse est redemandée BUILD_REPEAT_NEEDS fois.
 */
export function stepBuildGuard(guard: BuildGuard, needs: readonly BuildNeed[]): { guard: BuildGuard; stalled: boolean } {
  if (needs.length === 0) {
    const emptySteps = guard.emptySteps + 1;
    return { guard: { ...guard, emptySteps }, stalled: emptySteps >= BUILD_STALL_STEPS };
  }
  const requests = new Map(guard.requests);
  let stalled = false;
  for (const need of needs) {
    const key = `${need.fen}|${need.multipv}`;
    const count = (requests.get(key) ?? 0) + 1;
    requests.set(key, count);
    if (count >= BUILD_REPEAT_NEEDS) stalled = true;
  }
  return { guard: { emptySteps: 0, requests }, stalled };
}

/** Données de la page d'une ligne (lues côté serveur, transmises au navigateur). */
export type LinePageLine = {
  id: string;
  name: string;
  eco: string | null;
  playerColor: "w" | "b";
  kind: string | null;
  status: string;
  rootFen: string;
  prefixSan: string[];
  explorerUnavailable: boolean;
  games: number;
  wins: number;
  draws: number;
  losses: number;
};

export type LinePageBranch = {
  id: string;
  pathUci: string[];
  pathSan: string[];
  endFen: string;
  ownGames: number;
  explorerGames: number;
  studiedAt: string | null;
  dueAt: string;
  lastResult: string | null;
};

/** Positions d'une branche rejouée par chess.js : `fens[i]` = position avant le demi-coup i ; arrêt au premier coup illégal. */
export function branchPositions(rootFen: string, pathUci: readonly string[]): { fens: string[]; san: string[] } {
  const chess = new Chess(rootFen);
  const fens = [chess.fen()];
  const san: string[] = [];
  for (const uci of pathUci) {
    const played = playUci(chess, uci);
    if (!played) break;
    san.push(played.san);
    fens.push(chess.fen());
  }
  return { fens, san };
}

/** Coups de la branche, cliquables dans les idées de l'IA (aucun autre coup n'est relié). */
export function branchMoveLinks(rootFen: string, pathUci: readonly string[]): MoveLink[] {
  const { fens, san } = branchPositions(rootFen, pathUci);
  return san.map((s, i) => ({ fen: fens[i], uci: pathUci[i], san: s, source: "played" }));
}
