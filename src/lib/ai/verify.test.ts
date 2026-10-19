import { describe, expect, it } from "vitest";
import { allowedMovesFor, extractSanTokens, normalizeSan, verifyExplanation, verifyMoves } from "./verify";
import { BLACK_MISTAKE, VALID_EXPLANATION } from "./test-fixtures";

const allowed = allowedMovesFor(BLACK_MISTAKE);

describe("normalizeSan", () => {
  it("retire échecs, mats et annotations", () => {
    expect(normalizeSan("Qh5+")).toBe("Qh5");
    expect(normalizeSan("Qxf7#")).toBe("Qxf7");
    expect(normalizeSan("Nf3!?")).toBe("Nf3");
    expect(normalizeSan("e8=Q+!")).toBe("e8=Q");
  });

  it("uniformise les roques écrits avec des zéros", () => {
    expect(normalizeSan("0-0")).toBe("O-O");
    expect(normalizeSan("0-0-0+")).toBe("O-O-O");
  });
});

describe("allowedMovesFor", () => {
  it("contient coup joué, meilleur coup, candidats et variante punitive", () => {
    for (const san of ["f6", "Nc6", "Bb5", "Nf6", "d4", "Nxe5", "Qh5", "Bc4"]) expect(allowed.has(san)).toBe(true);
    expect(allowed.has("Qh5+")).toBe(false); // stocké normalisé
  });
});

describe("extractSanTokens", () => {
  it("trouve les coups avec numéros et annotations", () => {
    expect(extractSanTokens("Après 3. Nxe5 fxe5?? 4. Qh5+ Ke7")).toEqual(["Nxe5", "fxe5", "Qh5+", "Ke7"]);
  });

  it("trouve les roques et les promotions", () => {
    expect(extractSanTokens("Le petit roque O-O puis le grand roque O-O-O, et enfin e8=Q+.")).toEqual([
      "O-O",
      "O-O-O",
      "e8=Q+",
    ]);
  });

  it("ignore les cases citées comme cases", () => {
    expect(extractSanTokens("la case e5 et le pion f7 sur la diagonale a2-g8")).toEqual([]);
  });

  it("garde les coups de pion joués", () => {
    expect(extractSanTokens("tu as joué f6 au lieu de Nc6")).toEqual(["f6", "Nc6"]);
  });
});

describe("verifyMoves", () => {
  it("accepte une explication qui ne cite que des coups fournis", () => {
    const result = verifyExplanation(VALID_EXPLANATION, allowed);
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
    expect(result.referenced).toContain("Qxe5");
  });

  it("rejette un coup inventé dans le texte", () => {
    const result = verifyMoves(["Les Blancs gagnent avec Bxf7+ suivi de Ng5."], [], allowed);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(["Bxf7+", "Ng5"]);
  });

  it("rejette un coup inventé dans movesReferenced", () => {
    const result = verifyMoves(["Nc6 était meilleur."], ["Nc6", "Qd8-h4"], allowed);
    expect(result.invalid).toEqual(["Qd8-h4"]);
  });

  it("rejette la notation française", () => {
    const result = verifyMoves(["Il fallait jouer Cc6."], [], allowed);
    expect(result.valid).toBe(false);
    expect(result.invalid).toContain("Cc6");
  });

  it("accepte roques et promotions autorisés, même annotés", () => {
    const castle = new Set(["O-O", "O-O-O", "e8=Q", "exd8=N"]);
    expect(verifyMoves(["O-O! puis O-O-O?! et e8=Q+ ou exd8=N#"], ["0-0", "e8=Q+"], castle).valid).toBe(true);
    expect(verifyMoves(["e8=R"], [], castle).valid).toBe(false);
  });
});
