import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/ai/pricing";
import type { UsageSummary } from "@/lib/ai/limits";

export type RecentCall = {
  id: number;
  created_at: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  error: string | null;
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ok: { label: "Réussi", className: "text-cls-best" },
  unverified: { label: "Non vérifié", className: "text-cls-inaccuracy" },
  refused: { label: "Refusé", className: "text-cls-mistake" },
  error: { label: "Erreur", className: "text-cls-blunder" },
};

const integer = (value: number) => value.toLocaleString("fr-FR");
const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function AiUsage({
  summary,
  recent,
  dailyLimit,
  monthlyBudget,
}: {
  summary: UsageSummary;
  recent: RecentCall[];
  dailyLimit: number;
  monthlyBudget: number;
}) {
  const budgetRatio = monthlyBudget > 0 ? Math.min(summary.costMonth / monthlyBudget, 1) : 1;
  const budgetPercent = Math.round(budgetRatio * 100);

  return (
    <section aria-labelledby="ai-usage-title" className="grid gap-4 py-8 md:grid-cols-[16rem_1fr] md:gap-10">
      <div className="space-y-1">
        <h2 id="ai-usage-title" className="font-semibold text-primary">
          Consommation IA
        </h2>
        <p className="text-sm text-muted-foreground">
          Coûts estimés à partir des tokens facturés (tarif Haiku 5.5). Le jour et le mois suivent l&apos;heure de Paris.
        </p>
      </div>

      <div className="min-w-0 space-y-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Stat label="Appels aujourd'hui" value={`${integer(summary.callsToday)} / ${integer(dailyLimit)}`} />
          <Stat label="Appels ce mois-ci" value={integer(summary.callsMonth)} />
          <Stat label="Tokens envoyés ce mois-ci" value={integer(summary.inputTokensMonth + summary.cacheReadTokensMonth)} detail={`dont ${integer(summary.cacheReadTokensMonth)} lus en cache`} />
          <Stat label="Tokens reçus ce mois-ci" value={integer(summary.outputTokensMonth)} />
        </dl>

        <div className="max-w-xl space-y-2">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-medium">Coût estimé du mois</span>
            <span className="tabular">
              <span className="font-semibold">{formatUsd(summary.costMonth)}</span>
              <span className="text-muted-foreground"> sur {formatUsd(monthlyBudget)}</span>
            </span>
          </div>
          <Progress
            value={budgetPercent}
            aria-label={`Budget mensuel utilisé à ${budgetPercent} %`}
            className={cn("h-2", budgetRatio >= 1 ? "[&>div]:bg-cls-blunder" : budgetRatio >= 0.8 ? "[&>div]:bg-cls-inaccuracy" : undefined)}
          />
          {budgetRatio >= 1 ? (
            <p className="text-sm text-cls-blunder">Budget atteint : les explications sont bloquées jusqu&apos;au mois prochain, sauf si tu augmentes le budget.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">20 derniers appels</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun appel pour l&apos;instant. Ouvre une partie analysée et clique sur « Expliquer ce coup » sur une erreur.
            </p>
          ) : (
            <Table className="tabular">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Entrée</TableHead>
                  <TableHead className="text-right">Cache</TableHead>
                  <TableHead className="text-right">Sortie</TableHead>
                  <TableHead className="text-right">Coût</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((call) => {
                  const status = STATUS_LABELS[call.status] ?? { label: call.status, className: "" };
                  return (
                    <TableRow key={call.id}>
                      <TableCell className="whitespace-nowrap">{dateTime.format(new Date(call.created_at))}</TableCell>
                      <TableCell>
                        <span className={cn("font-medium", status.className)} title={call.error ?? undefined}>
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{integer(call.input_tokens + call.cache_write_tokens)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{integer(call.cache_read_tokens)}</TableCell>
                      <TableCell className="text-right">{integer(call.output_tokens)}</TableCell>
                      <TableCell className="text-right">{formatUsd(Number(call.cost_usd))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-semibold text-primary">{value}</dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}
