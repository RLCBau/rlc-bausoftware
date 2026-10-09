import { completeRlcAiText } from "../../services/ai/rlcAiGateway";

export type RlcSourceCoverageStatus =
  | "COVERED"
  | "MISSING"
  | "UNCERTAIN";

export type RlcSourceCoverageItem = {
  requirement: string;
  status: RlcSourceCoverageStatus;
  coveredByRowIndexes: number[];
  reason: string;
};

export type RlcSourceCoverageResult = {
  items: RlcSourceCoverageItem[];
  missing: RlcSourceCoverageItem[];
  uncertain: RlcSourceCoverageItem[];
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

export async function validateSourceCoverage(input: {
  sourceText: string;
  rows: Array<{
    posNr?: string;
    kurztext?: string;
    langtext?: string;
    menge?: number;
    einheit?: string;
  }>;
}): Promise<RlcSourceCoverageResult> {
  const rows = input.rows.map((row, rowIndex) => ({
    rowIndex,
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    menge: Number(row.menge || 0),
    einheit: String(row.einheit || ""),
  }));

  const completion = await completeRlcAiText({
    purpose: "classification",
    responseFormat: "json",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Du prüfst die fachliche Vollständigkeit eines generierten Bau-LV gegenüber der Projektbeschreibung. " +
          "Identifiziere ausschließlich ausdrücklich verlangte Bauleistungen. " +
          "Prüfe semantisch, ob jede dieser Leistungen durch mindestens eine LV-Position abgedeckt ist. " +
          "Geometrie, Material, Abmessungen und Mengen sind Eigenschaften einer Leistung und nicht automatisch eigene Leistungen. " +
          "Erfinde keine zusätzlichen Anforderungen. Antworte ausschließlich mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${input.sourceText}

Generiertes LV:
${JSON.stringify(rows)}

Aufgabe:

1. Extrahiere die ausdrücklich verlangten Bauleistungen aus der Projektbeschreibung.
2. Prüfe jede verlangte Leistung gegen das generierte LV.
3. Synonyme und fachlich gleichbedeutende Formulierungen gelten als abgedeckt.
4. Prüfe hier ausschließlich, ob die eigentliche Bauleistung vorhanden ist.
5. Material, Baustoff, Dicke, Abmessung, Menge, Qualitätsstufe oder Ausführungsdetail sind Spezifikationen der Leistung und entscheiden NICHT darüber, ob die Leistung grundsätzlich COVERED ist.
6. Wenn die Leistung vorhanden ist, aber eine ausdrücklich genannte Spezifikation im LV-Text fehlt, bleibt der Status COVERED. Nenne die fehlende Spezifikation lediglich in reason.
7. MISSING nur verwenden, wenn die eigentliche verlangte Bauleistung fachlich vollständig fehlt.
8. Synonyme und übliche fachliche Kurzbezeichnungen gelten als COVERED.
9. Keine neuen Leistungen ergänzen, die im Ausgangstext nicht verlangt wurden.

Beispiele:
- "Stahlbeton-Bodenplatte herstellen" + LV "Bodenplatte" = COVERED; Stahlbeton kann als fehlende Spezifikation in reason genannt werden.
- "Dach mit Dachziegeln eindecken" + LV "Dachdeckung" = COVERED; Dachziegel kann als fehlende Spezifikation genannt werden.
- "Innenwände mit Gipskarton als Trockenbau herstellen" + LV nur "Innenwände" = COVERED, wenn eindeutig dieselbe Innenwand-Leistung gemeint ist; Gipskarton/Trockenbau als fehlende Spezifikation nennen.
- "Außenwände herstellen" ohne irgendeine Außenwand-/Mauerwerksposition = MISSING.

Status:
COVERED = Leistung ist im LV fachlich vorhanden.
MISSING = ausdrücklich verlangte Leistung fehlt im LV.
UNCERTAIN = Zuordnung ist fachlich nicht sicher.

Beispiel:
"Innenwände mit Gipskarton als Trockenbau herstellen, insgesamt 35 m2"
kann durch eine Position "Innenwände" mit Langtext "Gipskarton/Trockenbau" abgedeckt sein.
Die reine Bezeichnung "Innenwände" ohne entsprechenden fachlichen Inhalt reicht nicht automatisch.

JSON exakt:
{
  "items": [
    {
      "requirement": "kurze fachliche Bezeichnung der ausdrücklich verlangten Leistung",
      "status": "COVERED|MISSING|UNCERTAIN",
      "coveredByRowIndexes": [0],
      "reason": "kurze Begründung"
    }
  ]
}
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: RlcSourceCoverageItem[] = rawItems
    .map((item: any) => {
      const rawStatus = String(item?.status || "UNCERTAIN").toUpperCase();

      const status: RlcSourceCoverageStatus =
        rawStatus === "COVERED" || rawStatus === "MISSING"
          ? rawStatus
          : "UNCERTAIN";

      const coveredByRowIndexes = Array.isArray(item?.coveredByRowIndexes)
        ? item.coveredByRowIndexes
            .map((value: any) => Number(value))
            .filter(
              (value: number) =>
                Number.isInteger(value) &&
                value >= 0 &&
                value < rows.length
            )
        : [];

      return {
        requirement: String(item?.requirement || "").trim(),
        status,
        coveredByRowIndexes,
        reason: String(item?.reason || "").trim(),
      };
    })
    .filter((item: RlcSourceCoverageItem) => item.requirement.length > 0);

  return {
    items,
    missing: items.filter((item) => item.status === "MISSING"),
    uncertain: items.filter((item) => item.status === "UNCERTAIN"),
  };
}
