// Conversion d'une partie Chess.com en ligne de la table `games`.

import { Chess } from "chess.js";
import type { ChesscomGame } from "@/lib/chesscom/schemas";
import type { TablesInsert } from "@/lib/db/database.types";
import type { Color } from "@/lib/analysis/types";
import { headerValue, parsePgnHeaders } from "./headers";
import { openingFromEcoUrl } from "./opening";

export type PlayerResult = "win" | "loss" | "draw";

/** Ligne prête à insérer ; `user_id` est ajouté par l'appelant. */
export type GameRow = Omit<TablesInsert<"games">, "user_id" | "id" | "imported_at"> & {
  player_color: Color;
  result: PlayerResult;
};

export type SkipReason = "variant" | "missing_pgn" | "not_player" | "invalid_pgn";

export type ConversionResult = { ok: true; row: GameRow } | { ok: false; reason: SkipReason };

// Codes de résultat Chess.com qui signifient une nulle (les deux camps ont le même code).
const DRAW_CODES = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

/** Résultat du point de vue du joueur à partir de son code Chess.com. */
export function resultFromCode(code: string): PlayerResult {
  if (code === "win") return "win";
  if (DRAW_CODES.has(code)) return "draw";
  return "loss";
}

/**
 * Comment la partie s'est terminée (code Chess.com) : le code du perdant en cas de gain/perte
 * (« checkmated », « resigned », « timeout »…), le code commun en cas de nulle.
 */
export function resultDetail(playerCode: string, opponentCode: string, result: PlayerResult): string {
  return result === "win" ? opponentCode : playerCode;
}

/** Couleur du joueur, ou null s'il n'a pas joué cette partie (comparaison insensible à la casse). */
export function playerColor(game: Pick<ChesscomGame, "white" | "black">, username: string): Color | null {
  const user = username.trim().toLowerCase();
  if (game.white.username.toLowerCase() === user) return "w";
  if (game.black.username.toLowerCase() === user) return "b";
  return null;
}

/** Nombre de demi-coups, en rejouant la partie avec chess.js (valide aussi la légalité). */
export function countPlies(pgn: string): number {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history().length;
}

export function gameKey(game: Pick<ChesscomGame, "uuid" | "url">): string {
  return game.uuid ?? game.url;
}

export function chesscomGameToRow(game: ChesscomGame, username: string): ConversionResult {
  // Variantes (chess960, bughouse, crazyhouse…) : hors du périmètre de l'analyse Stockfish.
  if (game.rules !== "chess") return { ok: false, reason: "variant" };

  const pgn = game.pgn?.trim();
  if (!pgn) return { ok: false, reason: "missing_pgn" };

  const color = playerColor(game, username);
  if (!color) return { ok: false, reason: "not_player" };

  let plyCount: number;
  try {
    plyCount = countPlies(pgn);
  } catch {
    return { ok: false, reason: "invalid_pgn" };
  }

  const headers = parsePgnHeaders(pgn);
  const me = color === "w" ? game.white : game.black;
  const opponent = color === "w" ? game.black : game.white;
  const result = resultFromCode(me.result);
  const opening = openingFromEcoUrl(headerValue(headers, "ECOUrl") ?? game.eco);

  return {
    ok: true,
    row: {
      chesscom_uuid: gameKey(game),
      chesscom_url: game.url,
      pgn,
      white: game.white.username,
      black: game.black.username,
      white_rating: game.white.rating ?? null,
      black_rating: game.black.rating ?? null,
      player_color: color,
      result,
      result_detail: resultDetail(me.result, opponent.result, result),
      time_class: game.time_class ?? null,
      time_control: game.time_control ?? headerValue(headers, "TimeControl"),
      rules: game.rules,
      rated: game.rated ?? null,
      eco: headerValue(headers, "ECO"),
      opening_name: opening?.name ?? null,
      end_time: new Date(game.end_time * 1000).toISOString(),
      ply_count: plyCount,
    },
  };
}
