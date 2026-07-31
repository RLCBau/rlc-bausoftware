import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requirePermission } from "../middleware/rbac";
import { requireProjectMember } from "../middleware/guards";
import { presignPut, presignGet } from "../lib/storage";
import { z } from "zod";
import { validate, qList } from "../middleware/validation";

const router = Router({ mergeParams: true });

router.get("/:projectId/documents", requirePermission("docs:read"), requireProjectMember("projectId"), validate(qList,"query"), async (req, res) => {
  const { page, pageSize, q } = req.query as any;
  const projectId = String(req.params.projectId);
  const where: any = { projectId, deletedAt: null };
  if (q) where.name = { contains: q, mode: "insensitive" };
  const [rows, total] = await Promise.all([
    prisma.document.findMany({ where, include: { current: { include: { storage: true } } }, orderBy: { createdAt: "desc" }, skip: (page-1)*pageSize, take: pageSize }),
    prisma.document.count({ where })
  ]);
  res.json({ ok: true, page, pageSize, total, rows });
});

const presignSchema = z.object({ kind: z.string(), filename: z.string(), mime: z.string().default("application/octet-stream"), size: z.number().min(1) });
router.post("/:projectId/documents/presign", requirePermission("docs:*"), requireProjectMember("projectId"), validate(presignSchema), async (req, res) => {
  const projectId = String(req.params.projectId);
  const { filename, mime } = req.body;
  const key = `${projectId}/${Date.now()}-${filename.replace(/[^\w.\-]+/g,"_")}`;
  const url = await presignPut(key, mime);
  res.json({ ok: true, bucket: process.env.S3_BUCKET, key, url });
});

const finalizeSchema = z.object({ kind: z.string(), name: z.string(), bucket: z.string(), key: z.string(), size: z.number(), mime: z.string(), sha256: z.string() });
router.post("/:projectId/documents/finalize", requirePermission("docs:*"), requireProjectMember("projectId"), validate(finalizeSchema), async (req, res) => {
  const projectId = String(req.params.projectId);
  const { kind, name, bucket, key, size, mime, sha256 } = req.body;

  const sto = await prisma.storageObject.upsert({
    where: { id: `${bucket}/${key}` },
    update: { size: BigInt(size), mime, sha256 },
    create: { id: `${bucket}/${key}`, bucket, key, size: BigInt(size), mime, sha256 }
  });

  const doc = await prisma.document.create({ data: { projectId, kind: kind as any, name } });
  const ver = await prisma.fileVersion.create({ data: { documentId: doc.id, storageId: sto.id, version: 1, uploadedBy: req.auth?.sub } });
  await prisma.document.update({ where: { id: doc.id }, data: { currentVid: ver.id } });

  res.status(201).json({ ok: true, document: doc, version: ver });
});

router.get("/:projectId/documents/:docId/url", requirePermission("docs:read"), requireProjectMember("projectId"), async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.docId) }, include: { current: { include: { storage: true } } } });
  if (!doc?.current?.storage) return res.status(404).json({ error: "Dokument nicht gefunden" });
  const url = await presignGet(doc.current.storage.key);
  res.json({ ok: true, url });
});

router.delete("/:projectId/documents/:docId", requirePermission("docs:*"), requireProjectMember("projectId"), async (req, res) => {
  await prisma.document.update({ where: { id: String(req.params.docId) }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
