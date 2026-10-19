# chess-learn

Application web personnelle d'analyse de mes parties Chess.com (`Leny_l`) : Stockfish calcule,
Claude Haiku 5.5 explique. Cahier des charges complet : `description.md`.

## Règle obligatoire

**Toute tâche qui touche à l'analyse échiquéenne** — moteur Stockfish, évaluations, meilleurs
coups, classification des erreurs, thèmes de faiblesses, statistiques d'erreurs, explications IA,
exercices d'entraînement — **commence par charger la skill `chess-analysis`**
(`.claude/skills/chess-analysis/SKILL.md`) et respecte ses règles. Ne jamais faire calculer des
coups ou des évaluations par l'IA.

## Stack

Next.js (App Router, `src/`), React, TypeScript strict, Tailwind CSS, shadcn/ui,
react-chessboard + chess.js, Stockfish WASM (Web Worker, `public/stockfish/`), Supabase
(Postgres + Auth par lien magique, RLS), `@anthropic-ai/sdk` (`claude-haiku-5-5`), Vitest.

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
- Accès limité à `ALLOWED_EMAIL` ; RLS activée sur toutes les tables.

## Commandes

- `npm run dev` — serveur de développement
- `npm run build` — build de production
- `npm run lint` / `npm run typecheck`
- `npm test` — tests unitaires (Vitest)
