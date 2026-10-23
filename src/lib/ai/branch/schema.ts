// Schéma des idées et du plan d'une branche (sortie structurée de Claude Haiku 5.5). Module pur.
import { z } from "zod";
import { CONFIDENCE_LEVELS } from "../schema";

export const BranchIdeasSchema = z.object({
  moves: z
    .array(
      z.object({
        index: z.number().int().describe("Demi-coup de la branche : 0 = premier coup après la position de départ."),
        idea: z.string().describe("Idée du coup en 1 à 2 phrases ; pour un coup adverse, une hypothèse."),
      }),
    )
    .describe("Une idée pour chaque demi-coup de la branche, du joueur comme de l'adversaire."),
  plan: z.string().describe("Plan de milieu de partie fondé sur la position finale et la variante fournie."),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export type BranchIdeas = z.infer<typeof BranchIdeasSchema>;

/** Réponse de POST /api/openings/branches/[id]/explain. */
export type BranchIdeasResponse = { ideas: BranchIdeas; verified: boolean; cached: boolean };
