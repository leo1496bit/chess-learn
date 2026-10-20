import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, type MoveAnalysis } from "@/lib/analysis/types";
import { buildMoveLinks, buildReportMoveLinks, indexMoveLinks, resolveMoveLink } from "./move-links";
import { BLACK_MISTAKE } from "./test-fixtures";
import { extractSanTokens, segmentSan } from "./verify";

describe("segmentSan", () => {
  it("isole les coups et garde le texte autour, sans les cases citées seules", () => {
    const segments = segmentSan("Après Nxe5, fxe5 puis Qh5+ attaque la case e5.");
    expect(segments.filter((s) => s.san).map((s) => s.san)).toEqual(["Nxe5", "fxe5", "Qh5+"]);
    expect(segments.map((s) => s.text).join("")).toBe("Après Nxe5, fxe5 puis Qh5+ attaque la case e5.");
  });

  it("reste cohérent avec extractSanTokens", () => {
    expect(extractSanTokens("Joue O-O puis Re1 ; la case f7 reste faible.")).toEqual(["O-O", "Re1"]);
  });
});

describe("explication : buildMoveLinks + resolveMoveLink", () => {
  const index = indexMoveLinks(buildMoveLinks(BLACK_MISTAKE));
  const resolve = (san: string, before = "") => resolveMoveLink(index, san, before, { ambiguous: "first" });

  it("relie le coup joué à la position avant le coup", () => {
    expect(resolve("f6")).toMatchObject({ source: "played", uci: "f7f6", fen: BLACK_MISTAKE.fenBefore });
  });

  it("relie un coup de la suite punitive à sa position dans la variante", () => {
    // 3. Nxe5 fxe5 4. Qh5+ : Qh5+ se joue après Nxe5 fxe5.
    expect(resolve("Qh5+")).toMatchObject({
      source: "reply",
      uci: "d1h5",
      fen: "rnbqkbnr/pppp2pp/8/4p3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4",
    });
  });

  it("donne la priorité à la suite punitive pour un écart, aux candidats pour un bon coup", () => {
    // Nxe5 apparaît dans la suite punitive (après f6) et dans le candidat 2 (après Nf6).
    expect(resolve("Nxe5")).toMatchObject({ source: "reply" });
    const good = indexMoveLinks(buildMoveLinks({ ...BLACK_MISTAKE, classification: "best", missedWin: false }));
    expect(resolveMoveLink(good, "Nxe5", "", { ambiguous: "first" })).toMatchObject({ source: "candidate", rank: 2 });
  });

  it("utilise le numéro de coup quand il est écrit", () => {
    // « 3. Nxe5 » : la suite punitive ; le candidat 2 joue aussi Nxe5, mais au coup 3 également.
    expect(resolve("Nxe5", "après 3. ")).toMatchObject({ uci: "f3e5" });
  });

  it("ignore un coup absent des variantes", () => {
    expect(resolve("Bb4")).toBeUndefined();
  });
});

describe("bilan : buildReportMoveLinks + resolveMoveLink", () => {
  const move = (o: Partial<MoveAnalysis>): MoveAnalysis => ({ ...BLACK_MISTAKE, ...o });
  // 1. e4 e5 2. Nf3 f6? (moment clé) 3. Nxe5 Qe7
  const moves: MoveAnalysis[] = [
    move({ ply: 1, color: "w", isPlayerMove: false, san: "e4", uci: "e2e4", classification: "best", fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" }),
    move({ ply: 2, color: "b", isPlayerMove: true, san: "e5", uci: "e7e5", classification: "best", fenBefore: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" }),
    move({ ply: 3, color: "w", isPlayerMove: false, san: "Nf3", uci: "g1f3", classification: "best", fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" }),
    BLACK_MISTAKE,
    move({ ply: 5, color: "w", isPlayerMove: false, san: "Nxe5", uci: "f3e5", classification: "best", fenBefore: BLACK_MISTAKE.fenAfter }),
  ];
  const index = indexMoveLinks(buildReportMoveLinks(moves, DEFAULT_THRESHOLDS));
  const resolve = (san: string, before = "", contextPly: number | null = null) =>
    resolveMoveLink(index, san, before, { ambiguous: "none", contextPly });

  it("relie un coup numéroté au coup réellement joué dans la partie", () => {
    expect(resolve("f6", "la gaffe 2... ")).toMatchObject({ source: "played", momentPly: 4 });
    expect(resolve("Nxe5", "puis 3. ")).toMatchObject({ source: "played", momentPly: 5 });
  });

  it("relie un coup des variantes du moment clé, sans numéro, grâce au contexte", () => {
    expect(resolve("Nc6", "le meilleur coup était ", 4)).toMatchObject({ source: "candidate", momentPly: 4, uci: "b8c6" });
  });

  it("laisse en texte un coup ambigu sans numéro ni contexte", () => {
    // Nxe5 : joué au coup 3 dans la partie et présent dans la suite punitive du moment clé.
    expect(resolve("Nxe5")).toBeUndefined();
  });

  it("relie un coup sans numéro s'il est unique", () => {
    expect(resolve("Nf3")).toMatchObject({ source: "played", momentPly: 3 });
  });
});
