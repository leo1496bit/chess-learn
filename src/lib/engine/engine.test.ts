import { describe, expect, it } from "vitest";
import { UciEngine, type TransportFactory } from "./engine";
import { EngineError } from "./errors";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const MATED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

type FakeOptions = { hangOnGo?: boolean; ignoreStop?: boolean; crashOnGo?: boolean };

/** Faux moteur UCI scripté : enregistre les commandes reçues. */
function fakeTransport(options: FakeOptions = {}) {
  const commands: string[] = [];
  let created = 0;
  const factory: TransportFactory = ({ onLine, onError }) => {
    created++;
    let multipv = 1;
    const emit = (line: string) => queueMicrotask(() => onLine(line));
    return {
      send(command) {
        commands.push(command);
        if (command === "uci") emit("uciok");
        else if (command === "isready") emit("readyok");
        else if (command.startsWith("setoption name MultiPV")) multipv = Number(command.split(" ").pop());
        else if (command.startsWith("go")) {
          if (options.crashOnGo) {
            queueMicrotask(() => onError(new EngineError("crash", "test")));
            return;
          }
          for (let k = 1; k <= multipv; k++) emit(`info depth 1 multipv ${k} score cp ${40 - k} pv e2e4`);
          if (options.hangOnGo) return;
          for (let k = 1; k <= multipv; k++) emit(`info depth 2 multipv ${k} score cp ${50 - k} pv ${k === 1 ? "e2e4 e7e5" : "d2d4 d7d5"}`);
          emit("bestmove e2e4");
        } else if (command === "stop" && !options.ignoreStop) emit("bestmove e2e4");
      },
      terminate() {},
    };
  };
  return { factory, commands, created: () => created };
}

describe("UciEngine", () => {
  it("initialise en UCI puis analyse avec MultiPV", async () => {
    const fake = fakeTransport();
    const engine = new UciEngine(fake.factory);
    const r = await engine.analyze(START, { depth: 2, multipv: 2 });
    expect(fake.commands.slice(0, 2)).toEqual(["uci", "isready"]);
    expect(fake.commands).toContain("setoption name MultiPV value 2");
    expect(fake.commands).toContain(`position fen ${START}`);
    expect(fake.commands).toContain("go depth 2");
    expect(r.lines.map((l) => l.depth)).toEqual([2, 2]);
    expect(r.lines[0].evaluation).toEqual({ cp: 49, mate: null });
    expect(r.engineVersion).toBe("sf19-lite-single");
  });

  it("normalise les scores quand les Noirs sont au trait", async () => {
    const engine = new UciEngine(fakeTransport().factory);
    const r = await engine.analyze(BLACK_TO_MOVE, { depth: 2, multipv: 1 });
    expect(r.lines[0].evaluation).toEqual({ cp: -49, mate: null });
  });

  it("évalue une position matée sans appeler le moteur", async () => {
    const fake = fakeTransport();
    const r = await new UciEngine(fake.factory).analyze(MATED, { depth: 16, multipv: 3 });
    expect(r.terminal).toEqual({ evaluation: { cp: null, mate: 0 }, reason: "checkmate" });
    expect(fake.created()).toBe(0);
  });

  it("exécute les recherches une par une", async () => {
    const fake = fakeTransport();
    const engine = new UciEngine(fake.factory);
    const results = await Promise.all([
      engine.analyze(START, { depth: 2, multipv: 1 }),
      engine.analyze(BLACK_TO_MOVE, { depth: 2, multipv: 1 }),
    ]);
    expect(results.map((r) => r.fen)).toEqual([START, BLACK_TO_MOVE]);
    const gos = fake.commands.map((c, i) => [c, i] as const).filter(([c]) => c.startsWith("position"));
    expect(gos).toHaveLength(2);
    expect(fake.created()).toBe(1);
  });

  it("au timeout, envoie stop et garde la dernière profondeur complète", async () => {
    const fake = fakeTransport({ hangOnGo: true });
    const r = await new UciEngine(fake.factory).analyze(START, { depth: 20, multipv: 1, timeoutMs: 20 });
    expect(fake.commands).toContain("stop");
    expect(r.lines[0].depth).toBe(1);
    // Profondeur demandée non atteinte : résultat partiel, jamais mis en cache.
    expect(r.partial).toBe(true);
  });

  it("ne marque pas partielle une recherche qui atteint la profondeur demandée", async () => {
    const r = await new UciEngine(fakeTransport().factory).analyze(START, { depth: 2, multipv: 2 });
    expect(r.partial).toBeUndefined();
  });

  it("annule une recherche via AbortSignal", async () => {
    const fake = fakeTransport({ hangOnGo: true });
    const engine = new UciEngine(fake.factory);
    const controller = new AbortController();
    const pending = engine.analyze(START, { depth: 20, multipv: 1, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    // Le moteur reste utilisable après l'annulation.
    await expect(engine.analyze(START, { depth: 20, multipv: 1, timeoutMs: 10 })).resolves.toBeTruthy();
  });

  it("signale un crash du worker et redémarre à la recherche suivante", async () => {
    const crashing = fakeTransport({ crashOnGo: true });
    const engine = new UciEngine(crashing.factory);
    await expect(engine.analyze(START, { depth: 2, multipv: 1 })).rejects.toMatchObject({ code: "crash" });
    await expect(engine.analyze(START, { depth: 2, multipv: 1 })).rejects.toMatchObject({ code: "crash" });
    expect(crashing.created()).toBe(2);
  });

  it("signale un moteur qui ne se charge pas", async () => {
    const engine = new UciEngine(() => {
      throw new EngineError("load", "wasm absent");
    });
    await expect(engine.analyze(START, { depth: 2, multipv: 1 })).rejects.toMatchObject({ code: "load" });
  });
});
