import { prisma } from "../../lib/prisma";
import {
  detectPrimaryRlcConstructionFamily,
  type RlcConstructionFamilyId,
} from "../domain/constructionFamilyRegistry";
import {
  isRlcPriceSourceBlocked,
  rlcPriceSourceQualityStatus,
} from "../quality/priceSourceQualityGate";
import { getBaupreisIndexFactor } from "../priceIndex/baupreisIndexService";
import { rlcPreisRangeForText } from "../rlcPreisBibliothek";

export type RlcResolvedPriceSource =
  | "COMPANY_RECIPE"
  | "KALKULATION_DB"
  | "GLOBAL_KNOWLEDGE"
  | "RLC_TIEFBAU_CATALOG"
  | "UNRESOLVED";

export type RlcPriceResolution = {
  status: "RESOLVED" | "UNRESOLVED";
  source: RlcResolvedPriceSource;
  sourceId?: string;
  family: RlcConstructionFamilyId;
  unit: string;
  unitPrice: number | null;
  originalUnitPrice?: number | null;
  confidence: number;
  qualityStatus?: string;
  priceDate?: string | null;
  priceDateSource?: string | null;
  indexFactor?: number;
  indexApplied?: boolean;
  reason: string;
};

export type RlcPriceResolverInput = {
  companyId: string;
  kurztext: string;
  langtext?: string;
  einheit?: string;
  targetDate?: Date | string;
};

const TIEFBAU_FAMILIES = new Set<RlcConstructionFamilyId>([
  "ERDARBEITEN",
  "KANALBAU",
  "KABELBAU",
  "STRASSENBAU",
]);

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function norm(v: unknown): string {
  return text(v)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normUnit(v: unknown): string {
  const u = norm(v).replace(/\s/g, "");
  if (u === "m2" || u === "m²") return "m2";
  if (u === "m3" || u === "m³") return "m3";
  if (u === "stk" || u === "stuck" || u === "stück") return "st";
  return u;
}

function tokens(v: unknown): string[] {
  return [...new Set(
    norm(v)
      .split(" ")
      .filter((x) => x.length >= 3)
  )];
}

function similarity(a: unknown, b: unknown): number {
  const left = tokens(a);
  const right = tokens(b);

  if (!left.length || !right.length) return 0;

  const common = left.filter((x) => right.includes(x)).length;

  const precision = common / left.length;
  const recall = common / right.length;

  if (precision + recall === 0) return 0;

  return (2 * precision * recall) / (precision + recall);
}

function sameUnit(a: unknown, b: unknown): boolean {
  const x = normUnit(a);
  const y = normUnit(b);
  return !!x && !!y && x === y;
}

function familyOf(v: unknown): RlcConstructionFamilyId {
  return detectPrimaryRlcConstructionFamily(text(v)).id;
}

function compatibleFamily(
  sourceText: unknown,
  targetFamily: RlcConstructionFamilyId
): boolean {
  const f = familyOf(sourceText);
  return f !== "ALLGEMEIN" && f === targetFamily;
}

function qualityWeight(row: any): number {
  const status = rlcPriceSourceQualityStatus(row);

  if (status === "Freigegeben") return 1;
  if (status === "Geprüft") return 0.95;
  if (status === "KI-Vorschlag") return 0.72;

  return 0.82;
}

function directRecipeTotal(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;

  return lines.reduce((sum, line: any) => {
    const total = Number(line?.total);
    if (Number.isFinite(total) && total > 0) return sum + total;

    const qty = Number(line?.qty || 1);
    const price = Number(line?.price ?? line?.unitPrice);

    if (
      Number.isFinite(qty) &&
      Number.isFinite(price) &&
      qty > 0 &&
      price > 0
    ) {
      return sum + qty * price;
    }

    return sum;
  }, 0);
}

function applyHistoricalIndex(args: {
  price: number;
  priceDate?: Date | null;
  targetDate: Date | string;
  text: string;
}) {
  if (!args.priceDate) {
    return {
      price: args.price,
      factor: 1,
      applied: false,
    };
  }

  const index = getBaupreisIndexFactor({
    sourceDate: args.priceDate,
    targetDate: args.targetDate,
    text: args.text,
  });

  if (!index.reliable || index.factor <= 0) {
    return {
      price: args.price,
      factor: 1,
      applied: false,
    };
  }

  return {
    price: Math.round(args.price * index.factor * 100) / 100,
    factor: index.factor,
    applied: true,
  };
}

export async function resolveRlcPrice(
  input: RlcPriceResolverInput
): Promise<RlcPriceResolution> {
  const kurztext = text(input.kurztext);
  const langtext = text(input.langtext);
  const unit = text(input.einheit);
  const fullText = [kurztext, langtext].filter(Boolean).join(" ");
  const family = familyOf(fullText);
  const targetDate = input.targetDate || new Date();

  if (!input.companyId || !kurztext || !unit) {
    return {
      status: "UNRESOLVED",
      source: "UNRESOLVED",
      family,
      unit,
      unitPrice: null,
      confidence: 0,
      reason: "COMPANY_TEXT_OR_UNIT_MISSING",
    };
  }

  /*
   * 1. CompanyRecipeDb
   * Nur gleiche Einheit + gleiche Construction Family.
   */
  const recipes = await prisma.companyRecipeDb.findMany({
    where: { companyId: input.companyId },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const recipeCandidates = recipes
    .filter((r) => !isRlcPriceSourceBlocked(r))
    .filter((r) => sameUnit(r.unit, unit))
    .filter((r) =>
      compatibleFamily(
        [r.title, r.sourceText, (r.context as any)?.gewerk]
          .filter(Boolean)
          .join(" "),
        family
      )
    )
    .map((r) => {
      const ctx: any = r.context || {};
      const finalEp = Number(ctx.finalUnitPrice || 0);
      const linesTotal = directRecipeTotal(r.lines);

      /*
       * Defense in depth:
       * Rezept nur verwenden, wenn EP und Kostenlinien kohärent sind.
       */
      if (!(finalEp > 0) || !(linesTotal > 0)) return null;

      const delta = Math.abs(linesTotal - finalEp);
      const tolerance = Math.max(0.02, finalEp * 0.02);

      if (delta > tolerance) return null;

      const sim = similarity(
        fullText,
        [r.title, r.sourceText].filter(Boolean).join(" ")
      );

      return {
        row: r,
        price: finalEp,
        score: sim * qualityWeight(r),
        similarity: sim,
      };
    })
    .filter(Boolean)
    .filter((x: any) => x.similarity >= 0.62)
    .sort((a: any, b: any) => b.score - a.score);

  if (recipeCandidates.length) {
    const best: any = recipeCandidates[0];
    const status = rlcPriceSourceQualityStatus(best.row);

    return {
      status: "RESOLVED",
      source: "COMPANY_RECIPE",
      sourceId: best.row.id,
      family,
      unit,
      unitPrice: Math.round(best.price * 100) / 100,
      originalUnitPrice: best.price,
      confidence: Math.min(0.98, best.score),
      qualityStatus: status,
      indexFactor: 1,
      indexApplied: false,
      reason: "COMPATIBLE_COMPANY_RECIPE",
    };
  }

  /*
   * 2. KalkulationsDbEntry
   */
  const dbRowsRaw = await prisma.kalkulationsDbEntry.findMany({
    where: {
      companyId: input.companyId,
      unitPriceNet: { gt: 0 },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const dbCandidates = dbRowsRaw
    .filter((r) => !isRlcPriceSourceBlocked(r))
    .filter((r) => sameUnit(r.unit, unit))
    .filter((r) =>
      compatibleFamily(
        [r.shortText, r.longText, r.trade, r.serviceType]
          .filter(Boolean)
          .join(" "),
        family
      )
    )
    .map((r) => {
      const sim = similarity(
        fullText,
        [r.shortText, r.longText, r.trade, r.serviceType]
          .filter(Boolean)
          .join(" ")
      );

      return {
        row: r,
        similarity: sim,
        score:
          sim *
          qualityWeight(r) *
          Math.max(0.4, Math.min(1, Number(r.confidence || 0.75))),
      };
    })
    .filter((x) => x.similarity >= 0.62)
    .sort((a, b) => b.score - a.score);

  if (dbCandidates.length) {
    const best = dbCandidates[0];
    const original = Number(best.row.unitPriceNet);

    const indexed = applyHistoricalIndex({
      price: original,
      priceDate: best.row.priceDate,
      targetDate,
      text: fullText,
    });

    return {
      status: "RESOLVED",
      source: "KALKULATION_DB",
      sourceId: best.row.id,
      family,
      unit,
      unitPrice: indexed.price,
      originalUnitPrice: original,
      confidence: Math.min(0.96, best.score),
      qualityStatus: rlcPriceSourceQualityStatus(best.row),
      priceDate: best.row.priceDate?.toISOString() || null,
      priceDateSource: best.row.priceDateSource || null,
      indexFactor: indexed.factor,
      indexApplied: indexed.applied,
      reason: "COMPATIBLE_KALKULATION_DB_ENTRY",
    };
  }

  /*
   * 3. Global Knowledge.
   * Aggregat = Evidenz niedrigerer Priorität.
   */
  const globals = await prisma.rlcGlobalPriceKnowledge.findMany({
    where: {
      confidence: { gte: 0.55 },
    },
    orderBy: [
      { confidence: "desc" },
      { sampleCount: "desc" },
      { updatedAt: "desc" },
    ],
    take: 500,
  });

  const globalCandidates = globals
    .filter((r) => sameUnit(r.unit, unit))
    .filter((r) =>
      compatibleFamily(
        [r.shortText, r.trade, r.serviceType, r.constructionMethod]
          .filter(Boolean)
          .join(" "),
        family
      )
    )
    .map((r) => {
      const sim = similarity(
        fullText,
        [r.shortText, r.trade, r.serviceType, r.constructionMethod]
          .filter(Boolean)
          .join(" ")
      );

      return {
        row: r,
        similarity: sim,
        score: sim * Math.max(0.4, Math.min(1, Number(r.confidence))),
      };
    })
    .filter((x) => x.similarity >= 0.68)
    .sort((a, b) => b.score - a.score);

  if (globalCandidates.length) {
    const best = globalCandidates[0];
    const price =
      Number(best.row.medianPrice || 0) ||
      Number(best.row.avgPrice || 0);

    if (price > 0) {
      return {
        status: "RESOLVED",
        source: "GLOBAL_KNOWLEDGE",
        sourceId: best.row.id,
        family,
        unit,
        unitPrice: Math.round(price * 100) / 100,
        originalUnitPrice: price,
        confidence: Math.min(0.9, best.score),
        priceDate: null,
        priceDateSource: null,
        indexFactor: 1,
        indexApplied: false,
        reason: "COMPATIBLE_GLOBAL_AGGREGATE_NO_EXACT_PRICE_DATE",
      };
    }
  }

  /*
   * 4. RLC Tiefbau Preis-Catalog V2:
   * ausschließlich bekannte Tiefbau-Familien.
   */
  if (TIEFBAU_FAMILIES.has(family)) {
    const range = rlcPreisRangeForText(fullText, unit);

    if (range.matches.length && range.avg > 0) {
      return {
        status: "RESOLVED",
        source: "RLC_TIEFBAU_CATALOG",
        family,
        unit,
        unitPrice: Math.round(range.avg * 100) / 100,
        originalUnitPrice: range.avg,
        confidence: 0.55,
        priceDate: null,
        priceDateSource: null,
        indexFactor: 1,
        indexApplied: false,
        reason: "TIEFBAU_FAMILY_PRICE_CATALOG",
      };
    }
  }

  return {
    status: "UNRESOLVED",
    source: "UNRESOLVED",
    family,
    unit,
    unitPrice: null,
    confidence: 0,
    indexFactor: 1,
    indexApplied: false,
    reason: "NO_COMPATIBLE_PRICE_SOURCE",
  };
}
