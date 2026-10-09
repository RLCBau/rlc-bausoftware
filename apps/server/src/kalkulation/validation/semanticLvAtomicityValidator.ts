import { completeRlcAiText } from "../../services/ai/rlcAiGateway";

export type RlcAtomicityItem = {
  rowIndex: number;
  status: "ATOMIC" | "SPLIT_REQUIRED" | "UNCERTAIN";
  reason: string;
  services: Array<{
    kurztext: string;
    einheit: string;
    menge: number;
  }>;
};

export type RlcAtomicityResult = {
  items: RlcAtomicityItem[];
  splitRequiredIndexes: number[];
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

export async function validateLvAtomicity(input: {
  sourceText: string;
  rows: Array<{
    kurztext?: string;
    langtext?: string;
    einheit?: string;
    menge?: number;
  }>;
}): Promise<RlcAtomicityResult> {
  if (input.rows.length === 0) {
    return { items: [], splitRequiredIndexes: [] };
  }

  const completion = await completeRlcAiText({
    purpose: "classification",
    responseFormat: "json",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Prüfe LV-Positionen auf fachliche Atomarität. " +
          "Eine Position ist ATOMIC, wenn sie genau eine eigenständig kalkulierbare Leistung darstellt. " +
          "SPLIT_REQUIRED gilt, wenn eine Position mehrere eigenständig kalkulierbare Leistungen enthält, " +
          "insbesondere wenn diese unterschiedliche oder separat zugeordnete Mengen haben. " +
          "Technische Bestandteile derselben Leistung dürfen nicht künstlich getrennt werden. " +
          "Nutze ausschließlich die Projektbeschreibung. Antworte nur mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${input.sourceText}

LV:
${JSON.stringify(input.rows)}

Prüfe jede LV-Position.

Wenn SPLIT_REQUIRED:
- services enthält genau die eigenständigen Leistungen.
- Explizite Mengen aus dem Projekttext der richtigen Leistung zuordnen.
- Mengen niemals zwischen Leistungen übertragen.
- Wenn keine Menge sicher zugeordnet ist: menge = 0.
- Keine zusätzliche Leistung erfinden.

Beispiel:
Projekttext: "8 Steckdosen und 4 Leuchten herstellen"
LV: "Elektroinstallation mit 8 Steckdosen und 4 Leuchten"
=> SPLIT_REQUIRED:
  Steckdosen, 8 St
  Leuchten, 4 St

JSON exakt:
{
  "items": [
    {
      "rowIndex": 0,
      "status": "ATOMIC|SPLIT_REQUIRED|UNCERTAIN",
      "reason": "Begründung",
      "services": [
        {
          "kurztext": "Leistung",
          "einheit": "St",
          "menge": 0
        }
      ]
    }
  ]
}
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: RlcAtomicityItem[] = rawItems
    .map((item: any) => {
      const rowIndex = Number(item?.rowIndex);

      const status: RlcAtomicityItem["status"] =
        item?.status === "SPLIT_REQUIRED"
          ? "SPLIT_REQUIRED"
          : item?.status === "ATOMIC"
            ? "ATOMIC"
            : "UNCERTAIN";

      const services = Array.isArray(item?.services)
        ? item.services
            .map((service: any) => ({
              kurztext: String(service?.kurztext || "").trim(),
              einheit: String(service?.einheit || "EH").trim(),
              menge:
                Number.isFinite(Number(service?.menge)) &&
                Number(service.menge) > 0
                  ? Number(service.menge)
                  : 0,
            }))
            .filter((service: any) => service.kurztext.length > 0)
        : [];

      return {
        rowIndex,
        status,
        reason: String(item?.reason || "").trim(),
        services,
      };
    })
    .filter(
      (item: RlcAtomicityItem) =>
        Number.isInteger(item.rowIndex) &&
        item.rowIndex >= 0 &&
        item.rowIndex < input.rows.length
    );

  return {
    items,
    splitRequiredIndexes: items
      .filter(
        (item) =>
          item.status === "SPLIT_REQUIRED" &&
          item.services.length > 1
      )
      .map((item) => item.rowIndex),
  };
}
