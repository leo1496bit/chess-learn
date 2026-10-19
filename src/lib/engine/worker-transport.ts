import { EngineError } from "./errors";
import type { TransportFactory } from "./engine";

export const STOCKFISH_WORKER_URL = "/stockfish/stockfish-19-lite-single.js";

/** Transport UCI via un Web Worker dédié (navigateur uniquement). */
export const workerTransport: TransportFactory = ({ onLine, onError }) => {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new EngineError("unsupported");

  const worker = new Worker(STOCKFISH_WORKER_URL);
  worker.onmessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data !== "string") return;
    for (const line of event.data.split("\n")) if (line) onLine(line);
  };
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault();
    onError(new EngineError("crash", event.message || undefined));
  };
  worker.onmessageerror = () => onError(new EngineError("crash", "message illisible"));

  return {
    send: (command) => worker.postMessage(command),
    terminate: () => worker.terminate(),
  };
};
