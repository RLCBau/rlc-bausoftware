import express from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import {
  auditDeliveryAction,
  buildDeliveryPackage,
  type DeliveryFormat,
} from "../services/documentDeliveryService";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";
import { resolveRlcCompany } from "../services/pdf/rlcPdfCore";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { prisma } from "../lib/prisma";

const router = express.Router();

function requireExternalDeliveryRole(req:any,res:any,next:any){
  const role=String(req?.auth?.companyRole||req?.auth?.role||"").trim().toUpperCase();
  if(!["ADMIN","ADMINISTRATOR","BAULEITER","KALKULATOR","BUCHHALTUNG"].includes(role)){
    return res.status(403).json({error:"DOCUMENT_EMAIL_FORBIDDEN"});
  }
  return next();
}

function deliveryActor(req:any): string {
  return String(req?.auth?.email || req?.user?.email || req?.auth?.sub || req?.user?.id || "").trim();
}

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
  formats: z.array(z.enum(["pdf", "xlsx", "csv", "json", "xml", "zip", "xrechnung"])).optional(),
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

async function requireDeliveryProjectAccess(req: any, res: any, next: any) {
  try {
    const token = String(req.body?.projectId || "").trim();
    const companyId = String(req?.auth?.companyId || req?.auth?.company || "").trim();
    const userId = String(req?.auth?.sub || "").trim();
    if (!token) return res.status(400).json({ error: "PROJECT_REQUIRED" });
    if (!companyId) return res.status(403).json({ error: "COMPANY_REQUIRED" });
    const project = await prisma.project.findFirst({
      where: { companyId, OR: [{ id: token }, { code: token }] },
      select: { id: true, code: true }
    });
    if (!project) return res.status(403).json({ error: "PROJECT_TENANT_FORBIDDEN" });
    const role = String(req?.auth?.role || "").toUpperCase();
    if (!["ADMIN","ADMINISTRATOR"].includes(role)) {
      if (!userId) return res.status(401).json({ error: "AUTH_REQUIRED" });
      const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId }, select: { id: true } });
      if (!member) return res.status(403).json({ error: "PROJECT_MEMBER_REQUIRED" });
    }
    req.body.projectId = project.id;
    req.resolvedProjectId = project.id;
    req.resolvedProjectCode = project.code;
    return next();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "PROJECT_ACCESS_CHECK_FAILED" });
  }
}

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

function deliveryRetentionMeta(moduleKey: any, dateValue?: any): Record<string, any> {
  const key = String(moduleKey || "").trim().toLowerCase();
  if (!["rechnung", "rechnungen", "abschlagsrechnung", "abschlagsrechnungen"].includes(key)) return {};

  const raw = String(dateValue || "").trim();
  let year = new Date().getFullYear();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (iso) year = Number(iso[1]);
  else if (de) year = Number(de[3]);

  return {
    retentionLocked: true,
    retentionUntil: new Date(Date.UTC(year + 8, 11, 31, 23, 59, 59, 999)).toISOString(),
    retentionReason: "§ 14b UStG / § 147 AO / § 257 HGB – Rechnungs-/Buchungsbeleg 8 Jahre",
    retentionCategory: "TAX_INVOICE_8Y",
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
      rechnung: ["XRechnung 3.0.2 / EN16931"],
    },
  });
});

async function archiveDeliveryResultToDms(req: any, result: any, sourceDate?: any) {
  try {
    const { archiveProjectFileVersion } = await import("../services/dmsArchive");

    const candidates = [
      ...(Array.isArray(result?.files) ? result.files : []),
      result?.packageFile,
      result?.encryptedPackageFile,
      result?.manifestFile,
    ].filter(Boolean);

    const seen = new Set<string>();
    const retentionMeta = deliveryRetentionMeta(result?.moduleKey, sourceDate);

    for (const file of candidates) {
      const localPath = String(file?.filePath || "").trim();
      const filename = String(file?.name || "").trim();

      if (!localPath || !filename || seen.has(localPath)) continue;
      seen.add(localPath);

      const kind = /\.pdf$/i.test(filename) ? "PDF" : "DOC";

      try {
        await archiveProjectFileVersion({
          projectIdOrCode: String(result.projectId),
          filename,
          kind,
          localPath,
          uploadedBy: String(
            req?.auth?.email ||
            req?.auth?.userId ||
            req?.auth?.sub ||
            req?.user?.email ||
            req?.user?.id ||
            ""
          ).trim() || null,
          meta: {
            module: "DOCUMENT_DELIVERY",
            source: "documentDelivery.export",
            exportId: result.exportId,
            moduleKey: result.moduleKey,
            mime: file?.mime || null,
            ...retentionMeta,
          },
        });
      } catch (dmsError) {
        console.error("[documentDelivery:dms]", filename, dmsError);
      }
    }
  } catch (error) {
    console.error("[documentDelivery:dms:init]", error);
  }
}

router.post("/export", requireAuth, express.json({ limit: "50mb" }), requireDeliveryProjectAccess, async (req, res, next) => {
  try {
    const body = ExportSchema.parse(req.body);
    const requestCompany = await loadRlcPdfCompanyFromRequest(req as any);
    const sellerCompany = resolveRlcCompany(
      path.join(PROJECTS_ROOT, body.projectId, "exports", "delivery-company-context.pdf"),
      requestCompany
    );
    const result = await buildDeliveryPackage({
      ...body,
      data: { ...(body.data || {}), __sellerCompany: sellerCompany },
      formats: body.formats as DeliveryFormat[] | undefined,
      createdBy: deliveryActor(req),
    });

    await archiveDeliveryResultToDms(req, result, body.date);

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

router.post("/email", requireAuth, requireVerifiedEmail, requireExternalDeliveryRole, express.json({ limit: "50mb" }), requireDeliveryProjectAccess, async (req, res, next) => {
  try {
    const body = EmailSchema.parse(req.body);
    const senderEmail = String((req as any)?.auth?.email || (req as any)?.user?.email || "").trim();
    const requestCompany = await loadRlcPdfCompanyFromRequest(req as any);
    const sellerCompany = resolveRlcCompany(
      path.join(PROJECTS_ROOT, body.projectId, "exports", "delivery-company-context.pdf"),
      requestCompany
    );
    const result = await buildDeliveryPackage({
      ...body,
      data: { ...(body.data || {}), __sellerCompany: sellerCompany },
      formats: body.formats as DeliveryFormat[] | undefined,
      createdBy: deliveryActor(req),
    });

    await archiveDeliveryResultToDms(req, result, body.date);

    const selectedPackage = result.encryptedPackageFile || result.packageFile;
    const attachments: Array<{ filename: string; path: string; contentType?: string }> = [
      {
        filename: selectedPackage.name,
        path: selectedPackage.filePath,
        contentType: selectedPackage.mime,
      },
    ];

    const invoiceXRechnungFiles = (result.files || []).filter((file: any) =>
      /xrechnung.*\.xml$/i.test(String(file?.name || ""))
    );

    for (const file of invoiceXRechnungFiles) {
      if (attachments.some((a) => a.path === file.filePath)) continue;
      attachments.push({ filename: file.name, path: file.filePath, contentType: file.mime });
    }

    if (body.attachIndividualFiles) {
      for (const file of result.files) {
        if (attachments.length >= 12) break;
        if (attachments.some((a) => a.path === file.filePath)) continue;
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
