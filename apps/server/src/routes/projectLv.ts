// apps/server/src/routes/projectLv.ts
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";

const router = express.Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

/** Log helper */
function log(...args: any[]) {
  console.log("[LV-API]", ...args);
}

/**
 * Garantisce che esista SEMPRE una companyId valida
 */
async function ensureCompanyId(req: Request): Promise<string> {
  const auth: any = (req as any).auth;

  if (auth && typeof auth.company === "string") {
    const found = await prisma.company.findUnique({ where: { id: auth.company } });
    if (found) return found.id;
  }

  if (process.env.DEV_COMPANY_ID) {
    const found = await prisma.company.findUnique({
      where: { id: process.env.DEV_COMPANY_ID },
    });
    if (found) return found.id;
  }

  const first = await prisma.company.findFirst();
  if (first) return first.id;

  const created = await prisma.company.create({
    data: { name: "Standard Firma", code: "STANDARD" },
  });
  return created.id;
}

/* =========================================================
   ✅ NEW helper: resolve project by (companyId + id/code) with DEV fallback
   - first try scoped by companyId
   - if not found -> fallback (id/code) unscoped (useful in DEV / missing auth)
========================================================= */
async function resolveProject(companyId: string, projectIdOrCode: string) {
  const key = String(projectIdOrCode || "").trim();
  if (!key) return null;

  // 1) strict scope
  const scoped = await prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: key }, { code: key }],
    },
  });
  if (scoped) return scoped;

  // 2) DEV fallback (unscoped) - do not break prod; still returns exact id/code match only
  const fallback = await prisma.project.findFirst({
    where: {
      OR: [{ id: key }, { code: key }],
    },
  });

  if (fallback) {
    log(
      "WARN: project resolved without company scope (likely DEV / auth mismatch).",
      "requested=",
      key,
      "companyId=",
      companyId,
      "project.companyId=",
      fallback.companyId
    );
  }

  return fallback;
}

/* =========================================================
   SEARCH LV (Prisma) — usa l'ULTIMO header (version desc)
   Alias multipli per non rompere il frontend:
   - GET /api/projects/:projectId/lv/search?q=...
   - GET /api/:projectId/lv/search?q=...
   - (NEW) GET /api/project-lv/:projectId/lv/search?q=...   <-- se montato su /api/project-lv
========================================================= */
async function handleLvSearch(req: Request, res: Response) {
  try {
    const companyId = await ensureCompanyId(req);

    const projectIdOrCode = String(req.params.projectId || "").trim();
    const q = String((req.query as any)?.q || "").trim();
    const take = Math.min(50, Math.max(1, Number((req.query as any)?.take || 20)));

    if (!projectIdOrCode) return res.status(400).json({ ok: false, error: "projectId fehlt" });
    if (!q) return res.json({ ok: true, items: [] });

    // ✅ resolve project by UUID or code, with company-scope + fallback
    const project = await resolveProject(companyId, projectIdOrCode);
    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
        hint: "projectId può essere UUID oppure project.code (es. BA-2025-DEMO)",
      });
    }

    const projectId = project.id;

    // latest header
    const header = await prisma.lVHeader.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { id: true, version: true, title: true },
    });

    if (!header) return res.json({ ok: true, items: [] });

    const items = await prisma.lVPosition.findMany({
      where: {
        lvId: header.id,
        OR: [
          { kurztext: { contains: q, mode: "insensitive" } },
          { langtext: { contains: q, mode: "insensitive" } },
          { position: { contains: q, mode: "insensitive" } },
          { einheit: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { position: "asc" },
      take,
      select: {
        id: true,
        position: true,
        kurztext: true,
        langtext: true,
        einheit: true,
        menge: true,
        einzelpreis: true,
      },
    });

    return res.json({
      ok: true,
      header,
      items: items.map((p) => ({
        id: p.id,
        pos: p.position,
        text: p.kurztext,
        langtext: p.langtext || "",
        unit: p.einheit,
        quantity: p.menge ?? 0,
        ep: p.einzelpreis ?? 0,
      })),
    });
  } catch (e: any) {
    console.error("[LV-API] search error", e);
    return res.status(500).json({ ok: false, error: e?.message || "search failed" });
  }
}

router.get("/projects/:projectId/lv/search", handleLvSearch);
router.get("/:projectId/lv/search", handleLvSearch);
// ✅ Alias per quando il router è montato su /api/project-lv
router.get("/project-lv/:projectId/lv/search", handleLvSearch);

/* =========================================================
   GET LV
   PROBLEMA: prima era SOLO "/project-lv/:projectId"
   Se monti router su app.use("/api/project-lv", router)
   allora chiamare /api/project-lv/:id dava 404.

   FIX:
   - aggiungo route principale "/:projectId"
   - mantengo anche "/project-lv/:projectId" come compatibilità
   - progetto risolto per ID o CODE (BA-2025-DEMO)
========================================================= */

async function handleGetProjectLv(req: Request, res: Response) {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    /* -------- 0. Projekt prüfen (ID O CODE) -------- */
    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
        hint: "projectId può essere UUID oppure project.code (es. BA-2025-DEMO)",
      });
    }

    const projectId = project.id;

    /* -------- 1. LV aus DB versuchen -------- */
    const header = await prisma.lVHeader.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });

    if (header) {
      const positions = await prisma.lVPosition.findMany({
        where: { lvId: header.id },
        orderBy: { position: "asc" },
      });

      log("LV aus DB gefunden. Header:", header.id, "Anzahl Pos:", positions.length);

      return res.json({
        ok: true,
        source: "db",
        header: {
          id: header.id,
          title: header.title,
          currency: header.currency,
          version: header.version,
        },
        items: positions.map((p) => ({
          id: p.id,
          pos: p.position,
          text: p.kurztext,
          langtext: p.langtext || "",
          unit: p.einheit,
          quantity: p.menge ?? 0,
          ep: p.einzelpreis ?? 0,
        })),
      });
    }

    /* -------- 2. Kein LV in DB → lv.json NUR für dieses Projekt -------- */
    const folderById = path.join(PROJECTS_ROOT, project.id);

    const safeCode = project.code ? project.code.replace(/[^A-Za-z0-9_\-]/g, "_") : null;
    const folderByCode = safeCode ? path.join(PROJECTS_ROOT, safeCode) : null;

    const candidatePaths: string[] = [path.join(folderById, "lv.json")];
    if (folderByCode) candidatePaths.push(path.join(folderByCode, "lv.json"));

    let lvJsonPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        lvJsonPath = p;
        break;
      }
    }

    if (!lvJsonPath) {
      log("Kein LV in DB und keine lv.json für Projekt gefunden:", projectIdOrCode);
      return res.json({ ok: true, source: "empty", header: null, items: [] });
    }

    log("lv.json gefunden unter:", lvJsonPath);

    const raw = fs.readFileSync(lvJsonPath, "utf8");
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[LV-API] lv.json ist kein gültiges JSON:", e);
      return res.status(500).json({ ok: false, error: "lv.json ist kein gültiges JSON" });
    }

    const itemsFromJson: any[] = Array.isArray(parsed.items) ? parsed.items : [];

    // nuovo header
    const newHeader = await prisma.lVHeader.create({
      data: {
        projectId,
        title: parsed.title || "LV aus Datei",
        currency: parsed.currency || "EUR",
        version: 1,
      },
    });

    const dataForDb = itemsFromJson.map((p, idx) => ({
      lvId: newHeader.id,
      position: String(p.pos ?? p.position ?? p.id ?? idx + 1),
      kurztext: String(p.text ?? p.kurztext ?? ""),
      langtext: p.langtext ? String(p.langtext) : "",
      einheit: String(p.unit ?? p.einheit ?? ""),
      menge:
        p.quantity !== undefined && p.quantity !== null
          ? Number(p.quantity)
          : p.menge ?? null,
      einzelpreis:
        p.ep !== undefined && p.ep !== null ? Number(p.ep) : p.einzelpreis ?? null,
      gesamt: p.gesamt ?? null,
      parentPos: p.parentPos ?? null,
    }));

    if (dataForDb.length > 0) {
      await prisma.lVPosition.createMany({ data: dataForDb });
    }

    log(
      "LV aus lv.json in DB importiert. Header:",
      newHeader.id,
      "Anzahl Pos:",
      dataForDb.length
    );

    return res.json({
      ok: true,
      source: "lvjson",
      header: {
        id: newHeader.id,
        title: newHeader.title,
        currency: newHeader.currency,
        version: newHeader.version,
      },
      items: dataForDb.map((p, idx) => ({
        id: `import-${idx}`,
        pos: p.position,
        text: p.kurztext,
        langtext: p.langtext || "",
        unit: p.einheit,
        quantity: p.menge ?? 0,
        ep: p.einzelpreis ?? 0,
      })),
    });
  } catch (err) {
    console.error("GET /api/project-lv/:projectId error:", err);
    return res.status(500).json({ ok: false, error: "Fehler beim Laden des LV" });
  }
}

/**
 * ✅ Route principale corretta (SE monti su /api/project-lv)
 * GET /api/project-lv/:projectId
 */
router.get("/:projectId", (req, res) => {
  // uniforma param name per handler
  (req as any).params.projectId = req.params.projectId;
  return handleGetProjectLv(req, res);
});

/**
 * ✅ Compatibilità con vecchio path:
 * GET /api/project-lv/project-lv/:projectId
 */
router.get("/project-lv/:projectId", (req, res) => {
  (req as any).params.projectId = req.params.projectId;
  return handleGetProjectLv(req, res);
});

export default router;
