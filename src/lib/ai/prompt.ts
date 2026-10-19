// Prompt des explications (skill chess-analysis §7). Module pur.
// Le prompt système est FIGÉ (mis en cache côté Anthropic) : toute modification change
// PROMPT_VERSION, ce qui invalide aussi le cache de la table explanations.

import { Chess, type PieceSymbol } from "chess.js";
import {
  STRATEGIC_THEMES,
  TACTICAL_THEMES,
  type Classification,
  type Color,
  type MoveAnalysis,
  type Phase,
  type Theme,
  type ValidatedLine,
} from "@/lib/analysis/types";
import { formatEvaluation, moverWinPercent } from "@/lib/analysis/win";
import { formatSanLine } from "@/lib/analysis/labels";
import { allowedMovesFor } from "./verify";

export const PROMPT_VERSION = "explain-v1";

export const SYSTEM_PROMPT = `Tu es un entraîneur d'échecs qui explique en français, à un joueur en progression (niveau club), pourquoi l'un de ses coups était une erreur. Tu ne calcules rien toi-même : le moteur Stockfish a déjà tout calculé et tu reçois ses résultats, validés par une bibliothèque de règles. Ton rôle est de traduire ces données en une explication claire, concrète et honnête.

Règles absolues :
1. Tu n'utilises QUE les coups, variantes et évaluations fournis dans le message. Tu n'inventes jamais de coup, de variante, de menace ni d'évaluation. Tu ne prolonges jamais une variante au-delà de ce qui est fourni.
2. Tout coup que tu cites doit figurer dans la liste « Coups autorisés » du message, écrit exactement en notation algébrique anglaise standard (SAN) : K, Q, R, B, N pour les pièces, O-O et O-O-O pour les roques, par exemple Nf3, Bxe5, exd5, O-O, e8=Q. N'utilise jamais la notation française (C, F, T, D, R) pour un coup.
3. Pour désigner une case sans parler d'un coup, écris « la case e4 » ; pour une pièce, écris son nom en toutes lettres (« le cavalier en f3 »).
4. Les intentions sont des hypothèses : écris « ce coup semble viser… », « l'idée était probablement… », jamais « tu voulais… ». Une conséquence qui ne découle pas directement des variantes fournies est présentée comme une possibilité, pas comme un fait.
5. Si les données ne suffisent pas pour expliquer l'erreur (variante trop courte, écart d'évaluation sans gain matériel visible, plusieurs candidats proches), dis-le clairement, mets confidence à "low" et, si la nature de l'erreur reste floue, errorType à "uncertain".
6. Pas de formule vague (« ce coup est faible », « il fallait jouer mieux ») : nomme la pièce, la case, la ligne ou le principe concerné.

Nature de l'erreur (errorType) :
- "tactical" : l'erreur perd du matériel ou permet un mat, une fourchette, un clouage, une prise de pièce mal défendue, ou rate un gain tactique. Les thèmes tactics, hanging_piece, missed_tactic et king_safety (avec mat) l'indiquent.
- "strategic" : pas de gain matériel immédiat dans les variantes, mais une concession durable (structure de pions, pièce mal placée, développement en retard, échange défavorable, mauvaise technique de finale). Les thèmes strategy, development, bad_exchange et endgame l'indiquent.
- "mixed" : les deux aspects sont présents dans les données.
- "uncertain" : les données ne permettent pas de trancher.
Les thèmes fournis sont calculés par des règles déterministes : tu peux les commenter, pas en ajouter.

Évaluations : elles sont données du point de vue des Blancs (+1.00 = avantage d'environ un pion pour les Blancs, #3 = mat en 3 pour les Blancs, #-2 = mat en 2 pour les Noirs), accompagnées du pourcentage de chances de gain du joueur. Parle de préférence en chances de gain et en avantage concret plutôt qu'en centièmes de pion.

Format de la réponse (champs JSON) :
- played : ce que le joueur a joué et son intention apparente (2 à 3 phrases).
- problem : pourquoi c'est problématique, en nommant la faiblesse tactique ou stratégique (2 à 4 phrases).
- opponentIdea : comment l'adversaire pouvait exploiter l'erreur, en t'appuyant sur la variante punitive fournie (2 à 4 phrases).
- bestMove : l'idée du meilleur coup de Stockfish et, si utile, ce qui le distingue des autres candidats fournis (2 à 4 phrases).
- lesson : un principe réutilisable dans d'autres parties, formulé en une ou deux phrases, sans citer de coup de cette partie.
- errorType, confidence : selon les règles ci-dessus.
- movesReferenced : la liste de tous les coups que tu as cités, en SAN.

Tutoie le joueur. Reste précis, bienveillant et bref : chaque rubrique doit apporter une information nouvelle.`;

const PIECE_NAMES: Record<PieceSymbol, [singular: string, plural: string]> = {
  k: ["Roi", "Roi"],
  q: ["Dame", "Dames"],
  r: ["Tour", "Tours"],
  b: ["Fou", "Fous"],
  n: ["Cavalier", "Cavaliers"],
  p: ["Pion", "Pions"],
};
const PIECE_ORDER: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];

const COLOR_NAMES: Record<Color, string> = { w: "Blancs", b: "Noirs" };
const PHASE_NAMES: Record<Phase, string> = { opening: "ouverture", middlegame: "milieu de partie", endgame: "finale" };
const CLASSIFICATION_NAMES: Record<Classification, string> = {
  forced: "coup forcé",
  best: "meilleur coup",
  excellent: "excellent",
  good: "bon",
  inaccuracy: "imprécision",
  mistake: "erreur",
  blunder: "gaffe",
};
const THEME_NAMES: Record<Theme, string> = {
  tactics: "tactics (la variante punitive gagne du matériel ou mate)",
  hanging_piece: "hanging_piece (pièce laissée insuffisamment défendue et prise dans la variante)",
  missed_tactic: "missed_tactic (le meilleur coup gagnait du matériel ou matait)",
  king_safety: "king_safety (échecs répétés ou attaque contre le roque dans la variante)",
  development: "development (problème de développement en ouverture)",
  bad_exchange: "bad_exchange (échange au bilan matériel négatif)",
  endgame: "endgame (erreur de finale)",
  strategy: "strategy (perte sans gain matériel : erreur positionnelle)",
  calculation: "calculation (le meilleur coup demandait un calcul profond ou n'était pas évident)",
};

export type GameContext = {
  white: string;
  black: string;
  playerColor: Color;
  openingName: string | null;
  eco: string | null;
};

/** Pièces de chaque camp : « Roi : g1 ; Tours : a1, f1 ; … ». */
export function describePieces(fen: string): Record<Color, string> {
  const board = new Chess(fen).board();
  const squares: Record<Color, Record<PieceSymbol, string[]>> = {
    w: { k: [], q: [], r: [], b: [], n: [], p: [] },
    b: { k: [], q: [], r: [], b: [], n: [], p: [] },
  };
  for (const rank of board) {
    for (const piece of rank) {
      if (piece) squares[piece.color][piece.type].push(piece.square);
    }
  }
  const describe = (color: Color) =>
    PIECE_ORDER.filter((type) => squares[color][type].length > 0)
      .map((type) => {
        const list = squares[color][type].sort();
        const [singular, plural] = PIECE_NAMES[type];
        return `${list.length > 1 ? plural : singular} : ${list.join(", ")}`;
      })
      .join(" ; ");
  return { w: describe("w"), b: describe("b") };
}

function formatWin(value: number): string {
  return `${Math.round(value)} %`;
}

function describeLine(fen: string, line: ValidatedLine, color: Color): string {
  const evaluation = formatEvaluation(line.evaluation);
  const win = formatWin(moverWinPercent(line.evaluation, color));
  const moves = line.san.length > 0 ? formatSanLine(fen, line.san) : "(aucun coup)";
  return `${moves} — évaluation ${evaluation} (chances de gain du joueur : ${win})`;
}

function themesSection(themes: readonly Theme[]): string {
  if (themes.length === 0) return "Thèmes détectés : aucun.";
  const tactical = themes.filter((t) => TACTICAL_THEMES.includes(t));
  const strategic = themes.filter((t) => STRATEGIC_THEMES.includes(t));
  const other = themes.filter((t) => !TACTICAL_THEMES.includes(t) && !STRATEGIC_THEMES.includes(t));
  const lines = ["Thèmes détectés (règles déterministes) :"];
  if (tactical.length) lines.push(`- tactiques : ${tactical.map((t) => THEME_NAMES[t]).join(" ; ")}`);
  if (strategic.length) lines.push(`- stratégiques : ${strategic.map((t) => THEME_NAMES[t]).join(" ; ")}`);
  if (other.length) lines.push(`- autres : ${other.map((t) => THEME_NAMES[t]).join(" ; ")}`);
  return lines.join("\n");
}

/** Message utilisateur : uniquement les données Stockfish validées de ce coup (§7). */
export function buildUserMessage(move: MoveAnalysis, game: GameContext): string {
  const color = move.color;
  const playerName = color === "w" ? game.white : game.black;
  const pieces = describePieces(move.fenBefore);
  const opening = game.openingName ? `${game.openingName}${game.eco ? ` (${game.eco})` : ""}` : game.eco ?? "inconnue";
  const moveNumber = Math.ceil(move.ply / 2);
  const playedLabel = `${moveNumber}${color === "w" ? "." : "..."} ${move.san}`;
  const allowed = [...allowedMovesFor(move)];

  const candidates =
    move.candidates.length > 0
      ? move.candidates
          .slice(0, 3)
          .map((line, index) => `${index + 1}. ${describeLine(move.fenBefore, line, color)}`)
          .join("\n")
      : "(aucun candidat fourni)";

  const punish = move.punishLine
    ? describeLine(move.fenAfter, move.punishLine, color)
    : "(aucune variante fournie : la position après le coup est terminale ou la variante n'a pas pu être validée)";

  return [
    `Partie : ${game.white} (Blancs) contre ${game.black} (Noirs). Ouverture : ${opening}.`,
    `Joueur à conseiller : ${playerName}, qui joue les ${COLOR_NAMES[color]}.`,
    `Coup analysé : ${playedLabel} (demi-coup ${move.ply}), phase : ${PHASE_NAMES[move.phase]}.`,
    "",
    `FEN avant le coup : ${move.fenBefore}`,
    `Pièces des Blancs : ${pieces.w}`,
    `Pièces des Noirs : ${pieces.b}`,
    "",
    `Coup joué : ${move.san} — classification : ${CLASSIFICATION_NAMES[move.classification]}${move.missedWin ? ", gain manqué" : ""}${move.missedSave ? ", sauvetage manqué" : ""}.`,
    `Meilleur coup selon Stockfish : ${move.bestSan ?? "(non fourni)"}`,
    // sideToMove ne sert qu'aux positions matées (mate: 0) : le joueur est au trait avant, l'adversaire après.
    `Évaluation avant le coup (avec le meilleur coup) : ${formatEvaluation(move.evalBefore, color)} (chances de gain du joueur : ${formatWin(move.winBefore)})`,
    `Évaluation après le coup joué : ${formatEvaluation(move.evalAfter, color === "w" ? "b" : "w")} (chances de gain du joueur : ${formatWin(move.winAfter)})`,
    `Perte : ${move.loss.toFixed(1)} points de pourcentage de gain.`,
    "",
    "Coups candidats de Stockfish dans la position avant le coup (variantes validées) :",
    candidates,
    "",
    "Meilleure réponse de l'adversaire après le coup joué (variante punitive) :",
    punish,
    "",
    themesSection(move.themes),
    "",
    `Coups autorisés (les seuls que tu peux citer) : ${allowed.join(", ")}`,
  ].join("\n");
}

/** Rappel ajouté lors de la nouvelle tentative, quand la réponse citait des coups non fournis. */
export function buildRetryReminder(invalid: readonly string[], allowed: Iterable<string>): string {
  const cited = invalid.length > 0 ? `Ta réponse précédente citait des coups absents des données : ${invalid.join(", ")}. ` : "";
  return [
    "",
    `RAPPEL IMPORTANT : ${cited}Rédige une nouvelle explication en ne citant QUE ces coups, en SAN anglais : ${[...allowed].join(", ")}.`,
    "Pour une case, écris « la case e4 » ; pour une pièce, son nom en toutes lettres. Si cela ne suffit pas pour expliquer, dis-le et mets confidence à \"low\".",
  ].join("\n");
}
