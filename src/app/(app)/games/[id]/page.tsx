import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameAnalysisView } from "@/components/analysis/game-analysis-view";
import { PageHeader } from "@/components/page-header";
import { parseGameSummary, rowToMoveAnalysis } from "@/lib/analysis/rows";
import type { Color, MoveAnalysis } from "@/lib/analysis/types";
import { requireUser } from "@/lib/db/server";
import { getSettings } from "@/lib/db/settings";

export const metadata: Metadata = { title: "Analyse de la partie" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESULT_LABELS: Record<string, string> = { win: "Victoire", loss: "Défaite", draw: "Nulle" };

export default async function Page({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await requireUser();
  const [gameRes, movesRes, analysisRes, settings] = await Promise.all([
    supabase.from("games").select("*").eq("id", id).maybeSingle(),
    supabase.from("move_analyses").select("*").eq("game_id", id).order("ply"),
    supabase.from("game_analyses").select("*").eq("game_id", id).maybeSingle(),
    getSettings(supabase),
  ]);
  if (gameRes.error) throw new Error(`Lecture de la partie impossible : ${gameRes.error.message}`);
  const game = gameRes.data;
  if (!game) notFound();

  let moves: MoveAnalysis[] | null = null;
  let loadWarning: string | null = null;
  if (movesRes.error) loadWarning = `Lecture de l'analyse impossible (${movesRes.error.message}). Rechargez la page.`;
  else if (movesRes.data.length > 0) {
    try {
      moves = movesRes.data.map(rowToMoveAnalysis);
    } catch {
      loadWarning = "L'analyse enregistrée est illisible : relancez l'analyse pour la recalculer.";
    }
  }
  const summary = analysisRes.data ? parseGameSummary(analysisRes.data.summary) : null;
  const hasAnalysis = moves !== null && summary !== null;
  const playerColor: Color = game.player_color === "b" ? "b" : "w";

  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(game.end_time));
  const rating = (r: number | null) => (r ? ` (${r})` : "");
  const description = (
    <>
      {RESULT_LABELS[game.result] ?? game.result} avec les {playerColor === "w" ? "Blancs" : "Noirs"}, le {date}.
      {game.opening_name ? ` Ouverture : ${game.opening_name}.` : null}
      {game.chesscom_url ? (
        <>
          {" "}
          <Link href={game.chesscom_url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            Voir sur Chess.com
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader title={`${game.white}${rating(game.white_rating)} contre ${game.black}${rating(game.black_rating)}`} description={description} />
      {loadWarning ? (
        <p role="alert" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {loadWarning}
        </p>
      ) : null}
      <GameAnalysisView
        game={{ id: game.id, pgn: game.pgn, white: game.white, black: game.black, playerColor, analysisStatus: game.analysis_status }}
        initialMoves={hasAnalysis ? moves : null}
        initialSummary={hasAnalysis ? summary : null}
        analyzedWith={hasAnalysis && analysisRes.data ? { depth: analysisRes.data.depth, multipv: analysisRes.data.multipv } : null}
        engineSettings={{ depth: settings.engineDepth, multipv: settings.engineMultipv }}
        thresholds={settings.thresholds}
      />
    </>
  );
}
