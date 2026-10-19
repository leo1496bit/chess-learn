import { describe, expect, it, vi } from "vitest";
import { ChesscomError, createChesscomClient, normalizeUsername, parseRetryAfter } from "./client";
import { LOSS_AS_BLACK_ON_TIME, WIN_AS_WHITE_BY_MATE } from "@/lib/pgn/test-fixtures";

const ARCHIVE = "https://api.chess.com/pub/player/leny_l/games/2026/10";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function setup(responses: (Response | Error)[]) {
  const queue = [...responses];
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Aucune réponse prévue");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(async () => {});
  const client = createChesscomClient({ fetch: fetchMock, sleep, baseDelayMs: 100 });
  const headersOf = (call: number) => new Headers(fetchMock.mock.calls[call][1]?.headers);
  return { client, fetchMock, sleep, headersOf };
}

describe("parseRetryAfter", () => {
  it("lit les secondes et les dates HTTP", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    const now = Date.parse("2026-10-20T10:00:00Z");
    expect(parseRetryAfter("Tue, 20 Oct 2026 10:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("bientôt")).toBeNull();
  });
});

describe("normalizeUsername", () => {
  it("met l'identifiant en minuscules (forme canonique de l'API)", () => {
    expect(normalizeUsername(" Leny_l ")).toBe("leny_l");
    expect(() => normalizeUsername("../admin")).toThrow(ChesscomError);
  });
});

describe("client Chess.com", () => {
  it("envoie un User-Agent et lit le profil", async () => {
    const { client, fetchMock, headersOf } = setup([json({ player_id: 473490558, username: "leny_l", status: "basic" })]);
    const profile = await client.getProfile("Leny_l");
    expect(profile.username).toBe("leny_l");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.chess.com/pub/player/leny_l");
    expect(headersOf(0).get("user-agent")).toMatch(/chess-learn/);
  });

  it("filtre les URLs d'archives inattendues", async () => {
    const { client } = setup([json({ archives: [ARCHIVE, "https://evil.example/games/2026/10"] })]);
    expect(await client.getArchiveList("Leny_l")).toEqual([ARCHIVE]);
  });

  it("respecte Retry-After sur un 429 puis réussit", async () => {
    const { client, fetchMock, sleep } = setup([
      new Response("Too many requests", { status: 429, headers: { "retry-after": "2" } }),
      json({ games: [WIN_AS_WHITE_BY_MATE] }, { headers: { etag: 'W/"abc"' } }),
    ]);
    const result = await client.getMonthlyArchive(ARCHIVE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
    expect(result).toMatchObject({ status: "ok", etag: 'W/"abc"', invalidCount: 0 });
  });

  it("abandonne après plusieurs 429 avec une erreur rate_limited", async () => {
    const tooMany = () => new Response(null, { status: 429 });
    const { client, fetchMock } = setup([tooMany(), tooMany(), tooMany(), tooMany()]);
    await expect(client.getMonthlyArchive(ARCHIVE)).rejects.toMatchObject({ kind: "rate_limited", status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("n'attend pas un Retry-After démesuré", async () => {
    const { client, sleep } = setup([new Response(null, { status: 429, headers: { "retry-after": "3600" } })]);
    await expect(client.getMonthlyArchive(ARCHIVE)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("réessaie après une erreur 5xx ou réseau avec un délai croissant", async () => {
    const { client, sleep } = setup([
      new Response(null, { status: 503 }),
      new TypeError("fetch failed"),
      json({ games: [] }),
    ]);
    await expect(client.getMonthlyArchive(ARCHIVE)).resolves.toMatchObject({ status: "ok", games: [] });
    const [first, second] = sleep.mock.calls.map(([ms]) => ms);
    expect(first).toBeGreaterThanOrEqual(100);
    expect(second).toBeGreaterThanOrEqual(200);
  });

  it("signale Chess.com injoignable après les retries", async () => {
    const failure = () => new TypeError("fetch failed");
    const { client } = setup([failure(), failure(), failure(), failure()]);
    await expect(client.getMonthlyArchive(ARCHIVE)).rejects.toMatchObject({ kind: "network" });
  });

  it("traite 404 et 410 comme une archive indisponible", async () => {
    const { client } = setup([new Response(null, { status: 404 }), new Response(null, { status: 410 })]);
    expect(await client.getMonthlyArchive(ARCHIVE)).toEqual({ status: "unavailable", httpStatus: 404 });
    expect(await client.getMonthlyArchive(ARCHIVE)).toEqual({ status: "unavailable", httpStatus: 410 });
  });

  it("envoie If-None-Match / If-Modified-Since et gère 304", async () => {
    const { client, headersOf } = setup([new Response(null, { status: 304 })]);
    const result = await client.getMonthlyArchive(ARCHIVE, {
      etag: 'W/"c364"',
      lastModified: "Monday, 19-Oct-2026 22:52:02 GMT+0000",
    });
    expect(result).toEqual({ status: "not_modified" });
    expect(headersOf(0).get("if-none-match")).toBe('W/"c364"');
    expect(headersOf(0).get("if-modified-since")).toBe("Monday, 19-Oct-2026 22:52:02 GMT+0000");
  });

  it("ignore une partie malformée sans rejeter l'archive", async () => {
    const { client } = setup([json({ games: [LOSS_AS_BLACK_ON_TIME, { url: "x" }] })]);
    const result = await client.getMonthlyArchive(ARCHIVE);
    expect(result).toMatchObject({ status: "ok", invalidCount: 1 });
    expect(result.status === "ok" && result.games).toHaveLength(1);
  });

  it("rejette une réponse au format inattendu", async () => {
    const { client } = setup([json({ jeux: [] })]);
    await expect(client.getMonthlyArchive(ARCHIVE)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("signale un compte introuvable", async () => {
    const { client } = setup([json({ code: 0, message: "User not found." }, { status: 404 })]);
    await expect(client.getProfile("inconnu_123")).rejects.toMatchObject({ kind: "not_found", status: 404 });
  });

  it("refuse une URL d'archive hors de l'API Chess.com", async () => {
    const { client, fetchMock } = setup([]);
    await expect(client.getMonthlyArchive("https://example.com/games/2026/10")).rejects.toBeInstanceOf(ChesscomError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
