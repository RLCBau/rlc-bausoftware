// apps/server/src/routes/company.invites.ts
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany } from "../middleware/guards";

const r = Router();

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function normalizeEmail(x: string) {
  return String(x || "").trim().toLowerCase();
}

// ProjectRole (CompanyMember.role) – nel tuo DB sembra essere UPPERCASE (ADMIN/...)
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
    select: { status: true, seatsLimit: true, currentPeriodEnd: true },
  });

  const now = new Date();
  const statusOk = sub?.status === "ACTIVE" || sub?.status === "GRACE";
  const periodOk = !sub?.currentPeriodEnd || sub.currentPeriodEnd >= now;

  const active = !!sub && statusOk && periodOk;
  const seatsLimit = sub?.seatsLimit ?? null;

  // ✅ seats = membri attivi
  const usedSeats = await prisma.companyMember.count({
    where: { companyId, active: true },
  });

  return { active, seatsLimit, usedSeats };
}

function requireCompanyAdmin(req: any, res: any, next: any) {
  // DEV bypass
  if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

  const roleRaw = String(req?.auth?.role || req?.auth?.companyRole || "").trim();
  const role = roleRaw.toUpperCase();
  if (role !== "ADMIN") return res.status(403).json({ ok: false, error: "Nur ADMIN" });

  next();
}

/**
 * ✅ Create Invite (ADMIN only)
 * POST /api/company/invites
 * body: { email: string, role?: ProjectRole, ttlHours?: number }
 * returns: { token }  (token viene mostrato UNA sola volta)
 */
r.post(
  "/invites",
  requireAuth,
  requireVerifiedEmail,
  requireCompany,
  requireCompanyAdmin,
  async (req: any, res) => {
    try {
      const companyId = String(req.auth.company || "").trim();
      if (!companyId) return res.status(400).json({ ok: false, error: "company missing" });

      // ✅ Abo attivo richiesto per invitare
      const seat = await getSeatInfo(companyId);
      if (!seat.active) {
        return res.status(402).json({ ok: false, error: "Subscription inactive" });
      }

      const email = normalizeEmail(req.body?.email);
      if (!email || !email.includes("@")) {
        return res.status(400).json({ ok: false, error: "invalid email" });
      }

      const role = String(req.body?.role || "MITARBEITER").toUpperCase();
      if (!ALLOWED_PROJECT_ROLES.has(role)) {
        return res.status(400).json({ ok: false, error: "invalid role" });
      }

      // seat limit
      if (seat.seatsLimit != null && seat.usedSeats >= seat.seatsLimit) {
        return res.status(409).json({
          ok: false,
          error: "Seats limit reached",
          seats: { used: seat.usedSeats, limit: seat.seatsLimit },
        });
      }

      const ttlHours = Number(req.body?.ttlHours || 72);
      const ttlMs = Math.max(1, Math.min(ttlHours, 24 * 30)) * 3600 * 1000; // max 30 giorni
      const expiresAt = new Date(Date.now() + ttlMs);

      // token plain + hash
      const tokenPlain = crypto.randomBytes(32).toString("hex");
      const tokenHash = sha256(tokenPlain);

      // se esiste invito pendente per stessa mail, lo sovrascriviamo
      await prisma.companyInvite.deleteMany({
        where: { companyId, email, acceptedAt: null },
      });

      const invite = await prisma.companyInvite.create({
        data: {
          companyId,
          email,
          role: role as any,
          tokenHash,
          expiresAt,
          createdByUserId: String(req.auth.sub || null),
        } as any,
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      return res.json({
        ok: true,
        invite,
        token: tokenPlain, // ⚠️ mostra SOLO qui
      });
    } catch (e: any) {
      console.error("POST /api/company/invites failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "invite create failed" });
    }
  }
);

/**
 * ✅ List Invites (ADMIN only)
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
      const companyId = String(req.auth.company || "").trim();

      const rows = await prisma.companyInvite.findMany({
        where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
          acceptedAt: true,
        },
      });

      return res.json({ ok: true, invites: rows });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "list failed" });
    }
  }
);

/**
 * ✅ Accept Invite (utente loggato)
 * POST /api/company/invites/accept
 * body: { token: string }
 *
 * NOTE: qui NON richiediamo requireCompany perché l’utente ancora non ce l’ha nel token.
 * Dopo accept: l’utente deve fare re-login per ottenere un JWT con company nel payload.
 */
r.post("/invites/accept", requireAuth, requireVerifiedEmail, async (req: any, res) => {
  try {
    const tokenPlain = String(req.body?.token || "").trim();
    if (!tokenPlain || tokenPlain.length < 20) {
      return res.status(400).json({ ok: false, error: "invalid token" });
    }

    const tokenHash = sha256(tokenPlain);

    const invite = await prisma.companyInvite.findFirst({
      where: {
        tokenHash,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        companyId: true,
        email: true,
        role: true,
        expiresAt: true,
      },
    });

    if (!invite) {
      return res.status(404).json({ ok: false, error: "invite not found or expired" });
    }

    // email deve combaciare con account (anti-share)
    const userEmail = normalizeEmail(req.user?.email || "");
    if (normalizeEmail(invite.email) !== userEmail) {
      return res.status(403).json({ ok: false, error: "invite email mismatch" });
    }

    // subscription + seats check
    const seat = await getSeatInfo(invite.companyId);
    if (!seat.active) return res.status(402).json({ ok: false, error: "Subscription inactive" });
    if (seat.seatsLimit != null && seat.usedSeats >= seat.seatsLimit) {
      return res.status(409).json({
        ok: false,
        error: "Seats limit reached",
        seats: { used: seat.usedSeats, limit: seat.seatsLimit },
      });
    }

    const userId = String(req.user?.id || req.auth?.sub || "");
    if (!userId) return res.status(401).json({ ok: false, error: "auth missing" });

    // map ProjectRole -> UserRole (app-level)
    // UserRole nel tuo schema sembra: "admin" | "user"
    const invitedCompanyRole = String(invite.role || "MITARBEITER").toUpperCase();
    const userRole =
      invitedCompanyRole === "ADMIN" ? ("admin" as any) : ("user" as any);

    await prisma.$transaction(async (tx) => {
      await tx.companyInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      // collega user alla company
      await tx.user.update({
        where: { id: userId },
        data: {
          companyId: invite.companyId,
          role: userRole,
        } as any,
      });

      // crea/aggiorna CompanyMember (seat)
      await tx.companyMember.upsert({
        where: { companyId_userId: { companyId: invite.companyId, userId } } as any,
        update: { role: invitedCompanyRole as any, active: true } as any,
        create: {
          companyId: invite.companyId,
          userId,
          role: invitedCompanyRole as any,
          active: true,
        } as any,
      });
    });

    return res.json({
      ok: true,
      accepted: true,
      companyId: invite.companyId,
      role: invite.role,
      message: "Invite accepted. Please log out and log in again to refresh token/company.",
    });
  } catch (e: any) {
    console.error("POST /api/company/invites/accept failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "accept failed" });
  }
});

export default r;
