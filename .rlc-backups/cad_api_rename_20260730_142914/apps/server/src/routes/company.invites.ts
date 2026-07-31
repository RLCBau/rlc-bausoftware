// apps/server/src/routes/company.invites.ts
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany } from "../middleware/guards";

const r = Router();

function normalizeEmail(x: string | null | undefined) {
  return String(x || "")
    .trim()
    .toLowerCase();
}

function makeInviteCode() {
  const a = crypto.randomBytes(2).toString("hex").toUpperCase();
  const b = crypto.randomBytes(2).toString("hex").toUpperCase();
  const c = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `RLC-${a}-${b}-${c}`;
}

const ALLOWED_PROJECT_ROLES = new Set([
  "ADMIN",
  "BAULEITER",
  "CAPOCANTIERE",
  "MITARBEITER",
  "KALKULATOR",
  "BUCHHALTUNG",
  "GAST",
]);

async function getSeatInfo(companyId: string) {
  const sub = await prisma.companySubscription.findUnique({
    where: { companyId },
    select: {
      status: true,
      plan: true,
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
    active,
    subscription: sub
      ? {
          status: sub.status,
          plan: sub.plan,
          webSeatsPurchased,
          mobileSeatsPurchased: sub.mobileSeatsPurchased ?? 0,
          currentPeriodStart: sub.currentPeriodStart
            ? sub.currentPeriodStart.toISOString()
            : null,
          currentPeriodEnd: sub.currentPeriodEnd
            ? sub.currentPeriodEnd.toISOString()
            : null,
        }
      : null,
    seats: {
      used: usedSeats,
      limit: webSeatsPurchased,
      available: Math.max(0, webSeatsPurchased - usedSeats),
    },
  };
}

function requireCompanyAdmin(req: any, res: any, next: any) {
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  const roleRaw = String(
    req?.auth?.role || req?.auth?.companyRole || req?.auth?.appRole || ""
  ).trim();
  const role = roleRaw.toUpperCase();

  if (role !== "ADMIN") {
    return res.status(403).json({ ok: false, error: "Nur ADMIN" });
  }

  return next();
}

/**
 * POST /api/company/invites
 * body: { email?: string, role?: ProjectRole, ttlHours?: number, maxUses?: number }
 */
r.post(
  "/invites",
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

      const seatInfo = await getSeatInfo(companyId);
      if (!seatInfo.active) {
        return res.status(402).json({ ok: false, error: "Subscription inactive" });
      }

      const email = req.body?.email ? normalizeEmail(req.body.email) : null;

      const role = String(req.body?.role || "MITARBEITER").toUpperCase();
      if (!ALLOWED_PROJECT_ROLES.has(role)) {
        return res.status(400).json({ ok: false, error: "invalid role" });
      }

      if (seatInfo.seats.limit > 0 && seatInfo.seats.used >= seatInfo.seats.limit) {
        return res.status(409).json({
          ok: false,
          error: "WEB_SEAT_LIMIT_REACHED",
          seats: seatInfo.seats,
        });
      }

      const ttlHoursRaw = Number(req.body?.ttlHours || 72);
      const ttlHours = Math.max(1, Math.min(ttlHoursRaw, 24 * 30));
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

      const maxUsesRaw = Number(req.body?.maxUses || 1);
      const maxUses = Math.max(1, Math.min(maxUsesRaw, 100));

      let code = makeInviteCode();
      for (let i = 0; i < 10; i++) {
        const exists = await prisma.companyInvite.findUnique({
          where: { code },
          select: { id: true },
        });
        if (!exists) break;
        code = makeInviteCode();
      }

      const invite = await prisma.companyInvite.create({
        data: {
          companyId,
          email,
          role: role as any,
          code,
          maxUses,
          usedCount: 0,
          isActive: true,
          expiresAt,
          createdByUserId: String(req.auth.sub || ""),
        },
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
        },
      });

      return res.json({
        ok: true,
        invite: {
          ...invite,
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt.toISOString(),
        },
      });
    } catch (e: any) {
      console.error("POST /api/company/invites failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "invite create failed",
      });
    }
  }
);

/**
 * GET /api/company/invites
 */
r.get(
  "/invites",
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

      const rows = await prisma.companyInvite.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 200,
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
      });

      return res.json({
        ok: true,
        invites: rows.map((x) => ({
          ...x,
          expiresAt: x.expiresAt.toISOString(),
          createdAt: x.createdAt.toISOString(),
          acceptedAt: x.acceptedAt ? x.acceptedAt.toISOString() : null,
          status: !x.isActive
            ? "INACTIVE"
            : x.expiresAt.getTime() < Date.now()
            ? "EXPIRED"
            : x.usedCount >= x.maxUses
            ? "USED_UP"
            : "PENDING",
        })),
      });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "list failed",
      });
    }
  }
);

/**
 * POST /api/company/invites/deactivate/:id
 */
r.post(
  "/invites/deactivate/:id",
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

      const updated = await prisma.companyInvite.updateMany({
        where: { id, companyId },
        data: { isActive: false },
      });

      return res.json({ ok: true, updated });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "deactivate failed",
      });
    }
  }
);

export default r;
