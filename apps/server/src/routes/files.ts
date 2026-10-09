// apps/server/src/routes/files.ts
import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { storage } from "../storage/storageService";
import { activeDmsRetention } from "../services/dmsArchive";
import {
  ensureBucket,
  presignDownload,
  presignPut,
  objectKey,
  bucket,
} from "../lib/s3";

const r = Router();

async function ensureProjectAccess(req: any, res: any, projectId: string): Promise<boolean> {
  const companyId = String(req?.auth?.companyId || req?.auth?.company || "").trim();
  const userId = String(req?.auth?.sub || "").trim();
  if (!companyId || !userId) {
    res.status(403).json({ error: "Projektzugriff nicht erlaubt" });
    return false;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true },
  });
  if (!project) {
    res.status(403).json({ error: "Projekt gehört nicht zur Firma oder existiert nicht" });
    return false;
  }

  const role = String(req?.auth?.companyRole || req?.auth?.role || "").toUpperCase();
  if (role === "ADMIN" || role === "ADMINISTRATOR") return true;

  const member = await prisma.projectMember.findFirst({
    where: { projectId: project.id, userId },
    select: { id: true },
  });
  if (!member) {
    res.status(403).json({ error: "Nicht im Projekt" });
    return false;
  }
  return true;
}

function expectedKeyPrefix(projectId: string, documentId: string): string {
  return `${projectId}/${documentId}/`;
}

function safeUploadFilename(value: string): string {
  const name = String(value || "").replace(/\\/g, "/").split("/").pop() || "document.bin";
  const cleaned = name.replace(/[^A-Za-z0-9ÄÖÜäöüß._ -]+/g, "_").replace(/\.{2,}/g, ".").trim();
  return cleaned.slice(0, 180) || "document.bin";
}

const ACTIVE_CONTENT_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
  "application/ecmascript",
]);
const ACTIVE_CONTENT_EXTENSIONS = new Set([".html", ".htm", ".xhtml", ".svg", ".js", ".mjs", ".cjs"]);

function validateDmsUpload(filename: string, contentType: string): string | null {
  const safeName = safeUploadFilename(filename).toLowerCase();
  const extension = safeName.includes(".") ? `.${safeName.split(".").pop()}` : "";
  const mime = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (ACTIVE_CONTENT_EXTENSIONS.has(extension) || ACTIVE_CONTENT_MIME_TYPES.has(mime)) {
    return "Aktive HTML/SVG/JavaScript-Dateien sind im DMS nicht zulässig.";
  }
  return null;
}

function lockedDocumentResponse(res:any, meta:any){
  const retention=activeDmsRetention(meta);
  if(retention.locked || meta?.evidenceLocked===true){
    res.status(409).json({ok:false,error:"DOCUMENT_EVIDENCE_LOCKED",message:"Dieses Dokument ist revisions-/aufbewahrungsgesperrt. Neue Inhalte müssen als separates Dokument bzw. Korrektur/Nachtrag abgelegt werden.",retentionUntil:retention.until,retentionReason:retention.reason});
    return true;
  }
  return false;
}

const directUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

r.get("/health", async (_req, res) => {
  res.json({ ok: true, bucket });
});

r.get("/project/:projectId/list", async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!(await ensureProjectAccess(req, res, String(projectId)))) return;
    const docs = await prisma.document.findMany({
      where: { projectId },
      include: {
        versions: {
          orderBy: { version: "asc" }
        }
      },
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
    if (!(await ensureProjectAccess(req, res, projectId))) return;
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
    const safeFilename = safeUploadFilename(filename);
    const uploadError = validateDmsUpload(safeFilename, contentType);
    if (uploadError) return res.status(415).json({ error: uploadError });

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden" });
    if (!(await ensureProjectAccess(req, res, doc.projectId))) return;
    if (lockedDocumentResponse(res, (doc as any).meta)) return;

    const last = await prisma.fileVersion.findFirst({
      where: { documentId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    const key = objectKey(doc.projectId, doc.id, nextVersion, safeFilename);
    const uploadUrl = await presignPut(key, contentType);

    res.json({
      ok: true,
      uploadUrl,
      key,
      documentId: doc.id,
      version: nextVersion,
      contentType
    });
  } catch (e: any) {
    console.error("[files] upload-url error:", e);
    res.status(400).json({ error: e?.message || "Bad request" });
  }
});


r.post("/upload-complete", async (req, res) => {
  try {
    const schema = z.object({
      documentId: z.string().min(1),
      key: z.string().min(1),
      version: z.number().int().positive(),
      contentType: z.string().min(1),
      size: z.number().int().nonnegative().max(100 * 1024 * 1024).optional(),
    });

    const {
      documentId,
      key,
      version,
      contentType,
      size
    } = schema.parse(req.body);

    const doc = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!doc) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    if (!(await ensureProjectAccess(req, res, doc.projectId))) return;
    if (lockedDocumentResponse(res, (doc as any).meta)) return;

    const requiredPrefix = expectedKeyPrefix(doc.projectId, doc.id);
    if (!key.startsWith(requiredPrefix) || key.includes("..")) {
      return res.status(400).json({ error: "Ungültiger Storage-Key" });
    }
    const uploadError = validateDmsUpload(key.split("/").pop() || "document.bin", contentType);
    if (uploadError) return res.status(415).json({ error: uploadError });

    const objectStat = await storage.stat(key);
    if (!objectStat) {
      return res.status(400).json({ error: "Storage-Objekt fehlt" });
    }
    if (!Number.isFinite(objectStat.size) || objectStat.size < 0 || objectStat.size > 100 * 1024 * 1024) {
      return res.status(413).json({ error: "Storage-Objekt überschreitet das zulässige Limit" });
    }
    if (size !== undefined && size !== objectStat.size) {
      return res.status(409).json({ error: "Dateigröße stimmt nicht mit Storage überein" });
    }
    if (objectStat.contentType && objectStat.contentType !== contentType) {
      return res.status(409).json({ error: "Content-Type stimmt nicht mit Storage überein" });
    }

    const existing = await prisma.fileVersion.findFirst({
      where: {
        documentId,
        version
      }
    });

    if (existing) {
      return res.json({
        ok: true,
        versionId: existing.id,
        existing: true
      });
    }

    const storageId = crypto.randomUUID();

    await prisma.storageObject.create({
      data: {
        id: storageId,
        bucket,
        key,
        size: BigInt(objectStat.size),
        sha256: "",
        mime: contentType,
      },
    });

    const ver = await prisma.fileVersion.create({
      data: {
        documentId,
        storageId,
        version,
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        currentVid: ver.id,
        updatedAt: new Date()
      },
    });

    res.json({
      ok: true,
      versionId: ver.id
    });
  } catch (e: any) {
    console.error("[files] upload-complete error:", e);
    res.status(400).json({
      error: e?.message || "Bad request"
    });
  }
});


r.post("/upload-direct", directUpload.single("file"), async (req, res) => {
  try {
    const documentId = String(req.body?.documentId || "").trim();
    const file = req.file;

    if (!documentId) {
      return res.status(400).json({ error: "documentId fehlt" });
    }

    if (!file) {
      return res.status(400).json({ error: "Datei fehlt" });
    }
    const uploadError = validateDmsUpload(file.originalname, file.mimetype);
    if (uploadError) return res.status(415).json({ error: uploadError });

    const doc = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!doc) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    if (!(await ensureProjectAccess(req, res, doc.projectId))) return;
    if (lockedDocumentResponse(res, (doc as any).meta)) return;

    const last = await prisma.fileVersion.findFirst({
      where: { documentId },
      orderBy: { version: "desc" }
    });

    const nextVersion = (last?.version ?? 0) + 1;

    const filename =
      String(file.originalname || "document.bin")
        .replace(/[^\w.\-]+/g, "_");

    const key = objectKey(
      doc.projectId,
      doc.id,
      nextVersion,
      filename
    );

    /*
     * CRITICO:
     * prima salviamo realmente il file.
     * Solo dopo creiamo StorageObject + FileVersion.
     */
    await storage.put({
      key,
      body: file.buffer,
      contentType: file.mimetype || "application/octet-stream"
    });

    const storageId = crypto.randomUUID();

    const result = await prisma.$transaction(async (tx) => {
      await tx.storageObject.create({
        data: {
          id: storageId,
          bucket,
          key,
          size: BigInt(file.size),
          sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
          mime: file.mimetype || "application/octet-stream"
        }
      });

      const version = await tx.fileVersion.create({
        data: {
          documentId: doc.id,
          storageId,
          version: nextVersion
        }
      });

      await tx.document.update({
        where: { id: doc.id },
        data: {
          currentVid: version.id,
          updatedAt: new Date()
        }
      });

      return version;
    });

    console.log("[files] upload-direct OK", {
      documentId,
      version: nextVersion,
      key,
      size: file.size
    });

    res.json({
      ok: true,
      documentId,
      versionId: result.id,
      version: nextVersion,
      key,
      size: file.size
    });
  } catch (e: any) {
    console.error("[files] upload-direct error:", e);

    res.status(500).json({
      error: e?.message || "Upload fehlgeschlagen"
    });
  }
});


r.get("/document/:documentId/versions", async (req, res) => {
  try {
    const documentId = String(req.params.documentId || "").trim();

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          include: { storage: true }
        }
      }
    });

    if (!doc) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    if (!(await ensureProjectAccess(req, res, doc.projectId))) return;

    const versions = await Promise.all(
      doc.versions.map(async (v: any) => ({
        id: v.id,
        version: v.version,
        current: doc.currentVid === v.id,
        storageId: v.storageId,
        key: v.storage?.key || "",
        mime: v.storage?.mime || "",
        size: Number(v.storage?.size || 0),
        createdAt: v.createdAt || null,
        exists: v.storage?.key
          ? await storage.exists(v.storage.key)
          : false
      }))
    );

    res.json({
      ok: true,
      documentId,
      currentVid: doc.currentVid,
      versions
    });
  } catch (e: any) {
    console.error("[files] versions error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

r.post("/document/:documentId/cleanup-missing", async (req, res) => {
  try {
    const documentId = String(req.params.documentId || "").trim();

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          include: { storage: true }
        }
      }
    });

    if (!doc) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    if (!(await ensureProjectAccess(req, res, doc.projectId))) return;

    const retention = activeDmsRetention((doc as any).meta);
    if (retention.locked) {
      return res.status(409).json({
        ok: false,
        error: "LEGAL_RETENTION_LOCK",
        message: "Versionen dieses Dokuments dürfen während der gesetzlichen Aufbewahrungsfrist nicht bereinigt werden.",
        retentionUntil: retention.until,
        retentionReason: retention.reason
      });
    }

    const removed: number[] = [];

    for (const version of doc.versions) {
      if (version.id === doc.currentVid) continue;

      const exists = version.storage?.key
        ? await storage.exists(version.storage.key)
        : false;

      if (exists) continue;

      await prisma.$transaction(async (tx) => {
        await tx.fileVersion.delete({
          where: { id: version.id }
        });

        if (version.storageId) {
          await tx.storageObject.deleteMany({
            where: { id: version.storageId }
          });
        }
      });

      removed.push(version.version);
    }

    console.log("[files] cleanup-missing", {
      documentId,
      removed
    });

    res.json({
      ok: true,
      documentId,
      removed
    });
  } catch (e: any) {
    console.error("[files] cleanup-missing error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});


r.post("/document/:documentId/version/:versionId/restore", async (req, res) => {
  try {
    const documentId = String(req.params.documentId || "").trim();
    const versionId = String(req.params.versionId || "").trim();

    const doc = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!doc) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    if (!(await ensureProjectAccess(req, res, doc.projectId))) return;

    const version = await prisma.fileVersion.findFirst({
      where: {
        id: versionId,
        documentId
      },
      include: { storage: true }
    });

    if (!version) {
      return res.status(404).json({ error: "Version nicht gefunden" });
    }

    if (!version.storage?.key) {
      return res.status(400).json({ error: "Speicherobjekt fehlt" });
    }

    const exists = await storage.exists(version.storage.key);

    if (!exists) {
      return res.status(409).json({
        error: "Datei dieser Version ist nicht im Speicher vorhanden"
      });
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        currentVid: version.id,
        updatedAt: new Date()
      }
    });

    console.log("[files] version restored", {
      documentId,
      versionId,
      version: version.version
    });

    res.json({
      ok: true,
      documentId,
      versionId,
      version: version.version
    });
  } catch (e: any) {
    console.error("[files] restore version error:", e);
    res.status(500).json({
      error: e?.message || "Version konnte nicht wiederhergestellt werden"
    });
  }
});

r.get("/download-url/:versionId", async (req, res) => {
  try {
    const { versionId } = req.params;

    const ver = await prisma.fileVersion.findUnique({
      where: { id: versionId },
      include: { storage: true, document: { select: { projectId: true } } },
    });
    if (!ver) return res.status(404).json({ error: "Version nicht gefunden" });
    if (!(await ensureProjectAccess(req, res, ver.document.projectId))) return;

    const downloadUrl = await presignDownload(ver.storage.key);
    res.json({ ok: true, downloadUrl });
  } catch (e: any) {
    console.error("[files] download-url error:", e);
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

export default r;
