import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "./api";

function normDir(d: string) {
  return d.endsWith("/") ? d : d + "/";
}

function safeFsKey(k: string) {
  return String(k || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

async function ensureDir(dirUri: string) {
  const d = normDir(dirUri);
  const info = await FileSystem.getInfoAsync(d);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(d, { intermediates: true });
  }
}

function isHttp(u?: string) {
  const s = String(u || "").trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

function isFile(u?: string) {
  const s = String(u || "").trim();
  return s.startsWith("file://");
}

function isRelativeApiOrProject(u?: string) {
  const s = String(u || "").trim();
  return s.startsWith("/") || /^projects\//i.test(s);
}

function filenameFromUrl(url: string) {
  try {
    const clean = String(url || "").split("?")[0];
    const base = clean.substring(clean.lastIndexOf("/") + 1) || "file";
    return base.replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 120);
  } catch {
    return `file_${Date.now()}`;
  }
}

async function getTokenSafe() {
  try {
    const t =
      (await AsyncStorage.getItem("auth_token")) ||
      (await AsyncStorage.getItem("token")) ||
      "";
    return String(t || "").trim();
  } catch {
    return "";
  }
}

async function getApiBaseSafe() {
  try {
    const base = String(
      (api as any)?.getApiUrl ? await (api as any).getApiUrl() : (api as any)?.apiUrl || ""
    ).replace(/\/$/, "");
    return base;
  } catch {
    return String((api as any)?.apiUrl || "").replace(/\/$/, "");
  }
}

async function resolveToAbsoluteUrl(rawInput: string): Promise<string> {
  const raw = String(rawInput || "").trim();
  if (!raw) return "";

  if (isHttp(raw) || isFile(raw)) return raw;

  if (/^projects\//i.test(raw)) {
    const base = await getApiBaseSafe();
    return base ? `${base}/${raw.replace(/^\/+/, "")}` : raw;
  }

  if (raw.startsWith("/")) {
    const base = await getApiBaseSafe();
    return base ? `${base}${raw}` : raw;
  }

  return raw;
}

function normalizeMetaEntry(input: any) {
  if (!input) return null;

  if (typeof input === "string") {
    const uri = String(input).trim();
    if (!uri) return null;
    return {
      uri,
      name: filenameFromUrl(uri),
      type: undefined,
    };
  }

  const uri = String(input?.uri || input?.url || input?.path || "").trim();
  if (!uri) return null;

  return {
    ...input,
    uri,
    name: input?.name || input?.filename || filenameFromUrl(uri),
    type: input?.type || input?.mime || input?.mimeType,
  };
}

/**
 * Scarica un URL protetto in cache progetto e ritorna file://...
 * Supporta:
 * - http(s)://...
 * - /api/...
 * - /projects/...
 * - projects/...
 */
export async function cacheProtectedUrlToFile(params: {
  projectFsKey: string;
  url: string;
  filenameHint?: string;
}): Promise<string> {
  const { projectFsKey, url, filenameHint } = params;

  const raw = String(url || "").trim();
  if (!raw) return "";

  if (isFile(raw)) return raw;

  const abs = await resolveToAbsoluteUrl(raw);
  if (!isHttp(abs)) {
    return raw;
  }

  const root = String(FileSystem.cacheDirectory || FileSystem.documentDirectory || "").trim();
  if (!root) return raw;

  const fsKey = safeFsKey(projectFsKey);
  const dir = `${normDir(root)}rlc_preview/${fsKey}/`;
  await ensureDir(dir);

  const fileName =
    String(filenameHint || "").trim() || filenameFromUrl(abs) || `file_${Date.now()}`;
  const target = `${dir}${fileName}`;

  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      return target.startsWith("file://") ? target : `file://${target}`;
    }
  } catch {}

  const token = await getTokenSafe();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await FileSystem.downloadAsync(abs, target, { headers });
    const localUri = String(res?.uri || target);
    return localUri.startsWith("file://") ? localUri : `file://${localUri}`;
  } catch {
    return raw;
  }
}

async function localizeMetaArray(
  input: any[],
  projectFsKey: string,
  prefix: string
): Promise<any[]> {
  const arr = Array.isArray(input) ? input : [];
  const out: any[] = [];

  for (let i = 0; i < arr.length; i++) {
    const meta = normalizeMetaEntry(arr[i]);
    if (!meta?.uri) continue;

    const originalUri = String(meta.uri).trim();

    if (isFile(originalUri)) {
      out.push({ ...meta, uri: originalUri });
      continue;
    }

    if (isHttp(originalUri) || isRelativeApiOrProject(originalUri)) {
      const cached = await cacheProtectedUrlToFile({
        projectFsKey,
        url: originalUri,
        filenameHint:
          String(meta?.name || "").trim() || `${prefix}_${i}_${filenameFromUrl(originalUri)}`,
      });
      out.push({ ...meta, uri: cached });
      continue;
    }

    out.push({ ...meta, uri: originalUri });
  }

  // dedupe by uri
  const seen = new Set<string>();
  return out.filter((x) => {
    const u = String(x?.uri || "").trim();
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

/**
 * Hydrate per row:
 * - imageUri
 * - imageMeta.uri
 * - files / attachments / photos
 * - rows[].photos / attachments / files
 */
export async function hydrateRowForPreview(row: any, projectFsKey: string) {
  const next = { ...(row || {}) };

  const mainImageUri = String(
    next?.imageUri || next?.imageMeta?.uri || next?.image?.uri || ""
  ).trim();

  if (mainImageUri && (isHttp(mainImageUri) || isRelativeApiOrProject(mainImageUri))) {
    const localizedMain = await cacheProtectedUrlToFile({
      projectFsKey,
      url: mainImageUri,
      filenameHint: `main_${String(next.id || next.docId || "doc")}.jpg`,
    });

    next.imageUri = localizedMain;

    if (next.imageMeta && typeof next.imageMeta === "object") {
      next.imageMeta = { ...next.imageMeta, uri: localizedMain };
    }
    if (next.image && typeof next.image === "object") {
      next.image = { ...next.image, uri: localizedMain };
    }
  }

  const pooled = Array.isArray(next.files)
    ? next.files
    : Array.isArray(next.attachments)
    ? next.attachments
    : Array.isArray(next.photos)
    ? next.photos
    : [];

  if (pooled.length) {
    const localized = await localizeMetaArray(
      pooled,
      projectFsKey,
      `doc_${String(next.id || next.docId || "x")}`
    );
    next.files = localized;
    next.attachments = localized;
    next.photos = localized;
  }

  if (Array.isArray(next.rows) && next.rows.length) {
    next.rows = await Promise.all(
      next.rows.map(async (r: any, idx: number) => {
        const rowFiles = Array.isArray(r?.photos)
          ? r.photos
          : Array.isArray(r?.attachments)
          ? r.attachments
          : Array.isArray(r?.files)
          ? r.files
          : [];

        if (!rowFiles.length) {
          return r;
        }

        const localized = await localizeMetaArray(
          rowFiles,
          projectFsKey,
          `row_${String(next.id || next.docId || "x")}_${idx}`
        );

        return {
          ...r,
          photos: localized,
          attachments: localized,
          files: localized,
        };
      })
    );
  }

  return next;
}

