import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

function normDir(d: string) {
  return d.endsWith("/") ? d : d + "/";
}

function safeFsKey(k: string) {
  return String(k || "").trim().replace(/[^\w.\-]+/g, "_").slice(0, 80);
}

async function ensureDir(dirUri: string) {
  const d = normDir(dirUri);
  const info = await FileSystem.getInfoAsync(d);
  if (!info.exists) await FileSystem.makeDirectoryAsync(d, { intermediates: true });
}

function isHttp(u?: string) {
  const s = String(u || "");
  return s.startsWith("http://") || s.startsWith("https://");
}

function isFile(u?: string) {
  const s = String(u || "");
  return s.startsWith("file://");
}

function filenameFromUrl(url: string) {
  try {
    const clean = url.split("?")[0];
    const base = clean.substring(clean.lastIndexOf("/") + 1) || "file";
    return base.replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 120);
  } catch {
    return `file_${Date.now()}`;
  }
}

async function getToken() {
  return (await AsyncStorage.getItem("auth_token")) || "";
}

/**
 * Scarica un URL protetto in cache progetto e ritorna file://...
 */
export async function cacheProtectedUrlToFile(params: {
  projectFsKey: string;
  url: string;
  filenameHint?: string;
}): Promise<string> {
  const { projectFsKey, url, filenameHint } = params;
  if (!url) return "";

  if (isFile(url)) return url;
  if (!isHttp(url)) return url; // non sappiamo gestire altri schemi qui

  const root = String(FileSystem.documentDirectory || "");
  if (!root) return url;

  const fsKey = safeFsKey(projectFsKey);
  const dir = `${normDir(root)}projects/${fsKey}/cache/preview/`;
  await ensureDir(dir);

  const name = (filenameHint || filenameFromUrl(url)) || `file_${Date.now()}`;
  const target = `${dir}${name}`;

  // se già presente
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists) return target.startsWith("file://") ? target : `file://${target}`;

  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await FileSystem.downloadAsync(url, target, { headers });
  const localUri = res?.uri || target;

  return localUri.startsWith("file://") ? localUri : `file://${localUri}`;
}

/**
 * Hydrate per row: main image + attachments/files
 */
export async function hydrateRowForPreview(row: any, projectFsKey: string) {
  const next = { ...(row || {}) };

  if (next.imageUri && isHttp(next.imageUri)) {
    next.imageUri = await cacheProtectedUrlToFile({
      projectFsKey,
      url: String(next.imageUri),
      filenameHint: `main_${String(next.id || "doc")}.jpg`,
    });
  }

  const arr = Array.isArray(next.files) ? next.files : Array.isArray(next.attachments) ? next.attachments : [];
  if (arr.length) {
    const out = [];
    for (const f of arr) {
      const uri = String(f?.uri || "");
      if (isHttp(uri)) {
        const cached = await cacheProtectedUrlToFile({
          projectFsKey,
          url: uri,
          filenameHint: f?.name || filenameFromUrl(uri),
        });
        out.push({ ...f, uri: cached });
      } else {
        out.push(f);
      }
    }
    next.files = out;
    next.attachments = out;
    next.photos = out;
  }

  return next;
}
