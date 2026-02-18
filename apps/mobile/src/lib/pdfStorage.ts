// apps/mobile/src/lib/pdfStorage.ts

/**
 * Offline PDF storage (ROBUST for Expo SDK 54+)
 *
 * ✅ Uses legacy async API (getInfoAsync/copyAsync/readDirectoryAsync…)
 * ✅ But resolves base directories via BOTH:
 *   - legacy constants (documentDirectory/cacheDirectory) if present
 *   - new API: Directory.documentDirectory.uri / Directory.cacheDirectory.uri
 *
 * Exposed API:
 * - downloadPdf(projectFsKey, name, absUrl)           // http/https ONLY
 * - importLocalPdf(projectFsKey, name, localUri)      // file:// or content://
 * - getLocalUri(projectFsKey, name)
 * - isDownloaded(projectFsKey, name)
 * - deletePdf(projectFsKey, name)
 * - listDownloadedPdfs(projectFsKey)
 */

import * as LegacyFS from "expo-file-system/legacy";
import * as FS from "expo-file-system"; // for Directory.* fallback (SDK 54+)

/* ============================================================
 * Helpers
 * ============================================================ */

function safeProjectKey(k: string) {
  return String(k || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

function safeFilename(name: string) {
  const n = String(name || "file.pdf").trim();
  const base = n.replace(/[^\w.\-]+/g, "_").slice(0, 160);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

/**
 * Base directory (robusto):
 * - preferisce documentDirectory
 * - fallback su cacheDirectory
 *
 * ✅ FIX: supporta Expo SDK 54+ new API:
 *   Directory.documentDirectory.uri / Directory.cacheDirectory.uri
 */
function baseDir(): string {
  const legacyDoc = String((LegacyFS as any).documentDirectory || "").trim();
  const legacyCache = String((LegacyFS as any).cacheDirectory || "").trim();

  const fsDoc = String((FS as any).documentDirectory || "").trim();
  const fsCache = String((FS as any).cacheDirectory || "").trim();

  const dirDoc =
    String((FS as any)?.Directory?.documentDirectory?.uri || "").trim() ||
    String((FS as any)?.Directory?.documentDirectory || "").trim(); // safety

  const dirCache =
    String((FS as any)?.Directory?.cacheDirectory?.uri || "").trim() ||
    String((FS as any)?.Directory?.cacheDirectory || "").trim();

  const root =
    legacyDoc ||
    fsDoc ||
    dirDoc ||
    legacyCache ||
    fsCache ||
    dirCache;

  if (!root) {
    // 🔥 Diagnostics: show what the module actually contains
    const keysLegacy = Object.keys(LegacyFS as any).slice(0, 30).join(",");
    const keysFS = Object.keys(FS as any).slice(0, 30).join(",");

    throw new Error(
      `FileSystem directory fehlt (document/cache). ` +
        `legacy.documentDirectory=${String((LegacyFS as any).documentDirectory)} ` +
        `legacy.cacheDirectory=${String((LegacyFS as any).cacheDirectory)} ` +
        `fs.documentDirectory=${String((FS as any).documentDirectory)} ` +
        `fs.cacheDirectory=${String((FS as any).cacheDirectory)} ` +
        `Directory.documentDirectory.uri=${String((FS as any)?.Directory?.documentDirectory?.uri)} ` +
        `Directory.cacheDirectory.uri=${String((FS as any)?.Directory?.cacheDirectory?.uri)} ` +
        `keysLegacy=[${keysLegacy}] keysFS=[${keysFS}]`
    );
  }

  return root.endsWith("/") ? root : `${root}/`;
}

async function ensureDir(dirUri: string) {
  try {
    const info: any = await LegacyFS.getInfoAsync(dirUri);
    if (info.exists && info.isDirectory) return;
    if (info.exists && !info.isDirectory) {
      await LegacyFS.deleteAsync(dirUri, { idempotent: true });
    }
  } catch {
    // ignore
  }
  await LegacyFS.makeDirectoryAsync(dirUri, { intermediates: true });
}

/**
 * ✅ NEW: preferred dir (standard progetto)
 * baseDir()/rlc/projects/<key>/pdf/
 */
function projectDirPreferred(projectFsKey: string) {
  const k = safeProjectKey(projectFsKey);
  return `${baseDir()}rlc/projects/${k}/pdf/`;
}

/**
 * ✅ Legacy dir (compat)
 * baseDir()/rlc_pdfs/<key>/
 */
function projectDirLegacy(projectFsKey: string) {
  const k = safeProjectKey(projectFsKey);
  return `${baseDir()}rlc_pdfs/${k}/`;
}

/**
 * ✅ Backwards compatible accessor:
 * - scriviamo/creiamo SEMPRE su preferred
 * - ma leggiamo anche legacy tramite findExistingLocal/listDownloadedPdfs
 */
function projectDir(projectFsKey: string) {
  return projectDirPreferred(projectFsKey);
}

function fileUriInDir(dir: string, name: string) {
  return `${dir}${safeFilename(name)}`;
}

function isHttpUrl(u: string) {
  return /^https?:\/\//i.test(u);
}
function isFileUrl(u: string) {
  return /^file:\/\//i.test(u);
}
function isContentUrl(u: string) {
  return /^content:\/\//i.test(u);
}

/* ============================================================
 * Types
 * ============================================================ */

export type PdfMetaItem = {
  name: string; // filename
  uri: string; // file://
  size?: number;
  mtime?: string; // ISO
};

/* ============================================================
 * Internal: multi-dir helpers
 * ============================================================ */

async function ensureProjectDirs(projectFsKey: string) {
  const d1 = projectDirPreferred(projectFsKey);
  const d2 = projectDirLegacy(projectFsKey);

  // create both (idempotent)
  await ensureDir(d1);
  await ensureDir(d2);

  // extra safety for older code paths (harmless)
  try {
    await ensureDir(`${baseDir()}projects/`);
    await ensureDir(`${baseDir()}projects/${safeProjectKey(projectFsKey)}/`);
    await ensureDir(`${baseDir()}projects/${safeProjectKey(projectFsKey)}/pdf/`);
  } catch {}
}

async function infoIfFile(uri: string) {
  try {
    const info: any = await LegacyFS.getInfoAsync(uri);
    if (!info?.exists || info?.isDirectory) return null;
    return info;
  } catch {
    return null;
  }
}

async function findExistingLocal(projectFsKey: string, name: string): Promise<string | null> {
  const safeName = safeFilename(name);

  const preferred = fileUriInDir(projectDirPreferred(projectFsKey), safeName);
  const legacy = fileUriInDir(projectDirLegacy(projectFsKey), safeName);

  const i1 = await infoIfFile(preferred);
  if (i1) return preferred;

  const i2 = await infoIfFile(legacy);
  if (i2) return legacy;

  return null;
}

/* ============================================================
 * API
 * ============================================================ */

/**
 * List all locally downloaded PDFs for a project
 * ✅ reads BOTH dirs: preferred + legacy
 * ✅ ensures dirs exist
 */
export async function listDownloadedPdfs(projectFsKey: string): Promise<PdfMetaItem[]> {
  await ensureProjectDirs(projectFsKey);

  const preferredDir = projectDirPreferred(projectFsKey);
  const legacyDir = projectDirLegacy(projectFsKey);

  const allNames = new Set<string>();

  try {
    const pInfo: any = await LegacyFS.getInfoAsync(preferredDir);
    if (pInfo.exists && pInfo.isDirectory) {
      const pn = await LegacyFS.readDirectoryAsync(preferredDir);
      pn.forEach((x) => allNames.add(String(x || "").trim()));
    }
  } catch {}

  try {
    const lInfo: any = await LegacyFS.getInfoAsync(legacyDir);
    if (lInfo.exists && lInfo.isDirectory) {
      const ln = await LegacyFS.readDirectoryAsync(legacyDir);
      ln.forEach((x) => allNames.add(String(x || "").trim()));
    }
  } catch {}

  const out: PdfMetaItem[] = [];

  for (const raw of Array.from(allNames)) {
    const name = String(raw || "").trim();
    if (!name) continue;

    const uriPreferred = `${preferredDir}${name}`;
    const uriLegacy = `${legacyDir}${name}`;

    const infoP = await infoIfFile(uriPreferred);
    const info = infoP || (await infoIfFile(uriLegacy));
    if (!info) continue;

    const mt =
      typeof info?.modificationTime === "number"
        ? new Date(info.modificationTime * 1000).toISOString()
        : undefined;

    out.push({
      name,
      uri: infoP ? uriPreferred : uriLegacy,
      size: typeof info?.size === "number" ? info.size : undefined,
      mtime: mt,
    });
  }

  out.sort((a, b) => {
    const ta = a.mtime ? Date.parse(a.mtime) : 0;
    const tb = b.mtime ? Date.parse(b.mtime) : 0;
    if (tb !== ta) return tb - ta;
    return String(a.name).localeCompare(String(b.name));
  });

  return out;
}

/**
 * Get local uri for a given pdf name
 * ✅ checks preferred + legacy dirs
 */
export async function getLocalUri(projectFsKey: string, name: string): Promise<string | null> {
  const uri = await findExistingLocal(projectFsKey, name);
  return uri || null;
}

/**
 * Returns true if a PDF exists locally
 * ✅ checks preferred + legacy dirs
 */
export async function isDownloaded(projectFsKey: string, name: string): Promise<boolean> {
  const uri = await findExistingLocal(projectFsKey, name);
  return !!uri;
}

/**
 * Delete a locally stored PDF (preferred + legacy)
 * ✅ idempotent
 */
export async function deletePdf(projectFsKey: string, name: string): Promise<void> {
  const safeName = safeFilename(name);

  const preferred = fileUriInDir(projectDirPreferred(projectFsKey), safeName);
  const legacy = fileUriInDir(projectDirLegacy(projectFsKey), safeName);

  try {
    await LegacyFS.deleteAsync(preferred, { idempotent: true });
  } catch {}
  try {
    await LegacyFS.deleteAsync(legacy, { idempotent: true });
  } catch {}
}

/**
 * Download a PDF from absolute URL into offline storage
 * - absUrl MUST be http/https
 * - Saves into preferred dir
 */
export async function downloadPdf(projectFsKey: string, name: string, absUrl: string): Promise<string> {
  const url = String(absUrl || "").trim();
  if (!isHttpUrl(url)) {
    throw new Error("downloadPdf: URL muss http/https sein");
  }

  await ensureProjectDirs(projectFsKey);

  const dir = projectDirPreferred(projectFsKey);
  const target = fileUriInDir(dir, name);

  try {
    await LegacyFS.deleteAsync(target, { idempotent: true });
  } catch {}

  const dl = LegacyFS.createDownloadResumable(url, target, {});
  const res = await dl.downloadAsync();

  const savedUri = String((res as any)?.uri || target);
  const info = await infoIfFile(savedUri);
  if (!info) throw new Error("Download fehlgeschlagen (Datei nicht vorhanden)");

  return savedUri;
}

/**
 * Import a local pdf (file:// or content://) into offline storage
 * ✅ works with DocumentPicker (copyToCacheDirectory) + Android content://
 * ✅ saves into preferred dir
 */
export async function importLocalPdf(projectFsKey: string, name: string, localUri: string): Promise<string> {
  const src = String(localUri || "").trim();
  if (!src) throw new Error("importLocalPdf: localUri fehlt");

  // Accept file:// and content://
  if (!isFileUrl(src) && !isContentUrl(src)) {
    // still try copyAsync; some providers return bare paths
  }

  await ensureProjectDirs(projectFsKey);

  const dir = projectDirPreferred(projectFsKey);
  const target = fileUriInDir(dir, name);

  // remove previous versions (both dirs)
  try {
    await deletePdf(projectFsKey, name);
  } catch {}

  try {
    await LegacyFS.copyAsync({ from: src, to: target });
  } catch (e1: any) {
    // Fallback: base64 read/write (works if provider allows reading)
    const Enc =
      (LegacyFS as any).EncodingType ||
      (FS as any).EncodingType;

    try {
      const b64 = await LegacyFS.readAsStringAsync(src, {
        encoding: Enc.Base64,
      });
      await LegacyFS.writeAsStringAsync(target, b64, {
        encoding: Enc.Base64,
      });
    } catch (e2: any) {
      throw new Error(
        `PDF Import fehlgeschlagen: ${e2?.message || e1?.message || String(e2 || e1)}`
      );
    }
  }

  const info = await infoIfFile(target);
  if (!info) throw new Error("PDF Import: Datei wurde nicht gespeichert");

  return target;
}
