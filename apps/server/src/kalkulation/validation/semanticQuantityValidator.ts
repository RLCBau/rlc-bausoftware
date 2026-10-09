import { completeRlcAiText } from "../../services/ai/rlcAiGateway";
import { extractExplicitRectangularGeometry } from "../quantity/quantityGeometryEngine";

export type RlcQuantitySemanticStatus =
  | "EXPLICIT"
  | "DERIVABLE"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type RlcQuantityValidationItem = {
  rowIndex: number;
  posNr?: string;
  kurztext: string;
  quantity: number;
  unit: string;
  status: RlcQuantitySemanticStatus;
  reason: string;
  explicitQuantity?: number;
  explicitUnit?: string;
  geometry?: {
    operation:
      | "RECTANGLE_AREA"
      | "RECTANGULAR_VOLUME"
      | "RECTANGLE_PERIMETER"
      | "RECTANGULAR_WALL_AREA";
    lengthM?: number;
    widthM?: number;
    heightM?: number;
  };
};

export type RlcQuantityValidationResult = {
  items: RlcQuantityValidationItem[];
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

export async function validateGeneratedLvQuantities(input: {
  sourceText: string;
  rows: Array<{
    posNr?: string;
    kurztext?: string;
    langtext?: string;
    menge?: number;
    einheit?: string;
  }>;
}): Promise<RlcQuantityValidationResult> {
  const rows = input.rows.map((row, rowIndex) => ({
    rowIndex,
    posNr: row.posNr,
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    quantity: Number(row.menge || 0),
    unit: String(row.einheit || ""),
  }));

  /*
   * Geometrische Maße werden deterministisch aus dem Quelltext extrahiert.
   * Das Sprachmodell darf diese Werte nicht selbst erfinden oder verändern;
   * es entscheidet ausschließlich über die fachliche Zuordnung zur Position.
   */
  const explicitGeometries =
    extractExplicitRectangularGeometry(input.sourceText);

  const completion = await completeRlcAiText({
    purpose: "classification",
    responseFormat: "json",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Du prüfst ausschließlich die Herkunft von Mengen in einem generierten Bau-LV. " +
          "Bewerte semantisch, ob die jeweilige Menge der konkreten Leistung im Projekttext zugeordnet ist. " +
          "Übertrage niemals eine Mengenangabe von einer anderen Leistung. " +
          "Antworte ausschließlich mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${input.sourceText}

Generierte Positionen:
${JSON.stringify(rows)}

Deterministisch aus dem Projekttext extrahierte Geometrien:
${JSON.stringify(explicitGeometries)}

Bewerte jede Position exakt einmal.

Status:
EXPLICIT = Menge und Einheit sind im Projekttext dieser konkreten Leistung eindeutig zugeordnet.
DERIVABLE = Menge steht nicht direkt da, kann aber aus ausdrücklich genannten geometrischen Abmessungen für genau diese Leistung berechnet werden.
UNSUPPORTED = die ausgegebene positive Menge stammt weder aus einer expliziten Zuordnung noch aus einer eindeutigen Geometrie dieser Leistung; insbesondere wurde wahrscheinlich eine Menge einer anderen Leistung übernommen.
UNKNOWN = die Herkunft kann nicht sicher beurteilt werden.

Wichtig:
- Eine Menge wie "Trockenbau insgesamt 35 m2" gilt nur für Trockenbau.
- Gebäudeabmessungen dürfen nur DERIVABLE ergeben, wenn sie geometrisch eindeutig zur betreffenden Leistung gehören.
- Eine Position mit Menge 0 niemals als UNSUPPORTED bewerten; verwende DERIVABLE oder UNKNOWN.
- Berechne hier selbst keine neue Menge.
- Verwende für DERIVABLE ausschließlich eine Geometrie aus der Liste
  "Deterministisch aus dem Projekttext extrahierte Geometrien".
- Erfinde, ergänze oder verändere keine Geometriemaße.
- Wenn keine dieser Geometrien fachlich eindeutig zur Position gehört, verwende UNKNOWN.

JSON exakt:
{
  "items": [
    {
      "rowIndex": 0,
      "status": "EXPLICIT|DERIVABLE|UNSUPPORTED|UNKNOWN",
      "reason": "kurze Begründung",
      "explicitQuantity": 0,
      "explicitUnit": "m2",
      "geometry": {
        "operation": "RECTANGLE_AREA|RECTANGULAR_VOLUME|RECTANGLE_PERIMETER|RECTANGULAR_WALL_AREA",
        "lengthM": 0,
        "widthM": 0,
        "heightM": 0
      }
    }
  ]
}

Bei EXPLICIT zusätzlich explicitQuantity und explicitUnit ausgeben.
Diese Werte müssen der konkreten Leistung im Projekttext ausdrücklich zugeordnet sein.
Niemals eine Menge einer anderen Leistung übernehmen.
geometry nur bei DERIVABLE ausgeben.
Die geometry-Werte müssen ausdrücklich aus der Projektbeschreibung stammen.
Keine fehlenden Maße ergänzen, schätzen oder aus anderen Leistungen übernehmen.
Beispiel: Garage 8 x 6 m + Bodenplatte -> RECTANGLE_AREA mit lengthM=8, widthM=6.
Eine Wandfläche benötigt zusätzlich eine ausdrücklich bekannte Wandhöhe.
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const byIndex = new Map<number, any>();

  for (const item of rawItems) {
    const index = Number(item?.rowIndex);
    if (Number.isInteger(index) && index >= 0 && index < rows.length) {
      byIndex.set(index, item);
    }
  }

  return {
    items: rows.map((row) => {
      const result = byIndex.get(row.rowIndex);
      const rawStatus = String(result?.status || "UNKNOWN").toUpperCase();

      const status: RlcQuantitySemanticStatus =
        rawStatus === "EXPLICIT" ||
        rawStatus === "DERIVABLE" ||
        rawStatus === "UNSUPPORTED"
          ? rawStatus
          : "UNKNOWN";

      return {
        rowIndex: row.rowIndex,
        posNr: row.posNr,
        kurztext: row.kurztext,
        quantity: row.quantity,
        unit: row.unit,
        status,
        reason: String(result?.reason || "Mengenherkunft nicht sicher bestimmt."),
        explicitQuantity:
          status === "EXPLICIT" && Number(result?.explicitQuantity) > 0
            ? Number(result.explicitQuantity)
            : undefined,
        explicitUnit:
          status === "EXPLICIT" && result?.explicitUnit
            ? String(result.explicitUnit).trim()
            : undefined,
        geometry:
          status === "DERIVABLE" &&
          result?.geometry &&
          typeof result.geometry === "object"
            ? {
                operation: String(result.geometry.operation || "") as
                  | "RECTANGLE_AREA"
                  | "RECTANGULAR_VOLUME"
                  | "RECTANGLE_PERIMETER"
                  | "RECTANGULAR_WALL_AREA",
                ...(Number(result.geometry.lengthM) > 0
                  ? { lengthM: Number(result.geometry.lengthM) }
                  : {}),
                ...(Number(result.geometry.widthM) > 0
                  ? { widthM: Number(result.geometry.widthM) }
                  : {}),
                ...(Number(result.geometry.heightM) > 0
                  ? { heightM: Number(result.geometry.heightM) }
                  : {}),
              }
            : undefined,
      };
    }),
  };
}
