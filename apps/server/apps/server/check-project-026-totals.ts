import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function n(v: any): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function calcTotal(rows: any[]) {
  return rows.reduce((sum, r) => {
    const qty = n(r.menge ?? r.quantity);
    const ep = n(
      r.x84Ep ??
      r.angebotUnitPrice ??
      r.unitPriceNet ??
      r.finalUnitPrice ??
      r.rlcKiUnitPrice ??
      r.preis ??
      r.price
    );
    const gp = n(
      r.x84Gp ??
      r.angebotTotal ??
      r.totalNet ??
      r.rlcKiTotal ??
      r.gesamt
    );

    return sum + (gp > 0 ? gp : qty * ep);
  }, 0);
}

async function main() {
  const projectNo = "BA-2026-026";

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { number: { contains: projectNo, mode: "insensitive" } },
        { code: { contains: projectNo, mode: "insensitive" } },
        { name: { contains: projectNo, mode: "insensitive" } },
      ],
    },
    take: 10,
  });

  console.log("PROJECTS:", projects.map((p: any) => ({
    id: p.id,
    number: p.number,
    code: p.code,
    name: p.name,
  })));

  if (!projects.length) {
    console.log("NO_PROJECT_FOUND_IN_SERVER_DB");
    return;
  }

  const projectId = projects[0].id;
  console.log("USING_PROJECT_ID:", projectId);

  const modelNames = Object.keys(prisma as any).filter((k) =>
    !k.startsWith("_") &&
    !k.startsWith("$") &&
    typeof (prisma as any)[k]?.findMany === "function"
  );

  for (const modelName of modelNames) {
    try {
      const model = (prisma as any)[modelName];

      const rows = await model.findMany({
        where: { projectId },
        take: 20000,
      });

      if (!rows.length) continue;

      console.log(modelName, {
        count: rows.length,
        total: Math.round(calcTotal(rows) * 100) / 100,
        first: {
          pos: rows[0].posNr ?? rows[0].positionNumber ?? rows[0].pos,
          kurztext: rows[0].kurztext ?? rows[0].shortText,
          menge: rows[0].menge ?? rows[0].quantity,
          ep: rows[0].x84Ep ?? rows[0].angebotUnitPrice ?? rows[0].finalUnitPrice ?? rows[0].unitPriceNet ?? rows[0].preis,
          gp: rows[0].x84Gp ?? rows[0].angebotTotal ?? rows[0].totalNet ?? rows[0].gesamt,
        },
      });
    } catch {}
  }
}

main()
  .catch((e) => {
    console.error("SCRIPT_ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
