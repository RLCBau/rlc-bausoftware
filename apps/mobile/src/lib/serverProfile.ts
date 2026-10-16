import AsyncStorage from "@react-native-async-storage/async-storage";
import { logout } from "./auth";

const SERVER_PROFILE_KEY = "rlc_verified_server_profile_v1";

export type RlcServerProfile = {
  serverId: string;
  serverName: string;
  companyCode?: string;
  apiUrl: string;
  aiMode?: "HYBRID" | "LOCAL" | "OPENAI";
  capabilities?: string[];
  verifiedAt: string;
  source: "qr" | "cloud";
};

type PairingQr = {
  type: "RLC_SERVER_PAIRING";
  version: 1;
  apiUrl: string;
  token: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeApiUrl(input: string): string {
  const value = clean(input).replace(/\/$/, "");
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("Die Server-URL ist ungültig.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Die Server-URL ist ungültig.");
  }

  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  if (parsed.protocol !== "https:" && !local && !isDev) {
    throw new Error("Private Server müssen über HTTPS erreichbar sein.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function parsePairingQr(rawValue: string): PairingQr {
  let value: any;
  try {
    value = JSON.parse(clean(rawValue));
  } catch {
    throw new Error("Dieser QR-Code gehört nicht zu RLC Bausoftware.");
  }

  if (
    value?.type !== "RLC_SERVER_PAIRING" ||
    Number(value?.version) !== 1 ||
    !clean(value?.token)
  ) {
    throw new Error("RLC Server-QR ungültig oder nicht unterstützt.");
  }

  return {
    type: "RLC_SERVER_PAIRING",
    version: 1,
    apiUrl: normalizeApiUrl(value.apiUrl),
    token: clean(value.token),
  };
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(clean(data?.error || data?.message) || `HTTP ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function profileFromServer(value: any, source: "qr" | "cloud"): RlcServerProfile {
  const serverId = clean(value?.serverId);
  const serverName = clean(value?.serverName) || "RLC Server";
  const apiUrl = normalizeApiUrl(value?.apiUrl);
  if (!serverId) throw new Error("Der Server hat keine gültige RLC Server-ID.");

  const aiMode = clean(value?.aiMode).toUpperCase();
  return {
    serverId,
    serverName,
    companyCode: clean(value?.companyCode) || undefined,
    apiUrl,
    aiMode:
      aiMode === "LOCAL" || aiMode === "OPENAI" || aiMode === "HYBRID"
        ? (aiMode as RlcServerProfile["aiMode"])
        : undefined,
    capabilities: Array.isArray(value?.capabilities)
      ? value.capabilities.map(clean).filter(Boolean)
      : [],
    verifiedAt: clean(value?.verifiedAt) || new Date().toISOString(),
    source,
  };
}

async function persistVerifiedProfile(profile: RlcServerProfile) {
  const previous = await getServerProfile();
  const changed =
    !!previous &&
    (previous.serverId !== profile.serverId || previous.apiUrl !== profile.apiUrl);

  if (changed) {
    // A JWT from server A must never be sent to server B.
    await logout("SERVER_SYNC");
  }

  await AsyncStorage.setItem(SERVER_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function getServerProfile(): Promise<RlcServerProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(SERVER_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return profileFromServer(parsed, parsed?.source === "cloud" ? "cloud" : "qr");
  } catch {
    return null;
  }
}

export async function getVerifiedServerApiUrl(): Promise<string | null> {
  const profile = await getServerProfile();
  return profile?.apiUrl || null;
}

export async function verifyAndSavePairingQr(
  qrValue: string
): Promise<RlcServerProfile> {
  const qr = parsePairingQr(qrValue);
  const result = await fetchJsonWithTimeout(`${qr.apiUrl}/api/enterprise/pairing/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token: qr.token }),
  });

  if (result?.ok !== true || result?.verified !== true) {
    throw new Error("Der RLC Server konnte den QR-Code nicht bestätigen.");
  }

  const profile = profileFromServer(result.profile, "qr");
  if (profile.apiUrl !== qr.apiUrl) {
    throw new Error("Server-URL und QR-Code stimmen nicht überein.");
  }
  return persistVerifiedProfile(profile);
}

export async function verifyAndSaveCloudServer(
  cloudApiUrl: string
): Promise<RlcServerProfile> {
  const apiUrl = normalizeApiUrl(cloudApiUrl);
  const result = await fetchJsonWithTimeout(`${apiUrl}/api/enterprise/identity`, {
    headers: { Accept: "application/json" },
  });
  if (result?.ok !== true || result?.type !== "RLC_SERVER_IDENTITY") {
    throw new Error("Die RLC Cloud konnte nicht verifiziert werden.");
  }
  const profile = profileFromServer(result, "cloud");
  if (profile.apiUrl !== apiUrl) {
    throw new Error("Die RLC Cloud meldet eine andere Server-URL.");
  }
  return persistVerifiedProfile(profile);
}

export async function clearServerProfile(): Promise<void> {
  await logout("SERVER_SYNC");
  await AsyncStorage.removeItem(SERVER_PROFILE_KEY);
}
