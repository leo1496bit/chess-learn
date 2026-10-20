"use client";

import { Chess } from "chess.js";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChessBoard } from "@/components/chess/chess-board";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MAX_PLY } from "@/lib/repertoire/constants";
import { cn } from "@/lib/utils";
import { createLine } from "./create-line";

type Color = "w" | "b";
type Hit = { eco: string; name: string; uci: string };

const SEARCH_DELAY_MS = 250;

function ColorChoice({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Ton camp</legend>
      <div className="flex gap-1">
        {(["w", "b"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={cn(
              "flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
              value === c ? "border-primary bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {c === "w" ? "Je joue les Blancs" : "Je joue les Noirs"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function useCreate() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(uci: string[], playerColor: Color) {
    setPending(true);
    setError(null);
    const result = await createLine({ source: "manual", uci, playerColor });
    if (result.ok) {
      router.push(`/openings/${result.id}`);
      return;
    }
    setError(result.error);
    setPending(false);
  }
  return { pending, error, create, clearError: () => setError(null) };
}

function PlayMoves() {
  const [moves, setMoves] = useState<string[]>([]);
  const [color, setColor] = useState<Color>("w");
  const { pending, error, create, clearError } = useCreate();

  const { fen, san } = useMemo(() => {
    const chess = new Chess();
    const played: string[] = [];
    for (const uci of moves) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      played.push(move.san);
    }
    return { fen: chess.fen(), san: played };
  }, [moves]);

  function onDrop(from: string, to: string, promotion?: string): boolean {
    if (moves.length >= MAX_PLY) return false;
    const chess = new Chess(fen);
    try {
      chess.move({ from, to, promotion });
    } catch {
      return false;
    }
    clearError();
    setMoves([...moves, `${from}${to}${promotion ?? ""}`]);
    return true;
  }

  return (
    <div className="space-y-4">
      <ChessBoard
        id="add-line-board"
        fen={fen}
        orientation={color === "w" ? "white" : "black"}
        interactive
        onPieceDrop={onDrop}
        className="mx-auto max-w-sm"
      />
      <p className="min-h-6 text-sm text-muted-foreground" aria-live="polite">
        {san.length > 0 ? san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ") : `Joue les coups des deux camps (${MAX_PLY} demi-coups au plus).`}
      </p>
      <ColorChoice value={color} onChange={setColor} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={moves.length === 0 || pending} onClick={() => setMoves(moves.slice(0, -1))}>
          Annuler le dernier coup
        </Button>
        <Button disabled={moves.length === 0 || pending} onClick={() => create(moves, color)}>
          {pending ? "Création…" : "Créer la ligne ici"}
        </Button>
      </div>
    </div>
  );
}

function SearchName() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Hit | null>(null);
  const [color, setColor] = useState<Color>("w");
  const { pending, error, create, clearError } = useCreate();
  const searching = query.trim().length >= 2;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/openings/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = (await response.json().catch(() => ({}))) as { results?: Hit[]; error?: string };
        if (!response.ok || !body.results) {
          setSearchError(body.error ?? "La recherche a échoué. Réessaie dans un instant.");
          return;
        }
        setSearchError(null);
        setHits(body.results);
      } catch {
        if (!controller.signal.aborted) setSearchError("Le serveur ne répond pas. Vérifie ta connexion puis réessaie.");
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="space-y-4">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ex. Caro-Kann, gambit du roi…"
        aria-label="Nom de l'ouverture"
      />
      {searching && searchError ? (
        <p role="alert" className="text-sm text-destructive">
          {searchError}
        </p>
      ) : null}
      {searching && hits.length > 0 ? (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {hits.map((hit) => {
            const isSelected = selected?.uci === hit.uci && selected.name === hit.name;
            return (
              <li key={`${hit.eco}-${hit.name}-${hit.uci}`}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelected(hit);
                    clearError();
                  }}
                  className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted", isSelected && "bg-accent font-semibold")}
                >
                  {hit.name} <span className="text-muted-foreground">{hit.eco}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : searching && !searchError ? (
        <p className="text-sm text-muted-foreground">Aucun nom ne correspond.</p>
      ) : null}
      {selected ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{selected.name}</span>
          </p>
          <ColorChoice value={color} onChange={setColor} />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button disabled={pending} onClick={() => create(selected.uci.split(" ").filter(Boolean), color)}>
            {pending ? "Création…" : "Créer"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AddLineDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> Ajouter une ligne
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une ligne</DialogTitle>
          <DialogDescription>
            La ligne s&apos;arrête sur un coup de ton adversaire : c&apos;est à toi de répondre ensuite.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="play">
          <TabsList>
            <TabsTrigger value="play">Jouer les coups</TabsTrigger>
            <TabsTrigger value="search">Chercher un nom</TabsTrigger>
          </TabsList>
          <TabsContent value="play" className="pt-2">
            <PlayMoves />
          </TabsContent>
          <TabsContent value="search" className="pt-2">
            <SearchName />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
