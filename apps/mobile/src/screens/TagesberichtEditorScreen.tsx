// apps/mobile/src/screens/TagesberichtEditorScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, SafeAreaView, Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
type Props = NativeStackScreenProps<RootStackParamList, "TagesberichtEditor">;
const KEY = "rlc_tagesbericht_list:";
const KEY_MODE = "rlc_mobile_mode";
const INBOX_KEY_TAGESBERICHT = (projectKey: string) => `rlc_mobile_inbox_tagesbericht:${projectKey}`;
type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";
type TagesberichtLine = {
  id: string;
  von?: string;
  bis?: string;
  pauseMin?: number;
  stunden?: number;
  mitarbeiter?: string;
  maschine?: string;
  ort?: string;
  taetigkeit?: string;
  notiz?: string;
};
type TagesberichtRow = {
  id: string;
  projectId: string;
  projectCode: string;
  date: string;
  weather?: string;
  temperature?: string;
  workers?: string;
  machines?: string;
  workDone?: string;
  issues?: string;
  notes?: string;
  attachments?: any[];
  lines?: TagesberichtLine[];
  reportType?: "TAGESBERICHT";
  docType?: "TAGESBERICHT";
  kind?: "tagesbericht";
  workflowStatus?: WorkflowStatus;
  rejectionReason?: string | null;
  submittedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
};
function ymdNow() {
  return new Date().toISOString().slice(0, 10);
}
function uid(prefix = "tb") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}
function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}
function isHm(v: string) {
  const s = String(v || "").trim();
  if (!s) return true;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}
function normalizeHm(v?: string) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return s;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return s;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function digitsOnly(v: string) {
  return String(v || "").replace(/[^\d]/g, "");
}
function numOrZero(v: any) {
  const s = String(v ?? "").replace(",", ".").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function calcHours(von?: string, bis?: string, pauseMin?: number) {
  const a = normalizeHm(String(von || ""));
  const b = normalizeHm(String(bis || ""));
  if (!isHm(a) || !isHm(b) || !a || !b) return 0;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  let start = ah * 60 + am;
  let end = bh * 60 + bm;
  if (end < start) end += 24 * 60;
  const pause = Math.max(0, Number(pauseMin || 0) || 0);
  const minutes = Math.max(0, end - start - pause);
  return Math.round(minutes / 60 * 100) / 100;
}
function summarizeWorkers(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  const set = new Set<string>();
  for (const x of arr) {
    const raw = String(x?.mitarbeiter || "").trim();
    if (!raw) continue;
    raw.split(/[;,/]+/g).map(s => s.trim()).filter(Boolean).forEach(s => set.add(s));
  }
  return Array.from(set).join(", ");
}
function summarizeMachines(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  const set = new Set<string>();
  for (const x of arr) {
    const raw = String(x?.maschine || "").trim();
    if (!raw) continue;
    set.add(raw);
  }
  return Array.from(set).join(", ");
}
function summarizeWorkDone(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.map(x => {
    const parts = [String(x?.taetigkeit || "").trim(), String(x?.ort || "").trim() ? `Ort: ${String(x.ort).trim()}` : "", String(x?.mitarbeiter || "").trim() ? `Mitarbeiter: ${String(x.mitarbeiter).trim()}` : "", String(x?.maschine || "").trim() ? `Maschine: ${String(x.maschine).trim()}` : ""].filter(Boolean);
    return parts.join(" • ");
  }).filter(Boolean).join("\n");
}
async function loadRows(projectKey: string): Promise<TagesberichtRow[]> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY}${projectKey}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function saveRows(projectKey: string, rows: TagesberichtRow[]) {
  await AsyncStorage.setItem(`${KEY}${projectKey}`, JSON.stringify(rows));
}
async function loadInboxRows(projectKey: string): Promise<TagesberichtRow[]> {
  try {
    const raw = await AsyncStorage.getItem(INBOX_KEY_TAGESBERICHT(projectKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function saveInboxRows(projectKey: string, rows: TagesberichtRow[]) {
  await AsyncStorage.setItem(INBOX_KEY_TAGESBERICHT(projectKey), JSON.stringify(rows));
}
function emptyLine(): TagesberichtLine {
  return {
    id: uid("tbl"),
    von: "",
    bis: "",
    pauseMin: 0,
    stunden: 0,
    mitarbeiter: "",
    maschine: "",
    ort: "",
    taetigkeit: "",
    notiz: ""
  };
}
export default function TagesberichtEditorScreen({
  route,
  navigation
}: Props) {
  const {
    projectId,
    projectCode,
    title,
    tagesberichtId
  } = route.params as any;
  const projectKey = useMemo(() => String(projectCode || projectId || "").trim(), [projectCode, projectId]);
  const isEdit = !!String(tagesberichtId || "").trim();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<TagesberichtRow>({
    id: isEdit ? String(tagesberichtId) : uid("tb"),
    projectId: String(projectKey || ""),
    projectCode: String(projectKey || ""),
    date: ymdNow(),
    weather: "",
    temperature: "",
    workers: "",
    machines: "",
    workDone: "",
    issues: "",
    notes: "",
    attachments: [],
    lines: [emptyLine()],
    reportType: "TAGESBERICHT",
    docType: "TAGESBERICHT",
    kind: "tagesbericht",
    workflowStatus: "EINGEREICHT",
    rejectionReason: null,
    submittedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEdit ? "Tagesbericht bearbeiten" : "Tagesbericht",
      headerTitle: () => <Text style={s._inline1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
          {isEdit ? "Tagesbericht bearbeiten" : "Tagesbericht"}
        </Text>,
      headerStyle: {
        backgroundColor: COLORS.bg
      },
      headerTitleStyle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "600"
      },
      headerTintColor: COLORS.text,
      headerRight: () => <Pressable onPress={() => {
        navigation.navigate("SupportChat" as any, {
          projectId: String(projectId || ""),
          projectCode: String(projectCode || "").trim() || undefined,
          title: "RLC KI",
          screen: "TagesberichtEditor",
          initialMessage: ""
        });
      }} style={[s.headerKiBtn, {
        display: "none"
      }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.accentDark} />
          <Text style={s.headerKiTxt}>RLC KI</Text>
        </Pressable>
    });
  }, [navigation, projectId, projectCode, isEdit]);
  const update = useCallback((k: keyof TagesberichtRow, v: string) => {
    setData(d => ({
      ...d,
      [k]: v,
      updatedAt: Date.now()
    }));
  }, []);
  const updateLine = useCallback((lineId: string, key: keyof TagesberichtLine, value: string) => {
    setData(prev => {
      const nextLines = (prev.lines || []).map(line => {
        if (line.id !== lineId) return line;
        const nextLine: TagesberichtLine = {
          ...line
        };
        if (key === "pauseMin") {
          const clean = digitsOnly(value);
          nextLine.pauseMin = clean ? Number(clean) : 0;
        } else if (key === "stunden") {
          nextLine.stunden = numOrZero(value);
        } else {
          nextLine[key] = value as any;
        }
        const von = String(key === "von" ? value : nextLine.von || "");
        const bis = String(key === "bis" ? value : nextLine.bis || "");
        const pause = key === "pauseMin" ? Number(digitsOnly(value) || 0) : Number(nextLine.pauseMin || 0);
        const computedHours = calcHours(von, bis, pause);
        if (String(von).trim() && String(bis).trim() && isHm(von) && isHm(bis)) {
          nextLine.stunden = computedHours;
        }
        return nextLine;
      });
      return {
        ...prev,
        lines: nextLines,
        updatedAt: Date.now()
      };
    });
  }, []);
  const addLine = useCallback(() => {
    setData(prev => ({
      ...prev,
      lines: [...(prev.lines || []), emptyLine()],
      updatedAt: Date.now()
    }));
  }, []);
  const removeLine = useCallback((lineId: string) => {
    setData(prev => {
      const current = Array.isArray(prev.lines) ? prev.lines : [];
      const nextLines = current.filter(x => x.id !== lineId);
      return {
        ...prev,
        lines: nextLines.length ? nextLines : [emptyLine()],
        updatedAt: Date.now()
      };
    });
  }, []);
  const onReset = useCallback(() => {
    setData({
      id: uid("tb"),
      projectId: String(projectKey || ""),
      projectCode: String(projectKey || ""),
      date: ymdNow(),
      weather: "",
      temperature: "",
      workers: "",
      machines: "",
      workDone: "",
      issues: "",
      notes: "",
      attachments: [],
      lines: [emptyLine()],
      reportType: "TAGESBERICHT",
      docType: "TAGESBERICHT",
      kind: "tagesbericht",
      workflowStatus: "EINGEREICHT",
      rejectionReason: null,
      submittedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }, [projectKey]);
  const loadExisting = useCallback(async () => {
    try {
      if (!isEdit) {
        setLoaded(true);
        return;
      }
      const list = await loadRows(projectKey);
      const found = list.find(x => String(x.id) === String(tagesberichtId));
      if (found) {
        const normalizedLines = Array.isArray(found.lines) && found.lines.length ? found.lines.map(x => ({
          id: String(x?.id || uid("tbl")),
          von: normalizeHm(String(x?.von || "")),
          bis: normalizeHm(String(x?.bis || "")),
          pauseMin: Number(x?.pauseMin || 0),
          stunden: x?.stunden != null ? Number(x.stunden || 0) : calcHours(String(x?.von || ""), String(x?.bis || ""), Number(x?.pauseMin || 0)),
          mitarbeiter: String(x?.mitarbeiter || ""),
          maschine: String(x?.maschine || ""),
          ort: String(x?.ort || ""),
          taetigkeit: String(x?.taetigkeit || ""),
          notiz: String(x?.notiz || "")
        })) : [{
          ...emptyLine(),
          mitarbeiter: String(found.workers || ""),
          maschine: String(found.machines || ""),
          taetigkeit: String(found.workDone || ""),
          notiz: String(found.notes || "")
        }];
        setData({
          id: String(found.id || tagesberichtId),
          projectId: String(found.projectId || projectKey || ""),
          projectCode: String(found.projectCode || projectKey || ""),
          date: String(found.date || ymdNow()),
          weather: String(found.weather || ""),
          temperature: String(found.temperature || ""),
          workers: String(found.workers || ""),
          machines: String(found.machines || ""),
          workDone: String(found.workDone || ""),
          issues: String(found.issues || ""),
          notes: String(found.notes || ""),
          attachments: Array.isArray(found.attachments) ? found.attachments : [],
          lines: normalizedLines,
          reportType: "TAGESBERICHT",
          docType: "TAGESBERICHT",
          kind: "tagesbericht",
          workflowStatus: (found.workflowStatus || "EINGEREICHT") as WorkflowStatus,
          rejectionReason: found.rejectionReason ?? null,
          submittedAt: Number(found.submittedAt || found.createdAt || Date.now()),
          createdAt: Number(found.createdAt || Date.now()),
          updatedAt: Number(found.updatedAt || Date.now())
        });
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [isEdit, projectKey, tagesberichtId]);
  useEffect(() => {
    loadExisting();
  }, [loadExisting]);
  const validate = useCallback(() => {
    if (!projectKey) {
      Alert.alert("Fehler", "Projektcode fehlt.");
      return false;
    }
    if (!isYmd(String(data.date || ""))) {
      Alert.alert("Datum", "Bitte Datum im Format YYYY-MM-DD eingeben.");
      return false;
    }
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const hasValidLine = lines.some(x => String(x?.taetigkeit || "").trim() || String(x?.mitarbeiter || "").trim() || String(x?.maschine || "").trim() || String(x?.ort || "").trim());
    if (!hasValidLine && !String(data.workDone || "").trim()) {
      Alert.alert("Pflichtfeld", "Bitte mindestens eine Tätigkeitszeile ausfüllen.");
      return false;
    }
    for (const line of lines) {
      const von = String(line.von || "").trim();
      const bis = String(line.bis || "").trim();
      if (von && !isHm(von) || bis && !isHm(bis)) {
        Alert.alert("Zeitformat", "Bitte Zeiten im Format HH:MM eingeben.");
        return false;
      }
      if (line.pauseMin != null && Number(line.pauseMin) < 0) {
        Alert.alert("Pause", "Pause muss 0 oder größer sein.");
        return false;
      }
    }
    return true;
  }, [data.date, data.lines, data.workDone, projectKey]);
  const onSave = useCallback(async () => {
    try {
      if (!validate()) return;
      setSaving(true);
      const [list, inboxList, modeRaw] = await Promise.all([loadRows(projectKey), loadInboxRows(projectKey), AsyncStorage.getItem(KEY_MODE)]);
      const mode = String(modeRaw || "SERVER_SYNC").trim() as "NUR_APP" | "SERVER_SYNC";
      const now = Date.now();
      const normalizedLines = (Array.isArray(data.lines) ? data.lines : []).map(line => {
        const von = normalizeHm(String(line.von || "").trim());
        const bis = normalizeHm(String(line.bis || "").trim());
        const pauseMin = Math.max(0, Number(line.pauseMin || 0));
        const stunden = von && bis ? calcHours(von, bis, pauseMin) : Number(line.stunden || 0);
        return {
          id: String(line.id || uid("tbl")),
          von,
          bis,
          pauseMin,
          stunden,
          mitarbeiter: String(line.mitarbeiter || "").trim(),
          maschine: String(line.maschine || "").trim(),
          ort: String(line.ort || "").trim(),
          taetigkeit: String(line.taetigkeit || "").trim(),
          notiz: String(line.notiz || "").trim()
        };
      }).filter(x => x.taetigkeit || x.mitarbeiter || x.maschine || x.ort || x.notiz || x.von || x.bis);
      const nextWorkers = summarizeWorkers(normalizedLines);
      const nextMachines = summarizeMachines(normalizedLines);
      const nextWorkDone = summarizeWorkDone(normalizedLines) || String(data.workDone || "").trim();
      const nextNotes = String(data.notes || "").trim();
      const nextRow: TagesberichtRow = {
        id: String(data.id || uid("tb")),
        projectId: String(projectKey || ""),
        projectCode: String(projectKey || ""),
        date: String(data.date || ymdNow()).trim(),
        weather: String(data.weather || "").trim(),
        temperature: String(data.temperature || "").trim(),
        workers: nextWorkers,
        machines: nextMachines,
        workDone: nextWorkDone,
        issues: String(data.issues || "").trim(),
        notes: nextNotes,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        lines: normalizedLines.length ? normalizedLines : [emptyLine()],
        reportType: "TAGESBERICHT",
        docType: "TAGESBERICHT",
        kind: "tagesbericht",
        workflowStatus: "EINGEREICHT",
        rejectionReason: null,
        submittedAt: now,
        createdAt: Number(data.createdAt || now),
        updatedAt: now
      };
      const idx = list.findIndex(x => String(x.id) === String(nextRow.id));
      let next: TagesberichtRow[] = [];
      if (idx >= 0) {
        next = [...list];
        next[idx] = nextRow;
      } else {
        next = [nextRow, ...list];
      }
      next.sort((a, b) => {
        const ad = String(a.date || "");
        const bd = String(b.date || "");
        if (ad < bd) return 1;
        if (ad > bd) return -1;
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      });
      await saveRows(projectKey, next);
      const inboxRow: TagesberichtRow = {
        ...nextRow,
        projectId: String(projectKey || ""),
        projectCode: String(projectKey || ""),
        workflowStatus: "EINGEREICHT",
        submittedAt: now,
        updatedAt: now
      };
      const inboxIdx = inboxList.findIndex(x => String(x.id) === String(inboxRow.id));
      let nextInbox: TagesberichtRow[] = [];
      if (inboxIdx >= 0) {
        nextInbox = [...inboxList];
        nextInbox[inboxIdx] = {
          ...nextInbox[inboxIdx],
          ...inboxRow
        };
      } else {
        nextInbox = [inboxRow, ...inboxList];
      }
      nextInbox.sort((a, b) => {
        const aTime = Number(a.submittedAt || a.updatedAt || a.createdAt || 0);
        const bTime = Number(b.submittedAt || b.updatedAt || b.createdAt || 0);
        return bTime - aTime;
      });
      await saveInboxRows(projectKey, nextInbox);
      let serverSyncError = "";
      if (mode === "SERVER_SYNC") {
        try {
          await api.pushTagesberichtToServer(projectKey, inboxRow as any);
        } catch (e: any) {
          serverSyncError = String(e?.message || e || "Server Sync fehlgeschlagen");
          console.log("Tagesbericht sync error:", serverSyncError);
        }
      }
      if (serverSyncError) {
        Alert.alert("Lokal gespeichert", "Tagesbericht wurde lokal gespeichert und in die lokale Eingang / Prüfung gelegt.\n\n" + `Server-Sync fehlgeschlagen: ${serverSyncError}`, [{
          text: "OK",
          onPress: () => navigation.goBack()
        }]);
        return;
      }
      Alert.alert("Gespeichert", mode === "SERVER_SYNC" ? isEdit ? "Tagesbericht wurde aktualisiert und an Eingang / Prüfung übertragen." : "Tagesbericht wurde gespeichert und an Eingang / Prüfung übertragen." : isEdit ? "Tagesbericht wurde lokal aktualisiert." : "Tagesbericht wurde lokal gespeichert.", [{
        text: "OK",
        onPress: () => navigation.goBack()
      }]);
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }, [validate, projectKey, data, isEdit, navigation]);
  if (!loaded) {
    return <SafeAreaView style={s.safe}>
        <View style={s.loadingWrap}>
          <Text style={s.loadingTxt}>Lade Tagesbericht…</Text>
        </View>
      </SafeAreaView>;
  }
  return <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
        <View style={s.headerCard}>
          <View style={s.headerTopRow}>
            <View style={s.headerTitleWrap}>
              <Text style={s.eyebrow}>Tagesdokumentation</Text>
              <Text style={s.h1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                Tagesbericht
              </Text>
              <Text style={s.h2}>{title || "Projekt"}</Text>
            </View>

            <View style={s.statusPill}>
              <Text style={s.statusPillTxt}>
                {isEdit ? "Bearbeiten" : "Neu"}
              </Text>
            </View>
          </View>

          <Text style={s.projectCode}>{projectKey}</Text>

          <Text style={s.infoTxt}>
            Tagesbezogene Baustellendokumentation als Grundlage für das
            Bautagebuch.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Allgemein</Text>

          <Text style={s.label}>Datum</Text>
          <TextInput value={String(data.date || "")} onChangeText={v => update("date", v)} style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.sub} />
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Wetter</Text>

          <Text style={s.label}>Wetterbeschreibung</Text>
          <TextInput value={String(data.weather || "")} onChangeText={v => update("weather", v)} style={s.input} placeholder="z.B. sonnig, bewölkt, Regen" placeholderTextColor={COLORS.sub} />

          <Text style={s.label}>Temperatur</Text>
          <TextInput value={String(data.temperature || "")} onChangeText={v => update("temperature", v)} style={s.input} placeholder="z.B. 18" placeholderTextColor={COLORS.sub} keyboardType="number-pad" />
        </View>

        <View style={s.card}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Leistungszeilen</Text>

            <Pressable style={s.addLineBtn} onPress={addLine}>
              <Ionicons name="add" size={16} color={COLORS.textLight} />
              <Text style={s.addLineTxt}>Zeile</Text>
            </Pressable>
          </View>

          {(data.lines || []).map((line, idx) => <View key={line.id} style={s.lineCard}>
              <View style={s.lineTopRow}>
                <View style={s.lineTitleRow}>
                  <View style={s.lineBadge}>
                    <Text style={s.lineBadgeTxt}>{idx + 1}</Text>
                  </View>
                  <Text style={s.lineTitle}>Leistungszeile</Text>
                </View>

                <Pressable style={s.removeLineBtn} onPress={() => removeLine(line.id)}>
                  <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
                  <Text style={s.removeLineTxt}>Entfernen</Text>
                </Pressable>
              </View>

              <View style={s.twoColRow}>
                <View style={s.col}>
                  <Text style={s.label}>Von</Text>
                  <TextInput value={String(line.von || "")} onChangeText={v => updateLine(line.id, "von", v)} style={s.input} placeholder="07:00" placeholderTextColor={COLORS.sub} autoCapitalize="none" autoCorrect={false} keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} />
                </View>

                <View style={s.col}>
                  <Text style={s.label}>Bis</Text>
                  <TextInput value={String(line.bis || "")} onChangeText={v => updateLine(line.id, "bis", v)} style={s.input} placeholder="16:30" placeholderTextColor={COLORS.sub} autoCapitalize="none" autoCorrect={false} keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} />
                </View>
              </View>

              <View style={s.twoColRow}>
                <View style={s.col}>
                  <Text style={s.label}>Pause (Min.)</Text>
                  <TextInput value={line.pauseMin == null || Number(line.pauseMin) === 0 ? "" : String(line.pauseMin)} onChangeText={v => updateLine(line.id, "pauseMin", v)} style={s.input} placeholder="30" placeholderTextColor={COLORS.sub} keyboardType="number-pad" />
                </View>

                <View style={s.col}>
                  <Text style={s.label}>Stunden</Text>
                  <TextInput value={String(line.stunden ?? 0)} onChangeText={v => updateLine(line.id, "stunden", v)} style={s.input} placeholder="8" placeholderTextColor={COLORS.sub} keyboardType="decimal-pad" />
                </View>
              </View>

              <Text style={s.label}>Mitarbeiter</Text>
              <TextInput value={String(line.mitarbeiter || "")} onChangeText={v => updateLine(line.id, "mitarbeiter", v)} style={s.input} placeholder="z.B. Roberto, Marco" placeholderTextColor={COLORS.sub} />

              <Text style={s.label}>Maschine / Gerät</Text>
              <TextInput value={String(line.maschine || "")} onChangeText={v => updateLine(line.id, "maschine", v)} style={s.input} placeholder="z.B. Bagger, Walze, LKW" placeholderTextColor={COLORS.sub} />

              <Text style={s.label}>Ort</Text>
              <TextInput value={String(line.ort || "")} onChangeText={v => updateLine(line.id, "ort", v)} style={s.input} placeholder="z.B. Straße, Hausnr., Abschnitt" placeholderTextColor={COLORS.sub} />

              <Text style={s.label}>Tätigkeit</Text>
              <TextInput value={String(line.taetigkeit || "")} onChangeText={v => updateLine(line.id, "taetigkeit", v)} style={[s.input, s.textarea]} multiline placeholder="Beschreibe die ausgeführte Tätigkeit" placeholderTextColor={COLORS.sub} />

              <Text style={s.label}>Notiz zur Zeile</Text>
              <TextInput value={String(line.notiz || "")} onChangeText={v => updateLine(line.id, "notiz", v)} style={[s.input, s.textareaSmall]} multiline placeholder="Zusätzliche Bemerkung zu dieser Zeile" placeholderTextColor={COLORS.sub} />
            </View>)}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Besondere Vorkommnisse</Text>

          <TextInput value={String(data.issues || "")} onChangeText={v => update("issues", v)} style={[s.input, s.textarea]} multiline placeholder="Probleme, Behinderungen, Lieferverzug, Wetterunterbrechung, Besonderheiten..." placeholderTextColor={COLORS.sub} />
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Zusätzliche Notizen</Text>

          <TextInput value={String(data.notes || "")} onChangeText={v => update("notes", v)} style={[s.input, s.textarea]} multiline placeholder="Weitere Hinweise, Besuch, Absprachen, interne Bemerkungen..." placeholderTextColor={COLORS.sub} />
        </View>

        <View style={s.actionRow}>
          <Pressable style={[s.secondaryBtn, saving ? s.btnDisabled : null]} onPress={onReset} disabled={saving}>
            <Text style={s.secondaryBtnTxt}>Neu</Text>
          </Pressable>

          <Pressable style={[s.saveBtn, saving ? s.btnDisabled : null]} onPress={onSave} disabled={saving}>
            <Text style={s.saveTxt}>
              {saving ? "Speichert..." : isEdit ? "Änderungen speichern" : "Speichern"}
            </Text>
          </Pressable>
        </View>

        <View style={s._inline2} />
      </ScrollView>
    </SafeAreaView>;
}
const s = createRlcStyles("TagesberichtEditorScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 14
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg
  },
  loadingTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 16
  },
  headerKiBtn: {
    display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  headerCard: {
    padding: 14,
    borderRadius: 14,
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
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 4
  },
  eyebrow: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6
  },
  h1: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: -0.4
  },
  h2: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 16,
    marginTop: 4
  },
  projectCode: {
    marginTop: 10,
    fontWeight: "600",
    color: COLORS.accent,
    fontSize: 15
  },
  infoTxt: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20,
    fontSize: 14
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "flex-start"
  },
  statusPillTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 12
  },
  card: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 4
        }
      },
      android: {
        elevation: 1
      },
      default: {}
    })
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4
  },
  addLineBtn: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark
  },
  addLineTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 13
  },
  lineCard: {
    marginTop: 6,
    padding: 13,
    borderRadius: 14,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8
  },
  lineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4
  },
  lineTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1
  },
  lineBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  lineBadgeTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 12
  },
  lineTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 14
  },
  removeLineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger
  },
  removeLineTxt: {
    color: COLORS.danger,
    fontWeight: "600",
    fontSize: 12
  },
  label: {
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 2,
    fontSize: 13
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 14
  },
  twoColRow: {
    flexDirection: "row",
    gap: 10
  },
  col: {
    flex: 1
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  textareaSmall: {
    minHeight: 44,
    textAlignVertical: "top"
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryBtnTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 15
  },
  saveBtn: {
    flex: 1.4,
    minHeight: 44,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
    alignItems: "center",
    justifyContent: "center"
  },
  saveTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 16
  },
  btnDisabled: {
    opacity: 0.6
  },
  _inline1: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "600",
    maxWidth: 245,
    textAlign: "center"
  },
  _inline2: {
    height: 30
  }
});
