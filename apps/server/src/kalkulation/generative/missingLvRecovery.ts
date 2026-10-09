import { completeRlcAiText } from "../../services/ai/rlcAiGateway";

export type RlcRecoveredLvRow = {
  posNr?: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  menge: number;
  projectCode?: string;
};

function extractJson(value: string): any {
  const text = String(value || "").trim();

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

export async function recoverMissingLvRows(input: {
  sourceText: string;
  missingRequirements: string[];
  existingRows: Array<{
    posNr?: string;
    kurztext?: string;
    langtext?: string;
    einheit?: string;
    menge?: number;
  }>;
}): Promise<RlcRecoveredLvRow[]> {
  const missingRequirements = input.missingRequirements
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  if (missingRequirements.length === 0) {
    return [];
  }

  const completion = await completeRlcAiText({
    purpose: "kalkulation",
    responseFormat: "json",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Du ergänzt ausschließlich fehlende Positionen eines Bau-LV. " +
          "Erzeuge keine bereits vorhandenen Leistungen erneut. " +
          "Erzeuge keine Leistungen außerhalb der ausdrücklich als fehlend angegebenen Anforderungen. " +
          "Übernimm technische Angaben nur aus der Projektbeschreibung. " +
          "Mengen niemals schätzen oder von anderen Leistungen übertragen. " +
          "Wenn eine Menge nicht ausdrücklich dieser Leistung zugeordnet ist, setze menge auf 0. " +
          "Antworte ausschließlich mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${input.sourceText}

Bereits vorhandenes LV:
${JSON.stringify(input.existingRows)}

Ausschließlich diese Leistungen fehlen:
${JSON.stringify(missingRequirements)}

Erzeuge genau die fehlenden LV-Positionen.

Regeln:
- Keine vorhandene Position duplizieren.
- Keine zusätzliche Leistung erfinden.
- Kurztext und Langtext sollen die im Ausgangstext vorhandenen technischen Spezifikationen enthalten.
- Menge nur übernehmen, wenn sie eindeutig genau dieser fehlenden Leistung zugeordnet ist.
- Geometrische Mengen nicht selbst berechnen; dafür existiert der RLC Quantity/Geometry Engine.
- Wenn keine sichere Menge vorliegt: menge = 0.
- Einheit fachlich passend wählen.

JSON exakt:
{
  "rows": [
    {
      "kurztext": "Leistung",
      "langtext": "technische Beschreibung",
      "einheit": "m2",
      "menge": 0,
      "projectCode": "fachliche Familie"
    }
  ]
}
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

  return rows
    .map((row: any): RlcRecoveredLvRow => ({
      kurztext: String(row?.kurztext || "").trim(),
      langtext: String(row?.langtext || "").trim(),
      einheit: String(row?.einheit || "EH").trim(),
      menge:
        Number.isFinite(Number(row?.menge)) && Number(row.menge) > 0
          ? Number(row.menge)
          : 0,
      projectCode: row?.projectCode
        ? String(row.projectCode).trim()
        : undefined,
    }))
    .filter((row: RlcRecoveredLvRow) => row.kurztext.length > 0);
}
