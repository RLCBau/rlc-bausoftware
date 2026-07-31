import { prisma } from "../lib/prisma";
import { VORLAGEN_CATALOG } from "./catalog";

let seedPromise: Promise<number> | null = null;

export async function seedStandardVorlagen(): Promise<number> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const existingRows = await prisma.vorlageTemplate.findMany({
      where: {
        isStandard: true,
        slug: { in: VORLAGEN_CATALOG.map((entry) => entry.slug) },
      },
      select: {
        slug: true,
        title: true,
        description: true,
        categoryKey: true,
        categoryLabel: true,
        language: true,
        outputType: true,
        content: true,
        variables: true,
        tags: true,
        isProtected: true,
        isActive: true,
      },
    });
    const existingBySlug = new Map(existingRows.map((row) => [row.slug, row]));
    const changedEntries = VORLAGEN_CATALOG.filter((entry) => {
      const row = existingBySlug.get(entry.slug);
      if (!row) return true;
      return (
        row.title !== entry.title ||
        row.description !== entry.description ||
        row.categoryKey !== entry.categoryKey ||
        row.categoryLabel !== entry.categoryLabel ||
        row.language !== entry.language ||
        row.outputType !== entry.outputType ||
        row.content !== entry.content ||
        JSON.stringify(row.variables) !== JSON.stringify(entry.variables) ||
        JSON.stringify(row.tags) !== JSON.stringify(entry.tags) ||
        !row.isProtected ||
        !row.isActive
      );
    });

    for (const entry of changedEntries) {
      await prisma.vorlageTemplate.upsert({
        where: { slug: entry.slug },
        update: {
          title: entry.title,
          description: entry.description,
          categoryKey: entry.categoryKey,
          categoryLabel: entry.categoryLabel,
          language: entry.language,
          outputType: entry.outputType,
          content: entry.content,
          variables: entry.variables,
          tags: entry.tags,
          isStandard: true,
          isProtected: true,
          isActive: true,
        },
        create: {
          slug: entry.slug,
          title: entry.title,
          description: entry.description,
          categoryKey: entry.categoryKey,
          categoryLabel: entry.categoryLabel,
          language: entry.language,
          outputType: entry.outputType,
          content: entry.content,
          variables: entry.variables,
          tags: entry.tags,
          isStandard: true,
          isProtected: true,
          isActive: true,
        },
      });
    }

    return prisma.vorlageTemplate.count({
      where: { isStandard: true, isActive: true },
    });
  })().catch((error) => {
    seedPromise = null;
    throw error;
  });

  return seedPromise;
}
