"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CLASSIFICATION_META } from "@/components/chess/classification-badge";
import { cn } from "@/lib/utils";
import type { AppSettings } from "@/lib/db/settings";
import type { Classification } from "@/lib/analysis/types";
import {
  DEFAULT_FORM_THRESHOLDS,
  THRESHOLD_KEYS,
  depthHint,
  multipvHint,
  type SettingsActionState,
  type SettingsField,
} from "./settings-schema";

type SaveAction = (state: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
type FormStrings = Record<Exclude<SettingsField, "aiEnabled">, string>;

function toStrings(settings: AppSettings): FormStrings {
  return {
    chesscomUsername: settings.chesscomUsername,
    engineDepth: String(settings.engineDepth),
    engineMultipv: String(settings.engineMultipv),
    excellent: String(settings.thresholds.excellent),
    good: String(settings.thresholds.good),
    inaccuracy: String(settings.thresholds.inaccuracy),
    mistake: String(settings.thresholds.mistake),
    blunder: String(settings.thresholds.blunder),
    aiDailyCallLimit: String(settings.aiDailyCallLimit),
    aiMonthlyBudgetUsd: String(settings.aiMonthlyBudgetUsd),
  };
}

const THRESHOLD_LABELS: Record<(typeof THRESHOLD_KEYS)[number], { label: string; rule: string; cls: Classification }> = {
  excellent: { label: "Excellent", rule: "perte inférieure à", cls: "excellent" },
  good: { label: "Bon", rule: "perte inférieure à", cls: "good" },
  inaccuracy: { label: "Imprécision", rule: "à partir de", cls: "inaccuracy" },
  mistake: { label: "Erreur", rule: "à partir de", cls: "mistake" },
  blunder: { label: "Gaffe", rule: "à partir de", cls: "blunder" },
};

export function SettingsForm({ initial, action }: { initial: AppSettings; action: SaveAction }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [values, setValues] = useState<FormStrings>(() => toStrings(initial));
  const [aiEnabled, setAiEnabled] = useState(initial.aiEnabled);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
  }, [state]);

  const errors = state.status === "error" ? state.fieldErrors : {};
  const set = (field: keyof FormStrings) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const resetThresholds = () =>
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(THRESHOLD_KEYS.map((key) => [key, String(DEFAULT_FORM_THRESHOLDS[key])])),
    }));
  const thresholdsAreDefault = THRESHOLD_KEYS.every((key) => Number(values[key]) === DEFAULT_FORM_THRESHOLDS[key]);

  // Soumission manuelle : évite la réinitialisation automatique du formulaire par React après l'action.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  return (
    <form onSubmit={onSubmit} noValidate className="divide-y border-y">
      <Section title="Compte Chess.com" description="Les parties de ce compte sont importées lors de la synchronisation.">
        <Field id="chesscomUsername" label="Identifiant Chess.com" error={errors.chesscomUsername}>
          <Input
            id="chesscomUsername"
            name="chesscomUsername"
            value={values.chesscomUsername}
            onChange={set("chesscomUsername")}
            autoComplete="off"
            spellCheck={false}
            className="max-w-xs"
            aria-invalid={Boolean(errors.chesscomUsername)}
            aria-describedby={errors.chesscomUsername ? "chesscomUsername-error" : undefined}
          />
        </Field>
      </Section>

      <Section
        title="Moteur d'analyse"
        description="Stockfish tourne dans ton navigateur. Plus il cherche loin, plus l'analyse est fiable et lente."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="engineDepth" label="Profondeur (8 à 30)" error={errors.engineDepth} hint={depthHint(Number(values.engineDepth))}>
            <Input
              id="engineDepth"
              name="engineDepth"
              type="number"
              inputMode="numeric"
              min={8}
              max={30}
              step={1}
              value={values.engineDepth}
              onChange={set("engineDepth")}
              className="tabular w-24"
              aria-invalid={Boolean(errors.engineDepth)}
              aria-describedby="engineDepth-hint"
            />
          </Field>
          <Field
            id="engineMultipv"
            label="Lignes candidates (1 à 5)"
            error={errors.engineMultipv}
            hint={multipvHint(Number(values.engineMultipv))}
          >
            <Input
              id="engineMultipv"
              name="engineMultipv"
              type="number"
              inputMode="numeric"
              min={1}
              max={5}
              step={1}
              value={values.engineMultipv}
              onChange={set("engineMultipv")}
              className="tabular w-24"
              aria-invalid={Boolean(errors.engineMultipv)}
              aria-describedby="engineMultipv-hint"
            />
          </Field>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Les positions déjà analysées restent en cache : changer ces réglages ne relance pas les anciennes analyses.
        </p>
      </Section>

      <Section
        title="Classification des coups"
        description="Seuils de perte de chances de gain (en points de pourcentage) pour qualifier un coup. Ils s'appliquent aux prochaines analyses."
      >
        <LossScale values={values} />
        <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {THRESHOLD_KEYS.map((key) => {
            const meta = THRESHOLD_LABELS[key];
            return (
              <Field
                key={key}
                id={`threshold-${key}`}
                label={
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="w-5 text-center font-bold" style={{ color: `var(--cls-${meta.cls})` }}>
                      {CLASSIFICATION_META[meta.cls].symbol}
                    </span>
                    {meta.label} : {meta.rule}
                  </span>
                }
                error={errors[key]}
              >
                <div className="flex items-center gap-2">
                  <Input
                    id={`threshold-${key}`}
                    name={key}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.5}
                    value={values[key]}
                    onChange={set(key)}
                    className="tabular w-24"
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `threshold-${key}-error` : undefined}
                  />
                  <span className="text-sm text-muted-foreground">points</span>
                </div>
              </Field>
            );
          })}
        </div>
        <Button type="button" variant="outline" className="mt-6" onClick={resetThresholds} disabled={thresholdsAreDefault}>
          Rétablir les valeurs par défaut
        </Button>
      </Section>

      <Section
        title="Explications IA"
        description="Claude Haiku 5.5 explique tes erreurs à la demande, à partir des calculs de Stockfish. Chaque explication coûte une fraction de centime."
      >
        <div className="flex items-center gap-3">
          <Switch id="aiEnabled" name="aiEnabled" checked={aiEnabled} onCheckedChange={setAiEnabled} />
          <Label htmlFor="aiEnabled">{aiEnabled ? "Explications activées" : "Explications désactivées"}</Label>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Field
            id="aiDailyCallLimit"
            label="Appels maximum par jour"
            error={errors.aiDailyCallLimit}
            hint="Une explication fait un appel, parfois deux si la première réponse doit être corrigée."
          >
            <Input
              id="aiDailyCallLimit"
              name="aiDailyCallLimit"
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              step={1}
              value={values.aiDailyCallLimit}
              onChange={set("aiDailyCallLimit")}
              className="tabular w-28"
              disabled={!aiEnabled}
              aria-invalid={Boolean(errors.aiDailyCallLimit)}
              aria-describedby="aiDailyCallLimit-hint"
            />
          </Field>
          <Field
            id="aiMonthlyBudgetUsd"
            label="Budget mensuel (en dollars)"
            error={errors.aiMonthlyBudgetUsd}
            hint="Au-delà, les explications sont bloquées jusqu'au mois suivant."
          >
            <div className="flex items-center gap-2">
              <Input
                id="aiMonthlyBudgetUsd"
                name="aiMonthlyBudgetUsd"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.01}
                value={values.aiMonthlyBudgetUsd}
                onChange={set("aiMonthlyBudgetUsd")}
                className="tabular w-28"
                disabled={!aiEnabled}
                aria-invalid={Boolean(errors.aiMonthlyBudgetUsd)}
                aria-describedby="aiMonthlyBudgetUsd-hint"
              />
              <span className="text-sm text-muted-foreground">$</span>
            </div>
          </Field>
        </div>
        {/* Champs désactivés non soumis : on renvoie leurs valeurs pour conserver les limites. */}
        {!aiEnabled ? (
          <>
            <input type="hidden" name="aiDailyCallLimit" value={values.aiDailyCallLimit} />
            <input type="hidden" name="aiMonthlyBudgetUsd" value={values.aiMonthlyBudgetUsd} />
          </>
        ) : null}
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 bg-background/95 py-4 backdrop-blur">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les paramètres"}
        </Button>
        <p role="status" aria-live="polite" className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {state.status === "error" ? state.message : null}
        </p>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 py-8 md:grid-cols-[16rem_1fr] md:gap-10">
      <div className="space-y-1">
        <h2 className="font-semibold text-primary">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Échelle de perte : visualise les plages de chaque classification selon les seuils saisis. */
function LossScale({ values }: { values: FormStrings }) {
  const t = Object.fromEntries(THRESHOLD_KEYS.map((key) => [key, Number(values[key])])) as Record<(typeof THRESHOLD_KEYS)[number], number>;
  const valid =
    THRESHOLD_KEYS.every((key) => Number.isFinite(t[key]) && t[key] >= 0) &&
    t.excellent < t.good &&
    t.good <= t.inaccuracy &&
    t.inaccuracy < t.mistake &&
    t.mistake < t.blunder;
  if (!valid) {
    return <p className="text-sm text-muted-foreground">L&apos;échelle s&apos;affiche quand les seuils sont croissants.</p>;
  }

  const max = Math.max(t.blunder * 1.5, t.blunder + 10);
  const bands: { cls: Classification; from: number; to: number }[] = [
    { cls: "excellent", from: 0, to: t.excellent },
    { cls: "good", from: t.excellent, to: t.good },
    // Entre « bon » et « imprécision » (si les seuils diffèrent) : coup encore jugé bon.
    ...(t.inaccuracy > t.good ? [{ cls: "good" as const, from: t.good, to: t.inaccuracy }] : []),
    { cls: "inaccuracy", from: t.inaccuracy, to: t.mistake },
    { cls: "mistake", from: t.mistake, to: t.blunder },
    { cls: "blunder", from: t.blunder, to: max },
  ];
  const ticks = [0, t.excellent, t.good, t.inaccuracy, t.mistake, t.blunder].filter((v, i, all) => all.indexOf(v) === i);

  return (
    <figure aria-label="Échelle de perte de chances de gain" className="max-w-2xl">
      <div className="flex h-3 overflow-hidden rounded-full">
        {bands.map((band, index) => (
          <div
            key={`${band.cls}-${index}`}
            className="h-full"
            style={{ width: `${((band.to - band.from) / max) * 100}%`, backgroundColor: `var(--cls-${band.cls})` }}
            title={`${CLASSIFICATION_META[band.cls].label} : ${band.from} à ${band.to === max ? "100" : band.to} points`}
          />
        ))}
      </div>
      <div className="relative mt-1 h-5 text-xs text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick} className="tabular absolute -translate-x-1/2" style={{ left: `${(tick / max) * 100}%` }}>
            {tick.toLocaleString("fr-FR")}
          </span>
        ))}
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["excellent", "good", "inaccuracy", "mistake", "blunder"] as const).map((cls) => (
          <span key={cls} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--cls-${cls})` }} />
            {CLASSIFICATION_META[cls].label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
