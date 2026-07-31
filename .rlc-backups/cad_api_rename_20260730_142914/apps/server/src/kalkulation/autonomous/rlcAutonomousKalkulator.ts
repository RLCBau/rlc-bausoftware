import { analyzeRlcProjectContext } from "./projectContextAnalyzer";
import { calculateAutonomousUrkalkulation } from "./autonomousUrkalkulationEngine";
import type {
  RlcAutonomousCalcInput,
  RlcAutonomousCalcResult,
  RlcAutonomousProjectContext,
} from "./types";

export type RlcAutonomousResolveResult = {
  context: RlcAutonomousProjectContext;
  result: RlcAutonomousCalcResult | null;
};

export function resolveRlcAutonomousCalculation(
  row: RlcAutonomousCalcInput,
  allRows: RlcAutonomousCalcInput[] = [],
  projectCode?: string
): RlcAutonomousResolveResult {
  const context = analyzeRlcProjectContext(allRows.length > 0 ? allRows : [row], projectCode);
  const result = calculateAutonomousUrkalkulation(row, context);

  return {
    context,
    result,
  };
}

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
    warning: r.warnings.join(" · "),
    aiReason: r.aiReason,
  };
}
