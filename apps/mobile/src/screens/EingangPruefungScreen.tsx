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
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useFocusEffect } from "@react-navigation/native";
import RlcCategoryGrid, { RlcCategoryItem } from "../components/RlcCategoryGrid";

// ✅ NEW: cache downloads for auth-protected images/files
import * as FileSystem from "expo-file-system/legacy";

// ✅ NEW: hydrate preview (server URIs -> local file://)
import { hydrateRowForPreview } from "../lib/hydratePreview";

// API
import { api } from "../lib/api";
import { buildDocumentPdf } from "../lib/exporters/documentPdfBuilder";

// ✅ Team / Rollen (prefill Email Versand Ansprechpartner)
import { getProjectRoles } from "../storage/projectMeta";

// Offline Queue
import { queueFlush, queueIsLocked, QueueItem } from "../lib/offlineQueue";

// Theme
import { COLORS, RLC_SPACING, RLC_RADIUS } from "../ui/theme";

// ✅ PDF Exporter + Mail
import {
  exportRegiePdfToProject,
  exportLieferscheinPdfToProject,
  exportPhotosPdfToProject,
  exportTagesberichtPdfToProject,
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

  // ✅ keep both ids for server compatibility
  docId?: string;
  serverId?: string;
};

type InboxTagesbericht = InboxItemBase & {
  kind?: "tagesbericht";
  weather?: string;
  temperature?: string;
  workers?: string;
  machines?: string;
  workDone?: string;
  issues?: string;
  notes?: string;
  lines?: any[];
  reportType?: "TAGESBERICHT";
  docType?: "TAGESBERICHT";
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
const INBOX_KEY_TAGESBERICHT = (projectKey: string) =>
  `rlc_mobile_inbox_tagesbericht:${projectKey}`;



const INBOX_KEY_BAUTAGEBUCH = (projectKey: string) =>
  `rlc_mobile_inbox_bautagebuch:${projectKey}`;
const INBOX_KEY_ANGEBOT = (projectKey: string) =>
  `rlc_mobile_inbox_angebot:${projectKey}`;
const INBOX_KEY_RECHNUNG = (projectKey: string) =>
  `rlc_mobile_inbox_rechnung:${projectKey}`;
const INBOX_KEY_MENGEN = (projectKey: string) =>
  `rlc_mobile_inbox_mengen:${projectKey}`;
const INBOX_KEY_KALKULATION = (projectKey: string) =>
  `rlc_mobile_inbox_kalkulation:${projectKey}`;
const INBOX_KEYS_LS = (projectKey: string) => [
  `rlc_mobile_inbox_lieferschein:${projectKey}`,
  `rlc_mobile_inbox_ls:${projectKey}`,
];

async function loadLsCompat(projectKey: string): Promise<InboxLs[]> {
  const parts = await Promise.all(
    INBOX_KEYS_LS(projectKey).map((k) => loadList<InboxLs[]>(k, []))
  );

  const all = parts.flat().filter(Boolean);

  return all.filter((x: any, i, arr: any[]) => {
    const id = String(x?.id || x?.docId || x?.lieferscheinNummer || i);
    return (
      arr.findIndex((y: any, j) => {
        const yid = String(y?.id || y?.docId || y?.lieferscheinNummer || j);
        return yid === id;
      }) === i
    );
  });
}


function mergeById<T extends any>(a: T[], b: T[]): T[] {
  const all = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
  const seen = new Set<string>();
  const out: T[] = [];

  for (let i = 0; i < all.length; i++) {
    const x: any = all[i];
    const id = String(
      x?.id ||
        x?.docId ||
        x?.lieferscheinNummer ||
        x?.regieNr ||
        x?.number ||
        x?.date ||
        i
    );
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }

  return out;
}

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
const UI = {
  bg: COLORS.bg,
  card: COLORS.card,
  card2: COLORS.card2,
  text: COLORS.text,
  sub: COLORS.sub,
  border: COLORS.border,
  accent: COLORS.accent,
  accentDark: COLORS.accentDark,
  textLight: COLORS.textLight,
  inputBg: COLORS.inputBg,
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
  if (w === "FREIGEGEBEN") return UI.accent;
  if (w === "ABGELEHNT") return COLORS.danger;
  if (w === "EINGEREICHT") return UI.accentDark;
  return UI.sub;
}

function shadowElev() {
  return Platform.select({
    ios: {
      shadowColor: COLORS.text,
      shadowOpacity: 0.08,
      shadowRadius: 14,
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

  let u2 = uri;
  if (/^projects\//i.test(u2)) u2 = "/" + u2;

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
  } catch {}

  return uri;
}

function rewriteInboxUri(uriRaw: string, projectFsKey: string): string {
  const uri = String(uriRaw || "").trim();
  if (!uri) return uri;

  const pk = String(projectFsKey || "").trim();
  if (!pk) return uri;

  const needle = `/projects/${pk}/raw/`;
  if (uri.includes(needle)) {
    return uri.replace(needle, `/projects/${pk}/eingangspruefung/fotos/`);
  }

  return uri;
}

function mapMetasRewriteInbox(
  metas: Array<{ uri: string; name?: string; type?: string }>,
  projectFsKey: string
): Array<{ uri: string; name?: string; type?: string }> {
  return (metas || []).map((m) => {
    const u = String(m?.uri || "").trim();
    if (!u) return m;
    return { ...m, uri: rewriteInboxUri(u, projectFsKey) };
  });
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
async function tryApprove(
  kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT",
  pk: string,
  docId: string,
  altId?: string
) {
  const ids = Array.from(
    new Set([String(docId || "").trim(), String(altId || "").trim()].filter(Boolean))
  );

  const candidates: { path: string; body: any }[] =
    kind === "LS"
      ? ids.flatMap((id) => [
          { path: `/api/ls/inbox/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/ls/commit/lieferschein`, body: { projectId: pk, docId: id, id } },
          { path: `/api/ls/approve`, body: { projectId: pk, docId: id, id } },
        ])
      : kind === "REGIE"
      ? ids.flatMap((id) => [
          { path: `/api/regie/inbox/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/regie/commit/regiebericht`, body: { projectId: pk, docId: id, id } },
          { path: `/api/regie/approve`, body: { projectId: pk, docId: id, id } },
        ])
      : kind === "TAGESBERICHT"
      ? ids.flatMap((id) => [
          { path: `/api/tagesbericht/inbox/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/tagesberichte/inbox/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/tagesbericht/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/tagesberichte/approve`, body: { projectId: pk, docId: id, id } },
          {
            path: `/api/inbox/${encodeURIComponent(pk)}/tagesbericht/${encodeURIComponent(id)}/approve`,
            body: { approvedBy: "", docId: id, id },
          },
        ])
      : ids.flatMap((id) => [
          { path: `/api/photos/commit`, body: { projectId: pk, docId: id, id } },
          { path: `/api/photos/inbox/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/photos/approve`, body: { projectId: pk, docId: id, id } },

          { path: `/api/fotos/commit`, body: { projectId: pk, docId: id, id } },
          { path: `/api/fotos/inbox/approve`, body: { projectId: pk, docId: id, id } },
          { path: `/api/fotos/approve`, body: { projectId: pk, docId: id, id } },

          {
            path: `/api/inbox/${encodeURIComponent(pk)}/fotos/${encodeURIComponent(id)}/approve`,
            body: { approvedBy: "", docId: id, id },
          },
        ]);

  let lastErr: any = null;
  for (const c of candidates) {
    try {
      return await serverRequest(c.path, {
        method: "POST",
        body: JSON.stringify(c.body),
      });
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Approve failed");
}

/** =========================
 * ✅ Helper: fetch full snapshot BEFORE PDF export
 * ========================= */
async function tryFetchFullDoc(
  kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT",
  pk: string,
  docId: string
) {
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
      : kind === "TAGESBERICHT"
      ? [
          `/api/tagesbericht/inbox/read?projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/tagesberichte/inbox/read?projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/tagesbericht/read?stage=inbox&projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
          `/api/tagesberichte/read?stage=inbox&projectId=${encodeURIComponent(pk)}&docId=${encodeURIComponent(docId)}`,
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
      if (r?.snapshot) return r.snapshot;
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

  const pk = useMemo(() => {
    const a = String(projectCode || "").trim();
    if (looksLikeProjectCode(a)) return a;
    const b = String(projectId || "").trim();
    if (looksLikeProjectCode(b)) return b;
    return a || b;
  }, [projectCode, projectId]);

  const displayProjectCode = useMemo(() => {
    const a = String(projectCode || "").trim();
    if (looksLikeProjectCode(a)) return a;
    const b = String(pk || "").trim();
    if (looksLikeProjectCode(b)) return b;
    const c = String(projectId || "").trim();
    if (looksLikeProjectCode(c)) return c;
    return a || b || c || "—";
  }, [pk, projectCode, projectId]);

  type InboxTab =
    | "REGIE"
    | "LS"
    | "FOTOS"
    | "TAGESBERICHT"
    | "BAUTAGEBUCH"
    | "ANGEBOT"
    | "RECHNUNG"
    | "MENGEN"
    | "KALKULATION";

  const [tab, setTab] = useState<InboxTab>("REGIE");
  const [busy, setBusy] = useState(false);

  const [regie, setRegie] = useState<InboxRegie[]>([]);
  const [ls, setLs] = useState<InboxLs[]>([]);
  const [fotos, setFotos] = useState<InboxFotos[]>([]);
  const [tagesberichte, setTagesberichte] = useState<InboxTagesbericht[]>([]);
  const [bautagebuch, setBautagebuch] = useState<any[]>([]);
  const [angebote, setAngebote] = useState<any[]>([]);
  const [rechnungen, setRechnungen] = useState<any[]>([]);
  const [mengen, setMengen] = useState<any[]>([]);
  const [kalkulationen, setKalkulationen] = useState<any[]>([]);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{
    kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT";
    id: string;
  } | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: title ? String(title) : `Eingang / Prüfung`,
    });
  }, [navigation, title]);

  const canWork = useMemo(() => looksLikeProjectCode(pk), [pk]);

  /** =========================
   * ✅ Prepare snapshot for reopening
   * ========================= */
  const prepareSnapshotForOpen = useCallback(
    async (kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT", id: string, fallbackItem: any) => {
      const full = await tryFetchFullDoc(kind, pk, id);

      // RLC_FOTOS_OPEN_SNAPSHOT_PRESERVE_FIELDS_V1
      // Server read can return a reduced snapshot. Keep local fallback fields.
      const source =
        kind === "FOTOS"
          ? {
              ...(fallbackItem || {}),
              ...(full || {}),

              ortAbschnitt:
                (full as any)?.ortAbschnitt ||
                (full as any)?.location ||
                (full as any)?.ort ||
                (full as any)?.payload?.row?.ortAbschnitt ||
                (full as any)?.payload?.row?.location ||
                (full as any)?.payload?.row?.ort ||
                (fallbackItem as any)?.ortAbschnitt ||
                (fallbackItem as any)?.location ||
                (fallbackItem as any)?.ort ||
                "",

              location:
                (full as any)?.location ||
                (full as any)?.ortAbschnitt ||
                (full as any)?.ort ||
                (fallbackItem as any)?.location ||
                (fallbackItem as any)?.ortAbschnitt ||
                (fallbackItem as any)?.ort ||
                "",

              ort:
                (full as any)?.ort ||
                (full as any)?.ortAbschnitt ||
                (full as any)?.location ||
                (fallbackItem as any)?.ort ||
                (fallbackItem as any)?.ortAbschnitt ||
                (fallbackItem as any)?.location ||
                "",

              kategorie:
                (full as any)?.kategorie ||
                (full as any)?.category ||
                (full as any)?.payload?.row?.kategorie ||
                (full as any)?.payload?.row?.category ||
                (fallbackItem as any)?.kategorie ||
                (fallbackItem as any)?.category ||
                "",

              category:
                (full as any)?.category ||
                (full as any)?.kategorie ||
                (fallbackItem as any)?.category ||
                (fallbackItem as any)?.kategorie ||
                "",

              gewerk:
                (full as any)?.gewerk ||
                (full as any)?.trade ||
                (full as any)?.payload?.row?.gewerk ||
                (full as any)?.payload?.row?.trade ||
                (fallbackItem as any)?.gewerk ||
                (fallbackItem as any)?.trade ||
                "",

              trade:
                (full as any)?.trade ||
                (full as any)?.gewerk ||
                (fallbackItem as any)?.trade ||
                (fallbackItem as any)?.gewerk ||
                "",

              fotoStatus:
                (full as any)?.fotoStatus ||
                (full as any)?.statusFoto ||
                (fallbackItem as any)?.fotoStatus ||
                (fallbackItem as any)?.statusFoto ||
                "",

              statusFoto:
                (full as any)?.statusFoto ||
                (full as any)?.fotoStatus ||
                (fallbackItem as any)?.statusFoto ||
                (fallbackItem as any)?.fotoStatus ||
                "",

              tags:
                (full as any)?.tags ||
                (full as any)?.payload?.row?.tags ||
                (fallbackItem as any)?.tags ||
                "",
            }
          : full || fallbackItem || {};

      let hydratedSource: any = source;
      try {
        const hydrated = await hydrateRowForPreview(source, pk);
        hydratedSource = hydrated || source;
      } catch {
        hydratedSource = source;
      }

      const poolA0 = normalizeFileMetaArray(hydratedSource?.files);
      const poolB0 = normalizeFileMetaArray(hydratedSource?.attachments);
      const poolC0 = normalizeFileMetaArray(hydratedSource?.photos);

      const poolA = mapMetasRewriteInbox(poolA0, pk);
      const poolB = mapMetasRewriteInbox(poolB0, pk);
      const poolC = mapMetasRewriteInbox(poolC0, pk);

      const fromRows0 = Array.isArray(hydratedSource?.rows)
        ? normalizeFileMetaArray(
            (hydratedSource.rows || []).flatMap(
              (x: any) => x?.photos || x?.attachments || x?.files || []
            )
          )
        : [];
      const fromRows = mapMetasRewriteInbox(fromRows0, pk);

      const fromLines0 = Array.isArray(hydratedSource?.lines)
        ? normalizeFileMetaArray(
            (hydratedSource.lines || []).flatMap(
              (x: any) => x?.photos || x?.attachments || x?.files || []
            )
          )
        : [];
      const fromLines = mapMetasRewriteInbox(fromLines0, pk);

      const mainUriRaw = String(
        hydratedSource?.imageUri ||
          hydratedSource?.imageMeta?.uri ||
          hydratedSource?.image?.uri ||
          ""
      ).trim();

      const mainUri = rewriteInboxUri(mainUriRaw, pk);

      const mainArr0 = mainUri
        ? normalizeFileMetaArray([
            { uri: mainUri, name: "photo_main.jpg", type: inferMimeFromUri(mainUri) },
          ])
        : [];
      const mainArr = mapMetasRewriteInbox(mainArr0, pk);

      const merged0 = normalizeFileMetaArray([
        ...poolA,
        ...poolB,
        ...poolC,
        ...fromRows,
        ...fromLines,
      ]);
      const merged = mapMetasRewriteInbox(merged0, pk);

      const forFotos0 = normalizeFileMetaArray([...mainArr, ...merged]);
      const forFotos = mapMetasRewriteInbox(forFotos0, pk);

      const localizedMerged = await localizeFileMetas(merged);
      const localizedFotos = await localizeFileMetas(forFotos);

      let patchedRows = hydratedSource?.rows;
      if (Array.isArray(patchedRows)) {
        patchedRows = await Promise.all(
          patchedRows.map(async (r: any) => {
            const rp0 = normalizeFileMetaArray(r?.photos || r?.attachments || r?.files || []);
            const rp1 = mapMetasRewriteInbox(rp0, pk);
            const rp2 = await localizeFileMetas(rp1);
            return {
              ...r,
              photos: rp2,
              attachments: rp2,
              files: rp2,
            };
          })
        );
      }

      let patchedLines = hydratedSource?.lines;
      if (Array.isArray(patchedLines)) {
        patchedLines = await Promise.all(
          patchedLines.map(async (r: any) => {
            const rp0 = normalizeFileMetaArray(r?.photos || r?.attachments || r?.files || []);
            const rp1 = mapMetasRewriteInbox(rp0, pk);
            const rp2 = await localizeFileMetas(rp1);
            return {
              ...r,
              photos: rp2,
              attachments: rp2,
              files: rp2,
            };
          })
        );
      }

      const patched = {
        ...hydratedSource,
        projectId: hydratedSource?.projectId || pk,
        projectCode: hydratedSource?.projectCode || pk,
        id: hydratedSource?.id || hydratedSource?.docId || id,

        rows: patchedRows,
        lines: patchedLines,

        files: kind === "FOTOS" ? localizedFotos : localizedMerged,
        attachments: kind === "FOTOS" ? localizedFotos : localizedMerged,
        photos: Array.isArray(hydratedSource?.photos)
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
   * PDF helpers
   * ========================= */
  const buildRowForExporter = useCallback(
    (kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT", item: any) => {
      const r = item || {};
      const dateYmd = toYmd(r?.date || r?.datum || r?.createdAt || r?.submittedAt || r?.timestamp);

      const poolA = mapMetasRewriteInbox(normalizeFileMetaArray(r?.files), pk);
      const poolB = mapMetasRewriteInbox(normalizeFileMetaArray(r?.attachments), pk);
      const poolC = mapMetasRewriteInbox(normalizeFileMetaArray(r?.photos), pk);

      const fromLines = Array.isArray(r?.rows)
        ? normalizeFileMetaArray((r.rows || []).flatMap((x: any) => x?.photos || []))
        : Array.isArray(r?.lines)
        ? normalizeFileMetaArray((r.lines || []).flatMap((x: any) => x?.photos || []))
        : [];

      const mainUri = rewriteInboxUri(String(r?.imageUri || r?.imageMeta?.uri || "").trim(), pk);
      const mainArr = mainUri
        ? normalizeFileMetaArray([
            { uri: mainUri, name: "photo_main.jpg", type: inferMimeFromUri(mainUri) },
          ])
        : [];

      const mergedPool = normalizeFileMetaArray([...poolA, ...poolB, ...poolC, ...fromLines]);
      const filesForPhotos = normalizeFileMetaArray([...mainArr, ...mergedPool]);

      const text =
        String(
          r?.text ||
            r?.comment ||
            r?.leistung ||
            r?.rows?.[0]?.comment ||
            r?.workDone ||
            r?.lines?.[0]?.taetigkeit ||
            ""
        ).trim() || String(r?.bemerkungen || r?.notes || r?.note || r?.issues || "").trim();

      const note = String(r?.bemerkungen || r?.notes || r?.note || r?.issues || "").trim();
      const hours = (r?.hours ?? r?.rows?.[0]?.hours ?? r?.lines?.[0]?.stunden ?? undefined) as any;

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

      if (kind === "TAGESBERICHT") {
        return {
          kind: "TAGESBERICHT",
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
              reportType: "TAGESBERICHT",
              docType: "TAGESBERICHT",
              files: mergedPool,
              attachments: mergedPool,
              photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : mergedPool,
              lines: Array.isArray(r?.lines) ? r.lines : [],
            },
          },
        };
      }

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
    async (kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT", item: any): Promise<PdfExportResult> => {
      if (!canWork) throw new Error("Projekt-Code (BA-...) fehlt.");

      const docId = String(item?.id || "").trim();
      if (!docId) throw new Error("Dokument-ID fehlt.");

      const full = await tryFetchFullDoc(kind, pk, docId);
      const source = full || item;

      const projectTitle = String(title || "").trim();
      const rowForExporter: any = buildRowForExporter(kind, source);

      if (kind === "FOTOS") {
        try {
          if (Array.isArray(rowForExporter?.payload?.files)) {
            rowForExporter.payload.files = await localizeFileMetas(rowForExporter.payload.files);
          }
          if (Array.isArray(rowForExporter?.payload?.row?.files)) {
            rowForExporter.payload.row.files = await localizeFileMetas(rowForExporter.payload.row.files);
          }
          if (Array.isArray(rowForExporter?.payload?.row?.attachments)) {
            rowForExporter.payload.row.attachments = await localizeFileMetas(
              rowForExporter.payload.row.attachments
            );
          }
          if (Array.isArray(rowForExporter?.payload?.row?.photos)) {
            rowForExporter.payload.row.photos = await localizeFileMetas(
              rowForExporter.payload.row.photos
            );
          }

          const img = String(rowForExporter?.payload?.row?.imageUri || "").trim();
          if (img) {
            rowForExporter.payload.row.imageUri = await downloadToCacheIfNeeded(img, "photo_main.jpg");
          }
        } catch (e) {
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
      } else if (kind === "TAGESBERICHT") {
        out = (await exportTagesberichtPdfToProject({
          projectFsKey: pk,
          projectTitle,
          row: rowForExporter,
          filenameHint: `Tagesbericht_${ymd}_${pk}_${short}`,
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
    async (kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT", item: any) => {
      try {
        setBusy(true);
        const out = await ensurePdf(kind, item);

        if (out?.pdfUri && String(out.pdfUri).startsWith("file://")) {
          await Linking.openURL(out.pdfUri);
        } else {
          Alert.alert("PDF erstellt", `${out.fileName}\n\nGespeichert lokal (offline) und bereit zum Versenden.`);
        }
      } catch (e: any) {
        Alert.alert("PDF Fehler", String(e?.message || "unbekannt"));
      } finally {
        setBusy(false);
      }
    },
    [ensurePdf]
  );

  const onEmailPdf = useCallback(
    async (kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT", item: any) => {
      try {
        setBusy(true);

        const roles =
          (await getProjectRoles(pk)) || (await getProjectRoles(String(projectId || "").trim())) || null;

        const to = splitEmails((roles as any)?.emails?.bauleiter);
        const cc = splitEmails((roles as any)?.emails?.buero);
        const bcc = splitEmails((roles as any)?.emails?.extern);

        const out = await ensurePdf(kind, item);

        const subjectBase =
          kind === "REGIE"
            ? "Regiebericht"
            : kind === "LS"
            ? "Lieferschein"
            : kind === "TAGESBERICHT"
            ? "Tagesbericht"
            : "Fotodokumentation";
        const subject = `${subjectBase} ${pk} – ${out.date}`;

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
   * Queue executor
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

    if (item.kind === "TAGESBERICHT") {
      const row = (item as any)?.payload?.row || (item as any)?.payload || {};
      if (typeof (api as any).pushTagesberichtToServer !== "function") {
        throw new Error("pushTagesberichtToServer fehlt");
      }
      return (api as any).pushTagesberichtToServer(item.projectId, row);
    }

    if (item.kind === "PHOTO_NOTE" || item.kind === "FOTOS_NOTIZEN") {
      const p = (item as any)?.payload || {};

      const filesFromPayload = Array.isArray(p?.files) ? p.files : [];
      const imageUri = p?.imageUri
        ? [{ uri: p.imageUri, name: "photo.jpg", type: "image/jpeg" }]
        : [];

      const date =
        String(p?.date || p?.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);

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
    if (!canWork) {
      return { okLs: false, okRegie: false, okFotos: false, okTagesbericht: false };
    }

    let okLs = false;
    let okRegie = false;
    let okFotos = false;
    let okTagesbericht = false;

    try {
      const r = await serverRequest<InboxListResponse<any>>(
        `/api/ls/inbox/list?projectId=${encodeURIComponent(pk)}`
      );
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
            attachments: Array.isArray(x?.attachments)
              ? x.attachments
              : Array.isArray(x?.photos)
              ? x.photos
              : [],
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort(
        (a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0)
      );

      setLs(normalized);
      await saveList(INBOX_KEY_LS(pk), normalized);
      okLs = true;
    } catch {}

    try {
      const r = await serverRequest<InboxListResponse<any>>(
        `/api/regie/inbox/list?projectId=${encodeURIComponent(pk)}`
      );
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
            attachments: Array.isArray(x?.attachments)
              ? x.attachments
              : Array.isArray(x?.photos)
              ? x.photos
              : [],
            photos: Array.isArray(x?.photos) ? x.photos : undefined,
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort(
        (a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0)
      );

      const localBeforeRegie = await loadList<InboxRegie[]>(INBOX_KEY_REGIE(pk), []);

      const hasUsefulRegieRows = (rows: any) => {
        if (!Array.isArray(rows) || !rows.length) return false;
        return rows.some((r: any) =>
          String(r?.kostenstelle || r?.machine || r?.worker || r?.hours || r?.comment || r?.material || r?.quantity || r?.unit || "").trim().length > 0 ||
          (Array.isArray(r?.photos) && r.photos.length > 0)
        );
      };

      const mergedRegie = normalized.map((srv: any) => {
        const old = Array.isArray(localBeforeRegie)
          ? localBeforeRegie.find((x: any) =>
              String(x?.id || x?.docId || "") === String(srv?.id || srv?.docId || "")
            )
          : null;

        const srvRows =
          hasUsefulRegieRows(srv?.rows)
            ? srv.rows
            : hasUsefulRegieRows(srv?.payload?.row?.rows)
            ? srv.payload.row.rows
            : hasUsefulRegieRows(srv?.payload?.rows)
            ? srv.payload.rows
            : null;

        const oldRows =
          hasUsefulRegieRows((old as any)?.rows)
            ? (old as any).rows
            : hasUsefulRegieRows((old as any)?.payload?.row?.rows)
            ? (old as any).payload.row.rows
            : hasUsefulRegieRows((old as any)?.payload?.rows)
            ? (old as any).payload.rows
            : null;

        const rows = srvRows || oldRows;

        return rows
          ? {
              ...old,
              ...srv,
              rows,
              payload: {
                ...((old as any)?.payload || {}),
                ...(srv?.payload || {}),
                rows,
                row: {
                  ...((old as any)?.payload?.row || {}),
                  ...(srv?.payload?.row || {}),
                  rows,
                },
              },
            }
          : { ...old, ...srv };
      });

      setRegie(mergedRegie);
      await saveList(INBOX_KEY_REGIE(pk), mergedRegie);
      okRegie = true;
    } catch {}

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
            id: String(x?.id || x?.docId || "").trim(),
            docId: String(x?.docId || x?.id || "").trim(),
            serverId: String(x?.id || x?.docId || "").trim(),
            projectId: String(x?.projectId || pk),
            projectCode: pc,
            workflowStatus: (x?.workflowStatus || "EINGEREICHT") as WorkflowStatus,
            date: String(x?.date || "").slice(0, 10) || undefined,
            comment: x?.comment ?? "",
            bemerkungen: x?.bemerkungen ?? "",
            kostenstelle: x?.kostenstelle ?? "",
            lvItemPos: x?.lvItemPos ?? null,
            attachments: Array.isArray(x?.attachments)
              ? x.attachments
              : Array.isArray(x?.photos)
              ? x.photos
              : [],
            photos: Array.isArray(x?.photos) ? x.photos : undefined,
            imageUri: x?.imageUri || x?.image?.uri || undefined,
            imageMeta: x?.imageMeta || x?.image || undefined,
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort(
        (a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0)
      );

      const localBeforeFotos = await loadList<InboxFotos[]>(INBOX_KEY_FOTOS(pk), []);

      const mergedFotos = normalized.map((srv: any) => {
        const old = Array.isArray(localBeforeFotos)
          ? localBeforeFotos.find((x: any) =>
              String(x?.id || x?.docId || "") === String(srv?.id || srv?.docId || "")
            )
          : null;

        return {
          ...old,
          ...srv,

          ortAbschnitt: srv?.ortAbschnitt || srv?.location || srv?.ort || (old as any)?.ortAbschnitt || (old as any)?.location || (old as any)?.ort || "",
          location: srv?.location || srv?.ortAbschnitt || srv?.ort || (old as any)?.location || (old as any)?.ortAbschnitt || (old as any)?.ort || "",
          ort: srv?.ort || srv?.ortAbschnitt || srv?.location || (old as any)?.ort || (old as any)?.ortAbschnitt || (old as any)?.location || "",

          kategorie: srv?.kategorie || srv?.category || (old as any)?.kategorie || (old as any)?.category || "",
          category: srv?.category || srv?.kategorie || (old as any)?.category || (old as any)?.kategorie || "",

          gewerk: srv?.gewerk || srv?.trade || (old as any)?.gewerk || (old as any)?.trade || "",
          trade: srv?.trade || srv?.gewerk || (old as any)?.trade || (old as any)?.gewerk || "",

          fotoStatus: srv?.fotoStatus || srv?.statusFoto || (old as any)?.fotoStatus || (old as any)?.statusFoto || "",
          statusFoto: srv?.statusFoto || srv?.fotoStatus || (old as any)?.statusFoto || (old as any)?.fotoStatus || "",

          tags: srv?.tags || (old as any)?.tags || "",

          files: Array.isArray(srv?.files) && srv.files.length
            ? srv.files
            : Array.isArray((old as any)?.files)
            ? (old as any).files
            : [],

          attachments: Array.isArray(srv?.attachments) && srv.attachments.length
            ? srv.attachments
            : Array.isArray((old as any)?.attachments)
            ? (old as any).attachments
            : [],

          photos: Array.isArray(srv?.photos) && srv.photos.length
            ? srv.photos
            : Array.isArray((old as any)?.photos)
            ? (old as any).photos
            : [],
        };
      });

      setFotos(mergedFotos);
      await saveList(INBOX_KEY_FOTOS(pk), mergedFotos);
      okFotos = true;
    } catch {}

    try {
      const paths = [
        `/api/tagesbericht/inbox/list?projectId=${encodeURIComponent(pk)}`,
        `/api/tagesberichte/inbox/list?projectId=${encodeURIComponent(pk)}`,
        `/api/inbox/${encodeURIComponent(pk)}/tagesbericht/list`,
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
      if (!r) throw lastErr || new Error("TAGESBERICHT list failed");

      const items = Array.isArray(r?.items) ? r.items : [];
      const normalized: InboxTagesbericht[] = items
        .map((x: any) => {
          const pc =
            String(x?.projectCode || "").trim() ||
            (looksLikeProjectCode(String(x?.projectId || "").trim()) ? String(x?.projectId || "").trim() : "") ||
            pk;

          return {
            ...x,
            kind: "tagesbericht",
            id: String(x?.id || x?.docId || "").trim(),
            projectId: String(x?.projectId || pk),
            projectCode: pc,
            workflowStatus: (x?.workflowStatus || "EINGEREICHT") as WorkflowStatus,
            date: String(x?.date || "").slice(0, 10) || undefined,
            weather: String(x?.weather || ""),
            temperature: String(x?.temperature || ""),
            workers: String(x?.workers || ""),
            machines: String(x?.machines || ""),
            workDone: String(x?.workDone || ""),
            issues: String(x?.issues || ""),
            notes: String(x?.notes || ""),
            lines: Array.isArray(x?.lines) ? x.lines : [],
            reportType: "TAGESBERICHT",
            docType: "TAGESBERICHT",
            attachments: Array.isArray(x?.attachments)
              ? x.attachments
              : Array.isArray(x?.photos)
              ? x.photos
              : Array.isArray(x?.files)
              ? x.files
              : [],
            photos: Array.isArray(x?.photos) ? x.photos : undefined,
            files: Array.isArray(x?.files) ? x.files : undefined,
          };
        })
        .filter((x: any) => !!x.id);

      normalized.sort(
        (a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0)
      );

      setTagesberichte(normalized);
      await saveList(INBOX_KEY_TAGESBERICHT(pk), normalized);
      okTagesbericht = true;
    } catch {}

    return { okLs, okRegie, okFotos, okTagesbericht };
  }, [canWork, pk]);

  const reload = useCallback(async () => {
    if (!canWork) {
      setRegie([]);
      setLs([]);
      setFotos([]);
      setTagesberichte([]);
      return;
    }

    const res = await pullServerInbox();

    const [rLocal, lLocal, fLocal, tLocal, bLocal, aLocal, reLocal, mLocal, kLocal] =
      await Promise.all([
        loadList<InboxRegie[]>(INBOX_KEY_REGIE(pk), []),
        loadLsCompat(pk),
        loadList<InboxFotos[]>(INBOX_KEY_FOTOS(pk), []),
        loadList<InboxTagesbericht[]>(INBOX_KEY_TAGESBERICHT(pk), []),
        loadList<any[]>(INBOX_KEY_BAUTAGEBUCH(pk), []),
        loadList<any[]>(INBOX_KEY_ANGEBOT(pk), []),
        loadList<any[]>(INBOX_KEY_RECHNUNG(pk), []),
        loadList<any[]>(INBOX_KEY_MENGEN(pk), []),
        loadList<any[]>(INBOX_KEY_KALKULATION(pk), []),
      ]);

    const rr = Array.isArray(rLocal) ? rLocal : [];
    const ll = Array.isArray(lLocal) ? lLocal : [];
    const ff = Array.isArray(fLocal) ? fLocal : [];
    const tt = Array.isArray(tLocal) ? tLocal : [];

    
    const bb = Array.isArray(bLocal) ? bLocal : [];
    const aa = Array.isArray(aLocal) ? aLocal : [];
    const re = Array.isArray(reLocal) ? reLocal : [];
    const mm = Array.isArray(mLocal) ? mLocal : [];
    const kk = Array.isArray(kLocal) ? kLocal : [];
rr.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    ll.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    ff.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    tt.sort((a, b) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    bb.sort((a: any, b: any) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    aa.sort((a: any, b: any) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    re.sort((a: any, b: any) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    mm.sort((a: any, b: any) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));
    kk.sort((a: any, b: any) => Number(b.submittedAt || b.createdAt || 0) - Number(a.submittedAt || a.createdAt || 0));

    if (!res.okRegie && rr.length) setRegie(rr);
    setLs(mergeById(ls, ll));
    if (!res.okFotos && ff.length) setFotos(ff);
    if (!res.okTagesbericht && tt.length) setTagesberichte(tt);

    setBautagebuch(bb);
    setAngebote(aa);
    setRechnungen(re);
    setMengen(mm);
    setKalkulationen(kk);
  }, [canWork, pk, pullServerInbox]);

  useEffect(() => {
    (async () => {
      const ok = await enforceServerSync(navigation);
      if (!ok) return;
      reload();
    })();
  }, [navigation, reload]);

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
      await saveList(`rlc_mobile_inbox_ls:${pk}`, next);
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

  const updateTagesberichtItem = useCallback(
    async (id: string, patch: Partial<InboxTagesbericht>) => {
      const next = tagesberichte.map((x) => (x.id === id ? { ...x, ...patch } : x));
      setTagesberichte(next);
      await saveList(INBOX_KEY_TAGESBERICHT(pk), next);
    },
    [tagesberichte, pk]
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
      await saveList(`rlc_mobile_inbox_ls:${pk}`, next);
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

  const removeTagesberichtItem = useCallback(
    async (id: string) => {
      const next = tagesberichte.filter((x) => x.id !== id);
      setTagesberichte(next);
      await saveList(INBOX_KEY_TAGESBERICHT(pk), next);
    },
    [tagesberichte, pk]
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

        await tryApprove("FOTOS", pk, id, String((item as any)?.docId || (item as any)?.serverId || ""));

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

  const approveTagesbericht = useCallback(
    async (id: string) => {
      const item = tagesberichte.find((x) => x.id === id);
      if (!item) return;

      try {
        setBusy(true);
        await tryApprove("TAGESBERICHT", pk, id);
        await removeTagesberichtItem(id);
        Alert.alert("Freigabe", "Tagesbericht wurde freigegeben.");
        await pullServerInbox();
      } catch (e: any) {
        const msg = String(e?.message || "Approve failed");
        await updateTagesberichtItem(id, { syncStatus: "ERROR", syncError: msg });
        Alert.alert("Freigabe fehlgeschlagen", msg);
      } finally {
        setBusy(false);
      }
    },
    [pk, tagesberichte, pullServerInbox, removeTagesberichtItem, updateTagesberichtItem]
  );

  const openReject = useCallback((kind: "REGIE" | "LS" | "FOTOS" | "TAGESBERICHT", id: string) => {
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

      if (t.kind === "TAGESBERICHT") {
        const candidates = [
          { path: `/api/tagesbericht/inbox/reject`, body: { projectId: pk, docId: t.id, reason } },
          { path: `/api/tagesberichte/inbox/reject`, body: { projectId: pk, docId: t.id, reason } },
          { path: `/api/tagesbericht/reject`, body: { projectId: pk, docId: t.id, reason } },
          { path: `/api/tagesberichte/reject`, body: { projectId: pk, docId: t.id, reason } },
          {
            path: `/api/inbox/${encodeURIComponent(pk)}/tagesbericht/${encodeURIComponent(t.id)}/reject`,
            body: { reason },
          },
        ];

        let lastErr: any = null;
        for (const c of candidates) {
          try {
            await serverRequest(c.path, { method: "POST", body: JSON.stringify(c.body) });

            await updateTagesberichtItem(t.id, {
              workflowStatus: "ABGELEHNT",
              rejectionReason: reason,
              syncStatus: "SENT",
              syncError: null,
            });

            setRejectOpen(false);
            setRejectTarget(null);

            Alert.alert("Ablehnen", "Tagesbericht wurde abgelehnt.");
            await pullServerInbox();
            return;
          } catch (e: any) {
            lastErr = e;
          }
        }

        const msg = lastErr?.message || "Reject failed";
        await updateTagesberichtItem(t.id, {
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
  }, [
    pk,
    pullServerInbox,
    rejectReason,
    rejectTarget,
    updateLsItem,
    updateRegieItem,
    updateFotosItem,
    updateTagesberichtItem,
  ]);

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

  const openTagesbericht = useCallback(
    async (id: string) => {
      const item = tagesberichte.find((x) => x.id === id);
      try {
        setBusy(true);
        const inboxSnapshot = await prepareSnapshotForOpen("TAGESBERICHT", id, item);
        navigation.navigate(
          "TagesberichtEditor" as any,
          {
            projectId,
            projectCode: pk,
            fromInbox: true,
            tagesberichtId: id,
            title: "Tagesbericht (Eingang)",
            inboxSnapshot,
          } as any
        );
      } finally {
        setBusy(false);
      }
    },
    [navigation, pk, projectId, tagesberichte, prepareSnapshotForOpen]
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

        {item.rejectionReason ? <Text style={[s.err, { color: COLORS.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable style={s.chipBtn} onPress={() => openRegie(item.id)} disabled={busy}>
            <Text style={[s.chipTxt, s.chipAccentTxt]}>Öffnen</Text>
          </Pressable>

          <Pressable style={s.chipBtn} onPress={() => onCreatePdf("REGIE", item)} disabled={busy || !canWork}>
            <Text style={s.chipTxt}>PDF</Text>
          </Pressable>

          <Pressable style={s.chipDark} onPress={() => onEmailPdf("REGIE", item)} disabled={busy || !canWork}>
            <Text style={[s.chipTxt, s.chipDarkTxt]}>E-Mail</Text>
          </Pressable>

          {(item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT") && (
            <>
              <Pressable style={[s.chipAccent, busy && s.disabledBtn]} onPress={() => approveRegie(item.id)} disabled={busy}>
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Freigeben</Text>
              </Pressable>

              <Pressable style={[s.chipDanger, busy && s.disabledBtn]} onPress={() => openReject("REGIE", item.id)} disabled={busy}>
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Ablehnen</Text>
              </Pressable>
            </>
          )}
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

        {item.rejectionReason ? <Text style={[s.err, { color: COLORS.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable style={s.chipBtn} onPress={() => openLs(item.id)} disabled={busy}>
            <Text style={[s.chipTxt, s.chipAccentTxt]}>Öffnen</Text>
          </Pressable>

          <Pressable style={s.chipBtn} onPress={() => onCreatePdf("LS", item)} disabled={busy || !canWork}>
            <Text style={s.chipTxt}>PDF</Text>
          </Pressable>

          <Pressable style={s.chipDark} onPress={() => onEmailPdf("LS", item)} disabled={busy || !canWork}>
            <Text style={[s.chipTxt, s.chipDarkTxt]}>E-Mail</Text>
          </Pressable>

          {(item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT") && (
            <>
              <Pressable style={[s.chipAccent, busy && s.disabledBtn]} onPress={() => approveLs(item.id)} disabled={busy}>
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Freigeben</Text>
              </Pressable>

              <Pressable style={[s.chipDanger, busy && s.disabledBtn]} onPress={() => openReject("LS", item.id)} disabled={busy}>
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Ablehnen</Text>
              </Pressable>
            </>
          )}
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

        {item.rejectionReason ? <Text style={[s.err, { color: COLORS.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable style={s.chipBtn} onPress={() => openFotos(item.id)} disabled={busy}>
            <Text style={[s.chipTxt, s.chipAccentTxt]}>Öffnen</Text>
          </Pressable>

          <Pressable style={s.chipBtn} onPress={() => onCreatePdf("FOTOS", item)} disabled={busy || !canWork}>
            <Text style={s.chipTxt}>PDF</Text>
          </Pressable>

          <Pressable style={s.chipDark} onPress={() => onEmailPdf("FOTOS", item)} disabled={busy || !canWork}>
            <Text style={[s.chipTxt, s.chipDarkTxt]}>E-Mail</Text>
          </Pressable>

          {(item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT") && (
            <>
              <Pressable style={[s.chipAccent, busy && s.disabledBtn]} onPress={() => approveFotos(item.id)} disabled={busy}>
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Freigeben</Text>
              </Pressable>

              <Pressable style={[s.chipDanger, busy && s.disabledBtn]} onPress={() => openReject("FOTOS", item.id)} disabled={busy}>
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Ablehnen</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  function TagesberichtCard({ item }: { item: InboxTagesbericht }) {
    const wCol = statusColor(item.workflowStatus);
    const work = String(item.workDone || "").trim();
    const issues = String(item.issues || "").trim();
    const workers = String(item.workers || "").trim();
    const machines = String(item.machines || "").trim();
    const line1 =
      work || issues
        ? `${(work || issues).slice(0, 160)}`
        : "Tagesbericht";

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardDate}>{safeDate(item.date)}</Text>
            <Text style={s.cardSub} numberOfLines={3}>
              {line1}
              {item.weather ? ` • Wetter: ${item.weather}` : ""}
              {workers ? ` • Mitarbeiter: ${workers}` : ""}
              {machines ? ` • Maschinen: ${machines}` : ""}
            </Text>
          </View>

          <View style={[s.pill, { borderColor: wCol, backgroundColor: alpha(wCol, 0.12) }]}>
            <Text style={[s.pillTxt, { color: wCol }]}>{item.workflowStatus}</Text>
          </View>
        </View>

        {issues ? <Text style={s.cardBody}>Vorkommnisse: {issues}</Text> : null}
        {item.rejectionReason ? <Text style={[s.err, { color: COLORS.danger }]}>Ablehnung: {item.rejectionReason}</Text> : null}
        {item.syncError ? <Text style={s.err}>Sync-Fehler: {item.syncError}</Text> : null}

        <View style={s.actions}>
          <Pressable style={s.chipBtn} onPress={() => openTagesbericht(item.id)} disabled={busy}>
            <Text style={[s.chipTxt, s.chipAccentTxt]}>Öffnen</Text>
          </Pressable>

          <Pressable
            style={s.chipBtn}
            onPress={() => onCreatePdf("TAGESBERICHT", item)}
            disabled={busy || !canWork}
          >
            <Text style={s.chipTxt}>PDF</Text>
          </Pressable>

          <Pressable
            style={s.chipDark}
            onPress={() => onEmailPdf("TAGESBERICHT", item)}
            disabled={busy || !canWork}
          >
            <Text style={[s.chipTxt, s.chipDarkTxt]}>E-Mail</Text>
          </Pressable>

          {(item.workflowStatus === "EINGEREICHT" || item.workflowStatus === "ABGELEHNT") && (
            <>
              <Pressable
                style={[s.chipAccent, busy && s.disabledBtn]}
                onPress={() => approveTagesbericht(item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Freigeben</Text>
              </Pressable>

              <Pressable
                style={[s.chipDanger, busy && s.disabledBtn]}
                onPress={() => openReject("TAGESBERICHT", item.id)}
                disabled={busy}
              >
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Ablehnen</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  function genericStorageKey(t: InboxTab) {
    switch (t) {
      case "BAUTAGEBUCH":
        return INBOX_KEY_BAUTAGEBUCH(pk);
      case "ANGEBOT":
        return INBOX_KEY_ANGEBOT(pk);
      case "RECHNUNG":
        return INBOX_KEY_RECHNUNG(pk);
      case "MENGEN":
        return INBOX_KEY_MENGEN(pk);
      case "KALKULATION":
        return INBOX_KEY_KALKULATION(pk);
      default:
        return "";
    }
  }

  function setGenericList(t: InboxTab, list: any[]) {
    switch (t) {
      case "BAUTAGEBUCH":
        setBautagebuch(list);
        return;
      case "ANGEBOT":
        setAngebote(list);
        return;
      case "RECHNUNG":
        setRechnungen(list);
        return;
      case "MENGEN":
        setMengen(list);
        return;
      case "KALKULATION":
        setKalkulationen(list);
        return;
    }
  }

  function getGenericList(t: InboxTab) {
    switch (t) {
      case "BAUTAGEBUCH":
        return bautagebuch;
      case "ANGEBOT":
        return angebote;
      case "RECHNUNG":
        return rechnungen;
      case "MENGEN":
        return mengen;
      case "KALKULATION":
        return kalkulationen;
      default:
        return [];
    }
  }

  async function tryGenericServerAction(action: "approve" | "reject", t: InboxTab, item: any, reason?: string) {
    const id = String(item?.id || item?.docId || "").trim();
    if (!id) return false;

    const typeLower =
      t === "ANGEBOT"
        ? "angebot"
        : t === "RECHNUNG"
        ? "rechnung"
        : t === "MENGEN"
        ? "mengen"
        : t === "BAUTAGEBUCH"
        ? "bautagebuch"
        : t === "KALKULATION"
        ? "kalkulation"
        : String(t).toLowerCase();

    const bodies = [
      { projectId: pk, projectCode: pk, docId: id, id, reason },
      { projectId, projectCode: pk, docId: id, id, reason },
    ];

    const paths = [
      `/api/inbox/${encodeURIComponent(pk)}/${encodeURIComponent(typeLower)}/${encodeURIComponent(id)}/${action}`,
      `/api/${typeLower}/inbox/${action}`,
      `/api/${typeLower}/${action}`,
    ];

    for (const p of paths) {
      for (const body of bodies) {
        try {
          await serverRequest(p, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return true;
        } catch {}
      }
    }

    return false;
  }

  async function removeGenericItem(t: InboxTab, id: string) {
    const list = getGenericList(t);
    const next = list.filter((x: any) => String(x?.id || x?.docId || "") !== String(id));
    setGenericList(t, next);

    const key = genericStorageKey(t);
    if (key) await saveList(key, next);
  }

  async function updateGenericItem(t: InboxTab, id: string, patch: any) {
    const list = getGenericList(t);
    const next = list.map((x: any) =>
      String(x?.id || x?.docId || "") === String(id) ? { ...x, ...patch, updatedAt: Date.now() } : x
    );
    setGenericList(t, next);

    const key = genericStorageKey(t);
    if (key) await saveList(key, next);
  }

  async function approveGeneric(t: InboxTab, item: any) {
    const id = String(item?.id || item?.docId || "").trim();
    if (!id) return;

    try {
      setBusy(true);
      await tryGenericServerAction("approve", t, item);
      await removeGenericItem(t, id);
      Alert.alert("Freigabe", "Dokument wurde freigegeben.");
    } catch (e: any) {
      Alert.alert("Freigabe fehlgeschlagen", String(e?.message || e || "unbekannt"));
    } finally {
      setBusy(false);
    }
  }

  async function rejectGeneric(t: InboxTab, item: any) {
    const id = String(item?.id || item?.docId || "").trim();
    if (!id) return;

    Alert.alert("Ablehnen", "Dokument ablehnen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Ablehnen",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy(true);
            await tryGenericServerAction("reject", t, item, "Abgelehnt");
            await updateGenericItem(t, id, {
              workflowStatus: "ABGELEHNT",
              rejectionReason: "Abgelehnt",
            });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function openGeneric(t: InboxTab, item: any) {
    const id = String(item?.id || item?.docId || "").trim();

    if (t === "BAUTAGEBUCH") {
      navigation.navigate("Bautagebuch" as any, {
        projectId,
        projectCode: pk,
        title: "Bautagebuch",
      });
      return;
    }

    if (t === "ANGEBOT") {
      navigation.navigate("AngebotEditor" as any, {
        projectId,
        projectCode: pk,
        title: "Angebot",
        docId: id,
        editId: id,
        inboxSnapshot: item,
        fromInbox: true,
      });
      return;
    }

    if (t === "RECHNUNG") {
      navigation.navigate("RechnungEditor" as any, {
        projectId,
        projectCode: pk,
        title: "Rechnung",
        docId: id,
        editId: id,
        inboxSnapshot: item,
        fromInbox: true,
      });
      return;
    }

    if (t === "MENGEN") {
      navigation.navigate("MengenEditor" as any, {
        projectId,
        projectCode: pk,
        title: "Mengenermittlung",
        docId: id,
        editId: id,
        inboxSnapshot: item,
        fromInbox: true,
      });
      return;
    }

    if (t === "KALKULATION") {
      navigation.navigate("KiCalculation" as any, {
        projectId,
        projectCode: pk,
        title: "Kalkulation",
        docId: id,
        editId: id,
        inboxSnapshot: item,
        fromInbox: true,
      });
    }
  }

  // RLC_GENERIC_INBOX_PDF_EMAIL_V1
  function genericDocLabel(t: InboxTab) {
    switch (t) {
      case "BAUTAGEBUCH":
        return "Bautagebuch";
      case "ANGEBOT":
        return "Angebot";
      case "RECHNUNG":
        return "Rechnung";
      case "MENGEN":
        return "Mengen";
      case "KALKULATION":
        return "Kalkulation";
      default:
        return "Dokument";
    }
  }

  function pickGenericPdfUri(item: any) {
    return String(
      item?.pdfUri ||
        item?.pdfUrl ||
        item?.fileUri ||
        item?.documentUri ||
        item?.localPdfUri ||
        item?.exportPdfUri ||
        item?.attachmentUri ||
        item?.payload?.pdfUri ||
        item?.payload?.fileUri ||
        item?.payload?.documentUri ||
        item?.payload?.row?.pdfUri ||
        item?.payload?.row?.fileUri ||
        item?.payload?.row?.documentUri ||
        ""
    ).trim();
  }

  async function onOpenGenericPdf(t: InboxTab, item: any) {
    try {
      const uri = pickGenericPdfUri(item);

      if (!uri) {
        if (t === "ANGEBOT") {
          await generateAndOpenAngebotPdfFromInbox(item);
          return;
        }

        Alert.alert(
          "PDF",
          `${genericDocLabel(t)} hat noch keinen gespeicherten PDF-Link. Bitte PDF im Modul erzeugen.`
        );
        return;
      }

      if (uri.startsWith("file://") || uri.startsWith("http://") || uri.startsWith("https://")) {
        await Linking.openURL(uri);
        return;
      }

      Alert.alert("PDF", "PDF-Datei kann auf diesem Gerät nicht geöffnet werden.");
    } catch (e: any) {
      Alert.alert("PDF Fehler", String(e?.message || "unbekannt"));
    }
  }

  async function onEmailGenericPdf(t: InboxTab, item: any) {
    try {
      setBusy(true);

      const uri = pickGenericPdfUri(item);
      if (!uri || !uri.startsWith("file://")) {
        Alert.alert(
          "E-Mail",
          `${genericDocLabel(t)} hat keinen lokalen PDF-Anhang. Bitte zuerst im Modul PDF erzeugen.`
        );
        return;
      }

      const roles =
        (await getProjectRoles(pk)) || (await getProjectRoles(String(projectId || "").trim())) || null;

      const to = splitEmails((roles as any)?.emails?.bauleiter);
      const cc = splitEmails((roles as any)?.emails?.buero);
      const bcc = splitEmails((roles as any)?.emails?.extern);

      const date = safeDate(item?.date || item?.datum || item?.submittedAt || item?.createdAt);
      const subject = `${genericDocLabel(t)} ${pk} – ${date}`;

      await emailPdf({
        subject,
        body: "",
        attachments: [uri],
        to: to.length ? to : undefined,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
      });
    } catch (e: any) {
      Alert.alert("E-Mail Fehler", String(e?.message || "unbekannt"));
    } finally {
      setBusy(false);
    }
  }
  // RLC_EINGANG_GENERATE_ANGEBOT_PDF_V1
  async function generateAndOpenAngebotPdfFromInbox(item: any) {
    const doc = item?.doc || item?.payload?.doc || item?.angebotSnapshot || item;

    if (!doc) {
      Alert.alert("PDF", "Angebot-Daten nicht gefunden.");
      return;
    }

    const rows = Array.isArray(doc?.rows)
      ? doc.rows.map((r: any, idx: number) => {
          const qty = Number(String(r?.quantity ?? r?.menge ?? "0").replace(",", ".") || 0);
          const ep = Number(String(r?.ep ?? r?.unitPrice ?? "0").replace(",", ".") || 0);

          return {
            pos: String(r?.pos || r?.posNr || idx + 1),
            text: String(r?.text || r?.kurztext || ""),
            unit: String(r?.unit || r?.einheit || ""),
            quantity: String(r?.quantity || r?.menge || ""),
            ep: String(r?.ep || r?.unitPrice || ""),
            gp: qty * ep,
          };
        })
      : [];

    const netto = rows.reduce((sum: number, r: any) => sum + Number(r.gp || 0), 0);
    const rabattPct = Number(String(doc?.rabattPct || doc?.rabatt || "0").replace(",", ".") || 0);
    const zuschlagPct = Number(String(doc?.zuschlagPct || doc?.zuschlag || "0").replace(",", ".") || 0);
    const mwstPct = Number(String(doc?.mwstPct || doc?.mwst || "19").replace(",", ".") || 19);

    const rabattValue = netto * rabattPct / 100;
    const zuschlagValue = netto * zuschlagPct / 100;
    const nettoFinal = netto - rabattValue + zuschlagValue;
    const mwstValue = nettoFinal * mwstPct / 100;
    const brutto = nettoFinal + mwstValue;

    const out: any = await buildDocumentPdf({
      type: "ANGEBOT",
      projectCode: String(doc?.projectCode || item?.projectCode || pk || "Projekt"),
      fileName: `${String(doc?.angebotNr || item?.angebotNr || "Angebot")}.pdf`,
      title: String(doc?.angebotTitle || "Angebot"),
      subTitle: String(doc?.status || "Entwurf"),
      docNo: String(doc?.angebotNr || item?.angebotNr || ""),
      date: String(doc?.datum || item?.date || item?.datum || ""),
      customer: {
        name: String(doc?.customerName || ""),
        address: String(doc?.customerAddress || ""),
        email: String(doc?.customerEmail || ""),
        phone: String(doc?.customerPhone || ""),
      },
      rows,
      totals: {
        netto,
        rabattValue,
        zuschlagValue,
        nettoFinal,
        mwstValue,
        brutto,
      } as any,
      extraBlocks: [
        {
          title: "Projekt / Baustelle",
          lines: [
            String(doc?.baustelle || ""),
            doc?.validUntil ? `Gültig bis: ${doc.validUntil}` : "",
          ].filter(Boolean),
        },
      ],
      note: String(doc?.note || ""),
      shareAfterCreate: false,
    });

    const pdfUri = String(out?.pdfUri || out?.uri || "").trim();

    if (!pdfUri) {
      Alert.alert("PDF", "PDF konnte nicht erzeugt werden.");
      return;
    }

    await Linking.openURL(pdfUri);
  }
  function GenericInboxCard({ item }: { item: any }) {
    const wCol = statusColor(item.workflowStatus || "EINGEREICHT");
    const type = String(item.docType || item.type || item.kind || tab || "Dokument").toUpperCase();
    const title = String(
      item.title ||
        item.angebotTitle ||
        item.rechnungNr ||
        item.angebotNr ||
        item.projectCode ||
        type
    );

    const date = safeDate(item.date || item.datum || item.submittedAt || item.createdAt);
    const sub = String(
      item.customerName ||
        item.kunde ||
        item.bemerkungen ||
        item.comment ||
        item.notes ||
        item.sourceScreen ||
        ""
    ).slice(0, 160);

    const id = String(item?.id || item?.docId || "").trim();

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardDate}>{date}</Text>
            <Text style={s.cardSub} numberOfLines={2}>
              {type}: {title}
              {sub ? ` • ${sub}` : ""}
            </Text>
          </View>

          <View style={[s.pill, { borderColor: wCol, backgroundColor: alpha(wCol, 0.12) }]}>
            <Text style={[s.pillTxt, { color: wCol }]}>
              {String(item.workflowStatus || "EINGEREICHT")}
            </Text>
          </View>
        </View>

        <View style={s.actions}>
          <Pressable style={s.chipBtn} onPress={() => openGeneric(tab, item)} disabled={busy}>
            <Text style={[s.chipTxt, s.chipAccentTxt]}>Öffnen</Text>
          </Pressable>

          <Pressable style={s.chipBtn} onPress={() => onOpenGenericPdf(tab, item)} disabled={busy}>
            <Text style={s.chipTxt}>PDF</Text>
          </Pressable>

          <Pressable style={s.chipDark} onPress={() => onEmailGenericPdf(tab, item)} disabled={busy || !canWork}>
            <Text style={[s.chipTxt, s.chipDarkTxt]}>E-Mail</Text>
          </Pressable>

          {(item.workflowStatus === "EINGEREICHT" || !item.workflowStatus || item.workflowStatus === "ABGELEHNT") && (
            <>
              <Pressable
                style={[s.chipAccent, busy && s.disabledBtn]}
                onPress={() => approveGeneric(tab, item)}
                disabled={busy || !id}
              >
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Freigeben</Text>
              </Pressable>

              <Pressable
                style={[s.chipDanger, busy && s.disabledBtn]}
                onPress={() => rejectGeneric(tab, item)}
                disabled={busy || !id}
              >
                <Text style={[s.chipTxt, s.chipDarkTxt]}>Ablehnen</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  const categoryItems: RlcCategoryItem[] = [
    { key: "REGIE", label: "Regie", count: regie.length, icon: "clipboard-outline" },
    { key: "LS", label: "Lieferscheine", count: ls.length, icon: "cube-outline" },
    { key: "FOTOS", label: "Fotos", count: fotos.length, icon: "camera-outline" },
    { key: "TAGESBERICHT", label: "Tagesberichte", count: tagesberichte.length, icon: "newspaper-outline" },
    { key: "BAUTAGEBUCH", label: "Bautagebuch", count: bautagebuch.length, icon: "book-outline" },
    { key: "ANGEBOT", label: "Angebote", count: angebote.length, icon: "pricetag-outline" },
    { key: "RECHNUNG", label: "Rechnungen", count: rechnungen.length, icon: "receipt-outline" },
    { key: "MENGEN", label: "Mengen", count: mengen.length, icon: "resize-outline" },
    { key: "KALKULATION", label: "Kalkulation", count: kalkulationen.length, icon: "calculator-outline" },
  ];

  const shown =
    tab === "REGIE"
      ? regie
      : tab === "LS"
      ? ls
      : tab === "FOTOS"
      ? fotos
      : tab === "TAGESBERICHT"
      ? tagesberichte
      : tab === "BAUTAGEBUCH"
      ? bautagebuch
      : tab === "ANGEBOT"
      ? angebote
      : tab === "RECHNUNG"
      ? rechnungen
      : tab === "MENGEN"
      ? mengen
      : kalkulationen;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.page}>
          <FlatList
            style={{ flex: 1 }}
            ListHeaderComponent={
              (
          <View style={s.header}>
            <View style={s.headerRow}>
              <View style={s.headerAccent} />
              <View style={s.headerTextWrap}>
                <Text style={s.headerEyebrow}>RLC Bausoftware</Text>
                <Text style={s.headerSection}>Eingang / Prüfung</Text>
                <Text style={s.h1}>Eingang</Text>
                <Text style={s.headerSub}>
                  Projekt: <Text style={s.headerSubStrong}>{displayProjectCode}</Text>
                  {projectId && !looksLikeProjectCode(String(projectId)) && __DEV__
                    ? ` • DB: ${String(projectId)}`
                    : ""}
                </Text>
              </View>
            </View>

            {!canWork ? (
              <View style={s.warnBox}>
                <Text style={s.warnTitle}>Projekt-Code fehlt</Text>
                <Text style={s.warnText}>
                  Projekt-Code (BA-...) fehlt oder ungültig. Navigation muss projectCode korrekt übergeben.
                </Text>
              </View>
            ) : null}
            <RlcCategoryGrid
              title="Übersicht"
              items={categoryItems}
              activeKey={tab}
              onPress={(key) => setTab(key as InboxTab)}
              onRefresh={reload}
            />

            <View style={s.headerActionsCompact}>
              <Pressable
                style={[s.headerBtnAccentCompact, busy && s.disabledBtn]}
                onPress={() => syncQueueNow({ silent: false })}
                disabled={busy || !canWork}
              >
                <Text style={s.headerBtnAccentTxt}>Sync Queue</Text>
              </Pressable>
            </View>
          </View>
              )
            }
            data={shown}
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
              ) : tab === "FOTOS" ? (
                <FotosCard item={item as InboxFotos} />
              ) : tab === "TAGESBERICHT" ? (
                <TagesberichtCard item={item as InboxTagesbericht} />
              ) : (
                <GenericInboxCard item={item} />
              )
            }
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>Kein Eingang vorhanden</Text>
                  <Text style={s.emptyText}>
                    Einreichen muss zuerst aus dem jeweiligen Screen erfolgen.
                  </Text>
                </View>
              </View>
            }
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            scrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          />

          <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
            <View style={s.modalWrap}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Ablehnen</Text>
                <Text style={s.modalText}>Bitte Ablehnungsgrund eingeben:</Text>

                <TextInput
                  style={s.modalInput}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="z. B. Unleserlich / falsche Kostenstelle / fehlt Foto…"
                  placeholderTextColor={UI.sub}
                  multiline
                />

                <View style={s.modalActions}>
                  <Pressable
                    style={[s.modalBtnSecondary, busy && s.disabledBtn]}
                    onPress={() => {
                      setRejectOpen(false);
                      setRejectTarget(null);
                    }}
                    disabled={busy}
                  >
                    <Text style={s.modalBtnSecondaryTxt}>Abbrechen</Text>
                  </Pressable>

                  <Pressable style={[s.modalBtnDanger, busy && s.disabledBtn]} onPress={confirmReject} disabled={busy}>
                    <Text style={s.modalBtnDangerTxt}>Ablehnen</Text>
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

const s = StyleSheet.create({
  flex: { flex: 1 },

  safe: {
    flex: 1,
    backgroundColor: UI.bg,
  },

  page: {
    flex: 1,
    backgroundColor: UI.bg,
  },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: UI.bg,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  headerAccent: {
    width: 8,
    height: 48,
    borderRadius: 999,
    backgroundColor: UI.accent,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerEyebrow: {
    color: UI.sub,
    fontSize: 13,
    fontWeight: "800",
  },

  headerSection: {
    marginTop: 2,
    color: UI.sub,
    fontSize: 12,
    fontWeight: "800",
  },

  h1: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "900",
    color: UI.text,
  },

  headerSub: {
    marginTop: 6,
    color: UI.sub,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },

  headerSubStrong: {
    color: UI.text,
    fontWeight: "900",
  },

  warnBox: {
    marginTop: 14,
    borderRadius: 16,
    padding: 12,
    backgroundColor: UI.card2,
    borderWidth: 1,
    borderColor: UI.border,
  },

  warnTitle: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
  },

  warnText: {
    marginTop: 6,
    color: UI.sub,
    fontWeight: "700",
    lineHeight: 20,
  },

  tabs: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
  },

  tabBtn: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  tabBtnActive: {
    backgroundColor: UI.accent,
    borderColor: UI.accent,
  },

  tabTxt: {
    color: UI.text,
    fontSize: 12,
    fontWeight: "900",
  },

  tabTxtActive: {
    color: UI.textLight,
  },

  headerActionsCompact: {
    marginTop: 12,
    alignItems: "flex-end",
  },

  headerBtnAccentCompact: {
    minWidth: 150,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: UI.accent,
    alignItems: "center",
  },

  headerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  headerBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  headerBtnTxt: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "900",
  },

  headerBtnAccent: {
    flex: 1,
    minHeight: 46,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: UI.accentDark,
    backgroundColor: UI.accentDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  headerBtnAccentTxt: {
    color: UI.textLight,
    fontSize: 13,
    fontWeight: "900",
  },

  listPad: {
    padding: RLC_SPACING.page,
    paddingBottom: RLC_SPACING.bottomKi,
    gap: 12,
  },

  card: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: shadowElev(),
    }),
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  cardDate: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
  },

  cardSub: {
    marginTop: 6,
    color: UI.sub,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },

  cardBody: {
    marginTop: 10,
    color: UI.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },

  pillTxt: {
    fontSize: 11,
    fontWeight: "900",
  },

  err: {
    marginTop: 10,
    color: UI.sub,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },

  chipBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.card2,
    alignItems: "center",
    justifyContent: "center",
  },

  chipDark: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.text,
    backgroundColor: UI.text,
    alignItems: "center",
    justifyContent: "center",
  },

  chipAccent: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.accent,
    backgroundColor: UI.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  chipDanger: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
  },

  chipTxt: {
    fontSize: 12,
    fontWeight: "900",
    color: UI.text,
  },

  chipAccentTxt: {
    color: UI.accentDark,
  },

  chipDarkTxt: {
    color: UI.textLight,
  },

  disabledBtn: {
    opacity: 0.6,
  },

  emptyWrap: {
    paddingTop: 4,
  },

  emptyCard: {
    borderRadius: RLC_RADIUS.card,
    padding: RLC_SPACING.page,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
  },

  emptyTitle: {
    color: UI.text,
    fontSize: 15,
    fontWeight: "900",
  },

  emptyText: {
    marginTop: 6,
    color: UI.sub,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: RLC_SPACING.page,
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: RLC_RADIUS.card,
    padding: 14,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },

  modalTitle: {
    color: UI.text,
    fontSize: 18,
    fontWeight: "900",
  },

  modalText: {
    marginTop: 6,
    color: UI.sub,
    fontWeight: "700",
    lineHeight: 20,
  },

  modalInput: {
    marginTop: 12,
    minHeight: 104,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.inputBg,
    color: UI.text,
    borderRadius: RLC_RADIUS.button,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }) as any,
    textAlignVertical: "top",
    fontWeight: "800",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  modalBtnSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.card2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  modalBtnSecondaryTxt: {
    color: UI.text,
    fontSize: 13,
    fontWeight: "900",
  },

  modalBtnDanger: {
    flex: 1,
    minHeight: 46,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  modalBtnDangerTxt: {
    color: UI.textLight,
    fontSize: 13,
    fontWeight: "900",
  },
});
















































