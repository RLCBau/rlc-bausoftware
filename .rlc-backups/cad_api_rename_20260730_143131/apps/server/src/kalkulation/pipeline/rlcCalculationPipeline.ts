import { resolveRlcKnowledgeHub } from "../knowledgeHub";

export type RlcPipelineInput = {
  row: any;
  baseResult: any;
};

function s(v: any): string {
  return String(v ?? "").trim();
}

function norm(v: any): string {
  return s(v)
    .toLowerCase()
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[ß]/g, "ss");
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(norm(w)));
}

function buildTechnicalBreakdown(row: any, result: any) {
  const text = norm(`${row?.kurztext || ""} ${row?.langtext || ""} ${result?.aiReason || ""}`);
  const unit = norm(row?.einheit);

  const machines: string[] = [];
  const labor: string[] = [];
  const materials: string[] = [];
  const risks: string[] = [];
  const logistics: string[] = [];

  if (includesAny(text, ["aushub", "rohrgraben", "graben", "bodenklasse"])) {
    machines.push("Bagger");
    labor.push("Maschinist", "Tiefbauer");
    risks.push("Bodenklasse prüfen", "Verbau/Wasserhaltung prüfen");
  }

  if (includesAny(text, ["schutzmatte", "kabelschutz", "kabelverlegung"])) {
    materials.push("Schutzmatte/Kabelschutz");
    labor.push("Kolonne Kabelbau");
    risks.push("Trassenabschnitte und Kreuzungen prüfen");
  }

  if (includesAny(text, ["rohr", "hdpe", "pehd", "duktil", "dn ", "da "])) {
    materials.push("Rohrmaterial");
    labor.push("Rohrleger");
    risks.push("DN/DA, Druckstufe und Formstücke prüfen");
  }

  if (includesAny(text, ["pflaster", "asphalt", "forststraße", "forststrasse", "oberfläche", "oberflaeche"])) {
    machines.push("Verdichtungsgerät");
    materials.push("Oberbaumaterial");
    risks.push("Schichtaufbau und Wiederherstellungsstandard prüfen");
  }

  if (includesAny(text, ["entsorgung", "deponie", "haufwerk"])) {
    logistics.push("Transport/Entsorgung");
    risks.push("Deponieklasse und Wiegescheine prüfen");
  }

  if (unit === "psch" || unit === "pauschal") {
    risks.push("Pauschalposition: Dauer, Umfang und Abgrenzung prüfen");
    logistics.push("Baustellenlogistik");
  }

  return {
    machines: Array.from(new Set(machines)),
    labor: Array.from(new Set(labor)),
    materials: Array.from(new Set(materials)),
    logistics: Array.from(new Set(logistics)),
    risks: Array.from(new Set(risks))
  };
}

export function enrichRlcCalculationPipeline(input: RlcPipelineInput): any {
  const { row, baseResult } = input;
  if (!baseResult || typeof baseResult !== "object") return baseResult;

  const knowledgeHub = resolveRlcKnowledgeHub({
    kurztext: row?.kurztext,
    langtext: row?.langtext,
    text: `${row?.kurztext || ""} ${row?.langtext || ""}`,
    unit: row?.einheit,
    family: baseResult?.rlcFamily || baseResult?.family || baseResult?.gewerk || baseResult?.source
  });

  const technicalBreakdown = buildTechnicalBreakdown(row, baseResult);

  console.log("[RLC Pipeline V3]", {
    posNr: row?.posNr,
    externalMatches: knowledgeHub.externalMatches.length,
    externalConfidence: knowledgeHub.externalKnowledgeConfidence,
    machines: technicalBreakdown.machines.length,
    labor: technicalBreakdown.labor.length,
    materials: technicalBreakdown.materials.length,
    risks: technicalBreakdown.risks.length
  });

  return {
    ...baseResult,
    externalKnowledge: knowledgeHub.hasExternalKnowledge ? knowledgeHub.externalMatches : baseResult.externalKnowledge,
    externalKnowledgeConfidence: knowledgeHub.hasExternalKnowledge
      ? knowledgeHub.externalKnowledgeConfidence
      : baseResult.externalKnowledgeConfidence,
    technicalBreakdown,
    explainability: {
      version: "RLC_PIPELINE_V3",
      confidence: baseResult?.confidence ?? null,
      source: baseResult?.source ?? "",
      machines: technicalBreakdown.machines,
      labor: technicalBreakdown.labor,
      materials: technicalBreakdown.materials,
      logistics: technicalBreakdown.logistics,
      risks: technicalBreakdown.risks,
      standards: knowledgeHub.hasExternalKnowledge
        ? knowledgeHub.externalMatches.map((x: any) => x.title || x.sourceName).filter(Boolean)
        : [],
      externalSources: knowledgeHub.hasExternalKnowledge ? knowledgeHub.externalMatches : [],
      assumptions: [
        row?.einheit ? `Einheit: ${row.einheit}` : "",
        row?.menge ? `Menge: ${row.menge}` : "",
        baseResult?.source ? `Quelle: ${baseResult.source}` : ""
      ].filter(Boolean),
      calculationSteps: [
        "Basis-Kalkulation aus bestehender RLC-KI übernommen.",
        "Global Knowledge Hint angewendet, falls vorhanden.",
        "External Knowledge Hub geprüft.",
        "Technical Breakdown für Maschinen, Personal, Material, Logistik und Risiken erzeugt."
      ]
    },
    aiReason: [
      String(baseResult.aiReason || ""),
      ...knowledgeHub.technicalNotes,
      technicalBreakdown.risks.length
        ? `RLC Pipeline V2 technische Prüfung: ${technicalBreakdown.risks.join(" · ")}`
        : ""
    ].filter(Boolean).join("\n\n")
  };
}
