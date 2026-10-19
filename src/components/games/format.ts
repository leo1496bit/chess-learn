// Libellés et formats de la liste des parties (fonctions pures, testées).

export type PlayerResult = "win" | "loss" | "draw";

export const RESULT_LABELS: Record<PlayerResult, string> = { win: "Gain", loss: "Perte", draw: "Nulle" };

/** Score du joueur façon feuille de notation. */
export const RESULT_SCORE: Record<PlayerResult, string> = { win: "1", loss: "0", draw: "½" };

export const TIME_CLASS_LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapide",
  daily: "Par jour",
};

// Codes Chess.com → fin de partie, du point de vue du résultat (gain/perte/nulle).
const ENDINGS: Record<string, string> = {
  checkmated: "par mat",
  resigned: "par abandon",
  timeout: "au temps",
  abandoned: "par abandon de la partie",
  lose: "",
  agreed: "par accord mutuel",
  repetition: "par répétition",
  stalemate: "par pat",
  insufficient: "par matériel insuffisant",
  "50move": "par la règle des 50 coups",
  timevsinsufficient: "au temps contre matériel insuffisant",
};

export function describeResult(result: PlayerResult, detail: string | null): string {
  const ending = detail ? ENDINGS[detail] : undefined;
  return ending ? `${RESULT_LABELS[result]} ${ending}` : RESULT_LABELS[result];
}

function formatSeconds(seconds: number): string {
  if (seconds >= 86_400 && seconds % 86_400 === 0) return `${seconds / 86_400} j`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** « 900+10 » → « 15 min + 10 s », « 1/86400 » → « 1 j par coup », « - » → null. */
export function formatTimeControl(timeControl: string | null): string | null {
  if (!timeControl || timeControl === "-") return null;
  const daily = /^1\/(\d+)$/.exec(timeControl);
  if (daily) return `${formatSeconds(Number(daily[1]))} par coup`;
  const live = /^(\d+)(?:\+(\d+))?$/.exec(timeControl);
  if (!live) return timeControl;
  const base = formatSeconds(Number(live[1]));
  const increment = live[2] && Number(live[2]) > 0 ? ` + ${live[2]} s` : "";
  return `${base}${increment}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const TIME_FORMAT = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export function formatGameDate(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  return { date: DATE_FORMAT.format(date), time: TIME_FORMAT.format(date) };
}

const RELATIVE = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), "hour");
  return RELATIVE.format(Math.round(seconds / 86_400), "day");
}
