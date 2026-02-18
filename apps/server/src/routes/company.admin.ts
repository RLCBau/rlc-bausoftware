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
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  // ✅ robust role extraction (supports legacy + appRole + companyRole)
  const roleRaw = String(
    req?.auth?.role || req?.auth?.appRole || req?.auth?.companyRole || ""
  ).trim();
  const role = roleRaw.toUpperCase();

  // ✅ accept ADMINISTRATOR as well (mobile checks ADMIN || ADMINISTRATOR)
  if (role !== "ADMIN" && role !== "ADMINISTRATOR") {
    return res.status(403).json({ ok: false, error: "Nur ADMIN" });
  }
  return next();
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
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

// memory upload (logo è piccolo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
});

async function seatInfo(companyId: string) {
  const sub = await prisma.companySubscription.findUnique({
    where: { companyId },
    select: {
      status: true,
      plan: true,
      seatsLimit: true,
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

  return {
    subscription: sub
      ? {
          status: sub.status,
          plan: sub.plan,
          seatsLimit: sub.seatsLimit ?? null,
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
          currentPeriodStart: null,
          currentPeriodEnd: null,
          active: false,
        },
    seats: {
      used: usedSeats,
      limit: sub?.seatsLimit ?? null,
      available:
        sub?.seatsLimit == null ? null : Math.max(0, sub.seatsLimit - usedSeats),
    },
  };
}

/**
 * =========================================================
 * ✅ Company Header (for mobile offline cache)
 * GET /api/company/header
 * =========================================================
 */
r.get(
  "/header",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.company || "").trim();
      if (!companyId)
        return res.status(400).json({ ok: false, error: "company missing" });

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

      if (!company)
        return res.status(404).json({ ok: false, error: "company not found" });

      return res.json({
        ok: true,
        company: {
          ...company,
          updatedAt: company.updatedAt.toISOString(),
          // ✅ optional helper for clients
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
 * =========================================================
 * ✅ Company Logo file (auth required)
 * GET /api/company/logo
 * =========================================================
 */
r.get(
  "/logo",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.company || "").trim();
      if (!companyId)
        return res.status(400).json({ ok: false, error: "company missing" });

      const row = await prisma.company.findUnique({
        where: { id: companyId },
        select: { logoPath: true },
      });

      const rel = String(row?.logoPath || "").trim();
      if (!rel) return res.status(404).json({ ok: false, error: "no logo" });

      // rel: "companies/<companyId>/logo.png"
      // ✅ serve from COMPANIES_ROOT to stay consistent with write path
      const filename = path.basename(rel); // logo.png / logo.jpg / logo.webp
      const abs = path.join(COMPANIES_ROOT, companyId, filename);

      const allowedBase = path.join(COMPANIES_ROOT, companyId) + path.sep;
      if (!abs.startsWith(allowedBase)) {
        return res.status(400).json({ ok: false, error: "bad path" });
      }
      if (!fs.existsSync(abs)) {
        return res.status(404).json({ ok: false, error: "logo missing" });
      }

      // ✅ avoid stale cache on iOS (simple + safe)
      res.setHeader("Cache-Control", "no-store");

      return res.sendFile(abs);
    } catch (e: any) {
      console.error("GET /api/company/logo failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "failed" });
    }
  }
);

/**
 * =========================================================
 * ✅ ADMIN: update company header fields
 * PATCH /api/company/admin/header
 * body: { name?, address?, phone?, email? }
 * =========================================================
 */
r.patch(
  "/admin/header",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.company || "").trim();
      if (!companyId)
        return res.status(400).json({ ok: false, error: "company missing" });

      const data: any = {};
      if (typeof req.body?.name === "string") data.name = req.body.name.trim();
      if (typeof req.body?.address === "string")
        data.address = req.body.address.trim();
      if (typeof req.body?.phone === "string")
        data.phone = req.body.phone.trim();
      if (typeof req.body?.email === "string")
        data.email = req.body.email.trim();

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
 * =========================================================
 * ✅ ADMIN: upload logo
 * POST /api/company/admin/logo  (multipart/form-data, field: "file")
 * =========================================================
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
      const companyId = String(req.auth.company || "").trim();
      if (!companyId)
        return res.status(400).json({ ok: false, error: "company missing" });

      const f = req.file;
      if (!f || !f.buffer)
        return res.status(400).json({ ok: false, error: "file missing" });

      // ✅ hard mime allow-list (avoid pdf/octet-stream weirdness)
      if (!isAllowedImageMime(f.mimetype)) {
        return res
          .status(400)
          .json({ ok: false, error: "Nur PNG/JPG/WEBP" });
      }

      const ext = safeExtFromMime(f.mimetype);
      const dirAbs = path.join(COMPANIES_ROOT, companyId);
      ensureDir(dirAbs);

      const filename = `logo${ext}`;
      const abs = path.join(dirAbs, filename);
      fs.writeFileSync(abs, f.buffer);

      // store relative to /data
      const rel = path
        .join("companies", companyId, filename)
        .replace(/\\/g, "/");

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
 * ✅ ADMIN Dashboard
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
      const companyId = String(req.auth.company || "").trim();
      if (!companyId)
        return res.status(400).json({ ok: false, error: "company missing" });

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
                role: true, // UserRole (admin/user)
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
            expiresAt: true,
            createdAt: true,
            acceptedAt: true,
          },
        }),
      ]);

      return res.json({
        ok: true,
        company,
        subscription: si.subscription,
        seats: si.seats,
        members: members.map((m: any) => ({
          id: m.id,
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          appRole: m.user.role, // UserRole
          companyRole: m.role, // ProjectRole
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
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
          acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
          status: i.acceptedAt
            ? "ACCEPTED"
            : i.expiresAt.getTime() < Date.now()
            ? "EXPIRED"
            : "PENDING",
        })),
      });
    } catch (e: any) {
      console.error("GET /api/company/admin/dashboard failed:", e);
      return res
        .status(500)
        .json({ ok: false, error: e?.message || "dashboard failed" });
    }
  }
);

/**
 * ✅ Update member (activate/deactivate / role)
 * PATCH /api/company/admin/members/:userId
 * body: { active?: boolean, role?: ProjectRole }
 */
r.patch(
  "/admin/members/:userId",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.company || "").trim();
      const userId = String(req.params.userId || "").trim();
      if (!companyId || !userId)
        return res.status(400).json({ ok: false, error: "bad params" });

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
      return res
        .status(500)
        .json({ ok: false, error: e?.message || "update failed" });
    }
  }
);

export default r;
