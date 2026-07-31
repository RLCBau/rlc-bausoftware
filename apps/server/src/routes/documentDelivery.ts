import express from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import {
  auditDeliveryAction,
  buildDeliveryPackage,
  type DeliveryFormat,
} from "../services/documentDeliveryService";

const router = express.Router();

const AttachmentSchema = z.object({
  name: z.string().optional(),
  fileName: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  mime: z.string().optional(),
  type: z.string().optional(),
  contentBase64: z.string().optional(),
});

const ExportSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().optional(),
  moduleKey: z.string().min(1),
  documentId: z.string().optional(),
  title: z.string().optional(),
  date: z.string().optional(),
  data: z.any().optional(),
  formats: z.array(z.enum(["pdf", "xlsx", "csv", "json", "xml", "zip"])).optional(),
  pdfUrl: z.string().optional(),
  pdfBase64: z.string().optional(),
  pdfFileName: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  confidential: z.boolean().optional(),
  encryptionPassword: z.string().optional(),
});

const EmailSchema = ExportSchema.extend({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().optional(),
  attachIndividualFiles: z.boolean().optional(),
});

function envRequired(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ENV: ${name}`);
  return value;
}



function publicFile(file: { name: string; url: string; mime: string; size: number; sha256: string }) {
  return {
    name: file.name,
    url: file.url,
    mime: file.mime,
    size: file.size,
    sha256: file.sha256,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createTransporter() {
  return nodemailer.createTransport({
    host: envRequired("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: {
      user: envRequired("SMTP_USER"),
      pass: envRequired("SMTP_PASS"),
    },
  });
}

router.get("/capabilities", requireAuth, (_req, res) => {
  res.json({
    ok: true,
    commonFormats: ["pdf", "xlsx", "csv", "json", "xml", "zip"],
    specialistFormats: {
      kalkulation: ["GAEB X83", "GAEB X84", "GAEB X86", "GAEB X89"],
      urkalkulation: ["PDF", "XLSX", "JSON", "XML", "verschlüsseltes Exportpaket"],
      aufmass: ["REB X31", "DA11"],
      cad: ["DWG", "DXF", "IFC", "BCF", "LandXML", "CSV Koordinaten"],
      rechnung: ["XRechnung", "ZUGFeRD"],
    },
  });
});

router.post("/export", requireAuth, express.json({ limit: "50mb" }), async (req, res, next) => {
  try {
    const body = ExportSchema.parse(req.body);
    const result = await buildDeliveryPackage({
      ...body,
      formats: body.formats as DeliveryFormat[] | undefined,
      createdBy: String((req as any).user?.email || (req as any).user?.id || ""),
    });

    res.json({
      ok: true,
      exportId: result.exportId,
      projectId: result.projectId,
      moduleKey: result.moduleKey,
      files: result.files.map(publicFile),
      package: publicFile(result.packageFile),
      encryptedPackage: result.encryptedPackageFile
        ? publicFile(result.encryptedPackageFile)
        : null,
      manifest: publicFile(result.manifestFile),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/email", requireAuth, requireVerifiedEmail, express.json({ limit: "50mb" }), async (req, res, next) => {
  try {
    const body = EmailSchema.parse(req.body);
    const senderEmail = String((req as any).user?.email || "").trim();
    const result = await buildDeliveryPackage({
      ...body,
      formats: body.formats as DeliveryFormat[] | undefined,
      createdBy: senderEmail || String((req as any).user?.id || ""),
    });

    const selectedPackage = result.encryptedPackageFile || result.packageFile;
    const attachments: Array<{ filename: string; path: string; contentType?: string }> = [
      {
        filename: selectedPackage.name,
        path: selectedPackage.filePath,
        contentType: selectedPackage.mime,
      },
    ];

    if (body.attachIndividualFiles) {
      for (const file of result.files) {
        if (attachments.length >= 12) break;
        attachments.push({ filename: file.name, path: file.filePath, contentType: file.mime });
      }
    }

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.MAIL_FROM || '"RLC Bausoftware" <noreply@rlc-bau.de>',
      replyTo: senderEmail || undefined,
      to: body.to,
      subject: body.subject,
      text: body.message || "Dokumentexport aus RLC Bausoftware.",
      html: `<p>${escapeHtml(String(body.message || "Dokumentexport aus RLC Bausoftware.")).replace(/\n/g, "<br/>")}</p>`,
      attachments,
      headers: {
        "X-RLC-Delivery-ExportId": result.exportId,
        "X-RLC-Delivery-Module": result.moduleKey,
        "X-RLC-Sender-Email": senderEmail || "unknown",
      },
    });

    auditDeliveryAction(result.projectId, {
      action: "EMAIL_SENT",
      exportId: result.exportId,
      moduleKey: result.moduleKey,
      documentId: body.documentId || "",
      to: body.to,
      senderEmail,
      attachment: selectedPackage.name,
    });

    res.json({
      ok: true,
      sent: true,
      exportId: result.exportId,
      package: publicFile(selectedPackage),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
