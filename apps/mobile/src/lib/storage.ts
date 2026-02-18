// apps/mobile/src/lib/storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

const API_URL_STORAGE_KEY = "api_base_url";

/** ============================================================
 * JSON storage (unchanged)
 * ============================================================ */

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** ============================================================
 * File persistence helpers (NEW)
 * Goal: never store content:// or ph:// in JSON/queue -> always file://
 * ============================================================ */

function normDir(d: string) {
  return d.endsWith("/") ? d : d + "/";
}

export function safeName(name: string) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

function isFileUri(u?: string) {
  return typeof u === "string" && u.startsWith("file://");
}
function isContentUri(u?: string) {
  return typeof u === "string" && u.startsWith("content://");
}
function isIosAssetUri(u?: string) {
  return (
    typeof u === "string" &&
    (u.startsWith("ph://") || u.startsWith("assets-library://"))
  );
}
function isHttpUrl(u?: string) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}
function isProjectsPath(u?: string) {
  return typeof u === "string" && u.startsWith("/projects/");
}

function extFromNameOrType(name?: string, type?: string, uri?: string) {
  const n = String(name || "").toLowerCase();
  const t = String(type || "").toLowerCase();
  const u = String(uri || "").toLowerCase();

  if (t.includes("pdf") || n.endsWith(".pdf") || u.endsWith(".pdf")) return "pdf";
  if (t.includes("png") || n.endsWith(".png") || u.endsWith(".png")) return "png";
  if (t.includes("webp") || n.endsWith(".webp") || u.endsWith(".webp")) return "webp";
  if (t.includes("heic") || n.endsWith(".heic") || u.endsWith(".heic")) return "heic";
  if (t.includes("heif") || n.endsWith(".heif") || u.endsWith(".heif")) return "heif";
  if (t.includes("jpeg") || n.endsWith(".jpeg") || u.endsWith(".jpeg")) return "jpeg";
  if (t.includes("jpg") || n.endsWith(".jpg") || u.endsWith(".jpg")) return "jpg";

  // default
  return "jpg";
}

function mimeFromExt(ext: string) {
  const e = String(ext || "").toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "heic" || e === "heif") return "image/heic";
  if (e === "pdf") return "application/pdf";
  return "image/jpeg";
}

export async function ensureDir(dir: string) {
  const d = normDir(dir);
  const info = await FileSystem.getInfoAsync(d);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(d, { intermediates: true });
  }
}

export function getBaseDirOrThrow(): string {
  if (Platform.OS === "web") {
    throw new Error("FS not available on web");
  }
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) throw new Error("No FileSystem base dir");
  return normDir(base);
}

async function getApiBaseUrlFromStorage(): Promise<string> {
  try {
    const raw = String((await AsyncStorage.getItem(API_URL_STORAGE_KEY)) || "").trim();
    if (raw) return raw.replace(/\/$/, "");
  } catch {}
  // fallback (keep aligned with api.ts default)
  return "https://api.rlcbausoftware.com";
}

/**
 * ✅ Persist ANY uri into a stable file:// in cache tmp/
 * Handles:
 * - content:// (Android)
 * - ph:// / assets-library:// (iOS Photos)
 * - HEIC/HEIF conversion to JPEG (best effort)
 * - http(s) or /projects/... download to cache
 */
export async function persistUriToCache(params: {
  uri: string;
  nameHint?: string;
  typeHint?: string;
}): Promise<{ uri: string; name?: string; type?: string }> {
  const input = String(params.uri || "").trim();
  if (!input) return { uri: "" };

  // already stable
  if (isFileUri(input)) {
    const ext0 = extFromNameOrType(params.nameHint, params.typeHint, input);
    return {
      uri: input,
      name: params.nameHint || `file.${ext0}`,
      type: params.typeHint || mimeFromExt(ext0),
    };
  }

  const base = getBaseDirOrThrow();
  const tmpDir = `${base}tmp/`;
  await ensureDir(tmpDir);

  // 1) remote URL or server /projects/... -> download
  if (isHttpUrl(input) || isProjectsPath(input)) {
    const apiBase = await getApiBaseUrlFromStorage();
    const abs = isHttpUrl(input) ? input : `${apiBase}${input}`;

    const ext = extFromNameOrType(params.nameHint, params.typeHint, abs);
    const target = `${tmpDir}${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;

    try {
      const dl = await FileSystem.downloadAsync(abs, target);
      const finalUri = dl?.uri || target;
      return {
        uri: finalUri,
        name: params.nameHint || safeName(`download.${ext}`),
        type: params.typeHint || mimeFromExt(ext),
      };
    } catch (e: any) {
      // fallback: keep abs (might fail later but don’t crash here)
      return {
        uri: abs,
        name: params.nameHint,
        type: params.typeHint,
      };
    }
  }

  // 2) content:// -> copy to tmp
  if (isContentUri(input)) {
    const ext = extFromNameOrType(params.nameHint, params.typeHint, input);
    const target = `${tmpDir}${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;
    await FileSystem.copyAsync({ from: input, to: target });
    return {
      uri: target.startsWith("file://") ? target : `file://${target}`,
      name: params.nameHint || safeName(`file.${ext}`),
      type: params.typeHint || mimeFromExt(ext),
    };
  }

  // 3) iOS Photos (ph://) or HEIC/HEIF -> convert to JPEG in tmp
  const low = input.toLowerCase();
  const looksHeic =
    low.endsWith(".heic") ||
    low.endsWith(".heif") ||
    String(params.typeHint || "").toLowerCase().includes("heic") ||
    String(params.nameHint || "").toLowerCase().endsWith(".heic") ||
    String(params.nameHint || "").toLowerCase().endsWith(".heif");

  if (isIosAssetUri(input) || looksHeic) {
    const outName = `${Date.now()}_${Math.floor(Math.random() * 1e9)}.jpg`;
    const outPath = `${tmpDir}${outName}`;

    // ImageManipulator returns a file:// uri (usually inside cache already)
    // We still copy to our tmp path to make it predictable.
    const tries = [
      { width: 1400, compress: 0.9 },
      { width: 1000, compress: 0.85 },
    ];

    for (const t of tries) {
      try {
        const res = await ImageManipulator.manipulateAsync(
          input,
          [{ resize: { width: t.width } }],
          { compress: t.compress, format: ImageManipulator.SaveFormat.JPEG }
        );

        // res.uri is file://... -> copy to our outPath
        if (res?.uri) {
          await FileSystem.copyAsync({ from: res.uri, to: outPath });
          return {
            uri: outPath,
            name: params.nameHint || safeName("image.jpg"),
            type: "image/jpeg",
          };
        }
      } catch {
        // try next
      }
    }

    // total failure -> keep original (caller can decide)
    return {
      uri: input,
      name: params.nameHint,
      type: params.typeHint,
    };
  }

  // 4) unknown scheme -> keep as-is
  const ext = extFromNameOrType(params.nameHint, params.typeHint, input);
  return {
    uri: input,
    name: params.nameHint || `file.${ext}`,
    type: params.typeHint || mimeFromExt(ext),
  };
}

/**
 * ✅ Persist a uri into a STABLE project folder:
 * projects/<projectFsKey>/<relativeDir>/
 * Returns a file:// uri suitable for JSON/queue.
 */
export async function persistUriToProject(params: {
  projectFsKey: string;          // BA-...
  relativeDir: string;           // e.g. "inbox/fotos/<docId>/files"
  uri: string;
  nameHint?: string;
  typeHint?: string;
}): Promise<{ uri: string; name: string; type: string }> {
  const projectFsKey = String(params.projectFsKey || "").trim();
  if (!projectFsKey) throw new Error("persistUriToProject: projectFsKey missing");

  const base = getBaseDirOrThrow();
  const rel = String(params.relativeDir || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const dir = `${base}projects/${projectFsKey}/${rel}/`;
  await ensureDir(dir);

  // 1) ensure local cache first (so we never copy content:// / ph:// directly into project)
  const cached = await persistUriToCache({
    uri: params.uri,
    nameHint: params.nameHint,
    typeHint: params.typeHint,
  });

  const src = String(cached.uri || "").trim();
  if (!src) throw new Error("persistUriToProject: source uri empty");

  // If still not file://, we cannot guarantee persistence (remote kept) -> fail hard
  if (!isFileUri(src) && !src.startsWith(getBaseDirOrThrow())) {
    throw new Error(`persistUriToProject: non-local uri not supported: ${src}`);
  }

  const ext = extFromNameOrType(cached.name, cached.type, src);
  const finalName = safeName(cached.name || `file.${ext}`);
  const target = `${dir}${finalName}`;

  // overwrite safe
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists) {
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch {}
  }

  await FileSystem.copyAsync({ from: src, to: target });

  return {
    uri: target.startsWith("file://") ? target : `file://${target}`,
    name: finalName,
    type: cached.type || mimeFromExt(ext),
  };
}
