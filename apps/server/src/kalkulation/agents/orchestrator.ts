import { runEquipmentAgent } from "./equipmentAgent";
import { runLaborAgent } from "./laborAgent";
import { runLvAnalysisAgent } from "./lvAnalysisAgent";
import { runMaterialAgent } from "./materialAgent";
import { runRiskAgent } from "./riskAgent";
import { runValidationAgent } from "./validationAgent";
import type {
  KalkulationAgentContext,
  KalkulationAgentsResult,
} from "./types";

export function runKalkulationAgents(
  context: KalkulationAgentContext
): KalkulationAgentsResult {
  const lv = runLvAnalysisAgent(context);
  const material = runMaterialAgent(context, lv.output);
  const labor = runLaborAgent(context, lv.output);
  const equipment = runEquipmentAgent(context, lv.output);
  const risk = runRiskAgent(context, lv.output);
  const validation = runValidationAgent(context, lv.output);

  const reports = [lv, material, labor, equipment, risk, validation];

  const confidence =
    Math.round(
      (reports.reduce((sum, report) => sum + report.confidence, 0) /
        reports.length) *
        100
    ) / 100;

  const warnings = Array.from(
    new Set(reports.flatMap((report) => report.warnings).filter(Boolean))
  );

  return {
    reports,
    confidence,
    warnings,
    summary: {
      trade: lv.output.trade,
      bauverfahren: lv.output.bauverfahren,
      category: lv.output.category,
      complexity: lv.output.complexity,
      riskLevel: risk.output.riskLevel,
      reviewRequired: validation.output.reviewRequired,
    },
  };
}
