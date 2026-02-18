// apps/mobile/src/lib/api.ts  (BLOCCO 1/2)
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { getToken } from "./auth";

import * as FileSystem from "expo-file-system";
import { Asset } from "expo-asset";

const API_URL_STORAGE_KEY = "api_base_url";

/**
 * Base URL resolution order (DEV):
 * 1) EXPO_PUBLIC_API_URL (env)
 * 2) AsyncStorage override (api_base_url)  [DEV ONLY]
 * 3) fallback https://api.rlcbausoftware.com (Cloudflare Tunnel)
 *
 * Production hardening:
 * - In PROD, AsyncStorage override is ignored.
 */
const ENV_API_URL_RAW = (process.env.EXPO_PUBLIC_API_URL?.trim() || "").replace(
  /\/$/,
  ""
);

// ✅ Default for real devices (Tunnel)
const FALLBACK_API_URL = "https://api.rlcbausoftware.com";

/** Keep a sync default (used for api.apiUrl field), real requests use getApiUrl() */
const API_URL = String(ENV_API_URL_RAW || "").trim()
  ? ENV_API_URL_RAW!.replace(/\/$/, "")
  : FALLBACK_API_URL.replace(/\/$/, "");

/** PROD hardening switch */
export const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : false;

/** App version headers (best effort; never throw) */
function appVersion() {
  try {
    return String(Application.nativeApplicationVersion || "0.0.0");
  } catch {
    return "0.0.0";
  }
}
function appBuild() {
  try {
    const v = Application.nativeBuildVersion;
    return v == null ? "" : String(v);
  } catch {
    return "";
  }
}

export type Project = {
  id: string; // UUID (DB) OR local-...
  code?: string;
  name?: string;
  number?: string | null;
  baustellenNummer?: string | null;
  client?: string;
  place?: string;
  ort?: string;
  kunde?: string;
};

type ProjectsResponse = { ok?: boolean; projects?: Project[] } | Project[];

/** =========================
 *  Helpers: Project Code / FS Key
 *  ========================= */

/** UUID-ish (DB id) */
function isUuidLike(v: string): boolean {
  const s = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

/**
 * ✅ BA extractor/sanitizer
 * - match BA-2025-DEMO oppure BA_2025_DEMO
 * - se arriva "local-BA-2025-DEMO" estrae BA-...
 */
export function extractBaCode(s?: string) {
  const raw = String(s || "").trim();

  const m = raw.match(/(BA-\d{4}[-_][A-Z0-9]+)\b/i);
  if (m?.[1]) return m[1].toUpperCase().replace(/_/g, "-");

  const m2 = raw.match(/local-(BA-\d{4}[-_][A-Z0-9]+)\b/i);
  if (m2?.[1]) return m2[1].toUpperCase().replace(/_/g, "-");

  return null;
}

/**
 * FS-key sanitization (only when you need a folder-safe key).
 * - DOES NOT change what user sees as "code"
 * - only prevents illegal path chars when used as folder segment
 */
export function sanitizeFsKey(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "";
  const cleaned = s
    .replace(/[\/\\]+/g, "_")
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return cleaned || "PROJECT";
}

/**
 * ✅ BA-only check (per funzioni SERVER/ONLINE)
 */
export function looksLikeProjectCode(s: string) {
  const raw = String(s || "").trim();
  const ba = extractBaCode(raw);
  return !!ba;
}

/** =========================
 *  API URL helpers
 *  ========================= */

function normalizeBaseUrl(v: string): string {
  return String(v || "").trim().replace(/\/$/, "");
}

/**
 * ✅ evita errori tipo:
 * - https://rlcbausoftware.com  -> https://api.rlcbausoftware.com
 * - https://www.rlcbausoftware.com -> https://api.rlcbausoftware.com
 *
 * Non fa replace aggressivi su altri host (localhost, tunnel, ip, dev subdomain, ecc.)
 */
function coerceApiHost(v: string): string {
  const s = normalizeBaseUrl(v);
  if (!s) return s;

  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();

    if (host === "rlcbausoftware.com" || host === "www.rlcbausoftware.com") {
      u.hostname = "api.rlcbausoftware.com";
      return u.toString().replace(/\/$/, "");
    }

    if (host === "api.rlcbausoftware.com") {
      return u.toString().replace(/\/$/, "");
    }

    return u.toString().replace(/\/$/, "");
  } catch {
    return s;
  }
}

function isValidBaseUrl(v: string): boolean {
  return /^https?:\/\/.+/i.test(v);
}

/**
 * Returns the effective API URL:
 * - env var if present
 * - else AsyncStorage override if set (DEV ONLY)
 * - else fallback
 *
 * ✅ PROD hardening:
 * - AsyncStorage override is ignored in PROD builds.
 */
export async function getApiUrl(): Promise<string> {
  if (ENV_API_URL_RAW) return coerceApiHost(ENV_API_URL_RAW);

  if (!IS_DEV) return coerceApiHost(FALLBACK_API_URL);

  try {
    const storedRaw = (await AsyncStorage.getItem(API_URL_STORAGE_KEY)) || "";
    const stored = coerceApiHost(storedRaw);
    if (stored && isValidBaseUrl(stored)) return stored;
  } catch {
    // ignore
  }

  return coerceApiHost(FALLBACK_API_URL);
}

/**
 * Persist an API URL override (DEV only).
 * Pass empty string to clear.
 */
export async function setApiUrl(next: string): Promise<void> {
  if (!IS_DEV) {
    throw new Error("API URL Override ist in Production deaktiviert.");
  }

  const v = coerceApiHost(next);

  if (!v) {
    try {
      await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
    } catch {}
    return;
  }

  if (!isValidBaseUrl(v)) {
    throw new Error("API URL muss mit http:// oder https:// beginnen.");
  }

  try {
    await AsyncStorage.setItem(API_URL_STORAGE_KEY, v);
  } catch (e: any) {
    throw new Error(String(e?.message || "AsyncStorage error"));
  }
}

export async function resetApiUrlOverride(): Promise<void> {
  if (!IS_DEV) return;
  try {
    await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
  } catch {}
}

// ✅ Converte un path relativo (/projects/...) in URL assoluto
export async function resolveUrl(u: string) {
  const s = String(u || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  const base = await getApiUrl();
  return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
}

/** =========================
 *  HTTP helper (OFFLINE/TIMEOUT hardening for Queue)
 *  ========================= */

const DEFAULT_TIMEOUT_MS_JSON = 20000;
const DEFAULT_TIMEOUT_MS_UPLOAD = 60000;

function isOfflineLikeError(e: any) {
  const msg = String(e?.message || "").toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("socket") ||
    msg.includes("econn") ||
    msg.includes("etimedout") ||
    msg.includes("timeout")
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const hasAbort = typeof AbortController !== "undefined";
  if (!hasAbort) return fetch(url, init);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal as any });
  } finally {
    clearTimeout(t);
  }
}

/**
 * ✅ IMPORTANT:
 * - Non inviare Authorization su endpoint pubblici, altrimenti token sporchi/legacy
 *   possono rompere register/verify/login ecc.
 */
function isPublicEndpoint(path: string) {
  const p = String(path || "");
  return (
    p.startsWith("/api/auth/") ||
    p === "/api/health" ||
    p.startsWith("/api/license/")
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = { ...(init.headers as any) };
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (!isForm) headers["Content-Type"] = "application/json";
  headers["Accept"] = "application/json";

  // ✅ do NOT send Authorization on public endpoints
  if (!isPublicEndpoint(path)) {
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  headers["X-App-Version"] = appVersion();
  const b = appBuild();
  if (b) headers["X-App-Build"] = b;

  const base = await getApiUrl();
  const url = `${base}${path}`;
  const timeoutMs = isForm ? DEFAULT_TIMEOUT_MS_UPLOAD : DEFAULT_TIMEOUT_MS_JSON;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { ...init, headers }, timeoutMs);
  } catch (e: any) {
    if (String(e?.name || "").toLowerCase().includes("abort")) {
      throw new Error("TIMEOUT");
    }
    if (isOfflineLikeError(e)) {
      throw new Error("OFFLINE");
    }
    throw new Error(String(e?.message || "REQUEST_FAILED"));
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const ct = String(res.headers.get("content-type") || "").toLowerCase();

    const looksHtml =
      ct.includes("text/html") ||
      txt.trim().toLowerCase().startsWith("<!doctype") ||
      txt.trim().toLowerCase().startsWith("<html");

    if (looksHtml) {
      throw new Error(`BAD_GATEWAY_OR_WRONG_API_BASE (HTTP ${res.status})`);
    }

    try {
      const j = txt ? JSON.parse(txt) : null;
      const msg = j?.error || j?.message || txt || `HTTP ${res.status}`;
      throw new Error(String(msg));
    } catch {
      throw new Error(txt || `HTTP ${res.status}`);
    }
  }

  const text = await res.text().catch(() => "");
  return (text ? JSON.parse(text) : null) as T;
}

function looksLikeMissingEndpoint(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("cannot post") ||
    msg.includes("cannot get")
  );
}

function pickTextFromVisionResponse(res: any): string {
  // proviamo i campi più probabili
  const candidates = [
    res?.text,
    res?.extractedText,
    res?.data?.text,
    res?.data?.extractedText,
    res?.result?.text,
    res?.result?.extractedText,
  ].filter((x) => typeof x === "string" && x.trim().length);

  if (candidates.length) return String(candidates[0]).trim();

  // fallback: se ritorna array di risultati, prova a concatenare
  if (Array.isArray(res?.results)) {
    const parts = res.results
      .map((r: any) => r?.text || r?.extractedText || r?.data?.text)
      .filter((x: any) => typeof x === "string" && x.trim().length);
    if (parts.length) return parts.join("\n\n").trim();
  }

  return "";
}

function extractLocalImagesOnly(arr: any[]): UploadFileInput[] {
  const out: UploadFileInput[] = [];
  for (const a of arr || []) {
    const uri = String(a?.uri || "").trim();
    if (!uri) continue;
    if (!isLocalFileUri(uri)) continue;
    const type = a?.type || (uri.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    out.push({ uri, name: a?.name, type });
  }
  return out;
}


/** =========================
 *  Project / FS-Key helpers
 *  ========================= */

/**
 * ✅ FS-key:
 * - se hai BA-... usa BA-... (sanitized)
 * - altrimenti fallback su id (uuid o local-...)
 */
export function projectFsKey(p: Project): string {
  const rawCode = String(p.code || "").trim();
  const ba = extractBaCode(rawCode);
  const key = ba ? sanitizeFsKey(ba) : "";
  return key || String(p.id || "").trim();
}

/**
 * ✅ Resolve:
 * - Se input contiene BA (anche "local-BA-...") => restituisce BA ripulito
 * - Se input è UUID => prova a trovare project.code e estrarre BA
 * - Altrimenti restituisce raw (offline/local) senza inventare BA
 */
export async function resolveProjectCode(projectIdOrCode: string): Promise<string> {
  const raw = String(projectIdOrCode || "").trim();
  if (!raw) return "";

  const baDirect = extractBaCode(raw);
  if (baDirect) return baDirect;

  if (isUuidLike(raw)) {
    try {
      const list = await api.projects();
      const hit = list.find((p) => String(p?.id || "").trim() === raw);
      const code = String(hit?.code || "").trim();
      const ba = extractBaCode(code);
      if (ba) return ba;
    } catch {}
  }

  return raw;
}

/** =========================
 *  Upload Types / Helpers
 *  ========================= */

export type UploadFileInput = {
  uri: string;
  name?: string;
  type?: string; // image/jpeg, application/pdf, ...
};

type UploadedRegieFile = {
  originalname?: string;
  url?: string;
  publicUrl?: string;
  path?: string;
  fileId?: string;
};

type UploadedLsInboxItem = {
  name?: string;
  type?: string;
  storagePath?: string;
  url?: string;
};

type UploadedLsLegacyItem = {
  name?: string;
  type?: string;
  storagePath?: string;
  publicUrl?: string;
};

function isLocalFileUri(u: any) {
  const s = String(u || "");
  return s.startsWith("file:") || s.startsWith("content:") || s.startsWith("ph:");
}

function sanitizeFilename(name: string) {
  return String(name || "file")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 140);
}

/** small deterministic hash (stable across runs) */
function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function nameFromUri(uri: string) {
  const u = String(uri || "");
  const last = u.split("?")[0].split("#")[0].split("/").pop() || "";
  if (!last) return "";
  if (last.includes(":")) return "";
  return sanitizeFilename(last);
}

/**
 * ✅ Stable name generator
 */
function stableNameOf(p: any, prefix: string) {
  const n = String(p?.name || "").trim();
  if (n) return sanitizeFilename(n);

  const uri = String(p?.uri || "").trim();
  const fromUri = nameFromUri(uri);
  if (fromUri) return fromUri;

  const ext =
    String(p?.type || "").toLowerCase() === "application/pdf"
      ? ".pdf"
      : String(p?.type || "").toLowerCase().includes("png")
      ? ".png"
      : ".jpg";

  return sanitizeFilename(`${prefix}_${hash32(uri || JSON.stringify(p))}${ext}`);
}

function stripLocalUris(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));

  if (Array.isArray(clone?.photos)) {
    clone.photos = clone.photos.map((p: any) => {
      const c = { ...p };
      if (isLocalFileUri(c?.uri)) delete c.uri;
      return c;
    });
  }
  if (Array.isArray(clone?.attachments)) {
    clone.attachments = clone.attachments.map((p: any) => {
      const c = { ...p };
      if (isLocalFileUri(c?.uri)) delete c.uri;
      return c;
    });
  }
  return clone;
}

type NamedInput = UploadFileInput & { _stableName: string };

function buildNamedLocalFiles(
  all: any[],
  prefix: string
): {
  namedAll: any[];
  localFiles: NamedInput[];
  localByOrder: any[];
} {
  const namedAll = all.map((p) => {
    const _stableName = stableNameOf(p, prefix);
    return { ...p, _stableName };
  });

  const localByOrder = namedAll.filter((p: any) => isLocalFileUri(p?.uri));

  const localFiles: NamedInput[] = localByOrder
    .map((p: any) => ({
      uri: String(p.uri),
      name: p._stableName,
      type: p.type,
      _stableName: p._stableName,
    }))
    .filter((f) => !!f.uri);

  return { namedAll, localFiles, localByOrder };
}

/** =========================
 *  Endpoints
 *  ========================= */

/** =========================
 *  LICENSE / SERVER UPGRADE
 *  ========================= */

function licenseStatusEndpoint() {
  return `/api/license/status`;
}

function licenseActivateEndpoint() {
  return `/api/license/activate`;
}

// REGIE
function regieUploadEndpoint() {
  return `/api/regie/upload`;
}
function regieSubmitEndpoint() {
  return `/api/regie`;
}
function regieCommitEndpoint() {
  return `/api/regie/commit/regiebericht`;
}

// LIEFERSCHEIN (NEW inbox workflow)
function lsSubmitEndpoint() {
  return `/api/ls`;
}
function lsInboxUploadEndpoint() {
  return `/api/ls/inbox/upload`;
}
function lsInboxListEndpoint(projectId: string) {
  return `/api/ls/inbox/list?projectId=${encodeURIComponent(projectId)}`;
}
function lsInboxApproveEndpoint() {
  return `/api/ls/inbox/approve`;
}
function lsInboxRejectEndpoint() {
  return `/api/ls/inbox/reject`;
}
function lsFinalListEndpoint(projectId: string) {
  return `/api/ls/final/list?projectId=${encodeURIComponent(projectId)}`;
}

// LIEFERSCHEIN legacy (fallback only)
function lsLegacyUploadEndpoint() {
  return `/api/ls/upload`;
}
function lsLegacyCommitEndpoint() {
  return `/api/ls/commit/lieferschein`;
}

/* PHOTOS (NEW inbox workflow) */
function photosUploadEndpoint() {
  return `/api/photos/upload`;
}
function photosCommitEndpoint() {
  return `/api/photos/commit`;
}
function photosInboxListEndpoint(projectId: string) {
  return `/api/photos/inbox/list?projectId=${encodeURIComponent(projectId)}`;
}

/* KI (2 KI) */
function kiVisionEndpoint() {
  return `/api/ki/vision-files`;
}
function kiSuggestEndpoint() {
  return `/api/ki/suggest`;
}

function kiLieferscheinSuggestEndpoint() {
  return `/api/ki/lieferschein/suggest`;
}
function kiPhotosSuggestEndpoint() {
  return `/api/ki/photos/suggest`;
}


/* KI Photo Analyze (formdata) */
function kiPhotoAnalyzeEndpoint() {
  return `/api/ki/photo-analyze`;
}

/** =========================
 *  PDF Template (PDF laden) - robust fallback offline
 *  ========================= */

function looksHtmlText(s: string) {
  const t = String(s || "").trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("cloudflare");
}

async function safeReadHeadUtf8(fileUri: string, maxChars = 400) {
  try {
    const txt = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return String(txt || "").slice(0, maxChars);
  } catch {
    return "";
  }
}

const TEMPLATE_DIR = `${FileSystem.cacheDirectory || ""}rlc_templates/`;
const TEMPLATE_FILENAME = "regie_template.pdf";
const TEMPLATE_ENDPOINT = "/api/regie/template"; // ✅ se non esiste: fallback asset

async function ensureDir(dir: string) {
  if (!dir) return;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // ignore
  }
}

async function getOfflineTemplateUri(): Promise<string> {
  // apps/mobile/src/lib/api.ts -> ../../assets/pdf/...
  const asset = Asset.fromModule(
    require("../../assets/pdf/regie_template.pdf")
  );
  try {
    if (!asset.localUri) await asset.downloadAsync();
  } catch {
    // ignore
  }
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error("Offline PDF Template fehlt (Asset).");
  return uri;
}

/**
 * ✅ getPdfTemplateUri()
 * - Prova a scaricare il template dal server (solo SERVER_SYNC)
 * - Se il server risponde con HTML (Cloudflare/Tunnel) → fallback offline asset
 * - Ritorna SEMPRE un file://... locale valido
 *
 * REQUIRES:
 * - inserisci il pdf in: apps/mobile/assets/pdf/regie_template.pdf
 */
export async function getPdfTemplateUri(opts?: { mode?: "SERVER_SYNC" | "NUR_APP" }) {
  const mode = opts?.mode || "SERVER_SYNC";

  // NUR_APP => solo offline asset
  if (mode === "NUR_APP") {
    return getOfflineTemplateUri();
  }

  // SERVER_SYNC => prova server, poi fallback asset
  try {
    await ensureDir(TEMPLATE_DIR);

    const base = await getApiUrl();
    const url = `${base}${TEMPLATE_ENDPOINT}`;
    const dest = `${TEMPLATE_DIR}${TEMPLATE_FILENAME}`;

    // scarica come binario
    const dl = await FileSystem.downloadAsync(url, dest, {
      headers: {
        Accept: "application/pdf",
        "X-App-Version": appVersion(),
        ...(appBuild() ? { "X-App-Build": appBuild() } : {}),
      },
    });

    // verifica contenuto: se è HTML => fallback
    const head = await safeReadHeadUtf8(dl.uri, 250);
    if (!head || looksHtmlText(head)) {
      try {
        await FileSystem.deleteAsync(dl.uri, { idempotent: true });
      } catch {}
      return getOfflineTemplateUri();
    }

    return dl.uri;
  } catch {
    return getOfflineTemplateUri();
  }
}

/** =========================
 *  PDF list (server) - uses request() (token+hardening)
 *  ========================= */

// ✅ Lista PDF progetto (FS-key: BA-... required!)
export async function projectPdfs(
  projectFsKey: string
): Promise<Array<{ name: string; url: string; folder?: string; mtime?: string }>> {
  const fsKey = extractBaCode(projectFsKey);
  if (!fsKey) throw new Error("BA-Code fehlt");

  const path = `/api/projects/${encodeURIComponent(fsKey)}/pdfs`;
  const j = await request<any>(path, { method: "GET" });

  return Array.isArray(j?.items) ? j.items : [];
}

export const api = {
  apiUrl: API_URL,

  async getApiUrl(): Promise<string> {
    return getApiUrl();
  },
  async setApiUrl(next: string): Promise<void> {
    return setApiUrl(next);
  },
  async resetApiUrlOverride(): Promise<void> {
    return resetApiUrlOverride();
  },

  async getPdfTemplateUri(mode?: "SERVER_SYNC" | "NUR_APP") {
    return getPdfTemplateUri({ mode: mode || "SERVER_SYNC" });
  },

  absUrl(relOrAbs: string): string {
    const raw = String(relOrAbs || "").trim();
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;

    // ✅ usa API_URL (env->fallback), NON fallback fisso
    const base = API_URL.replace(/\/$/, "");
    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
  },

  async absUrlAsync(relOrAbs: string): Promise<string> {
    const raw = String(relOrAbs || "").trim();
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;

    const base = await getApiUrl();
    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
  },

  /** ===== Health (debug) ===== */
  async health(): Promise<any> {
    return request<any>("/api/health", { method: "GET" });
  },

  /** ===== License / Server Upgrade ===== */

  async licenseStatus(): Promise<any> {
    return request<any>(licenseStatusEndpoint(), {
      method: "GET",
    });
  },

  async licenseActivate(code: string): Promise<any> {
    return request<any>(licenseActivateEndpoint(), {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  /** ===== Auth =====
   * Nota: inviamo sia role che appRole per compatibilità backend.
   */
  async authRegister(payload: {
    email: string;
    password: string;
    mode: "NUR_APP" | "SERVER_SYNC";
    name?: string;
    role?: string;
    appRole?: string;
  }) {
    const fixed = {
      ...payload,
      role: payload.role ?? payload.appRole,
      appRole: payload.appRole ?? payload.role,
    };
    return request<any>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(fixed),
    });
  },

  async authVerify(payload: { token: string; email?: string }) {
    return request<any>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async authLogin(payload: {
    email: string;
    password: string;
    mode: "NUR_APP" | "SERVER_SYNC";
  }) {
    return request<any>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ✅ COMPAT: LoginScreen chiama api.login(...)
  async login(
    email: string,
    password: string,
    mode: "NUR_APP" | "SERVER_SYNC" = "SERVER_SYNC"
  ) {
    return api.authLogin({ email, password, mode });
  },

  async register(
    email: string,
    password: string,
    mode: "NUR_APP" | "SERVER_SYNC" = "SERVER_SYNC",
    extra?: { name?: string; role?: string }
  ) {
    return api.authRegister({
      email,
      password,
      mode,
      name: extra?.name,
      role: extra?.role,
      appRole: extra?.role,
    });
  },

  async verify(token: string, email?: string) {
    return api.authVerify({ token, email });
  },

  /** ===== Mail export (backend SMTP) ===== */
  async mailSend(payload: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{ name: string; url?: string; uri?: string; type?: string }>;
    meta?: any;
  }) {
    return request<any>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** ===== Projects ===== */
  async projects(): Promise<Project[]> {
    const r = await request<ProjectsResponse>("/api/projects");
    if (Array.isArray(r)) return r;
    if (r && Array.isArray((r as any).projects)) return (r as any).projects;
    return [];
  },

  /** =========================
   * KI (2 KI)
   * ========================= */

  async kiVisionJson(payload: any): Promise<any> {
    return request<any>(kiVisionEndpoint(), {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async kiVisionFiles(
    projectIdOrCode: string,
    files: UploadFileInput[],
    meta?: any
  ): Promise<any> {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const fd = new FormData();
    fd.append("projectId", projectKey);
    if (meta)
      fd.append(
        "meta",
        JSON.stringify({
          ...(meta || {}),
          projectId: projectKey,
          projectCode: projectKey,
        })
      );

    for (const f of files) {
      if (!f?.uri) continue;
      const name = sanitizeFilename(f.name || `ki_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore RN FormData file
      fd.append("files", { uri: f.uri, name, type });
    }

    return request<any>(kiVisionEndpoint(), {
      method: "POST",
      body: fd,
    });
  },

  async kiVision(payload: any): Promise<any> {
    const p = payload || {};
    const projectKey = await resolveProjectCode(p.projectId || p.projectCode || "");

    const files = Array.isArray(p.files) ? p.files : [];
    const hasLocal = files.some((f: any) => isLocalFileUri(f?.uri));

    const meta = { ...(p.meta || {}), ...p };
    delete (meta as any).files;

    if (hasLocal && files.length) {
      return api.kiVisionFiles(projectKey, files, meta);
    }

    return api.kiVisionJson({
      ...p,
      projectId: projectKey,
      projectCode: projectKey,
      meta,
    });
  },

  async kiSuggest(payload: any): Promise<any> {
    return request<any>(kiSuggestEndpoint(), {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  /**
   * ✅ KI Photo Analyze (FormData)
   * Usato dal PhotosNotesScreen per /api/ki/photo-analyze
   */
  async kiPhotoAnalyze(form: FormData): Promise<any> {
    return request<any>(kiPhotoAnalyzeEndpoint(), {
      method: "POST",
      body: form,
    });
  },

  /** =========================
   * REGIE
   * ========================= */
// apps/mobile/src/lib/api.ts  (BLOCCO 2/2)

  async uploadRegieFiles(projectIdOrCode: string, files: UploadFileInput[]) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const fd = new FormData();
    fd.append("projectId", projectKey);

    for (const f of files) {
      if (!f?.uri) continue;
      const name = sanitizeFilename(f.name || `regie_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore RN FormData file
      fd.append("files", { uri: f.uri, name, type });
    }

    return request<any>(regieUploadEndpoint(), {
      method: "POST",
      body: fd,
    });
  },

  async submitRegieInbox(projectIdOrCode: string, payload: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const body = JSON.stringify({
      ...(payload || {}),
      projectId: projectKey,
      projectCode: projectKey,
    });

    return request<any>(regieSubmitEndpoint(), {
      method: "POST",
      body,
    });
  },

  async commitRegie(projectIdOrCode: string, payload: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(regieCommitEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        ...(payload || {}),
        projectId: projectKey,
        projectCode: projectKey,
      }),
    });
  },

  /**
   * ✅ CORRETTO (DEFINITIVO):
   * pushRegieToServer = UPLOAD (se serve) + SUBMIT INBOX (/api/regie)
   * NON fa commit, perché commit è per la fase Bauleiter/Büro dopo approve.
   */
  async pushRegieToServer(projectIdOrCode: string, row: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    // ✅ server richiede date obbligatoria (zod: date.min(1))
    const date =
      String(row?.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);

    const photos = Array.isArray(row?.photos) ? row.photos : [];
    const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
    const all = [...attachments, ...photos].filter(Boolean);

    const { namedAll, localFiles, localByOrder } = buildNamedLocalFiles(all, "regie");

    // 1) upload local files (if any)
    let uploadRes: any = null;
    if (localFiles.length) {
      uploadRes = await api.uploadRegieFiles(projectKey, localFiles);
    }

    const uploadedFiles: UploadedRegieFile[] = Array.isArray(uploadRes?.files)
      ? uploadRes.files
      : [];

    if (localFiles.length && !uploadedFiles.length) {
      throw new Error(
        "Regie Upload fehlgeschlagen: Server hat keine Dateien zurückgegeben."
      );
    }

    // 2) build final attachment list (url-based) - NO local uri
    const attachmentsFinal = namedAll.map((p: any) => {
      const name = String(p._stableName || stableNameOf(p, "regie"));

      const byName =
        uploadedFiles.find(
          (u) => String(u?.originalname || "").trim() === String(name).trim()
        ) || null;

      const localIdx = localByOrder.findIndex(
        (x: any) => String(x?.uri || "") === String(p?.uri || "")
      );
      const byOrder =
        localIdx >= 0 && localIdx < uploadedFiles.length ? uploadedFiles[localIdx] : null;

      const hit = byName || byOrder;

      const serverUrl =
        hit?.url ||
        hit?.publicUrl ||
        p?.url ||
        p?.publicUrl ||
        (String(p?.uri || "").startsWith("/projects/") ? p.uri : null);

      return { id: p?.id, name, type: p?.type, url: serverUrl };
    });

    // 3) SUBMIT INBOX
    const submitPayload = {
      ...stripLocalUris(row),
      id: row?.id,
      projectId: projectKey,
      projectCode: projectKey,
      date, // ✅ obbligatorio
      attachments: attachmentsFinal,
      photos: attachmentsFinal,
      uploadRes,
    };

    const submitRes = await api.submitRegieInbox(projectKey, submitPayload);
    return { ...submitRes, attachments: attachmentsFinal, uploadRes };
  },

  /** =========================
   * LIEFERSCHEIN (NEW inbox workflow)
   * ========================= */

  async submitLieferscheinInbox(projectIdOrCode: string, payload: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(lsSubmitEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        ...(payload || {}),
        projectId: projectKey,
        projectCode: projectKey,
      }),
    });
  },

  async uploadLieferscheinInboxFiles(
    projectIdOrCode: string,
    docId: string,
    files: UploadFileInput[],
    meta?: any
  ) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const fd = new FormData();
    fd.append("projectId", projectKey);
    fd.append("docId", docId);

    if (meta) {
      const metaFixed = {
        ...(meta || {}),
        projectId: projectKey,
        projectCode: projectKey,
      };
      fd.append("meta", JSON.stringify(metaFixed));
    }

    for (const f of files) {
      if (!f?.uri) continue;
      const name = sanitizeFilename(f.name || `lieferschein_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore RN FormData file
      fd.append("files", { uri: f.uri, name, type });
    }

    return request<any>(lsInboxUploadEndpoint(), {
      method: "POST",
      body: fd,
    });
  },

  async lsInboxList(projectIdOrCode: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(lsInboxListEndpoint(projectKey), { method: "GET" });
  },

  async lsFinalList(projectIdOrCode: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(lsFinalListEndpoint(projectKey), { method: "GET" });
  },

  async lsApprove(projectIdOrCode: string, docId: string, approvedBy?: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(lsInboxApproveEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        projectId: projectKey,
        docId,
        approvedBy: approvedBy || undefined,
      }),
    });
  },

  async lsReject(projectIdOrCode: string, docId: string, reason: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(lsInboxRejectEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        projectId: projectKey,
        docId,
        reason,
      }),
    });
  },

  /** =========================
   * LIEFERSCHEIN legacy (fallback only)
   * ========================= */

  async uploadLieferscheinLegacyFiles(
    projectIdOrCode: string,
    files: UploadFileInput[],
    note?: string
  ) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const fd = new FormData();
    fd.append("projectId", projectKey);
    if (note) fd.append("note", note);

    for (const f of files) {
      if (!f?.uri) continue;
      const name = sanitizeFilename(f.name || `lieferschein_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore RN FormData file
      fd.append("files", { uri: f.uri, name, type });
    }

    return request<any>(lsLegacyUploadEndpoint(), {
      method: "POST",
      body: fd,
    });
  },

  async commitLieferscheinLegacy(projectIdOrCode: string, payload: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(lsLegacyCommitEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        ...(payload || {}),
        projectId: projectKey,
        projectCode: projectKey,
      }),
    });
  },

  async pushLieferscheinToServer(projectIdOrCode: string, row: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const photos = Array.isArray(row?.photos) ? row.photos : [];
    const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
    const all = [...attachments, ...photos].filter(Boolean);

    const { namedAll, localFiles, localByOrder } = buildNamedLocalFiles(all, "lieferschein");

    // 1) submit (create inbox json)
    let submitRes: any;
    try {
      submitRes = await api.submitLieferscheinInbox(projectKey, {
        ...stripLocalUris(row),
        projectId: projectKey,
        projectCode: projectKey,
      });
    } catch (e: any) {
      if (looksLikeMissingEndpoint(e)) {
        return api.pushLieferscheinToServerLegacy(projectKey, row);
      }
      throw e;
    }

    const docId = String(submitRes?.docId || row?.id || "").trim();
    if (!docId) {
      throw new Error("Lieferschein submit fehlgeschlagen: docId fehlt.");
    }

    // 2) upload files (if any)
    let uploadRes: any = null;
    let inboxItems: UploadedLsInboxItem[] = [];

    const metaForInbox = {
      ...stripLocalUris(row),
      id: docId,
      projectId: projectKey,
      projectCode: projectKey,
      date: String(row?.date || "").slice(0, 10),
    };

    if (localFiles.length) {
      uploadRes = await api.uploadLieferscheinInboxFiles(
        projectKey,
        docId,
        localFiles,
        metaForInbox
      );
      inboxItems = Array.isArray(uploadRes?.items) ? uploadRes.items : [];

      if (!inboxItems.length) {
        throw new Error(
          "Lieferschein Upload (Inbox) fehlgeschlagen: Server hat keine items zurückgegeben."
        );
      }
    }

    const attachmentsFinal = namedAll.map((p: any) => {
      const name = String(p._stableName || stableNameOf(p, "lieferschein"));

      const byName =
        inboxItems.find((u) => String(u?.name || "").trim() === String(name).trim()) ||
        null;

      const localIdx = localByOrder.findIndex(
        (x: any) => String(x?.uri || "") === String(p?.uri || "")
      );
      const byOrder =
        localIdx >= 0 && localIdx < inboxItems.length ? inboxItems[localIdx] : null;

      const hit = byName || byOrder;

      const serverUrl =
        hit?.url ||
        p?.url ||
        p?.publicUrl ||
        (String(p?.uri || "").startsWith("/projects/") ? p.uri : null);

      return { id: p?.id, name, type: p?.type, url: serverUrl };
    });

    return {
      ok: true,
      projectId: projectKey,
      docId,
      submitRes,
      uploadRes,
      attachments: attachmentsFinal,
    };
  },

  async pushLieferscheinToServerLegacy(projectIdOrCode: string, row: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const photos = Array.isArray(row?.photos) ? row.photos : [];
    const { namedAll, localFiles } = buildNamedLocalFiles(photos, "lieferschein");

    let uploadRes: any = null;
    if (localFiles.length) {
      uploadRes = await api.uploadLieferscheinLegacyFiles(projectKey, localFiles, row?.comment);
    }

    const upItems: UploadedLsLegacyItem[] = Array.isArray(uploadRes?.items) ? uploadRes.items : [];

    if (localFiles.length && !upItems.length) {
      throw new Error("Lieferschein Upload fehlgeschlagen: Server hat keine items zurückgegeben.");
    }

    const attachments = namedAll.map((p: any) => {
      const name = String(p._stableName || stableNameOf(p, "lieferschein"));
      const hit =
        upItems.find((u: any) => String(u?.name || "").trim() === String(name).trim()) ||
        null;
      const singleFallback = !hit && upItems.length === 1 ? upItems[0] : null;

      const serverUrl =
        hit?.publicUrl ||
        singleFallback?.publicUrl ||
        p?.url ||
        p?.publicUrl ||
        (String(p?.uri || "").startsWith("/projects/") ? p.uri : null);

      return { id: p?.id, name, type: p?.type, url: serverUrl };
    });

    return api.commitLieferscheinLegacy(projectKey, {
      ...stripLocalUris(row),
      projectId: projectKey,
      projectCode: projectKey,
      attachments,
      uploadRes,
    });
  },

  /** =========================
   * PHOTOS (NEW inbox workflow)
   * ========================= */

  async uploadPhotosFiles(
    projectIdOrCode: string,
    payload: {
      docId?: string;
      date?: string;
      comment?: string;
      bemerkungen?: string;
      kostenstelle?: string;
      lvItemPos?: string | null;
      files: UploadFileInput[];
    }
  ) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const fd = new FormData();
    fd.append("projectId", projectKey);

    if (payload?.docId) fd.append("docId", String(payload.docId));
    if (payload?.date) fd.append("date", String(payload.date).slice(0, 10));
    if (payload?.comment) fd.append("comment", String(payload.comment));
    if (payload?.bemerkungen) fd.append("bemerkungen", String(payload.bemerkungen));
    if (payload?.kostenstelle) fd.append("kostenstelle", String(payload.kostenstelle));
    if (payload?.lvItemPos !== undefined) fd.append("lvItemPos", String(payload.lvItemPos ?? ""));

    const files = Array.isArray(payload?.files) ? payload.files : [];
    for (const f of files) {
      if (!f?.uri) continue;
      const name = sanitizeFilename(f.name || `photo_${Date.now()}.jpg`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore RN FormData file
      fd.append("files", { uri: f.uri, name, type });
    }

    return request<any>(photosUploadEndpoint(), {
      method: "POST",
      body: fd,
    });
  },

    /**
   * ✅ pushPhotosToServer (NEW inbox workflow)
   * - Upload (se ci sono file locali)
   * - Commit (se server lo richiede)
   *
   * Accetta "row" come PhotosNotesScreen salva (files / attachments / photos).
   */
  async pushPhotosToServer(projectIdOrCode: string, row: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const date =
      String(row?.date || row?.createdAt || "")
        .slice(0, 10) || new Date().toISOString().slice(0, 10);

    // compat: files[] oppure attachments/photos
    const filesArr = Array.isArray(row?.files)
      ? row.files
      : Array.isArray(row?.attachments)
      ? row.attachments
      : Array.isArray(row?.photos)
      ? row.photos
      : [];

    const all = (filesArr || []).filter(Boolean);
    const { namedAll, localFiles } = buildNamedLocalFiles(all, "photo");

    // docId: usa row.id se c’è (così dedupe è stabile)
    const docIdHint = String(row?.docId || row?.id || "").trim() || undefined;

    // 1) Upload (anche senza files, proviamo lo stesso: così crea inbox record se server lo supporta)
    const uploadRes = await api.uploadPhotosFiles(projectKey, {
      docId: docIdHint,
      date,
      comment: row?.comment ?? row?.note ?? "",
      bemerkungen: row?.bemerkungen ?? "",
      kostenstelle: row?.kostenstelle ?? "",
      lvItemPos: row?.lvItemPos ?? null,
      files: localFiles,
    });

    // ricava docId dal server o fallback
    const docId =
      String(uploadRes?.docId || uploadRes?.id || docIdHint || "").trim() ||
      "";

    if (!docId) {
      // Se il server non ritorna docId, non possiamo committare.
      // Ma almeno segnaliamo chiaramente.
      throw new Error("Photos Upload fehlgeschlagen: docId fehlt.");
    }

    // 2) Commit (se endpoint esiste e serve)
    // Se il server non ha commit o risponde 404 → non bloccare, consideriamo ok.
    let commitRes: any = null;
    try {
      commitRes = await api.commitPhoto(projectKey, docId);
    } catch (e: any) {
      if (looksLikeMissingEndpoint(e)) {
        commitRes = { ok: true, skipped: "commit endpoint missing" };
      } else {
        throw e;
      }
    }

    // 3) attachments final: url-based (se server le restituisce, altrimenti lascia quelle già note)
    // Nota: uploadPhotosFiles() attualmente non definisce schema di ritorno per items/urls,
    // quindi qui lasciamo una lista “safe” con soli name/type/url se già presenti.
    const attachments = namedAll.map((p: any) => {
      const name = String(p._stableName || stableNameOf(p, "photo"));
      const serverUrl =
        p?.url ||
        p?.publicUrl ||
        (String(p?.uri || "").startsWith("/projects/") ? p.uri : null);

      return { id: p?.id, name, type: p?.type, url: serverUrl };
    });

    return {
      ok: true,
      projectId: projectKey,
      docId,
      uploadRes,
      commitRes,
      attachments,
    };
  },


  async commitPhoto(projectIdOrCode: string, docId: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(photosCommitEndpoint(), {
      method: "POST",
      body: JSON.stringify({ projectId: projectKey, docId }),
    });
  },

  async photosInboxList(projectIdOrCode: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(photosInboxListEndpoint(projectKey), { method: "GET" });
  },
};

export { request };

/**
 * ✅ Named export compatibility:
 * nel tuo PhotosNotesScreen stai facendo:
 *   import { uploadPhotosFiles } from "../lib/api";
 * Questo file espone già api.uploadPhotosFiles.
 */
export async function uploadPhotosFiles(
  projectIdOrCode: string,
  payload: {
    docId?: string;
    date?: string;
    comment?: string;
    bemerkungen?: string;
    kostenstelle?: string;
    lvItemPos?: string | null;
    files: UploadFileInput[];
  }
) {
  return api.uploadPhotosFiles(projectIdOrCode, payload);
}

/**
 * ✅ Named export compatibility:
 *   import { kiPhotoAnalyze } from "../lib/api";
 */
export async function kiPhotoAnalyze(form: FormData) {
  return api.kiPhotoAnalyze(form);
}

 
