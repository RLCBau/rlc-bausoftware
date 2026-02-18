// src/scripts/versioning_lv.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Kopiert das aktuellste LV eines Projekts in eine neue Version (version + 1).
 *
 *   npx ts-node src/scripts/versioning_lv.ts BA-2025-DEMO
 *   npx ts-node src/scripts/versioning_lv.ts BA-2025-DEMO "Variante mit Nachträgen"
 */

async function main() {
  const arg = process.argv[2];
  const titleSuffix = process.argv[3] ?? "Kopie";

  if (!arg) {
    console.error("Bitte Projekt-ID oder Code angeben.");
    process.exit(1);
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: arg }, { code: arg }] },
  });

  if (!project) {
    console.error("❌ Projekt nicht gefunden.");
    process.exit(1);
  }

  const lastHeader = await prisma.lVHeader.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    include: { positions: true },
  });

  if (!lastHeader) {
    console.error("⚠️ Kein LVHeader zum Kopieren vorhanden.");
    process.exit(1);
  }

  const newVersion = lastHeader.version + 1;

  console.log(
    `Kopiere LV-Version ${lastHeader.version} -> neue Version ${newVersion}...`,
  );

  const newHeader = await prisma.lVHeader.create({
    data: {
      projectId: project.id,
      title: `${lastHeader.title} – ${titleSuffix}`,
      version: newVersion,
      currency: lastHeader.currency,
    },
  });

  if (lastHeader.positions.length > 0) {
    await prisma.lVPosition.createMany({
      data: lastHeader.positions.map((p) => ({
        lvId: newHeader.id,
        position: p.position,
        kurztext: p.kurztext,
        langtext: p.langtext,
        einheit: p.einheit,
        menge: p.menge,
        einzelpreis: p.einzelpreis,
        gesamt: p.gesamt,
        parentPos: p.parentPos ?? null,
      })),
    });
  }

  console.log(
    `✅ Neue LV-Version erstellt: v${newHeader.version} (id=${newHeader.id})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
