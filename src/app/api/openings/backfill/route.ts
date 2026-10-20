import { getAuthorizedUser } from "@/lib/db/server";
import { indexGames } from "@/lib/repertoire/index-games";
import { BACKFILL_BATCH } from "@/lib/repertoire/constants";

/** Indexe un lot de parties pas encore indexées ; à rappeler tant que `remaining` > 0. */
export async function POST() {
  const auth = await getAuthorizedUser();
  if (!auth) return Response.json({ error: "Connecte-toi pour indexer tes parties." }, { status: 401 });
  const { supabase } = auth;

  try {
    const { data, error } = await supabase
      .from("games")
      .select("id, pgn")
      .eq("positions_indexed", false)
      .order("end_time", { ascending: false })
      .limit(BACKFILL_BATCH);
    if (error) throw new Error(error.message);
    const indexed = await indexGames(supabase, data);

    const { count, error: countError } = await supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("positions_indexed", false);
    if (countError) throw new Error(countError.message);
    return Response.json({ indexed, remaining: count ?? 0 });
  } catch (error) {
    console.error("Rattrapage de l'indexation des ouvertures échoué", error);
    return Response.json({ error: "L'indexation a échoué. Réessaie dans un instant." }, { status: 500 });
  }
}
