import { describe, expect, it } from "vitest";
import { buildMoveLinks } from "./move-links";
import { BLACK_MISTAKE } from "./test-fixtures";
import { extractSanTokens, segmentSan } from "./verify";

describe("segmentSan", () => {
  it("isole les coups et garde le texte autour, sans les cases citées seules", () => {
    const segments = segmentSan("Après Nxe5, fxe5 puis Qh5+ attaque la case e5.");
    expect(segments.filter((s) => s.san).map((s) => s.san)).toEqual(["Nxe5", "fxe5", "Qh5+"]);
    expect(segments.map((s) => s.text).join("")).toBe("Après Nxe5, fxe5 puis Qh5+ attaque la case e5.");
  });

  it("reste cohérent avec extractSanTokens", () => {
    const text = "Joue O-O puis Re1 ; la case f7 reste faible.";
    expect(extractSanTokens(text)).toEqual(["O-O", "Re1"]);
  });
});

describe("buildMoveLinks", () => {
  const links = buildMoveLinks(BLACK_MISTAKE);

  it("relie le coup joué à la position avant le coup", () => {
    expect(links.get("f6")).toMatchObject({ source: "played", uci: "f7f6", fen: BLACK_MISTAKE.fenBefore });
  });

  it("relie un coup de la suite punitive à sa position dans la variante", () => {
    // 3. Nxe5 fxe5 4. Qh5+ : Qh5+ se joue après Nxe5 fxe5.
    const qh5 = links.get("Qh5");
    expect(qh5).toMatchObject({ source: "reply", uci: "d1h5", san: "Qh5+" });
    expect(qh5?.fen).toBe("rnbqkbnr/pppp2pp/8/4p3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4");
  });

  it("donne la priorité à la suite punitive pour un écart, aux candidats pour un bon coup", () => {
    // Nxe5 apparaît dans la suite punitive (après f6) et dans le candidat 2 (après Nf6).
    expect(links.get("Nxe5")).toMatchObject({ source: "reply" });
    const good = buildMoveLinks({ ...BLACK_MISTAKE, classification: "best", missedWin: false });
    expect(good.get("Nxe5")).toMatchObject({ source: "candidate", rank: 2 });
    expect(good.get("Nc6")).toMatchObject({ source: "candidate", rank: 1, uci: "b8c6" });
  });

  it("ignore un coup absent des variantes", () => {
    expect(links.get("Bb4")).toBeUndefined();
  });
});
