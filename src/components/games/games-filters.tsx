import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { GameFilters } from "@/app/(app)/games/filters";
import { RESULT_LABELS, TIME_CLASS_LABELS } from "./format";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Filtres en GET : l'URL reste partageable et la page se filtre côté serveur. */
export function GamesFilters({ filters, active }: { filters: GameFilters; active: boolean }) {
  return (
    <Form
      action="/games"
      className="grid grid-cols-2 gap-x-3 gap-y-3 border-y py-4 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))_auto]"
      aria-label="Filtrer les parties"
    >
      <Field label="Ouverture ou code ECO" htmlFor="filter-q" className="col-span-2 sm:col-span-3 lg:col-span-1">
        <Input id="filter-q" name="q" type="search" defaultValue={filters.q} placeholder="Sicilian, Caro-Kann, C41…" maxLength={80} />
      </Field>
      <Field label="Du" htmlFor="filter-from">
        <Input id="filter-from" name="from" type="date" defaultValue={filters.from} />
      </Field>
      <Field label="Au" htmlFor="filter-to">
        <Input id="filter-to" name="to" type="date" defaultValue={filters.to} />
      </Field>
      <Field label="Couleur" htmlFor="filter-color">
        <select id="filter-color" name="color" defaultValue={filters.color ?? ""} className={SELECT_CLASS}>
          <option value="">Les deux</option>
          <option value="w">Blancs</option>
          <option value="b">Noirs</option>
        </select>
      </Field>
      <Field label="Résultat" htmlFor="filter-result">
        <select id="filter-result" name="result" defaultValue={filters.result ?? ""} className={SELECT_CLASS}>
          <option value="">Tous</option>
          {(["win", "draw", "loss"] as const).map((value) => (
            <option key={value} value={value}>
              {RESULT_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Cadence" htmlFor="filter-tc">
        <select id="filter-tc" name="tc" defaultValue={filters.tc ?? ""} className={SELECT_CLASS}>
          <option value="">Toutes</option>
          {Object.entries(TIME_CLASS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <Button type="submit" variant="secondary" className="flex-1 lg:flex-none">
          Filtrer
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href="/games">Effacer</Link>
          </Button>
        ) : null}
      </div>
    </Form>
  );
}
