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
    const header = await getCompanyHeaderCached();
    const rawLogoUri = await getCompanyLogoUriCached();

    const name = escapeHtml(text(header?.name || ""));
    const address = escapeHtml(text(header?.address || ""));
    const phone = escapeHtml(text(header?.phone || ""));
    const email = escapeHtml(text(header?.email || ""));

    let logoDataUrl = "";
    if (rawLogoUri) {
      const maybeDataUrl = await readAsBase64DataUrl({
        uri: String(rawLogoUri),
        name: "company_logo",
        type: "image/jpeg",
      });
      if (maybeDataUrl) logoDataUrl = maybeDataUrl;
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
          const hoursStr = r.hours != null && String(r.hours) !== "0" ? num(r.hours) : "";
          const qtyStr =
            r.quantity != null && String(r.quantity) !== "0"
              ? `${num(r.quantity)} ${text(r.unit || "")}`.trim()
              : "";
          const materialStr = [text(r.material || ""), qtyStr].filter(Boolean).join(" – ");

          const attCount = Array.isArray((r as any)?.photos) ? (r as any).photos.length : 0;
          const badges: string[] = [];
          if (attCount > 0) badges.push(`<span class="tag">Anhänge: ${attCount}</span>`);
          const badgeHtml = badges.length ? `<div class="badges">${badges.join("")}</div>` : "";
          const besondereStr = `${badgeHtml}${escapeHtml(text(r.comment || ""))}`;

          return `
            <tr>
              <td class="c kosten">${escapeHtml(text(r.kostenstelle || header.kostenstelle || ""))}</td>
              <td class="c geraet">${escapeHtml(text(r.machine || r.material || ""))}</td>
              <td class="c mitarb">${escapeHtml(text(r.worker || ""))}</td>
              <td class="c std">${escapeHtml(hoursStr)}</td>
              <td class="c bes">${besondereStr}</td>
              <td class="c mat">${escapeHtml(materialStr)}</td>
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
            <div class="desc-body">${escapeHtml(descText)}</div>
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
        <div class="desc-body">${escapeHtml(descText)}</div>
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
              <td class="bes">${escapeHtml(descText)}</td>
              <td class="mat"></td>
            </tr>
          `
          }
        </tbody>
      </table>

      <div class="desc">
        <div class="desc-title">Beschreibung / Notiz</div>
        <div class="desc-body">${escapeHtml(descText)}</div>
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
        <div class="desc-body">${escapeHtml(descText)}</div>
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

