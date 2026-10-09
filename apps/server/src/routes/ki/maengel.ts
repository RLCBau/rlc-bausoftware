import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import sharp from "sharp";

import { prisma } from "../../lib/prisma";
import { analyzeImageForDefects } from "../../services/ki/vision";
import PDF from "../../services/pdf/maengelPdf";
import { sendMangelMail } from "../../services/mailer";
import { archiveProjectFileVersion } from "../../services/dmsArchive";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile?: boolean) => void) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (!mime.startsWith("image/")) {
      return cb(new Error("ONLY_IMAGES_ALLOWED"));
    }
    cb(null, true);
  },
});

function mangelUserId(req: any): string {
  return String(req?.auth?.sub || "").trim();
}

function mangelRole(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

async function resolveMangelProject(req: any, token: any) {
  const companyId = String(req?.auth?.companyId || req?.auth?.company || "").trim();
  const userId = mangelUserId(req);
  const value = String(token || "").trim();
  if (!companyId || !userId || !value) return null;

  const privileged = ["ADMIN", "ADMINISTRATOR"].includes(mangelRole(req));
  return prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: value }, { code: value }],
      ...(privileged ? {} : { projectMembers: { some: { userId } } }),
    },
    select: { id: true, code: true, name: true },
  });
}

function mangelDir(projectId: string) {
  const dir = path.join(process.cwd(), "uploads", projectId, "maengel");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeImageExtension(file: Express.Multer.File) {
  const original = path.extname(String(file.originalname || "")).toLowerCase();
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
  if (allowed.has(original)) return original;
  const mime = String(file.mimetype || "").toLowerCase();
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/heic") return ".heic";
  if (mime === "image/heif") return ".heif";
  return ".jpg";
}

function safePdfFromUrl(projectId: string, value: any): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    return null;
  }

  const prefix = `/files/${projectId}/maengel/`;
  if (!pathname.startsWith(prefix)) return null;

  const fileName = path.basename(pathname);
  if (!/^[A-Za-z0-9._-]{1,180}\.pdf$/i.test(fileName)) return null;

  const abs = path.join(mangelDir(projectId), fileName);
  const root = path.resolve(mangelDir(projectId)) + path.sep;
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(root) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }
  return resolved;
}

router.post("/upload", upload.single("file"), async (req: any, res) => {
  try {
    const project = await resolveMangelProject(req, req.body?.projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ ok: false, error: "FILE_REQUIRED" });

    try {
      const meta = await sharp(file.buffer, { failOn: "error" }).metadata();
      if (!meta.format || !["jpeg", "png", "webp", "heif"].includes(String(meta.format).toLowerCase())) {
        return res.status(415).json({ ok: false, error: "UNSUPPORTED_IMAGE_FORMAT" });
      }
    } catch {
      return res.status(415).json({ ok: false, error: "INVALID_IMAGE_CONTENT" });
    }

    const ext = safeImageExtension(file);
    const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const localPath = path.join(mangelDir(project.id), fileName);
    fs.writeFileSync(localPath, file.buffer, { mode: 0o640 });

    let detected: any = {
      title: "Mangel",
      desc: "",
      cat: "Allgemein",
      prio: "mittel",
      lv: "",
    };

    try {
      const result = await analyzeImageForDefects(localPath);
      detected = {
        title: (result as any)?.results?.[0]?.label || "Mangel",
        desc: (result as any)?.message || "",
        cat: "Allgemein",
        prio: "mittel",
        lv: "",
      };
    } catch (error: any) {
      console.warn("[maengel/upload] Vision fallback:", error?.message || error);
    }

    return res.json({
      url: `/files/${project.id}/maengel/${fileName}`,
      detected,
    });
  } catch (error: any) {
    console.error("[maengel/upload]", error);
    return res.status(500).json({ ok: false, error: "UPLOAD_ANALYSIS_FAILED" });
  }
});

router.post("/save", async (req: any, res) => {
  try {
    const project = await resolveMangelProject(req, req.body?.projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length > 2000) return res.status(413).json({ ok: false, error: "TOO_MANY_ITEMS" });

    const payload = JSON.stringify({ items }, null, 2);
    if (Buffer.byteLength(payload, "utf8") > 5 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: "MAENGEL_PAYLOAD_TOO_LARGE" });
    }

    fs.writeFileSync(path.join(mangelDir(project.id), "maengel.json"), payload, {
      encoding: "utf8",
      mode: 0o640,
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[maengel/save]", error);
    return res.status(500).json({ ok: false, error: "SAVE_FAILED" });
  }
});

router.post("/load", async (req: any, res) => {
  try {
    const project = await resolveMangelProject(req, req.body?.projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const file = path.join(mangelDir(project.id), "maengel.json");
    if (!fs.existsSync(file)) return res.json({ items: [] });
    return res.json(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    console.error("[maengel/load]", error);
    return res.status(500).json({ ok: false, error: "LOAD_FAILED" });
  }
});

router.post("/pdf", async (req: any, res) => {
  try {
    const project = await resolveMangelProject(req, req.body?.projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ ok: false, error: "ITEMS_REQUIRED" });
    if (items.length > 2000) return res.status(413).json({ ok: false, error: "TOO_MANY_ITEMS" });

    const fileName = `Maengelprotokoll_${Date.now()}.pdf`;
    const pdfPath = path.join(mangelDir(project.id), fileName);
    await PDF.create(items, pdfPath);

    await archiveProjectFileVersion({
      projectIdOrCode: project.id,
      filename: fileName,
      kind: "PDF",
      localPath: pdfPath,
      uploadedBy: mangelUserId(req) || null,
      meta: {
        module: "MAENGEL",
        source: "ki.maengel.pdf",
        items: items.length,
      },
    });

    return res.json({ url: `/files/${project.id}/maengel/${fileName}` });
  } catch (error) {
    console.error("[maengel/pdf]", error);
    return res.status(500).json({ ok: false, error: "PDF_EXPORT_FAILED" });
  }
});

router.post("/notify", async (req: any, res) => {
  try {
    const project = await resolveMangelProject(req, req.body?.projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const to = String(req.body?.to || "").trim().slice(0, 254);
    const subject = String(req.body?.subject || "Mängelprotokoll").trim().slice(0, 300);
    const html = String(req.body?.html || "").slice(0, 100_000);
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
      return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
    }

    const attachments: { filename: string; path: string }[] = [];
    const pdfPath = safePdfFromUrl(project.id, req.body?.pdfUrl);
    if (req.body?.pdfUrl && !pdfPath) {
      return res.status(400).json({ ok: false, error: "INVALID_PDF_REFERENCE" });
    }
    if (pdfPath) {
      attachments.push({
        filename: String(req.body?.fileName || path.basename(pdfPath))
          .replace(/[^A-Za-z0-9._-]+/g, "_")
          .slice(0, 180),
        path: pdfPath,
      });
    }

    await sendMangelMail({ to, subject, html, attachments });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[maengel/notify]", error);
    return res.status(500).json({ ok: false, error: "MAIL_SEND_FAILED" });
  }
});

export default router;
