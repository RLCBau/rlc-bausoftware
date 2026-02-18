// apps/mobile/src/screens/RegieScreen.tsx
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

// ✅ Unified PDF model (same layout for all)
import { exportRegiePdfToProject, emailPdf } from "../lib/exporters/projectExport";

// ✅ Offline Queue
import { queueAdd } from "../lib/offlineQueue";

// ✅ Action bar
import { DocActionBar } from "../components/DocActionBar";

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

// ✅ doc type (server has 3 checkboxes)
export type RegieDocType = "REGIE" | "TAGESBERICHT" | "BAUTAGEBUCH";

function docTypeLabel(t?: RegieDocType) {
  if (t === "TAGESBERICHT") return "Tagesbericht";
  if (t === "BAUTAGEBUCH") return "Bautagebuch";
  return "Regiebericht";
}

function docTypeShort(t?: RegieDocType) {
  if (t === "TAGESBERICHT") return "TB";
  if (t === "BAUTAGEBUCH") return "BB";
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
    photos?: DateiMeta[]; // (bleibt im Model, UI-Button entfernt)
  }>;

  attachments?: DateiMeta[]; // ✅ Projekt-Pool Anhänge (Quelle für PDF)

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
  return `local-${projectIdFallback || "unknown"}`;
}

function toDateInput(v: any) {
  const s = String(v || "");
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

function normalizeFiles(input: any[]): DateiMeta[] {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .filter(Boolean)
    .map((f) => ({
      id: f?.id || uid("f"),
      uri: f?.uri || f?.url || f?.path,
      type: f?.type || f?.mime || f?.mimeType,
      name: f?.name || f?.filename,
    }))
    .filter((x) => !!x.uri);
}

/**
 * ✅ PDF: NUR aus Projekt-Anhängen (damit es immer funktioniert wie von dir beschrieben)
 */
function mergeAllPhotosForPdf(row: RegieRow): DateiMeta[] {
  return normalizeFiles(row.attachments || []);
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

function normalizeDocType(v: any): RegieDocType {
  const s = String(v || "").toUpperCase().trim();
  if (s === "TAGESBERICHT") return "TAGESBERICHT";
  if (s === "BAUTAGEBUCH") return "BAUTAGEBUCH";
  return "REGIE";
}

/** ✅ KI text context (nur echte Felder, keine Fantasie) */
function buildKiTextFromRow(r: RegieRow) {
  const headerBits: string[] = [];
  if (r.kostenstelle)
    headerBits.push(`Kostenstelle: ${String(r.kostenstelle)}`);
  if (r.wetter) headerBits.push(`Wetter: ${String(r.wetter)}`);
  if (r.arbeitsbeginn)
    headerBits.push(`Arbeitsbeginn: ${String(r.arbeitsbeginn)}`);
  if (r.arbeitsende)
    headerBits.push(`Arbeitsende: ${String(r.arbeitsende)}`);
  if (r.pause1) headerBits.push(`Pause1: ${String(r.pause1)}`);
  if (r.pause2) headerBits.push(`Pause2: ${String(r.pause2)}`);

  const lines = Array.isArray(r.rows) ? r.rows : [];
  const lineBits = lines
    .map((l, i) => {
      const bits: string[] = [];
      if (l?.kostenstelle) bits.push(`KS: ${String(l.kostenstelle)}`);
      if (l?.worker) bits.push(`Mitarbeiter: ${String(l.worker)}`);
      if (l?.machine) bits.push(`Maschine: ${String(l.machine)}`);
      if (l?.hours != null && String(l.hours).trim() !== "")
        bits.push(`Std: ${String(l.hours)}`);
      if (l?.material) bits.push(`Material: ${String(l.material)}`);
      if (l?.quantity != null && String(l.quantity).trim() !== "")
        bits.push(`Menge: ${String(l.quantity)}`);
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

/** ✅ Normalize KI server responses to one shape for UI */
function normalizeKiResult(raw: any) {
  const suggestions = Array.isArray(raw?.suggestions)
    ? raw.suggestions
    : Array.isArray(raw?.data?.suggestions)
    ? raw.data.suggestions
    : Array.isArray(raw?.result?.suggestions)
    ? raw.result.suggestions
    : null;

  const first = suggestions?.[0] || raw?.suggestion || raw?.data?.suggestion || null;

  const errorObj = raw?.error ? raw : raw?.data?.error ? raw.data : null;

  const notes =
    String(first?.notes || raw?.notes || "") ||
    (errorObj ? JSON.stringify(errorObj, null, 2) : "");

  return {
    suggestion: first,
    notes: notes || "",
    raw,
  };
}

/**
 * ✅ Read one Regie inbox doc from SERVER if it isn't in local AsyncStorage.
 * Endpoint: GET /api/regie/inbox/read?projectId=BA-...&docId=...
 * Returns { snapshot } OR snapshot directly.
 */
async function serverReadRegieInbox(projectFsKey: string, docId: string) {
  const token = await AsyncStorage.getItem("auth_token");

  // base dinamico: usa api.getApiUrl() se esiste, altrimenti api.apiUrl
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

/**
 * ✅ FIX: normalize server snapshot shapes to RegieRow
 * Supports shapes:
 * - { payload: { row: {...}, files/attachments/... } }
 * - { row: {...} }
 * - already RegieRow
 */
function normalizeServerRegieSnapshot(snapRaw: any, editId: string): RegieRow | null {
  if (!snapRaw || typeof snapRaw !== "object") return null;

  const payload = (snapRaw as any)?.payload;
  const rowFromPayload = payload?.row;
  const rowFromDirect = (snapRaw as any)?.row;

  const base: any =
    (rowFromPayload && typeof rowFromPayload === "object" && rowFromPayload) ||
    (rowFromDirect && typeof rowFromDirect === "object" && rowFromDirect) ||
    snapRaw;

  // attachments can live in multiple places depending on server
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
      : [
          {
            kostenstelle: "",
            machine: "",
            worker: "",
            hours: "",
            comment: "",
            material: "",
            quantity: "",
            unit: "",
            photos: [],
          },
        ];

  const dt = normalizeDocType(base?.docType ?? payload?.docType ?? "REGIE");

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

  // Ensure string fields exist
  out.arbeitsbeginn = String(out.arbeitsbeginn || "");
  out.arbeitsende = String(out.arbeitsende || "");
  out.pause1 = String(out.pause1 || "");
  out.pause2 = String(out.pause2 || "");
  out.wetter = String(out.wetter || "");
  out.kostenstelle = String(out.kostenstelle || "");
  out.bemerkungen = String(out.bemerkungen || "");

  return out;
}

export default function RegieScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title, editId } = route.params as any;
  const fromInbox = Boolean((route.params as any)?.fromInbox);

  const projectFsKey = useMemo(
    () => normalizeProjectKey(String(projectCode || ""), String(projectId || "")),
    [projectCode, projectId]
  );

  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [submitting, setSubmitting] = useState(false);

  const [authToken, setAuthToken] = useState<string>("");

  const [row, setRow] = useState<RegieRow>(() => ({
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
    rows: [
      {
        kostenstelle: "",
        machine: "",
        worker: "",
        hours: "",
        comment: "",
        material: "",
        quantity: "",
        unit: "",
        photos: [],
      },
    ],
    attachments: [],
    workflowStatus: "DRAFT",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  const [list, setList] = useState<RegieRow[]>([]);
  const loadLock = useRef(0);

  const [kiOpen, setKiOpen] = useState(false);
  const [kiBusy, setKiBusy] = useState(false);
  const [kiSuggestion, setKiSuggestion] = useState<any>(null);

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

  const loadInboxList = useCallback(async () => {
    const my = ++loadLock.current;
    try {
      const arr = await loadArrayFromFirstKey(regieInboxKeys(projectFsKey));
      const next = (Array.isArray(arr) ? (arr as RegieRow[]) : []).map((x) => ({
        ...x,
        docType: normalizeDocType((x as any)?.docType),
        attachments: normalizeFiles((x as any)?.attachments || []),
        rows: Array.isArray((x as any)?.rows) && (x as any).rows.length ? (x as any).rows : (x as any)?.rows,
      }));

      next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (my === loadLock.current) setList(next);

      if (editId) {
        const found = next.find((x) => String(x.id) === String(editId));
        if (found) {
          setRow({
            ...found,
            docType: normalizeDocType((found as any)?.docType),
            rows:
              Array.isArray(found.rows) && found.rows.length
                ? found.rows
                : [
                    {
                      kostenstelle: "",
                      machine: "",
                      worker: "",
                      hours: "",
                      comment: "",
                      material: "",
                      quantity: "",
                      unit: "",
                      photos: [],
                    },
                  ],
            attachments: normalizeFiles(found.attachments || []),
          });
        } else if (
          fromInbox &&
          mode === "SERVER_SYNC" &&
          looksLikeProjectCode(projectFsKey)
        ) {
          // ✅ fallback: leggere dal SERVER inbox se non esiste localmente
          try {
            const snap = await serverReadRegieInbox(projectFsKey, String(editId));
            const fixed = normalizeServerRegieSnapshot(snap, String(editId));

            if (fixed) {
              setRow(fixed);

              // ✅ save to local inbox so it opens next time too
              await persistToInbox({
                ...fixed,
                workflowStatus: (fixed.workflowStatus as any) || "EINGEREICHT",
                updatedAt: Date.now(),
                createdAt: fixed.createdAt || Date.now(),
              });
            }
          } catch {
            // silent fallback
          }
        }
      }
    } catch (e: any) {
      Alert.alert("Regie", e?.message || "Inbox konnte nicht geladen werden.");
    }
  }, [projectFsKey, editId, fromInbox, mode]);

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
      lines.push({
        kostenstelle: "",
        machine: "",
        worker: "",
        hours: "",
        comment: "",
        material: "",
        quantity: "",
        unit: "",
        photos: [],
      });
      return { ...r, rows: lines, updatedAt: Date.now() };
    });
  }, []);

  const removeLine = useCallback((idx: number) => {
    setRow((r) => {
      const lines = Array.isArray(r.rows) ? [...r.rows] : [];
      lines.splice(idx, 1);
      if (!lines.length) {
        lines.push({
          kostenstelle: "",
          machine: "",
          worker: "",
          hours: "",
          comment: "",
          material: "",
          quantity: "",
          unit: "",
          photos: [],
        });
      }
      return { ...r, rows: lines, updatedAt: Date.now() };
    });
  }, []);

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

  const onSaveOffline = useCallback(async () => {
    try {
      const next: RegieRow = {
        ...row,
        id: String(row.id || uid("regie")),
        date: toDateInput(row.date) || ymdNow(),
        docType: normalizeDocType(row.docType),
        workflowStatus: row.workflowStatus || "DRAFT",
        createdAt: row.createdAt || Date.now(),
        updatedAt: Date.now(),
        attachments: normalizeFiles(row.attachments || []),
        rows:
          Array.isArray(row.rows) && row.rows.length
            ? row.rows
            : [
                {
                  kostenstelle: "",
                  machine: "",
                  worker: "",
                  hours: "",
                  comment: "",
                  material: "",
                  quantity: "",
                  unit: "",
                  photos: [],
                },
              ],
      };
      await persistToInbox(next);
      Alert.alert("Gespeichert", `${docTypeLabel(next.docType)} wurde offline gespeichert.`);
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
        docType: normalizeDocType(row.docType),
        workflowStatus: "EINGEREICHT",
        createdAt: row.createdAt || Date.now(),
        updatedAt: Date.now(),
        attachments: normalizeFiles(row.attachments || []),
        rows:
          Array.isArray(row.rows) && row.rows.length
            ? row.rows
            : [
                {
                  kostenstelle: "",
                  machine: "",
                  worker: "",
                  hours: "",
                  comment: "",
                  material: "",
                  quantity: "",
                  unit: "",
                  photos: [],
                },
              ],
      };

      await persistToInbox(next);

      // ✅ Server queue only in SERVER_SYNC and only if BA-...
      if (mode === "SERVER_SYNC" && looksLikeProjectCode(projectFsKey)) {
        await queueAdd({
          kind: "REGIE",
          projectId: projectFsKey, // FS-key policy
          payload: {
            docType: next.docType,
            date: next.date,
            text: String(next?.rows?.[0]?.comment || next?.bemerkungen || ""),
            hours: (next?.rows?.[0]?.hours as any) ?? undefined,
            note: String(next.bemerkungen || ""),
            row: next,
          },
        } as any);
      }

      Alert.alert("Einreichen", "In Inbox gespeichert. Sync/Queue erfolgt über Inbox → Sync.");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Einreichen", e?.message || "Einreichen fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }, [row, mode, projectFsKey, navigation]);

  // ✅ Build exporter-row (queue-style) so PDF includes files + docType
  const makeRowForExporter = useCallback(() => {
    const files = mergeAllPhotosForPdf(row);
    const dt = normalizeDocType(row.docType);

    return {
      kind: "REGIE",
      payload: {
        docType: dt,
        date: String(toDateInput(row.date) || ymdNow()),
        text: String(row?.rows?.[0]?.comment || row?.bemerkungen || ""),
        hours: (row?.rows?.[0]?.hours as any) ?? undefined,
        note: String(row?.bemerkungen || ""),
        files,
        row: { ...row, docType: dt },
      },
    };
  }, [row]);

  const buildPdf = useCallback(async () => {
    const dt = normalizeDocType(row.docType);
    const out = await exportRegiePdfToProject({
      projectFsKey,
      projectTitle: String(title || "Projekt"),
      filenameHint: `${docTypeLabel(dt)}_${toDateInput(row.date) || ymdNow()}`,
      row: makeRowForExporter(),
    });
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
    const dt = normalizeDocType(row.docType);
    const out = await buildPdf();

    const att =
      Platform.OS === "web"
        ? []
        : [out.pdfUri].filter((u) => String(u || "").startsWith("file://"));

    await emailPdf({
      subject: out.fileName,
      body: `${docTypeLabel(dt)} ${projectFsKey} (${out.date})`,
      attachments: att as any,
    });
  }, [buildPdf, projectFsKey, row.docType]);

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
      const fixed = { ...x, docType: normalizeDocType((x as any)?.docType) };
      navigation.setParams?.({ editId: fixed.id, fromInbox: true } as any);
      setRow({
        ...fixed,
        rows:
          Array.isArray(fixed.rows) && fixed.rows.length
            ? fixed.rows
            : [
                {
                  kostenstelle: "",
                  machine: "",
                  worker: "",
                  hours: "",
                  comment: "",
                  material: "",
                  quantity: "",
                  unit: "",
                  photos: [],
                },
              ],
        attachments: normalizeFiles(fixed.attachments || []),
      });
    },
    [navigation]
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
      rows: [
        {
          kostenstelle: "",
          machine: "",
          worker: "",
          hours: "",
          comment: "",
          material: "",
          quantity: "",
          unit: "",
          photos: [],
        },
      ],
      attachments: [],
      workflowStatus: "DRAFT",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, []);

  // ✅ KI: FIX - immer JSON-Objekt schicken (nicht "BA-..." als String)
  const onKiSuggest = useCallback(async () => {
    try {
      setKiOpen(true);
      setKiBusy(true);
      setKiSuggestion(null);

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

      const dt = normalizeDocType(row.docType);
      const payload = {
        projectId: projectFsKey,
        projectFsKey,
        docType: dt,
        date: String(toDateInput(row.date) || ymdNow()),
        text: buildKiTextFromRow(row),
        row: { ...row, docType: dt },
      };

      let res: any = null;

      // Versuch 1: (payload)
      try {
        if (fn.length <= 1) res = await fn(payload);
        else res = await fn(payload);
      } catch (e1: any) {
        // Versuch 2: (projectFsKey, payload)
        try {
          res = await fn(projectFsKey, payload);
        } catch (e2: any) {
          throw e2 || e1;
        }
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
  }, [projectFsKey, row]);

  // ✅ APPLY KI => "Füllen"
  const applyKiSuggestion = useCallback(() => {
    try {
      const sug = kiSuggestion?.suggestion;
      const patches = sug?.fieldPatches || sug?.fields || sug?.patches || null;
      if (!patches || typeof patches !== "object") {
        Alert.alert("KI", "Kein 'fieldPatches' gefunden.");
        return;
      }

      // ---- Header keys (support both German + internal keys)
      const headerPatch: Partial<RegieRow> = {};

      const ks = patches.kostenstelle ?? patches.kostenStelle ?? patches.ks ?? undefined;
      if (ks != null) headerPatch.kostenstelle = String(ks);

      const bemerk = patches.bemerkungen ?? patches.bemerkung ?? patches.note ?? undefined;
      if (bemerk != null) headerPatch.bemerkungen = String(bemerk);

      const ab = patches.arbeitsbeginn ?? patches.start ?? patches.von ?? undefined;
      if (ab != null) headerPatch.arbeitsbeginn = String(ab);

      const ae = patches.arbeitsende ?? patches.ende ?? patches.bis ?? undefined;
      if (ae != null) headerPatch.arbeitsende = String(ae);

      const p1 = patches.pause1 ?? patches.pause_1 ?? undefined;
      if (p1 != null) headerPatch.pause1 = String(p1);

      const p2 = patches.pause2 ?? patches.pause_2 ?? undefined;
      if (p2 != null) headerPatch.pause2 = String(p2);

      // ---- Line 1 patch
      const line0Patch: any = {};

      const cmt = patches.comment ?? patches.kommentar ?? patches.leistung ?? undefined;
      if (cmt != null) line0Patch.comment = String(cmt);

      const worker = patches.worker ?? patches.mitarbeiter ?? patches.person ?? undefined;
      if (worker != null) line0Patch.worker = String(worker);

      const machine = patches.machine ?? patches.maschinen ?? patches.geraet ?? undefined;
      if (machine != null) line0Patch.machine = String(machine);

      const material = patches.material ?? patches.materialien ?? undefined;
      if (material != null) line0Patch.material = String(material);

      const hours = patches.hours ?? patches.std ?? patches.stunden ?? undefined;
      if (hours != null && String(hours).trim() !== "") line0Patch.hours = hours;

      const unit = patches.unit ?? patches.einheit ?? undefined;
      if (unit != null) line0Patch.unit = String(unit);

      const lks = patches.lineKostenstelle ?? patches.kostenstelle_zeile ?? undefined;
      if (lks != null) line0Patch.kostenstelle = String(lks);

      setRow((r) => {
        const lines = Array.isArray(r.rows) ? [...r.rows] : [];
        if (!lines.length) lines.push({});
        lines[0] = { ...(lines[0] || {}), ...line0Patch };
        return { ...r, ...headerPatch, rows: lines, updatedAt: Date.now() };
      });

      Alert.alert("KI", "Felder wurden eingefüllt.");
      // Optional: modal schließen
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
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Maschine</Text>
              <TextInput
                value={String(l.machine || "")}
                onChangeText={(v) => updateLine(index, { machine: v })}
                style={s.input}
                placeholder="z.B. Bagger"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Mitarbeiter</Text>
              <TextInput
                value={String(l.worker || "")}
                onChangeText={(v) => updateLine(index, { worker: v })}
                style={s.input}
                placeholder="Name"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Material</Text>
              <TextInput
                value={String(l.material || "")}
                onChangeText={(v) => updateLine(index, { material: v })}
                style={s.input}
                placeholder="z.B. Rohr DN150"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Einheit</Text>
              <TextInput
                value={String(l.unit || "")}
                onChangeText={(v) => updateLine(index, { unit: v })}
                style={s.input}
                placeholder="m / Stk"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
          </View>

          <Text style={s.label}>Kommentar / Leistung</Text>
          <TextInput
            value={String(l.comment || "")}
            onChangeText={(v) => updateLine(index, { comment: v })}
            style={[s.input, { minHeight: 70, textAlignVertical: "top" }]}
            multiline
            placeholder="Beschreibung…"
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          {/* ❌ FOTO BUTTON ENTFERNT */}
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
    const dt = normalizeDocType((item as any)?.docType);

    return (
      <Pressable style={s.histCard} onPress={() => openFromHistory(item)}>
        <View style={s.histTop}>
          <Text style={s.histTitle} numberOfLines={1}>
            {docTypeShort(dt)} {String(item.date || "").slice(0, 10)} •{" "}
            {docTypeLabel(dt)}
          </Text>
          <View style={[s.badge, { borderColor: bc }]}>
            <Text style={[s.badgeTxt, { color: bc }]}>{badgeText(st)}</Text>
          </View>
        </View>
        <Text style={s.histSub} numberOfLines={2}>
          {item.kostenstelle ? `KS: ${item.kostenstelle}` : "—"}
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

        <Text style={s.h1}>{docTypeLabel(normalizeDocType(row.docType))}</Text>
        <Text style={s.h2}>{String(title || "Projekt")}</Text>

        {/* Type selector */}
        <View style={s.typeRow}>
          {(["REGIE", "TAGESBERICHT", "BAUTAGEBUCH"] as RegieDocType[]).map(
            (t) => {
              const active = normalizeDocType(row.docType) === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => updateRow({ docType: t })}
                  style={[s.typePill, active ? s.typePillActive : null]}
                >
                  <Text style={[s.typeTxt, active ? s.typeTxtActive : null]}>
                    {docTypeLabel(t)}
                  </Text>
                </Pressable>
              );
            }
          )}
        </View>

        {/* Actions row */}
        <View style={s.actionsRow}>
          <Pressable style={s.actionBtn} onPress={onKiSuggest} disabled={kiBusy}>
            <Text style={s.actionTxt}>{kiBusy ? "KI..." : "✨ KI"}</Text>
          </Pressable>
          <Pressable style={s.actionBtn} onPress={onPdfPreview} disabled={pdfBusy}>
            <Text style={s.actionTxt}>{pdfBusy ? "PDF..." : "📄 PDF Vorschau"}</Text>
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
            placeholderTextColor="rgba(255,255,255,0.45)"
          />

          <View style={s.grid2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Arbeitsbeginn</Text>
              <TextInput
                value={String(row.arbeitsbeginn || "")}
                onChangeText={(v) => updateRow({ arbeitsbeginn: v })}
                style={s.input}
                placeholder="07:00"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Arbeitsende</Text>
              <TextInput
                value={String(row.arbeitsende || "")}
                onChangeText={(v) => updateRow({ arbeitsende: v })}
                style={s.input}
                placeholder="16:00"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Pause 2</Text>
              <TextInput
                value={String(row.pause2 || "")}
                onChangeText={(v) => updateRow({ pause2: v })}
                style={s.input}
                placeholder="00:00"
                placeholderTextColor="rgba(255,255,255,0.45)"
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
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Kostenstelle (Header)</Text>
              <TextInput
                value={String(row.kostenstelle || "")}
                onChangeText={(v) => updateRow({ kostenstelle: v })}
                style={s.input}
                placeholder="z.B. KS-01"
                placeholderTextColor="rgba(255,255,255,0.45)"
              />
            </View>
          </View>

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

      {/* KI Preview Modal */}
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
                onPress={applyKiSuggestion}
                disabled={kiBusy || !kiSuggestion?.suggestion}
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
          </View>
        </View>
      </Modal>

      {/* PDF Vorschau Modal */}
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

  typeRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  typePillActive: {
    backgroundColor: "#111",
    borderColor: "rgba(255,255,255,0.22)",
  },
  typeTxt: { color: "rgba(255,255,255,0.75)", fontWeight: "900" },
  typeTxtActive: { color: "#fff" },

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
  smallBtnGhost: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.18)",
  },
  smallBtnTxtGhost: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },

  muted: { color: "rgba(255,255,255,0.65)", fontWeight: "700" },

  lineCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 10,
  },
  lineTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  lineTitle: { color: "#fff", fontWeight: "900" },

  // (styles bleiben; nichts löschen)
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
  attUri: { color: "rgba(255,255,255,0.65)", fontWeight: "700", marginTop: 2 },
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
  modalMuted: { color: "rgba(255,255,255,0.70)", fontWeight: "800", marginTop: 6 },
  modalBody: {
    marginTop: 10,
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
