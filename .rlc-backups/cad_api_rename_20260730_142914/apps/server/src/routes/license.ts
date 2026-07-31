// apps/server/src/routes/license.ts
import express from "express";
import { z } from "zod";
import {
  activateServerLicense,
  checkAdminKeyFromHeader,
  generateLicenseCode,
  hasActiveServerLicense,
  isAdminBypassEmail,
  verifyLicenseCode,
} from "../lib/license";

const r = express.Router();

const ActivateSchema = z.object({
  code: z.string().min(10),
});

r.get("/status", (req: any, res) => {
  const email = String(req?.user?.email || "").trim().toLowerCase();
  const mode = String(req?.user?.mode || "NUR_APP");
  const adminBypass = isAdminBypassEmail(email);

  if (!email) {
    return res.json({ ok: true, mode, email: null, adminBypass, licensed: false });
  }

  if (adminBypass) {
    return res.json({ ok: true, mode, email, adminBypass: true, licensed: true, tier: "SERVER" });
  }

  const lic = hasActiveServerLicense(email);
  if (!lic.ok) {
    return res.json({ ok: true, mode, email, adminBypass: false, licensed: false });
  }

  return res.json({
    ok: true,
    mode,
    email,
    adminBypass: false,
    licensed: true,
    tier: lic.payload.tier,
    exp: lic.payload.exp || null,
    issuedAt: lic.payload.issuedAt,
  });
});

/**
 * L'utente inserisce il codice e lo “attiva” per la sua email (dal token).
 */
r.post("/activate", (req: any, res) => {
  const email = String(req?.user?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: "NO_EMAIL" });

  // admin sempre ok senza attivare nulla
  if (isAdminBypassEmail(email)) {
    return res.json({ ok: true, adminBypass: true, licensed: true });
  }

  const body = ActivateSchema.parse(req.body);
  const out = activateServerLicense(email, body.code);
  if (!out.ok) return res.status(400).json(out);

  return res.json({ ok: true, licensed: true, payload: out.payload });
});

/**
 * Admin tool: genera un codice per una email (solo con x-admin-key)
 * Utile per te: lo chiami e copi/incolli il code al cliente.
 */
const GenerateSchema = z.object({
  email: z.string().email(),
  exp: z.string().optional(), // ISO date opzionale
  note: z.string().optional(),
});

r.post("/generate", (req: any, res) => {
  const guard = checkAdminKeyFromHeader(req);
  if (!guard.ok) return res.status(401).json(guard);

  const body = GenerateSchema.parse(req.body);

  const payload = {
    email: String(body.email).trim().toLowerCase(),
    tier: "SERVER" as const,
    issuedAt: new Date().toISOString(),
    exp: body.exp ? String(body.exp) : undefined,
    note: body.note ? String(body.note) : undefined,
  };

  const code = generateLicenseCode(payload);
  return res.json({ ok: true, code, payload });
});

/**
 * Admin tool: verifica un codice (debug)
 */
const VerifySchema = z.object({ code: z.string().min(10) });
r.post("/verify", (req: any, res) => {
  const guard = checkAdminKeyFromHeader(req);
  if (!guard.ok) return res.status(401).json(guard);

  const body = VerifySchema.parse(req.body);
  const v = verifyLicenseCode(body.code);
  return res.json(v);
});

export default r;
