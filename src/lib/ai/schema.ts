// Schéma de sortie des explications (skill chess-analysis §7). Module pur, partagé client/serveur.
import { z } from "zod";

export const ERROR_TYPES = ["tactical", "strategic", "mixed", "uncertain"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const ExplanationSchema = z.object({
  played: z.string().describe("Ce que j'ai joué : le coup et son intention apparente, formulée comme une hypothèse."),
  problem: z.string().describe("Pourquoi c'est problématique : la faiblesse tactique ou stratégique créée."),
  opponentIdea: z.string().describe("Ce que l'adversaire pouvait faire : la réponse fournie qui exploite l'erreur."),
  bestMove: z.string().describe("Le meilleur coup : l'idée derrière le coup recommandé par le moteur."),
  lesson: z.string().describe("La leçon à retenir : un principe réutilisable dans d'autres parties."),
  errorType: z.enum(ERROR_TYPES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  movesReferenced: z.array(z.string()).describe("Tous les coups cités dans le texte, en notation SAN."),
});

export type Explanation = z.infer<typeof ExplanationSchema>;
export type ErrorType = (typeof ERROR_TYPES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** Réponse de POST /api/explanations. */
export type ExplanationResponse = { explanation: Explanation; cached: boolean; verified: boolean };

/** Une explication en cache, renvoyée par GET /api/explanations?gameId=. */
export type CachedExplanation = { ply: number; explanation: Explanation; verified: boolean; createdAt: string };

/** Corps d'erreur des routes IA. `code` permet au client d'adapter le message (lien vers Paramètres…). */
export type ApiErrorBody = {
  error: string;
  code?: "unauthorized" | "not_found" | "not_explainable" | "limit_reached" | "ai_disabled" | "upstream" | "invalid";
};

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  tactical: "Erreur tactique",
  strategic: "Erreur stratégique",
  mixed: "Erreur tactique et stratégique",
  uncertain: "Nature incertaine",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Confiance élevée",
  medium: "Confiance moyenne",
  low: "Confiance faible",
};
