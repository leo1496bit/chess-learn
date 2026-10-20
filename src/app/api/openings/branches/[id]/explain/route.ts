import { z } from "zod";
import { Chess } from "chess.js";
import { playUci } from "@/lib/analysis/lines";
import { getAuthorizedUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";
import { AiError, createAnthropicClient } from "@/lib/ai/call";
import type { ApiErrorBody } from "@/lib/ai/schema";
import { buildBranchInput } from "@/lib/ai/branch/input";
import { BRANCH_MAX_RETRIES, BRANCH_TIMEOUT_MS, generateBranchIdeas } from "@/lib/ai/branch/generate";
import type { BranchIdeasResponse } from "@/lib/ai/branch/schema";
import { createSupabaseBranchIdeasStore } from "@/lib/ai/branch/store";
import { DEFAULT_ENGINE_SETTINGS, type Color } from "@/lib/analysis/types";
import { loadServerAnalyses } from "@/lib/repertoire/store";

export const maxDuration = 60;

function errorResponse(status: number, error: string, code?: ApiErrorBody["code"]) {
  const body: ApiErrorBody = { error, code };
  return Response.json(body, { status });
}

const BodySchema = z.object({ force: z.boolean().optional() }).optional();

/** Idées et plan d'une branche. Toutes les données sont relues en base côté serveur ; aucune analyse n'est calculée ici. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour obtenir les idées de la branche.", "unauthorized");

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse(400, "Identifiant de branche invalide.", "invalid");

  let json: unknown = undefined;
  try {
    const text = await request.text();
    if (text.trim()) json = JSON.parse(text);
  } catch {
    return errorResponse(400, "Corps de requête JSON invalide.", "invalid");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return errorResponse(400, "Requête invalide : { force } optionnel attendu.", "invalid");
  const { supabase } = auth;

  try {
    const { data: branch, error } = await supabase
      .from("opening_branches")
      .select("line_id, path_uci, path_san")
      .eq("id", id.data)
      .eq("archived", false)
      .maybeSingle();
    if (error) throw error;
    if (!branch) return errorResponse(404, "Branche introuvable.", "not_found");

    const { data: line, error: lineError } = await supabase
      .from("opening_lines")
      .select("name, eco, kind, player_color, root_fen, prefix_san, depth, multipv, status")
      .eq("id", branch.line_id)
      .maybeSingle();
    if (lineError) throw lineError;
    if (!line) return errorResponse(404, "Ligne introuvable.", "not_found");
    if (line.status !== "ready") return errorResponse(409, "La ligne n'est pas encore prête : attends la fin de sa construction.", "invalid");

    const depth = line.depth ?? DEFAULT_ENGINE_SETTINGS.depth;
    const multipv = line.multipv ?? DEFAULT_ENGINE_SETTINGS.multipv;
    // Positions où Leonel joue (indices pairs) et position finale.
    const chess = new Chess(line.root_fen);
    const ownFens: string[] = [];
    branch.path_uci.forEach((uci, index) => {
      if (index % 2 === 0) ownFens.push(chess.fen());
      if (!playUci(chess, uci)) throw new Error(`Branche ${id.data} : coup ${uci} illégal`);
    });
    const endFen = chess.fen();

    const [ownMap, endMap, settings] = await Promise.all([
      loadServerAnalyses(supabase, ownFens, depth, multipv),
      loadServerAnalyses(supabase, [endFen], depth, 1),
      getSettings(supabase),
    ]);
    // Une analyse manquante n'est pas bloquante : l'évaluation de ce coup est simplement omise.
    const analyses = new Map([...endMap, ...ownMap]);

    const input = buildBranchInput(
      {
        name: line.name,
        eco: line.eco,
        kind: line.kind === "punish" || line.kind === "master" ? line.kind : null,
        playerColor: (line.player_color === "b" ? "b" : "w") satisfies Color,
        rootFen: line.root_fen,
        prefixSan: line.prefix_san,
      },
      { pathUci: branch.path_uci, pathSan: branch.path_san },
      analyses,
    );

    const result = await generateBranchIdeas({
      branchId: id.data,
      input,
      branchLength: branch.path_uci.length,
      settings,
      store: createSupabaseBranchIdeasStore(supabase),
      client: createAnthropicClient(BRANCH_TIMEOUT_MS, { maxRetries: BRANCH_MAX_RETRIES }),
      force: body.data?.force,
    });
    const response: BranchIdeasResponse = { ideas: result.ideas, verified: result.verified, cached: result.cached };
    return Response.json(response);
  } catch (error) {
    if (error instanceof AiError) return errorResponse(error.status, error.message, error.code);
    console.error("[openings/branches/explain] Génération impossible", error);
    return errorResponse(500, "Erreur interne pendant la génération des idées. Réessaie dans un instant.");
  }
}
