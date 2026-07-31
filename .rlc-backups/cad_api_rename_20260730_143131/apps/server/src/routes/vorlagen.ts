import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";
import {
  compileVorlageText,
  createVorlageDocx,
  createVorlagePdf,
  createVorlageXlsx,
  flattenVorlageValues,
  safeVorlageFileName,
  type VorlageValueMap,
} from "../services/vorlagenExportService";
import {
  VORLAGEN_CATEGORIES,
  VORLAGEN_CATALOG_COUNT,
} from "../vorlagen/catalog";
import { seedStandardVorlagen } from "../vorlagen/seedStandardVorlagen";

const router = Router();

function companyIdFromRequest(req: Express.Request): string {
  return String(
    (req.auth as any)?.companyId ??
      (req.auth as any)?.company ??
      process.env.DEV_COMPANY_ID ??
      ""
  ).trim();
}

function userIdFromRequest(req: Express.Request): string {
  return String((req.auth as any)?.sub ?? (req.user as any)?.id ?? "system").trim();
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function asContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "");
  }
  return String(value ?? "");
}

function accessibleTemplateWhere(companyId: string, id?: string) {
  return {
    ...(id ? { id } : {}),
    isActive: true,
    OR: [{ isStandard: true }, { companyId }],
  };
}

async function loadProjectContext(companyId: string, projectToken: string) {
  if (!projectToken) return null;
  return prisma.project.findFirst({
    where: {
      companyId,
      OR: [
        { id: projectToken },
        { code: projectToken },
        { slug: projectToken },
      ],
    },
    select: {
      id: true,
      code: true,
      number: true,
      name: true,
      client: true,
      place: true,
    },
  });
}

async function buildValues(
  req: Express.Request,
  rawValues: Record<string, unknown> | null | undefined,
  projectToken: string
): Promise<{ values: VorlageValueMap; project: Awaited<ReturnType<typeof loadProjectContext>> }> {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const [company, project, user] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        address: true,
        phone: true,
        email: true,
      },
    }),
    loadProjectContext(companyId, projectToken),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }).catch(() => null),
  ]);

  const date = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const defaults: VorlageValueMap = {
    "Firma.Name": company?.name ?? "",
    "Firma.Adresse": company?.address ?? "",
    "Firma.Telefon": company?.phone ?? "",
    "Firma.Email": company?.email ?? "",
    "Projekt.Name": project?.name ?? "",
    "Projekt.Nummer": project?.number ?? project?.code ?? projectToken,
    "Projekt.Ort": project?.place ?? "",
    "Kunde.Name": project?.client ?? "",
    "Bearbeiter.Name": user?.name ?? user?.email ?? "",
    Datum: date,
  };

  return {
    values: {
      ...defaults,
      ...flattenVorlageValues(rawValues),
    },
    project,
  };
}

function contentDisposition(fileName: string): string {
  return `attachment; filename="${fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function exportDirectory(companyId: string, projectCode?: string | null): string {
  const safeProjectCode = text(projectCode);
  const safeCompanyId = text(companyId).replace(/[^A-Za-z0-9_-]/g, "_");
  if (/^[A-Za-z0-9_-]{1,120}$/.test(safeProjectCode)) {
    return path.join(PROJECTS_ROOT, safeProjectCode, "vorlagen");
  }
  return path.join(COMPANIES_ROOT, safeCompanyId || "unknown", "vorlagen", "exports");
}

router.use(async (_req, res, next) => {
  try {
    await seedStandardVorlagen();
    next();
  } catch (error: any) {
    console.error("[Vorlagen-Center] Katalog konnte nicht initialisiert werden", error);
    res.status(500).json({
      ok: false,
      error: "Vorlagen-Datenbank ist nicht initialisiert.",
      detail: error?.message || String(error),
    });
  }
});

router.get("/categories", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const grouped = await prisma.vorlageTemplate.groupBy({
    by: ["categoryKey"],
    where: accessibleTemplateWhere(companyId),
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((row) => [row.categoryKey, row._count._all]));

  res.json({
    ok: true,
    totalStandard: VORLAGEN_CATALOG_COUNT,
    categories: VORLAGEN_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      description: category.description,
      count: counts.get(category.key) ?? 0,
    })),
  });
});

router.get("/documents", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const projectId = text(req.query.projectId);
  const documents = await prisma.vorlageDocument.findMany({
    where: {
      companyId,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json({ ok: true, documents });
});

router.post("/documents", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const templateId = text(req.body?.templateId) || null;
  const projectId = text(req.body?.projectId) || null;
  const title = text(req.body?.title);
  const content = asContent(req.body?.content);

  if (!title || !content) {
    return res.status(400).json({ ok: false, error: "Titel und Inhalt sind erforderlich." });
  }

  if (templateId) {
    const allowed = await prisma.vorlageTemplate.findFirst({
      where: accessibleTemplateWhere(companyId, templateId),
      select: { id: true },
    });
    if (!allowed) return res.status(404).json({ ok: false, error: "Vorlage nicht gefunden." });
  }

  const document = await prisma.vorlageDocument.create({
    data: {
      companyId,
      projectId,
      templateId,
      title,
      content,
      values: req.body?.values ?? {},
      status: text(req.body?.status) || "ENTWURF",
      outputFormat: text(req.body?.outputFormat) || "DOCUMENT",
      createdByUserId: userId,
    },
  });
  res.status(201).json({ ok: true, document });
});

router.get("/", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const search = text(req.query.search);
  const category = text(req.query.category);
  const favoritesOnly = text(req.query.favorites) === "true";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(12, Number(req.query.pageSize) || 48));

  const favoriteRows = await prisma.vorlageFavorite.findMany({
    where: { companyId, userId },
    select: { templateId: true },
  });
  const favoriteIds = favoriteRows.map((row) => row.templateId);

  const where: any = {
    ...accessibleTemplateWhere(companyId),
    ...(category ? { categoryKey: category } : {}),
    ...(favoritesOnly ? { id: { in: favoriteIds } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { tags: { has: search.toLowerCase() } },
              ],
            },
          ],
        }
      : {}),
  };

  const [total, templates] = await Promise.all([
    prisma.vorlageTemplate.count({ where }),
    prisma.vorlageTemplate.findMany({
      where,
      orderBy: [{ isStandard: "desc" }, { title: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const favoriteSet = new Set(favoriteIds);

  res.json({
    ok: true,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    templates: templates.map((template) => ({
      ...template,
      favorite: favoriteSet.has(template.id),
    })),
  });
});

router.get("/:id", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const template = await prisma.vorlageTemplate.findFirst({
    where: accessibleTemplateWhere(companyId, text(req.params.id)),
  });
  if (!template) return res.status(404).json({ ok: false, error: "Vorlage nicht gefunden." });

  const favorite = await prisma.vorlageFavorite.findUnique({
    where: {
      companyId_userId_templateId: {
        companyId,
        userId,
        templateId: template.id,
      },
    },
    select: { id: true },
  });
  res.json({ ok: true, template: { ...template, favorite: Boolean(favorite) } });
});

router.post("/:id/favorite", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const template = await prisma.vorlageTemplate.findFirst({
    where: accessibleTemplateWhere(companyId, text(req.params.id)),
    select: { id: true },
  });
  if (!template) return res.status(404).json({ ok: false, error: "Vorlage nicht gefunden." });

  const key = {
    companyId_userId_templateId: {
      companyId,
      userId,
      templateId: template.id,
    },
  };
  const existing = await prisma.vorlageFavorite.findUnique({ where: key });
  if (existing) {
    await prisma.vorlageFavorite.delete({ where: { id: existing.id } });
    return res.json({ ok: true, favorite: false });
  }
  await prisma.vorlageFavorite.create({
    data: { companyId, userId, templateId: template.id },
  });
  res.json({ ok: true, favorite: true });
});

router.post("/:id/copy", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const source = await prisma.vorlageTemplate.findFirst({
    where: accessibleTemplateWhere(companyId, text(req.params.id)),
  });
  if (!source) return res.status(404).json({ ok: false, error: "Vorlage nicht gefunden." });

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const template = await prisma.vorlageTemplate.create({
    data: {
      slug: `${source.slug}-kopie-${suffix}`,
      companyId,
      sourceTemplateId: source.id,
      title: text(req.body?.title) || `${source.title} – Firmenkopie`,
      description: source.description,
      categoryKey: source.categoryKey,
      categoryLabel: source.categoryLabel,
      language: source.language,
      outputType: source.outputType,
      content: source.content as any,
      variables: source.variables as any,
      tags: source.tags,
      isStandard: false,
      isProtected: false,
      isActive: true,
      createdByUserId: userId,
    },
  });
  res.status(201).json({ ok: true, template });
});

router.post("/:id/compile", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const template = await prisma.vorlageTemplate.findFirst({
    where: accessibleTemplateWhere(companyId, text(req.params.id)),
  });
  if (!template) return res.status(404).json({ ok: false, error: "Vorlage nicht gefunden." });

  const projectToken = text(req.body?.projectId ?? req.body?.projectKey);
  const { values, project } = await buildValues(req, req.body?.values, projectToken);
  const compiledContent = compileVorlageText(template.content, values);

  await prisma.vorlageTemplate.update({
    where: { id: template.id },
    data: { usageCount: { increment: 1 } },
  });

  res.json({
    ok: true,
    title: template.title,
    compiledContent,
    values,
    project,
  });
});

router.post("/:id/export", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const userId = userIdFromRequest(req);
  const template = await prisma.vorlageTemplate.findFirst({
    where: accessibleTemplateWhere(companyId, text(req.params.id)),
  });
  if (!template) return res.status(404).json({ ok: false, error: "Vorlage nicht gefunden." });

  const format = text(req.body?.format || req.query.format || "pdf").toLowerCase();
  if (!["pdf", "docx", "xlsx"].includes(format)) {
    return res.status(400).json({ ok: false, error: "Format muss PDF, DOCX oder XLSX sein." });
  }

  const projectToken = text(req.body?.projectId ?? req.body?.projectKey);
  const { values, project } = await buildValues(req, req.body?.values, projectToken);
  const title = text(req.body?.title) || template.title;
  const sourceContent =
    typeof req.body?.content === "string" && req.body.content.trim()
      ? req.body.content
      : asContent(template.content);
  const compiledContent = compileVorlageText(sourceContent, values);
  const baseName = safeVorlageFileName(title);
  const directory = exportDirectory(companyId, project?.code ?? projectToken);
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `${baseName}_${new Date().toISOString().replace(/[:.]/g, "-")}.${format}`;
  const filePath = path.join(directory, fileName);

  if (format === "pdf") {
    const company = await loadRlcPdfCompanyFromRequest(req);
    await createVorlagePdf({
      pdfPath: filePath,
      title,
      content: compiledContent,
      projectId: project?.code ?? projectToken,
      projectName: project?.name,
      company,
    });
  } else if (format === "docx") {
    fs.writeFileSync(filePath, createVorlageDocx(title, compiledContent));
  } else {
    fs.writeFileSync(filePath, await createVorlageXlsx(title, compiledContent, values));
  }

  await Promise.all([
    prisma.vorlageTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } },
    }),
    prisma.vorlageDocument.create({
      data: {
        companyId,
        projectId: project?.id ?? (projectToken || null),
        templateId: template.id,
        title,
        content: compiledContent,
        values: values as any,
        status: "EXPORTIERT",
        outputFormat: format.toUpperCase(),
        createdByUserId: userId,
      },
    }),
  ]);

  res.setHeader("Content-Type",
    format === "pdf"
      ? "application/pdf"
      : format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", contentDisposition(fileName));
  res.sendFile(filePath);
});

router.put("/:id", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const current = await prisma.vorlageTemplate.findFirst({
    where: { id: text(req.params.id), companyId, isActive: true },
  });
  if (!current || current.isStandard || current.isProtected) {
    return res.status(403).json({
      ok: false,
      error: "RLC Standardvorlagen sind geschützt. Bitte zuerst eine Firmenkopie erstellen.",
    });
  }

  const template = await prisma.vorlageTemplate.update({
    where: { id: current.id },
    data: {
      ...(text(req.body?.title) ? { title: text(req.body.title) } : {}),
      ...(typeof req.body?.description === "string"
        ? { description: req.body.description.trim() }
        : {}),
      ...(typeof req.body?.content === "string" ? { content: req.body.content } : {}),
      ...(Array.isArray(req.body?.variables) ? { variables: req.body.variables } : {}),
      ...(Array.isArray(req.body?.tags)
        ? { tags: req.body.tags.map(text).filter(Boolean) }
        : {}),
      version: { increment: 1 },
    },
  });
  res.json({ ok: true, template });
});

router.delete("/:id", async (req, res) => {
  const companyId = companyIdFromRequest(req);
  const current = await prisma.vorlageTemplate.findFirst({
    where: { id: text(req.params.id), companyId, isActive: true },
  });
  if (!current || current.isStandard || current.isProtected) {
    return res.status(403).json({ ok: false, error: "Diese Vorlage kann nicht gelöscht werden." });
  }
  await prisma.vorlageTemplate.update({
    where: { id: current.id },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

export default router;
