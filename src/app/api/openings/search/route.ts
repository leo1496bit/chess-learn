import { getAuthorizedUser } from "@/lib/db/server";
import { searchOpenings } from "@/lib/openings/names";

const MAX_QUERY_LENGTH = 80;

/** Cherche un nom d'ouverture dans le livre : GET ?q=. */
export async function GET(request: Request) {
  const auth = await getAuthorizedUser();
  if (!auth) return Response.json({ error: "Connecte-toi pour chercher une ouverture." }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  return Response.json({ results: searchOpenings(q) });
}
