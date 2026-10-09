import { Router } from "express";
import { prisma } from "../lib/prisma";

function companyId(req: any) {
  return String(req.auth?.companyId || "").trim();
}

function userId(req: any) {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function isAdmin(req: any) {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  return role === "ADMIN" || role === "ADMINISTRATOR";
}

async function projectForCompany(req: any, cid: string, input: any) {
  const value = String(input || "").trim();
  if (!value) return null;
  const uid = userId(req);
  if (!uid) return null;

  return prisma.project.findFirst({
    where: {
      companyId: cid,
      OR: [{ id: value }, { code: value }],
      ...(isAdmin(req) ? {} : { members: { some: { userId: uid } } })
    },
    select: { id: true }
  });
}

async function canAccessProject(req: any, cid: string, projectId: string) {
  const uid = userId(req);
  if (!uid) return false;
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      companyId: cid,
      ...(isAdmin(req) ? {} : { members: { some: { userId: uid } } })
    },
    select: { id: true }
  });
  return Boolean(project);
}

function tags(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((x) => String(x || "").trim()).filter(Boolean)
  ));
}


const router = Router();

router.get("/", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const project = await projectForCompany(req, cid, req.query.projectId);
    if (!project) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });

    const items = await prisma.projectTask.findMany({
      where: { companyId: cid, projectId: project.id },
      orderBy: [{ done: "asc" }, { due: "asc" }, { updatedAt: "desc" }]
    });

    return res.json({ ok: true, items });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "TASK_LIST_FAILED" });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const project = await projectForCompany(req, cid, req.body?.projectId);
    if (!project) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ ok: false, error: "TITLE_REQUIRED" });

    const item = await prisma.projectTask.create({
      data: {
        companyId: cid,
        projectId: project.id,
        title,
        description: String(req.body?.description || "") || null,
        sourceType: String(req.body?.sourceType || "") || null,
        sourceId: String(req.body?.sourceId || "") || null,
        due: req.body?.due ? new Date(req.body.due) : null,
        done: Boolean(req.body?.done),
        assignee: String(req.body?.assignee || "") || null,
        priority: String(req.body?.priority || "med"),
        tags: tags(req.body?.tags)
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "TASK_CREATE_FAILED" });
  }
});

router.put("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.projectTask.findFirst({ where: { id, companyId: cid } });
    if (!current || !(await canAccessProject(req, cid, current.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const item = await prisma.projectTask.update({
      where: { id },
      data: {
        title: req.body?.title !== undefined ? String(req.body.title || "").trim() : undefined,
        description: req.body?.description !== undefined ? String(req.body.description || "") || null : undefined,
        sourceType: req.body?.sourceType !== undefined ? String(req.body.sourceType || "") || null : undefined,
        sourceId: req.body?.sourceId !== undefined ? String(req.body.sourceId || "") || null : undefined,
        due: req.body?.due !== undefined ? (req.body.due ? new Date(req.body.due) : null) : undefined,
        done: req.body?.done !== undefined ? Boolean(req.body.done) : undefined,
        assignee: req.body?.assignee !== undefined ? String(req.body.assignee || "") || null : undefined,
        priority: req.body?.priority !== undefined ? String(req.body.priority || "med") : undefined,
        tags: req.body?.tags !== undefined ? tags(req.body.tags) : undefined
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "TASK_UPDATE_FAILED" });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.projectTask.findFirst({ where: { id, companyId: cid } });
    if (!current || !(await canAccessProject(req, cid, current.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    await prisma.projectTask.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "TASK_DELETE_FAILED" });
  }
});

export default router;
