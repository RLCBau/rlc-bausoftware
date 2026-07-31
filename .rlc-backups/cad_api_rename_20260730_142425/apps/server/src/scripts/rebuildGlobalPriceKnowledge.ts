import { prisma } from "../lib/prisma";

function norm(v: any) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:|]+$/g, "")
    .trim();
}

function normUnit(v: any) {
  const u = String(v || "").trim();
  if (u.toLowerCase() === "m2") return "m²";
  if (u.toLowerCase() === "m3") return "m³";
  return u;
}

function keyOf(r: any) {
  return [
    norm(r.shortText),
    normUnit(r.unit).toLowerCase(),
    norm(r.trade),
    norm(r.serviceType),
    norm(r.constructionMethod),
    norm(r.soilClass),
  ].join("||");
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function plausibleRange(unit: string) {
  const u = normUnit(unit);
  if (u === "m") return { min: 0.5, max: 1500 };
  if (u === "m²") return { min: 0.5, max: 1500 };
  if (u === "m³") return { min: 1, max: 2500 };
  if (u === "h") return { min: 20, max: 350 };
  if (u === "St") return { min: 1, max: 25000 };
  if (u === "Psch") return { min: 1, max: 100000 };
  return { min: 0.5, max: 50000 };
}

function qualityConfidence(args: {
  prices: number[];
  companyCount: number;
  unit: string;
}) {
  const { prices, companyCount, unit } = args;
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = plausibleRange(unit);

  let confidence = 0.55;

  confidence += Math.min(prices.length, 10) * 0.03;
  confidence += Math.min(companyCount, 5) * 0.04;

  if (prices.length < 2) confidence -= 0.12;
  if (companyCount < 2) confidence -= 0.08;
  if (avg < range.min) confidence -= 0.25;
  if (max > range.max) confidence -= 0.25;
  if (min <= 0) confidence -= 0.3;

  return Math.max(0.2, Math.min(0.95, round2(confidence)));
}

async function main() {
  await prisma.rlcGlobalPriceKnowledge.deleteMany();

  const rows = await prisma.kalkulationsDbEntry.findMany({
    where: {
      unitPriceNet: { gt: 0 },
      shortText: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
  });

  const groups = new Map<string, any[]>();

  for (const r of rows) {
    const key = keyOf(r);
    if (!key || key.startsWith("||")) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let created = 0;

  for (const [normalizedKey, g] of groups.entries()) {
    const prices = g
      .map((x) => Number(x.unitPriceNet || 0))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (!prices.length) continue;

    const newest = g[0];
    const companies = new Set(g.map((x) => x.companyId).filter(Boolean));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const medianPrice = median(prices);
    const unit = normUnit(newest.unit);

    await prisma.rlcGlobalPriceKnowledge.create({
      data: {
        normalizedKey,
        positionNumber: newest.positionNumber || null,
        shortText: newest.shortText || "",
        unit,
        trade: newest.trade || null,
        serviceType: newest.serviceType || null,
        constructionMethod: newest.constructionMethod || null,
        soilClass: newest.soilClass || null,
        minPrice: round2(minPrice),
        avgPrice: round2(avgPrice),
        maxPrice: round2(maxPrice),
        medianPrice: round2(medianPrice),
        sampleCount: prices.length,
        sourceCompanyCount: companies.size,
        country: "DE",
        priceYear: new Date().getFullYear(),
        confidence: qualityConfidence({
          prices,
          companyCount: companies.size,
          unit,
        }),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    created++;
  }

  console.log("SOURCE_ROWS_WITH_PRICE:", rows.length);
  console.log("GLOBAL_GROUPS_CREATED:", created);
  console.log("GLOBAL_TOTAL:", await prisma.rlcGlobalPriceKnowledge.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
