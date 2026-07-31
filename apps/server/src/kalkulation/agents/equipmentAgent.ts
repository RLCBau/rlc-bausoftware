import type {
  KalkulationAgentContext,
  KalkulationAgentReport,
  LvAnalysisOutput,
  ResourceAgentOutput,
} from "./types";

export function runEquipmentAgent(
  context: KalkulationAgentContext,
  lv: LvAnalysisOutput
): KalkulationAgentReport<ResourceAgentOutput> {
  const text = lv.normalizedText;
  const terms = [
    "bagger",
    "radlader",
    "walze",
    "kran",
    "fräse",
    "fertiger",
    "verdichter",
    "lkw",
    "maschine",
    "gerät",
  ];

  const inferredTerms =
    lv.category === "Erdarbeiten"
      ? ["bagger", "lkw"]
      : lv.category === "Asphaltarbeiten"
        ? ["fertiger", "walze"]
        : [];

  const keywords = Array.from(
    new Set([
      ...terms.filter((term) => text.includes(term)),
      ...inferredTerms,
    ])
  );

  const relevant = keywords.length > 0;

  const assumptions = relevant
    ? [
        "Geräteleistung, Vorhaltezeit, Bedienpersonal und Kraftstoff sind zu kalkulieren.",
        "Transport und Umsetzen der Geräte sind gesondert zu prüfen.",
      ]
    : ["Kein eindeutiger Geräteeinsatz erkannt."];

  return {
    agent: "equipment",
    confidence: relevant ? 0.81 : 0.5,
    warnings: relevant ? [] : assumptions,
    findings: [
      {
        code: "EQUIPMENT_RELEVANCE",
        severity: relevant ? "info" : "warning",
        message: relevant
          ? `Mögliche Geräte: ${keywords.join(", ")}`
          : "Geräteeinsatz nicht eindeutig erkannt.",
        confidence: relevant ? 0.81 : 0.5,
      },
    ],
    output: {
      relevant,
      resourceType: "equipment",
      assumptions,
      keywords,
    },
  };
}
