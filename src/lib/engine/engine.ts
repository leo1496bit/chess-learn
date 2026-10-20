import { Chess } from "chess.js";
import { terminalAnalysis } from "@/lib/analysis/terminal";
import { ENGINE_VERSION, type PositionAnalysis } from "@/lib/analysis/types";
import { EngineError } from "./errors";
import { SearchCollector, parseBestMove } from "./uci";

/** Canal UCI : Web Worker dans le navigateur, module npm `stockfish` dans les tests Node. */
export interface UciTransport {
  send(command: string): void;
  terminate(): void;
}

export type TransportFactory = (handlers: { onLine: (line: string) => void; onError: (error: EngineError) => void }) => UciTransport;

export type AnalyzeOptions = { depth: number; multipv: number; timeoutMs?: number; signal?: AbortSignal };

export interface StockfishEngine {
  analyze(fen: string, opts: AnalyzeOptions): Promise<PositionAnalysis>;
  stop(): void;
  terminate(): void;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
const INIT_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 3_000;

type Pending = { onLine: (line: string) => void; onError: (error: EngineError) => void };

/**
 * Moteur UCI : une seule recherche à la fois (file d'attente), dernière profondeur complète,
 * timeout avec `stop` et repli sur la meilleure profondeur atteinte, scores en point de vue Blancs.
 */
export class UciEngine implements StockfishEngine {
  private transport: UciTransport | null = null;
  private ready: Promise<void> | null = null;
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private multipv = 1;
  private searching = false;

  constructor(
    private readonly createTransport: TransportFactory,
    private readonly engineVersion = ENGINE_VERSION,
  ) {}

  analyze(fen: string, opts: AnalyzeOptions): Promise<PositionAnalysis> {
    const terminal = terminalAnalysis(fen, opts.depth, opts.multipv);
    if (terminal) return Promise.resolve({ ...terminal, engineVersion: this.engineVersion });

    const job = this.queue.then(() => this.search(fen, opts));
    this.queue = job.catch(() => undefined);
    return job;
  }

  stop(): void {
    if (this.searching) this.transport?.send("stop");
  }

  terminate(): void {
    const pending = this.pending;
    this.reset();
    pending?.onError(new EngineError("aborted", "moteur arrêté"));
  }

  private reset() {
    this.transport?.terminate();
    this.transport = null;
    this.ready = null;
    this.pending = null;
    this.searching = false;
    this.multipv = 1;
  }

  private handleLine(line: string) {
    this.pending?.onLine(line);
  }

  private handleError(error: EngineError) {
    const pending = this.pending;
    this.reset();
    pending?.onError(error);
  }

  /** Envoie des commandes et attend la ligne `expected` (ex. `uciok`, `readyok`). */
  private expect(commands: string[], expected: string, timeoutMs: number, code: "load" | "timeout"): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.reset();
        reject(new EngineError(code, `pas de « ${expected} »`));
      }, timeoutMs);
      this.pending = {
        onLine: (line) => {
          if (line.trim() !== expected) return;
          clearTimeout(timer);
          this.pending = null;
          resolve();
        },
        onError: (error) => {
          clearTimeout(timer);
          reject(code === "load" ? new EngineError("load", error.message) : error);
        },
      };
      for (const command of commands) this.transport?.send(command);
    });
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      try {
        this.transport = this.createTransport({
          onLine: (line) => this.handleLine(line),
          onError: (error) => this.handleError(error),
        });
      } catch (error) {
        this.reset();
        return Promise.reject(error instanceof EngineError ? error : new EngineError("load", String(error)));
      }
      this.ready = this.expect(["uci"], "uciok", INIT_TIMEOUT_MS, "load").then(() =>
        this.expect(["isready"], "readyok", INIT_TIMEOUT_MS, "load"),
      );
      this.ready.catch(() => this.reset());
    }
    return this.ready;
  }

  private async search(fen: string, opts: AnalyzeOptions): Promise<PositionAnalysis> {
    const { depth, multipv, signal } = opts;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (signal?.aborted) throw new EngineError("aborted");

    await this.ensureReady();
    if (this.multipv !== multipv) {
      await this.expect([`setoption name MultiPV value ${multipv}`, "isready"], "readyok", INIT_TIMEOUT_MS, "timeout");
      this.multipv = multipv;
    }
    if (signal?.aborted) throw new EngineError("aborted");

    const chess = new Chess(fen);
    const collector = new SearchCollector(chess.turn(), Math.min(multipv, chess.moves().length));

    await new Promise<void>((resolve, reject) => {
      let aborted = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(searchTimer);
        clearTimeout(graceTimer);
        signal?.removeEventListener("abort", onAbort);
        this.pending = null;
        this.searching = false;
      };
      const requestStop = () => {
        this.transport?.send("stop");
        graceTimer ??= setTimeout(() => {
          // Le moteur n'a pas répondu à `stop` : on le relance à la prochaine recherche.
          cleanup();
          this.reset();
          if (aborted) reject(new EngineError("aborted"));
          else if (collector.result().length > 0) resolve();
          else reject(new EngineError("timeout"));
        }, STOP_GRACE_MS);
      };
      const onAbort = () => {
        aborted = true;
        requestStop();
      };
      const searchTimer = setTimeout(requestStop, timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pending = {
        onLine: (line) => {
          if (collector.push(line)) return;
          if (parseBestMove(line) === undefined) return;
          cleanup();
          if (aborted) reject(new EngineError("aborted"));
          else resolve();
        },
        onError: (error) => {
          cleanup();
          reject(error);
        },
      };
      this.searching = true;
      this.transport?.send(`position fen ${fen}`);
      this.transport?.send(`go depth ${depth}`);
    });

    const lines = collector.result();
    if (lines.length === 0) throw new EngineError("no-result", fen);
    const analysis: PositionAnalysis = { fen, depth, multipv, engineVersion: this.engineVersion, lines };
    // Timeout avant la profondeur demandée : résultat marqué partiel, jamais mis en cache.
    if (collector.completedDepth < depth) analysis.partial = true;
    return analysis;
  }
}
