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
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normUnit(unit) {
  const u = norm(unit);
  if (["m", "lfm", "laufmeter"].includes(u)) return "m";
  if (["m2", "qm"].includes(u)) return "m²";
  if (["m3", "cbm"].includes(u)) return "m³";
  if (["stk", "stueck", "st"].includes(u)) return "St";
  if (["psch", "pauschal"].includes(u)) return "Psch";
  return s(unit);
}

function extractTechnicalKey(text) {
  const t = norm(text);
  const parts = [];

  const dn = t.match(/\bdn\s*(\d{2,4})\b/);
  if (dn) parts.push(`dn${dn[1]}`);

  const da = t.match(/\bda\s*(\d{2,4})\b/);
  if (da) parts.push(`da${da[1]}`);

  const pn = t.match(/\bpn\s*(\d{1,3})\b/);
  if (pn) parts.push(`pn${pn[1]}`);

  const mm = t.match(/\b(\d{1,4})\s*x\s*(\d{1,4}(?:[,.]\d+)?)\s*mm\b/);
  if (mm) parts.push(`${mm[1]}x${mm[2].replace(",", ".")}mm`);

  for (const mat of ["pe hd", "hdpe", "pp", "pvc", "kg", "ggg", "beton", "stahl", "asphalt", "sand"]) {
    if (t.includes(mat)) parts.push(mat.replace(/\s+/g, ""));
  }

  return parts.join("|");
}

function baseText(shortText) {
  return norm(shortText)
    .replace(/\bdn\s*\d{2,4}\b/g, "")
    .replace(/\bda\s*\d{2,4}\b/g, "")
    .replace(/\bpn\s*\d{1,3}\b/g, "")
    .replace(/\b\d{1,4}\s*x\s*\d{1,4}(?:[,.]\d+)?\s*mm\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQualityKey(row) {
  const text = `${row.shortText || ""} ${row.longText || ""}`;
  const base = baseText(row.shortText || "");
  const tech = extractTechnicalKey(text);
  const unit = normUnit(row.unit);

  return [base, tech, unit].filter(Boolean).join("|");
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

function ratio(min, max) {
  const a = n(min);
  const b = n(max);
  if (a <= 0 || b <= 0) return 1;
  return b / a;
}

function isContextSensitiveText(r) {
  const t = norm(`${r.shortText || ""} ${r.longText || ""} ${r.category || ""} ${r.gewerk || ""}`);
  return [
    "baustelleneinrichtung",
    "verkehrssicherung",
    "rsa",
    "vermessung",
    "dokumentation",
    "as built",
    "asbuilt",
    "bestandszeichnung",
    "vorhaltung",
    "stillstand",
    "wartezeit",
    "erschwernis",
    "erschwerniszuschlag",
    "hausanschluss",
    "kampfmittel",
    "altlast",
    "wasserhaltung",
    "behoerde",
    "genehmigung",
    "sicherheits",
    "bauleitung",
    "koordination"
  ].some(x => t.includes(x));
}

async function main() {
  const rows = await prisma.rlcGlobalPosition.findMany({
    orderBy: { createdAt: "asc" }
  });

  const groups = new Map();

  for (const r of rows) {
    const key = buildQualityKey(r);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  await prisma.rlcGlobalKnowledgeAggregated.deleteMany({});

  let created = 0;
  let outlierGroups = 0;
  let contextGroups = 0;

  for (const [key, items] of groups.entries()) {
    const base = items[items.length - 1];

    const priceMin = minv(items.map(x => x.priceMin ?? x.priceAvg));
    const priceAvg = avg(items.map(x => x.priceAvg));
    const priceMax = maxv(items.map(x => x.priceMax ?? x.priceAvg));

    const sampleCount = items.reduce((sum, x) => sum + Math.max(1, n(x.sampleCount)), 0);
    const sources = [...new Set(items.map(x => x.source).filter(Boolean))];

    const contextSensitive = items.some(x => x.isContextSensitive) || items.some(isContextSensitiveText);
    const rangeRatio = ratio(priceMin, priceMax);
    const isOutlier = rangeRatio >= 5;

    let baseConfidence = avg(items.map(x => x.confidence)) ?? 0.3;
    let sampleBonus = Math.min(0.30, Math.log10(Math.max(1, sampleCount)) * 0.14);
    let confidence = Math.min(0.95, baseConfidence + sampleBonus);

    if (contextSensitive) confidence = Math.min(confidence, 0.45);
    if (isOutlier) confidence = Math.min(confidence, 0.50);
    if (sampleCount < 2) confidence = Math.min(confidence, 0.55);

    confidence = Number(confidence.toFixed(2));

    if (contextSensitive) contextGroups++;
    if (isOutlier) outlierGroups++;

    await prisma.rlcGlobalKnowledgeAggregated.create({
      data: {
        normalizedKey: key,
        shortText: base.shortText,
        longText: base.longText,
        unit: normUnit(base.unit),
        gewerk: base.gewerk,
        category: base.category,
        priceMin,
        priceAvg,
        priceMax,
        confidence,
        sampleCount,
        sources,
        isContextSensitive: contextSensitive,
        needsReview: contextSensitive || isOutlier || confidence < 0.70,
      }
    });

    created++;
  }

  console.log(JSON.stringify({
    ok: true,
    sourceRows: rows.length,
    aggregatedRows: created,
    contextGroups,
    outlierGroups
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
