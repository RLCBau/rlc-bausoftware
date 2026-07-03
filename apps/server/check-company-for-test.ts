import { prisma } from "./src/lib/prisma";

async function main() {
  console.log("COMPANIES:");
  console.log(await prisma.company.findMany({
    select: { id: true, name: true, code: true },
    take: 20,
  }));

  console.log("KDB_COMPANY_IDS:");
  console.log(await prisma.kalkulationsDbEntry.groupBy({
    by: ["companyId"],
    _count: { _all: true },
  }));
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
