import { describe, expect, it } from "vitest";
import { EXPLORER_PARAMS, ExplorerError, fetchExplorer, isExplorerResult } from "./explorer";

const BODY = {
  white: 60,
  draws: 10,
  black: 30,
  moves: [{ uci: "g1f3", san: "Nf3", white: 30, draws: 5, black: 15 }],
};

function fakeFetch(status: number, body: unknown = BODY) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("fetchExplorer", () => {
  it("construit l'URL et l'en-tête d'autorisation", async () => {
    const { impl, calls } = fakeFetch(200);
    await fetchExplorer("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -", "t0k", impl);
    expect(calls[0].url).toContain("explorer.lichess.org/lichess");
    expect(calls[0].url).toContain("fen=" + encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"));
    expect(calls[0].url).toContain(EXPLORER_PARAMS);
    expect(EXPLORER_PARAMS).toBe("ratings=1000,1200,1400,1600&speeds=blitz,rapid");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer t0k");
  });

  it("calcule total, parties et parts", async () => {
    const { impl } = fakeFetch(200);
    expect(await fetchExplorer("x", "t0k", impl)).toEqual({
      total: 100,
      moves: [{ uci: "g1f3", san: "Nf3", games: 50, share: 0.5 }],
    });
  });

  it("part nulle quand le total est nul", async () => {
    const { impl } = fakeFetch(200, { white: 0, draws: 0, black: 0, moves: [{ uci: "a2a3", san: "a3", white: 0, draws: 0, black: 0 }] });
    expect((await fetchExplorer("x", "t", impl)).moves[0].share).toBe(0);
  });

  it("429 -> rate_limited, 401 -> unauthorized, 500 -> unavailable", async () => {
    for (const [status, code] of [[429, "rate_limited"], [401, "unauthorized"], [500, "unavailable"]] as const) {
      const err = await fetchExplorer("x", "t", fakeFetch(status).impl).catch((e) => e);
      expect(err).toBeInstanceOf(ExplorerError);
      expect(err.code).toBe(code);
    }
  });

  it("erreur réseau -> unavailable, sans jeton dans le message", async () => {
    const impl = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const err = await fetchExplorer("x", "SECRET", impl).catch((e) => e);
    expect(err.code).toBe("unavailable");
    expect(err.message).not.toContain("SECRET");
  });

  it("ignore les coups sans uci/san, rejette un corps sans moves", async () => {
    const ok = fakeFetch(200, { white: 1, draws: 0, black: 0, moves: [{ san: "x", white: 1 }, { uci: "e2e4", san: "e4", white: 1, draws: 0, black: 0 }] });
    expect((await fetchExplorer("x", "t", ok.impl)).moves.map((m) => m.uci)).toEqual(["e2e4"]);
    const err = await fetchExplorer("x", "t", fakeFetch(200, { white: 1 }).impl).catch((e) => e);
    expect(err.code).toBe("unavailable");
  });
});

describe("isExplorerResult", () => {
  it("accepte une forme valide, refuse le reste", () => {
    expect(isExplorerResult({ total: 0, moves: [] })).toBe(true);
    expect(isExplorerResult({ total: "1", moves: [] })).toBe(false);
    expect(isExplorerResult({ total: 1, moves: [{ uci: "a", san: "b", games: 1 }] })).toBe(false);
    expect(isExplorerResult(null)).toBe(false);
  });
});
