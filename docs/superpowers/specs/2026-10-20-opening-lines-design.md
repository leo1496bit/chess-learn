# Lignes d'ouverture à maîtriser — conception

Date : 2026-10-20 · Statut : à valider par Leonel

## Intention

Leonel tombe régulièrement sur des lignes adverses qu'il ne sait pas traiter : des gambits ou pièges
douteux dont il ne connaît pas la réfutation (gambit Englund, Jaenisch, Kholmov…) et, surtout, des
lignes solides que ses adversaires jouent souvent et où il perd des points. Le cas le plus net de sa base :
Caro-Kann contre l'attaque des deux cavaliers, 54 parties, 16 victoires, 35 défaites. Viennent ensuite la
Scandinave Mieses-Kotrč, qu'il affronte 143 fois avec les Blancs, la Caro-Kann avance et la Panov.

Il veut une **bibliothèque de lignes adverses à maîtriser**, limitée à **ce qu'il rencontre souvent et aux
lignes les plus courantes**, pas tout le livre. Chaque ligne l'emmène **jusqu'au début du milieu de partie
avec un plan clair**. Il veut à la fois **retenir les coups**, en les rejouant jusqu'à ce qu'ils deviennent
automatiques, et **comprendre pourquoi** ils fonctionnent.

Principe du projet, inchangé : **Stockfish calcule, l'IA explique** (skill `chess-analysis`).

## Ce que dit sa base (requête du 2026-10-20)

- 3 165 parties importées, dont **4 seulement analysées par Stockfish**. La fonctionnalité ne doit donc
  **pas** dépendre de l'analyse complète des parties : elle part des coups d'ouverture, lisibles dans toutes
  les parties, sans moteur.
- Avec les Noirs, il joue la Caro-Kann (plus de 700 parties) ; contre 1.d4 et le système de Londres, son
  bilan est légèrement négatif.
- Avec les Blancs, il joue 1.e4 et la Scotch ; ses adversaires répondent par la Scandinave Mieses (143), la
  Petrov (environ 100) et la Philidor.
- Gambits adverses vus : Englund (8), Smith-Morra (9), Jaenisch (5), Blackmar-Diemer (5), Kholmov (2)…
- Niveau sur les 90 derniers jours : environ 870 en rapide et environ 310 en blitz sur Chess.com.

## Objectifs

1. **Suggestions** : l'appli détecte, dans ses parties, les lignes adverses qu'il rencontre et les classe
   par priorité, la fréquence d'abord, le bilan défavorable ensuite.
2. **Bibliothèque** : il choisit les suggestions à ajouter. Il peut aussi ajouter à la main une ligne pas
   encore rencontrée, en jouant les coups sur l'échiquier ou en cherchant un nom du livre.
3. **Deux types de lignes**, affichés distinctement :
   - **À punir** : la ligne adverse est objectivement douteuse ; on apprend la réfutation.
   - **À maîtriser** : la ligne est saine ; on apprend la bonne réponse et le plan.
4. **Arbre de la ligne** : ses coups, choisis par Stockfish, face aux réponses adverses les plus fréquentes,
   jusqu'au début du milieu de partie. Chaque branche se termine par un plan.
5. **Apprentissage en trois temps**, validé avec la maquette v2 :
   - **Étudier** une branche nouvelle : on la déroule coup par coup, avec l'idée de chaque coup.
   - **Réciter** juste après : il la rejoue de mémoire et l'adversaire répond tout seul. Une erreur donne
     un indice, puis la réponse et l'explication.
   - **Réviser** : les branches reviennent espacées (1 j, 3 j, 7 j…), celles qu'il rate reviennent plus tôt.
6. **États visibles** par branche, *pas encore étudiée*, *à revoir aujourd'hui* ou *maîtrisée*, et par ligne,
   avec le nombre de branches à revoir.

## Hors objectifs

- Construire un répertoire complet couvrant toutes les ouvertures.
- Analyser par Stockfish ses 3 165 parties pour alimenter la fonctionnalité.
- Importer des cours ou des fichiers PGN de répertoire.
- Générer automatiquement les explications de toutes les lignes en lot.

## À éviter absolument (échec même si « ça marche »)

- **Un coup, une variante ou un plan inventé par l'IA.** Tous les coups viennent de Stockfish, du livre, de
  ses parties ou de l'explorateur Lichess, et sont validés par chess.js.
- **Apprendre des lignes de moteur que personne ne joue.** Les réponses adverses viennent de parties
  réelles, pas des choix de Stockfish pour l'adversaire.
- **Une bibliothèque noyée sous des centaines de lignes** ou des arbres de dizaines de branches.
- **Des dépenses IA non maîtrisées.** Les explications ne sont générées qu'à la demande, avec cache, limites
  et suivi `ai_usage`.
- **Nommer une ouverture ou un gambit qui ne vient pas du livre** (§11 de la skill).

## Décisions prises avec Leonel

- Les deux types de lignes, avec priorité à ce qu'il rencontre souvent.
- Profondeur des lignes : jusqu'au milieu de partie, avec un plan clair.
- Apprentissage : arbre, puis étude, récitation avec indices et révision espacée (maquette v2).
- **Explorateur d'ouvertures Lichess** : il en veut. Leonel a créé un jeton Lichess **sans aucune
  autorisation** (l'API l'accepte : `security: OAuth2: []`). Il l'a ajouté dans Vercel sous le nom
  `LICHESS_TOKEN`, en type *Sensitive*. Ce jeton n'est **pas** dans `.env.local` : c'est à Leonel de l'y
  ajouter pour le développement local. Il est lu côté serveur uniquement, jamais avec `NEXT_PUBLIC_`, et
  ni affiché ni journalisé.

- **Construction complète à la création** : quand il ajoute une ligne, tout l'arbre est calculé d'un coup,
  ce qui prend environ 5 à 10 minutes pour 100 à 250 analyses dans le navigateur, à la profondeur des
  paramètres. Une barre de progression l'accompagne. Si la page est fermée, la construction reprend là
  où elle s'était arrêtée à la prochaine ouverture de la ligne : les analyses déjà faites sont dans
  `position_analyses`. Une ligne en construction est affichée comme telle et ne peut pas encore être
  étudiée.

## Décisions prises par Claude (à vérifier en lisant)

- **Niveau de référence de l'explorateur** : tranches Lichess `1000,1200,1400,1600`, soit 1000 à 1799, en
  cadences `blitz,rapid`. Point d'entrée : `https://explorer.lichess.org/lichess`.
- **Ses coups** : le meilleur coup de Stockfish, avec la profondeur et le MultiPV des paramètres. Si un
  coup du livre ou un coup populaire de l'explorateur est à moins de **2 points** de % de gain du meilleur,
  c'est lui qu'on retient, parce qu'il est plus naturel et plus facile à retenir.
- **Réponses adverses retenues à chaque position** : au plus **3**, triées par fréquence combinée. Une
  réponse est retenue si elle représente au moins **15 %** des parties de l'explorateur à cette position,
  ou au moins **3 de ses parties**. Le nombre de parties qui lui sont propres reste affiché.
- **Taille d'une ligne** : au plus **8 branches**, c'est-à-dire 8 feuilles. On élague par fréquence.
- **Fin d'une branche** : à l'entrée du milieu de partie selon `phase.ts`, ou au plus tard au demi-coup 30.
  Elle s'arrête plus tôt si l'explorateur compte moins de 50 parties et ses parties moins de 3 à la
  position.
- **Catégorie « à punir »** : le coup adverse qui définit la ligne coûte au moins **10 points** de % de
  gain à l'adversaire selon Stockfish, ou le nom du livre contient « Gambit » et Stockfish donne au moins
  60 % de gain à Leonel. Sinon, la ligne est « à maîtriser ».
- **Priorité d'une suggestion** : d'abord le nombre de ses parties dans la ligne, ensuite le taux de
  défaite comme critère secondaire. On affiche « données insuffisantes » sous 5 parties.
- **Coup alternatif pendant la récitation** : si Leonel joue un autre coup que celui de la ligne et que
  Stockfish le juge à moins de 2 points du coup retenu, ce n'est pas une erreur. On affiche « bon coup
  aussi, la ligne retenue est X » et on lui redemande le coup de la ligne. Le verdict est rendu côté
  serveur, comme dans `/api/training/attempt`.
- **Réussite d'une branche en révision** : tous ses coups sont trouvés, avec au plus un indice et sans
  réponse révélée. Sinon c'est un échec et la branche revient le lendemain. On réutilise `sm2.ts`.
- **Idées et plan (IA)** : un seul appel par branche, au premier clic sur « Étudier ». Il produit l'idée de
  chacun de ses coups, l'idée probable de chaque coup adverse et le plan en fin de branche. Le résultat est
  mis en cache par branche avec `prompt_version` et `model`. Les coups cités sont vérifiés contre la
  branche et la variante Stockfish de la position finale, avec une nouvelle tentative, puis l'étiquette
  « non vérifiée » si nécessaire. Coût visé : environ 0,001 $ par branche. Si l'appel est refusé
  (limite ou IA désactivée), la branche reste étudiable sans texte.
- **Navigation** : nouvelle entrée « Ouvertures », à la route `/openings`. La page contient deux blocs :
  *Mes lignes* (avec le nombre de branches à revoir) et *Suggestions*. Une page `/openings/[id]` montre
  l'arbre, avec les modes Étudier et Réciter. Sur mobile, on reprend la mise en page de `/games/[id]`
  (échiquier épinglé et compact).

## Précisions après relecture (décisions de Claude)

- **Ce qu'est une ligne.** Une ligne est la **position atteinte juste après le coup adverse qui la
  définit**, identifiée par son EPD (les transpositions sont donc regroupées). Elle porte le nom du livre
  pour cette position. Le **préfixe**, c'est-à-dire les coups qui mènent à cette position, reprend **son
  propre répertoire** : le chemin le plus fréquent dans ses parties, ou les coups saisis pour une ligne
  ajoutée à la main. Stockfish ne choisit ses coups **qu'à partir de cette position** : la fonctionnalité
  ne remplace pas son répertoire. Le coup qui définit la ligne est le premier coup adverse qui sort de
  ce qu'il a déjà en bibliothèque, ou, pour une suggestion, le coup adverse dont la position compte au
  moins 5 de ses parties et porte un nom propre dans le livre. Une ligne ajoutée par nom du livre prend
  la position de ce nom.
- **Arbre figé.** L'arbre est construit à la création et ne change plus de lui-même. Un bouton « Mettre à
  jour la ligne » le reconstruit. Une branche est identifiée par sa suite de coups : si elle existe
  encore après la mise à jour, elle garde son état de révision et son texte IA ; sinon elle est
  archivée, pas supprimée en silence. Le changement de profondeur dans les paramètres ne touche pas les
  arbres existants.
- **Fréquence combinée.** **Ses parties d'abord** : une réponse vue au moins 3 fois dans ses parties est
  retenue en priorité, de la plus fréquente à la moins fréquente. Les places restantes, dans la limite de
  3 par position, vont aux réponses de l'explorateur qui représentent au moins 15 % des parties, dans
  l'ordre de l'explorateur. L'élagage à 8 branches suit le même ordre : on retire d'abord les feuilles
  les moins fréquentes, à commencer par celles qui viennent uniquement de l'explorateur.
- **Rattrapage des coups d'ouverture des parties.** Il passe par une route API par lots, par exemple 300
  parties par appel, qui reprend là où elle s'est arrêtée. La page `/openings` la déclenche d'elle-même
  tant qu'il reste des parties à traiter, avec une progression visible. Le traitement est ensuite fait à
  chaque synchronisation.
- **Coup alternatif accepté** (« bon coup aussi ») : il ne compte ni comme une erreur ni comme un indice.

## Contraintes techniques

- **Stockfish tourne uniquement dans le navigateur** (skill §2). La construction d'un arbre demande des
  analyses, environ 2 par coup de Leonel. Elles sont lancées par le navigateur à l'ouverture ou à la
  création d'une ligne, avec une progression visible. Elles sont écrites dans `position_analyses`, dont le
  cache est partagé avec les parties. Le serveur assemble ensuite l'arbre à partir de ce cache, sans faire
  confiance à un coup « meilleur » envoyé par le client, suivant le même modèle que `judgeAttempt`.
- **Coups d'ouverture des parties** : calculés côté serveur depuis le PGN stocké (chess.js et le livre
  `identifyOpening`), pour les 3 165 parties puis au fil des synchronisations. On conserve au moins les 30
  premiers demi-coups de chaque partie, sous une forme interrogeable par position ou par séquence, pour
  compter les réponses adverses.
- **Explorateur Lichess** : appels côté serveur avec `Authorization: Bearer LICHESS_TOKEN`. Les réponses
  sont mises en cache en base, avec pour clé `epd` et les paramètres, et une durée de vie longue (30 j),
  car l'explorateur limite le débit : il faut tenir compte de son HTTP 429. **Sans jeton**, la
  fonctionnalité marche quand même, avec ses parties, le livre et les ajouts manuels.
- Tables nouvelles avec RLS `owner_all` et `is_owner()`, comme les autres. Migrations dans
  `supabase/migrations/`.
- La skill `chess-analysis` reçoit une section **§13 Lignes d'ouverture**, qui reprend les règles
  ci-dessus. `CLAUDE.md` impose déjà de la charger.
- Méthode TDD sur les fonctions pures : détection et priorité des suggestions, catégorie, choix de ses
  coups, sélection et élagage des réponses adverses, fin de branche, verdict de récitation et vérification
  de la sortie IA.

## Laissé au constructeur

- Le schéma exact des tables (lignes, branches ou nœuds, état de révision, cache de l'explorateur, cache
  des explications par branche) et la forme de stockage des coups d'ouverture des parties.
- Le découpage en composants, en réutilisant `Board`, `EvalBar`, `LinkedText` et les éléments de
  `training-session.tsx`.
- Le format exact de la sortie IA par branche, dans le même esprit que `ExplanationSchema` et
  `GameReportSchema`.
- L'ajustement des seuils ci-dessus après un essai sur les vraies données. On les regroupe dans un seul
  module de constantes, pour qu'aucun ne soit codé en dur dans l'interface.
