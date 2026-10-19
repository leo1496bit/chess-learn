import type { Color, EngineLine, Evaluation } from "@/lib/analysis/types";

// Parsing pur du protocole UCI (testé unitairement, sans Worker).

export type UciInfo = {
  depth: number;
  multipv: number;
  /** Score du point de vue du camp au trait, tel que renvoyé par UCI. */
  score: { type: "cp" | "mate"; value: number };
  pv: string[];
};

/**
 * Lit une ligne `info ... score ... pv ...`. Renvoie null pour les lignes sans score ni PV
 * (`info string`, `currmove`…) et pour les scores partiels (`lowerbound`/`upperbound`).
 */
export function parseInfoLine(line: string): UciInfo | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "info" || tokens[1] === "string") return null;

  let depth: number | null = null;
  let multipv = 1;
  let score: UciInfo["score"] | null = null;
  let pv: string[] | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "depth") depth = Number(tokens[++i]);
    else if (token === "multipv") multipv = Number(tokens[++i]);
    else if (token === "score") {
      const type = tokens[++i];
      const value = Number(tokens[++i]);
      if ((type === "cp" || type === "mate") && Number.isFinite(value)) score = { type, value };
      if (tokens[i + 1] === "lowerbound" || tokens[i + 1] === "upperbound") return null;
    } else if (token === "pv") {
      pv = tokens.slice(i + 1);
      break;
    }
  }

  if (depth === null || !Number.isFinite(depth) || !Number.isFinite(multipv) || !score || !pv || pv.length === 0) return null;
  return { depth, multipv, score, pv };
}

/** `bestmove e2e4 ponder e7e5` → "e2e4" ; `bestmove (none)` → null. Renvoie undefined si ce n'est pas une ligne bestmove. */
export function parseBestMove(line: string): string | null | undefined {
  const match = /^bestmove\s+(\S+)/.exec(line.trim());
  if (!match) return undefined;
  return match[1] === "(none)" ? null : match[1];
}

/** Normalise un score UCI (camp au trait) en évaluation point de vue Blancs. */
export function toWhitePerspective(score: UciInfo["score"], sideToMove: Color): Evaluation {
  const value = sideToMove === "w" ? score.value : -score.value;
  return score.type === "cp" ? { cp: value, mate: null } : { cp: null, mate: value };
}

/**
 * Accumule les lignes `info` d'une recherche et renvoie les lignes MultiPV de la
 * dernière profondeur complète (toutes les lignes attendues présentes).
 */
export class SearchCollector {
  private readonly byDepth = new Map<number, Map<number, UciInfo>>();

  constructor(
    private readonly sideToMove: Color,
    /** Nombre de lignes attendues : min(MultiPV, coups légaux). */
    private readonly expectedLines: number,
  ) {}

  push(line: string): boolean {
    const info = parseInfoLine(line);
    if (!info || info.multipv > this.expectedLines) return false;
    let lines = this.byDepth.get(info.depth);
    if (!lines) {
      lines = new Map();
      this.byDepth.set(info.depth, lines);
    }
    lines.set(info.multipv, info);
    return true;
  }

  /** Profondeur atteinte (complète) ou 0. */
  get completedDepth(): number {
    let best = 0;
    for (const [depth, lines] of this.byDepth) {
      if (lines.size >= this.expectedLines && depth > best) best = depth;
    }
    return best;
  }

  /** Lignes de la dernière profondeur complète, triées par multipv ; à défaut, la profondeur partielle la plus haute. */
  result(): EngineLine[] {
    let depth = this.completedDepth;
    if (depth === 0) depth = Math.max(0, ...this.byDepth.keys());
    const lines = this.byDepth.get(depth);
    if (!lines) return [];
    return [...lines.values()]
      .sort((a, b) => a.multipv - b.multipv)
      .map((info) => ({
        multipv: info.multipv,
        depth: info.depth,
        evaluation: toWhitePerspective(info.score, this.sideToMove),
        pvUci: info.pv,
      }));
  }
}
