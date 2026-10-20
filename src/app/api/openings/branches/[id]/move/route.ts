import { Chess } from "chess.js";
import { z } from "zod";
import { playUci, uciLineToSan } from "@/lib/analysis/lines";
import { getAuthorizedUser } from "@/lib/db/server";
import { judgeLineMove, normalizeCastling, resolveNeeds } from "@/lib/repertoire/recite";
import { createSupabaseLineStore, loadServerAnalyses } from "@/lib/repertoire/store";
import { positionAfter } from "@/lib/training/attempt";

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

const BodySchema = z.object({
  index: z.number().int().min(0).max(200),
  answerUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Coup UCI invalide"),
});

/**
 * Verdict d'un coup récité. Il est calculé ici avec les analyses Stockfish en cache (`position_analyses`) :
 * la requête ne contient que l'index et le coup joué. Si une analyse manque, 409 avec les positions que le
 * navigateur doit analyser (à la profondeur de la ligne) avant de renvoyer le coup.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse(401, "Connecte-toi pour réciter une ligne.");

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse(400, "Identifiant de branche invalide.");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(400, "Corps de requête JSON invalide.");
  }
  const input = BodySchema.safeParse(json);
  if (!input.success) return errorResponse(400, "Paramètres invalides : { index, answerUci } attendus.");
  const { index, answerUci } = input.data;
  const { supabase } = auth;

  try {
    const { data: branch, error } = await supabase
      .from("opening_branches")
      .select("line_id, path_uci")
      .eq("id", id.data)
      .eq("archived", false)
      .maybeSingle();
    if (error) throw error;
    if (!branch) return errorResponse(404, "Branche introuvable.");
    // Les coups de Leonel sont aux indices pairs (la racine a toujours Leonel au trait).
    if (index % 2 !== 0 || index >= branch.path_uci.length) {
      return errorResponse(400, "Cet index ne désigne pas un de tes coups dans la branche.");
    }

    const store = createSupabaseLineStore(supabase, { now: new Date() });
    const line = await store.getLine(branch.line_id);
    if (!line) return errorResponse(404, "Ligne introuvable.");

    const chess = new Chess(line.rootFen);
    for (const uci of branch.path_uci.slice(0, index)) {
      if (!playUci(chess, uci)) throw new Error(`Branche ${id.data} : coup ${uci} illégal`);
    }
    if (chess.turn() !== line.playerColor) return errorResponse(400, "Ce n'est pas à toi de jouer à cet index.");
    const fen = chess.fen();
    const expectedUci = branch.path_uci[index];

    const expectedNext = positionAfter(fen, expectedUci);
    const answerNext = positionAfter(fen, normalizeCastling(fen, answerUci));
    if (!expectedNext) throw new Error(`Branche ${id.data} : coup attendu ${expectedUci} illégal`);
    if (!answerNext) return errorResponse(400, "Ce coup n'est pas légal dans cette position.");

    const [beforeMap, afterMap] = await Promise.all([
      loadServerAnalyses(supabase, [fen], line.depth, line.multipv),
      loadServerAnalyses(supabase, [expectedNext.fenAfter, answerNext.fenAfter], line.depth, 1),
    ]);
    const result = judgeLineMove({
      fen,
      expectedUci,
      answerUci,
      color: line.playerColor,
      before: beforeMap.get(fen),
      expectedAfter: afterMap.get(expectedNext.fenAfter),
      answerAfter: afterMap.get(answerNext.fenAfter),
    });

    switch (result.verdict) {
      case "illegal":
        return errorResponse(400, "Ce coup n'est pas légal dans cette position.");
      case "needs_analysis":
        return Response.json({ verdict: "needs_analysis", needs: resolveNeeds(result.needs, line.multipv), depth: line.depth }, { status: 409 });
      case "alternative":
        return Response.json({
          verdict: "alternative",
          loss: result.loss,
          expectedSan: uciLineToSan(fen, [expectedUci], 1).san[0] ?? expectedNext.san,
        });
      case "wrong":
        // Le coup attendu n'est pas révélé : le client passe par les indices.
        return Response.json({ verdict: "wrong", loss: result.loss });
      default:
        return Response.json({ verdict: "expected" });
    }
  } catch (error) {
    console.error("[openings/branches/move] Verdict impossible", error);
    return errorResponse(500, "Le verdict n'a pas pu être calculé. Réessaie dans un instant.");
  }
}
