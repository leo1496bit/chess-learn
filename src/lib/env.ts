// Variables d'environnement validées. Les secrets ne sont lus que côté serveur (serverEnv).

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return value;
}

// NEXT_PUBLIC_* doivent être référencées littéralement pour être injectées dans le bundle client.
export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
};

export const serverEnv = {
  get anthropicApiKey() {
    if (typeof window !== "undefined") throw new Error("ANTHROPIC_API_KEY lue côté client");
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
  /** Optionnel : sans jeton, la construction n'utilise que les parties de Leonel et le livre. */
  get lichessToken(): string | undefined {
    if (typeof window !== "undefined") throw new Error("LICHESS_TOKEN lu côté client");
    return process.env.LICHESS_TOKEN || undefined;
  },
  get allowedEmail() {
    return required("ALLOWED_EMAIL", process.env.ALLOWED_EMAIL);
  },
  get chesscomUsername() {
    return process.env.CHESSCOM_USERNAME ?? "Leny_l";
  },
};
