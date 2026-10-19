# chess-learn

Application web personnelle d'analyse et de progression aux échecs. Elle récupère mes parties
publiques Chess.com, les analyse avec **Stockfish** (dans le navigateur, gratuit) et explique les
erreurs importantes avec **Claude Haiku 5.5**, à la demande.

- Cahier des charges : [`description.md`](description.md)
- Architecture et contrats entre modules : [`docs/architecture.md`](docs/architecture.md)
- Règles d'analyse (moteur, classification, IA, coûts) : [`.claude/skills/chess-analysis/SKILL.md`](.claude/skills/chess-analysis/SKILL.md)

## Prérequis

- Node.js 20.9 ou plus récent (20.18+ recommandé pour la CLI shadcn)
- Un projet Supabase (base PostgreSQL + Auth)
- Une clé API Anthropic

## Installation

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # puis remplir les valeurs
```

Variables (`.env.local`, jamais commité) :

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé Anthropic, **serveur uniquement** |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publishable Supabase (les données sont protégées par la RLS) |
| `ALLOWED_EMAIL` | Seule adresse autorisée à se connecter |
| `CHESSCOM_USERNAME` | Identifiant Chess.com par défaut |

### Base de données

Appliquer les migrations de `supabase/migrations/` dans l'ordre (éditeur SQL Supabase, ou
`supabase db push` avec la CLI). Toutes les tables ont la RLS activée et ne sont accessibles qu'à
l'adresse autorisée.

Dans Supabase › Authentication › URL Configuration, vérifier que l'URL du site
(`http://localhost:3000` en local) et l'URL de redirection `http://localhost:3000/auth/callback`
sont autorisées.

## Lancement

```bash
npm run dev        # http://localhost:3000
```

1. Se connecter avec l'adresse autorisée (lien envoyé par e-mail).
2. **Mes parties** › « Synchroniser mes parties » pour importer les parties Chess.com.
3. Ouvrir une partie › « Analyser cette partie » (Stockfish tourne dans le navigateur).
4. Sur une erreur, « Expliquer ce coup » pour l'explication pédagogique (appel IA facturé, mis en cache).
5. **Entraînement** pour rejouer ses propres erreurs sous forme d'exercices.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests unitaires (Vitest) |

## Maîtrise des coûts

- Les calculs échiquéens sont faits par Stockfish, jamais par l'IA.
- Les analyses de positions sont mises en cache (`position_analyses`) et jamais recalculées.
- Les explications IA sont déclenchées à la main, mises en cache, et limitées par les paramètres
  (appels par jour, budget mensuel). Chaque appel est journalisé avec son coût estimé (`ai_usage`),
  visible dans **Paramètres**.
