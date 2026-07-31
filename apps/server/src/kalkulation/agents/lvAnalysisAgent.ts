import type {
  KalkulationAgentContext,
  KalkulationAgentReport,
  LvAnalysisOutput,
} from "./types";

function contains(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function runLvAnalysisAgent(
  context: KalkulationAgentContext
): KalkulationAgentReport<LvAnalysisOutput> {
  const normalizedText = [
    context.row.posNr,
    context.row.kurztext,
    context.row.langtext,
    context.row.einheit,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  let trade = context.projectContext.trade || "Allgemein";
  let bauverfahren = "nicht eindeutig erkannt";
  let category = "sonstige Leistung";
  const keywords: string[] = [];

  if (
    contains(normalizedText, [
      "asphalt",
      "fahrbahn",
      "tragschicht",
      "deckschicht",
      "binder",
    ])
  ) {
    trade = "Straßenbau";
    bauverfahren = "Asphalteinbau";
    category = "Asphaltarbeiten";
    keywords.push("Asphalt", "Straßenbau");
  } else if (
    contains(normalizedText, [
      "aushub",
      "boden",
      "graben",
      "erdarbeiten",
      "baugrube",
    ])
  ) {
    trade = "Tiefbau";
    bauverfahren = "Bodenaushub und Bodenbewegung";
    category = "Erdarbeiten";
    keywords.push("Aushub", "Boden");
  } else if (
    contains(normalizedText, [
      "rohr",
      "kanal",
      "leitung",
      "schacht",
      "entwässerung",
    ])
  ) {
    trade = "Tiefbau";
    bauverfahren = "Leitungs- oder Kanalbau";
    category = "Rohrleitungsarbeiten";
    keywords.push("Rohr", "Leitung");
  } else if (
    contains(normalizedText, ["beton", "stahlbeton", "fundament", "schalung"])
  ) {
    trade = "Betonbau";
    bauverfahren = "Beton- und Stahlbetonarbeiten";
    category = "Betonarbeiten";
    keywords.push("Beton");
  } else if (
    contains(normalizedText, ["pflaster", "bordstein", "plattenbelag"])
  ) {
    trade = "Straßenbau";
    bauverfahren = "Pflaster- und Einfassungsarbeiten";
    category = "Pflasterarbeiten";
    keywords.push("Pflaster");
  }

  const longTextLength = String(context.row.langtext || "").length;
  const complexity =
    longTextLength > 900
      ? "high"
      : longTextLength > 300
        ? "medium"
        : context.projectContext.difficulty;

  const confidence =
    keywords.length > 0 ? 0.88 : normalizedText.length > 20 ? 0.66 : 0.42;

  const warnings: string[] = [];
  if (!normalizedText) warnings.push("Position enthält keinen auswertbaren Text.");
  if (keywords.length === 0) {
    warnings.push("Gewerk und Bauverfahren konnten nicht eindeutig erkannt werden.");
  }

  return {
    agent: "lv-analysis",
    confidence,
    warnings,
    findings: [
      {
        code: "LV_CLASSIFICATION",
        severity: keywords.length > 0 ? "info" : "warning",
        message: `${trade} · ${bauverfahren} · ${category}`,
        confidence,
      },
    ],
    output: {
      normalizedText,
      trade,
      bauverfahren,
      category,
      complexity,
      keywords,
    },
  };
}
