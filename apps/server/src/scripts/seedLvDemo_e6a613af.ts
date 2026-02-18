// apps/server/src/scripts/seedLvDemo_e6a613af.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function run() {
  const projectId = "e6a613af-e85f-40f4-bce6-125beb466570";

  // 50 Demo-Positionen generieren
  const demoPositions = Array.from({ length: 50 }, (_, i) => {
    const n = i + 1;
    return {
      pos: `001.${String(n).padStart(3, "0")}`,
      text: `Beispiel Tiefbau Position ${n}`,
      unit: "m",
      quantity: n * 2,             // 2,4,6,…
      ep: 15 + n * 0.5,            // 15,5 – 40,0 €
    };
  });

  console.log("Lege Demo-LV für Projekt", projectId, "an …");

  // Neues LV-Set mit 50 Positionen anlegen
  await prisma.project.update({
    where: { id: projectId },
    data: {
      lvSets: {
        create: {
          title: "Demo-LV Tiefbau (50 Positionen)",
          version: 1,
          positions: {
            create: demoPositions.map((p) => ({
              position: p.pos,
              kurztext: p.text,
              langtext: p.text,
              einheit: p.unit,
              menge: p.quantity,
              einzelpreis: p.ep,
              gesamt: p.quantity * p.ep,
            })),
          },
        },
      },
    },
  });

  console.log("✅ Demo-LV angelegt.");
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
