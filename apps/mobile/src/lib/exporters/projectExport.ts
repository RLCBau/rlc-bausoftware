// apps/mobile/src/lib/exporters/projectExport.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";
import {
  getCompanyHeaderCached,
  getCompanyLogoUriCached,
  syncCompanyHeaderAndLogo,
} from "../companyCache";

const API_URL_STORAGE_KEY = "api_base_url";

type EmailPdfInput = {
  subject: string;
  body?: string;
  attachments: string[];
  to?: string[];
  cc?: string[];
  bcc?: string[];
};

type ExportBaseInput = {
  projectFsKey: string;
  projectTitle?: string;
  filenameHint?: string;
};

type ExportRegieInput = ExportBaseInput & { row: any };
type ExportLsInput = ExportBaseInput & { row: any };
type ExportPhotosInput = ExportBaseInput & { row: any };
type ExportTagesberichtInput = ExportBaseInput & { row: any };

export type ExportResult = {
  pdfUri: string;
  fileName: string;
  date: string;
};

/* ============================================================
 * FS HELPERS
 * ============================================================ */

function normDir(d: string) {
  return d.endsWith("/") ? d : d + "/";
}

function getBaseDirOrNull(): string | null {
  if (Platform.OS === "web") return null;
  if (FileSystem.documentDirectory) return normDir(FileSystem.documentDirectory);
  if (FileSystem.cacheDirectory) return normDir(FileSystem.cacheDirectory);
  return null;
}

async function ensureDir(dir: string) {
  const d = normDir(dir);
  const info = await FileSystem.getInfoAsync(d);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(d, { intermediates: true });
  }
}

function safeFileName(name: string) {
  return String(name || "file")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toHMS(d: Date) {
  return `${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

function guessDateFromRow(row: any): string {
  const candidates = [
    row?.date,
    row?.datum,
    row?.createdAt,
    row?.updatedAt,
    row?.ts,
    row?.timestamp,
  ].filter(Boolean);

  for (const c of candidates) {
    const dt = new Date(c);
    if (!isNaN(dt.getTime())) return toYMD(dt);
  }
  return toYMD(new Date());
}

function text(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function num(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(String(v).replace(",", "."));
  if (Number.isNaN(n)) return "";
  return String(n).replace(".", ",");
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isLikelyImg(nameOrTypeOrUri?: string) {
  const v = String(nameOrTypeOrUri || "").toLowerCase();

  if (v.startsWith("ph://") || v.startsWith("assets-library://")) return true;

  return (
    v.startsWith("image/") ||
    v.endsWith(".jpg") ||
    v.endsWith(".jpeg") ||
    v.endsWith(".png") ||
    v.endsWith(".webp") ||
    v.endsWith(".heic") ||
    v.endsWith(".heif")
  );
}

function isContentUri(uri?: string) {
  return typeof uri === "string" && uri.startsWith("content://");
}

function isFileUri(uri?: string) {
  return typeof uri === "string" && uri.startsWith("file://");
}

function isIosPhotosUri(uri?: string) {
  return (
    typeof uri === "string" &&
    (uri.startsWith("ph://") || uri.startsWith("assets-library://"))
  );
}

function isHttpUrl(u?: string) {
  const s = String(u || "");
  return /^https?:\/\//i.test(s);
}

function isProjectsPath(u?: string) {
  const s = String(u || "");
  return s.startsWith("/projects/");
}

async function getApiBaseUrlFromStorage(): Promise<string> {
  try {
    const raw = String((await AsyncStorage.getItem(API_URL_STORAGE_KEY)) || "").trim();
    if (raw) return raw.replace(/\/$/, "");
  } catch {}
  return "https://api.rlcbausoftware.com";
}

async function getAuthHeadersForDownload(): Promise<Record<string, string>> {
  try {
    const token = String((await AsyncStorage.getItem("auth_token")) || "").trim();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function getAuthToken(): Promise<string> {
  try {
    return String((await AsyncStorage.getItem("auth_token")) || "").trim();
  } catch {
    return "";
  }
}

/* ============================================================
 * REMOTE/LOCAL FILE HELPERS
 * ============================================================ */

async function ensureLocalFromRemote(
  uri: string,
  hint?: { name?: string; type?: string }
): Promise<string> {
  const s = String(uri || "").trim();
  if (!s) return "";

  if (isFileUri(s) || isContentUri(s) || isIosPhotosUri(s)) return s;
  if (!isHttpUrl(s) && !isProjectsPath(s)) return s;

  const base = await getApiBaseUrlFromStorage();
  const abs = isHttpUrl(s) ? s : `${base}${s}`;

  const baseDir = (FileSystem.cacheDirectory || FileSystem.documentDirectory) ?? null;
  if (!baseDir) return abs;

  const baseNorm = normDir(baseDir);
  await ensureDir(`${baseNorm}tmp/`);

  const ext = extFromNameOrType(hint?.name, hint?.type);
  const target = `${baseNorm}tmp/${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;

  try {
    const headers = await getAuthHeadersForDownload();
    const dl = await FileSystem.downloadAsync(abs, target, { headers });
    return dl.uri || target;
  } catch (e: any) {
    console.log("[PDFDBG] download remote FAILED:", {
      abs,
      err: String(e?.message || e),
    });
    return abs;
  }
}

function extFromNameOrType(name?: string, type?: string) {
  const n = String(name || "").toLowerCase();
  const t = String(type || "").toLowerCase();

  if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (t.includes("png") || n.endsWith(".png")) return "png";
  if (t.includes("webp") || n.endsWith(".webp")) return "webp";
  if (t.includes("heic") || n.endsWith(".heic")) return "heic";
  if (t.includes("heif") || n.endsWith(".heif")) return "heif";
  if (t.includes("jpeg") || n.endsWith(".jpeg")) return "jpeg";
  if (t.includes("jpg") || n.endsWith(".jpg")) return "jpg";

  return "jpg";
}

function mimeFromNameOrType(name?: string, type?: string, filePath?: string) {
  const n = String(name || filePath || "").toLowerCase();
  const t = String(type || "").toLowerCase();

  if (t.startsWith("image/")) return t;
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".heic") || n.endsWith(".heif")) return "image/heic";
  if (n.endsWith(".jpeg") || n.endsWith(".jpg")) return "image/jpeg";
  return "image/jpeg";
}

async function ensureFileUri(
  inputUri: string,
  hint?: { name?: string; type?: string }
): Promise<string> {
  if (!inputUri) return "";
  if (Platform.OS === "web") return inputUri;
  if (isFileUri(inputUri)) return inputUri;

  if (isContentUri(inputUri)) {
    const base = (FileSystem.cacheDirectory || FileSystem.documentDirectory) ?? null;
    if (!base) return inputUri;

    const baseNorm = normDir(base);
    await ensureDir(`${baseNorm}tmp/`);

    const ext = extFromNameOrType(hint?.name, hint?.type);
    const target = `${baseNorm}tmp/${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;

    await FileSystem.copyAsync({ from: inputUri, to: target });
    return target.startsWith("file://") ? target : `file://${target}`;
  }

  return inputUri;
}

async function ensurePrintableImageUri(
  uriIn: string,
  hint?: { name?: string; type?: string }
): Promise<{ uri: string; mime: string }> {
  const mime0 = mimeFromNameOrType(hint?.name, hint?.type, uriIn);
  const low = String(uriIn || "").toLowerCase();

  const isHeic =
    mime0.includes("heic") ||
    low.endsWith(".heic") ||
    low.endsWith(".heif") ||
    (hint?.name || "").toLowerCase().endsWith(".heic") ||
    (hint?.name || "").toLowerCase().endsWith(".heif");

  const isPh = isIosPhotosUri(uriIn);

  if (isPh || isHeic) {
    console.log("[PDFDBG] convert -> JPEG:", {
      uriIn,
      mime0,
      isPh,
      isHeic,
      name: hint?.name,
      type: hint?.type,
    });

    const tries = [
      { resize: { width: 1400 } as any, compress: 0.9 },
      { resize: { width: 1000 } as any, compress: 0.85 },
    ];

    for (const t of tries) {
      try {
        const out = await ImageManipulator.manipulateAsync(
          uriIn,
          [{ resize: t.resize }],
          { compress: t.compress, format: ImageManipulator.SaveFormat.JPEG }
        );
        console.log("[PDFDBG] convert OK:", out.uri);
        return { uri: out.uri, mime: "image/jpeg" };
      } catch (e: any) {
        console.log("[PDFDBG] convert TRY failed:", String(e?.message || e));
      }
    }

    console.log("[PDFDBG] convert FAILED completely, keeping original:", uriIn);
    return { uri: uriIn, mime: mime0 };
  }

  return { uri: uriIn, mime: mime0 };
}

async function readAsBase64DataUrl(img: {
  uri: string;
  name?: string;
  type?: string;
}): Promise<string | null> {
  const original = img?.uri;

  try {
    console.log("[PDFDBG] readAsBase64DataUrl start:", {
      original,
      name: img?.name,
      type: img?.type,
    });

    const u0 = await ensureLocalFromRemote(img.uri, { name: img.name, type: img.type });
    if (u0 !== img.uri) console.log("[PDFDBG] after ensureLocalFromRemote:", u0);

    const u1 = await ensureFileUri(u0, { name: img.name, type: img.type });
    console.log("[PDFDBG] after ensureFileUri:", u1);

    const { uri: u2, mime } = await ensurePrintableImageUri(u1, {
      name: img.name,
      type: img.type,
    });
    console.log("[PDFDBG] after ensurePrintableImageUri:", { u2, mime });

    if (isIosPhotosUri(u2)) {
      console.log("[PDFDBG] still ph:// after conversion -> giving up:", u2);
      return null;
    }

    const b64 = await FileSystem.readAsStringAsync(u2, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log("[PDFDBG] base64 length:", b64?.length || 0);

    const finalMime =
      mime === "image/heic" || mime === "image/heif" ? "image/jpeg" : mime;

    return `data:${finalMime};base64,${b64}`;
  } catch (e: any) {
    console.log("[PDFDBG] readAsBase64DataUrl FAILED:", {
      original,
      err: String(e?.message || e),
    });
    return null;
  }
}

/* ============================================================
 * COMPANY PDF HEADER
 * ============================================================ */

async function buildCompanyPdfHeaderHtml(): Promise<string> {
  try {
    let header = await getCompanyHeaderCached();
    let rawLogoUri = await getCompanyLogoUriCached();

    if (!rawLogoUri) {
      try {
        const synced = await syncCompanyHeaderAndLogo();
        header = header || synced?.header || null;
        rawLogoUri = synced?.logoUri || rawLogoUri || null;
      } catch (e) {
        console.log("[PDFDBG] company sync fallback failed:", String((e as any)?.message || e));
      }
    }

    const name = escapeHtml(text(header?.name || ""));
    const address = escapeHtml(text(header?.address || ""));
    const phone = escapeHtml(text(header?.phone || ""));
    const email = escapeHtml(text(header?.email || ""));

    let logoDataUrl = "";
    if (rawLogoUri) {
      const logoUri = String(rawLogoUri || "").trim();

      console.log("[PDFDBG] company rawLogoUri:", logoUri);

      if (logoUri.startsWith("data:image/")) {
        logoDataUrl = logoUri;
      } else {
        const maybeDataUrl = await readAsBase64DataUrl({
          uri: logoUri,
          name: "company_logo",
          type: logoUri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg",
        });

        if (maybeDataUrl) {
          logoDataUrl = maybeDataUrl;
        } else if (logoUri.startsWith("file://")) {
          try {
            const b64 = await FileSystem.readAsStringAsync(logoUri, {
              encoding: FileSystem.EncodingType.Base64,
            } as any);

            if (b64) {
              const mime = logoUri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
              logoDataUrl = `data:${mime};base64,${b64}`;
            }
          } catch (e) {
            console.log("[PDFDBG] company logo direct read failed:", String((e as any)?.message || e));
          }
        }
      }
    }

    if (!logoDataUrl && !name && !address && !phone && !email) return "";

    const logoHtml = logoDataUrl
      ? `<img class="company-logo" src="${logoDataUrl}" />`
      : `<div class="company-logo-placeholder"></div>`;

    const infoLines = [name, address, phone, email]
      .filter(Boolean)
      .map((v) => `<div class="company-line">${v}</div>`)
      .join("");

    return `
      <div class="company-header">
        <div class="company-header-left">
          ${logoHtml}
        </div>
        <div class="company-header-right">
          ${infoLines}
        </div>
      </div>
    `;
  } catch (e: any) {
    console.log("[PDFDBG] buildCompanyPdfHeaderHtml failed:", String(e?.message || e));
    return "";
  }
}

/* ============================================================
 * QUEUE-AWARE UNWRAP
 * ============================================================ */

function looksLikeQueueItem(x: any): boolean {
  if (!x || typeof x !== "object") return false;

  const k = String(x.kind || "").toUpperCase();
  if (!x.payload || typeof x.payload !== "object") return false;

    return (
    k === "REGIE" ||
    k === "LIEFERSCHEIN" ||
    k === "LS" ||
    k === "PHOTO_NOTE" ||
    k === "FOTOS_NOTIZEN" ||
    k === "PHOTOS" ||
    k === "TAGESBERICHT"
  );
}

function toAttachmentArrayFromFiles(files: any): any[] {
  const arr = Array.isArray(files) ? files : [];
  return arr
    .filter(Boolean)
    .map((f) => {
      if (typeof f === "string") {
        return { uri: f, type: undefined, name: undefined, id: undefined };
      }
      return {
        uri: f?.uri || f?.url || f?.path,
        type: f?.type,
        name: f?.name,
        id: f?.id,
      };
    })
    .filter((p) => !!p.uri);
}

function isRowLikeObject(o: any): boolean {
  if (!o || typeof o !== "object") return false;
  const keys = Object.keys(o);
  if (!keys.length) return false;

  return Boolean(
    o.rows ||
      o.items ||
      o.lines ||
      o.positions ||
      o.bemerkungen ||
      o.notes ||
      o.note ||
      o.comment ||
      o.leistung ||
      o.text ||
      o.attachments ||
      o.files ||
      o.photos ||
      o.imageUri ||
      o.imageMeta ||
      o.kostenstelle ||
      o.regieNr ||
      o.regieNummer ||
      o.lieferscheinNr ||
      o.lieferscheinNummer ||
      o.number ||
      o.nr ||
      o.date ||
      o.weather ||
o.temperature ||
o.issues ||
o.reportType ||
      o.datum 
  );
}

function materializeRowFromQueueItem(q: any): any {
  const kindRaw = String(q?.kind || "");
  const kind = kindRaw.toUpperCase();
  const p = q?.payload || {};

  const payloadAsRow =
    (!p?.row || typeof p.row !== "object") && isRowLikeObject(p) ? p : null;

  const mergePayloadIntoRow = (baseRow: any) => {
    const merged = { ...(baseRow || {}) };

    if (!merged.date && p?.date) merged.date = p.date;
    if (!merged.datum && p?.date) merged.datum = p.date;

    if (!merged.leistung && p?.text) merged.leistung = p.text;
    if (!merged.text && p?.text) merged.text = p.text;
    if (!merged.bemerkungen && p?.note) merged.bemerkungen = p.note;
    if (!merged.note && p?.note) merged.note = p.note;

    if (!merged.files && p?.files) merged.files = p.files;
    if (!merged.attachments && p?.files) {
      merged.attachments = toAttachmentArrayFromFiles(p.files);
    }
    if (!merged.photos && p?.files) merged.photos = toAttachmentArrayFromFiles(p.files);

    if (!merged.imageUri && p?.imageUri) merged.imageUri = p.imageUri;
    if (!merged.imageMeta && p?.imageMeta) merged.imageMeta = p.imageMeta;

    return merged;
  };

  if (kind === "REGIE") {
    const baseRow =
      (p?.row && typeof p.row === "object" ? p.row : null) || payloadAsRow;

    if (!baseRow) {
      return mergePayloadIntoRow({
        date: p?.date || "",
        stunden: p?.hours ?? "",
        leistung: p?.text || "",
        bemerkungen: p?.note || "",
        photos: toAttachmentArrayFromFiles(p?.files),
        docType: p?.docType || "REGIE",
      });
    }

    return mergePayloadIntoRow({
      ...baseRow,
      docType: baseRow?.docType || p?.docType || "REGIE",
    });
  }

  if (kind === "LIEFERSCHEIN" || kind === "LS") {
    const baseRow =
      (p?.row && typeof p.row === "object" ? p.row : null) || payloadAsRow;

    if (!baseRow) {
      return mergePayloadIntoRow({
        date: p?.date,
        zeitVon: p?.zeitVon,
        zeitBis: p?.zeitBis,
        supplier: p?.supplier,
        site: p?.site,
        driver: p?.driver,
        material: p?.material,
        qty: p?.quantity,
        unit: p?.unit,
        kostenstelle: p?.kostenstelle,
        lvItemPos: p?.lvItemPos,
        number: p?.lieferscheinNummer || p?.lieferscheinNr || p?.nr || p?.number,
        bemerkungen: p?.bemerkungen || p?.comment || p?.note,
        files: p?.files,
        attachments: toAttachmentArrayFromFiles(p?.files),
      });
    }

    return mergePayloadIntoRow(baseRow);
  }

  if (kind === "PHOTO_NOTE" || kind === "FOTOS_NOTIZEN" || kind === "PHOTOS") {
    const baseRow =
      (p?.row && typeof p.row === "object" ? p.row : null) || payloadAsRow;

    const imageUri =
      p?.imageUri ||
      p?.imageMeta?.uri ||
      baseRow?.imageUri ||
      baseRow?.imageMeta?.uri ||
      null;

    const files = [
      ...(p?.files ? toAttachmentArrayFromFiles(p.files) : []),
      ...(imageUri
        ? [
            {
              uri: imageUri,
              type: p?.imageMeta?.type,
              name: p?.imageMeta?.name,
            },
          ]
        : []),
    ].filter(Boolean);

    const draft = {
      ...(baseRow || {}),
      date: baseRow?.date || p?.date || p?.createdAt || "",
      title: baseRow?.title || "",
      note: baseRow?.note || p?.note || p?.comment || p?.bemerkungen || "",
      bemerkungen: baseRow?.bemerkungen || p?.bemerkungen || "",
      kostenstelle: baseRow?.kostenstelle || p?.kostenstelle || "",
      lvItemPos: baseRow?.lvItemPos || p?.lvItemPos || null,
      files: baseRow?.files || p?.files,
      attachments: files,
      boxes: baseRow?.boxes || p?.boxes,
      extras: baseRow?.extras || p?.extras,
      docId: baseRow?.docId || p?.docId,
      imageUri: imageUri || undefined,
      imageMeta: baseRow?.imageMeta || p?.imageMeta,
    };

    return mergePayloadIntoRow(draft);
  }

    if (kind === "TAGESBERICHT") {
    const baseRow =
      (p?.row && typeof p.row === "object" ? p.row : null) || payloadAsRow;

    if (!baseRow) {
      return mergePayloadIntoRow({
        date: p?.date || "",
        weather: p?.weather || "",
        temperature: p?.temperature || "",
        issues: p?.issues || "",
        notes: p?.notes || p?.note || "",
        text: p?.text || "",
        lines: Array.isArray(p?.lines) ? p.lines : [],
        reportType: "TAGESBERICHT",
        docType: "TAGESBERICHT",
      });
    }

    return mergePayloadIntoRow({
      ...baseRow,
      reportType: baseRow?.reportType || "TAGESBERICHT",
      docType: baseRow?.docType || "TAGESBERICHT",
      lines: Array.isArray(baseRow?.lines)
        ? baseRow.lines
        : Array.isArray(p?.lines)
        ? p.lines
        : [],
    });
  }

  if (p?.row && typeof p.row === "object") return { ...p.row };
  if (payloadAsRow) return { ...payloadAsRow };
  return q;
}

function unwrapRowMaybeQueue(rowOrQueue: any): any {
  if (looksLikeQueueItem(rowOrQueue)) return materializeRowFromQueueItem(rowOrQueue);
  return rowOrQueue;
}

/* ============================================================
 * NORMALIZATION
 * ============================================================ */

type RegieLine = {
  kostenstelle?: string;
  machine?: string;
  worker?: string;
  hours?: number | string;
  comment?: string;
  material?: string;
  quantity?: number | string;
  unit?: string;
  photos?: Array<{
    uri?: string;
    url?: string;
    path?: string;
    type?: string;
    name?: string;
  }>;
};

type RegieHeader = {
  reportType?: "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH";
  regieNummer?: string;
  auftraggeber?: string;
  arbeitsbeginn?: string;
  arbeitsende?: string;
  pause1?: string;
  pause2?: string;
  blattNr?: string;
  wetter?: string;
  kostenstelle?: string;
  bemerkungen?: string;
  date?: string;
};

function pickHeader(rowAny: any): RegieHeader {
  const row = unwrapRowMaybeQueue(rowAny);

  return {
    reportType: row?.reportType || row?.docType || row?.type || "REGIE",
    regieNummer: row?.regieNummer || row?.regieNr || row?.nummer || row?.number || "",
    auftraggeber: row?.auftraggeber || row?.client || row?.customer || row?.supplier || "",
    arbeitsbeginn: row?.arbeitsbeginn || row?.zeitVon || row?.timeFrom || row?.startTime || "",
    arbeitsende: row?.arbeitsende || row?.zeitBis || row?.timeTo || row?.endTime || "",
    pause1: row?.pause1 || "",
    pause2: row?.pause2 || "",
    blattNr: row?.blattNr || row?.blatt || "",
    wetter: row?.wetter || row?.weather || "",
    kostenstelle: row?.kostenstelle || row?.costCenter || "",
    bemerkungen: row?.bemerkungen || row?.notes || row?.comment || row?.note || "",
    date: (row?.date || row?.datum || "").slice?.(0, 10) || "",
  };
}

function normalizePhotos(
  x: any
): {
  uri?: string;
  url?: string;
  path?: string;
  type?: string;
  name?: string;
}[] {
  const arr = Array.isArray(x) ? x : [];

  return arr
    .filter(Boolean)
    .map((p) => {
      if (typeof p === "string") {
        return {
          uri: p,
          url: undefined,
          path: undefined,
          type: undefined,
          name: undefined,
        };
      }

      return {
        uri: p?.uri || p?.url || p?.path,
        url: p?.url,
        path: p?.path,
        type: p?.type,
        name: p?.name,
      };
    })
    .filter((p) => !!(p.uri || p.url || p.path));
}


function firstNonEmptyArray<T = any>(...candidates: any[]): T[] {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as T[];
  }
  return [];
}

function dedupeAttachmentLike(
  arr: Array<{ uri?: string; type?: string; name?: string; url?: string; path?: string }>
): Array<{ uri?: string; type?: string; name?: string; url?: string; path?: string }> {
  const seen = new Set<string>();
  const out: Array<{ uri?: string; type?: string; name?: string; url?: string; path?: string }> =
    [];

  for (const it of arr || []) {
    const uri = String(it?.uri || it?.url || it?.path || "").trim();
    if (!uri) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    out.push({
      uri,
      type: it?.type,
      name: it?.name,
      url: it?.url,
      path: it?.path,
    });
  }

  return out;
}

function collectNormalizedPhotosForRow(rowAny: any) {
  const row = unwrapRowMaybeQueue(rowAny);

 const merged = [
  ...(normalizePhotos(Array.isArray(row?.attachments) ? row.attachments : []) || []),
  ...(normalizePhotos(Array.isArray(row?.files) ? row.files : []) || []),
  ...(normalizePhotos(Array.isArray(row?.photos) ? row.photos : []) || []),
  ...(normalizePhotos([row?.imageUri, row?.imageMeta?.uri, row?.photoUri, row?.uri].filter(Boolean)) || []),
];
  return dedupeAttachmentLike(merged);
}

function normalizeRegieLines(rootAny: any): RegieLine[] {
  const root = unwrapRowMaybeQueue(rootAny);

  const candidates =
    (Array.isArray(root?.rows) && root.rows) ||
    (Array.isArray(root?.lines) && root.lines) ||
    (Array.isArray(root?.items?.aufmass) && root.items.aufmass) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.positions) && root.positions) ||
    null;

  const list: any[] = candidates ? candidates : [root];

  return list.map((r) => ({
    kostenstelle:
      r?.kostenstelle ||
      r?.ort ||
      r?.bereich ||
      r?.costCenter ||
      root?.kostenstelle ||
      root?.ort ||
      root?.bereich ||
      root?.costCenter ||
      "",
    machine:
      r?.machine ||
      r?.maschine ||
      r?.maschinen ||
      r?.equipment ||
      "",
    worker:
      r?.worker ||
      r?.mitarbeiter ||
      r?.person ||
      "",
    hours:
      r?.hours ??
      r?.stunden ??
      r?.stundenGesamt ??
      "",
    comment:
      r?.comment ||
      r?.notiz ||
      r?.note ||
      r?.taetigkeit ||
      r?.tätigkeit ||
      r?.beschreibung ||
      r?.leistung ||
      r?.leistungBeschreibung ||
      r?.description ||
      r?.text ||
      root?.leistung ||
      root?.text ||
      "",
    material: r?.material || "",
    quantity: r?.quantity ?? r?.menge ?? "",
    unit: r?.unit || r?.einheit || "",
    photos: normalizePhotos(
      firstNonEmptyArray(
        r?.photos,
        r?.attachments,
        r?.files,
        root?.photos,
        root?.attachments,
        root?.files
      )
    ),
  }));
}

/* ============================================================
 * MODEL PDF HELPERS
 * ============================================================ */

type DocKind = "REGIE" | "LIEFERSCHEIN" | "FOTOS" | "TAGESBERICHT";

function collectAllAttachmentsMaybe(rowAny: any): Array<{ uri?: string; type?: string; name?: string }> {
  const row = unwrapRowMaybeQueue(rowAny);

  const a1 = Array.isArray(row?.attachments) ? row.attachments : [];
  const a2 = Array.isArray(row?.files) ? row.files : [];
  const a3 = Array.isArray(row?.photos) ? row.photos : [];

  const extraUris: any[] = [];
  const u1 = row?.imageUri;
  const u2 = row?.imageMeta?.uri;
  const u3 = row?.photoUri;
  const u4 = row?.uri;

  for (const u of [u1, u2, u3, u4]) {
    if (typeof u === "string" && u.length) extraUris.push(u);
  }

  return dedupeAttachmentLike(
    [...a1, ...a2, ...a3, ...extraUris]
      .filter(Boolean)
      .map((p) => {
        if (typeof p === "string") return { uri: p, type: undefined, name: undefined };
        return {
          uri: p?.uri || p?.url || p?.path,
          type: p?.type,
          name: p?.name,
          url: p?.url,
          path: p?.path,
        };
      })
      .filter((p) => !!p.uri)
  ).map((p) => ({
    uri: p.uri,
    type: p.type,
    name: p.name,
  }));
}

async function firstPhotoDataUrlFromRowOrLines(opts: {
  rowAny: any;
  lines?: RegieLine[];
}): Promise<string | null> {
  try {
    const { rowAny, lines } = opts;
    const row = unwrapRowMaybeQueue(rowAny);

    const mainCandidates = dedupeAttachmentLike(
      [
        row?.imageUri
          ? {
              uri: row.imageUri,
              type: row?.imageMeta?.type || row?.image?.type,
              name: row?.imageMeta?.name || row?.image?.name || "main_photo.jpg",
            }
          : null,
        row?.imageMeta?.uri
          ? {
              uri: row.imageMeta.uri,
              type: row?.imageMeta?.type,
              name: row?.imageMeta?.name || "main_photo.jpg",
            }
          : null,
      ].filter(Boolean) as any
    );

    const linePhotos = (lines || []).flatMap((l) => (Array.isArray(l.photos) ? l.photos : []));
    const rowPhotos = collectAllAttachmentsMaybe(rowAny);

    const all = dedupeAttachmentLike([
      ...mainCandidates,
      ...linePhotos.map((p) => ({
        uri: p?.uri || p?.url || p?.path,
        type: p?.type,
        name: p?.name,
      })),
      ...rowPhotos,
    ]);

    const firstImg = all.find((p) => isLikelyImg(p?.type || p?.name || p?.uri)) || null;
    const uri = String(firstImg?.uri || "").trim();
    if (!uri) return null;

    return await readAsBase64DataUrl({
      uri,
      name: firstImg?.name,
      type: firstImg?.type,
    });
  } catch (e: any) {
    console.log("[PDFDBG] firstPhotoDataUrlFromRowOrLines FAILED:", String(e?.message || e));
    return null;
  }
}

function synthLinesForLieferschein(rowAny: any): RegieLine[] {
  const row = unwrapRowMaybeQueue(rowAny);

  const supplier = text(row?.supplier || row?.lieferant || "");
  const number = text(row?.lieferscheinNummer || row?.number || row?.nr || row?.lieferscheinNr || "");
  const site = text(row?.site || row?.baustelle || "");
  const driver = text(row?.driver || row?.fahrer || "");
  const material = text(row?.material || "");
  const qty = row?.qty ?? row?.quantity ?? row?.menge ?? row?.mengeGesamt ?? "";
  const unit = text(row?.unit || row?.einheit || "");

  const qtyStr =
    qty != null && String(qty).trim() !== "" && String(qty) !== "0"
      ? `${num(qty)} ${unit}`.trim()
      : "";

  const commentParts = [
    supplier ? `Lieferant: ${supplier}` : "",
    number ? `LS-Nr.: ${number}` : "",
    site ? `Baustelle: ${site}` : "",
  ].filter(Boolean);

  const rowPhotos = collectNormalizedPhotosForRow(row);

  return [
    {
      kostenstelle: row?.kostenstelle || row?.costCenter || "",
      machine: material || "Material",
      worker: driver || "",
      hours: "",
      comment: commentParts.join(" • "),
      material: qtyStr,
      photos: rowPhotos,
    },
  ];
}

function synthLinesForPhotos(rowAny: any): RegieLine[] {
  const row = unwrapRowMaybeQueue(rowAny);

  const extras = Array.isArray(row?.extras) ? row.extras : [];
  const boxes = Array.isArray(row?.boxes) ? row.boxes : [];

  const lines: RegieLine[] = [];

  for (const b of boxes) {
    const label = text(b?.label || b?.name || "Box");
    const conf = b?.conf != null ? ` (${Math.round(Number(b.conf) * 100)}%)` : "";
    lines.push({
      kostenstelle: row?.kostenstelle || "",
      machine: "Foto",
      worker: "",
      hours: "",
      comment: `${label}${conf}`.trim(),
      material: "",
      photos: [],
    });
  }

  for (const e of extras) {
    const t = text(e?.text || e?.title || e?.name || "Extra");
    lines.push({
      kostenstelle: row?.kostenstelle || "",
      machine: "Extra",
      worker: "",
      hours: "",
      comment: t,
      material: "",
      photos: [],
    });
  }

  const note = text(row?.note || row?.notiz || row?.text || row?.bemerkungen || "");
  const rowPhotos = collectNormalizedPhotosForRow(row);

  if (!lines.length) {
    lines.push({
      kostenstelle: row?.kostenstelle || "",
      machine: row?.lvItemPos ? `LV ${text(row.lvItemPos)}` : "Notiz",
      worker: "",
      hours: "",
      comment: note,
      material: "",
      photos: rowPhotos,
    });
  } else {
    const existing = Array.isArray(lines[0].photos) ? lines[0].photos : [];
    lines[0].photos = dedupeAttachmentLike([...rowPhotos, ...existing]) as RegieLine["photos"];
  }

  return lines;
}

function buildHeaderForLieferschein(rowAny: any, date: string): RegieHeader {
  const row = unwrapRowMaybeQueue(rowAny);
  return {
    reportType: "REGIE",
    regieNummer: row?.lieferscheinNummer || row?.number || row?.nr || row?.lieferscheinNr || "",
    auftraggeber: row?.supplier || row?.lieferant || "",
    arbeitsbeginn: row?.zeitVon || "",
    arbeitsende: row?.zeitBis || "",
    pause1: "",
    pause2: "",
    blattNr: "",
    wetter: "",
    kostenstelle: row?.kostenstelle || row?.costCenter || "",
    bemerkungen: row?.bemerkungen || row?.notes || row?.note || "",
    date,
  };
}

function buildHeaderForPhotos(rowAny: any, date: string): RegieHeader {
  const row = unwrapRowMaybeQueue(rowAny);
  return {
    reportType: "REGIE",
    regieNummer: row?.docId || row?.id || "",
    auftraggeber: "",
    arbeitsbeginn: "",
    arbeitsende: "",
    pause1: "",
    pause2: "",
    blattNr: "",
    wetter: "",
    kostenstelle: row?.kostenstelle || "",
    bemerkungen: row?.note || row?.notiz || row?.text || row?.bemerkungen || "",
    date,
  };
}

function buildHeaderForTagesbericht(rowAny: any, date: string): RegieHeader {
  const row = unwrapRowMaybeQueue(rowAny);
  const firstLine = Array.isArray(row?.lines) && row.lines.length ? row.lines[0] : null;

  return {
    reportType: "TAGESBERICHT",
    regieNummer: row?.docId || row?.id || row?.nummer || "",
    auftraggeber: row?.auftraggeber || row?.client || row?.customer || "",
    arbeitsbeginn:
      firstLine?.von ||
      row?.arbeitsbeginn ||
      row?.zeitVon ||
      "",
    arbeitsende:
      firstLine?.bis ||
      row?.arbeitsende ||
      row?.zeitBis ||
      "",
    pause1:
      firstLine?.pauseMin != null && String(firstLine.pauseMin).trim() !== ""
        ? `${firstLine.pauseMin} Min`
        : row?.pause1 || "",
    pause2: row?.pause2 || "",
    blattNr: row?.blattNr || "",
    wetter: row?.weather || row?.wetter || "",
    kostenstelle: row?.kostenstelle || "",
    bemerkungen: row?.issues || row?.notes || row?.bemerkungen || "",
    date,
  };
}
/* ============================================================
 * HTML
 * ============================================================ */

function renderTypeRow(label: string, type: string, activeType: string) {
  const active = String(activeType || "").toUpperCase() === String(type).toUpperCase();
  return `
    <div class="type-row">
      <div>${escapeHtml(label)}</div>
      <div class="cb">${active ? "X" : ""}</div>
    </div>
  `;
}

function renderRightField(label: string, value: string) {
  return `
    <div class="rf">
      <div class="lab">${escapeHtml(label)}</div>
      <div class="val">${escapeHtml(text(value || ""))}</div>
    </div>
  `;
}

function buildPdfShell(content: string) {
  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: A4; margin: 10mm; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #111;
          margin: 0;
          padding: 0;
        }

        .page { width: 100%; }
        .page-break { page-break-after: always; }

        .company-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 6mm;
          border: 0.3mm solid #111;
          padding: 3mm 4mm;
          margin-bottom: 3mm;
          min-height: 22mm;
          box-sizing: border-box;
        }

        .company-header-left {
          width: 36mm;
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }

        .company-header-right {
          flex: 1;
          font-size: 10px;
          line-height: 1.45;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: left;
        }

        .company-logo {
          width: 30mm;
          max-height: 18mm;
          object-fit: contain;
          display: block;
        }

        .company-logo-placeholder {
          width: 30mm;
          height: 18mm;
          border: 0.3mm solid #999;
          background: #f8f8f8;
          border-radius: 2mm;
        }

        .company-line {
          margin-bottom: 1mm;
        }

        .doc-banner {
          width: 100%;
          box-sizing: border-box;
          border: 0.3mm solid #111;
          padding: 2.5mm 4mm;
          margin-bottom: 3mm;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-align: center;
          background: #f3f3f3;
        }

        .doc-banner.fotos { background: #f5f7fa; }
        .doc-banner.ls {
          background: #eaeaea;
          border-left: 4mm solid #111;
          text-align: left;
          padding-left: 5mm;
        }
        .doc-banner.regie { background: #f3f3f3; }

        .head {
          display: flex;
          border: 0.3mm solid #111;
          height: 30mm;
        }

        .head-left {
          width: 55mm;
          border-right: 0.3mm solid #111;
          padding: 3mm 4mm;
          box-sizing: border-box;
        }

        .type-row {
          display:flex;
          align-items:center;
          justify-content: space-between;
          margin: 2mm 0;
          font-size: 10px;
        }

        .cb {
          width: 6mm;
          height: 6mm;
          border: 0.3mm solid #111;
          display:grid;
          place-items:center;
          font-weight:700;
        }

        .left-title {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .head-mid {
          flex: 1;
          border-right: 0.3mm solid #111;
          padding: 3mm 4mm;
          box-sizing: border-box;
        }

        .head-mid .line {
          display:flex;
          gap: 2mm;
          font-size: 10px;
          margin: 2mm 0;
        }

        .head-mid .lab {
          width: 34mm;
          color:#111;
        }

        .head-mid .val {
          flex: 1;
          border-bottom: 0.3mm solid #111;
          padding-bottom: 1mm;
        }

        .head-right {
          width: 55mm;
          display:flex;
          flex-direction: column;
        }

        .rf {
          flex: 1;
          border-bottom: 0.3mm solid #111;
          display:flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 2mm 2mm;
          box-sizing: border-box;
        }

        .rf:last-child { border-bottom: none; }
        .rf .lab { font-size: 10px; text-align:center; }
        .rf .val { font-size: 10px; text-align:center; font-weight:600; }

        .days {
          margin-top: 2mm;
          border: 0.3mm solid #111;
        }

        .days .row { display:flex; }

        .days .cell {
          flex: 1;
          border-right: 0.3mm solid #111;
          padding: 1.5mm 0;
          text-align:center;
          font-size: 10px;
        }

        .days .cell:last-child { border-right: none; }
        .days .days-row .day { font-weight: 700; }
        .days .zeit-lab .zeit { background: #f3f3f3; }
        .days .zeit-val .v { height: 7mm; }

        .ls-info {
          display: flex;
          justify-content: space-between;
          gap: 4mm;
          margin-top: 2mm;
          padding: 2mm 2.5mm;
          border: 0.3mm solid #111;
          background: #fafafa;
          font-size: 10px;
        }

        table.main {
          width: 100%;
          border-collapse: collapse;
          margin-top: 2mm;
          border: 0.3mm solid #111;
        }

        table.main th,
        table.main td {
          border: 0.3mm solid #111;
          padding: 1.8mm 1.4mm;
          font-size: 10px;
          vertical-align: top;
        }

        table.main td { height: 10mm; }

        table.main th {
          background: #f3f3f3;
          text-align: center;
          font-weight: 700;
        }

        th.kosten, td.kosten { width: 18mm; }
        th.geraet, td.geraet { width: 33mm; }
        th.mitarb, td.mitarb { width: 26mm; }
        th.std, td.std { width: 12mm; text-align: center; }
        th.bes, td.bes { width: 62mm; }
        th.mat, td.mat { width: 36mm; }

        .badges {
          margin-bottom: 1mm;
          display:flex;
          flex-wrap:wrap;
          gap: 1mm;
        }

        .tag {
          font-size: 9px;
          padding: 0.3mm 1.3mm;
          border-radius: 2mm;
          display:inline-block;
          font-weight: 800;
          background: #111;
          color: #fff;
          border: none;
        }

        .desc {
          margin-top: 3mm;
          border: 0.3mm solid #111;
          min-height: 13mm;
        }

        .desc-title {
          background: #f3f3f3;
          padding: 1.5mm 2mm;
          font-weight: 700;
          font-size: 10px;
          border-bottom: 0.3mm solid #111;
        }

        .desc-body {
          padding: 2mm;
          font-size: 10px;
          min-height: 6mm;
          white-space: pre-wrap;
        }

        .bottom {
          margin-top: 3mm;
          display:flex;
          gap: 4mm;
          align-items: stretch;
        }

        .box {
          border: 0.3mm solid #111;
          min-height: 52mm;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .foto-big { flex: 2; }
        .bemerk-small { flex: 1; }

        .box-title {
          background: #f3f3f3;
          padding: 1.5mm 2mm;
          font-weight: 700;
          font-size: 10px;
          border-bottom: 0.3mm solid #111;
        }

        .photo {
          width: 100%;
          flex: 1;
          object-fit: cover;
          display: block;
          background: #fafafa;
        }

        .ph-muted {
          padding: 10mm 2mm;
          text-align:center;
          color:#666;
          font-size: 10px;
        }

        .bem-text {
          padding: 2mm;
          font-size: 10px;
          white-space: pre-wrap;
          flex: 1;
        }

        .sign {
          margin-top: 3mm;
          display:flex;
          gap: 4mm;
        }

        .sign-col {
          flex:1;
          border: 0.3mm solid #111;
        }

        .sign-title {
          background:#f3f3f3;
          padding: 1.5mm 2mm;
          font-weight:700;
          font-size:10px;
          border-bottom: 0.3mm solid #111;
        }

        .sign-line {
          display:flex;
          gap: 2mm;
          padding: 3mm 2mm;
          align-items:flex-end;
        }

        .sign-line .lab {
          width: 18mm;
          font-size: 10px;
        }

        .sign-line .line {
          flex:1;
          border-bottom: 0.3mm solid #111;
          height: 0;
        }
        /* RLC_BUSINESS_PDF_UNIFIED_STYLE_V1 */
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #172033;
          background: #ffffff;
          font-size: 11px;
          line-height: 1.35;
        }

        .page {
          width: 100%;
          box-sizing: border-box;
          padding: 0;
        }

        .company-header {
          border: 0;
          border-bottom: 1px solid #d8e1ee;
          padding: 0 0 14px 0;
          margin: 0 0 18px 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .company-header-left {
          width: 130px;
          min-height: 72px;
        }

        .company-logo,
        .company-logo-placeholder {
          width: 118px;
          height: 64px;
          object-fit: contain;
          border: 1px solid #d8e1ee;
          border-radius: 8px;
          background: #ffffff;
        }

        .company-header-right {
          flex: 1;
          color: #344055;
          font-size: 10px;
          line-height: 1.35;
        }

        .company-line:first-child {
          color: #172033;
          font-weight: 800;
          font-size: 12px;
          margin-bottom: 3px;
        }

        .doc-banner {
          border: 0;
          background: transparent;
          color: #172033;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.3px;
          text-align: left;
          padding: 0;
          margin: 0 0 4px 0;
        }

        .doc-banner.regie::after,
        .doc-banner.ls::after,
        .doc-banner.fotos::after {
          content: "Eingang / Entwurf";
          display: block;
          color: #728096;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0;
          margin-top: 2px;
        }

        .head {
          display: grid;
          grid-template-columns: 1.05fr 1.6fr 1.05fr;
          gap: 12px;
          border: 0;
          margin: 16px 0 14px 0;
        }

        .head-left,
        .head-mid,
        .head-right,
        .ls-info,
        .desc,
        .box,
        .sign-col {
          border: 1px solid #d8e1ee;
          border-radius: 9px;
          background: #ffffff;
          overflow: hidden;
        }

        .head-left,
        .head-mid,
        .head-right {
          padding: 10px;
        }

        .left-title {
          font-size: 18px;
          font-weight: 900;
          color: #172033;
        }

        .type-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          border: 0;
          border-bottom: 1px solid #eef2f7;
          padding: 5px 0;
          color: #344055;
          font-weight: 700;
        }

        .type-row:last-child {
          border-bottom: 0;
        }

        .cb {
          width: 18px;
          height: 18px;
          border: 1px solid #9aa8ba;
          border-radius: 4px;
          text-align: center;
          line-height: 18px;
          font-weight: 900;
          color: #172033;
        }

        .line {
          display: grid;
          grid-template-columns: 95px 1fr;
          gap: 8px;
          padding: 5px 0;
          border-bottom: 1px solid #eef2f7;
        }

        .line:last-child {
          border-bottom: 0;
        }

        .lab {
          color: #66748a;
          font-weight: 800;
        }

        .val {
          color: #172033;
          font-weight: 700;
          border-bottom: 0;
        }

        .rf {
          display: grid;
          grid-template-columns: 90px 1fr;
          gap: 8px;
          border-bottom: 1px solid #eef2f7;
          padding: 5px 0;
        }

        .rf:last-child {
          border-bottom: 0;
        }

        .rf .val {
          text-align: right;
          font-weight: 900;
        }

        .zeit-grid {
          border: 1px solid #d8e1ee;
          border-radius: 9px;
          overflow: hidden;
          margin: 0 0 14px 0;
        }

        .zeit-row,
        .zeit-row.values {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
        }

        .cell {
          border-right: 1px solid #d8e1ee;
          border-bottom: 1px solid #d8e1ee;
          padding: 7px 5px;
          min-height: 24px;
          text-align: center;
        }

        .cell:last-child {
          border-right: 0;
        }

        .zeit-row:last-child .cell {
          border-bottom: 0;
        }

        .zeit.h {
          background: #f4f7fb;
          color: #344055;
          font-weight: 900;
        }

        .zeit.v {
          color: #172033;
          font-weight: 700;
        }

        .main {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          border: 1px solid #d8e1ee;
          border-radius: 9px;
          overflow: hidden;
          margin: 0 0 14px 0;
        }

        .main th {
          background: #f4f7fb;
          color: #172033;
          font-weight: 900;
          border-right: 1px solid #d8e1ee;
          border-bottom: 1px solid #d8e1ee;
          padding: 8px 7px;
          text-align: left;
        }

        .main th:last-child {
          border-right: 0;
        }

        .main td {
          border-right: 1px solid #edf2f7;
          border-bottom: 1px solid #edf2f7;
          padding: 8px 7px;
          min-height: 28px;
          vertical-align: top;
        }

        .main td:last-child {
          border-right: 0;
        }

        .main tr:last-child td {
          border-bottom: 0;
        }

        .tag {
          display: inline-block;
          background: #edf4ff;
          color: #143b5a;
          border: 1px solid #d6e8ff;
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 9px;
          font-weight: 800;
          margin: 0 4px 3px 0;
        }

        .desc {
          margin: 0 0 14px 0;
        }

        .desc-title,
        .box-title,
        .sign-title {
          background: #f4f7fb;
          color: #172033;
          font-weight: 900;
          padding: 8px 10px;
          border-bottom: 1px solid #d8e1ee;
        }

        .desc-body,
        .bem-text {
          min-height: 54px;
          padding: 10px;
          white-space: pre-wrap;
          color: #344055;
        }

        .bottom {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 12px;
          margin: 0 0 16px 0;
        }

        .foto-big {
          min-height: 210px;
        }

        .bemerk-small {
          min-height: 210px;
        }

        .photo {
          width: 100%;
          max-height: 235px;
          object-fit: contain;
          display: block;
          background: #f8fafc;
        }

        .ph-muted {
          height: 190px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8793a6;
          background: #f8fafc;
          font-weight: 700;
        }

        .sign {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
        }

        .sign-line {
          display: grid;
          grid-template-columns: 75px 1fr;
          gap: 10px;
          padding: 12px 10px;
          align-items: end;
        }

        .sign-line .line {
          display: block;
          border-bottom: 1px solid #9aa8ba;
          height: 14px;
          padding: 0;
        }

        .ls-info {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
          margin: 0 0 14px 0;
        }

        .ls-info > div {
          padding: 10px;
          border-right: 1px solid #edf2f7;
        }

        .ls-info > div:last-child {
          border-right: 0;
        }
        /* RLC_BUSINESS_PDF_POLISH_V2 */
        .doc-banner {
          border-left: 0 !important;
          background: transparent !important;
          color: #172033 !important;
          font-size: 26px !important;
          line-height: 1.05 !important;
          padding: 0 !important;
          margin: 14px 0 6px 0 !important;
          text-align: left !important;
        }

        .head {
          display: grid !important;
          grid-template-columns: 1fr 1.35fr 1.05fr !important;
          gap: 12px !important;
          border: 0 !important;
          margin: 14px 0 14px 0 !important;
        }

        .head-left,
        .head-mid,
        .head-right,
        .ls-info,
        .desc,
        .box,
        .sign-col,
        .zeit-grid,
        .main {
          border: 1px solid #dbe4ef !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          overflow: hidden !important;
          box-shadow: none !important;
        }

        .main {
          border-collapse: separate !important;
          border-spacing: 0 !important;
          width: 100% !important;
          margin-top: 10px !important;
        }

        .main th {
          background: #f5f8fc !important;
          color: #172033 !important;
          font-weight: 900 !important;
          border-right: 1px solid #dbe4ef !important;
          border-bottom: 1px solid #dbe4ef !important;
          padding: 8px 7px !important;
          font-size: 10px !important;
        }

        .main td {
          border-right: 1px solid #edf2f7 !important;
          border-bottom: 1px solid #edf2f7 !important;
          padding: 8px 7px !important;
          font-size: 10px !important;
          color: #263246 !important;
          min-height: 30px !important;
        }

        .main th:last-child,
        .main td:last-child {
          border-right: 0 !important;
        }

        .main tr:last-child td {
          border-bottom: 0 !important;
        }

        .zeit-grid {
          margin: 0 0 14px 0 !important;
        }

        .cell {
          border-right: 1px solid #dbe4ef !important;
          border-bottom: 1px solid #dbe4ef !important;
          padding: 7px 5px !important;
        }

        .zeit.h {
          background: #f5f8fc !important;
          color: #172033 !important;
          font-weight: 900 !important;
        }

        .zeit.v {
          color: #263246 !important;
          font-weight: 700 !important;
        }

        .type-row {
          border-bottom: 1px solid #edf2f7 !important;
          padding: 6px 0 !important;
        }

        .cb {
          border: 1px solid #aeb9c8 !important;
          border-radius: 5px !important;
          color: #172033 !important;
        }

        .desc-title,
        .box-title,
        .sign-title {
          background: #f5f8fc !important;
          color: #172033 !important;
          border-bottom: 1px solid #dbe4ef !important;
          font-weight: 900 !important;
          padding: 8px 10px !important;
        }

        .desc-body {
          min-height: 58px !important;
          padding: 10px !important;
          font-size: 10px !important;
        }

        .bottom {
          display: grid !important;
          grid-template-columns: 1.65fr 1fr !important;
          gap: 12px !important;
          margin-top: 12px !important;
        }

        .foto-big,
        .bemerk-small {
          min-height: 205px !important;
        }

        .photo {
          max-height: 220px !important;
          object-fit: contain !important;
          background: #f8fafc !important;
        }

        .ph-muted {
          height: 180px !important;
          background: #f8fafc !important;
          color: #8793a6 !important;
        }

        .sign {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 14px !important;
          margin-top: 14px !important;
        }

        .sign-line {
          padding: 11px 10px !important;
        }

        .sign-line .line {
          border-bottom: 1px solid #aeb9c8 !important;
        }

        .company-header {
          border-bottom: 1px solid #dbe4ef !important;
          margin-bottom: 18px !important;
          padding-bottom: 12px !important;
        }
        /* RLC_REGIE_PDF_BUSINESS_V3 */
        .regie-page .doc-banner.regie {
          font-size: 30px !important;
          font-weight: 900 !important;
          letter-spacing: -0.5px !important;
          margin-top: 8px !important;
          margin-bottom: 14px !important;
          color: #111827 !important;
        }

        .regie-page .doc-banner.regie::after {
          content: "Leistungsnachweis / Baustellendokumentation" !important;
          display: block !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          color: #6b7280 !important;
          margin-top: 4px !important;
          letter-spacing: 0 !important;
        }

        .regie-page .head {
          display: grid !important;
          grid-template-columns: 1.65fr 1fr !important;
          gap: 14px !important;
          margin: 0 0 14px 0 !important;
        }

        .regie-page .head-left {
          display: none !important;
        }

        .regie-page .head-mid,
        .regie-page .head-right {
          border: 1px solid #d8e1ee !important;
          border-radius: 12px !important;
          background: #ffffff !important;
          padding: 12px !important;
        }

        .regie-page .head-mid .line {
          display: grid !important;
          grid-template-columns: 120px 1fr !important;
          gap: 10px !important;
          padding: 7px 0 !important;
          border-bottom: 1px solid #eef2f7 !important;
        }

        .regie-page .head-mid .line:last-child {
          border-bottom: 0 !important;
        }

        .regie-page .lab {
          color: #6b7280 !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.25px !important;
        }

        .regie-page .val {
          color: #111827 !important;
          font-size: 11px !important;
          font-weight: 800 !important;
        }

        .regie-page .rf {
          display: grid !important;
          grid-template-columns: 85px 1fr !important;
          gap: 8px !important;
          padding: 7px 0 !important;
          border-bottom: 1px solid #eef2f7 !important;
        }

        .regie-page .rf:last-child {
          border-bottom: 0 !important;
        }

        .regie-page .rf .val {
          text-align: right !important;
          font-weight: 900 !important;
          color: #111827 !important;
        }

        .regie-page .zeit-grid {
          border-radius: 12px !important;
          margin-bottom: 14px !important;
        }

        .regie-page .cell {
          padding: 7px 5px !important;
          font-size: 10px !important;
        }

        .regie-page .zeit.h {
          background: #f3f6fb !important;
          font-weight: 900 !important;
        }

        .regie-page .main {
          border-radius: 12px !important;
          margin-top: 8px !important;
          margin-bottom: 14px !important;
        }

        .regie-page .main th {
          background: #f3f6fb !important;
          font-size: 9.5px !important;
          padding: 7px 6px !important;
          color: #111827 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.15px !important;
        }

        .regie-page .main td {
          font-size: 10px !important;
          padding: 7px 6px !important;
          min-height: 24px !important;
          color: #1f2937 !important;
        }

        .regie-page .kosten {
          width: 14% !important;
        }

        .regie-page .geraet {
          width: 18% !important;
        }

        .regie-page .mitarb {
          width: 16% !important;
        }

        .regie-page .std {
          width: 8% !important;
          text-align: center !important;
        }

        .regie-page .bes {
          width: 28% !important;
        }

        .regie-page .mat {
          width: 16% !important;
        }

        .regie-page .desc {
          border-radius: 12px !important;
          margin-bottom: 14px !important;
        }

        .regie-page .desc-title,
        .regie-page .box-title,
        .regie-page .sign-title {
          background: #f3f6fb !important;
          font-size: 10px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.2px !important;
        }

        .regie-page .desc-body {
          min-height: 48px !important;
          font-size: 10.5px !important;
          line-height: 1.45 !important;
        }

        .regie-page .bottom {
          display: grid !important;
          grid-template-columns: 1.8fr 1fr !important;
          gap: 14px !important;
          margin-top: 10px !important;
          margin-bottom: 14px !important;
        }

        .regie-page .foto-big,
        .regie-page .bemerk-small {
          border-radius: 12px !important;
          min-height: 190px !important;
        }

        .regie-page .photo {
          max-height: 210px !important;
          object-fit: contain !important;
          background: #f8fafc !important;
          padding: 4px !important;
          box-sizing: border-box !important;
        }

        .regie-page .ph-muted {
          height: 170px !important;
          background: #f8fafc !important;
          color: #94a3b8 !important;
          font-weight: 800 !important;
        }

        .regie-page .bem-text {
          min-height: 150px !important;
          font-size: 10.5px !important;
          line-height: 1.4 !important;
        }

        .regie-page .sign {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 14px !important;
          margin-top: 12px !important;
        }

        .regie-page .sign-col {
          border-radius: 12px !important;
        }

        .regie-page .sign-line {
          padding: 13px 10px !important;
        }

        .regie-page .sign-line .line {
          border-bottom: 1px solid #9ca3af !important;
        }
        /* RLC_LS_FOTOS_PDF_BUSINESS_V3 */
        .lieferschein-page .doc-banner.ls,
        .fotos-page .doc-banner.fotos {
          font-size: 30px !important;
          font-weight: 900 !important;
          letter-spacing: -0.5px !important;
          margin-top: 8px !important;
          margin-bottom: 14px !important;
          color: #111827 !important;
        }

        .lieferschein-page .doc-banner.ls::after {
          content: "Materialnachweis / Lieferung";
          display: block;
          font-size: 10px;
          font-weight: 800;
          color: #6b7280;
          margin-top: 4px;
          letter-spacing: 0;
        }

        .fotos-page .doc-banner.fotos::after {
          content: "Baustellendokumentation / Fotoprotokoll";
          display: block;
          font-size: 10px;
          font-weight: 800;
          color: #6b7280;
          margin-top: 4px;
          letter-spacing: 0;
        }

        .lieferschein-page .head,
        .fotos-page .head {
          display: grid !important;
          grid-template-columns: 1.65fr 1fr !important;
          gap: 14px !important;
          margin: 0 0 14px 0 !important;
        }

        .lieferschein-page .head-left,
        .fotos-page .head-left {
          display: none !important;
        }

        .lieferschein-page .head-mid,
        .lieferschein-page .head-right,
        .fotos-page .head-mid,
        .fotos-page .head-right,
        .lieferschein-page .ls-info,
        .fotos-page .desc,
        .lieferschein-page .desc,
        .fotos-page .box,
        .lieferschein-page .box,
        .fotos-page .sign-col,
        .lieferschein-page .sign-col {
          border: 1px solid #d8e1ee !important;
          border-radius: 12px !important;
          background: #ffffff !important;
          overflow: hidden !important;
        }

        .lieferschein-page .head-mid,
        .lieferschein-page .head-right,
        .fotos-page .head-mid,
        .fotos-page .head-right {
          padding: 12px !important;
        }

        .lieferschein-page .line,
        .fotos-page .line {
          display: grid !important;
          grid-template-columns: 120px 1fr !important;
          gap: 10px !important;
          padding: 7px 0 !important;
          border-bottom: 1px solid #eef2f7 !important;
        }

        .lieferschein-page .line:last-child,
        .fotos-page .line:last-child {
          border-bottom: 0 !important;
        }

        .lieferschein-page .lab,
        .fotos-page .lab {
          color: #6b7280 !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.25px !important;
        }

        .lieferschein-page .val,
        .fotos-page .val {
          color: #111827 !important;
          font-size: 11px !important;
          font-weight: 800 !important;
        }

        .lieferschein-page .rf,
        .fotos-page .rf {
          display: grid !important;
          grid-template-columns: 95px 1fr !important;
          gap: 8px !important;
          padding: 7px 0 !important;
          border-bottom: 1px solid #eef2f7 !important;
        }

        .lieferschein-page .rf:last-child,
        .fotos-page .rf:last-child {
          border-bottom: 0 !important;
        }

        .lieferschein-page .rf .val,
        .fotos-page .rf .val {
          text-align: right !important;
          font-weight: 900 !important;
          color: #111827 !important;
        }

        .lieferschein-page .ls-info {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          margin: 0 0 14px 0 !important;
        }

        .lieferschein-page .ls-info > div {
          padding: 11px !important;
          border-right: 1px solid #edf2f7 !important;
          font-size: 10.5px !important;
          color: #1f2937 !important;
        }

        .lieferschein-page .ls-info > div:last-child {
          border-right: 0 !important;
        }

        .lieferschein-page .main,
        .fotos-page .main {
          border-radius: 12px !important;
          margin-top: 8px !important;
          margin-bottom: 14px !important;
        }

        .lieferschein-page .main th,
        .fotos-page .main th {
          background: #f3f6fb !important;
          font-size: 9.5px !important;
          padding: 7px 6px !important;
          color: #111827 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.15px !important;
        }

        .lieferschein-page .main td,
        .fotos-page .main td {
          font-size: 10px !important;
          padding: 7px 6px !important;
          min-height: 24px !important;
          color: #1f2937 !important;
        }

        .lieferschein-page .desc,
        .fotos-page .desc {
          border-radius: 12px !important;
          margin-bottom: 14px !important;
        }

        .lieferschein-page .desc-title,
        .lieferschein-page .box-title,
        .lieferschein-page .sign-title,
        .fotos-page .desc-title,
        .fotos-page .box-title,
        .fotos-page .sign-title {
          background: #f3f6fb !important;
          font-size: 10px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.2px !important;
          color: #111827 !important;
          font-weight: 900 !important;
        }

        .lieferschein-page .desc-body,
        .fotos-page .desc-body {
          min-height: 52px !important;
          font-size: 10.5px !important;
          line-height: 1.45 !important;
        }

        .lieferschein-page .bottom,
        .fotos-page .bottom {
          display: grid !important;
          grid-template-columns: 1.8fr 1fr !important;
          gap: 14px !important;
          margin-top: 10px !important;
          margin-bottom: 14px !important;
        }

        .lieferschein-page .foto-big,
        .lieferschein-page .bemerk-small,
        .fotos-page .foto-big,
        .fotos-page .bemerk-small {
          border-radius: 12px !important;
          min-height: 190px !important;
        }

        .lieferschein-page .photo,
        .fotos-page .photo {
          max-height: 210px !important;
          object-fit: contain !important;
          background: #f8fafc !important;
          padding: 4px !important;
          box-sizing: border-box !important;
        }

        .lieferschein-page .ph-muted,
        .fotos-page .ph-muted {
          height: 170px !important;
          background: #f8fafc !important;
          color: #94a3b8 !important;
          font-weight: 800 !important;
        }

        .lieferschein-page .bem-text,
        .fotos-page .bem-text {
          min-height: 150px !important;
          font-size: 10.5px !important;
          line-height: 1.4 !important;
        }

        .lieferschein-page .sign,
        .fotos-page .sign {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 14px !important;
          margin-top: 12px !important;
        }

        .lieferschein-page .sign-col,
        .fotos-page .sign-col {
          border-radius: 12px !important;
        }

        .lieferschein-page .sign-line,
        .fotos-page .sign-line {
          padding: 13px 10px !important;
        }

        .lieferschein-page .sign-line .line,
        .fotos-page .sign-line .line {
          border-bottom: 1px solid #9ca3af !important;
        }

        .fotos-page .main .bes {
          width: 42% !important;
        }

        .fotos-page .main .geraet {
          width: 16% !important;
        }

        .fotos-page .main .kosten {
          width: 16% !important;
        }

        .lieferschein-page .main .bes {
          width: 34% !important;
        }
        /* RLC_PDF_FIX_HIDE_OLD_LEFT_BLOCK_V4 */
        .doc-banner.regie + .head,
        .doc-banner.ls + .head,
        .doc-banner.fotos + .head {
          display: grid !important;
          grid-template-columns: 1.65fr 1fr !important;
          gap: 14px !important;
        }

        .doc-banner.regie + .head .head-left,
        .doc-banner.ls + .head .head-left,
        .doc-banner.fotos + .head .head-left {
          display: none !important;
        }

        .doc-banner.regie + .head .head-mid,
        .doc-banner.ls + .head .head-mid,
        .doc-banner.fotos + .head .head-mid {
          min-height: 58px !important;
        }

        .doc-banner.regie + .head .head-right,
        .doc-banner.ls + .head .head-right,
        .doc-banner.fotos + .head .head-right {
          min-height: 58px !important;
        }

        .main tr.empty-row td {
          color: transparent !important;
          height: 22px !important;
          padding: 5px 6px !important;
        }

        .sign {
          page-break-inside: avoid !important;
        }

        .bottom {
          page-break-inside: avoid !important;
        }
        /* RLC_LS_FOTOS_FINAL_POLISH_V4 */
        .lieferschein-page .head-left,
        .fotos-page .head-left {
          display: none !important;
        }

        .lieferschein-page .head,
        .fotos-page .head {
          grid-template-columns: 1.65fr 1fr !important;
        }

        .lieferschein-page .main tr.empty-row td,
        .fotos-page .main tr.empty-row td {
          color: transparent !important;
          height: 22px !important;
          padding: 5px 6px !important;
        }

        .lieferschein-page .main td,
        .fotos-page .main td {
          vertical-align: top !important;
        }

        .lieferschein-page .bottom,
        .fotos-page .bottom {
          page-break-inside: avoid !important;
        }

        .lieferschein-page .sign,
        .fotos-page .sign {
          page-break-inside: avoid !important;
        }

        .fotos-page .foto-big {
          min-height: 230px !important;
        }

        .fotos-page .photo {
          max-height: 250px !important;
        }

        .lieferschein-page .ls-info {
          border-radius: 12px !important;
          overflow: hidden !important;
        }
      </style>
    </head>
    <body>
      ${content}
    </body>
  </html>
  `;
}

function regieReportHtml(params: {
  projectTitle: string;
  projectFsKey: string;
  date: string;
  header: RegieHeader;
  lines: RegieLine[];
  firstPhotoDataUrl?: string | null;
  descriptionText?: string;
  companyHeaderHtml?: string;
}) {
  const { projectTitle, projectFsKey, date, header, lines, firstPhotoDataUrl } = params;
  const reportType = (header.reportType || "REGIE") as any;
  const descText = text(params.descriptionText || "");
  const companyHeaderHtml = params.companyHeaderHtml || "";

  const chunkSize = 6;
  const totalPages = Math.max(1, Math.ceil(lines.length / chunkSize));
  const chunks: RegieLine[][] = [];
  for (let i = 0; i < totalPages; i++) {
    chunks.push(lines.slice(i * chunkSize, (i + 1) * chunkSize));
  }

  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const pageHtml = chunks
    .map((pageLines, idx) => {
      const isLast = idx === chunks.length - 1;

      const zeitValues = {
        arbeitsbeginn: header.arbeitsbeginn || "",
        pause1: header.pause1 || "",
        pause2: header.pause2 || "",
        arbeitsende: header.arbeitsende || "",
        blattNr: header.blattNr || "",
        wetter: header.wetter || "",
      };

      const filled = [...pageLines];
      while (filled.length < 6) filled.push({});

      const rowsHtml = filled
        .map((r) => {
          const hasLineData = [
            r.kostenstelle,
            r.machine,
            r.worker,
            r.hours,
            r.comment,
            r.material,
            r.quantity,
            r.unit,
          ].some((v) => String(v ?? "").trim().length > 0) ||
            (Array.isArray((r as any)?.photos) && (r as any).photos.length > 0);

          const hoursStr = hasLineData && r.hours != null && String(r.hours) !== "0" ? num(r.hours) : "";
          const qtyStr =
            hasLineData && r.quantity != null && String(r.quantity) !== "0"
              ? `${num(r.quantity)} ${text(r.unit || "")}`.trim()
              : "";
          const materialStr = hasLineData ? [text(r.material || ""), qtyStr].filter(Boolean).join(" – ") : "";

          const attCount = Array.isArray((r as any)?.photos) ? (r as any).photos.length : 0;
          const badges: string[] = [];
          if (hasLineData && attCount > 0) badges.push(`<span class="tag">Anhänge: ${attCount}</span>`);
          const badgeHtml = badges.length ? `<div class="badges">${badges.join("")}</div>` : "";
          const besondereStr = hasLineData ? `${badgeHtml}${escapeHtml(text(r.comment || ""))}` : "";

          return `
            <tr class="${hasLineData ? "" : "empty-row"}">
              <td class="c kosten">${escapeHtml(hasLineData ? text(r.kostenstelle || header.kostenstelle || "") : "")}</td>
              <td class="c geraet">${escapeHtml(hasLineData ? text(r.machine || "") : "")}</td>
              <td class="c mitarb">${escapeHtml(hasLineData ? text(r.worker || "") : "")}</td>
              <td class="c std">${escapeHtml(hoursStr)}</td>
              <td class="c bes">${besondereStr}</td>
              <td class="c mat">${escapeHtml(hasLineData ? materialStr : "")}</td>
            </tr>
          `;
        })
        .join("");

      const photoBox = firstPhotoDataUrl
        ? `<img class="photo" src="${firstPhotoDataUrl}" />`
        : `<div class="ph-muted">Kein Foto vorhanden</div>`;

      return `
        <div class="page">
          ${companyHeaderHtml}
          <div class="doc-banner regie">REGIEBERICHT</div>

          <div class="head">
            <div class="head-left">
              ${renderTypeRow("Tagesbericht", "TAGESBERICHT", reportType)}
              ${renderTypeRow("Bautagebuch", "BAUTAGEBUCH", reportType)}
              ${renderTypeRow("Regiebericht", "REGIE", reportType)}
            </div>

            <div class="head-mid">
              <div class="line">
                <div class="lab">Baustelle:</div>
                <div class="val">${escapeHtml(projectTitle || projectFsKey || "-")}</div>
              </div>
              <div class="line">
                <div class="lab">Auftraggeber/Anschrift:</div>
                <div class="val">${escapeHtml(text(header.auftraggeber || ""))}</div>
              </div>
            </div>

            <div class="head-right">
              ${renderRightField("Bau-Nr.", projectFsKey || "")}
              ${renderRightField("Regie-Nr.", header.regieNummer || "")}
              ${renderRightField("Datum", (header.date || date || "").slice(0, 10))}
            </div>
          </div>

          <div class="days">
            <div class="row days-row">
              ${days.map((d) => `<div class="cell day">${d}</div>`).join("")}
            </div>

            <div class="row zeit-lab">
              ${["Arbeitsbeginn", "Pause 1", "Pause 2", "Arbeitsende", "Blatt Nr.", "Wetter"]
                .map((t) => `<div class="cell zeit">${t}</div>`)
                .join("")}
            </div>

            <div class="row zeit-val">
              ${[
                zeitValues.arbeitsbeginn,
                zeitValues.pause1,
                zeitValues.pause2,
                zeitValues.arbeitsende,
                zeitValues.blattNr,
                zeitValues.wetter,
              ]
                .map((v) => `<div class="cell zeit v">${escapeHtml(text(v || ""))}</div>`)
                .join("")}
            </div>
          </div>

          <table class="main">
            <thead>
              <tr>
                <th class="kosten">Kostenstelle</th>
                <th class="geraet">Bezeichnung der Geräte</th>
                <th class="mitarb">Mitarbeiter</th>
                <th class="std">Std.</th>
                <th class="bes">Besondere Leistungen</th>
                <th class="mat">Material</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="desc">
            <div class="desc-title">Beschreibung der Arbeit, besondere Vorkommnisse, Anordnungen</div>
            <div class="desc-body">${escapeHtml([
          descText,
          (header as any).ortAbschnitt || (header as any).location || (header as any).ort ? `Ort / Abschnitt: ${(header as any).ortAbschnitt || (header as any).location || (header as any).ort}` : "",
          (header as any).kategorie || (header as any).category ? `Kategorie: ${(header as any).kategorie || (header as any).category}` : "",
          (header as any).gewerk || (header as any).trade ? `Gewerk: ${(header as any).gewerk || (header as any).trade}` : "",
          (header as any).fotoStatus || (header as any).statusFoto ? `Status: ${(header as any).fotoStatus || (header as any).statusFoto}` : "",
          (header as any).tags ? `Tags: ${Array.isArray((header as any).tags) ? (header as any).tags.join(", ") : (header as any).tags}` : "",
        ].filter(Boolean).join("\n"))}</div>
          </div>

          <div class="bottom">
            <div class="box foto-big">
              <div class="box-title">Fotodokumentation</div>
              ${photoBox}
            </div>
            <div class="box bemerk-small">
              <div class="box-title">Bemerkungen</div>
              <div class="bem-text">${escapeHtml(text(header.bemerkungen || ""))}</div>
            </div>
          </div>

          <div class="sign">
            <div class="sign-col">
              <div class="sign-title">Geprüft</div>
              <div class="sign-line"><span class="lab">Bauleiter</span><span class="line"></span></div>
              <div class="sign-line"><span class="lab">Bauherr</span><span class="line"></span></div>
            </div>
            <div class="sign-col">
              <div class="sign-title">Aufgestellt</div>
              <div class="sign-line"><span class="lab">Polier</span><span class="line"></span></div>
              <div class="sign-line"><span class="lab">Bauführer</span><span class="line"></span></div>
            </div>
          </div>
        </div>
        ${isLast ? "" : `<div class="page-break"></div>`}
      `;
    })
    .join("");

  return buildPdfShell(pageHtml);
}

function lieferscheinReportHtml(params: {
  projectTitle: string;
  projectFsKey: string;
  date: string;
  header: RegieHeader;
  lines: RegieLine[];
  firstPhotoDataUrl?: string | null;
  descriptionText?: string;
  companyHeaderHtml?: string;
}) {
  const { projectTitle, projectFsKey, date, header, lines, firstPhotoDataUrl } = params;
  const descText = text(params.descriptionText || "");
  const companyHeaderHtml = params.companyHeaderHtml || "";

  const row = (lines && lines[0]) || {};
  const supplierText = text(header.auftraggeber || "");
  const materialText = text(row.machine || "");
  const driverText = text(row.worker || "");
  const qtyText = text(row.material || "");
  const costCenter = text(row.kostenstelle || header.kostenstelle || "");

  const photoBox = firstPhotoDataUrl
    ? `<img class="photo" src="${firstPhotoDataUrl}" />`
    : `<div class="ph-muted">Kein Foto vorhanden</div>`;

  const content = `
    <div class="page">
      ${companyHeaderHtml}
      <div class="doc-banner ls">LIEFERSCHEIN</div>

      <div class="head">
        <div class="head-left">
          <div class="left-title">Lieferschein</div>
        </div>

        <div class="head-mid">
          <div class="line">
            <div class="lab">Baustelle:</div>
            <div class="val">${escapeHtml(projectTitle || projectFsKey || "-")}</div>
          </div>
          <div class="line">
            <div class="lab">Lieferant:</div>
            <div class="val">${escapeHtml(supplierText)}</div>
          </div>
        </div>

        <div class="head-right">
          ${renderRightField("Bau-Nr.", projectFsKey || "")}
          ${renderRightField("Lieferscheinnummer", header.regieNummer || "")}
          ${renderRightField("Datum", (header.date || date || "").slice(0, 10))}
        </div>
      </div>

      <div class="ls-info">
        <div><b>Lieferant:</b> ${escapeHtml(supplierText || "-")}</div>
        <div><b>Baustelle:</b> ${escapeHtml(projectTitle || "-")}</div>
        <div><b>Kostenstelle:</b> ${escapeHtml(costCenter || "-")}</div>
      </div>

      <table class="main">
        <thead>
          <tr>
            <th class="kosten">Kostenstelle</th>
            <th class="geraet">Material</th>
            <th class="mitarb">Fahrer</th>
            <th class="std">Zeit</th>
            <th class="bes">Lieferdetails</th>
            <th class="mat">Menge</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="kosten">${escapeHtml(costCenter)}</td>
            <td class="geraet">${escapeHtml(materialText)}</td>
            <td class="mitarb">${escapeHtml(driverText)}</td>
            <td class="std">${escapeHtml(
              [text(header.arbeitsbeginn || ""), text(header.arbeitsende || "")]
                .filter(Boolean)
                .join(" - ")
            )}</td>
            <td class="bes">${escapeHtml(text(row.comment || descText || ""))}</td>
            <td class="mat">${escapeHtml(qtyText)}</td>
          </tr>
        </tbody>
      </table>

      <div class="desc">
        <div class="desc-title">Zusätzliche Angaben</div>
        <div class="desc-body">${escapeHtml([
          descText,
          (header as any).ortAbschnitt || (header as any).location || (header as any).ort ? `Ort / Abschnitt: ${(header as any).ortAbschnitt || (header as any).location || (header as any).ort}` : "",
          (header as any).kategorie || (header as any).category ? `Kategorie: ${(header as any).kategorie || (header as any).category}` : "",
          (header as any).gewerk || (header as any).trade ? `Gewerk: ${(header as any).gewerk || (header as any).trade}` : "",
          (header as any).fotoStatus || (header as any).statusFoto ? `Status: ${(header as any).fotoStatus || (header as any).statusFoto}` : "",
          (header as any).tags ? `Tags: ${Array.isArray((header as any).tags) ? (header as any).tags.join(", ") : (header as any).tags}` : "",
        ].filter(Boolean).join("\n"))}</div>
      </div>

      <div class="bottom">
        <div class="box foto-big">
          <div class="box-title">Foto / Beleg</div>
          ${photoBox}
        </div>
        <div class="box bemerk-small">
          <div class="box-title">Bemerkungen</div>
          <div class="bem-text">${escapeHtml(text(header.bemerkungen || ""))}</div>
        </div>
      </div>

      <div class="sign">
        <div class="sign-col">
          <div class="sign-title">Bestätigt</div>
          <div class="sign-line"><span class="lab">Empfänger</span><span class="line"></span></div>
          <div class="sign-line"><span class="lab">Bauleiter</span><span class="line"></span></div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Lieferung</div>
          <div class="sign-line"><span class="lab">Fahrer</span><span class="line"></span></div>
          <div class="sign-line"><span class="lab">Firma</span><span class="line"></span></div>
        </div>
      </div>
    </div>
  `;

  return buildPdfShell(content);
}

function photosReportHtml(params: {
  projectTitle: string;
  projectFsKey: string;
  date: string;
  header: RegieHeader;
  lines: RegieLine[];
  firstPhotoDataUrl?: string | null;
  descriptionText?: string;
  companyHeaderHtml?: string;
}) {
  const { projectTitle, projectFsKey, date, header, lines, firstPhotoDataUrl } = params;
  const descText = text(params.descriptionText || "");
  const companyHeaderHtml = params.companyHeaderHtml || "";

  const photoBox = firstPhotoDataUrl
    ? `<img class="photo" src="${firstPhotoDataUrl}" />`
    : `<div class="ph-muted">Kein Foto vorhanden</div>`;

  const rowsHtml = (lines || [])
    .slice(0, 8)
    .map((r) => {
      const machineLower = text(r.machine || "").toLowerCase();
      const isFoto = machineLower === "foto";
      const isExtra = machineLower === "extra";
      const isKiBox = isFoto && /\(\s*\d{1,3}%\s*\)/.test(text(r.comment || ""));
      const isLv =
        /^lv\s*\d+/i.test(text(r.machine || "")) ||
        /^lv\s*\d+/i.test(text(r.comment || ""));

      const attCount = Array.isArray((r as any)?.photos) ? (r as any).photos.length : 0;
      const badges: string[] = [];
      if (isKiBox) badges.push(`<span class="tag">KI</span>`);
      if (isExtra) badges.push(`<span class="tag">EXTRA</span>`);
      if (isFoto) badges.push(`<span class="tag">FOTO</span>`);
      if (isLv) badges.push(`<span class="tag">LV</span>`);
      if (attCount > 0) badges.push(`<span class="tag">Anhänge: ${attCount}</span>`);

      return `
        <tr>
          <td class="kosten">${escapeHtml(text(r.kostenstelle || ""))}</td>
          <td class="geraet">${escapeHtml(text(r.machine || ""))}</td>
          <td class="mitarb">${escapeHtml(text(r.worker || ""))}</td>
          <td class="std"></td>
          <td class="bes">${badges.length ? `<div class="badges">${badges.join("")}</div>` : ""}${escapeHtml(text(r.comment || ""))}</td>
          <td class="mat">${escapeHtml(text(r.material || ""))}</td>
        </tr>
      `;
    })
    .join("");

  const content = `
    <div class="page">
      ${companyHeaderHtml}
      <div class="doc-banner fotos">FOTODOKUMENTATION</div>

      <div class="head">
        <div class="head-left">
          <div class="left-title">Fotos</div>
        </div>

        <div class="head-mid">
          <div class="line">
            <div class="lab">Baustelle:</div>
            <div class="val">${escapeHtml(projectTitle || projectFsKey || "-")}</div>
          </div>
          <div class="line">
            <div class="lab">Referenz:</div>
            <div class="val">${escapeHtml(text(header.regieNummer || ""))}</div>
          </div>
        </div>

        <div class="head-right">
          ${renderRightField("Bau-Nr.", projectFsKey || "")}
          ${renderRightField("Fotonummer", header.regieNummer || "")}
          ${renderRightField("Datum", (header.date || date || "").slice(0, 10))}
        </div>
      </div>

      <table class="main">
        <thead>
          <tr>
            <th class="kosten">Kostenstelle</th>
            <th class="geraet">Foto / Typ</th>
            <th class="mitarb">Mitarbeiter</th>
            <th class="std">Std.</th>
            <th class="bes">Hinweise / KI</th>
            <th class="mat">Material</th>
          </tr>
        </thead>
        <tbody>
          ${
            rowsHtml ||
            `
            <tr>
              <td class="kosten">${escapeHtml(text(header.kostenstelle || ""))}</td>
              <td class="geraet">Foto</td>
              <td class="mitarb"></td>
              <td class="std"></td>
              <td class="bes">${escapeHtml([
                descText,
                (header as any).ortAbschnitt || (header as any).location || (header as any).ort ? `Ort: ${(header as any).ortAbschnitt || (header as any).location || (header as any).ort}` : "",
                (header as any).kategorie || (header as any).category ? `Kategorie: ${(header as any).kategorie || (header as any).category}` : "",
                (header as any).gewerk || (header as any).trade ? `Gewerk: ${(header as any).gewerk || (header as any).trade}` : "",
                (header as any).fotoStatus || (header as any).statusFoto ? `Status: ${(header as any).fotoStatus || (header as any).statusFoto}` : "",
                (header as any).tags ? `Tags: ${Array.isArray((header as any).tags) ? (header as any).tags.join(", ") : (header as any).tags}` : "",
              ].filter(Boolean).join(" | "))}</td>
              <td class="mat"></td>
            </tr>
          `
          }
        </tbody>
      </table>

      <div class="desc">
        <div class="desc-title">Beschreibung / Notiz</div>
        <div class="desc-body">${escapeHtml([
          descText,
          (header as any).ortAbschnitt || (header as any).location || (header as any).ort ? `Ort / Abschnitt: ${(header as any).ortAbschnitt || (header as any).location || (header as any).ort}` : "",
          (header as any).kategorie || (header as any).category ? `Kategorie: ${(header as any).kategorie || (header as any).category}` : "",
          (header as any).gewerk || (header as any).trade ? `Gewerk: ${(header as any).gewerk || (header as any).trade}` : "",
          (header as any).fotoStatus || (header as any).statusFoto ? `Status: ${(header as any).fotoStatus || (header as any).statusFoto}` : "",
          (header as any).tags ? `Tags: ${Array.isArray((header as any).tags) ? (header as any).tags.join(", ") : (header as any).tags}` : "",
        ].filter(Boolean).join("\n"))}</div>
      </div>

      <div class="bottom">
        <div class="box foto-big">
          <div class="box-title">Fotodokumentation</div>
          ${photoBox}
        </div>
        <div class="box bemerk-small">
          <div class="box-title">Bemerkungen</div>
          <div class="bem-text">${escapeHtml(text(header.bemerkungen || ""))}</div>
        </div>
      </div>

      <div class="sign">
        <div class="sign-col">
          <div class="sign-title">Geprüft</div>
          <div class="sign-line"><span class="lab">Bauleiter</span><span class="line"></span></div>
          <div class="sign-line"><span class="lab">Projekt</span><span class="line"></span></div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Erfasst</div>
          <div class="sign-line"><span class="lab">Mitarbeiter</span><span class="line"></span></div>
          <div class="sign-line"><span class="lab">Datum</span><span class="line"></span></div>
        </div>
      </div>
    </div>
  `;

  return buildPdfShell(content);
}

function tagesberichtReportHtml(params: {
  projectTitle: string;
  projectFsKey: string;
  date: string;
  header: RegieHeader;
  lines: RegieLine[];
  firstPhotoDataUrl?: string | null;
  descriptionText?: string;
  companyHeaderHtml?: string;
}) {
  const { projectTitle, projectFsKey, date, header, lines, firstPhotoDataUrl } = params;
  const descText = text(params.descriptionText || "");
  const companyHeaderHtml = params.companyHeaderHtml || "";

  const filled = [...(lines || [])];
  while (filled.length < 8) filled.push({});

  const rowsHtml = filled
    .slice(0, 8)
    .map((r) => {
      const hoursStr = r.hours != null && String(r.hours) !== "0" ? num(r.hours) : "";
      return `
        <tr>
          <td class="kosten">${escapeHtml(text(r.kostenstelle || header.kostenstelle || ""))}</td>
          <td class="geraet">${escapeHtml(text(r.machine || ""))}</td>
          <td class="mitarb">${escapeHtml(text(r.worker || ""))}</td>
          <td class="std">${escapeHtml(hoursStr)}</td>
          <td class="bes">${escapeHtml(text(r.comment || ""))}</td>
          <td class="mat">${escapeHtml(text(r.material || ""))}</td>
        </tr>
      `;
    })
    .join("");

  const photoBox = firstPhotoDataUrl
    ? `<img class="photo" src="${firstPhotoDataUrl}" />`
    : `<div class="ph-muted">Kein Foto vorhanden</div>`;

  const content = `
    <div class="page">
      ${companyHeaderHtml}
      <div class="doc-banner regie">TAGESBERICHT</div>

      <div class="head">
        <div class="head-left">
          ${renderTypeRow("Tagesbericht", "TAGESBERICHT", "TAGESBERICHT")}
          ${renderTypeRow("Bautagebuch", "BAUTAGEBUCH", "TAGESBERICHT")}
          ${renderTypeRow("Regiebericht", "REGIE", "TAGESBERICHT")}
        </div>

        <div class="head-mid">
          <div class="line">
            <div class="lab">Baustelle:</div>
            <div class="val">${escapeHtml(projectTitle || projectFsKey || "-")}</div>
          </div>
          <div class="line">
            <div class="lab">Wetter:</div>
            <div class="val">${escapeHtml(text(header.wetter || ""))}</div>
          </div>
        </div>

        <div class="head-right">
          ${renderRightField("Bau-Nr.", projectFsKey || "")}
          ${renderRightField("Bericht-Nr.", header.regieNummer || "")}
          ${renderRightField("Datum", (header.date || date || "").slice(0, 10))}
        </div>
      </div>

      <div class="days">
        <div class="row zeit-lab">
          ${["Arbeitsbeginn", "Pause", "Arbeitsende", "Wetter", "Blatt Nr.", "Status"]
            .map((t) => `<div class="cell zeit">${t}</div>`)
            .join("")}
        </div>

        <div class="row zeit-val">
          ${[
            header.arbeitsbeginn || "",
            header.pause1 || "",
            header.arbeitsende || "",
            header.wetter || "",
            header.blattNr || "",
            "Tagesbericht",
          ]
            .map((v) => `<div class="cell zeit v">${escapeHtml(text(v || ""))}</div>`)
            .join("")}
        </div>
      </div>

      <table class="main">
        <thead>
          <tr>
            <th class="kosten">Ort / Bereich</th>
            <th class="geraet">Maschine</th>
            <th class="mitarb">Mitarbeiter</th>
            <th class="std">Std.</th>
            <th class="bes">Tätigkeit / Notiz</th>
            <th class="mat">Material</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="desc">
        <div class="desc-title">Besondere Vorkommnisse / Tagesnotiz</div>
        <div class="desc-body">${escapeHtml([
          descText,
          (header as any).ortAbschnitt || (header as any).location || (header as any).ort ? `Ort / Abschnitt: ${(header as any).ortAbschnitt || (header as any).location || (header as any).ort}` : "",
          (header as any).kategorie || (header as any).category ? `Kategorie: ${(header as any).kategorie || (header as any).category}` : "",
          (header as any).gewerk || (header as any).trade ? `Gewerk: ${(header as any).gewerk || (header as any).trade}` : "",
          (header as any).fotoStatus || (header as any).statusFoto ? `Status: ${(header as any).fotoStatus || (header as any).statusFoto}` : "",
          (header as any).tags ? `Tags: ${Array.isArray((header as any).tags) ? (header as any).tags.join(", ") : (header as any).tags}` : "",
        ].filter(Boolean).join("\n"))}</div>
      </div>

      <div class="bottom">
        <div class="box foto-big">
          <div class="box-title">Fotodokumentation</div>
          ${photoBox}
        </div>
        <div class="box bemerk-small">
          <div class="box-title">Bemerkungen</div>
          <div class="bem-text">${escapeHtml(text(header.bemerkungen || ""))}</div>
        </div>
      </div>

      <div class="sign">
        <div class="sign-col">
          <div class="sign-title">Geprüft</div>
          <div class="sign-line"><span class="lab">Bauleiter</span><span class="line"></span></div>
          <div class="sign-line"><span class="lab">Auftraggeber</span><span class="line"></span></div>
        </div>
        <div class="sign-col">
          <div class="sign-title">Erstellt</div>
          <div class="sign-line"><span class="lab">Vorarbeiter</span><span class="line"></span></div>
          <div class="sign-line"><span class="lab">Datum</span><span class="line"></span></div>
        </div>
      </div>
    </div>
  `;

  return buildPdfShell(content);
}
/* ============================================================
 * PRINT / SAVE / EMAIL / OPEN
 * ============================================================ */

async function uploadProjectPdfToServer(params: {
  projectFsKey: string;
  kindFolder: "regie" | "lieferscheine" | "photos" | "tagesberichte";
  fileName: string;
  fileUri: string;
}): Promise<any> {
  if (Platform.OS === "web") return null;

  const fileUri = String(params.fileUri || "").trim();
  if (!fileUri.startsWith("file://")) return null;

  const base = await getApiBaseUrlFromStorage();
  const token = await getAuthToken();
  if (!base || !token) return null;

  const fd = new FormData();
  fd.append("kindFolder", params.kindFolder);

  // @ts-ignore RN file upload
  fd.append("file", {
    uri: fileUri,
    name: safeFileName(params.fileName),
    type: "application/pdf",
  });

  const res = await fetch(
    `${base}/api/projects/${encodeURIComponent(params.projectFsKey)}/pdfs/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: fd,
    }
  );

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

async function printToPdf(html: string): Promise<{ uri: string }> {
  const out = await Print.printToFileAsync({ html, base64: false });
  return out;
}

async function savePdfToProjectFolder(params: {
  projectFsKey: string;
  kindFolder: "regie" | "lieferscheine" | "photos" | "tagesberichte";
  fileName: string;
  sourceUri: string;
}): Promise<string> {
  const base = getBaseDirOrNull();
  if (!base) return params.sourceUri;

  const projDir = `${base}projects/${params.projectFsKey}/${params.kindFolder}/`;
  await ensureDir(projDir);

  const target = `${projDir}${safeFileName(params.fileName)}`;

  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      try {
        await FileSystem.deleteAsync(target, { idempotent: true });
      } catch {}
    }

    await FileSystem.copyAsync({ from: params.sourceUri, to: target });
    return target;
  } catch (e) {
    console.log(
      "[PDFDBG] savePdfToProjectFolder copy FAILED -> fallback:",
      String((e as any)?.message || e)
    );
    return params.sourceUri;
  }
}

export async function emailPdf(input: EmailPdfInput) {
  try {
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      Alert.alert("Mail nicht verfügbar", "Auf diesem Gerät ist kein Mail-Client verfügbar.");
      return;
    }

    const atts = (input.attachments || [])
      .filter(Boolean)
      .map((u) => String(u))
      .filter((u) => u.startsWith("file://"));

    await MailComposer.composeAsync({
      subject: input.subject,
      body: input.body || "",
      recipients: input.to,
      ccRecipients: input.cc,
      bccRecipients: input.bcc,
      attachments: atts,
      isHtml: false,
    });
  } catch (e: any) {
    Alert.alert("E-Mail Fehler", String(e?.message || e));
  }
}

async function makeFreshPdfCopyForOpen(uri: string): Promise<string> {
  if (!uri || Platform.OS === "web") return uri;
  if (!isFileUri(uri)) return uri;

  try {
    const base = (FileSystem.cacheDirectory || FileSystem.documentDirectory) ?? null;
    if (!base) return uri;

    const baseNorm = normDir(base);
    await ensureDir(`${baseNorm}pdf-open/`);

    const fresh = `${baseNorm}pdf-open/open_${Date.now()}_${Math.floor(
      Math.random() * 1e9
    )}.pdf`;

    try {
      const info = await FileSystem.getInfoAsync(fresh);
      if (info.exists) {
        await FileSystem.deleteAsync(fresh, { idempotent: true });
      }
    } catch {}

    await FileSystem.copyAsync({ from: uri, to: fresh });
    return fresh.startsWith("file://") ? fresh : `file://${fresh}`;
  } catch (e: any) {
    console.log("[PDFDBG] makeFreshPdfCopyForOpen failed:", String(e?.message || e));
    return uri;
  }
}

async function openPdf(uri: string) {
  try {
    if (!uri) return;
    const freshUri = await makeFreshPdfCopyForOpen(uri);
    await Linking.openURL(freshUri);
  } catch (e) {
    console.log("[PDFDBG] openPdf failed:", String((e as any)?.message || e));
  }
}

/* ============================================================
 * UNIFIED EXPORT CORE
 * ============================================================ */

function buildDescriptionText(
  _docKind: DocKind,
  rowAny: any,
  header: RegieHeader,
  lines: RegieLine[]
) {
  const row = unwrapRowMaybeQueue(rowAny);

   const direct =
    text(
      row?.leistung ||
        row?.leistungBeschreibung ||
        row?.beschreibung ||
        row?.text ||
        row?.issues ||
        row?.note ||
        row?.notes ||
        ""
    ) || text(header?.bemerkungen || "");

  if (direct) return direct;

  const joined = (lines || [])
    .map((l) => text(l?.comment || "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");

  return joined;
}

async function exportUnifiedRegieModelPdf(params: {
  projectFsKey: string;
  projectTitle?: string;
  filenameHint?: string;
  rowAny: any;
  docKind: DocKind;
}): Promise<ExportResult> {
  const { projectFsKey, projectTitle, filenameHint, rowAny, docKind } = params;

  const unwrapped = unwrapRowMaybeQueue(rowAny);
  const date = guessDateFromRow(unwrapped);
  const timePart = toHMS(new Date());

  let header: RegieHeader;
  let lines: RegieLine[];

    if (docKind === "REGIE") {
    header = pickHeader(rowAny);
    lines = normalizeRegieLines(rowAny);
  } else if (docKind === "LIEFERSCHEIN") {
    header = buildHeaderForLieferschein(rowAny, date);
    lines = synthLinesForLieferschein(rowAny);
  } else if (docKind === "TAGESBERICHT") {
    header = buildHeaderForTagesbericht(rowAny, date);
    lines = normalizeRegieLines(rowAny);
  } else {
    header = buildHeaderForPhotos(rowAny, date);
    lines = synthLinesForPhotos(rowAny);
  }

  const firstPhotoDataUrl = await firstPhotoDataUrlFromRowOrLines({ rowAny, lines });
  const descriptionText = buildDescriptionText(docKind, rowAny, header, lines);
  const companyHeaderHtml = await buildCompanyPdfHeaderHtml();

  let html = "";

    if (docKind === "REGIE") {
    html = regieReportHtml({
      projectTitle: projectTitle || projectFsKey,
      projectFsKey,
      date,
      header,
      lines,
      firstPhotoDataUrl,
      descriptionText,
      companyHeaderHtml,
    });
  } else if (docKind === "LIEFERSCHEIN") {
    html = lieferscheinReportHtml({
      projectTitle: projectTitle || projectFsKey,
      projectFsKey,
      date,
      header,
      lines,
      firstPhotoDataUrl,
      descriptionText,
      companyHeaderHtml,
    });
  } else if (docKind === "TAGESBERICHT") {
    html = tagesberichtReportHtml({
      projectTitle: projectTitle || projectFsKey,
      projectFsKey,
      date,
      header,
      lines,
      firstPhotoDataUrl,
      descriptionText,
      companyHeaderHtml,
    });
  } else {
    html = photosReportHtml({
      projectTitle: projectTitle || projectFsKey,
      projectFsKey,
      date,
      header,
      lines,
      firstPhotoDataUrl,
      descriptionText,
      companyHeaderHtml,
    });
  }

  if (Platform.OS === "web") {
    try {
      const w = (globalThis as any)?.window?.open?.("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 250);
      } else {
        (globalThis as any)?.window?.print?.();
      }
    } catch {}
    return { pdfUri: "web:print", fileName: "web_print.pdf", date };
  }

  const out = await printToPdf(html);

      const kindFolder =
    docKind === "REGIE"
      ? "regie"
      : docKind === "LIEFERSCHEIN"
      ? "lieferscheine"
      : docKind === "TAGESBERICHT"
      ? "tagesberichte"
      : "photos";

    const baseName = safeFileName(
    filenameHint ||
      (docKind === "REGIE"
        ? "Regiebericht"
        : docKind === "LIEFERSCHEIN"
        ? "Lieferschein"
        : docKind === "TAGESBERICHT"
        ? "Tagesbericht"
        : "Fotos")
  );

  const fileBase = `${baseName}_${date}_${timePart}.pdf`;

  const saved = await savePdfToProjectFolder({
    projectFsKey,
    kindFolder,
    fileName: fileBase,
    sourceUri: out.uri,
  });

  try {
    await uploadProjectPdfToServer({
      projectFsKey,
      kindFolder,
      fileName: fileBase,
      fileUri: saved,
    });
  } catch (e: any) {
    console.log("[PDFDBG] uploadProjectPdfToServer failed:", String(e?.message || e));
  }

  return {
    pdfUri: saved,
    fileName: fileBase,
    date,
  };
}

/* ============================================================
 * PUBLIC EXPORTERS
 * ============================================================ */

export async function exportRegiePdfToProject(input: ExportRegieInput): Promise<ExportResult> {
  return exportUnifiedRegieModelPdf({
    projectFsKey: input.projectFsKey,
    projectTitle: input.projectTitle,
    filenameHint: input.filenameHint || "Regiebericht",
    rowAny: input.row,
    docKind: "REGIE",
  });
}

export async function exportLieferscheinPdfToProject(input: ExportLsInput): Promise<ExportResult> {
  return exportUnifiedRegieModelPdf({
    projectFsKey: input.projectFsKey,
    projectTitle: input.projectTitle,
    filenameHint: input.filenameHint || "Lieferschein",
    rowAny: input.row,
    docKind: "LIEFERSCHEIN",
  });
}

export async function exportPhotosPdfToProject(input: ExportPhotosInput): Promise<ExportResult> {
  return exportUnifiedRegieModelPdf({
    projectFsKey: input.projectFsKey,
    projectTitle: input.projectTitle,
    filenameHint: input.filenameHint || "Fotos",
    rowAny: input.row,
    docKind: "FOTOS",
  });
}

export async function exportTagesberichtPdfToProject(
  input: ExportTagesberichtInput
): Promise<ExportResult> {
  return exportUnifiedRegieModelPdf({
    projectFsKey: input.projectFsKey,
    projectTitle: input.projectTitle,
    filenameHint: input.filenameHint || "Tagesbericht",
    rowAny: input.row,
    docKind: "TAGESBERICHT",
  });
}
/* ============================================================
 * OPTIONAL OPEN HELPERS
 * ============================================================ */

export async function exportAndOpenRegiePdf(input: ExportRegieInput) {
  const r = await exportRegiePdfToProject(input);
  if (r?.pdfUri && Platform.OS !== "web") await openPdf(r.pdfUri);
  return r;
}

export async function exportAndOpenLieferscheinPdf(input: ExportLsInput) {
  const r = await exportLieferscheinPdfToProject(input);
  if (r?.pdfUri && Platform.OS !== "web") await openPdf(r.pdfUri);
  return r;
}

export async function exportAndOpenPhotosPdf(input: ExportPhotosInput) {
  const r = await exportPhotosPdfToProject(input);
  if (r?.pdfUri && Platform.OS !== "web") await openPdf(r.pdfUri);
  return r;
}

export async function exportAndOpenTagesberichtPdf(
  input: ExportTagesberichtInput
) {
  const r = await exportTagesberichtPdfToProject(input);
  if (r?.pdfUri && Platform.OS !== "web") await openPdf(r.pdfUri);
  return r;
}
















