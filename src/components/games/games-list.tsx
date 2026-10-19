import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { GameListItem } from "@/app/(app)/games/queries";
import {
  describeResult,
  formatGameDate,
  formatTimeControl,
  RESULT_SCORE,
  TIME_CLASS_LABELS,
  type PlayerResult,
} from "./format";

const ACCURACY_FORMAT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SCORE_CLASS: Record<PlayerResult, string> = {
  win: "text-cls-best",
  draw: "text-muted-foreground",
  loss: "text-cls-blunder",
};

function asResult(value: string): PlayerResult {
  return value === "win" || value === "loss" ? value : "draw";
}

function opponentOf(game: GameListItem) {
  return game.player_color === "w"
    ? { name: game.black, rating: game.black_rating }
    : { name: game.white, rating: game.white_rating };
}

/** Score du joueur (1, ½, 0) : la colonne « résultat » d'une feuille de notation. */
function Score({ result, className }: { result: PlayerResult; className?: string }) {
  return (
    <span aria-hidden className={cn("tabular text-2xl leading-none font-bold", SCORE_CLASS[result], className)}>
      {RESULT_SCORE[result]}
    </span>
  );
}

/** Case blanche ou noire : la couleur jouée. */
function ColorSquare({ color }: { color: string }) {
  const white = color === "w";
  return (
    <span
      title={white ? "Blancs" : "Noirs"}
      className={cn(
        "inline-block size-3 shrink-0 rounded-[2px] ring-1",
        white ? "bg-eval-white ring-border" : "bg-eval-black ring-eval-black",
      )}
    >
      <span className="sr-only">{white ? "Avec les Blancs" : "Avec les Noirs"}</span>
    </span>
  );
}

function Opponent({ game }: { game: GameListItem }) {
  const opponent = opponentOf(game);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ColorSquare color={game.player_color} />
      <span className="truncate font-medium">{opponent.name}</span>
      {opponent.rating !== null ? <span className="tabular text-sm text-muted-foreground">{opponent.rating}</span> : null}
    </span>
  );
}

function Cadence({ game }: { game: GameListItem }) {
  const label = game.time_class ? (TIME_CLASS_LABELS[game.time_class] ?? game.time_class) : "Cadence inconnue";
  const control = formatTimeControl(game.time_control);
  return (
    <span>
      {label}
      {control ? <span className="block text-xs text-muted-foreground">{control}</span> : null}
    </span>
  );
}

function OpeningCell({ game }: { game: GameListItem }) {
  if (!game.opening_name && !game.eco) return <span className="text-muted-foreground">Ouverture inconnue</span>;
  return (
    <span className="block min-w-0">
      <span className="line-clamp-2">{game.opening_name ?? "Ouverture sans nom"}</span>
      {game.eco ? <span className="tabular text-xs text-muted-foreground">{game.eco}</span> : null}
    </span>
  );
}

function AnalysisAction({ game }: { game: GameListItem }) {
  const href = `/games/${game.id}`;
  if (game.analysis_status === "done") {
    return (
      <div className="flex items-center justify-end gap-3">
        {game.player_accuracy !== null ? (
          <span className="text-right text-xs text-muted-foreground">
            Précision
            <span className="tabular block text-base font-semibold text-foreground">
              {ACCURACY_FORMAT.format(game.player_accuracy)}
            </span>
          </span>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href={href}>Voir l&apos;analyse</Link>
        </Button>
      </div>
    );
  }
  const label =
    game.analysis_status === "running"
      ? "Reprendre l'analyse"
      : game.analysis_status === "error"
        ? "Relancer l'analyse"
        : "Analyser";
  return (
    <div className="flex items-center justify-end gap-3">
      {game.analysis_status === "error" ? <span className="text-xs text-destructive">Analyse interrompue</span> : null}
      <Button asChild variant={game.analysis_status === "none" ? "secondary" : "outline"} size="sm">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

export function GamesList({ games }: { games: GameListItem[] }) {
  return (
    <>
      {/* Mobile et tablette : lignes empilées */}
      <ul className="divide-y lg:hidden">
        {games.map((game) => {
          const result = asResult(game.result);
          const { date } = formatGameDate(game.end_time);
          return (
            <li key={game.id} className="grid grid-cols-[2.25rem_1fr] gap-x-3 py-4">
              <Score result={result} className="pt-0.5 text-center" />
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <Opponent game={game} />
                  <span className="tabular shrink-0 text-xs text-muted-foreground">{date}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{describeResult(result, game.result_detail)}</span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {game.time_class ? (TIME_CLASS_LABELS[game.time_class] ?? game.time_class) : null}
                    {formatTimeControl(game.time_control) ? `, ${formatTimeControl(game.time_control)}` : null}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {game.eco ? <span className="tabular">{game.eco} </span> : null}
                  {game.opening_name ?? "Ouverture inconnue"}
                </p>
                <div className="pt-1">
                  <AnalysisAction game={game} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Ordinateur : table */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 text-center">
                <span className="sr-only">Score</span>
              </TableHead>
              <TableHead>Adversaire</TableHead>
              <TableHead>Résultat</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Ouverture</TableHead>
              <TableHead className="text-right">Analyse</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.map((game) => {
              const result = asResult(game.result);
              const { date, time } = formatGameDate(game.end_time);
              return (
                <TableRow key={game.id}>
                  <TableCell className="border-r text-center">
                    <Score result={result} />
                  </TableCell>
                  <TableCell className="max-w-48">
                    <Opponent game={game} />
                  </TableCell>
                  <TableCell className="text-sm">{describeResult(result, game.result_detail)}</TableCell>
                  <TableCell className="tabular text-sm">
                    {date}
                    <span className="block text-xs text-muted-foreground">{time}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Cadence game={game} />
                  </TableCell>
                  <TableCell className="max-w-64 text-sm whitespace-normal">
                    <OpeningCell game={game} />
                  </TableCell>
                  <TableCell>
                    <AnalysisAction game={game} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
