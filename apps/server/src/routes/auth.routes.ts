// apps/server/src/routes/auth.routes.ts
import express from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

// bcrypt (JS-only, no native build)
import bcrypt from "bcryptjs";

// usa SOLO il tuo mailer centralizzato (services/mailer.ts)
import { sendMangelMail } from "../services/mailer";

const r = express.Router();

/** =========================
 * Schemas
 * ========================= */
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  mode: z.enum(["NUR_APP", "SERVER_SYNC"]).default("SERVER_SYNC"),
  name: z.string().min(1).optional(),
  role: z.string().min(2).optional(), // legacy/compat
  appRole: z.string().min(2).optional(), // preferred
  inviteCode: z.string().min(4).optional(),
});

const VerifySchema = z.object({
  token: z.string().min(4),
  mode: z.enum(["NUR_APP", "SERVER_SYNC"]).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mode: z.enum(["NUR_APP", "SERVER_SYNC"]).default("SERVER_SYNC"),
});

const ResendSchema = z.object({
  email: z.string().email(),
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

const PasswordResetConfirmSchema = z.object({
  token: z.string().min(4),
  password: z.string().min(6),
});

/** =========================
 * helpers
 * ========================= */
function jwtSecret() {
  return process.env.JWT_SECRET || "dev_secret_change_me";
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function apiBaseUrl() {
  return String(process.env.API_SELF_URL || "http://localhost:4000").replace(/\/$/, "");
}

function normalizeRole(body: { role?: string; appRole?: string }) {
  const v = (body.appRole || body.role || "").trim();
  return v ? v.toUpperCase() : null;
}

function looksLikeBcryptHash(pw: string) {
  return /^\$2[aby]\$/.test(String(pw || ""));
}

async function hashPassword(plain: string) {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(plain, rounds);
}

async function verifyPassword(dbPassword: string, inputPassword: string) {
  const dbPw = String(dbPassword || "");
  const inPw = String(inputPassword || "");
  if (!dbPw || !inPw) return { ok: false, needsUpgrade: false };

  if (looksLikeBcryptHash(dbPw)) {
    const ok = await bcrypt.compare(inPw, dbPw);
    return { ok, needsUpgrade: false };
  }

  const ok = dbPw === inPw;
  return { ok, needsUpgrade: ok };
}

function signToken(
  u: {
    id: string;
    email: string;
    appRole?: string | null;
    emailVerifiedAt?: Date | string | null;
  },
  mode: "NUR_APP" | "SERVER_SYNC",
  extra?: { companyId?: string | null; companyRole?: string | null }
) {
  const companyId = (
    extra && Object.prototype.hasOwnProperty.call(extra, "companyId")
      ? extra.companyId
      : process.env.DEV_COMPANY_ID ?? null
  ) as
    | string
    | null;

  const companyRole =
    (extra?.companyRole ?? null) ||
    (process.env.DEV_ROLE ? String(process.env.DEV_ROLE) : null) ||
    (u.appRole ? String(u.appRole) : null);

  const ev = u.emailVerifiedAt ?? null;
  const emailVerifiedAt =
    ev instanceof Date
      ? ev.toISOString()
      : typeof ev === "string"
        ? ev
        : null;

  return jwt.sign(
    {
      sub: u.id,
      email: u.email,
      role: u.appRole || undefined,
      mode,
      emailVerifiedAt,
      emailVerified: !!ev,
      companyId,
      companyRole,
    },
    jwtSecret(),
    { expiresIn: "30d" }
  );
}

function newVerifyToken() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const verifyTokenHash = sha256(code);
  const verifyTokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  return { verifyToken: code, verifyTokenHash, verifyTokenExpiry };
}

function newResetToken() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const resetTokenHash = sha256(code);
  const resetTokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 2);
  return { resetToken: code, resetTokenHash, resetTokenExpiry };
}

async function sendResetMail(toEmail: string, resetCode: string) {
  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2>RLC Bausoftware – Passwort zurücksetzen</h2>
      <p>Dein Reset-Code:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:2px">${resetCode}</div>
      <p>Der Code ist 2 Stunden gültig.</p>
    </div>
  `;

  const subject = "RLC Bausoftware – Passwort zurücksetzen";

  const out = await sendMangelMail({
    to: toEmail,
    subject,
    html,
    attachments: undefined,
  });

  if (!out.ok) {
    console.warn("[AUTH][MAIL] reset failed:", out.error);
    return { ok: false as const, error: out.error };
  }

  return { ok: true as const, meta: out };
}

async function sendVerifyMail(toEmail: string, verifyCode: string) {
  const link = `${apiBaseUrl()}/api/auth/verify?token=${encodeURIComponent(verifyCode)}`;

  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2>RLC Bausoftware – E-Mail bestätigen</h2>
      <p>Dein Bestätigungscode:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:2px">${verifyCode}</div>
      <p>Oder klicke auf den Link:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Der Code/Link ist 24 Stunden gültig.</p>
    </div>
  `;

  if ((process.env.NODE_ENV || "").toLowerCase() !== "production") {
    console.log("[AUTH][MAIL] verify requested:", { toEmail, verifyCode, link });
  }

  const subject = "RLC Bausoftware – E-Mail bestätigen";

  const out = await sendMangelMail({
    to: toEmail,
    subject,
    html,
    attachments: undefined,
  });

  if (!out.ok) {
    console.warn("[AUTH][MAIL] send failed:", out.error);
    return { ok: false as const, error: out.error, link };
  }

  return { ok: true as const, link, meta: out };
}

async function getUserCompanyPayload(userId: string) {
  const fullUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      appRole: true,
      emailVerifiedAt: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          phone: true,
          email: true,
          logoPath: true,
          updatedAt: true,
        },
      },
      companyMembers: {
        where: { active: true },
        select: { role: true, companyId: true },
        take: 1,
      },
    },
  });

  return fullUser;
}

async function assertInviteUsable(inviteCode: string, email: string) {
  const code = String(inviteCode || "").trim();

  const invite = await prisma.companyInvite.findUnique({
    where: { code },
    include: {
      company: {
        include: {
          subscription: true,
          members: {
            where: { active: true },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!invite) {
    return { ok: false as const, status: 400, error: "INVITE_INVALID" };
  }

  if (!invite.isActive) {
    return { ok: false as const, status: 400, error: "INVITE_INACTIVE" };
  }

  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, status: 400, error: "INVITE_EXPIRED" };
  }

  if (invite.usedCount >= invite.maxUses) {
    return { ok: false as const, status: 400, error: "INVITE_ALREADY_USED" };
  }

  if (invite.email && invite.email.trim().toLowerCase() !== email) {
    return { ok: false as const, status: 400, error: "INVITE_EMAIL_MISMATCH" };
  }

  const webSeatsPurchased = Number(invite.company.subscription?.webSeatsPurchased || 0);
  const activeMembers = Number(invite.company.members?.length || 0);

  if (webSeatsPurchased > 0 && activeMembers >= webSeatsPurchased) {
    return { ok: false as const, status: 409, error: "WEB_SEAT_LIMIT_REACHED" };
  }

  return { ok: true as const, invite };
}

/** =========================
 * POST /api/auth/register
 * ========================= */
r.post("/register", async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const role = normalizeRole(body);
    const inviteCode = body.inviteCode?.trim() || null;

    if (inviteCode) {
      const inviteCheck = await assertInviteUsable(inviteCode, email);
      if (!inviteCheck.ok) {
        return res.status(inviteCheck.status).json({
          ok: false,
          error: inviteCheck.error,
        });
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    if (existing?.emailVerifiedAt) {
      return res.status(409).json({ ok: false, error: "EMAIL_ALREADY_VERIFIED" });
    }

    const { verifyToken, verifyTokenHash, verifyTokenExpiry } = newVerifyToken();
    const pwHash = await hashPassword(body.password);

    let companyIdForUser: string | null = null;
    let companyRoleForUser: string | null = role;

    if (inviteCode) {
      const inviteCheck = await assertInviteUsable(inviteCode, email);
      if (!inviteCheck.ok) {
        return res.status(inviteCheck.status).json({
          ok: false,
          error: inviteCheck.error,
        });
      }
      companyIdForUser = inviteCheck.invite.companyId;
      companyRoleForUser = String(inviteCheck.invite.role || role || "MITARBEITER");
    }

    const user = await prisma.$transaction(async (tx) => {
      const upserted = await tx.user.upsert({
        where: { email },
        create: {
          email,
          password: pwHash,
          name: body.name?.trim() || null,
          appRole: companyRoleForUser,
          companyId: companyIdForUser,
          verifyTokenHash,
          verifyTokenExpiry,
          emailVerifiedAt: null,
        },
        update: {
          password: pwHash,
          name: body.name?.trim() || undefined,
          appRole: companyRoleForUser ?? role ?? undefined,
          companyId: companyIdForUser ?? undefined,
          verifyTokenHash,
          verifyTokenExpiry,
        },
        select: {
          id: true,
          email: true,
          appRole: true,
          emailVerifiedAt: true,
          companyId: true,
        },
      });

      if (inviteCode && companyIdForUser) {
        const invite = await tx.companyInvite.findUnique({
          where: { code: inviteCode },
          select: {
            id: true,
            companyId: true,
            role: true,
            usedCount: true,
            maxUses: true,
            isActive: true,
            expiresAt: true,
          },
        });

        if (!invite) {
          throw new Error("INVITE_INVALID");
        }

        if (!invite.isActive) {
          throw new Error("INVITE_INACTIVE");
        }

        if (invite.expiresAt.getTime() <= Date.now()) {
          throw new Error("INVITE_EXPIRED");
        }

        if (invite.usedCount >= invite.maxUses) {
          throw new Error("INVITE_ALREADY_USED");
        }

        const subscription = await tx.companySubscription.findUnique({
          where: { companyId: companyIdForUser },
          select: { webSeatsPurchased: true },
        });

        const activeMembersCount = await tx.companyMember.count({
          where: { companyId: companyIdForUser, active: true },
        });

        const webSeatsPurchased = Number(subscription?.webSeatsPurchased || 0);
        if (webSeatsPurchased > 0 && activeMembersCount >= webSeatsPurchased) {
          throw new Error("WEB_SEAT_LIMIT_REACHED");
        }

        await tx.companyMember.upsert({
          where: {
            companyId_userId: {
              companyId: companyIdForUser,
              userId: upserted.id,
            },
          },
          create: {
            companyId: companyIdForUser,
            userId: upserted.id,
            role: invite.role,
            active: true,
          },
          update: {
            role: invite.role,
            active: true,
          },
        });

        await tx.companyInvite.update({
          where: { id: invite.id },
          data: {
            usedCount: { increment: 1 },
            acceptedAt: new Date(),
            isActive: invite.usedCount + 1 >= invite.maxUses ? false : true,
          },
        });
      }

      return upserted;
    });

    let mail: any = null;
    let verificationSent = true;

    if (!user.emailVerifiedAt) {
      mail = await sendVerifyMail(email, verifyToken);
      verificationSent = !!mail?.ok;
    }

    const fullUser = await getUserCompanyPayload(user.id);

    const token = signToken(fullUser ?? user, body.mode, {
      companyId: fullUser?.companyId ?? user.companyId ?? null,
      companyRole:
        (fullUser?.companyMembers?.[0]?.role as string | null | undefined) ??
        (fullUser?.appRole ?? user.appRole ?? null),
    });

    return res.json({
      ok: true,
      token,
      verificationSent,
      ...(verificationSent ? {} : { mailError: mail?.error || "EMAIL_SEND_FAILED" }),
      ...(process.env.NODE_ENV !== "production" ? { mailDebug: mail } : {}),
      user: {
        id: fullUser?.id ?? user.id,
        email: fullUser?.email ?? user.email,
        appRole: fullUser?.appRole ?? user.appRole,
        emailVerifiedAt: fullUser?.emailVerifiedAt ?? user.emailVerifiedAt,
        companyId: fullUser?.companyId ?? user.companyId ?? null,
        companyRole: fullUser?.companyMembers?.[0]?.role ?? null,
      },
      company: fullUser?.company ?? null,
    });
  } catch (e: any) {
    if (
      e?.message === "INVITE_INVALID" ||
      e?.message === "INVITE_INACTIVE" ||
      e?.message === "INVITE_EXPIRED" ||
      e?.message === "INVITE_ALREADY_USED" ||
      e?.message === "WEB_SEAT_LIMIT_REACHED"
    ) {
      return res.status(e.message === "WEB_SEAT_LIMIT_REACHED" ? 409 : 400).json({
        ok: false,
        error: e.message,
      });
    }
    next(e);
  }
});

/** =========================
 * internal verify
 * ========================= */
async function doVerify(token: string, mode: "NUR_APP" | "SERVER_SYNC") {
  const t = String(token || "").trim();
  const tokenHash = sha256(t);

  const u = await prisma.user.findFirst({
    where: {
      verifyTokenHash: tokenHash,
      verifyTokenExpiry: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      appRole: true,
      emailVerifiedAt: true,
    },
  });

  if (!u) return null;

  const updated = await prisma.user.update({
    where: { id: u.id },
    data: {
      emailVerifiedAt: u.emailVerifiedAt ?? new Date(),
      verifyTokenHash: null,
      verifyTokenExpiry: null,
    },
    select: {
      id: true,
      email: true,
      appRole: true,
      emailVerifiedAt: true,
    },
  });

  const fullUser = await getUserCompanyPayload(updated.id);

  const jwtToken = signToken(fullUser ?? updated, mode, {
    companyId: fullUser?.companyId ?? null,
    companyRole:
      (fullUser?.companyMembers?.[0]?.role as string | null | undefined) ??
      (fullUser?.appRole ?? updated.appRole ?? null),
  });

  return { user: fullUser ?? updated, token: jwtToken };
}

/** =========================
 * GET /api/auth/verify?token=...
 * ========================= */
r.get("/verify", async (req, res, next) => {
  try {
    const token = String(req.query?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "TOKEN_MISSING" });

    const mode =
      String(req.query?.mode || "").toUpperCase() === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";

    const out = await doVerify(token, mode);
    if (!out) return res.status(400).json({ ok: false, error: "TOKEN_INVALID" });

    const redirect = String(process.env.PUBLIC_VERIFY_REDIRECT || "").trim();
    if (redirect) {
      const url = redirect.includes("?") ? `${redirect}&ok=1` : `${redirect}?ok=1`;
      return res.redirect(url);
    }

    return res.json({ ok: true, token: out.token, user: out.user });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/verify */
r.post("/verify", async (req, res, next) => {
  try {
    const body = VerifySchema.parse(req.body);
    const mode = body.mode || "SERVER_SYNC";

    const out = await doVerify(body.token, mode);
    if (!out) return res.status(400).json({ ok: false, error: "TOKEN_INVALID" });

    return res.json({ ok: true, token: out.token, user: out.user });
  } catch (e) {
    next(e);
  }
});

/** =========================
 * POST /api/auth/resend
 * ========================= */
r.post("/resend", async (req, res, next) => {
  try {
    const body = ResendSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();

    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!u) return res.json({ ok: true });

    if (u.emailVerifiedAt) {
      return res.status(409).json({ ok: false, error: "EMAIL_ALREADY_VERIFIED" });
    }

    const { verifyToken, verifyTokenHash, verifyTokenExpiry } = newVerifyToken();

    await prisma.user.update({
      where: { id: u.id },
      data: { verifyTokenHash, verifyTokenExpiry },
    });

    const mail = await sendVerifyMail(email, verifyToken);

    return res.json({
      ok: true,
      verificationSent: !!mail.ok,
      ...(mail.ok ? {} : { mailError: mail.error || "EMAIL_SEND_FAILED" }),
      ...(process.env.NODE_ENV !== "production" ? { mailDebug: mail } : {}),
    });
  } catch (e) {
    next(e);
  }
});

/** =========================
 * POST /api/auth/password-reset/request
 * ========================= */
r.post("/password-reset/request", async (req, res, next) => {
  try {
    const body = PasswordResetRequestSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();

    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!u) return res.json({ ok: true });
    if (!u.emailVerifiedAt) {
      return res.status(409).json({ ok: false, error: "EMAIL_NOT_VERIFIED", canResend: true });
    }

    const { resetToken, resetTokenHash, resetTokenExpiry } = newResetToken();

    await prisma.user.update({
      where: { id: u.id },
      data: { resetTokenHash, resetTokenExpiry },
    });

    const mail = await sendResetMail(email, resetToken);

    return res.json({
      ok: true,
      resetSent: !!mail.ok,
      ...(mail.ok ? {} : { mailError: mail.error || "EMAIL_SEND_FAILED" }),
      ...(process.env.NODE_ENV !== "production" ? { mailDebug: mail } : {}),
    });
  } catch (e) {
    next(e);
  }
});

/** =========================
 * POST /api/auth/password-reset/confirm
 * ========================= */
r.post("/password-reset/confirm", async (req, res, next) => {
  try {
    const body = PasswordResetConfirmSchema.parse(req.body);
    const tokenHash = sha256(String(body.token || "").trim());

    const u = await prisma.user.findFirst({
      where: {
        resetTokenHash: tokenHash,
        resetTokenExpiry: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!u) {
      return res.status(400).json({ ok: false, error: "TOKEN_INVALID" });
    }

    const pwHash = await hashPassword(body.password);

    await prisma.user.update({
      where: { id: u.id },
      data: {
        password: pwHash,
        resetTokenHash: null,
        resetTokenExpiry: null,
      },
    });

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** =========================
 * POST /api/auth/login
 * ========================= */
r.post("/login", async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();

    const u = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        appRole: true,
        emailVerifiedAt: true,
      },
    });

    if (!u) return res.status(401).json({ ok: false, error: "BAD_CREDENTIALS" });

    const check = await verifyPassword(String(u.password || ""), body.password);
    if (!check.ok) return res.status(401).json({ ok: false, error: "BAD_CREDENTIALS" });

    if (check.needsUpgrade) {
      try {
        const pwHash = await hashPassword(body.password);
        await prisma.user.update({ where: { id: u.id }, data: { password: pwHash } });
      } catch (err) {
        console.warn("[AUTH][LOGIN] password upgrade failed:", err);
      }
    }

    if (!u.emailVerifiedAt) {
      return res.status(403).json({
        ok: false,
        error: "EMAIL_NOT_VERIFIED",
        canResend: true,
      });
    }

    const fullUser = await getUserCompanyPayload(u.id);
    const isPlatformAccount = new Set([
      "info@rlcbausoftware.com",
      "info@rlcbausoftware",
    ]).has(email);

    const loginCompanyId = isPlatformAccount
      ? null
      : (fullUser?.companyId ?? null);

    const token = signToken(fullUser ?? u, body.mode, {
      companyId: loginCompanyId,
      companyRole: isPlatformAccount
        ? "PLATFORM_ADMIN"
        : (
            (fullUser?.companyMembers?.[0]?.role as string | null | undefined) ??
            (fullUser?.appRole ?? u.appRole ?? null)
          ),
    });

    return res.json({
      ok: true,
      token,
      user: {
        id: u.id,
        email: u.email,
        appRole: fullUser?.appRole ?? u.appRole,
        emailVerifiedAt: fullUser?.emailVerifiedAt ?? u.emailVerifiedAt,
        companyId: loginCompanyId,
        companyRole: isPlatformAccount
          ? "PLATFORM_ADMIN"
          : (fullUser?.companyMembers?.[0]?.role ?? null),
      },
      company: isPlatformAccount ? null : (fullUser?.company ?? null),
    });
  } catch (e) {
    next(e);
  }
});

export default r;
