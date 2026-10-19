import { describe, expect, it } from "vitest";
import { parseArchiveMonth, planArchiveFetch, type StoredArchive } from "./archives";

const SEPT = "https://api.chess.com/pub/player/leny_l/games/2026/09";
const OCT = "https://api.chess.com/pub/player/leny_l/games/2026/10";
const NOW = new Date("2026-10-20T12:00:00Z");

function stored(url: string, lastSyncedAt: string): StoredArchive {
  return { url, etag: 'W/"e"', last_modified: "Mon, 19 Oct 2026 22:52:02 GMT", last_synced_at: lastSyncedAt };
}

describe("parseArchiveMonth", () => {
  it("extrait l'année et le mois", () => {
    expect(parseArchiveMonth(OCT)).toEqual({ year: 2026, month: 10 });
    expect(parseArchiveMonth("https://api.chess.com/pub/player/leny_l/games/2026/13")).toBeNull();
  });
});

describe("planArchiveFetch", () => {
  it("télécharge une archive jamais synchronisée sans en-têtes conditionnels", () => {
    expect(planArchiveFetch(SEPT, undefined, NOW, false)).toEqual({ fetch: true, conditional: null });
  });

  it("ne retélécharge pas un mois passé synchronisé après sa fin", () => {
    expect(planArchiveFetch(SEPT, stored(SEPT, "2026-10-01T00:00:00Z"), NOW, false)).toEqual({
      fetch: false,
      reason: "complete",
    });
  });

  it("revérifie un mois passé synchronisé avant sa fin (requête conditionnelle)", () => {
    expect(planArchiveFetch(SEPT, stored(SEPT, "2026-09-30T20:00:00Z"), NOW, false)).toEqual({
      fetch: true,
      conditional: { etag: 'W/"e"', lastModified: "Mon, 19 Oct 2026 22:52:02 GMT" },
    });
  });

  it("retélécharge toujours le mois en cours", () => {
    expect(planArchiveFetch(OCT, stored(OCT, "2026-10-20T11:59:00Z"), NOW, false)).toMatchObject({ fetch: true });
  });

  it("revérifie tout sans en-têtes conditionnels en mode complet", () => {
    expect(planArchiveFetch(SEPT, stored(SEPT, "2026-10-05T00:00:00Z"), NOW, true)).toEqual({
      fetch: true,
      conditional: null,
    });
  });
});
