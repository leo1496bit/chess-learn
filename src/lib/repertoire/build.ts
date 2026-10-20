// Création d'une ligne et étape de construction reprenable de son arbre. Orchestration sans HTTP :
// le stockage (Supabase en production, faux magasin en test) est injecté via `LineStore`.
// Aucun calcul moteur ici : les analyses manquantes sont renvoyées au navigateur (`needs`).
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import type { Color, PositionAnalysis } from "@/lib/analysis/types";
import type { ExplorerResult } from "@/lib/lichess/explorer";
import { identifyOpening, toEpd, type OpeningBook } from "@/lib/openings/identify";
import { EXPLORER_FETCHES_PER_STEP, MAX_PLY } from "./constants";
import { mergeBranches, type BranchMerge, type ExistingBranch } from "./merge";
import { buildTree, type AnalysisNeed, type TreeDeps, type TreeResult } from "./tree";

export const CUSTOM_LINE_NAME = "Ligne personnalisée";
export const LINE_START_ERROR = "La ligne doit commencer après un coup adverse";
const ILLEGAL_MOVE_ERROR = "La suite de coups contient un coup illégal.";
const UNKNOWN_POSITION_ERROR = "Position introuvable dans tes parties";
/**
 * Garde-fou : nombre maximal d'assemblages de l'arbre par étape. Un demi-coup en demande jusqu'à 3
 * (analyse et explorateur, candidats hors MultiPV, réponses adverses) ; la boucle s'arrête d'elle-même
 * dès qu'un assemblage n'apporte rien de nouveau.
 */
const MAX_ITERATIONS = 3 * MAX_PLY;
/** Plus aucun nouvel appel à l'explorateur (délai de 10 s par appel) au-delà de cette durée d'étape. */
export const BUILD_EXPLORER_CUTOFF_MS = 30_000;
/** Durée au-delà de laquelle l'étape s'arrête (limite Vercel de 60 s) ; la suivante reprend via les caches. */
export const BUILD_STEP_BUDGET_MS = 45_000;

export type LineStatus = "building" | "ready";

export type LineRecord = {
  id: string;
  name: string;
  eco: string | null;
  rootFen: string;
  prefixUci: string[];
  playerColor: Color;
  status: LineStatus;
  depth: number;
  multipv: number;
  explorerUnavailable: boolean;
};

export type NewLine = {
  name: string;
  eco: string | null;
  rootEpd: string;
  rootFen: string;
  prefixUci: string[];
  prefixSan: string[];
  playerColor: Color;
  depth: number;
  multipv: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
};

export type RootStats = { games: number; wins: number; draws: number; losses: number; topPath: string | null };

export type LinePatch = {
  status?: LineStatus;
  kind?: "punish" | "master" | null;
  builtAt?: string;
  explorerUnavailable?: boolean;
  depth?: number;
  multipv?: number;
};

export type ExplorerLookup = ExplorerResult | "missing" | "unavailable" | "unauthorized";
export type OwnReply = { uci: string; san: string; games: number };

export interface LineStore {
  findLineIdByRoot(rootEpd: string): Promise<string | null>;
  /** `null` si une ligne de même racine a été créée entre-temps (contrainte d'unicité). */
  insertLine(line: NewLine): Promise<string | null>;
  rootStats(epd: string): Promise<RootStats>;
  getLine(id: string): Promise<LineRecord | null>;
  updateLine(id: string, patch: LinePatch): Promise<void>;
  /** Analyses en cache (fen → analyse) à cette profondeur et ce MultiPV. */
  loadAnalyses(fens: string[], depth: number, multipv: number): Promise<Map<string, PositionAnalysis>>;
  /** Réponses adverses observées dans ses parties (RPC `opening_reply_stats`). */
  replyStats(epd: string): Promise<OwnReply[]>;
  explorer(epd: string, budget: { left: number }): Promise<ExplorerLookup>;
  listBranches(lineId: string): Promise<ExistingBranch[]>;
  applyMerge(lineId: string, merge: BranchMerge): Promise<void>;
}

// --- Création -------------------------------------------------------------------------------

export type CreateLineBody =
  | { source: "suggestion"; epd: string }
  | { source: "manual"; uci: string[]; playerColor: Color };

export type CreateLineResult =
  | { ok: true; status: 200 | 201; id: string; existing: boolean }
  | { ok: false; status: 400 | 404; error: string };

type Replayed = { fens: string[]; sans: string[] };

/** Rejoue la suite depuis la position initiale avec chess.js ; `null` au premier coup illégal. */
function replay(uci: readonly string[]): Replayed | null {
  const chess = new Chess();
  const fens = [chess.fen()];
  const sans: string[] = [];
  for (const move of uci) {
    const played = playUci(chess, move);
    if (!played) return null;
    fens.push(chess.fen());
    sans.push(played.san);
  }
  return { fens, sans };
}

export async function createLine(
  store: LineStore,
  body: CreateLineBody,
  deps: { book: OpeningBook; depth: number; multipv: number },
): Promise<CreateLineResult> {
  let prefixUci: string[];
  let stats: RootStats | null = null;
  if (body.source === "suggestion") {
    stats = await store.rootStats(body.epd);
    prefixUci = (stats.topPath ?? "").split(" ").filter(Boolean);
    // Chemin vide : la position initiale, qui ne suit aucun coup adverse.
    if (stats.games === 0 || prefixUci.length === 0) return { ok: false, status: 404, error: UNKNOWN_POSITION_ERROR };
  } else {
    prefixUci = body.uci;
  }

  const replayed = replay(prefixUci);
  if (!replayed) return { ok: false, status: 400, error: ILLEGAL_MOVE_ERROR };
  const rootFen = replayed.fens[replayed.fens.length - 1];
  const sideToMove = new Chess(rootFen).turn();
  // La racine suit un coup adverse : Leonel est au trait (hypothèse de `buildTree` et `lineKind`).
  if (prefixUci.length === 0 || (body.source === "manual" && sideToMove !== body.playerColor)) {
    return { ok: false, status: 400, error: LINE_START_ERROR };
  }
  const playerColor: Color = sideToMove;
  const rootEpd = toEpd(rootFen);

  const existing = await store.findLineIdByRoot(rootEpd);
  if (existing) return { ok: true, status: 200, id: existing, existing: true };

  stats ??= await store.rootStats(rootEpd);
  const opening = identifyOpening(replayed.fens, replayed.sans, playerColor, deps.book);
  const id = await store.insertLine({
    name: opening.name ?? CUSTOM_LINE_NAME,
    eco: opening.name ? opening.eco : null,
    rootEpd,
    rootFen,
    prefixUci,
    prefixSan: replayed.sans,
    playerColor,
    depth: deps.depth,
    multipv: deps.multipv,
    games: stats.games,
    wins: stats.wins,
    draws: stats.draws,
    losses: stats.losses,
  });
  if (id) return { ok: true, status: 201, id, existing: false };
  // Création concurrente de la même racine : on renvoie la ligne déjà enregistrée.
  const raced = await store.findLineIdByRoot(rootEpd);
  if (!raced) throw new Error("Ligne introuvable après un conflit d'unicité");
  return { ok: true, status: 200, id: raced, existing: true };
}

// --- Construction ---------------------------------------------------------------------------

/**
 * Le navigateur doit analyser chaque `needs` à la profondeur `depth` de cette réponse (MultiPV indiqué
 * par chaque besoin), pas à celle d'une copie locale de la ligne : une mise à jour (`/rebuild`) peut
 * l'avoir changée. `multipv` est celui de la ligne (positions où Leonel joue).
 */
export type BuildStepResult = {
  status: LineStatus;
  needs: AnalysisNeed[];
  progress: { branches: number; pending: number };
  explorerUnavailable: boolean;
  depth: number;
  multipv: number;
};

/**
 * Une étape de construction : assemble l'arbre avec les données disponibles, charge ce qui manque
 * (cache d'analyses, réponses de ses parties, explorateur avec un budget d'appels) et recommence tant
 * que l'étape apporte du nouveau. Renvoie les analyses que le navigateur doit encore calculer.
 * Quand l'arbre est complet, fusionne les branches et passe la ligne à « ready ».
 */
export async function buildStep(
  store: LineStore,
  deps: { book: OpeningBook; now: Date; clock?: () => number },
  line: LineRecord,
): Promise<BuildStepResult> {
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const elapsed = () => clock() - startedAt;
  const settings = { depth: line.depth, multipv: line.multipv };
  if (line.status === "ready") {
    const branches = await store.listBranches(line.id);
    return {
      status: "ready",
      needs: [],
      progress: { branches: branches.filter((b) => !b.archived).length, pending: 0 },
      explorerUnavailable: line.explorerUnavailable,
      ...settings,
    };
  }

  const analyses = new Map<string, PositionAnalysis>();
  const lookedUp = new Set<string>();
  const own = new Map<string, OwnReply[]>();
  const explorer = new Map<string, ExplorerResult | null>();
  const explorerTried = new Set<string>();
  const budget = { left: EXPLORER_FETCHES_PER_STEP };
  let unauthorized = false;

  const treeDeps: TreeDeps = {
    analysis: (fen, multipv) => analyses.get(`${fen}|${multipv}`),
    ownReplies: (epd) => own.get(epd),
    explorer: (epd) => (explorer.has(epd) ? explorer.get(epd) : undefined),
    book: deps.book,
  };
  const root = {
    fen: line.rootFen,
    ply: line.prefixUci.length,
    playerColor: line.playerColor,
    prefixUci: line.prefixUci,
    bookName: line.name === CUSTOM_LINE_NAME ? null : line.name,
  };
  const assemble = () => buildTree(root, treeDeps, line.multipv);

  /** Charge les données manquantes jamais demandées pendant l'étape ; `true` si du nouveau est arrivé. */
  async function resolve(result: TreeResult): Promise<boolean> {
    let progressed = false;

    const byMultipv = new Map<number, string[]>();
    for (const need of result.needs) {
      const key = `${need.fen}|${need.multipv}`;
      if (lookedUp.has(key)) continue;
      lookedUp.add(key);
      byMultipv.set(need.multipv, [...(byMultipv.get(need.multipv) ?? []), need.fen]);
    }

    const ownTasks: Promise<void>[] = [];
    const explorerTasks: Promise<void>[] = [];
    for (const epd of result.needsReplies) {
      // Les réponses de ses parties ne servent qu'aux positions où l'adversaire est au trait.
      const opponentToMove = epd.split(" ")[1] !== line.playerColor;
      if (opponentToMove && !own.has(epd)) {
        own.set(epd, []);
        ownTasks.push(
          store.replyStats(epd).then((replies) => {
            own.set(epd, replies);
          }),
        );
        progressed = true;
      }
      if (explorer.has(epd) || explorerTried.has(epd)) continue;
      if (unauthorized) {
        explorerTried.add(epd);
        explorer.set(epd, null);
        progressed = true;
        continue;
      }
      // Trop tard pour un appel de 10 s : la position reste à demander à l'étape suivante.
      if (elapsed() >= BUILD_EXPLORER_CUTOFF_MS) continue;
      explorerTried.add(epd);
      explorerTasks.push(
        store.explorer(epd, budget).then((found) => {
          if (found === "missing") return; // 429 ou budget épuisé : nouvelle tentative à l'étape suivante
          if (found === "unauthorized") unauthorized = true;
          explorer.set(epd, found === "unauthorized" || found === "unavailable" ? null : found);
          progressed = true;
        }),
      );
    }

    const analysisTasks = [...byMultipv].map(([multipv, fens]) =>
      store.loadAnalyses(fens, line.depth, multipv).then((found) => {
        for (const [fen, analysis] of found) {
          analyses.set(`${fen}|${multipv}`, analysis);
          progressed = true;
        }
      }),
    );

    await Promise.all([...analysisTasks, ...ownTasks, ...explorerTasks]);
    // Après un 401, l'explorateur est ignoré pour le reste de l'étape.
    if (unauthorized) {
      for (const epd of result.needsReplies) {
        if (!explorer.has(epd)) {
          explorer.set(epd, null);
          explorerTried.add(epd);
          progressed = true;
        }
      }
    }
    return progressed;
  }

  let result = assemble();
  for (let i = 0; i < MAX_ITERATIONS && !result.complete && elapsed() < BUILD_STEP_BUDGET_MS; i++) {
    if (!(await resolve(result))) break;
    result = assemble();
  }

  const patch: LinePatch = {};
  if (unauthorized && !line.explorerUnavailable) patch.explorerUnavailable = true;
  if (result.complete) {
    const existing = await store.listBranches(line.id);
    await store.applyMerge(line.id, mergeBranches(existing, result.branches));
    Object.assign(patch, { status: "ready", kind: result.kind, builtAt: deps.now.toISOString() });
  }
  if (Object.keys(patch).length > 0) await store.updateLine(line.id, patch);

  return {
    status: result.complete ? "ready" : "building",
    needs: result.needs,
    progress: { branches: result.branches.length, pending: result.needs.length },
    explorerUnavailable: line.explorerUnavailable || unauthorized,
    ...settings,
  };
}

/** Repasse la ligne en construction avec la profondeur et le MultiPV actuels ; `false` si introuvable. */
export async function rebuildLine(
  store: LineStore,
  id: string,
  settings: { depth: number; multipv: number },
): Promise<boolean> {
  const line = await store.getLine(id);
  if (!line) return false;
  await store.updateLine(id, { status: "building", depth: settings.depth, multipv: settings.multipv });
  return true;
}
