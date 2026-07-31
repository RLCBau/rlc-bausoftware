import type {
  KalkulationAgentContext,
  KalkulationAgentReport,
  LvAnalysisOutput,
  ResourceAgentOutput,
} from "./types";

export function runMaterialAgent(
  context: KalkulationAgentContext,
  lv: LvAnalysisOutput
): KalkulationAgentReport<ResourceAgentOutput> {
  const text = lv.normalizedText;
  const terms = [
    "asphalt",
    "beton",
    "rohr",
    "pflaster",
    "kies",
    "schotter",
    "sand",
    "stahl",
    "bordstein",
    "material",
  ];
  const keywords = terms.filter((term) => text.includes(term));
  const relevant = keywords.length > 0;

  const assumptions = relevant
    ? [
        "Materialbedarf muss aus Menge, Einheit und Bauverfahren abgeleitet werden.",
        "Verschnitt, Verdichtung und Lieferzuschläge sind projektspezifisch zu prüfen.",
      ]
    : ["Kein eindeutiger Materialbezug aus dem Positionstext erkannt."];

  return {
    agent: "material",
    confidence: relevant ? 0.82 : 0.48,
    warnings: relevant ? [] : assumptions,
    findings: [
      {
        code: "MATERIAL_RELEVANCE",
        severity: relevant ? "info" : "warning",
        message: relevant
          ? `Materialbezug erkannt: ${keywords.join(", ")}`
          : "Materialbezug nicht eindeutig erkannt.",
        confidence: relevant ? 0.82 : 0.48,
      },
    ],
    output: {
      relevant,
      resourceType: "material",
      assumptions,
      keywords,
    },
  };
}
