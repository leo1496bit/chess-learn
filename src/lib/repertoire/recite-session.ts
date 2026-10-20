// Machine à états d'une récitation de branche (module pur). Leonel joue les coups d'indice pair
// (la racine a toujours Leonel au trait), l'adversaire les coups d'indice impair. Le verdict de chaque
// coup vient du serveur (Stockfish via `position_analyses`) : ce module ne juge rien lui-même.

export type ReciteFeedback =
  | { kind: "hint"; square: string }
  | { kind: "revealed"; uci: string; san: string }
  | { kind: "alternative"; expectedSan: string };

export type ReciteState = {
  path: readonly string[];
  san: readonly string[];
  /** Demi-coup à jouer. */
  index: number;
  phase: "player" | "opponent" | "done";
  /** Coups faux joués à l'index courant. */
  wrongAtIndex: number;
  hints: number;
  revealed: number;
  feedback: ReciteFeedback | null;
};

export type ReciteVerdict = { verdict: "expected" } | { verdict: "alternative"; expectedSan: string } | { verdict: "wrong" };

function phaseAt(index: number, length: number): ReciteState["phase"] {
  if (index >= length) return "done";
  return index % 2 === 0 ? "player" : "opponent";
}

export function startRecite(path: readonly string[], san: readonly string[]): ReciteState {
  return { path, san, index: 0, phase: phaseAt(0, path.length), wrongAtIndex: 0, hints: 0, revealed: 0, feedback: null };
}

function advance(state: ReciteState): ReciteState {
  const index = state.index + 1;
  return { ...state, index, phase: phaseAt(index, state.path.length), wrongAtIndex: 0, feedback: null };
}

/** 1ʳᵉ erreur : indice (case de départ) ; 2ᵉ : réponse révélée ; ensuite, plus aucun compteur. */
export function applyVerdict(state: ReciteState, result: ReciteVerdict): ReciteState {
  if (state.phase !== "player") return state;
  const expectedUci = state.path[state.index];
  switch (result.verdict) {
    case "expected":
      return advance(state);
    case "alternative":
      return { ...state, feedback: { kind: "alternative", expectedSan: result.expectedSan } };
    case "wrong": {
      const wrongAtIndex = state.wrongAtIndex + 1;
      if (wrongAtIndex === 1) {
        return { ...state, wrongAtIndex, hints: state.hints + 1, feedback: { kind: "hint", square: expectedUci.slice(0, 2) } };
      }
      if (wrongAtIndex === 2) {
        return {
          ...state,
          wrongAtIndex,
          revealed: state.revealed + 1,
          feedback: { kind: "revealed", uci: expectedUci, san: state.san[state.index] ?? expectedUci },
        };
      }
      return { ...state, wrongAtIndex };
    }
  }
}

/** L'adversaire a joué le coup de la branche. */
export function opponentPlayed(state: ReciteState): ReciteState {
  if (state.phase !== "opponent") return state;
  return advance(state);
}
