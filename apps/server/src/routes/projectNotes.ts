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
      ...(isAdmin(req) ? {} : { projectMembers: { some: { userId: uid } } })
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
      ...(isAdmin(req) ? {} : { projectMembers: { some: { userId: uid } } })
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

async function noteAuthor(req: any): Promise<string> {
  const uid = userId(req);
  if (!uid) return "";
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  }).catch(() => null);
  return String(user?.name || user?.email || uid).trim();
}


const router = Router();

router.get("/", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const project = await projectForCompany(req, cid, req.query.projectId);
    if (!project) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });

    const items = await prisma.projectNote.findMany({
      where: { companyId: cid, projectId: project.id },
      orderBy: { updatedAt: "desc" }
    });

    return res.json({ ok: true, items });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "NOTE_LIST_FAILED" });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const project = await projectForCompany(req, cid, req.body?.projectId);
    if (!project) return res.status(400).json({ ok: false, error: "PROJECT_REQUIRED" });

    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "TEXT_REQUIRED" });

    const author = await noteAuthor(req);
    const item = await prisma.projectNote.create({
      data: {
        companyId: cid,
        projectId: project.id,
        text,
        tags: tags(req.body?.tags),
        author: author || null
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "NOTE_CREATE_FAILED" });
  }
});

router.put("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.projectNote.findFirst({ where: { id, companyId: cid } });
    if (!current || !(await canAccessProject(req, cid, current.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    if (req.body?.text !== undefined && !String(req.body.text || "").trim()) return res.status(400).json({ ok: false, error: "TEXT_REQUIRED" });
    const item = await prisma.projectNote.update({
      where: { id },
      data: {
        text: req.body?.text !== undefined ? String(req.body.text || "").trim() : undefined,
        tags: req.body?.tags !== undefined ? tags(req.body.tags) : undefined
      }
    });

    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "NOTE_UPDATE_FAILED" });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const cid = companyId(req);
    const id = String(req.params.id || "");

    const current = await prisma.projectNote.findFirst({ where: { id, companyId: cid } });
    if (!current || !(await canAccessProject(req, cid, current.projectId))) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    await prisma.projectNote.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "NOTE_DELETE_FAILED" });
  }
});

export default router;
