// apps/mobile/src/screens/LvImportScreen.tsx
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Alert, ScrollView, ActivityIndicator, SafeAreaView, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
type Props = NativeStackScreenProps<RootStackParamList, "LvImport">;
type ImportedItem = {
  pos?: string;
  position?: string;
  text?: string;
  kurztext?: string;
  langtext?: string;
  unit?: string;
  einheit?: string;
  quantity?: number | string;
  menge?: number | string;
  ep?: number | string;
  einzelpreis?: number | string;
};
type NormalizedImportedItem = {
  pos: string;
  text: string;
  langtext: string;
  unit: string;
  quantity: number;
  ep: number;
};
type ImportedPayload = {
  title: string;
  currency: string;
  items: NormalizedImportedItem[];
};
type SelectedType = "json" | "csv" | "pdf" | "xlsx" | "xls" | "x83" | "x84" | "xml" | "gaeb";
type ImportFileResponse = {
  ok?: boolean;
  project?: {
    id?: string;
    code?: string;
    name?: string;
  };
  lv?: {
    id?: string;
    title?: string;
    version?: number;
  };
  headerId?: string;
  version?: number;
  count?: number;
  imported?: number;
  detectedType?: string;
  warnings?: string[];
  errors?: string[];
  error?: string;
};
type OfflineLvCache = {
  ok: true;
  offline: true;
  savedAt: string;
  projectId: string;
  projectCode: string;
  title: string;
  currency: string;
  sourceType: SelectedType | "manual";
  fileName?: string;
  fileUri?: string;
  fileSize?: number | null;
  itemCount: number;
  items: NormalizedImportedItem[];

  // Alias per schermate/loader diversi
  positions: NormalizedImportedItem[];
  rows: NormalizedImportedItem[];
  data: NormalizedImportedItem[];
  lv: {
    title: string;
    currency: string;
    items: NormalizedImportedItem[];
    positions: NormalizedImportedItem[];
    rows: NormalizedImportedItem[];
    sourceType: SelectedType | "manual";
    fileName?: string;
    fileUri?: string;
    fileSize?: number | null;
    savedAt: string;
  };
};
const API_BASE_STORAGE_KEY = "rlc_api_base_url";
const FALLBACK_API_BASE = "https://api.rlcbausoftware.com";
function trimSlash(v: string): string {
  return v.replace(/\/+$/, "");
}
async function resolveApiBase(): Promise<string> {
  try {
    const stored = (await AsyncStorage.getItem(API_BASE_STORAGE_KEY))?.trim();
    if (stored && /^https:\/\/.+/i.test(stored) && !/localhost|127\.0\.0\.1/i.test(stored)) {
      return trimSlash(stored);
    }
  } catch {}
  const envBase = typeof process.env.EXPO_PUBLIC_API_URL === "string" ? process.env.EXPO_PUBLIC_API_URL.trim() : "";
  if (envBase && /^https:\/\/.+/i.test(envBase) && !/localhost|127\.0\.0\.1/i.test(envBase)) {
    return trimSlash(envBase);
  }
  return FALLBACK_API_BASE;
}
function toSafeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = String(value).replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}
function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function normalizeImportPayload(raw: unknown): ImportedPayload {
  const obj = raw as any;
  const title = typeof obj?.title === "string" && obj.title.trim() ? obj.title.trim() : typeof obj?.name === "string" && obj.name.trim() ? obj.name.trim() : "Importiertes LV";
  const currency = typeof obj?.currency === "string" && obj.currency.trim() ? obj.currency.trim().toUpperCase() : "EUR";
  const itemsRaw = Array.isArray(obj?.items) ? obj.items : Array.isArray(obj?.positions) ? obj.positions : Array.isArray(obj?.rows) ? obj.rows : Array.isArray(obj) ? obj : [];
  const items: NormalizedImportedItem[] = itemsRaw.map((it: ImportedItem, i: number) => {
    const pos = String(it?.pos ?? it?.position ?? i + 1).trim();
    const text = String(it?.text ?? it?.kurztext ?? "").trim();
    const langtext = it?.langtext !== undefined && it?.langtext !== null ? String(it.langtext).trim() : "";
    const unit = String(it?.unit ?? it?.einheit ?? "").trim();
    const quantity = it?.quantity !== undefined && it?.quantity !== null ? toSafeNumber(it.quantity, 0) : it?.menge !== undefined && it?.menge !== null ? toSafeNumber(it.menge, 0) : 0;
    const ep = it?.ep !== undefined && it?.ep !== null ? toSafeNumber(it.ep, 0) : it?.einzelpreis !== undefined && it?.einzelpreis !== null ? toSafeNumber(it.einzelpreis, 0) : 0;
    return {
      pos: pos || String(i + 1),
      text,
      langtext,
      unit,
      quantity,
      ep
    };
  }).filter((it: NormalizedImportedItem) => it.pos.trim() || it.text.trim());
  return {
    title,
    currency,
    items
  };
}
function parseCsvToPayload(text: string, filename?: string): ImportedPayload {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) {
    return {
      title: filename || "Importiertes LV",
      currency: "EUR",
      items: []
    };
  }
  const headers = parseCsvLine(lines[0], ";").map(s => s.trim().toLowerCase());
  const idx = (alts: string[]) => headers.findIndex(h => alts.includes(h));
  const iPos = idx(["posnr", "positionsnummer", "pos", "position", "oz"]);
  const iKurz = idx(["kurztext", "kurz", "bezeichnung", "text", "titel"]);
  const iLang = idx(["langtext", "beschreibung", "longtext"]);
  const iME = idx(["me", "einheit", "eh", "unit"]);
  const iMenge = idx(["menge", "qty", "quantity"]);
  const iEP = idx(["ep", "einheitspreis", "preis", "einzelpreis"]);
  const items: NormalizedImportedItem[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r], ";");
    if (cols.length === 1 && cols[0].trim() === "") continue;
    const pos = String(iPos >= 0 ? cols[iPos] ?? "" : r).trim();
    const textVal = String(iKurz >= 0 ? cols[iKurz] ?? "" : "").trim();
    const langtextVal = String(iLang >= 0 ? cols[iLang] ?? "" : "").trim();
    const unitVal = String(iME >= 0 ? cols[iME] ?? "" : "").trim();
    const quantityVal = iMenge >= 0 ? toSafeNumber(cols[iMenge], 0) : 0;
    const epVal = iEP >= 0 ? toSafeNumber(cols[iEP], 0) : 0;
    if (!pos && !textVal) continue;
    items.push({
      pos: pos || String(r),
      text: textVal,
      langtext: langtextVal,
      unit: unitVal,
      quantity: quantityVal,
      ep: epVal
    });
  }
  return {
    title: filename || "Importiertes LV",
    currency: "EUR",
    items
  };
}
function parseXmlLikeToPayload(text: string, filename?: string): ImportedPayload {
  const clean = text.replace(/\r/g, " ").replace(/\n/g, " ");
  const getTag = (src: string, tags: string[]): string => {
    for (const tag of tags) {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = src.match(re);
      if (m?.[1]) return decodeXml(m[1]).trim();
    }
    return "";
  };
  const title = getTag(clean, ["title", "titel", "boqname", "name", "projekt", "project"]) || filename || "Importiertes LV";
  const itemChunks = clean.match(/<(Item|Position|BoQCtgy|BoQItem|Ausschreibungsposition)\b[\s\S]*?<\/\1>/gi) || [];
  const items: NormalizedImportedItem[] = itemChunks.map((chunk: string, i: number) => {
    const pos = getTag(chunk, ["OZ", "Ordnungszahl", "PosNr", "Positionsnummer", "Position", "Pos"]) || String(i + 1);
    const kurz = getTag(chunk, ["Kurztext", "ShortText", "Text", "Bezeichnung", "ItemText", "Title"]) || "";
    const lang = getTag(chunk, ["Langtext", "LongText", "Beschreibung", "Description", "OutlineText"]) || "";
    const unit = getTag(chunk, ["ME", "Einheit", "Unit", "UOM"]) || "";
    const qty = toSafeNumber(getTag(chunk, ["Menge", "Quantity", "Qty", "Ansatz"]), 0);
    const ep = toSafeNumber(getTag(chunk, ["EP", "Einheitspreis", "Price", "UnitPrice"]), 0);
    return {
      pos: String(pos).trim() || String(i + 1),
      text: String(kurz).trim() || String(lang).trim() || `Position ${i + 1}`,
      langtext: String(lang).trim(),
      unit: String(unit).trim(),
      quantity: qty,
      ep
    };
  }).filter((it: NormalizedImportedItem) => it.pos.trim() || it.text.trim());
  if (items.length) {
    return {
      title,
      currency: "EUR",
      items
    };
  }
  const fallbackRows = extractLooseXmlRows(clean);
  return {
    title,
    currency: "EUR",
    items: fallbackRows
  };
}
function extractLooseXmlRows(text: string): NormalizedImportedItem[] {
  const out: NormalizedImportedItem[] = [];
  const ozMatches = Array.from(text.matchAll(/<(OZ|Ordnungszahl|PosNr|Positionsnummer|Position|Pos)[^>]*>([\s\S]*?)<\/\1>/gi));
  ozMatches.forEach((m, idx) => {
    const pos = decodeXml(m[2] || "").trim() || String(idx + 1);
    out.push({
      pos,
      text: `Importierte XML/GAEB-Position ${idx + 1}`,
      langtext: "",
      unit: "",
      quantity: 0,
      ep: 0
    });
  });
  return out;
}
function decodeXml(v: string): string {
  return String(v || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function detectFileType(name: string): SelectedType | null {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".x83")) return "x83";
  if (lower.endsWith(".x84")) return "x84";
  if (lower.endsWith(".gaeb")) return "gaeb";
  if (lower.endsWith(".xml")) return "xml";
  return null;
}
function guessMimeType(name: string): string {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "text/csv";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".x83") || lower.endsWith(".x84") || lower.endsWith(".xml") || lower.endsWith(".gaeb")) {
    return "application/xml";
  }
  return "application/octet-stream";
}
function prettyType(value?: string | null): string {
  return String(value || "").trim().toUpperCase() || "—";
}
function sanitizeFileName(name: string): string {
  return String(name || "lv_import").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
}
function buildProjectRef(params: Record<string, unknown>): {
  projectId: string;
  projectCode: string;
  displayCode: string;
} {
  const rawProjectId = String(params?.projectId ?? params?.id ?? (params as any)?.project?.id ?? "").trim();
  const rawProjectCode = String(params?.projectCode ?? params?.code ?? (params as any)?.project?.code ?? "").trim();
  const fallbackRef = rawProjectId || rawProjectCode || "local-project";
  const displayCode = rawProjectCode || (rawProjectId.toUpperCase().startsWith("BA-") ? rawProjectId : rawProjectId || "—");
  return {
    projectId: rawProjectId || fallbackRef,
    projectCode: rawProjectCode || fallbackRef,
    displayCode
  };
}
function buildCacheKeys(projectId: string, projectCode: string): string[] {
  const refs = Array.from(new Set([projectId, projectCode].map(v => String(v || "").trim()).filter(Boolean)));
  const prefixes = ["rlc_lv_cache:", "rlc_mobile_lv_cache:", "lv_cache:", "project_lv_cache:", "rlc_project_lv:", "rlc_lv_readonly_cache:"];
  return prefixes.flatMap(prefix => refs.map(ref => `${prefix}${ref}`));
}
async function copyFileToLocalLvFolder(projectRef: string, file: DocumentPicker.DocumentPickerAsset): Promise<string | undefined> {
  try {
    const docDir = FileSystem.documentDirectory;
    if (!docDir || !file?.uri) return undefined;
    const folder = `${docDir}lv-imports/${sanitizeFileName(projectRef)}/`;
    await FileSystem.makeDirectoryAsync(folder, {
      intermediates: true
    });
    const fileName = sanitizeFileName(file.name || "lv_import.dat");
    const target = `${folder}${Date.now()}_${fileName}`;
    await FileSystem.copyAsync({
      from: file.uri,
      to: target
    });
    return target;
  } catch {
    return undefined;
  }
}
async function saveOfflineLvCache(params: {
  projectId: string;
  projectCode: string;
  payload: ImportedPayload;
  sourceType: SelectedType | "manual";
  file?: DocumentPicker.DocumentPickerAsset | null;
}): Promise<OfflineLvCache> {
  const {
    projectId,
    projectCode,
    payload,
    sourceType,
    file
  } = params;
  const fileUri = file && file.uri ? await copyFileToLocalLvFolder(projectCode || projectId, file) : undefined;
  const cache: OfflineLvCache = {
    ok: true,
    offline: true,
    savedAt: new Date().toISOString(),
    projectId,
    projectCode,
    title: payload.title,
    currency: payload.currency,
    sourceType,
    fileName: file?.name,
    fileUri,
    fileSize: typeof file?.size === "number" ? file.size : null,
    itemCount: payload.items.length,
    items: payload.items,
    positions: payload.items,
    rows: payload.items,
    data: payload.items,
    lv: {
      title: payload.title,
      currency: payload.currency,
      items: payload.items,
      positions: payload.items,
      rows: payload.items,
      sourceType,
      fileName: file?.name,
      fileUri,
      fileSize: typeof file?.size === "number" ? file.size : null,
      savedAt: new Date().toISOString()
    }
  };
  const keys = buildCacheKeys(projectId, projectCode);
  const flatPayload = JSON.stringify(payload);
  const richPayload = JSON.stringify(cache);
  await Promise.all([...keys.map(key => AsyncStorage.setItem(key, richPayload)), AsyncStorage.setItem(`rlc_lv_payload:${projectId}`, flatPayload), AsyncStorage.setItem(`rlc_lv_payload:${projectCode}`, flatPayload), AsyncStorage.setItem(`rlc_lv_last_import:${projectId}`, richPayload), AsyncStorage.setItem(`rlc_lv_last_import:${projectCode}`, richPayload)]);
  return cache;
}
function buildSyntheticPayloadForBinaryFile(type: SelectedType, file: DocumentPicker.DocumentPickerAsset): ImportedPayload {
  const name = file.name || `import.${type}`;
  const label = prettyType(type);
  return {
    title: name,
    currency: "EUR",
    items: [{
      pos: "1",
      text: `${label}-Datei importiert`,
      langtext: `Datei "${name}" wurde lokal gespeichert. ` + `Im Offline-Modus wurde ein Platzhalter-LV angelegt, damit das Projekt direkt weiterarbeiten kann.`,
      unit: "",
      quantity: 1,
      ep: 0
    }]
  };
}
async function buildOfflinePayloadFromFile(file: DocumentPicker.DocumentPickerAsset, type: SelectedType): Promise<ImportedPayload> {
  if (type === "json") {
    const rawText = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8
    });
    const parsed = JSON.parse(rawText);
    return normalizeImportPayload(parsed);
  }
  if (type === "csv") {
    const rawText = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8
    });
    return parseCsvToPayload(rawText, file.name || "Importiertes LV");
  }
  if (type === "xml" || type === "gaeb" || type === "x83" || type === "x84") {
    try {
      const rawText = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      const parsed = parseXmlLikeToPayload(rawText, file.name || "Importiertes LV");
      if (parsed.items.length) return parsed;
    } catch {}
  }
  return buildSyntheticPayloadForBinaryFile(type, file);
}
async function uploadImportFile(params: {
  projectCode: string;
  file: DocumentPicker.DocumentPickerAsset;
  sourceType: SelectedType;
}): Promise<ImportFileResponse> {
  const {
    projectCode,
    file,
    sourceType
  } = params;
  const base = await resolveApiBase();
  const url = `${base}/api/project-lv/${encodeURIComponent(projectCode)}/import-file`;
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name || `lv_import.${sourceType}`,
    type: guessMimeType(file.name || "")
  } as any);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json"
    },
    body: form
  });
  const rawText = await res.text();
  let data: ImportFileResponse | null = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Ungültige Server-Antwort (${res.status}). URL: ${url}\n\nAntwort: ${rawText?.slice(0, 400) || "leer"}`);
  }
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || (Array.isArray(data?.errors) && data?.errors.length ? data.errors.join("\n") : `Import fehlgeschlagen (${res.status})`));
  }
  return data;
}
export default function LvImportScreen({
  route,
  navigation
}: Props) {
  const params = (route.params ?? {}) as Record<string, unknown>;
  const projectMeta = useMemo(() => buildProjectRef(params), [params]);
  const projectCode = projectMeta.projectCode;
  const projectId = projectMeta.projectId;
  const hasServerProjectCode = !!String(params?.projectCode || "").trim();
  const offlineMode = !hasServerProjectCode;
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportedPayload | null>(null);
  const [sourceType, setSourceType] = useState<SelectedType | null>(null);
  function resetState(): void {
    setFile(null);
    setPreview(null);
    setSourceType(null);
  }
  async function createEmptyOfflineLv(): Promise<void> {
    try {
      setBusy(true);
      const emptyPayload: ImportedPayload = {
        title: "Leeres LV",
        currency: "EUR",
        items: []
      };
      await saveOfflineLvCache({
        projectId,
        projectCode,
        payload: emptyPayload,
        sourceType: "manual",
        file: null
      });
      Alert.alert("LV Import", "Leeres LV wurde lokal angelegt.", [{
        text: "OK",
        onPress: () => navigation.goBack()
      }]);
    } catch (e: any) {
      Alert.alert("Fehler", String(e?.message || "Leeres LV konnte nicht angelegt werden"));
    } finally {
      setBusy(false);
    }
  }
  async function pickFile(): Promise<void> {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/csv", "text/plain", "application/pdf", "application/xml", "text/xml", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
        copyToCacheDirectory: true,
        multiple: false
      });
      if (res.canceled || !res.assets?.length) return;
      const picked = res.assets[0];
      const detected = detectFileType(picked.name || "");
      if (!detected) {
        Alert.alert("LV Import", "Nicht unterstützter Dateityp.\n\nErlaubt: JSON, CSV, XML, GAEB, X83, X84, PDF, XLS, XLSX.");
        return;
      }
      setFile(picked);
      setSourceType(detected);
      const payload = await buildOfflinePayloadFromFile(picked, detected);
      setPreview(payload);
      if (offlineMode) {
        Alert.alert("LV Import", `Datei erkannt: ${detected.toUpperCase()}.\n\nDie Datei kann lokal importiert werden.`);
      } else if (detected === "xml" || detected === "gaeb" || detected === "x83" || detected === "x84") {
        Alert.alert("LV Import", `Datei erkannt: ${detected.toUpperCase()}.\n\nServer-Import aktiv. Offline wurde zusätzlich eine Vorschau vorbereitet.`);
      }
    } catch (e: any) {
      Alert.alert("LV Import", String(e?.message || "Datei konnte nicht gelesen werden"));
      resetState();
    }
  }
  async function upload(): Promise<void> {
    if (!file || !sourceType) {
      Alert.alert("LV Import", "Bitte zuerst eine Datei auswählen.");
      return;
    }
    setBusy(true);
    try {
      if (offlineMode) {
        const payload = preview || (await buildOfflinePayloadFromFile(file, sourceType));
        await saveOfflineLvCache({
          projectId,
          projectCode,
          payload,
          sourceType,
          file
        });
        const projectLabel = projectMeta.displayCode || projectCode || projectId || "—";
        const importedCount = payload.items.length;
        resetState();
        Alert.alert("LV Import", `LV lokal gespeichert.\n\nTyp: ${prettyType(sourceType)}\nPositionen: ${importedCount}\nProjekt: ${projectLabel}`, [{
          text: "OK",
          onPress: () => {
            navigation.goBack();
          }
        }]);
        return;
      }
      if (!String(params?.projectCode || "").trim()) {
        Alert.alert("LV Import", "Projektcode fehlt.");
        return;
      }
      const result = await uploadImportFile({
        projectCode: String(params.projectCode).trim(),
        file,
        sourceType
      });
      const detectedType = result?.detectedType || sourceType;
      const count = Number(result?.count ?? result?.imported ?? 0);
      const version = typeof result?.version === "number" ? result.version : typeof result?.lv?.version === "number" ? result.lv.version : undefined;
      const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      resetState();
      let message = `LV erfolgreich importiert.\n\n` + `Typ: ${prettyType(detectedType)}\n` + `Positionen: ${count}`;
      if (result?.headerId) {
        message += `\nHeader-ID: ${result.headerId}`;
      }
      if (typeof version === "number") {
        message += `\nVersion: ${version}`;
      }
      if (warnings.length) {
        message += `\n\nWarnungen: ${warnings.length}`;
      }
      if (errors.length) {
        message += `\nFehlerhinweise: ${errors.length}`;
      }
      Alert.alert("LV Import", message, [{
        text: "OK",
        onPress: () => navigation.goBack()
      }]);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("404")) {
        Alert.alert("LV Import", "Endpoint nicht gefunden.\n\nBitte prüfen:\n- richtige API-URL\n- Server läuft\n- Route /api/project-lv/:projectCode/import-file ist aktiv");
      } else {
        Alert.alert("Fehler", msg || "Import fehlgeschlagen");
      }
    } finally {
      setBusy(false);
    }
  }
  return <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
        <View style={s.headerCard}>
          <Text style={s.eyebrow}>RLC Bausoftware</Text>
          <Text style={s.title}>LV importieren</Text>
          <Text style={s.sub}>
            {offlineMode ? "Leistungsverzeichnis lokal in den Projekt-Cache übernehmen." : "Leistungsverzeichnis aus Datei laden und direkt ins Projekt übernehmen."}
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>{offlineMode ? "Projekt" : "Projekt-Code"}</Text>

          <View style={s.infoBox}>
            <Text style={s.infoText}>
              {offlineMode ? `${projectMeta.displayCode} • ID: ${projectId || "—"}` : projectMeta.displayCode || "—"}
            </Text>
          </View>

          <Pressable style={[s.btnSecondary, busy && s.btnDisabled]} onPress={pickFile} disabled={busy}>
            <Text style={s.btnSecondaryTxt}>{file ? file.name : "Datei auswählen"}</Text>
          </Pressable>

          {offlineMode ? <Pressable style={[s.btnGhost, busy && s.btnDisabled]} onPress={createEmptyOfflineLv} disabled={busy}>
              <Text style={s.btnGhostTxt}>Leeres LV lokal anlegen</Text>
            </Pressable> : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Aktueller Stand</Text>
          {offlineMode ? <>
              <Text style={s.cardText}>Ohne Server: lokaler Import für alle Dateitypen aktiv</Text>
              <Text style={s.cardText}>JSON / CSV / XML / GAEB / X83 / X84: direkte Vorschau</Text>
              <Text style={s.cardText}>XLS / XLSX / PDF: lokale Dateiübernahme mit LV-Platzhalter</Text>
            </> : <>
              <Text style={s.cardText}>Server-Import aktiv</Text>
              <Text style={s.cardText}>Offline-Vorschau zusätzlich vorbereitet</Text>
              <Text style={s.cardText}>Unterstützt: JSON, CSV, XML, GAEB, X83, X84, PDF, XLS, XLSX</Text>
            </>}
        </View>

        {file ? <View style={s.card}>
            <Text style={s.cardTitle}>Ausgewählte Datei</Text>
            <Text style={s.cardText}>Name: {file.name || "—"}</Text>
            <Text style={s.cardText}>Typ: {sourceType?.toUpperCase() || "—"}</Text>
            <Text style={s.cardText}>
              Verarbeitung: {offlineMode ? "Lokaler Cache" : "Server + lokale Vorschau"}
            </Text>
            <Text style={s.cardText}>
              Größe: {typeof file.size === "number" ? `${file.size} Bytes` : "—"}
            </Text>
          </View> : null}

        {preview ? <View style={s.card}>
            <Text style={s.cardTitle}>Vorschau</Text>
            <Text style={s.cardText}>Quelle: {sourceType?.toUpperCase() || "—"}</Text>
            <Text style={s.cardText}>Titel: {preview.title}</Text>
            <Text style={s.cardText}>Währung: {preview.currency}</Text>
            <Text style={s.cardText}>Positionen: {preview.items.length}</Text>

            <View style={s.previewList}>
              {preview.items.slice(0, 3).map((it: NormalizedImportedItem, idx: number) => <View key={`${it.pos}-${idx}`} style={s.previewRow}>
                  <Text style={s.previewPos}>{it.pos || "—"}</Text>
                  <Text style={s.previewDesc} numberOfLines={2}>
                    {it.text || "—"}
                  </Text>
                  <Text style={s.previewMeta}>
                    {it.unit || "—"} • Menge: {it.quantity} • EP: {it.ep}
                  </Text>
                </View>)}
            </View>

            {preview.items.length > 3 ? <Text style={s.previewMore}>+ {preview.items.length - 3} weitere Positionen</Text> : null}
          </View> : null}

        <Pressable style={[s.btnPrimary, busy && s.btnDisabled]} onPress={upload} disabled={busy}>
          {busy ? <View style={s.loadingRow}>
              <ActivityIndicator color={COLORS.textLight} />
              <Text style={s.btnPrimaryTxt}>
                {offlineMode ? "Lokaler Import läuft..." : "Import läuft..."}
              </Text>
            </View> : <Text style={s.btnPrimaryTxt}>
              {offlineMode ? "Lokal importieren" : "Import starten"}
            </Text>}
        </Pressable>

        <Text style={s.hint}>
          {offlineMode ? "Im Modus ohne Server wird die Datei lokal gespeichert und als LV-Cache für das Projekt abgelegt." : "Dieser Screen lädt direkt zu /api/project-lv/:projectCode/import-file hoch."}
        </Text>
      </ScrollView>
    </SafeAreaView>;
}
const s = createRlcStyles("LvImportScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    flexGrow: 1,
    backgroundColor: COLORS.bg,
    padding: 14,
    paddingBottom: 28
  },
  headerCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14
  },
  eyebrow: {
    color: COLORS.accentDark,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  title: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600"
  },
  sub: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20
  },
  card: {
    marginBottom: 14,
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
  label: {
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: 8
  },
  infoBox: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    borderRadius: 12,
    marginBottom: 14
  },
  infoText: {
    color: COLORS.text,
    fontWeight: "600"
  },
  cardTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 8
  },
  cardText: {
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 19,
    marginBottom: 4
  },
  btnSecondary: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  btnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "600",
    textAlign: "center"
  },
  btnGhost: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10
  },
  btnGhostTxt: {
    color: COLORS.text,
    fontWeight: "600",
    textAlign: "center"
  },
  btnPrimary: {
    minHeight: 44,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  btnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    textAlign: "center",
    marginLeft: 8
  },
  btnDisabled: {
    opacity: 0.6
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  previewList: {
    marginTop: 6
  },
  previewRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  previewPos: {
    fontWeight: "600",
    color: COLORS.text
  },
  previewDesc: {
    marginTop: 4,
    color: COLORS.text,
    fontWeight: "600",
    lineHeight: 18
  },
  previewMeta: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 17
  },
  previewMore: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: "600"
  },
  hint: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 18
  }
});
