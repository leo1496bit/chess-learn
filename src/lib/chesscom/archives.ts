// Choix des archives mensuelles à (re)télécharger. Fonctions pures, testées.

export type ArchiveMonth = { year: number; month: number }; // month : 1-12

export type StoredArchive = {
  url: string;
  etag: string | null;
  last_modified: string | null;
  last_synced_at: string;
};

export type ArchivePlan =
  | { fetch: false; reason: "complete" }
  | { fetch: true; conditional: { etag: string | null; lastModified: string | null } | null };

export function parseArchiveMonth(url: string): ArchiveMonth | null {
  const match = /\/games\/(\d{4})\/(\d{2})$/.exec(url);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function formatArchiveMonth({ year, month }: ArchiveMonth): string {
  return `${year}/${String(month).padStart(2, "0")}`;
}

/** Début (UTC) du mois suivant : une archive synchronisée après cette date ne changera plus. */
function startOfNextMonthUtc({ year, month }: ArchiveMonth): number {
  return Date.UTC(year, month, 1); // month est 1-based, Date.UTC attend 0-based : +1 mois
}

/**
 * - Mois en cours (ou futur) : toujours retéléchargé (requête conditionnelle si on a un ETag).
 * - Mois passé synchronisé après sa fin : complet, on ne le retélécharge pas.
 * - Mois passé synchronisé pendant le mois : retéléchargé (des parties ont pu s'ajouter), conditionnel.
 * - `full` : tout est retéléchargé sans en-têtes conditionnels (réimporte les parties supprimées).
 */
export function planArchiveFetch(
  url: string,
  stored: StoredArchive | undefined,
  now: Date,
  full: boolean,
): ArchivePlan {
  if (full) return { fetch: true, conditional: null };

  const conditional = stored ? { etag: stored.etag, lastModified: stored.last_modified } : null;
  const month = parseArchiveMonth(url);
  if (!month || !stored) return { fetch: true, conditional };

  const monthEnd = startOfNextMonthUtc(month);
  const isPastMonth = now.getTime() >= monthEnd;
  const syncedAfterEnd = Date.parse(stored.last_synced_at) >= monthEnd;
  if (isPastMonth && syncedAfterEnd) return { fetch: false, reason: "complete" };

  return { fetch: true, conditional };
}
