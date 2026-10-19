// Client de l'API publique Chess.com (lecture seule, sans authentification).
// Chess.com limite le parallélisme : les appels de ce client sont faits l'un après l'autre par l'appelant.

import type { z } from "zod";
import {
  ArchiveListSchema,
  ChesscomGameSchema,
  ChesscomProfileSchema,
  MonthlyArchiveSchema,
  type ChesscomGame,
  type ChesscomProfile,
} from "./schemas";

export const CHESSCOM_API_BASE = "https://api.chess.com/pub";

const ARCHIVE_URL_RE = /^https:\/\/api\.chess\.com\/pub\/player\/[a-z0-9_-]+\/games\/\d{4}\/\d{2}$/;
const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/;

export type ChesscomErrorKind =
  | "not_found"
  | "rate_limited"
  | "http"
  | "network"
  | "timeout"
  | "invalid_response"
  | "aborted";

export class ChesscomError extends Error {
  constructor(
    message: string,
    readonly kind: ChesscomErrorKind,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ChesscomError";
  }
}

export type MonthlyArchiveResult =
  | { status: "ok"; games: ChesscomGame[]; invalidCount: number; etag: string | null; lastModified: string | null }
  | { status: "not_modified" }
  | { status: "unavailable"; httpStatus: number };

export type ConditionalHeaders = { etag?: string | null; lastModified?: string | null };

export type ChesscomClientOptions = {
  fetch?: typeof fetch;
  /** Attente entre deux tentatives (remplaçable dans les tests). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Au-delà, on n'attend pas le Retry-After : on abandonne avec une erreur « rate_limited ». */
  maxRetryAfterMs?: number;
};

export type RequestOptions = { signal?: AbortSignal };

export const DEFAULT_USER_AGENT = "chess-learn/0.1 (application personnelle d'analyse de parties; Node.js fetch)";

/** Identifiant Chess.com normalisé : l'API n'accepte que la forme en minuscules (301 sinon). */
export function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  if (!USERNAME_RE.test(trimmed)) {
    throw new ChesscomError(`Identifiant Chess.com invalide : « ${trimmed} »`, "not_found", CHESSCOM_API_BASE);
  }
  return trimmed.toLowerCase();
}

export function isArchiveUrl(url: string): boolean {
  return ARCHIVE_URL_RE.test(url);
}

/** Retry-After en secondes ou en date HTTP → millisecondes, ou null s'il est absent/illisible. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createChesscomClient(options: ChesscomClientOptions = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? defaultSleep;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 30_000;

  const backoff = (attempt: number) => baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250);

  /**
   * GET avec timeout et retries (429, 5xx, erreurs réseau, timeouts).
   * Renvoie la réponse pour tout autre statut : l'appelant interprète 200/304/404/410.
   */
  async function request(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new ChesscomError("Synchronisation interrompue.", "aborted", url);

      let response: Response;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        response = await fetchImpl(url, {
          headers: { Accept: "application/json", "User-Agent": userAgent, ...headers },
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        if (signal?.aborted) throw new ChesscomError("Synchronisation interrompue.", "aborted", url);
        const isTimeout = error instanceof Error && error.name === "TimeoutError";
        if (attempt < maxRetries) {
          await sleep(backoff(attempt), signal);
          continue;
        }
        throw isTimeout
          ? new ChesscomError("Chess.com ne répond pas dans les délais. Réessaie dans quelques minutes.", "timeout", url)
          : new ChesscomError("Chess.com est injoignable. Vérifie ta connexion puis réessaie.", "network", url);
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        await response.body?.cancel();
        const wait = retryAfter ?? backoff(attempt);
        if (attempt < maxRetries && wait <= maxRetryAfterMs) {
          await sleep(wait, signal);
          continue;
        }
        throw response.status === 429
          ? new ChesscomError(
              "Chess.com limite temporairement les requêtes. Relance la synchronisation dans quelques minutes.",
              "rate_limited",
              url,
              429,
            )
          : new ChesscomError(
              `Chess.com rencontre une erreur (HTTP ${response.status}). Réessaie plus tard.`,
              "http",
              url,
              response.status,
            );
      }

      return response;
    }
  }

  async function readJson(response: Response, url: string): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new ChesscomError("Réponse illisible de Chess.com.", "invalid_response", url, response.status);
    }
  }

  async function getJson<T>(url: string, schema: z.ZodType<T>, notFoundMessage: string, signal?: AbortSignal): Promise<T> {
    const response = await request(url, {}, signal);
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      throw new ChesscomError(notFoundMessage, "not_found", url, response.status);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ChesscomError(`Chess.com a refusé la requête (HTTP ${response.status}).`, "http", url, response.status);
    }
    const parsed = schema.safeParse(await readJson(response, url));
    if (!parsed.success) throw new ChesscomError("Format de réponse Chess.com inattendu.", "invalid_response", url);
    return parsed.data;
  }

  return {
    /** Profil public du joueur. */
    async getProfile(username: string, { signal }: RequestOptions = {}): Promise<ChesscomProfile> {
      const user = normalizeUsername(username);
      return getJson(
        `${CHESSCOM_API_BASE}/player/${user}`,
        ChesscomProfileSchema,
        `Le compte Chess.com « ${username} » est introuvable. Vérifie l'identifiant dans Paramètres.`,
        signal,
      );
    },

    /** URLs des archives mensuelles, de la plus ancienne à la plus récente. */
    async getArchiveList(username: string, { signal }: RequestOptions = {}): Promise<string[]> {
      const user = normalizeUsername(username);
      const data = await getJson(
        `${CHESSCOM_API_BASE}/player/${user}/games/archives`,
        ArchiveListSchema,
        `Les archives du compte Chess.com « ${username} » sont introuvables.`,
        signal,
      );
      return data.archives.filter(isArchiveUrl);
    },

    /**
     * Archive mensuelle. Avec un ETag/Last-Modified connu, Chess.com répond 304 si rien n'a changé.
     * 404/410 → archive indisponible (sans exception) pour ne pas bloquer les autres mois.
     */
    async getMonthlyArchive(
      url: string,
      { etag, lastModified, signal }: ConditionalHeaders & RequestOptions = {},
    ): Promise<MonthlyArchiveResult> {
      if (!isArchiveUrl(url)) throw new ChesscomError(`URL d'archive inattendue : ${url}`, "invalid_response", url);

      const headers: Record<string, string> = {};
      if (etag) headers["If-None-Match"] = etag;
      if (lastModified) headers["If-Modified-Since"] = lastModified;

      const response = await request(url, headers, signal);
      if (response.status === 304) return { status: "not_modified" };
      if (response.status === 404 || response.status === 410) {
        await response.body?.cancel();
        return { status: "unavailable", httpStatus: response.status };
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ChesscomError(`Chess.com a refusé l'archive (HTTP ${response.status}).`, "http", url, response.status);
      }

      const parsed = MonthlyArchiveSchema.safeParse(await readJson(response, url));
      if (!parsed.success) throw new ChesscomError("Format d'archive Chess.com inattendu.", "invalid_response", url);

      const games: ChesscomGame[] = [];
      let invalidCount = 0;
      for (const raw of parsed.data.games) {
        const game = ChesscomGameSchema.safeParse(raw);
        if (game.success) games.push(game.data);
        else invalidCount++;
      }

      return {
        status: "ok",
        games,
        invalidCount,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    },
  };
}

export type ChesscomClient = ReturnType<typeof createChesscomClient>;
