import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { parseCollectionGaebBuffer } from "../routes/projectLv";

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function key(value: unknown) {
  return String(value ?? "").trim();
}

async function main() {
  const projects = await prisma.project.findMany({
    where: { description: "GAEB-Sammelimport" },
    select: {
      id: true,
      code: true,
      name: true,
      createdAt: true,
      lvSets: {
        orderBy: { version: "asc" },
        select: { id: true, version: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  let repairedProjects = 0;
  let repairedPositions = 0;
  let unresolvedPositions = 0;
  for (const project of projects) {
    const importsDir = path.join(PROJECTS_ROOT, project.code, "imports");
    if (!fs.existsSync(importsDir)) continue;

    const sourceName = fs.readdirSync(importsDir).find((name) =>
      /\.(?:x83|p83|d83)$/i.test(name)
    );
    if (!sourceName) continue;

    const header = project.lvSets[0];
    if (!header) continue;

    const blankRows = await prisma.lVPosition.findMany({
      where: {
        lvId: header.id,
        AND: [
          { kurztext: "" },
          { OR: [{ langtext: "" }, { langtext: null }] }
        ]
      },
      select: { id: true, position: true }
    });

    if (!blankRows.length) continue;

    const sourcePath = path.join(importsDir, sourceName);
    const parsed = await parseCollectionGaebBuffer(
      fs.readFileSync(sourcePath),
      sourceName
    );
    const parsedItems = Array.isArray(parsed.parsed?.items)
      ? parsed.parsed.items
      : [];
    const byPosition = new Map<string, any>();
    for (const item of parsedItems) {
      const pos = key(item?.pos ?? item?.position);
      if (!pos) continue;
      if (!byPosition.has(pos)) byPosition.set(pos, item);
    }

    let repairedHere = 0;
    let unresolvedHere = 0;

    for (const row of blankRows) {
      const item = byPosition.get(key(row.position));
      const kurztext = key(item?.text ?? item?.kurztext);
      const langtext = key(item?.langtext);

      if (!item || (!kurztext && !langtext)) {
        unresolvedHere += 1;
        continue;
      }

      await prisma.lVPosition.update({
        where: { id: row.id },
        data: {
          kurztext: kurztext || langtext,
          langtext: langtext || kurztext
        }
      });
      repairedHere += 1;
    }

    if (repairedHere > 0) repairedProjects += 1;
    repairedPositions += repairedHere;
    unresolvedPositions += unresolvedHere;

    console.log(
      project.code,
      "blank=", blankRows.length,
      "repaired=", repairedHere,
      "unresolved=", unresolvedHere,
      "source=", sourceName
    );
  }

  console.log({
    repairedProjects,
    repairedPositions,
    unresolvedPositions
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
