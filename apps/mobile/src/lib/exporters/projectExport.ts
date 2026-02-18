// apps/mobile/src/lib/exporters/projectExport.ts
import * as FileSystem from "expo-file-system/legacy"; // ✅ FIX: legacy API (Base64 + readAsStringAsync ok)
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";

/**
 * OFFLINE-PDF (NUR_APP) – Regie/Lieferschein/Photos
 * ✅ Supporta input "row" da:
 *   - record completo (screen)
 *   - QueueItem (offlineQueue.ts) con payload + payload.row opzionale
 * ✅ Regiebericht Layout (A4) come WEB jsPDF:
 *   - Header 3 blocchi + checkbox tipo
 *   - Tage + Zeitfelder
 *   - Tabelle 6 Zeilen per Seite
 *   - Fotodokumentation (prima immagine) + Bemerkungen
 *   - Unterschriften
 * ✅ Salva sotto projects/<FS-KEY>/<Kategorie>/
 *
 * 🔥 FIX richiesto:
 * - Usa LO STESSO “modello PDF” (layout Regiebericht) per TUTTI:
 *   Regie + Lieferschein + Photos (quindi anche Inbox che richiama questi exporter)
 *
 * ✅ EXTRA FIX:
 * - Badge nel PDF: KI / EXTRA / FOTO / LV / ANH:n
 *
 * ✅ FIX FOTO:
 * - iOS HEIC/HEIF -> convertiamo a JPEG
 * - Android content:// -> copia in cache preservando estensione
 * - iOS ph:// può non essere leggibile direttamente -> fallback robusto (manipulateAsync)
 *
 * ✅ FIX INPUT:
 * - attachments/files/photos possono essere:
 *   - oggetti { uri, name, type }
 *   - stringhe "file://...", "content://...", "ph://..."
 *
 * ✅ FIX BUG REALI:
 * - Eingang/Prüfung a volte passa wrapper {kind,payload} senza payload.row → prima risultava "non queue"
 *   e quindi PDF vuoto. Ora unwrap più robusto.
 * - Overwrite PDF: se esiste già target, prima delete, poi copy (evita fallback su Print temp).
 *
 * ✅ FIX SERVER (Eingangsprüfung):
 * - Se l’allegato è URL (http/https) o path "/projects/..." → lo scarichiamo in cache (file://)
 *   e poi facciamo base64. Questo rimette in vita le foto in Eingangsprüfung e nei doc che hanno url.
 */

const API_URL_STORAGE_KEY = "api_base_url";

type EmailPdfInput = {
  subject: string;
  body?: string;
  attachments: string[]; // file:// uris (mobile)
  to?: string[];
  cc?: string[];
  bcc?: string[];
};

type ExportBaseInput = {
  projectFsKey: string; // BA-... oppure local-...
  projectTitle?: string;
  filenameHint?: string;
};

type ExportRegieInput = ExportBaseInput & { row: any };
type ExportLsInput = ExportBaseInput & { row: any };
type ExportPhotosInput = ExportBaseInput & { row: any };

export type ExportResult = {
  pdfUri: string; // file:// su mobile, "web:print" su web
  fileName: string;
  date: string; // YYYY-MM-DD
};

/* ============================================================
 *  FS HELPERS
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

  // ✅ iOS Photos assets
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

/** ✅ URL server support */
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
  // fallback: tienilo uguale al tuo default in api.ts (se diverso, cambialo qui)
  return "https://api.rlcbausoftware.com";
}

/** Scarica http/https o /projects/... in cache -> file:// */
async function ensureLocalFromRemote(
  uri: string,
  hint?: { name?: string; type?: string }
): Promise<string> {
  const s = String(uri || "").trim();
  if (!s) return "";

  // già locale o iOS asset
  if (isFileUri(s) || isContentUri(s) || isIosPhotosUri(s)) return s;

  // supportiamo SOLO http(s) o /projects/...
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
    const dl = await FileSystem.downloadAsync(abs, target);
    // dl.uri è file://...
    return dl.uri || target;
  } catch (e: any) {
    console.log("[PDFDBG] download remote FAILED:", { abs, err: String(e?.message || e) });
    return abs; // fallback (potrebbe fallire poi, ma almeno logga)
  }
}

/** Estensione coerente per file copiati da content:// (evita .bin) */
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

  // default: jpg
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

  // Android DocumentPicker spesso -> content://
  if (isContentUri(inputUri)) {
    const base = (FileSystem.cacheDirectory || FileSystem.documentDirectory) ?? null;
    if (!base) return inputUri;

    const baseNorm = normDir(base);
    await ensureDir(`${baseNorm}tmp/`);

    const ext = extFromNameOrType(hint?.name, hint?.type);
    const target = `${baseNorm}tmp/${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;

    await FileSystem.copyAsync({ from: inputUri, to: target });

    // target è già file://... se baseNorm è file://...
    return target.startsWith("file://") ? target : `file://${target}`;
  }

  // iOS ph:// resta così: lo convertiamo dopo
  return inputUri;
}

/**
 * ✅ Converte:
 * - ph:// / assets-library://  -> JPEG in cache via ImageManipulator
 * - HEIC/HEIF                  -> JPEG in cache via ImageManipulator
 * - altri                      -> invariato
 */
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

    // 0) http/https o /projects/... -> download -> file://
    const u0 = await ensureLocalFromRemote(img.uri, { name: img.name, type: img.type });
    if (u0 !== img.uri) console.log("[PDFDBG] after ensureLocalFromRemote:", u0);

    // 1) content:// -> file://
    const u1 = await ensureFileUri(u0, { name: img.name, type: img.type });
    console.log("[PDFDBG] after ensureFileUri:", u1);

    // 2) ph:// / HEIC -> JPEG in cache (quando possibile)
    const { uri: u2, mime } = await ensurePrintableImageUri(u1, {
      name: img.name,
      type: img.type,
    });
    console.log("[PDFDBG] after ensurePrintableImageUri:", { u2, mime });

    // ✅ se u2 è ancora ph:// (conversione fallita), non provare a leggere base64
    if (isIosPhotosUri(u2)) {
      console.log("[PDFDBG] still ph:// after conversion -> giving up:", u2);
      return null;
    }

    // 3) leggere base64
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
 *  QUEUE-AWARE UNWRAP (offlineQueue.ts)
 * ============================================================ */

function looksLikeQueueItem(x: any): boolean {
  if (!x || typeof x !== "object") return false;

  const k = String(x.kind || "").toUpperCase();

  // ✅ DEVE avere payload object
  if (!x.payload || typeof x.payload !== "object") return false;

  // ✅ FIX CRITICO:
  // ingresso/pruefung a volte passa wrapper {kind,payload} dove payload è "row-like" ma
  // NON contiene text/note/files e NON contiene payload.row -> prima risultava false.
  // Ora basta kind valido + payload object.
  return (
    k === "REGIE" ||
    k === "LIEFERSCHEIN" ||
    k === "LS" ||
    k === "PHOTO_NOTE" ||
    k === "FOTOS_NOTIZEN" ||
    k === "PHOTOS"
  );
}

function toAttachmentArrayFromFiles(files: any): any[] {
  const arr = Array.isArray(files) ? files : [];
  return arr
    .filter(Boolean)
    .map((f) => {
      if (typeof f === "string")
        return { uri: f, type: undefined, name: undefined, id: undefined };
      return {
        uri: f?.uri || f?.url || f?.path,
        type: f?.type,
        name: f?.name,
        id: f?.id,
      };
    })
    .filter((p) => !!p.uri);
}

// ✅ riconosce payload che è già una "row" (senza payload.row)
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
      o.datum
  );
}

/** Costruisce un "row" compatibile a partire da QueueItem.payload (se payload.row manca) */
function materializeRowFromQueueItem(q: any): any {
  const kindRaw = String(q?.kind || "");
  const kind = kindRaw.toUpperCase();
  const p = q?.payload || {};

  // ✅ se payload è già "row-like" e non esiste p.row, usalo come baseRow
  const payloadAsRow =
    (!p?.row || typeof p.row !== "object") && isRowLikeObject(p) ? p : null;

  // ✅ helper: merge payload fields into baseRow (così non perdi text/note/files)
  const mergePayloadIntoRow = (baseRow: any) => {
    const merged = { ...(baseRow || {}) };

    // normalizza "date"
    if (!merged.date && p?.date) merged.date = p.date;
    if (!merged.datum && p?.date) merged.datum = p.date;

    // porta dentro text/note se mancano
    if (!merged.leistung && p?.text) merged.leistung = p.text;
    if (!merged.text && p?.text) merged.text = p.text;
    if (!merged.bemerkungen && p?.note) merged.bemerkungen = p.note;
    if (!merged.note && p?.note) merged.note = p.note;

    // porta dentro file pool
    if (!merged.files && p?.files) merged.files = p.files;
    if (!merged.attachments && p?.files)
      merged.attachments = toAttachmentArrayFromFiles(p.files);
    if (!merged.photos && p?.files)
      merged.photos = toAttachmentArrayFromFiles(p.files);

    // photo main
    if (!merged.imageUri && p?.imageUri) merged.imageUri = p.imageUri;
    if (!merged.imageMeta && p?.imageMeta) merged.imageMeta = p.imageMeta;

    return merged;
  };

  if (kind === "REGIE") {
    const baseRow =
      (p?.row && typeof p.row === "object" ? p.row : null) || payloadAsRow;

    if (!baseRow) {
      const date = p?.date || "";
      const hours = p?.hours ?? "";
      const leistung = p?.text || "";
      const bemerkungen = p?.note || "";

      return mergePayloadIntoRow({
        date,
        stunden: hours,
        leistung,
        bemerkungen,
        photos: toAttachmentArrayFromFiles(p?.files),
        docType: p?.docType || "REGIE",
      });
    }

    return mergePayloadIntoRow({
      ...baseRow,
      docType: (baseRow as any)?.docType || p?.docType || "REGIE",
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

    // se abbiamo una row base, preferiscila (ma ancora mergiamo payload)
    const imageUri =
      p?.imageUri ||
      p?.imageMeta?.uri ||
      (baseRow as any)?.imageUri ||
      (baseRow as any)?.imageMeta?.uri ||
      null;

    const files = [
      ...(p?.files ? toAttachmentArrayFromFiles(p?.files) : []),
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
      date: (baseRow as any)?.date || p?.date || p?.createdAt || "",
      title: (baseRow as any)?.title || "",
      note:
        (baseRow as any)?.note ||
        p?.note ||
        p?.comment ||
        p?.bemerkungen ||
        "",
      bemerkungen: (baseRow as any)?.bemerkungen || p?.bemerkungen || "",
      kostenstelle: (baseRow as any)?.kostenstelle || p?.kostenstelle || "",
      lvItemPos: (baseRow as any)?.lvItemPos || p?.lvItemPos || null,
      files: (baseRow as any)?.files || p?.files,
      attachments: files,
      boxes: (baseRow as any)?.boxes || p?.boxes,
      extras: (baseRow as any)?.extras || p?.extras,
      docId: (baseRow as any)?.docId || p?.docId,
      imageUri: imageUri || undefined,
      imageMeta: (baseRow as any)?.imageMeta || p?.imageMeta,
    };

    return mergePayloadIntoRow(draft);
  }

  // fallback
  if (p?.row && typeof p.row === "object") return { ...p.row };
  if (payloadAsRow) return { ...payloadAsRow };
  return q;
}

function unwrapRowMaybeQueue(rowOrQueue: any): any {
  if (looksLikeQueueItem(rowOrQueue)) return materializeRowFromQueueItem(rowOrQueue);
  return rowOrQueue;
}

/* ============================================================
 *  NORMALIZATION (row -> header + lines)
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
  photos?: Array<{ uri?: string; url?: string; path?: string; type?: string; name?: string }>;
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

function normalizePhotos(x: any): RegieLine["photos"] {
  const arr = Array.isArray(x) ? x : [];
  return arr
    .filter(Boolean)
    .map((p) => {
      if (typeof p === "string") {
        return { uri: p, url: undefined, path: undefined, type: undefined, name: undefined };
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

function normalizeRegieLines(rootAny: any): RegieLine[] {
  const root = unwrapRowMaybeQueue(rootAny);

  const candidates =
    (Array.isArray(root?.rows) && root.rows) ||
    (Array.isArray(root?.items?.aufmass) && root.items.aufmass) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.lines) && root.lines) ||
    (Array.isArray(root?.positions) && root.positions) ||
    null;

  const list: any[] = candidates ? candidates : [root];

  return list.map((r) => ({
    kostenstelle: r?.kostenstelle || r?.costCenter || root?.kostenstelle || root?.costCenter || "",
    machine: r?.machine || r?.maschinen || r?.equipment || "",
    worker: r?.worker || r?.mitarbeiter || r?.person || "",
    hours: r?.hours ?? r?.stunden ?? "",
    comment:
      r?.comment ||
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
      r?.photos || r?.attachments || r?.files || root?.photos || root?.attachments || root?.files || []
    ),
  }));
}

/* ============================================================
 *  UNIFIED “MODEL PDF” HELPERS
 * ============================================================ */

type DocKind = "REGIE" | "LIEFERSCHEIN" | "FOTOS";

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

  return [...a1, ...a2, ...a3, ...extraUris]
    .filter(Boolean)
    .map((p) => {
      if (typeof p === "string") return { uri: p, type: undefined, name: undefined };
      return {
        uri: p?.uri || p?.url || p?.path,
        type: p?.type,
        name: p?.name,
      };
    })
    .filter((p) => !!p.uri);
}

async function firstPhotoDataUrlFromRowOrLines(opts: {
  rowAny: any;
  lines?: RegieLine[];
}): Promise<string | null> {
  try {
    const { rowAny, lines } = opts;

    const fromLines =
      (lines || [])
        .flatMap((l) => l.photos || [])
        .find((p) => isLikelyImg(p?.type || p?.name || p?.uri || p?.url || p?.path)) || null;

    const fromRow =
      collectAllAttachmentsMaybe(rowAny).find((p) => isLikelyImg(p?.type || p?.name || p?.uri)) || null;

    const uri = (fromLines?.uri || fromLines?.url || fromLines?.path || fromRow?.uri || "") as string;
    if (!uri) return null;

    const hint = {
      name: (fromLines?.name || fromRow?.name) as any,
      type: (fromLines?.type || fromRow?.type) as any,
    };
    return await readAsBase64DataUrl({ uri, name: hint.name, type: hint.type });
  } catch {
    return null;
  }
}

/** Lieferschein -> righe compatibili col layout Regiebericht */
function synthLinesForLieferschein(rowAny: any): RegieLine[] {
  const row = unwrapRowMaybeQueue(rowAny);

  const supplier = text(row?.supplier || row?.lieferant || "");
  const number = text(row?.lieferscheinNummer || row?.number || row?.nr || row?.lieferscheinNr || "");
  const site = text(row?.site || row?.baustelle || "");
  const driver = text(row?.driver || "");
  const material = text(row?.material || "");
  const qty = row?.qty ?? row?.quantity ?? row?.menge ?? row?.mengeGesamt ?? "";
  const unit = text(row?.unit || row?.einheit || "");

  const qtyStr = qty != null && String(qty) !== "0" ? `${num(qty)} ${unit}`.trim() : "";
  const commentParts = [
    supplier ? `Lieferant: ${supplier}` : "",
    number ? `LS-Nr.: ${number}` : "",
    site ? `Baustelle: ${site}` : "",
  ].filter(Boolean);

  return [
    {
      kostenstelle: row?.kostenstelle || row?.costCenter || "",
      machine: material || "Material",
      worker: driver || "",
      hours: "",
      comment: commentParts.join(" • "),
      material: qtyStr,
      photos: normalizePhotos(row?.attachments || row?.files || []),
    },
  ];
}

/** Photos/Notizen -> righe compatibili col layout Regiebericht */
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
  if (!lines.length) {
    lines.push({
      kostenstelle: row?.kostenstelle || "",
      machine: row?.lvItemPos ? `LV ${text(row.lvItemPos)}` : "Notiz",
      worker: "",
      hours: "",
      comment: note,
      material: "",
      photos: normalizePhotos(row?.attachments || row?.files || []),
    });
  } else {
    lines[0].photos = normalizePhotos(row?.attachments || row?.files || []);
  }

  // ✅ ensure main photo is included for preview
  const main = row?.imageUri || row?.imageMeta?.uri || row?.photoUri || row?.uri;
  if (main && lines?.[0]) {
    const existing = Array.isArray(lines[0].photos) ? lines[0].photos : [];
    if (!existing.find((x) => x?.uri === main)) {
      lines[0].photos = [{ uri: String(main) }, ...existing];
    }
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

/* ============================================================
 *  HTML (Regiebericht Layout)
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

function regieReportHtml(params: {
  projectTitle: string;
  projectFsKey: string;
  date: string;
  header: RegieHeader;
  lines: RegieLine[];
  firstPhotoDataUrl?: string | null;
  descriptionText?: string;
  docKind?: DocKind;
  docNumberLabel?: string;
  leftTitle?: string;
}) {
  const { projectTitle, projectFsKey, date, header, lines, firstPhotoDataUrl } = params;

  const docKind: DocKind = (params.docKind || "REGIE") as any;
  const leftTitle = params.leftTitle || "";
  const docNumberLabel =
    params.docNumberLabel ||
    (docKind === "LIEFERSCHEIN"
      ? "Lieferscheinnummer"
      : docKind === "FOTOS"
      ? "Fotonummer"
      : "Regie-Nr.");

  const reportType = (header.reportType || "REGIE") as any;
  const descText = text(params.descriptionText || "");

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

          const machineLower = text(r.machine || "").toLowerCase();

          const isFoto = machineLower === "foto";
          const isExtra = machineLower === "extra";
          const isKiBox = isFoto && /\(\s*\d{1,3}%\s*\)/.test(text(r.comment || ""));

          const isLv =
            /^lv\s*\d+/i.test(text(r.machine || "")) ||
            /^lv\s*\d+/i.test(text(r.material || "")) ||
            /^lv\s*\d+/i.test(text(r.comment || ""));

          const attCount = Array.isArray((r as any)?.photos) ? (r as any).photos.length : 0;

          const badges: string[] = [];
          if (isKiBox) badges.push(`<span class="tag tag-ki">KI</span>`);
          if (isExtra) badges.push(`<span class="tag tag-extra">EXTRA</span>`);
          if (isFoto) badges.push(`<span class="tag tag-foto">FOTO</span>`);
          if (isLv) badges.push(`<span class="tag tag-lv">LV</span>`);
          if (attCount > 0) badges.push(`<span class="tag tag-att">ANH: ${attCount}</span>`);

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
        : `<div class="ph-muted">—</div>`;

      const headLeftHtml =
        docKind === "REGIE"
          ? `
              ${renderTypeRow("Tagesbericht", "TAGESBERICHT", reportType)}
              ${renderTypeRow("Bautagebuch", "BAUTAGEBUCH", reportType)}
              ${renderTypeRow("Regiebericht", "REGIE", reportType)}
            `
          : `
              <div class="left-title">${escapeHtml(
                leftTitle || (docKind === "LIEFERSCHEIN" ? "Lieferschein" : "Fotos")
              )}</div>
            `;

      return `
        <div class="page">
          <div class="head">
            <div class="head-left">
              ${headLeftHtml}
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
              ${renderRightField(docNumberLabel, header.regieNummer || "")}
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
            <div class="box foto">
              <div class="box-title">Fotodokumentation</div>
              ${photoBox}
            </div>
            <div class="box bemerk">
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

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; }
        .page { width: 100%; }
        .page-break { page-break-after: always; }

        .head { display: flex; border: 0.3mm solid #111; height: 32mm; }
        .head-left { width: 55mm; border-right: 0.3mm solid #111; padding: 3mm 4mm; box-sizing: border-box; }

        .type-row { display:flex; align-items:center; justify-content: space-between; margin: 2mm 0; font-size: 10px; }
        .cb { width: 6mm; height: 6mm; border: 0.3mm solid #111; display:grid; place-items:center; font-weight:700; }

        .left-title {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .head-mid { flex: 1; border-right: 0.3mm solid #111; padding: 3mm 4mm; box-sizing: border-box; }
        .head-mid .line { display:flex; gap: 2mm; font-size: 10px; margin: 2mm 0; }
        .head-mid .lab { width: 34mm; color:#111; }
        .head-mid .val { flex: 1; border-bottom: 0.3mm solid #111; padding-bottom: 1mm; }

        .head-right { width: 55mm; display:flex; flex-direction: column; }
        .rf { flex: 1; border-bottom: 0.3mm solid #111; display:flex; flex-direction: column; justify-content: space-between; padding: 2mm 2mm; box-sizing: border-box; }
        .rf:last-child { border-bottom: none; }
        .rf .lab { font-size: 10px; text-align:center; }
        .rf .val { font-size: 10px; text-align:center; font-weight:600; }

        .days { margin-top: 4mm; border: 0.3mm solid #111; }
        .days .row { display:flex; }
        .days .cell { flex: 1; border-right: 0.3mm solid #111; padding: 1.5mm 0; text-align:center; font-size: 10px; }
        .days .cell:last-child { border-right: none; }
        .days .days-row .day { font-weight: 700; }
        .days .zeit-lab .zeit { background: #f3f3f3; }
        .days .zeit-val .v { height: 8mm; }

        table.main { width: 100%; border-collapse: collapse; margin-top: 4mm; border: 0.3mm solid #111; }
        table.main th, table.main td { border: 0.3mm solid #111; padding: 1.8mm 1.4mm; font-size: 10px; vertical-align: top; }
        table.main th { background: #f3f3f3; text-align: center; font-weight: 700; }
        th.kosten, td.kosten { width: 18mm; }
        th.geraet, td.geraet { width: 33mm; }
        th.mitarb, td.mitarb { width: 26mm; }
        th.std, td.std { width: 12mm; text-align: center; }
        th.bes, td.bes { width: 62mm; }
        th.mat, td.mat { width: 36mm; }

        .badges { margin-bottom: 1mm; display:flex; flex-wrap:wrap; gap: 1mm; }
        .tag { font-size: 9px; padding: 0.3mm 1.3mm; border: 0.3mm solid #111; border-radius: 2mm; display:inline-block; }
        .tag-ki, .tag-extra, .tag-foto, .tag-lv, .tag-att { font-weight: 800; }

        .desc { margin-top: 4mm; border: 0.3mm solid #111; min-height: 18mm; }
        .desc-title { background: #f3f3f3; padding: 1.5mm 2mm; font-weight: 700; font-size: 10px; border-bottom: 0.3mm solid #111; }
        .desc-body { padding: 2mm; font-size: 10px; min-height: 10mm; white-space: pre-wrap; }

        .bottom { margin-top: 4mm; display:flex; gap: 4mm; }
        .box { border: 0.3mm solid #111; flex: 1; min-height: 45mm; position: relative; }
        .box-title { background: #f3f3f3; padding: 1.5mm 2mm; font-weight: 700; font-size: 10px; border-bottom: 0.3mm solid #111; }
        .photo { width: 100%; height: 100%; object-fit: contain; display:block; }
        .ph-muted { padding: 8mm 2mm; text-align:center; color:#666; font-size: 10px; }
        .bem-text { padding: 2mm; font-size: 10px; white-space: pre-wrap; }

        .sign { margin-top: 4mm; display:flex; gap: 4mm; }
        .sign-col { flex:1; border: 0.3mm solid #111; }
        .sign-title { background:#f3f3f3; padding: 1.5mm 2mm; font-weight:700; font-size:10px; border-bottom: 0.3mm solid #111; }
        .sign-line { display:flex; gap: 2mm; padding: 3mm 2mm; align-items:flex-end; }
        .sign-line .lab { width: 18mm; font-size: 10px; }
        .sign-line .line { flex:1; border-bottom: 0.3mm solid #111; height: 0; }
      </style>
    </head>
    <body>
      ${pageHtml}
    </body>
  </html>
  `;
}

/* ============================================================
 *  PRINT/SAVE/EMAIL HELPERS
 * ============================================================ */

async function printToPdf(html: string): Promise<{ uri: string }> {
  const out = await Print.printToFileAsync({ html, base64: false });
  return out;
}

async function savePdfToProjectFolder(params: {
  projectFsKey: string;
  kindFolder: "regie" | "lieferscheine" | "photos";
  fileName: string;
  sourceUri: string; // pdf uri (file://)
}): Promise<string> {
  const base = getBaseDirOrNull();
  if (!base) return params.sourceUri;

  const projDir = `${base}projects/${params.projectFsKey}/${params.kindFolder}/`;
  await ensureDir(projDir);

  const target = `${projDir}${safeFileName(params.fileName)}`;

  try {
    // ✅ OVERWRITE SAFE: se esiste, cancellalo prima
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

    // ✅ force file:// attachments only
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

async function openPdf(uri: string) {
  try {
    if (!uri) return;
    await Linking.openURL(uri);
  } catch (e) {
    console.log("[PDFDBG] openPdf failed:", String((e as any)?.message || e));
  }
}

/* ============================================================
 *  UNIFIED EXPORT CORE
 * ============================================================ */

function buildDescriptionText(docKind: DocKind, rowAny: any, header: RegieHeader, lines: RegieLine[]) {
  const row = unwrapRowMaybeQueue(rowAny);

  const direct =
    text(row?.leistung || row?.leistungBeschreibung || row?.beschreibung || row?.text || row?.note || "") ||
    text(header?.bemerkungen || "");

  if (direct) return direct;

  const joined = (lines || [])
    .map((l) => text(l?.comment || "").trim())
    .filter(Boolean)
    .slice(0, 6)
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

  let header: RegieHeader;
  let lines: RegieLine[];

  if (docKind === "REGIE") {
    header = pickHeader(rowAny);
    lines = normalizeRegieLines(rowAny);
  } else if (docKind === "LIEFERSCHEIN") {
    header = buildHeaderForLieferschein(rowAny, date);
    lines = synthLinesForLieferschein(rowAny);
  } else {
    header = buildHeaderForPhotos(rowAny, date);
    lines = synthLinesForPhotos(rowAny);
  }

  const firstPhotoDataUrl = await firstPhotoDataUrlFromRowOrLines({ rowAny, lines });
  const descriptionText = buildDescriptionText(docKind, rowAny, header, lines);

  const html = regieReportHtml({
    projectTitle: projectTitle || projectFsKey,
    projectFsKey,
    date,
    header,
    lines,
    firstPhotoDataUrl,
    descriptionText,
    docKind,
    docNumberLabel:
      docKind === "LIEFERSCHEIN" ? "Lieferscheinnummer" : docKind === "FOTOS" ? "Fotonummer" : "Regie-Nr.",
    leftTitle: docKind === "LIEFERSCHEIN" ? "Lieferschein" : docKind === "FOTOS" ? "Fotos" : "",
  });

  // WEB: stampa browser
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
    docKind === "REGIE" ? "regie" : docKind === "LIEFERSCHEIN" ? "lieferscheine" : "photos";

  const fileBase =
    safeFileName(
      filenameHint ||
        (docKind === "REGIE"
          ? "Regiebericht"
          : docKind === "LIEFERSCHEIN"
          ? "Lieferschein"
          : "Fotos")
    ) +
    "_" +
    date +
    ".pdf";

  const saved = await savePdfToProjectFolder({
    projectFsKey,
    kindFolder,
    fileName: fileBase,
    sourceUri: out.uri,
  });

  return {
    pdfUri: saved,
    fileName: fileBase,
    date,
  };
}

/* ============================================================
 *  PUBLIC EXPORTERS
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

/* ============================================================
 *  OPTIONAL: simple “export + open” helpers (usati dai screen)
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
