"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chooseUsername, type WelcomeState } from "./actions";

const initialState: WelcomeState = { status: "idle" };

export function WelcomeForm() {
  const [state, action, pending] = useActionState(chooseUsername, initialState);
  const invalid = state.status === "error";

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="chesscomUsername">Identifiant Chess.com</Label>
        <Input
          id="chesscomUsername"
          name="chesscomUsername"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={invalid}
          aria-describedby={invalid ? "chesscomUsername-error" : undefined}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Vérification…" : "Continuer"}
      </Button>
      {state.message ? (
        <p id="chesscomUsername-error" role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
