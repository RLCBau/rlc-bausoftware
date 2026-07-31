import crypto from "node:crypto";
import { prisma } from "../lib/prisma";

type AnyRow = Record<string, any>;

const DIRECT_GROUPS = new Set([
  "Material",
  "Personal",
  "Maschinen",
  "LKW / Transport",
  "Entsorgung",
  "Fremdleistung",
]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown): string {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9äöü]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLines(raw: unknown): AnyRow[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((line: AnyRow, index: number) => {
      const group = text(line?.group);
      const qty = numberValue(line?.qty) || 1;
      const total =
        numberValue(line?.total) ||
        qty * numberValue(line?.price ?? line?.unitPrice);

      if (!group || total <= 0) return null;

      return {
        id: text(line?.id) || `learned-${index + 1}`,
        group,
        name:
          text(line?.name) ||
          text(line?.label) ||
          `${group} Kostenansatz`,
        unit: text(line?.unit) || "EH",
        qty,
        price:
          numberValue(line?.price ?? line?.unitPrice) ||
          Math.round((total / qty) * 100) / 100,
        total: Math.round(total * 100) / 100,
        note: text(line?.note),
      };
    })
    .filter(Boolean) as AnyRow[];
}

function createSignature(row: AnyRow): string {
  const identity = [
    normalize(row.kurztext || row.shortText),
    normalize(row.langtext || row.longText).slice(0, 700),
    normalize(row.einheit || row.unit),
    normalize(row.gewerk || row.trade),
    normalize(row.leistungsart || row.serviceType),
    normalize(row.bauverfahren || row.constructionMethod),
  ].join("|");

  return crypto
    .createHash("sha256")
    .update(identity)
    .digest("hex");
}

function isEligible(row: AnyRow, lines: AnyRow[]): boolean {
  if (!text(row.kurztext || row.shortText)) return false;
  if (!text(row.einheit || row.unit)) return false;

  const confidence = numberValue(row.confidence);
  if (confidence < 0.65) return false;

  const status = normalize(row.calculationStatus);
  if (status === "critical") return false;

  const source = normalize(row.source);
  if (
    source.includes("rlc autonomous urkalkulation") ||
    source.includes("market intelligence")
  ) {
    return false;
  }

  /*
   * Keine Scheinkalkulation lernen:
   * Eine einzige generische Fremdleistungszeile ist keine Rezeptur.
   */
  const directLines = lines.filter((line) =>
    DIRECT_GROUPS.has(text(line.group))
  );

  const nonGenericDirectLines = directLines.filter((line) => {
    const name = normalize(line.name);
    return !(
      line.group === "Fremdleistung" &&
      (name === "fremdleistung" ||
        name === "rlc firmenkalibrierung aus x84")
    );
  });

  if (nonGenericDirectLines.length < 2) return false;

  const groups = new Set(nonGenericDirectLines.map((line) => line.group));
  if (groups.size < 2) return false;

  return true;
}

export async function learnCompanyRecipeFromKiRow(args: {
  companyId: string;
  projectId?: string | null;
  row: AnyRow;
}): Promise<"created" | "updated" | "skipped"> {
  const { companyId, projectId, row } = args;

  const lines = normalizeLines(
    row.priceBreakdown ||
      row.resources ||
      row.parameters?.priceBreakdown
  );

  if (!isEligible(row, lines)) return "skipped";

  const signature = createSignature(row);
  const kurztext = text(row.kurztext || row.shortText);
  const langtext = text(row.langtext || row.longText);
  const unit = text(row.einheit || row.unit);

  const context = {
    autoLearned: true,
    qualityGateStatus: "KI-Vorschlag",
    learnedAt: new Date().toISOString(),

    source: text(row.source),
    confidence: numberValue(row.confidence),
    riskLevel: text(row.riskLevel),
    calculationStatus: text(row.calculationStatus),

    gewerk: text(row.gewerk || row.trade),
    leistungsart: text(row.leistungsart || row.serviceType),
    bauverfahren: text(row.bauverfahren || row.constructionMethod),

    finalUnitPrice: numberValue(
      row.finalUnitPrice ??
        row.suggestedUnitPrice ??
        row.baseUnitPrice
    ),

    materialCost: numberValue(row.materialCost),
    laborCost: numberValue(row.laborCost),
    machineCost: numberValue(row.machineCost),
    subcontractorCost: numberValue(row.subcontractorCost),
    disposalCost: numberValue(row.disposalCost),
    overheadCost: numberValue(row.overheadCost),
    riskCost: numberValue(row.riskCost),
    profitCost: numberValue(row.profitCost),

    /*
     * Wichtig:
     * Auto-Learning erstellt nur einen Vorschlag.
     * Keine automatische Freigabe und keine Preisänderung.
     */
    reviewRequired: true,
  };

  const existing = await prisma.companyRecipeDb.findUnique({
    where: {
      companyId_signature: {
        companyId,
        signature,
      },
    },
    select: { id: true },
  });

  await prisma.companyRecipeDb.upsert({
    where: {
      companyId_signature: {
        companyId,
        signature,
      },
    },
    create: {
      companyId,
      projectId: projectId || null,
      signature,
      title: kurztext,
      sourcePosNr: text(row.posNr || row.positionNumber) || null,
      sourceText: [kurztext, langtext].filter(Boolean).join("\n"),
      unit: unit || null,
      context,
      lines,
    },
    update: {
      projectId: projectId || null,
      title: kurztext,
      sourcePosNr: text(row.posNr || row.positionNumber) || null,
      sourceText: [kurztext, langtext].filter(Boolean).join("\n"),
      unit: unit || null,
      context,
      lines,
    },
  });

  return existing ? "updated" : "created";
}
