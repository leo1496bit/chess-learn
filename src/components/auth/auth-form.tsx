"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MAX, PASSWORD_MIN, type AuthFormState } from "@/lib/auth/forms";
import { FormMessage } from "./auth-shell";

type Field = "email" | "password" | "new-password" | "confirm";

const FIELDS: Record<Field, { name: string; label: string; type: string; autoComplete: string; length?: boolean }> = {
  email: { name: "email", label: "Adresse e-mail", type: "email", autoComplete: "email" },
  password: { name: "password", label: "Mot de passe", type: "password", autoComplete: "current-password" },
  "new-password": { name: "password", label: "Mot de passe", type: "password", autoComplete: "new-password", length: true },
  confirm: { name: "confirm", label: "Confirme le mot de passe", type: "password", autoComplete: "new-password", length: true },
};

const initialState: AuthFormState = { status: "idle" };

/** Formulaire d'authentification (connexion, inscription, réinitialisation) branché sur une action serveur. */
export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  hint,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  pendingLabel: string;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {fields.map((field) => {
        const f = FIELDS[field];
        return (
          <div key={field} className="space-y-2">
            <Label htmlFor={f.name}>{f.label}</Label>
            <Input
              id={f.name}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              defaultValue={field === "email" ? state.email : undefined}
              required
              minLength={f.length ? PASSWORD_MIN : undefined}
              maxLength={f.length ? PASSWORD_MAX : undefined}
              aria-invalid={state.status === "error" || undefined}
            />
          </div>
        );
      })}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Button type="submit" className="w-full" disabled={pending || state.status === "sent"}>
        {pending ? pendingLabel : submitLabel}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
