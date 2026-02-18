// prisma/seed-demo.ts
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const company = await db.company.upsert({
    where: { code: "RLC" },
    update: {},
    create: { code: "RLC", name: "RLC Tiefbau GmbH" },
  });

  const project = await db.project.create({
    data: {
      code: "PRJ-TEST-001",
      name: "Demo Projekt Tiefbau",
      description: "Testprojekt für Upload & Persistenz",
      companyId: company.id,
    },
  });

  console.log("✅ Demo-Projekt erstellt:");
  console.log("projectId:", project.id);
}

main().finally(() => db.$disconnect());
