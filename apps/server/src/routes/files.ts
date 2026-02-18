// apps/server/src/routes/files.ts
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  ensureBucket,
  presignGet,
  presignPut,
  objectKey,
  bucket,
} from "../lib/s3";

const r = Router();

r.get("/health", async (_req, res) => {
  res.json({ ok: true, bucket });
});

r.get("/project/:projectId/list", async (req, res) => {
  try {
    const { projectId } = req.params;
    const docs = await prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    res.json(docs);
  } catch (e: any) {
    console.error("[files] list error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

r.post("/init", async (req, res) => {
  try {
    const schema = z.object({
      projectId: z.string().min(1),
      kind: z.enum(["CAD", "PDF", "LV", "IMAGE", "DOC", "OTHER"]),
      name: z.string().min(1),
      meta: z.any().optional(),
    });

    const { projectId, kind, name, meta } = schema.parse(req.body);
    await ensureBucket();

    const doc = await prisma.document.create({
      data: { projectId, kind, name, meta: meta ?? {} },
    });

    res.json({ ok: true, documentId: doc.id });
  } catch (e: any) {
    console.error("[files] init error:", e);
    res.status(400).json({ error: e?.message || "Bad request" });
  }
});

r.post("/upload-url", async (req, res) => {
  try {
    const schema = z.object({
      documentId: z.string().min(1),
      filename: z.string().min(1),
      contentType: z.string().min(1),
    });

    const { documentId, filename, contentType } = schema.parse(req.body);

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden" });

    const last = await prisma.fileVersion.findFirst({
      where: { documentId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    const key = objectKey(doc.projectId, doc.id, nextVersion, filename);
    const uploadUrl = await presignPut(key, contentType);

    const storageId = crypto.randomUUID();

    await prisma.storageObject.create({
      data: {
        id: storageId,
        bucket,
        key,
        size: BigInt(0),
        sha256: "",
        mime: contentType,
      },
    });

    const ver = await prisma.fileVersion.create({
      data: {
        documentId: doc.id,
        storageId,
        version: nextVersion,
      },
    });

    await prisma.document.update({
      where: { id: doc.id },
      data: { currentVid: ver.id, updatedAt: new Date() },
    });

    res.json({ ok: true, uploadUrl, versionId: ver.id, key });
  } catch (e: any) {
    console.error("[files] upload-url error:", e);
    res.status(400).json({ error: e?.message || "Bad request" });
  }
});

r.get("/download-url/:versionId", async (req, res) => {
  try {
    const { versionId } = req.params;

    const ver = await prisma.fileVersion.findUnique({
      where: { id: versionId },
      include: { storage: true },
    });
    if (!ver) return res.status(404).json({ error: "Version nicht gefunden" });

    const downloadUrl = await presignGet(ver.storage.key);
    res.json({ ok: true, downloadUrl });
  } catch (e: any) {
    console.error("[files] download-url error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

export default r;
