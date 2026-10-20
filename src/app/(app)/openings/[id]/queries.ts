import "server-only";
import { BRANCH_PROMPT_VERSION } from "@/lib/ai/branch/prompt";
import { BranchIdeasSchema, type BranchIdeas } from "@/lib/ai/branch/schema";
import { AI_MODEL } from "@/lib/ai/pricing";
import type { SupabaseServerClient } from "@/lib/db/server";
import type { LinePageBranch, LinePageLine } from "@/lib/repertoire/line-view";

export type CachedBranchIdeas = { ideas: BranchIdeas; verified: boolean };

export type LinePageData = {
  line: LinePageLine;
  branches: LinePageBranch[];
  /** Idées en cache par branche : affichées sans appel IA. */
  ideas: Record<string, CachedBranchIdeas>;
};

function fail(what: string, message: string): never {
  throw new Error(`Lecture ${what} impossible : ${message}`);
}

/** Ligne, branches actives et idées en cache ; null si la ligne n'existe pas (ou n'appartient pas à l'utilisateur). */
export async function loadLinePage(supabase: SupabaseServerClient, id: string): Promise<LinePageData | null> {
  const [lineRes, branchesRes] = await Promise.all([
    supabase
      .from("opening_lines")
      .select("id, name, eco, player_color, kind, status, root_fen, prefix_san, explorer_unavailable, games, wins, draws, losses")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("opening_branches")
      .select("id, path_uci, path_san, end_fen, own_games, explorer_games, studied_at, due_at, last_result")
      .eq("line_id", id)
      .eq("archived", false)
      .order("own_games", { ascending: false }),
  ]);
  if (lineRes.error) fail("de la ligne", lineRes.error.message);
  if (branchesRes.error) fail("des branches", branchesRes.error.message);
  const row = lineRes.data;
  if (!row) return null;

  const branches = branchesRes.data.map(
    (b): LinePageBranch => ({
      id: b.id,
      pathUci: b.path_uci,
      pathSan: b.path_san,
      endFen: b.end_fen,
      ownGames: b.own_games,
      explorerGames: b.explorer_games,
      studiedAt: b.studied_at,
      dueAt: b.due_at,
      lastResult: b.last_result,
    }),
  );

  const ideas: Record<string, CachedBranchIdeas> = {};
  if (branches.length > 0) {
    const { data, error } = await supabase
      .from("opening_branch_explanations")
      .select("branch_id, content, verified")
      .in(
        "branch_id",
        branches.map((b) => b.id),
      )
      .eq("prompt_version", BRANCH_PROMPT_VERSION)
      .eq("model", AI_MODEL);
    if (error) fail("des idées des branches", error.message);
    for (const item of data) {
      const parsed = BranchIdeasSchema.safeParse(item.content);
      if (parsed.success) ideas[item.branch_id] = { ideas: parsed.data, verified: item.verified };
    }
  }

  return {
    line: {
      id: row.id,
      name: row.name,
      eco: row.eco,
      playerColor: row.player_color === "b" ? "b" : "w",
      kind: row.kind,
      status: row.status,
      rootFen: row.root_fen,
      prefixSan: row.prefix_san,
      explorerUnavailable: row.explorer_unavailable,
      games: row.games,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    },
    branches,
    ideas,
  };
}
