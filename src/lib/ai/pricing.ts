// Tarifs Claude Haiku 5.5 (prompts ≤ 100 K tokens), en dollars par million de tokens.
// Module pur : utilisé côté serveur (ai_usage) et côté client (affichage).

export const AI_MODEL = "claude-haiku-5-5";

export const PRICE_PER_MTOK = {
  input: 0.1,
  output: 0.5,
  /** Lecture du cache de prompt : 0,1 × le tarif d'entrée. */
  cacheRead: 0.01,
  /** Écriture du cache (TTL 5 min) : 1,25 × le tarif d'entrée. */
  cacheWrite: 0.125,
} as const;

export type TokenUsage = {
  /** Tokens d'entrée hors cache (champ `input_tokens` de l'API). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Coût estimé d'un appel, en dollars (arrondi à 6 décimales comme la colonne ai_usage.cost_usd). */
export function estimateCost(usage: TokenUsage): number {
  const cost =
    (usage.inputTokens * PRICE_PER_MTOK.input +
      usage.outputTokens * PRICE_PER_MTOK.output +
      usage.cacheReadTokens * PRICE_PER_MTOK.cacheRead +
      usage.cacheWriteTokens * PRICE_PER_MTOK.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/** Additionne deux consommations (appel initial + nouvelle tentative). */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** Format d'affichage d'un coût : 4 décimales sous 1 $, sinon 2. */
export function formatUsd(value: number): string {
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;
}
