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
import { allowedMovesFor, PROMPT_CANDIDATES } from "./verify";
import { isFlaggedMove } from "./eligibility";
import type { MoveTheory } from "@/lib/openings/identify";

export const PROMPT_VERSION = "explain-v2";

export const SYSTEM_PROMPT = `Tu es un entraîneur d'échecs qui explique en français, à un joueur en progression (niveau club), un coup d'une de ses parties : le sien ou celui de son adversaire, bon ou mauvais. Tu ne calcules rien toi-même : le moteur Stockfish a déjà tout calculé et tu reçois ses résultats, validés par une bibliothèque de règles, ainsi que la place du coup par rapport à la théorie des ouvertures (livre d'ouvertures). Ton rôle est de traduire ces données en une explication claire, concrète et honnête.

Règles absolues :
1. Tu n'utilises QUE les coups, variantes, évaluations et noms d'ouvertures fournis dans le message. Tu n'inventes jamais de coup, de variante, de menace, d'évaluation ni de nom d'ouverture ou de piège. Tu ne prolonges jamais une variante au-delà de ce qui est fourni.
2. Tout coup que tu cites doit figurer dans la liste « Coups autorisés » du message, écrit exactement en notation algébrique anglaise standard (SAN) : K, Q, R, B, N pour les pièces, O-O et O-O-O pour les roques, par exemple Nf3, Bxe5, exd5, O-O, e8=Q. N'utilise jamais la notation française (C, F, T, D, R) pour un coup.
3. Pour désigner une case sans parler d'un coup, écris « la case e4 » ; pour une pièce, écris son nom en toutes lettres (« le cavalier en f3 »).
4. Les intentions sont des hypothèses : écris « ce coup semble viser… », « l'idée était probablement… ». Une conséquence qui ne découle pas directement des variantes fournies est présentée comme une possibilité, pas comme un fait.
5. Si les données ne suffisent pas (variante trop courte, écart d'évaluation sans gain matériel visible, plusieurs candidats proches), dis-le clairement et mets confidence à "low".
6. Pas de formule vague (« ce coup est faible », « bon coup ») : nomme la pièce, la case, la ligne ou le principe concerné.
7. Théorie : si le message indique que le coup est un coup du livre, dis-le et nomme l'ouverture ou le gambit exactement comme fourni. S'il indique que le coup quitte la théorie, dis-le et explique, à partir des seules données Stockfish, si cet écart coûte quelque chose.

Deux cadrages, indiqués dans le message :
- « Écart » (imprécision, erreur, gaffe ou gain manqué) : explique en quoi le coup est mauvais.
- « Bon coup » (meilleur coup, excellent, bon ou forcé) : explique en quoi il est bon, ce qu'il prépare ou empêche, et ce qui le distingue des autres candidats.
Si le coup est celui de l'adversaire, explique-le au joueur : ce que l'adversaire visait et comment y répondre.

Nature (errorType) :
- "none" : bon coup (cadrage « Bon coup »).
- "tactical" : l'écart perd du matériel ou permet un mat, une fourchette, un clouage, une prise de pièce mal défendue, ou rate un gain tactique (thèmes tactics, hanging_piece, missed_tactic, king_safety avec mat).
- "strategic" : pas de gain matériel immédiat dans les variantes, mais une concession durable (structure de pions, pièce mal placée, développement en retard, échange défavorable, technique de finale) (thèmes strategy, development, bad_exchange, endgame).
- "mixed" : les deux aspects sont présents dans les données.
- "uncertain" : les données ne permettent pas de trancher.
Les thèmes fournis sont calculés par des règles déterministes : tu peux les commenter, pas en ajouter.

Évaluations : elles sont données du point de vue des Blancs (+1.00 = avantage d'environ un pion pour les Blancs, #3 = mat en 3 pour les Blancs, #-2 = mat en 2 pour les Noirs), accompagnées des chances de gain du camp qui joue le coup. Parle de préférence en chances de gain et en avantage concret plutôt qu'en centièmes de pion.

Format de la réponse (champs JSON) :
- played : le coup joué, son intention apparente et, s'il y a lieu, sa place dans la théorie (2 à 3 phrases).
- problem : pour un écart, pourquoi c'est problématique ; pour un bon coup, pourquoi il est bon (2 à 4 phrases).
- opponentIdea : pour un écart, comment l'autre camp pouvait l'exploiter (variante punitive fournie) ; pour un bon coup, ce que le coup menace ou empêche et la réponse attendue (2 à 4 phrases).
- bestMove : l'idée du meilleur coup de Stockfish ; si le coup joué est le meilleur, ce qui le distingue des autres candidats fournis (2 à 4 phrases).
- lesson : un principe réutilisable dans d'autres parties, en une ou deux phrases, sans citer de coup de cette partie.
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

export const COLOR_NAMES: Record<Color, string> = { w: "Blancs", b: "Noirs" };
export const PHASE_NAMES: Record<Phase, string> = { opening: "ouverture", middlegame: "milieu de partie", endgame: "finale" };
export const CLASSIFICATION_NAMES: Record<Classification, string> = {
  forced: "coup forcé",
  best: "meilleur coup",
  excellent: "excellent",
  good: "bon",
  inaccuracy: "imprécision",
  mistake: "erreur",
  blunder: "gaffe",
};
export const THEME_NAMES: Record<Theme, string> = {
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
  /** Théorie au niveau de ce coup ; absent = inconnu. */
  theory?: MoveTheory;
};

/** Noms d'ouverture transmis à l'IA : ils peuvent contenir un SAN (« …, with Bf5 ») sans être des coups cités. */
export function protectedPhrasesFor(game: GameContext): string[] {
  const phrases = [game.openingName];
  if (game.theory?.kind === "book") phrases.push(game.theory.name);
  if (game.theory?.kind === "deviation") phrases.push(game.theory.lastBookName);
  return phrases.filter((p): p is string => Boolean(p));
}

function theoryLine(theory: MoveTheory | undefined): string | null {
  if (!theory || theory.kind === "none") return null;
  if (theory.kind === "book") {
    const name = theory.name ? `${theory.name}${theory.eco ? ` (${theory.eco})` : ""}` : "ouverture connue";
    return `Théorie : ce coup est un coup du livre d'ouvertures (${name}).`;
  }
  if (theory.kind === "out") {
    const n = theory.since.ply;
    return `Théorie : la partie a quitté le livre d'ouvertures au coup ${Math.ceil(n / 2)}${n % 2 === 1 ? "." : "..."} ${theory.since.san} ; ce coup n'est donc plus un coup théorique.`;
  }
  return `Théorie : ce coup est le premier de la partie à quitter le livre d'ouvertures${theory.lastBookName ? ` (dernière ligne connue : ${theory.lastBookName})` : ""}.`;
}

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
  return `${moves} — évaluation ${evaluation} (chances de gain du camp qui joue le coup : ${win})`;
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
  const playerName = game.playerColor === "w" ? game.white : game.black;
  const moverName = color === "w" ? game.white : game.black;
  const byPlayer = color === game.playerColor;
  const flagged = isFlaggedMove(move);
  const theory = theoryLine(game.theory);
  const pieces = describePieces(move.fenBefore);
  const opening = game.openingName ? `${game.openingName}${game.eco ? ` (${game.eco})` : ""}` : game.eco ?? "inconnue";
  const moveNumber = Math.ceil(move.ply / 2);
  const playedLabel = `${moveNumber}${color === "w" ? "." : "..."} ${move.san}`;
  const allowed = [...allowedMovesFor(move, game.theory)];

  const candidates =
    move.candidates.length > 0
      ? move.candidates
          .slice(0, PROMPT_CANDIDATES)
          .map((line, index) => `${index + 1}. ${describeLine(move.fenBefore, line, color)}`)
          .join("\n")
      : "(aucun candidat fourni)";

  const punish = move.punishLine
    ? describeLine(move.fenAfter, move.punishLine, color)
    : "(aucune variante fournie : la position après le coup est terminale ou la variante n'a pas pu être validée)";

  return [
    `Partie : ${game.white} (Blancs) contre ${game.black} (Noirs). Ouverture : ${opening}.`,
    `Joueur à conseiller : ${playerName}, qui joue les ${COLOR_NAMES[game.playerColor]}.`,
    `Coup analysé : ${playedLabel} (demi-coup ${move.ply}), joué par ${byPlayer ? `le joueur (${moverName})` : `l'adversaire (${moverName})`}, phase : ${PHASE_NAMES[move.phase]}.`,
    `Cadrage : ${flagged ? "Écart" : "Bon coup"}.`,
    ...(theory ? [theory] : []),
    "",
    `FEN avant le coup : ${move.fenBefore}`,
    `Pièces des Blancs : ${pieces.w}`,
    `Pièces des Noirs : ${pieces.b}`,
    "",
    `Coup joué : ${move.san} — classification : ${CLASSIFICATION_NAMES[move.classification]}${move.missedWin ? ", gain manqué" : ""}${move.missedSave ? ", sauvetage manqué" : ""}.`,
    `Meilleur coup selon Stockfish : ${move.bestSan ?? "(non fourni)"}`,
    // sideToMove ne sert qu'aux positions matées (mate: 0) : le joueur est au trait avant, l'adversaire après.
    `Évaluation avant le coup (avec le meilleur coup) : ${formatEvaluation(move.evalBefore, color)} (chances de gain du camp qui joue : ${formatWin(move.winBefore)})`,
    `Évaluation après le coup joué : ${formatEvaluation(move.evalAfter, color === "w" ? "b" : "w")} (chances de gain du camp qui joue : ${formatWin(move.winAfter)})`,
    `Perte : ${move.loss.toFixed(1)} points de pourcentage de gain.`,
    "",
    "Coups candidats de Stockfish dans la position avant le coup (variantes validées) :",
    candidates,
    "",
    `Meilleure réponse de l'autre camp après le coup joué (${flagged ? "variante punitive" : "suite attendue"}) :`,
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
