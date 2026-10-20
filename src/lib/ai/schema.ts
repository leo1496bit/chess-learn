// Schéma de sortie des explications (skill chess-analysis §7). Module pur, partagé client/serveur.
import { z } from "zod";

export const ERROR_TYPES = ["none", "tactical", "strategic", "mixed", "uncertain"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const ExplanationSchema = z.object({
  played: z.string().describe("Le coup joué, son intention apparente (hypothèse) et sa place dans la théorie."),
  problem: z.string().describe("Écart : pourquoi c'est problématique. Bon coup : pourquoi il est bon."),
  opponentIdea: z.string().describe("Écart : comment l'autre camp l'exploite. Bon coup : ce qu'il menace ou empêche."),
  bestMove: z.string().describe("L'idée du meilleur coup du moteur, ou ce qui distingue le coup joué des autres candidats."),
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
  code?: "unauthorized" | "not_found" | "limit_reached" | "ai_disabled" | "upstream" | "invalid";
};

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  none: "Bon coup",
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
