// apps/server/src/routes/company.admin.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany } from "../middleware/guards";

import multer from "multer";
import fs from "fs";
import path from "path";
import { COMPANIES_ROOT } from "../lib/companiesRoot";

const r = Router();

function requireCompanyAdmin(req: any, res: any, next: any) {
  if (process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  const roleRaw = String(
    req?.auth?.role || req?.auth?.appRole || req?.auth?.companyRole || ""
  ).trim();
  const role = roleRaw.toUpperCase();

  if (role !== "ADMIN" && role !== "ADMINISTRATOR" && role !== "BAULEITER") {
    return res.status(403).json({ ok: false, error: "Nur ADMIN / BAULEITER" });
  }

  return next();
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function eInvoiceProfileFile(companyId: string) {
  return path.join(COMPANIES_ROOT, companyId, "einvoice-profile.json");
}

function privacyProfileFile(companyId: string) {
  return path.join(COMPANIES_ROOT, companyId, "privacy-profile.json");
}

function defaultPrivacyProfile() {
  return {
    employeeGpsEnabled: false,
    employeeGpsPurpose: "",
    employeeGpsLegalBasis: "",
    employeeGpsRetentionDays: 0,
    aiExternalProcessingEnabled: false,
    aiProviderName: "",
    aiPurpose: "",
    aiLegalBasis: "",
    aiPersonalDataPolicy: "MINIMIZE",
    aiRetentionDays: 0,
    aiThirdCountryTransfer: false,
    aiTransferMechanism: "",
    avvSigned: false,
    avvSignedAt: null,
    avvReference: "",
    tomReviewed: false,
    tomReviewedAt: null,
    tomReference: "",
    vvtReviewed: false,
    vvtReviewedAt: null,
    vvtReference: "",
    dsfaRequired: false,
    dsfaCompleted: false,
    dsfaCompletedAt: null,
    dsfaReference: "",
    deletionConceptReviewed: false,
    deletionConceptReviewedAt: null,
    deletionConceptReference: "",
    privacyContact: "",
    dpoContact: "",
    updatedAt: null,
  };
}

function readPrivacyProfile(companyId: string) {
  try {
    const file = privacyProfileFile(companyId);
    if (!fs.existsSync(file)) return defaultPrivacyProfile();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const base = defaultPrivacyProfile();
    return {
      ...base,
      employeeGpsEnabled: raw?.employeeGpsEnabled === true,
      employeeGpsPurpose: String(raw?.employeeGpsPurpose || "").trim(),
      employeeGpsLegalBasis: String(raw?.employeeGpsLegalBasis || "").trim(),
      employeeGpsRetentionDays: Math.max(0, Math.min(365, Number(raw?.employeeGpsRetentionDays || 0))),
      aiExternalProcessingEnabled: raw?.aiExternalProcessingEnabled === true,
      aiProviderName: String(raw?.aiProviderName || "").trim(),
      aiPurpose: String(raw?.aiPurpose || "").trim(),
      aiLegalBasis: String(raw?.aiLegalBasis || "").trim(),
      aiPersonalDataPolicy: String(raw?.aiPersonalDataPolicy || "MINIMIZE").trim().toUpperCase(),
      aiRetentionDays: Math.max(0, Math.min(3650, Number(raw?.aiRetentionDays || 0))),
      aiThirdCountryTransfer: raw?.aiThirdCountryTransfer === true,
      aiTransferMechanism: String(raw?.aiTransferMechanism || "").trim(),
      avvSigned: raw?.avvSigned === true,
      avvSignedAt: raw?.avvSignedAt || null,
      avvReference: String(raw?.avvReference || "").trim(),
      tomReviewed: raw?.tomReviewed === true,
      tomReviewedAt: raw?.tomReviewedAt || null,
      tomReference: String(raw?.tomReference || "").trim(),
      vvtReviewed: raw?.vvtReviewed === true,
      vvtReviewedAt: raw?.vvtReviewedAt || null,
      vvtReference: String(raw?.vvtReference || "").trim(),
      dsfaRequired: raw?.dsfaRequired === true,
      dsfaCompleted: raw?.dsfaCompleted === true,
      dsfaCompletedAt: raw?.dsfaCompletedAt || null,
      dsfaReference: String(raw?.dsfaReference || "").trim(),
      deletionConceptReviewed: raw?.deletionConceptReviewed === true,
      deletionConceptReviewedAt: raw?.deletionConceptReviewedAt || null,
      deletionConceptReference: String(raw?.deletionConceptReference || "").trim(),
      privacyContact: String(raw?.privacyContact || "").trim(),
      dpoContact: String(raw?.dpoContact || "").trim(),
      updatedAt: raw?.updatedAt || null,
    };
  } catch {
    return defaultPrivacyProfile();
  }
}

function writePrivacyProfile(companyId: string, profile: any) {
  const previous = readPrivacyProfile(companyId);
  const merged = { ...previous, ...(profile || {}) };
  const gpsEnabled = merged.employeeGpsEnabled === true;
  const gpsPurpose = String(merged.employeeGpsPurpose || "").trim();
  const gpsLegalBasis = String(merged.employeeGpsLegalBasis || "").trim();
  const gpsRetentionDays = Math.max(0, Math.min(365, Number(merged.employeeGpsRetentionDays || 0)));
  if (gpsEnabled && (!gpsPurpose || !gpsLegalBasis || gpsRetentionDays < 1)) {
    throw new Error("GPS_PRIVACY_CONFIGURATION_INCOMPLETE");
  }

  const aiEnabled = merged.aiExternalProcessingEnabled === true;
  const aiProviderName = String(merged.aiProviderName || "").trim();
  const aiPurpose = String(merged.aiPurpose || "").trim();
  const aiLegalBasis = String(merged.aiLegalBasis || "").trim();
  const aiRetentionDays = Math.max(0, Math.min(3650, Number(merged.aiRetentionDays || 0)));
  const aiThirdCountryTransfer = merged.aiThirdCountryTransfer === true;
  const aiTransferMechanism = String(merged.aiTransferMechanism || "").trim();
  if (aiEnabled && (!aiProviderName || !aiPurpose || !aiLegalBasis)) {
    throw new Error("AI_PRIVACY_CONFIGURATION_INCOMPLETE");
  }
  if (aiEnabled && aiThirdCountryTransfer && !aiTransferMechanism) {
    throw new Error("AI_TRANSFER_MECHANISM_REQUIRED");
  }
  const dsfaRequired = merged.dsfaRequired === true;
  const dsfaCompleted = merged.dsfaCompleted === true;
  if (dsfaRequired && dsfaCompleted && !String(merged.dsfaReference || "").trim()) {
    throw new Error("DSFA_REFERENCE_REQUIRED");
  }

  const clean = {
    employeeGpsEnabled: gpsEnabled,
    employeeGpsPurpose: gpsEnabled ? gpsPurpose : "",
    employeeGpsLegalBasis: gpsEnabled ? gpsLegalBasis : "",
    employeeGpsRetentionDays: gpsEnabled ? gpsRetentionDays : 0,
    aiExternalProcessingEnabled: aiEnabled,
    aiProviderName: aiEnabled ? aiProviderName : "",
    aiPurpose: aiEnabled ? aiPurpose : "",
    aiLegalBasis: aiEnabled ? aiLegalBasis : "",
    aiPersonalDataPolicy: String(merged.aiPersonalDataPolicy || "MINIMIZE").trim().toUpperCase(),
    aiRetentionDays: aiEnabled ? aiRetentionDays : 0,
    aiThirdCountryTransfer: aiEnabled && aiThirdCountryTransfer,
    aiTransferMechanism: aiEnabled && aiThirdCountryTransfer ? aiTransferMechanism : "",
    avvSigned: merged.avvSigned === true,
    avvSignedAt: merged.avvSigned ? (merged.avvSignedAt || new Date().toISOString()) : null,
    avvReference: String(merged.avvReference || "").trim(),
    tomReviewed: merged.tomReviewed === true,
    tomReviewedAt: merged.tomReviewed ? (merged.tomReviewedAt || new Date().toISOString()) : null,
    tomReference: String(merged.tomReference || "").trim(),
    vvtReviewed: merged.vvtReviewed === true,
    vvtReviewedAt: merged.vvtReviewed ? (merged.vvtReviewedAt || new Date().toISOString()) : null,
    vvtReference: String(merged.vvtReference || "").trim(),
    dsfaRequired,
    dsfaCompleted,
    dsfaCompletedAt: dsfaCompleted ? (merged.dsfaCompletedAt || new Date().toISOString()) : null,
    dsfaReference: String(merged.dsfaReference || "").trim(),
    deletionConceptReviewed: merged.deletionConceptReviewed === true,
    deletionConceptReviewedAt: merged.deletionConceptReviewed ? (merged.deletionConceptReviewedAt || new Date().toISOString()) : null,
    deletionConceptReference: String(merged.deletionConceptReference || "").trim(),
    privacyContact: String(merged.privacyContact || "").trim(),
    dpoContact: String(merged.dpoContact || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  const dir = path.join(COMPANIES_ROOT, companyId);
  ensureDir(dir);
  fs.writeFileSync(privacyProfileFile(companyId), JSON.stringify(clean, null, 2));
  return clean;
}

function readEInvoiceProfile(companyId: string) {
  try {
    const file = eInvoiceProfileFile(companyId);
    if (!fs.existsSync(file)) return {};
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeEInvoiceProfile(companyId: string, profile: any) {
  const dir = path.join(COMPANIES_ROOT, companyId);
  ensureDir(dir);
  const clean = {
    street: String(profile?.street || "").trim(),
    postalCode: String(profile?.postalCode || "").trim(),
    city: String(profile?.city || "").trim(),
    country: String(profile?.country || "DE").trim().toUpperCase(),
    vatId: String(profile?.vatId || "").trim(),
    taxNumber: String(profile?.taxNumber || "").trim(),
    iban: String(profile?.iban || "").replace(/\s+/g, "").trim(),
    bic: String(profile?.bic || "").replace(/\s+/g, "").trim(),
    bankName: String(profile?.bankName || "").trim(),
    contactName: String(profile?.contactName || "").trim(),
    phone: String(profile?.phone || "").trim(),
    email: String(profile?.email || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(eInvoiceProfileFile(companyId), JSON.stringify(clean, null, 2));
  return clean;
}

function safeExtFromMime(mime?: string) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  return ".png";
}

function isAllowedImageMime(mime?: string) {
  const m = String(mime || "").toLowerCase();
  return (
    m.includes("image/png") ||
    m.includes("image/jpeg") ||
    m.includes("image/jpg") ||
    m.includes("image/webp")
  );
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

async function seatInfo(companyId: string) {
  const sub = await prisma.companySubscription.findUnique({
    where: { companyId },
    select: {
      status: true,
      plan: true,
      seatsLimit: true,
      webSeatsPurchased: true,
      mobileSeatsPurchased: true,
      currentPeriodEnd: true,
      currentPeriodStart: true,
    },
  });

  const now = new Date();
  const statusOk = sub?.status === "ACTIVE" || sub?.status === "GRACE";
  const periodOk = !sub?.currentPeriodEnd || sub.currentPeriodEnd >= now;
  const active = !!sub && statusOk && periodOk;

  const usedSeats = await prisma.companyMember.count({
    where: { companyId, active: true },
  });

  const webSeatsPurchased = sub?.webSeatsPurchased ?? 0;

  return {
    subscription: sub
      ? {
          status: sub.status,
          plan: sub.plan,
          seatsLimit: sub.seatsLimit ?? null,
          webSeatsPurchased,
          mobileSeatsPurchased: sub.mobileSeatsPurchased ?? 0,
          currentPeriodStart: sub.currentPeriodStart
            ? sub.currentPeriodStart.toISOString()
            : null,
          currentPeriodEnd: sub.currentPeriodEnd
            ? sub.currentPeriodEnd.toISOString()
            : null,
          active,
        }
      : {
          status: "EXPIRED",
          plan: "BASIC_5",
          seatsLimit: null,
          webSeatsPurchased: 0,
          mobileSeatsPurchased: 0,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          active: false,
        },
    seats: {
      used: usedSeats,
      limit: webSeatsPurchased,
      available: Math.max(0, webSeatsPurchased - usedSeats),
    },
  };
}

/**
 * GET /api/company/header
 */
r.get(
  "/header",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) {
        return res.status(400).json({ ok: false, error: "company missing" });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          code: true,
          name: true,
          address: true,
          phone: true,
          email: true,
          logoPath: true,
          updatedAt: true,
        },
      });

      if (!company) {
        return res.status(404).json({ ok: false, error: "company not found" });
      }

      return res.json({
        ok: true,
        company: {
          ...company,
          updatedAt: company.updatedAt.toISOString(),
          logoUrl: company.logoPath ? "/api/company/logo" : null,
        },
      });
    } catch (e: any) {
      console.error("GET /api/company/header failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "failed" });
    }
  }
);

/**
 * GET /api/company/einvoice-profile
 */
r.get(
  "/einvoice-profile",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  async (req: any, res) => {
    const companyId = String(req.auth.companyId || "").trim();
    if (!companyId) return res.status(400).json({ ok: false, error: "company missing" });
    return res.json({ ok: true, profile: readEInvoiceProfile(companyId) });
  }
);

/**
 * PUT /api/company/einvoice-profile
 */
r.put(
  "/einvoice-profile",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) return res.status(400).json({ ok: false, error: "company missing" });
      const profile = writeEInvoiceProfile(companyId, req.body || {});
      return res.json({ ok: true, profile });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "save failed" });
    }
  }
);

/**
 * GET /api/company/privacy-profile
 */
r.get(
  "/privacy-profile",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  async (req: any, res) => {
    const companyId = String(req.auth.companyId || "").trim();
    if (!companyId) return res.status(400).json({ ok: false, error: "company missing" });
    return res.json({ ok: true, profile: readPrivacyProfile(companyId) });
  }
);

/**
 * PUT /api/company/privacy-profile
 */
r.put(
  "/privacy-profile",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) return res.status(400).json({ ok: false, error: "company missing" });
      const profile = writePrivacyProfile(companyId, req.body || {});
      return res.json({ ok: true, profile });
    } catch (error: any) {
      const message = String(error?.message || "save failed");
      const clientErrors = ["GPS_PRIVACY_CONFIGURATION_INCOMPLETE","AI_PRIVACY_CONFIGURATION_INCOMPLETE","AI_TRANSFER_MECHANISM_REQUIRED","DSFA_REFERENCE_REQUIRED"];
      return res.status(clientErrors.includes(message) ? 400 : 500).json({ ok: false, error: message });
    }
  }
);

/**
 * GET /api/company/logo
 */
r.get(
  "/logo",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) {
        return res.status(400).json({ ok: false, error: "company missing" });
      }

      const row = await prisma.company.findUnique({
        where: { id: companyId },
        select: { logoPath: true },
      });

      const rel = String(row?.logoPath || "").trim();
      if (!rel) return res.status(404).json({ ok: false, error: "no logo" });

      const filename = path.basename(rel);
      const abs = path.join(COMPANIES_ROOT, companyId, filename);

      const allowedBase = path.join(COMPANIES_ROOT, companyId) + path.sep;
      if (!abs.startsWith(allowedBase)) {
        return res.status(400).json({ ok: false, error: "bad path" });
      }
      if (!fs.existsSync(abs)) {
        return res.status(404).json({ ok: false, error: "logo missing" });
      }

      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(abs);
    } catch (e: any) {
      console.error("GET /api/company/logo failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "failed" });
    }
  }
);

/**
 * PATCH /api/company/admin/header
 */
r.patch(
  "/admin/header",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) {
        return res.status(400).json({ ok: false, error: "company missing" });
      }

      const data: any = {};
      if (typeof req.body?.name === "string") data.name = req.body.name.trim();
      if (typeof req.body?.address === "string") data.address = req.body.address.trim();
      if (typeof req.body?.phone === "string") data.phone = req.body.phone.trim();
      if (typeof req.body?.email === "string") data.email = req.body.email.trim();

      const updated = await prisma.company.update({
        where: { id: companyId },
        data,
        select: {
          id: true,
          code: true,
          name: true,
          address: true,
          phone: true,
          email: true,
          logoPath: true,
          updatedAt: true,
        },
      });

      return res.json({
        ok: true,
        company: { ...updated, updatedAt: updated.updatedAt.toISOString() },
      });
    } catch (e: any) {
      console.error("PATCH /api/company/admin/header failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "failed" });
    }
  }
);

/**
 * POST /api/company/admin/logo
 */
r.post(
  "/admin/logo",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  upload.single("file"),
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) {
        return res.status(400).json({ ok: false, error: "company missing" });
      }

      const f = req.file;
      if (!f || !f.buffer) {
        return res.status(400).json({ ok: false, error: "file missing" });
      }

      if (!isAllowedImageMime(f.mimetype)) {
        return res.status(400).json({ ok: false, error: "Nur PNG/JPG/WEBP" });
      }

      const ext = safeExtFromMime(f.mimetype);
      const dirAbs = path.join(COMPANIES_ROOT, companyId);
      ensureDir(dirAbs);

      const filename = `logo${ext}`;
      const abs = path.join(dirAbs, filename);
      fs.writeFileSync(abs, f.buffer);

      const rel = path.join("companies", companyId, filename).replace(/\\/g, "/");

      const updated = await prisma.company.update({
        where: { id: companyId },
        data: { logoPath: rel },
        select: {
          id: true,
          code: true,
          name: true,
          address: true,
          phone: true,
          email: true,
          logoPath: true,
          updatedAt: true,
        },
      });

      return res.json({
        ok: true,
        company: { ...updated, updatedAt: updated.updatedAt.toISOString() },
      });
    } catch (e: any) {
      console.error("POST /api/company/admin/logo failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "failed" });
    }
  }
);

/**
 * GET /api/company/admin/dashboard
 */
r.get(
  "/admin/dashboard",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      if (!companyId) {
        return res.status(400).json({ ok: false, error: "company missing" });
      }

      const [company, si, members, invites] = await Promise.all([
        prisma.company.findUnique({
          where: { id: companyId },
          select: {
            id: true,
            code: true,
            name: true,
            address: true,
            phone: true,
            email: true,
            logoPath: true,
            createdAt: true,
          },
        }),
        seatInfo(companyId),
        prisma.companyMember.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: {
            id: true,
            role: true,
            active: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                emailVerifiedAt: true,
              },
            },
          },
        }),
        prisma.companyInvite.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: {
            id: true,
            email: true,
            role: true,
            code: true,
            maxUses: true,
            usedCount: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            acceptedAt: true,
          },
        }),
      ]);

      return res.json({
        ok: true,
        company: company
          ? {
              ...company,
              createdAt: company.createdAt.toISOString(),
            }
          : null,
        subscription: si.subscription,
        seats: si.seats,
        members: members.map((m: any) => ({
          id: m.id,
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          appRole: m.user.role,
          companyRole: m.role,
          active: m.active,
          emailVerifiedAt: m.user.emailVerifiedAt
            ? m.user.emailVerifiedAt.toISOString()
            : null,
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        })),
        invites: invites.map((i: any) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          code: i.code,
          maxUses: i.maxUses,
          usedCount: i.usedCount,
          isActive: i.isActive,
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
          acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
          status: !i.isActive
            ? "INACTIVE"
            : i.expiresAt.getTime() < Date.now()
            ? "EXPIRED"
            : i.usedCount >= i.maxUses
            ? "USED_UP"
            : "PENDING",
        })),
      });
    } catch (e: any) {
      console.error("GET /api/company/admin/dashboard failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "dashboard failed",
      });
    }
  }
);

/**
 * PATCH /api/company/admin/members/:userId
 */
r.patch(
  "/admin/members/:userId",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      const userId = String(req.params.userId || "").trim();

      if (!companyId || !userId) {
        return res.status(400).json({ ok: false, error: "bad params" });
      }

      const data: any = {};
      if (typeof req.body?.active === "boolean") data.active = !!req.body.active;
      if (req.body?.role) data.role = String(req.body.role).toUpperCase();

      const updated = await prisma.companyMember.update({
        where: { companyId_userId: { companyId, userId } },
        data,
        select: { id: true, role: true, active: true, updatedAt: true },
      });

      return res.json({
        ok: true,
        member: { ...updated, updatedAt: updated.updatedAt.toISOString() },
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "update failed",
      });
    }
  }
);


/**
 * GET /api/company/projects/:projectId/submissions
 * Optional: ?userId=...
 *
 * Restituisce tutti gli invii del progetto per la ditta loggata.
 */
r.get(
  "/projects/:projectId/submissions",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      const projectToken = String(req.params.projectId || "").trim();
      const userId = String(req.query?.userId || "").trim();

      if (!companyId || !projectToken) {
        return res.status(400).json({
          ok: false,
          error: "bad params",
        });
      }

      const project = await prisma.project.findFirst({
        where: {
          companyId,
          OR: [
            { id: projectToken },
            { code: projectToken },
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      if (!project) {
        return res.status(404).json({
          ok: false,
          error: "project not found",
        });
      }

      if (userId) {
        const member = await prisma.companyMember.findFirst({
          where: {
            companyId,
            userId,
            active: true,
          },
          select: {
            userId: true,
          },
        });

        if (!member) {
          return res.status(404).json({
            ok: false,
            error: "member not found",
          });
        }
      }

      const rows = await prisma.projectSubmission.findMany({
        where: {
          companyId,
          projectId: project.id,
          ...(userId ? { userId } : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 2000,
        select: {
          id: true,
          source: true,
          kind: true,
          entityId: true,
          title: true,
          meta: true,
          createdAt: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      const members = await prisma.companyMember.findMany({
        where: {
          companyId,
          active: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      return res.json({
        ok: true,
        project,
        selectedUserId: userId || null,
        members: members.map((m: any) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          appRole: m.user.role,
          companyRole: m.role,
        })),
        submissions: rows.map((row: any) => ({
          id: row.id,
          userId: row.userId,
          name: row.user?.name || null,
          email: row.user?.email || null,
          appRole: row.user?.role || null,
          source: row.source,
          kind: row.kind,
          entityId: row.entityId,
          title: row.title,
          meta: row.meta,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    } catch (e: any) {
      console.error(
        "GET /api/company/projects/:projectId/submissions failed:",
        e
      );

      return res.status(500).json({
        ok: false,
        error: e?.message || "failed",
      });
    }
  }
);
export default r;
