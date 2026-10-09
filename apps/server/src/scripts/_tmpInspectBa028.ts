import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

(async () => {
  const header = await prisma.lVHeader.findFirst({
    where: { project: { code: "BA-2026-028" } },
    orderBy: { version: "desc" },
    include: { positions: { take: 10, orderBy: { position: "asc" } } },
  });
  console.log(JSON.stringify({ id: header?.id, version: header?.version, positions: header?.positions }, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
