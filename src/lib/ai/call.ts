import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AutoParseableOutputFormat } from "@anthropic-ai/sdk/lib/parser";
import { serverEnv } from "@/lib/env";
import { AI_MODEL, type TokenUsage } from "./pricing";
import type { ApiErrorBody } from "./schema";

// Appel structuré à Claude Haiku 5.5, partagé par les explications de coups et les bilans de partie.

/** Sous-ensemble du client Anthropic utilisé ici (remplacé par un double dans les tests). */
export type MessagesClient = {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message> };
};

export function createAnthropicClient(timeoutMs = 30_000): Anthropic {
  return new Anthropic({ apiKey: serverEnv.anthropicApiKey, timeout: timeoutMs, maxRetries: 2 });
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: NonNullable<ApiErrorBody["code"]>,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Format de sortie structurée (zodOutputFormat) : schéma JSON envoyé + parseur. */
export type OutputFormat<T> = AutoParseableOutputFormat<T>;

export type AttemptResult<T> =
  | { kind: "parsed"; value: T; usage: TokenUsage }
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
export function toAiError(error: unknown, timeoutSeconds = 30): AiError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError(`Claude n'a pas répondu dans les ${timeoutSeconds} secondes. Réessaie dans un instant.`, 503, "upstream");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("Connexion à l'API Anthropic impossible. Vérifie la connexion réseau du serveur puis réessaie.", 503, "upstream");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError("L'API Anthropic limite temporairement les requêtes. Réessaie dans une minute.", 503, "upstream");
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("La clé API Anthropic est refusée. Vérifie ANTHROPIC_API_KEY dans .env.local.", 502, "upstream");
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AiError("L'API Anthropic est momentanément indisponible. Réessaie dans quelques minutes.", 503, "upstream");
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`L'API Anthropic a renvoyé une erreur (${error.status ?? "inconnue"}). Réessaie plus tard.`, 502, "upstream");
  }
  return new AiError("Erreur inattendue pendant l'appel à Claude. Réessaie plus tard.", 502, "upstream");
}

/** Un appel : prompt système figé et mis en cache, réponse JSON validée par le schéma. */
export async function callStructured<T>(
  client: MessagesClient,
  request: { system: string; user: string; format: OutputFormat<T>; maxTokens: number },
): Promise<AttemptResult<T>> {
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: request.maxTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: request.user }],
    output_config: { effort: "low", format: request.format },
  });
  const usage = usageOf(message);

  if (message.stop_reason === "refusal") return { kind: "refused", usage };
  if (message.stop_reason === "max_tokens") return { kind: "truncated", usage };

  const text = message.content.find((block) => block.type === "text");
  if (!text) return { kind: "invalid_output", usage, detail: "réponse sans texte" };
  try {
    return { kind: "parsed", value: request.format.parse(text.text), usage };
  } catch (error) {
    return { kind: "invalid_output", usage, detail: error instanceof Error ? error.message.slice(0, 300) : "JSON invalide" };
  }
}
