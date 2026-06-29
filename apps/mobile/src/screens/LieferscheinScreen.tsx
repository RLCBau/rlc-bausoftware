// apps/mobile/src/screens/LieferscheinScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerRlcKiModuleHandler } from "../lib/rlcKiModuleBridge";
import { parseRlcLieferschein } from "../lib/rlcKiFieldParser";
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
import { hydrateRowForPreview } from "../lib/hydratePreview";
// PDF Exporter + Mail (unificato come EingangPruefung)
import {
  exportLieferscheinPdfToProject,
  emailPdf,
} from "../lib/exporters/projectExport";

// Offline Queue
import { queueAdd } from "../lib/offlineQueue";

// Action bar
import { DocActionBar } from "../components/DocActionBar";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Lieferschein">;

const KEY_MODE = "rlc_mobile_mode";

// per-projekt meta (Pflichtfelder)
function projectMetaKey(projectFsKey: string) {
  return `rlc_mobile_project_meta:${projectFsKey}`;
}

type ProjectMeta = {
  baustellenNummer?: string;
  bauleiterEmail?: string;
};

async function loadProjectMeta(projectFsKey: string): Promise<ProjectMeta> {
  try {
    const raw = await AsyncStorage.getItem(projectMetaKey(projectFsKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ProjectMeta) : {};
  } catch {
    return {};
  }
}

async function saveProjectMeta(
  projectFsKey: string,
  patch: Partial<ProjectMeta>
) {
  const cur = await loadProjectMeta(projectFsKey);
  const next = { ...cur, ...patch };
  await AsyncStorage.setItem(projectMetaKey(projectFsKey), JSON.stringify(next));
}

// Inbox keys (compat)
function lieferscheinInboxKeys(projectKey: string) {
  return [
    `rlc_mobile_inbox_lieferschein:${projectKey}`,
    `rlc_mobile_inbox_ls:${projectKey}`,
  ];
}

type DateiMeta = { id?: string; name?: string; uri?: string; type?: string };

type LieferscheinRow = {
  id: string;
  date: string; // YYYY-MM-DD

  baustellenNummer?: string;
  bauleiterEmail?: string;

  lieferscheinNummer?: string;
  lieferant?: string;
  baustelle?: string;
  fahrer?: string;

  material?: string;
  quantity?: number | string;
  unit?: string;

  kostenstelle?: string;
  lvItemPos?: string;

  bemerkungen?: string;

  attachments?: DateiMeta[];

  workflowStatus?: "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";
  createdAt?: number;
  updatedAt?: number;

  syncStatus?: string;
  syncError?: string;
};

function normalizeFiles(input: any[]): DateiMeta[] {
  const arr = Array.isArray(input) ? input : [];
  const out: DateiMeta[] = [];

  for (const f of arr) {
    if (!f) continue;

    if (typeof f === "string") {
      const uri = String(f).trim();
      if (!uri) continue;
      out.push({
        id: String(uid("f")),
        name: uri.split("/").pop() || `file_${Date.now()}`,
        uri,
        type: undefined,
      });
      continue;
    }

    const uri = String(f?.uri || f?.url || f?.path || "").trim();
    if (!uri) continue;

    out.push({
      id: String(f?.id || uid("f")),
      name: f?.name || f?.filename || uri.split("/").pop() || `file_${Date.now()}`,
      uri,
      type: f?.type || f?.mime || f?.mimeType,
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

function uid(prefix = "ls") {
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

function safeDateOrNow(v: any) {
  const d = toDateInput(v);
  return d && d.length === 10 ? d : ymdNow();
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
  const dir = `${base}projects/${fsKey}/inbox/lieferschein/files/`;
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

  const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });

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
  const f = (res as any).assets?.[0];
  if (!f?.uri) return null;

  return {
    id: uid("file"),
    uri: f.uri,
    type: f.mimeType || "application/octet-stream",
    name: f.name || `file_${Date.now()}`,
  };
}

function badgeText(st?: LieferscheinRow["workflowStatus"]) {
  if (st === "EINGEREICHT") return "E";
  if (st === "FREIGEGEBEN") return "F";
  if (st === "ABGELEHNT") return "A";
  return "D";
}
function badgeColor(st?: LieferscheinRow["workflowStatus"]) {
  if (st === "EINGEREICHT") return "#0B57D0";
  if (st === "FREIGEGEBEN") return "#1A7F37";
  if (st === "ABGELEHNT") return "#C33";
  return "rgba(255,255,255,0.55)";
}

function isImage(item?: DateiMeta) {
  const uri = String(item?.uri || "");
  const type = String(item?.type || "");
  return (
    type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(uri)
  );
}

function mergeAttachmentsForPdf(row: LieferscheinRow): DateiMeta[] {
  const arr = Array.isArray(row.attachments) ? row.attachments : [];
  const seen = new Set<string>();
  const out: DateiMeta[] = [];
  for (const f of arr) {
    const u = String(f?.uri || "");
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ id: f?.id || uid("f"), uri: u, type: f?.type, name: f?.name });
  }
  return out;
}

async function getApiBaseUrlSafe(): Promise<string> {
  const raw = (await AsyncStorage.getItem("api_base_url")) || "";
  return String(raw).trim().replace(/\/$/, "");
}

function absolutizeUri(base: string, uri: string) {
  const u = String(uri || "").trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("file://")) return u;
  if (u.startsWith("/")) return base ? `${base}${u}` : u;
  return u;
}

function forceHttpsIfSameHost(base: string, uri: string) {
  const u = String(uri || "").trim();
  if (!u) return u;
  if (!base) return u;

  try {
    const b = new URL(base);
    const x = new URL(u);
    if (
      b.hostname === x.hostname &&
      b.protocol === "https:" &&
      x.protocol === "http:"
    ) {
      x.protocol = "https:";
      return x.toString();
    }
  } catch {}
  return u;
}

async function normalizeAttachmentsForPreview(arr: DateiMeta[]) {
  const base = await getApiBaseUrlSafe();
  return (Array.isArray(arr) ? arr : []).map((f) => {
    const raw = String(f?.uri || "");
    let next = absolutizeUri(base, raw);
    next = forceHttpsIfSameHost(base, next);
    return { ...f, uri: next };
  });
}

function buildKiTextFromRowLs(r: LieferscheinRow) {
  const bits: string[] = [];
  bits.push(`Datum: ${safeDateOrNow(r.date)}`);
  if (r.baustellenNummer)
    bits.push(`BaustellenNummer: ${String(r.baustellenNummer)}`);
  if (r.bauleiterEmail) bits.push(`BauleiterEmail: ${String(r.bauleiterEmail)}`);
  if (r.lieferscheinNummer)
    bits.push(`LieferscheinNr: ${String(r.lieferscheinNummer)}`);
  if (r.lieferant) bits.push(`Lieferant: ${String(r.lieferant)}`);
  if (r.baustelle) bits.push(`Baustelle: ${String(r.baustelle)}`);
  if (r.fahrer) bits.push(`Fahrer: ${String(r.fahrer)}`);
  if (r.kostenstelle) bits.push(`Kostenstelle: ${String(r.kostenstelle)}`);
  if (r.lvItemPos) bits.push(`LV-Pos: ${String(r.lvItemPos)}`);
  if (r.material) bits.push(`Material: ${String(r.material)}`);
  if (r.quantity != null && String(r.quantity).trim() !== "")
    bits.push(`Menge: ${String(r.quantity)}`);
  if (r.unit) bits.push(`Einheit: ${String(r.unit)}`);
  if (r.bemerkungen) bits.push(`Bemerkungen: ${String(r.bemerkungen)}`);
  return bits.join("\n").trim();
}

function normalizeKiResultLs(raw: any) {
  const root =
    raw?.data && typeof raw.data === "object" ? raw.data :
    raw?.result && typeof raw.result === "object" ? raw.result :
    raw;

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
      root.material != null ||
      root.quantity != null ||
      root.qty != null ||
      root.unit != null ||
      root.fahrer != null ||
      root.driver != null ||
      root.baustelle != null ||
      root.site != null ||
      root.lieferant != null ||
      root.supplier != null ||
      root.comment != null ||
      root.bemerkungen != null ||
      root.text != null
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


async function uploadVisionFilesIfPossible(
  projectFsKey: string,
  files: DateiMeta[]
) {
  const clean = (files || [])
    .map((f) => ({
      uri: String(f?.uri || ""),
      name: String(f?.name || "file"),
      type: String(f?.type || "application/octet-stream"),
    }))
    .filter((x) => !!x.uri);

  if (!clean.length) return { ids: [], raw: null };

  const uploadFn =
    (api as any)?.kiVisionFiles ||
    (api as any)?.kiVisionFilesUpload ||
    (api as any)?.kiUploadVisionFiles ||
    (api as any)?.uploadVisionFiles ||
    (api as any)?.visionFiles ||
    null;

  if (typeof uploadFn !== "function") return { ids: [], raw: null };

  let res: any;
  try {
    res =
      uploadFn.length >= 2
        ? await uploadFn(projectFsKey, clean)
        : await uploadFn(clean);
  } catch {
    res =
      uploadFn.length >= 2
        ? await uploadFn(projectFsKey, { files: clean })
        : await uploadFn({ files: clean });
  }

  const ids =
    res?.visionFileIds ||
    res?.data?.visionFileIds ||
    res?.result?.visionFileIds ||
    res?.fileIds ||
    res?.ids ||
    res?.data?.fileIds ||
    res?.data?.ids ||
    res?.result?.fileIds ||
    res?.result?.ids ||
    [];

  return { ids: Array.isArray(ids) ? ids : [], raw: res };
}

function safeStringify(x: any) {
  try {
    return JSON.stringify(x, null, 2);
  } catch (e) {
    try {
      return String(x);
    } catch {
      return "[unstringifiable]";
    }
  }
}

function isValidEmail(v: string) {
  const s = String(v || "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function requirePflichtfelderOrAlert(projectFsKey: string, r: LieferscheinRow) {
  const bn = String(r.baustellenNummer || "").trim();
  const bl = String(r.bauleiterEmail || "").trim();

  const missing: string[] = [];
  if (!projectFsKey) missing.push("Projekt");
  if (!bn) missing.push("BaustellenNummer");
  if (!bl) missing.push("Bauleiter (E-Mail)");
  else if (!isValidEmail(bl)) missing.push("Bauleiter (E-Mail ungültig)");

  if (missing.length) {
    Alert.alert("Pflichtfelder", `Bitte ausfüllen:\n• ${missing.join("\n• ")}`);
    return false;
  }
  return true;
}

function normalizeInboxSnapshotLs(snapRaw: any, editId: string): LieferscheinRow | null {
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

  return {
    ...base,
    id: String(base?.id || base?.docId || (snapRaw as any)?.id || editId),
    date: safeDateOrNow(base?.date || payload?.date || ymdNow()),
    baustellenNummer: String(base?.baustellenNummer || payload?.baustellenNummer || ""),
    bauleiterEmail: String(base?.bauleiterEmail || payload?.bauleiterEmail || ""),
    lieferscheinNummer: String(base?.lieferscheinNummer || base?.lieferscheinNr || base?.number || base?.nr || ""),
    lieferant: String(base?.lieferant || base?.supplier || ""),
    baustelle: String(base?.baustelle || base?.site || ""),
    fahrer: String(base?.fahrer || base?.driver || ""),
    material: String(base?.material || ""),
    quantity: base?.quantity ?? base?.qty ?? "",
    unit: String(base?.unit || base?.einheit || ""),
    kostenstelle: String(base?.kostenstelle || ""),
    lvItemPos: String(base?.lvItemPos || base?.lvPos || ""),
    bemerkungen: String(base?.bemerkungen || base?.comment || base?.note || ""),
    attachments: normalizeFiles(attPool),
    workflowStatus: (base?.workflowStatus || payload?.workflowStatus || "EINGEREICHT") as any,
    createdAt: Number(base?.createdAt || payload?.createdAt || Date.now()),
    updatedAt: Number(base?.updatedAt || payload?.updatedAt || Date.now()),
  };
}

export default function LieferscheinScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title, editId } = route.params as any;
  const fromInbox = Boolean((route.params as any)?.fromInbox);
  const inboxSnapshot = (route.params as any)?.inboxSnapshot;
  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const projectIdOrFallback = String(projectId || "").trim();
  const projectCodeFs = String(projectCode || "").trim();

  const projectFsKey = useMemo(
    () => normalizeProjectKey(projectCodeFs, projectIdOrFallback),
    [projectCodeFs, projectIdOrFallback]
  );

  const projectIdForServer = useMemo(() => {
    return projectFsKey;
  }, [projectFsKey]);

   useEffect(() => {
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
  }, [navigation, projectId, projectFsKey, mode]);

  
  const [submitting, setSubmitting] = useState(false);

  const [row, setRow] = useState<LieferscheinRow>(() => {
    const fixed = inboxSnapshot
      ? normalizeInboxSnapshotLs(inboxSnapshot, String(editId || uid("ls")))
      : null;

    return (
      fixed || {
        id: editId ? String(editId) : uid("ls"),
        date: ymdNow(),
        baustellenNummer: "",
        bauleiterEmail: "",
        lieferscheinNummer: "",
        lieferant: "",
        baustelle: "",
        fahrer: "",
        material: "",
        quantity: "",
        unit: "",
        kostenstelle: "",
        lvItemPos: "",
        bemerkungen: "",
        attachments: [],
        workflowStatus: "DRAFT",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    );
  });

  const [list, setList] = useState<LieferscheinRow[]>([]);
  const loadLock = useRef(0);
  const inboxSnapshotAppliedRef = useRef(false);

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<{
    pdfUri?: string;
    fileName?: string;
    date?: string;
  } | null>(null);

  const [kiOpen, setKiOpen] = useState(false);
  const [kiBusy, setKiBusy] = useState(false);
  const [kiSuggestion, setKiSuggestion] = useState<any>(null);
  const [kiInput, setKiInput] = useState("");
  const kiInputOverrideRef = useRef("");

  const readMode = useCallback(async () => {
    try {
      const m = (await AsyncStorage.getItem(KEY_MODE)) as any;
      if (m === "NUR_APP" || m === "SERVER_SYNC") setMode(m);
      else setMode("SERVER_SYNC");
    } catch {
      setMode("SERVER_SYNC");
    }
  }, []);

  const hydratePflichtfelder = useCallback(async () => {
    const meta = await loadProjectMeta(projectFsKey);
    setRow((r) => ({
      ...r,
      baustellenNummer: String(
        r.baustellenNummer || meta.baustellenNummer || ""
      ).trim(),
      bauleiterEmail: String(
        r.bauleiterEmail || meta.bauleiterEmail || ""
      ).trim(),
    }));
  }, [projectFsKey]);

  async function persistToInbox(nextRow: LieferscheinRow) {
    const projectKeys = Array.from(
      new Set(
        [
          projectFsKey,
          projectCodeFs,
          projectIdForServer,
          String((route.params as any)?.projectCode || ""),
          String((route.params as any)?.projectId || ""),
        ]
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      )
    );

    const storageKeys = Array.from(
      new Set(projectKeys.flatMap((k) => lieferscheinInboxKeys(k)))
    );

    const arr = await loadArrayFromFirstKey(storageKeys);
    const lst = Array.isArray(arr) ? (arr as LieferscheinRow[]) : [];

    const idx = lst.findIndex((x) => String(x.id) === String(nextRow.id));
    if (idx >= 0) lst[idx] = nextRow;
    else lst.unshift(nextRow);

    lst.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    for (const k of storageKeys) {
      await setJson(k, lst);
    }

    setList(lst);
  }

  const applyInboxSnapshotIfAny = useCallback(async () => {
    if (!fromInbox || !inboxSnapshot || inboxSnapshotAppliedRef.current) return false;

    const fixed = normalizeInboxSnapshotLs(inboxSnapshot, String(editId || uid("ls")));
    if (!fixed) return false;

    setRow(fixed);
    inboxSnapshotAppliedRef.current = true;

    try {
      await persistToInbox({
        ...fixed,
        workflowStatus: (fixed.workflowStatus as any) || "EINGEREICHT",
        updatedAt: Date.now(),
        createdAt: fixed.createdAt || Date.now(),
      });
    } catch {}

    const bn = String(fixed.baustellenNummer || "").trim();
    const bl = String(fixed.bauleiterEmail || "").trim();
    if (bn || bl) {
      saveProjectMeta(projectFsKey, {
        ...(bn ? { baustellenNummer: bn } : {}),
        ...(bl ? { bauleiterEmail: bl } : {}),
      }).catch(() => {});
    }

    return true;
  }, [fromInbox, inboxSnapshot, editId, projectFsKey]);

  const loadInboxList = useCallback(async () => {
    const my = ++loadLock.current;
    try {
      const arr = await loadArrayFromFirstKey(
        lieferscheinInboxKeys(projectFsKey)
      );
      const next = Array.isArray(arr) ? (arr as LieferscheinRow[]) : [];
      next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        const normalized = await Promise.all(
        next.map(async (r) => {
          const hydratedRaw = await hydrateRowForPreview(r, projectFsKey);
          return {
            ...r,
            ...hydratedRaw,
            attachments: normalizeFiles(
              hydratedRaw?.attachments ||
                hydratedRaw?.files ||
                hydratedRaw?.photos ||
                r.attachments ||
                []
            ),
          };
        })
      );

      if (my === loadLock.current) setList(normalized);

      if (editId) {
        const appliedSnapshot = await applyInboxSnapshotIfAny();
        if (appliedSnapshot) return;

        const found = normalized.find((x) => String(x.id) === String(editId));
        if (found) setRow(found);
      }
    } catch (e: any) {
      Alert.alert(
        "Lieferschein",
        e?.message || "Inbox konnte nicht geladen werden."
      );
    }
  }, [projectFsKey, editId, applyInboxSnapshotIfAny]);

  useEffect(() => {
    readMode();
    loadInboxList();
    hydratePflichtfelder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInboxList();
      hydratePflichtfelder();
    }, [loadInboxList, hydratePflichtfelder])
  );

  const updateRow = useCallback((patch: Partial<LieferscheinRow>) => {
    setRow((r) => ({ ...r, ...patch, updatedAt: Date.now() }));
  }, []);

  const updatePflichtfeld = useCallback(
    async (patch: Partial<ProjectMeta>) => {
      setRow((r) => ({ ...r, ...patch, updatedAt: Date.now() } as any));
      await saveProjectMeta(projectFsKey, patch);
    },
    [projectFsKey]
  );

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
      if (!requirePflichtfelderOrAlert(projectFsKey, row)) return;

      const next: LieferscheinRow = {
        ...row,
        id: String(row.id || uid("ls")),
        date: safeDateOrNow(row.date),
        workflowStatus: row.workflowStatus || "DRAFT",
        createdAt: row.createdAt || Date.now(),
        updatedAt: Date.now(),
        attachments: normalizeFiles(row.attachments || []),
      };
      await persistToInbox(next);
      Alert.alert("Gespeichert", "Lieferschein wurde offline gespeichert.");
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || "Speichern fehlgeschlagen.");
    }
  }, [row, projectFsKey]);

  const onSubmit = useCallback(async () => {
    try {
      if (!requirePflichtfelderOrAlert(projectFsKey, row)) return;

      setSubmitting(true);

      const fixedDate = safeDateOrNow(row.date);

      const next: LieferscheinRow = {
        ...row,
        id: String(row.id || uid("ls")),
        date: fixedDate,
        workflowStatus: "EINGEREICHT",
        createdAt: row.createdAt || Date.now(),
        updatedAt: Date.now(),
        syncStatus: mode === "SERVER_SYNC" ? "PENDING" : "LOCAL",
        syncError: undefined,
        attachments: normalizeFiles(row.attachments || []),
      };

      // Wichtig: zuerst lokal in allen kompatiblen Inbox-Keys speichern,
      // damit Eingang / Prüfung den Lieferschein sofort sieht.
      await persistToInbox(next);

      if (mode === "SERVER_SYNC" && looksLikeProjectCode(projectFsKey)) {
        const files = mergeAttachmentsForPdf(next);

        const payload = {
          date: fixedDate,
          text: String(next.bemerkungen || ""),
          note: String(next.bemerkungen || ""),
          row: next,
          files,
          lieferscheinNummer: String(next.lieferscheinNummer || ""),
          supplier: String(next.lieferant || ""),
          lieferant: String(next.lieferant || ""),
          driver: String(next.fahrer || ""),
          fahrer: String(next.fahrer || ""),
          site: String(next.baustelle || ""),
          baustelle: String(next.baustelle || ""),
          material: String(next.material || ""),
          quantity:
            next.quantity === "" || next.quantity == null
              ? undefined
              : Number(next.quantity),
          unit: String(next.unit || ""),
          kostenstelle: String(next.kostenstelle || ""),
          lvItemPos: String(next.lvItemPos || ""),
          bemerkungen: String(next.bemerkungen || ""),
        };

        try {
          if (typeof (api as any).pushLieferscheinToServer === "function") {
            await (api as any).pushLieferscheinToServer(projectFsKey, next);
            await persistToInbox({
              ...next,
              syncStatus: "DONE",
              syncError: undefined,
              updatedAt: Date.now(),
            });
          } else {
            await queueAdd({
              kind: "LIEFERSCHEIN",
              projectId: projectFsKey,
              payload,
            });

            await persistToInbox({
              ...next,
              syncStatus: "PENDING",
              syncError: undefined,
              updatedAt: Date.now(),
            });
          }
        } catch (e: any) {
          const msg = String(e?.message || "Server-Sync fehlgeschlagen");
          await queueAdd({
            kind: "LIEFERSCHEIN",
            projectId: projectFsKey,
            payload,
          });

          await persistToInbox({
            ...next,
            syncStatus: "PENDING",
            syncError: msg,
            updatedAt: Date.now(),
          });
        }

        Alert.alert(
          "Einreichen",
          "Lieferschein wurde in Eingang / Prüfung gespeichert. Sync läuft über Sync Queue."
        );
        navigation.goBack();
        return;
      }

      Alert.alert("Einreichen", "Lieferschein wurde gespeichert.");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Einreichen", e?.message || "Einreichen fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }, [kiInput, row, mode, projectFsKey, projectCodeFs, projectIdForServer, navigation]);

  const makeRowForExporter = useCallback(() => {
    const files = mergeAttachmentsForPdf(row);
    const fixedDate = safeDateOrNow(row.date);

    const rowForExport: any = {
      ...row,
      date: fixedDate,
      supplier: String((row as any).supplier || row.lieferant || ""),
      driver: String((row as any).driver || row.fahrer || ""),
      site: String((row as any).site || row.baustelle || ""),
      qty: (row as any).qty ?? row.quantity ?? "",
      unit: (row as any).unit ?? row.unit ?? "",
      attachments: files,
      files,
    };

    return {
      kind: "LIEFERSCHEIN",
      payload: {
        date: fixedDate,
        text: String(row.bemerkungen || ""),
        files,
        row: rowForExport,
      },
    };
  }, [row]);

  const buildPdf = useCallback(async () => {
    const out = await exportLieferscheinPdfToProject({
      projectFsKey,
      projectTitle: String(title || "Projekt"),
      filenameHint: `Lieferschein_${safeDateOrNow(row.date)}`,
      row: makeRowForExporter(),
    } as any);
    return out;
  }, [projectFsKey, title, row, makeRowForExporter]);

  const onOpenPdf = useCallback(async () => {
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
  }, [buildPdf]);

  const onEmailPdf = useCallback(async () => {
    if (!requirePflichtfelderOrAlert(projectFsKey, row)) return;

    const out = await buildPdf();

    const attachments =
      Platform.OS === "web"
        ? []
        : [out.pdfUri].filter((u) => String(u || "").startsWith("file://"));

    await emailPdf({
      subject: out.fileName,
      body: `Lieferschein ${projectFsKey} (${out.date})\nBaustellenNummer: ${String(
        row.baustellenNummer || ""
      )}`,
      attachments: attachments as any,
    });
  }, [buildPdf, projectFsKey, row]);

  const onPdfPreview = useCallback(async () => {
    try {
      setPdfOpen(true);
      setPdfBusy(true);
      setPdfMeta(null);
      const out = await buildPdf();
      setPdfMeta(out);
    } catch (e: any) {
      Alert.alert(
        "PDF Vorschau",
        e?.message || "PDF konnte nicht erstellt werden."
      );
      setPdfOpen(false);
    } finally {
      setPdfBusy(false);
    }
  }, [buildPdf]);

  const openFromHistory = useCallback(
    (x: LieferscheinRow) => {
      navigation.setParams?.({ editId: x.id, fromInbox: true } as any);

      normalizeAttachmentsForPreview(normalizeFiles(x.attachments || []))
        .then((atts) => {
          setRow({ ...x, attachments: atts });
        })
        .catch(() => {
          setRow({ ...x, attachments: normalizeFiles(x.attachments || []) });
        });

      const bn = String(x.baustellenNummer || "").trim();
      const bl = String(x.bauleiterEmail || "").trim();
      if (bn || bl) {
        saveProjectMeta(projectFsKey, {
          ...(bn ? { baustellenNummer: bn } : {}),
          ...(bl ? { bauleiterEmail: bl } : {}),
        }).catch(() => {});
      }
    },
    [navigation, projectFsKey]
  );

  const onReset = useCallback(() => {
    setRow((r) => ({
      id: uid("ls"),
      date: ymdNow(),
      baustellenNummer: String(r.baustellenNummer || ""),
      bauleiterEmail: String(r.bauleiterEmail || ""),
      lieferscheinNummer: "",
      lieferant: "",
      baustelle: "",
      fahrer: "",
      material: "",
      quantity: "",
      unit: "",
      kostenstelle: "",
      lvItemPos: "",
      bemerkungen: "",
      attachments: [],
      workflowStatus: "DRAFT",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }, []);
const onKiSuggest = useCallback(async () => {
  try {
    setKiOpen(true);
    setKiBusy(true);
    setKiSuggestion(null);

    if (mode === "NUR_APP") {
      const hasAttachments =
        Array.isArray(row.attachments) && row.attachments.length > 0;
      const hasText =
        !!String(row.material || "").trim() ||
        !!String(row.lieferant || "").trim() ||
        !!String(row.baustelle || "").trim() ||
        !!String(row.bemerkungen || "").trim() ||
        !!String(row.lieferscheinNummer || "").trim();

      setKiSuggestion(
        normalizeKiResultLs({
          suggestion: null,
          notes:
            "KI ist im Modus NUR_APP nicht verfügbar.\n\n" +
            "Im lokalen Modus werden keine Dateien an den Server gesendet und keine KI-Analyse ausgeführt.\n\n" +
            "Bitte nutze SERVER_SYNC für KI aus Foto / OCR / automatische Feldvorschläge.\n\n" +
            `Anhänge vorhanden: ${hasAttachments ? "ja" : "nein"}\n` +
            `Daten im Formular vorhanden: ${hasText ? "ja" : "nein"}`,
        })
      );
      return;
    }

    const fn =
      (api as any)?.kiLieferscheinSuggest ||
      (api as any)?.kiSuggestLieferschein ||
      null;

    if (typeof fn !== "function") {
      setKiSuggestion(
        normalizeKiResultLs({
          error: {
            message:
              "KI Endpoint nicht verbunden. (api.kiLieferscheinSuggest fehlt)",
          },
        })
      );
      return;
    }

    const attachments = normalizeFiles(mergeAttachmentsForPdf(row));
    const hasFiles = attachments.length > 0;

    let visionFileIds: string[] = [];
    let visionUploadRaw: any = null;

    if (hasFiles) {
      const up = await uploadVisionFilesIfPossible(projectFsKey, attachments);
      visionFileIds = Array.isArray(up?.ids) ? up.ids : [];
      visionUploadRaw = up?.raw || null;
    }

    const ocrOk = hasFiles && visionFileIds.length > 0;

    const payload: any = {
      kind: "LIEFERSCHEIN",
      projectId: projectIdForServer,
      projectCode: projectFsKey,
      projectFsKey,
      date: safeDateOrNow(row.date),
      text: [String(kiInputOverrideRef.current || kiInput || "").trim(), buildKiTextFromRowLs(row)].filter(Boolean).join("\n\n"),
      row: {
        ...row,
        attachments,
      },
      files: attachments,
      attachments,
      visionFileIds,
      ocr: ocrOk,
      allowOcr: ocrOk,
      enableOcr: ocrOk,
      useOcr: ocrOk,
      strict: !ocrOk,
      _client: {
        hasFiles,
        ocrOk,
        visionFileIdsCount: visionFileIds.length,
        mode,
      },
    };

    let rawRes: any;
    rawRes =
      typeof fn === "function" && fn.length >= 2
        ? await fn(projectFsKey, payload)
        : await fn(payload);

    console.log("LS KI RAW RES:", JSON.stringify(rawRes, null, 2));
    console.log("LS KI ATTACHMENTS:", JSON.stringify(attachments, null, 2));
    console.log("LS KI VISION IDS:", JSON.stringify(visionFileIds, null, 2));

    if (rawRes && typeof rawRes === "object") {
      (rawRes as any)._clientDebug = {
        hasFiles,
        ocrOk,
        visionFileIds,
        visionUploadOk: !!visionFileIds.length,
        mode,
      };
      (rawRes as any)._visionUpload = visionUploadRaw
        ? { ok: true, raw: visionUploadRaw }
        : { ok: false };
    }

    setKiSuggestion(normalizeKiResultLs(rawRes));
  } catch (e: any) {
    setKiSuggestion(
      normalizeKiResultLs({
        error: { message: String(e?.message || "KI Fehler") },
      })
    );
  } finally {
    setKiBusy(false);
  }
}, [mode, projectFsKey, row, projectIdForServer]);
  // RLC_KI_MODULE_HANDLER_LIEFERSCHEIN_V2_LOCAL_FILL
  useEffect(() => {
    return registerRlcKiModuleHandler("Lieferschein", async (payload: any) => {
      const input = String(payload?.input || "").trim();
      setKiInput(input);

      const parsed = parseRlcLieferschein(input);
      const firstMat = Array.isArray(parsed.material) ? parsed.material[0] : null;

      const toIsoDate = (v: any) => {
        const s = String(v || "").trim();
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s || ymdNow();
      };

      const materialText = Array.isArray(parsed.material)
        ? parsed.material.map((m: any) => `${m.name} ${m.quantity} ${m.unit}`.trim()).join("\n")
        : "";

      const warnings =
        parsed.warnings?.length
          ? `

RLC KI Hinweise:
${parsed.warnings.map((w: string) => `- ${w}`).join("\n")}`
          : "";

      setRow((r) => ({
        ...r,
        date: toIsoDate(parsed.datum || r.date),
        lieferscheinNummer: parsed.lieferscheinNr || r.lieferscheinNummer || "",
        lieferant: parsed.lieferant || r.lieferant || "",
        baustelle: parsed.baustelle || r.baustelle || "",
        fahrer: parsed.fahrer || r.fahrer || "",
        material: firstMat?.name || r.material || "",
        quantity: firstMat?.quantity || r.quantity || "",
        unit: firstMat?.unit || r.unit || "",
        bemerkungen: `${parsed.bemerkung || r.bemerkungen || ""}${materialText ? `

Material:
${materialText}` : ""}${warnings}`,
        updatedAt: Date.now(),
      }));

      setKiOpen(false);
      return { ok: true, handled: true, message: "LIEFERSCHEIN_FIELDS_FILLED" };
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

    const isLabelLike = (v: any) => {
      const s = sstr(v).toLowerCase();
      return (
        s === "datum" ||
        s === "datum:" ||
        s === "fahrer" ||
        s === "fahrer:" ||
        s === "kostenstelle" ||
        s === "kostenstelle:"
      );
    };

    const isProjectCode = (v: any) => {
      const s = sstr(v);
      return /^BA-\d{4}-\d+/.test(s);
    };

    const isClearlyWrongDriver = (v: any) => {
      return isDateLike(v) || isLabelLike(v) || isProjectCode(v);
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

    const materialVal = getFirst(
      fp.material,
      fp.mat,
      fp.stoff,
      fp.materialName,
      fp.material_name,
      fp.artikel,
      fp.bezeichnung,
      fp.produkt,
      fp.product
    );
    const quantityVal = getFirst(
      fp.menge,
      fp.quantity,
      fp.qty,
      fp.amount,
      fp.anzahl,
      fp.volume,
      fp.masse
    );
    const unitVal = getFirst(
      fp.einheit,
      fp.unit,
      fp.me,
      fp.eh,
      fp.mengeneinheit
    );
    const supplierVal = getFirst(
      fp.lieferant,
      fp.supplier,
      fp.firma,
      fp.vendor,
      fp.haendler
    );
    const driverVal = getFirst(fp.fahrer, fp.driver, fp.mitarbeiter);
    const siteVal = getFirst(fp.baustelle, fp.site, fp.ort);
    const kostenstelleVal = getFirst(fp.kostenstelle, fp.costCenter);
    const lvVal = getFirst(
      fp.lvPosition,
      fp.lvItemPos,
      fp.lvPos,
      fp.lv_pos,
      fp.lv_item_pos
    );
    const lsNumVal = getFirst(
      fp.lsNr,
      fp.lieferscheinNr,
      fp.lieferscheinNummer,
      fp.lieferschein_nummer,
      fp.bonNr,
      fp.bon_nr,
      fp.bon
    );
    const bemerkungVal = getFirst(
      fp.bemerkungen,
      fp.textBeschreibung,
      fp.beschreibung,
      fp.text,
      fp.comment,
      fp.note
    );
    const bnVal = getFirst(fp.baustellenNummer, fp.baustelleNr, fp.baustellen_nr);
    const blVal = getFirst(fp.bauleiterEmail, fp.bauleiter_email);
    const dateVal = getFirst(fp.datum, fp.date);

    const splitSiteDriverFromText = (v: any) => {
      const s = sstr(v);
      if (!s) return { site: "", driver: "" };

      const parts = s.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return { site: "", driver: "" };

      const last = parts[parts.length - 1];
      const rest = parts.slice(0, -1).join(" ");

      return {
        site: rest,
        driver: last,
      };
    };

    const inferredFromBemerkung = splitSiteDriverFromText(bemerkungVal);

    setRow((r) => {
      const next: LieferscheinRow = { ...r };

      if (has(dateVal)) {
        const dv = sstr(dateVal);
        const m = dv.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        next.date = m ? `${m[3]}-${m[2]}-${m[1]}` : safeDateOrNow(dv);
      }

      if (has(bnVal)) next.baustellenNummer = sstr(bnVal);
      if (has(blVal)) next.bauleiterEmail = sstr(blVal);
      if (has(lsNumVal)) next.lieferscheinNummer = sstr(lsNumVal);

      if (has(supplierVal) && !isDateLike(supplierVal) && !isLabelLike(supplierVal)) {
        next.lieferant = sstr(supplierVal);
      }

      if (has(driverVal) && !isClearlyWrongDriver(driverVal)) {
        next.fahrer = sstr(driverVal);
      } else if (has(inferredFromBemerkung.driver) && !isClearlyWrongDriver(inferredFromBemerkung.driver)) {
        next.fahrer = sstr(inferredFromBemerkung.driver);
      }

      if (
        has(siteVal) &&
        !isDateLike(siteVal) &&
        !isLabelLike(siteVal) &&
        !isProjectCode(siteVal)
      ) {
        next.baustelle = sstr(siteVal);
      } else if (
        has(inferredFromBemerkung.site) &&
        !isDateLike(inferredFromBemerkung.site) &&
        !isLabelLike(inferredFromBemerkung.site) &&
        !isProjectCode(inferredFromBemerkung.site)
      ) {
        next.baustelle = sstr(inferredFromBemerkung.site);
      }

      if (has(kostenstelleVal) && !isDateLike(kostenstelleVal) && !isLabelLike(kostenstelleVal)) {
        next.kostenstelle = sstr(kostenstelleVal);
      }

      if (has(lvVal)) next.lvItemPos = sstr(lvVal);

      if (has(materialVal) && !isDateLike(materialVal) && !isLabelLike(materialVal)) {
        next.material = sstr(materialVal);
      }

      const qStr = toNumberString(quantityVal);
      if (qStr) next.quantity = qStr;

      if (has(unitVal) && !isDateLike(unitVal) && !isLabelLike(unitVal)) {
        next.unit = sstr(unitVal);
      }

      const finalSite =
        has(siteVal) && !isProjectCode(siteVal)
          ? sstr(siteVal)
          : sstr(inferredFromBemerkung.site);

      const finalDriver =
        has(driverVal) && !isClearlyWrongDriver(driverVal)
          ? sstr(driverVal)
          : sstr(inferredFromBemerkung.driver);

      if (
        has(materialVal) &&
        qStr &&
        has(unitVal) &&
        finalSite &&
        finalDriver
      ) {
        next.bemerkungen =
          `${sstr(materialVal)} (${qStr} ${sstr(unitVal)}) zur Baustelle ${finalSite} geliefert (Fahrer: ${finalDriver}).`;
      } else if (has(bemerkungVal) && !isLabelLike(bemerkungVal)) {
        next.bemerkungen = sstr(bemerkungVal);
      }

      next.updatedAt = Date.now();
      return next;
    });

    const bn2 = sstr(bnVal);
    const bl2 = sstr(blVal);

    if (bn2 || bl2) {
      saveProjectMeta(projectFsKey, {
        ...(bn2 ? { baustellenNummer: bn2 } : {}),
        ...(bl2 ? { bauleiterEmail: bl2 } : {}),
      }).catch(() => {});
    }

    Alert.alert("KI", "Felder wurden übernommen.");
    setKiOpen(false);
  } catch (e: any) {
    Alert.alert("KI", e?.message || "Übernahme fehlgeschlagen.");
  }
}, [kiSuggestion, projectFsKey]);

  const renderAttachment = useCallback(
    ({ item }: { item: DateiMeta }) => {
      const uri = String(item?.uri || "");
      const img = isImage(item);

      return (
        <View style={s.attCard}>
          {img ? (
            <Image source={{ uri }} style={s.attImg} />
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
    [removeAttachment]
  );

  function renderHistoryRow({ item }: { item: LieferscheinRow }) {
    const st = item.workflowStatus || "DRAFT";
    const bc = badgeColor(st);
    const ts = item.updatedAt || item.createdAt;
    const tsStr = ts ? new Date(ts).toLocaleString() : "";
    return (
      <Pressable style={s.histCard} onPress={() => openFromHistory(item)}>
        <View style={s.histTop}>
          <Text style={s.histTitle} numberOfLines={1}>
            LS {String(item.date || "").slice(0, 10)}{" "}
            {item.lieferscheinNummer ? `• ${item.lieferscheinNummer}` : ""}
          </Text>
          <View style={[s.badge, { borderColor: bc }]}>
            <Text style={[s.badgeTxt, { color: bc }]}>{badgeText(st)}</Text>
          </View>
        </View>
        <Text style={s.histSub} numberOfLines={2}>
          {item.kostenstelle ? `KS: ${item.kostenstelle}` : "-"}
          {item.lvItemPos ? ` • LV: ${item.lvItemPos}` : ""}
          {item.baustellenNummer ? ` • BA: ${item.baustellenNummer}` : ""}
          {tsStr ? ` • ${tsStr}` : ""}
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

        <Text style={s.h1}>Lieferschein</Text>
        <Text style={s.h2}>{String(title || "Projekt")}</Text>

        <View style={s.actionsRow}>
          <Pressable style={[s.actionBtn, { display: "none" }]} onPress={onKiSuggest} disabled={kiBusy}>
            <Text style={s.actionTxt}>{kiBusy ? "KI..." : "KI"}</Text>
          </Pressable>

          <Pressable
            style={s.actionBtn}
            onPress={onPdfPreview}
            disabled={pdfBusy}
          >
            <Text style={s.actionTxt}>
              {pdfBusy ? "PDF..." : "PDF Vorschau"}
            </Text>
          </Pressable>

          <View style={s.pill}>
            <Text style={s.pillTxt}>{projectFsKey}</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Pflichtfelder</Text>

          <Text style={s.label}>BaustellenNummer</Text>
          <TextInput
            value={String(row.baustellenNummer || "")}
            onChangeText={(v) => updatePflichtfeld({ baustellenNummer: v })}
            style={s.input}
            placeholder="z.B. BA-12345"
            placeholderTextColor="#B8C1CC"
          />

          <Text style={s.label}>Bauleiter (E-Mail)</Text>
          <TextInput
            value={String(row.bauleiterEmail || "")}
            onChangeText={(v) => updatePflichtfeld({ bauleiterEmail: v })}
            style={s.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="bauleiter@firma.de"
            placeholderTextColor="#B8C1CC"
          />

          <Text style={s.mutedSmall}>
            Diese Felder werden pro Projekt gespeichert und sind offline Pflicht.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Lieferschein Daten</Text>

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
              <Text style={s.label}>Lieferschein-Nr.</Text>
              <TextInput
                value={String(row.lieferscheinNummer || "")}
                onChangeText={(v) => updateRow({ lieferscheinNummer: v })}
                style={s.input}
                placeholder="z.B. LS-123"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Kostenstelle</Text>
              <TextInput
                value={String(row.kostenstelle || "")}
                onChangeText={(v) => updateRow({ kostenstelle: v })}
                style={s.input}
                placeholder="z.B. KS-01"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Lieferant</Text>
              <TextInput
                value={String(row.lieferant || "")}
                onChangeText={(v) => updateRow({ lieferant: v })}
                style={s.input}
                placeholder="Firma"
                placeholderTextColor="#B8C1CC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Fahrer / Mitarbeiter</Text>
              <TextInput
                value={String(row.fahrer || "")}
                onChangeText={(v) => updateRow({ fahrer: v })}
                style={s.input}
                placeholder="Name"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <Text style={s.label}>Baustelle</Text>
          <TextInput
            value={String(row.baustelle || "")}
            onChangeText={(v) => updateRow({ baustelle: v })}
            style={s.input}
            placeholder="Ort / Abschnitt"
            placeholderTextColor="#B8C1CC"
          />

          <Text style={s.label}>LV Position</Text>
          <TextInput
            value={String(row.lvItemPos || "")}
            onChangeText={(v) => updateRow({ lvItemPos: v })}
            style={s.input}
            placeholder="z.B. 01.02.0001"
            placeholderTextColor="#B8C1CC"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Material</Text>
              <TextInput
                value={String(row.material || "")}
                onChangeText={(v) => updateRow({ material: v })}
                style={s.input}
                placeholder="z.B. Rohr DN150"
                placeholderTextColor="#B8C1CC"
                
              />
            </View>
            <View style={{ width: 120 }}>
              <Text style={s.label}>Einheit</Text>
              <TextInput
                value={String(row.unit || "")}
                onChangeText={(v) => updateRow({ unit: v })}
                style={s.input}
                placeholder="m / Stk"
                placeholderTextColor="#B8C1CC"
              />
            </View>
          </View>

          <Text style={s.label}>Menge</Text>
          <TextInput
            value={String(row.quantity ?? "")}
            onChangeText={(v) => updateRow({ quantity: v })}
            style={s.input}
            keyboardType="decimal-pad"
            placeholder="z.B. 12"
            placeholderTextColor="#B8C1CC"
          />

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
            <Text style={s.sectionH}>Anhänge</Text>
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
          onOpenPdf={onOpenPdf}
          onEmailPdf={onEmailPdf}
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

                <ScrollView
                  style={{ marginTop: 10, maxHeight: 360 }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  <Text selectable style={s.modalBody}>
                    {kiSuggestion?.suggestion
                      ? safeStringify(kiSuggestion.suggestion)
                      : kiSuggestion?.raw
                      ? safeStringify(kiSuggestion.raw)
                      : "Kein Vorschlag verfügbar."}
                  </Text>
                </ScrollView>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    style={[s.modalBtn, { flex: 1 }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      applyKiSuggestion();
                    }}
                    disabled={!kiSuggestion?.suggestion}
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
              </>
            )}

            {kiBusy ? (
              <Pressable style={s.modalBtn} onPress={() => {
                      Keyboard.dismiss();
                      setKiOpen(false);
                    }}>
                <Text style={s.modalBtnTxt}>Schließen</Text>
              </Pressable>
            ) : null}
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
                <Text style={s.modalMuted}>
                  {pdfMeta?.fileName || "PDF bereit"}
                </Text>

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

  sectionTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 4,
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

  muted: { color: COLORS.sub, fontWeight: "700" },
  mutedSmall: {
    color: COLORS.sub,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },

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
    backgroundColor: COLORS.accentSoft,
  },
  attFile: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  attFileTxt: { color: COLORS.accent, fontWeight: "900" },
  attName: { color: COLORS.text, fontWeight: "900" },
  attUri: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 2,
  },
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
  attDelTxt: { color: COLORS.danger, fontWeight: "900" },

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
    marginTop: 0,
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

























