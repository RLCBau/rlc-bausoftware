import { prisma } from "./src/lib/prisma";

const companyId = "4fdd084a-f544-4c37-a5e6-0d922acef28d";

async function main() {
  const company = await prisma.company.upsert({
    where: { id: companyId },
    update: {
      name: "RLC Test Company",
      code: "RLC-TEST",
    },
    create: {
      id: companyId,
      name: "RLC Test Company",
      code: "RLC-TEST",
    },
  });

  console.log("COMPANY_READY:", company.id, company.name, company.code);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
