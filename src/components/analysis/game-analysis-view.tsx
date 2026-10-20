"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ArrowDownUp, SkipForward } from "lucide-react";
import { ChessBoard, ARROW_COLORS, type BoardArrow } from "@/components/chess/chess-board";
import { EvalBar } from "@/components/chess/eval-bar";
import { MoveList, type MoveListItem } from "@/components/chess/move-list";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isErrorClassification } from "@/lib/analysis/classify";
import { extractPositions } from "@/lib/analysis/game";
import type { Color, EngineSettings, GameAnalysisSummary, MoveAnalysis, Thresholds } from "@/lib/analysis/types";
import { AnalyzePanel } from "./analyze-panel";
import { EvalGraph } from "./eval-graph";
import { GameSummary } from "./game-summary";
import { MoveDetails } from "./move-details";
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

export function GameAnalysisView({
  game,
  initialMoves,
  initialSummary,
  analyzedWith: initialAnalyzedWith,
  engineSettings,
  thresholds,
}: {
  game: GameViewData;
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

  const go = useCallback((target: number) => setPly(Math.max(0, Math.min(lastPly, target))), [lastPly]);
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
  }));
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
        <div className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <EvalBar evaluation={evaluation} orientation={orientation} sideToMove={sideToMove} className={moves ? undefined : "opacity-40"} />
            <ChessBoard
              id={`game-${game.id}`}
              fen={fens[ply]}
              orientation={orientation}
              arrows={moves ? arrowsFor(current) : []}
              highlightSquares={playedSquares}
            />
          </div>

          <nav aria-label="Navigation dans la partie" className="flex flex-wrap items-center gap-1 lg:pl-9">
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

          {moves ? (
            <div className="pt-2 lg:pl-9">
              <EvalGraph moves={moves} currentPly={ply} onSelect={go} />
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {moves ? (
            <div className="rounded-lg border bg-card p-4 sm:p-5">
              <MoveDetails move={current ?? null} gameId={game.id} />
            </div>
          ) : null}
          <div className="rounded-lg border bg-card">
            <MoveList moves={listItems} currentPly={ply} onSelect={go} className="max-h-[28rem]" />
          </div>
        </div>
      </div>
    </div>
  );
}
