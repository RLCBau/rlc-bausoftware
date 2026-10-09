import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requirePermission } from "../middleware/rbac";
import { requireProjectMember } from "../middleware/guards";
import { presignPut, presignGet, bucket as storageBucket } from "../lib/s3";
import { storage } from "../storage/storageService";
import { z } from "zod";
import { validate, qList } from "../middleware/validation";
import { activeDmsRetention } from "../services/dmsArchive";

const router = Router({ mergeParams: true });

function safeDmsFilename(value: string): string {
  const base = String(value || "").replace(/\\/g, "/").split("/").pop() || "document.bin";
  return (base.replace(/[^A-Za-z0-9ÄÖÜäöüß._ -]+/g, "_").replace(/\.{2,}/g, ".").trim().slice(0, 180) || "document.bin");
}

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

const presignSchema = z.object({
  kind: z.string(),
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(200).default("application/octet-stream"),
  size: z.number().int().min(1).max(100 * 1024 * 1024),
});
router.post("/:projectId/documents/presign", requirePermission("docs:*"), requireProjectMember("projectId"), validate(presignSchema), async (req, res) => {
  const projectId = String(req.params.projectId);
  const { filename, mime } = req.body;
  const safeFilename = safeDmsFilename(filename);
  const key = `${projectId}/${Date.now()}-${safeFilename}`;
  const url = await presignPut(key, mime);
  res.json({ ok: true, bucket: storageBucket, key, url });
});

const finalizeSchema = z.object({
  kind: z.string(),
  name: z.string().min(1).max(255),
  bucket: z.string().min(1),
  key: z.string().min(1),
  size: z.number().int().min(1).max(100 * 1024 * 1024),
  mime: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
router.post("/:projectId/documents/finalize", requirePermission("docs:*"), requireProjectMember("projectId"), validate(finalizeSchema), async (req, res) => {
  const projectId = String(req.params.projectId);
  const { kind, name, bucket, key, size, mime, sha256 } = req.body;
  if (bucket !== storageBucket || !key.startsWith(projectId + "/") || key.includes("..")) {
    return res.status(400).json({ ok: false, error: "Ungültiger Storage-Verweis" });
  }

  const objectStat = await storage.stat(key);
  if (!objectStat) {
    return res.status(400).json({ ok: false, error: "Storage-Objekt fehlt" });
  }
  if (!Number.isFinite(objectStat.size) || objectStat.size < 1 || objectStat.size > 100 * 1024 * 1024) {
    return res.status(413).json({ ok: false, error: "Storage-Objekt überschreitet das zulässige Limit" });
  }
  if (objectStat.size !== size) {
    return res.status(409).json({ ok: false, error: "Dateigröße stimmt nicht mit Storage überein" });
  }
  if (objectStat.contentType && objectStat.contentType !== mime) {
    return res.status(409).json({ ok: false, error: "Content-Type stimmt nicht mit Storage überein" });
  }

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
  const projectId = String(req.params.projectId);
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.docId) }, include: { current: { include: { storage: true } } } });
  if (!doc?.current?.storage || doc.projectId !== projectId) {
    return res.status(404).json({ error: "Dokument nicht gefunden" });
  }
  const url = await presignGet(doc.current.storage.key);
  res.json({ ok: true, url });
});

router.delete("/:projectId/documents/:docId", requirePermission("docs:*"), requireProjectMember("projectId"), async (req, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.docId) },
    select: { id: true, projectId: true, name: true, meta: true, deletedAt: true }
  });
  if (!doc || doc.projectId !== String(req.params.projectId) || doc.deletedAt) {
    return res.status(404).json({ ok: false, error: "Dokument nicht gefunden" });
  }

  const retention = activeDmsRetention(doc.meta);
  if (retention.locked) {
    return res.status(409).json({
      ok: false,
      error: "LEGAL_RETENTION_LOCK",
      message: "Dokument ist aufgrund einer gesetzlichen Aufbewahrungsfrist gegen Löschung gesperrt.",
      retentionUntil: retention.until,
      retentionReason: retention.reason
    });
  }

  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
