import { describe, expect, it } from "vitest";
import { mergeBranches } from "./merge";
import type { BuiltBranch } from "./tree";

function built(path: string): BuiltBranch {
  const pathUci = path.split(" ");
  return { pathUci, pathSan: pathUci, endFen: `fen ${path}`, ownGames: 1, explorerGames: 2 };
}

describe("mergeBranches", () => {
  it("garde une branche identique", () => {
    const result = mergeBranches([{ id: "a", pathUci: ["g1f3", "b8c6"], archived: false }], [built("g1f3 b8c6")]);
    expect(result).toEqual({ keep: ["a"], archive: [], insert: [] });
  });

  it("archive une branche disparue", () => {
    const result = mergeBranches([{ id: "a", pathUci: ["g1f3", "b8c6"], archived: false }], []);
    expect(result).toEqual({ keep: [], archive: ["a"], insert: [] });
  });

  it("insère une branche nouvelle", () => {
    const branch = built("g1f3 d7d6");
    const result = mergeBranches([], [branch]);
    expect(result).toEqual({ keep: [], archive: [], insert: [branch] });
  });

  it("désarchive une branche archivée qui revient", () => {
    const result = mergeBranches([{ id: "a", pathUci: ["g1f3", "b8c6"], archived: true }], [built("g1f3 b8c6")]);
    expect(result).toEqual({ keep: ["a"], archive: [], insert: [] });
  });

  it("ne réarchive pas une branche déjà archivée et toujours absente", () => {
    const result = mergeBranches([{ id: "a", pathUci: ["g1f3"], archived: true }], []);
    expect(result).toEqual({ keep: [], archive: [], insert: [] });
  });

  it("combine les trois cas et n'insère pas deux fois le même chemin", () => {
    const fresh = built("e2e4 c7c5");
    const result = mergeBranches(
      [
        { id: "a", pathUci: ["g1f3", "b8c6"], archived: false },
        { id: "b", pathUci: ["g1f3", "d7d6"], archived: false },
      ],
      [built("g1f3 b8c6"), fresh, built("e2e4 c7c5")],
    );
    expect(result).toEqual({ keep: ["a"], archive: ["b"], insert: [fresh] });
  });
});
