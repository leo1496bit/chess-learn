// Client de l'explorateur Lichess (parties de joueurs 1000-1600). Serveur uniquement : le jeton ne
// quitte jamais le serveur, n'est ni journalisé ni inclus dans les messages d'erreur.
import { Chess } from "chess.js";
import { moveToUci } from "@/lib/analysis/lines";

export type ExplorerMove = { uci: string; san: string; games: number; share: number };
export type ExplorerResult = { total: number; moves: ExplorerMove[] };

export class ExplorerError extends Error {
  constructor(
    public code: "rate_limited" | "unauthorized" | "unavailable",
    message?: string,
  ) {
    super(message ?? `Explorateur Lichess : ${code}`);
    this.name = "ExplorerError";
  }
}

/** Sert aussi de clé `params` du cache. */
export const EXPLORER_PARAMS = "ratings=1000,1200,1400,1600&speeds=blitz,rapid";
const ENDPOINT = "https://explorer.lichess.org/lichess";
const TIMEOUT_MS = 10_000;

type RawMove = { uci: string; san: string; white: number; draws: number; black: number };

export async function fetchExplorer(
  epd: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExplorerResult> {
  const url = `${ENDPOINT}?variant=standard&fen=${encodeURIComponent(epd)}&${EXPLORER_PARAMS}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExplorerError("unavailable", "Explorateur Lichess injoignable");
  }
  if (res.status === 429) throw new ExplorerError("rate_limited");
  if (res.status === 401) throw new ExplorerError("unauthorized");
  if (!res.ok) throw new ExplorerError("unavailable", `Explorateur Lichess : HTTP ${res.status}`);

  let body: { white?: number; draws?: number; black?: number; moves?: RawMove[] };
  try {
    body = await res.json();
  } catch {
    throw new ExplorerError("unavailable", "Explorateur Lichess : réponse illisible");
  }
  if (!body || !Array.isArray(body.moves)) {
    throw new ExplorerError("unavailable", "Explorateur Lichess : réponse inattendue");
  }
  let chess: Chess;
  try {
    chess = new Chess(`${epd} 0 1`);
  } catch {
    throw new ExplorerError("unavailable", "Explorateur Lichess : position invalide");
  }
  const total = (body.white ?? 0) + (body.draws ?? 0) + (body.black ?? 0);
  const moves: ExplorerMove[] = [];
  for (const m of body.moves) {
    if (!m || typeof m.uci !== "string" || typeof m.san !== "string") continue;
    // UCI recalculé par chess.js depuis le SAN : Lichess peut coder le roque en roi-prend-tour (e1h1).
    const uci = normalisedUci(chess, m.san);
    if (!uci) continue; // SAN illégal dans la position : ignoré
    const games = (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0);
    moves.push({ uci, san: m.san, games, share: total > 0 ? games / total : 0 });
  }
  return { total, moves };
}

/** UCI de chess.js pour un SAN joué dans la position, ou `null` s'il est illégal. */
function normalisedUci(chess: Chess, san: string): string | null {
  try {
    const move = chess.move(san);
    chess.undo();
    return moveToUci(move);
  } catch {
    return null;
  }
}

/** Vérifie la forme d'un résultat (ligne de cache) avant de s'en servir. */
export function isExplorerResult(v: unknown): v is ExplorerResult {
  if (!v || typeof v !== "object") return false;
  const r = v as { total?: unknown; moves?: unknown };
  return (
    typeof r.total === "number" &&
    Array.isArray(r.moves) &&
    r.moves.every((m) => {
      const x = m as Record<string, unknown> | null;
      return (
        !!x &&
        typeof x.uci === "string" &&
        typeof x.san === "string" &&
        typeof x.games === "number" &&
        typeof x.share === "number"
      );
    })
  );
}
