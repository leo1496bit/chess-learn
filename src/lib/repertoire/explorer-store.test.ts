import { describe, expect, it, vi } from "vitest";
import { EXPLORER_PARAMS } from "@/lib/lichess/explorer";
import { EXPLORER_TTL_DAYS } from "./constants";
import { getExplorer } from "./explorer-store";
import type { SupabaseServerClient } from "@/lib/db/server";

const NOW = new Date("2026-10-20T12:00:00Z");
const BODY = { white: 60, draws: 10, black: 30, moves: [{ uci: "g1f3", san: "Nf3", white: 30, draws: 5, black: 15 }] };
const RESULT = { total: 100, moves: [{ uci: "g1f3", san: "Nf3", games: 50, share: 0.5 }] };

function fakeSupabase(row: { data: unknown; fetched_at: string } | null, errs: { read?: string; write?: string } = {}) {
  const upserts: unknown[] = [];
  const selects: Record<string, string>[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("explorer_cache");
      return {
        select() {
          const filters: Record<string, string> = {};
          const q = {
            eq(k: string, v: string) {
              filters[k] = v;
              return q;
            },
            async maybeSingle() {
              selects.push(filters);
              return { data: row, error: errs.read ? { message: errs.read } : null };
            },
          };
          return q;
        },
        async upsert(v: unknown) {
          upserts.push(v);
          return { error: errs.write ? { message: errs.write } : null };
        },
      };
    },
  } as unknown as SupabaseServerClient;
  return { client, upserts, selects };
}

function fakeFetch(status: number) {
  let n = 0;
  const impl = (async () => {
    n++;
    return new Response(JSON.stringify(BODY), { status });
  }) as unknown as typeof fetch;
  return { impl, count: () => n };
}

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("getExplorer", () => {
  it("renvoie le cache frais sans appel ni budget", async () => {
    const db = fakeSupabase({ data: RESULT, fetched_at: daysAgo(EXPLORER_TTL_DAYS - 1) });
    const f = fakeFetch(200);
    const budget = { left: 3 };
    const r = await getExplorer(db.client, "epd1", { token: "t", budget, now: NOW, fetchImpl: f.impl });
    expect(r).toEqual(RESULT);
    expect(f.count()).toBe(0);
    expect(budget.left).toBe(3);
    expect(db.selects[0]).toEqual({ epd: "epd1", params: EXPLORER_PARAMS });
  });

  it("cache périmé : appelle l'API, décrémente et écrit", async () => {
    const db = fakeSupabase({ data: { total: 1, moves: [] }, fetched_at: daysAgo(EXPLORER_TTL_DAYS + 1) });
    const f = fakeFetch(200);
    const budget = { left: 2 };
    const r = await getExplorer(db.client, "epd1", { token: "t", budget, now: NOW, fetchImpl: f.impl });
    expect(r).toEqual(RESULT);
    expect(budget.left).toBe(1);
    expect(db.upserts).toEqual([{ epd: "epd1", params: EXPLORER_PARAMS, data: RESULT, fetched_at: NOW.toISOString() }]);
  });

  it("budget épuisé : missing, aucun appel", async () => {
    const db = fakeSupabase(null);
    const f = fakeFetch(200);
    expect(await getExplorer(db.client, "e", { token: "t", budget: { left: 0 }, now: NOW, fetchImpl: f.impl })).toBe("missing");
    expect(f.count()).toBe(0);
  });

  it("sans jeton et sans cache : unavailable, aucun appel", async () => {
    const db = fakeSupabase(null);
    const f = fakeFetch(200);
    expect(await getExplorer(db.client, "e", { budget: { left: 5 }, now: NOW, fetchImpl: f.impl })).toBe("unavailable");
    expect(f.count()).toBe(0);
  });

  it("429 : rate_limited (distinct du budget épuisé), rien d'écrit", async () => {
    const db = fakeSupabase(null);
    const r = await getExplorer(db.client, "e", { token: "t", budget: { left: 5 }, now: NOW, fetchImpl: fakeFetch(429).impl });
    expect(r).toBe("rate_limited");
    expect(db.upserts).toEqual([]);
  });

  it("401 : unauthorized, 5xx : unavailable, rien d'écrit", async () => {
    for (const [status, expected] of [[401, "unauthorized"], [503, "unavailable"]] as const) {
      const db = fakeSupabase(null);
      const r = await getExplorer(db.client, "e", { token: "t", budget: { left: 5 }, now: NOW, fetchImpl: fakeFetch(status).impl });
      expect(r).toBe(expected);
      expect(db.upserts).toEqual([]);
    }
  });

  it("cache malformé : traité comme absent, rechargé", async () => {
    for (const bad of [{ total: 1 }, { total: 1, moves: [{ uci: "a" }] }, "x", null]) {
      const db = fakeSupabase({ data: bad, fetched_at: daysAgo(1) });
      const f = fakeFetch(200);
      const r = await getExplorer(db.client, "e", { token: "t", budget: { left: 1 }, now: NOW, fetchImpl: f.impl });
      expect(r).toEqual(RESULT);
      expect(f.count()).toBe(1);
    }
  });

  it("échec de lecture ou d'écriture du cache : avertit sans jeton, continue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeSupabase(null, { read: "lecture KO", write: "écriture KO" });
    const r = await getExplorer(db.client, "e", { token: "SECRET", budget: { left: 1 }, now: NOW, fetchImpl: fakeFetch(200).impl });
    expect(r).toEqual(RESULT);
    const msgs = warn.mock.calls.flat().join(" ");
    expect(msgs).toContain("lecture KO");
    expect(msgs).toContain("écriture KO");
    expect(msgs).not.toContain("SECRET");
    warn.mockRestore();
  });

  it("erreur réseau : unavailable", async () => {
    const db = fakeSupabase(null);
    const impl = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await getExplorer(db.client, "e", { token: "t", budget: { left: 5 }, now: NOW, fetchImpl: impl })).toBe("unavailable");
  });
});
