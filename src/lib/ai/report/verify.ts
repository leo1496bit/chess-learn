// Vérification d'un bilan de partie (module pur) : coups cités et demi-coups référencés.
import { verifyMoves } from "../verify";
import type { GameReport } from "./schema";

export type ReportVerification = {
  valid: boolean;
  invalidMoves: string[];
  invalidPlies: number[];
};

export function reportTexts(report: GameReport): string[] {
  return [
    report.summary,
    report.opening.name,
    report.opening.assessment,
    report.opening.theoryGap ?? "",
    report.opening.studyAdvice,
    ...report.tacticalErrors.flatMap((e) => [e.title, e.explanation]),
    ...report.strategicErrors.flatMap((e) => [e.title, e.explanation]),
    ...report.missedOpportunities.map((e) => e.explanation),
    report.endgame ?? "",
    ...report.strengths,
    ...report.trainingPlan.flatMap((t) => [t.title, t.why]),
  ];
}

export function reportPlies(report: GameReport): number[] {
  return [
    ...report.tacticalErrors.map((e) => e.ply),
    ...report.strategicErrors.flatMap((e) => (e.ply === null ? [] : [e.ply])),
    ...report.missedOpportunities.map((e) => e.ply),
    ...report.trainingPlan.flatMap((t) => t.plies),
  ];
}

export function verifyReport(report: GameReport, allowedMoves: Set<string>, allowedPlies: Set<number>): ReportVerification {
  // Seuls les coups réellement écrits dans le texte comptent (pas de liste déclarée à recopier).
  const moves = verifyMoves(reportTexts(report), [], allowedMoves);
  const invalidPlies = [...new Set(reportPlies(report).filter((ply) => !allowedPlies.has(ply)))];
  return { valid: moves.valid && invalidPlies.length === 0, invalidMoves: moves.invalid, invalidPlies };
}
