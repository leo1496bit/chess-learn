// Fusion des branches reconstruites avec celles déjà en base. Pur.
// Une branche est identifiée par sa suite de coups : si elle existe encore, elle garde son état de
// révision et son texte IA (keep) ; sinon elle est archivée, jamais supprimée.
import type { BuiltBranch } from "./tree";

export type ExistingBranch = { id: string; pathUci: string[]; archived: boolean };

export type BranchMerge = { keep: string[]; archive: string[]; insert: BuiltBranch[] };

const keyOf = (pathUci: readonly string[]) => pathUci.join(" ");

export function mergeBranches(existing: ExistingBranch[], built: BuiltBranch[]): BranchMerge {
  const builtByKey = new Map<string, BuiltBranch>();
  for (const branch of built) if (!builtByKey.has(keyOf(branch.pathUci))) builtByKey.set(keyOf(branch.pathUci), branch);

  const keep: string[] = [];
  const archive: string[] = [];
  const known = new Set<string>();
  for (const branch of existing) {
    const key = keyOf(branch.pathUci);
    known.add(key);
    if (builtByKey.has(key)) keep.push(branch.id);
    else if (!branch.archived) archive.push(branch.id);
  }
  const insert = [...builtByKey.entries()].filter(([key]) => !known.has(key)).map(([, branch]) => branch);
  return { keep, archive, insert };
}
