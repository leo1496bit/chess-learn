import { cn } from "@/lib/utils";

/** Remplace un chiffre quand l'échantillon est trop petit pour conclure (skill §10). */
export function InsufficientData({
  sample,
  required,
  unit = "parties analysées",
  className,
}: {
  sample: number;
  required: number;
  unit?: string;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      <span className="font-semibold text-foreground">Données insuffisantes</span> : {sample.toLocaleString("fr-FR")} {unit} sur{" "}
      {required.toLocaleString("fr-FR")} nécessaires.
    </p>
  );
}
