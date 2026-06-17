import subprocess

NODE = r'''
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ratio(min, max) {
  const a = n(min);
  const b = n(max);
  if (a <= 0 || b <= 0) return null;
  return b / a;
}

function isContextSensitiveText(r) {
  const t = `${r.shortText || ""} ${r.longText || ""} ${r.category || ""} ${r.gewerk || ""}`.toLowerCase();
  return [
    "baustelleneinrichtung",
    "verkehrssicherung",
    "rsa",
    "vermessung",
    "dokumentation",
    "as-built",
    "as built",
    "vorhaltung",
    "stillstand",
    "wartezeit",
    "erschwernis",
    "hausanschluss",
    "kampfmittel",
    "altlast",
    "wasserhaltung",
    "behörde",
    "genehmigung",
    "sicherheits",
    "bauleitung",
    "koordination"
  ].some(x => t.includes(x));
}

async function main() {
  const rows = await prisma.rlcGlobalKnowledgeAggregated.findMany();

  const total = rows.length;
  const contextSensitive = rows.filter(r => r.isContextSensitive || isContextSensitiveText(r));
  const usable = rows.filter(r => n(r.confidence) >= 0.60);
  const good = rows.filter(r => n(r.confidence) >= 0.70);
  const strong = rows.filter(r => n(r.confidence) >= 0.80);

  const priceOutliers = rows
    .map(r => ({ ...r, rangeRatio: ratio(r.priceMin, r.priceMax) }))
    .filter(r => r.rangeRatio !== null && r.rangeRatio >= 5)
    .sort((a,b) => b.rangeRatio - a.rangeRatio)
    .slice(0, 40);

  const topConfidence = [...rows]
    .sort((a,b) => n(b.confidence) - n(a.confidence))
    .slice(0, 20);

  const topSamples = [...rows]
    .sort((a,b) => n(b.sampleCount) - n(a.sampleCount))
    .slice(0, 20);

  const suspiciousContext = contextSensitive
    .filter(r => !r.isContextSensitive)
    .slice(0, 50);

  const result = {
    ok: true,
    total,
    usableConfidence60: usable.length,
    goodConfidence70: good.length,
    strongConfidence80: strong.length,
    contextSensitiveDetected: contextSensitive.length,
    suspiciousContextNotFlagged: suspiciousContext.length,
    priceOutlierCount: priceOutliers.length,
    topConfidence: topConfidence.map(r => ({
      shortText: r.shortText,
      unit: r.unit,
      priceMin: r.priceMin,
      priceAvg: r.priceAvg,
      priceMax: r.priceMax,
      confidence: r.confidence,
      sampleCount: r.sampleCount,
      isContextSensitive: r.isContextSensitive,
      sources: r.sources
    })),
    topSamples: topSamples.map(r => ({
      shortText: r.shortText,
      unit: r.unit,
      priceMin: r.priceMin,
      priceAvg: r.priceAvg,
      priceMax: r.priceMax,
      confidence: r.confidence,
      sampleCount: r.sampleCount,
      isContextSensitive: r.isContextSensitive,
      sources: r.sources
    })),
    suspiciousContextNotFlagged: suspiciousContext.map(r => ({
      id: r.id,
      shortText: r.shortText,
      unit: r.unit,
      priceMin: r.priceMin,
      priceAvg: r.priceAvg,
      priceMax: r.priceMax,
      confidence: r.confidence,
      sampleCount: r.sampleCount
    })),
    priceOutliers: priceOutliers.map(r => ({
      id: r.id,
      shortText: r.shortText,
      unit: r.unit,
      priceMin: r.priceMin,
      priceAvg: r.priceAvg,
      priceMax: r.priceMax,
      rangeRatio: Number(r.rangeRatio.toFixed(2)),
      confidence: r.confidence,
      sampleCount: r.sampleCount,
      isContextSensitive: r.isContextSensitive
    }))
  };

  console.log(JSON.stringify(result, null, 2));
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
