import { completeRlcAiText } from "../../services/ai/rlcAiGateway";
import type { RlcConstructionFamilyId } from "../domain/constructionFamilyRegistry";

export type RlcSemanticLvStatus =
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "UNCERTAIN";

export type RlcSemanticLvValidationItem = {
  rowIndex: number;
  posNr?: string;
  kurztext: string;
  status: RlcSemanticLvStatus;
  reason: string;
};

export type RlcSemanticLvValidationResult = {
  items: RlcSemanticLvValidationItem[];
  unsupportedIndexes: number[];
  uncertainIndexes: number[];
};

function extractJson(raw: string): any {
  const text = String(raw || "").trim();

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

export async function validateGeneratedLvSemantically(input: {
  sourceText: string;
  families: RlcConstructionFamilyId[];
  rows: Array<{
    posNr?: string;
    kurztext?: string;
    langtext?: string;
  }>;
}): Promise<RlcSemanticLvValidationResult> {
  if (!input.rows.length) {
    return {
      items: [],
      unsupportedIndexes: [],
      uncertainIndexes: [],
    };
  }

  const rowsForValidation = input.rows.map((row, rowIndex) => ({
    rowIndex,
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
  }));

  const completion = await completeRlcAiText({
    purpose: "classification",
    responseFormat: "json",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Du prüfst ausschließlich, ob generierte LV-Leistungen durch die Projektbeschreibung fachlich gestützt sind. " +
          "Bewerte semantisch, nicht nur nach identischen Wörtern. " +
          "Synonyme und fachlich gleichbedeutende Formulierungen gelten als gestützt. " +
          "Eine neue eigenständige Leistung darf nicht allein deshalb als gestützt gelten, weil sie bei solchen Bauarbeiten üblich wäre. " +
          "Erfinde keine Anforderungen. Antworte ausschließlich mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${input.sourceText}

Erkannte Baufamilien:
${input.families.join(", ") || "ALLGEMEIN"}

Generierte Positionen:
${JSON.stringify(rowsForValidation)}

Gib exakt zurück:

{
  "items": [
    {
      "rowIndex": 0,
      "status": "SUPPORTED|UNSUPPORTED|UNCERTAIN",
      "reason": "kurze Begründung"
    }
  ]
}

Regeln:
- SUPPORTED: Die Leistung ist ausdrücklich genannt oder semantisch eindeutig aus einer genannten Leistung ableitbar.
- UNSUPPORTED: Es wurde eine zusätzliche eigenständige Leistung erfunden.
- UNCERTAIN: Die Projektbeschreibung reicht für eine sichere Entscheidung nicht aus.
- Eine bloß übliche Bauleistung ist NICHT automatisch SUPPORTED.
- Bewerte jede übergebene Position genau einmal.
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: RlcSemanticLvValidationItem[] = rowsForValidation.map(
    (row) => {
      const found = rawItems.find(
        (x: any) => Number(x?.rowIndex) === row.rowIndex
      );

      const rawStatus = String(found?.status || "UNCERTAIN").toUpperCase();

      const status: RlcSemanticLvStatus =
        rawStatus === "SUPPORTED" || rawStatus === "UNSUPPORTED"
          ? rawStatus
          : "UNCERTAIN";

      return {
        rowIndex: row.rowIndex,
        posNr: row.posNr || undefined,
        kurztext: row.kurztext,
        status,
        reason:
          String(found?.reason || "").trim() ||
          "Keine eindeutige semantische Bewertung verfügbar.",
      };
    }
  );

  return {
    items,
    unsupportedIndexes: items
      .filter((x) => x.status === "UNSUPPORTED")
      .map((x) => x.rowIndex),
    uncertainIndexes: items
      .filter((x) => x.status === "UNCERTAIN")
      .map((x) => x.rowIndex),
  };
}
