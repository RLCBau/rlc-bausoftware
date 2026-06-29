// apps/mobile/src/screens/RegieScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerRlcKiModuleHandler } from "../lib/rlcKiModuleBridge";
import { parseRlcRegie } from "../lib/rlcKiFieldParser";
import {
  Keyboard,
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  StyleSheet,
  FlatList,
  Image,
  Linking,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { api, looksLikeProjectCode } from "../lib/api";
import { Ionicons } from "@expo/vector-icons";
import { exportRegiePdfToProject, emailPdf } from "../lib/exporters/projectExport";
import { hydrateRowForPreview } from "../lib/hydratePreview";
import {
  queueAdd,
  queueNormalizeExisting,
  queueProcessPending,
  type QueueItem,
} from "../lib/offlineQueue";
import { DocActionBar } from "../components/DocActionBar";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Regie">;

const KEY_MODE = "rlc_mobile_mode";

// Inbox keys (compat)
function regieInboxKeys(projectKey: string) {
  return [
    `rlc_mobile_inbox_regie:${projectKey}`,
    `rlc_mobile_inbox_regiebericht:${projectKey}`,
  ];
}

type DateiMeta = { id?: string; name?: string; uri?: string; type?: string };

// Regie only
export type RegieDocType = "REGIE";

function docTypeLabel(_: RegieDocType = "REGIE") {
  return "Regiebericht";
}

function docTypeShort(_: RegieDocType = "REGIE") {
  return "RB";
}

type RegieRow = {
  id: string;
  date: string; // YYYY-MM-DD

  docType?: RegieDocType;

  arbeitsbeginn?: string;
  arbeitsende?: string;
  pause1?: string;
  pause2?: string;
  wetter?: string;
  kostenstelle?: string;
  bemerkungen?: string;

  rows?: Array<{
    kostenstelle?: string;
    machine?: string;
    worker?: string;
    hours?: number | string;
    comment?: string;
    material?: string;
    quantity?: number | string;
    unit?: string;
    photos?: DateiMeta[];
  }>;

  attachments?: DateiMeta[];

  workflowStatus?: "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";
  createdAt?: number;
  updatedAt?: number;

  syncStatus?: string;
  syncError?: string;
};

function uid(prefix = "r") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

function ymdNow() {
  return new Date().toISOString().slice(0, 10);
}

async function loadArrayFromFirstKey(keys: string[]): Promise<any[]> {
  for (const k of keys) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

async function setJson(key: string, v: any) {
  await AsyncStorage.setItem(key, JSON.stringify(v));
}

function normalizeProjectKey(input: string, projectIdFallback: string) {
  const v = String(input || "").trim();
  if (v) return v;
  return String(projectIdFallback || "unknown").trim();
}

function toDateInput(v: any) {
  const s = String(v || "");
  if (s.length >= 10) return s.slice(0, 10);
  return s;
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
        uri,
        name: uri.split("/").pop() || `file_${Date.now()}`,
        type: undefined,
      });
      continue;
    }

    const uri = String(f?.uri || f?.url || f?.publicUrl || f?.path || "").trim();
    if (!uri) continue;

    out.push({
      id: f?.id || uid("f"),
      uri,
      type: f?.type || f?.mime || f?.mimeType,
      name: f?.name || f?.filename || uri.split("/").pop() || `file_${Date.now()}`,
    });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const u = String(x?.uri || "").trim();
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

function mergeAllPhotosForPdf(row: RegieRow): DateiMeta[] {
  return normalizeFiles([
    ...(row.attachments || []),
    ...((row as any)?.files || []),
    ...((row as any)?.photos || []),
    ...((row as any)?.imageUri ? [{ uri: (row as any).imageUri }] : []),
    ...((row as any)?.imageMeta?.uri ? [{ uri: (row as any).imageMeta.uri }] : []),
  ]);
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
  const { projectFsKey, uri, nameHint, typeHint, prefix } = params;

  const input = String(uri || "").trim();
  if (!input) return "";
  if (Platform.OS === "web") return input;

  const root = String(FileSystem.documentDirectory || "").trim();
  if (!root) return input;

  const fsKey = safeFsKey(projectFsKey);
  const base = normDir(root);
  const dir = `${base}projects/${fsKey}/inbox/regie/files/`;
  await ensureDir(dir);

  const converted = await convertToJpegIfNeeded(input, { name: nameHint, type: typeHint });

  const ext0 = extFromNameOrUri(nameHint, input, typeHint);
  const ext =
    isPhUri(input) || shouldConvertToJpegByExt(ext0) || converted !== input ? "jpg" : ext0;

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
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch {}
    await FileSystem.copyAsync({ from: converted, to: target });
    return target.startsWith("file://") ? target : `file://${target}`;
  } catch {
    if (isFileUri(converted)) return converted;
    return input;
  }
}

async function pickImageFromLibrary(): Promise<DateiMeta | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Fotos", "Keine Berechtigung für Foto-Zugriff.");
    return null;
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });

  // @ts-ignore
  if (res.canceled) return null;

  // @ts-ignore
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;

  const meta = inferImageMetaFromUri(asset.uri);
  return {
    id: uid("img"),
    uri: asset.uri,
    type: asset.mimeType || meta.mime,
    name: asset.fileName || `photo_${Date.now()}.${meta.ext}`,
  };
}

async function takePhotoWithCamera(): Promise<DateiMeta | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Kamera", "Keine Berechtigung für Kamera.");
    return null;
  }

  const res = await ImagePicker.launchCameraAsync({
    quality: 0.9,
  });

  // @ts-ignore
  if (res.canceled) return null;

  // @ts-ignore
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;

  const meta = inferImageMetaFromUri(asset.uri);
  return {
    id: uid("cam"),
    uri: asset.uri,
    type: asset.mimeType || meta.mime,
    name: asset.fileName || `camera_${Date.now()}.${meta.ext}`,
  };
}

async function pickFile(): Promise<DateiMeta | null> {
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (res.canceled) return null;
  const f = res.assets?.[0];
  if (!f?.uri) return null;

  return {
    id: uid("file"),
    uri: f.uri,
    type: f.mimeType || "application/octet-stream",
    name: f.name || `file_${Date.now()}`,
  };
}

function badgeText(st?: RegieRow["workflowStatus"]) {
  if (st === "EINGEREICHT") return "E";
  if (st === "FREIGEGEBEN") return "F";
  if (st === "ABGELEHNT") return "A";
  return "D";
}
function badgeColor(st?: RegieRow["workflowStatus"]) {
  if (st === "EINGEREICHT") return "#0B57D0";
  if (st === "FREIGEGEBEN") return "#1A7F37";
  if (st === "ABGELEHNT") return "#C33";
  return "rgba(255,255,255,0.55)";
}

function normalizeDocType(_: any): RegieDocType {
  return "REGIE";
}

function buildKiTextFromRow(r: RegieRow) {
  const headerBits: string[] = [];
  if (r.kostenstelle) headerBits.push(`Kostenstelle: ${String(r.kostenstelle)}`);
  if (r.wetter) headerBits.push(`Wetter: ${String(r.wetter)}`);
  if (r.arbeitsbeginn) headerBits.push(`Arbeitsbeginn: ${String(r.arbeitsbeginn)}`);
  if (r.arbeitsende) headerBits.push(`Arbeitsende: ${String(r.arbeitsende)}`);
  if (r.pause1) headerBits.push(`Pause1: ${String(r.pause1)}`);
  if (r.pause2) headerBits.push(`Pause2: ${String(r.pause2)}`);

  const lines = Array.isArray(r.rows) ? r.rows : [];
  const lineBits = lines
    .map((l, i) => {
      const bits: string[] = [];
      if (l?.kostenstelle) bits.push(`KS: ${String(l.kostenstelle)}`);
      if (l?.worker) bits.push(`Mitarbeiter: ${String(l.worker)}`);
      if (l?.machine) bits.push(`Maschine: ${String(l.machine)}`);
      if (l?.hours != null && String(l.hours).trim() !== "") bits.push(`Std: ${String(l.hours)}`);
      if (l?.material) bits.push(`Material: ${String(l.material)}`);
      if (l?.quantity != null && String(l.quantity).trim() !== "") bits.push(`Menge: ${String(l.quantity)}`);
      if (l?.unit) bits.push(`Einheit: ${String(l.unit)}`);
      if (l?.comment) bits.push(`Kommentar: ${String(l.comment)}`);
      const joined = bits.filter(Boolean).join(" | ");
      return joined ? `Zeile ${i + 1}: ${joined}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const bemerk = String(r.bemerkungen || "").trim();

  return [headerBits.join(" | "), lineBits, bemerk ? `Bemerkungen: ${bemerk}` : ""]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeKiResult(raw: any) {
  const root =
    raw?.data && typeof raw.data === "object"
      ? raw.data
      : raw?.result && typeof raw.result === "object"
      ? raw.result
      : raw;

  const suggestions =
    Array.isArray(root?.suggestions) ? root.suggestions :
    Array.isArray(raw?.suggestions) ? raw.suggestions :
    [];

  const firstSuggestion =
    suggestions[0] ||
    root?.suggestion ||
    raw?.suggestion ||
    null;

  const directFields =
    root?.fields ||
    raw?.fields ||
    root?.extractedFields ||
    raw?.extractedFields ||
    root?.fieldPatches ||
    raw?.fieldPatches ||
    null;

  const fallbackDirectObject =
    !firstSuggestion &&
    root &&
    typeof root === "object" &&
    (
      root.comment != null ||
      root.kommentar != null ||
      root.leistung != null ||
      root.worker != null ||
      root.mitarbeiter != null ||
      root.machine != null ||
      root.maschine != null ||
      root.hours != null ||
      root.std != null ||
      root.stunden != null ||
      root.material != null ||
      root.quantity != null ||
      root.menge != null ||
      root.unit != null ||
      root.einheit != null ||
      root.arbeitsbeginn != null ||
      root.arbeitsende != null ||
      root.pause1 != null ||
      root.pause2 != null ||
      root.kostenstelle != null ||
      root.wetter != null ||
      root.bemerkungen != null
    )
      ? root
      : null;

  const fieldPatches =
    firstSuggestion?.fieldPatches ||
    firstSuggestion?.extractedFields ||
    firstSuggestion?.patch ||
    firstSuggestion?.fields ||
    directFields ||
    fallbackDirectObject ||
    null;

  const errorMessage = String(
    root?.error?.message ||
      raw?.error?.message ||
      root?.message ||
      raw?.message ||
      ""
  ).trim();

  const notes = String(
    firstSuggestion?.notes ||
      root?.notes ||
      raw?.notes ||
      errorMessage ||
      ""
  ).trim();

  const suggestion =
    fieldPatches
      ? {
          ...(firstSuggestion && typeof firstSuggestion === "object"
            ? firstSuggestion
            : {}),
          fieldPatches,
        }
      : firstSuggestion || fallbackDirectObject;

  return {
    suggestion: suggestion || null,
    notes: notes || "",
    raw,
    errorMessage,
  };
}

async function serverReadRegieInbox(projectFsKey: string, docId: string) {
  const token = await AsyncStorage.getItem("auth_token");

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

  if (!base) throw new Error("API base URL fehlt");

  const url = `${base}/api/regie/inbox/read?projectId=${encodeURIComponent(
    projectFsKey
  )}&docId=${encodeURIComponent(docId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

  const json = text ? JSON.parse(text) : null;
  return json?.snapshot || json;
}

function emptyLine() {
  return {
    kostenstelle: "",
    machine: "",
    worker: "",
    hours: "",
    comment: "",
    material: "",
    quantity: "",
    unit: "",
    photos: [] as DateiMeta[],
  };
}

function normalizeServerRegieSnapshot(snapRaw: any, editId: string): RegieRow | null {
  if (!snapRaw || typeof snapRaw !== "object") return null;

  const payload = (snapRaw as any)?.payload;
  const rowFromPayload = payload?.row;
  const rowFromDirect = (snapRaw as any)?.row;

  const base: any =
    (rowFromPayload && typeof rowFromPayload === "object" && rowFromPayload) ||
    (rowFromDirect && typeof rowFromDirect === "object" && rowFromDirect) ||
    snapRaw;

  const attPool =
    base?.attachments ??
    payload?.attachments ??
    payload?.files ??
    (snapRaw as any)?.attachments ??
    (snapRaw as any)?.files ??
    (snapRaw as any)?.photos ??
    [];

  const fixedRows =
    Array.isArray(base?.rows) && base.rows.length
      ? base.rows
      : Array.isArray(payload?.rows) && payload.rows.length
      ? payload.rows
      : [emptyLine()];

  const dt = "REGIE" as RegieDocType;

  const out: RegieRow = {
    ...base,
    id: String(base?.id || base?.docId || (snapRaw as any)?.id || (snapRaw as any)?.docId || editId),
    date: toDateInput(base?.date || payload?.date || ymdNow()) || ymdNow(),
    docType: dt,
    rows: fixedRows,
    attachments: normalizeFiles(attPool),
    workflowStatus: (base?.workflowStatus || payload?.workflowStatus || "EINGEREICHT") as any,
    createdAt: Number(base?.createdAt || payload?.createdAt || Date.now()),
    updatedAt: Number(base?.updatedAt || payload?.updatedAt || Date.now()),
  };

  out.arbeitsbeginn = String(out.arbeitsbeginn || "");
  out.arbeitsende = String(out.arbeitsende || "");
  out.pause1 = String(out.pause1 || "");
  out.pause2 = String(out.pause2 || "");
  out.wetter = String(out.wetter || "");
  out.kostenstelle = String(out.kostenstelle || "");
  out.bemerkungen = String(out.bemerkungen || "");

  return out;
}

function normalizeInboxSnapshotRegie(snapRaw: any, editId: string): RegieRow | null {
  const fixed = normalizeServerRegieSnapshot(snapRaw, editId);
  if (!fixed) return null;

  return {
    ...fixed,
    rows:
      Array.isArray(fixed.rows) && fixed.rows.length
        ? fixed.rows.map((r: any) => ({
            ...emptyLine(),
            ...r,
            photos: normalizeFiles(r?.photos || r?.attachments || r?.files || []),
          }))
        : [emptyLine()],
    attachments: normalizeFiles(fixed.attachments || []),
  };
}

export default function RegieScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title, editId } = route.params as any;
  const fromInbox = Boolean((route.params as any)?.fromInbox);
  const inboxSnapshot = (route.params as any)?.inboxSnapshot;

  const projectFsKey = useMemo(
    () => normalizeProjectKey(String(projectCode || ""), String(projectId || "")),
    [projectCode, projectId]
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: "#12324A",
      },
      headerTitleStyle: {
        color: "#FFFFFF",
        fontWeight: "800",
      },
      headerTintColor: "#FFFFFF",
      headerRight: undefined,
    });
  }, [navigation, projectId, projectFsKey]);

  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [submitting, setSubmitting] = useState(false);

  const [authToken, setAuthToken] = useState<string>("");

  const [row, setRow] = useState<RegieRow>(() =>
    inboxSnapshot
      ? normalizeInboxSnapshotRegie(inboxSnapshot, String(editId || uid("regie"))) || {
          id: editId ? String(editId) : uid("regie"),
          date: ymdNow(),
          docType: "REGIE",
          arbeitsbeginn: "",
          arbeitsende: "",
          pause1: "",
          pause2: "",
          wetter: "",
          kostenstelle: "",
          bemerkungen: "",
          rows: [emptyLine()],
          attachments: [],
          workflowStatus: "DRAFT",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      : {
          id: editId ? String(editId) : uid("regie"),
          date: ymdNow(),
          docType: "REGIE",
          arbeitsbeginn: "",
          arbeitsende: "",
          pause1: "",
          pause2: "",
          wetter: "",
          kostenstelle: "",
          bemerkungen: "",
          rows: [emptyLine()],
          attachments: [],
          workflowStatus: "DRAFT",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
  );

  const [list, setList] = useState<RegieRow[]>([]);
  const loadLock = useRef(0);
  const inboxSnapshotAppliedRef = useRef(false);

  const [kiOpen, setKiOpen] = useState(false);
  const [kiBusy, setKiBusy] = useState(false);
  const [kiSuggestion, setKiSuggestion] = useState<any>(null);
  const [kiInput, setKiInput] = useState("");
  const kiInputOverrideRef = useRef("");

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<{ pdfUri?: string; fileName?: string; date?: string } | null>(null);

  const readMode = useCallback(async () => {
    try {
      const m = (await AsyncStorage.getItem(KEY_MODE)) as any;
      if (m === "NUR_APP" || m === "SERVER_SYNC") setMode(m);
      else setMode("SERVER_SYNC");
    } catch {
      setMode("SERVER_SYNC");
    }
  }, []);

  const readAuthToken = useCallback(async () => {
    try {
      const t = String((await AsyncStorage.getItem("auth_token")) || "").trim();
      setAuthToken(t);
    } catch {
      setAuthToken("");
    }
  }, []);

  const openRlcKiChat = useCallback(() => {}, []);

  async function persistToInbox(nextRow: RegieRow) {
    const keys = regieInboxKeys(projectFsKey);
    const primaryKey = keys[0];
    const arr = await loadArrayFromFirstKey(keys);
    const nextList = Array.isArray(arr) ? (arr as RegieRow[]) : [];
    const idx = nextList.findIndex((x) => String(x.id) === String(nextRow.id));
    if (idx >= 0) nextList[idx] = nextRow;
    else nextList.unshift(nextRow);

    nextList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    await setJson(primaryKey, nextList);
    setList(nextList);
  }

  const applyInboxSnapshotIfAny = useCallback(async () => {
    if (!fromInbox || !inboxSnapshot || inboxSnapshotAppliedRef.current) return false;

    const fixed = normalizeInboxSnapshotRegie(inboxSnapshot, String(editId || uid("regie")));
    if (!fixed) return false;

    const hydratedRaw = await hydrateRowForPreview(fixed, projectFsKey);
    const hydrated = {
      ...fixed,
      ...hydratedRaw,
      attachments: normalizeFiles(
        hydratedRaw?.attachments || hydratedRaw?.files || hydratedRaw?.photos || fixed.attachments || []
      ),
      rows:
        Array.isArray(hydratedRaw?.rows) && hydratedRaw.rows.length
          ? hydratedRaw.rows.map((r: any) => ({
              ...emptyLine(),
              ...r,
              photos: normalizeFiles(r?.photos || r?.attachments || r?.files || []),
            }))
          : fixed.rows || [emptyLine()],
    };

    setRow(hydrated);
    inboxSnapshotAppliedRef.current = true;

    try {
      await persistToInbox({
        ...fixed,
        workflowStatus: (fixed.workflowStatus as any) || "EINGEREICHT",
        updatedAt: Date.now(),
        createdAt: fixed.createdAt || Date.now(),
      });
    } catch {}

    return true;
  }, [fromInbox, inboxSnapshot, editId, projectFsKey]);

  const loadInboxList = useCallback(async () => {
    const my = ++loadLock.current;
    try {
      const arr = await loadArrayFromFirstKey(regieInboxKeys(projectFsKey));
      const next = (Array.isArray(arr) ? (arr as RegieRow[]) : []).map((x) => ({
        ...x,
        docType: "REGIE" as RegieDocType,
        attachments: normalizeFiles((x as any)?.attachments || []),
        rows:
          Array.isArray((x as any)?.rows) && (x as any).rows.length
            ? (x as any).rows.map((r: any) => ({
                ...emptyLine(),
                ...r,
                photos: normalizeFiles(r?.photos || r?.attachments || r?.files || []),
              }))
            : [emptyLine()],
      }));

      next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (my === loadLock.current) setList(next);

      if (editId) {
        const appliedSnapshot = await applyInboxSnapshotIfAny();
        if (appliedSnapshot) return;

        const found = next.find((x) => String(x.id) === String(editId));
        if (found) {
          const hydratedRaw = await hydrateRowForPreview(found, projectFsKey);

          setRow({
            ...found,
            ...hydratedRaw,
            docType: "REGIE",
            rows:
              Array.isArray(hydratedRaw?.rows) && hydratedRaw.rows.length
                ? hydratedRaw.rows.map((r: any) => ({
                    ...emptyLine(),
                    ...r,
                    photos: normalizeFiles(
                      r?.photos || r?.attachments || r?.files || []
                    ),
                  }))
                : Array.isArray(found.rows) && found.rows.length
                ? found.rows.map((r: any) => ({
                    ...emptyLine(),
                    ...r,
                    photos: normalizeFiles(
                      r?.photos || r?.attachments || r?.files || []
                    ),
                  }))
                : [emptyLine()],
            attachments: normalizeFiles(
              hydratedRaw?.attachments ||
                hydratedRaw?.files ||
                hydratedRaw?.photos ||
                found.attachments ||
                []
            ),
          });
        } else if (
          fromInbox &&
          mode === "SERVER_SYNC" &&
          looksLikeProjectCode(projectFsKey)
        ) {
          try {
            const snap = await serverReadRegieInbox(projectFsKey, String(editId));
            const fixed = normalizeServerRegieSnapshot(snap, String(editId));

            if (fixed) {
              const hydratedRaw = await hydrateRowForPreview(fixed, projectFsKey);
              const hydrated = {
                ...fixed,
                ...hydratedRaw,
                rows:
                  Array.isArray(hydratedRaw?.rows) && hydratedRaw.rows.length
                    ? hydratedRaw.rows.map((r: any) => ({
                        ...emptyLine(),
                        ...r,
                        photos: normalizeFiles(r?.photos || r?.attachments || r?.files || []),
                      }))
                    : Array.isArray(fixed.rows) && fixed.rows.length
                    ? fixed.rows.map((r: any) => ({
                        ...emptyLine(),
                        ...r,
                        photos: normalizeFiles(r?.photos || r?.attachments || r?.files || []),
                      }))
                    : [emptyLine()],
                attachments: normalizeFiles(
                  hydratedRaw?.attachments || hydratedRaw?.files || hydratedRaw?.photos || fixed.attachments || []
                ),
              };

              setRow(hydrated);

              await persistToInbox({
                ...fixed,
                workflowStatus: (fixed.workflowStatus as any) || "EINGEREICHT",
                updatedAt: Date.now(),
                createdAt: fixed.createdAt || Date.now(),
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      Alert.alert("Regie", e?.message || "Inbox konnte nicht geladen werden.");
    }
  }, [projectFsKey, editId, fromInbox, mode, applyInboxSnapshotIfAny]);

  useEffect(() => {
    readMode();
    readAuthToken();
    loadInboxList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      readAuthToken();
      loadInboxList();
    }, [loadInboxList, readAuthToken])
  );

  const updateRow = useCallback((patch: Partial<RegieRow>) => {
    setRow((r) => ({ ...r, ...patch, updatedAt: Date.now() }));
  }, []);

  const updateLine = useCallback((idx: number, patch: any) => {
    setRow((r) => {
      const lines = Array.isArray(r.rows) ? [...r.rows] : [];
      lines[idx] = { ...(lines[idx] || {}), ...patch };
      return { ...r, rows: lines, updatedAt: Date.now() };
    });
  }, []);

  const addLine = useCallback(() => {
    setRow((r) => {
      const lines = Array.isArray(r.rows) ? [...r.rows] : [];
      lines.push(emptyLine());
      return { ...r, rows: lines, updatedAt: Date.now() };
    });
  }, []);

  const removeLine = useCallback((idx: number) => {
    setRow((r) => {
      const lines = Array.isArray(r.rows) ? [...r.rows] : [];
      lines.splice(idx, 1);
      if (!lines.length) lines.push(emptyLine());
      return { ...r, rows: lines, updatedAt: Date.now() };
    });
  }, []);

  const addAttachment = useCallback(async () => {
    Alert.alert("Anhang hinzufügen", "Was möchtest du hinzufügen?", [
      {
        text: "Kamera",
        onPress: async () => {
          const f = await takePhotoWithCamera();
          if (!f) return;
          const persisted = await persistToProjectFileUri({
            projectFsKey,
            uri: String(f.uri || ""),
            nameHint: f.name || `camera_${Date.now()}.jpg`,
            typeHint: f.type || "image/jpeg",
            prefix: "att",
          });
          setRow((r) => ({
            ...r,
            attachments: normalizeFiles([
              ...(r.attachments || []),
              { ...f, uri: persisted || f.uri },
            ]),
            updatedAt: Date.now(),
          }));
        },
      },
      {
        text: "Galerie",
        onPress: async () => {
          const f = await pickImageFromLibrary();
          if (!f) return;
          const persisted = await persistToProjectFileUri({
            projectFsKey,
            uri: String(f.uri || ""),
            nameHint: f.name || `photo_${Date.now()}.jpg`,
            typeHint: f.type || "image/jpeg",
            prefix: "att",
          });
          setRow((r) => ({
            ...r,
            attachments: normalizeFiles([
              ...(r.attachments || []),
              { ...f, uri: persisted || f.uri },
            ]),
            updatedAt: Date.now(),
          }));
        },
      },
      {
        text: "Datei",
        onPress: async () => {
          const f = await pickFile();
          if (!f) return;
          const persisted = await persistToProjectFileUri({
            projectFsKey,
            uri: String(f.uri || ""),
            nameHint: f.name || `file_${Date.now()}`,
            typeHint: f.type || "application/octet-stream",
            prefix: "file",
          });
          setRow((r) => ({
            ...r,
            attachments: normalizeFiles([
              ...(r.attachments || []),
              { ...f, uri: persisted || f.uri },
            ]),
            updatedAt: Date.now(),
          }));
        },
      },
      { text: "Abbrechen", style: "cancel" },
    ]);
  }, [projectFsKey]);

  const removeAttachment = useCallback((id: string) => {
    setRow((r) => ({
      ...r,
      attachments: (r.attachments || []).filter(
        (x) => String(x.id || "") !== String(id)
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const onSaveOffline = useCallback(async () => {
    try {
      const next: RegieRow = {
        ...row,
        id: String(row.id || uid("regie")),
        date: toDateInput(row.date) || ymdNow(),
        docType: "REGIE",
        workflowStatus: row.workflowStatus || "DRAFT",
        createdAt: row.createdAt || Date.now(),
        updatedAt: Date.now(),
        attachments: normalizeFiles(row.attachments || []),
        rows:
          Array.isArray(row.rows) && row.rows.length
            ? row.rows.map((r: any) => ({
                ...emptyLine(),
                ...r,
                photos: normalizeFiles(r?.photos || []),
              }))
            : [emptyLine()],
      };
      await persistToInbox(next);
      Alert.alert("Gespeichert", "Regiebericht wurde offline gespeichert.");
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || "Speichern fehlgeschlagen.");
    }
  }, [row, projectFsKey]);

  const onSubmit = useCallback(async () => {
    try {
      setSubmitting(true);

      const next: RegieRow = {
        ...row,
        id: String(row.id || uid("regie")),
        date: toDateInput(row.date) || ymdNow(),
        docType: "REGIE",
        workflowStatus: "EINGEREICHT",
        createdAt: row.createdAt || Date.now(),
        updatedAt: Date.now(),
        attachments: normalizeFiles(row.attachments || []),
        rows:
          Array.isArray(row.rows) && row.rows.length
            ? row.rows.map((r: any) => ({
                ...emptyLine(),
                ...r,
                photos: normalizeFiles(r?.photos || []),
              }))
            : [emptyLine()],
      };

      await persistToInbox(next);

      if (mode === "SERVER_SYNC" && looksLikeProjectCode(projectFsKey)) {
        const res = await (api as any).pushRegieToServer(projectFsKey, next);

        
      }

      Alert.alert("Einreichen", "Eingereicht + gespeichert.");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(
        "Regie FEHLER",
        String(e?.message || e || "Einreichen fehlgeschlagen.")
      );
    } finally {
      setSubmitting(false);
    }
  }, [row, mode, projectFsKey, navigation]);

  const makeRowForExporter = useCallback(() => {
    const files = mergeAllPhotosForPdf(row);

    return {
      kind: "REGIE",
      payload: {
        docType: "REGIE" as RegieDocType,
        date: String(toDateInput(row.date) || ymdNow()),
        text: String(row?.rows?.[0]?.comment || row?.bemerkungen || ""),
        hours: (row?.rows?.[0]?.hours as any) ?? undefined,
        note: String(row?.bemerkungen || ""),
        files,
        row: { ...row, docType: "REGIE" as RegieDocType },
      },
    };
  }, [row]);

  const buildPdf = useCallback(async () => {
    const out = await exportRegiePdfToProject({
      projectFsKey,
      projectTitle: String(title || "Projekt"),
      filenameHint: `Regiebericht_${toDateInput(row.date) || ymdNow()}`,
      row: makeRowForExporter(),
    });
    return out;
  }, [projectFsKey, title, row, makeRowForExporter]);

  const onOpenPdf = useCallback(async () => {
    console.log("PDF FILES:", mergeAllPhotosForPdf(row));

    const out = await buildPdf();
    if (Platform.OS === "web") {
      Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
      return;
    }
    if (out.pdfUri?.startsWith("file://")) {
      try {
        await Linking.openURL(out.pdfUri);
      } catch {
        Alert.alert("PDF", "PDF konnte nicht geöffnet werden.");
      }
    }
  }, [buildPdf, row]);

  const onEmailPdf = useCallback(async () => {
    const out = await buildPdf();

    const att =
      Platform.OS === "web"
        ? []
        : [out.pdfUri].filter((u) => String(u || "").startsWith("file://"));

    await emailPdf({
      subject: out.fileName,
      body: `Regiebericht ${projectFsKey} (${out.date})`,
      attachments: att as any,
    });
  }, [buildPdf, projectFsKey]);

  const onPdfPreview = useCallback(async () => {
    try {
      setPdfOpen(true);
      setPdfBusy(true);
      setPdfMeta(null);
      const out = await buildPdf();
      setPdfMeta(out);
    } catch (e: any) {
      Alert.alert("PDF Vorschau", e?.message || "PDF konnte nicht erstellt werden.");
      setPdfOpen(false);
    } finally {
      setPdfBusy(false);
    }
  }, [buildPdf]);

  const openFromHistory = useCallback(
    (x: RegieRow) => {
      hydrateRowForPreview(x, projectFsKey)
        .then((hydratedRaw: any) => {
          const fixed = {
            ...x,
            ...hydratedRaw,
            docType: "REGIE" as RegieDocType,
            rows:
              Array.isArray(hydratedRaw?.rows) && hydratedRaw.rows.length
                ? hydratedRaw.rows.map((r: any) => ({
                    ...emptyLine(),
                    ...r,
                    photos: normalizeFiles(
                      r?.photos || r?.attachments || r?.files || []
                    ),
                  }))
                : Array.isArray(x.rows) && x.rows.length
                ? x.rows.map((r: any) => ({
                    ...emptyLine(),
                    ...r,
                    photos: normalizeFiles(
                      r?.photos || r?.attachments || r?.files || []
                    ),
                  }))
                : [emptyLine()],
            attachments: normalizeFiles(
              hydratedRaw?.attachments ||
                hydratedRaw?.files ||
                hydratedRaw?.photos ||
                x.attachments ||
                []
            ),
          };

          navigation.setParams?.({ editId: fixed.id, fromInbox: true } as any);
          setRow(fixed);
        })
        .catch(() => {
          const fixed = {
            ...x,
            docType: "REGIE" as RegieDocType,
            rows:
              Array.isArray(x.rows) && x.rows.length
                ? x.rows.map((r: any) => ({
                    ...emptyLine(),
                    ...r,
                    photos: normalizeFiles(
                      r?.photos || r?.attachments || r?.files || []
                    ),
                  }))
                : [emptyLine()],
            attachments: normalizeFiles(x.attachments || []),
          };

          navigation.setParams?.({ editId: fixed.id, fromInbox: true } as any);
          setRow(fixed);
        });
    },
    [navigation, projectFsKey]
  );

  const onReset = useCallback(() => {
    setRow({
      id: uid("regie"),
      date: ymdNow(),
      docType: "REGIE",
      arbeitsbeginn: "",
      arbeitsende: "",
      pause1: "",
      pause2: "",
      wetter: "",
      kostenstelle: "",
      bemerkungen: "",
      rows: [emptyLine()],
      attachments: [],
      workflowStatus: "DRAFT",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, []);
const onKiSuggest = useCallback(async () => {
    try {
      setKiOpen(true);
      setKiBusy(true);
      setKiSuggestion(null);

      if (mode === "NUR_APP") {
        const hasAttachments =
          Array.isArray(row.attachments) && row.attachments.length > 0;
        const hasLines = Array.isArray(row.rows) && row.rows.length > 0;
        const hasContent =
          !!String(row.kostenstelle || "").trim() ||
          !!String(row.bemerkungen || "").trim() ||
          !!String(row.wetter || "").trim() ||
          !!String(row.arbeitsbeginn || "").trim() ||
          !!String(row.arbeitsende || "").trim();

        setKiSuggestion({
          notes:
            "KI ist im Modus NUR_APP nicht verfügbar.\n\n" +
            "Im lokalen Modus werden keine Daten an den Server gesendet und keine KI-Analyse ausgeführt.\n\n" +
            "Bitte nutze SERVER_SYNC für KI-Vorschläge, OCR und automatische Feldbefüllung.\n\n" +
            `Dokumenttyp: Regiebericht\n` +
            `Anhänge vorhanden: ${hasAttachments ? "ja" : "nein"}\n` +
            `Zeilen vorhanden: ${hasLines ? "ja" : "nein"}\n` +
            `Formularinhalt vorhanden: ${hasContent ? "ja" : "nein"}`,
          suggestion: null,
          raw: {
            mode,
            docType: "REGIE",
            localOnly: true,
          },
        });
        return;
      }

      const fn =
        (api as any)?.kiRegieSuggest ||
        (api as any)?.kiSuggestRegie ||
        (api as any)?.kiSuggest ||
        null;

      if (typeof fn !== "function") {
        setKiSuggestion({
          notes: "KI Endpoint nicht verbunden. (api.kiRegieSuggest fehlt)",
          suggestion: null,
          raw: null,
        });
        return;
      }

      const payload = {
        projectId: projectFsKey,
        projectFsKey,
        docType: "REGIE",
        date: String(toDateInput(row.date) || ymdNow()),
        text: [String(kiInputOverrideRef.current || kiInput || "").trim(), buildKiTextFromRow(row)].filter(Boolean).join("\n\n"),
        row: { ...row, docType: "REGIE" as RegieDocType },
        _client: {
          mode,
          docType: "REGIE",
        },
      };

      let res: any = null;

      try {
        if (fn.length <= 1) res = await fn(payload);
        else res = await fn(payload);
      } catch (e1: any) {
        try {
          res = await fn(projectFsKey, payload);
        } catch (e2: any) {
          throw e2 || e1;
        }
      }

      if (res && typeof res === "object") {
        (res as any)._clientDebug = {
          mode,
          docType: "REGIE",
        };
      }

      const normalized = normalizeKiResult(res);
      setKiSuggestion(normalized);
    } catch (e: any) {
      setKiSuggestion({
        notes: e?.message || "KI Fehler",
        suggestion: null,
        raw: { error: e?.message || String(e) },
      });
    } finally {
      setKiBusy(false);
    }
  }, [kiInput, mode, projectFsKey, row]);
  // RLC_KI_MODULE_HANDLER_REGIE_V2_LOCAL_FILL
  useEffect(() => {
    return registerRlcKiModuleHandler("Regie", async (payload: any) => {
      const input = String(payload?.input || "").trim();
      setKiInput(input);

      const parsed = parseRlcRegie(input);

      const toIsoDate = (v: any) => {
        const s = String(v || "").trim();
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s || ymdNow();
      };

      setRow((r) => {
        const mitarbeiter = Array.isArray(parsed.mitarbeiter) ? parsed.mitarbeiter : [];
        const geraete = Array.isArray(parsed.geraete) ? parsed.geraete : [];
        const material = Array.isArray(parsed.material) ? parsed.material : [];

        const n = Math.max(1, mitarbeiter.length, geraete.length, material.length);

        const lines = Array.from({ length: n }).map((_, i) => {
          const p = mitarbeiter[i];
          const g = geraete[i];
          const m = material[i];

          return {
            ...emptyLine(),
            worker: p?.name || "",
            machine: g?.name || "",
            hours: p?.hours || g?.hours || "",
            material: m?.name || "",
            quantity: m?.quantity || "",
            unit: m?.unit || "",
            comment: parsed.taetigkeit || "",
          };
        });

        const warnings =
          parsed.warnings?.length
            ? `

RLC KI Hinweise:
${parsed.warnings.map((w: string) => `- ${w}`).join("\n")}`
            : "";

        return {
          ...r,
          date: toIsoDate(parsed.datum || r.date),
          wetter: parsed.wetter || r.wetter || "",
          bemerkungen: `${parsed.taetigkeit || parsed.bemerkung || r.bemerkungen || ""}${warnings}`,
          rows: lines,
          updatedAt: Date.now(),
        };
      });

      setKiOpen(false);
      return { ok: true, handled: true, message: "REGIE_FIELDS_FILLED" };
    });
  }, []);

  const applyKiSuggestion = useCallback(() => {
    try {
      const sug = kiSuggestion?.suggestion || null;

      let fp: any =
        sug?.fieldPatches ||
        sug?.extractedFields ||
        sug?.patch ||
        sug?.fields ||
        sug ||
        null;

      if (!fp) {
        Alert.alert("KI", "Kein KI-Vorschlag vorhanden.");
        return;
      }

      const toFlatObject = (input: any): Record<string, any> => {
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
              const k = path
                .replace(/^\//, "")
                .replace(/^row\//, "")
                .replace(/\//g, ".")
                .trim();
              if (k) out[k] = p.value;
              continue;
            }

            const field = String(p.field || p.key || p.name || "").trim();
            if (field) out[field] = p.value ?? p.val ?? p.v ?? p.data;
          }
          return out;
        }

        return {};
      };

      fp = toFlatObject(fp);

      if (!fp || typeof fp !== "object" || !Object.keys(fp).length) {
        Alert.alert("KI", "KI-Felder leer oder unbekanntes Format.");
        return;
      }

      const getFirst = (...vals: any[]) => {
        for (const v of vals) {
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return "";
      };

      const sstr = (v: any) => String(v ?? "").trim();
      const has = (v: any) => sstr(v).length > 0;

      const isDateLike = (v: any) => {
        const s = sstr(v);
        return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}\.\d{2}\.\d{4}$/.test(s);
      };

      const isTimeLike = (v: any) => {
        const s = sstr(v);
        return /^\d{1,2}:\d{2}$/.test(s);
      };

      const normalizeTime = (v: any) => {
        const s = sstr(v);
        if (!s) return "";
        if (/^\d{1,2}:\d{2}$/.test(s)) {
          const [h, m] = s.split(":");
          return `${String(h).padStart(2, "0")}:${m}`;
        }
        return s;
      };

      const normalizePause = (v: any) => {
        const s = sstr(v);
        if (!s) return "";
        if (/^\d{1,2}:\d{2}$/.test(s)) return normalizeTime(s);
        if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(s)) {
          const [a, b] = s.split("-").map((x) => normalizeTime(x.trim()));
          return `${a}-${b}`;
        }
        return s;
      };

      const toNumberString = (v: any) => {
        if (v == null) return "";
        if (typeof v === "number" && Number.isFinite(v)) return String(v);

        let x = String(v).trim();
        if (!x) return "";

        x = x.replace(/\s/g, "");
        if (x.includes(".") && x.includes(",")) {
          x = x.replace(/\./g, "").replace(",", ".");
        } else {
          x = x.replace(",", ".");
        }

        const n = Number(x);
        return Number.isFinite(n) ? String(n) : "";
      };

      const parseTimeToMinutes = (x: string) => {
        const [hh, mm] = String(x).split(":").map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
        return hh * 60 + mm;
      };

      const calcHoursFromHeader = (start: string, end: string, p1?: string, p2?: string) => {
        const s = parseTimeToMinutes(start);
        const e = parseTimeToMinutes(end);
        if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return "";

        let diff = e - s;
        let breakMin = 0;

        const addPause = (p?: string) => {
          const v = String(p || "").trim();
          if (!v) return;

          if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v)) {
            const [a, b] = v.split("-");
            const aa = parseTimeToMinutes(a);
            const bb = parseTimeToMinutes(b);
            if (Number.isFinite(aa) && Number.isFinite(bb) && bb > aa) {
              breakMin += bb - aa;
            }
            return;
          }

          if (/^\d{2}:\d{2}$/.test(v)) {
            const mins = parseTimeToMinutes(v);
            if (Number.isFinite(mins)) breakMin += mins;
          }
        };

        addPause(p1);
        addPause(p2);

        const total = Math.max(0, diff - breakMin) / 60;
        if (!(total > 0)) return "";
        return String(Number(total.toFixed(2)));
      };

      const looksLikeMachineWord = (v: any) => {
        const s = sstr(v).toLowerCase();
        return (
          s.includes("bagger") ||
          s.includes("minibagger") ||
          s.includes("radlader") ||
          s.includes("walze") ||
          s.includes("lkw") ||
          s.includes("kran") ||
          s.includes("fräse") ||
          s.includes("fraese") ||
          s.includes("gerät") ||
          s.includes("geraet")
        );
      };

      const looksLikeWorkComment = (v: any) => {
        const s = sstr(v).toLowerCase();
        return (
          s.includes("baugrube") ||
          s.includes("aufgefüllt") ||
          s.includes("aufgefuellt") ||
          s.includes("verlegt") ||
          s.includes("eingebaut") ||
          s.includes("ausgehoben") ||
          s.includes("verdichtet") ||
          s.includes("abgebrochen") ||
          s.includes("hergestellt")
        );
      };

      const cleanupWorker = (workerRaw: any, machineRaw: any) => {
        let w = sstr(workerRaw);
        const m = sstr(machineRaw);

        if (!w) return "";

        if (m && w.toLowerCase().endsWith(m.toLowerCase())) {
          w = w.slice(0, w.length - m.length).trim();
        }

        if (looksLikeMachineWord(w)) return "";
        return w;
      };

      const cleanupMachine = (machineRaw: any, workerRaw: any) => {
        let m = sstr(machineRaw);
        const w = sstr(workerRaw);

        if (!m && looksLikeMachineWord(w)) m = w;
        if (!m) return "";

        return looksLikeMachineWord(m) ? m : "";
      };

      const buildRegieComment = (params: {
        start?: string;
        end?: string;
        ort?: string;
        machine?: string;
        worker?: string;
        action?: string;
      }) => {
        const start = sstr(params.start);
        const end = sstr(params.end);
        const ort = sstr(params.ort);
        const machine = sstr(params.machine);
        const worker = sstr(params.worker);
        const action = sstr(params.action);

        if (!action) return "";

        let text = "";

        if (start && end) {
          text += `Von ${start} bis ${end} wurde `;
        } else {
          text += `Es wurde `;
        }

        let actionText = action;

        if (/^die\s+/i.test(actionText) || /^der\s+/i.test(actionText) || /^das\s+/i.test(actionText)) {
          text += actionText;
        } else {
          text += actionText;
        }

        if (ort) text += ` in ${ort}`;
        if (machine) text += ` mit dem ${machine}`;
        if (worker) text += ` durch ${worker}`;

        text += `.`;

        return text
          .replace(/\s+\./g, ".")
          .replace(/\s{2,}/g, " ")
          .trim();
      };

      const arbeitsbeginnVal = getFirst(
        fp.arbeitsbeginn,
        fp.start,
        fp.von,
        fp.begin,
        fp.startzeit
      );

      const arbeitsendeVal = getFirst(
        fp.arbeitsende,
        fp.ende,
        fp.bis,
        fp.end,
        fp.endzeit
      );

      const pause1Val = getFirst(fp.pause1, fp.pause_1, fp.pause, fp.break1);
      const pause2Val = getFirst(fp.pause2, fp.pause_2, fp.break2);

      const wetterVal = getFirst(fp.wetter, fp.weather);
      const kostenstelleVal = getFirst(
        fp.kostenstelle,
        fp.kostenStelle,
        fp.ks,
        fp.costCenter,
        fp.cost_center,
        fp.kst
      );

      const bemerkungenVal = getFirst(
        fp.bemerkungen,
        fp.bemerkung,
        fp.note,
        fp.notes,
        fp.headerComment
      );

      const lineKostenstelleVal = getFirst(
        fp.lineKostenstelle,
        fp.kostenstelle_zeile,
        fp.zeileKostenstelle
      );

      const commentVal = getFirst(
        fp.comment,
        fp.kommentar,
        fp.leistung,
        fp.leistungText,
        fp.arbeitsleistung,
        fp.text,
        fp.beschreibung,
        fp.description,
        fp.technicalText,
        fp.technischerText,
        fp.taetigkeit,
        fp.taetigkeit,
        fp.activity,
        fp.work,
        fp.action
      );

      const workerVal = getFirst(
        fp.worker,
        fp.mitarbeiter,
        fp.person,
        fp.name,
        fp.arbeiter,
        fp.employee,
        fp.personal,
        fp.kolonne
      );
      const machineVal = getFirst(
        fp.machine,
        fp.maschine,
        fp.geraet,
        fp.geraet,
        fp.equipment,
        fp.baufahrzeug,
        fp.fahrzeug,
        fp.maschineTyp
      );
      const materialVal = getFirst(
        fp.material,
        fp.materialien,
        fp.mat,
        fp.stoff,
        fp.baustoff,
        fp.produkt,
        fp.bezeichnung
      );
      const quantityVal = getFirst(
        fp.quantity,
        fp.menge,
        fp.qty,
        fp.amount,
        fp.anzahl,
        fp.volume,
        fp.masse
      );
      const unitVal = getFirst(
        fp.unit,
        fp.einheit,
        fp.me,
        fp.eh,
        fp.mengeneinheit
      );
      const hoursVal = getFirst(
        fp.hours,
        fp.std,
        fp.stunden,
        fp.arbeitsstunden,
        fp.leistungsstunden,
        fp.zeit
      );
      const ortVal = getFirst(
        fp.ort,
        fp.baustelle,
        fp.einsatzort,
        fp.place,
        fp.location,
        fp.abschnitt,
        fp.bereich,
        fp.stelle
      );

      const hourlyMode =
        has(arbeitsbeginnVal) ||
        has(arbeitsendeVal) ||
        has(hoursVal) ||
        looksLikeWorkComment(commentVal);

      setRow((r) => {
        const next: RegieRow = { ...r, docType: "REGIE" };
        const lines = Array.isArray(r.rows) ? [...r.rows] : [];
        if (!lines.length) lines.push(emptyLine());

        if (has(arbeitsbeginnVal) && isTimeLike(arbeitsbeginnVal)) {
          next.arbeitsbeginn = normalizeTime(arbeitsbeginnVal);
        }

        if (has(arbeitsendeVal) && isTimeLike(arbeitsendeVal)) {
          next.arbeitsende = normalizeTime(arbeitsendeVal);
        }

        if (has(pause1Val)) {
          next.pause1 = normalizePause(pause1Val);
        }

        if (has(pause2Val)) {
          next.pause2 = normalizePause(pause2Val);
        }

        if (has(wetterVal) && !isDateLike(wetterVal) && !isTimeLike(wetterVal)) {
          next.wetter = sstr(wetterVal);
        }

        if (has(kostenstelleVal) && !isDateLike(kostenstelleVal)) {
          next.kostenstelle = sstr(kostenstelleVal);
        }

        const line0 = { ...(lines[0] || emptyLine()) };

        if (has(lineKostenstelleVal) && !isDateLike(lineKostenstelleVal)) {
          line0.kostenstelle = sstr(lineKostenstelleVal);
        } else if (has(kostenstelleVal) && !line0.kostenstelle) {
          line0.kostenstelle = sstr(kostenstelleVal);
        }

        const cleanMachine = cleanupMachine(machineVal, workerVal);
        const cleanWorker = cleanupWorker(workerVal, machineVal);

        if (cleanMachine) line0.machine = cleanMachine;
        if (cleanWorker) line0.worker = cleanWorker;

        if (has(materialVal) && !isDateLike(materialVal)) {
          line0.material = sstr(materialVal);
        }

        const qStr = toNumberString(quantityVal);
        if (qStr) {
          line0.quantity = qStr;
        }

        if (has(unitVal) && !isDateLike(unitVal)) {
          line0.unit = sstr(unitVal);
        }

        const hStr = toNumberString(hoursVal);
        if (hStr) {
          line0.hours = hStr;
        }

        let finalHours = String(line0.hours || "").trim();
        if (
          (!finalHours || finalHours === "9") &&
          has(next.arbeitsbeginn) &&
          has(next.arbeitsende)
        ) {
          const calc = calcHoursFromHeader(
            String(next.arbeitsbeginn || ""),
            String(next.arbeitsende || ""),
            String(next.pause1 || ""),
            String(next.pause2 || "")
          );
          if (calc) {
            line0.hours = calc;
            finalHours = calc;
          }
        }

        if (finalHours) {
          if (!has(line0.unit)) line0.unit = "Std";
        }

        let finalComment = "";
        if (has(commentVal) && !isDateLike(commentVal)) {
          finalComment = sstr(commentVal);
        }

        const maybeBuiltComment = buildRegieComment({
          start: next.arbeitsbeginn,
          end: next.arbeitsende,
          ort: ortVal,
          machine: cleanMachine || line0.machine,
          worker: cleanWorker || line0.worker,
          action: finalComment,
        });

        if (maybeBuiltComment && looksLikeWorkComment(finalComment)) {
          finalComment = maybeBuiltComment;
        }

        if (finalComment) {
          line0.comment = finalComment;
          next.bemerkungen = finalComment;
        } else if (has(bemerkungenVal) && !isDateLike(bemerkungenVal)) {
          next.bemerkungen = sstr(bemerkungenVal);
        }

        lines[0] = line0;
        next.rows = lines;
        next.updatedAt = Date.now();

        return next;
      });

      Alert.alert("KI", "Felder wurden eingefüllt.");
      setKiOpen(false);
    } catch (e: any) {
      Alert.alert("KI", e?.message || "Füllen fehlgeschlagen.");
    }
  }, [kiSuggestion]);

  const renderAttachment = useCallback(
    ({ item }: { item: DateiMeta }) => {
      const uri = String(item?.uri || "");
      const isImg =
        String(item?.type || "").startsWith("image/") ||
        /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(uri);

      const isRemote = /^https?:\/\//i.test(uri);
      const canAuth = isRemote && !!authToken;

      return (
        <View style={s.attCard}>
          {isImg ? (
            <Image
              source={
                canAuth
                  ? ({ uri, headers: { Authorization: `Bearer ${authToken}` } } as any)
                  : ({ uri } as any)
              }
              style={s.attImg}
            />
          ) : (
            <View style={s.attFile}>
              <Text style={s.attFileTxt}>FILE</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.attName} numberOfLines={2}>
              {String(item?.name || "Anhang")}
            </Text>
            <Text style={s.attUri} numberOfLines={1}>
              {uri}
            </Text>
          </View>
          <Pressable
            onPress={() => removeAttachment(String(item?.id || ""))}
            style={s.attDel}
          >
            <Text style={s.attDelTxt}>X</Text>
          </Pressable>
        </View>
      );
    },
    [removeAttachment, authToken]
  );

  const renderLine = useCallback(
    ({ item, index }: any) => {
      const l = item || {};

      return (
        <View style={s.lineCard}>
          <View style={s.lineTop}>
            <Text style={s.lineTitle}>Zeile {index + 1}</Text>
            <Pressable
              style={[s.smallBtn, s.smallBtnGhost]}
              onPress={() => removeLine(index)}
            >
              <Text style={s.smallBtnTxtGhost}>Löschen</Text>
            </Pressable>
          </View>

          <Text style={s.label}>Kostenstelle (Zeile)</Text>
          <TextInput
            value={String(l.kostenstelle || "")}
            onChangeText={(v) => updateLine(index, { kostenstelle: v })}
            style={s.input}
            placeholder="z.B. KS-01"
            placeholderTextColor="#B8C1CC"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Maschine</Text>
              <TextInput
                value={String(l.machine || "")}
                onChangeText={(v) => updateLine(index, { machine: v })}
                style={s.input}
                placeholder="z.B. Bagger"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Mitarbeiter</Text>
              <TextInput
                value={String(l.worker || "")}
                onChangeText={(v) => updateLine(index, { worker: v })}
                style={s.input}
                placeholder="Name"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Std.</Text>
              <TextInput
                value={String(l.hours ?? "")}
                onChangeText={(v) => updateLine(index, { hours: v })}
                style={s.input}
                keyboardType="decimal-pad"
                placeholder="z.B. 7.5"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Material</Text>
              <TextInput
                value={String(l.material || "")}
                onChangeText={(v) => updateLine(index, { material: v })}
                style={s.input}
                placeholder="z.B. Rohr DN150"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Menge</Text>
              <TextInput
                value={String(l.quantity ?? "")}
                onChangeText={(v) => updateLine(index, { quantity: v })}
                style={s.input}
                keyboardType="decimal-pad"
                placeholder="z.B. 12"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Einheit</Text>
              <TextInput
                value={String(l.unit || "")}
                onChangeText={(v) => updateLine(index, { unit: v })}
                style={s.input}
                placeholder="m / Stk"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <Text style={s.label}>Kommentar / Leistung</Text>
          <TextInput
            value={String(l.comment || "")}
            onChangeText={(v) => updateLine(index, { comment: v })}
            style={[s.input, { minHeight: 70, textAlignVertical: "top" }]}
            multiline
            placeholder="Beschreibung..."
            placeholderTextColor="#B8C1CC"
          />
        </View>
      );
    },
    [updateLine, removeLine]
  );

  function renderHistoryRow({ item }: { item: RegieRow }) {
    const st = item.workflowStatus || "DRAFT";
    const bc = badgeColor(st);
    const ts = item.updatedAt || item.createdAt;
    const tsStr = ts ? new Date(ts).toLocaleString() : "";

    return (
      <Pressable style={s.histCard} onPress={() => openFromHistory(item)}>
        <View style={s.histTop}>
          <Text style={s.histTitle} numberOfLines={1}>
            {docTypeShort("REGIE")} {String(item.date || "").slice(0, 10)} - Regiebericht
          </Text>
          <View style={[s.badge, { borderColor: bc }]}>
            <Text style={[s.badgeTxt, { color: bc }]}>{badgeText(st)}</Text>
          </View>
        </View>
        <Text style={s.histSub} numberOfLines={2}>
          {item.kostenstelle ? `KS: ${item.kostenstelle}` : "-"}
          {tsStr ? ` - ${tsStr}` : ""}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backTxt}>Zurück</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={s.modePill}>
            <Text style={s.modeTxt}>
              {mode === "NUR_APP" ? "NUR_APP" : "SERVER"}
            </Text>
          </View>
        </View>

        <Text style={s.h1}>Regiebericht</Text>
        <Text style={s.h2}>{String(title || "Projekt")}</Text>

        <View style={s.actionsRow}>
          <Pressable style={[s.actionBtn, { display: "none" }]} onPress={onKiSuggest} disabled={kiBusy}>
            <Text style={s.actionTxt}>{kiBusy ? "KI..." : "KI"}</Text>
          </Pressable>

          <Pressable style={s.actionBtn} onPress={onPdfPreview} disabled={pdfBusy}>
            <Text style={s.actionTxt}>{pdfBusy ? "PDF..." : "PDF Vorschau"}</Text>
          </Pressable>
<View style={s.pill}>
            <Text style={s.pillTxt}>{projectFsKey}</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Datum</Text>
          <TextInput
            value={String(row.date || "")}
            onChangeText={(v) => updateRow({ date: v })}
            style={s.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#B8C1CC"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Arbeitsbeginn</Text>
              <TextInput
                value={String(row.arbeitsbeginn || "")}
                onChangeText={(v) => updateRow({ arbeitsbeginn: v })}
                style={s.input}
                placeholder="07:00"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Arbeitsende</Text>
              <TextInput
                value={String(row.arbeitsende || "")}
                onChangeText={(v) => updateRow({ arbeitsende: v })}
                style={s.input}
                placeholder="16:00"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Pause 1</Text>
              <TextInput
                value={String(row.pause1 || "")}
                onChangeText={(v) => updateRow({ pause1: v })}
                style={s.input}
                placeholder="00:30"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Pause 2</Text>
              <TextInput
                value={String(row.pause2 || "")}
                onChangeText={(v) => updateRow({ pause2: v })}
                style={s.input}
                placeholder="00:00"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Wetter</Text>
              <TextInput
                value={String(row.wetter || "")}
                onChangeText={(v) => updateRow({ wetter: v })}
                style={s.input}
                placeholder="z.B. sonnig"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Kostenstelle (Header)</Text>
              <TextInput
                value={String(row.kostenstelle || "")}
                onChangeText={(v) => updateRow({ kostenstelle: v })}
                style={s.input}
                placeholder="z.B. KS-01"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <Text style={s.label}>Bemerkungen</Text>
          <TextInput
            value={String(row.bemerkungen || "")}
            onChangeText={(v) => updateRow({ bemerkungen: v })}
            style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
            placeholder="Notizen..."
            placeholderTextColor="#B8C1CC"
          />
        </View>

        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionH}>Zeilen</Text>
            <Pressable style={s.smallBtn} onPress={addLine}>
              <Text style={s.smallBtnTxt}>+ Zeile</Text>
            </Pressable>
          </View>

          <FlatList
            data={row.rows || []}
            keyExtractor={(_, idx) => `${row.id}-line-${idx}`}
            renderItem={renderLine}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 12 }}
          />
        </View>

        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionH}>Anhänge (Projekt-Pool)</Text>
            <Pressable style={s.smallBtn} onPress={addAttachment}>
              <Text style={s.smallBtnTxt}>+ Anhang</Text>
            </Pressable>
          </View>

          {(row.attachments || []).length ? (
            <FlatList
              data={row.attachments || []}
              keyExtractor={(x, i) =>
                `${String(x?.id ?? x?.uri ?? "att")}_${row.id}_${i}`
              }
              renderItem={renderAttachment}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10 }}
            />
          ) : (
            <Text style={s.muted}>Keine Anhänge.</Text>
          )}
        </View>

        <DocActionBar
          onSaveOffline={onSaveOffline}
          onSubmit={onSubmit}
          onOpenPdf={() => onOpenPdf()}
          onEmailPdf={() => onEmailPdf()}
          onReset={onReset}
          showPdfActions={true}
          submitting={submitting}
        />

        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionH}>Historie</Text>
            <Pressable style={s.smallBtn} onPress={loadInboxList}>
              <Text style={s.smallBtnTxt}>Aktualisieren</Text>
            </Pressable>
          </View>

          {list.length ? (
            <FlatList
              data={list}
              keyExtractor={(x, i) => `${String(x.id)}_${i}`}
              renderItem={renderHistoryRow}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10 }}
            />
          ) : (
            <Text style={s.muted}>Keine Einträge.</Text>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal
        visible={kiOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setKiOpen(false)}
      >
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalH}>KI Vorschlag</Text>
            
            <Text style={s.modalLabel}>KI Eingabe</Text>
            <TextInput
              value={kiInput}
              onChangeText={setKiInput}
              placeholder="Was soll RLC ausfüllen?"
              placeholderTextColor="#B8C1CC"
              multiline
              style={[s.input, { minHeight: 88, textAlignVertical: "top" }]}
            />
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={{
                alignSelf: "flex-end",
                marginTop: 8,
                marginBottom: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: "#EAF1FF",
              }}
            >
              <Text style={{ color: "#2563EB", fontWeight: "900" }}>
                Tastatur schließen
              </Text>
            </Pressable>
{kiBusy ? (
              <Text style={s.modalMuted}>KI läuft...</Text>
            ) : (
              <>
                {!!kiSuggestion?.notes && (
                  <Text style={s.modalMuted}>{String(kiSuggestion.notes)}</Text>
                )}
                <Text style={s.modalBody}>
                  {kiSuggestion?.suggestion
                    ? JSON.stringify(kiSuggestion.suggestion, null, 2)
                    : kiSuggestion?.raw
                    ? JSON.stringify(kiSuggestion.raw, null, 2)
                    : "Kein Vorschlag verfügbar."}
                </Text>
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                style={[s.modalBtn, { flex: 1, opacity: kiBusy ? 0.6 : 1 }]}
                onPress={() => {
                      Keyboard.dismiss();
                      applyKiSuggestion();
                    }}
                disabled={kiBusy || !kiSuggestion?.suggestion}
              >
                <Text style={s.modalBtnTxt}>Füllen</Text>
              </Pressable>
              <Pressable
                style={[s.modalBtn, { flex: 1 }]}
                onPress={() => {
                      Keyboard.dismiss();
                      setKiOpen(false);
                    }}
              >
                <Text style={s.modalBtnTxt}>Schließen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pdfOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPdfOpen(false)}
      >
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalH}>PDF Vorschau</Text>
            {pdfBusy ? (
              <Text style={s.modalMuted}>PDF wird erstellt...</Text>
            ) : (
              <>
                <Text style={s.modalMuted}>{pdfMeta?.fileName || "PDF bereit"}</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    style={[s.modalBtn, { flex: 1 }]}
                    onPress={onOpenPdf}
                    disabled={!pdfMeta?.pdfUri}
                  >
                    <Text style={s.modalBtnTxt}>PDF öffnen</Text>
                  </Pressable>
                  <Pressable
                    style={[s.modalBtn, { flex: 1 }]}
                    onPress={onEmailPdf}
                    disabled={!pdfMeta?.pdfUri}
                  >
                    <Text style={s.modalBtnTxt}>E-Mail senden</Text>
                  </Pressable>
                </View>
              </>
            )}
            <Pressable
              style={[s.modalBtn, { marginTop: 10 }]}
              onPress={() => setPdfOpen(false)}
            >
              <Text style={s.modalBtnTxt}>Schließen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 16, paddingBottom: 30, gap: 12 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  headerKiBtn: { display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#DDF1FF",
    borderWidth: 1,
    borderColor: "#A8D3F5",
  },
  headerKiTxt: {
    color: "#12324A",
    fontWeight: "900",
    fontSize: 13,
  },

  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backTxt: { color: COLORS.text, fontWeight: "900" },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  modeTxt: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

  h1: { fontSize: 32, fontWeight: "900", color: COLORS.text },
  h2: { color: COLORS.sub, fontWeight: "800", marginTop: -4 },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  actionBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
  },
  actionTxt: { color: COLORS.textLight, fontWeight: "900" },

  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pillTxt: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

  card: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  label: { color: COLORS.text, fontWeight: "900" },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "800",
  },

  grid2: { flexDirection: "row", gap: 10 },

  section: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionH: { color: COLORS.text, fontWeight: "900", fontSize: 16 },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
  },
  smallBtnTxt: { color: COLORS.textLight, fontWeight: "900" },

  smallBtnGhost: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  smallBtnTxtGhost: { color: COLORS.text, fontWeight: "900" },

  muted: { color: COLORS.sub, fontWeight: "700" },

  lineCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  lineTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  lineTitle: { color: COLORS.text, fontWeight: "900" },

  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  thumbWrap: {
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  thumb: { width: "100%", height: "100%" },
  thumbDel: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDelTxt: { color: "#fff", fontWeight: "900" },

  attCard: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attImg: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: COLORS.card2,
  },
  attFile: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
  },
  attFileTxt: { color: COLORS.accent, fontWeight: "900" },
  attName: { color: COLORS.text, fontWeight: "900" },
  attUri: { color: COLORS.sub, fontWeight: "700", marginTop: 2 },
  attDel: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#FFF1F3",
    borderWidth: 1,
    borderColor: "#F3C7CF",
    alignItems: "center",
    justifyContent: "center",
  },
  attDelTxt: { color: "#C33", fontWeight: "900" },

  histCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  histTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  histTitle: { color: COLORS.text, fontWeight: "900", flex: 1 },
  histSub: { color: COLORS.sub, fontWeight: "800" },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.card,
    alignSelf: "flex-start",
  },
  badgeTxt: { fontSize: 11, fontWeight: "900" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 14,
  },
  modalCard: {
    width: "100%",
    borderRadius: 18,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalH: { color: COLORS.text, fontWeight: "900", fontSize: 18 },
  modalLabel: { fontSize: 13, fontWeight: "800", color: COLORS.sub, marginTop: 12, marginBottom: 6 },
  modalMuted: {
    color: COLORS.sub,
    fontWeight: "800",
    marginTop: 6,
  },
  modalBody: {
    marginTop: 10,
    color: COLORS.text,
    fontWeight: "700",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: undefined,
    }) as any,
  },
  modalBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
  },
  modalBtnTxt: { color: COLORS.textLight, fontWeight: "900" },
});



























