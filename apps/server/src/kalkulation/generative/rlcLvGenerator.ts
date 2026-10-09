import type { RlcAutonomousCalcInput } from "../autonomous/types";
import { resolveRlcTrenchRules } from "../technicalRules/trenchRulesEngine";
import { completeRlcAiText } from "../../services/ai/rlcAiGateway";
import {
  detectRlcConstructionFamilies,
  type RlcConstructionFamilyId,
} from "../domain/constructionFamilyRegistry";
import { resolveRlcTechnicalModules } from "../domain/technicalModuleRouter";
import { validateGeneratedLvSemantically } from "../validation/semanticLvValidator";
import { validateGeneratedLvQuantities } from "../validation/semanticQuantityValidator";
import { validateSourceCoverage } from "../validation/sourceCoverageValidator";
import { validateLvAtomicity } from "../validation/semanticLvAtomicityValidator";
import { validateGeneratedQuestions } from "../validation/semanticQuestionValidator";
import { recoverMissingLvRows } from "./missingLvRecovery";
import {
  rectangleArea,
  rectangularVolume,
  rectanglePerimeter,
  rectangularWallArea,
} from "../quantity/quantityGeometryEngine";

export type RlcLvGenerationInput = {
  text: string;
  projectCode?: string;
};

export type RlcTechnicalEvidence = {
  ruleId: string;
  standard: string;
  edition: string;
  section?: string;
  inputs: {
    lengthM?: number;
    depthM?: number;
    nominalDiameterMm?: number;
    outsideDiameterM?: number;
    trenchSupport?: "VERBAUT" | "UNVERBAUT" | "UNKNOWN";
    slopeAngleDeg?: number;
    beddingThicknessM?: number;
    embedmentHeightM?: number;
  };
  derived: {
    trenchWidthM?: number;
    quantityKind?: "excavation" | "bedding" | "restBackfill";
    quantity: number;
    unit: string;
  };
};

export type RlcLvGenerationResult = {
  projectCode?: string;
  projectType?: string;
  trade?: string;
  families: RlcConstructionFamilyId[];
  assumptions: string[];
  questions: string[];
  rows: RlcAutonomousCalcInput[];
  technicalEvidenceByPos: Record<string, RlcTechnicalEvidence[]>;
};

function detectTrenchApplication(
  text: string
): "KABEL" | "ABWASSER" | "ROHRLEITUNG" | "FERNWAERME" | "UNKNOWN" {
  const value = String(text || "").toLowerCase();

  if (
    /fernwärme|fernwaerme|wärmenetz|waermenetz|heizleitung/.test(value)
  ) {
    return "FERNWAERME";
  }

  if (
    /abwasser|schmutzwasser|regenwasser|kanal(?:isation)?|entwässer|entwaesser|kanalrohr/.test(value)
  ) {
    return "ABWASSER";
  }

  if (
    /kabel|schutzrohr|leerrohr|stromleitung|glasfaser|lwl|telekommunikation/.test(value)
  ) {
    return "KABEL";
  }

  if (
    /wasserleitung|gasleitung|druckrohr|rohrleitung|trinkwasser/.test(value)
  ) {
    return "ROHRLEITUNG";
  }

  return "UNKNOWN";
}

function extractNominalDiameterMm(text: string): number | null {
  const m = String(text || "").match(/\bDN\s*[-:]?\s*(\d+(?:[.,]\d+)?)\b/i);
  if (!m) return null;

  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractOutsideDiameterMeters(text: string): number | null {
  const value = String(text || "");

  const mm = value.match(
    /(?:außendurchmesser|aussendurchmesser|außen-?ø|aussen-?ø|\bOD\b)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*mm\b/i
  );
  if (mm) {
    const n = Number(mm[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n / 1000;
  }

  const meter = value.match(
    /(?:außendurchmesser|aussendurchmesser|\bOD\b)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*m\b/i
  );
  if (meter) {
    const n = Number(meter[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function extractTrenchSupport(
  text: string
): "VERBAUT" | "UNVERBAUT" | "UNKNOWN" {
  const value = String(text || "").toLowerCase();

  if (/unverbaut|ohne\s+verbau/.test(value)) return "UNVERBAUT";
  if (/\bverbaut\b|\bverbau\b/.test(value)) return "VERBAUT";

  return "UNKNOWN";
}

function extractSlopeAngleDeg(text: string): number | null {
  const m = String(text || "").match(
    /(?:böschungswinkel|boeschungswinkel|böschung|boeschung)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:°|grad)\b/i
  );
  if (!m) return null;

  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 90 ? n : null;
}

function extractBeddingThicknessMeters(text: string): number | null {
  const value = String(text || "");

  const m = value.match(
    /(?:bettungsdicke|bettung)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/i
  );
  if (!m) return null;

  const n = Number(m[1].replace(",", "."));
  if (!(Number.isFinite(n) && n > 0)) return null;

  const unit = m[2].toLowerCase();
  if (unit === "mm") return n / 1000;
  if (unit === "cm") return n / 100;
  return n;
}

function extractEmbedmentHeightMeters(text: string): number | null {
  const value = String(text || "");

  const m = value.match(
    /(?:leitungszonenhöhe|leitungszonenhoehe|höhe\s+der\s+leitungszone|hoehe\s+der\s+leitungszone|leitungszone)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/i
  );
  if (!m) return null;

  const n = Number(m[1].replace(",", "."));
  if (!(Number.isFinite(n) && n > 0)) return null;

  const unit = m[2].toLowerCase();
  if (unit === "mm") return n / 1000;
  if (unit === "cm") return n / 100;
  return n;
}

function extractDepthMeters(text: string): number | null {
  const value = String(text || "");

  const cm = value.match(/(\d+(?:[.,]\d+)?)\s*cm\s*(?:tief|tiefe)?/i);
  if (cm) {
    const n = Number(cm[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n / 100;
  }

  const meter = value.match(/(\d+(?:[.,]\d+)?)\s*m\s*(?:tief|tiefe)/i);
  if (meter) {
    const n = Number(meter[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function extractSingleLinearLengthMeters(text: string): number | null {
  const matches = Array.from(
    String(text || "").matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*m(?:eter)?\b/gi)
  )
    .map((m) => Number(String(m[1]).replace(",", ".")))
    .filter((v) => Number.isFinite(v) && v > 0);

  const unique = Array.from(new Set(matches));

  return unique.length === 1 ? unique[0] : null;
}

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

export async function generateRlcLvFromText(
  input: RlcLvGenerationInput
): Promise<RlcLvGenerationResult> {
  const text = String(input?.text || "").trim();

  if (!text) {
    throw new Error("TEXT_REQUIRED");
  }

  const detectedFamilies = detectRlcConstructionFamilies(text);
  const familyIds = detectedFamilies.map((family) => family.id);
  const technicalModules = resolveRlcTechnicalModules(detectedFamilies);
  const hasTrenchRules = technicalModules.some(
    (route) => route.moduleId === "TRENCH_RULES"
  );

  const familyContext =
    detectedFamilies.length > 0
      ? detectedFamilies
          .map((family) => `${family.id}: ${family.label}`)
          .join(", ")
      : "ALLGEMEIN: Allgemeine Bauleistung";

  const completion = await completeRlcAiText({
    purpose: "kalkulation",
    responseFormat: "json",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "Du bist der RLC LV-Generator für Baukalkulation. " +
          "Erzeuge aus einer freien Projektbeschreibung ein technisch sinnvolles Leistungsverzeichnis. " +
          "Erfinde keine Preise. Preise werden später durch die RLC-Kalkulationsengine berechnet. " +
          "Stelle nur dann Rückfragen, wenn ohne die Information keine belastbare Position erzeugt werden kann. " +
          "Antworte ausschließlich mit gültigem JSON.",
      },
      {
        role: "user",
        content: `
Projektbeschreibung:
${text}

Projektcode:
${input.projectCode || ""}

Vom RLC-Domain-Router erkannte Baufamilien:
${familyContext}

Die erkannten Baufamilien dienen zur fachlichen Einordnung des Projekts.
Erzeuge nur Leistungen, die aus der Projektbeschreibung technisch begründet sind.

Erzeuge JSON exakt in dieser Struktur:

{
  "projectType": "string",
  "trade": "string",
  "assumptions": ["string"],
  "questions": ["string"],
  "rows": [
    {
      "posNr": "1.1",
      "kurztext": "string",
      "langtext": "string",
      "einheit": "m|m2|m3|St|kg|t|h|Psch",
      "menge": 0,
      "projectCode": "string"
    }
  ]
}

Regeln:
- Jede Position muss eine klar kalkulierbare Bauleistung darstellen.
- Mehrere ausdrücklich genannte Leistungen niemals zu einer Sammelposition zusammenfassen.
- Jede eigenständig kalkulierbare Leistung als separate LV-Position ausgeben.
- Beispiel: Wenn mehrere Leistungen ausdrücklich genannt sind, müssen sie als getrennte Positionen ausgegeben werden.
- Gewerkspezifische Leistungen niemals aus Beispielen oder typischen Abläufen erfinden.
- Kabelbau-Leistungen wie Schutzrohr oder Warnband nur erzeugen, wenn sie im Projekttext genannt oder technisch eindeutig gefordert sind.
- Bei Abwasser/Kanalbau niemals Kabelschutzrohr oder Warnband ausgeben, wenn diese Leistungen nicht ausdrücklich beschrieben sind.
- Titelpositionen ohne Menge vermeiden.
- Mengen nur übernehmen, wenn sie im Projekttext eindeutig der jeweiligen Leistung zugeordnet sind.
- Eine Mengenangabe einer Leistung niemals auf andere Positionen übertragen.
- Beispiel: "Trockenbau 35 m2" bedeutet nicht, dass Bodenplatte, Mauerwerk oder Dach ebenfalls 35 m2 haben.
- Geometrische Mengen nicht selbst schätzen oder aus allgemeinen Gebäudeabmessungen ableiten; wenn kein RLC-Technical-Module die Menge bestimmt, Menge 0 setzen.
- Wenn eine eindeutige Trassen- oder Abschnittslänge genannt ist, diese für direkt abhängige lineare Leistungen übernehmen, z. B. Graben, Schutzrohr, Warnband, Leitungsverlegung.
- Eine vorhandene gemeinsame Länge nicht erneut als fehlend behandeln.
- Unsichere Mengen nicht erfinden; dann Menge 0 setzen und eine konkrete Frage in "questions" ergänzen.
- Keine irrelevanten Rückfragen stellen. Nur Informationen fragen, die für Menge, technische Ausführung oder Kalkulation der tatsächlich beschriebenen Leistung erforderlich sind.
- Positionen logisch und fachlich vollständig gliedern.
- Baustelleneinrichtung, Erdarbeiten, Leitungsbau, Beton, Asphalt, Pflaster, Entsorgung, Prüfungen usw. nur aufnehmen, wenn technisch relevant.
- Keine Preise, keine Einheitspreise, keine Zuschläge berechnen.
`,
      },
    ],
  });

  const parsed = extractJson(completion.text || "");

  if (!parsed || typeof parsed !== "object") {
    throw new Error("LV_GENERATION_INVALID_JSON");
  }

  let rowsRaw = Array.isArray(parsed.rows) ? parsed.rows : [];

  const semanticValidation = await validateGeneratedLvSemantically({
    sourceText: text,
    families: familyIds,
    rows: rowsRaw,
  });

  const unsupportedIndexes = new Set(
    semanticValidation.unsupportedIndexes
  );

  rowsRaw = rowsRaw.filter(
    (_row: any, index: number) => !unsupportedIndexes.has(index)
  );

  const atomicityValidation = await validateLvAtomicity({
    sourceText: text,
    rows: rowsRaw,
  });

  const splitByIndex = new Map(
    atomicityValidation.items
      .filter(
        (item) =>
          item.status === "SPLIT_REQUIRED" &&
          item.services.length > 1
      )
      .map((item) => [item.rowIndex, item.services])
  );

  if (splitByIndex.size > 0) {
    rowsRaw = rowsRaw.flatMap((row: any, index: number) => {
      const services = splitByIndex.get(index);

      if (!services) {
        return [row];
      }

      return services.map((service) => ({
        ...row,
        posNr: undefined,
        kurztext: service.kurztext,
        langtext: service.kurztext,
        einheit: service.einheit,
        menge: service.menge,
      }));
    });
  }

  const sourceCoverage = await validateSourceCoverage({
    sourceText: text,
    rows: rowsRaw,
  });

  if (sourceCoverage.missing.length > 0) {
    const recoveredRows = await recoverMissingLvRows({
      sourceText: text,
      missingRequirements: sourceCoverage.missing.map(
        (item) => item.requirement
      ),
      existingRows: rowsRaw,
    });

    if (recoveredRows.length > 0) {
      const recoveryValidation = await validateGeneratedLvSemantically({
        sourceText: text,
        families: familyIds,
        rows: recoveredRows,
      });

      const invalidRecoveredIndexes = new Set(
        recoveryValidation.unsupportedIndexes
      );

      rowsRaw.push(
        ...recoveredRows.filter(
          (_row, index) => !invalidRecoveredIndexes.has(index)
        )
      );
    }
  }

  const finalSourceCoverage = await validateSourceCoverage({
    sourceText: text,
    rows: rowsRaw,
  });

  const sourceCoverageQuestions = [
    ...finalSourceCoverage.missing.map(
      (item) => `Fehlende Leistung im generierten LV: ${item.requirement}`
    ),
    ...finalSourceCoverage.uncertain.map(
      (item) => `Unklare LV-Abdeckung: ${item.requirement}`
    ),
  ];

  const quantityValidation = await validateGeneratedLvQuantities({
    sourceText: text,
    rows: rowsRaw,
  });

  for (const item of quantityValidation.items) {
    const row = rowsRaw[item.rowIndex];
    if (!row) continue;

    if (
      item.status === "EXPLICIT" &&
      item.explicitQuantity !== undefined &&
      item.explicitQuantity > 0
    ) {
      row.menge = item.explicitQuantity;

      if (item.explicitUnit) {
        row.einheit = item.explicitUnit;
      }

      continue;
    }

    if (
      item.status === "UNSUPPORTED" &&
      Number(row.menge) > 0
    ) {
      row.menge = 0;
      continue;
    }

    if (
      item.status === "DERIVABLE" &&
      item.geometry
    ) {
      const g = item.geometry;

      const result =
        g.operation === "RECTANGLE_AREA"
          ? rectangleArea(g.lengthM, g.widthM)
          : g.operation === "RECTANGULAR_VOLUME"
            ? rectangularVolume(g.lengthM, g.widthM, g.heightM)
            : g.operation === "RECTANGLE_PERIMETER"
              ? rectanglePerimeter(g.lengthM, g.widthM)
              : g.operation === "RECTANGULAR_WALL_AREA"
                ? rectangularWallArea(g.lengthM, g.widthM, g.heightM)
                : null;

      if (
        result?.status === "resolved" &&
        result.value !== null
      ) {
        row.menge = result.value;
        row.einheit = result.unit;
      }
    }
  }

  const semanticReviewQuestions =
    semanticValidation.items
      .filter((item) => item.status === "UNCERTAIN")
      .map(
        (item) =>
          `Prüfung Position "${item.kurztext}": ${item.reason}`
      );

  const sharedLinearLength = extractSingleLinearLengthMeters(text);
  const trenchDepth = extractDepthMeters(text);
  const trenchApplication = detectTrenchApplication(text);

  // Deterministischer Gewerke-Guard:
  // Bei Abwasser keine Kabelbau-Leistungen aus KI-Halluzination übernehmen.
  if (trenchApplication === "ABWASSER") {
    const sourceText = text.toLowerCase();

    const sourceRequestsProtectionPipe =
      /schutzrohr|kabelschutzrohr|leerrohr/.test(sourceText);

    const sourceRequestsWarningTape =
      /warnband|trassenwarnband|ortungsband/.test(sourceText);

    rowsRaw = rowsRaw.filter((row: any) => {
      const rowText =
        `${String(row?.kurztext || "")} ${String(row?.langtext || "")}`.toLowerCase();

      if (
        /kabelschutzrohr|schutzrohr|leerrohr/.test(rowText) &&
        !sourceRequestsProtectionPipe
      ) {
        return false;
      }

      if (
        /warnband|trassenwarnband|ortungsband/.test(rowText) &&
        !sourceRequestsWarningTape
      ) {
        return false;
      }

      return true;
    });
  }

  // Deterministischer Struktur-Guard:
  // Eine ausdrücklich geforderte Abwasser-Grabenherstellung darf
  // durch eine variable KI-Ausgabe nicht verloren gehen.
  if (trenchApplication === "ABWASSER") {
    const sourceText = text.toLowerCase();

    const sourceRequestsExcavation =
      /abwassergraben\s+(?:herstellen|ausheben)|graben\s+(?:herstellen|ausheben)|\baushub\b/.test(
        sourceText
      );

    const hasExcavationRow = rowsRaw.some((row: any) => {
      const shortText = String(row?.kurztext || "").toLowerCase();

      return (
        shortText.includes("aushub") ||
        shortText.includes("ausheben") ||
        shortText.includes("graben herstellen") ||
        shortText.includes("abwassergraben herstellen")
      );
    });

    if (sourceRequestsExcavation && !hasExcavationRow) {
      rowsRaw.unshift({
        posNr: "",
        kurztext: "Abwassergraben ausheben",
        langtext:
          "Abwassergraben gemäß den im Projekttext angegebenen Abmessungen herstellen.",
        menge: 0,
        einheit: "m3",
      });
    }
  }

  // Deterministischer Leistungs-Guard für Abwasser.
  // Geometrische Parameter erzeugen keine eigene LV-Position.
  // Explizit geforderte Leistungen dürfen dagegen durch die KI
  // weder verloren gehen noch mit cm-Werten als Laufmeter entstehen.
  if (trenchApplication === "ABWASSER") {
    const sourceText = text.toLowerCase();

    const sourceRequestsBeddingWork =
      /bettung.{0,40}(?:herstellen|einbauen)/.test(sourceText);

    const sourceRequestsEmbedmentWork =
      /leitungszone.{0,40}(?:herstellen|einbauen)/.test(sourceText);

    rowsRaw = rowsRaw.filter((row: any) => {
      const shortText = String(row?.kurztext || "").toLowerCase();

      // Künstliche KI-Unterpositionen aus Geometriemaßen entfernen.
      if (
        /rohrverleg(?:en|ung).*\((?:bettung|leitungszone|graben)\)/.test(
          shortText
        )
      ) {
        return false;
      }

      if (
        /\bleitungszone\b/.test(shortText) &&
        !sourceRequestsEmbedmentWork
      ) {
        return false;
      }

      if (
        /\bbettung\b|\brohrbett/.test(shortText) &&
        !sourceRequestsBeddingWork
      ) {
        return false;
      }

      return true;
    });

    // Explizit geforderte Bettung muss als Leistung vorhanden sein.
    if (sourceRequestsBeddingWork) {
      const hasBeddingRow = rowsRaw.some((row: any) =>
        /\bbettung\b|\brohrbett/.test(
          String(row?.kurztext || "").toLowerCase()
        )
      );

      if (!hasBeddingRow) {
        rowsRaw.push({
          posNr: "",
          kurztext: "Rohrbettung herstellen",
          langtext:
            "Rohrbettung gemäß den im Projekttext angegebenen Abmessungen herstellen.",
          menge: 0,
          einheit: "m3",
        });
      }
    }

    // Dasselbe Prinzip für eine ausdrücklich geforderte Leitungszone.
    if (sourceRequestsEmbedmentWork) {
      const hasEmbedmentRow = rowsRaw.some((row: any) =>
        /\bleitungszone\b/.test(
          String(row?.kurztext || "").toLowerCase()
        )
      );

      if (!hasEmbedmentRow) {
        rowsRaw.push({
          posNr: "",
          kurztext: "Leitungszone herstellen",
          langtext:
            "Leitungszone gemäß den im Projekttext angegebenen Abmessungen herstellen.",
          menge: 0,
          einheit: "m3",
        });
      }
    }
  }

  const nominalDiameterMm = extractNominalDiameterMm(text);
  const outsideDiameterM = extractOutsideDiameterMeters(text);
  const trenchSupport = extractTrenchSupport(text);
  const slopeAngleDeg = extractSlopeAngleDeg(text);
  const beddingThicknessM = extractBeddingThicknessMeters(text);
  const embedmentHeightM = extractEmbedmentHeightMeters(text);

  const trenchRule =
    hasTrenchRules && sharedLinearLength && trenchDepth
      ? resolveRlcTrenchRules({
          application: trenchApplication,
          lengthM: sharedLinearLength,
          depthM: trenchDepth,
          nominalDiameterMm: nominalDiameterMm || undefined,
          outsideDiameterM: outsideDiameterM || undefined,
          trenchSupport,
          slopeAngleDeg: slopeAngleDeg || undefined,
          beddingThicknessM: beddingThicknessM || undefined,
          embedmentHeightM: embedmentHeightM || undefined,
        })
      : null;

  const rows: RlcAutonomousCalcInput[] = rowsRaw
    .map((row: any, index: number) => {
      let unit = String(row?.einheit || "EH").trim();
      let qty = Number.isFinite(Number(row?.menge))
        ? Number(row.menge)
        : 0;

      if (
        !(qty > 0) &&
        sharedLinearLength &&
        ["m", "lfm"].includes(unit.toLowerCase())
      ) {
        qty = sharedLinearLength;
      }

      const rowText =
        `${String(row?.kurztext || "")} ${String(row?.langtext || "")}`.toLowerCase();

      const shortText =
        String(row?.kurztext || "").toLowerCase();

      const isPipeInstallation =
        trenchApplication === "ABWASSER" &&
        (
          shortText.includes("rohrverlegen") ||
          shortText.includes("rohr verlegen") ||
          shortText.includes("rohrverlegung") ||
          shortText.includes("kanalrohr verlegen")
        );

      // Die ausdrücklich genannte gemeinsame Trassenlänge ist
      // für die Rohrverlegung maßgebend. KI-Zahlen aus cm-Angaben
      // dürfen diese Länge nicht überschreiben.
      if (
        isPipeInstallation &&
        sharedLinearLength &&
        ["m", "lfm"].includes(unit.toLowerCase())
      ) {
        qty = sharedLinearLength;
      }

      const isTrenchExcavation =
        shortText.includes("aushub") ||
        shortText.includes("ausheben") ||
        shortText.includes("graben herstellen");

      const isTrenchBackfill =
        shortText.includes("verfüll") ||
        shortText.includes("verfuell") ||
        shortText.includes("verdicht");

      const isBedding =
        trenchApplication === "ABWASSER" &&
        (
          shortText.includes("bettung") ||
          shortText.includes("rohrbett")
        );

      if (
        isTrenchExcavation &&
        trenchApplication === "ABWASSER" &&
        trenchRule?.status === "resolved" &&
        Number(trenchRule.excavationM3) > 0
      ) {
        qty = Number(trenchRule.excavationM3);
        unit = "m3";
      }

      if (
        isBedding &&
        trenchRule?.status === "resolved" &&
        trenchRule.beddingVolumeM3 !== null &&
        trenchRule.beddingVolumeM3 !== undefined &&
        Number(trenchRule.beddingVolumeM3) > 0
      ) {
        qty = Number(trenchRule.beddingVolumeM3);
        unit = "m3";
      }

      if (isTrenchBackfill && trenchRule) {
        if (
          trenchRule.status === "resolved" &&
          Number(trenchRule.excavationM3) > 0 &&
          trenchApplication !== "ABWASSER"
        ) {
          qty = Number(trenchRule.excavationM3);
          unit = "m3";
        } else if (
          trenchRule.status === "resolved" &&
          trenchApplication === "ABWASSER"
        ) {
          // Für Abwasser niemals das Brutto-Aushubvolumen
          // als Verfüllmenge verwenden.
          // Nur eine vollständig geometrisch abgeleitete
          // Netto-Restverfüllmenge darf übernommen werden.
          qty =
            trenchRule.netBackfillM3 !== null &&
            trenchRule.netBackfillM3 !== undefined
              ? Number(trenchRule.netBackfillM3)
              : 0;
          unit = "m3";
        } else if (
          trenchRule.status === "missing_input" ||
          trenchRule.status === "rule_not_available"
        ) {
          // Keine erfundene Längenmenge für volumenabhängige
          // Grabenverfüllung verwenden.
          qty = 0;
          unit = "m3";
        }
      }

      return {
        posNr: String(row?.posNr || `${index + 1}`).trim(),
        kurztext: String(row?.kurztext || "").trim(),
        langtext: String(row?.langtext || "").trim(),
        einheit: unit,
        menge: qty,
        projectCode:
          String(row?.projectCode || input.projectCode || "").trim() || undefined,
      };
    })
    .filter((row: RlcAutonomousCalcInput) => !!row.kurztext)
    .filter((row: RlcAutonomousCalcInput) => {
      if (trenchApplication !== "ABWASSER") return true;

      const shortText = String(row.kurztext || "").toLowerCase();

      // Generische KI-Doppelposition zur bereits vorhandenen
      // volumetrischen Grabenherstellung entfernen.
      if (
        /^abwassergrabenbau$/.test(shortText.trim()) &&
        rowsRaw.some((r: any) => {
          const t = String(r?.kurztext || "").toLowerCase();
          return (
            t.includes("aushub") ||
            t.includes("ausheben") ||
            t.includes("abwassergraben herstellen")
          );
        })
      ) {
        return false;
      }

      return true;
    });

  // Nach allen deterministischen Guards neu nummerieren.
  // Keine GPT-Positionsnummern in das finale generierte LV übernehmen.
  rows.forEach((row, index) => {
    row.posNr = String(index + 1);
  });

  const technicalEvidenceByPos: Record<string, RlcTechnicalEvidence[]> = {};

  if (
    trenchRule?.status === "resolved" &&
    trenchRule.source &&
    Number(trenchRule.excavationM3) > 0
  ) {
    for (const row of rows) {
      const shortText = String(row.kurztext || "").toLowerCase();

      const isExcavation =
        shortText.includes("aushub") ||
        shortText.includes("ausheben") ||
        shortText.includes("graben herstellen");

      const isBackfill =
        shortText.includes("verfüll") ||
        shortText.includes("verfuell") ||
        shortText.includes("verdicht");

      const isBedding =
        trenchApplication === "ABWASSER" &&
        (
          shortText.includes("bettung") ||
          shortText.includes("rohrbett")
        );

      const isEvidenceTarget =
        trenchApplication === "ABWASSER"
          ? isExcavation || isBedding || isBackfill
          : isBackfill;

      if (
        !isEvidenceTarget ||
        !row.posNr ||
        !(Number(row.menge) > 0)
      ) continue;

      const quantityKind =
        trenchApplication === "ABWASSER" && isBedding
          ? "bedding"
          : trenchApplication === "ABWASSER" && isBackfill
            ? "restBackfill"
            : "excavation";

      technicalEvidenceByPos[String(row.posNr)] = [{
        ruleId: trenchRule.source.ruleId,
        standard: trenchRule.source.standard,
        edition: trenchRule.source.edition,
        section: trenchRule.source.section,
        inputs: {
          lengthM: sharedLinearLength || undefined,
          depthM: trenchDepth || undefined,
          nominalDiameterMm: nominalDiameterMm || undefined,
          outsideDiameterM: outsideDiameterM || undefined,
          trenchSupport:
            trenchSupport !== "UNKNOWN" ? trenchSupport : undefined,
          slopeAngleDeg: slopeAngleDeg || undefined,
          beddingThicknessM: beddingThicknessM || undefined,
          embedmentHeightM: embedmentHeightM || undefined,
        },
        derived: {
          trenchWidthM: trenchRule.widthM || undefined,
          quantityKind,
          quantity: Number(row.menge || 0),
          unit: String(row.einheit || ""),
        },
      }];
    }
  }

  const candidateQuestions = Array.from(
    new Set([
      ...(Array.isArray(trenchRule?.questions)
        ? trenchRule.questions.map((x: string) => String(x))
        : []),
      ...(Array.isArray(parsed.questions)
        ? parsed.questions
            .map((x: any) => String(x))
            .filter(
              (q: string) =>
                !(
                  (
                    trenchRule?.status === "resolved" &&
                    trenchRule.widthM &&
                    /grabenbreite/i.test(q)
                  ) ||
                  (
                    trenchRule?.status === "missing_input" &&
                    /grabenbreite|grabenprofil/i.test(q)
                  ) ||
                  (
                    trenchSupport !== "UNKNOWN" &&
                    /verbauart|verbausystem|verbaut|unverbaut|\bverbau\b/i.test(q)
                  ) ||
                  (
                    !!sharedLinearLength &&
                    /trassenlänge|trassenlaenge|leitungslänge|leitungslaenge|rohrlänge|rohrlaenge/i.test(q)
                  )
                )
            )
        : []),
      ...sourceCoverageQuestions,
      ...semanticReviewQuestions,
      ...rows
        .filter(
          (row) =>
            !(Number(row.menge) > 0) &&
            ["m2", "m3"].includes(
              String(row.einheit || "")
                .toLowerCase()
                .replace("²", "2")
                .replace("³", "3")
            )
        )
        .map(
          (row) =>
            `Menge für Position ${row.posNr || ""} "${row.kurztext || ""}" kann aus den vorhandenen Abmessungen nicht sicher ermittelt werden.`
        ),
    ])
  );

  const questionValidation = await validateGeneratedQuestions({
    sourceText: text,
    questions: candidateQuestions,
    rows,
  });

  const validatedQuestions = questionValidation.requiredQuestions;

  return {
    projectCode: input.projectCode,
    projectType: String(parsed.projectType || "").trim() || undefined,
    trade: String(parsed.trade || "").trim() || undefined,
    families: familyIds,
    assumptions: Array.from(
      new Set([
        ...(Array.isArray(parsed.assumptions)
          ? parsed.assumptions
              .map((x: any) => String(x))
              .filter((a: string) => {
                const assumption = a.toLowerCase();
                const source = text.toLowerCase();

                // Keine KI-Standardannahmen als Projekttatsachen übernehmen.
                if (/standardmäßig|standardmaessig/.test(assumption)) {
                  return false;
                }

                // Keine erfundene Aussage über vorhandene Trasse.
                if (
                  /vorhanden(?:e|er|en)?\s+trasse|ohne\s+neue\s+verlegungsarbeiten/.test(assumption) &&
                  !/vorhanden(?:e|er|en)?\s+trasse|ohne\s+neue\s+verlegungsarbeiten/.test(source)
                ) {
                  return false;
                }

                // Rohrwerkstoff niemals erfinden.
                if (
                  /stahl|metall|kunststoff|pvc|pe|pp|steinzeug|beton/.test(assumption) &&
                  !/stahl|metall|kunststoff|pvc|pe|pp|steinzeug|beton/.test(source)
                ) {
                  return false;
                }

                // Gefälle / Steigung niemals ohne Projektangabe annehmen.
                if (
                  /ohne\s+(?:gefälle|gefaelle|steigung)|horizontal|keine\s+steigung/.test(assumption) &&
                  !/gefälle|gefaelle|steigung|neigung/.test(source)
                ) {
                  return false;
                }

                return true;
              })
          : []),
        ...(trenchRule?.status === "resolved" && trenchRule.widthM
          ? [
              `Grabenbreite ${trenchRule.widthM.toFixed(2)} m – abgeleitet aus ${trenchRule.source?.standard || "technischer Regel"}` +
              (trenchRule.source?.edition ? `:${trenchRule.source.edition}` : ""),
            ]
          : []),
      ])
    ),
    questions: validatedQuestions,
    rows,
    technicalEvidenceByPos,
  };
}
