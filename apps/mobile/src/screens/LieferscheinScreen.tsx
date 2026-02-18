// apps/mobile/src/screens/LieferscheinScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { api, looksLikeProjectCode } from "../lib/api";

// ✅ PDF Exporter + Mail (unificato come EingangPruefung)
import {
  exportLieferscheinPdfToProject,
  emailPdf,
} from "../lib/exporters/projectExport";

// ✅ Offline Queue
import { queueAdd } from "../lib/offlineQueue";

// ✅ Action bar (stessa UI)
import { DocActionBar } from "../components/DocActionBar";

type Props = NativeStackScreenProps<RootStackParamList, "Lieferschein">;

const KEY_MODE = "rlc_mobile_mode";

// ✅ per-projekt meta (Pflichtfelder)
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

// Inbox keys (compat) — IMPORTANT: devono essere “prevedibili” per Eingangsprüfung/Inbox
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

  // ✅ Pflichtfelder (offline policy)
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

  // attachments pool
  attachments?: DateiMeta[];

  workflowStatus?: "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";
  createdAt?: number;
  updatedAt?: number;

  syncStatus?: string;
  syncError?: string;
};

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
  return `local-${projectIdFallback || "unknown"}`;
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

/** ✅ Build a stable text context for KI (no fantasy, only user data) */
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

/** ✅ Normalize KI server responses to one shape for UI */
function normalizeKiResultLs(raw: any) {
  const suggestions = Array.isArray(raw?.suggestions)
    ? raw.suggestions
    : Array.isArray(raw?.data?.suggestions)
    ? raw.data.suggestions
    : Array.isArray(raw?.result?.suggestions)
    ? raw.result.suggestions
    : null;

  const first = suggestions?.[0] || null;

  const direct =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw.fieldPatches || raw.extractedFields || raw.patch || raw.fields)
      ? raw
      : raw?.data &&
        typeof raw.data === "object" &&
        !Array.isArray(raw.data) &&
        (raw.data.fieldPatches ||
          raw.data.extractedFields ||
          raw.data.patch ||
          raw.data.fields)
      ? raw.data
      : raw?.result &&
        typeof raw.result === "object" &&
        !Array.isArray(raw.result) &&
        (raw.result.fieldPatches ||
          raw.result.extractedFields ||
          raw.result.patch ||
          raw.result.fields)
      ? raw.result
      : null;

  const suggestion =
    first ||
    raw?.suggestion ||
    raw?.data?.suggestion ||
    raw?.result?.suggestion ||
    direct ||
    null;

  const errorObj = raw?.error
    ? raw
    : raw?.data?.error
    ? raw.data
    : raw?.result?.error
    ? raw.result
    : raw?.data
    ? raw.data
    : raw?.result
    ? raw.result
    : null;

  const notes =
    String(
      suggestion?.notes ||
        raw?.notes ||
        raw?.data?.notes ||
        raw?.result?.notes ||
        ""
    ) || (errorObj ? JSON.stringify(errorObj, null, 2) : "");

  return { suggestion, notes: notes || "", raw };
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

// ✅ simple validators
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

export default function LieferscheinScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title, editId } = route.params as any;

  // ✅ policy: projectId = UUID; projectCode = FS-key (BA-...)
  const projectIdOrFallback = String(projectId || "").trim();
  const projectCodeFs = String(projectCode || "").trim();

  // projectCode in navigation è FS-key (BA-... o local-...)
  const projectFsKey = useMemo(
    () => normalizeProjectKey(projectCodeFs, projectIdOrFallback),
    [projectCodeFs, projectIdOrFallback]
  );

  // ✅ FIX (server policy): per LS usare sempre FS-key (project.code / BA-...), non UUID
  const projectIdForServer = useMemo(() => {
    return projectFsKey;
  }, [projectFsKey]);

  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [submitting, setSubmitting] = useState(false);

  const [row, setRow] = useState<LieferscheinRow>(() => ({
    id: editId ? String(editId) : uid("ls"),
    date: ymdNow(),

    // ✅ Pflichtfelder defaults (filled from project meta on load)
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
  }));

  const [list, setList] = useState<LieferscheinRow[]>([]);
  const loadLock = useRef(0);

  // ✅ PDF Vorschau Modal
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<{
    pdfUri?: string;
    fileName?: string;
    date?: string;
  } | null>(null);

  // ✅ KI Modal
  const [kiOpen, setKiOpen] = useState(false);
  const [kiBusy, setKiBusy] = useState(false);
  const [kiSuggestion, setKiSuggestion] = useState<any>(null);

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
    const keys = lieferscheinInboxKeys(projectFsKey);
    const primaryKey = keys[0];
    const arr = await loadArrayFromFirstKey(keys);
    const lst = Array.isArray(arr) ? (arr as LieferscheinRow[]) : [];
    const idx = lst.findIndex((x) => String(x.id) === String(nextRow.id));
    if (idx >= 0) lst[idx] = nextRow;
    else lst.unshift(nextRow);

    lst.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    await setJson(primaryKey, lst);
    setList(lst);
  }

  const loadInboxList = useCallback(async () => {
    const my = ++loadLock.current;
    try {
      const arr = await loadArrayFromFirstKey(lieferscheinInboxKeys(projectFsKey));
      const next = Array.isArray(arr) ? (arr as LieferscheinRow[]) : [];
      next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (my === loadLock.current) setList(next);

      if (editId) {
        const found = next.find((x) => String(x.id) === String(editId));
        if (found) setRow(found);
      }
    } catch (e: any) {
      Alert.alert(
        "Lieferschein",
        e?.message || "Inbox konnte nicht geladen werden."
      );
    }
  }, [projectFsKey, editId]);

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
      // update row first (instant UI)
      setRow((r) => ({ ...r, ...patch, updatedAt: Date.now() } as any));
      // persist per project
      await saveProjectMeta(projectFsKey, patch);
    },
    [projectFsKey]
  );

  const addAttachment = useCallback(async () => {
    Alert.alert("Anhang hinzufügen", "Was möchtest du hinzufügen?", [
      {
        text: "📷 Kamera",
        onPress: async () => {
          const f = await takePhotoWithCamera();
          if (!f) return;
          setRow((r) => ({
            ...r,
            attachments: [...(r.attachments || []), f],
            updatedAt: Date.now(),
          }));
        },
      },
      {
        text: "🖼️ Galerie",
        onPress: async () => {
          const f = await pickImageFromLibrary();
          if (!f) return;
          setRow((r) => ({
            ...r,
            attachments: [...(r.attachments || []), f],
            updatedAt: Date.now(),
          }));
        },
      },
      {
        text: "📎 Datei",
        onPress: async () => {
          const f = await pickFile();
          if (!f) return;
          setRow((r) => ({
            ...r,
            attachments: [...(r.attachments || []), f],
            updatedAt: Date.now(),
          }));
        },
      },
      { text: "Abbrechen", style: "cancel" },
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setRow((r) => ({
      ...r,
      attachments: (r.attachments || []).filter(
        (x) => String(x.id || "") !== String(id)
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  // ✅ SAVE OFFLINE (blocked if Pflichtfelder missing)
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
      };
      await persistToInbox(next);
      Alert.alert("Gespeichert", "Lieferschein wurde offline gespeichert.");
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || "Speichern fehlgeschlagen.");
    }
  }, [row, projectFsKey]);

  // ✅ EINREICHEN (blocked if Pflichtfelder missing)
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
      };

      // 1) immer in Inbox
      await persistToInbox(next);

      // 2) Queue nur in SERVER_SYNC + nur wenn BA-...
      if (mode === "SERVER_SYNC" && looksLikeProjectCode(projectFsKey)) {
        const files = mergeAttachmentsForPdf(next);

        await queueAdd({
          kind: "LIEFERSCHEIN",
          // ✅ FIX: server expects FS-key, not UUID
          projectId: projectIdForServer,
          payload: {
            date: fixedDate,
            text: String(next.bemerkungen || ""),
            row: next,
            files,
            projectCode: projectFsKey,
            projectFsKey,

            // ✅ Pflichtfelder
            baustellenNummer: String(next.baustellenNummer || ""),
            bauleiterEmail: String(next.bauleiterEmail || ""),

            // ✅ normalized duplicates for server/export
            supplier: String(next.lieferant || ""),
            driver: String(next.fahrer || ""),
            site: String(next.baustelle || ""),
            quantity: next.quantity,
            qty: next.quantity,
          },
        });
      }

      Alert.alert(
        "Einreichen",
        "In Inbox gespeichert. Sync/Queue erfolgt über Inbox → Sync."
      );
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Einreichen", e?.message || "Einreichen fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }, [row, mode, projectFsKey, projectIdForServer, navigation]);

  // ✅ exporter-row per PDF
  const makeRowForExporter = useCallback(() => {
    const files = mergeAttachmentsForPdf(row);
    const fixedDate = safeDateOrNow(row.date);

    // ✅ Normalizza naming per exporter/server:
    // UI usa: lieferant/fahrer/baustelle/quantity
    // exporter legge spesso: supplier/driver/site/qty
    const rowForExport: any = {
      ...row,
      date: fixedDate,

      supplier: String((row as any).supplier || row.lieferant || ""),
      driver: String((row as any).driver || row.fahrer || ""),
      site: String((row as any).site || row.baustelle || ""),

      qty: (row as any).qty ?? row.quantity ?? "",
      unit: (row as any).unit ?? row.unit ?? "",

      // attachments pool coerente
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
    // ✅ if Pflichtfelder missing, block email too (because mail needs Bauleiter)
    if (!requirePflichtfelderOrAlert(projectFsKey, row)) return;

    const out = await buildPdf();

    // ✅ FIX: allega solo file locali (evita crash/errore se undefined o non file://)
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
      setRow(x);
      // also persist Pflichtfelder if present (keep project meta consistent)
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

      // keep Pflichtfelder from current/project meta (do not wipe)
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

  // ✅ KI: OCR/Extraction
  const onKiSuggest = useCallback(async () => {
    try {
      setKiOpen(true);
      setKiBusy(true);
      setKiSuggestion(null);

      const fn =
        (api as any)?.kiLieferscheinSuggest ||
        (api as any)?.kiSuggestLieferschein ||
        (api as any)?.kiSuggest ||
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

      const attachments = mergeAttachmentsForPdf(row);
      const hasFiles = attachments.length > 0;

      let visionFileIds: string[] = [];
      let visionUploadRaw: any = null;

      if (hasFiles) {
        const up = await uploadVisionFilesIfPossible(projectFsKey, attachments);
        visionFileIds = up.ids || [];
        visionUploadRaw = up.raw || null;
      }

      const ocrOk =
        hasFiles && Array.isArray(visionFileIds) && visionFileIds.length > 0;
      const strict = ocrOk ? false : true;

      const payload: any = {
        kind: "LIEFERSCHEIN",
        // ✅ FIX: keep consistent with server FS-key policy
        projectId: projectIdForServer,
        projectCode: projectFsKey,
        projectFsKey,
        date: safeDateOrNow(row.date),

        text: buildKiTextFromRowLs(row),
        row,

        attachments,
        visionFileIds,

        ocr: ocrOk,
        allowOcr: ocrOk,
        enableOcr: ocrOk,
        useOcr: ocrOk,

        fileIds: visionFileIds,
        file_ids: visionFileIds,
        vision_file_ids: visionFileIds,

        strict,

        _client: {
          hasFiles,
          ocrOk,
          visionFileIdsCount: visionFileIds.length,
        },
      };

      let rawRes: any;
      try {
        rawRes =
          typeof fn === "function" && fn.length >= 2
            ? await fn(projectFsKey, payload)
            : await fn(payload);
      } catch (e1) {
        rawRes =
          typeof fn === "function" && fn.length >= 2
            ? await fn(projectFsKey, { ...payload, row })
            : await fn({ ...payload, row });
      }

      if (rawRes && typeof rawRes === "object") {
        (rawRes as any)._clientDebug = {
          hasFiles,
          ocrOk,
          visionFileIds,
          visionUploadOk: !!(visionFileIds && visionFileIds.length),
        };

        if (hasFiles) {
          (rawRes as any)._visionUpload = visionUploadRaw
            ? { ok: true, raw: visionUploadRaw }
            : { ok: false };
          (rawRes as any)._sent = {
            hasFiles,
            ocrOk,
            visionFileIdsCount: visionFileIds.length,
            visionFileIds,
          };
        }
      }

      setKiSuggestion(normalizeKiResultLs(rawRes));
    } catch (e: any) {
      setKiSuggestion(
        normalizeKiResultLs({ error: { message: e?.message || "KI Fehler" } })
      );
    } finally {
      setKiBusy(false);
    }
  }, [projectFsKey, row, projectIdForServer]);

  const applyKiSuggestion = useCallback(() => {
    try {
      const sug = kiSuggestion?.suggestion || null;

      let fp: any =
        sug?.fieldPatches ||
        sug?.extractedFields ||
        sug?.patch ||
        sug?.fields ||
        null;

      if (!fp) {
        Alert.alert("KI", "Kein FieldPatch vorhanden.");
        return;
      }

      const toFlatObject = (input: any): Record<string, any> => {
        if (!input) return {};
        if (typeof input === "object" && !Array.isArray(input)) return input;

        if (Array.isArray(input)) {
          const out: Record<string, any> = {};
          for (const p of input) {
            if (!p) continue;
            const path = typeof p.path === "string" ? p.path : "";
            if (path) {
              const k = path.replace(/^\//, "").trim();
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
        Alert.alert("KI", "FieldPatch ist leer oder unbekanntes Format.");
        return;
      }

      const sstr = (v: any) => String(v ?? "").trim();
      const has = (v: any) => sstr(v).length > 0;

      const toNumber = (v: any) => {
        if (v == null) return null;
        if (typeof v === "number" && Number.isFinite(v)) return v;
        const raw = String(v).trim();
        if (!raw) return null;
        let x = raw.replace(/\s/g, "");
        if (x.includes(".") && x.includes(","))
          x = x.replace(/\./g, "").replace(",", ".");
        else x = x.replace(",", ".");
        const n = Number(x);
        return Number.isFinite(n) ? n : null;
      };

      setRow((r) => {
        const next: LieferscheinRow = { ...r };

        const dateVal = (fp as any)?.datum ?? (fp as any)?.date;
        if (has(dateVal)) {
          const dv = sstr(dateVal);
          const m = dv.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
          next.date = m ? `${m[3]}-${m[2]}-${m[1]}` : safeDateOrNow(dv);
        }

        // allow KI to fill Pflichtfelder too (optional)
        const bn =
          (fp as any)?.baustellenNummer ??
          (fp as any)?.baustelleNr ??
          (fp as any)?.baustellen_nr;
        if (has(bn)) next.baustellenNummer = sstr(bn);

        const bl =
          (fp as any)?.bauleiterEmail ??
          (fp as any)?.bauleiter_email ??
          (fp as any)?.bauleiter;
        if (has(bl)) next.bauleiterEmail = sstr(bl);

        const lsNum =
          (fp as any)?.lsNr ??
          (fp as any)?.lieferscheinNr ??
          (fp as any)?.lieferscheinNummer ??
          (fp as any)?.lieferschein_nummer ??
          (fp as any)?.bonNr ??
          (fp as any)?.bon_nr ??
          (fp as any)?.bon;

        if (has(lsNum)) next.lieferscheinNummer = sstr(lsNum);

        if (has((fp as any)?.lieferant)) next.lieferant = sstr((fp as any).lieferant);
        if (has((fp as any)?.baustelle)) next.baustelle = sstr((fp as any).baustelle);
        if (has((fp as any)?.fahrer)) next.fahrer = sstr((fp as any).fahrer);

        if (has((fp as any)?.kostenstelle))
          next.kostenstelle = sstr((fp as any).kostenstelle);

        const lv =
          (fp as any)?.lvPosition ??
          (fp as any)?.lvItemPos ??
          (fp as any)?.lvPos ??
          (fp as any)?.lv_pos ??
          (fp as any)?.lv_item_pos;
        if (has(lv)) next.lvItemPos = sstr(lv);

        if (has((fp as any)?.material)) next.material = sstr((fp as any).material);

        const q = (fp as any)?.menge ?? (fp as any)?.quantity ?? (fp as any)?.qty ?? (fp as any)?.amount;
        const qn = toNumber(q);
        if (qn != null) next.quantity = String(qn);

        const u = (fp as any)?.einheit ?? (fp as any)?.unit;
        if (has(u)) next.unit = sstr(u);

        const b =
          (fp as any)?.bemerkungen ??
          (fp as any)?.textBeschreibung ??
          (fp as any)?.beschreibung ??
          (fp as any)?.text;
        if (has(b)) next.bemerkungen = sstr(b);

        next.updatedAt = Date.now();
        return next;
      });

      // persist Pflichtfelder if filled
      const bn2 = String((fp as any)?.baustellenNummer ?? "").trim();
      const bl2 = String((fp as any)?.bauleiterEmail ?? "").trim();
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
          {item.kostenstelle ? `KS: ${item.kostenstelle}` : "—"}
          {item.lvItemPos ? ` • LV: ${item.lvItemPos}` : ""}
          {item.baustellenNummer ? ` • BA: ${item.baustellenNummer}` : ""}
          {tsStr ? ` • ${tsStr}` : ""}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={s.safe}>
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

        {/* ✅ Actions row */}
        <View style={s.actionsRow}>
          <Pressable style={s.actionBtn} onPress={onKiSuggest} disabled={kiBusy}>
            <Text style={s.actionTxt}>{kiBusy ? "KI..." : "✨ KI"}</Text>
          </Pressable>

          <Pressable
            style={s.actionBtn}
            onPress={onPdfPreview}
            disabled={pdfBusy}
          >
            <Text style={s.actionTxt}>
              {pdfBusy ? "PDF..." : "📄 PDF Vorschau"}
            </Text>
          </Pressable>

          <View style={s.pill}>
            <Text style={s.pillTxt}>{projectFsKey}</Text>
          </View>
        </View>

        {/* ✅ Pflichtfelder (BLOCKING) */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Pflichtfelder</Text>

          <Text style={s.label}>BaustellenNummer</Text>
          <TextInput
            value={String(row.baustellenNummer || "")}
            onChangeText={(v) => updatePflichtfeld({ baustellenNummer: v })}
            style={s.input}
            placeholder="z.B. BA-12345"
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <Text style={s.label}>Bauleiter (E-Mail)</Text>
          <TextInput
            value={String(row.bauleiterEmail || "")}
            onChangeText={(v) => updatePflichtfeld({ bauleiterEmail: v })}
            style={s.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="bauleiter@firma.de"
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <Text style={s.mutedSmall}>
            Diese Felder werden pro Projekt gespeichert und sind offline Pflicht.
          </Text>
        </View>

        {/* ✅ Hauptdaten */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Lieferschein Daten</Text>

          <Text style={s.label}>Datum</Text>
          <TextInput
            value={String(row.date || "")}
            onChangeText={(v) => updateRow({ date: v })}
            style={s.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Lieferschein-Nr.</Text>
              <TextInput
                value={String(row.lieferscheinNummer || "")}
                onChangeText={(v) => updateRow({ lieferscheinNummer: v })}
                style={s.input}
                placeholder="z.B. LS-123"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Kostenstelle</Text>
              <TextInput
                value={String(row.kostenstelle || "")}
                onChangeText={(v) => updateRow({ kostenstelle: v })}
                style={s.input}
                placeholder="z.B. KS-01"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Fahrer / Mitarbeiter</Text>
              <TextInput
                value={String(row.fahrer || "")}
                onChangeText={(v) => updateRow({ fahrer: v })}
                style={s.input}
                placeholder="Name"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
          </View>

          <Text style={s.label}>Baustelle</Text>
          <TextInput
            value={String(row.baustelle || "")}
            onChangeText={(v) => updateRow({ baustelle: v })}
            style={s.input}
            placeholder="Ort / Abschnitt"
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <Text style={s.label}>LV Position</Text>
          <TextInput
            value={String(row.lvItemPos || "")}
            onChangeText={(v) => updateRow({ lvItemPos: v })}
            style={s.input}
            placeholder="z.B. 01.02.0001"
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Material</Text>
              <TextInput
                value={String(row.material || "")}
                onChangeText={(v) => updateRow({ material: v })}
                style={s.input}
                placeholder="z.B. Rohr DN150"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ width: 120 }}>
              <Text style={s.label}>Einheit</Text>
              <TextInput
                value={String(row.unit || "")}
                onChangeText={(v) => updateRow({ unit: v })}
                style={s.input}
                placeholder="m / Stk"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <Text style={s.label}>Bemerkungen</Text>
          <TextInput
            value={String(row.bemerkungen || "")}
            onChangeText={(v) => updateRow({ bemerkungen: v })}
            style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
            placeholder="Notizen…"
            placeholderTextColor="rgba(255,255,255,0.45)"
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

      {/* ✅ KI Modal */}
      <Modal
        visible={kiOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setKiOpen(false)}
      >
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalH}>✨ KI Vorschlag</Text>

            {kiBusy ? (
              <Text style={s.modalMuted}>KI läuft…</Text>
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
                    onPress={applyKiSuggestion}
                    disabled={!kiSuggestion?.suggestion}
                  >
                    <Text style={s.modalBtnTxt}>Füllen</Text>
                  </Pressable>

                  <Pressable
                    style={[s.modalBtn, { flex: 1 }]}
                    onPress={() => setKiOpen(false)}
                  >
                    <Text style={s.modalBtnTxt}>Schließen</Text>
                  </Pressable>
                </View>
              </>
            )}

            {kiBusy ? (
              <Pressable style={s.modalBtn} onPress={() => setKiOpen(false)}>
                <Text style={s.modalBtnTxt}>Schließen</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ✅ PDF Vorschau Modal */}
      <Modal
        visible={pdfOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPdfOpen(false)}
      >
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalH}>📄 PDF Vorschau</Text>

            {pdfBusy ? (
              <Text style={s.modalMuted}>PDF wird erstellt…</Text>
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
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  wrap: { padding: 16, paddingBottom: 30, gap: 12 },

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
  h2: { color: "rgba(255,255,255,0.75)", fontWeight: "800", marginTop: -6 },

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
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  actionTxt: { color: "#fff", fontWeight: "900" },

  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillTxt: { color: "rgba(255,255,255,0.9)", fontWeight: "900", fontSize: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 10,
  },

  sectionTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 4,
  },

  label: { color: "rgba(255,255,255,0.78)", fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontWeight: "800",
  },
  grid2: { flexDirection: "row", gap: 10 },

  section: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 12,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionH: { color: "#fff", fontWeight: "900", fontSize: 16 },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  smallBtnTxt: { color: "#fff", fontWeight: "900" },

  muted: { color: "rgba(255,255,255,0.65)", fontWeight: "700" },
  mutedSmall: {
    color: "rgba(255,255,255,0.65)",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },

  attCard: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attImg: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  attFile: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  attFileTxt: { color: "#fff", fontWeight: "900" },
  attName: { color: "#fff", fontWeight: "900" },
  attUri: {
    color: "rgba(255,255,255,0.65)",
    fontWeight: "700",
    marginTop: 2,
  },
  attDel: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  attDelTxt: { color: "#fff", fontWeight: "900" },

  histCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },
  histTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  histTitle: { color: "#fff", fontWeight: "900", flex: 1 },
  histSub: { color: "rgba(255,255,255,0.70)", fontWeight: "800" },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.20)",
    alignSelf: "flex-start",
  },
  badgeTxt: { fontSize: 11, fontWeight: "900" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 14,
  },
  modalCard: {
    width: "100%",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#0B1720",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalH: { color: "#fff", fontWeight: "900", fontSize: 18 },
  modalMuted: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: "800",
    marginTop: 6,
  },
  modalBody: {
    marginTop: 0,
    color: "rgba(255,255,255,0.85)",
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
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalBtnTxt: { color: "#fff", fontWeight: "900" },
});
