import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, callStructured, toAiError, type AttemptResult, type MessagesClient } from "../call";
import { checkLimits, type AiLimitSettings, type UsageSummary } from "../limits";
import { EMPTY_USAGE, estimateCost } from "../pricing";
import type { UsageRecord, UsageStatus } from "../store";
import type { BranchInput } from "./input";
import { BRANCH_MAX_TOKENS, BRANCH_SYSTEM_PROMPT, buildBranchRetryReminder } from "./prompt";
import { BranchIdeasSchema, type BranchIdeas } from "./schema";
import { verifyBranchIdeas, type BranchVerification } from "./verify";

// Limite de la route : 60 s (Vercel). Deux appels de 25 s au plus, sans nouvel essai du SDK, tiennent
// dans ce délai ; la nouvelle tentative de vérification est sautée passé BRANCH_RETRY_DEADLINE_MS.
export const BRANCH_TIMEOUT_MS = 25_000;
export const BRANCH_MAX_RETRIES = 0;
export const BRANCH_RETRY_DEADLINE_MS = 30_000;

const outputFormat = zodOutputFormat(BranchIdeasSchema);

export type StoredBranchIdeas = { ideas: BranchIdeas; verified: boolean; createdAt: string };

/** Accès aux données (remplacé par un double dans les tests). */
export interface BranchIdeasStore {
  findIdeas(branchId: string): Promise<StoredBranchIdeas | null>;
  usageSummary(now: Date): Promise<UsageSummary>;
  saveIdeas(branchId: string, ideas: BranchIdeas, verified: boolean): Promise<StoredBranchIdeas>;
  recordUsage(record: UsageRecord): Promise<void>;
}

export type GenerateBranchIdeasInput = {
  branchId: string;
  input: BranchInput;
  /** Nombre de demi-coups de la branche (les index valides vont de 0 à branchLength - 1). */
  branchLength: number;
  settings: AiLimitSettings;
  store: BranchIdeasStore;
  client: MessagesClient;
  /** Régénérer même si des idées vérifiées existent. */
  force?: boolean;
  now?: Date;
  /** Horloge (ms) pour le délai de la nouvelle tentative ; `Date.now` par défaut. */
  clock?: () => number;
};

export type GenerateBranchIdeasResult = StoredBranchIdeas & { cached: boolean };

/** Cache → limites → appel → vérification (1 nouvelle tentative) → stockage. Chaque appel produit une ligne ai_usage. */
export async function generateBranchIdeas(params: GenerateBranchIdeasInput): Promise<GenerateBranchIdeasResult> {
  const { branchId, input, branchLength, settings, store, client } = params;
  const now = params.now ?? new Date();
  const clock = params.clock ?? Date.now;
  const startedAt = clock();
  const verify = (ideas: BranchIdeas): BranchVerification =>
    verifyBranchIdeas(ideas, input.allowedMoves, input.protectedPhrases, branchLength);

  const cached = await store.findIdeas(branchId);
  if (cached && cached.verified && !params.force) return { ...cached, cached: true };

  const usage = await store.usageSummary(now);
  let callsToday = usage.callsToday;
  let costMonth = usage.costMonth;
  const ensureAllowed = () => {
    const decision = checkLimits(settings, { callsToday, costMonth });
    if (!decision.allowed) throw new AiError(decision.message, 429, decision.reason === "disabled" ? "ai_disabled" : "limit_reached");
  };
  ensureAllowed();

  const attempt = async (userMessage: string): Promise<AttemptResult<BranchIdeas>> => {
    let result: AttemptResult<BranchIdeas>;
    try {
      result = await callStructured(client, {
        system: BRANCH_SYSTEM_PROMPT,
        user: userMessage,
        format: outputFormat,
        maxTokens: BRANCH_MAX_TOKENS,
      });
    } catch (error) {
      const aiError = toAiError(error, BRANCH_TIMEOUT_MS / 1000);
      await store.recordUsage({ status: "error", ...EMPTY_USAGE, costUsd: 0, error: aiError.message });
      throw aiError;
    }
    const costUsd = estimateCost(result.usage);
    callsToday += 1;
    costMonth += costUsd;
    let status: UsageStatus = "ok";
    let errorText: string | null = null;
    if (result.kind === "refused") [status, errorText] = ["refused", "stop_reason: refusal"];
    else if (result.kind === "truncated") [status, errorText] = ["error", "stop_reason: max_tokens"];
    else if (result.kind === "invalid_output") [status, errorText] = ["error", `sortie invalide : ${result.detail}`];
    else {
      const check = verify(result.value);
      if (!check.valid) {
        const problems = [...check.invalidMoves, ...check.invalidIndexes.map((i) => `index ${i}`), ...check.missingIndexes.map((i) => `index ${i} manquant`)];
        [status, errorText] = ["unverified", `références non valides : ${problems.join(", ")}`];
      }
    }
    await store.recordUsage({ status, ...result.usage, costUsd, error: errorText });
    return result;
  };

  const first = await attempt(input.text);
  if (first.kind === "refused") {
    throw new AiError("Claude a refusé de commenter cette branche. Réessaie plus tard.", 502, "upstream");
  }
  if (first.kind === "truncated") {
    throw new AiError("Le commentaire a été tronqué (limite de longueur). Réessaie : la génération varie d'un appel à l'autre.", 502, "upstream");
  }

  let ideas: BranchIdeas | null = first.kind === "parsed" ? first.value : null;
  const check = ideas ? verify(ideas) : null;
  let verified = check?.valid ?? false;

  if (!verified) {
    // Une seule nouvelle tentative ; si la limite vient d'être atteinte ou si le temps manque (limite de
    // 60 s de la route), on garde la première réponse, non vérifiée.
    const late = clock() - startedAt > BRANCH_RETRY_DEADLINE_MS;
    // Sans première réponse exploitable et sans temps pour une autre : erreur « invalid » plus bas.
    if (ideas === null && !late) ensureAllowed();
    if (!late && (ideas === null || checkLimits(settings, { callsToday, costMonth }).allowed)) {
      const reminder = buildBranchRetryReminder(check?.invalidMoves ?? [], check?.invalidIndexes ?? [], check?.missingIndexes ?? []);
      let second: AttemptResult<BranchIdeas> | null = null;
      try {
        second = await attempt(input.text + "\n" + reminder);
      } catch (error) {
        // La première réponse a été payée : elle est gardée (non vérifiée) plutôt qu'une erreur 502.
        if (ideas === null) throw error;
      }
      if (second?.kind === "parsed") {
        const secondCheck = verify(second.value);
        if (secondCheck.valid || ideas === null) {
          ideas = second.value;
          verified = secondCheck.valid;
        }
      }
    }
  }

  if (!ideas) throw new AiError("Claude n'a pas renvoyé de commentaire exploitable. Réessaie dans un instant.", 502, "invalid");

  // Une régénération forcée qui échoue à la vérification ne remplace jamais des idées vérifiées.
  if (cached?.verified && !verified) return { ...cached, cached: true };

  const stored = await store.saveIdeas(branchId, ideas, verified);
  return { ...stored, cached: false };
}
