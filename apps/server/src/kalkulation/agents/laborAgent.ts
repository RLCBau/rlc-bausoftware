import type {
  KalkulationAgentContext,
  KalkulationAgentReport,
  LvAnalysisOutput,
  ResourceAgentOutput,
} from "./types";

export function runLaborAgent(
  context: KalkulationAgentContext,
  lv: LvAnalysisOutput
): KalkulationAgentReport<ResourceAgentOutput> {
  const text = lv.normalizedText;
  const terms = [
    "herstellen",
    "verlegen",
    "einbauen",
    "montieren",
    "abbrechen",
    "ausbauen",
    "reinigen",
    "verdichten",
    "schalen",
  ];

  const keywords = terms.filter((term) => text.includes(term));
  const relevant = text.length > 0;

  const assumptions = [
    "Mannschaftsstärke und Leistungsansatz sind anhand des Bauverfahrens zu bestimmen.",
    "Mittellohn, Nebenzeiten und Baustellenbedingungen müssen berücksichtigt werden.",
  ];

  return {
    agent: "labor",
    confidence: keywords.length > 0 ? 0.8 : 0.62,
    warnings: relevant ? [] : ["Kein Positionstext für die Lohnanalyse vorhanden."],
    findings: [
      {
        code: "LABOR_ANALYSIS",
        severity: relevant ? "info" : "warning",
        message:
          keywords.length > 0
            ? `Arbeitsvorgänge erkannt: ${keywords.join(", ")}`
            : "Lohnanteil wird als allgemeiner Ausführungsaufwand behandelt.",
        confidence: keywords.length > 0 ? 0.8 : 0.62,
      },
    ],
    output: {
      relevant,
      resourceType: "labor",
      assumptions,
      keywords,
    },
  };
}
