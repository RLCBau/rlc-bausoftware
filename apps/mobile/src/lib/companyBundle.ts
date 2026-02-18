// apps/mobile/src/lib/companyBundle.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

import { setCompanyBrandingOffline } from "./companyCache";

/**
 * Bundle format:
 * - .rlccompany file: JSON con header + logo(base64) + firma
 * - QR light: JSON con solo header + firma (no logo)
 */

const OFFLINE_LICENSE_KEY = "rlc_offline_license_key_v1"; // se esiste -> usata come secret
const FALLBACK_SECRET_KEY = "rlc_company_bundle_secret_v1"; // secret locale generata (stabile sul device admin)
const BUNDLE_EXT = ".rlccompany";

const BUNDLE_DIR = `${FileSystem.documentDirectory || ""}rlc_company_bundle/`;
const TMP_LOGO = `${BUNDLE_DIR}tmp_logo_import.png`;
const TMP_BUNDLE = `${BUNDLE_DIR}company_setup${BUNDLE_EXT}`;

export type CompanyHeader = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type CompanyBundleLight = {
  v: 1;
  kind: "RLC_COMPANY_LIGHT";
  ts: string; // ISO
  header: CompanyHeader;
  sig: string;
};

export type CompanyBundleFile = {
  v: 1;
  kind: "RLC_COMPANY_FILE";
  ts: string; // ISO
  header: CompanyHeader;
  logo?: {
    mime: string;
    base64: string; // raw base64, no data:
  };
  sig: string;
};

function normalizeHeader(input: any): CompanyHeader {
  const h = input || {};
  const name = String(h.name || "").trim();
  return {
    name,
    address: String(h.address || "").trim() || undefined,
    phone: String(h.phone || "").trim() || undefined,
    email: String(h.email || "").trim() || undefined,
  };
}

function stableStringify(obj: any): string {
  // stringify con ordine chiavi stabile (per firma deterministica)
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(",")}}`;
}

async function ensureDir() {
  try {
    const info = await FileSystem.getInfoAsync(BUNDLE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(BUNDLE_DIR, { intermediates: true });
    }
  } catch {
    // ignore
  }
}

async function getBundleSecret(): Promise<string> {
  // 1) preferisci license offline se presente
  try {
    const s = await SecureStore.getItemAsync(OFFLINE_LICENSE_KEY);
    if (s && s.trim()) return s.trim();
  } catch {}
  try {
    const s = await AsyncStorage.getItem(OFFLINE_LICENSE_KEY);
    if (s && s.trim()) return s.trim();
  } catch {}

  // 2) fallback: secret locale stabile
  try {
    const s = await SecureStore.getItemAsync(FALLBACK_SECRET_KEY);
    if (s && s.trim()) return s.trim();
  } catch {}
  try {
    const s = await AsyncStorage.getItem(FALLBACK_SECRET_KEY);
    if (s && s.trim()) return s.trim();
  } catch {}

  // 3) genera e persisti
  const gen = Crypto.randomUUID();
  try {
    await SecureStore.setItemAsync(FALLBACK_SECRET_KEY, gen);
  } catch {
    try {
      await AsyncStorage.setItem(FALLBACK_SECRET_KEY, gen);
    } catch {}
  }
  return gen;
}

async function signPayload(payloadWithoutSig: any): Promise<string> {
  const secret = await getBundleSecret();
  const canonical = stableStringify(payloadWithoutSig);
  const toHash = `${secret}.${canonical}`;
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, toHash);
}

async function readFileAsBase64(uri: string): Promise<string> {
  return await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

function guessMimeFromUri(uri: string): string {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

/**
 * ✅ Crea bundle "LIGHT" (per QR): header + firma
 */
export async function createCompanyBundleLight(input: {
  header: CompanyHeader;
}): Promise<CompanyBundleLight> {
  const header = normalizeHeader(input.header);
  if (!header.name) throw new Error("header.name missing");

  const base = {
    v: 1 as const,
    kind: "RLC_COMPANY_LIGHT" as const,
    ts: new Date().toISOString(),
    header,
  };

  const sig = await signPayload(base);
  return { ...base, sig };
}

/**
 * ✅ Crea bundle "FILE": header + logo base64 + firma
 */
export async function createCompanyBundleFile(input: {
  header: CompanyHeader;
  logoUri?: string | null;
}): Promise<CompanyBundleFile> {
  const header = normalizeHeader(input.header);
  if (!header.name) throw new Error("header.name missing");

  let logo: CompanyBundleFile["logo"] | undefined = undefined;

  if (input.logoUri) {
    const mime = guessMimeFromUri(input.logoUri);
    const base64 = await readFileAsBase64(input.logoUri);
    logo = { mime, base64 };
  }

  const base = {
    v: 1 as const,
    kind: "RLC_COMPANY_FILE" as const,
    ts: new Date().toISOString(),
    header,
    ...(logo ? { logo } : {}),
  };

  const sig = await signPayload(base);
  return { ...base, sig };
}

/**
 * ✅ Verifica firma (LIGHT o FILE)
 */
export async function verifyCompanyBundle(
  bundle: any
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!bundle || bundle.v !== 1) return { ok: false, error: "BUNDLE_VERSION_INVALID" };
    if (!bundle.kind) return { ok: false, error: "BUNDLE_KIND_MISSING" };
    if (!bundle.sig) return { ok: false, error: "BUNDLE_SIG_MISSING" };

    const { sig, ...rest } = bundle;
    const expected = await signPayload(rest);
    if (String(sig) !== String(expected)) return { ok: false, error: "BUNDLE_SIG_INVALID" };

    const h = normalizeHeader(bundle.header);
    if (!h.name) return { ok: false, error: "HEADER_INVALID" };

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "BUNDLE_VERIFY_FAILED" };
  }
}

/**
 * ✅ Esporta bundle FILE su filesystem (share via WhatsApp ecc.)
 */
export async function exportCompanyBundleToFile(
  bundle: CompanyBundleFile
): Promise<string> {
  await ensureDir();
  const uri = TMP_BUNDLE;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(bundle, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return uri;
}

/**
 * ✅ Import bundle da fileUri (.rlccompany)
 */
export async function importCompanyBundleFromFile(fileUri: string): Promise<any> {
  const raw = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return JSON.parse(raw);
}

/**
 * ✅ Applica bundle (salva in cache/persistenza usata da Home/PDF)
 * - salva header
 * - se logo presente: scrive logo in tmp file e lo passa a companyCache (che lo copia in rlc_company/logo.*)
 */
export async function applyCompanyBundle(bundle: any): Promise<void> {
  const v = await verifyCompanyBundle(bundle);
  if (!v.ok) throw new Error(v.error);

  const header = normalizeHeader(bundle.header);

  let tmpLogoUri: string | null = null;
  if (bundle.kind === "RLC_COMPANY_FILE" && bundle.logo?.base64) {
    await ensureDir();

    // scegli estensione da mime
    const mime = String(bundle.logo?.mime || "image/png").toLowerCase();
    const ext =
      mime.includes("jpeg") || mime.includes("jpg")
        ? ".jpg"
        : mime.includes("webp")
        ? ".webp"
        : mime.includes("svg")
        ? ".svg"
        : ".png";

    const tmp = TMP_LOGO.replace(/\.png$/, ext);

    await FileSystem.writeAsStringAsync(tmp, String(bundle.logo.base64), {
      encoding: FileSystem.EncodingType.Base64,
    });

    tmpLogoUri = tmp;
  }

  await setCompanyBrandingOffline({
    header,
    logoUri: tmpLogoUri,
  });

  // cleanup tmp logo (best effort)
  if (tmpLogoUri) {
    try {
      await FileSystem.deleteAsync(tmpLogoUri, { idempotent: true });
    } catch {}
  }
}
