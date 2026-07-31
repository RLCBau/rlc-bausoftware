import { runKalkulationAgents } from "../agents/orchestrator";
import type { KalkulationAgentsResult } from "../agents/types";
import { calculateAutonomousUrkalkulation } from "./autonomousUrkalkulationEngine";
import { analyzeRlcProjectContext } from "./projectContextAnalyzer";
import type {
  RlcAutonomousCalcInput,
  RlcAutonomousCalcResult,
  RlcAutonomousProjectContext,
} from "./types";

export type RlcAutonomousResolveResult = {
  context: RlcAutonomousProjectContext;
  agents: KalkulationAgentsResult;
  result: RlcAutonomousCalcResult | null;
};

export function resolveRlcAutonomousCalculation(
  row: RlcAutonomousCalcInput,
  allRows: RlcAutonomousCalcInput[] = [],
  projectCode?: string
): RlcAutonomousResolveResult {
  const context = analyzeRlcProjectContext(
    allRows.length > 0 ? allRows : [row],
    projectCode
  );

  const agents = runKalkulationAgents({
    row,
    allRows: allRows.length > 0 ? allRows : [row],
    projectContext: context,
  });

  const engineResult = calculateAutonomousUrkalkulation(row, context);

  const result = engineResult
    ? {
        ...engineResult,
        confidence: Math.min(engineResult.confidence, agents.confidence),
        riskLevel:
          agents.summary.riskLevel === "high"
            ? "high"
            : engineResult.riskLevel,
        calculationStatus: agents.summary.reviewRequired
          ? "needs_review"
          : engineResult.calculationStatus,
        warnings: Array.from(
          new Set([...engineResult.warnings, ...agents.warnings])
        ),
        aiReason:
          `${engineResult.aiReason} ` +
          `Agentenanalyse: ${agents.summary.trade}, ` +
          `${agents.summary.bauverfahren}, Risiko ${agents.summary.riskLevel}.`,
      }
    : null;

  return {
    context,
    agents,
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
    rlcAgentSummary: resolved.agents.summary,
    rlcAgentReports: resolved.agents.reports,
    warning: r.warnings.join(" · "),
    aiReason: r.aiReason,
  };
}
