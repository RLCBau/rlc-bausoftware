// apps/mobile/src/screens/PhotosNotesScreen.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList,
  Platform,
  Linking,
  Modal,
  Image,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useFocusEffect } from "@react-navigation/native";

import { api, looksLikeProjectCode } from "../lib/api";
import { COLORS } from "../ui/theme";
import { DocActionBar } from "../components/DocActionBar";

import {
  queueAdd,
  queueCleanupDone,
  queueNormalizeExisting,
  queueProcessPending,
  type QueueItem,
  type DateiMeta,
  type ExtraRow,
  type DetectBox,
} from "../lib/offlineQueue";

import {
  exportPhotosPdfToProject,
  emailPdf,
} from "../lib/exporters/projectExport";

type Props = NativeStackScreenProps<RootStackParamList, "PhotosNotes">;

const KEY_MODE = "rlc_mobile_mode";

/** =========================
 * ✅ KEYS POLICY (HARD)
 * SERVER_SYNC  -> server inbox key:
 *   rlc_mobile_inbox_fotos:${BA-...}
 *
 * LOCAL STORE (used for UI/history/edit ALWAYS):
 *   rlc_mobile_offline_fotos:${localKey}
 *
 * InboxScreen (offline UI) reads AsyncStorage keys like:
 *   rlc_mobile_inbox_photos:${BA-...}
 *   rlc_mobile_inbox_fotos:${BA-...}   (legacy/synonym)
 * ========================= */

function inboxFotosKey(projectKey: string) {
  return `rlc_mobile_inbox_fotos:${projectKey}`;
}

/** ✅ InboxScreen expects this too */
function inboxPhotosKey(projectKey: string) {
  return `rlc_mobile_inbox_photos:${projectKey}`;
}

/** ✅ Local store key (history/edit) */
function offlineKey(localKey: string) {
  return `rlc_mobile_offline_fotos:${localKey}`;
}

async function loadArray(key: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function saveArray(key: string, arr: any[]) {
  await AsyncStorage.setItem(key, JSON.stringify(arr || []));
}

function nowIso() {
  return new Date().toISOString();
}
function ymdToday() {
  return nowIso().slice(0, 10);
}
function uid(prefix = "ph") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

function normalizeFiles(input: any[]): DateiMeta[] {
  const arr = Array.isArray(input) ? input : [];
  const out: DateiMeta[] = arr
    .filter(Boolean)
    .map((f) => ({
      id: String(f?.id || uid("f")),
      name: f?.name,
      uri: f?.uri,
      type: f?.type,
    }))
    .filter((x) => !!x.uri);

  // dedupe by uri
  const seen = new Set<string>();
  const ded: DateiMeta[] = [];
  for (const f of out) {
    const u = String(f.uri || "");
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    ded.push(f);
  }
  return ded;
}

function hasAnyContent(row: any): boolean {
  const anyText = String(row?.note || row?.comment || "").trim().length > 0;
  const anyField =
    String(row?.kostenstelle || "").trim().length > 0 ||
    String(row?.lvItemPos || "").trim().length > 0 ||
    String(row?.date || "").trim().length > 0;
  const anyFile = Array.isArray(row?.files) && row.files.length > 0;
  const anyMain = !!row?.imageUri;
  return anyText || anyField || anyFile || anyMain;
}

function inferImageMetaFromUri(uri: string) {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".heic") || u.includes("heic"))
    return { ext: "heic", mime: "image/heic" };
  if (u.endsWith(".heif") || u.includes("heif"))
    return { ext: "heif", mime: "image/heif" };
  if (u.endsWith(".png")) return { ext: "png", mime: "image/png" };
  if (u.endsWith(".webp")) return { ext: "webp", mime: "image/webp" };
  return { ext: "jpg", mime: "image/jpeg" };
}

/** =========================================================
 * ✅ PERSIST FILE URI (FIX preview nere / riapertura)
 * - converte ph:// + HEIC/HEIF -> JPEG in cache
 * - copia tutto in documentDirectory/projects/<FSKEY>/inbox/fotos/files/
 * - ritorna SEMPRE file://... stabile
 * ========================================================= */

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

function isPhUri(u?: string) {
  const s = String(u || "");
  return s.startsWith("ph://") || s.startsWith("assets-library://");
}
function isContentUri(u?: string) {
  const s = String(u || "");
  return s.startsWith("content://");
}
function isFileUri(u?: string) {
  const s = String(u || "");
  return s.startsWith("file://");
}
function extFromNameOrUri(name?: string, uri?: string, type?: string) {
  const n = String(name || "").toLowerCase();
  const u = String(uri || "").toLowerCase();
  const t = String(type || "").toLowerCase();

  if (t.includes("pdf") || n.endsWith(".pdf") || u.endsWith(".pdf")) return "pdf";
  if (t.includes("png") || n.endsWith(".png") || u.endsWith(".png")) return "png";
  if (t.includes("webp") || n.endsWith(".webp") || u.endsWith(".webp")) return "webp";
  if (t.includes("heic") || n.endsWith(".heic") || u.endsWith(".heic")) return "heic";
  if (t.includes("heif") || n.endsWith(".heif") || u.endsWith(".heif")) return "heif";
  if (t.includes("jpeg") || n.endsWith(".jpeg") || u.endsWith(".jpeg")) return "jpeg";
  if (t.includes("jpg") || n.endsWith(".jpg") || u.endsWith(".jpg")) return "jpg";
  return "bin";
}
function shouldConvertToJpegByExt(ext: string) {
  const e = String(ext || "").toLowerCase();
  return e === "heic" || e === "heif";
}

async function convertToJpegIfNeeded(uri: string, hint?: { name?: string; type?: string }) {
  if (Platform.OS === "web") return uri;

  const ext = extFromNameOrUri(hint?.name, uri, hint?.type);
  const needs = isPhUri(uri) || shouldConvertToJpegByExt(ext);

  if (!needs) return uri;

  const tries = [
    { resize: { width: 1400 } as any, compress: 0.9 },
    { resize: { width: 1100 } as any, compress: 0.85 },
  ];

  for (const t of tries) {
    try {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: t.resize }],
        { compress: t.compress, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (out?.uri) return out.uri;
    } catch {
      // try next
    }
  }

  // fallback: originale (potrebbe restare non leggibile, ma evitiamo crash)
  return uri;
}

async function persistToProjectFileUri(params: {
  projectFsKey: string;
  uri: string;
  nameHint?: string;
  typeHint?: string;
  prefix?: string;
}): Promise<string> {
  const { projectFsKey, uri, nameHint, typeHint, prefix } = params;

  const input = String(uri || "").trim();
  if (!input) return "";

  if (Platform.OS === "web") return input;

  const root = String(FileSystem.documentDirectory || "").trim();
  if (!root) return input;

  const fsKey = safeFsKey(projectFsKey);
  const base = normDir(root);
  const dir = `${base}projects/${fsKey}/inbox/fotos/files/`;
  await ensureDir(dir);

  // convert ph:// / heic -> jpeg (cache file://)
  const converted = await convertToJpegIfNeeded(input, { name: nameHint, type: typeHint });

  // decide ext (after conversion, force jpg)
  const ext0 = extFromNameOrUri(nameHint, input, typeHint);
  const ext =
    (isPhUri(input) || shouldConvertToJpegByExt(ext0) || converted !== input) ? "jpg" : ext0;

  const fileNameSafeBase =
    String(nameHint || "")
      .trim()
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "";

  const baseName = fileNameSafeBase
    ? fileNameSafeBase.replace(/\.(\w{1,6})$/, "")
    : `${prefix || "f"}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

  const target = `${dir}${baseName}.${ext}`;

  try {
    // overwrite idempotent
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch {}

    // copy works for file:// and content:// (android). For ph:// we converted already.
    await FileSystem.copyAsync({ from: converted, to: target });

    return target.startsWith("file://") ? target : `file://${target}`;
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.log("[PHOTOS] persistToProjectFileUri FAILED:", msg, { input, converted, target });

    if (isFileUri(converted)) return converted;
    return input;
  }
}

/** =========================
 * ✅ serverRequest (token + base api url)
 * ========================= */
async function serverRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await AsyncStorage.getItem("auth_token");
  const headers: Record<string, any> = { ...(init.headers as any) };

  // set content-type only for JSON (NOT for FormData)
  // NOTE: RN FormData exists at runtime
  // eslint-disable-next-line no-undef
  if (!headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let base = "";
  try {
    base = String(
      (api as any)?.getApiUrl
        ? await (api as any).getApiUrl()
        : (api as any)?.apiUrl || ""
    ).replace(/\/$/, "");
  } catch {
    base = String((api as any)?.apiUrl || "").replace(/\/$/, "");
  }

  if (!base) {
    throw new Error("API Base URL missing (apiUrl/getApiUrl).");
  }

  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** =========================
 * ✅ Upload to SERVER INBOX (HARD FIX)
 * ========================= */
async function uploadPhotoNoteToServerInbox(ba: string, payload: any) {
  const docId =
    String(payload?.docId || payload?.id || "").trim() || uid("ph");
  const date = String(payload?.date || ymdToday()).slice(0, 10);

  const fd = new FormData();
  fd.append("projectId", ba);
  fd.append("docId", docId);
  fd.append("date", date);
  fd.append("workflowStatus", "EINGEREICHT");
  fd.append("comment", String(payload?.comment || payload?.note || ""));
  fd.append("bemerkungen", String(payload?.bemerkungen || ""));
  fd.append("kostenstelle", String(payload?.kostenstelle || ""));
  fd.append("lvItemPos", payload?.lvItemPos ?? "");

  if (payload?.extras) fd.append("extras", JSON.stringify(payload.extras));
  if (payload?.boxes) fd.append("boxes", JSON.stringify(payload.boxes));

  // ✅ MAIN MUST be fieldname "main"
  if (payload?.imageUri) {
    const uri = String(payload.imageUri).trim();
    if (uri) {
      const meta = inferImageMetaFromUri(uri);
      fd.append(
        "main",
        { uri, name: `main_${docId}.${meta.ext}`, type: meta.mime } as any
      );
    }
  }

  // ✅ Attachments MUST be fieldname "files"
  const arr = Array.isArray(payload?.files) ? payload.files : [];
  for (const f of arr) {
    const uri = String(f?.uri || "").trim();
    if (!uri) continue;

    const meta = inferImageMetaFromUri(uri);
    const name = String(f?.name || `file_${docId}.${meta.ext}`).trim();
    const type = String(f?.type || meta.mime).trim();

    fd.append("files", { uri, name, type } as any);
  }

  return await serverRequest<any>("/api/fotos/inbox/upload", {
    method: "POST",
    body: fd as any,
  });
}

/** =========================
 * ✅ KI helpers
 * ========================= */

type KiFieldPatches = Partial<{
  comment: string;
  bemerkungen: string;
  kostenstelle: string;
  lvItemPos: string | null;
  arbeitsbeginn: string;
  arbeitsende: string;
  pause1: string;
  pause2: string;
  mitarbeiter: string;
  maschinen: string;
  materialien: string;
  hours: number;
  unit: string;
}>;

type KiSuggestion = {
  title?: string;
  summary?: string;
  fieldPatches?: KiFieldPatches;
  notes?: string;
};

type KiUiResult = {
  mode: "NUR_APP" | "SERVER_SYNC";
  humanText: string;
  suggestions: KiSuggestion[];
  raw?: any;
};

function normalizeWs(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function makeHumanTextFromSuggestion(s: KiSuggestion, fallback = "") {
  const lines: string[] = [];
  if (s?.title) lines.push(`• ${s.title}`);
  if (s?.summary) lines.push(s.summary);
  if (s?.notes) lines.push(`\nHinweise:\n${s.notes}`);

  const fp = s?.fieldPatches || {};
  const fpLines: string[] = [];
  if (fp.comment) fpLines.push(`Notiz: ${fp.comment}`);
  if (fp.bemerkungen && fp.bemerkungen !== fp.comment)
    fpLines.push(`Bemerkungen: ${fp.bemerkungen}`);
  if (fp.kostenstelle) fpLines.push(`Kostenstelle: ${fp.kostenstelle}`);
  if (fp.lvItemPos) fpLines.push(`LV Pos: ${fp.lvItemPos}`);
  if (fp.arbeitsbeginn || fp.arbeitsende)
    fpLines.push(
      `Zeit: ${fp.arbeitsbeginn || "—"} bis ${fp.arbeitsende || "—"}`
    );
  if (fp.pause1) fpLines.push(`Pause 1: ${fp.pause1}`);
  if (fp.pause2) fpLines.push(`Pause 2: ${fp.pause2}`);
  if (fp.mitarbeiter) fpLines.push(`Mitarbeiter: ${fp.mitarbeiter}`);
  if (fp.maschinen) fpLines.push(`Maschinen: ${fp.maschinen}`);
  if (fp.materialien) fpLines.push(`Materialien: ${fp.materialien}`);
  if (typeof fp.hours === "number")
    fpLines.push(`Stunden: ${fp.hours} ${fp.unit || "Std"}`);

  if (fpLines.length) {
    lines.push(
      `\nVorschlag (übernehmbar):\n${fpLines.map((x) => `- ${x}`).join("\n")}`
    );
  }

  return normalizeWs(lines.join("\n").trim()) || fallback;
}

/**
 * ✅ NUR_APP KI (NO SERVER, NO PHOTO ANALYSIS)
 */
function buildLocalKiResult(row: any): KiUiResult {
  const noteRaw = String(row?.comment || row?.note || "").trim();
  const note = noteRaw.toLowerCase();
  const hasPhoto = !!row?.imageUri;
  const fCount = Array.isArray(row?.files) ? row.files.length : 0;

  const fp: KiFieldPatches = {};

  let title = "Text-Assistent (Offline)";
  let summary = "Basierend auf deiner Notiz – ohne Server, ohne Fotoanalyse.";
  const hints: string[] = [];

  if (hasPhoto)
    hints.push(
      "Foto ist vorhanden (offline gespeichert), wird aber in NUR_APP nicht analysiert."
    );
  if (fCount) hints.push(`${fCount} Anhang/Anhänge vorhanden (offline).`);

  const isAsphalt =
    note.includes("asphalt") ||
    note.includes("asphaltiert") ||
    note.includes("asphaltieren") ||
    note.includes("teer") ||
    note.includes("bitumen");

  const isPatch =
    note.includes("flicken") ||
    note.includes("patch") ||
    note.includes("repar") ||
    note.includes("ausbesser") ||
    note.includes("sanier");

  const hasVonBis = /\bvon\b.*\bbis\b/.test(note);
  const hasMeters = /\b(\d+(?:[.,]\d+)?)\s*(m|lfm|meter)\b/.test(note);
  const hasSqm = /\b(\d+(?:[.,]\d+)?)\s*(m2|qm)\b/.test(note);
  const hasTons = /\b(\d+(?:[.,]\d+)?)\s*(t|tonnen)\b/.test(note);

  if (isAsphalt) {
    title = "Asphalt / Straßenfläche";
    summary =
      "Ich formuliere dir eine saubere Notiz für die Fotodokumentation und lasse Platzhalter für Maße/Abschnitt.";

    const parts: string[] = [];
    if (isPatch) parts.push("Asphalt ausgebessert / repariert");
    else parts.push("Asphaltarbeiten durchgeführt");

    if (!hasVonBis) parts.push("Abschnitt: von ___ bis ___");
    if (!hasMeters && !hasSqm) parts.push("Menge: ___ m / ___ m²");
    if (hasTons) parts.push("Material: ___ t Asphalt (falls relevant)");

    parts.push(
      "Ort/Details: ___ (Straße, Hausnr., Stationierung, Randbereiche)"
    );

    fp.comment = parts.join(" • ");
    fp.bemerkungen = fp.comment;
    fp.unit = "Std";
    fp.hours = 0;

    hints.push(
      "Trage ‘von…bis…’ als Abschnitt (Stationierung oder Straßennamen + Hausnummern) ein."
    );
    if (!hasMeters && !hasSqm)
      hints.push("Wenn du Maße hast: m (Länge) oder m² (Fläche) ergänzen.");
  } else {
    title = "Allgemeine Fotodokumentation";
    summary =
      "Ich baue dir aus deiner Notiz eine brauchbare Dokumentationszeile mit Platzhaltern.";

    const base = noteRaw ? noteRaw : "Arbeiten durchgeführt";
    const parts: string[] = [base];

    if (!hasVonBis) parts.push("Abschnitt: von ___ bis ___");
    if (!hasMeters && !hasSqm && !hasTons)
      parts.push("Menge: ___ (z.B. m / m² / Stk / t)");

    parts.push("Ort/Details: ___");

    fp.comment = parts.join(" • ");
    fp.bemerkungen = fp.comment;
    fp.unit = "Std";
    fp.hours = 0;

    hints.push(
      "Wenn du nur ein Wort schreibst (z.B. ‘Asphaltiert’), ergänze Abschnitt + Menge."
    );
  }

  if (String(row?.kostenstelle || "").trim()) {
    fp.kostenstelle = String(row.kostenstelle).trim();
  }
  if (String(row?.lvItemPos || "").trim()) {
    fp.lvItemPos = String(row.lvItemPos).trim();
  } else {
    fp.lvItemPos = null;
  }

  const suggestion: KiSuggestion = {
    title,
    summary,
    notes: hints.length ? hints.map((h) => `• ${h}`).join("\n") : "",
    fieldPatches: fp,
  };

  const humanText = makeHumanTextFromSuggestion(suggestion, "Kein Vorschlag.");

  return {
    mode: "NUR_APP",
    humanText,
    suggestions: [suggestion],
    raw: { local: true },
  };
}

function extractFirstFieldPatches(res: any): KiFieldPatches | null {
  const s0 =
    res?.suggestions?.[0] ||
    res?.data?.suggestions?.[0] ||
    res?.result?.suggestions?.[0] ||
    null;

  const fp = s0?.fieldPatches || s0?.patches || res?.fieldPatches || null;
  if (!fp || typeof fp !== "object") return null;
  return fp as KiFieldPatches;
}

function buildUiResultFromServer(res: any): KiUiResult {
  const fp = extractFirstFieldPatches(res) || {};
  const s0 =
    res?.suggestions?.[0] ||
    res?.data?.suggestions?.[0] ||
    res?.result?.suggestions?.[0] ||
    {};
  const suggestion: KiSuggestion = {
    title: s0?.title || "KI Vorschlag",
    summary: s0?.summary || "",
    notes: s0?.notes || "",
    fieldPatches: fp,
  };

  const humanText = makeHumanTextFromSuggestion(
    suggestion,
    "KI hat geantwortet, aber ohne verwertbaren Vorschlag."
  );

  return {
    mode: "SERVER_SYNC",
    humanText,
    suggestions: [suggestion],
    raw: res,
  };
}

function looksLikeMissingEndpoint(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("cannot post") ||
    msg.includes("cannot get")
  );
}

/** ✅ upsert helper (keeps behavior consistent) */
function upsertRow(list: any[], row: any) {
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex(
    (x) => String(x?.id || "") === String(row?.id || "")
  );
  if (idx >= 0) next[idx] = { ...next[idx], ...row, updatedAt: nowIso() };
  else next.unshift(row);
  return next;
}

/** ✅ Write Photos rows to Offline-Inbox keys so InboxScreen can display immediately */
async function writePhotosToOfflineInbox(projectKey: string, row: any) {
  const k1 = inboxPhotosKey(projectKey);
  const k2 = inboxFotosKey(projectKey); // legacy/synonym used by InboxScreen fallback list

  const arr1 = await loadArray(k1);
  const next1 = upsertRow(arr1, row);
  await saveArray(k1, next1);

  const arr2 = await loadArray(k2);
  const next2 = upsertRow(arr2, row);
  await saveArray(k2, next2);
}

export default function PhotosNotesScreen({ route, navigation }: Props) {
  const projectId = String((route.params as any)?.projectId || "").trim(); // UUID
  const projectCodeParam = String((route.params as any)?.projectCode || "").trim(); // FS-key (BA-... o local-...)
  const title = String((route.params as any)?.title || "").trim();
  const editId = String((route.params as any)?.editId || "").trim();
  const fromInbox = !!(route.params as any)?.fromInbox;

  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [date, setDate] = useState(ymdToday());
  const [kostenstelle, setKostenstelle] = useState("");
  const [lvItemPos, setLvItemPos] = useState("");
  const [note, setNote] = useState("");

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [files, setFiles] = useState<DateiMeta[]>([]);

  const [extras, setExtras] = useState<ExtraRow[] | undefined>(undefined);
  const [boxes, setBoxes] = useState<DetectBox[] | undefined>(undefined);

  const [history, setHistory] = useState<any[]>([]);

  const [lastPdfUri, setLastPdfUri] = useState<string | null>(null);
  const [lastPdfName, setLastPdfName] = useState<string | null>(null);

  const [kiOpen, setKiOpen] = useState(false);
  const [kiLoading, setKiLoading] = useState(false);
  const [kiUi, setKiUi] = useState<KiUiResult | null>(null);

  // ✅ BA-key solo se projectCodeParam è BA-...
  const baKey = useMemo(() => {
    const s = String(projectCodeParam || "").trim();
    return looksLikeProjectCode(s) ? s : "";
  }, [projectCodeParam]);

  // ✅ offline localKey per NUR_APP (also used for SERVER_SYNC UI/history/edit)
  const localKey = useMemo(() => {
    return projectId ? `local-${projectId}` : "local-unknown";
  }, [projectId]);

  // ✅ IMPORTANT: Inbox uses FS-key (can be BA-... OR local-...)
  // We must use the same key when coming from Inbox->Bearbeiten
  const inboxProjectKey = useMemo(() => {
    return String(projectCodeParam || baKey || localKey || "").trim();
  }, [projectCodeParam, baKey, localKey]);

  const projectTitle = useMemo(
    () => title || baKey || localKey || "Projekt",
    [title, baKey, localKey]
  );

  /** ✅ UI/History/Edit ALWAYS uses local OFFLINE store */
  const localStoreKey = useMemo(() => offlineKey(localKey), [localKey]);

  /** ✅ Optional: server inbox mirror key (BA-...) */
  const serverStoreKey = useMemo(
    () => (baKey ? inboxFotosKey(baKey) : ""),
    [baKey]
  );

  const readMode = useCallback(async () => {
    try {
      const m = String((await AsyncStorage.getItem(KEY_MODE)) || "").trim();
      if (m === "NUR_APP" || m === "SERVER_SYNC") {
        setMode(m as any);
        return m as "NUR_APP" | "SERVER_SYNC";
      }
    } catch {}
    setMode("SERVER_SYNC");
    return "SERVER_SYNC" as const;
  }, []);

  const loadHistory = useCallback(async (key: string) => {
    const arr = await loadArray(key);
    const next = [...arr].sort((a, b) => {
      const ta = Date.parse(String(a?.updatedAt || a?.createdAt || 0)) || 0;
      const tb = Date.parse(String(b?.updatedAt || b?.createdAt || 0)) || 0;
      return tb - ta;
    });
    setHistory(next);
  }, []);

  const loadEditIfNeeded = useCallback(
    async (localKeyForEdit: string, inboxKeyForEdit: string) => {
      if (!editId) return;
      setLoading(true);
      try {
        // ✅ 1) if opened from Inbox, try Inbox keys FIRST (this is the bug)
        if (fromInbox) {
          const k1 = inboxPhotosKey(inboxKeyForEdit);
          const k2 = inboxFotosKey(inboxKeyForEdit);

          const a1 = await loadArray(k1);
          const a2 = await loadArray(k2);

          const foundInbox =
            (a1 || []).find((x) => String(x?.id || "") === editId) ||
            (a2 || []).find((x) => String(x?.id || "") === editId) ||
            null;

          if (foundInbox) {
            // ✅ also upsert into local store so Verlauf/Edit stays consistent
            const arrL = await loadArray(localKeyForEdit);
            const nextL = upsertRow(arrL, foundInbox);
            await saveArray(localKeyForEdit, nextL);

            setDate(String(foundInbox?.date || ymdToday()).slice(0, 10));
            setKostenstelle(String(foundInbox?.kostenstelle || ""));
            setLvItemPos(String(foundInbox?.lvItemPos || ""));
            setNote(
              String(
                foundInbox?.note ||
                  foundInbox?.comment ||
                  foundInbox?.bemerkungen ||
                  ""
              )
            );

            setImageUri(foundInbox?.imageUri || null);
            setFiles(
              normalizeFiles(
                foundInbox?.files ||
                  foundInbox?.attachments ||
                  foundInbox?.photos ||
                  []
              )
            );
            setExtras(foundInbox?.extras);
            setBoxes(foundInbox?.boxes);
            return;
          }
        }

        // ✅ 2) fallback: local store (history/edit)
        const arr = await loadArray(localKeyForEdit);
        const found = (arr || []).find((x) => String(x?.id || "") === editId);
        if (!found) return;

        setDate(String(found?.date || ymdToday()).slice(0, 10));
        setKostenstelle(String(found?.kostenstelle || ""));
        setLvItemPos(String(found?.lvItemPos || ""));
        setNote(String(found?.note || found?.comment || found?.bemerkungen || ""));

        setImageUri(found?.imageUri || null);
        setFiles(normalizeFiles(found?.files || found?.attachments || found?.photos || []));
        setExtras(found?.extras);
        setBoxes(found?.boxes);
      } finally {
        setLoading(false);
      }
    },
    [editId, fromInbox]
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      // ✅ HARD: never trap user in KI modal when leaving screen
      setKiOpen(false);
      setKiLoading(false);

      (async () => {
        const mNow = await readMode();
        if (!alive) return;

        // ✅ UI/History/Edit ALWAYS uses local store
        await loadHistory(localStoreKey);

        // ✅ FIX: when fromInbox -> read from inbox keys first
        await loadEditIfNeeded(localStoreKey, inboxProjectKey);

        queueCleanupDone().catch(() => {});

        if (mNow === "SERVER_SYNC" && !baKey) {
          // no blocking, just informative
        }
      })();

      return () => {
        alive = false;
        setKiOpen(false);
        setKiLoading(false);
      };
    }, [readMode, loadHistory, loadEditIfNeeded, localStoreKey, inboxProjectKey, baKey])
  );

  const buildRow = useCallback(
    (workflowStatus?: "DRAFT" | "EINGEREICHT") => {
      const now = nowIso();
      const id = editId || uid("ph");

      return {
        id,
        kind: "fotos",
        workflowStatus: workflowStatus || "DRAFT",

        projectId: projectId || null, // UUID (meta)
        projectCode: baKey || null, // BA-... (FS key)

        date: String(date || ymdToday()).slice(0, 10),
        kostenstelle: String(kostenstelle || "").trim(),
        lvItemPos: String(lvItemPos || "").trim() || null,

        comment: String(note || "").trim(),
        bemerkungen: String(note || "").trim(),
        note: String(note || "").trim(),

        imageUri: imageUri || null,
        files: normalizeFiles(files),
        attachments: normalizeFiles(files),
        photos: normalizeFiles(files),

        extras,
        boxes,

        updatedAt: now,
        createdAt: now,
      };
    },
    [
      editId,
      projectId,
      baKey,
      date,
      kostenstelle,
      lvItemPos,
      note,
      imageUri,
      files,
      extras,
      boxes,
    ]
  );

  const ensureServerAllowed = useCallback(() => {
    if (!baKey) {
      Alert.alert(
        "Fotos / Notizen (Server)",
        "BA-... Projekt-Code fehlt! Fix: beim Navigate() immer projectCode=BA-... mitsenden."
      );
      return false;
    }
    if (!projectId) {
      Alert.alert("Fotos / Notizen (Server)", "projectId (UUID) fehlt.");
      return false;
    }
    return true;
  }, [baKey, projectId]);

  const takeMainPhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Berechtigung", "Bitte Kamera-Zugriff erlauben.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;

      const fsKey = (baKey || localKey).trim();
      const persisted = await persistToProjectFileUri({
        projectFsKey: fsKey,
        uri: a.uri,
        nameHint: (a as any).fileName || `main_${Date.now()}.jpg`,
        typeHint: (a as any).mimeType || "image/jpeg",
        prefix: "main",
      });

      setImageUri(persisted || a.uri);
    } catch (e: any) {
      Alert.alert("Kamera", e?.message || "Foto konnte nicht aufgenommen werden.");
    }
  }, [baKey, localKey]);

  const pickMainPhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Berechtigung", "Bitte Zugriff auf Fotos erlauben.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;

      const fsKey = (baKey || localKey).trim();
      const persisted = await persistToProjectFileUri({
        projectFsKey: fsKey,
        uri: a.uri,
        nameHint: (a as any).fileName || `main_${Date.now()}.jpg`,
        typeHint: (a as any).mimeType || "image/jpeg",
        prefix: "main",
      });

      setImageUri(persisted || a.uri);
    } catch (e: any) {
      Alert.alert("Foto", e?.message || "Foto konnte nicht gewählt werden.");
    }
  }, [baKey, localKey]);

  const addCameraAttachment = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Berechtigung", "Bitte Kamera-Zugriff erlauben.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;

      const meta = inferImageMetaFromUri(a.uri);

      const fsKey = (baKey || localKey).trim();
      const persisted = await persistToProjectFileUri({
        projectFsKey: fsKey,
        uri: a.uri,
        nameHint: (a as any).fileName || `Kamera_${Date.now()}.${meta.ext}`,
        typeHint: (a as any).mimeType || meta.mime,
        prefix: "att",
      });

      setFiles((prev) =>
        normalizeFiles([
          ...prev,
          {
            id: uid("cam"),
            uri: persisted || a.uri,
            name: (a as any).fileName || `Kamera_${Date.now()}.${meta.ext}`,
            type: (a as any).mimeType || meta.mime,
          },
        ])
      );
    } catch (e: any) {
      Alert.alert("Kamera", e?.message || "Foto konnte nicht aufgenommen werden.");
    }
  }, [baKey, localKey]);

  const addFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;

      const fsKey = (baKey || localKey).trim();
      const persisted = await persistToProjectFileUri({
        projectFsKey: fsKey,
        uri: a.uri,
        nameHint: a.name || `Datei_${Date.now()}`,
        typeHint: a.mimeType || "application/octet-stream",
        prefix: "file",
      });

      setFiles((prev) =>
        normalizeFiles([
          ...prev,
          {
            id: uid("file"),
            uri: persisted || a.uri,
            name: a.name || `Datei_${Date.now()}`,
            type: a.mimeType || "application/octet-stream",
          },
        ])
      );
    } catch (e: any) {
      Alert.alert("Datei", e?.message || "Datei konnte nicht hinzugefügt werden.");
    }
  }, [baKey, localKey]);

  const openAttachment = useCallback(async (u?: string) => {
    if (!u) return;
    const uri = String(u);

    if (
      uri.startsWith("http://") ||
      uri.startsWith("https://") ||
      uri.startsWith("file://")
    ) {
      try {
        await Linking.openURL(uri);
      } catch {
        Alert.alert("Öffnen", "Konnte nicht geöffnet werden.");
      }
      return;
    }

    Alert.alert(
      "Öffnen",
      "content:// oder ph:// kann nicht direkt geöffnet werden. Bitte PDF exportieren oder als Anhang nutzen."
    );
  }, []);

  const removeAttachment = useCallback((id?: string) => {
    if (!id) return;
    setFiles((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const mirrorToServerInboxIfNeeded = useCallback(
    async (row: any) => {
      if (mode !== "SERVER_SYNC") return;
      if (!serverStoreKey) return;
      const arrS = await loadArray(serverStoreKey);
      const nextS = upsertRow(arrS, row);
      await saveArray(serverStoreKey, nextS);
    },
    [mode, serverStoreKey]
  );

  const addToInboxQueueOffline = useCallback(
    async (row: any, status: "DRAFT" | "EINGEREICHT") => {
      if (mode !== "NUR_APP") return;

      await queueNormalizeExisting();

      await queueAdd({
        kind: "PHOTO_NOTE",
        projectId: localKey,
        payload: {
          offlineOnly: true,
          projectUuid: projectId,
          projectCode: baKey || null,
          docId: row.id,
          id: row.id,
          date: row.date,
          workflowStatus: status,
          comment: row.comment,
          bemerkungen: row.bemerkungen,
          kostenstelle: row.kostenstelle,
          lvItemPos: row.lvItemPos,
          files: row.files,
          attachments: row.files,
          photos: row.files,
          imageUri: row.imageUri,
          extras: row.extras,
          boxes: row.boxes,
          row,
        },
      });
    },
    [mode, localKey, projectId, baKey]
  );

  const onSaveOffline = useCallback(async () => {
    const row = buildRow("DRAFT");
    if (!hasAnyContent(row)) {
      Alert.alert(
        "Fotos / Notizen",
        "Bitte mindestens ein Feld oder Foto/Datei hinzufügen."
      );
      return;
    }

    setLoading(true);
    try {
      const mNow = await readMode();

      const arrL = await loadArray(localStoreKey);
      const nextL = upsertRow(arrL, { ...row, workflowStatus: "DRAFT" });
      await saveArray(localStoreKey, nextL);

      await mirrorToServerInboxIfNeeded({ ...row, workflowStatus: "DRAFT" });

      if (mNow === "NUR_APP") {
        // ✅ use SAME FS-key as Inbox screen
        const inboxKey = (inboxProjectKey || localKey).trim();
        await writePhotosToOfflineInbox(inboxKey, {
          ...row,
          workflowStatus: "DRAFT",
        });
      }

      await addToInboxQueueOffline(row, "DRAFT");

      await loadHistory(localStoreKey);

      Alert.alert(
        "Gespeichert",
        mNow === "SERVER_SYNC"
          ? "Lokal gespeichert (wie NUR_APP) + Server-Inbox gespiegelt."
          : "Offline gespeichert (NUR_APP) + Inbox aktualisiert."
      );
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [
    buildRow,
    readMode,
    localStoreKey,
    loadHistory,
    mirrorToServerInboxIfNeeded,
    addToInboxQueueOffline,
    inboxProjectKey,
    localKey,
  ]);

  const onSubmit = useCallback(async () => {
    const row = buildRow("EINGEREICHT");
    if (!hasAnyContent(row)) {
      Alert.alert(
        "Fotos / Notizen",
        "Bitte mindestens ein Feld oder Foto/Datei hinzufügen."
      );
      return;
    }

    setSubmitting(true);
    try {
      const mNow = await readMode();

      const arrL = await loadArray(localStoreKey);
      const nextL = upsertRow(arrL, { ...row, workflowStatus: "EINGEREICHT" });
      await saveArray(localStoreKey, nextL);
      await loadHistory(localStoreKey);

      if (mNow === "NUR_APP") {
        // ✅ use SAME FS-key as Inbox screen
        const inboxKey = (inboxProjectKey || localKey).trim();
        await writePhotosToOfflineInbox(inboxKey, {
          ...row,
          workflowStatus: "EINGEREICHT",
        });

        await addToInboxQueueOffline(row, "EINGEREICHT");

        Alert.alert("Einreichen", "Offline eingereicht (NUR_APP).");
        if (!fromInbox) navigation.goBack();
        return;
      }

      if (!ensureServerAllowed()) {
        Alert.alert(
          "Einreichen",
          "Lokal gespeichert, aber Server-Sync nicht möglich (BA-... fehlt)."
        );
        return;
      }

      await mirrorToServerInboxIfNeeded({
        ...row,
        workflowStatus: "EINGEREICHT",
      });

      await queueNormalizeExisting();
      await queueAdd({
        kind: "PHOTO_NOTE",
        projectId: baKey,
        payload: {
          projectUuid: projectId,
          projectCode: baKey,
          docId: row.id,
          id: row.id,
          date: row.date,
          comment: row.comment,
          bemerkungen: row.bemerkungen,
          kostenstelle: row.kostenstelle,
          lvItemPos: row.lvItemPos,
          files: row.files,
          attachments: row.files,
          photos: row.files,
          imageUri: row.imageUri,
          extras: row.extras,
          boxes: row.boxes,
          row,
        },
      });

      await queueProcessPending(async (item: QueueItem) => {
        if (item.kind !== "PHOTO_NOTE" && item.kind !== "FOTOS_NOTIZEN")
          return null;

        const payload = (item as any)?.payload || {};
        const r = payload?.row ?? payload ?? {};
        const ba = String(item.projectId || "").trim();

        if (!looksLikeProjectCode(ba))
          throw new Error("PHOTO_NOTE push: projectId is not BA-...");

        return await uploadPhotoNoteToServerInbox(ba, {
          docId: payload?.docId || r?.id,
          date: r?.date,
          comment: r?.comment || r?.note || "",
          bemerkungen: r?.bemerkungen || "",
          kostenstelle: r?.kostenstelle || "",
          lvItemPos: r?.lvItemPos ?? null,
          files: Array.isArray(r?.files) ? r.files : [],
          imageUri: r?.imageUri || null,
          extras: r?.extras,
          boxes: r?.boxes,
        });
      });

      Alert.alert("Einreichen", "Eingereicht (lokal) + Server Inbox Upload OK.");
      if (!fromInbox) navigation.goBack();
    } catch (e: any) {
      Alert.alert("Einreichen", e?.message || "Einreichen fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }, [
    buildRow,
    readMode,
    localStoreKey,
    loadHistory,
    addToInboxQueueOffline,
    ensureServerAllowed,
    mirrorToServerInboxIfNeeded,
    fromInbox,
    navigation,
    projectId,
    baKey,
    inboxProjectKey,
    localKey,
  ]);

  const onOpenPdf = useCallback(async () => {
    try {
      const row = buildRow("EINGEREICHT");
      const payloadDate =
        String(row?.date || ymdToday()).slice(0, 10) || ymdToday();
      const shortId = String(row?.id || "doc")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-6);

      const out = await exportPhotosPdfToProject({
        projectFsKey: baKey || localKey,
        projectTitle,
        wantCsv: false,
        filenameHint: `Fotos_${payloadDate}_${shortId}`,
        row,
      } as any);

      setLastPdfUri(out.pdfUri);
      setLastPdfName(out.fileName);

      if (Platform.OS !== "web" && out?.pdfUri?.startsWith("file://")) {
        await Linking.openURL(out.pdfUri);
      } else {
        Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
      }
    } catch (e: any) {
      Alert.alert("PDF", e?.message || "PDF Export fehlgeschlagen.");
    }
  }, [buildRow, baKey, localKey, projectTitle]);

  const onEmailPdf = useCallback(async () => {
    try {
      const row = buildRow("EINGEREICHT");
      const payloadDate =
        String(row?.date || ymdToday()).slice(0, 10) || ymdToday();
      const shortId = String(row?.id || "doc")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-6);

      const out = await exportPhotosPdfToProject({
        projectFsKey: baKey || localKey,
        projectTitle,
        wantCsv: false,
        filenameHint: `Fotos_${payloadDate}_${shortId}`,
        row,
      } as any);

      setLastPdfUri(out.pdfUri);
      setLastPdfName(out.fileName);

      const attachmentsRaw: string[] = Array.isArray(out.attachments)
        ? out.attachments
        : Platform.OS === "web"
        ? []
        : [out.pdfUri];

      const attachments = (attachmentsRaw || [])
        .map((x) => String(x || ""))
        .filter((u) => u.startsWith("file://"));

      await emailPdf({
        subject: `Fotodokumentation ${baKey || localKey} – ${out.date}`,
        body: `Fotodokumentation ${baKey || localKey} (${out.date})`,
        attachments,
      });
    } catch (e: any) {
      Alert.alert("E-Mail", e?.message || "E-Mail Versand fehlgeschlagen.");
    }
  }, [buildRow, baKey, localKey, projectTitle]);

  const onKiSuggest = useCallback(async () => {
    setKiUi(null);
    setKiOpen(true);
    setKiLoading(true);

    try {
      const mNow = await readMode();
      const row = buildRow("EINGEREICHT");

      const localRes = buildLocalKiResult(row);
      setKiUi({
        ...localRes,
        mode: mNow,
      });
    } catch (e: any) {
      setKiUi({
        mode: mode === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC",
        humanText: `KI Vorschlag fehlgeschlagen: ${String(e?.message || e)}`,
        suggestions: [{ title: "Fehler", summary: String(e?.message || e) }],
      });
    } finally {
      setKiLoading(false);
    }
  }, [buildRow, readMode, mode]);

  const applyKiPatches = useCallback(() => {
    const fp = kiUi?.suggestions?.[0]?.fieldPatches;
    if (!fp) {
      Alert.alert("Übernehmen", "Kein übernehmbarer Vorschlag vorhanden.");
      return;
    }

    if (typeof fp.kostenstelle === "string") setKostenstelle(fp.kostenstelle);
    if (fp.lvItemPos != null) setLvItemPos(String(fp.lvItemPos || ""));
    const nextNote = String(fp.comment || fp.bemerkungen || "").trim();
    if (nextNote) setNote(nextNote);

    Alert.alert("Übernommen", "Vorschlag wurde in das Formular übernommen.");
  }, [kiUi]);

  const onReset = useCallback(() => {
    Alert.alert("Formular leeren", "Wirklich alles zurücksetzen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Leeren",
        style: "destructive",
        onPress: () => {
          setDate(ymdToday());
          setKostenstelle("");
          setLvItemPos("");
          setNote("");
          setImageUri(null);
          setFiles([]);
          setExtras(undefined);
          setBoxes(undefined);
          setLastPdfUri(null);
          setLastPdfName(null);
          setKiOpen(false);
          setKiUi(null);
        },
      },
    ]);
  }, []);

  const isImageFile = useCallback((f?: DateiMeta) => {
    const t = String((f as any)?.type || "").toLowerCase();
    const u = String((f as any)?.uri || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    return (
      u.endsWith(".jpg") ||
      u.endsWith(".jpeg") ||
      u.endsWith(".png") ||
      u.endsWith(".webp") ||
      u.endsWith(".heic") ||
      u.endsWith(".heif")
    );
  }, []);

  const modalMaxH = Math.min(
    560,
    Math.floor(Dimensions.get("window").height * 0.62)
  );

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>Zurück</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={onKiSuggest}
            style={[styles.kiPill, kiLoading ? { opacity: 0.6 } : null]}
            disabled={kiLoading}
          >
            <Text style={styles.kiTxt}>{kiLoading ? "KI..." : "KI"}</Text>
          </Pressable>

          <View style={styles.modePill}>
            <Text style={styles.modeTxt}>
              {mode === "NUR_APP" ? "NUR_APP" : baKey || "BA-... fehlt"}
            </Text>
          </View>
        </View>

        <Text style={styles.h1}>Fotos / Notizen</Text>
        <Text style={styles.sub}>
          {projectTitle}
          {baKey ? ` • ${baKey}` : ""}
        </Text>

        <View style={styles.card}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Datum</Text>
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Kostenstelle</Text>
              <TextInput
                value={kostenstelle}
                onChangeText={setKostenstelle}
                placeholder="z.B. KS-01"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>LV Pos (optional)</Text>
          <TextInput
            value={lvItemPos}
            onChangeText={setLvItemPos}
            placeholder="z.B. 01.02.003"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
          />

          <Text style={styles.label}>Notiz</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Notizen..."
            multiline
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={[styles.input, { height: 110, textAlignVertical: "top" }]}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Hauptfoto</Text>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Pressable style={styles.pillBtn} onPress={takeMainPhoto}>
              <Text style={styles.pillTxt}>📷 Kamera</Text>
            </Pressable>
            <Pressable style={styles.pillBtn} onPress={pickMainPhoto}>
              <Text style={styles.pillTxt}>+ Foto wählen</Text>
            </Pressable>
            {imageUri ? (
              <Pressable
                style={styles.pillBtn}
                onPress={() => setImageUri(null)}
              >
                <Text style={styles.pillTxt}>Entfernen</Text>
              </Pressable>
            ) : null}
          </View>

          {imageUri ? (
            <Pressable
              onPress={() => openAttachment(imageUri)}
              style={{ marginTop: 12 }}
            >
              <Image source={{ uri: imageUri }} style={styles.previewMain} />
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Tippen zum Öffnen
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.muted}>Kein Hauptfoto gewählt.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Anhänge</Text>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Pressable style={styles.pillBtn} onPress={addCameraAttachment}>
              <Text style={styles.pillTxt}>📷 Kamera</Text>
            </Pressable>
            <Pressable style={styles.pillBtn} onPress={addFile}>
              <Text style={styles.pillTxt}>+ Datei (PDF/Bild)</Text>
            </Pressable>
          </View>

          {files.length === 0 ? (
            <Text style={styles.muted}>Keine Anhänge hinzugefügt.</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              {files.map((f) => (
                <View key={String(f.id)} style={styles.fileRow}>
                  {isImageFile(f) ? (
                    <Pressable onPress={() => openAttachment(f.uri)}>
                      <Image
                        source={{ uri: String(f.uri) }}
                        style={styles.fileThumb}
                      />
                    </Pressable>
                  ) : null}

                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name || f.uri}
                  </Text>

                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable onPress={() => openAttachment(f.uri)}>
                      <Text style={styles.link}>Öffnen</Text>
                    </Pressable>
                    <Pressable onPress={() => removeAttachment(f.id)}>
                      <Text style={[styles.link, { color: "#C33" }]}>
                        Entfernen
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <DocActionBar
          onSaveOffline={onSaveOffline}
          onSubmit={onSubmit}
          onOpenPdf={onOpenPdf}
          onEmailPdf={onEmailPdf}
          onReset={onReset}
          showPdfActions={true}
          submitting={submitting}
        />

        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.h2}>Verlauf</Text>
          {history.length === 0 ? (
            <Text style={styles.muted}>
              {mode === "SERVER_SYNC"
                ? "Noch keine Einträge (lokal – wie NUR_APP)."
                : "Noch keine Einträge offline (NUR_APP)."}
            </Text>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(x, i) => String(x?.id || `h_${i}`)}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10, marginTop: 10 }}
              renderItem={({ item }) => {
                const t = String(item?.date || "").slice(0, 10) || "-";
                const fCount = Array.isArray(item?.files) ? item.files.length : 0;
                const hasMain = !!item?.imageUri;

                return (
                  <Pressable
                    onPress={() => {
                      navigation.navigate("PhotosNotes" as any, {
                        projectId,
                        projectCode: projectCodeParam,
                        title,
                        editId: String(item?.id || ""),
                        fromInbox: false,
                      });
                    }}
                  >
                    <View style={styles.histRow}>
                      {hasMain ? (
                        <Image
                          source={{ uri: String(item.imageUri) }}
                          style={styles.histThumb}
                        />
                      ) : null}

                      <View style={{ flex: 1 }}>
                        <Text style={styles.histTitle} numberOfLines={1}>
                          {["Fotos", t].filter(Boolean).join(" ")}
                        </Text>
                        <Text style={styles.histSub} numberOfLines={2}>
                          {String(item?.comment || item?.note || "—").slice(0, 60)}
                          {fCount ? ` • ${fCount} Datei(en)` : ""}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      <Modal
        visible={kiOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setKiOpen(false)}
      >
        <Pressable style={styles.modalWrap} onPress={() => setKiOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.modalTitle}>KI Vorschlag</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setKiOpen(false)} style={styles.closeX}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 10, maxHeight: modalMaxH }}>
              {kiLoading ? (
                <Text style={styles.muted}>KI läuft…</Text>
              ) : kiUi ? (
                <Text style={styles.modalText} selectable>
                  {kiUi.humanText}
                </Text>
              ) : (
                <Text style={styles.muted}>Kein Ergebnis.</Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: "#111" }]}
                onPress={() => setKiOpen(false)}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Schließen
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: COLORS.primary,
                    opacity:
                      !kiLoading && kiUi?.suggestions?.[0]?.fieldPatches ? 1 : 0.5,
                  },
                ]}
                onPress={applyKiPatches}
                disabled={kiLoading || !kiUi?.suggestions?.[0]?.fieldPatches}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  Übernehmen
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backTxt: { color: "#fff", fontWeight: "900" },

  kiPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(122,77,255,0.18)",
  },
  kiTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modeTxt: { color: "rgba(255,255,255,0.9)", fontWeight: "900", fontSize: 12 },

  h1: { fontSize: 34, fontWeight: "900", color: "#fff" },
  sub: { marginTop: 6, color: "rgba(255,255,255,0.75)", fontWeight: "800" },

  card: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  h2: { color: "#fff", fontWeight: "900", fontSize: 16, marginBottom: 10 },
  label: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "800",
  },
  muted: { marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: "700" },

  pillBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillTxt: { color: "#fff", fontWeight: "900" },

  previewMain: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  fileRow: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fileThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  fileName: { flex: 1, color: "#fff", fontWeight: "800" },
  link: { color: COLORS.primary, fontWeight: "900" },

  histRow: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  histThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  histTitle: { color: "#fff", fontWeight: "900" },
  histSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.70)",
    fontWeight: "700",
  },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    padding: 16,
  },
  modalCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#0B1720",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 18 },
  modalText: {
    color: "rgba(255,255,255,0.88)",
    fontWeight: "700",
    lineHeight: 20,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  closeX: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
});
