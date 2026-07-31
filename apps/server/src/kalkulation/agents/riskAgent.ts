import type {
  KalkulationAgentContext,
  KalkulationAgentReport,
  LvAnalysisOutput,
  RiskAgentOutput,
} from "./types";

function riskValue(level: "low" | "medium" | "high"): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

export function runRiskAgent(
  context: KalkulationAgentContext,
  lv: LvAnalysisOutput
): KalkulationAgentReport<RiskAgentOutput> {
  const reasons: string[] = [];

  const values = [
    riskValue(context.projectContext.difficulty),
    riskValue(context.projectContext.logisticsRisk),
    riskValue(context.projectContext.trafficRisk),
    riskValue(context.projectContext.durationRisk),
    riskValue(lv.complexity),
  ];

  if (context.projectContext.logisticsRisk !== "low") {
    reasons.push(`Logistikrisiko: ${context.projectContext.logisticsRisk}`);
  }
  if (context.projectContext.trafficRisk !== "low") {
    reasons.push(`Verkehrsrisiko: ${context.projectContext.trafficRisk}`);
  }
  if (context.projectContext.durationRisk !== "low") {
    reasons.push(`Terminrisiko: ${context.projectContext.durationRisk}`);
  }
  if (lv.complexity !== "low") {
    reasons.push(`Positionskomplexität: ${lv.complexity}`);
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const riskLevel = average >= 2.4 ? "high" : average >= 1.6 ? "medium" : "low";
  const riskScore = Math.round((average / 3) * 100);

  return {
    agent: "risk",
    confidence: 0.86,
    warnings: riskLevel === "high" ? ["Hohe Risikoprüfung erforderlich."] : [],
    findings: [
      {
        code: "COMBINED_RISK",
        severity:
          riskLevel === "high"
            ? "critical"
            : riskLevel === "medium"
              ? "warning"
              : "info",
        message: `Gesamtrisiko ${riskLevel} (${riskScore}/100)`,
        confidence: 0.86,
        data: { reasons },
      },
    ],
    output: {
      riskLevel,
      riskScore,
      reasons,
    },
  };
}
