"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ChesscomUsernameSchema } from "@/components/settings/settings-schema";
import { createChesscomClient } from "@/lib/chesscom/client";
import { checkChesscomAccount } from "@/lib/chesscom/verify";
import { getAuthorizedUser } from "@/lib/db/server";
import { createSettings } from "@/lib/db/settings";

export type WelcomeState = { status: "idle" | "error"; message?: string };

const WelcomeSchema = z.object({ chesscomUsername: ChesscomUsernameSchema });

/** Première connexion : vérifie l'identifiant auprès de Chess.com puis crée les paramètres. */
export async function chooseUsername(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const auth = await getAuthorizedUser();
  if (!auth) redirect("/login");

  const parsed = WelcomeSchema.safeParse({ chesscomUsername: formData.get("chesscomUsername") ?? "" });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const username = parsed.data.chesscomUsername;

  const account = await checkChesscomAccount(createChesscomClient(), username);
  if (account.status !== "ok") return { status: "error", message: account.message };

  try {
    await createSettings(auth.supabase, username);
  } catch (error) {
    console.error("[welcome] create settings", error);
    return { status: "error", message: "Enregistrement impossible : la base de données n'a pas répondu. Réessaie dans un instant." };
  }
  redirect("/games");
}
