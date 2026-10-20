# Architecture de chess-learn

Lire aussi : `CLAUDE.md`, `AGENTS.md`, `description.md` (cahier des charges) et la skill
`.claude/skills/chess-analysis/SKILL.md` (règles d'analyse, obligatoires).

## Flux principal

```
Chess.com API ──(serveur: /api/sync)──► games (Supabase)
                                            │
             page /games/[id] (navigateur)  ▼
   PGN ─► chess.js ─► positions ─► Web Worker Stockfish ─► position_analyses (cache)
                                            │
                       src/lib/analysis (fonctions pures) ─► move_analyses + game_analyses
                                            │
           bouton « Expliquer » ─► POST /api/explanations (serveur) ─► Claude Haiku 5.5
                                            │                          ─► explanations + ai_usage
           bouton « Générer le bilan » ─► POST /api/game-report ─► Claude Haiku 5.5 ─► game_reports
             stats / tableau de bord ◄──────┤
             exercices (training) ◄─────────┘ (générés depuis move_analyses)
```

- Accès aux données : toujours avec la session de l'utilisateur (RLS). Côté serveur
  `createSupabaseServerClient()` / `requireUser()` / `getAuthorizedUser()` (`src/lib/db/server.ts`),
  côté navigateur `getSupabaseBrowserClient()` (`src/lib/db/client.ts`). Pas de clé service_role.
- Paramètres : `getSettings(supabase)` (`src/lib/db/settings.ts`), table `settings`.
- Types de la base : `src/lib/db/database.types.ts` (`Tables<"games">`, etc.).
- Types d'analyse partagés : `src/lib/analysis/types.ts`.

## Ouvertures

`src/lib/openings/` : livre Lichess (CC0) indexé par EPD, chargé côté serveur uniquement
(`book.ts`) ; `identifyOpening` / `theoryForPly` (purs) situent chaque coup dans la théorie. La page
`/games/[id]` calcule l'ouverture côté serveur et la passe au client.

### Lignes d'ouverture à maîtriser

```
parties (games) ─► game_positions (EPD, 30 premiers demi-coups) ─► RPC opening_position_stats / opening_root_stats / opening_reply_stats
page /openings ─► POST /api/openings/lines (suggestion ou ajout manuel) ─► opening_lines
page /openings/[id] ─► POST /api/openings/lines/[id]/build (boucle) ─► arbre + opening_branches
        ▲                          │ réponse : analyses manquantes (needs, profondeur demandée)
        └── Stockfish (navigateur) ┘ ─► position_analyses (cache) ; explorateur Lichess ─► explorer_cache (30 j)
récitation ─► POST /api/openings/branches/[id]/move (verdict serveur) ; /review (SM-2)
« Expliquer la branche » ─► POST /api/openings/branches/[id]/explain ─► Claude Haiku 5.5 ─► opening_branch_explanations + ai_usage
```

- Tables (migration `20261021000000_opening_lines.sql`, RLS) : `game_positions`, `opening_lines`,
  `opening_branches`, `opening_branch_explanations`, `explorer_cache`. RPC : `opening_reply_stats`,
  `opening_position_stats`, `opening_root_stats`.
- Routes `/api/openings` : `backfill`, `search`, `lines` (+ `lines/[id]/build`, `rebuild`),
  `branches/[id]/move`, `review`, `explain`. Pages : `/openings` (bibliothèque, suggestions) et
  `/openings/[id]` (arbre, étude, récitation).
- Code : `src/lib/repertoire/*` (pur, testé), `src/lib/lichess/explorer.ts` (jeton `LICHESS_TOKEN` serveur
  uniquement, sans autorisation), `src/lib/ai/branch/*`. Règles : skill chess-analysis §13.

## Contrats entre modules

### Moteur — `src/lib/engine/` (propriétaire : module Analyse)

```ts
// src/lib/engine/index.ts — navigateur uniquement
export function getEngine(): StockfishEngine; // singleton, worker /stockfish/stockfish-19-lite-single.js
export interface StockfishEngine {
  analyze(fen: string, opts: { depth: number; multipv: number; timeoutMs?: number; signal?: AbortSignal }): Promise<PositionAnalysis>;
  stop(): void;
  terminate(): void;
}
// Analyse avec cache Supabase (position_analyses) :
export function analyzePositionCached(fen: string, opts: { depth: number; multipv: number }): Promise<PositionAnalysis>;
```

### Fonctions d'analyse — `src/lib/analysis/` (propriétaire : module Analyse)

```ts
winPercent(evaluation: Evaluation): number                    // point de vue Blancs
moverWinPercent(evaluation: Evaluation, color: Color): number
classifyMove(input): { classification, loss, accuracy, missedWin, missedSave } // seuils en paramètre
evaluateCandidateMove(fenBefore, uci, before: PositionAnalysis, after: PositionAnalysis, thresholds) // réutilisé par l'entraînement
uciLineToSan(fen: string, uci: string[], maxPlies = 8): { san: string[]; uci: string[] }
formatEvaluation(evaluation: Evaluation): string             // "+1.35", "#-2"
```

### Composants échiquiers — `src/components/chess/` (propriétaire : module Analyse)

```tsx
<ChessBoard fen orientation="white"|"black" arrows?={[{from,to,color?}]} highlightSquares?={string[]}
            onPieceDrop?={(from, to, promotion?) => boolean} interactive?={boolean} />
<EvalBar evaluation={Evaluation} orientation />
<ClassificationBadge classification withLabel? />   // déjà présent
```

### Explications — `src/components/ai/explanation-panel.tsx` (propriétaire : module IA)

```tsx
<ExplanationPanel gameId={string} move={MoveAnalysis} />  // bouton « Expliquer ce coup », cache, état, erreurs
```
API : `POST /api/explanations` body `{ gameId: string, ply: number }` → `{ explanation, cached, verified }`
ou `{ error }` (401, 404, 422, 429 limite atteinte, 502). Le serveur relit `move_analyses` en base :
il ne fait jamais confiance aux données échiquéennes envoyées par le navigateur.

## Propriété des fichiers (travail en parallèle)

| Module | Fichiers |
|---|---|
| Import Chess.com | `src/lib/chesscom/**`, `src/lib/pgn/**`, `src/app/api/sync/**`, `src/app/(app)/games/page.tsx`, `src/components/games/**` |
| Analyse | `src/lib/engine/**`, `src/lib/analysis/**` (hors `types.ts`, qu'on étend sans casser), `src/components/chess/**`, `src/app/(app)/games/[id]/**`, `src/components/analysis/**` |
| IA + Paramètres | `src/lib/ai/**`, `src/app/api/explanations/**`, `src/components/ai/**`, `src/app/(app)/settings/**`, `src/components/settings/**`, `src/app/api/settings/**` |
| Stats + Entraînement | `src/lib/stats/**`, `src/lib/training/**`, `src/app/(app)/page.tsx`, `src/app/(app)/stats/**`, `src/app/(app)/training/**`, `src/components/stats/**`, `src/components/training/**`, `src/app/api/training/**` |

Fichiers partagés (layout, `globals.css`, `types.ts`, `database.types.ts`, migrations, `package.json`) :
ne pas les modifier sans nécessité ; signaler tout besoin dans le rapport final.

## Design

Palette « feuille de notation » (encre marine sur papier froid, échiquier ardoise), police
Atkinson Hyperlegible Next, chiffres tabulaires (`.tabular`) pour les évaluations. Symboles
d'annotation (`!`, `?!`, `?`, `??`) comme langage visuel des erreurs via `ClassificationBadge`.
Couleurs utilitaires Tailwind : `bg-board-light`, `bg-board-dark`, `text-cls-blunder`, `bg-cls-mistake/10`,
`bg-eval-white`, `bg-eval-black`… Éviter : cartes identiques partout, libellés en capitales, flèches `→` dans
les boutons, dégradés décoratifs. Textes en français, voix active, messages d'erreur qui disent quoi faire.
