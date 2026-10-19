import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MoveAnalysis } from "@/lib/analysis/types";
import { serverEnv } from "@/lib/env";
import { checkLimits, type AiLimitSettings } from "./limits";
import { AI_MODEL, EMPTY_USAGE, estimateCost, type TokenUsage } from "./pricing";
import { SYSTEM_PROMPT, buildRetryReminder, buildUserMessage, type GameContext } from "./prompt";
import { ExplanationSchema, type ApiErrorBody, type Explanation, type ExplanationResponse } from "./schema";
import type { ExplanationStore, UsageStatus } from "./store";
import { allowedMovesFor, verifyExplanation } from "./verify";

export const MAX_TOKENS = 2500;

/** Sous-ensemble du client Anthropic utilisé ici (remplacé par un double dans les tests). */
export type MessagesClient = {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message> };
};

export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: serverEnv.anthropicApiKey, timeout: 30_000, maxRetries: 2 });
}

export class ExplainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: NonNullable<ApiErrorBody["code"]>,
  ) {
    super(message);
    this.name = "ExplainError";
  }
}

const outputFormat = zodOutputFormat(ExplanationSchema);

type AttemptResult =
  | { kind: "parsed"; explanation: Explanation; usage: TokenUsage }
  | { kind: "invalid_output"; usage: TokenUsage; detail: string }
  | { kind: "refused"; usage: TokenUsage }
  | { kind: "truncated"; usage: TokenUsage };

function usageOf(message: Anthropic.Message): TokenUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Erreur SDK → message actionnable. Les classes les plus précises d'abord. */
function toExplainError(error: unknown): ExplainError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ExplainError("Claude n'a pas répondu dans les 30 secondes. Réessaie dans un instant.", 503, "upstream");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ExplainError("Connexion à l'API Anthropic impossible. Vérifie la connexion réseau du serveur puis réessaie.", 503, "upstream");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ExplainError("L'API Anthropic limite temporairement les requêtes. Réessaie dans une minute.", 503, "upstream");
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ExplainError("La clé API Anthropic est refusée. Vérifie ANTHROPIC_API_KEY dans .env.local.", 502, "upstream");
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new ExplainError("L'API Anthropic est momentanément indisponible. Réessaie dans quelques minutes.", 503, "upstream");
  }
  if (error instanceof Anthropic.APIError) {
    return new ExplainError(`L'API Anthropic a renvoyé une erreur (${error.status ?? "inconnue"}). Réessaie plus tard.`, 502, "upstream");
  }
  return new ExplainError("Erreur inattendue pendant l'appel à Claude. Réessaie plus tard.", 502, "upstream");
}

async function callOnce(client: MessagesClient, userMessage: string): Promise<AttemptResult> {
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
    output_config: { effort: "low", format: outputFormat },
  });
  const usage = usageOf(message);

  if (message.stop_reason === "refusal") return { kind: "refused", usage };
  if (message.stop_reason === "max_tokens") return { kind: "truncated", usage };

  const text = message.content.find((block) => block.type === "text");
  if (!text) return { kind: "invalid_output", usage, detail: "réponse sans texte" };
  try {
    return { kind: "parsed", explanation: outputFormat.parse(text.text), usage };
  } catch (error) {
    return { kind: "invalid_output", usage, detail: error instanceof Error ? error.message.slice(0, 300) : "JSON invalide" };
  }
}

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
      throw new ExplainError(decision.message, 429, decision.reason === "disabled" ? "ai_disabled" : "limit_reached");
    }
  };
  ensureAllowed();

  const allowed = allowedMovesFor(move);
  const baseMessage = buildUserMessage(move, game);

  const attempt = async (userMessage: string): Promise<AttemptResult> => {
    let result: AttemptResult;
    try {
      result = await callOnce(client, userMessage);
    } catch (error) {
      const explainError = toExplainError(error);
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
      const check = verifyExplanation(result.explanation, allowed);
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
    throw new ExplainError(
      "Claude a refusé d'expliquer ce coup. Consulte les variantes Stockfish affichées ou réessaie plus tard.",
      502,
      "upstream",
    );
  }
  if (first.kind === "truncated") {
    throw new ExplainError("La réponse de Claude a été tronquée (limite de longueur). Réessaie : la génération varie d'un appel à l'autre.", 502, "upstream");
  }

  let explanation: Explanation | null = first.kind === "parsed" ? first.explanation : null;
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
      const check = verifyExplanation(second.explanation, allowed);
      if (check.valid || explanation === null) {
        explanation = second.explanation;
        verified = check.valid;
      }
    }
  }

  if (!explanation) {
    throw new ExplainError("Claude n'a pas renvoyé d'explication exploitable. Réessaie dans un instant.", 502, "invalid");
  }

  await store.saveExplanation(gameId, move.ply, explanation, verified);
  return { explanation, cached: false, verified };
}
