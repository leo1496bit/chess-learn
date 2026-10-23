import { describe, expect, it, vi } from "vitest";
import { createChesscomClient } from "./client";
import { checkChesscomAccount } from "./verify";

function clientWith(response: Response | Error) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) throw response;
    return response.clone();
  });
  const client = createChesscomClient({ fetch: fetchMock, sleep: async () => {}, maxRetries: 0 });
  return { client, fetchMock };
}

describe("checkChesscomAccount", () => {
  it("accepte un compte existant", async () => {
    const { client, fetchMock } = clientWith(Response.json({ player_id: 1, username: "leny_l" }));
    expect(await checkChesscomAccount(client, "Leny_l")).toEqual({ status: "ok" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.chess.com/pub/player/leny_l");
  });

  it("signale un compte introuvable", async () => {
    const { client } = clientWith(new Response(null, { status: 404 }));
    expect(await checkChesscomAccount(client, " inconnu_123 ")).toEqual({
      status: "not_found",
      message: "Aucun compte Chess.com « inconnu_123 ». Vérifie l'orthographe.",
    });
  });

  it("distingue Chess.com injoignable d'un compte introuvable", async () => {
    const { client } = clientWith(new TypeError("fetch failed"));
    expect(await checkChesscomAccount(client, "Leny_l")).toMatchObject({ status: "unavailable" });

    const down = clientWith(new Response(null, { status: 503 }));
    expect(await checkChesscomAccount(down.client, "Leny_l")).toMatchObject({ status: "unavailable" });
  });
});
