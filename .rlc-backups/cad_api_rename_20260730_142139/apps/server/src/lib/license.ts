// apps/server/src/lib/license.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PROJECTS_ROOT } from "./projectsRoot";

type LicensePayload = {
  email: string;          // lowercase
  tier: "SERVER";
  exp?: string;           // ISO date (optional)
  issuedAt: string;       // ISO date
  note?: string;          // optional
};

type LicenseStore = {
  byEmail: Record<
    string,
    {
      code: string;
      payload: LicensePayload;
      activatedAt: string; // ISO
      lastSeenAt?: string; // ISO
    }
  >;
};

function mustEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing ENV: ${name}`);
  return v;
}

function licenseSecret() {
  return mustEnv("LICENSE_SECRET");
}

function adminBypassKey() {
  return String(process.env.ADMIN_BYPASS_KEY || "").trim();
}

function adminBypassEmails(): string[] {
  const raw = String(process.env.ADMIN_BYPASS_EMAILS || "");
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminBypassEmail(email?: string | null) {
  if (!email) return false;
  return adminBypassEmails().includes(String(email).trim().toLowerCase());
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function base64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

/**
 * License code format:
 *   RLC1.<payloadBase64url>.<sigBase64url>
 * where sig = HMAC-SHA256(secret, "RLC1."+payloadBase64url)
 */
export function generateLicenseCode(payload: LicensePayload): string {
  const p = { ...payload, email: normalizeEmail(payload.email) };
  const payloadJson = Buffer.from(JSON.stringify(p), "utf8");
  const payloadB64u = base64urlEncode(payloadJson);
  const head = `RLC1.${payloadB64u}`;
  const sig = crypto.createHmac("sha256", licenseSecret()).update(head).digest();
  const sigB64u = base64urlEncode(sig);
  return `${head}.${sigB64u}`;
}

export function verifyLicenseCode(code: string): { ok: true; payload: LicensePayload } | { ok: false; error: string } {
  const raw = String(code || "").trim();
  if (!raw) return { ok: false, error: "EMPTY_CODE" };

  const parts = raw.split(".");
  if (parts.length !== 3) return { ok: false, error: "BAD_FORMAT" };
  const [prefix, payloadB64u, sigB64u] = parts;
  if (prefix !== "RLC1") return { ok: false, error: "BAD_PREFIX" };

  const head = `RLC1.${payloadB64u}`;
  const expected = crypto.createHmac("sha256", licenseSecret()).update(head).digest();
  const got = base64urlDecode(sigB64u);

  // timing-safe compare
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
    return { ok: false, error: "BAD_SIGNATURE" };
  }

  let payload: any = null;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64u).toString("utf8"));
  } catch {
    return { ok: false, error: "BAD_PAYLOAD" };
  }

  const email = normalizeEmail(payload?.email || "");
  if (!email || !email.includes("@")) return { ok: false, error: "BAD_EMAIL" };
  if (payload?.tier !== "SERVER") return { ok: false, error: "BAD_TIER" };

  // optional expiry
  if (payload?.exp) {
    const expMs = Date.parse(String(payload.exp));
    if (!Number.isFinite(expMs)) return { ok: false, error: "BAD_EXP" };
    if (Date.now() > expMs) return { ok: false, error: "EXPIRED" };
  }

  if (!payload?.issuedAt) {
    return { ok: false, error: "MISSING_ISSUED_AT" };
  }

  return { ok: true, payload: payload as LicensePayload };
}

/* =======================
 * File-based store (robust anche senza DB)
 * ======================= */

function licenseDir() {
  return path.join(PROJECTS_ROOT, "_licenses");
}
function storePath() {
  return path.join(licenseDir(), "store.json");
}

function ensureStoreDir() {
  fs.mkdirSync(licenseDir(), { recursive: true });
}

function readStore(): LicenseStore {
  ensureStoreDir();
  const p = storePath();
  if (!fs.existsSync(p)) return { byEmail: {} };

  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return { byEmail: {} };
    if (!j.byEmail || typeof j.byEmail !== "object") return { byEmail: {} };
    return j as LicenseStore;
  } catch {
    return { byEmail: {} };
  }
}

function writeStore(next: LicenseStore) {
  ensureStoreDir();
  fs.writeFileSync(storePath(), JSON.stringify(next, null, 2), "utf8");
}

export function hasActiveServerLicense(email: string): { ok: true; payload: LicensePayload; code: string } | { ok: false } {
  const e = normalizeEmail(email);
  const st = readStore();
  const row = st.byEmail[e];
  if (!row?.code) return { ok: false };

  const v = verifyLicenseCode(row.code);
  if (!v.ok) return { ok: false };

  return { ok: true, payload: v.payload, code: row.code };
}

export function touchLicenseSeen(email: string) {
  const e = normalizeEmail(email);
  const st = readStore();
  const row = st.byEmail[e];
  if (!row) return;
  row.lastSeenAt = new Date().toISOString();
  st.byEmail[e] = row;
  writeStore(st);
}

export function activateServerLicense(email: string, code: string) {
  const e = normalizeEmail(email);
  const v = verifyLicenseCode(code);
  if (!v.ok) return v;

  // Vincolo: codice deve appartenere alla stessa email (evita “girare” licenze)
  if (normalizeEmail(v.payload.email) !== e) {
    return { ok: false as const, error: "EMAIL_MISMATCH" };
  }

  const st = readStore();
  st.byEmail[e] = {
    code: String(code).trim(),
    payload: v.payload,
    activatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  writeStore(st);

  return { ok: true as const, payload: v.payload };
}

/** Utility: admin endpoint guard */
export function checkAdminKeyFromHeader(req: any): { ok: true } | { ok: false; error: string } {
  const must = adminBypassKey();
  if (!must) return { ok: false, error: "ADMIN_KEY_NOT_SET" };
  const got = String(req?.headers?.["x-admin-key"] || "").trim();
  if (!got || got !== must) return { ok: false, error: "BAD_ADMIN_KEY" };
  return { ok: true };
}
