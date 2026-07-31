// apps/mobile/src/screens/PhotosNotesScreen.tsx
import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { registerRlcKiModuleHandler } from "../lib/rlcKiModuleBridge";
import { parseRlcFotos } from "../lib/rlcKiFieldParser";
import { Keyboard, SafeAreaView, View, Text, TextInput, Pressable, Alert, ScrollView, FlatList, Platform, Linking, Modal, Image, Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useFocusEffect } from "@react-navigation/native";
import { api, looksLikeProjectCode } from "../lib/api";
import { COLORS, RLC_SPACING, RLC_RADIUS, createRlcStyles } from "../ui/theme";
import { DocActionBar } from "../components/DocActionBar";
import { queueAdd, queueCleanupDone, queueNormalizeExisting, queueProcessPending, queueStats, queueList, type QueueItem, type DateiMeta, type ExtraRow, type DetectBox } from "../lib/offlineQueue";
import { exportPhotosPdfToProject, emailPdf } from "../lib/exporters/projectExport";
type Props = NativeStackScreenProps<RootStackParamList, "PhotosNotes">;
const KEY_MODE = "rlc_mobile_mode";

/** =========================
 * OK KEYS POLICY (HARD)
 * SERVER_SYNC  -> server inbox key (legacy UI mirror only):
 *   rlc_mobile_inbox_fotos:${BA-...}
 *
 * LOCAL STORE (used for UI/history/edit ALWAYS):
 *   rlc_mobile_offline_fotos:${localKey}
 *
 * InboxScreen reads:
 *   rlc_mobile_inbox_photos:${FSKEY}
 *   rlc_mobile_inbox_fotos:${FSKEY}
 * ========================= */

function inboxFotosKey(projectKey: string) {
  return `rlc_mobile_inbox_fotos:${projectKey}`;
}
function inboxPhotosKey(projectKey: string) {
  return `rlc_mobile_inbox_photos:${projectKey}`;
}
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
  const out: DateiMeta[] = [];
  for (const f of arr) {
    if (!f) continue;
    if (typeof f === "string") {
      const uri = String(f).trim();
      if (!uri) continue;
      out.push({
        id: uid("f"),
        name: uri.split("/").pop() || `file_${Date.now()}`,
        uri,
        type: undefined
      });
      continue;
    }
    const uri = String(f?.uri || f?.url || f?.path || "").trim();
    if (!uri) continue;
    out.push({
      id: String(f?.id || uid("f")),
      name: f?.name || f?.filename || uri.split("/").pop() || `file_${Date.now()}`,
      uri,
      type: f?.type || f?.mime || f?.mimeType
    });
  }
  const seen = new Set<string>();
  return out.filter(x => {
    const u = String(x?.uri || "").trim();
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}
function hasAnyContent(row: any): boolean {
  const anyText = String(row?.note || row?.comment || "").trim().length > 0;
  const anyField = String(row?.kostenstelle || "").trim().length > 0 || String(row?.lvItemPos || "").trim().length > 0 || String(row?.date || "").trim().length > 0;
  const anyFile = Array.isArray(row?.files) && row.files.length > 0;
  const anyMain = !!row?.imageUri;
  return anyText || anyField || anyFile || anyMain;
}

/** =========================================================
 * OK PERSIST FILE URI (FIX preview nere / riapertura)
 * ========================================================= */

function normDir(d: string) {
  return d.endsWith("/") ? d : d + "/";
}
function safeFsKey(k: string) {
  return String(k || "").trim().replace(/[^\w.\-]+/g, "_").slice(0, 80);
}
async function ensureDir(dirUri: string) {
  const d = normDir(dirUri);
  const info = await FileSystem.getInfoAsync(d);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(d, {
      intermediates: true
    });
  }
}
function isPhUri(u?: string) {
  const s = String(u || "");
  return s.startsWith("ph://") || s.startsWith("assets-library://");
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
async function convertToJpegIfNeeded(uri: string, hint?: {
  name?: string;
  type?: string;
}) {
  if (Platform.OS === "web") return uri;
  const ext = extFromNameOrUri(hint?.name, uri, hint?.type);
  const needs = isPhUri(uri) || shouldConvertToJpegByExt(ext);
  if (!needs) return uri;
  const tries = [{
    resize: {
      width: 1400
    } as any,
    compress: 0.9
  }, {
    resize: {
      width: 1100
    } as any,
    compress: 0.85
  }];
  for (const t of tries) {
    try {
      const out = await ImageManipulator.manipulateAsync(uri, [{
        resize: t.resize
      }], {
        compress: t.compress,
        format: ImageManipulator.SaveFormat.JPEG
      });
      if (out?.uri) return out.uri;
    } catch {}
  }
  return uri;
}
async function persistToProjectFileUri(params: {
  projectFsKey: string;
  uri: string;
  nameHint?: string;
  typeHint?: string;
  prefix?: string;
}): Promise<string> {
  const {
    projectFsKey,
    uri,
    nameHint,
    typeHint,
    prefix
  } = params;
  const input = String(uri || "").trim();
  if (!input) return "";
  if (Platform.OS === "web") return input;
  const root = String(FileSystem.documentDirectory || "").trim();
  if (!root) return input;
  const fsKey = safeFsKey(projectFsKey);
  const base = normDir(root);
  const dir = `${base}projects/${fsKey}/inbox/fotos/files/`;
  await ensureDir(dir);
  const converted = await convertToJpegIfNeeded(input, {
    name: nameHint,
    type: typeHint
  });
  const ext0 = extFromNameOrUri(nameHint, input, typeHint);
  const ext = isPhUri(input) || shouldConvertToJpegByExt(ext0) || converted !== input ? "jpg" : ext0;
  const fileNameSafeBase = String(nameHint || "").trim().replace(/[\/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").slice(0, 80) || "";
  const baseName = fileNameSafeBase ? fileNameSafeBase.replace(/\.(\w{1,6})$/, "") : `${prefix || "f"}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  const target = `${dir}${baseName}.${ext}`;
  try {
    try {
      await FileSystem.deleteAsync(target, {
        idempotent: true
      });
    } catch {}
    await FileSystem.copyAsync({
      from: converted,
      to: target
    });
    return target.startsWith("file://") ? target : `file://${target}`;
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.log("[PHOTOS] persistToProjectFileUri FAILED:", msg, {
      input,
      converted,
      target
    });
    if (isFileUri(converted)) return converted;
    return input;
  }
}

/** OK upsert helper */
function upsertRow(list: any[], row: any) {
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex(x => String(x?.id || "") === String(row?.id || ""));
  if (idx >= 0) next[idx] = {
    ...next[idx],
    ...row,
    updatedAt: nowIso()
  };else next.unshift(row);
  return next;
}

/** OK Write Photos rows to Offline-Inbox keys so InboxScreen can display immediately */
async function writePhotosToOfflineInbox(projectKey: string, row: any) {
  const k1 = inboxPhotosKey(projectKey);
  const k2 = inboxFotosKey(projectKey);
  const arr1 = await loadArray(k1);
  await saveArray(k1, upsertRow(arr1, row));
  const arr2 = await loadArray(k2);
  await saveArray(k2, upsertRow(arr2, row));
}

// RLC_FOTOS_WRITE_ALL_INBOX_KEYS_V1
async function writePhotosToAllInboxKeys(keys: any[], row: any) {
  const unique = Array.from(new Set((keys || []).map(x => String(x || "").trim()).filter(Boolean)));
  for (const key of unique) {
    try {
      await writePhotosToOfflineInbox(key, row);
    } catch {}
  }
}
function normalizeInboxSnapshotPhoto(snapRaw: any, editId: string) {
  if (!snapRaw || typeof snapRaw !== "object") return null;
  const payload = (snapRaw as any)?.payload;
  const rowFromPayload = payload?.row;
  const rowFromDirect = (snapRaw as any)?.row;
  const base: any = rowFromPayload && typeof rowFromPayload === "object" && rowFromPayload || rowFromDirect && typeof rowFromDirect === "object" && rowFromDirect || snapRaw;
  const filesPool = base?.files ?? base?.attachments ?? base?.photos ?? payload?.files ?? payload?.attachments ?? payload?.photos ?? [];
  const normalizedFiles = normalizeFiles(filesPool);
  const explicitMain = String(base?.imageUri || base?.imageMeta?.uri || base?.image?.uri || "").trim() || null;
  const fallbackMain = normalizedFiles.find(f => {
    const u = String(f?.uri || "").toLowerCase();
    const t = String(f?.type || "").toLowerCase();
    return t.startsWith("image/") || u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".webp") || u.endsWith(".heic") || u.endsWith(".heif");
  })?.uri || null;
  return {
    ...base,
    id: String(base?.id || base?.docId || (snapRaw as any)?.id || editId),
    kind: "fotos",
    workflowStatus: (base?.workflowStatus || payload?.workflowStatus || "EINGEREICHT") as "DRAFT" | "EINGEREICHT",
    projectId: base?.projectId ?? null,
    projectCode: base?.projectCode ?? null,
    date: String(base?.date || payload?.date || ymdToday()).slice(0, 10),
    kostenstelle: String(base?.kostenstelle || ""),
    lvItemPos: String(base?.lvItemPos || "").trim() || null,
    ortAbschnitt: String(base?.ortAbschnitt || base?.location || base?.ort || ""),
    location: String(base?.location || base?.ortAbschnitt || base?.ort || ""),
    ort: String(base?.ort || base?.ortAbschnitt || base?.location || ""),
    kategorie: String(base?.kategorie || base?.category || ""),
    category: String(base?.category || base?.kategorie || ""),
    gewerk: String(base?.gewerk || base?.trade || ""),
    trade: String(base?.trade || base?.gewerk || ""),
    fotoStatus: String(base?.fotoStatus || base?.statusFoto || base?.status || ""),
    statusFoto: String(base?.statusFoto || base?.fotoStatus || base?.status || ""),
    tags: Array.isArray(base?.tags) ? base.tags.join(", ") : String(base?.tags || ""),
    comment: String(base?.comment || base?.note || base?.bemerkungen || ""),
    bemerkungen: String(base?.bemerkungen || base?.comment || base?.note || ""),
    note: String(base?.note || base?.comment || base?.bemerkungen || ""),
    imageUri: explicitMain || fallbackMain,
    files: normalizedFiles,
    attachments: normalizedFiles,
    photos: normalizedFiles,
    extras: Array.isArray(base?.extras) ? base.extras : undefined,
    boxes: Array.isArray(base?.boxes) ? base.boxes : undefined,
    updatedAt: String(base?.updatedAt || nowIso()),
    createdAt: String(base?.createdAt || nowIso())
  };
}
function normalizeKiPhotosResult(raw: any) {
  const root = raw?.data && typeof raw.data === "object" ? raw.data : raw?.result && typeof raw.result === "object" ? raw.result : raw;
  const suggestions = Array.isArray(root?.suggestions) ? root.suggestions : Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  const firstSuggestion = suggestions[0] || root?.suggestion || raw?.suggestion || null;
  const directFields = root?.fields || raw?.fields || root?.extractedFields || raw?.extractedFields || root?.fieldPatches || raw?.fieldPatches || null;
  const fallbackDirectObject = !firstSuggestion && root && typeof root === "object" && (root.note != null || root.comment != null || root.bemerkungen != null || root.kostenstelle != null || root.lvItemPos != null || root.lvPos != null || root.materialien != null || root.materials != null || root.extras != null || root.boxes != null) ? root : null;
  const fieldPatches = firstSuggestion?.fieldPatches || firstSuggestion?.extractedFields || firstSuggestion?.patch || firstSuggestion?.fields || directFields || fallbackDirectObject || null;
  const errorMessage = String(root?.error?.message || raw?.error?.message || root?.message || raw?.message || "").trim();
  const notes = String(firstSuggestion?.notes || root?.notes || raw?.notes || errorMessage || "KI Analyse abgeschlossen.").trim();
  const suggestion = fieldPatches ? {
    ...(firstSuggestion && typeof firstSuggestion === "object" ? firstSuggestion : {}),
    fieldPatches
  } : firstSuggestion || fallbackDirectObject;
  return {
    suggestion: suggestion || null,
    notes,
    raw,
    errorMessage
  };
}
function toFlatKiObject(input: any): Record<string, any> {
  if (!input) return {};
  if (typeof input === "object" && !Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input)) {
    const out: Record<string, any> = {};
    for (const p of input) {
      if (!p) continue;
      const path = typeof p.path === "string" ? p.path : "";
      if (path) {
        const k = path.replace(/^\//, "").replace(/^row\//, "").replace(/\//g, ".").trim();
        if (k) out[k] = p.value;
        continue;
      }
      const field = String(p.field || p.key || p.name || "").trim();
      if (field) out[field] = p.value ?? p.val ?? p.v ?? p.data;
    }
    return out;
  }
  return {};
}
function normalizeExtras(input: any): ExtraRow[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input.map(x => {
    if (!x || typeof x !== "object") return null;
    return {
      id: String(x.id || `extra_${Date.now()}_${Math.random().toString(16).slice(2)}`),
      typ: "KI",
      lvPos: String(x.lvPos || x.lv || x.position || "").trim() || undefined,
      beschreibung: String(x.label || x.name || x.key || x.value || x.text || x.val || "").trim(),
      einheit: String(x.einheit || x.unit || "").trim(),
      menge: x.menge == null || x.menge === "" ? 0 : Number(x.menge)
    } as ExtraRow;
  }).filter((x): x is ExtraRow => !!x && !!x.beschreibung);
  return out.length ? out : undefined;
}
function normalizeBoxes(input: any): DetectBox[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input.map(b => {
    if (!b || typeof b !== "object") return null;
    const x = Number(b.x);
    const y = Number(b.y);
    const w = Number(b.w ?? b.width);
    const h = Number(b.h ?? b.height);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return {
      id: String(b.id || `box_${Date.now()}_${Math.random().toString(16).slice(2)}`),
      x,
      y,
      w,
      h,
      label: String(b.label || b.name || "").trim() || undefined,
      score: Number.isFinite(Number(b.score)) ? Number(b.score) : undefined
    } as DetectBox;
  }).filter((x): x is DetectBox => !!x);
  return out.length ? out : undefined;
}
function sstr(v: any) {
  return String(v ?? "").trim();
}
function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}
function isDateLike(v: any) {
  const s = sstr(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}\.\d{2}\.\d{4}$/.test(s);
}
function capitalizeGermanSentence(input: string) {
  const s = sstr(input);
  if (!s) return "";
  const normalized = s.replace(/\s+/g, " ").trim();
  const first = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}
function inferTechnicalNote(rawText: string, fp?: Record<string, any>) {
  const source = sstr(firstNonEmpty(fp?.technicalText, fp?.technischerText, fp?.description, fp?.beschreibung, fp?.summary, fp?.text, fp?.note, fp?.comment, fp?.bemerkungen, rawText));
  if (!source) return "";
  const src = source.toLowerCase();
  const dnMatch = source.match(/\bDN\s*[-]?\s*(\d+(?:[.,]\d+)?)\b/i) || source.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/i);
  const dn = dnMatch ? String(dnMatch[1]).replace(",", ".") : "";
  const hasRohr = /\brohr|rohre|leitung|leitungen\b/i.test(src);
  const hasSpeedpipe = /\bspeedpipe\b/i.test(src);
  const hasKabel = /\bkabel|kabelleitung|leitungen\b/i.test(src);
  const hasGraben = /\bgraben\b/i.test(src);
  const hasVerlegt = /\bverlegt|verlegung\b/i.test(src);
  const hasEingezogen = /\beingezogen|eingezogenen\b/i.test(src);
  const hasAuffuellen = /\baufgefüllt|aufgef[üu]llt|verfüllt|verfullt\b/i.test(src);
  if (hasSpeedpipe && dn && (hasVerlegt || hasEingezogen)) {
    return `Speedpipe DN ${dn} wurde verlegt.`;
  }
  if (hasSpeedpipe && dn) {
    return `Speedpipe DN ${dn} wurde eingebaut.`;
  }
  if (hasRohr && dn && hasVerlegt) {
    return `Es wurden Rohre DN ${dn} verlegt.`;
  }
  if (hasRohr && dn) {
    return `Rohr DN ${dn} wurde eingebaut.`;
  }
  if (hasGraben && hasKabel && hasVerlegt) {
    return `Im Graben wurden Kabel verlegt.`;
  }
  if (hasGraben && hasKabel) {
    return `Im Graben wurden Kabel eingebaut.`;
  }
  if (hasGraben && hasAuffuellen) {
    return `Die Baugrube wurde aufgefüllt.`;
  }
  if (hasKabel && hasVerlegt) {
    return `Es wurden Kabel verlegt.`;
  }
  if (hasRohr && hasVerlegt) {
    return capitalizeGermanSentence(source);
  }
  return capitalizeGermanSentence(source);
}
function buildKiSuggestionFromFields(rawText: string, fields: Record<string, any>): {
  fieldPatches: Record<string, any>;
  notes: string;
} {
  const noteVal = firstNonEmpty(fields.note, fields.comment, fields.bemerkungen, fields.text, fields.description, fields.beschreibung, fields.summary, fields.technicalText, fields.technischerText);
  const technicalNote = inferTechnicalNote(String(noteVal || rawText || ""), fields);
  const next: Record<string, any> = {
    ...fields
  };
  if (technicalNote && !isDateLike(technicalNote)) {
    next.note = technicalNote;
    next.comment = technicalNote;
    next.bemerkungen = technicalNote;
    if (!next.technicalText) next.technicalText = technicalNote;
  }
  if (!next.kostenstelle && fields.costCenter) next.kostenstelle = fields.costCenter;
  if (!next.lvItemPos && fields.lvPos) next.lvItemPos = fields.lvPos;
  if (!next.lvItemPos && fields.lvPosition) next.lvItemPos = fields.lvPosition;
  const extras = normalizeExtras(next.extras ?? next.materialien ?? next.materials ?? null);
  if (extras) next.extras = extras;
  const boxes = normalizeBoxes(next.boxes ?? next.detectBoxes ?? next.detections ?? null);
  if (boxes) next.boxes = boxes;
  return {
    fieldPatches: next,
    notes: technicalNote || "KI Analyse abgeschlossen."
  };
}
export default function PhotosNotesScreen({
  route,
  navigation
}: Props) {
  const projectId = String((route.params as any)?.projectId || "").trim();
  const projectCodeParam = String((route.params as any)?.projectCode || "").trim();
  const title = String((route.params as any)?.title || "").trim();
  const editId = String((route.params as any)?.editId || "").trim();
  const fromInbox = !!(route.params as any)?.fromInbox;
  const inboxSnapshot = (route.params as any)?.inboxSnapshot;
  const initialSnapshot = useMemo(() => {
    if (!inboxSnapshot) return null;
    return normalizeInboxSnapshotPhoto(inboxSnapshot, String(editId || "ph_inbox"));
  }, [inboxSnapshot, editId]);
  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState(initialSnapshot?.date || ymdToday());
  const [kostenstelle, setKostenstelle] = useState(initialSnapshot?.kostenstelle || "");
  const [lvItemPos, setLvItemPos] = useState(initialSnapshot?.lvItemPos || "");
  const [ortAbschnitt, setOrtAbschnitt] = useState(initialSnapshot?.ortAbschnitt || initialSnapshot?.location || initialSnapshot?.ort || "");
  const [kategorie, setKategorie] = useState(initialSnapshot?.kategorie || initialSnapshot?.category || "");
  const [gewerk, setGewerk] = useState(initialSnapshot?.gewerk || initialSnapshot?.trade || "");
  const [fotoStatus, setFotoStatus] = useState(initialSnapshot?.fotoStatus || initialSnapshot?.statusFoto || initialSnapshot?.status || "");
  const [tags, setTags] = useState(Array.isArray(initialSnapshot?.tags) ? initialSnapshot.tags.join(", ") : String(initialSnapshot?.tags || ""));
  const [note, setNote] = useState(initialSnapshot?.note || initialSnapshot?.comment || initialSnapshot?.bemerkungen || "");
  const [imageUri, setImageUri] = useState<string | null>(initialSnapshot?.imageUri || null);
  const [files, setFiles] = useState<DateiMeta[]>(normalizeFiles(initialSnapshot?.files || []));
  const [extras, setExtras] = useState<ExtraRow[] | undefined>(initialSnapshot?.extras);
  const [boxes, setBoxes] = useState<DetectBox[] | undefined>(initialSnapshot?.boxes);
  const [history, setHistory] = useState<any[]>([]);
  const [lastPdfUri, setLastPdfUri] = useState<string | null>(null);
  const [lastPdfName, setLastPdfName] = useState<string | null>(null);
  const [kiOpen, setKiOpen] = useState(false);
  const [kiLoading, setKiLoading] = useState(false);
  const [kiUi, setKiUi] = useState<any | null>(null);
  const [kiInput, setKiInput] = useState("");
  const kiInputOverrideRef = useRef("");
  const inboxSnapshotAppliedRef = useRef(false);
  const focusLoadGuardRef = useRef<string>("");
  const baKey = useMemo(() => {
    const a = String(projectCodeParam || "").trim();
    const c = String((route.params as any)?.projectId || "").trim();
    const pick = a || c;
    return looksLikeProjectCode(pick) ? pick : "";
  }, [projectCodeParam, (route.params as any)?.projectId]);
  const localKey = useMemo(() => {
    return String(projectId || "").trim() || "unknown";
  }, [projectId]);
  const inboxProjectKey = useMemo(() => {
    return String(baKey || "").trim();
  }, [baKey]);
  const projectTitle = useMemo(() => title || baKey || "Projekt", [title, baKey]);
  const localStoreKey = useMemo(() => offlineKey(localKey), [localKey]);
  React.useEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: COLORS.bg
      },
      headerTitleStyle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "600"
      },
      headerTintColor: COLORS.text,
      headerRight: undefined
    });
  }, [navigation, projectId, baKey, projectCodeParam, mode]);
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
  const applyProfessionalPhotoFields = useCallback((src: any) => {
    setOrtAbschnitt(String(src?.ortAbschnitt || src?.location || src?.ort || "").trim());
    setKategorie(String(src?.kategorie || src?.category || "").trim());
    setGewerk(String(src?.gewerk || src?.trade || "").trim());
    setFotoStatus(String(src?.fotoStatus || src?.statusFoto || src?.status || "").trim());
    setTags(Array.isArray(src?.tags) ? src.tags.join(", ") : String(src?.tags || "").trim());
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
  const applyInboxSnapshotIfAny = useCallback(async (localKeyForEdit: string) => {
    if (!editId || !fromInbox || !initialSnapshot || inboxSnapshotAppliedRef.current) {
      return false;
    }
    inboxSnapshotAppliedRef.current = true;
    setDate(String(initialSnapshot?.date || ymdToday()).slice(0, 10));
    setKostenstelle(String(initialSnapshot?.kostenstelle || ""));
    setLvItemPos(String(initialSnapshot?.lvItemPos || ""));
    applyProfessionalPhotoFields(initialSnapshot);
    setNote(String(initialSnapshot?.note || initialSnapshot?.comment || initialSnapshot?.bemerkungen || ""));
    setImageUri(initialSnapshot?.imageUri || null);
    setFiles(normalizeFiles(initialSnapshot?.files || []));
    setExtras(initialSnapshot?.extras);
    setBoxes(initialSnapshot?.boxes);
    const arrL = await loadArray(localKeyForEdit);
    await saveArray(localKeyForEdit, upsertRow(arrL, initialSnapshot));
    return true;
  }, [editId, fromInbox, initialSnapshot, applyProfessionalPhotoFields]);
  const loadEditIfNeeded = useCallback(async (localKeyForEdit: string, inboxKeyForEdit: string) => {
    if (!editId) return;
    setLoading(true);
    try {
      const appliedSnapshot = await applyInboxSnapshotIfAny(localKeyForEdit);
      if (appliedSnapshot) return;
      if (fromInbox) {
        const k1 = inboxPhotosKey(inboxKeyForEdit);
        const k2 = inboxFotosKey(inboxKeyForEdit);
        const a1 = await loadArray(k1);
        const a2 = await loadArray(k2);
        const foundInbox = (a1 || []).find(x => String(x?.id || "") === editId) || (a2 || []).find(x => String(x?.id || "") === editId) || null;
        if (foundInbox) {
          const arrL = await loadArray(localKeyForEdit);
          await saveArray(localKeyForEdit, upsertRow(arrL, foundInbox));
          setDate(String(foundInbox?.date || ymdToday()).slice(0, 10));
          setKostenstelle(String(foundInbox?.kostenstelle || ""));
          setLvItemPos(String(foundInbox?.lvItemPos || ""));
          applyProfessionalPhotoFields(foundInbox);
          setNote(String(foundInbox?.note || foundInbox?.comment || foundInbox?.bemerkungen || ""));
          setImageUri(foundInbox?.imageUri || null);
          setFiles(normalizeFiles(foundInbox?.files || foundInbox?.attachments || foundInbox?.photos || []));
          setExtras(foundInbox?.extras);
          setBoxes(foundInbox?.boxes);
          return;
        }
      }
      const arr = await loadArray(localKeyForEdit);
      const found = (arr || []).find(x => String(x?.id || "") === editId);
      if (!found) return;
      setDate(String(found?.date || ymdToday()).slice(0, 10));
      setKostenstelle(String(found?.kostenstelle || ""));
      setLvItemPos(String(found?.lvItemPos || ""));
      applyProfessionalPhotoFields(found);
      setNote(String(found?.note || found?.comment || found?.bemerkungen || ""));
      setImageUri(found?.imageUri || null);
      setFiles(normalizeFiles(found?.files || found?.attachments || found?.photos || []));
      setExtras(found?.extras);
      setBoxes(found?.boxes);
    } finally {
      setLoading(false);
    }
  }, [editId, fromInbox, applyInboxSnapshotIfAny, applyProfessionalPhotoFields]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const runKey = [localStoreKey, inboxProjectKey, editId || "", fromInbox ? "1" : "0", initialSnapshot?.id || ""].join("|");
    if (focusLoadGuardRef.current === runKey) {
      return () => {};
    }
    focusLoadGuardRef.current = runKey;
    (async () => {
      const mNow = await readMode();
      if (!alive) return;
      await loadHistory(localStoreKey);
      if (!alive) return;
      await loadEditIfNeeded(localStoreKey, inboxProjectKey);
      if (!alive) return;
      queueCleanupDone().catch(() => {});
      if (mNow === "SERVER_SYNC" && !baKey) {
        // informative only
      }
    })();
    return () => {
      alive = false;
      focusLoadGuardRef.current = "";
    };
  }, [readMode, loadHistory, loadEditIfNeeded, localStoreKey, inboxProjectKey, baKey, editId, fromInbox, initialSnapshot?.id]));
  const buildRow = useCallback((workflowStatus?: "DRAFT" | "EINGEREICHT") => {
    const now = nowIso();
    const id = editId || uid("ph");
    return {
      id,
      kind: "fotos",
      workflowStatus: workflowStatus || "DRAFT",
      projectId: projectId || null,
      projectCode: baKey || null,
      date: String(date || ymdToday()).slice(0, 10),
      kostenstelle: String(kostenstelle || "").trim(),
      lvItemPos: String(lvItemPos || "").trim() || null,
      ortAbschnitt: String(ortAbschnitt || "").trim(),
      location: String(ortAbschnitt || "").trim(),
      ort: String(ortAbschnitt || "").trim(),
      kategorie: String(kategorie || "").trim(),
      category: String(kategorie || "").trim(),
      gewerk: String(gewerk || "").trim(),
      trade: String(gewerk || "").trim(),
      fotoStatus: String(fotoStatus || "").trim(),
      statusFoto: String(fotoStatus || "").trim(),
      tags: String(tags || "").trim(),
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
      createdAt: now
    };
  }, [editId, projectId, baKey, date, kostenstelle, lvItemPos, ortAbschnitt, kategorie, gewerk, fotoStatus, tags, note, imageUri, files, extras, boxes]);
  const ensureServerAllowed = useCallback(() => {
    if (!baKey) {
      Alert.alert("Fotos / Notizen (Server)", "BA-... Projekt-Code fehlt! Fix: beim Navigate() immer projectCode=BA-... mitsenden.");
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
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.9
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
        prefix: "main"
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
        quality: 0.9
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
        prefix: "main"
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
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.9
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;
      const fsKey = (baKey || localKey).trim();
      const persisted = await persistToProjectFileUri({
        projectFsKey: fsKey,
        uri: a.uri,
        nameHint: (a as any).fileName || `Kamera_${Date.now()}.jpg`,
        typeHint: (a as any).mimeType || "image/jpeg",
        prefix: "att"
      });
      setFiles(prev => normalizeFiles([...prev, {
        id: uid("cam"),
        uri: persisted || a.uri,
        name: (a as any).fileName || `Kamera_${Date.now()}.jpg`,
        type: (a as any).mimeType || "image/jpeg"
      }]));
    } catch (e: any) {
      Alert.alert("Kamera", e?.message || "Foto konnte nicht aufgenommen werden.");
    }
  }, [baKey, localKey]);
  const addFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true
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
        prefix: "file"
      });
      setFiles(prev => normalizeFiles([...prev, {
        id: uid("file"),
        uri: persisted || a.uri,
        name: a.name || `Datei_${Date.now()}`,
        type: a.mimeType || "application/octet-stream"
      }]));
    } catch (e: any) {
      Alert.alert("Datei", e?.message || "Datei konnte nicht hinzugefügt werden.");
    }
  }, [baKey, localKey]);
  const openAttachment = useCallback(async (u?: string) => {
    if (!u) return;
    const uri = String(u);
    if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("file://")) {
      try {
        await Linking.openURL(uri);
      } catch {
        Alert.alert("Öffnen", "Konnte nicht geöffnet werden.");
      }
      return;
    }
    Alert.alert("Öffnen", "content:// oder ph:// kann nicht direkt geöffnet werden. Bitte PDF exportieren oder als Anhang nutzen.");
  }, []);
  const removeAttachment = useCallback((id?: string) => {
    if (!id) return;
    setFiles(prev => prev.filter(x => x.id !== id));
  }, []);
  const addToInboxQueueOffline = useCallback(async (row: any, status: "DRAFT" | "EINGEREICHT") => {
    if (mode !== "NUR_APP") return;
    await queueNormalizeExisting();
    await queueAdd({
      kind: "PHOTO_NOTE",
      projectId: localKey,
      payload: {
        workflowStatus: status,
        row
      } as any
    });
  }, [mode, localKey]);
  const onSaveOffline = useCallback(async () => {
    const row = buildRow("DRAFT");
    if (!hasAnyContent(row)) {
      Alert.alert("Fotos / Notizen", "Bitte mindestens ein Feld oder Foto/Datei hinzufügen.");
      return;
    }
    setLoading(true);
    try {
      const mNow = await readMode();
      const arrL = await loadArray(localStoreKey);
      await saveArray(localStoreKey, upsertRow(arrL, {
        ...row,
        workflowStatus: "DRAFT"
      }));
      if (mNow === "NUR_APP") {
        const inboxKey = (inboxProjectKey || localKey).trim();
        await writePhotosToOfflineInbox(inboxKey, {
          ...row,
          workflowStatus: "DRAFT"
        });
        await addToInboxQueueOffline(row, "DRAFT");
      }
      await loadHistory(localStoreKey);
      Alert.alert("Gespeichert", mNow === "SERVER_SYNC" ? "Lokal gespeichert." : "Offline gespeichert (NUR_APP) + Inbox aktualisiert.");
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [buildRow, readMode, localStoreKey, loadHistory, addToInboxQueueOffline, inboxProjectKey, localKey]);
  const onSubmit = useCallback(async () => {
    const row = buildRow("EINGEREICHT");
    if (!hasAnyContent(row)) {
      Alert.alert("Fotos / Notizen", "Bitte mindestens ein Feld oder Foto/Datei hinzufügen.");
      return;
    }
    setSubmitting(true);
    try {
      const mNow = await readMode();
      const arrL = await loadArray(localStoreKey);
      await saveArray(localStoreKey, upsertRow(arrL, {
        ...row,
        workflowStatus: "EINGEREICHT"
      }));
      await loadHistory(localStoreKey);

      // RLC_FOTOS_WRITE_FULL_INBOX_AFTER_SAVE_SUBMIT_V1
      const fullFotosRowForInbox = {
        ...row,
        workflowStatus: row?.workflowStatus || "EINGEREICHT",
        payload: {
          row,
          ...((row as any)?.payload || {})
        }
      };
      await writePhotosToAllInboxKeys([inboxProjectKey, baKey, localKey, projectId], fullFotosRowForInbox);
      if (mNow === "NUR_APP") {
        const inboxKey = (inboxProjectKey || localKey).trim();
        await writePhotosToOfflineInbox(inboxKey, {
          ...row,
          workflowStatus: "EINGEREICHT"
        });
        await addToInboxQueueOffline(row, "EINGEREICHT");
        Alert.alert("Einreichen", "Offline eingereicht (NUR_APP).");
        if (!fromInbox) navigation.goBack();
        return;
      }
      if (!ensureServerAllowed()) {
        Alert.alert("Einreichen", "Lokal gespeichert, aber Server-Sync nicht möglich (BA-... fehlt).");
        return;
      }
      await queueNormalizeExisting();
      await queueAdd({
        kind: "PHOTO_NOTE",
        projectId: baKey,
        payload: {
          date: String(row?.date || ""),
          note: String(row?.note || row?.bemerkungen || row?.comment || ""),
          imageUri: row?.imageUri || null,
          extras: Array.isArray(row?.extras) ? row.extras : [],
          boxes: Array.isArray(row?.boxes) ? row.boxes : [],
          docId: row?.id,
          kostenstelle: row?.kostenstelle || "",
          lvItemPos: row?.lvItemPos || null,
          comment: row?.comment || "",
          bemerkungen: row?.bemerkungen || "",
          files: Array.isArray(row?.files) ? row.files : Array.isArray(row?.attachments) ? row.attachments : []
        }
      });
      try {
        const s = await queueStats();
        const list = await queueList();
        console.log("QUEUE_STATS", s);
        console.log("QUEUE_ITEMS", list.slice(0, 10).map(x => ({
          id: x.id,
          kind: x.kind,
          projectId: x.projectId,
          status: x.status,
          tries: x.tries,
          nextTryAt: x.nextTryAt,
          error: x.error
        })));
      } catch (e: any) {
        console.log("QUEUE_DEBUG_FAILED", String(e?.message || e));
      }
      await queueProcessPending(async (item: QueueItem) => {
        if (item.kind !== "PHOTO_NOTE" && item.kind !== "FOTOS_NOTIZEN") {
          return null;
        }
        const payload = (item as any)?.payload || {};
        const r = payload?.row ?? payload ?? {};
        const ba = String(payload?.projectCode || "").trim() || String(item.projectId || "").trim();
        if (!looksLikeProjectCode(ba)) {
          throw new Error(`PHOTO_NOTE push: missing BA projectCode (got '${ba}')`);
        }
        return await (api as any).pushPhotosToServer(ba, r);
      });
      Alert.alert("Einreichen", "Eingereicht + Server gespeichert (Eingangsprüfung).");
      if (!fromInbox) navigation.goBack();
    } catch (e: any) {
      Alert.alert("Einreichen", e?.message || "Einreichen fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }, [buildRow, readMode, localStoreKey, loadHistory, addToInboxQueueOffline, ensureServerAllowed, fromInbox, navigation, baKey, inboxProjectKey, localKey]);
  const onOpenPdf = useCallback(async () => {
    try {
      const row = buildRow("EINGEREICHT");
      const payloadDate = String(row?.date || ymdToday()).slice(0, 10) || ymdToday();
      const shortId = String(row?.id || "doc").replace(/[^a-zA-Z0-9]/g, "").slice(-6);
      const out = await exportPhotosPdfToProject({
        projectFsKey: baKey || localKey,
        projectTitle,
        wantCsv: false,
        filenameHint: `Fotos_${payloadDate}_${shortId}`,
        row
      } as any);
      setLastPdfUri(out.pdfUri);
      setLastPdfName(out.fileName);
      if (Platform.OS !== "web" && out?.pdfUri) {
        navigation.navigate("PdfViewer", {
          uri: out.pdfUri,
          title: out.fileName || `Fotos ${payloadDate}`,
          projectId,
          projectCode: baKey || projectCodeParam,
          documentType: "FOTOS"
        });
      } else {
        Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
      }
    } catch (e: any) {
      Alert.alert("PDF", e?.message || "PDF Export fehlgeschlagen.");
    }
  }, [buildRow, baKey, localKey, projectTitle, navigation, projectId, projectCodeParam]);
  const onEmailPdf = useCallback(async () => {
    try {
      const row = buildRow("EINGEREICHT");
      const payloadDate = String(row?.date || ymdToday()).slice(0, 10) || ymdToday();
      const shortId = String(row?.id || "doc").replace(/[^a-zA-Z0-9]/g, "").slice(-6);
      const out = await exportPhotosPdfToProject({
        projectFsKey: baKey || localKey,
        projectTitle,
        wantCsv: false,
        filenameHint: `Fotos_${payloadDate}_${shortId}`,
        row
      } as any);
      setLastPdfUri(out.pdfUri);
      setLastPdfName(out.fileName);
      const rowAttachmentUris: string[] = Array.isArray(row?.attachments) ? row.attachments.map((x: any) => String(x?.uri || "")).filter(Boolean) : [];
      const attachmentsRaw: string[] = Platform.OS === "web" ? [] : [out.pdfUri, ...rowAttachmentUris];
      const attachments = attachmentsRaw.map(String).filter(u => u.startsWith("file://"));
      await emailPdf({
        subject: `Fotodokumentation ${baKey || localKey} - ${out.date}`,
        body: `Fotodokumentation ${baKey || localKey} (${out.date})`,
        attachments
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
      const row = buildRow("EINGEREICHT");
      if (mode === "NUR_APP") {
        const hasMain = !!row?.imageUri;
        const hasFiles = Array.isArray(row?.files) && row.files.length > 0;
        const hasText = !!String(row?.comment || row?.note || "").trim() || !!String(row?.kostenstelle || "").trim() || !!String(row?.lvItemPos || "").trim();
        setKiUi({
          mode,
          humanText: "KI ist im Modus NUR_APP nicht verfügbar.\n\n" + "Im lokalen Modus werden keine Dateien an den Server gesendet und keine KI-Analyse ausgeführt.\n\n" + "Bitte nutze SERVER_SYNC für Fotoanalyse, OCR und automatische Vorschläge.\n\n" + `Hauptfoto vorhanden: ${hasMain ? "ja" : "nein"}\n` + `Anhänge vorhanden: ${hasFiles ? "ja" : "nein"}\n` + `Text/Felder vorhanden: ${hasText ? "ja" : "nein"}`,
          suggestion: null,
          suggestions: [],
          raw: {
            localOnly: true,
            mode
          }
        });
        return;
      }
      const fn = (api as any)?.kiPhotosSuggest || (api as any)?.kiSuggestPhotos || null;
      if (typeof fn !== "function") {
        setKiUi({
          mode,
          humanText: "KI Endpoint nicht verbunden. (api.kiPhotosSuggest fehlt)",
          suggestion: null,
          suggestions: [],
          raw: null
        });
        return;
      }
      const mainAttachment = row?.imageUri ? [{
        id: uid("main"),
        uri: String(row.imageUri),
        name: "main_photo.jpg",
        type: "image/jpeg"
      }] : [];
      const normalizedFiles = normalizeFiles(row?.files || []);
      const payload = {
        projectId: baKey || projectId,
        projectCode: baKey || undefined,
        projectFsKey: baKey || projectId,
        date: String(row?.date || ymdToday()).slice(0, 10),
        text: [String(kiInputOverrideRef.current || kiInput || "").trim(), String(row?.comment || row?.note || "").trim()].filter(Boolean).join("\n\n"),
        row,
        files: [...mainAttachment, ...normalizedFiles],
        attachments: [...mainAttachment, ...normalizedFiles],
        strict: true,
        _client: {
          mode,
          hasMain: !!row?.imageUri,
          filesCount: Array.isArray(row?.files) ? row.files.length : 0
        }
      };
      let res: any;
      try {
        res = typeof fn === "function" && fn.length >= 2 ? await fn(baKey || projectId, payload) : await fn(payload);
      } catch {
        res = typeof fn === "function" && fn.length >= 2 ? await fn(baKey || projectId, {
          ...payload,
          row
        }) : await fn({
          ...payload,
          row
        });
      }
      const normalized = normalizeKiPhotosResult(res);
      const rawFieldPatches = toFlatKiObject(normalized?.suggestion?.fieldPatches || normalized?.suggestion?.extractedFields || normalized?.suggestion?.patch || normalized?.suggestion?.fields || normalized?.suggestion || null);
      const improved = buildKiSuggestionFromFields(String(row?.comment || row?.note || "").trim(), rawFieldPatches);
      const finalSuggestion = improved?.fieldPatches && Object.keys(improved.fieldPatches).length ? {
        ...(normalized.suggestion && typeof normalized.suggestion === "object" ? normalized.suggestion : {}),
        fieldPatches: improved.fieldPatches
      } : normalized.suggestion || null;
      const finalNotes = String(firstNonEmpty(improved?.notes, normalized.notes, "KI Analyse abgeschlossen.")).trim();
      setKiUi({
        mode,
        humanText: finalNotes,
        suggestion: finalSuggestion,
        suggestions: finalSuggestion ? [finalSuggestion] : [],
        raw: normalized.raw
      });
    } catch (e: any) {
      setKiUi({
        mode,
        humanText: `KI Vorschlag fehlgeschlagen: ${String(e?.message || e)}`,
        suggestion: null,
        suggestions: [],
        raw: {
          error: String(e?.message || e)
        }
      });
    } finally {
      setKiLoading(false);
    }
  }, [buildRow, kiInput, mode, baKey, projectId]);
  // RLC_KI_MODULE_HANDLER_PHOTOS_V2_LOCAL_FILL
  useEffect(() => {
    return registerRlcKiModuleHandler("PhotosNotes", async (payload: any) => {
      const input = String(payload?.input || "").trim();
      setKiInput(input);
      const parsed = payload?.fieldPatches || payload?.extractedFields || parseRlcFotos(input);
      const toIsoDate = (v: any) => {
        const s = String(v || "").trim();
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s || ymdToday();
      };
      if (parsed.datum) setDate(toIsoDate(parsed.datum));
      if (parsed.ort) setOrtAbschnitt(parsed.ort);
      if (parsed.kategorie) setKategorie(parsed.kategorie);
      if (parsed.lvPos) setLvItemPos(parsed.lvPos);
      if (parsed.mangel && !parsed.kategorie) {
        setKategorie("Mangel");
      }
      const warnings = parsed.warnings?.length ? `

RLC KI Hinweise:
${parsed.warnings.map((w: string) => `- ${w}`).join("\n")}` : "";
      setNote(`${parsed.beschreibung || parsed.mangel || parsed.bemerkung || ""}${warnings}`.trim());
      setKiOpen(false);
      return {
        ok: true,
        handled: true,
        message: "PHOTOS_FIELDS_FILLED"
      };
    });
  }, []);
  const applyKiSuggestion = useCallback(() => {
    try {
      const sug = kiUi?.suggestion || null;
      let fp: any = sug?.fieldPatches || sug?.extractedFields || sug?.patch || sug?.fields || sug || null;
      if (!fp) {
        Alert.alert("KI", "Kein KI-Vorschlag vorhanden.");
        return;
      }
      fp = toFlatKiObject(fp);
      if (!fp || typeof fp !== "object" || !Object.keys(fp).length) {
        Alert.alert("KI", "KI-Felder leer oder unbekanntes Format.");
        return;
      }
      const noteVal = firstNonEmpty(fp.note, fp.comment, fp.bemerkungen, fp.text, fp.description, fp.beschreibung, fp.summary, fp.technicalText, fp.technischerText);
      const ortVal = firstNonEmpty(fp.ortAbschnitt, fp.location, fp.ort, fp.baustelle, fp.abschnitt, fp.section);
      const kategorieVal = firstNonEmpty(fp.kategorie, fp.category, fp.typ, fp.type);
      const gewerkVal = firstNonEmpty(fp.gewerk, fp.trade, fp.discipline);
      const statusVal = firstNonEmpty(fp.fotoStatus, fp.statusFoto, fp.status, fp.zustand);
      const tagsVal = firstNonEmpty(fp.tags, fp.tag, fp.schlagworte, fp.keywords);
      const kostenstelleVal = firstNonEmpty(fp.kostenstelle, fp.costCenter, fp.ks);
      const lvPosVal = firstNonEmpty(fp.lvItemPos, fp.lvPos, fp.lvPosition, fp.position);
      const extrasVal = fp.extras ?? fp.materialien ?? fp.materials ?? null;
      const boxesVal = fp.boxes ?? fp.detectBoxes ?? fp.detections ?? null;
      const finalNote = inferTechnicalNote(String(noteVal || note || "").trim(), fp);
      if (sstr(finalNote) && !isDateLike(finalNote)) {
        setNote(sstr(finalNote));
      }
      if (sstr(ortVal) && !isDateLike(ortVal)) {
        setOrtAbschnitt(sstr(ortVal));
      }
      if (sstr(kategorieVal) && !isDateLike(kategorieVal)) {
        setKategorie(sstr(kategorieVal));
      }
      if (sstr(gewerkVal) && !isDateLike(gewerkVal)) {
        setGewerk(sstr(gewerkVal));
      }
      if (sstr(statusVal) && !isDateLike(statusVal)) {
        setFotoStatus(sstr(statusVal));
      }
      if (sstr(tagsVal) && !isDateLike(tagsVal)) {
        setTags(Array.isArray(tagsVal) ? tagsVal.join(", ") : sstr(tagsVal));
      }
      if (sstr(kostenstelleVal) && !isDateLike(kostenstelleVal)) {
        setKostenstelle(sstr(kostenstelleVal));
      }
      if (sstr(lvPosVal) && !isDateLike(lvPosVal)) {
        setLvItemPos(sstr(lvPosVal));
      }
      const nextExtras = normalizeExtras(extrasVal);
      if (nextExtras) setExtras(nextExtras);
      const nextBoxes = normalizeBoxes(boxesVal);
      if (nextBoxes) setBoxes(nextBoxes);
      Alert.alert("KI", "Vorschlag übernommen.");
      setKiOpen(false);
    } catch (e: any) {
      Alert.alert("KI", e?.message || "Übernahme fehlgeschlagen.");
    }
  }, [kiUi, note]);
  const onReset = useCallback(() => {
    Alert.alert("Formular leeren", "Wirklich alles zurücksetzen?", [{
      text: "Abbrechen",
      style: "cancel"
    }, {
      text: "Leeren",
      style: "destructive",
      onPress: () => {
        setDate(ymdToday());
        setKostenstelle("");
        setLvItemPos("");
        setOrtAbschnitt("");
        setKategorie("");
        setGewerk("");
        setFotoStatus("");
        setTags("");
        setNote("");
        setImageUri(null);
        setFiles([]);
        setExtras(undefined);
        setBoxes(undefined);
        setLastPdfUri(null);
        setLastPdfName(null);
        setKiOpen(false);
        setKiUi(null);
      }
    }]);
  }, []);
  const isImageFile = useCallback((f?: DateiMeta) => {
    const t = String((f as any)?.type || "").toLowerCase();
    const u = String((f as any)?.uri || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    return u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".webp") || u.endsWith(".heic") || u.endsWith(".heif");
  }, []);
  const modalMaxH = Math.min(560, Math.floor(Dimensions.get("window").height * 0.62));
  return <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles._inline1}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>Zurück</Text>
          </Pressable>

          <View style={styles._inline2} />

          <Pressable onPress={onKiSuggest} style={[styles.kiPill, {
          display: "none"
        }, kiLoading ? {
          opacity: 0.6
        } : null]} disabled={kiLoading}>
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
          <View style={styles._inline3}>
            <View style={styles._inline4}>
              <Text style={styles.label}>Datum</Text>
              <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.sub} style={styles.input} />
            </View>
            <View style={styles._inline5}>
              <Text style={styles.label}>Kostenstelle</Text>
              <TextInput value={kostenstelle} onChangeText={setKostenstelle} placeholder="z.B. KS-01" placeholderTextColor={COLORS.sub} style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>LV Pos (optional)</Text>
          <TextInput value={lvItemPos} onChangeText={setLvItemPos} placeholder="z.B. 01.02.003" placeholderTextColor={COLORS.sub} style={styles.input} />

          <Text style={styles.label}>Ort / Abschnitt</Text>
          <TextInput value={ortAbschnitt} onChangeText={setOrtAbschnitt} placeholder="z.B. Baugrube Nord / Hausanschluss 3" placeholderTextColor={COLORS.sub} style={styles.input} />

          <Text style={styles.label}>Kategorie</Text>
          <TextInput value={kategorie} onChangeText={setKategorie} placeholder="z.B. Mangel, Fortschritt, Beweissicherung, Material" placeholderTextColor={COLORS.sub} style={styles.input} />

          <Text style={styles.label}>Gewerk</Text>
          <TextInput value={gewerk} onChangeText={setGewerk} placeholder="z.B. Kanalbau, Kabelbau, Pflaster, Erdbau" placeholderTextColor={COLORS.sub} style={styles.input} />

          <Text style={styles.label}>Status</Text>
          <TextInput value={fotoStatus} onChangeText={setFotoStatus} placeholder="z.B. offen, erledigt, prüfen, dokumentiert" placeholderTextColor={COLORS.sub} style={styles.input} />

          <Text style={styles.label}>Tags</Text>
          <TextInput value={tags} onChangeText={setTags} placeholder="z.B. Rohrgraben, DN150, Bestand, Mangel" placeholderTextColor={COLORS.sub} style={styles.input} />


          <Text style={styles.label}>Notiz</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Notizen..." multiline placeholderTextColor={COLORS.sub} style={[styles.input, {
          height: 110,
          textAlignVertical: "top"
        }]} />
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Hauptfoto</Text>

          <View style={styles._inline6}>
            <Pressable style={styles.pillBtn} onPress={takeMainPhoto}>
              <Text style={styles.pillTxt}>Kamera</Text>
            </Pressable>
            <Pressable style={styles.pillBtn} onPress={pickMainPhoto}>
              <Text style={styles.pillTxt}>+ Foto wählen</Text>
            </Pressable>
            {imageUri ? <Pressable style={styles.pillBtn} onPress={() => setImageUri(null)}>
                <Text style={styles.pillTxt}>Entfernen</Text>
              </Pressable> : null}
          </View>

          {imageUri ? <Pressable onPress={() => openAttachment(imageUri)} style={styles._inline7}>
              <Image source={{
            uri: imageUri
          }} style={styles.previewMain} />
              <Text style={[styles.muted, {
            marginTop: 8
          }]}>
                Tippen zum Öffnen
              </Text>
            </Pressable> : <Text style={styles.muted}>Kein Hauptfoto gewählt.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Anhänge</Text>

          <View style={styles._inline8}>
            <Pressable style={styles.pillBtn} onPress={addCameraAttachment}>
              <Text style={styles.pillTxt}>Kamera</Text>
            </Pressable>
            <Pressable style={styles.pillBtn} onPress={addFile}>
              <Text style={styles.pillTxt}>+ Datei (PDF/Bild)</Text>
            </Pressable>
          </View>

          {files.length === 0 ? <Text style={styles.muted}>Keine Anhänge hinzugefügt.</Text> : <View style={styles._inline9}>
              {files.map(f => <View key={String(f.id)} style={styles.fileRow}>
                  {isImageFile(f) ? <Pressable onPress={() => openAttachment(f.uri)}>
                      <Image source={{
                uri: String(f.uri)
              }} style={styles.fileThumb} />
                    </Pressable> : null}

                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name || f.uri}
                  </Text>

                  <View style={styles._inline10}>
                    <Pressable onPress={() => openAttachment(f.uri)}>
                      <Text style={styles.link}>Öffnen</Text>
                    </Pressable>
                    <Pressable onPress={() => removeAttachment(f.id)}>
                      <Text style={[styles.link, {
                  color: COLORS.danger
                }]}>
                        Entfernen
                      </Text>
                    </Pressable>
                  </View>
                </View>)}
            </View>}
        </View>

        <DocActionBar onSaveOffline={onSaveOffline} onSubmit={onSubmit} onOpenPdf={onOpenPdf} onEmailPdf={onEmailPdf} onReset={onReset} showPdfActions={true} submitting={submitting} />

        <View style={[styles.card, {
        marginTop: 14
      }]}>
          <Text style={styles.h2}>Verlauf</Text>
          {history.length === 0 ? <Text style={styles.muted}>
              {mode === "SERVER_SYNC" ? "Noch keine Einträge (lokal - wie NUR_APP)." : "Noch keine Einträge offline (NUR_APP)."}
            </Text> : <FlatList data={history} keyExtractor={(x, i) => String(x?.id || `h_${i}`)} scrollEnabled={false} contentContainerStyle={styles._inline11} renderItem={({
          item
        }) => {
          const t = String(item?.date || "").slice(0, 10) || "-";
          const fCount = Array.isArray(item?.files) ? item.files.length : 0;
          const hasMain = !!item?.imageUri;
          return <Pressable onPress={() => {
            navigation.navigate("PhotosNotes" as any, {
              projectId,
              projectCode: projectCodeParam,
              title,
              editId: String(item?.id || ""),
              fromInbox: false
            });
          }}>
                    <View style={styles.histRow}>
                      {hasMain ? <Image source={{
                uri: String(item.imageUri)
              }} style={styles.histThumb} /> : null}

                      <View style={styles._inline12}>
                        <Text style={styles.histTitle} numberOfLines={1}>
                          {["Fotos", t].filter(Boolean).join(" ")}
                        </Text>
                        <Text style={styles.histSub} numberOfLines={2}>
                          {String(item?.comment || item?.note || "-").slice(0, 60)}
                          {fCount ? ` • ${fCount} Datei(en)` : ""}
                        </Text>
                      </View>
                    </View>
                  </Pressable>;
        }} />}
        </View>

        <View style={styles._inline13} />
      </ScrollView>

      <Modal visible={kiOpen} transparent animationType="slide" onRequestClose={() => setKiOpen(false)}>
        <Pressable style={styles.modalWrap} onPress={() => {
        Keyboard.dismiss();
        setKiOpen(false);
      }}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles._inline14}>
              <Text style={styles.modalTitle}>KI Vorschlag</Text>
              
            <View style={styles._inline15} />
              <Pressable onPress={() => {
              Keyboard.dismiss();
              setKiOpen(false);
            }} style={styles.closeX}>
                <Text style={styles._inline16}>X</Text>
              </Pressable>
            </View>

            <Text style={[styles.label, {
            marginTop: 12
          }]}>KI Eingabe</Text>
            <TextInput value={kiInput} onChangeText={setKiInput} placeholder="Was soll RLC ausfüllen?" placeholderTextColor={COLORS.sub} multiline style={[styles.input, {
            minHeight: 44,
            textAlignVertical: "top"
          }]} />

            <Pressable onPress={() => Keyboard.dismiss()} style={styles._inline17}>
              <Text style={styles._inline18}>
                Tastatur schließen
              </Text>
            </Pressable>

            <ScrollView style={[styles._inline19, {
            maxHeight: modalMaxH
          }]}>
              {kiLoading ? <Text style={styles.muted}>KI läuft...</Text> : kiUi ? <Text style={styles.modalText} selectable>
                  {String(kiUi.humanText || "")}
                </Text> : <Text style={styles.muted}>Kein Ergebnis.</Text>}
            </ScrollView>

            <View style={styles._inline20}>
              <Pressable style={[styles.modalBtn, {
              backgroundColor: COLORS.text
            }]} onPress={() => {
              Keyboard.dismiss();
              setKiOpen(false);
            }}>
                <Text style={styles._inline21}>
                  Schließen
                </Text>
              </Pressable>

              <Pressable style={[styles.modalBtn, {
              backgroundColor: COLORS.accent,
              opacity: kiLoading || !kiUi?.suggestion ? 0.5 : 1
            }]} onPress={() => {
              Keyboard.dismiss();
              applyKiSuggestion();
            }} disabled={kiLoading || !kiUi?.suggestion}>
                <Text style={styles._inline22}>
                  Übernehmen
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>;
}
const styles = createRlcStyles("PhotosNotesScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10
  },
  headerKiBtn: {
    display: "none",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  headerKiTxt: {
    color: COLORS.accentDark,
    fontWeight: "600",
    fontSize: 13
  },
  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card
  },
  backTxt: {
    color: COLORS.text,
    fontWeight: "600"
  },
  kiPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.accentSoft
  },
  kiTxt: {
    color: COLORS.accentDark,
    fontWeight: "600",
    fontSize: 12
  },
  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card
  },
  modeTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 12
  },
  h1: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600",
    color: COLORS.text
  },
  sub: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600"
  },
  card: {
    marginTop: 14,
    borderRadius: 14,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: {
          width: 0,
          height: 6
        }
      },
      android: {
        elevation: 2
      },
      default: {}
    })
  },
  h2: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 10
  },
  label: {
    color: COLORS.text,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "600"
  },
  muted: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: "600"
  },
  pillBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  pillTxt: {
    color: COLORS.text,
    fontWeight: "600"
  },
  previewMain: {
    width: "100%",
    height: 220,
    borderRadius: RLC_RADIUS.button,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  fileRow: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  fileThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  fileName: {
    flex: 1,
    color: COLORS.text,
    fontWeight: "600"
  },
  link: {
    color: COLORS.accent,
    fontWeight: "600"
  },
  histRow: {
    borderRadius: RLC_RADIUS.button,
    padding: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  histThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  histTitle: {
    color: COLORS.text,
    fontWeight: "600"
  },
  histSub: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "600"
  },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
    padding: RLC_SPACING.page
  },
  modalCard: {
    borderRadius: RLC_RADIUS.card,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  modalTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 18
  },
  modalText: {
    color: COLORS.text,
    fontWeight: "600",
    lineHeight: 20
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  closeX: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  _inline1: {
    padding: RLC_SPACING.page,
    paddingBottom: 40
  },
  _inline2: {
    flex: 1
  },
  _inline3: {
    flexDirection: "row",
    gap: 10
  },
  _inline4: {
    flex: 1
  },
  _inline5: {
    flex: 1
  },
  _inline6: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  _inline7: {
    marginTop: 12
  },
  _inline8: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  _inline9: {
    marginTop: 10
  },
  _inline10: {
    flexDirection: "row",
    gap: 12
  },
  _inline11: {
    gap: 10,
    marginTop: 10
  },
  _inline12: {
    flex: 1
  },
  _inline13: {
    height: 30
  },
  _inline14: {
    flexDirection: "row",
    alignItems: "center"
  },
  _inline15: {
    flex: 1
  },
  _inline16: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  _inline17: {
    alignSelf: "flex-end",
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft
  },
  _inline18: {
    color: COLORS.accent,
    fontWeight: "600"
  },
  _inline19: {
    marginTop: 10
  },
  _inline20: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  _inline21: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  _inline22: {
    color: COLORS.textLight,
    fontWeight: "600"
  }
});
