import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

(async () => {
  const projects = await prisma.project.findMany({
    select: {
      code: true,
      name: true,
      lvSets: {
        take: 1,
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          title: true,
          positions: { select: { x84UnitPrice: true, kurztext: true, langtext: true, einheit: true } },
        },
      },
    },
  });

  let positions = 0, x84Positions = 0, blankRows = 0, unitRows = 0;
  const groups: Record<string, any[]> = { empty: [], no_x84: [], partial_x84: [], full_x84: [] };

  for (const project of projects) {
    const latest = project.lvSets[0];
    const rows = latest?.positions || [];
    const x84 = rows.filter((r) => r.x84UnitPrice !== null).length;
    positions += rows.length;
    x84Positions += x84;
    blankRows += rows.filter((r) => !String(r.kurztext || r.langtext || "").trim()).length;
    unitRows += rows.filter((r) => String(r.einheit || "").trim()).length;
    const key = !rows.length ? "empty" : !x84 ? "no_x84" : x84 === rows.length ? "full_x84" : "partial_x84";
    groups[key].push({ code: project.code, version: latest?.version || null, title: latest?.title || null, positions: rows.length, x84 });
  }

  const summary = Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, {
    projects: value.length,
    positions: value.reduce((sum, row) => sum + row.positions, 0),
    x84: value.reduce((sum, row) => sum + row.x84, 0),
    sample: value.slice(0, 12),
  }]));

  console.log(JSON.stringify({ projects: projects.length, latestLvPositions: positions, x84Positions, withoutX84: positions - x84Positions, blankRows, unitRows, groups: summary }, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
