import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { openingPositions } from "./positions";
import { indexGames, type IndexSupabase } from "./index-games";
import { toEpd } from "@/lib/openings/identify";

/** Partie de `plies` demi-coups : les cavaliers font des allers-retours. */
function shuffleGame(plies: number): string {
  const cycle = ["Nf3", "Nf6", "Ng1", "Ng8"];
  const chess = new Chess();
  for (let i = 0; i < plies; i++) chess.move(cycle[i % 4]);
  return chess.pgn();
}

describe("openingPositions", () => {
  const rows = openingPositions("1. e4 c6 2. Nc3 d5 3. Nf3 *");

  it("renvoie une ligne par demi-coup joué", () => {
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ ply: 0, sideToMove: "w", pathUci: "", moveUci: "e2e4", moveSan: "e4" });
    expect(rows[4]).toMatchObject({ ply: 4, pathUci: "e2e4 c7c6 b1c3 d7d5", moveUci: "g1f3" });
  });

  it("donne l'EPD de la position avant le coup (4 champs)", () => {
    const chess = new Chess();
    expect(rows[0].epd).toBe(toEpd(chess.fen()));
    expect(rows[0].epd.split(" ")).toHaveLength(4);
    chess.move("e4");
    expect(rows[1].epd).toBe(toEpd(chess.fen()));
    expect(rows[1].sideToMove).toBe("b");
  });

  it("s'arrête à 30 demi-coups", () => {
    const long = openingPositions(shuffleGame(80));
    expect(long).toHaveLength(30);
    expect(long.map((r) => r.ply)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it("renvoie [] pour un PGN illégal", () => {
    expect(openingPositions("1. e4 e5 2. Ke3?? *")).toEqual([]);
  });
});

/** Faux client Supabase qui enregistre ce que `indexGames` écrit. */
function fakeSupabase(options: { upsertError?: string } = {}) {
  const upserted: Record<string, unknown>[] = [];
  const indexedIds: string[] = [];
  const client = {
    from(table: string) {
      if (table === "game_positions") {
        return {
          upsert: async (rows: Record<string, unknown>[]) => {
            if (options.upsertError) return { error: { message: options.upsertError } };
            upserted.push(...rows);
            return { error: null };
          },
        };
      }
      return {
        update: (values: { positions_indexed: boolean }) => ({
          in: async (_column: string, ids: string[]) => {
            if (values.positions_indexed) indexedIds.push(...ids);
            return { error: null };
          },
        }),
      };
    },
  } as unknown as IndexSupabase;
  return { client, upserted, indexedIds };
}

describe("indexGames", () => {
  it("marque indexée une partie au PGN invalide, sans position, pour que le rattrapage ne boucle pas", async () => {
    const { client, upserted, indexedIds } = fakeSupabase();
    const count = await indexGames(client, [{ id: "bad", pgn: "1. e4 e5 2. Ke3?? *" }]);
    expect(upserted).toEqual([]);
    expect(indexedIds).toEqual(["bad"]);
    expect(count).toBe(1);
  });

  it("marque indexée une partie de moins de 30 demi-coups avec les positions disponibles", async () => {
    const { client, upserted, indexedIds } = fakeSupabase();
    await indexGames(client, [
      { id: "short", pgn: "1. e4 c6 2. Nc3 *" },
      { id: "empty", pgn: "" },
    ]);
    expect(upserted).toHaveLength(3);
    expect(upserted.every((r) => r.game_id === "short")).toBe(true);
    expect(upserted[2]).toMatchObject({ ply: 2, move_uci: "b1c3", move_san: "Nc3", side_to_move: "w" });
    expect(indexedIds).toEqual(["short", "empty"]);
  });

  it("ne marque rien si l'écriture des positions échoue (le rattrapage réessaiera)", async () => {
    const { client, indexedIds } = fakeSupabase({ upsertError: "boom" });
    await expect(indexGames(client, [{ id: "g", pgn: "1. e4 c6 *" }])).rejects.toThrow("boom");
    expect(indexedIds).toEqual([]);
  });
});
