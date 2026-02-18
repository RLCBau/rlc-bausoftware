import "dotenv/config";
import { prisma } from "../lib/prisma";
import { randomUUID } from "crypto";

async function run() {
  const projectId = "e6a613af-e85f-40f4-bce6-125beb466570";
  const companyId = process.env.DEV_COMPANY_ID || "dev-company";

  console.log("🔍 Seed für Projekt:", projectId);

  // 1) Company sicherstellen
  await prisma.company.upsert({
    where: { id: companyId },
    update: {},
    create: { id: companyId, name: "Demo Company" },
  });

  // 2) Projekt sicherstellen – OHNE Konflikt mit unique Feldern
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
  });

  let project;

  if (existing) {
    console.log("✔ Projekt existiert bereits → wird NICHT neu erstellt");
    project = existing;
  } else {
    console.log("✔ Projekt existiert NICHT → wird erstellt");

    project = await prisma.project.create({
      data: {
        id: projectId,
        name: "BA-2025-TEST",
        ort: "Beispielstadt",
        companyId,
        code: "P-" + Math.floor(Math.random() * 1000000),
        slug: "ba-2025-test-" + randomUUID().slice(0, 6),
        path: "/projects/" + projectId,
      },
    });
  }

  // 3) Alte LV-Header löschen
  await prisma.lVHeader.deleteMany({
    where: { projectId },
  });

  console.log("✔ Alte LV-Versionen entfernt");

  // 4) 50 Positionen
  const positions = Array.from({ length: 50 }, (_, i) => {
    const n = i + 1;
    return {
      position: `001.${String(n).padStart(3, "0")}`,
      kurztext: `Beispiel Tiefbau Position ${n}`,
      langtext: `Detaillierte Beschreibung zu Position ${n}`,
      einheit: "m",
      menge: n * 2,
      einzelpreis: 15 + n * 0.5,
      gesamt: (n * 2) * (15 + n * 0.5),
    };
  });

  // 5) Neues LV anlegen
  await prisma.lVHeader.create({
    data: {
      projectId,
      title: "Demo-LV Tiefbau (50 Positionen)",
      version: 1,
      positions: {
        create: positions,
      },
    },
  });

  console.log("🎉 Demo-LV mit 50 Positionen erfolgreich erstellt!");
}

run()
  .catch((e) => {
    console.error("❌ Fehler:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
