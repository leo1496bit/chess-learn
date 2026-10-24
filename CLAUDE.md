# chess-learn

Application web d'analyse de parties Chess.com (bêta ouverte à plusieurs utilisateurs ; compte de
Leonel : `Leny_l`) : Stockfish calcule, Claude Haiku 5.5 explique. Cahier des charges complet : `description.md`.

## Règle obligatoire

**Toute tâche qui touche à l'analyse échiquéenne** — moteur Stockfish, évaluations, meilleurs
coups, classification des erreurs, thèmes de faiblesses, statistiques d'erreurs, explications IA,
exercices d'entraînement — **commence par charger la skill `chess-analysis`**
(`.claude/skills/chess-analysis/SKILL.md`) et respecte ses règles. Ne jamais faire calculer des
coups ou des évaluations par l'IA.

## Stack

Next.js (App Router, `src/`), React, TypeScript strict, Tailwind CSS, shadcn/ui,
react-chessboard + chess.js, Stockfish WASM (Web Worker, `public/stockfish/`), Supabase
(Postgres + Auth e-mail/mot de passe, e-mails via SMTP Resend, RLS), `@anthropic-ai/sdk` (`claude-haiku-5-5`), Vitest.

## Organisation

- `src/lib/chesscom/` — client API publique Chess.com (retries, rate limit)
- `src/lib/pgn/` — parsing PGN, métadonnées, déduplication
- `src/lib/engine/` — worker Stockfish + UCI (navigateur uniquement)
- `src/lib/analysis/` — fonctions pures : win %, classification, thèmes, phase (testées)
- `src/lib/ai/` — explications Anthropic (serveur uniquement), prix, limites
- `src/lib/db/` — clients Supabase et requêtes
- `src/lib/stats/`, `src/lib/training/` — statistiques et exercices
- `src/app/api/` — routes API (validation Zod)
- `supabase/migrations/` — schéma SQL

## Sécurité

- `ANTHROPIC_API_KEY` : serveur uniquement (pas de clé service_role : tout passe par la session utilisateur + RLS), dans `.env.local` (ignoré par git). Jamais de préfixe `NEXT_PUBLIC_`.
- Bêta ouverte : inscription libre (`/signup`, e-mail confirmé), connexion e-mail + mot de passe,
  réinitialisation (`/forgot-password` → `/auth/callback?next=/reset-password`) ; l'identifiant Chess.com est choisi à la première
  connexion (`/welcome`). RLS activée sur toutes les tables (`user_id = auth.uid()`) : chacun ne voit
  que ses données. Les appels IA de tous les utilisateurs sont payés par la clé de Leonel.

## Commandes

- `npm run dev` — serveur de développement
- `npm run build` — build de production
- `npm run lint` / `npm run typecheck`
- `npm test` — tests unitaires (Vitest)
