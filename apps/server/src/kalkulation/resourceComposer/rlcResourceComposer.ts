import { completeRlcAiText } from "../../services/ai/rlcAiGateway";
import { detectPrimaryRlcConstructionFamily } from "../domain/constructionFamilyRegistry";

export type RlcComposedResource = {
  refKey: string;
  type: "LABOR" | "MATERIAL" | "MACHINE" | "TRANSPORT" | "DISPOSAL" | "SUBCONTRACTOR";
  qtyFormula: string;
  mandatory: boolean;
  note?: string;
};

export type RlcComposedRecipe = {
  source: "AI_RESOURCE_COMPOSER";
  family: string;
  title: string;
  unit: string;
  confidence: number;
  components: RlcComposedResource[];
};

const ALLOWED_TYPES = new Set([
  "LABOR",
  "MATERIAL",
  "MACHINE",
  "TRANSPORT",
  "DISPOSAL",
  "SUBCONTRACTOR",
]);

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function safeRefKey(v: unknown): string {
  return s(v)
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .replace(/[^A-Z0-9:_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function composeRlcResources(input: {
  kurztext: string;
  langtext?: string;
  einheit: string;
}): Promise<RlcComposedRecipe | null> {
  const text = [input.kurztext, input.langtext].filter(Boolean).join("\n");
  const detected = detectPrimaryRlcConstructionFamily(text);
  const family = s((detected as any)?.id || detected || "ALLGEMEIN");

  try {
    const ai = await completeRlcAiText({
      purpose: "kalkulation",
      temperature: 0,
      responseFormat: "json",
      maxTokens: 1400,
      messages: [
        {
          role: "system",
          content: `Du bist der Resource Composer der RLC-Kalkulation.

Deine einzige Aufgabe ist, eine Bauleistung in notwendige Ressourcen einer Urkalkulation zu zerlegen.

Du darfst KEINE Preise, Einheitspreise, Marktpreise oder Geldbeträge erzeugen.

Erlaubte Ressourcentypen:
LABOR, MATERIAL, MACHINE, TRANSPORT, DISPOSAL, SUBCONTRACTOR.

Regeln:
- Nur Ressourcen, die fachlich für die konkrete Leistung erforderlich sind.
- Keine benachbarten LV-Leistungen hinzufügen.
- Keine Marken oder Lieferanten erfinden.
- refKey muss stabil und allgemein wiederverwendbar sein.
- LABOR refKey beginnt mit LABOR:
- MATERIAL refKey beginnt mit MATERIAL:
- MACHINE refKey beginnt mit MACHINE:
- TRANSPORT refKey beginnt mit TRANSPORT:
- DISPOSAL refKey beginnt mit DISPOSAL:
- SUBCONTRACTOR refKey beginnt mit SUBCONTRACTOR:
- Mengen beziehen sich immer auf EINE Einheit der LV-Position.
- Verwende für typische Bauleistungen realistische Standardansätze pro Einheit.
- Für LABOR, MACHINE und TRANSPORT niemals automatisch 0 verwenden, wenn ein üblicher Bauansatz bekannt ist.
- Verwende params.menge nur für mengenabhängige Berechnungen.
- Beispiele:
  - Erdarbeiten: Personal und Verdichtung als Stundenansatz pro m3.
  - Frostschutzschicht: Material ca. 1 m3/m3, Verdichtung und Einbau mit Standardkoeffizienten.
  - Kanalbau: Verlegeleistung mit Personal und Gerät berücksichtigen.
- Nur wenn fachlich wirklich keine Aussage möglich ist, darf qtyFormula "0" verwendet werden.
- Keine erfundenen technischen Maße.
- Pflichtressourcen mandatory=true.
- Antworte ausschließlich als JSON.

Schema:
{
  "title": "string",
  "confidence": 0.0,
  "components": [
    {
      "refKey": "TYPE:RESOURCE",
      "type": "LABOR|MATERIAL|MACHINE|TRANSPORT|DISPOSAL|SUBCONTRACTOR",
      "qtyFormula": "number or simple params expression",
      "mandatory": true,
      "note": "short reason"
    }
  ]
}`,
        },
        {
          role: "user",
          content: `Baufamilie: ${family}
LV-Einheit: ${input.einheit}
Kurztext: ${input.kurztext}
Langtext: ${input.langtext || ""}`,
        },
      ],
    });

    const parsed = JSON.parse(ai.text || "{}");
    const rawComponents = Array.isArray(parsed.components)
      ? parsed.components
      : [];

    const components: RlcComposedResource[] = [];

    for (const raw of rawComponents) {
      const type = s(raw?.type).toUpperCase();

      if (!ALLOWED_TYPES.has(type)) continue;

      const refKey = safeRefKey(raw?.refKey);
      if (!refKey.startsWith(`${type}:`)) continue;

      const qtyFormula = s(raw?.qtyFormula);
      if (!qtyFormula) continue;

      /*
       * Keine freie JavaScript-Injektion aus KI-Ausgabe.
       * Nur Zahlen und einfache params-Ausdrücke zulassen.
       */
      if (
        !/^[0-9a-zA-Z_.*+\-/()\s]+$/.test(qtyFormula) ||
        (!/^\d+(?:\.\d+)?$/.test(qtyFormula) &&
          !qtyFormula.includes("params."))
      ) {
        continue;
      }

      components.push({
        refKey,
        type: type as RlcComposedResource["type"],
        qtyFormula,
        mandatory: raw?.mandatory !== false,
        note: s(raw?.note) || "RLC Resource Composer",
      });
    }

    if (!components.length) return null;

    return {
      source: "AI_RESOURCE_COMPOSER",
      family,
      title: s(parsed.title) || input.kurztext,
      unit: input.einheit,
      confidence: Math.max(
        0,
        Math.min(1, Number(parsed.confidence) || 0)
      ),
      components,
    };
  } catch (error) {
    console.error("[RLC_RESOURCE_COMPOSER]", error);
    return null;
  }
}
