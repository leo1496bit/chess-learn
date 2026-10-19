# Application d’analyse et de progression aux échecs

## Objectif

Développer une application web personnelle qui récupère mes parties publiques Chess.com, les analyse avec Stockfish et utilise l’intelligence artificielle pour m’expliquer mes erreurs, comprendre mes faiblesses et progresser aux échecs.

Je serai le seul utilisateur dans un premier temps. L’application doit être performante, agréable à utiliser, sécurisée et peu coûteuse à exploiter.

## 1. Technologies

- **Frontend :** Next.js, React, TypeScript, Tailwind CSS et shadcn/ui.
- **Échiquier :** react-chessboard et chess.js.
- **Analyse échiquéenne :** Stockfish, idéalement via WebAssembly ou un service adapté.
- **Base de données :** Supabase avec PostgreSQL.
- **Intelligence artificielle :** API Anthropic, en utilisant **Claude Haiku 5.5**, avec l’identifiant de modèle `claude-haiku-5-5`.
- **Déploiement :** privilégier une solution économique, par exemple Vercel pour l’application et un service adapté si les analyses Stockfish nécessitent un traitement serveur.

## 2. Configuration de l’API Anthropic

Prévoir une variable d’environnement pour la clé API :

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx (stockée dans .env.local, jamais dans git)
```

La clé API doit rester exclusivement côté serveur. Elle ne doit jamais être exposée dans le navigateur, intégrée au code frontend ou publiée dans le dépôt Git.

Utiliser Claude Haiku 5.5 pour limiter les coûts tout en conservant des explications pédagogiques de qualité.

## 3. Connexion à Chess.com

Utiliser l’API publique de Chess.com pour récupérer mes parties publiques, sans demander mon mot de passe Chess.com.

Mon identifiant Chess.com : `Leny_l`

Points à implémenter :
- Récupération du profil public.
- Récupération des archives mensuelles de parties.
- Import des parties au format PGN.
- Synchronisation des nouvelles parties.
- Éviter les doublons lors des imports.
- Filtrer les parties par date, couleur, résultat, cadence et ouverture.
- Gérer proprement les erreurs réseau, les limites de requêtes et les parties indisponibles.

Exemples d’URL de l’API publique :
- `https://api.chess.com/pub/player/Leny_l`
- `https://api.chess.com/pub/player/Leny_l/games/archives`

Ne pas supposer que toutes les données sont disponibles ou que les parties peuvent être récupérées instantanément. Prévoir une gestion robuste des erreurs.

## 4. Analyse des parties avec Stockfish

Stockfish doit effectuer les calculs échiquéens. L’IA ne doit pas remplacer le moteur.

Pour chaque partie, identifier notamment :
- Les meilleurs coups et les variantes principales.
- Les imprécisions, erreurs et gaffes.
- Les occasions tactiques manquées.
- Les changements importants d’évaluation.
- Les erreurs de développement et de placement des pièces.
- Les échanges défavorables.
- Les erreurs stratégiques et les finales mal jouées.
- Les occasions manquées de gagner, de conserver l’avantage ou de sauver une position.

Permettre de parcourir la partie coup par coup sur un échiquier interactif, avec :
- Le coup joué.
- Le meilleur coup recommandé.
- L’évaluation de la position avant et après le coup.
- Les variantes pertinentes.
- Une classification de la gravité de l’erreur.

Éviter de signaler chaque petit écart comme une erreur importante. Les seuils de classification doivent être configurables et adaptés à l’évaluation Stockfish.

## 5. Explications pédagogiques avec Claude Haiku 5.5

L’IA doit expliquer les résultats de Stockfish dans un langage clair, précis et adapté à un joueur en progression.

Pour chaque erreur importante, fournir :
1. **Ce que j’ai joué :** expliquer le coup et son intention apparente.
2. **Pourquoi c’est problématique :** identifier la faiblesse tactique ou stratégique.
3. **Ce que l’adversaire pouvait faire :** expliquer la réponse qui exploite l’erreur.
4. **Le meilleur coup :** expliquer l’idée derrière le coup recommandé par Stockfish.
5. **La leçon à retenir :** formuler un principe réutilisable dans d’autres parties.

L’IA doit distinguer les erreurs tactiques des erreurs stratégiques et éviter les explications vagues.

### Fiabilité des explications

- Transmettre à l’IA les évaluations, les coups candidats et les variantes calculées par Stockfish.
- Ne jamais inventer de coups, de variantes ou d’évaluations.
- Ne pas présenter une hypothèse comme une certitude.
- Si les données fournies ne permettent pas de conclure, l’indiquer clairement.
- Faire vérifier la légalité des coups et la cohérence des variantes.
- Utiliser des explications accessibles sans sacrifier la précision échiquéenne.

## 6. Tableau de bord de progression

Créer un tableau de bord permettant de suivre :
- Le nombre de parties analysées.
- Le taux de victoire, de nulles et de défaites.
- Les performances avec les Blancs et les Noirs.
- L’évolution des résultats au fil du temps.
- Les ouvertures les plus jouées et les résultats associés.
- Les erreurs les plus fréquentes.
- Les catégories de faiblesses récurrentes.
- Les progrès réalisés après les entraînements.

Les statistiques doivent être calculées à partir des parties réellement importées. Signaler les données insuffisantes plutôt que tirer des conclusions hâtives.

## 7. Entraînement personnalisé

Créer un module qui transforme mes erreurs réelles en exercices.

Fonctionnalités :
- Sélectionner une position issue de mes parties.
- Me demander de trouver le meilleur coup.
- Masquer la solution jusqu’à ma réponse.
- Évaluer ma réponse avec Stockfish.
- Expliquer pourquoi mon coup est bon ou mauvais.
- Montrer la meilleure continuation.
- Enregistrer mes réponses et mes résultats.
- Proposer davantage d’exercices sur mes faiblesses récurrentes.
- Suivre ma progression par thème : tactique, stratégie, finales, calcul, développement et sécurité du roi.

Prévoir plusieurs niveaux de difficulté et un système de répétition des exercices pour renforcer l’apprentissage.

## 8. Maîtrise des coûts

L’application doit rester économique pour un utilisateur unique.

Principes obligatoires :
- Stockfish effectue gratuitement les analyses échiquéennes, sans solliciter l’IA pour calculer les coups.
- Utiliser Claude Haiku 5.5 pour les explications pédagogiques, pas pour des calculs que Stockfish peut réaliser.
- Ne pas envoyer systématiquement chaque coup de chaque partie à l’IA.
- Transmettre uniquement les positions et données nécessaires à chaque explication.
- Mettre en cache les explications déjà générées.
- Éviter de recalculer les analyses identiques.
- Permettre de choisir les parties à analyser et de déclencher les explications IA à la demande.
- Limiter les appels inutiles et gérer les erreurs, les délais d’attente et les quotas.
- Prévoir un suivi du nombre d’appels et des coûts estimés.
- Permettre de configurer les limites d’utilisation.

L’objectif est de conserver une bonne qualité pédagogique tout en minimisant les dépenses mensuelles.

## 9. Architecture et qualité du code

Organiser le projet de manière modulaire, avec une séparation claire entre :
- La récupération des parties Chess.com.
- Le traitement et le stockage des PGN.
- Le moteur Stockfish.
- Le service d’explication Anthropic.
- La base de données.
- Les routes API.
- L’interface utilisateur.
- Les statistiques et les exercices.

Exigences :
- TypeScript strict.
- Validation des entrées.
- Gestion claire des erreurs.
- Variables sensibles exclusivement côté serveur.
- Tests unitaires sur les fonctions critiques.
- Documentation des principales étapes d’installation et de lancement.
- Fichier `.env.example` pour documenter les variables nécessaires, sans exposer de véritables secrets.
- Ne jamais placer de clé API dans le code frontend ou dans le dépôt Git.

## 10. Interface utilisateur

Créer une interface moderne, sobre et responsive, adaptée à un usage sur ordinateur et mobile.

Prévoir les pages suivantes :
1. **Tableau de bord** : progression générale et dernières parties.
2. **Mes parties** : historique, filtres et lancement des analyses.
3. **Analyse d’une partie** : échiquier interactif, coups, évaluations et explications.
4. **Entraînement** : exercices issus de mes propres parties.
5. **Statistiques** : tendances, ouvertures et faiblesses.
6. **Paramètres** : préférences et limites d’utilisation.

L’interface doit privilégier la lisibilité, la rapidité et la compréhension des erreurs.

## 11. Méthode de développement

Commencer par examiner l’environnement existant et proposer une architecture cohérente avant d’implémenter les fonctionnalités.

Développer progressivement, dans cet ordre :

1. Initialisation du projet et configuration.
2. Récupération des parties publiques Chess.com.
3. Import et affichage des parties.
4. Analyse Stockfish et visualisation des évaluations.
5. Explications pédagogiques avec Claude Haiku 5.5.
6. Tableau de bord et statistiques.
7. Entraînement personnalisé.
8. Optimisation des coûts, tests et documentation.

À chaque étape, produire du code fonctionnel, vérifier les erreurs et éviter de laisser des fonctionnalités essentielles sous forme de simples exemples ou de fonctions fictives.

Si une fonctionnalité ne peut pas encore être implémentée, l’indiquer clairement et expliquer ce qui manque. Ne pas prétendre que l’application est terminée ou opérationnelle tant que les fonctionnalités principales n’ont pas été testées.

**Résultat attendu :** une application web personnelle d’analyse et d’entraînement aux échecs, connectée à mes parties Chess.com, reposant sur Stockfish pour l’analyse et Claude Haiku 5.5 pour les explications, avec une attention particulière portée à la fiabilité, à la pédagogie et à la maîtrise des coûts.