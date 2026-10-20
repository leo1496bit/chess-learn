# Lignes d'ouverture à maîtriser — plan de mise en œuvre

> **Pour les agents :** sous-skill OBLIGATOIRE : `frontend-setup:subagent-driven-development` (recommandé) ou
> `frontend-setup:executing-plans`, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** une bibliothèque des lignes adverses que Leonel rencontre, construite par Stockfish jusqu'au
milieu de partie, apprise en trois temps (étudier, réciter, réviser).

**Architecture :** les coups d'ouverture des parties sont indexés dans `game_positions`, interrogés par des
RPC SQL. L'arbre d'une ligne est assemblé **côté serveur** par une fonction pure (`buildTree`) qui lit le
cache `position_analyses`, les réponses issues des parties de Leonel et l'explorateur Lichess (mis en
cache). Le navigateur boucle : il demande au serveur les positions manquantes, les analyse avec Stockfish
WASM, les enregistre, puis relance jusqu'à ce que l'arbre soit complet. La construction peut donc reprendre
après une interruption, et le serveur ne fait jamais confiance à un coup « meilleur » envoyé par le client.

**Stack :** Next.js 16 (App Router), TypeScript strict, Supabase (RLS, RPC SQL), chess.js, Stockfish WASM
(`analyzePositionCached`), `@anthropic-ai/sdk` (`claude-haiku-5-5`) via `callStructured`, Zod, Vitest.

**Spécification :** `docs/superpowers/specs/2026-10-20-opening-lines-design.md`. Lisez-la avant toute
tâche, ainsi que `.claude/skills/chess-analysis/SKILL.md`, dont le chargement est obligatoire (`CLAUDE.md`).

## Contraintes globales

- Stockfish calcule, l'IA explique. Aucun coup, aucune variante, aucune évaluation ne vient de l'IA. Toutes
  les suites de coups sont validées par chess.js (`playUci`, `uciLineToSan`).
- Stockfish ne tourne que dans le navigateur (`analyzePositionCached(fen, { depth, multipv, awaitStore: true })`).
  Profondeur et MultiPV : `settings.engineDepth` et `settings.engineMultipv`, enregistrés sur la ligne au
  moment de la construction.
- Les noms d'ouverture et de gambit viennent uniquement du livre (`OPENING_BOOK`, `identify.ts`), côté
  serveur.
- `LICHESS_TOKEN` : serveur uniquement, optionnel, jamais préfixé `NEXT_PUBLIC_`, ni journalisé ni renvoyé
  au client. Point d'entrée : `https://explorer.lichess.org/lichess`, paramètres
  `ratings=1000,1200,1400,1600` et `speeds=blitz,rapid`, en-tête `Authorization: Bearer <jeton>`. Sans
  jeton, la fonctionnalité fonctionne avec les parties et le livre.
- Seuils (tous dans `src/lib/repertoire/constants.ts`, jamais en dur dans l'interface) :

  | Constante | Valeur |
  |---|---|
  | `NEAR_BEST_LOSS` | 2 |
  | `MAX_REPLIES` | 3 |
  | `EXPLORER_MIN_SHARE` | 0.15 |
  | `OWN_MIN_GAMES` | 3 |
  | `MAX_BRANCHES` | 8 |
  | `MAX_PLY` | 30 |
  | `THIN_EXPLORER_GAMES` | 50 |
  | `PUNISH_LOSS` | 10 |
  | `GAMBIT_PUNISH_WIN` | 60 |
  | `SUGGESTION_MIN_GAMES` | 5 |
  | `INDEX_PLIES` | 30 |
  | `BACKFILL_BATCH` | 300 |
  | `EXPLORER_TTL_DAYS` | 30 |
  | `EXPLORER_FETCHES_PER_STEP` | 8 |
  | `PLAYER_CANDIDATES` | 2 |

- Nouvelles tables : RLS `owner_all` avec `user_id = (select auth.uid()) and (select public.is_owner())`
  en `using` et `with check`. Les RPC sont en `security invoker`.
- Les migrations s'appliquent sur le projet Supabase distant `ebrmllckiovbpxunyorm`.
  **Demander la confirmation de Leonel avant chaque `apply_migration`.**
- Aucun appel IA payant pendant le développement ni les tests. Les tests utilisent un `MessagesClient`
  factice (`src/lib/ai/test-fixtures.ts`).
- Textes d'interface en français, phrases simples, mêmes jetons de design (palette « feuille de
  notation », `ClassificationBadge`, police Atkinson Hyperlegible Next).
- Installation de paquets : `npm install --legacy-peer-deps`. Aucun paquet nouveau n'est prévu.
- Ne pas lancer `next dev` sans l'accord de Leonel (le serveur local a déjà manqué de mémoire). Port 3001.

## Points de vigilance pour la relecture

1. **Position déjà dans la bibliothèque, ou transposition.** Ajouter une suggestion dont l'EPD de départ
   est déjà une ligne renvoie la ligne existante (HTTP 200), sans en créer de doublon. Test dans la tâche 8.
2. **Explorateur : limite de débit (429) ou jeton invalide (401).** La construction continue avec les
   parties de Leonel. Un 429 reporte l'appel à l'étape suivante et ne fait jamais échouer la ligne. Un 401
   est signalé une fois (« jeton Lichess refusé »). Tests dans les tâches 3 et 8.
3. **Fin de partie dans une branche** (mat ou pat avant le milieu de partie, dans une ligne-piège). La
   branche s'arrête sur la position terminale, sans analyse moteur (`terminalAnalysis`). Test dans la tâche 6.
4. **PGN invalide ou partie de moins de 30 demi-coups pendant l'indexation.** La partie est marquée
   indexée avec les positions disponibles, et le rattrapage ne boucle jamais dessus. Test dans la tâche 2.
5. **Coup de Leonel identique au coup attendu, mais avec une promotion ou un roque écrit autrement**
   (`e1g1` / `e1h1`). La comparaison se fait sur l'UCI normalisée par chess.js. Test dans la tâche 9.

---

### Tâche 1 : schéma de base de données

**Fichiers :**
- Créer : `supabase/migrations/20261021000000_opening_lines.sql`
- Modifier : `src/lib/db/database.types.ts` (régénéré)

**Interfaces produites :**
- `games.positions_indexed boolean not null default false`.
- `game_positions(game_id uuid → games on delete cascade, user_id, ply int, epd text, side_to_move text check in ('w','b'), path_uci text, move_uci text, move_san text, primary key (game_id, ply))`.
  - `ply` = nombre de demi-coups joués avant la position.
  - `path_uci` = coups UCI séparés par des espaces depuis le début (chaîne vide à `ply = 0`).
  - `move_uci` / `move_san` = coup joué depuis cette position.
  - Index : `(user_id, epd)`.
- `opening_lines(id uuid pk, user_id, name text, eco text, root_epd text, root_fen text, prefix_uci text[], prefix_san text[], player_color text, kind text null check in ('punish','master'), status text check in ('building','ready') default 'building', depth int, multipv int, games int default 0, wins int default 0, draws int default 0, losses int default 0, explorer_unavailable boolean default false, created_at, built_at timestamptz null, unique (user_id, root_epd))`.
- `opening_branches(id uuid pk, line_id → opening_lines on delete cascade, user_id, path_uci text[], path_san text[], end_fen text, own_games int, explorer_games int, archived boolean default false, studied_at timestamptz null, due_at timestamptz default now(), interval_days numeric(8,2) default 0, attempts int default 0, successes int default 0, last_result text null check in ('correct','incorrect'), unique (line_id, path_uci))`.
  - `path_uci` / `path_san` partent de la racine de la ligne.
- `opening_branch_explanations(id bigint identity pk, user_id, branch_id → opening_branches on delete cascade, prompt_version text, model text, content jsonb, verified boolean default true, created_at, unique (branch_id, prompt_version, model))`.
- `explorer_cache(user_id, epd text, params text, data jsonb, fetched_at timestamptz default now(), primary key (user_id, epd, params))`.
- RPC `opening_reply_stats(p_epd text)` : renvoie `table(move_uci text, move_san text, games bigint, wins bigint, draws bigint, losses bigint)`.
  - Lignes de `game_positions` jointes à `games`, avec `epd = p_epd` et `games.player_color <> side_to_move` : seuls les coups **adverses**.
  - Tri par `games` décroissant.
- RPC `opening_position_stats(p_min_games int, p_max_ply int)` : renvoie `table(epd text, player_color text, games bigint, wins bigint, draws bigint, losses bigint, top_path text)`.
  - Positions où `side_to_move = games.player_color`, avec `ply` entre 1 et `p_max_ply`.
  - `having count(*) >= p_min_games`.
  - `top_path` = `path_uci` le plus fréquent (`mode() within group (order by path_uci)`).

- [ ] **Étape 1 : écrire la migration.** Toutes les tables ont RLS activée et la politique `owner_all`.
  Les RPC sont en `language sql stable security invoker set search_path = ''`, sur le modèle de
  `20261020010000_ai_usage_summary.sql`.
- [ ] **Étape 2 : demander la confirmation de Leonel, puis appliquer** avec
  `mcp__claude_ai_Supabase__apply_migration` (nom `opening_lines`). Attendu : succès.
- [ ] **Étape 3 : vérifier.** Lancer `mcp__claude_ai_Supabase__get_advisors` (type `security`).
  Attendu : aucun nouvel avertissement sur ces tables ou ces fonctions.
- [ ] **Étape 4 : régénérer les types.** Lancer `mcp__claude_ai_Supabase__generate_typescript_types` et
  écrire le résultat dans `src/lib/db/database.types.ts`, puis `npm run typecheck`. Attendu : 0 erreur.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): schema for opening lines`.

### Tâche 2 : indexation des coups d'ouverture des parties

**Fichiers :**
- Créer : `src/lib/repertoire/constants.ts` (toutes les constantes des contraintes globales)
- Créer : `src/lib/repertoire/positions.ts`, `src/lib/repertoire/positions.test.ts`
- Créer : `src/lib/repertoire/index-games.ts` (serveur : lecture des parties, écriture des positions)
- Créer : `src/app/api/openings/backfill/route.ts`
- Modifier : `src/lib/chesscom/sync.ts`, pour indexer les parties insérées (récupérer `id, pgn` dans le
  `.select`)

**Interfaces produites :**
- `type GamePosition = { ply: number; epd: string; sideToMove: Color; pathUci: string; moveUci: string; moveSan: string }`
- `openingPositions(pgn: string, maxPlies = INDEX_PLIES): GamePosition[]` : renvoie `[]` si le PGN est
  invalide.
- `indexGames(supabase, games: { id: string; pgn: string }[]): Promise<number>` : insère les positions
  (`upsert ignoreDuplicates`) et passe `positions_indexed` à `true`, même quand il n'y a aucune position.
- `POST /api/openings/backfill` → `{ indexed: number; remaining: number }`. Traite au plus
  `BACKFILL_BATCH` parties où `positions_indexed = false`. Renvoie 401 sans session.

- [ ] **Étape 1 : tests en échec** dans `positions.test.ts` :
  - `openingPositions("1. e4 c6 2. Nc3 d5 3. Nf3 *")` renvoie 5 lignes. La première vaut
    `{ ply: 0, sideToMove: "w", pathUci: "", moveUci: "e2e4", moveSan: "e4" }`. La dernière a
    `ply: 4`, `pathUci: "e2e4 c7c6 b1c3 d7d5"`, `moveUci: "g1f3"`.
  - Une partie de 80 demi-coups donne exactement 30 lignes (`ply` de 0 à 29).
  - `"1. e4 e5 2. Ke3?? *"` (illégal) renvoie `[]`.
  - `epd` vaut `toEpd(fen)` : 4 champs, sans les compteurs.
- [ ] **Étape 2 :** `npm test -- src/lib/repertoire/positions.test.ts`. Attendu : ÉCHEC (module absent).
- [ ] **Étape 3 :** implémenter `openingPositions` avec `new Chess().loadPgn` et `history({ verbose: true })`.
- [ ] **Étape 4 :** relancer le test. Attendu : SUCCÈS.
- [ ] **Étape 5 :** implémenter `indexGames` (insertion par paquets de 500 lignes) et la route de rattrapage,
  sur le modèle de `getAuthorizedUser` dans `src/app/api/training/attempt/route.ts`, puis appeler
  `indexGames` après l'upsert dans `sync.ts`. Lancer `npm run typecheck && npm test`. Attendu : tout vert.
- [ ] **Étape 6 : commiter.** Message : `feat(openings): index opening moves of imported games`.

### Tâche 3 : client de l'explorateur Lichess et son cache

**Fichiers :**
- Créer : `src/lib/lichess/explorer.ts`, `src/lib/lichess/explorer.test.ts`
- Créer : `src/lib/repertoire/explorer-store.ts` (serveur : lecture et écriture de `explorer_cache`)
- Modifier : `src/lib/env.ts` (`serverEnv.lichessToken: string | undefined`), `.env.example`
  (`LICHESS_TOKEN=` vide, avec un commentaire « jeton sans aucune autorisation, lichess.org/account/oauth/token »)

**Interfaces produites :**
- `type ExplorerMove = { uci: string; san: string; games: number; share: number }` : `share` = `games / total`.
- `type ExplorerResult = { total: number; moves: ExplorerMove[] }`
- `class ExplorerError extends Error { code: "rate_limited" | "unauthorized" | "unavailable" }`
- `fetchExplorer(epd: string, token: string, fetchImpl: typeof fetch = fetch): Promise<ExplorerResult>`.
  Les `games` d'un coup valent `white + draws + black`. Délai d'attente de 10 s.
- `EXPLORER_PARAMS = "ratings=1000,1200,1400,1600&speeds=blitz,rapid"` : sert aussi de clé `params` du cache.
- `getExplorer(supabase, epd, opts: { token?: string; budget: { left: number }; now: Date }): Promise<ExplorerResult | "missing" | "unavailable">`.
  - Renvoie le cache s'il a moins de `EXPLORER_TTL_DAYS` jours.
  - Sinon, appelle l'API si `budget.left > 0`, puis décrémente le budget et écrit le cache.
  - Renvoie `"missing"` si le budget est épuisé ou en cas de 429 : la position sera recherchée à l'étape
    suivante.
  - Renvoie `"unavailable"` s'il n'y a pas de jeton, en cas de 401, ou si le service est indisponible.

- [ ] **Étape 1 : tests en échec** avec un `fetchImpl` factice :
  - l'URL contient `explorer.lichess.org/lichess`, `fen=` encodé et `ratings=1000,1200,1400,1600&speeds=blitz,rapid` ;
  - l'en-tête vaut `Authorization: Bearer t0k` ;
  - une réponse `{ white: 60, draws: 10, black: 30, moves: [{ uci: "g1f3", san: "Nf3", white: 30, draws: 5, black: 15 }] }`
    donne `{ total: 100, moves: [{ uci: "g1f3", san: "Nf3", games: 50, share: 0.5 }] }` ;
  - un statut 429 lève `code: "rate_limited"`, un 401 `code: "unauthorized"`.
- [ ] **Étape 2 :** `npm test -- src/lib/lichess`. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter `fetchExplorer`, `getExplorer` et `serverEnv.lichessToken`, qui lève une
  erreur si on la lit côté client, comme `anthropicApiKey`.
- [ ] **Étape 4 :** relancer les tests. Attendu : SUCCÈS. Puis `npm run typecheck`.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): Lichess explorer client with cache`.

### Tâche 4 : sélection des réponses adverses

**Fichiers :**
- Créer : `src/lib/repertoire/replies.ts`, `src/lib/repertoire/replies.test.ts`

**Interfaces produites :**
- `type Reply = { uci: string; san: string; ownGames: number; explorerGames: number; explorerShare: number; source: "own" | "explorer" }`
- `mergeReplies(own: { uci: string; san: string; games: number }[], explorer: ExplorerResult | null): Reply[]`. Les réponses sont triées ainsi :
  1. d'abord celles avec `ownGames >= OWN_MIN_GAMES` (`source: "own"`), par `ownGames` décroissant ;
  2. puis celles avec `explorerShare >= EXPLORER_MIN_SHARE` (`source: "explorer"`), par part décroissante ;
  3. les autres réponses sont exclues ; en cas de doublon, la source « own » l'emporte.
- `takeReplies(merged: Reply[], leavesLeft: number): Reply[]` : prend les `min(MAX_REPLIES, max(1, leavesLeft))` premières.

- [ ] **Étape 1 : tests en échec** :
  - own `[{e4d5, 12}, {f1e2, 6}, {h2h3, 2}]` et explorer `{ h2h3: 0.40, d2d4: 0.20, a2a3: 0.05 }` donnent
    l'ordre `exd5, Be2, h3, d4`. `h3` est de source `explorer` : 2 parties propres ne suffisent pas, mais sa
    part de 0,40 suffit. `a3` est exclu.
  - `takeReplies(cinq réponses, 8)` en renvoie 3 ; `takeReplies(cinq réponses, 1)` en renvoie 1 ;
    `takeReplies(cinq réponses, 0)` en renvoie 1, car une branche ne s'arrête jamais faute de budget au
    milieu d'un nœud adverse.
  - `explorer = null` : seules les réponses de source « own » sont gardées.
- [ ] **Étape 2 :** lancer les tests. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter.
- [ ] **Étape 4 :** lancer les tests. Attendu : SUCCÈS.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): opponent reply selection`.

### Tâche 5 : choix du coup de Leonel, catégorie de la ligne, fin de branche

**Fichiers :**
- Créer : `src/lib/repertoire/choose.ts`, `src/lib/repertoire/choose.test.ts`

**Interfaces consommées :** `moverWinPercent` (`win.ts`), `phase(fen, ply)` (`phase.ts`), `OPENING_BOOK` /
`toEpd`, `PositionAnalysis`.

**Interfaces produites :**
- `playerCandidates(fen: string, book: OpeningBook, explorer: ExplorerResult | null): string[]` : UCI.
  - Coups légaux dont la position d'arrivée est dans le livre, plus les coups de l'explorateur avec une part
    d'au moins `EXPLORER_MIN_SHARE`.
  - Triés : livre et explorateur d'abord, puis la part de l'explorateur. Au plus `PLAYER_CANDIDATES` coups,
    sans doublon.
- `choosePlayerMove(analysis: PositionAnalysis, candidateEvals: Map<string, Evaluation>, color: Color): { uci: string; fromBook: boolean }`.
  - Le meilleur coup est `analysis.lines[0].pvUci[0]`.
  - L'évaluation d'un candidat est celle de sa ligne MultiPV si elle existe, sinon celle de `candidateEvals`.
  - Retient le premier candidat dont la perte (`moverWinPercent` du meilleur moins celui du candidat) est
    strictement inférieure à `NEAR_BEST_LOSS`, sinon le meilleur coup.
- `candidatesNeedingEval(analysis, candidates): string[]` : les candidats absents de la MultiPV.
- `lineKind(input: { lossOfDefiningMove: number; bookName: string | null; playerWinAtRoot: number }): "punish" | "master"`.
  - `"punish"` si `lossOfDefiningMove >= PUNISH_LOSS`, ou si le nom contient `"Gambit"` et que
    `playerWinAtRoot >= GAMBIT_PUNISH_WIN`.
  - Sinon `"master"`.
- `branchEnds(input: { fen: string; ply: number; ownGames: number; explorerTotal: number | null }): boolean`.
  - Vrai si la position est terminale, si `phase(fen, ply) !== "opening"`, ou si `ply >= MAX_PLY`.
  - Vrai aussi si `explorerTotal !== null && explorerTotal < THIN_EXPLORER_GAMES && ownGames < OWN_MIN_GAMES`.
  - `ply` est compté depuis la position initiale, préfixe compris.

- [ ] **Étape 1 : tests en échec** :
  - **`choosePlayerMove` avec un candidat du livre :** meilleur coup à +0,40 (point de vue Blancs, Blancs au
    trait), candidat du livre à +0,25 → le livre l'emporte (`fromBook: true`).
  - **`choosePlayerMove` avec un candidat trop faible :** candidat du livre à −0,60 → le meilleur coup
    l'emporte.
  - **`choosePlayerMove` côté Noirs :** même cas vu par les Noirs ; les scores sont convertis par
    `moverWinPercent`.
  - **`candidatesNeedingEval` :** ne renvoie pas un candidat déjà présent en MultiPV 2.
  - **`lineKind` :** perte de 12 → `punish` ; perte de 4 et « Englund Gambit » avec 65 % pour Leonel →
    `punish` ; perte de 4 et « Caro-Kann Defense: Two Knights Attack » → `master`.
  - **`branchEnds` :** vrai au demi-coup 30, vrai pour un mat, vrai pour explorateur 40 et 1 partie propre,
    faux pour explorateur `null` et 1 partie propre au demi-coup 12 en phase d'ouverture.
- [ ] **Étape 2 :** lancer les tests. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter.
- [ ] **Étape 4 :** lancer les tests. Attendu : SUCCÈS.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): player move choice, line kind, branch end`.

### Tâche 6 : assemblage pur de l'arbre

**Fichiers :**
- Créer : `src/lib/repertoire/tree.ts`, `src/lib/repertoire/tree.test.ts`

**Interfaces consommées :** tâches 4 et 5, `terminalAnalysis`, `playUci`.

**Interfaces produites :**
- `type AnalysisNeed = { fen: string; multipv: number }` : `multipv` = `line.multipv` pour une position où
  Leonel joue, `1` pour l'évaluation d'un candidat et pour la position finale d'une branche.
- `type TreeDeps = { analysis(fen: string, multipv: number): PositionAnalysis | undefined; ownReplies(epd: string): { uci: string; san: string; games: number }[] | undefined; explorer(epd: string): ExplorerResult | null | undefined; book: OpeningBook }`.
  - `undefined` signifie « pas encore disponible ».
  - `null` signifie « explorateur indisponible ».
- `type BuiltBranch = { pathUci: string[]; pathSan: string[]; endFen: string; ownGames: number; explorerGames: number }`
- `type TreeResult = { complete: boolean; needs: AnalysisNeed[]; needsReplies: string[]; branches: BuiltBranch[]; kind: "punish" | "master" | null }`
  - `needsReplies` contient des EPD.
- `buildTree(root: { fen: string; ply: number; playerColor: Color; prefixUci: string[]; bookName: string | null }, deps: TreeDeps, multipv: number): TreeResult`.
  - Parcours en profondeur, réponses les plus fréquentes d'abord, avec un budget global de
    `MAX_BRANCHES` feuilles.
  - À un nœud de Leonel : demande l'analyse, puis les évaluations des candidats, puis joue
    `choosePlayerMove`.
  - À un nœud adverse : teste `branchEnds` (avec `ownGames` = somme des parties propres à ce nœud), sinon
    `takeReplies(mergeReplies(...), leavesLeft)`.
  - Un sous-arbre qui attend des données (`undefined`) est noté dans `needs` / `needsReplies`, et le
    parcours continue sur les autres branches : une seule étape collecte le plus de besoins possible.
  - `kind` exige l'analyse de la position avant le coup qui définit la ligne (`prefixUci` sans son dernier
    coup) et celle de la racine.
  - `complete = needs.length === 0 && needsReplies.length === 0`.

- [ ] **Étape 1 : tests en échec** avec des dépendances factices construites dans le test (des tables
  `Map`) :
  - **Cache vide :** `needs` contient la racine (multipv 3) et la position précédente, `complete: false`,
    `branches: []`.
  - **Données complètes sur un arbre jouet :** 2 réponses adverses au premier nœud, une réponse ensuite, fin
    par `MAX_PLY` simulé → 2 branches, chemins exacts en UCI et SAN, `complete: true`.
  - **Budget :** un arbre factice qui offrirait 3 réponses à chaque nœud sur 4 niveaux donne au plus
    8 branches.
  - **Mat :** un mat dans la ligne arrête la branche sur la position de mat, sans `need` pour cette position.
  - **Explorateur `null` partout :** l'arbre se construit avec les seules réponses propres.
- [ ] **Étape 2 :** lancer les tests. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter.
- [ ] **Étape 4 :** lancer les tests. Attendu : SUCCÈS.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): pure tree assembly`.

### Tâche 7 : suggestions et index des noms du livre

**Fichiers :**
- Modifier : `scripts/build-openings.mjs`, pour produire aussi `src/lib/openings/names.json` :
  `[eco, name, uci]`, où `uci` est la ligne du TSV convertie en UCI séparés par des espaces.
- Créer : `src/lib/openings/names.ts` (`server-only`, export `OPENING_NAMES`, `searchOpenings(query: string, limit = 20)`)
- Créer : `src/lib/repertoire/suggestions.ts`, `src/lib/repertoire/suggestions.test.ts`

**Interfaces produites :**
- `type PositionStat = { epd: string; playerColor: Color; games: number; wins: number; draws: number; losses: number; topPath: string }`
  (forme de la RPC `opening_position_stats`).
- `type Suggestion = PositionStat & { name: string; eco: string; lossRate: number }`
- `selectSuggestions(stats: PositionStat[], book: OpeningBook, existingRootEpds: Set<string>): Suggestion[]`.
  - On ne garde que les positions où `book[epd]` existe avec `exact = 1` et un nom non vide, et où le chemin
    compte au moins 3 demi-coups.
  - On retire les positions déjà dans la bibliothèque.
  - On retire un ancêtre (une position dont le `topPath` est un préfixe du `topPath` d'une autre suggestion)
    si un descendant réunit au moins 80 % de ses parties.
  - Tri : `games` décroissant, puis `lossRate` décroissant.
- `searchOpenings("two knights")` : recherche insensible à la casse sur le nom ; renvoie `{ eco, name, uci }[]`.

- [ ] **Étape 1 : tests en échec** :
  - Les stats de `1.e4` (700 parties, nom « King's Pawn Game », chemin de 1 demi-coup) sont exclues.
  - « Caro-Kann Defense: Two Knights Attack » (54 parties) est gardée, avec `lossRate` = 35/54.
  - Un ancêtre à 60 parties dont le descendant en compte 54 (90 %) est retiré.
  - Une position déjà dans la bibliothèque est retirée.
  - L'ordre suit le nombre de parties.
- [ ] **Étape 2 :** lancer les tests. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter, puis lancer `npm run build:openings`. Attendu : `names.json` créé, environ
  3 500 entrées.
- [ ] **Étape 4 :** lancer les tests. Attendu : SUCCÈS.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): suggestions from games and book name index`.

### Tâche 8 : API des lignes (création, étape de construction, mise à jour)

**Fichiers :**
- Créer : `src/lib/repertoire/merge.ts`, `src/lib/repertoire/merge.test.ts`
- Créer : `src/lib/repertoire/store.ts` (serveur : lecture et écriture des lignes et des branches, `TreeDeps`
  alimentés par la base)
- Créer : `src/app/api/openings/lines/route.ts` (POST)
- Créer : `src/app/api/openings/lines/[id]/build/route.ts` (POST)
- Créer : `src/app/api/openings/lines/[id]/rebuild/route.ts` (POST)

**Interfaces produites :**
- `POST /api/openings/lines` : corps Zod `{ source: "suggestion", epd: string } | { source: "manual", uci: string[] }`.
  - **Suggestion :** le préfixe vient de `top_path`. **Manuel :** le préfixe est la suite saisie, rejouée
    avec chess.js.
  - La racine est la position finale du préfixe. `playerColor` est le camp au trait à la racine. Le dernier
    coup du préfixe doit être adverse (sinon 400 « La ligne doit commencer après un coup adverse »).
  - `name` et `eco` viennent du livre, via `identifyOpening`.
  - Les statistiques de parties sont copiées depuis la RPC.
  - Si la ligne existe déjà (même `root_epd`), on renvoie `200 { id, existing: true }`, sinon
    `201 { id, existing: false }`.
- `POST /api/openings/lines/[id]/build` → `{ status: "building" | "ready"; needs: AnalysisNeed[]; progress: { branches: number; pending: number }; explorerUnavailable: boolean }`.
  1. Charge le cache d'analyses des FEN déjà rencontrées, ou les relit à la demande.
  2. Résout `needsReplies` : RPC `opening_reply_stats` + `getExplorer`, avec un budget de
     `EXPLORER_FETCHES_PER_STEP` appels.
  3. Relance `buildTree` tant que de nouvelles réponses arrivent pendant l'étape.
  4. Renvoie `needs`.
  - Quand `complete`, écrit les branches avec `mergeBranches`, passe `status: "ready"`, `kind` et
    `built_at`.
  - Un 401 de l'explorateur passe `explorer_unavailable = true`.
- `POST /api/openings/lines/[id]/rebuild` : repasse en `building`, avec la profondeur et le MultiPV des
  paramètres actuels.
- `mergeBranches(existing: { id: string; pathUci: string[]; archived: boolean }[], built: BuiltBranch[]): { keep: string[]; archive: string[]; insert: BuiltBranch[] }`.
  - Correspondance sur `pathUci.join(" ")`.
  - Une branche archivée qui réapparaît est désarchivée (elle va dans `keep`).

- [ ] **Étape 1 : tests en échec** pour `mergeBranches` :
  - branche identique → `keep` ;
  - branche disparue → `archive` ;
  - branche nouvelle → `insert` ;
  - branche archivée qui revient → `keep`.
- [ ] **Étape 2 :** lancer les tests. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter `mergeBranches`. Lancer les tests. Attendu : SUCCÈS.
- [ ] **Étape 4 : tests de la logique de route** avec un faux magasin injecté. Extraire
  `createLine(store, body)` et `buildStep(store, deps, line)` dans `store.ts` pour les tester sans HTTP.
  - doublon de `root_epd` → `existing: true` ;
  - préfixe manuel qui se termine par un coup de Leonel → erreur 400 ;
  - `getExplorer` renvoie `"missing"` (429) → `status: "building"` et la ligne n'échoue pas ;
  - `getExplorer` renvoie `"unavailable"` après un 401 → `explorerUnavailable: true` et l'arbre se termine
    avec les parties.
- [ ] **Étape 5 :** implémenter les routes (401 sans session, 404 si la ligne est absente). Lancer
  `npm run typecheck && npm test`. Attendu : tout vert.
- [ ] **Étape 6 : commiter.** Message : `feat(openings): line creation and resumable build API`.

### Tâche 9 : récitation et révision

**Fichiers :**
- Créer : `src/lib/repertoire/recite.ts`, `src/lib/repertoire/recite.test.ts`
- Créer : `src/app/api/openings/branches/[id]/move/route.ts`
- Créer : `src/app/api/openings/branches/[id]/review/route.ts`

**Interfaces produites :**
- `judgeLineMove(input: { fen: string; expectedUci: string; answerUci: string; before?: PositionAnalysis; after?: PositionAnalysis; color: Color }): "expected" | "alternative" | "wrong" | "needs_analysis"`.
  - Les deux coups sont normalisés par chess.js (`positionAfter` de `training/attempt.ts`).
  - Coup identique → `"expected"`.
  - Sinon, sans `before` ou `after` → `"needs_analysis"`.
  - Sinon, `"alternative"` si la perte par rapport au coup attendu est inférieure à `NEAR_BEST_LOSS`.
  - Sinon `"wrong"`.
- `reviewSucceeded(input: { hints: number; revealed: number }): boolean` : vrai si `revealed === 0 && hints <= 1`.
- `POST /api/openings/branches/[id]/move` avec `{ index: number; answerUci: string }`.
  - `index` est la position dans `path_uci`, et doit désigner un coup de Leonel.
  - Le serveur relit `before` et `after` dans `position_analyses`, avec la profondeur de la ligne et
    `multipv` 1 pour `after`.
  - Renvoie `{ verdict, expectedSan? }`. `expectedSan` n'est renvoyé que pour `alternative`.
  - `needs_analysis` → 409 `{ verdict: "needs_analysis", fen }`. Le client analyse puis renvoie.
- `POST /api/openings/branches/[id]/review` avec `{ hints: number; revealed: number }`.
  - `scheduleReview` (`sm2.ts`) avec `correct = reviewSucceeded(...)`.
  - Met à jour `due_at`, `interval_days`, `attempts`, `successes` et `last_result`, et écrit `studied_at`
    s'il est nul.
- Un coup `"alternative"` ne compte ni comme indice ni comme erreur : le client ne l'ajoute à aucun compteur.

- [ ] **Étape 1 : tests en échec** :
  - `e1g1` attendu et `e1g1` joué → `expected` ;
  - perte de 1,5 → `alternative` ;
  - perte de 6 → `wrong` ;
  - analyse manquante → `needs_analysis` ;
  - `reviewSucceeded({ hints: 1, revealed: 0 })` vrai, `({ hints: 2, revealed: 0 })` faux,
    `({ hints: 0, revealed: 1 })` faux.
- [ ] **Étape 2 :** lancer les tests. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter.
- [ ] **Étape 4 :** lancer les tests. Attendu : SUCCÈS.
- [ ] **Étape 5 :** implémenter les routes, puis `npm run typecheck`.
- [ ] **Étape 6 : commiter.** Message : `feat(openings): recitation verdict and spaced review`.

### Tâche 10 : idées et plan par branche (IA)

**Fichiers :**
- Créer : `src/lib/ai/branch/schema.ts`, `input.ts`, `prompt.ts`, `verify.ts`, `generate.ts`, `store.ts`, et
  les tests `*.test.ts` correspondants
- Créer : `src/app/api/openings/branches/[id]/explain/route.ts`

**Interfaces consommées :** `callStructured`, `AiError`, `toAiError`, `checkLimits`, `estimateCost`,
`verifyMoves`, `normalizeSan`, `recordAiUsage(supabase, "branch", record)`. Le modèle à suivre est
`src/lib/ai/report/generate.ts` : cache → limites → appel → vérification (une seule nouvelle tentative) →
stockage.

**Interfaces produites :**
- `BranchIdeasSchema` (Zod) : `{ moves: { index: number; idea: string }[]; plan: string; confidence: "high" | "medium" | "low" }`.
  - `index` désigne un demi-coup de la branche (0 = premier coup après la racine).
  - On attend une idée pour chaque coup, de Leonel comme de l'adversaire. Pour un coup adverse, l'idée est
    formulée comme une hypothèse.
- `BRANCH_PROMPT_VERSION = "branch-v1"`, `BRANCH_MAX_TOKENS = 3000`.
- `buildBranchInput(line, branch, analyses: Map<string, PositionAnalysis>): { text: string; allowedMoves: Set<string>; protectedPhrases: string[] }`.
  - **Données transmises :** nom et ECO du livre, catégorie (« à punir » ou « à maîtriser »), couleur de
    Leonel, préfixe en SAN, coups de la branche avec leur auteur.
  - **Pour chaque coup de Leonel :** évaluation (`formatEvaluation`) et MultiPV en SAN, 6 demi-coups au plus.
  - **Position finale :** FEN, liste des pièces et MultiPV 1 en SAN, 8 demi-coups au plus.
  - **Coups autorisés :** préfixe, branche et toutes les variantes transmises.
  - **Phrases protégées :** les noms du livre.
- `verifyBranchIdeas(ideas, allowed, protectedPhrases, branchLength)`.
  - Les SAN des textes doivent figurer parmi les coups autorisés.
  - Chaque `index` doit être compris entre 0 et `branchLength - 1`, et chaque demi-coup doit avoir une idée.
- `generateBranchIdeas(params)` : même signature et même comportement que `generateGameReport`, avec un
  `BranchIdeasStore` qui remplace `ReportStore`.
- `POST /api/openings/branches/[id]/explain`.
  - Renvoie `{ ideas, verified, cached }`.
  - 429 si la limite est atteinte ou si l'IA est désactivée. Le client affiche alors la branche sans texte.

- [ ] **Étape 1 : tests en échec** :
  - `buildBranchInput` : `allowedMoves` contient les coups de la branche et ceux des variantes ; le texte
    contient le nom du livre.
  - `verifyBranchIdeas` : rejette un coup inventé (`Qh5` absent des données) et un `index` hors limites.
  - `generateBranchIdeas` avec un client factice : renvoie le cache sans appel ; une première réponse non
    vérifiée provoque une seconde tentative ; deux échecs donnent `verified: false` ; limite atteinte →
    `AiError` 429 sans appel ; une ligne `ai_usage` est écrite par appel.
- [ ] **Étape 2 :** `npm test -- src/lib/ai/branch`. Attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter le schéma, l'entrée, le prompt système (figé, en cache, versionné ; mêmes
  consignes que `prompt.ts`, avec en plus « explique l'idée de chaque coup et termine par un plan de milieu
  de partie fondé sur la position finale et la variante fournie »), la vérification, la génération, le
  magasin et la route.
- [ ] **Étape 4 :** lancer les tests. Attendu : SUCCÈS. Puis `npm run typecheck`.
- [ ] **Étape 5 : commiter.** Message : `feat(openings): AI ideas and plan per branch`.

### Tâche 11 : page `/openings` (bibliothèque, suggestions, rattrapage, ajout manuel)

**Fichiers :**
- Créer : `src/app/(app)/openings/page.tsx` et `src/app/(app)/openings/queries.ts`
- Créer : `src/components/openings/backfill-progress.tsx`, `line-list.tsx`, `suggestion-list.tsx`,
  `add-line-dialog.tsx`
- Créer : `src/app/api/openings/search/route.ts` (GET `?q=` → `searchOpenings`)
- Modifier : `src/components/app-nav.tsx` (entrée « Ouvertures » entre « Mes parties » et « Entraînement »,
  icône `BookOpen`)

**Ce que la page affiche :**
- **Rattrapage de l'indexation :** tant que `remaining > 0`, `BackfillProgress` appelle
  `POST /api/openings/backfill` en boucle, en affichant « Lecture de tes parties : X / 3 165 », puis
  rafraîchit la page (`router.refresh()`).
- **Bloc « Mes lignes » :**
  - nom du livre, couleur de Leonel, catégorie (« À punir » ou « À maîtriser ») ;
  - bilan « 54 parties · 16 V / 35 D », ou « données insuffisantes » sous `SUGGESTION_MIN_GAMES` ;
  - nombre de branches « à revoir aujourd'hui » ;
  - état « En construction » pour une ligne qui n'est pas prête.
  - La liste est triée : lignes à revoir d'abord, puis par nombre de parties.
- **Bloc « Suggestions » :** les 15 premières de `selectSuggestions`, chacune avec un bouton « Ajouter » →
  `POST /api/openings/lines`, puis redirection vers `/openings/[id]`.
- **Ajout manuel (« Ajouter une ligne ») :** deux onglets.
  - **« Jouer les coups »** : un échiquier où l'on joue les deux camps, puis le bouton « Créer la ligne ici ».
  - **« Chercher un nom »** : recherche dans le livre, puis bouton « Créer ». Il faut choisir son camp, car
    la racine doit suivre un coup adverse : si le dernier coup du nom est celui de Leonel, on renvoie l'erreur
    400 de la tâche 8.
- **État vide :** sans ligne ni suggestion, « Importe et synchronise tes parties pour voir les lignes que
  tu rencontres. »

- [ ] **Étape 1 :** charger la skill `frontend-setup:frontend-design` et respecter les jetons existants.
- [ ] **Étape 2 :** implémenter la page et les composants.
- [ ] **Étape 3 :** lancer `npm run lint && npm run typecheck && npm run build`. Attendu : 0 erreur.
- [ ] **Étape 4 : commiter.** Message : `feat(openings): library page with suggestions and manual add`.

### Tâche 12 : page `/openings/[id]` (construction, arbre, étude, récitation)

**Fichiers :**
- Créer : `src/app/(app)/openings/[id]/page.tsx`
- Créer : `src/components/openings/build-runner.tsx`, `line-tree.tsx`, `branch-study.tsx`, `branch-recite.tsx`
- Réutiliser : `ChessBoard`, `EvalBar`, `LinkedText` / `move-links.ts`, et la mise en page mobile épinglée de
  `game-analysis-view.tsx`

**Ce que la page fait :**
- **`BuildRunner`** (si `status = "building"`) :
  - Boucle : `POST build`, puis pour chaque `need`,
    `analyzePositionCached(fen, { depth: line.depth, multipv, awaitStore: true })`, puis nouvel appel, jusqu'à
    `ready`.
  - Affiche « Construction de la ligne : N analyses restantes » et une barre de progression.
  - Fermer la page interrompt la boucle ; la rouvrir la reprend.
  - Pendant la construction, les branches ne sont pas étudiables.
  - Si `explorerUnavailable`, affiche une note discrète : « Explorateur Lichess indisponible : la ligne
    s'appuie sur tes parties. »
- **`LineTree`** (maquette v2) :
  - arbre des branches, avec les coups de Leonel en gras et le nombre de parties de chaque réponse adverse ;
  - pastille d'état par branche : *pas encore étudiée* (`studied_at` nul), *à revoir aujourd'hui*
    (`isDue(due_at)`), *maîtrisée* ;
  - sélectionner une branche affiche sa position finale et son plan s'il est en cache ;
  - bouton « Mettre à jour la ligne » → `POST rebuild`, puis `BuildRunner`.
- **`BranchStudy`** (A) :
  - au premier affichage, `POST explain` ;
  - « Coup suivant » / « Coup précédent » ; l'idée de chaque coup s'affiche sous l'échiquier
    (`LinkedText`), le plan à la fin ;
  - erreur 429 ou IA désactivée → étude sans texte, avec le message de l'API ;
  - le bouton « Réciter maintenant » enchaîne directement sur la récitation.
- **`BranchRecite`** (B) :
  - Leonel joue ses coups ; l'adversaire répond seul après 400 ms.
  - Chaque coup est jugé par `POST move`. Sur un 409, le client analyse
    `analyzePositionCached(fenAfter, { multipv: 1, awaitStore: true })` et, si besoin, la position avant,
    puis renvoie le coup.
  - `wrong` : 1ʳᵉ fois, indice (la case de départ du coup attendu est mise en évidence) ; 2ᵉ fois, la
    réponse est révélée.
  - `alternative` : « Bon coup aussi, la ligne retenue est X », sans compteur.
  - En fin de branche, `POST review`, puis résultat (« Réussie » ou « À revoir demain ») et prochaine date.
- **Lien depuis `/training` :** « N branches d'ouverture à revoir » renvoie à `/openings`.

- [ ] **Étape 1 :** charger `frontend-setup:frontend-design`, puis implémenter les composants.
- [ ] **Étape 2 :** lancer `npm run lint && npm run typecheck && npm run build`. Attendu : 0 erreur.
- [ ] **Étape 3 : vérification manuelle**, avec l'accord de Leonel pour lancer `npx next dev -p 3001` et
  utiliser Chrome :
  - créer la ligne « Caro-Kann Defense: Two Knights Attack » depuis les suggestions ;
  - la construction aboutit à 8 branches au plus ;
  - étudier une branche, puis la réciter avec une erreur volontaire (l'indice apparaît) ;
  - fermer et rouvrir pendant une construction : elle reprend.
  - Ne pas cliquer sur « Étudier » sans l'accord de Leonel : c'est un appel IA payant.
- [ ] **Étape 4 : commiter.** Message : `feat(openings): line page with build, tree, study and recitation`.

### Tâche 13 : documentation, skill et vérification finale

**Fichiers :**
- Modifier : `.claude/skills/chess-analysis/SKILL.md` (nouvelle §13 « Lignes d'ouverture » : sources des
  coups, règles de choix, seuils de `constants.ts`, construction côté serveur à partir du cache, IA par
  branche, révision espacée ; ajouter une ligne à la checklist)
- Modifier : `docs/architecture.md`, `README.md` (`LICHESS_TOKEN` optionnel, sans autorisation)

- [ ] **Étape 1 :** rédiger la §13 et mettre à jour la documentation.
- [ ] **Étape 2 :** lancer `npm test && npm run lint && npm run typecheck && npm run build`. Attendu : tous
  les tests verts (au moins 280 plus les nouveaux), 0 erreur de lint ou de typage, build OK.
- [ ] **Étape 3 :** relecture de toute la branche (`frontend-setup:requesting-code-review`), avec
  traitement des retours confirmés.
- [ ] **Étape 4 : commiter.** Message : `docs(openings): skill §13 and architecture`. Leonel pousse lui-même
  (`! git push`).
