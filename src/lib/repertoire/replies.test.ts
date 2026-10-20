import { describe, expect, it } from "vitest";
import { mergeReplies, takeReplies, type Reply } from "./replies";

const own = [
  { uci: "e4d5", san: "exd5", games: 12 },
  { uci: "f1e2", san: "Be2", games: 6 },
  { uci: "h2h3", san: "h3", games: 2 },
];
const explorer = {
  total: 1000,
  moves: [
    { uci: "h2h3", san: "h3", games: 400, share: 0.4 },
    { uci: "d2d4", san: "d4", games: 200, share: 0.2 },
    { uci: "a2a3", san: "a3", games: 50, share: 0.05 },
  ],
};

describe("mergeReplies", () => {
  it("ordonne propres puis explorateur et exclut les rares", () => {
    const merged = mergeReplies(own, explorer);
    expect(merged.map((r) => r.san)).toEqual(["exd5", "Be2", "h3", "d4"]);
    expect(merged.map((r) => r.source)).toEqual(["own", "own", "explorer", "explorer"]);
    expect(merged[2]).toMatchObject({ ownGames: 2, explorerShare: 0.4, explorerGames: 400 });
  });

  it("garde la source own en cas de doublon", () => {
    const merged = mergeReplies(own, {
      total: 100,
      moves: [{ uci: "e4d5", san: "exd5", games: 50, share: 0.5 }],
    });
    expect(merged.find((r) => r.uci === "e4d5")?.source).toBe("own");
    expect(merged.filter((r) => r.uci === "e4d5")).toHaveLength(1);
  });

  it("départage les égalités par coup UCI, quel que soit l'ordre reçu", () => {
    const tiedOwn = [
      { uci: "g8f6", san: "Nf6", games: 4 },
      { uci: "b8c6", san: "Nc6", games: 4 },
    ];
    const tiedExplorer = {
      total: 100,
      moves: [
        { uci: "h7h6", san: "h6", games: 30, share: 0.3 },
        { uci: "a7a6", san: "a6", games: 30, share: 0.3 },
      ],
    };
    const expected = ["b8c6", "g8f6", "a7a6", "h7h6"];
    expect(mergeReplies(tiedOwn, tiedExplorer).map((r) => r.uci)).toEqual(expected);
    expect(
      mergeReplies([...tiedOwn].reverse(), { ...tiedExplorer, moves: [...tiedExplorer.moves].reverse() }).map((r) => r.uci),
    ).toEqual(expected);
  });

  it("sans explorateur, ne garde que les réponses own", () => {
    expect(mergeReplies(own, null).map((r) => r.san)).toEqual(["exd5", "Be2"]);
  });
});

describe("takeReplies", () => {
  const five: Reply[] = Array.from({ length: 5 }, (_, i) => ({
    uci: `a${i}`,
    san: `m${i}`,
    ownGames: 5,
    explorerGames: 0,
    explorerShare: 0,
    source: "own",
  }));
  it("limite par MAX_REPLIES et le budget, jamais moins de 1", () => {
    expect(takeReplies(five, 8)).toHaveLength(3);
    expect(takeReplies(five, 1)).toHaveLength(1);
    expect(takeReplies(five, 0)).toHaveLength(1);
  });
});
