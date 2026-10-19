import { describe, expect, it } from "vitest";
import { buildRetryReminder, buildUserMessage, describePieces, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { extractSanTokens, allowedMovesFor, normalizeSan } from "./verify";
import { BLACK_MISTAKE, GAME } from "./test-fixtures";

describe("SYSTEM_PROMPT", () => {
  it("est versionné et figé (pas de donnée variable)", () => {
    expect(PROMPT_VERSION).toMatch(/^explain-v\d+$/);
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT).toContain("n'inventes jamais");
    expect(SYSTEM_PROMPT).toContain("semble viser");
  });
});

describe("describePieces", () => {
  it("liste les pièces de chaque camp avec leurs cases", () => {
    const pieces = describePieces(BLACK_MISTAKE.fenBefore);
    expect(pieces.w).toContain("Roi : e1");
    expect(pieces.w).toContain("Cavaliers : b1, f3");
    expect(pieces.b).toContain("Pions : a7, b7, c7, d7, e5, f7, g7, h7");
  });
});

describe("buildUserMessage — variantes et positions matées", () => {
  it("numérote les candidats depuis un coup noir", () => {
    expect(buildUserMessage(BLACK_MISTAKE, GAME)).toContain("1. 2... Nc6 3. Bb5 a6 — évaluation +0.30");
  });

  it("affiche le résultat quand l'évaluation après le coup est un mat (camp au trait maté)", () => {
    // Après le coup des Noirs, les Blancs sont au trait et matés : 0-1.
    const message = buildUserMessage({ ...BLACK_MISTAKE, evalAfter: { cp: null, mate: 0 } }, GAME);
    expect(message).toContain("Évaluation après le coup joué : 0-1");
  });
});

describe("buildUserMessage", () => {
  const message = buildUserMessage(BLACK_MISTAKE, GAME);

  it("contient la FEN, les coups SAN et les évaluations formatées", () => {
    expect(message).toContain(`FEN avant le coup : ${BLACK_MISTAKE.fenBefore}`);
    expect(message).toContain("Coup joué : f6 — classification : erreur");
    expect(message).toContain("Meilleur coup selon Stockfish : Nc6");
    expect(message).toContain("+0.30 (chances de gain du joueur : 47 %)");
    expect(message).toContain("+1.60 (chances de gain du joueur : 36 %)");
    expect(message).toContain("3. Nxe5 fxe5 4. Qh5+ Ke7 5. Qxe5+ Kf7 6. Bc4+");
    expect(message).toContain("Ouverture : Défense Damiano (C40)");
    expect(message).toContain("phase : ouverture");
    expect(message).toContain("king_safety");
  });

  it("ne cite que des coups fournis par Stockfish", () => {
    const allowed = allowedMovesFor(BLACK_MISTAKE);
    // On retire la FEN et la liste des pièces (des cases, pas des coups), puis on vérifie chaque coup.
    const movesOnly = message
      .split("\n")
      .filter((line) => !line.startsWith("FEN") && !line.startsWith("Pièces"))
      .join("\n");
    const tokens = extractSanTokens(movesOnly);
    expect(tokens.length).toBeGreaterThan(10);
    expect(tokens.filter((token) => !allowed.has(normalizeSan(token)))).toEqual([]);
  });

  it("n'inclut pas de donnée absente de l'analyse", () => {
    const noLines = buildUserMessage({ ...BLACK_MISTAKE, candidates: [], punishLine: null, themes: [] }, { ...GAME, openingName: null, eco: null });
    expect(noLines).toContain("(aucun candidat fourni)");
    expect(noLines).toContain("(aucune variante fournie");
    expect(noLines).toContain("Thèmes détectés : aucun.");
    expect(noLines).toContain("Ouverture : inconnue");
    expect(noLines).not.toContain("Bb5");
  });

  it("liste les coups autorisés", () => {
    expect(message).toMatch(/Coups autorisés \(les seuls que tu peux citer\) : f6, Nc6, Bb5/);
  });
});

describe("buildRetryReminder", () => {
  it("rappelle les coups invalides et autorisés", () => {
    const reminder = buildRetryReminder(["Bxf7+"], ["Nc6", "f6"]);
    expect(reminder).toContain("Bxf7+");
    expect(reminder).toContain("Nc6, f6");
  });
});
