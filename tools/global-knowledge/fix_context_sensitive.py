import subprocess

NODE = r'''
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const keywords = [
  "baustelleneinrichtung",
  "verkehrssicherung",
  "rsa",
  "vermessung",
  "dokumentation",
  "as-built",
  "as built",
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
  "behörde",
  "genehmigung",
  "sicherheits",
  "bauleitung",
  "koordination"
];

function isContextSensitive(r) {
  const t = `${r.shortText || ""} ${r.longText || ""} ${r.category || ""} ${r.gewerk || ""}`.toLowerCase();
  return keywords.some(k => t.includes(k));
}

async function main() {
  const rows = await prisma.rlcGlobalKnowledgeAggregated.findMany();

  let flagged = 0;

  for (const r of rows) {
    if (!isContextSensitive(r)) continue;

    await prisma.rlcGlobalKnowledgeAggregated.update({
      where: { id: r.id },
      data: {
        isContextSensitive: true,
        needsReview: true,
        confidence: Math.min(Number(r.confidence || 0.3), 0.45)
      }
    });

    flagged++;
  }

  const rawRows = await prisma.rlcGlobalPosition.findMany();
  let rawFlagged = 0;

  for (const r of rawRows) {
    if (!isContextSensitive(r)) continue;

    await prisma.rlcGlobalPosition.update({
      where: { id: r.id },
      data: {
        isContextSensitive: true,
        needsReview: true,
        confidence: Math.min(Number(r.confidence || 0.3), 0.45)
      }
    });

    rawFlagged++;
  }

  console.log(JSON.stringify({
    ok: true,
    aggregatedChecked: rows.length,
    aggregatedFlagged: flagged,
    rawChecked: rawRows.length,
    rawFlagged
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
