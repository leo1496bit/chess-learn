"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ArrowDownUp, SkipForward } from "lucide-react";
import { ChessBoard, ARROW_COLORS, type BoardArrow } from "@/components/chess/chess-board";
import { EvalBar } from "@/components/chess/eval-bar";
import { MoveList, type MoveListItem } from "@/components/chess/move-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameReportPanel } from "@/components/ai/game-report-panel";
import { moveLinkKey, type MoveLink } from "@/lib/ai/move-links";
import { theoryForPly, type OpeningReport } from "@/lib/openings/identify";
import { toast } from "sonner";
import { isErrorClassification } from "@/lib/analysis/classify";
import { extractPositions } from "@/lib/analysis/game";
import type { Color, EngineSettings, GameAnalysisSummary, MoveAnalysis, Thresholds } from "@/lib/analysis/types";
import { AnalyzePanel } from "./analyze-panel";
import { EvalGraph } from "./eval-graph";
import { GameSummary } from "./game-summary";
import { MoveDetails } from "./move-details";
import { OpeningSummary } from "./opening-summary";
import { useGameAnalysis } from "./use-game-analysis";

export type GameViewData = {
  id: string;
  pgn: string;
  white: string;
  black: string;
  playerColor: Color;
  analysisStatus: string;
};

const isFlagged = (m: MoveAnalysis) => isErrorClassification(m.classification) || m.missedWin;

function arrowsFor(move: MoveAnalysis | undefined): BoardArrow[] {
  if (!move) return [];
  const played: BoardArrow = {
    from: move.uci.slice(0, 2),
    to: move.uci.slice(2, 4),
    color: isFlagged(move) ? ARROW_COLORS.played : ARROW_COLORS.neutral,
  };
  if (!move.bestUci || move.bestUci === move.uci || move.classification === "best" || move.classification === "forced") return [played];
  return [played, { from: move.bestUci.slice(0, 2), to: move.bestUci.slice(2, 4), color: ARROW_COLORS.best }];
}

const PREVIEW_SOURCE: Record<MoveLink["source"], (link: MoveLink) => string> = {
  played: () => "coup de la partie",
  candidate: (link) => (link.rank === 1 ? "variante du meilleur coup" : `variante du candidat ${link.rank}`),
  reply: () => "suite attendue après le coup joué",
};

/** « 3. Bb5 » ou « 3... a6 », d'après la position avant le coup. */
function previewLabel(link: MoveLink): string {
  const [, side, , , , fullmove] = link.fen.split(" ");
  return `${fullmove ?? ""}${side === "b" ? "..." : "."} ${link.san}`;
}

function previewArrows(link: MoveLink): BoardArrow[] {
  return [{ from: link.uci.slice(0, 2), to: link.uci.slice(2, 4), color: link.source === "reply" ? ARROW_COLORS.played : ARROW_COLORS.best }];
}

function theoryItem(opening: OpeningReport | null, ply: number): MoveListItem["theory"] {
  if (!opening) return undefined;
  const theory = theoryForPly(opening, ply);
  if (theory.kind === "book") return { kind: "book", name: theory.name };
  if (theory.kind === "deviation") return { kind: "deviation" };
  return undefined;
}

export function GameAnalysisView({
  game,
  initialMoves,
  initialSummary,
  analyzedWith: initialAnalyzedWith,
  engineSettings,
  thresholds,
  opening,
}: {
  game: GameViewData;
  /** Ouverture identifiée côté serveur par le livre d'ouvertures (null si le PGN est illisible). */
  opening: OpeningReport | null;
  initialMoves: MoveAnalysis[] | null;
  initialSummary: GameAnalysisSummary | null;
  analyzedWith: EngineSettings | null;
  engineSettings: EngineSettings;
  thresholds: Thresholds;
}) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, ...extractPositions(game.pgn) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "PGN illisible" };
    }
  }, [game.pgn]);

  const [analysis, setAnalysis] = useState(() =>
    initialMoves && initialSummary ? { moves: initialMoves, summary: initialSummary, settings: initialAnalyzedWith } : null,
  );
  const [ply, setPly] = useState(0);
  const [tab, setTab] = useState<"move" | "report">("move");
  // Coup cité dans une explication, affiché sur l'échiquier à la place de la position de la partie.
  const [preview, setPreview] = useState<MoveLink | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">(game.playerColor === "w" ? "white" : "black");

  const { state, start, cancel } = useGameAnalysis((result) => {
    setAnalysis({ moves: result.moves, summary: result.summary, settings: engineSettings });
    if (result.partialPositions > 0) {
      toast.warning(
        `${result.partialPositions} position${result.partialPositions > 1 ? "s ont" : " a"} été analysée${result.partialPositions > 1 ? "s" : ""} moins profondément (délai dépassé). Relance l'analyse pour les recalculer.`,
      );
    }
  });

  const fens = parsed.ok ? parsed.fens : [];
  const lastPly = Math.max(0, fens.length - 1);
  const moves = analysis?.moves ?? null;
  const current = ply > 0 ? moves?.[ply - 1] : undefined;

  const go = useCallback(
    (target: number) => {
      setPreview(null);
      setPly(Math.max(0, Math.min(lastPly, target)));
    },
    [lastPly],
  );
  const nextError = useMemo(() => {
    if (!moves) return null;
    return moves.find((m) => m.ply > ply && m.isPlayerMove && isFlagged(m)) ?? moves.find((m) => m.isPlayerMove && isFlagged(m)) ?? null;
  }, [moves, ply]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const actions: Record<string, () => void> = {
        Escape: () => setPreview(null),
        ArrowLeft: () => go(ply - 1),
        ArrowRight: () => go(ply + 1),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, ply]);

  if (!parsed.ok) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        Cette partie ne peut pas être rejouée : {parsed.message}. Réimportez-la depuis la page Mes parties.
      </p>
    );
  }

  const listItems: MoveListItem[] = parsed.moves.map((m, i) => ({
    ply: m.ply,
    san: m.san,
    classification: moves?.[i]?.classification,
    missedWin: moves?.[i]?.missedWin,
    isPlayerMove: m.color === game.playerColor,
    theory: theoryItem(opening, m.ply),
  }));
  const sanByPly = new Map(parsed.moves.map((m) => [m.ply, m.san]));
  // Depuis le bilan : afficher le coup sur l'échiquier et son détail.
  const showPly = (target: number) => {
    go(target);
    setTab("move");
  };
  const evaluation = moves ? (ply === 0 ? moves[0]?.evalBefore : current?.evalAfter) ?? null : null;
  const sideToMove = (fens[ply]?.split(" ")[1] ?? "w") as Color;
  const playedSquares = ply > 0 ? [parsed.moves[ply - 1].uci.slice(0, 2), parsed.moves[ply - 1].uci.slice(2, 4)] : [];
  const playerName = game.playerColor === "w" ? game.white : game.black;
  const opponentName = game.playerColor === "w" ? game.black : game.white;

  const startAnalysis = () =>
    start({
      gameId: game.id,
      pgn: game.pgn,
      playerColor: game.playerColor,
      depth: engineSettings.depth,
      multipv: engineSettings.multipv,
      thresholds,
    });

  return (
    <div className="space-y-6">
      {opening ? <OpeningSummary opening={opening} onSelectPly={showPly} /> : null}
      {analysis ? <GameSummary summary={analysis.summary} playerName={playerName} opponentName={opponentName} /> : null}
      <AnalyzePanel
        state={state}
        positions={fens.length}
        settings={engineSettings}
        analyzedWith={analysis ? (analysis.settings ?? engineSettings) : null}
        onStart={startAnalysis}
        onCancel={cancel}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start">
        {/*
          L'échiquier reste visible pendant la lecture des explications :
          - grand écran : toute la colonne est collante, à une taille qui tient dans la hauteur de l'écran ;
          - mobile : l'échiquier et la navigation restent épinglés sous l'en-tête, à environ 40 % de la hauteur.
        */}
        <div className="space-y-3 lg:sticky lg:top-6 lg:max-w-[calc(100dvh-14rem)] lg:self-start">
          <div className="sticky top-14 z-20 -mx-4 space-y-2 bg-background/95 px-4 pt-2 pb-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:space-y-3 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-[min(100%,40dvh)] flex-col gap-2 lg:max-w-none lg:flex-row">
            <EvalBar evaluation={evaluation} orientation={orientation} sideToMove={sideToMove} className={moves ? undefined : "opacity-40"} />
            <ChessBoard
              id={`game-${game.id}`}
              fen={preview?.fen ?? fens[ply]}
              orientation={orientation}
              arrows={preview ? previewArrows(preview) : moves ? arrowsFor(current) : []}
              highlightSquares={preview ? undefined : playedSquares}
            />
          </div>

          <nav aria-label="Navigation dans la partie" className="flex flex-wrap items-center justify-center gap-1 lg:justify-start lg:pl-9">
            <Button variant="outline" size="icon" aria-label="Premier coup" onClick={() => go(0)} disabled={ply === 0}>
              <ChevronFirst />
            </Button>
            <Button variant="outline" size="icon" aria-label="Coup précédent" onClick={() => go(ply - 1)} disabled={ply === 0}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" aria-label="Coup suivant" onClick={() => go(ply + 1)} disabled={ply === lastPly}>
              <ChevronRight />
            </Button>
            <Button variant="outline" size="icon" aria-label="Dernier coup" onClick={() => go(lastPly)} disabled={ply === lastPly}>
              <ChevronLast />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Retourner l'échiquier" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
              <ArrowDownUp />
            </Button>
            {nextError ? (
              <Button variant="secondary" className="ml-auto" onClick={() => go(nextError.ply)}>
                <SkipForward data-icon="inline-start" />
                Erreur suivante
              </Button>
            ) : null}
          </nav>
          {preview ? (
            <p
              role="status"
              className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-accent px-3 py-2 text-sm lg:ml-9 lg:justify-start"
            >
              <span>
                Aperçu : <span className="tabular font-semibold">{previewLabel(preview)}</span>
                <span className="text-muted-foreground"> ({PREVIEW_SOURCE[preview.source](preview)})</span>
              </span>
              <button type="button" onClick={() => setPreview(null)} className="font-medium text-primary underline-offset-4 hover:underline">
                Revenir à la partie
              </button>
            </p>
          ) : null}
          </div>

          {moves ? (
            <div className="pt-2 lg:pl-9">
              <EvalGraph moves={moves} currentPly={ply} onSelect={go} />
            </div>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value === "report" ? "report" : "move")} className="gap-4">
          <TabsList>
            <TabsTrigger value="move">Coup par coup</TabsTrigger>
            <TabsTrigger value="report">Bilan de la partie</TabsTrigger>
          </TabsList>
          <TabsContent value="move" className="space-y-6">
            {moves ? (
              <div className="rounded-lg border bg-card p-4 sm:p-5">
                <MoveDetails
                  move={current ?? null}
                  gameId={game.id}
                  theory={opening && ply > 0 ? theoryForPly(opening, ply) : null}
                  onPreviewMove={setPreview}
                  previewKey={preview ? moveLinkKey(preview) : null}
                />
              </div>
            ) : null}
            <div className="rounded-lg border bg-card">
              <MoveList moves={listItems} currentPly={ply} onSelect={go} className="max-h-[28rem]" />
            </div>
          </TabsContent>
          <TabsContent value="report">
            <div className="rounded-lg border bg-card p-4 sm:p-5">
              <GameReportPanel
                gameId={game.id}
                analyzed={analysis !== null}
                sanByPly={sanByPly}
                onSelectPly={showPly}
                moves={moves}
                thresholds={thresholds}
                onPreviewMove={setPreview}
                previewKey={preview ? moveLinkKey(preview) : null}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
