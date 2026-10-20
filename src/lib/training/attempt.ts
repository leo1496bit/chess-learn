import { z } from "zod";
import { Chess } from "chess.js";
import { evaluateCandidateMove } from "@/lib/analysis/game";
import { playUci } from "@/lib/analysis/lines";
import type { PositionAnalysis, Thresholds } from "@/lib/analysis/types";
import { ACCEPTED_LOSS } from "./select";

// Jugement d'une réponse d'exercice, fait côté serveur à partir des analyses Stockfish mises en
// cache par le navigateur (position_analyses). Le navigateur n'envoie que le coup joué : le verdict
// n'est jamais pris dans la requête.

export const AttemptBodySchema = z.object({
  exerciseId: z.uuid(),
  answerUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Coup UCI invalide"),
});

export type AttemptBody = z.infer<typeof AttemptBodySchema>;

export type Verdict = "good" | "inaccurate" | "error";

export type AttemptJudgement =
  | { ok: true; answerSan: string; correct: boolean; loss: number; verdict: Verdict; bestSan: string | null }
  | { ok: false; error: string };

/** Position obtenue après la réponse, ou null si le coup est illégal. */
export function positionAfter(fen: string, answerUci: string): { fenAfter: string; san: string } | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  const played = playUci(chess, answerUci);
  return played ? { fenAfter: chess.fen(), san: played.san } : null;
}

export function judgeAttempt(
  exercise: { fen: string; accepted_uci: readonly string[] },
  answerUci: string,
  before: PositionAnalysis,
  after: PositionAnalysis,
  thresholds: Thresholds,
): AttemptJudgement {
  const result = evaluateCandidateMove(exercise.fen, answerUci, before, after, thresholds);
  if (!result) return { ok: false, error: "Ce coup n'est pas légal dans la position de l'exercice." };
  const loss = Math.round(result.loss * 100) / 100;
  const correct = exercise.accepted_uci.includes(answerUci) || result.loss < ACCEPTED_LOSS;
  const verdict: Verdict = correct ? "good" : result.loss < thresholds.mistake ? "inaccurate" : "error";
  return { ok: true, answerSan: result.san, correct, loss, verdict, bestSan: result.bestSan };
}
