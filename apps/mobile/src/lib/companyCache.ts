// apps/mobile/src/lib/companyCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import { api, request } from "./api";

const KEY_HEADER = "rlc_company_header_v1";
const KEY_LOGO_URI = "rlc_company_logo_uri_v1";

// persistente
const DIR = `${FileSystem.documentDirectory || ""}rlc_company/`;
const LOGO_FILE_BASE = "logo"; // estensione aggiunta dopo (logo.png / logo.jpg / ...)

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function ensureDir() {
  if (!DIR) return;
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    }
  } catch {
    // ignore
  }
}

function guessExtFromHeaders(contentType?: string) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("svg")) return ".svg"; // se mai
  return ".png";
}

function guessExtFromUri(uri?: string) {
  const u = String(uri || "").toLowerCase();
  const m = u.match(/\.([a-z0-9]{2,5})(\?.*)?$/i);
  const ext = m?.[1] ? `.${m[1]}` : "";
  if (!ext) return ".png";
  if (ext === ".jpeg") return ".jpg";
  if ([".png", ".jpg", ".webp", ".svg"].includes(ext)) return ext;
  return ".png";
}

async function cleanupOldLogoFiles() {
  try {
    await ensureDir();
    const listing = await FileSystem.readDirectoryAsync(DIR);
    const prefix = `${LOGO_FILE_BASE}.`;
    const hits = listing.filter((n) => n.toLowerCase().startsWith(prefix));
    for (const n of hits) {
      try {
        await FileSystem.deleteAsync(`${DIR}${n}`, { idempotent: true });
      } catch {}
    }
  } catch {
    // ignore
  }
}

/**
 * Scarica il logo dal server autenticato.
 * Endpoint server: GET /api/company/logo (auth required)
 */
async function downloadLogoToPersistentFile(): Promise<string | null> {
  try {
    await ensureDir();

    const url = await api.absUrlAsync("/api/company/logo");

    // fetch diretto -> prendiamo token con import dinamico per evitare cicli
    const token = await (async () => {
      try {
        const mod = await import("./auth");
        return await mod.getToken();
      } catch {
        return "";
      }
    })();

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "image/*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) return null;

    const ct = res.headers.get("content-type") || "";
    const ext = guessExtFromHeaders(ct);

    // elimina eventuali vecchi logo.* (evita che resti in cache quello sbagliato)
    await cleanupOldLogoFiles();

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");

    const target = `${DIR}${LOGO_FILE_BASE}${ext}`;

    await FileSystem.writeAsStringAsync(target, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await AsyncStorage.setItem(KEY_LOGO_URI, target);
    return target;
  } catch {
    return null;
  }
}

/**
 * ✅ NUR_APP / offline: salva header in cache
 */
export async function setCompanyHeaderCached(header: any | null): Promise<void> {
  try {
    if (!header) {
      await AsyncStorage.removeItem(KEY_HEADER);
      return;
    }
    await AsyncStorage.setItem(KEY_HEADER, JSON.stringify(header));
  } catch {
    // ignore
  }
}

/**
 * ✅ NUR_APP / offline: copia logo in cartella persistente e salva uri
 * sourceUri può essere file:// (ImagePicker) o content:// (Android)
 */
export async function saveCompanyLogoToPersistentFile(
  sourceUri: string
): Promise<string | null> {
  try {
    if (!sourceUri) return null;
    await ensureDir();

    // pulisci vecchi logo.*
    await cleanupOldLogoFiles();

    const ext = guessExtFromUri(sourceUri);
    const target = `${DIR}${LOGO_FILE_BASE}${ext}`;

    // Android content:// -> copia in cache temporanea e poi copia
    if (sourceUri.startsWith("content://")) {
      const tmp = `${FileSystem.cacheDirectory || DIR}tmp_logo${ext}`;
      await FileSystem.copyAsync({ from: sourceUri, to: tmp });
      await FileSystem.copyAsync({ from: tmp, to: target });
      try {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
      } catch {}
    } else {
      await FileSystem.copyAsync({ from: sourceUri, to: target });
    }

    await AsyncStorage.setItem(KEY_LOGO_URI, target);
    return target;
  } catch {
    return null;
  }
}

/**
 * ✅ NUR_APP helper: salva header + logo (se presente) in un colpo
 */
export async function setCompanyBrandingOffline(opts: {
  header: any;
  logoUri?: string | null;
}): Promise<{ header: any; logoUri: string | null }> {
  const header = opts?.header ?? null;
  await setCompanyHeaderCached(header);

  let persisted: string | null = null;
  if (opts?.logoUri) {
    persisted = await saveCompanyLogoToPersistentFile(opts.logoUri);
  } else {
    // se non passa logoUri, non tocchiamo quello esistente
    persisted = (await getCompanyLogoUriCached()) || null;
  }

  return { header, logoUri: persisted };
}

/**
 * ✅ Sync header + logo (non crasha mai, torna sempre qualcosa se presente in cache)
 */
export async function syncCompanyHeaderAndLogo(): Promise<{
  header: any | null;
  logoUri: string | null;
}> {
  // 1) prova fetch header
  let header: any | null = null;

  try {
    const j = await request<any>("/api/company/header", { method: "GET" } as any);
    // accetta vari shape
    header = j?.company || j?.data?.company || j?.header || null;
    if (header) {
      await AsyncStorage.setItem(KEY_HEADER, JSON.stringify(header));
    }
  } catch {
    // ignore -> fallback cache
  }

  // 2) fallback header cache
  if (!header) {
    header = safeJsonParse<any>(await AsyncStorage.getItem(KEY_HEADER)) || null;
  }

  // 3) logo: se già c’è uri locale valido -> ok, altrimenti scarica
  let logoUri: string | null = null;

  try {
    const cachedLogo = (await AsyncStorage.getItem(KEY_LOGO_URI)) || "";
    if (cachedLogo) {
      const info = await FileSystem.getInfoAsync(cachedLogo);
      if (info.exists) logoUri = cachedLogo;
    }
  } catch {
    // ignore
  }

  if (!logoUri) {
    const dl = await downloadLogoToPersistentFile();
    if (dl) logoUri = dl;
  }

  return { header, logoUri };
}

/**
 * Solo lettura cache (offline)
 */
export async function getCompanyHeaderCached(): Promise<any | null> {
  return safeJsonParse<any>(await AsyncStorage.getItem(KEY_HEADER));
}

export async function getCompanyLogoUriCached(): Promise<string | null> {
  const u = (await AsyncStorage.getItem(KEY_LOGO_URI)) || "";
  if (!u) return null;
  try {
    const info = await FileSystem.getInfoAsync(u);
    return info.exists ? u : null;
  } catch {
    return null;
  }
}

/**
 * Force refresh logo (utile dopo upload admin/logo)
 */
export async function refreshCompanyLogo(): Promise<string | null> {
  const dl = await downloadLogoToPersistentFile();
  return dl || null;
}

/**
 * Clear cache (debug)
 */
export async function clearCompanyCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_HEADER);

    const u = (await AsyncStorage.getItem(KEY_LOGO_URI)) || "";
    await AsyncStorage.removeItem(KEY_LOGO_URI);

    // pulizia file locali
    if (u) {
      try {
        await FileSystem.deleteAsync(u, { idempotent: true });
      } catch {}
    }

    // pulisci eventuali altri logo.* rimasti
    await cleanupOldLogoFiles();
  } catch {}
}
