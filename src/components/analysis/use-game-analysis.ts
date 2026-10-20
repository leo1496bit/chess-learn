"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeGame, getEngine, isAbortError, type AnalyzeGameProgress, type AnalyzeGameResult } from "@/lib/engine";
import { invalidateExplanationCache } from "@/components/ai/explanation-panel";
import { invalidateReportCache } from "@/components/ai/game-report-panel";
import type { Color, Thresholds } from "@/lib/analysis/types";

export type AnalysisRunState =
  | { status: "idle" }
  | { status: "running"; progress: AnalyzeGameProgress }
  | { status: "error"; message: string };

export type GameAnalysisParams = {
  gameId: string;
  pgn: string;
  playerColor: Color;
  depth: number;
  multipv: number;
  thresholds: Thresholds;
};

/** Lance l'analyse d'une partie dans le navigateur, avec progression et annulation. */
export function useGameAnalysis(onDone: (result: AnalyzeGameResult) => void) {
  const [state, setState] = useState<AnalysisRunState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  // Exécution en cours : une relance attend qu'elle ait fini (annulée) avant d'écrire à son tour.
  const runRef = useRef<Promise<unknown> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Quitter la page annule l'analyse en cours (le cache garde les positions déjà calculées).
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async (params: GameAnalysisParams) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "running", progress: { done: 0, total: 0, fromCache: 0, stage: "cache" } });
    const previousRun = runRef.current;
    if (previousRun) await previousRun.catch(() => undefined);
    if (controller.signal.aborted) return;
    try {
      const run = analyzeGame({
        ...params,
        engine: getEngine(),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setState({ status: "running", progress });
        },
      });
      runRef.current = run;
      const result = await run;
      if (controller.signal.aborted) return;
      setState({ status: "idle" });
      if (result.staleExplanations.length > 0) invalidateExplanationCache(params.gameId);
      // Toute nouvelle analyse rend le bilan existant périmé (empreinte analysis_created_at).
      invalidateReportCache(params.gameId);
      onDoneRef.current(result);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        setState({ status: "idle" });
        return;
      }
      setState({ status: "error", message: error instanceof Error ? error.message : "L'analyse a échoué. Relancez-la." });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { state, start, cancel };
}
