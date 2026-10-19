"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeGame, getEngine, isAbortError, type AnalyzeGameProgress } from "@/lib/engine";
import type { Color, GameAnalysisSummary, MoveAnalysis, Thresholds } from "@/lib/analysis/types";

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
  previousStatus: string;
};

/** Lance l'analyse d'une partie dans le navigateur, avec progression et annulation. */
export function useGameAnalysis(onDone: (result: { moves: MoveAnalysis[]; summary: GameAnalysisSummary }) => void) {
  const [state, setState] = useState<AnalysisRunState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
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
    try {
      const result = await analyzeGame({
        ...params,
        engine: getEngine(),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setState({ status: "running", progress });
        },
      });
      if (controller.signal.aborted) return;
      setState({ status: "idle" });
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
