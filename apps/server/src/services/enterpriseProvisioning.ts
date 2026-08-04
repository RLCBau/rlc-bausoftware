import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { getRlcAiMode } from "./ai/rlcAiGateway";

export type RlcServerPairingPayload = {
  type: "RLC_SERVER_PAIRING";
  version: 1;
  serverId: string;
  serverName: string;
  companyCode?: string;
  apiUrl: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function configDir(): string {
  return (
    clean(process.env.RLC_CONFIG_DIR) || path.join(path.dirname(PROJECTS_ROOT), "config")
  );
}

function readOrCreatePrivateValue(
  envName: string,
  fileName: string,
  bytes: number,
  prefix = ""
): string {
  const fromEnv = clean(process.env[envName]);
  if (fromEnv) return fromEnv;

  const dir = configDir();
  const file = path.join(dir, fileName);
  try {
    const existing = clean(fs.readFileSync(file, "utf8"));
    if (existing) return existing;
  } catch {}

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const value = `${prefix}${crypto.randomBytes(bytes).toString("hex")}`;
  fs.writeFileSync(file, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return value;
}

export function getRlcServerId(): string {
  return readOrCreatePrivateValue("RLC_SERVER_ID", "server-id", 16, "rlc-");
}

function getPairingSecret(): string {
  return readOrCreatePrivateValue("RLC_PAIRING_SECRET", "pairing-secret", 32);
}

function normalizeApiUrl(input: string): string {
  const value = clean(input).replace(/\/$/, "");
  if (!value) throw new Error("RLC_PUBLIC_API_URL fehlt");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("RLC_PUBLIC_API_URL ist ungültig");
  }

  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const allowInsecure = clean(process.env.RLC_ALLOW_INSECURE_PAIRING).toLowerCase() === "on";
  if (parsed.protocol !== "https:" && !local && !allowInsecure) {
    throw new Error("Private Server benötigen HTTPS für das Mobile-Pairing");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function getRlcServerIdentity() {
  const apiUrl = normalizeApiUrl(
    clean(process.env.RLC_PUBLIC_API_URL) || clean(process.env.API_PUBLIC_URL)
  );
  return {
    type: "RLC_SERVER_IDENTITY" as const,
    version: 1 as const,
    serverId: getRlcServerId(),
    serverName: clean(process.env.RLC_SERVER_NAME) || "RLC Private Server",
    companyCode: clean(process.env.RLC_COMPANY_CODE) || undefined,
    apiUrl,
    aiMode: getRlcAiMode(),
    capabilities: [
      "MOBILE_SYNC",
      "WEB",
      "RLC_COPILOT",
      "CONSTRUCTION_INTELLIGENCE_V2",
      "LOCAL_AI_FALLBACK",
    ],
  };
}

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", getPairingSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createRlcServerPairing(expiresInSeconds = 10 * 60) {
  const identity = getRlcServerIdentity();
  const now = Date.now();
  const ttl = Math.max(60, Math.min(60 * 60, Math.floor(expiresInSeconds)));
  const payload: RlcServerPairingPayload = {
    type: "RLC_SERVER_PAIRING",
    version: 1,
    serverId: identity.serverId,
    serverName: identity.serverName,
    companyCode: identity.companyCode,
    apiUrl: identity.apiUrl,
    issuedAt: now,
    expiresAt: now + ttl * 1000,
    nonce: crypto.randomBytes(12).toString("hex"),
  };

  const encoded = b64url(JSON.stringify(payload));
  const token = `${encoded}.${sign(encoded)}`;
  const qrValue = JSON.stringify({
    type: "RLC_SERVER_PAIRING",
    version: 1,
    apiUrl: payload.apiUrl,
    token,
  });

  return { payload, token, qrValue };
}

export function verifyRlcServerPairing(token: string): RlcServerPairingPayload {
  const [encoded, signature, extra] = clean(token).split(".");
  if (!encoded || !signature || extra) throw new Error("Ungültiger Pairing-Token");

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Pairing-Signatur ungültig");
  }

  let payload: RlcServerPairingPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Pairing-Daten ungültig");
  }

  if (payload?.type !== "RLC_SERVER_PAIRING" || payload?.version !== 1) {
    throw new Error("Pairing-Version nicht unterstützt");
  }
  if (payload.serverId !== getRlcServerId()) {
    throw new Error("Pairing gehört zu einem anderen Server");
  }
  if (payload.expiresAt <= Date.now()) throw new Error("Pairing-QR ist abgelaufen");

  const current = getRlcServerIdentity();
  if (payload.apiUrl !== current.apiUrl) {
    throw new Error("Server-URL wurde seit Erstellung des QR geändert");
  }

  return payload;
}

