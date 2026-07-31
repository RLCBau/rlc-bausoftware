// apps/server/src/routes/company.mobile-licenses.ts
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany } from "../middleware/guards";

const r = Router();

const ALLOWED_MOBILE_ROLES = new Set([
  "BAULEITER",
  "POLIER",
  "VORARBEITER",
  "FAHRER",
  "MASCHINIST",
  "VERMESSER",
  "MITARBEITER",
]);

const ALLOWED_STATUSES = new Set(["FREE", "ACTIVE", "BLOCKED"]);

function requireCompanyAdmin(req: any, res: any, next: any) {
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  const role = String(
    req?.auth?.role || req?.auth?.companyRole || req?.auth?.appRole || ""
  )
    .trim()
    .toUpperCase();

  if (role !== "ADMIN" && role !== "ADMINISTRATOR" && role !== "BAULEITER") {
    return res.status(403).json({ ok: false, error: "Nur ADMIN / BAULEITER" });
  }

  return next();
}

function makeMobileCode(role: string) {
  const rolePart = String(role || "MOB").slice(0, 4).toUpperCase();
  const a = crypto.randomBytes(2).toString("hex").toUpperCase();
  const b = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `RLC-MOB-${rolePart}-${a}-${b}`;
}

async function getMobileSeatInfo(companyId: string) {
  const subscription = await prisma.companySubscription.findUnique({
    where: { companyId },
    select: {
      status: true,
      mobileSeatsPurchased: true,
      currentPeriodEnd: true,
    },
  });

  const now = new Date();
  const subscriptionActive =
    !!subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "GRACE") &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd >= now);

  const used = await prisma.mobileLicense.count({
    where: {
      companyId,
      status: { in: ["FREE", "ACTIVE"] },
    },
  });

  const limit = subscription?.mobileSeatsPurchased ?? 0;

  return {
    subscriptionActive,
    used,
    limit,
    available: Math.max(0, limit - used),
  };
}

function serialize(row: any) {
  return {
    ...row,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    activatedAt: row.activatedAt?.toISOString?.() ?? row.activatedAt ?? null,
    expiresAt: row.expiresAt?.toISOString?.() ?? row.expiresAt ?? null,
  };
}

/**
 * GET /api/company/mobile-licenses
 */
r.get(
  "/mobile-licenses",
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

      const [rows, seats] = await Promise.all([
        prisma.mobileLicense.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        getMobileSeatInfo(companyId),
      ]);

      return res.json({
        ok: true,
        mobileLicenses: rows.map(serialize),
        seats,
      });
    } catch (e: any) {
      console.error("GET /api/company/mobile-licenses failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "mobile licenses list failed",
      });
    }
  }
);

/**
 * POST /api/company/mobile-licenses
 * body: { role, employeeName?, employeeEmail?, deviceName?, deviceId? }
 */
r.post(
  "/mobile-licenses",
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

      const role = String(req.body?.role || "MITARBEITER").trim().toUpperCase();
      if (!ALLOWED_MOBILE_ROLES.has(role)) {
        return res.status(400).json({ ok: false, error: "invalid mobile role" });
      }

      const seats = await getMobileSeatInfo(companyId);
      if (!seats.subscriptionActive) {
        return res.status(402).json({ ok: false, error: "Subscription inactive" });
      }
      if (seats.limit <= 0 || seats.used >= seats.limit) {
        return res.status(409).json({
          ok: false,
          error: "MOBILE_SEAT_LIMIT_REACHED",
          seats,
        });
      }

      const employeeName = String(req.body?.employeeName || "").trim() || null;
      const employeeEmail =
        String(req.body?.employeeEmail || "").trim().toLowerCase() || null;
      const deviceName = String(req.body?.deviceName || "").trim() || null;
      const deviceId = String(req.body?.deviceId || "").trim() || null;
      const hasAssignment = !!(employeeName || employeeEmail || deviceName || deviceId);

      let code = makeMobileCode(role);
      for (let i = 0; i < 10; i += 1) {
        const exists = await prisma.mobileLicense.findUnique({
          where: { code },
          select: { id: true },
        });
        if (!exists) break;
        code = makeMobileCode(role);
      }

      const created = await prisma.mobileLicense.create({
        data: {
          companyId,
          code,
          role,
          employeeName,
          employeeEmail,
          deviceName,
          deviceId,
          status: hasAssignment ? "ACTIVE" : "FREE",
          activatedAt: hasAssignment ? new Date() : null,
          createdByUserId: String(req.auth.sub || "").trim() || null,
        },
      });

      return res.json({ ok: true, mobileLicense: serialize(created) });
    } catch (e: any) {
      console.error("POST /api/company/mobile-licenses failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "mobile license create failed",
      });
    }
  }
);

/**
 * POST /api/company/mobile-licenses/activate
 * Aktiviert eine Mobile-Lizenz und verbindet neue Benutzer automatisch
 * mit der Firma, der die Lizenz gehört.
 */
r.post(
  "/mobile-licenses/activate",
  requireAuth,
  requireVerifiedEmail,
  async (req: any, res) => {
    try {
      const userId = String(req.auth.sub || "").trim();
      const code = String(req.body?.code || "").trim().toUpperCase();
      const deviceId = String(req.body?.deviceId || "").trim();
      const deviceName = String(req.body?.deviceName || "").trim() || null;
      const appVersion = String(req.body?.appVersion || "").trim() || null;

      if (!userId || !code || !deviceId) {
        return res.status(400).json({ ok: false, error: "bad params" });
      }

      const result = await prisma.$transaction(async (tx) => {
        const row = await tx.mobileLicense.findUnique({
          where: { code },
        });

        if (!row) {
          return {
            status: 404,
            body: { ok: false, error: "MOBILE_LICENSE_NOT_FOUND" },
          };
        }

        if (row.status === "BLOCKED") {
          return {
            status: 403,
            body: { ok: false, error: "MOBILE_LICENSE_BLOCKED" },
          };
        }

        if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
          return {
            status: 410,
            body: { ok: false, error: "MOBILE_LICENSE_EXPIRED" },
          };
        }

        if (row.deviceId && row.deviceId !== deviceId) {
          return {
            status: 409,
            body: { ok: false, error: "MOBILE_LICENSE_DEVICE_MISMATCH" },
          };
        }

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            companyId: true,
          },
        });

        if (!user) {
          return {
            status: 404,
            body: { ok: false, error: "USER_NOT_FOUND" },
          };
        }

        if (user.companyId && user.companyId !== row.companyId) {
          return {
            status: 409,
            body: {
              ok: false,
              error: "USER_ALREADY_ASSIGNED_TO_OTHER_COMPANY",
            },
          };
        }

        const normalizedUserEmail = String(user.email || "")
          .trim()
          .toLowerCase();

        const normalizedLicenseEmail = String(row.employeeEmail || "")
          .trim()
          .toLowerCase();

        if (
          normalizedLicenseEmail &&
          normalizedUserEmail &&
          normalizedLicenseEmail !== normalizedUserEmail
        ) {
          return {
            status: 403,
            body: {
              ok: false,
              error: "MOBILE_LICENSE_EMAIL_MISMATCH",
            },
          };
        }

        if (!user.companyId) {
          await tx.user.update({
            where: { id: user.id },
            data: { companyId: row.companyId },
          });
        }

        await tx.companyMember.upsert({
          where: {
            companyId_userId: {
              companyId: row.companyId,
              userId: user.id,
            },
          },
          create: {
            companyId: row.companyId,
            userId: user.id,
            role: row.role as any,
            active: true,
          },
          update: {
            role: row.role as any,
            active: true,
          },
        });

        const updated = await tx.mobileLicense.update({
          where: { id: row.id },
          data: {
            status: "ACTIVE",
            deviceId,
            deviceName,
            appVersion,
            activatedAt: row.activatedAt || new Date(),
            lastLoginAt: new Date(),
            employeeName: row.employeeName || user.name || null,
            employeeEmail: row.employeeEmail || user.email || null,
          },
        });

        return {
          status: 200,
          body: {
            ok: true,
            companyId: row.companyId,
            mobileLicense: serialize(updated),
          },
        };
      });

      return res.status(result.status).json(result.body);
    } catch (e: any) {
      console.error("POST /api/company/mobile-licenses/activate failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "mobile activation failed",
      });
    }
  }
);

/**
 * PATCH /api/company/mobile-licenses/:id
 */
r.patch(
  "/mobile-licenses/:id",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      const id = String(req.params.id || "").trim();
      if (!companyId || !id) {
        return res.status(400).json({ ok: false, error: "bad params" });
      }

      const existing = await prisma.mobileLicense.findFirst({
        where: { id, companyId },
      });
      if (!existing) {
        return res.status(404).json({ ok: false, error: "mobile license not found" });
      }

      const data: any = {};

      if (req.body?.role !== undefined) {
        const role = String(req.body.role || "").trim().toUpperCase();
        if (!ALLOWED_MOBILE_ROLES.has(role)) {
          return res.status(400).json({ ok: false, error: "invalid mobile role" });
        }
        data.role = role;
      }

      if (req.body?.status !== undefined) {
        const status = String(req.body.status || "").trim().toUpperCase();
        if (!ALLOWED_STATUSES.has(status)) {
          return res.status(400).json({ ok: false, error: "invalid status" });
        }
        data.status = status;
        if (status === "ACTIVE" && !existing.activatedAt) {
          data.activatedAt = new Date();
        }
      }

      if (req.body?.employeeName !== undefined) {
        data.employeeName = String(req.body.employeeName || "").trim() || null;
      }
      if (req.body?.employeeEmail !== undefined) {
        data.employeeEmail =
          String(req.body.employeeEmail || "").trim().toLowerCase() || null;
      }
      if (req.body?.deviceName !== undefined) {
        data.deviceName = String(req.body.deviceName || "").trim() || null;
      }
      if (req.body?.deviceId !== undefined) {
        data.deviceId = String(req.body.deviceId || "").trim() || null;
      }
      if (req.body?.expiresAt !== undefined) {
        data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      }

      const updated = await prisma.mobileLicense.update({
        where: { id },
        data,
      });

      return res.json({ ok: true, mobileLicense: serialize(updated) });
    } catch (e: any) {
      console.error("PATCH /api/company/mobile-licenses/:id failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "mobile license update failed",
      });
    }
  }
);

/**
 * DELETE /api/company/mobile-licenses/:id
 */
r.delete(
  "/mobile-licenses/:id",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.companyId || "").trim();
      const id = String(req.params.id || "").trim();

      if (!companyId || !id) {
        return res.status(400).json({ ok: false, error: "bad params" });
      }

      const deleted = await prisma.mobileLicense.deleteMany({
        where: { id, companyId },
      });

      if (!deleted.count) {
        return res.status(404).json({ ok: false, error: "mobile license not found" });
      }

      return res.json({ ok: true, deleted: deleted.count });
    } catch (e: any) {
      console.error("DELETE /api/company/mobile-licenses/:id failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "mobile license delete failed",
      });
    }
  }
);

export default r;
