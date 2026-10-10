/** Compatibility exports: autonomous execution is owned by RLC Motor. */
import type { RlcAutonomousCalcInput } from "./types";
import type { RlcAutonomousResolveResult } from "../rlcMotor";
export { resolveRlcAutonomousCalculation } from "../rlcMotor";
export type { RlcAutonomousResolveResult } from "../rlcMotor";

export function mapAutonomousResultToKiRow(
  row: RlcAutonomousCalcInput,
  resolved: RlcAutonomousResolveResult
): any | null {
  const r = resolved.result;
  if (!r) return null;

  return {
    ...row,
    finalUnitPrice: r.unitPrice,
    suggestedUnitPrice: r.unitPrice,
    baseUnitPrice: r.unitPrice,
    rlcKiUnitPrice: r.unitPrice,
    totalNet: r.total,
    rlcKiTotal: r.total,
    confidence: r.confidence,
    riskLevel: r.riskLevel,
    calculationStatus: r.calculationStatus,
    source: r.source,
    gewerk: r.trade,
    bauverfahren: r.bauverfahren,
    leistungsart: r.leistungsart,
    priceBreakdown: r.costLines,
    rlcAutonomousContext: resolved.context,
    rlcAgentSummary: resolved.agents.summary,
    rlcAgentReports: resolved.agents.reports,
    warning: r.warnings.join(" · "),
    aiReason: r.aiReason,
  };
}
