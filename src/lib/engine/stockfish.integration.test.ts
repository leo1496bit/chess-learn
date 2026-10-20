import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { validateLine } from "@/lib/analysis/lines";
import { UciEngine, type TransportFactory } from "./engine";

// Test d'intégration : vrai Stockfish 19 lite (WASM) via le paquet npm, exécuté dans Node.
// Valide le parseur UCI, la dernière profondeur complète et la perspective des scores.

type NodeStockfish = { processCommand(command: string): void; terminate(): void; listener?: (line: string) => void };
const require = createRequire(import.meta.url);
const loadStockfish = require("stockfish") as (flavor: string, onMessage: (line: string) => void) => NodeStockfish;

const nodeTransport: TransportFactory = ({ onLine }) => {
  const sf = loadStockfish("lite-single", (line) => onLine(line));
  return { send: (command) => sf.processCommand(command), terminate: () => sf.terminate() };
};

const engine = new UciEngine(nodeTransport);
afterAll(() => engine.terminate());

describe("Stockfish WASM (Node)", () => {
  it("trouve le mat en 1 des Blancs (Qxf7#)", async () => {
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const r = await engine.analyze(fen, { depth: 10, multipv: 2 });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].pvUci[0]).toBe("h5f7");
    expect(r.lines[0].evaluation).toEqual({ cp: null, mate: 1 });
    expect(r.lines.every((l) => l.depth === r.lines[0].depth)).toBe(true);
    expect(r.partial).toBeUndefined();
    expect(validateLine(fen, r.lines[0]).san[0]).toBe("Qxf7#");
  }, 60_000);

  it("normalise en point de vue Blancs quand les Noirs matent (Qh4#)", async () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
    const r = await engine.analyze(fen, { depth: 8, multipv: 1 });
    expect(r.lines[0].pvUci[0]).toBe("d8h4");
    expect(r.lines[0].evaluation).toEqual({ cp: null, mate: -1 });
  }, 60_000);

  it("évalue la position initiale proche de l'égalité", async () => {
    const r = await engine.analyze("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { depth: 10, multipv: 3 });
    expect(r.lines).toHaveLength(3);
    expect(Math.abs(r.lines[0].evaluation.cp ?? 999)).toBeLessThan(100);
    expect(r.lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(r.partial).toBeUndefined();
  }, 60_000);
});
