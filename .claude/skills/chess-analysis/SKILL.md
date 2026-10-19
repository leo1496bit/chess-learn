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
- Un seul `go` à la fois par worker ; file d'attente ; `stop` + timeout (par défaut 15 s par position) avec repli sur la meilleure profondeur atteinte.
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
- Toute réponse de l'IA est vérifiée : extraire les tokens SAN (`/\b(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)\b/g`) et vérifier qu'ils appartiennent à l'ensemble autorisé (coup joué, meilleur coup, coups des PV transmises). Sinon : une nouvelle tentative avec rappel des coups autorisés, puis, si l'échec persiste, afficher l'explication avec un avertissement « non vérifiée » et ne pas la mettre en cache comme fiable.

## 7. Explications avec Claude Haiku 5.5

- Serveur uniquement (`src/lib/ai/`, route `POST /api/explanations`), `@anthropic-ai/sdk`, modèle **`claude-haiku-5-5`**, clé `ANTHROPIC_API_KEY` lue côté serveur. Jamais de `NEXT_PUBLIC_` pour une clé.
- Déclenchées **à la demande** (bouton « Expliquer ») et uniquement pour `inaccuracy`/`mistake`/`blunder`/`missedWin` — jamais en lot automatique sur toute une partie.
- Appel : `client.messages.parse({ model: "claude-haiku-5-5", max_tokens: 1500, output_config: { effort: "low", format: zodOutputFormat(ExplanationSchema) }, system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }], messages: [...] })`. Pas de `temperature`, pas de `budget_tokens`, pas de prefill (refusés par Haiku 5.5). Vérifier `stop_reason` (`refusal`, `max_tokens`) avant `parsed_output`. Erreurs SDK typées (`Anthropic.RateLimitError`, `APIConnectionTimeoutError`, `APIError`), timeout 30 s, `maxRetries: 2`.
- **Données transmises (et rien d'autre)** : FEN avant le coup, liste des pièces par camp, camp du joueur, coup joué (SAN), meilleur coup (SAN), 3 coups candidats avec évaluation et PV SAN (≤ 8 demi-coups), PV punitive après le coup joué, évaluations avant/après (texte + win %), perte, classification, phase, thèmes, numéro du coup, ouverture si connue.
- **Sortie (schéma Zod)** :
  ```ts
  { played: string; problem: string; opponentIdea: string; bestMove: string; lesson: string;
    errorType: "tactical" | "strategic" | "mixed" | "uncertain"; confidence: "high" | "medium" | "low";
    movesReferenced: string[] }
  ```
  correspondant aux 5 rubriques du cahier des charges (Ce que j'ai joué / Pourquoi c'est problématique / Ce que l'adversaire pouvait faire / Le meilleur coup / La leçon à retenir). Texte en français, concret, sans formule vague.
- **Consignes du prompt système** (figé, mis en cache, versionné via `PROMPT_VERSION`) : n'utiliser que les coups et évaluations fournis ; ne jamais inventer de coup ni de variante ; formuler les intentions comme des hypothèses (« semble viser ») ; si les données ne permettent pas de conclure, le dire et mettre `confidence: "low"` / `errorType: "uncertain"` ; adapter au joueur en progression ; la leçon est un principe réutilisable.

## 8. Cache et coûts

- `position_analyses` : clé unique `(fen, depth, multipv, engine_version)` — consulter avant tout calcul ; une position déjà analysée n'est jamais recalculée (y compris entre parties : les positions d'ouverture se répètent).
- `explanations` : clé unique `(game_id, ply, prompt_version, model)` — renvoyer l'explication en cache sans appel API.
- `ai_usage` : une ligne par appel (tokens entrée/sortie, cache lu/écrit, coût estimé, statut). Tarif Haiku 5.5 : **0,10 $ / M tokens en entrée, 0,50 $ / M en sortie** (≤ 100 K tokens de prompt), lecture cache ≈ 0,1× le tarif d'entrée. Constantes dans `src/lib/ai/pricing.ts`.
- Avant chaque appel : vérifier les limites des paramètres (appels par jour, budget mensuel en $). Limite atteinte → HTTP 429 avec message clair, aucun appel.

## 9. Exercices (entraînement)

- Source : coups du joueur `mistake`/`blunder`/`missedWin` (et `inaccuracy` en difficulté facile) dont la solution est **nette** : écart de win % entre le meilleur coup et le 2ᵉ candidat ≥ 10, ou meilleur coup qui mate. Sinon plusieurs réponses sont acceptées : tout coup dont la perte < 5 par rapport au meilleur est considéré correct.
- Position présentée = position **avant** l'erreur, joueur au trait, solution masquée.
- Évaluation de la réponse : par Stockfish (même règles de perte que §4) — jamais par l'IA. L'IA peut ensuite expliquer (même pipeline que §7, à la demande).
- Difficulté : `easy` (perte évitée ≥ 30 ou mat en 1-2), `medium`, `hard` (PV ≥ 6 demi-coups ou `calculation`).
- Répétition espacée type SM-2 simplifié : réussite → intervalle ×2,5 (1 j, 3 j, 7 j…), échec → retour à 1 j ; prioriser les thèmes où le taux de réussite est le plus faible.

## 10. Statistiques

Calculées uniquement à partir des parties importées et analysées. Afficher « données insuffisantes » en dessous de 10 parties (ou 5 occurrences pour un thème) au lieu de tirer une conclusion.

## Checklist avant de terminer une tâche d'analyse

- [ ] Scores normalisés en point de vue Blancs, conversion joueur au moment de classer
- [ ] Aucune recherche moteur dupliquée ; cache `position_analyses` consulté
- [ ] Seuils lus depuis les paramètres
- [ ] Toutes les variantes validées par chess.js
- [ ] Aucune donnée échiquéenne produite par l'IA ; réponse IA vérifiée
- [ ] Appel IA uniquement à la demande, avec cache, limites et suivi `ai_usage`
- [ ] Tests unitaires mis à jour pour les fonctions pures modifiées
