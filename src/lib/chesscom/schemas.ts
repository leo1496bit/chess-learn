import { z } from "zod";

// Schémas des réponses de l'API publique Chess.com (https://www.chess.com/news/view/published-data-api).
// Les clés inconnues sont ignorées : l'API ajoute régulièrement des champs.

export const ChesscomProfileSchema = z.object({
  player_id: z.number().int(),
  username: z.string().min(1),
  url: z.string().optional(),
  name: z.string().optional(),
  country: z.string().optional(),
  joined: z.number().optional(),
  last_online: z.number().optional(),
  status: z.string().optional(),
});
export type ChesscomProfile = z.infer<typeof ChesscomProfileSchema>;

export const ArchiveListSchema = z.object({
  archives: z.array(z.string()),
});

const ChesscomGamePlayerSchema = z.object({
  username: z.string().min(1),
  rating: z.number().int().optional(),
  // Codes Chess.com : win, checkmated, resigned, timeout, abandoned, agreed, repetition, stalemate…
  result: z.string().min(1),
  uuid: z.string().optional(),
});
export type ChesscomGamePlayer = z.infer<typeof ChesscomGamePlayerSchema>;

export const ChesscomGameSchema = z.object({
  url: z.string().min(1),
  uuid: z.string().min(1).optional(),
  pgn: z.string().optional(),
  time_control: z.string().optional(),
  time_class: z.string().optional(),
  end_time: z.number().int().positive(),
  rated: z.boolean().optional(),
  rules: z.string().min(1),
  initial_setup: z.string().optional(),
  white: ChesscomGamePlayerSchema,
  black: ChesscomGamePlayerSchema,
  /** URL de la page d'ouverture Chess.com (pas le code ECO). */
  eco: z.string().optional(),
});
export type ChesscomGame = z.infer<typeof ChesscomGameSchema>;

/** Les parties sont validées une par une : une partie malformée ne fait pas échouer l'archive. */
export const MonthlyArchiveSchema = z.object({
  games: z.array(z.unknown()),
});
