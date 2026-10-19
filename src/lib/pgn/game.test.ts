import { describe, expect, it } from "vitest";
import { chesscomGameToRow, countPlies, playerColor, resultDetail, resultFromCode } from "./game";
import { headerValue, parsePgnHeaders } from "./headers";
import { DRAW_BY_AGREEMENT, LOSS_AS_BLACK_ON_TIME, WIN_AS_WHITE_BY_MATE } from "./test-fixtures";

describe("parsePgnHeaders", () => {
  it("lit les en-têtes Chess.com", () => {
    const headers = parsePgnHeaders(WIN_AS_WHITE_BY_MATE.pgn!);
    expect(headers.ECO).toBe("C41");
    expect(headers.TimeControl).toBe("180");
    expect(headers.Termination).toBe("Leny_l won by checkmate");
    expect(headers.Result).toBe("1-0");
    expect(headerValue(headers, "Round")).toBeNull();
  });

  it("gère les guillemets échappés", () => {
    expect(parsePgnHeaders('[Event "Tournoi \\"open\\""]\n\n1. e4 *').Event).toBe('Tournoi "open"');
  });
});

describe("résultat et couleur", () => {
  it("convertit les codes Chess.com", () => {
    expect(resultFromCode("win")).toBe("win");
    for (const code of ["checkmated", "resigned", "timeout", "abandoned", "lose"]) expect(resultFromCode(code)).toBe("loss");
    for (const code of ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]) {
      expect(resultFromCode(code)).toBe("draw");
    }
  });

  it("décrit la fin de partie avec le code du perdant", () => {
    expect(resultDetail("win", "checkmated", "win")).toBe("checkmated");
    expect(resultDetail("timeout", "win", "loss")).toBe("timeout");
    expect(resultDetail("repetition", "repetition", "draw")).toBe("repetition");
  });

  it("trouve la couleur sans tenir compte de la casse", () => {
    expect(playerColor(WIN_AS_WHITE_BY_MATE, "leny_l")).toBe("w");
    expect(playerColor(LOSS_AS_BLACK_ON_TIME, "LENY_L")).toBe("b");
    expect(playerColor(LOSS_AS_BLACK_ON_TIME, "quelqu-un")).toBeNull();
  });
});

describe("countPlies", () => {
  it("rejoue la partie avec chess.js malgré les commentaires d'horloge", () => {
    expect(countPlies(WIN_AS_WHITE_BY_MATE.pgn!)).toBe(25);
    expect(countPlies(LOSS_AS_BLACK_ON_TIME.pgn!)).toBe(23);
    expect(countPlies(DRAW_BY_AGREEMENT.pgn!)).toBe(24);
  });

  it("rejette un coup illégal", () => {
    expect(() => countPlies('[Event "x"]\n\n1. e4 e5 2. Ke3 Nf6 3. Kxe5 *')).toThrow();
  });
});

describe("chesscomGameToRow", () => {
  it("convertit un gain avec les Blancs", () => {
    const result = chesscomGameToRow(WIN_AS_WHITE_BY_MATE, "Leny_l");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({
      chesscom_uuid: "09b6ddcf-d6d6-11f0-ad0f-9ad39701000f",
      chesscom_url: "https://www.chess.com/game/live/146601720196",
      white: "Leny_l",
      black: "CallMeKnox",
      white_rating: 109,
      black_rating: 100,
      player_color: "w",
      result: "win",
      result_detail: "checkmated",
      time_class: "blitz",
      time_control: "180",
      rules: "chess",
      rated: true,
      eco: "C41",
      opening_name: "Philidor Defense",
      end_time: "2025-12-11T21:14:38.000Z",
      ply_count: 25,
    });
  });

  it("convertit une perte au temps avec les Noirs", () => {
    const result = chesscomGameToRow(LOSS_AS_BLACK_ON_TIME, "leny_l");
    expect(result.ok && result.row).toMatchObject({
      player_color: "b",
      result: "loss",
      result_detail: "timeout",
      opening_name: "Caro-Kann Defense",
    });
  });

  it("convertit une nulle et retire les coups du nom d'ouverture", () => {
    const result = chesscomGameToRow(DRAW_BY_AGREEMENT, "Leny_l");
    expect(result.ok && result.row).toMatchObject({
      result: "draw",
      result_detail: "agreed",
      eco: "C55",
      opening_name: "Italian Game Two Knights Modern Bishop's Opening",
      time_control: "900+10",
    });
  });

  it("ignore les variantes, les parties sans PGN et les PGN illisibles", () => {
    expect(chesscomGameToRow({ ...WIN_AS_WHITE_BY_MATE, rules: "chess960" }, "Leny_l")).toEqual({ ok: false, reason: "variant" });
    expect(chesscomGameToRow({ ...WIN_AS_WHITE_BY_MATE, pgn: undefined }, "Leny_l")).toEqual({ ok: false, reason: "missing_pgn" });
    expect(chesscomGameToRow({ ...WIN_AS_WHITE_BY_MATE, pgn: "  " }, "Leny_l")).toEqual({ ok: false, reason: "missing_pgn" });
    expect(chesscomGameToRow({ ...WIN_AS_WHITE_BY_MATE, pgn: "1. e4 e5 2. Ke3 Nf6 3. Kxe5 *" }, "Leny_l")).toEqual({
      ok: false,
      reason: "invalid_pgn",
    });
    expect(chesscomGameToRow(WIN_AS_WHITE_BY_MATE, "autre_joueur")).toEqual({ ok: false, reason: "not_player" });
  });

  it("utilise l'URL comme identifiant si l'uuid manque", () => {
    const result = chesscomGameToRow({ ...WIN_AS_WHITE_BY_MATE, uuid: undefined }, "Leny_l");
    expect(result.ok && result.row.chesscom_uuid).toBe("https://www.chess.com/game/live/146601720196");
  });
});
