"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { filtersToSearch, hasActiveFilters, type GameFilters } from "@/app/(app)/games/filters";
import { RESULT_LABELS, TIME_CLASS_LABELS } from "./format";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Délai après la dernière frappe avant de lancer la recherche. */
const SEARCH_DELAY_MS = 350;

type FilterValues = Omit<GameFilters, "page">;

function Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Filtres appliqués dès qu'ils changent (la recherche texte après une courte pause de frappe).
 * L'URL reste la source de vérité : elle est partageable et la page se filtre côté serveur.
 */
export function GamesFilters({ filters }: { filters: GameFilters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Valeurs affichées tout de suite, en attendant que la page filtrée arrive du serveur.
  const [shown, setShown] = useOptimistic<FilterValues>(filters);
  // Valeurs affichées les plus récentes, lues par la recherche différée au moment où elle se déclenche
  // (sinon un filtre changé pendant le délai serait annulé).
  const latestShown = useRef(shown);
  useEffect(() => {
    latestShown.current = shown;
  });
  const [query, setQuery] = useState(filters.q ?? "");
  // Dernière recherche reçue du serveur : resynchronise le champ après « Effacer » ou un retour arrière.
  const [syncedQuery, setSyncedQuery] = useState(filters.q ?? "");
  if ((filters.q ?? "") !== syncedQuery) {
    setSyncedQuery(filters.q ?? "");
    if ((filters.q ?? "") !== query.trim()) setQuery(filters.q ?? "");
  }

  function apply(changes: Partial<FilterValues>) {
    const next: FilterValues = { ...latestShown.current, ...changes };
    startTransition(() => {
      setShown(next);
      // Tout changement de filtre repart de la première page.
      router.replace(`/games${filtersToSearch({ ...next, page: 1 })}`, { scroll: false });
    });
  }

  useEffect(() => {
    const trimmed = query.trim();
    // Comparé à la valeur affichée : après « Effacer », la recherche vide est déjà en cours d'application.
    if (trimmed === (shown.q ?? "")) return;
    const timer = setTimeout(() => apply({ q: trimmed || undefined }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // apply dépend de l'état affiché : seule la frappe doit relancer le délai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, shown.q]);

  const active = hasActiveFilters({ ...shown, page: 1 });

  return (
    <div
      role="search"
      aria-label="Filtrer les parties"
      aria-busy={pending}
      data-pending={pending || undefined}
      className="grid grid-cols-2 gap-x-3 gap-y-3 border-y py-4 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))_auto]"
    >
      <Field label="Ouverture ou code ECO" htmlFor="filter-q" className="col-span-2 sm:col-span-3 lg:col-span-1">
        <Input
          id="filter-q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Entrée : recherche immédiate, sans attendre le délai.
            if (event.key === "Enter") apply({ q: query.trim() || undefined });
          }}
          placeholder="Sicilian, Caro-Kann, C41…"
          maxLength={80}
        />
      </Field>
      <Field label="Du" htmlFor="filter-from">
        <Input
          id="filter-from"
          type="date"
          value={shown.from ?? ""}
          max={shown.to}
          onChange={(event) => apply({ from: event.target.value || undefined })}
        />
      </Field>
      <Field label="Au" htmlFor="filter-to">
        <Input
          id="filter-to"
          type="date"
          value={shown.to ?? ""}
          min={shown.from}
          onChange={(event) => apply({ to: event.target.value || undefined })}
        />
      </Field>
      <Field label="Couleur" htmlFor="filter-color">
        <select
          id="filter-color"
          value={shown.color ?? ""}
          onChange={(event) => apply({ color: (event.target.value || undefined) as FilterValues["color"] })}
          className={SELECT_CLASS}
        >
          <option value="">Les deux</option>
          <option value="w">Blancs</option>
          <option value="b">Noirs</option>
        </select>
      </Field>
      <Field label="Résultat" htmlFor="filter-result">
        <select
          id="filter-result"
          value={shown.result ?? ""}
          onChange={(event) => apply({ result: (event.target.value || undefined) as FilterValues["result"] })}
          className={SELECT_CLASS}
        >
          <option value="">Tous</option>
          {(["win", "draw", "loss"] as const).map((value) => (
            <option key={value} value={value}>
              {RESULT_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Cadence" htmlFor="filter-tc">
        <select
          id="filter-tc"
          value={shown.tc ?? ""}
          onChange={(event) => apply({ tc: (event.target.value || undefined) as FilterValues["tc"] })}
          className={SELECT_CLASS}
        >
          <option value="">Toutes</option>
          {Object.entries(TIME_CLASS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
        {active ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              apply({ from: undefined, to: undefined, color: undefined, result: undefined, tc: undefined, q: undefined });
            }}
          >
            Effacer les filtres
          </Button>
        ) : null}
        <span role="status" className={cn("pb-1.5 text-xs text-muted-foreground", !pending && "sr-only")}>
          {pending ? "Mise à jour…" : ""}
        </span>
      </div>
    </div>
  );
}
