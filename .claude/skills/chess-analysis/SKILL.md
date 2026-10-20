---
name: chess-analysis
description: Règles d'analyse échiquéenne du projet chess-learn — Stockfish (WASM, UCI, MultiPV, profondeur), conversion des évaluations, pourcentage de gain, classification des coups (imprécision/erreur/gaffe/occasion manquée), thèmes de faiblesses, validation des coups avec chess.js, explications pédagogiques Claude Haiku 5.5 fondées uniquement sur les données Stockfish, cache et maîtrise des coûts, génération d'exercices. À utiliser dès qu'une tâche touche à l'analyse de parties, au moteur, aux évaluations, aux meilleurs coups, aux erreurs, aux statistiques de faiblesses, aux explications IA ou aux exercices d'entraînement.
---

# Chess analysis — règles du projet

Source de vérité pour tout ce qui calcule, classe ou explique des coups dans chess-learn.
Le cahier des charges complet est dans `description.md` (§4, §5, §7, §8).

**Principe fondamental : Stockfish calcule, l'IA explique.** Aucun coup, aucune variante,
aucune évaluation ne doit provenir de l'IA. L'IA ne reçoit que des données calculées par
Stockfish et validées par chess.js.

## 1. Où le code vit

| Rôle | Emplacement |
|---|---|
| Types partagés (Evaluation, MoveAnalysis, Classification…) | `src/lib/analysis/types.ts` |
| Fonctions pures (win %, classification, précision, thèmes, phase) | `src/lib/analysis/*.ts` — testées unitairement |
| Moteur (Web Worker + protocole UCI) | `src/lib/engine/` (navigateur uniquement) |
| Fichiers Stockfish WASM | `public/stockfish/` |
| Explications IA (serveur uniquement) | `src/lib/ai/` + `src/app/api/explanations/` |
| Exercices | `src/lib/training/` |

Ne pas dupliquer ces fonctions ailleurs : importer depuis ces modules.

## 2. Moteur Stockfish

- Stockfish tourne **dans le navigateur** (WebAssembly, build *lite single-thread* du paquet npm `stockfish`), dans un **Web Worker** dédié, piloté en UCI. Jamais sur le thread principal, jamais côté serveur Vercel.
- Initialisation : `uci` → attendre `uciok` → `setoption name MultiPV value N` → `isready` → `readyok`. Sur chaque position : `position fen <FEN>` puis `go depth <D>` ; lire les lignes `info ... multipv k ... score (cp|mate) X ... pv ...` de la **dernière profondeur complète**, jusqu'à `bestmove`.
- Un seul `go` à la fois par worker ; file d'attente ; `stop` + timeout (par défaut 15 s par position) avec repli sur la meilleure profondeur atteinte. Un résultat de repli est marqué `partial: true` : utilisable pour l'affichage, **jamais écrit dans `position_analyses`** (sinon une analyse incomplète deviendrait définitive), et signalé à l'utilisateur.
- Paramètres par défaut (configurables dans Paramètres) : profondeur **16**, **MultiPV 3**, et MultiPV 1 suffit pour la position *après* le dernier coup.
- Pour une partie de N demi-coups : analyser les **N+1 positions** (position initiale incluse). L'évaluation « avant » le coup i est celle de la position i, l'évaluation « après » est celle de la position i+1. Ne jamais lancer une deuxième recherche pour la même position.
- Version du moteur (`engineVersion`, ex. `sf19-lite-single`) enregistrée avec chaque analyse.

### Perspective des scores (piège classique)

UCI donne le score **du point de vue du camp au trait**. Normaliser immédiatement en **point de vue des Blancs** :
`whiteCp = sideToMove === 'w' ? cp : -cp` (idem pour `mate`). Tout le stockage est en point de vue Blancs ; la conversion vers « point de vue du joueur » se fait au moment de classer.

Si la position est mat ou pat (pas de `bestmove` utile, `bestmove (none)`), l'évaluation vient des règles : mat → mate 0 en faveur du camp qui a maté, pat/nulle → 0 cp.

## 3. Évaluation et pourcentage de gain

```ts
type Evaluation = { cp: number | null; mate: number | null } // point de vue Blancs, un seul des deux non nul
```

- Pourcentage de gain (formule Lichess), point de vue Blancs :
  `winPct(cp) = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)`, avec `cp` borné à ±1000.
- Mat : `mate > 0` → 100, `mate < 0` → 0 (point de vue Blancs). `mate === 0` : celui qui vient de mater a 100.
- Pour le joueur : `moverWin = color === 'w' ? winPct : 100 - winPct`.
- Affichage : `+1.35`, `-0.40`, `#3`, `#-2` (point de vue Blancs), barre d'évaluation basée sur `winPct`.

## 4. Classification des coups

Calcul sur la **perte de pourcentage de gain du joueur** :
`loss = moverWin(avant, meilleur coup) - moverWin(après, coup joué)` (bornée à ≥ 0).

Seuils par défaut (configurables, stockés dans les paramètres, jamais en dur dans l'UI) :

| Classification | Condition |
|---|---|
| `best` | coup joué = meilleur coup du moteur (comparer en UCI) |
| `excellent` | loss < 2 |
| `good` | loss < 5 |
| `inaccuracy` | 5 ≤ loss < 10 |
| `mistake` | 10 ≤ loss < 20 |
| `blunder` | loss ≥ 20 |

Règles complémentaires (pour ne pas signaler chaque petit écart) :
- **Position déjà décidée** : si `moverWin(avant) ≥ 97` et `moverWin(après) ≥ 90`, ou `moverWin(avant) ≤ 3`, pas de classification d'erreur au-delà de `good`.
- **Occasion manquée** (`missedWin: true`, en plus de la classification) : `moverWin(avant) ≥ 80` et `moverWin(après) < 60`. Mat raté : le meilleur coup donnait un mat et le coup joué non → au minimum `mistake`.
- **Sauvetage manqué** : `moverWin(avant) ≥ 40` et `moverWin(après) < 20`.
- **Coups forcés** : un seul coup légal → `best`, jamais d'erreur.
- **Précision par coup** : `accuracy = clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669, 0, 100)` ; précision de partie = moyenne des coups du joueur.

## 5. Thèmes (catégories de faiblesses)

Étiquettes **déterministes** calculées par `src/lib/analysis/themes.ts` à partir de la position et des lignes Stockfish — l'IA ne les invente pas, elle peut seulement les commenter. Uniquement sur les coups `inaccuracy`/`mistake`/`blunder`/`missedWin`.

| Thème | Heuristique |
|---|---|
| `tactics` | la ligne principale qui punit (PV de la position après) gagne ≥ 2 points de matériel en ≤ 4 demi-coups, ou contient un mat |
| `hanging_piece` | après le coup joué, une pièce du joueur est attaquée et insuffisamment défendue et l'adversaire la prend dans la PV |
| `missed_tactic` | le meilleur coup gagne ≥ 2 points de matériel ou mate en ≤ 4 demi-coups et le coup joué non |
| `king_safety` | la PV punitive contient des échecs répétés ou une attaque sur le roque (cases autour du roi) |
| `development` | phase d'ouverture, coup d'une pièce déjà jouée, sortie précoce de la dame, roque perdu, pièces mineures non développées |
| `bad_exchange` | coup joué = capture/échange et le bilan matériel de la PV est négatif pour le joueur |
| `endgame` | phase de finale (voir ci-dessous) |
| `strategy` | perte ≥ seuil sans gain matériel dans la PV (≤ 1 point) ni mat : erreur positionnelle |
| `calculation` | erreur où le meilleur coup n'apparaît qu'en MultiPV 2-3 avec écart faible, ou PV longue (≥ 6 demi-coups) nécessaire |

Phase de jeu (`phase.ts`) : `opening` tant que demi-coup ≤ 20 et matériel non-pion ≥ 50 ; `endgame` si matériel non-pion total ≤ 26 (valeurs : D 9, T 5, F/C 3) ou plus de dames et ≤ 2 pièces mineures/tours par camp ; sinon `middlegame`.

Toujours distinguer `tactical` (tactics, hanging_piece, missed_tactic, king_safety avec mat) de `strategic` (strategy, development, bad_exchange, endgame) dans l'interface et le prompt.

## 6. Validation avec chess.js

- Convertir chaque PV UCI en SAN en rejouant les coups sur une instance `Chess(fen)`. **Arrêter la variante au premier coup illégal** et la tronquer (journaliser l'anomalie).
- Limiter les variantes affichées/envoyées à 8 demi-coups.
- Toute réponse de l'IA est vérifiée (la notation française interdite est C, F, T, D — pas R, qui est la tour en SAN anglais) : extraire les tokens SAN (`/\b(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)\b/g`) et vérifier qu'ils appartiennent à l'ensemble autorisé (coup joué, meilleur coup, coups des PV transmises). Les données de théorie transmises comptent : le coup de sortie du livre (« hors théorie depuis 3. Be3 ») est autorisé, et les **noms d'ouverture transmis** sont retirés du texte avant la recherche des coups (des noms Lichess contiennent un coup : « King's Indian Attack, with Bf5 »). Sinon : une nouvelle tentative avec rappel des coups autorisés, puis, si l'échec persiste, afficher l'explication avec un avertissement « non vérifiée » et ne pas la mettre en cache comme fiable.

## 7. Explications avec Claude Haiku 5.5

- Serveur uniquement (`src/lib/ai/`, route `POST /api/explanations`), `@anthropic-ai/sdk`, modèle **`claude-haiku-5-5`**, clé `ANTHROPIC_API_KEY` lue côté serveur. Jamais de `NEXT_PUBLIC_` pour une clé.
- Déclenchées **à la demande** (bouton « Expliquer ce coup »), pour **tous les coups** analysés, du joueur comme de l'adversaire — jamais en lot automatique sur toute une partie. Le cadrage dépend du coup (`isFlaggedMove`) : « Écart » (imprécision, erreur, gaffe, gain manqué) → en quoi c'est mauvais ; « Bon coup » → en quoi c'est bon, ce qu'il menace ou empêche (`errorType: "none"`).
- Le serveur ajoute le nom d'ouverture **du livre** (jamais celui de Chess.com) et la place du coup dans la théorie (`theoryForPly`, §11) : coup du livre (nom exact), sortie de théorie, ou coup joué après la sortie (« hors théorie depuis 3. Be3 »). L'IA ne nomme une ouverture que si elle est fournie.
- Appel (`callStructured`, `src/lib/ai/call.ts`) : `client.messages.create({ model: "claude-haiku-5-5", max_tokens: 2500, output_config: { effort: "low", format: zodOutputFormat(ExplanationSchema) }, system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }], messages: [...] })`, puis `format.parse()` sur le texte : contrairement à `messages.parse`, une réponse tronquée ne lève pas d'exception et son usage est quand même enregistré dans `ai_usage`. Pas de `temperature`, pas de `budget_tokens`, pas de prefill (refusés par Haiku 5.5). Vérifier `stop_reason` (`refusal`, `max_tokens`) avant de lire la réponse. Erreurs SDK typées (`Anthropic.RateLimitError`, `APIConnectionTimeoutError`, `APIError`), timeout 30 s, `maxRetries: 2`.
- **Données transmises (et rien d'autre)** : FEN avant le coup, liste des pièces par camp, camp du joueur, coup joué (SAN), meilleur coup (SAN), 3 coups candidats avec évaluation et PV SAN (≤ 8 demi-coups), PV punitive après le coup joué, évaluations avant/après (texte + win %), perte, classification, phase, thèmes, numéro du coup, ouverture si connue.
- **Sortie (schéma Zod)** :
  ```ts
  { played: string; problem: string; opponentIdea: string; bestMove: string; lesson: string;
    errorType: "none" | "tactical" | "strategic" | "mixed" | "uncertain"; confidence: "high" | "medium" | "low";
    movesReferenced: string[] }
  ```
  correspondant aux 5 rubriques du cahier des charges (Ce que j'ai joué / Pourquoi c'est problématique / Ce que l'adversaire pouvait faire / Le meilleur coup / La leçon à retenir). Texte en français, concret, sans formule vague.
- **Consignes du prompt système** (figé, mis en cache, versionné via `PROMPT_VERSION`) : n'utiliser que les coups et évaluations fournis ; ne jamais inventer de coup ni de variante ; formuler les intentions comme des hypothèses (« semble viser ») ; si les données ne permettent pas de conclure, le dire et mettre `confidence: "low"` / `errorType: "uncertain"` ; adapter au joueur en progression ; la leçon est un principe réutilisable.

## 8. Cache et coûts

- `position_analyses` : clé unique `(fen, depth, multipv, engine_version)` — consulter avant tout calcul ; une position déjà analysée n'est jamais recalculée (y compris entre parties : les positions d'ouverture se répètent).
- `explanations` : clé unique `(game_id, ply, prompt_version, model)` — renvoyer l'explication en cache sans appel API. Une nouvelle analyse de la partie supprime les explications des demi-coups dont le meilleur coup ou la classification a changé.
- `ai_usage` : une ligne par appel (tokens entrée/sortie, cache lu/écrit, coût estimé, statut). Les totaux jour/mois se calculent en SQL (`rpc("ai_usage_summary", { since })`), jamais en lisant les lignes (PostgREST plafonne à 1000). Tarif Haiku 5.5 : **0,10 $ / M tokens en entrée, 0,50 $ / M en sortie** (≤ 100 K tokens de prompt), lecture cache ≈ 0,1× le tarif d'entrée. Constantes dans `src/lib/ai/pricing.ts`.
- Avant chaque appel : vérifier les limites des paramètres (appels par jour, budget mensuel en $). Limite atteinte → HTTP 429 avec message clair, aucun appel.

## 9. Exercices (entraînement)

- Source : coups du joueur `mistake`/`blunder`/`missedWin` (et `inaccuracy` en difficulté facile) dont la solution est **nette** : écart de win % entre le meilleur coup et le 2ᵉ candidat ≥ 10, ou meilleur coup qui mate. Sinon plusieurs réponses sont acceptées : tout coup dont la perte < 5 par rapport au meilleur est considéré correct.
- Position présentée = position **avant** l'erreur, joueur au trait, solution masquée.
- Évaluation de la réponse : par Stockfish (même règles de perte que §4) — jamais par l'IA. Le navigateur calcule et **enregistre** les analyses (avant/après le coup), puis n'envoie que le coup : le serveur relit `position_analyses` et calcule lui-même le verdict (`judgeAttempt`). L'IA peut ensuite expliquer (même pipeline que §7, à la demande).
- Difficulté : `easy` (perte évitée ≥ 30 ou mat en 1-2), `medium`, `hard` (PV ≥ 6 demi-coups ou `calculation`).
- Répétition espacée type SM-2 simplifié : réussite → intervalle ×2,5 (1 j, 3 j, 7 j…), échec → retour à 1 j ; prioriser les thèmes où le taux de réussite est le plus faible.

## 10. Statistiques

Calculées uniquement à partir des parties importées et analysées. Afficher « données insuffisantes » en dessous de 10 parties (ou 5 occurrences pour un thème) au lieu de tirer une conclusion.

## 11. Ouvertures et théorie

- Livre : données Lichess `lichess-org/chess-openings` (CC0) dans `data/openings/*.tsv`, compilées par `npm run build:openings` en `src/lib/openings/book.json` (≈ 1 Mo), indexé par **EPD** (FEN sans compteurs : reconnaît les transpositions). Chargé **uniquement côté serveur** (`src/lib/openings/book.ts`, `server-only`).
- Une position intermédiaire (où aucune ligne nommée ne s'arrête) porte le nom de la **dernière ligne nommée atteinte** sur son chemin, jamais celui d'une ligne plus profonde non jouée : sinon on annoncerait un « Dragon » ou un gambit qui n'a pas eu lieu.
- `identifyOpening(fens, sans, playerColor, book)` (pur, `src/lib/openings/identify.ts`) : nom le plus précis atteint, famille / variante, gambit éventuel (nom contenant « Gambit »), nombre de demi-coups théoriques consécutifs, **sortie de théorie** (demi-coup, coup, camp, joueur ou adversaire, dernière ligne connue), et statut de chaque demi-coup.
- Ne jamais nommer une ouverture, un gambit ou un piège qui ne vient pas du livre.

## 12. Bilan de partie

- À la demande (bouton « Générer le bilan »), mis en cache dans `game_reports` (clé `game_id, prompt_version, model`) avec l'empreinte `analysis_created_at` : un bilan est **périmé** si la partie a été réanalysée depuis (affiché comme tel, régénérable).
- Données transmises (`buildReportInput`, pur) : partie, précision et décompte des écarts par camp et par phase, ouverture (§11) avec la sortie de théorie et les coups du joueur qui suivent, thèmes des écarts du joueur, et **au plus 12 moments clés** (écarts du joueur les plus coûteux + réponses du joueur qui n'ont pas puni une erreur adverse), chacun avec meilleur coup, variante et suite punitive (≤ 6 demi-coups). L'IA ne peut citer que les coups et demi-coups transmis.
- Sortie (`GameReportSchema`) : résumé, ouverture (appréciation, lacune théorique ou null, conseil d'étude), erreurs tactiques, erreurs stratégiques, occasions manquées, finale, points forts, plan de travail (catégorie, titre actionnable, raison, demi-coups). Vérification sur le **texte écrit** (pas de liste déclarée) et sur les demi-coups ; une nouvelle tentative avec rappel si invalide. Coût typique ≈ 0,0013 $.
- Une lacune théorique n'est affirmée que si les données la montrent (sortie du livre par le joueur suivie d'une perte, ou réponse imprécise à une sortie adverse).

## 13. Lignes d'ouverture

Répertoire de lignes à maîtriser (`/openings`), construit à partir d'un préfixe (coups déjà joués) jusqu'à la sortie de l'ouverture. Code : `src/lib/repertoire/*` (purs et testés : `choose`, `tree`, `build`, `recite`, `merge`), `src/lib/lichess/explorer.ts`, `src/lib/ai/branch/*`. Seuils de sélection uniquement dans `src/lib/repertoire/constants.ts` ; garde-fous de durée d'une étape de construction dans `build.ts` : coupure de l'explorateur à 30 s (`BUILD_EXPLORER_CUTOFF_MS`), budget d'étape 45 s (`BUILD_STEP_BUDGET_MS`, limite Vercel 60 s), garde d'itérations 3 × `MAX_PLY` (`MAX_ITERATIONS`).

- **Sources des coups** : préfixe de la ligne = coups de Leonel tirés de ses parties (`game_positions`, indexées par EPD). Coups de Leonel dans l'arbre = **Stockfish** (MultiPV, depuis `position_analyses`), avec une préférence pour le coup du livre (§11) ou de l'explorateur Lichess s'il perd **moins de 2 points** de gain (`NEAR_BEST_LOSS`) ; sinon le meilleur coup. Réponses de l'adversaire : ses réponses dans les parties de Leonel d'abord (≥ `OWN_MIN_GAMES`), sinon l'explorateur Lichess (≥ 15 % des parties, `EXPLORER_MIN_SHARE`) ; **≤ 3 réponses par nœud** (`MAX_REPLIES`), **≤ 8 branches** par ligne (`MAX_BRANCHES`). Égalités départagées par coup UCI (`opening_reply_stats`, `mergeReplies`, `playerCandidates`). Jamais de coup proposé par l'IA.
- **Élagage par fréquence sur tout l'arbre** (`tree.ts`), expansion « meilleur d'abord » : chaque nœud adverse ouvert garde sa réponse la plus fréquente ; les autres entrent dans une file globale triée par source (chemins faits uniquement de réponses de ses parties d'abord, puis ceux qui passent par l'explorateur seul) puis par poids du chemin (produit des parts : part dans ses parties pour une réponse propre, part de l'explorateur sinon), et ajoutent une feuille tant que le total reste ≤ 8. Seules les réponses retenues sont développées (chaque nœud coûte des analyses navigateur) ; un chemin en attente de données compte pour une feuille ; recalcul déterministe de zéro à chaque étape.
- **Fin de branche** : passage ouverture → milieu de partie selon `phase.ts` (ouverture tant que demi-coup ≤ 20 et matériel hors pions ≥ 50), position terminale, ou explorateur maigre (`explorerTotal` < 50 parties, `THIN_EXPLORER_GAMES`, et `ownGames` < 3, `OWN_MIN_GAMES`) ; `MAX_PLY` (30) n'est qu'un plafond de sécurité.
- **Type de ligne** (`lineKind`) : `punish` si le coup qui définit la ligne perd ≥ 10 points (`PUNISH_LOSS`) pour l'adversaire, ou gambit du livre où Leonel est à ≥ 60 % (`GAMBIT_PUNISH_WIN`) ; sinon `master`. Calculé depuis les analyses, pas par l'IA.
- **Construction** (`/api/openings/lines/[id]/build`, `rebuild`) : côté serveur, **à partir de `position_analyses` uniquement** (jamais de moteur serveur). Chaque étape renvoie les analyses manquantes (`needs`) ; le navigateur les calcule à la **profondeur demandée** par la réponse puis relance : reprenable, une échéance par étape, arrêt si aucune analyse n'avance (`BUILD_STALL_STEPS`, `BUILD_REPEAT_NEEDS`) ; une analyse incomplète n'est jamais enregistrée. `build` sur une ligne `ready` ne fait rien (arbre figé) ; seul `rebuild` la réinitialise.
- **Explorateur Lichess** : jeton `LICHESS_TOKEN` **serveur uniquement**, créé **sans aucune autorisation (scope)**, jamais `NEXT_PUBLIC_`. Cache `explorer_cache` 30 jours (`EXPLORER_TTL_DAYS`), `EXPLORER_FETCHES_PER_STEP` requêtes max par étape, **une à la fois** ; 429 (`getExplorer` → `"rate_limited"`, distinct de `"missing"` = budget épuisé) → plus aucun appel pour l'étape, réponse `retryAfterMs: 60000` (`EXPLORER_RETRY_AFTER_MS`) que le navigateur attend avant l'étape suivante, sans la compter comme bloquée ; 401 → colonne `explorer_unavailable` (la construction continue sans explorateur) ; sans jeton → `explorerUnavailable: true` dans la réponse, sans écrire la colonne. Coups normalisés par chess.js : chaque SAN reçu est rejoué sur la position et l'UCI vient de chess.js (le roque roi-prend-tour `e1h1` devient `e1g1`) ; SAN illégal ignoré.
- **Récitation** : verdict **côté serveur** (`judgeLineMove`, route `branches/[id]/move`) ; un coup alternatif perdant **< 2 points** par rapport au coup attendu n'est pas une erreur. **Révision espacée** SM-2 (`branches/[id]/review`) : succès = aucun coup révélé et ≤ 1 indice.
- **IA par branche**, à la demande seulement (`branches/[id]/explain`, prompt `branch-v1`) : entrée construite côté serveur à partir de l'arbre, sortie vérifiée sur le texte (coups et noms) ; **ne jamais écraser un cache vérifié par un résultat non vérifié** (`opening_branch_explanations`). Durée (route limitée à 60 s) : client à 25 s par appel sans nouvel essai du SDK (`BRANCH_TIMEOUT_MS`, `BRANCH_MAX_RETRIES`), nouvelle tentative de vérification sautée au-delà de 30 s (`BRANCH_RETRY_DEADLINE_MS`) ; si la nouvelle tentative échoue, la première réponse (payée) est gardée comme non vérifiée. Les noms d'ouvertures et de gambits ne viennent que du livre (§11).

## Checklist avant de terminer une tâche d'analyse

- [ ] Scores normalisés en point de vue Blancs, conversion joueur au moment de classer
- [ ] Aucune recherche moteur dupliquée ; cache `position_analyses` consulté
- [ ] Seuils lus depuis les paramètres
- [ ] Toutes les variantes validées par chess.js
- [ ] Aucune donnée échiquéenne produite par l'IA ; réponse IA vérifiée
- [ ] Appel IA uniquement à la demande, avec cache, limites et suivi `ai_usage`
- [ ] Noms d'ouvertures et de gambits uniquement issus du livre (§11), calculés côté serveur
- [ ] Tests unitaires mis à jour pour les fonctions pures modifiées
- [ ] Lignes d'ouverture (§13) : coups de Leonel par Stockfish, réponses adverses des parties puis de l'explorateur, construction depuis le cache, verdict de récitation côté serveur, IA par branche vérifiée
