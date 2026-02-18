// apps/mobile/src/screens/EingangPruefungScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  TextInput,
  Platform,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useFocusEffect } from "@react-navigation/native";

// ✅ NEW: cache downloads for auth-protected images/files
import * as FileSystem from "expo-file-system";

// ✅ NEW: hydrate preview (server URIs -> local file://)
import { hydrateRowForPreview } from "../lib/hydratePreview";

// API
import { api } from "../lib/api";

// ✅ Team / Rollen (prefill Email Versand Ansprechpartner)
import { getProjectRoles } from "../storage/projectMeta";

// Offline Queue
import { queueFlush, queueIsLocked, QueueItem } from "../lib/offlineQueue";

// Theme (match LieferscheinScreen)
import { COLORS } from "../ui/theme";

// ✅ PDF Exporter + Mail
import {
  exportRegiePdfToProject,
  exportLieferscheinPdfToProject,
  exportPhotosPdfToProject,
  emailPdf,
} from "../lib/exporters/projectExport";

type Props = NativeStackScreenProps<RootStackParamList, "EingangPruefung">;

type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";

type InboxItemBase = {
  id: string;
  projectId: string; // BA-... (FS key) oder DB id (fallback)
  projectCode?: string;
  date?: string; // yyyy-mm-dd
  createdAt?: number;
  submittedAt?: number | null;
  workflowStatus: WorkflowStatus;
  rejectionReason?: string | null;

  // compat
  syncStatus?: "PENDING" | "SENT" | "ERROR";
  syncError?: string | null;

  // attachments generici
  photos?: any[];
  attachments?: any[];
  files?: any[];
};

type InboxRegie = InboxItemBase & {
  kind?: "regie";
  text?: string;
  comment?: string;
  hours?: number;
  note?: any;
  rows?: any[];
  items?: any;
};

type InboxLs = InboxItemBase & {
  kind?: "lieferschein";
  lieferscheinNummer?: string;
  supplier?: string;
  kostenstelle?: string;
  lvItemPos?: string | null;
  comment?: string;
  bemerkungen?: string;
};

type InboxFotos = InboxItemBase & {
  kind?: "fotos";
  comment?: string;
  bemerkungen?: string;
  kostenstelle?: string;
  lvItemPos?: string | null;
  attachments?: any[];
  imageUri?: string;
  imageMeta?: any;
};

type PdfExportResult = {
  pdfUri: string;
  fileName: string;
  date: string;
  [k: string]: any;
};

function looksLikeProjectCode(s: string) {
  return /^BA-\d{4}[-_]/i.test(String(s || "").trim());
}

const KEY_MODE = "rlc_mobile_mode";

const INBOX_KEY_REGIE = (projectKey: string) => `rlc_mobile_inbox_regie:${projectKey}`;
const INBOX_KEY_LS = (projectKey: string) => `rlc_mobile_inbox_lieferschein:${projectKey}`;
const INBOX_KEY_FOTOS = (projectKey: string) => `rlc_mobile_inbox_fotos:${projectKey}`;

async function loadList<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveList<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function safeDate(d?: string) {
  const s = String(d || "").trim();
  if (!s) return new Date().toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function toYmd(v: any) {
  const s = String(v ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  return s || new Date().toISOString().slice(0, 10);
}

/** =========================
 * Theme helpers
 * ========================= */
const T = {
  primary: (COLORS as any)?.primary || "#0b57d0",
  bg: (COLORS as any)?.background || "#ffffff",
  surface: (COLORS as any)?.surface || "#ffffff",
  text: (COLORS as any)?.text || "#111111",
  muted: (COLORS as any)?.muted || "#667085",
  border: (COLORS as any)?.border || "#e7e7e7",
  success: (COLORS as any)?.success || "#1a7f37",
  danger: (COLORS as any)?.danger || "#c33",
  warning: (COLORS as any)?.warning || "#b54708",
  chipBg: (COLORS as any)?.chipBg || "#f3f4f6",
};

const HD = {
  bg: "#0B1720",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  line: "rgba(255,255,255,0.10)",
};

function alpha(hex: string, a: number) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function statusColor(w: WorkflowStatus) {
  if (w === "FREIGEGEBEN") return T.success;
  if (w === "ABGELEHNT") return T.danger;
  if (w === "EINGEREICHT") return T.primary;
  return "#999";
}

function shadowElev() {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  }) as any;
}

/** =========================
 * ✅ Normalize file metas (string uri -> {uri,name,type})
 * ========================= */
function inferMimeFromUri(uri: string) {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".heic") || u.includes("heic")) return "image/heic";
  if (u.endsWith(".heif") || u.includes("heif")) return "image/heif";
  if (u.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

function normalizeFileMetaArray(input: any): Array<{ uri: string; name?: string; type?: string }> {
  const arr = Array.isArray(input) ? input : [];
  const out: Array<{ uri: string; name?: string; type?: string }> = [];

  for (const it of arr) {
    if (!it) continue;

    if (typeof it === "string") {
      const uri = it.trim();
      if (!uri) continue;
      out.push({
        uri,
        name: `file_${Date.now()}.jpg`,
        type: inferMimeFromUri(uri),
      });
      continue;
    }

    const uri = String(it?.uri || it?.url || it?.path || "").trim();
    if (!uri) continue;

    out.push({
      uri,
      name: it?.name || it?.filename || `file_${Date.now()}.jpg`,
      type: it?.type || it?.mime || it?.mimeType || inferMimeFromUri(uri),
    });
  }

  // dedupe by uri
  const seen = new Set<string>();
  return out.filter((f) => {
    const u = String(f?.uri || "");
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

/** =========================
 * ✅ Email parsing helpers (multi-mail support)
 * ========================= */
function splitEmails(v: any): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  const parts = s
    .split(/[;, \n\r\t]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const ok = parts.filter((x) => x.includes("@"));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of ok) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** =========================
 * Server request helper (token + JSON)
 * ========================= */
async function serverRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem("auth_token");
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (!headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  // ✅ base dinamico (dev override / tunnel)
  let base = "";
  try {
    base = String(
      (api as any)?.getApiUrl ? await (api as any).getApiUrl() : (api as any)?.apiUrl || ""
    ).replace(/\/$/, "");
  } catch {
    base = String((api as any)?.apiUrl || "").replace(/\/$/, "");
  }

  const res = await fetch(`${base}${path}`, { ...init, headers });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

  return (text ? JSON.parse(text) : null) as T;
}

type InboxListResponse<T> = { ok?: boolean; fsKey?: string; items?: T[] };

/** =========================
 * ✅ Cache helper: download auth-protected URIs to file://
 * (fixes black previews in Regie/LS reopen)
 * ========================= */
function safeNameLocal(name: string) {
  return String(name || "")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

async function getApiBase(): Promise<string> {
  try {
    const b = String(
      (api as any)?.getApiUrl ? await (api as any).getApiUrl() : (api as any)?.apiUrl || ""
    ).replace(/\/$/, "");
    return b;
  } catch {
    return String((api as any)?.apiUrl || "").replace(/\/$/, "");
  }
}

async function downloadToCacheIfNeeded(uriRaw: string, nameHint?: string): Promise<string> {
  const uri = String(uriRaw || "").trim();
  if (!uri) return uri;
  if (uri.startsWith("file://")) return uri;

  // Only handle remote (http(s)) or relative (/api/...)
  const isHttp = /^https?:\/\//i.test(uri);
  const isRel = uri.startsWith("/");

  if (!isHttp && !isRel) return uri;

  const token = await AsyncStorage.getItem("auth_token");
  const base = await getApiBase();
  const url = isHttp ? uri : `${base}${uri}`;

  const cacheDir = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}rlc_inbox_cache/`;
  try {
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
  } catch {}

  const extGuess =
    uri.toLowerCase().endsWith(".pdf")
      ? ".pdf"
      : uri.toLowerCase().endsWith(".png")
      ? ".png"
      : uri.toLowerCase().endsWith(".webp")
      ? ".webp"
      : uri.toLowerCase().endsWith(".heic")
      ? ".heic"
      : uri.toLowerCase().endsWith(".heif")
      ? ".heif"
      : ".jpg";

  const fname = safeNameLocal(nameHint || `dl_${Date.now()}${extGuess}`);
  const dest = `${cacheDir}${fname}${fname.toLowerCase().endsWith(extGuess) ? "" : extGuess}`;

  try {
    const r = await FileSystem.downloadAsync(
      url,
      dest,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    );
    if (r?.uri) return r.uri;
  } catch {
    // ignore -> fallback to original uri
  }

  return uri;
}

async function localizeFileMetas(
  metas: Array<{ uri: string; name?: string; type?: string }>
): Promise<Array<{ uri: string; name?: string; type?: string }>> {
  const out: Array<{ uri: string; name?: string; type?: string }> = [];
  for (const m of metas) {
    const u = String(m?.uri || "").trim();
    if (!u) continue;
    const localUri = await downloadToCacheIfNeeded(u, m?.name);
    out.push({ ...m, uri: localUri });
  }
  return out;
}

/** =========================
 * Helper: try multiple endpoints (approve)
 * ========================= */
async function tryApprove(kind: "REGIE" | "LS" | "FOTOS", pk: string, docId: string) {
  const candidates: { path: string; body: any }[] =
    kind === "LS"
      ? [
          { path: `/api/ls/inbox/approve`, body: { projectId: pk, docId } },
          { path: `/api/ls/commit/lieferschein`, body: { projectId: pk, docId } },
          { path: `/api/ls/approve`, body: { projectId: pk, docId } },
        ]
      : kind === "REGIE"
      ? [
          { path: `/api/regie/inbox/approve`, body: { projectId: pk, docId } },
          { path: `/api/regie/commit/regiebericht`, body: { projectId: pk, docId } },
          { path: `/api/regie/approve`, body: { projectId: pk, docId } },
        ]
      : [
          // ✅ prefer common naming first
          { path: `/api/photos/commit`, body: { projectId: pk, docId } },
          { path: `/api/photos/inbox/approve`, body: { projectId: pk, docId } },

          // compat
          { path: `/api/fotos/commit`, body: { projectId: pk, docId } },
          { path: `/api/fotos/inbox/approve`, body: { projectId: pk, docId } },

          // legacy fallback
          {
            path: `/api/inbox/${encodeURIComponent(pk)}/fotos/${encodeURIComponent(docId)}/approve`,
            body: { approvedBy: "" },
          },
        ];

  let lastErr: any = null;
  for (const c of candidates) {
    try {
      return await serverRequest(c.path, { method: "POST", body: JSON.stringify(c.body) });
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Approve failed");
}

/** =========================
 * ✅ Helper: fetch full snapshot BEFORE PDF export
 * - REGIE: server regie.ts has /api/regie/inbox/read -> { snapshot }
 * - LS/FOTOS: try candidates if available (safe no-op fallback)
 * ========================= */
async function tryFetchFullDoc(kind: "REGIE" | "LS" | "FOTOS", pk: string, docId: string) {
  const candidates: string[] =
    kind === "REGIE"
      ? [
          `/api/regie/inbox/read?projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/regie/read?stage=inbox&projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
        ]
      : kind === "LS"
      ? [
          `/api/ls/inbox/read?projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/ls/read?stage=inbox&projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
        ]
      : [
          `/api/photos/inbox/read?projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/photos/read?stage=inbox&projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/fotos/inbox/read?projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
        ];

  let lastErr: any = null;
  for (const url of candidates) {
    try {
      const r = await serverRequest<any>(url, { method: "GET" });
      // expected shape: { ok, fsKey, snapshot }
      if (r?.snapshot) return r.snapshot;
      // alternative shape: direct object
      if (r && typeof r === "object" && !Array.isArray(r) && r?.ok !== false) return r;
    } catch (e: any) {
      lastErr = e;
    }
  }

  if (__DEV__ && lastErr) {
    console.warn("tryFetchFullDoc failed (fallback to summary)", {
      kind,
      pk,
      docId,
      err: String(lastErr?.message || lastErr),
    });
  }
  return null;
}

/** =========================
 * ✅ Enforce SERVER_SYNC only
 * ========================= */
async function enforceServerSync(navigation: any) {
  try {
    const m = String((await AsyncStorage.getItem(KEY_MODE)) || "").trim();
    if (m === "NUR_APP") {
      Alert.alert(
        "Eingang / Prüfung (Server)",
        "Dieser Screen ist nur für SERVER_SYNC. In NUR_APP bitte die Offline-Inbox benutzen."
      );
      navigation.goBack();
      return false;
    }
  } catch {}
  return true;
}

export default function EingangPruefungScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title } = route.params;

  // pk deve essere BA-... (FS key). Fallback su projectId se già BA-...
  const pk = useMemo(() => {
    const a = String(projectCode || "").trim();
    if (looksLikeProjectCode(a)) return a;
    const b = String(projectId || "").trim();
    if (looksLikeProjectCode(b)) return b;
    return a || b; // ultimo fallback (può essere UUID)
  }, [projectCode, projectId]);

  // ✅ DISPLAY: sempre mostrare BA-... se possibile
  const displayProjectCode = useMemo(() => {
    const a = String(projectCode || "").trim();
    if (looksLikeProjectCode(a)) return a;
    const b = String(pk || "").trim();
    if (looksLikeProjectCode(b)) return b;
    const c = String(projectId || "").trim();
    if (looksLikeProjectCode(c)) return c;
    return a || b || c || "—";
  }, [pk, projectCode, projectId]);

  const [tab, setTab] = useState<"REGIE" | "LS" | "FOTOS">("REGIE");
  const [busy, setBusy] = useState(false);

  const [regie, setRegie] = useState<InboxRegie[]>([]);
  const [ls, setLs] = useState<InboxLs[]>([]);
  const [fotos, setFotos] = useState<InboxFotos[]>([]);

  // reject modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{
    kind: "REGIE" | "LS" | "FOTOS";
    id: string;
  } | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: title ? String(title) : `Eingang / Prüfung`,
    });
  }, [navigation, title]);

  const canWork = useMemo(() => looksLikeProjectCode(pk), [pk]);

  /** =========================
   * ✅ Prepare snapshot for reopening (fix empty lines + black previews)
   * ========================= */
  const prepareSnapshotForOpen = useCallback(
    async (kind: "REGIE" | "LS" | "FOTOS", id: string, fallbackItem: any) => {
      const full = await tryFetchFullDoc(kind, pk, id);
      const source = full || fallbackItem || {};

      // ✅ KEY FIX: hydrate BEFORE we compute preview fields
      // - turns auth-protected / server paths into local file://
      // - normalizes attachments/files where possible
      let hydratedSource: any = source;
      try {
        const hydrated = await hydrateRowForPreview(source, pk);
        hydratedSource = hydrated || source;
      } catch {
        hydratedSource = source;
      }

      // collect metas
      const poolA = normalizeFileMetaArray(hydratedSource?.files);
      const poolB = normalizeFileMetaArray(hydratedSource?.attachments);
      const poolC = normalizeFileMetaArray(hydratedSource?.photos);

      const fromRows = Array.isArray(hydratedSource?.rows)
        ? normalizeFileMetaArray(
            (hydratedSource.rows || []).flatMap(
              (x: any) => x?.photos || x?.attachments || x?.files || []
            )
          )
        : [];

      const mainUri = String(
        hydratedSource?.imageUri ||
          hydratedSource?.imageMeta?.uri ||
          hydratedSource?.image?.uri ||
          ""
      ).trim();

      const mainArr = mainUri
        ? normalizeFileMetaArray([
            { uri: mainUri, name: "photo_main.jpg", type: inferMimeFromUri(mainUri) },
          ])
        : [];

      const merged = normalizeFileMetaArray([...poolA, ...poolB, ...poolC, ...fromRows]);
      const forFotos = normalizeFileMetaArray([...mainArr, ...merged]);

      // ✅ localize URIs to file:// (extra safety; hydrate already does most of it)
      const localizedMerged = await localizeFileMetas(merged);
      const localizedFotos = await localizeFileMetas(forFotos);

      const patched = {
        ...hydratedSource,
        projectId: hydratedSource?.projectId || pk,
        projectCode: hydratedSource?.projectCode || pk,
        id: hydratedSource?.id || hydratedSource?.docId || id,
        // keep arrays in common fields
        files: kind === "FOTOS" ? localizedFotos : localizedMerged,
        attachments: kind === "FOTOS" ? localizedFotos : localizedMerged,
        photos:
          Array.isArray(hydratedSource?.photos)
            ? await localizeFileMetas(normalizeFileMetaArray(hydratedSource.photos))
            : kind === "FOTOS"
            ? localizedFotos
            : localizedMerged,
        imageUri:
          kind === "FOTOS"
            ? localizedFotos?.[0]?.uri || mainUri || hydratedSource?.imageUri
            : hydratedSource?.imageUri,
      };

      return patched;
    },
    [pk]
  );

  /** =========================
   * PDF helpers (Exporter)
   * ========================= */

  /**
   * ✅ IMPORTANT FIX:
   * exporter expects QueueItem-like wrapper:
   * { kind: "...", payload: { date,text,note,files,row:{...} } }
   */
  const buildRowForExporter = useCallback(
    (kind: "REGIE" | "LS" | "FOTOS", item: any) => {
      const r = item || {};
      const dateYmd = toYmd(r?.date || r?.datum || r?.createdAt || r?.submittedAt || r?.timestamp);

      // files pool
      const poolA = normalizeFileMetaArray(r?.files);
      const poolB = normalizeFileMetaArray(r?.attachments);
      const poolC = normalizeFileMetaArray(r?.photos);

      const fromLines = Array.isArray(r?.rows)
        ? normalizeFileMetaArray((r.rows || []).flatMap((x: any) => x?.photos || []))
        : [];

      // fotos main imageUri if present
      const mainUri = String(r?.imageUri || r?.imageMeta?.uri || "").trim();
      const mainArr = mainUri
        ? normalizeFileMetaArray([{ uri: mainUri, name: "photo_main.jpg", type: inferMimeFromUri(mainUri) }])
        : [];

      const mergedPool = normalizeFileMetaArray([...poolA, ...poolB, ...poolC, ...fromLines]);
      const filesForPhotos = normalizeFileMetaArray([...mainArr, ...mergedPool]);

      // text fields
      const text =
        String(r?.text || r?.comment || r?.leistung || r?.rows?.[0]?.comment || "").trim() ||
        String(r?.bemerkungen || r?.notes || r?.note || "").trim();

      const note = String(r?.bemerkungen || r?.notes || r?.note || "").trim();
      const hours = (r?.hours ?? r?.rows?.[0]?.hours ?? undefined) as any;

      if (kind === "REGIE") {
        return {
          kind: "REGIE",
          payload: {
            date: dateYmd,
            text,
            hours,
            note,
            files: mergedPool,
            row: {
              ...r,
              projectId: pk,
              projectCode: pk,
              date: dateYmd,
              text,
              hours,
              note,
              files: mergedPool,
              attachments: mergedPool,
              photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : mergedPool,
            },
          },
        };
      }

      if (kind === "LS") {
        return {
          kind: "LIEFERSCHEIN",
          payload: {
            date: dateYmd,
            text,
            note,
            files: mergedPool,
            row: {
              ...r,
              projectId: pk,
              projectCode: pk,
              date: dateYmd,
              text,
              note,
              files: mergedPool,
              attachments: mergedPool,
            },
          },
        };
      }

      // FOTOS
      return {
        kind: "PHOTOS",
        payload: {
          date: dateYmd,
          text,
          note,
          files: filesForPhotos,
          row: {
            ...r,
            projectId: pk,
            projectCode: pk,
            date: dateYmd,
            text,
            note,
            files: filesForPhotos,
            attachments: filesForPhotos,
            photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : filesForPhotos,
            imageUri: mainUri || r?.imageUri || undefined,
          },
        },
      };
    },
    [pk]
  );

  const ensurePdf = useCallback(
    async (kind: "REGIE" | "LS" | "FOTOS", item: any): Promise<PdfExportResult> => {
      if (!canWork) throw new Error("Projekt-Code (BA-...) fehlt.");

      const docId = String(item?.id || "").trim();
      if (!docId) throw new Error("Dokument-ID fehlt.");

      // ✅ NEW: fetch full snapshot before exporting (prevents empty PDFs)
      const full = await tryFetchFullDoc(kind, pk, docId);
      const source = full || item;

      const projectTitle = String(title || "").trim();
      const rowForExporter: any = buildRowForExporter(kind, source);

      // ✅ FIX (ONLY FOR FOTOS):
      // In SERVER_SYNC, fotos files are often remote URLs; the PDF exporter expects file://
      // So we download attachments + main imageUri to cache BEFORE export.
      if (kind === "FOTOS") {
        try {
          if (Array.isArray(rowForExporter?.payload?.files)) {
            rowForExporter.payload.files = await localizeFileMetas(rowForExporter.payload.files);
          }
          if (Array.isArray(rowForExporter?.payload?.row?.files)) {
            rowForExporter.payload.row.files = await localizeFileMetas(rowForExporter.payload.row.files);
          }
          if (Array.isArray(rowForExporter?.payload?.row?.attachments)) {
            rowForExporter.payload.row.attachments = await localizeFileMetas(rowForExporter.payload.row.attachments);
          }
          if (Array.isArray(rowForExporter?.payload?.row?.photos)) {
            rowForExporter.payload.row.photos = await localizeFileMetas(rowForExporter.payload.row.photos);
          }

          const img = String(rowForExporter?.payload?.row?.imageUri || "").trim();
          if (img) {
            rowForExporter.payload.row.imageUri = await downloadToCacheIfNeeded(img, "photo_main.jpg");
          }
        } catch (e) {
          // best-effort: if cache download fails, exporter still runs (may produce blank images, but not crash)
          if (__DEV__) console.warn("FOTOS pdf localize failed (best-effort)", e);
        }
      }

      const ymd = toYmd((source as any)?.date || (source as any)?.datum || (source as any)?.createdAt);
      const short = docId.slice(0, 8);

      let out: PdfExportResult;
      if (kind === "REGIE") {
        out = (await exportRegiePdfToProject({
          projectFsKey: pk,
          projectTitle,
          row: rowForExporter,
          filenameHint: `Regiebericht_${ymd}_${pk}_${short}`,
        } as any)) as any;
      } else if (kind === "LS") {
        out = (await exportLieferscheinPdfToProject({
          projectFsKey: pk,
          projectTitle,
          row: rowForExporter,
          filenameHint: `Lieferschein_${ymd}_${pk}_${short}`,
        } as any)) as any;
      } else {
        out = (await exportPhotosPdfToProject({
          projectFsKey: pk,
          projectTitle,
          row: rowForExporter,
          filenameHint: `Fotos_${ymd}_${pk}_${short}`,
        } as any)) as any;
      }

      if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein Output).");
      return out;
    },
    [buildRowForExporter, canWork, pk, title]
  );

  const onCreatePdf = useCallback(
    async (kind: "REGIE" | "LS" | "FOTOS", item: any) => {
      try {
        setBusy(true);
        const out = await ensurePdf(kind, item);
        Alert.alert("PDF erstellt", `${out.fileName}\n\nGespeichert lokal (offline) und bereit zum Versenden.`);
      } catch (e: any) {
        Alert.alert("PDF Fehler", String(e?.message || "unbekannt"));
      } finally {
        setBusy(false);
      }
    },
    [ensurePdf]
  );

  const onEmailPdf = useCallback(
    async (kind: "REGIE" | "LS" | "FOTOS", item: any) => {
      try {
        setBusy(true);

        // ✅ recipients from TeamRolesScreen / Projekt-Meta
        const roles =
          (await getProjectRoles(pk)) || (await getProjectRoles(String(projectId || "").trim())) || null;

        const to = splitEmails((roles as any)?.emails?.bauleiter);
        const cc = splitEmails((roles as any)?.emails?.buero);
        const bcc = splitEmails((roles as any)?.emails?.extern);

        const out = await ensurePdf(kind, item);

        const subjectBase = kind === "REGIE" ? "Regiebericht" : kind === "LS" ? "Lieferschein" : "Fotodokumentation";
        const subject = `${subjectBase} ${pk} – ${out.date}`;

        // ✅ iOS: allegare SOLO file:// pdf
        const att = [out.pdfUri].filter((u) => typeof u === "string" && u.startsWith("file://"));
        if (!att.length) throw new Error("Kein gültiger PDF-Anhang (file://).");

        await emailPdf({
          subject,
          body: "",
          attachments: att,
          to: to.length ? to : undefined,
          cc: cc.length ? cc : undefined,
          bcc: bcc.length ? bcc : undefined,
        });
      } catch (e: any) {
        Alert.alert("E-Mail Fehler", String(e?.message || "unbekannt"));
      } finally {
        setBusy(false);
      }
    },
    [ensurePdf, pk, projectId]
  );

  /** =========================
   * Queue executor (REAL sync)
   * ========================= */
  const queueExecutor = useCallback(async (item: QueueItem) => {
    if (!looksLikeProjectCode(item.projectId)) {
      throw new Error("Queue item projectId ist kein BA-... (FS-key).");
    }

    if (item.kind === "REGIE") {
      const row = (item as any)?.payload?.row || (item as any)?.payload || {};
      if (typeof (api as any).pushRegieToServer !== "function") {
        throw new Error("pushRegieToServer fehlt");
      }
      return (api as any).pushRegieToServer(item.projectId, row);
    }

    if (item.kind === "LIEFERSCHEIN") {
      const row = (item as any)?.payload?.row || (item as any)?.payload || {};
      if (typeof (api as any).pushLieferscheinToServer !== "function") {
        throw new Error("pushLieferscheinToServer fehlt");
      }
      return (api as any).pushLieferscheinToServer(item.projectId, row);
    }

    if (item.kind === "PHOTO_NOTE" || item.kind === "FOTOS_NOTIZEN") {
      const p = (item as any)?.payload || {};

      const filesFromPayload = Array.isArray(p?.files) ? p.files : [];
      const imageUri = p?.imageUri ? [{ uri: p.imageUri, name: "photo.jpg", type: "image/jpeg" }] : [];

      const date = String(p?.date || p?.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);

      const docId = String(p?.docId || p?.id || item.id || "").trim() || undefined;

      const upload = await (api as any).uploadPhotosFiles(item.projectId, {
        docId,
        date,
        comment: String(p?.comment || p?.note || ""),
        bemerkungen: String(p?.bemerkungen || ""),
        kostenstelle: String(p?.kostenstelle || ""),
        lvItemPos: p?.lvItemPos ?? null,
        files: [...imageUri, ...filesFromPayload].filter((x: any) => !!x?.uri),
      });

      return upload;
    }

    throw new Error("Unknown queue kind");
  }, []);

  const syncQueueNow = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!canWork) return;
      try {
        const locked = await queueIsLocked();
        if (locked) return;

        setBusy(true);
        const res = await queueFlush(queueExecutor, {
          maxItems: 25,
          stopOnError: false,
          includeErrors: true,
          maxTries: 8,
        });

        if (!opts?.silent && res.processed > 0) {
          Alert.alert("Sync Queue", `Verarbeitet: ${res.processed}\nDone: ${res.done}\nError: ${res.errored}`);
        }
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (msg.includes("QUEUE_LOCKED")) return;
        if (!opts?.silent) Alert.alert("Sync Queue fehlgeschlagen", msg || "unbekannt");
      } finally {
        setBusy(false);
      }
    },
    [canWork, queueExecutor]
  );

  /** =========================
   * Server sync: inbox list
   * ========================= */
  const pullServerInbox = useCallback(async () => {
    if (!canWork) return { okLs: false, okRegie: false, okFotos: false };

    let okLs = false;
    let okRegie = false;
    let okFotos = false;

    // LS inbox
    try {
      const r = await serverRequest<InboxListResponse<any>>(`/api/ls/inbox/list?projectId=${encodeURIComponent(pk)}`);
      const items = Array.isArray(r?.items) ? r.items : [];
      const normalized: InboxLs[] = items
        .map((x: any) => {
          const pc =
            String(x?.projectCode || "").trim() ||
            (looksLikeProjectCode(String(x?.projectId || "").trim()) ? String(x?.projectId || "").trim() : "") ||
            pk;

          return {
            ...x,
            kind: "lieferschein",
            id: String(x?.id || x?.docId || "").trim(),
            projectId: String(x?.projectId || pk),
            projectCode: pc,
            workflowStatus: (x?.workflowStatus || "EINGEREICHT") as WorkflowStatus,
            attachments: Array.isArray(x?.attachments) ? x.attachments : Array.isArray(x?.photos) ? x.photos : [],
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));

      setLs(normalized);
      await saveList(INBOX_KEY_LS(pk), normalized);
      okLs = true;
    } catch {
      // ignore
    }

    // REGIE inbox
    try {
      const r = await serverRequest<InboxListResponse<any>>(`/api/regie/inbox/list?projectId=${encodeURIComponent(pk)}`);
      const items = Array.isArray(r?.items) ? r.items : [];
      const normalized: InboxRegie[] = items
        .map((x: any) => {
          const pc =
            String(x?.projectCode || "").trim() ||
            (looksLikeProjectCode(String(x?.projectId || "").trim()) ? String(x?.projectId || "").trim() : "") ||
            pk;

          return {
            ...x,
            kind: "regie",
            id: String(x?.id || x?.docId || "").trim(),
            projectId: String(x?.projectId || pk),
            projectCode: pc,
            workflowStatus: (x?.workflowStatus || "EINGEREICHT") as WorkflowStatus,
            text: x?.text ?? x?.comment ?? "",
            attachments: Array.isArray(x?.attachments) ? x.attachments : Array.isArray(x?.photos) ? x.photos : [],
            photos: Array.isArray(x?.photos) ? x.photos : undefined,
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));

      setRegie(normalized);
      await saveList(INBOX_KEY_REGIE(pk), normalized);
      okRegie = true;
    } catch {
      // ignore
    }

    // ✅ FOTOS inbox (try multiple endpoints)
    try {
      const paths = [
        `/api/photos/inbox/list?projectId=${encodeURIComponent(pk)}`,
        `/api/fotos/inbox/list?projectId=${encodeURIComponent(pk)}`,
        `/api/inbox/${encodeURIComponent(pk)}/fotos/list`,
      ];

      let r: any = null;
      let lastErr: any = null;

      for (const p of paths) {
        try {
          r = await serverRequest<InboxListResponse<any>>(p);
          if (r) break;
        } catch (e: any) {
          lastErr = e;
        }
      }
      if (!r) throw lastErr || new Error("FOTOS list failed");

      const items = Array.isArray(r?.items) ? r.items : [];

      const normalized: InboxFotos[] = items
        .map((x: any) => {
          const pc =
            String(x?.projectCode || "").trim() ||
            (looksLikeProjectCode(String(x?.projectId || "").trim()) ? String(x?.projectId || "").trim() : "") ||
            pk;

          return {
            ...x,
            kind: "fotos",
            id: String(x?.docId || x?.id || "").trim(),
            projectId: String(x?.projectId || pk),
            projectCode: pc,
            workflowStatus: (x?.workflowStatus || "EINGEREICHT") as WorkflowStatus,
            date: String(x?.date || "").slice(0, 10) || undefined,
            comment: x?.comment ?? "",
            bemerkungen: x?.bemerkungen ?? "",
            kostenstelle: x?.kostenstelle ?? "",
            lvItemPos: x?.lvItemPos ?? null,
            attachments: Array.isArray(x?.attachments) ? x.attachments : Array.isArray(x?.photos) ? x.photos : [],
            photos: Array.isArray(x?.photos) ? x.photos : undefined,
            imageUri: x?.imageUri || x?.image?.uri || undefined,
            imageMeta: x?.imageMeta || x?.image || undefined,
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));

      setFotos(normalized);
      await saveList(INBOX_KEY_FOTOS(pk), normalized);
      okFotos = true;
    } catch {
      // ignore
    }

    return { okLs, okRegie, okFotos };
  }, [canWork, pk]);

  const reload = useCallback(async () => {
    if (!canWork) {
      setRegie([]);
      setLs([]);
      setFotos([]);
      return;
    }

    // 1) server
    const res = await pullServerInbox();

    // 2) fallback local if not updated
    const [rLocal, lLocal, fLocal] = await Promise.all([
      loadList<InboxRegie[]>(INBOX_KEY_REGIE(pk), []),
      loadList<InboxLs[]>(INBOX_KEY_LS(pk), []),
      loadList<InboxFotos[]>(INBOX_KEY_FOTOS(pk), []),
    ]);

    const rr = Array.isArray(rLocal) ? rLocal : [];
    const ll = Array.isArray(lLocal) ? lLocal : [];
    const ff = Array.isArray(fLocal) ? fLocal : [];

    rr.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    ll.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    ff.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));

    if (!res.okRegie && rr.length) setRegie(rr);
    if (!res.okLs && ll.length) setLs(ll);
    if (!res.okFotos && ff.length) setFotos(ff);
  }, [canWork, pk, pullServerInbox]);

  useEffect(() => {
    (async () => {
      const ok = await enforceServerSync(navigation);
      if (!ok) return;
      reload();
    })();
  }, [navigation, reload]);

  // ✅ onFocus: enforce SERVER_SYNC, try silent queue flush, then reload inbox
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const ok = await enforceServerSync(navigation);
        if (!ok) return;

        try {
          await syncQueueNow({ silent: true });
        } catch {}
        if (alive) await reload();
      })();

      return () => {
        alive = false;
      };
    }, [navigation, syncQueueNow, reload])
  );

  /** =========================
   * Helpers: update / remove item
   * ========================= */
  const updateRegieItem = useCallback(
    async (id: string, patch: Partial<InboxRegie>) => {
      const next = regie.map((x) => (x.id === id ? { ...x, ...patch } : x));
      setRegie(next);
      await saveList(INBOX_KEY_REGIE(pk), next);
    },
    [regie, pk]
  );

  const updateLsItem = useCallback(
    async (id: string, patch: Partial<InboxLs>) => {
      const next = ls.map((x) => (x.id === id ? { ...x, ...patch } : x));
      setLs(next);
      await saveList(INBOX_KEY_LS(pk), next);
    },
    [ls, pk]
  );

  const updateFotosItem = useCallback(
    async (id: string, patch: Partial<InboxFotos>) => {
      const next = fotos.map((x) => (x.id === id ? { ...x, ...patch } : x));
      setFotos(next);
      await saveList(INBOX_KEY_FOTOS(pk), next);
    },
    [fotos, pk]
  );

  const removeRegieItem = useCallback(
    async (id: string) => {
      const next = regie.filter((x) => x.id !== id);
      setRegie(next);
      await saveList(INBOX_KEY_REGIE(pk), next);
    },
    [regie, pk]
  );

  const removeLsItem = useCallback(
    async (id: string) => {
      const next = ls.filter((x) => x.id !== id);
      setLs(next);
      await saveList(INBOX_KEY_LS(pk), next);
    },
    [ls, pk]
  );

  const removeFotosItem = useCallback(
    async (id: string) => {
      const next = fotos.filter((x) => x.id !== id);
      setFotos(next);
      await saveList(INBOX_KEY_FOTOS(pk), next);
    },
    [fotos, pk]
  );

  /** =========================
   * Approve / Reject actions
   * ========================= */
  const approveLs = useCallback(
    async (id: string) => {
      const item = ls.find((x) => x.id === id);
      if (!item) return;

      try {
        setBusy(true);
        await tryApprove("LS", pk, id);
        await removeLsItem(id);
        Alert.alert("Freigabe", "Lieferschein wurde freigegeben (Inbox → Final).");
        await pullServerInbox();
      } catch (e: any) {
        const msg = String(e?.message || "Approve failed");
        await updateLsItem(id, { syncStatus: "ERROR", syncError: msg });
        Alert.alert("Freigabe fehlgeschlagen", msg);
      } finally {
        setBusy(false);
      }
    },
    [ls, pk, pullServerInbox, removeLsItem, updateLsItem]
  );

  const approveRegie = useCallback(
    async (id: string) => {
      const item = regie.find((x) => x.id === id);
      if (!item) return;

      try {
        setBusy(true);
        await tryApprove("REGIE", pk, id);
        await removeRegieItem(id);
        Alert.alert("Freigabe", "Regie wurde freigegeben (Inbox → Regieberichte).");
        await pullServerInbox();
      } catch (e: any) {
        const msg = String(e?.message || "Approve failed");
        await updateRegieItem(id, { syncStatus: "ERROR", syncError: msg });
        Alert.alert("Freigabe fehlgeschlagen", msg);
      } finally {
        setBusy(false);
      }
    },
    [pk, regie, pullServerInbox, removeRegieItem, updateRegieItem]
  );

  const approveFotos = useCallback(
    async (id: string) => {
      const item = fotos.find((x) => x.id === id);
      if (!item) return;

      try {
        setBusy(true);

        await tryApprove("FOTOS", pk, id);

        await removeFotosItem(id);
        Alert.alert("Freigabe", "Foto/Notiz wurde freigegeben (Inbox → Final).");
        await pullServerInbox();
      } catch (e: any) {
        const msg = String(e?.message || "Approve failed");
        await updateFotosItem(id, { syncStatus: "ERROR", syncError: msg });
        Alert.alert("Freigabe fehlgeschlagen", msg);
      } finally {
        setBusy(false);
      }
    },
    [fotos, pk, pullServerInbox, removeFotosItem, updateFotosItem]
  );

  const openReject = useCallback((kind: "REGIE" | "LS" | "FOTOS", id: string) => {
    setRejectTarget({ kind, id });
    setRejectReason("");
    setRejectOpen(true);
  }, []);

  const confirmReject = useCallback(async () => {
    const t = rejectTarget;
    if (!t) return;

    const reason = String(rejectReason || "").trim();
    if (!reason) {
      Alert.alert("Ablehnen", "Bitte einen Ablehnungsgrund eingeben.");
      return;
    }

    try {
      setBusy(true);

      if (t.kind === "LS") {
        try {
          await serverRequest(`/api/ls/inbox/reject`, {
            method: "POST",
            body: JSON.stringify({ projectId: pk, docId: t.id, reason }),
          });

          await updateLsItem(t.id, {
            workflowStatus: "ABGELEHNT",
            rejectionReason: reason,
            syncStatus: "SENT",
            syncError: null,
          });

          setRejectOpen(false);
          setRejectTarget(null);

          Alert.alert("Ablehnen", "Lieferschein wurde abgelehnt.");
          await pullServerInbox();
          return;
        } catch (e: any) {
          const msg = e?.message || "Reject failed";
          await updateLsItem(t.id, {
            workflowStatus: "EINGEREICHT",
            syncStatus: "ERROR",
            syncError: msg,
          });
          Alert.alert("Ablehnen fehlgeschlagen", "Server Fehler: " + String(msg));
          return;
        }
      }

      if (t.kind === "REGIE") {
        try {
          await serverRequest(`/api/regie/inbox/reject`, {
            method: "POST",
            body: JSON.stringify({ projectId: pk, docId: t.id, reason }),
          });

          await updateRegieItem(t.id, {
            workflowStatus: "ABGELEHNT",
            rejectionReason: reason,
            syncStatus: "SENT",
            syncError: null,
          });

          setRejectOpen(false);
          setRejectTarget(null);

          Alert.alert("Ablehnen", "Regie wurde abgelehnt.");
          await pullServerInbox();
          return;
        } catch (e: any) {
          const msg = e?.message || "Reject failed";
          await updateRegieItem(t.id, {
            workflowStatus: "EINGEREICHT",
            syncStatus: "ERROR",
            syncError: msg,
          });
          Alert.alert("Ablehnen fehlgeschlagen", "Server Fehler: " + String(msg));
          return;
        }
      }

      if (t.kind === "FOTOS") {
        const candidates = [
          { path: `/api/photos/inbox/reject`, body: { projectId: pk, docId: t.id, reason } },
          { path: `/api/photos/reject`, body: { projectId: pk, docId: t.id, reason } },
          {
            path: `/api/inbox/${encodeURIComponent(pk)}/fotos/${encodeURIComponent(t.id)}/reject`,
            body: { reason },
          },
          { path: `/api/fotos/inbox/reject`, body: { projectId: pk, docId: t.id, reason } },
        ];

        let lastErr: any = null;
        for (const c of candidates) {
          try {
            await serverRequest(c.path, { method: "POST", body: JSON.stringify(c.body) });

            await updateFotosItem(t.id, {
              workflowStatus: "ABGELEHNT",
              rejectionReason: reason,
              syncStatus: "SENT",
              syncError: null,
            });

            setRejectOpen(false);
            setRejectTarget(null);

            Alert.alert("Ablehnen", "Foto/Notiz wurde abgelehnt.");
            await pullServerInbox();
            return;
          } catch (e: any) {
            lastErr = e;
          }
        }

        const msg = lastErr?.message || "Reject failed";
        await updateFotosItem(t.id, {
          workflowStatus: "EINGEREICHT",
          syncStatus: "ERROR",
          syncError: msg,
        });
        Alert.alert("Ablehnen fehlgeschlagen", "Server Fehler: " + String(msg));
        return;
      }
    } finally {
      setBusy(false);
    }
  }, [pk, pullServerInbox, rejectReason, rejectTarget, updateLsItem, updateRegieItem, updateFotosItem]);

  /** =========================
   * Navigation: open/edit items
   * ========================= */
  const openRegie = useCallback(
    async (id: string) => {
      const item = regie.find((x) => x.id === id);
      try {
        setBusy(true);
        const inboxSnapshot = await prepareSnapshotForOpen("REGIE", id, item);
        navigation.navigate("Regie", {
          projectId,
          projectCode: pk,
          fromInbox: true,
          editId: id,
          title: "Regie (Eingang)",
          // ✅ NEW: pass full data (lines + local file:// attachments)
          inboxSnapshot,
        } as any);
      } finally {
        setBusy(false);
      }
    },
    [navigation, pk, projectId, regie, prepareSnapshotForOpen]
  );

  const openLs = useCallback(
    async (id: string) => {
      const item = ls.find((x) => x.id === id);
      try {
        setBusy(true);
        const inboxSnapshot = await prepareSnapshotForOpen("LS", id, item);
        navigation.navigate("Lieferschein", {
          projectId,
          projectCode: pk,
          fromInbox: true,
          editId: id,
          title: "Lieferschein (Eingang)",
          inboxSnapshot,
        } as any);
      } finally {
        setBusy(false);
      }
    },
    [navigation, pk, projectId, ls, prepareSnapshotForOpen]
  );

  const openFotos = useCallback(
    async (id: string) => {
      const item = fotos.find((x) => x.id === id);
      try {
        setBusy(true);
        const inboxSnapshot = await prepareSnapshotForOpen("FOTOS", id, item);
        navigation.navigate(
          "PhotosNotes",
          {
            projectId,
            projectCode: pk,
            fromInbox: true,
            editId: id,
            title: "Fotos / Notizen (Eingang)",
            inboxSnapshot,
          } as any
        );
      } finally {
        setBusy(false);
      }
    },
    [navigation, pk, projectId, fotos, prepareSnapshotForOpen]
  );

  /** =========================
   * Render cards
   * ========================= */

  function RegieCard({ item }: { item: InboxRegie }) {
    const wCol = statusColor(item.workflowStatus);
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardDate}>{safeDate(item.date)}</Text>
            <Text style={s.cardSub} numberOfLines={2}>
              {(item.text || item.comment ? String(item.text || item.comment) : "Regie").slice(0, 140)}
              {item.hours ? ` • ${item.hours}h` : ""}
            </Text>
          </View>

          <View style={[s.pill, { borderColor: wCol, backgroundColor: alpha(wCol, 0.12) }]}>
            <Text style={[s.pillTxt, { color: wCol }]}>{item.workflowStatus}</Text>
          </View>
        </View>

        {item.rejectionReason ? <Text style={[s.err, { color: T.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable
            style={[s.chipBtn, { borderColor: alpha(T.primary, 0.4) }]}
            onPress={() => openRegie(item.id)}
            disabled={busy}
          >
            <Text style={[s.chipTxt, { color: T.primary }]}>Öffnen</Text>
          </Pressable>

          <Pressable
            style={[s.chipBtn, { borderColor: alpha(T.text, 0.25) }]}
            onPress={() => onCreatePdf("REGIE", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, { color: T.text }]}>PDF</Text>
          </Pressable>

          <Pressable
            style={[s.chipFill, { backgroundColor: T.text, borderColor: T.text }]}
            onPress={() => onEmailPdf("REGIE", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, { color: "#fff" }]}>E-Mail</Text>
          </Pressable>

          {item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT" ? (
            <>
              <Pressable
                style={[s.chipFill, { backgroundColor: T.primary, borderColor: T.primary }, busy && { opacity: 0.65 }]}
                onPress={() => approveRegie(item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, { color: "#fff" }]}>Freigeben</Text>
              </Pressable>

              <Pressable
                style={[s.chipFill, { backgroundColor: T.danger, borderColor: T.danger }, busy && { opacity: 0.65 }]}
                onPress={() => openReject("REGIE", item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, { color: "#fff" }]}>Ablehnen</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  function LsCard({ item }: { item: InboxLs }) {
    const wCol = statusColor(item.workflowStatus);
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardDate}>{safeDate(item.date)}</Text>
            <Text style={s.cardSub} numberOfLines={2}>
              {item.lieferscheinNummer ? `LS: ${item.lieferscheinNummer}` : "Lieferschein"}
              {item.kostenstelle ? ` • KS: ${item.kostenstelle}` : ""}
              {item.lvItemPos ? ` • LV: ${item.lvItemPos}` : ""}
            </Text>
          </View>

          <View style={[s.pill, { borderColor: wCol, backgroundColor: alpha(wCol, 0.12) }]}>
            <Text style={[s.pillTxt, { color: wCol }]}>{item.workflowStatus}</Text>
          </View>
        </View>

        {!!item.comment ? <Text style={s.cardBody}>{item.comment}</Text> : null}

        {item.rejectionReason ? <Text style={[s.err, { color: T.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable
            style={[s.chipBtn, { borderColor: alpha(T.primary, 0.4) }]}
            onPress={() => openLs(item.id)}
            disabled={busy}
          >
            <Text style={[s.chipTxt, { color: T.primary }]}>Öffnen</Text>
          </Pressable>

          <Pressable
            style={[s.chipBtn, { borderColor: alpha(T.text, 0.25) }]}
            onPress={() => onCreatePdf("LS", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, { color: T.text }]}>PDF</Text>
          </Pressable>

          <Pressable
            style={[s.chipFill, { backgroundColor: T.text, borderColor: T.text }]}
            onPress={() => onEmailPdf("LS", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, { color: "#fff" }]}>E-Mail</Text>
          </Pressable>

          {item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT" ? (
            <>
              <Pressable
                style={[s.chipFill, { backgroundColor: T.primary, borderColor: T.primary }, busy && { opacity: 0.65 }]}
                onPress={() => approveLs(item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, { color: "#fff" }]}>Freigeben</Text>
              </Pressable>

              <Pressable
                style={[s.chipFill, { backgroundColor: T.danger, borderColor: T.danger }, busy && { opacity: 0.65 }]}
                onPress={() => openReject("LS", item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, { color: "#fff" }]}>Ablehnen</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  function FotosCard({ item }: { item: InboxFotos }) {
    const comment = String(item.comment || "").trim();
    const bemerk = String(item.bemerkungen || "").trim();
    const line1 = comment || bemerk ? (comment || bemerk).slice(0, 160) : "Foto / Notiz";
    const attachCount = Array.isArray(item.attachments) ? item.attachments.length : 0;
    const wCol = statusColor(item.workflowStatus);

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardDate}>{safeDate(item.date)}</Text>
            <Text style={s.cardSub} numberOfLines={2}>
              {line1}
              {item.kostenstelle ? ` • KS: ${item.kostenstelle}` : ""}
              {item.lvItemPos ? ` • LV: ${item.lvItemPos}` : ""}
              {attachCount ? ` • Dateien: ${attachCount}` : ""}
            </Text>
          </View>

          <View style={[s.pill, { borderColor: wCol, backgroundColor: alpha(wCol, 0.12) }]}>
            <Text style={[s.pillTxt, { color: wCol }]}>{item.workflowStatus}</Text>
          </View>
        </View>

        {item.rejectionReason ? <Text style={[s.err, { color: T.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable
            style={[s.chipBtn, { borderColor: alpha(T.primary, 0.4) }]}
            onPress={() => openFotos(item.id)}
            disabled={busy}
          >
            <Text style={[s.chipTxt, { color: T.primary }]}>Öffnen</Text>
          </Pressable>

          <Pressable
            style={[s.chipBtn, { borderColor: alpha(T.text, 0.25) }]}
            onPress={() => onCreatePdf("FOTOS", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, { color: T.text }]}>PDF</Text>
          </Pressable>

          <Pressable
            style={[s.chipFill, { backgroundColor: T.text, borderColor: T.text }]}
            onPress={() => onEmailPdf("FOTOS", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, { color: "#fff" }]}>E-Mail</Text>
          </Pressable>

          {item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT" ? (
            <>
              <Pressable
                style={[s.chipFill, { backgroundColor: T.primary, borderColor: T.primary }, busy && { opacity: 0.65 }]}
                onPress={() => approveFotos(item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, { color: "#fff" }]}>Freigeben</Text>
              </Pressable>

              <Pressable
                style={[s.chipFill, { backgroundColor: T.danger, borderColor: T.danger }, busy && { opacity: 0.65 }]}
                onPress={() => openReject("FOTOS", item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, { color: "#fff" }]}>Ablehnen</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const shown = tab === "REGIE" ? regie : tab === "LS" ? ls : fotos;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.page}>
          {/* ===== DARK HEADER ===== */}
          <View style={s.darkHeader}>
            <View style={s.darkHeadRow}>
              <View style={s.darkAccent} />
              <View style={{ flex: 1 }}>
                <Text style={s.brandTop}>RLC Bausoftware</Text>
                <Text style={s.brandSub}>Eingang / Prüfung</Text>
                <Text style={s.h1}>Eingang</Text>
                <Text style={s.hSub}>
                  Projekt: <Text style={{ fontWeight: "900" }}>{displayProjectCode}</Text>
                  {projectId && !looksLikeProjectCode(String(projectId)) && __DEV__ ? ` • DB: ${String(projectId)}` : ""}
                </Text>
              </View>
            </View>

            {!canWork ? (
              <View style={s.warnBoxDark}>
                <Text style={s.warnTitleDark}>Projekt-Code fehlt</Text>
                <Text style={s.warnTextDark}>
                  Projekt-Code (BA-...) fehlt oder ungültig. Navigation muss projectCode korrekt übergeben.
                </Text>
              </View>
            ) : null}

            {/* Tabs */}
            <View style={s.tabsDark}>
              <Pressable style={[s.tabDark, tab === "REGIE" && s.tabDarkActive]} onPress={() => setTab("REGIE")}>
                <Text style={[s.tabDarkTxt, tab === "REGIE" && s.tabDarkTxtActive]}>Regie ({regie.length})</Text>
              </Pressable>
              <Pressable style={[s.tabDark, tab === "LS" && s.tabDarkActive]} onPress={() => setTab("LS")}>
                <Text style={[s.tabDarkTxt, tab === "LS" && s.tabDarkTxtActive]}>Lieferscheine ({ls.length})</Text>
              </Pressable>
              <Pressable style={[s.tabDark, tab === "FOTOS" && s.tabDarkActive]} onPress={() => setTab("FOTOS")}>
                <Text style={[s.tabDarkTxt, tab === "FOTOS" && s.tabDarkTxtActive]}>Fotos ({fotos.length})</Text>
              </Pressable>
            </View>

            {/* actions */}
            <View style={s.headerActions}>
              <Pressable style={[s.btnOutline, busy && { opacity: 0.65 }]} onPress={reload} disabled={busy}>
                <Text style={s.btnOutlineTxt}>{busy ? "…" : "Aktualisieren"}</Text>
              </Pressable>

              <Pressable
                style={[s.btnOutline2, busy && { opacity: 0.65 }]}
                onPress={() => syncQueueNow({ silent: false })}
                disabled={busy || !canWork}
              >
                <Text style={s.btnOutline2Txt}>Sync Queue</Text>
              </Pressable>
            </View>
          </View>

          {/* ===== LIST ===== */}
          <FlatList
            data={shown}
            // ✅ FIX: avoid duplicate keys (server may return same id twice)
            keyExtractor={(x: any, i: number) => {
              const id = String(x?.id || "").trim();
              const ts = String(x?.submittedAt || x?.createdAt || x?.date || "");
              const kind = String((x as any)?.kind || tab).toUpperCase();
              return `${kind}:${id || "noid"}:${ts}:${i}`;
            }}
            contentContainerStyle={s.listPad}
            renderItem={({ item }: any) =>
              tab === "REGIE" ? (
                <RegieCard item={item as InboxRegie} />
              ) : tab === "LS" ? (
                <LsCard item={item as InboxLs} />
              ) : (
                <FotosCard item={item as InboxFotos} />
              )
            }
            ListEmptyComponent={
              <View style={{ paddingTop: 6, paddingHorizontal: 16 }}>
                <Text style={{ opacity: 0.72, color: T.muted, fontWeight: "800" }}>
                  Kein Eingang vorhanden. Einreichen muss zuerst aus dem jeweiligen Screen erfolgen.
                </Text>
              </View>
            }
          />

          {/* Reject Modal */}
          <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
            <View style={s.modalBackdrop}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Ablehnen</Text>
                <Text style={s.modalSub}>Bitte Ablehnungsgrund eingeben:</Text>

                <TextInput
                  style={s.modalInput}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="z. B. Unleserlich / falsche Kostenstelle / fehlt Foto…"
                  placeholderTextColor="rgba(11,23,32,0.45)"
                  multiline
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    style={[s.btnOutlineModal, { flex: 1 }]}
                    onPress={() => {
                      setRejectOpen(false);
                      setRejectTarget(null);
                    }}
                    disabled={busy}
                  >
                    <Text style={s.btnTxtOutlineModal}>Abbrechen</Text>
                  </Pressable>

                  <Pressable style={[s.btnDangerModal, { flex: 1 }]} onPress={confirmReject} disabled={busy}>
                    <Text style={s.btnTxtWhite}>Ablehnen</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** =========================
 * Styles (DARK header + white cards)
 * ========================= */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: HD.bg },
  page: { flex: 1, backgroundColor: T.bg },

  // dark header
  darkHeader: {
    backgroundColor: HD.bg,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: HD.line,
  },
  darkHeadRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  darkAccent: { width: 8, height: 44, borderRadius: 8, backgroundColor: T.primary },

  brandTop: { color: HD.text, fontSize: 14, fontWeight: "800" },
  brandSub: { color: HD.muted, marginTop: 2, fontSize: 12, fontWeight: "800" },

  h1: { marginTop: 8, fontSize: 30, fontWeight: "900", color: "#fff" },
  hSub: { marginTop: 4, fontWeight: "800", color: HD.muted, fontSize: 12 },

  warnBoxDark: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(234,88,12,0.35)",
    backgroundColor: "rgba(234,88,12,0.14)",
    borderRadius: 16,
    padding: 12,
  },
  warnTitleDark: { fontWeight: "900", color: "#FDBA74" },
  warnTextDark: { marginTop: 6, color: "rgba(255,255,255,0.80)", fontWeight: "800" },

  tabsDark: { flexDirection: "row", gap: 10, marginTop: 12 },
  tabDark: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tabDarkActive: { backgroundColor: T.primary, borderColor: T.primary },
  tabDarkTxt: { fontWeight: "900", color: "rgba(255,255,255,0.82)", fontSize: 12 },
  tabDarkTxtActive: { color: "#fff" },

  headerActions: { flexDirection: "row", gap: 10, marginTop: 12 },

  btnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  btnOutlineTxt: { fontWeight: "900", fontSize: 12, color: "rgba(255,255,255,0.92)" },

  btnOutline2: {
    flex: 1,
    borderWidth: 1,
    borderColor: alpha(T.primary, 0.45),
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: alpha(T.primary, 0.12),
  },
  btnOutline2Txt: { fontWeight: "900", fontSize: 12, color: "#fff" },

  // list
  listPad: { padding: 16, paddingBottom: 26, gap: 10 },

  // cards
  card: {
    borderWidth: 1,
    borderColor: alpha("#000000", 0.06),
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    ...shadowElev(),
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardDate: { fontWeight: "900", fontSize: 14, color: T.text },
  cardSub: { marginTop: 6, fontSize: 12, color: T.muted, fontWeight: "800", opacity: 0.95 },
  cardBody: { marginTop: 8, fontSize: 13, color: T.text, fontWeight: "700" },

  pill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillTxt: { fontSize: 11, fontWeight: "900" },

  err: { marginTop: 8, color: T.muted, fontSize: 12, fontWeight: "800" },

  actions: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },

  chipBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipFill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipTxt: { fontSize: 12, fontWeight: "900" },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: alpha("#000000", 0.08),
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: T.text },
  modalSub: { marginTop: 6, color: T.muted, fontWeight: "800" },
  modalInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: alpha(T.primary, 0.22),
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }) as any,
    minHeight: 96,
    textAlignVertical: "top",
    backgroundColor: alpha(T.primary, 0.06),
    color: T.text,
    fontWeight: "800",
  },

  btnOutlineModal: {
    borderWidth: 1,
    borderColor: alpha(T.primary, 0.35),
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: alpha(T.primary, 0.08),
  },
  btnTxtOutlineModal: { fontWeight: "900", fontSize: 12, color: T.primary },

  btnDangerModal: {
    borderWidth: 1,
    borderColor: T.danger,
    backgroundColor: T.danger,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  btnTxtWhite: { color: "#fff", fontWeight: "900", fontSize: 12 },
});
