import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: { anthropicApiKey: "test-key" } }));

import Anthropic from "@anthropic-ai/sdk";
import { explainMove, ExplainError, MAX_TOKENS, type MessagesClient } from "./explain";
import type { ExplanationStore, UsageRecord } from "./store";
import type { UsageSummary } from "./limits";
import type { Explanation } from "./schema";
import { BLACK_MISTAKE, GAME, VALID_EXPLANATION } from "./test-fixtures";

const SETTINGS = { aiEnabled: true, aiDailyCallLimit: 50, aiMonthlyBudgetUsd: 1 };
const EMPTY_SUMMARY: UsageSummary = {
  callsToday: 0,
  callsMonth: 0,
  costToday: 0,
  costMonth: 0,
  inputTokensMonth: 0,
  outputTokensMonth: 0,
  cacheReadTokensMonth: 0,
};

function fakeStore(options: { cached?: { explanation: Explanation; verified: boolean }; summary?: Partial<UsageSummary> } = {}) {
  const usage: UsageRecord[] = [];
  const saved: { explanation: Explanation; verified: boolean }[] = [];
  const store: ExplanationStore = {
    findCached: vi.fn(async () => options.cached ?? null),
    usageSummary: vi.fn(async () => ({ ...EMPTY_SUMMARY, ...options.summary })),
    saveExplanation: vi.fn(async (_gameId, _ply, explanation, verified) => {
      saved.push({ explanation, verified });
    }),
    recordUsage: vi.fn(async (record) => {
      usage.push(record);
    }),
  };
  return { store, usage, saved };
}

function message(text: string, stop_reason: Anthropic.StopReason = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 400,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
    },
  } as Anthropic.Message;
}

function fakeClient(...responses: (Anthropic.Message | Error)[]) {
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    void body;
    const next = responses.shift();
    if (!next) throw new Error("appel inattendu");
    if (next instanceof Error) throw next;
    return next;
  });
  const client: MessagesClient = { messages: { create } };
  return { client, create };
}

const run = (store: ExplanationStore, client: MessagesClient) =>
  explainMove({ gameId: "g1", move: BLACK_MISTAKE, game: GAME, settings: SETTINGS, store, client, now: new Date("2026-10-20T12:00:00Z") });

describe("explainMove", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie l'explication vérifiée en cache sans appel", async () => {
    const { store } = fakeStore({ cached: { explanation: VALID_EXPLANATION, verified: true } });
    const { client, create } = fakeClient();
    await expect(run(store, client)).resolves.toEqual({ explanation: VALID_EXPLANATION, cached: true, verified: true });
    expect(create).not.toHaveBeenCalled();
    expect(store.recordUsage).not.toHaveBeenCalled();
  });

  it("appelle Haiku 5.5 avec le prompt système en cache et la sortie structurée", async () => {
    const { store, usage, saved } = fakeStore();
    const { client, create } = fakeClient(message(JSON.stringify(VALID_EXPLANATION)));
    const result = await run(store, client);

    expect(result).toEqual({ explanation: VALID_EXPLANATION, cached: false, verified: true });
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(MAX_TOKENS);
    expect(body.output_config?.effort).toBe("low");
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect(Array.isArray(body.system) && body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");

    expect(usage).toEqual([
      { status: "ok", inputTokens: 1200, outputTokens: 400, cacheReadTokens: 900, cacheWriteTokens: 0, costUsd: 0.000329, error: null },
    ]);
    expect(saved).toEqual([{ explanation: VALID_EXPLANATION, verified: true }]);
  });

  it("enregistre un refus et renvoie une erreur 502", async () => {
    const { store, usage, saved } = fakeStore();
    const { client } = fakeClient(message("", "refusal"));
    await expect(run(store, client)).rejects.toMatchObject({ status: 502, code: "upstream" });
    expect(usage[0].status).toBe("refused");
    expect(usage[0].outputTokens).toBe(400);
    expect(saved).toEqual([]);
  });

  it("enregistre une réponse tronquée (max_tokens) sans la stocker", async () => {
    const { store, usage, saved } = fakeStore();
    const { client, create } = fakeClient(message('{"played":"Avec f6', "max_tokens"));
    await expect(run(store, client)).rejects.toBeInstanceOf(ExplainError);
    expect(create).toHaveBeenCalledTimes(1);
    expect(usage[0]).toMatchObject({ status: "error", error: "stop_reason: max_tokens" });
    expect(saved).toEqual([]);
  });

  it("transforme une limite de débit Anthropic en 503 et l'enregistre", async () => {
    const { store, usage } = fakeStore();
    const rateLimit = new Anthropic.RateLimitError(429, { type: "error" }, "rate limited", new Headers());
    const { client } = fakeClient(rateLimit);
    await expect(run(store, client)).rejects.toMatchObject({ status: 503, code: "upstream" });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ status: "error", inputTokens: 0, costUsd: 0 });
  });

  it("transforme un délai dépassé en 503", async () => {
    const { store } = fakeStore();
    const { client } = fakeClient(new Anthropic.APIConnectionTimeoutError());
    await expect(run(store, client)).rejects.toMatchObject({ status: 503 });
  });

  it("refait une tentative avec rappel quand un coup est inventé, puis valide", async () => {
    const { store, usage, saved } = fakeStore();
    const invented = { ...VALID_EXPLANATION, opponentIdea: "Les Blancs jouent Bxf7+ et gagnent.", movesReferenced: ["Bxf7+"] };
    const { client, create } = fakeClient(message(JSON.stringify(invented)), message(JSON.stringify(VALID_EXPLANATION)));
    const result = await run(store, client);

    expect(result.verified).toBe(true);
    expect(result.explanation).toEqual(VALID_EXPLANATION);
    expect(create).toHaveBeenCalledTimes(2);
    const retryContent = create.mock.calls[1][0].messages[0].content;
    expect(typeof retryContent === "string" && retryContent).toContain("RAPPEL IMPORTANT");
    expect(typeof retryContent === "string" && retryContent).toContain("Bxf7+");
    expect(usage.map((u) => u.status)).toEqual(["unverified", "ok"]);
    expect(saved).toEqual([{ explanation: VALID_EXPLANATION, verified: true }]);
  });

  it("refait une tentative quand le JSON est invalide", async () => {
    const { store, usage } = fakeStore();
    const { client } = fakeClient(message("pas du JSON"), message(JSON.stringify(VALID_EXPLANATION)));
    const result = await run(store, client);
    expect(result.verified).toBe(true);
    expect(usage.map((u) => u.status)).toEqual(["error", "ok"]);
  });

  it("garde l'explication non vérifiée si la seconde tentative échoue aussi", async () => {
    const { store, saved } = fakeStore();
    const invented = { ...VALID_EXPLANATION, bestMove: "Il fallait Qh4." };
    const { client } = fakeClient(message(JSON.stringify(invented)), message(JSON.stringify(invented)));
    const result = await run(store, client);
    expect(result).toEqual({ explanation: invented, cached: false, verified: false });
    expect(saved).toEqual([{ explanation: invented, verified: false }]);
  });

  it("régénère une explication en cache non vérifiée", async () => {
    const { store } = fakeStore({ cached: { explanation: VALID_EXPLANATION, verified: false } });
    const { client, create } = fakeClient(message(JSON.stringify(VALID_EXPLANATION)));
    await expect(run(store, client)).resolves.toMatchObject({ cached: false, verified: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("refuse (429) sans appel quand la limite quotidienne est atteinte", async () => {
    const { store } = fakeStore({ summary: { callsToday: 50 } });
    const { client, create } = fakeClient();
    await expect(run(store, client)).rejects.toMatchObject({ status: 429, code: "limit_reached" });
    expect(create).not.toHaveBeenCalled();
    expect(store.recordUsage).not.toHaveBeenCalled();
  });

  it("refuse (429) quand le budget mensuel est atteint", async () => {
    const { store } = fakeStore({ summary: { costMonth: 1 } });
    const { client, create } = fakeClient();
    await expect(run(store, client)).rejects.toMatchObject({ status: 429, code: "limit_reached" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse (429, ai_disabled) quand l'IA est désactivée", async () => {
    const { store } = fakeStore();
    const { client } = fakeClient();
    await expect(
      explainMove({ gameId: "g1", move: BLACK_MISTAKE, game: GAME, settings: { ...SETTINGS, aiEnabled: false }, store, client }),
    ).rejects.toMatchObject({ status: 429, code: "ai_disabled" });
  });

  it("ne refait pas de tentative si la limite est atteinte après le premier appel", async () => {
    const { store, saved } = fakeStore({ summary: { callsToday: 49 } });
    const invented = { ...VALID_EXPLANATION, bestMove: "Il fallait Qh4." };
    const { client, create } = fakeClient(message(JSON.stringify(invented)));
    const result = await run(store, client);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.verified).toBe(false);
    expect(saved).toEqual([{ explanation: invented, verified: false }]);
  });
});
