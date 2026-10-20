// Schéma du bilan de partie (sortie structurée de Claude Haiku 5.5). Module pur, partagé client/serveur.
import { z } from "zod";
import { CONFIDENCE_LEVELS } from "../schema";

export const TRAINING_CATEGORIES = ["tactics", "strategy", "opening", "endgame", "calculation", "traps"] as const;

export const GameReportSchema = z.object({
  summary: z.string().describe("Vue d'ensemble de la partie en 3 à 5 phrases : déroulement, tournant, résultat."),
  opening: z.object({
    name: z.string().describe("Nom de l'ouverture ou du gambit, exactement comme fourni (ou « ouverture non identifiée »)."),
    assessment: z.string().describe("Comment le joueur a traité l'ouverture, d'après les données."),
    theoryGap: z
      .string()
      .nullable()
      .describe("Lacune théorique constatée (sortie du livre coûteuse, réponse imprécise à un coup hors théorie), sinon null."),
    studyAdvice: z.string().describe("Ce qu'il faut revoir sur cette ouverture ou ce gambit."),
  }),
  tacticalErrors: z
    .array(z.object({ ply: z.number().int(), title: z.string(), explanation: z.string() }))
    .describe("Erreurs tactiques du joueur (au plus 4), chacune rattachée à un demi-coup fourni."),
  strategicErrors: z
    .array(z.object({ ply: z.number().int().nullable(), title: z.string(), explanation: z.string() }))
    .describe("Erreurs stratégiques du joueur (au plus 4) ; ply null pour une tendance sur plusieurs coups."),
  missedOpportunities: z
    .array(z.object({ ply: z.number().int(), explanation: z.string() }))
    .describe("Gains manqués et erreurs adverses non punies (au plus 4)."),
  endgame: z.string().nullable().describe("Appréciation de la finale si la partie en a atteint une, sinon null."),
  strengths: z.array(z.string()).describe("Ce que le joueur a bien fait (1 à 3 points)."),
  trainingPlan: z
    .array(
      z.object({
        category: z.enum(TRAINING_CATEGORIES),
        title: z.string(),
        why: z.string(),
        plies: z.array(z.number().int()),
      }),
    )
    .describe("2 à 4 axes de travail concrets (types de positions, motifs tactiques, pièges, finales, théorie)."),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export type GameReport = z.infer<typeof GameReportSchema>;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

export const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  tactics: "Tactique",
  strategy: "Stratégie",
  opening: "Ouverture",
  endgame: "Finale",
  calculation: "Calcul",
  traps: "Pièges",
};

/** Réponse de POST /api/game-report et GET /api/game-report?gameId=. */
export type GameReportResponse = {
  report: GameReport;
  verified: boolean;
  cached: boolean;
  createdAt: string;
  /** La partie a été réanalysée depuis : le bilan peut ne plus correspondre. */
  stale: boolean;
};
