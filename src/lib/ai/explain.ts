import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MoveAnalysis } from "@/lib/analysis/types";
import { AiError, callStructured, toAiError, type AttemptResult, type MessagesClient } from "./call";
import { checkLimits, type AiLimitSettings } from "./limits";
import { EMPTY_USAGE, estimateCost } from "./pricing";
import { SYSTEM_PROMPT, buildRetryReminder, buildUserMessage, type GameContext } from "./prompt";
import { ExplanationSchema, type Explanation, type ExplanationResponse } from "./schema";
import type { ExplanationStore, UsageStatus } from "./store";
import { allowedMovesFor, verifyExplanation } from "./verify";

export const MAX_TOKENS = 2500;

const outputFormat = zodOutputFormat(ExplanationSchema);

const callOnce = (client: MessagesClient, userMessage: string): Promise<AttemptResult<Explanation>> =>
  callStructured(client, { system: SYSTEM_PROMPT, user: userMessage, format: outputFormat, maxTokens: MAX_TOKENS });

export type ExplainInput = {
  gameId: string;
  move: MoveAnalysis;
  game: GameContext;
  settings: AiLimitSettings;
  store: ExplanationStore;
  client: MessagesClient;
  now?: Date;
};

/**
 * Cache → limites → appel → vérification des coups → (1 nouvelle tentative) → stockage.
 * Chaque appel à l'API produit une ligne ai_usage, y compris les erreurs et les refus.
 */
export async function explainMove(input: ExplainInput): Promise<ExplanationResponse> {
  const { gameId, move, game, settings, store, client } = input;
  const now = input.now ?? new Date();

  const cached = await store.findCached(gameId, move.ply);
  // Une explication non vérifiée n'est pas fiable : la demander à nouveau relance la génération.
  if (cached?.verified) return { explanation: cached.explanation, cached: true, verified: true };

  const usage = await store.usageSummary(now);
  let callsToday = usage.callsToday;
  let costMonth = usage.costMonth;
  const ensureAllowed = () => {
    const decision = checkLimits(settings, { callsToday, costMonth });
    if (!decision.allowed) {
      throw new AiError(decision.message, 429, decision.reason === "disabled" ? "ai_disabled" : "limit_reached");
    }
  };
  ensureAllowed();

  const allowed = allowedMovesFor(move);
  const baseMessage = buildUserMessage(move, game);

  const attempt = async (userMessage: string): Promise<AttemptResult<Explanation>> => {
    let result: AttemptResult<Explanation>;
    try {
      result = await callOnce(client, userMessage);
    } catch (error) {
      const explainError = toAiError(error);
      await store.recordUsage({ status: "error", ...EMPTY_USAGE, costUsd: 0, error: explainError.message });
      throw explainError;
    }
    const costUsd = estimateCost(result.usage);
    callsToday += 1;
    costMonth += costUsd;
    let status: UsageStatus = "ok";
    let errorText: string | null = null;
    if (result.kind === "refused") {
      status = "refused";
      errorText = "stop_reason: refusal";
    } else if (result.kind === "truncated") {
      status = "error";
      errorText = "stop_reason: max_tokens";
    } else if (result.kind === "invalid_output") {
      status = "error";
      errorText = `sortie invalide : ${result.detail}`;
    } else {
      const check = verifyExplanation(result.value, allowed);
      if (!check.valid) {
        status = "unverified";
        errorText = `coups non fournis : ${check.invalid.join(", ")}`;
      }
    }
    await store.recordUsage({ status, ...result.usage, costUsd, error: errorText });
    return result;
  };

  const first = await attempt(baseMessage);
  if (first.kind === "refused") {
    throw new AiError(
      "Claude a refusé d'expliquer ce coup. Consulte les variantes Stockfish affichées ou réessaie plus tard.",
      502,
      "upstream",
    );
  }
  if (first.kind === "truncated") {
    throw new AiError("La réponse de Claude a été tronquée (limite de longueur). Réessaie : la génération varie d'un appel à l'autre.", 502, "upstream");
  }

  let explanation: Explanation | null = first.kind === "parsed" ? first.value : null;
  const invalidMoves = explanation ? verifyExplanation(explanation, allowed).invalid : [];
  let verified = explanation !== null && invalidMoves.length === 0;

  if (!verified) {
    // Une seule nouvelle tentative, avec rappel des coups autorisés. Si la limite vient d'être
    // atteinte, on garde la première réponse (non vérifiée) quand elle existe.
    if (explanation === null) ensureAllowed();
    else if (!checkLimits(settings, { callsToday, costMonth }).allowed) {
      await store.saveExplanation(gameId, move.ply, explanation, false);
      return { explanation, cached: false, verified: false };
    }
    const second = await attempt(baseMessage + "\n" + buildRetryReminder(invalidMoves, allowed));
    if (second.kind === "parsed") {
      const check = verifyExplanation(second.value, allowed);
      if (check.valid || explanation === null) {
        explanation = second.value;
        verified = check.valid;
      }
    }
  }

  if (!explanation) {
    throw new AiError("Claude n'a pas renvoyé d'explication exploitable. Réessaie dans un instant.", 502, "invalid");
  }

  await store.saveExplanation(gameId, move.ply, explanation, verified);
  return { explanation, cached: false, verified };
}
