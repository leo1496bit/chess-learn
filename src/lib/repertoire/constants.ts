// Seuils du répertoire d'ouvertures. Jamais en dur dans l'interface.

/** Perte maximale (points de gain) pour qu'un coup compte comme quasi meilleur. */
export const NEAR_BEST_LOSS = 2;
export const MAX_REPLIES = 3;
/** Part minimale des parties de l'explorateur pour retenir une réponse. */
export const EXPLORER_MIN_SHARE = 0.15;
export const OWN_MIN_GAMES = 3;
export const MAX_BRANCHES = 8;
export const MAX_PLY = 30;
export const THIN_EXPLORER_GAMES = 50;
export const PUNISH_LOSS = 10;
export const GAMBIT_PUNISH_WIN = 60;
export const SUGGESTION_MIN_GAMES = 5;
/** Nombre de demi-coups d'ouverture indexés par partie. */
export const INDEX_PLIES = 30;
/** Parties traitées par appel de rattrapage. */
export const BACKFILL_BATCH = 300;
export const EXPLORER_TTL_DAYS = 30;
export const EXPLORER_FETCHES_PER_STEP = 8;
export const PLAYER_CANDIDATES = 2;
/** Étapes de construction consécutives sans analyse demandée avant d'arrêter la boucle du navigateur. */
export const BUILD_STALL_STEPS = 5;
/** Nombre de demandes d'une même analyse avant d'arrêter (une analyse incomplète n'est jamais enregistrée). */
export const BUILD_REPEAT_NEEDS = 3;
/** Délai avant la réponse automatique de l'adversaire pendant une récitation (ms). */
export const RECITE_OPPONENT_DELAY_MS = 400;
