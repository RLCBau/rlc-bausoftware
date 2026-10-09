import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

function companyId(req: any) {
  return String(req?.auth?.companyId || req?.auth?.company || "").trim();
}

function userId(req: any) {
  return String(req?.auth?.sub || "").trim();
}

function isAdmin(req: any) {
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  return role === "ADMIN" || role === "ADMINISTRATOR";
}

async function resolveProject(req: any, token: string) {
  const cid = companyId(req);
  const uid = userId(req);
  if (!cid || !token) return null;
  return prisma.project.findFirst({
    where: {
      companyId: cid,
      OR: [{ id: token }, { code: token }],
      ...(isAdmin(req) ? {} : { members: { some: { userId: uid } } }),
    },
    select: { id: true },
  });
}

router.get("/projects/:projectId/notes", async (req: any, res) => {
  const project = await resolveProject(req, String(req.params.projectId || "").trim());
  if (!project) return res.status(403).json({ error: "PROJECT_FORBIDDEN" });

  const list = await prisma.deliveryNote.findMany({
    where: { projectId: project.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return res.json(list);
});

router.post("/projects/:projectId/notes", async (req: any, res) => {
  const project = await resolveProject(req, String(req.params.projectId || "").trim());
  if (!project) return res.status(403).json({ error: "PROJECT_FORBIDDEN" });

  const body = req.body ?? {};
  const qty = body.qty ?? body.quantity;
  const parsedQty = qty === undefined || qty === null || qty === "" ? null : Number(qty);
  if (parsedQty !== null && !Number.isFinite(parsedQty)) {
    return res.status(400).json({ error: "INVALID_QUANTITY" });
  }

  const date = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }

  const row = await prisma.deliveryNote.create({
    data: {
      projectId: project.id,
      date,
      material: String(body.material || "").trim() || null,
      note: String(body.note || "").trim() || null,
      qty: parsedQty,
      unit: String(body.unit || "").trim() || null,
      raw: body.raw && typeof body.raw === "object" ? body.raw : null,
    },
  });
  return res.json(row);
});

export default router;
