// apps/server/src/routes/auth.routes.ts
import express from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

// ✅ usa SOLO il tuo mailer centralizzato (services/mailer.ts)
import { sendMangelMail } from "../services/mailer";

const r = express.Router();

/** =========================
 * Schemas (accept role OR appRole)
 * ========================= */
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  mode: z.enum(["NUR_APP", "SERVER_SYNC"]).default("SERVER_SYNC"),
  name: z.string().min(1).optional(),
  role: z.string().min(2).optional(), // legacy/compat
  appRole: z.string().min(2).optional(), // preferred
});

const VerifySchema = z.object({
  token: z.string().min(4), // accettiamo anche 6-digit
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

/** =========================
 * helpers
 * ========================= */
function jwtSecret() {
  return process.env.JWT_SECRET || "dev_secret_change_me";
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// ✅ usa API_SELF_URL (dev locale) → fallback
function apiBaseUrl() {
  return String(process.env.API_SELF_URL || "http://localhost:4000").replace(/\/$/, "");
}

function normalizeRole(body: { role?: string; appRole?: string }) {
  const v = (body.appRole || body.role || "").trim();
  return v ? v.toUpperCase() : null;
}

/**
 * ✅ Token JWT
 * - include companyId in DEV per evitare "Keine Firma im Token"
 */
function signToken(
  u: { id: string; email: string; appRole?: string | null; emailVerifiedAt?: Date | null },
  mode: "NUR_APP" | "SERVER_SYNC",
  extra?: { companyId?: string | null; companyRole?: string | null }
) {
  const devCompanyId = process.env.DEV_COMPANY_ID || null;
  const companyId = extra?.companyId ?? devCompanyId ?? null;

  const companyRole =
    extra?.companyRole ??
    (u.appRole ? String(u.appRole) : null) ??
    (process.env.DEV_ROLE ? String(process.env.DEV_ROLE) : null);

  return jwt.sign(
    {
      sub: u.id,
      email: u.email,
      role: u.appRole || undefined,
      mode,
      emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
      emailVerified: !!u.emailVerifiedAt,
      companyId,
      companyRole,
    },
    jwtSecret(),
    { expiresIn: "30d" }
  );
}

/**
 * ✅ 6-digit verify code
 */
function newVerifyToken() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const verifyTokenHash = sha256(code);
  const verifyTokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
  return { verifyToken: code, verifyTokenHash, verifyTokenExpiry };
}

/**
 * ✅ Verify mail builder/sender
 * - usa SOLO services/mailer.ts
 * - se DISABLE_EMAIL=1 logga link/code
 * - se invio fallisce: ritorna {ok:false,error} e lo riportiamo al client (DEV)
 */
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

  // Log sempre in DEV (ti salva quando non arriva)
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

/** =========================
 * POST /api/auth/register
 * ========================= */
r.post("/register", async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const role = normalizeRole(body);

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    if (existing?.emailVerifiedAt) {
      return res.status(409).json({ ok: false, error: "EMAIL_ALREADY_VERIFIED" });
    }

    const { verifyToken, verifyTokenHash, verifyTokenExpiry } = newVerifyToken();

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password: body.password, // TODO bcrypt
        name: body.name?.trim() || null,
        appRole: role,
        verifyTokenHash,
        verifyTokenExpiry,
        emailVerifiedAt: null,
      },
      update: {
        password: body.password,
        name: body.name?.trim() || undefined,
        appRole: role ?? undefined,
        verifyTokenHash,
        verifyTokenExpiry,
      },
      select: {
        id: true,
        email: true,
        appRole: true,
        emailVerifiedAt: true,
      },
    });

    // invia mail (solo se non verificata)
    let mail: any = null;
    let verificationSent = true;

    if (!user.emailVerifiedAt) {
      mail = await sendVerifyMail(email, verifyToken);
      verificationSent = !!mail?.ok;
    }

    // JWT provvisorio → include DEV_COMPANY_ID per evitare "Keine Firma im Token"
    const token = signToken(user, body.mode);

    // ✅ NON blocchiamo la registrazione se SMTP è rotto,
    // ma lo diciamo chiaramente al client (soprattutto in DEV)
    return res.json({
      ok: true,
      token,
      verificationSent,
      ...(verificationSent ? {} : { mailError: mail?.error || "EMAIL_SEND_FAILED" }),
      ...(process.env.NODE_ENV !== "production" ? { mailDebug: mail } : {}),
      user: {
        id: user.id,
        email: user.email,
        appRole: user.appRole,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    });
  } catch (e) {
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

  const jwtToken = signToken(updated, mode);
  return { user: updated, token: jwtToken };
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

/** POST /api/auth/verify (da App) */
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
    if (String(u.password || "") !== body.password)
      return res.status(401).json({ ok: false, error: "BAD_CREDENTIALS" });

    if (!u.emailVerifiedAt) {
      return res.status(403).json({
        ok: false,
        error: "EMAIL_NOT_VERIFIED",
        canResend: true,
      });
    }

    const token = signToken(u, body.mode);

    return res.json({
      ok: true,
      token,
      user: {
        id: u.id,
        email: u.email,
        appRole: u.appRole,
        emailVerifiedAt: u.emailVerifiedAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default r;
