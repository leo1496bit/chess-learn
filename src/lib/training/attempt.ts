import { z } from "zod";
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import { ACCEPTED_LOSS } from "./select";

// Validation serveur d'une réponse d'exercice. Le jugement vient de Stockfish dans le
// navigateur ; le serveur vérifie la légalité du coup et la cohérence du verdict.

export const AttemptBodySchema = z.object({
  exerciseId: z.uuid(),
  answerUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Coup UCI invalide"),
  correct: z.boolean(),
  loss: z.number().min(0).max(100).nullable(),
});

export type AttemptBody = z.infer<typeof AttemptBodySchema>;

export type AttemptCheck =
  | { ok: true; answerSan: string; correct: boolean }
  | { ok: false; error: string };

export function checkAttempt(
  exercise: { fen: string; accepted_uci: readonly string[] },
  body: Pick<AttemptBody, "answerUci" | "correct" | "loss">,
): AttemptCheck {
  let chess: Chess;
  try {
    chess = new Chess(exercise.fen);
  } catch {
    return { ok: false, error: "La position de l'exercice est invalide." };
  }
  const played = playUci(chess, body.answerUci);
  if (!played) return { ok: false, error: "Ce coup n'est pas légal dans la position de l'exercice." };

  if (exercise.accepted_uci.includes(body.answerUci)) {
    if (!body.correct) return { ok: false, error: "Verdict incohérent : ce coup fait partie des réponses acceptées." };
  } else if (body.correct && (body.loss === null || body.loss >= ACCEPTED_LOSS)) {
    return {
      ok: false,
      error: `Verdict incohérent : un coup hors solution n'est correct que si sa perte est inférieure à ${ACCEPTED_LOSS}.`,
    };
  }
  return { ok: true, answerSan: played.san, correct: body.correct };
}
