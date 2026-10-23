// Vérification qu'un identifiant Chess.com correspond à un compte existant (première connexion, Paramètres).

import { ChesscomError, type ChesscomClient } from "./client";

export type AccountCheck =
  | { status: "ok" }
  | { status: "not_found"; message: string }
  | { status: "unavailable"; message: string };

export async function checkChesscomAccount(client: ChesscomClient, username: string): Promise<AccountCheck> {
  try {
    await client.getProfile(username);
    return { status: "ok" };
  } catch (error) {
    if (error instanceof ChesscomError && error.kind === "not_found") {
      return { status: "not_found", message: `Aucun compte Chess.com « ${username.trim()} ». Vérifie l'orthographe.` };
    }
    if (error instanceof ChesscomError) {
      return { status: "unavailable", message: "Chess.com ne répond pas pour l'instant : impossible de vérifier le compte. Réessaie dans un instant." };
    }
    throw error;
  }
}
