import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, callStructured, toAiError, type AttemptResult, type MessagesClient } from "../call";
import { checkLimits, type AiLimitSettings, type UsageSummary } from "../limits";
import { EMPTY_USAGE, estimateCost } from "../pricing";
import type { UsageRecord, UsageStatus } from "../store";
import type { ReportInput } from "./input";
import { REPORT_SYSTEM_PROMPT, buildReportRetryReminder } from "./prompt";
import { GameReportSchema, type GameReport } from "./schema";
import { verifyReport } from "./verify";

/** Un bilan est plus long qu'une explication de coup. */
export const REPORT_MAX_TOKENS = 6000;
export const REPORT_TIMEOUT_MS = 60_000;

const outputFormat = zodOutputFormat(GameReportSchema);

export type StoredReport = { report: GameReport; verified: boolean; createdAt: string; analysisCreatedAt: string };

/** Accès aux données (remplacé par un double dans les tests). */
export interface ReportStore {
  findReport(gameId: string): Promise<StoredReport | null>;
  usageSummary(now: Date): Promise<UsageSummary>;
  saveReport(gameId: string, report: GameReport, verified: boolean, analysisCreatedAt: string): Promise<StoredReport>;
  recordUsage(record: UsageRecord): Promise<void>;
}

export type GenerateReportInput = {
  gameId: string;
  input: ReportInput;
  /** Date de la dernière analyse de la partie : empreinte du bilan. */
  analysisCreatedAt: string;
  settings: AiLimitSettings;
  store: ReportStore;
  client: MessagesClient;
  /** Régénérer même si un bilan vérifié et à jour existe. */
  force?: boolean;
  now?: Date;
};

export type GenerateReportResult = StoredReport & { cached: boolean };

/** Cache → limites → appel → vérification (1 nouvelle tentative) → stockage. Chaque appel produit une ligne ai_usage. */
export async function generateGameReport(params: GenerateReportInput): Promise<GenerateReportResult> {
  const { gameId, input, analysisCreatedAt, settings, store, client } = params;
  const now = params.now ?? new Date();

  const cached = await store.findReport(gameId);
  if (cached && cached.verified && cached.analysisCreatedAt === analysisCreatedAt && !params.force) {
    return { ...cached, cached: true };
  }

  const usage = await store.usageSummary(now);
  let callsToday = usage.callsToday;
  let costMonth = usage.costMonth;
  const ensureAllowed = () => {
    const decision = checkLimits(settings, { callsToday, costMonth });
    if (!decision.allowed) throw new AiError(decision.message, 429, decision.reason === "disabled" ? "ai_disabled" : "limit_reached");
  };
  ensureAllowed();

  const attempt = async (userMessage: string): Promise<AttemptResult<GameReport>> => {
    let result: AttemptResult<GameReport>;
    try {
      result = await callStructured(client, {
        system: REPORT_SYSTEM_PROMPT,
        user: userMessage,
        format: outputFormat,
        maxTokens: REPORT_MAX_TOKENS,
      });
    } catch (error) {
      const aiError = toAiError(error, REPORT_TIMEOUT_MS / 1000);
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
      const check = verifyReport(result.value, input.allowedMoves, input.allowedPlies, input.protectedPhrases);
      if (!check.valid) [status, errorText] = ["unverified", `références non fournies : ${[...check.invalidMoves, ...check.invalidPlies].join(", ")}`];
    }
    await store.recordUsage({ status, ...result.usage, costUsd, error: errorText });
    return result;
  };

  const first = await attempt(input.text);
  if (first.kind === "refused") {
    throw new AiError("Claude a refusé de rédiger ce bilan. Consulte l'analyse coup par coup ou réessaie plus tard.", 502, "upstream");
  }
  if (first.kind === "truncated") {
    throw new AiError("Le bilan a été tronqué (limite de longueur). Réessaie : la génération varie d'un appel à l'autre.", 502, "upstream");
  }

  let report: GameReport | null = first.kind === "parsed" ? first.value : null;
  const check = report ? verifyReport(report, input.allowedMoves, input.allowedPlies, input.protectedPhrases) : null;
  let verified = check?.valid ?? false;

  if (!verified) {
    // Une seule nouvelle tentative ; si la limite vient d'être atteinte, on garde la première réponse.
    if (report === null) ensureAllowed();
    if (report === null || checkLimits(settings, { callsToday, costMonth }).allowed) {
      const second = await attempt(input.text + "\n" + buildReportRetryReminder(check?.invalidMoves ?? [], check?.invalidPlies ?? []));
      if (second.kind === "parsed") {
        const secondCheck = verifyReport(second.value, input.allowedMoves, input.allowedPlies, input.protectedPhrases);
        if (secondCheck.valid || report === null) {
          report = second.value;
          verified = secondCheck.valid;
        }
      }
    }
  }

  if (!report) throw new AiError("Claude n'a pas renvoyé de bilan exploitable. Réessaie dans un instant.", 502, "invalid");

  const stored = await store.saveReport(gameId, report, verified, analysisCreatedAt);
  return { ...stored, cached: false };
}
