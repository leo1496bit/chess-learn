import { describe, expect, it } from "vitest";
import { SearchCollector, parseBestMove, parseInfoLine, toWhitePerspective } from "./uci";

// Sorties réelles de Stockfish 19 lite (position après 1.e4 e5 2.Qh5 Nc6 3.Bc4, Noirs au trait).
const REAL = [
  "info string Network replica 1: Local memory. Shared memory not supported by the OS. Local allocation fallback.",
  "info depth 7 seldepth 9 multipv 1 score cp 30 nodes 8253 nps 179413 hashfull 2 time 46 pv d8e7 g1e2 c6a5",
  "info depth 7 seldepth 12 multipv 2 score cp 20 nodes 8253 nps 175595 hashfull 2 time 47 pv g7g6 h5f3 g8f6 g1e2 c6a5 d2d3",
  "info depth 8 seldepth 14 multipv 1 score cp 29 nodes 12741 nps 124911 hashfull 4 time 102 pv g7g6 h5f3 g8f6 g1e2 f8g7",
  "info depth 8 seldepth 11 multipv 2 score cp 27 nodes 12741 nps 123699 hashfull 4 time 103 pv d8e7 d2d3 g8f6 h5d1 c6a5 b1c3 c7c6",
  "bestmove g7g6 ponder h5f3",
];

describe("parseInfoLine", () => {
  it("lit depth, multipv, score et pv", () => {
    expect(parseInfoLine(REAL[3])).toEqual({
      depth: 8,
      multipv: 1,
      score: { type: "cp", value: 29 },
      pv: ["g7g6", "h5f3", "g8f6", "g1e2", "f8g7"],
    });
  });

  it("lit les scores de mat", () => {
    expect(parseInfoLine("info depth 12 seldepth 2 multipv 1 score mate -1 nodes 150 nps 15000 time 10 pv e8e7 h5f7")?.score).toEqual({
      type: "mate",
      value: -1,
    });
  });

  it("ignore les lignes sans pv, les info string et les bornes", () => {
    expect(parseInfoLine(REAL[0])).toBeNull();
    expect(parseInfoLine("info depth 10 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseInfoLine("info depth 10 seldepth 12 multipv 1 score cp 40 lowerbound nodes 1 pv e2e4")).toBeNull();
    expect(parseInfoLine("info depth 0 score mate 0")).toBeNull();
  });

  it("multipv vaut 1 par défaut", () => {
    expect(parseInfoLine("info depth 3 score cp 12 nodes 50 pv e2e4")?.multipv).toBe(1);
  });
});

describe("parseBestMove", () => {
  it("lit le meilleur coup", () => {
    expect(parseBestMove(REAL[5])).toBe("g7g6");
    expect(parseBestMove("bestmove (none)")).toBeNull();
    expect(parseBestMove("readyok")).toBeUndefined();
  });
});

describe("toWhitePerspective", () => {
  it("inverse le score quand les Noirs sont au trait", () => {
    expect(toWhitePerspective({ type: "cp", value: 29 }, "b")).toEqual({ cp: -29, mate: null });
    expect(toWhitePerspective({ type: "cp", value: 29 }, "w")).toEqual({ cp: 29, mate: null });
    expect(toWhitePerspective({ type: "mate", value: 2 }, "b")).toEqual({ cp: null, mate: -2 });
  });
});

describe("SearchCollector", () => {
  it("renvoie la dernière profondeur complète, en point de vue Blancs", () => {
    const c = new SearchCollector("b", 2);
    for (const line of REAL) c.push(line);
    expect(c.completedDepth).toBe(8);
    expect(c.result()).toEqual([
      { multipv: 1, depth: 8, evaluation: { cp: -29, mate: null }, pvUci: ["g7g6", "h5f3", "g8f6", "g1e2", "f8g7"] },
      { multipv: 2, depth: 8, evaluation: { cp: -27, mate: null }, pvUci: ["d8e7", "d2d3", "g8f6", "h5d1", "c6a5", "b1c3", "c7c6"] },
    ]);
  });

  it("ignore une profondeur incomplète (recherche interrompue)", () => {
    const c = new SearchCollector("b", 2);
    for (const line of REAL.slice(0, 4)) c.push(line);
    expect(c.completedDepth).toBe(7);
    expect(c.result().map((l) => l.pvUci[0])).toEqual(["d8e7", "g7g6"]);
  });

  it("attend moins de lignes quand il y a peu de coups légaux", () => {
    const c = new SearchCollector("w", 1);
    c.push("info depth 5 multipv 1 score cp 10 pv e2e4");
    c.push("info depth 5 multipv 2 score cp 5 pv d2d4");
    expect(c.completedDepth).toBe(5);
    expect(c.result()).toHaveLength(1);
  });
});
