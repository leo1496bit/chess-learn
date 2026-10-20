"use client";

import type { ReactNode } from "react";
import { moveLinkKey, resolveMoveLink, type MoveLink, type MoveLinkIndex, type ResolveOptions } from "@/lib/ai/move-links";
import { segmentSan } from "@/lib/ai/verify";
import { cn } from "@/lib/utils";

export type MovePreviewProps = {
  /** Affiche un coup cité sur l'échiquier (position avant le coup + flèche). */
  onPreviewMove?: (link: MoveLink) => void;
  /** Coup actuellement affiché en aperçu (voir moveLinkKey). */
  previewKey?: string | null;
};

/** Texte de l'IA dont les coups cités, retrouvés dans les variantes, deviennent des boutons. */
export function LinkedText({
  text,
  index,
  options,
  onPreviewMove,
  previewKey,
}: { text: string; index: MoveLinkIndex; options: ResolveOptions } & MovePreviewProps): ReactNode {
  if (!onPreviewMove) return text;
  const segments = segmentSan(text);
  return segments.map((segment, i) => {
    const link = segment.san ? resolveMoveLink(index, segment.san, segments[i - 1]?.text ?? "", options) : undefined;
    if (!link) return segment.text;
    const active = previewKey === moveLinkKey(link);
    return (
      <button
        key={i}
        type="button"
        onClick={() => onPreviewMove(link)}
        aria-pressed={active}
        title="Voir ce coup sur l'échiquier"
        className={cn(
          "tabular rounded px-0.5 font-semibold text-primary underline decoration-dotted decoration-primary/50 underline-offset-4 hover:bg-accent",
          active && "bg-primary text-primary-foreground no-underline hover:bg-primary",
        )}
      >
        {segment.text}
      </button>
    );
  });
}
