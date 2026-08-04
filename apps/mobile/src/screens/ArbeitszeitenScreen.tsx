import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { RootStackParamList } from "../navigation/types";
import { request } from "../lib/api";
import { getSession } from "../storage/session";
import { COLORS, createRlcStyles } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Arbeitszeiten">;
type AppMode = "NUR_APP" | "SERVER_SYNC";
type Status = "DRAFT" | "EINGEREICHT" | "ABGELEHNT" | "FREIGEGEBEN";
type ClockState = "NOT_STARTED" | "WORKING" | "PAUSED" | "FINISHED";
type EventType = "START" | "PAUSE_START" | "PAUSE_END" | "END";

type GeoStamp = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  capturedAt: number;
};

type TimeEvent = {
  id: string;
  type: EventType;
  timestamp: number;
  time: string;
  gps: GeoStamp;
  device: {
    platform: string;
    osVersion?: string | number;
  };
};

type Row = {
  id: string;
  date: string;
  employee: string;
  employeeId?: string;
  start: string;
  end: string;
  breakMinutes: number;
  activity: string;
  machines: string;
  materials: string;
  note: string;
  status: Status;
  clockState: ClockState;
  events: TimeEvent[];
  createdAt: number;
  updatedAt: number;
  source?: string;
  projectKey?: string;
  projectCode?: string;
  title?: string;
  hours?: number;
  submittedBy?: {
    userId?: string;
    userName?: string;
    employeeId?: string;
    employeeName?: string;
    displayName?: string;
  };
};

const KEY_MODE = "rlc_mobile_mode";
const uid = (prefix = "az") => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const today = () => new Date().toISOString().slice(0, 10);
const storeKey = (p: string) => `rlc_mobile_arbeitszeiten:${p}`;
const inboxKey = (p: string) => `rlc_mobile_inbox_arbeitszeiten:${p}`;

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function eventLabel(type: EventType) {
  if (type === "START") return "Arbeitsbeginn";
  if (type === "PAUSE_START") return "Pause begonnen";
  if (type === "PAUSE_END") return "Arbeit fortgesetzt";
  return "Arbeitsende";
}

function calculateBreakMinutes(events: TimeEvent[]) {
  let total = 0;
  let pauseStart: number | null = null;
  for (const event of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
    if (event.type === "PAUSE_START") pauseStart = event.timestamp;
    if (event.type === "PAUSE_END" && pauseStart != null) {
      total += Math.max(0, event.timestamp - pauseStart);
      pauseStart = null;
    }
  }
  return Math.round(total / 60000);
}

function calculateHours(events: TimeEvent[]) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const start = sorted.find((x) => x.type === "START")?.timestamp;
  const end = [...sorted].reverse().find((x) => x.type === "END")?.timestamp;
  if (!start || !end || end <= start) return 0;
  return Math.max(0, (end - start) / 3600000 - calculateBreakMinutes(sorted) / 60);
}

function deriveState(events: TimeEvent[]): ClockState {
  const last = [...events].sort((a, b) => a.timestamp - b.timestamp).at(-1);
  if (!last) return "NOT_STARTED";
  if (last.type === "END") return "FINISHED";
  if (last.type === "PAUSE_START") return "PAUSED";
  return "WORKING";
}

async function readMode(): Promise<AppMode> {
  const value = await AsyncStorage.getItem(KEY_MODE);
  return value === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
}

async function readRows(key: string): Promise<Row[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function captureGps(): Promise<GeoStamp> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("GPS-Berechtigung wurde nicht erteilt.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const accuracy = position.coords.accuracy ?? null;
  if (accuracy != null && accuracy > 150) {
    throw new Error(`GPS zu ungenau (${Math.round(accuracy)} m). Bitte im Freien erneut versuchen.`);
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy,
    altitude: position.coords.altitude ?? null,
    capturedAt: Date.now(),
  };
}

function normalizeRow(raw: any, fallbackEmployee = ""): Row {
  const events: TimeEvent[] = Array.isArray(raw?.events) ? raw.events : [];
  const clockState = raw?.clockState || deriveState(events);
  const startEvent = events.find((x) => x.type === "START");
  const endEvent = [...events].reverse().find((x) => x.type === "END");
  return {
    id: String(raw?.id || raw?.docId || uid()),
    date: String(raw?.date || today()).slice(0, 10),
    employee: String(raw?.employee || raw?.employeeName || fallbackEmployee || ""),
    employeeId: raw?.employeeId ? String(raw.employeeId) : undefined,
    start: String(raw?.start || (startEvent ? formatTime(startEvent.timestamp) : "")),
    end: String(raw?.end || (endEvent ? formatTime(endEvent.timestamp) : "")),
    breakMinutes: Number(raw?.breakMinutes ?? calculateBreakMinutes(events)),
    activity: String(raw?.activity || raw?.taetigkeit || ""),
    machines: String(raw?.machines || raw?.maschinen || ""),
    materials: String(raw?.materials || raw?.material || ""),
    note: String(raw?.note || raw?.bemerkungen || ""),
    status: (raw?.status || raw?.workflowStatus || "DRAFT") as Status,
    clockState,
    events,
    createdAt: Number(raw?.createdAt || Date.now()),
    updatedAt: Number(raw?.updatedAt || Date.now()),
    source: raw?.source,
    projectKey: raw?.projectKey,
    projectCode: raw?.projectCode,
    title: raw?.title,
    hours: Number(raw?.hours ?? calculateHours(events)),
    submittedBy: raw?.submittedBy,
  };
}

export default function ArbeitszeitenScreen({ route }: Props) {
  const params = route.params as any;
  const projectKey = String(params?.projectCode || params?.projectId || "").trim();
  const inboxSnapshot = params?.inboxSnapshot;
  const reviewMode = Boolean(params?.fromInbox && inboxSnapshot);

  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AppMode>("SERVER_SYNC");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const createBlank = useCallback(
    (): Row => ({
      id: uid(),
      date: today(),
      employee: employeeName,
      employeeId,
      start: "",
      end: "",
      breakMinutes: 0,
      activity: "",
      machines: "",
      materials: "",
      note: "",
      status: "DRAFT",
      clockState: "NOT_STARTED",
      events: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    [employeeId, employeeName]
  );

  const load = useCallback(async () => {
    const currentMode = await readMode();
    setMode(currentMode);

    const session = await getSession(projectKey);
    const name = String(session?.name || "").trim();
    setEmployeeName(name);
    setEmployeeId((session as any)?.userId || (session as any)?.employeeId || undefined);

    const localRows = (await readRows(storeKey(projectKey))).map((row) => normalizeRow(row, name));
    setRows(localRows);

    if (reviewMode && inboxSnapshot) {
      setEditing(normalizeRow(inboxSnapshot, name));
    }
  }, [inboxSnapshot, projectKey, reviewMode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const persist = useCallback(
    async (next: Row[]) => {
      setRows(next);
      await AsyncStorage.setItem(storeKey(projectKey), JSON.stringify(next));
    },
    [projectKey]
  );

  const upsert = useCallback(
    async (row: Row) => {
      const normalized = normalizeRow({ ...row, updatedAt: Date.now() }, employeeName);
      const next = [normalized, ...rows.filter((x) => x.id !== normalized.id)];
      await persist(next);
      setEditing(normalized);
      return normalized;
    },
    [employeeName, persist, rows]
  );

  const registerEvent = useCallback(
    async (type: EventType) => {
      if (!editing || busy || reviewMode) return;
      if (!employeeName) {
        Alert.alert("Mitarbeiter fehlt", "Bitte zuerst im Projekt anmelden.");
        return;
      }

      try {
        setBusy(true);
        const gps = await captureGps();
        const timestamp = Date.now();
        const nextEvent: TimeEvent = {
          id: uid("evt"),
          type,
          timestamp,
          time: formatTime(timestamp),
          gps,
          device: {
            platform: Platform.OS,
            osVersion: Platform.Version,
          },
        };

        const events = [...editing.events, nextEvent];
        const nextState = deriveState(events);
        const startEvent = events.find((x) => x.type === "START");
        const endEvent = [...events].reverse().find((x) => x.type === "END");

        await upsert({
          ...editing,
          employee: employeeName,
          employeeId,
          date: today(),
          events,
          clockState: nextState,
          start: startEvent ? formatTime(startEvent.timestamp) : "",
          end: endEvent ? formatTime(endEvent.timestamp) : "",
          breakMinutes: calculateBreakMinutes(events),
          hours: calculateHours(events),
        });
      } catch (error: any) {
        Alert.alert("Zeiterfassung fehlgeschlagen", String(error?.message || error));
      } finally {
        setBusy(false);
      }
    },
    [busy, editing, employeeId, employeeName, reviewMode, upsert]
  );

  const saveDetails = useCallback(async () => {
    if (!editing || reviewMode) return;
    await upsert(editing);
    Alert.alert("Gespeichert", "Tätigkeit und Zusatzangaben wurden gespeichert.");
  }, [editing, reviewMode, upsert]);

  const submit = useCallback(
    async (row: Row) => {
      if (busy) return;
      if (row.clockState !== "FINISHED") {
        Alert.alert("Arbeitsende fehlt", "Die Arbeitszeit kann erst nach Arbeitsende eingereicht werden.");
        return;
      }
      if (!row.activity.trim()) {
        Alert.alert("Tätigkeit fehlt", "Bitte die ausgeführten Tätigkeiten eintragen.");
        return;
      }
      if (!row.events.every((event) => event.gps && Number.isFinite(event.gps.latitude))) {
        Alert.alert("GPS unvollständig", "Mindestens eine Zeitbuchung besitzt keine gültige GPS-Position.");
        return;
      }

      try {
        setBusy(true);
        const currentMode = await readMode();
        setMode(currentMode);
        const now = Date.now();
        const doc: Row = {
          ...row,
          employee: employeeName || row.employee,
          employeeId: employeeId || row.employeeId,
          title: `Arbeitszeit ${employeeName || row.employee} · ${row.date}`,
          hours: calculateHours(row.events),
          breakMinutes: calculateBreakMinutes(row.events),
          projectKey,
          projectCode: projectKey,
          source: "RLC_MOBILE_GPS_TIME_CLOCK",
          status: "EINGEREICHT",
          updatedAt: now,
          submittedBy: {
            userId: employeeId,
            userName: employeeName,
            employeeId,
            employeeName,
            displayName: employeeName,
          },
        };

        if (currentMode === "NUR_APP") {
          const inbox = await readRows(inboxKey(projectKey));
          const nextInbox = [doc, ...inbox.filter((x) => x.id !== doc.id)];
          await AsyncStorage.setItem(inboxKey(projectKey), JSON.stringify(nextInbox));
          await persist(rows.map((x) => (x.id === row.id ? doc : x)));
          setEditing(doc);
          Alert.alert("In Inbox übernommen", "Die Arbeitszeit wurde lokal in der Offline-Inbox gespeichert.");
          return;
        }

        await request(`/api/inbox/${encodeURIComponent(projectKey)}/ARBEITSZEIT/submit`, {
          method: "POST",
          body: JSON.stringify(doc),
          headers: { "Content-Type": "application/json" },
        });
        await persist(rows.map((x) => (x.id === row.id ? doc : x)));
        setEditing(doc);
        Alert.alert("Gesendet", "Die Arbeitszeit wurde an die Eingangsprüfung übertragen.");
      } catch (error: any) {
        Alert.alert("Übertragung fehlgeschlagen", String(error?.message || error));
      } finally {
        setBusy(false);
      }
    },
    [busy, employeeId, employeeName, persist, projectKey, rows]
  );

  const action = useMemo(() => {
    if (!editing) return null;
    if (editing.clockState === "NOT_STARTED") return { label: "Arbeitsbeginn", type: "START" as EventType };
    if (editing.clockState === "WORKING") return { label: "Pause beginnen", type: "PAUSE_START" as EventType };
    if (editing.clockState === "PAUSED") return { label: "Arbeit fortsetzen", type: "PAUSE_END" as EventType };
    return null;
  }, [editing]);

  if (editing) {
    const locked = reviewMode || editing.status === "EINGEREICHT" || editing.status === "FREIGEGEBEN";
    const netHours = calculateHours(editing.events);

    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.hero}>
            <Text style={s.eyebrow}>RLC · PERSONAL · GPS ZEITERFASSUNG</Text>
            <Text style={s.h1}>{reviewMode ? "Arbeitszeit prüfen" : "Arbeitszeit erfassen"}</Text>
            <Text style={s.sub}>{projectKey} · {mode === "NUR_APP" ? "Ohne Server" : "Mit Server"}</Text>
          </View>

          <View style={s.identityCard}>
            <Text style={s.label}>Mitarbeiter</Text>
            <Text style={s.identityName}>{editing.employee || employeeName || "Nicht angemeldet"}</Text>
            <Text style={s.meta}>Automatisch aus der Projektanmeldung · nicht manuell änderbar</Text>
          </View>

          <View style={s.card}>
            <Text style={s.sectionTitle}>Zeitstatus</Text>
            <View style={s.statusRow}>
              <View>
                <Text style={s.statusLabel}>{clockStateLabel(editing.clockState)}</Text>
                <Text style={s.meta}>{editing.date}</Text>
              </View>
              <Text style={s.clockValue}>{netHours.toFixed(2).replace(".", ",")} h</Text>
            </View>

            <View style={s.timeGrid}>
              <TimeBox label="Beginn" value={editing.start || "—"} />
              <TimeBox label="Pause" value={`${calculateBreakMinutes(editing.events)} Min.`} />
              <TimeBox label="Ende" value={editing.end || "—"} />
            </View>

            {!locked && action ? (
              <Pressable style={[s.clockButton, busy && s.disabled]} disabled={busy} onPress={() => void registerEvent(action.type)}>
                <Text style={s.clockButtonText}>{busy ? "GPS wird ermittelt …" : action.label}</Text>
              </Pressable>
            ) : null}

            {!locked && editing.clockState === "WORKING" && editing.events.some((x) => x.type === "PAUSE_END") ? (
              <Pressable style={[s.endButton, busy && s.disabled]} disabled={busy} onPress={() => void registerEvent("END")}>
                <Text style={s.clockButtonText}>Arbeitsende</Text>
              </Pressable>
            ) : null}

            {!locked && editing.clockState === "WORKING" && !editing.events.some((x) => x.type === "PAUSE_START") ? (
              <Pressable style={[s.endButton, busy && s.disabled]} disabled={busy} onPress={() => void registerEvent("END")}>
                <Text style={s.clockButtonText}>Arbeitsende ohne Pause</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={s.card}>
            <Text style={s.sectionTitle}>GPS-Zeitbuchungen</Text>
            {editing.events.length ? (
              editing.events.map((event) => (
                <View key={event.id} style={s.eventRow}>
                  <View style={s.eventDot} />
                  <View style={s.eventText}>
                    <Text style={s.eventTitle}>{eventLabel(event.type)} · {event.time}</Text>
                    <Text style={s.meta}>
                      GPS {event.gps.latitude.toFixed(5)}, {event.gps.longitude.toFixed(5)}
                      {event.gps.accuracy != null ? ` · ±${Math.round(event.gps.accuracy)} m` : ""}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={s.meta}>Noch keine Zeitbuchung.</Text>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.sectionTitle}>Tagesnachweis</Text>
            <Field
              label="Tätigkeit / Textbaustein *"
              value={editing.activity}
              editable={!locked}
              onChangeText={(value: string) => setEditing({ ...editing, activity: value })}
              multiline
              placeholder="Ausgeführte Arbeiten"
            />
            <Field
              label="Maschinen"
              value={editing.machines}
              editable={!locked}
              onChangeText={(value: string) => setEditing({ ...editing, machines: value })}
              placeholder="z. B. Mobilbagger, Rüttelplatte"
            />
            <Field
              label="Material / Artikel"
              value={editing.materials}
              editable={!locked}
              onChangeText={(value: string) => setEditing({ ...editing, materials: value })}
              placeholder="Artikel und Mengen"
            />
            <Field
              label="Bemerkung"
              value={editing.note}
              editable={!locked}
              onChangeText={(value: string) => setEditing({ ...editing, note: value })}
              multiline
            />
          </View>

          <View style={s.actions}>
            <Pressable style={s.secondary} onPress={() => setEditing(null)}>
              <Text style={s.secondaryText}>{reviewMode ? "Zurück" : "Schließen"}</Text>
            </Pressable>
            {!locked ? (
              <Pressable style={s.primary} onPress={() => void saveDetails()}>
                <Text style={s.primaryText}>Angaben speichern</Text>
              </Pressable>
            ) : null}
          </View>

          {!reviewMode && editing.clockState === "FINISHED" && editing.status !== "FREIGEGEBEN" ? (
            <Pressable style={[s.submitButton, busy && s.disabled]} disabled={busy} onPress={() => void submit(editing)}>
              <Text style={s.submitButtonText}>{busy ? "Wird übertragen …" : "In Eingangsprüfung einreichen"}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page}>
      <View style={s.listHeader}>
        <View style={s.listHeaderText}>
          <Text style={s.eyebrow}>RLC · PERSONAL</Text>
          <Text style={s.h1}>Arbeitszeiten</Text>
          <Text style={s.sub}>{projectKey} · {mode === "NUR_APP" ? "Inbox (offline)" : "Eingangsprüfung"}</Text>
        </View>
        <Pressable
          style={s.add}
          onPress={() => {
            if (!employeeName) {
              Alert.alert("Mitarbeiter fehlt", "Bitte zuerst im Projekt anmelden.");
              return;
            }
            setEditing(createBlank());
          }}
        >
          <Text style={s.addText}>＋ Starten</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={s.list}
        data={rows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Noch keine Arbeitszeiten</Text>
            <Text style={s.sub}>Mit „Starten“ beginnt die GPS-gestützte Zeiterfassung.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={s.item} onPress={() => setEditing(normalizeRow(item, employeeName))}>
            <View style={s.itemTop}>
              <View>
                <Text style={s.itemTitle}>{item.employee || "Ohne Mitarbeiter"}</Text>
                <Text style={s.meta}>
                  {item.date} · {item.start || "—"}–{item.end || "—"} · {calculateHours(item.events).toFixed(2).replace(".", ",")} h
                </Text>
              </View>
              <Badge status={item.status} />
            </View>
            <Text style={s.activity} numberOfLines={2}>{item.activity || clockStateLabel(item.clockState)}</Text>
            <Text style={s.meta}>GPS-Buchungen: {item.events.length}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function clockStateLabel(state: ClockState) {
  if (state === "WORKING") return "Arbeitszeit läuft";
  if (state === "PAUSED") return "Pause läuft";
  if (state === "FINISHED") return "Arbeitstag beendet";
  return "Noch nicht begonnen";
}

function TimeBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.timeBox}>
      <Text style={s.timeBoxLabel}>{label}</Text>
      <Text style={s.timeBoxValue}>{value}</Text>
    </View>
  );
}

function Field(props: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput
        {...props}
        style={[s.input, props.multiline && s.multiline, props.editable === false && s.inputLocked]}
        placeholderTextColor={COLORS.sub}
      />
    </View>
  );
}

function Badge({ status }: { status: Status }) {
  const map: Record<Status, [string, string]> = {
    DRAFT: ["Entwurf", COLORS.muted],
    EINGEREICHT: ["Eingereicht", COLORS.accent],
    ABGELEHNT: ["Abgelehnt", COLORS.danger],
    FREIGEGEBEN: ["Freigegeben", COLORS.success],
  };
  const [text, color] = map[status] || map.DRAFT;
  return (
    <View style={[s.badge, { backgroundColor: color }]}>
      <Text style={s.badgeText}>{text}</Text>
    </View>
  );
}

const s = createRlcStyles("ArbeitszeitenScreen", {
  page: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  hero: { marginBottom: 14 },
  listHeader: { padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  listHeaderText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 1.1, color: COLORS.accentDark },
  h1: { fontSize: 24, fontWeight: "600", color: COLORS.text, marginTop: 3 },
  sub: { fontSize: 13, color: COLORS.sub, marginTop: 3 },
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  identityCard: { backgroundColor: COLORS.navyDark, borderRadius: 10, padding: 16, marginBottom: 14 },
  identityName: { color: COLORS.textLight, fontSize: 20, fontWeight: "600", marginTop: 5 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text, marginBottom: 12 },
  field: { marginBottom: 13 },
  label: { fontSize: 12, fontWeight: "600", color: COLORS.text, marginBottom: 6 },
  input: { backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, color: COLORS.text, fontSize: 15 },
  inputLocked: { backgroundColor: COLORS.soft, color: COLORS.sub },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  statusLabel: { fontSize: 17, fontWeight: "600", color: COLORS.text },
  clockValue: { fontSize: 24, fontWeight: "600", color: COLORS.accentDark },
  timeGrid: { flexDirection: "row", gap: 8, marginBottom: 14 },
  timeBox: { flex: 1, backgroundColor: COLORS.card2, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, padding: 12 },
  timeBoxLabel: { fontSize: 11, color: COLORS.sub, fontWeight: "600" },
  timeBoxValue: { marginTop: 4, fontSize: 16, color: COLORS.text, fontWeight: "600" },
  clockButton: { backgroundColor: COLORS.accentDark, borderRadius: 9, padding: 15, alignItems: "center" },
  endButton: { backgroundColor: COLORS.danger, borderRadius: 9, padding: 15, alignItems: "center", marginTop: 10 },
  clockButtonText: { color: COLORS.textLight, fontWeight: "600", fontSize: 15 },
  eventRow: { flexDirection: "row", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  eventDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent, marginTop: 5 },
  eventText: { flex: 1 },
  eventTitle: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 2 },
  primary: { flex: 1, backgroundColor: COLORS.accentDark, padding: 14, borderRadius: 9, alignItems: "center" },
  primaryText: { color: COLORS.textLight, fontWeight: "600" },
  secondary: { flex: 1, backgroundColor: COLORS.card, padding: 14, borderRadius: 9, alignItems: "center", borderWidth: 1, borderColor: COLORS.borderStrong },
  secondaryText: { color: COLORS.text, fontWeight: "600" },
  submitButton: { backgroundColor: COLORS.success, borderRadius: 9, padding: 16, alignItems: "center", marginTop: 12 },
  submitButtonText: { color: COLORS.textLight, fontWeight: "600", fontSize: 15 },
  disabled: { opacity: 0.55 },
  add: { backgroundColor: COLORS.accentDark, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 },
  addText: { color: COLORS.textLight, fontWeight: "600" },
  list: { padding: 14, paddingBottom: 40, gap: 10 },
  item: { backgroundColor: COLORS.card, borderRadius: 10, padding: 15, borderWidth: 1, borderColor: COLORS.border, gap: 9 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  itemTitle: { fontSize: 17, fontWeight: "600", color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.sub, marginTop: 2 },
  activity: { fontSize: 14, color: COLORS.text },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeText: { color: COLORS.textLight, fontWeight: "600", fontSize: 10 },
  empty: { padding: 24, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.borderStrong },
  emptyTitle: { fontWeight: "600", fontSize: 17, color: COLORS.text, marginBottom: 4 },
});
