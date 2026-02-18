// apps/server/src/routes/lv.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requirePermission } from "../middleware/rbac";
import { requireProjectMember } from "../middleware/guards";
import { z } from "zod";
import { validate, qList } from "../middleware/validation";
import { Prisma } from "@prisma/client";
import path from "path";
import fs from "fs";

const router = Router({ mergeParams: true });

// Root FS progetti (stesso schema degli altri moduli)
const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function projectLvDir(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "lv");
}

function writeLvSnapshot(projectId: string, payload: any, version: number) {
  const dir = projectLvDir(projectId);
  ensureDir(dir);

  const fileVersion = path.join(dir, `lv_v${String(version).padStart(3, "0")}.json`);
  const fileCurrent = path.join(dir, `lv_current.json`);

  fs.writeFileSync(fileVersion, JSON.stringify(payload, null, 2), "utf-8");
  fs.writeFileSync(fileCurrent, JSON.stringify(payload, null, 2), "utf-8");
}

router.get(
  "/:projectId/lv",
  requirePermission("lv:*"),
  requireProjectMember("projectId"),
  validate(qList, "query"),
  async (req, res) => {
    const { page, pageSize } = req.query as any;
    const projectId = String(req.params.projectId);

    const [rows, total] = await Promise.all([
      prisma.lVHeader.findMany({
        where: { projectId },
        orderBy: { version: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { positions: true },
      }),
      prisma.lVHeader.count({ where: { projectId } }),
    ]);

    res.json({ ok: true, page, pageSize, total, rows });
  }
);

const createSchema = z.object({
  title: z.string().min(1),
  currency: z.string().min(1).optional(),
});

router.post(
  "/:projectId/lv",
  requirePermission("lv:*"),
  requireProjectMember("projectId"),
  validate(createSchema),
  async (req, res) => {
    const projectId = String(req.params.projectId);

    const max = await prisma.lVHeader.aggregate({
      where: { projectId },
      _max: { version: true },
    });

    const lv = await prisma.lVHeader.create({
      data: {
        projectId,
        title: req.body.title,
        version: (max._max.version ?? 0) + 1,
        currency: req.body.currency ?? undefined,
      },
    });

    // Snapshot FS (header vuoto, positions vuote)
    const payload = {
      id: lv.id,
      projectId,
      title: lv.title,
      version: lv.version,
      currency: lv.currency,
      items: [],
      savedAt: new Date().toISOString(),
    };
    writeLvSnapshot(projectId, payload, lv.version);

    res.status(201).json({ ok: true, lv });
  }
);

const importSchema = z.object({
  title: z.string().min(1),
  currency: z.string().min(1).optional(),
  items: z.array(
    z.object({
      position: z.string().min(1),
      kurztext: z.string().min(1),
      langtext: z.string().optional(),
      einheit: z.string().min(1),
      menge: z.number().nonnegative().default(0),
      einzelpreis: z.number().nonnegative().optional(),
      gesamt: z.number().nonnegative().optional(),
      parentPos: z.string().optional(),
    })
  ),
});

router.post(
  "/:projectId/lv/import/gaeb",
  requirePermission("lv:*"),
  requireProjectMember("projectId"),
  validate(importSchema),
  async (req, res) => {
    const projectId = String(req.params.projectId);

    const max = await prisma.lVHeader.aggregate({
      where: { projectId },
      _max: { version: true },
    });

    const lv = await prisma.lVHeader.create({
      data: {
        projectId,
        title: req.body.title,
        version: (max._max.version ?? 0) + 1,
        currency: req.body.currency ?? undefined,
      },
    });

    await prisma.lVPosition.createMany({
      data: req.body.items.map((it: any) => ({
        lvId: lv.id,
        position: it.position,
        kurztext: it.kurztext,
        langtext: it.langtext ?? null,
        einheit: it.einheit,
        menge: new Prisma.Decimal(it.menge ?? 0),
        einzelpreis:
          it.einzelpreis == null ? null : new Prisma.Decimal(it.einzelpreis),
        gesamt: it.gesamt == null ? null : new Prisma.Decimal(it.gesamt),
        parentPos: it.parentPos ?? null,
      })),
    });

    const positions = await prisma.lVPosition.findMany({
      where: { lvId: lv.id },
      orderBy: { position: "asc" },
    });

    // Snapshot FS completo (header + items)
    const payload = {
      id: lv.id,
      projectId,
      title: lv.title,
      version: lv.version,
      currency: lv.currency,
      items: positions,
      savedAt: new Date().toISOString(),
    };
    writeLvSnapshot(projectId, payload, lv.version);

    res.status(201).json({ ok: true, lvId: lv.id, count: positions.length });
  }
);

router.get(
  "/:projectId/lv/:lvId/export/gaeb",
  requirePermission("lv:*"),
  requireProjectMember("projectId"),
  async (req, res) => {
    const projectId = String(req.params.projectId);
    const lvId = String(req.params.lvId);

    const lv = await prisma.lVHeader.findUnique({
      where: { id: lvId },
      include: { positions: true },
    });

    if (!lv) return res.status(404).json({ error: "LV nicht gefunden" });

    const payload = {
      id: lv.id,
      projectId,
      title: lv.title,
      version: lv.version,
      currency: lv.currency,
      items: lv.positions,
      exportedAt: new Date().toISOString(),
    };

    // (opzionale) salva anche export come snapshot
    writeLvSnapshot(projectId, payload, lv.version);

    res
      .header("Content-Type", "application/json")
      .attachment(`LV_${lv.version}.json`)
      .send(JSON.stringify(payload, null, 2));
  }
);

export default router;
