// apps/server/src/routes/mail.routes.ts
import express from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const r = express.Router();

/**
 * Allegati:
 * - base64 (contentBase64/pdfBase64)  ✅ legacy + compat
 * - url (relative /projects/... oppure https://...) ✅ consigliato per PDF server-side
 */
const AttachmentSchema = z.object({
  fileName: z.string().min(1).optional(),
  mime: z.string().min(3).optional(),

  // base64 variants
  contentBase64: z.string().min(10).optional(),
  pdfBase64: z.string().min(10).optional(),

  // URL variant (recommended)
  url: z.string().min(3).optional(), // "/projects/..." or "https://..."
});

const Schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),

  // legacy single-file (base64)
  pdfBase64: z.string().min(10).optional(),
  fileName: z.string().optional(),

  // new multi-file
  attachments: z.array(AttachmentSchema).optional(),
});

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ENV: ${name}`);
  return v;
}

function createTransporter() {
  const host = mustEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = mustEnv("SMTP_USER");
  const pass = mustEnv("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function safeFrom() {
  return process.env.MAIL_FROM || '"RLC Bausoftware" <noreply@rlc-bau.de>';
}

function normalizeFilename(name?: string, fallback = "Anhang") {
  const n = String(name || "").trim();
  if (!n) return fallback;
  return n.replace(/[^\w.\-()+\s]+/g, "_").slice(0, 140);
}

/**
 * ✅ Sicurezza path:
 * consentiamo SOLO URL relative che iniziano con /projects/
 * e le risolviamo dentro PROJECTS_ROOT.
 */
function resolveProjectsFileFromUrl(url: string) {
  const u = String(url || "").trim();
  if (!u.startsWith("/projects/")) return null;

  // /projects/<FSKEY>/... -> <PROJECTS_ROOT>/<FSKEY>/...
  const rel = u.replace(/^\/projects\//, "");
  const abs = path.resolve(PROJECTS_ROOT, rel);

  // anti path traversal
  const root = path.resolve(PROJECTS_ROOT);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;

  return abs;
}

const MAX_ATTACH_MB = Number(process.env.MAIL_MAX_ATTACH_MB || 15);
const MAX_ATTACH_BYTES = MAX_ATTACH_MB * 1024 * 1024;

async function loadAttachmentFromUrl(u: string): Promise<{ buf: Buffer; contentType?: string; filename?: string }> {
  const url = String(u || "").trim();

  // 1) local projects file (/projects/...)
  const localAbs = resolveProjectsFileFromUrl(url);
  if (localAbs) {
    if (!fs.existsSync(localAbs)) throw new Error(`Attachment not found: ${url}`);
    const st = fs.statSync(localAbs);
    if (st.size > MAX_ATTACH_BYTES) throw new Error(`Attachment too large (${MAX_ATTACH_MB}MB limit): ${url}`);
    const buf = fs.readFileSync(localAbs);
    return { buf };
  }

  // 2) remote URL (https://...)
  if (/^https?:\/\//i.test(url)) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fetch attachment failed (${resp.status}): ${url}`);
    const arr = await resp.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.length > MAX_ATTACH_BYTES) throw new Error(`Attachment too large (${MAX_ATTACH_MB}MB limit): ${url}`);
    const ct = resp.headers.get("content-type") || undefined;
    return { buf, contentType: ct };
  }

  throw new Error(`Unsupported attachment url: ${url}`);
}

async function buildAttachments(body: z.infer<typeof Schema>) {
  const out: Array<{ filename: string; content: Buffer; contentType?: string }> = [];

  // legacy single base64
  if (body.pdfBase64) {
    const buf = Buffer.from(body.pdfBase64, "base64");
    if (buf.length > MAX_ATTACH_BYTES) throw new Error(`Attachment too large (${MAX_ATTACH_MB}MB limit)`);
    out.push({
      filename: normalizeFilename(body.fileName, "Dokument.pdf"),
      content: buf,
      contentType: "application/pdf",
    });
  }

  // new list (base64 OR url)
  if (Array.isArray(body.attachments)) {
    for (const a of body.attachments) {
      const b64 = a.contentBase64 || a.pdfBase64;

      // (A) base64
      if (b64) {
        const buf = Buffer.from(b64, "base64");
        if (buf.length > MAX_ATTACH_BYTES) throw new Error(`Attachment too large (${MAX_ATTACH_MB}MB limit)`);
        const filename =
          normalizeFilename(
            a.fileName,
            String(a.mime || "").toLowerCase() === "application/pdf" || a.pdfBase64 ? "Dokument.pdf" : "Anhang"
          );

        out.push({
          filename,
          content: buf,
          contentType: a.mime || (a.pdfBase64 ? "application/pdf" : undefined),
        });
        continue;
      }

      // (B) url
      if (a.url) {
        const { buf, contentType } = await loadAttachmentFromUrl(a.url);
        const filename =
          normalizeFilename(
            a.fileName,
            (String(a.mime || contentType || "").toLowerCase().includes("pdf") ? "Dokument.pdf" : "Anhang")
          );

        out.push({
          filename,
          content: buf,
          contentType: a.mime || contentType,
        });
      }
    }
  }

  return out;
}

/**
 * POST /api/mail/send-offer
 * - JWT required
 * - replyTo = user email (from token)
 */
r.post("/send-offer", requireAuth, async (req, res, next) => {
  try {
    const body = Schema.parse(req.body);

    const senderEmail = String((req as any).user?.email || "").trim();

    const transporter = createTransporter();
    const attachments = await buildAttachments(body);

    await transporter.sendMail({
      from: safeFrom(),
      replyTo: senderEmail || undefined,

      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,

      headers: {
        "X-RLC-Sender-Email": senderEmail || "unknown",
        "X-RLC-Sender-UserId": String((req as any).user?.id || "unknown"),
        "X-RLC-Mode": String((req as any).user?.mode || "unknown"),
      },

      attachments: attachments.length ? attachments : undefined,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Alias generico */
r.post("/send", requireAuth, async (req, res, next) => {
  try {
    const body = Schema.parse(req.body);

    const senderEmail = String((req as any).user?.email || "").trim();

    const transporter = createTransporter();
    const attachments = await buildAttachments(body);

    await transporter.sendMail({
      from: safeFrom(),
      replyTo: senderEmail || undefined,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      headers: {
        "X-RLC-Sender-Email": senderEmail || "unknown",
        "X-RLC-Sender-UserId": String((req as any).user?.id || "unknown"),
        "X-RLC-Mode": String((req as any).user?.mode || "unknown"),
      },
      attachments: attachments.length ? attachments : undefined,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default r;
