import { prisma } from "../src/lib/prisma";
import { seedStandardVorlagen } from "../src/vorlagen/seedStandardVorlagen";

async function main() {
  const count = await seedStandardVorlagen();
  console.log(`[Vorlagen-Center] ${count} RLC Standardvorlagen bereit.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
