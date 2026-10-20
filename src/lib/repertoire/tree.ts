// Assemblage pur de l'arbre d'une ligne de répertoire, à partir de données déjà calculées
// (analyses Stockfish en cache, réponses de ses parties, explorateur Lichess). Aucun calcul moteur ici :
// les positions manquantes sont renvoyées dans `needs` / `needsReplies`, et l'appelant rappelle
// `buildTree` une fois qu'elles sont disponibles. L'arbre est recalculé de zéro à chaque appel.
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import { terminalAnalysis } from "@/lib/analysis/terminal";
import type { Color, Evaluation, PositionAnalysis } from "@/lib/analysis/types";
import { moverWinPercent } from "@/lib/analysis/win";
import type { ExplorerResult } from "@/lib/lichess/explorer";
import { toEpd, type OpeningBook } from "@/lib/openings/identify";
import { branchEnds, candidatesNeedingEval, choosePlayerMove, lineKind, playerCandidates } from "./choose";
import { MAX_BRANCHES, OWN_MIN_GAMES } from "./constants";
import { mergeReplies, takeReplies, type Reply } from "./replies";

/** `multipv` : celui de la ligne pour une position où Leonel joue, 1 pour un candidat ou une fin de branche. */
export type AnalysisNeed = { fen: string; multipv: number };

/** `undefined` : pas encore disponible. `null` (explorateur) : explorateur indisponible. */
export type TreeDeps = {
  analysis(fen: string, multipv: number): PositionAnalysis | undefined;
  ownReplies(epd: string): { uci: string; san: string; games: number }[] | undefined;
  explorer(epd: string): ExplorerResult | null | undefined;
  book: OpeningBook;
};

export type BuiltBranch = {
  pathUci: string[];
  pathSan: string[];
  endFen: string;
  /** Parties de la dernière réponse adverse du chemin (0 s'il n'y en a pas). */
  ownGames: number;
  explorerGames: number;
};

export type TreeResult = {
  complete: boolean;
  needs: AnalysisNeed[];
  /** EPD dont il manque les réponses propres ou l'explorateur. */
  needsReplies: string[];
  branches: BuiltBranch[];
  kind: "punish" | "master" | null;
};

export type TreeRoot = {
  fen: string;
  ply: number;
  playerColor: Color;
  prefixUci: string[];
  bookName: string | null;
};

type Path = { uci: string[]; san: string[]; lastReply: Reply | null };

/** % de gain de `color` ; une position matée (`mate: 0`) est perdue pour le camp au trait. */
function winFor(evaluation: Evaluation, color: Color, fen: string): number {
  if (evaluation.mate === 0) return new Chess(fen).turn() === color ? 0 : 100;
  return moverWinPercent(evaluation, color);
}

/** Évaluation principale (point de vue Blancs) d'une analyse, ou de la règle si la position est terminale. */
function mainEvaluation(analysis: PositionAnalysis): Evaluation | null {
  return analysis.terminal?.evaluation ?? analysis.lines[0]?.evaluation ?? null;
}

export function buildTree(root: TreeRoot, deps: TreeDeps, multipv: number): TreeResult {
  const needs = new Map<string, AnalysisNeed>();
  const needsReplies = new Set<string>();
  const branches: BuiltBranch[] = [];
  const opponent: Color = root.playerColor === "w" ? "b" : "w";
  let open = 1; // chemins ouverts (feuilles futures), budget MAX_BRANCHES

  /** Analyse en cache, ou terminale par les règles ; `undefined` (et besoin noté) si absente. */
  function analysisOf(fen: string, mpv: number): PositionAnalysis | undefined {
    const terminal = terminalAnalysis(fen, 0, mpv);
    if (terminal) return terminal;
    const found = deps.analysis(fen, mpv);
    if (!found) needs.set(`${fen}|${mpv}`, { fen, multipv: mpv });
    return found;
  }

  function leaf(fen: string, path: Path) {
    // Position finale analysée (multipv 1) pour le plan de l'IA, sauf position terminale.
    if (!analysisOf(fen, 1)) return;
    branches.push({
      pathUci: path.uci,
      pathSan: path.san,
      endFen: fen,
      ownGames: path.lastReply?.ownGames ?? 0,
      explorerGames: path.lastReply?.explorerGames ?? 0,
    });
  }

  function visit(fen: string, ply: number, path: Path) {
    if (new Chess(fen).turn() === root.playerColor) playerNode(fen, ply, path);
    else opponentNode(fen, ply, path);
  }

  function playerNode(fen: string, ply: number, path: Path) {
    if (terminalAnalysis(fen)) return leaf(fen, path);
    const epd = toEpd(fen);
    const analysis = analysisOf(fen, multipv);
    const explorer = deps.explorer(epd);
    if (explorer === undefined) needsReplies.add(epd);
    if (!analysis || explorer === undefined) return;
    if (analysis.lines.length === 0) return leaf(fen, path);

    const candidates = playerCandidates(fen, deps.book, explorer);
    const candidateEvals = new Map<string, Evaluation>();
    let missing = false;
    for (const uci of candidatesNeedingEval(analysis, candidates)) {
      const chess = new Chess(fen);
      if (!playUci(chess, uci)) continue;
      const after = analysisOf(chess.fen(), 1);
      if (!after) {
        missing = true;
        continue;
      }
      const evaluation = mainEvaluation(after);
      if (evaluation) candidateEvals.set(uci, evaluation);
    }
    if (missing) return;

    const { uci } = choosePlayerMove(analysis, candidateEvals, root.playerColor, candidates);
    const chess = new Chess(fen);
    const played = playUci(chess, uci);
    if (!played) return leaf(fen, path);
    visit(chess.fen(), ply + 1, { ...path, uci: [...path.uci, uci], san: [...path.san, played.san] });
  }

  function opponentNode(fen: string, ply: number, path: Path) {
    // Fin indépendante des fréquences (mat, pat, phase, demi-coups) : inutile de demander les réponses.
    if (branchEnds({ fen, ply, ownGames: OWN_MIN_GAMES, explorerTotal: null })) return leaf(fen, path);
    const epd = toEpd(fen);
    const own = deps.ownReplies(epd);
    const explorer = deps.explorer(epd);
    if (own === undefined || explorer === undefined) {
      needsReplies.add(epd);
      return;
    }
    const ownGames = own.reduce((sum, r) => sum + r.games, 0);
    if (branchEnds({ fen, ply, ownGames, explorerTotal: explorer?.total ?? null })) return leaf(fen, path);

    // Seuls les coups légaux (vérifiés par chess.js) sont retenus.
    const legal: { reply: Reply; fen: string; san: string }[] = [];
    for (const reply of mergeReplies(own, explorer)) {
      const chess = new Chess(fen);
      const played = playUci(chess, reply.uci);
      if (played) legal.push({ reply, fen: chess.fen(), san: played.san });
    }
    if (legal.length === 0) return leaf(fen, path);

    const taken = takeReplies(
      legal.map((l) => l.reply),
      MAX_BRANCHES - open + 1,
    );
    open += taken.length - 1;
    for (const reply of taken) {
      const next = legal.find((l) => l.reply.uci === reply.uci)!;
      visit(next.fen, ply + 1, { uci: [...path.uci, reply.uci], san: [...path.san, next.san], lastReply: reply });
    }
  }

  function computeKind(): "punish" | "master" | null {
    const rootAnalysis = analysisOf(root.fen, multipv);
    const rootEval = rootAnalysis && mainEvaluation(rootAnalysis);
    let lossOfDefiningMove = 0;
    if (root.prefixUci.length > 0) {
      const chess = new Chess();
      const legalPrefix = root.prefixUci.slice(0, -1).every((uci) => playUci(chess, uci) !== null);
      if (legalPrefix) {
        const beforeFen = chess.fen();
        const before = analysisOf(beforeFen, multipv);
        const bestBefore = before && mainEvaluation(before);
        if (!bestBefore || !rootEval) return null;
        lossOfDefiningMove = Math.max(
          0,
          winFor(bestBefore, opponent, beforeFen) - winFor(rootEval, opponent, root.fen),
        );
      }
    }
    if (!rootEval) return null;
    return lineKind({
      lossOfDefiningMove,
      bookName: root.bookName,
      playerWinAtRoot: winFor(rootEval, root.playerColor, root.fen),
    });
  }

  visit(root.fen, root.ply, { uci: [], san: [], lastReply: null });
  const kind = computeKind();

  return {
    complete: needs.size === 0 && needsReplies.size === 0,
    needs: [...needs.values()],
    needsReplies: [...needsReplies],
    branches,
    kind,
  };
}
