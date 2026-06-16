import json
import subprocess
from collections import defaultdict

NODE = r'''
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function avg(arr) {
  const clean = arr.map(n).filter(x => x > 0);
  if (!clean.length) return null;
  return clean.reduce((a,b) => a + b, 0) / clean.length;
}

function minv(arr) {
  const clean = arr.map(n).filter(x => x > 0);
  return clean.length ? Math.min(...clean) : null;
}

function maxv(arr) {
  const clean = arr.map(n).filter(x => x > 0);
  return clean.length ? Math.max(...clean) : null;
}

async function main() {
  const rows = await prisma.rlcGlobalPosition.findMany({
    orderBy: { createdAt: "asc" }
  });

  const groups = new Map();

  for (const r of rows) {
    const key = r.normalizedKey || `${r.shortText || ""}|${r.unit || ""}`.toLowerCase();
    if (!key.trim()) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  await prisma.rlcGlobalKnowledgeAggregated.deleteMany({});

  let created = 0;

  for (const [key, items] of groups.entries()) {
    const base = items[items.length - 1];

    const priceMin = minv(items.map(x => x.priceMin ?? x.priceAvg));
    const priceAvg = avg(items.map(x => x.priceAvg));
    const priceMax = maxv(items.map(x => x.priceMax ?? x.priceAvg));

    const sampleCount = items.reduce((sum, x) => sum + Math.max(1, n(x.sampleCount)), 0);

    const baseConfidence = avg(items.map(x => x.confidence)) ?? 0.3;
    const sampleBonus = Math.min(0.25, Math.log10(Math.max(1, sampleCount)) * 0.12);
    const confidence = Math.min(0.95, Number((baseConfidence + sampleBonus).toFixed(2)));

    const sources = [...new Set(items.map(x => x.source).filter(Boolean))];

    await prisma.rlcGlobalKnowledgeAggregated.create({
      data: {
        normalizedKey: key,
        shortText: base.shortText,
        longText: base.longText,
        unit: base.unit,
        gewerk: base.gewerk,
        category: base.category,
        priceMin,
        priceAvg,
        priceMax,
        confidence,
        sampleCount,
        sources,
        isContextSensitive: items.some(x => x.isContextSensitive),
        needsReview: items.some(x => x.needsReview) || confidence < 0.65,
      }
    });

    created++;
  }

  console.log(JSON.stringify({
    ok: true,
    sourceRows: rows.length,
    aggregatedRows: created
  }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
'''

cmd = [
    "docker", "exec", "-i", "rlc-server",
    "sh", "-lc", "cd /app && node"
]

p = subprocess.run(
    cmd,
    input=NODE,
    text=True,
    capture_output=True
)

print(p.stdout)
if p.stderr:
    print(p.stderr)
if p.returncode != 0:
    raise SystemExit(p.returncode)
