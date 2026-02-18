import express from "express";
import jwt from "jsonwebtoken";

const r = express.Router();

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

r.post("/admin-login", (req, res) => {
  const key = String(req.headers["x-admin-key"] || "").trim();
  const must = String(process.env.ADMIN_BYPASS_KEY || "").trim();

  if (!must) return res.status(500).json({ ok: false, error: "ADMIN_KEY_NOT_SET" });
  if (!key || key !== must) return res.status(401).json({ ok: false, error: "BAD_ADMIN_KEY" });

  const email = normEmail(req.body?.email);
  if (!isAdminBypassEmail(email)) {
    return res.status(403).json({ ok: false, error: "NOT_IN_ADMIN_BYPASS" });
  }

  const nowIso = new Date().toISOString();

  const token = jwt.sign(
    {
      sub: "admin-bypass",
      email,
      role: "ADMIN",
      mode: "SERVER_SYNC",
      emailVerified: true,
      emailVerifiedAt: nowIso,
    },
    jwtSecret(),
    { expiresIn: "30d" }
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
    },
  });
});

export default r;
