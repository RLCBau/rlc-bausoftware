// apps/mobile/src/lib/api.ts  (FULL FILE – merged, nothing deleted)
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { getToken } from "./auth";

import * as FileSystem from "expo-file-system";
import { Asset } from "expo-asset";

const API_URL_STORAGE_KEY = "api_base_url";

/**
 * =========================
 * Company Branding (Header + Logo) – Offline Cache (B)
 * =========================
 */
const COMPANY_HEADER_CACHE_KEY = "rlc_company_header_cache_v1";
const COMPANY_LOGO_CACHE_REL = "logo"; // file name without ext
const COMPANY_CACHE_DIR = `${
  FileSystem.documentDirectory || FileSystem.cacheDirectory || ""
}rlc_company/`;

export type CompanyHeader = {
  id: string;
  code?: string;
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoPath?: string | null;
  updatedAt?: string;
};

async function ensureCompanyCacheDir() {
  if (!COMPANY_CACHE_DIR) return;
  try {
    const info = await FileSystem.getInfoAsync(COMPANY_CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(COMPANY_CACHE_DIR, {
        intermediates: true,
      });
    }
  } catch {}
}

function guessExtFromLogoPath(logoPath?: string | null) {
  const p = String(logoPath || "").toLowerCase();
  if (p.endsWith(".png")) return ".png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return ".jpg";
  if (p.endsWith(".webp")) return ".webp";
  return ".png";
}

async function cachedLogoUriForExt(ext: string) {
  await ensureCompanyCacheDir();
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return `${COMPANY_CACHE_DIR}${COMPANY_LOGO_CACHE_REL}${safeExt}`;
}

async function findAnyCachedLogoUri(): Promise<string | null> {
  await ensureCompanyCacheDir();
  const tries = [".png", ".jpg", ".webp"];
  for (const ext of tries) {
    const uri = await cachedLogoUriForExt(ext);
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && info.isDirectory === false) return uri;
    } catch {}
  }
  return null;
}

async function cleanupCachedCompanyLogos() {
  try {
    await ensureCompanyCacheDir();
    const tries = [".png", ".jpg", ".webp"];
    for (const ext of tries) {
      const uri = await cachedLogoUriForExt(ext);
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    }
  } catch {}
}

async function cacheCompanyHeaderLocally(header: CompanyHeader) {
  try {
    await AsyncStorage.setItem(
      COMPANY_HEADER_CACHE_KEY,
      JSON.stringify(header || {})
    );
  } catch {}
}

async function readCachedCompanyHeader(): Promise<CompanyHeader | null> {
  try {
    const raw = await AsyncStorage.getItem(COMPANY_HEADER_CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? (j as CompanyHeader) : null;
  } catch {
    return null;
  }
}

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

    // lascia intatto se già api.*
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
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
  const isForm =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  // ✅ per FormData non settare Content-Type (boundary)
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

/** =========================
 *  Project / FS-Key helpers
 *  ========================= */

export function projectFsKey(p: Project): string {
  const rawCode = String(p.code || "").trim();
  const ba = extractBaCode(rawCode);
  const key = ba ? sanitizeFsKey(ba) : "";
  return key || String(p.id || "").trim();
}

export async function resolveProjectCode(
  projectIdOrCode: string
): Promise<string> {
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

// ✅ RN upload fix: content:// / ph:// -> file:// in cache
async function asUploadableUri(uri: string) {
  const u = String(uri || "").trim();
  if (!u) return u;
  if (u.startsWith("file://")) return u;

  try {
    const extGuess =
      u.toLowerCase().includes(".pdf")
        ? ".pdf"
        : u.toLowerCase().includes(".png")
        ? ".png"
        : ".jpg";

    const tmp = `${FileSystem.cacheDirectory}upl_${Date.now()}${extGuess}`;
    await FileSystem.copyAsync({ from: u, to: tmp });
    return tmp;
  } catch {
    return u;
  }
}

function sanitizeFilename(name: string) {
  return String(name || "file")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 140);
}

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
  if (Array.isArray(clone?.files)) {
    clone.files = clone.files.map((p: any) => {
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
): { namedAll: any[]; localFiles: NamedInput[]; localByOrder: any[] } {
  const namedAll = (all || []).map((p) => {
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

/* KI */
function kiVisionEndpoint() {
  return `/api/ki/vision-files`;
}
function kiSuggestEndpoint() {
  return `/api/ki/suggest`;
}
function kiPhotoAnalyzeEndpoint() {
  return `/api/ki/photo-analyze`;
}

function kiLieferscheinSuggestEndpoint() {
  return `/api/ki/lieferschein/suggest`;
}
function kiPhotosSuggestEndpoint() {
  return `/api/ki/photos/suggest`;
}

/**
 * ✅ SUPPORT CHAT (NEW)
 */
function supportChatEndpoint() {
  return `/api/support/chat`;
}

export type SupportChatRequest = {
  message: string;
  projectId?: string;
  projectCode?: string;
  mode?: "NUR_APP" | "SERVER_SYNC";
  context?: {
    pending?: number;
    queueLocked?: boolean;
    lastError?: string;
    screen?: string;
    appVersion?: string;
    appBuild?: string;
    device?: string;
  };
};

export type SupportChatResponse = {
  ok: boolean;
  type?: "info" | "warning" | "fix" | "critical";
  answer?: string;
  actions?: Array<{
    id: string;
    label: string;
    kind: "NAVIGATE" | "RUN" | "OPEN_URL";
    payload?: any;
  }>;
  error?: string;
};

/**
 * COMPANY (branding)
 */
function companyHeaderEndpoint() {
  return `/api/company/header`;
}
function companyLogoEndpoint() {
  return `/api/company/logo`;
}
function companyAdminHeaderEndpoint() {
  return `/api/company/admin/header`;
}
function companyAdminLogoEndpoint() {
  return `/api/company/admin/logo`;
}

/** =========================
 *  KI Helpers
 *  ========================= */

function pickTextFromVisionResponse(res: any): string {
  const candidates = [
    res?.text,
    res?.extractedText,
    res?.data?.text,
    res?.data?.extractedText,
    res?.result?.text,
    res?.result?.extractedText,
  ].filter((x) => typeof x === "string" && x.trim().length);

  if (candidates.length) return String(candidates[0]).trim();

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

    const t = String(a?.type || "").toLowerCase();
    const type =
      t ||
      (uri.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");

    out.push({ uri, name: a?.name, type });
  }
  return out;
}

/** =========================
 *  PDF Template (robust fallback offline)
 *  ========================= */

function looksHtmlText(s: string) {
  const t = String(s || "").trim().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("cloudflare")
  );
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

// ✅ renamed to avoid collisions
async function ensureFsDir(dir: string) {
  if (!dir) return;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
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

export async function getPdfTemplateUri(opts?: {
  mode?: "SERVER_SYNC" | "NUR_APP";
}) {
  const mode = opts?.mode || "SERVER_SYNC";

  if (mode === "NUR_APP") {
    return getOfflineTemplateUri();
  }

  try {
    await ensureFsDir(TEMPLATE_DIR);

    const base = await getApiUrl();
    const url = `${base}${TEMPLATE_ENDPOINT}`;
    const dest = `${TEMPLATE_DIR}${TEMPLATE_FILENAME}`;

    const dl = await FileSystem.downloadAsync(url, dest, {
      headers: {
        Accept: "application/pdf",
        "X-App-Version": appVersion(),
        ...(appBuild() ? { "X-App-Build": appBuild() } : {}),
      },
    });

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
 *  PDF list (server)
 *  ========================= */

export async function projectPdfs(
  projectFsKey: string
): Promise<Array<{ name: string; url: string; folder?: string; mtime?: string }>> {
  const fsKey = extractBaCode(projectFsKey);
  if (!fsKey) throw new Error("BA-Code fehlt");

  const p = `/api/projects/${encodeURIComponent(fsKey)}/pdfs`;
  const j = await request<any>(p, { method: "GET" });

  return Array.isArray(j?.items) ? j.items : [];
}

// apps/mobile/src/lib/api.ts  (BLOCCO 2/2)

/** =========================
 * PHOTOS / NOTIZEN (SERVER routes/fotos.ts)
 * ========================= */

function fotosNotesEndpoint(projectId: string) {
  return `/api/fotos/projects/${encodeURIComponent(projectId)}/fotos/notes`;
}
function fotosNotesDeleteEndpoint(projectId: string, id: string) {
  return `/api/fotos/projects/${encodeURIComponent(
    projectId
  )}/fotos/notes/${encodeURIComponent(id)}`;
}
function isHttpUrl(u?: string) {
  const s = String(u || "");
  return s.startsWith("http://") || s.startsWith("https://");
}

/**
 * ✅ upload PHOTO_NOTE as ONE record (main + many files)
 */
async function uploadPhotoNoteToServer(projectKey: string, row: any) {
  const fd = new FormData();

  const id = String(row?.id || row?.docId || "").trim();
  if (id) fd.append("id", id);

  const d = String(row?.date || "").slice(0, 10);
  if (d) fd.append("date", d);

  fd.append("kostenstelle", String(row?.kostenstelle || ""));
  fd.append("lvItemPos", String(row?.lvItemPos || ""));
  fd.append("note", String(row?.note || row?.comment || ""));

  if (row?.extras) fd.append("extras", JSON.stringify(row.extras));
  if (row?.boxes) fd.append("boxes", JSON.stringify(row.boxes));

  const imageUri = row?.imageUri ? String(row.imageUri) : "";
  if (imageUri && !isHttpUrl(imageUri)) {
    const uploadUri = await asUploadableUri(imageUri);
    // @ts-ignore RN FormData file
    fd.append("main", {
      uri: uploadUri,
      name: sanitizeFilename(`main_${Date.now()}.jpg`),
      type: "image/jpeg",
    });
  }

  const filesArr = Array.isArray(row?.files)
    ? row.files
    : Array.isArray(row?.attachments)
    ? row.attachments
    : [];

  const { localFiles } = buildNamedLocalFiles(filesArr, "photo");

  for (const f of localFiles) {
    const uploadUri = await asUploadableUri(String(f.uri));
    const name = sanitizeFilename(f.name || `file_${Date.now()}`);
    const type = f.type || "application/octet-stream";
    // @ts-ignore RN FormData file
    fd.append("files", { uri: uploadUri, name, type });
  }

  return request<any>(fotosNotesEndpoint(projectKey), {
    method: "POST",
    body: fd,
  });
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

  async health(): Promise<any> {
    return request<any>("/api/health", { method: "GET" });
  },

  async licenseStatus(): Promise<any> {
    return request<any>(licenseStatusEndpoint(), { method: "GET" });
  },

  async licenseActivate(code: string): Promise<any> {
    return request<any>(licenseActivateEndpoint(), {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  /** =========================
   * SUPPORT CHAT (NEW)
   * ========================= */

  async supportChat(payload: SupportChatRequest): Promise<SupportChatResponse> {
    const fixed: SupportChatRequest = {
      ...(payload || ({} as any)),
      message: String(payload?.message || "").trim(),
      context: {
        ...(payload?.context || {}),
        // ensure app version/build always present (best effort)
        appVersion: payload?.context?.appVersion || appVersion(),
        appBuild: payload?.context?.appBuild || appBuild(),
      },
    };

    if (!fixed.message) {
      return {
        ok: false,
        error: "message missing",
      };
    }

    try {
      const res = await request<SupportChatResponse>(supportChatEndpoint(), {
        method: "POST",
        body: JSON.stringify(fixed),
      });
      return res;
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      // keep consistent UX: never throw here, return an answer-like response
      if (msg === "OFFLINE") {
        return {
          ok: true,
          type: "warning",
          answer:
            "Sembra che tu sia offline. Appena torna la connessione, riprova.\n\n" +
            "Tip: se hai elementi in coda (pending), apri Inbox e verifica se c’è un item in errore.",
          actions: [],
        };
      }
      if (msg === "TIMEOUT") {
        return {
          ok: true,
          type: "warning",
          answer:
            "Il server non risponde (TIMEOUT). Potrebbe essere la connessione o il tunnel.\n\n" +
            "Tip: prova a riaprire l’app o a cambiare rete, poi riprova.",
          actions: [],
        };
      }
      return {
        ok: true,
        type: "warning",
        answer:
          "Non riesco a contattare il supporto in questo momento.\n\n" +
          `Errore: ${msg}`,
        actions: [],
      };
    }
  },

  /** =========================
   * COMPANY BRANDING (Header + Logo) – Offline Cache (B)
   * ========================= */

  async getCompanyHeader(): Promise<CompanyHeader> {
    const j = await request<any>(companyHeaderEndpoint(), { method: "GET" });
    const c = j?.company || j?.data?.company || null;
    if (!c) throw new Error("company header missing");
    const header: CompanyHeader = {
      id: String(c.id || ""),
      code: c.code ?? undefined,
      name: c.name ?? undefined,
      address: c.address ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      logoPath: c.logoPath ?? null,
      updatedAt: c.updatedAt ?? undefined,
    };
    await cacheCompanyHeaderLocally(header);
    return header;
  },

  async getCompanyHeaderCached(): Promise<CompanyHeader | null> {
    return readCachedCompanyHeader();
  },

  async getCompanyLogoCachedUri(): Promise<string | null> {
    return findAnyCachedLogoUri();
  },

  /**
   * ✅ Download logo (auth required) and store locally for OFFLINE PDFs.
   * Returns local file:// uri or null if no logo.
   */
  async downloadCompanyLogoToCache(force = false): Promise<string | null> {
    // need header for extension
    const header =
      (await api.getCompanyHeaderCached()) ||
      (await api.getCompanyHeader().catch(() => null));
    const ext = guessExtFromLogoPath(header?.logoPath);
    const dest = await cachedLogoUriForExt(ext);

    // ✅ se non force e il file esiste già -> ok
    if (!force) {
      try {
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists && info.isDirectory === false) return dest;
      } catch {}
    }

    // ✅ IMPORTANT: elimina vecchie estensioni per evitare logo “stale”
    await cleanupCachedCompanyLogos();

    // Download with Authorization header (request() can't return binary, so use downloadAsync)
    try {
      const base = await getApiUrl();
      const url = `${base}${companyLogoEndpoint()}`;

      const token = await getToken();
      const headers: Record<string, string> = {
        Accept: "*/*",
        "X-App-Version": appVersion(),
        ...(appBuild() ? { "X-App-Build": appBuild() } : {}),
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      await ensureCompanyCacheDir();

      const dl = await FileSystem.downloadAsync(url, dest, { headers });

      const info = await FileSystem.getInfoAsync(dl.uri);
      if (info.exists && info.size && info.size > 0) return dl.uri;

      return null;
    } catch {
      // offline / no logo / auth issues -> don't kill app
      return null;
    }
  },

  /**
   * One-shot: refresh header + logo into offline cache.
   * Use this after login, or in Settings screen.
   */
  async syncCompanyBrandingToOfflineCache(): Promise<{
    header: CompanyHeader | null;
    logoUri: string | null;
  }> {
    let header: CompanyHeader | null = null;
    try {
      header = await api.getCompanyHeader();
    } catch {
      header = await api.getCompanyHeaderCached();
    }

    const logoUri = await api.downloadCompanyLogoToCache(false);
    return { header, logoUri };
  },

  // ADMIN: update header fields
  async updateCompanyHeaderAdmin(payload: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
  }): Promise<CompanyHeader> {
    const j = await request<any>(companyAdminHeaderEndpoint(), {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });

    const c = j?.company || j?.data?.company || null;
    if (!c) throw new Error("company update missing");

    const header: CompanyHeader = {
      id: String(c.id || ""),
      code: c.code ?? undefined,
      name: c.name ?? undefined,
      address: c.address ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      logoPath: c.logoPath ?? null,
      updatedAt: c.updatedAt ?? undefined,
    };
    await cacheCompanyHeaderLocally(header);
    return header;
  },

  // ADMIN: upload logo (file:// / content:// supported)
  async uploadCompanyLogoAdmin(
    fileUri: string,
    mime?: string
  ): Promise<CompanyHeader> {
    const uri = await asUploadableUri(String(fileUri || ""));
    if (!uri) throw new Error("logo uri missing");

    const fd = new FormData();
    const name = sanitizeFilename(`logo_${Date.now()}.png`);
    const type = mime || "image/png";

    // @ts-ignore
    fd.append("file", { uri, name, type });

    const j = await request<any>(companyAdminLogoEndpoint(), {
      method: "POST",
      body: fd,
    });

    const c = j?.company || j?.data?.company || null;
    if (!c) throw new Error("company logo update missing");

    const header: CompanyHeader = {
      id: String(c.id || ""),
      code: c.code ?? undefined,
      name: c.name ?? undefined,
      address: c.address ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      logoPath: c.logoPath ?? null,
      updatedAt: c.updatedAt ?? undefined,
    };

    await cacheCompanyHeaderLocally(header);
    // refresh local cached logo file immediately
    await api.downloadCompanyLogoToCache(true);

    return header;
  },

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

  async mailSend(payload: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      name: string;
      url?: string;
      uri?: string;
      type?: string;
    }>;
    meta?: any;
  }) {
    return request<any>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async projects(): Promise<Project[]> {
    const r = await request<ProjectsResponse>("/api/projects");
    if (Array.isArray(r)) return r;
    if (r && Array.isArray((r as any).projects)) return (r as any).projects;
    return [];
  },

  /** =========================
   * KI
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

    if (meta) {
      fd.append(
        "meta",
        JSON.stringify({
          ...(meta || {}),
          projectId: projectKey,
          projectCode: projectKey,
        })
      );
    }

    for (const f of files) {
      if (!f?.uri) continue;
      const uploadUri = await asUploadableUri(String(f.uri));
      const name = sanitizeFilename(f.name || `file_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore
      fd.append("files", { uri: uploadUri, name, type });
    }

    return request<any>(kiVisionEndpoint(), {
      method: "POST",
      body: fd,
    });
  },

  async kiVision(payload: any): Promise<any> {
    const p = payload || {};
    const projectKey = await resolveProjectCode(
      p.projectId || p.projectCode || ""
    );

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

  async kiPhotoAnalyze(form: FormData): Promise<any> {
    return request<any>(kiPhotoAnalyzeEndpoint(), {
      method: "POST",
      body: form,
    });
  },

  async kiLieferscheinSuggest(
    projectIdOrCode: string,
    payload: any
  ): Promise<any> {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const att = Array.isArray(payload?.attachments) ? payload.attachments : [];
    const localFiles = extractLocalImagesOnly(att);

    const baseText = String(payload?.text || "").trim();
    let visionText = "";
    let visionEntities: any = undefined;
    let visionFileIds: string[] = Array.isArray(payload?.visionFileIds)
      ? payload.visionFileIds
      : Array.isArray(payload?.fileIds)
      ? payload.fileIds
      : [];

    if (localFiles.length) {
      try {
        const visionRes = await api.kiVisionFiles(projectKey, localFiles, {
          kind: "LIEFERSCHEIN",
          screen: "Lieferschein",
          docType: "LIEFERSCHEIN",
          projectId: projectKey,
          projectCode: projectKey,
          date: payload?.row?.date || payload?.date || undefined,
        });

        visionText = pickTextFromVisionResponse(visionRes);
        visionEntities = visionRes?.entities;

        const ids =
          visionRes?.fileIds ||
          visionRes?.ids ||
          visionRes?.data?.fileIds ||
          visionRes?.data?.ids ||
          visionRes?.result?.fileIds ||
          visionRes?.result?.ids;

        if (Array.isArray(ids) && ids.length) {
          visionFileIds = ids.map((x: any) => String(x)).filter(Boolean);
        }
      } catch {
        // ignore
      }
    }

    const textFinal = String(visionText || baseText || "").trim();

    const body = {
      projectId: projectKey,
      projectCode: projectKey,
      projectFsKey: projectKey,

      text: textFinal || " ",
      row: payload?.row ?? payload,
      attachments: att,
      strict: payload?.strict ?? true,

      ocr: localFiles.length > 0 || (visionFileIds?.length || 0) > 0,
      allowOcr: localFiles.length > 0 || (visionFileIds?.length || 0) > 0,
      enableOcr: localFiles.length > 0 || (visionFileIds?.length || 0) > 0,
      useOcr: localFiles.length > 0 || (visionFileIds?.length || 0) > 0,

      visionFileIds: visionFileIds || [],
      fileIds: visionFileIds || [],
      file_ids: visionFileIds || [],
      vision_file_ids: visionFileIds || [],

      entities: visionEntities,
    };

    try {
      return await request<any>(kiLieferscheinSuggestEndpoint(), {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      if (!looksLikeMissingEndpoint(e)) throw e;

      return api.kiSuggest({
        kind: "LIEFERSCHEIN",
        projectId: projectKey,
        projectCode: projectKey,
        text: textFinal || " ",
        row: payload?.row ?? payload,
        strict: payload?.strict ?? true,
        attachments: att,
        visionFileIds: visionFileIds || [],
        fileIds: visionFileIds || [],
        entities: visionEntities,
      });
    }
  },

  async kiPhotosSuggest(projectIdOrCode: string, payload: any): Promise<any> {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const filesArr = Array.isArray(payload?.files)
      ? payload.files
      : Array.isArray(payload?.attachments)
      ? payload.attachments
      : Array.isArray(payload?.photos)
      ? payload.photos
      : [];

    const localFiles = extractLocalImagesOnly(filesArr);

    const baseText = String(payload?.text || "").trim();
    let visionText = "";
    let visionEntities: any = undefined;

    if (localFiles.length) {
      try {
        const visionRes = await api.kiVisionFiles(projectKey, localFiles, {
          kind: "PHOTOS",
          screen: "Photos",
          docType: "PHOTOS",
          projectId: projectKey,
          projectCode: projectKey,
          date: payload?.row?.date || payload?.date || undefined,
        });

        visionText = pickTextFromVisionResponse(visionRes);
        visionEntities = visionRes?.entities;
      } catch {
        // ignore
      }
    }

    const textFinal = String(visionText || baseText || "").trim();

    const body = {
      projectId: projectKey,
      projectCode: projectKey,
      projectFsKey: projectKey,
      text: textFinal || " ",
      row: payload?.row ?? payload,
      attachments: filesArr,
      strict: payload?.strict ?? true,
      entities: visionEntities,
    };

    try {
      return await request<any>(kiPhotosSuggestEndpoint(), {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      if (!looksLikeMissingEndpoint(e)) throw e;

      return api.kiSuggest({
        kind: "PHOTOS",
        projectId: projectKey,
        projectCode: projectKey,
        text: textFinal || " ",
        row: payload?.row ?? payload,
        strict: payload?.strict ?? true,
        attachments: filesArr,
        entities: visionEntities,
      });
    }
  },

  /** =========================
   * REGIE
   * ========================= */

  async uploadRegieFiles(projectIdOrCode: string, files: UploadFileInput[]) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const fd = new FormData();
    fd.append("projectId", projectKey);

    for (const f of files) {
      if (!f?.uri) continue;
      const uploadUri = await asUploadableUri(String(f.uri));
      const name = sanitizeFilename(f.name || `regie_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore
      fd.append("files", { uri: uploadUri, name, type });
    }

    return request<any>(regieUploadEndpoint(), { method: "POST", body: fd });
  },

  async submitRegieInbox(projectIdOrCode: string, payload: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    return request<any>(regieSubmitEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        ...(payload || {}),
        projectId: projectKey,
        projectCode: projectKey,
      }),
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

  async pushRegieToServer(projectIdOrCode: string, row: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const date =
      String(row?.date || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    const photos = Array.isArray(row?.photos) ? row.photos : [];
    const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
    const all = [...attachments, ...photos].filter(Boolean);

    const { namedAll, localFiles, localByOrder } = buildNamedLocalFiles(
      all,
      "regie"
    );

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
        localIdx >= 0 && localIdx < uploadedFiles.length
          ? uploadedFiles[localIdx]
          : null;

      const hit = byName || byOrder;

      const serverUrl =
        hit?.url ||
        hit?.publicUrl ||
        p?.url ||
        p?.publicUrl ||
        (String(p?.uri || "").startsWith("/projects/") ? p.uri : null);

      return { id: p?.id, name, type: p?.type, url: serverUrl };
    });

    const submitPayload = {
      ...stripLocalUris(row),
      id: row?.id,
      projectId: projectKey,
      projectCode: projectKey,
      date,
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
      const uploadUri = await asUploadableUri(String(f.uri));
      const name = sanitizeFilename(f.name || `lieferschein_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore
      fd.append("files", { uri: uploadUri, name, type });
    }

    return request<any>(lsInboxUploadEndpoint(), { method: "POST", body: fd });
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
      body: JSON.stringify({ projectId: projectKey, docId, reason }),
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
      const uploadUri = await asUploadableUri(String(f.uri));
      const name = sanitizeFilename(f.name || `lieferschein_${Date.now()}`);
      const type = f.type || "application/octet-stream";
      // @ts-ignore
      fd.append("files", { uri: uploadUri, name, type });
    }

    return request<any>(lsLegacyUploadEndpoint(), { method: "POST", body: fd });
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

    const { namedAll, localFiles, localByOrder } = buildNamedLocalFiles(
      all,
      "lieferschein"
    );

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
    if (!docId)
      throw new Error("Lieferschein submit fehlgeschlagen: docId fehlt.");

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
        inboxItems.find(
          (u) => String(u?.name || "").trim() === String(name).trim()
        ) || null;

      const localIdx = localByOrder.findIndex(
        (x: any) => String(x?.uri || "") === String(p?.uri || "")
      );
      const byOrder =
        localIdx >= 0 && localIdx < inboxItems.length
          ? inboxItems[localIdx]
          : null;

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
      uploadRes = await api.uploadLieferscheinLegacyFiles(
        projectKey,
        localFiles,
        row?.comment
      );
    }

    const upItems: UploadedLsLegacyItem[] = Array.isArray(uploadRes?.items)
      ? uploadRes.items
      : [];

    if (localFiles.length && !upItems.length) {
      throw new Error(
        "Lieferschein Upload fehlgeschlagen: Server hat keine items zurückgegeben."
      );
    }

    const attachments = namedAll.map((p: any) => {
      const name = String(p._stableName || stableNameOf(p, "lieferschein"));
      const hit =
        upItems.find(
          (u: any) => String(u?.name || "").trim() === String(name).trim()
        ) || null;
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
   * PHOTOS / NOTIZEN
   * ========================= */

  async pushPhotosToServer(projectIdOrCode: string, row: any) {
    const projectKey = await resolveProjectCode(projectIdOrCode);

    const ba = extractBaCode(projectKey);
    if (!ba)
      throw new Error(
        "BA-Code fehlt (Photos Server-Sync benötigt BA-xxxx-...)"
      );

    const date =
      String(row?.date || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    const rFixed = {
      ...row,
      id:
        row?.id ||
        row?.docId ||
        `ph_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
      date,
      note: row?.note ?? row?.comment ?? "",
      files: Array.isArray(row?.files)
        ? row.files
        : Array.isArray(row?.attachments)
        ? row.attachments
        : [],
    };

    const saved = await uploadPhotoNoteToServer(ba, rFixed);

    return { ok: true, projectId: ba, saved };
  },

  async photosNotesList(projectIdOrCode: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    const ba = extractBaCode(projectKey);
    if (!ba) throw new Error("BA-Code fehlt");
    return request<any>(fotosNotesEndpoint(ba), { method: "GET" });
  },

  async photosNotesDelete(projectIdOrCode: string, id: string) {
    const projectKey = await resolveProjectCode(projectIdOrCode);
    const ba = extractBaCode(projectKey);
    if (!ba) throw new Error("BA-Code fehlt");
    return request<any>(fotosNotesDeleteEndpoint(ba, id), {
      method: "DELETE",
    });
  },
};

export { request };
export type { CompanyHeader };

export async function kiPhotoAnalyze(form: FormData) {
  return api.kiPhotoAnalyze(form);
}

export async function kiSuggestLieferschein(
  projectIdOrCode: string,
  payload: any
) {
  return api.kiLieferscheinSuggest(projectIdOrCode, payload);
}
export async function kiSuggestPhotos(projectIdOrCode: string, payload: any) {
  return api.kiPhotosSuggest(projectIdOrCode, payload);
}

export async function photosNotesList(projectIdOrCode: string) {
  return api.photosNotesList(projectIdOrCode);
}
export async function photosNotesDelete(projectIdOrCode: string, id: string) {
  return api.photosNotesDelete(projectIdOrCode, id);
}

/**
 * ✅ Support Chat export helper (optional, but convenient)
 */
export async function supportChat(payload: SupportChatRequest) {
  return api.supportChat(payload);
}
