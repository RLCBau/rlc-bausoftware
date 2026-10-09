import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

import { prisma } from "../lib/prisma";
import { storage } from "../storage/storageService";
import { bucket, objectKey } from "../lib/s3";

export type DmsKind = "CAD" | "PDF" | "LV" | "IMAGE" | "DOC" | "OTHER";

function dmsMetaObject(value: any): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function laterIsoDate(a: any, b: any): string | null {
  const values = [a, b]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.time));
  if (!values.length) return null;
  values.sort((x, y) => y.time - x.time);
  return new Date(values[0].time).toISOString();
}

export function mergeDmsMeta(existing: any, incoming: any): Record<string, any> {
  const current = dmsMetaObject(existing);
  const next = dmsMetaObject(incoming);
  const merged = { ...current, ...next };
  const retentionUntil = laterIsoDate(current.retentionUntil, next.retentionUntil);
  if (retentionUntil) merged.retentionUntil = retentionUntil;
  if (current.retentionLocked || next.retentionLocked || retentionUntil) {
    merged.retentionLocked = true;
  }
  return merged;
}

export function activeDmsRetention(meta: any, at = new Date()): { locked: boolean; until: string | null; reason: string | null } {
  const source = dmsMetaObject(meta);
  const raw = String(source.retentionUntil || "").trim();
  const time = raw ? Date.parse(raw) : NaN;
  const locked = Boolean(source.retentionLocked) && Number.isFinite(time) && time > at.getTime();
  return {
    locked,
    until: Number.isFinite(time) ? new Date(time).toISOString() : null,
    reason: String(source.retentionReason || source.legalBasis || "").trim() || null,
  };
}

async function resolveProjectDbId(input: string): Promise<string | null> {
  const value = String(input || "").trim();
  if (!value) return null;

  const byId = await prisma.project.findUnique({
    where: { id: value },
    select: { id: true },
  });
  if (byId) return byId.id;

  const byCode = await prisma.project.findMany({
    where: { code: value },
    select: { id: true },
    take: 2,
  });
  if (byCode.length === 1) return byCode[0].id;
  if (byCode.length > 1) {
    throw new Error(`DMS-Projektcode ist tenant-übergreifend mehrdeutig: ${value}`);
  }
  return null;
}

export async function archiveProjectFileVersion(opts: {
  projectIdOrCode: string;
  filename: string;
  kind: DmsKind;
  localPath: string;
  uploadedBy?: string | null;
  meta?: any;
}) {
  const {
    projectIdOrCode,
    filename,
    kind,
    localPath,
    uploadedBy,
    meta
  } = opts;

  if (!fs.existsSync(localPath)) {
    throw new Error(`DMS-Datei nicht gefunden: ${localPath}`);
  }

  const projectId = await resolveProjectDbId(projectIdOrCode);

  if (!projectId) {
    throw new Error(`DMS-Projekt nicht gefunden: ${projectIdOrCode}`);
  }

  /*
   * Gleicher Projekt + gleicher Name = gleiche Dokumentakte.
   * Weitere Erzeugungen werden echte Versionen.
   */
  let doc = await prisma.document.findFirst({
    where: {
      projectId,
      name: filename,
      deletedAt: null
    },
    orderBy: { createdAt: "asc" }
  });

  if (!doc) {
    doc = await prisma.document.create({
      data: {
        projectId,
        kind: kind as any,
        name: filename,
        meta: meta ?? {}
      }
    });
  }

  const last = await prisma.fileVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: { version: "desc" }
  });

  const nextVersion = (last?.version ?? 0) + 1;

  const cleanFilename = path.basename(filename)
    .replace(/[^\w.\-]+/g, "_");

  const key = objectKey(
    projectId,
    doc.id,
    nextVersion,
    cleanFilename
  );

  const buffer = await fs.promises.readFile(localPath);
  const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const storageId = crypto.randomUUID();

  let contentType = "application/octet-stream";

  if (/\.pdf$/i.test(filename)) contentType = "application/pdf";
  else if (/\.json$/i.test(filename)) contentType = "application/json";
  else if (/\.jpe?g$/i.test(filename)) contentType = "image/jpeg";
  else if (/\.png$/i.test(filename)) contentType = "image/png";

  /*
   * Erst physisch speichern.
   * Erst danach DB-Version erzeugen.
   */
  await storage.put({
    key,
    body: buffer,
    contentType
  });

  try {
    const version = await prisma.$transaction(async (tx) => {
      await tx.storageObject.create({
        data: {
          id: storageId,
          bucket,
          key,
          size: BigInt(buffer.length),
          sha256: fileSha256,
          mime: contentType
        }
      });

      const fv = await tx.fileVersion.create({
        data: {
          documentId: doc!.id,
          storageId,
          version: nextVersion,
          uploadedBy: uploadedBy ?? null
        }
      });

      await tx.document.update({
        where: { id: doc!.id },
        data: {
          currentVid: fv.id,
          updatedAt: new Date(),
          meta: mergeDmsMeta(doc!.meta, meta)
        }
      });

      return fv;
    });

    console.log("[DMS archive]", {
      projectId,
      documentId: doc.id,
      filename,
      version: nextVersion,
      size: buffer.length
    });

    return {
      documentId: doc.id,
      versionId: version.id,
      version: nextVersion,
      key
    };
  } catch (error) {
    /*
     * Kein verwaistes Storage-Objekt bei DB-Fehler.
     */
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
}

export async function archiveProjectBufferVersion(opts: {
  projectIdOrCode: string;
  filename: string;
  kind: DmsKind;
  buffer: Buffer;
  uploadedBy?: string | null;
  meta?: any;
}) {
  const safeName =
    path.basename(String(opts.filename || "document.bin"))
      .replace(/[^\w.\-]+/g, "_") || "document.bin";

  const tempPath = path.join(
    os.tmpdir(),
    `rlc-dms-${Date.now()}-${crypto.randomUUID()}-${safeName}`
  );

  await fs.promises.writeFile(tempPath, opts.buffer);

  try {
    return await archiveProjectFileVersion({
      projectIdOrCode: opts.projectIdOrCode,
      filename: opts.filename,
      kind: opts.kind,
      localPath: tempPath,
      uploadedBy: opts.uploadedBy,
      meta: opts.meta
    });
  } finally {
    await fs.promises.unlink(tempPath).catch(() => undefined);
  }
}

export async function registerExistingStorageVersion(opts: {
  projectIdOrCode: string;
  filename: string;
  kind: DmsKind;
  storageId: string;
  uploadedBy?: string | null;
  meta?: any;
}) {
  const {
    projectIdOrCode,
    filename,
    kind,
    storageId,
    uploadedBy,
    meta
  } = opts;

  const projectId = await resolveProjectDbId(projectIdOrCode);

  if (!projectId) {
    throw new Error(`DMS-Projekt nicht gefunden: ${projectIdOrCode}`);
  }

  const stored = await prisma.storageObject.findUnique({
    where: { id: storageId }
  });

  if (!stored) {
    throw new Error(`DMS-StorageObject nicht gefunden: ${storageId}`);
  }

  let doc = await prisma.document.findFirst({
    where: {
      projectId,
      name: filename,
      deletedAt: null
    },
    orderBy: { createdAt: "asc" }
  });

  if (!doc) {
    doc = await prisma.document.create({
      data: {
        projectId,
        kind: kind as any,
        name: filename,
        meta: meta ?? {}
      }
    });
  }

  const existing = await prisma.fileVersion.findFirst({
    where: {
      documentId: doc.id,
      storageId
    }
  });

  if (existing) {
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        currentVid: existing.id,
        updatedAt: new Date(),
        meta: mergeDmsMeta(doc.meta, meta)
      }
    });

    return {
      documentId: doc.id,
      versionId: existing.id,
      version: existing.version,
      storageId,
      existing: true
    };
  }

  const last = await prisma.fileVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: { version: "desc" }
  });

  const nextVersion = (last?.version ?? 0) + 1;

  const version = await prisma.fileVersion.create({
    data: {
      documentId: doc.id,
      storageId,
      version: nextVersion,
      uploadedBy: uploadedBy ?? null
    }
  });

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      currentVid: version.id,
      updatedAt: new Date(),
      meta: mergeDmsMeta(doc.meta, meta)
    }
  });

  console.log("[DMS link existing storage]", {
    projectId,
    documentId: doc.id,
    filename,
    version: nextVersion,
    storageId
  });

  return {
    documentId: doc.id,
    versionId: version.id,
    version: nextVersion,
    storageId,
    existing: false
  };
}
