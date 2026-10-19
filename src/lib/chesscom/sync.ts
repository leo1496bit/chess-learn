// Synchronisation Chess.com → table `games`. Serveur uniquement (appelé par POST /api/sync).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/db/database.types";
import { chesscomGameToRow, gameKey, type GameRow } from "@/lib/pgn/game";
import type { ChesscomGame } from "./schemas";
import { ChesscomError, type ChesscomClient } from "./client";
import { formatArchiveMonth, parseArchiveMonth, planArchiveFetch, type StoredArchive } from "./archives";

type Supabase = SupabaseClient<Database>;

export type SyncError = { archive?: string; message: string };

export type SyncResult = {
  imported: number;
  /** Parties déjà présentes, variantes, sans PGN ou illisibles. */
  skipped: number;
  /** Archives effectivement téléchargées ou revérifiées (304 compris). */
  archivesChecked: number;
  archivesTotal: number;
  /** false : le temps imparti est écoulé ou Chess.com limite les requêtes ; relancer pour continuer. */
  complete: boolean;
  /** Archive à reprendre au prochain appel (`resumeFrom`) quand `complete` vaut false. */
  resumeFrom: string | null;
  /** Cause de l'arrêt anticipé : temps imparti écoulé, ou Chess.com indisponible / limitant. */
  stoppedBy: "time" | "chesscom" | null;
  errors: SyncError[];
};

export class SyncAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncAccountError";
  }
}

export type SyncOptions = {
  supabase: Supabase;
  userId: string;
  username: string;
  client: ChesscomClient;
  full?: boolean;
  /** Horodatage (ms) au-delà duquel on n'entame plus de nouvelle archive. */
  deadline: number;
  /** Reprend à cette archive (incluse) : les plus récentes ont été traitées par l'appel précédent. */
  resumeFrom?: string;
  signal?: AbortSignal;
  now?: () => Date;
};

const LOOKUP_CHUNK = 100; // taille raisonnable pour un filtre `in` dans l'URL PostgREST
const INSERT_CHUNK = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function archiveLabel(url: string): string {
  const month = parseArchiveMonth(url);
  return month ? formatArchiveMonth(month) : url;
}

async function existingKeys(supabase: Supabase, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const chunk of chunks(keys, LOOKUP_CHUNK)) {
    const { data, error } = await supabase.from("games").select("chesscom_uuid").in("chesscom_uuid", chunk);
    if (error) throw new Error(`Lecture des parties existantes impossible : ${error.message}`);
    for (const row of data) found.add(row.chesscom_uuid);
  }
  return found;
}

/** Importe les parties d'une archive ; renvoie le nombre de parties insérées et ignorées. */
async function importGames(
  supabase: Supabase,
  userId: string,
  username: string,
  games: ChesscomGame[],
): Promise<{ imported: number; skipped: number; invalidPgn: number }> {
  const known = await existingKeys(supabase, games.map(gameKey));
  const rows: (GameRow & { user_id: string })[] = [];
  let skipped = 0;
  let invalidPgn = 0;

  for (const game of games) {
    if (known.has(gameKey(game))) {
      skipped++;
      continue;
    }
    const converted = chesscomGameToRow(game, username);
    if (!converted.ok) {
      skipped++;
      if (converted.reason === "invalid_pgn") invalidPgn++;
      continue;
    }
    rows.push({ ...converted.row, user_id: userId });
  }

  let imported = 0;
  for (const chunk of chunks(rows, INSERT_CHUNK)) {
    const { data, error } = await supabase
      .from("games")
      .upsert(chunk satisfies TablesInsert<"games">[], { onConflict: "user_id,chesscom_uuid", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Enregistrement des parties impossible : ${error.message}`);
    imported += data.length;
    skipped += chunk.length - data.length; // insérées entre-temps (synchronisation concurrente)
  }

  return { imported, skipped, invalidPgn };
}

async function saveArchive(supabase: Supabase, row: TablesInsert<"chesscom_archives">) {
  const { error } = await supabase.from("chesscom_archives").upsert(row, { onConflict: "user_id,url" });
  if (error) throw new Error(`Enregistrement de l'état de l'archive impossible : ${error.message}`);
}

export async function syncChesscomGames(options: SyncOptions): Promise<SyncResult> {
  const { supabase, userId, username, client, full = false, deadline, resumeFrom, signal } = options;
  const now = options.now ?? (() => new Date());

  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    archivesChecked: 0,
    archivesTotal: 0,
    complete: true,
    resumeFrom: null,
    stoppedBy: null,
    errors: [],
  };

  let archiveUrls: string[];
  try {
    await client.getProfile(username, { signal });
    archiveUrls = await client.getArchiveList(username, { signal });
  } catch (error) {
    if (error instanceof ChesscomError && error.kind === "not_found") throw new SyncAccountError(error.message);
    throw error;
  }
  result.archivesTotal = archiveUrls.length;

  const { data: storedRows, error: storedError } = await supabase
    .from("chesscom_archives")
    .select("url, etag, last_modified, last_synced_at");
  if (storedError) throw new Error(`Lecture des archives synchronisées impossible : ${storedError.message}`);
  const stored = new Map<string, StoredArchive>(storedRows.map((row) => [row.url, row]));

  // Les plus récentes d'abord : en cas d'arrêt anticipé, les nouvelles parties sont déjà là.
  const ordered = [...archiveUrls].reverse();
  const start = resumeFrom ? Math.max(0, ordered.indexOf(resumeFrom)) : 0;
  for (const url of ordered.slice(start)) {
    const previous = stored.get(url);
    const plan = planArchiveFetch(url, previous, now(), full);
    if (!plan.fetch) continue;

    if (Date.now() >= deadline) {
      result.complete = false;
      result.resumeFrom = url;
      result.stoppedBy = "time";
      break;
    }

    const label = archiveLabel(url);
    try {
      const archive = await client.getMonthlyArchive(url, {
        etag: plan.conditional?.etag,
        lastModified: plan.conditional?.lastModified,
        signal,
      });
      result.archivesChecked++;

      if (archive.status === "unavailable") {
        result.errors.push({
          archive: label,
          message: `L'archive ${label} est indisponible sur Chess.com (HTTP ${archive.httpStatus}). Elle sera retentée à la prochaine synchronisation.`,
        });
        continue;
      }

      const syncedAt = now().toISOString();
      if (archive.status === "not_modified") {
        await saveArchive(supabase, {
          user_id: userId,
          url,
          etag: previous?.etag ?? null,
          last_modified: previous?.last_modified ?? null,
          last_synced_at: syncedAt,
        });
        continue;
      }

      const counts = await importGames(supabase, userId, username, archive.games);
      result.imported += counts.imported;
      result.skipped += counts.skipped + archive.invalidCount;
      const unreadable = counts.invalidPgn + archive.invalidCount;
      if (unreadable > 0) {
        result.errors.push({
          archive: label,
          message: `${unreadable} partie${unreadable > 1 ? "s" : ""} de ${label} ignorée${unreadable > 1 ? "s" : ""} : données ou PGN illisibles.`,
        });
      }

      // L'état de l'archive n'est enregistré qu'une fois toutes ses parties importées.
      await saveArchive(supabase, {
        user_id: userId,
        url,
        etag: archive.etag,
        last_modified: archive.lastModified,
        game_count: archive.games.length,
        last_synced_at: syncedAt,
      });
    } catch (error) {
      if (!(error instanceof ChesscomError)) throw error;
      result.errors.push({ archive: label, message: error.message });
      // Limite de requêtes, réseau ou délai global : inutile d'insister sur les archives suivantes.
      if (error.kind === "rate_limited" || error.kind === "network" || error.kind === "timeout" || error.kind === "aborted") {
        result.complete = false;
        result.resumeFrom = url;
        result.stoppedBy = error.kind === "aborted" ? "time" : "chesscom";
        break;
      }
    }
  }

  return result;
}
