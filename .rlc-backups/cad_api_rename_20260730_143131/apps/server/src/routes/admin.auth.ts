import express from "express";
import jwt from "jsonwebtoken";

const r = express.Router();

// =========================================================
// Helpers
// =========================================================

function jwtSecret() {
  return process.env.JWT_SECRET || "dev_secret_change_me";
}

function normEmail(x: any) {
  return String(x || "").trim().toLowerCase();
}

function isAdminBypassEmail(email?: string | null) {
  const e = normEmail(email);
  if (!e) return false;

  const raw = String(process.env.ADMIN_BYPASS_EMAILS || "");
  const list = raw
    .split(",")
    .map((s) => normEmail(s))
    .filter(Boolean);

  return list.includes(e);
}

type Mode = "NUR_APP" | "SERVER_SYNC";

type UserLike = {
  id: string;
  email: string;
  appRole?: string | null;
  emailVerifiedAt?: Date | null;
};

type TokenExtra = {
  companyId?: string | null;
  companyRole?: string | null;
};

// Wichtig: companyId muss im Token drin sein, sonst schlagen requireCompany/guards fehl.
function signToken(u: UserLike, mode: Mode, extra?: TokenExtra) {
  const devCompanyId = process.env.DEV_COMPANY_ID || null;

  // companyId: extra > ENV
  const companyId = extra?.companyId ?? devCompanyId ?? null;

  // companyRole: extra > appRole > ENV
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
 * =========================================================
 * Admin Bypass Login
 * POST /api/auth/admin-login
 * Header: x-admin-key: <ADMIN_BYPASS_KEY>
 * Body: { email: string }
 * =========================================================
 */
r.post("/admin-login", (req, res) => {
  const key = String(req.headers["x-admin-key"] || "").trim();
  const must = String(process.env.ADMIN_BYPASS_KEY || "").trim();

  if (!must) {
    return res.status(500).json({ ok: false, error: "ADMIN_KEY_NOT_SET" });
  }
  if (!key || key !== must) {
    return res.status(401).json({ ok: false, error: "BAD_ADMIN_KEY" });
  }

  const email = normEmail(req.body?.email);
  if (!isAdminBypassEmail(email)) {
    return res.status(403).json({ ok: false, error: "NOT_IN_ADMIN_BYPASS" });
  }

  // IMPORTANTISSIMO: senza DEV_COMPANY_ID avrai "Keine Firma im Token"
  const devCompanyId = process.env.DEV_COMPANY_ID || null;
  if (!devCompanyId) {
    return res.status(500).json({ ok: false, error: "DEV_COMPANY_ID_NOT_SET" });
  }

  const nowIso = new Date().toISOString();

  const token = signToken(
    {
      id: "admin-bypass",
      email,
      appRole: "ADMIN",
      emailVerifiedAt: new Date(),
    },
    "SERVER_SYNC",
    {
      companyId: devCompanyId,
      companyRole: "ADMIN",
    }
  );

  return res.json({
    ok: true,
    token,
    user: {
      id: "admin-bypass",
      email,
      role: "ADMIN",
      mode: "SERVER_SYNC",
      emailVerified: true,
      emailVerifiedAt: nowIso,
      companyId: devCompanyId,
      companyRole: "ADMIN",
    },
  });
});

export default r;
