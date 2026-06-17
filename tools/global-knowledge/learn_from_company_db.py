import subprocess

NODE = r'''
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function s(v) {
  return String(v ?? "").trim();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function norm(v) {
  return s(v)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizedKey(shortText, unit) {
  return [norm(shortText), norm(unit)].filter(Boolean).join("|");
}

async function main() {
  const rows = await prisma.kalkulationsDbEntry.findMany({
    where: {
      unitPriceNet: { gt: 0 },
      shortText: { not: "" }
    },
    take: 5000,
    orderBy: { updatedAt: "desc" }
  });

  let imported = 0;
  let skipped = 0;

  for (const r of rows) {
    const shortText = s(r.shortText);
    const unit = s(r.unit);
    const price = n(r.unitPriceNet);

    if (!shortText || !unit || price <= 0) {
      skipped++;
      continue;
    }

    await prisma.rlcGlobalPosition.create({
      data: {
        source: "anonymous-company-db-learning",
        sourceType: "company-db-anonymous",
        gewerk: s(r.trade) || null,
        category: s(r.category) || null,
        positionNumber: null,
        shortText,
        longText: s(r.longText) || null,
        unit,
        priceMin: price,
        priceAvg: price,
        priceMax: price,
        confidence: 0.55,
        sampleCount: 1,
        needsReview: true,
        isContextSensitive: false,
        normalizedKey: normalizedKey(shortText, unit)
      }
    });

    imported++;
  }

  console.log(JSON.stringify({
    ok: true,
    sourceRows: rows.length,
    imported,
    skipped
  }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
'''

p = subprocess.run(
    ["docker", "exec", "-i", "rlc-server", "sh", "-lc", "cd /app && node"],
    input=NODE,
    text=True,
    capture_output=True
)

print(p.stdout)
if p.stderr:
    print(p.stderr)
if p.returncode != 0:
    raise SystemExit(p.returncode)
