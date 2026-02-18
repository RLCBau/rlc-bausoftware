// apps/mobile/src/screens/LvReadOnlyScreen.tsx
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  SafeAreaView,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { getSession, SessionRole } from "../storage/session";
import { resolveProjectCode, looksLikeProjectCode } from "../lib/api";
import { getAuthMode, type AuthMode } from "../lib/auth";

type Props = NativeStackScreenProps<RootStackParamList, "LvReadOnly">;

type LvItem = {
  id?: string;
  position?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
  einzelpreis?: number;
  gesamt?: number;
  kategorie?: string;
};

const API_BASE = (process.env as any).EXPO_PUBLIC_API_URL || "http://localhost:4000";

// ✅ cache MUST be per project CODE (BA-...), not UUID
const keyLv = (projectKey: string) => `rlc.project.lv.${projectKey}`;

type FilterMode = "ALL" | "POS" | "KURZ" | "LANG";

function canLvRead(role?: SessionRole) {
  return (
    role === "BAULEITER" ||
    role === "ABRECHNUNG" ||
    role === "BUERO" ||
    role === "POLIER" ||
    role === "VERMESSUNG"
  );
}

function fmtNum(n: any) {
  if (typeof n !== "number") return "—";
  return String(n);
}

async function fetchWithTimeout(url: string, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

/* =========================
   UI tokens (aligned to dark ProjectHome / TeamRoles)
========================= */
const UI = {
  bg: "#0B1720",
  panel: "rgba(255,255,255,0.96)",
  panelBorder: "rgba(0,0,0,0.06)",

  white: "#fff",
  textOnDark: "rgba(255,255,255,0.90)",
  textOnDarkMuted: "rgba(255,255,255,0.62)",
  textOnDarkMuted2: "rgba(255,255,255,0.52)",

  text: "#0B1720",
  muted: "rgba(11,23,32,0.62)",
  muted2: "rgba(11,23,32,0.52)",

  line: "rgba(11,23,32,0.10)",
  lineStrong: "rgba(11,23,32,0.18)",

  primary: "#2563EB",
  primaryText: "#fff",

  chipBg: "#fff",
  chipActiveBg: "#2563EB",
  chipActiveText: "#fff",

  dangerBg: "rgba(234,88,12,0.14)",
  dangerBorder: "rgba(234,88,12,0.35)",
  dangerText: "#FDBA74",
};

function shadowElev() {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  }) as any;
}

export default function LvReadOnlyScreen({ route, navigation }: Props) {
  const { projectId, title } = route.params;

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || "LV" });
  }, [title, navigation]);

  // ✅ auth mode (NUR_APP vs SERVER_SYNC)
  const [mode, setMode] = useState<AuthMode>("NUR_APP");
  const canServer = useMemo(() => mode === "SERVER_SYNC", [mode]);

  async function loadAuthMode() {
    try {
      const m = await getAuthMode(); // ✅ from auth.ts
      setMode(m);
    } catch {
      setMode("NUR_APP");
    }
  }

  // ✅ resolve UUID -> BA-... for display + correct endpoints + cache key
  const [projectCode, setProjectCode] = useState<string>("");
  const effectiveProjectKey = useMemo(() => {
    const c = String(projectCode || "").trim();
    return looksLikeProjectCode(c) ? c : String(projectId || "").trim();
  }, [projectCode, projectId]);

  const [q, setQ] = useState("");
  const [items, setItems] = useState<LvItem[]>([]);
  const [meta, setMeta] = useState<{ ts?: number; version?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState<SessionRole | undefined>(undefined);
  const [filterMode, setFilterMode] = useState<FilterMode>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const allowed = useMemo(() => canLvRead(role), [role]);

  async function ensureProjectCode() {
    // ✅ offline: never try server resolving
    if (!canServer) return;
    if (looksLikeProjectCode(projectCode)) return;

    try {
      const pk = await resolveProjectCode(projectId);
      if (looksLikeProjectCode(pk)) setProjectCode(pk);
    } catch {
      // ignore
    }
  }

  async function loadSession() {
    // session can be stored under code; fallback UUID
    const s = (await getSession(effectiveProjectKey)) || (await getSession(projectId));
    setRole(s?.role);
  }

  async function loadCache() {
    try {
      const raw = await AsyncStorage.getItem(keyLv(effectiveProjectKey));
      if (!raw) {
        // fallback: try legacy UUID key, then migrate to code-key
        const legacy = await AsyncStorage.getItem(keyLv(projectId));
        if (!legacy) {
          setItems([]);
          setMeta(null);
          return;
        }
        const legacyData = JSON.parse(legacy);
        const list = Array.isArray(legacyData?.items) ? legacyData.items : [];
        const payload = {
          ts: legacyData?.ts || Date.now(),
          version: String(legacyData?.version || "1"),
          items: list,
        };
        await AsyncStorage.setItem(keyLv(effectiveProjectKey), JSON.stringify(payload));
        setItems(list);
        setMeta({ ts: payload.ts, version: payload.version });
        return;
      }

      const data = JSON.parse(raw);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setMeta({ ts: data?.ts, version: data?.version });
    } catch {
      setItems([]);
      setMeta(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      // ✅ 1) mode first
      loadAuthMode().then(() => {
        // ✅ 2) resolve BA code only if server mode
        ensureProjectCode();
      });

      // ✅ local always
      loadSession();
      loadCache();
    }, [projectId, effectiveProjectKey, canServer])
  );

  async function downloadLv() {
    if (!allowed) {
      Alert.alert(
        "LV",
        "Kein Zugriff. LV ist nur für Bauleiter, Abrechnung, Büro, Polier und Vermessung sichtbar."
      );
      return;
    }

    // ✅ OFFLINE MODE: no server download
    if (!canServer) {
      Alert.alert(
        "LV (Offline)",
        "Du bist im Modus „Ohne Server“. LV Download ist deaktiviert.\n\nWenn du ein LV offline brauchst, wechsle in „Server Sync“, lade es einmal herunter und dann ist es im Cache verfügbar."
      );
      return;
    }

    // must have code for server FS routes
    if (!looksLikeProjectCode(effectiveProjectKey)) {
      await ensureProjectCode();
      if (!looksLikeProjectCode(effectiveProjectKey)) {
        Alert.alert("LV", "Projekt-Code (BA-YYYY-...) konnte nicht ermittelt werden.");
        return;
      }
    }

    setBusy(true);
    try {
      // ✅ server should read by projectKey (BA-...), not UUID
      const url = `${API_BASE}/api/project-lv/${effectiveProjectKey}`;
      const r = await fetchWithTimeout(url, 15000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const json = await r.json();

      const list: LvItem[] =
        (Array.isArray(json?.items) && json.items) ||
        (Array.isArray(json?.positions) && json.positions) ||
        (Array.isArray(json?.data) && json.data) ||
        [];

      const payload = {
        ts: Date.now(),
        version: String(json?.version || json?.lvVersion || "1"),
        items: list,
      };

      await AsyncStorage.setItem(keyLv(effectiveProjectKey), JSON.stringify(payload));
      setItems(list);
      setMeta({ ts: payload.ts, version: payload.version });

      Alert.alert("LV", "LV wurde offline gespeichert.");
    } catch (e: any) {
      const msg =
        e?.name === "AbortError" ? "Timeout. Bitte Verbindung prüfen." : e?.message || "Download fehlgeschlagen";
      Alert.alert("LV", msg);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter((it) => {
      const p = (it.position || "").toLowerCase();
      const k = (it.kurztext || "").toLowerCase();
      const l = (it.langtext || "").toLowerCase();

      if (filterMode === "POS") return p.includes(s);
      if (filterMode === "KURZ") return k.includes(s);
      if (filterMode === "LANG") return l.includes(s);

      return p.includes(s) || k.includes(s) || l.includes(s);
    });
  }, [q, items, filterMode]);

  const cacheInfo = useMemo(() => {
    const t = meta?.ts ? new Date(meta.ts).toLocaleString() : "nicht vorhanden";
    const v = meta?.version ? ` • v${meta.version}` : "";
    return `Cache: ${t}${v}`;
  }, [meta]);

  const codeLine = useMemo(() => {
    const c = looksLikeProjectCode(projectCode) ? projectCode : "";
    return c ? c : "—";
  }, [projectCode]);

  if (!allowed) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.bg}>
          <View style={s.centerWrap}>
            <View style={s.lockCard}>
              <View style={s.lockHead}>
                <View style={s.accentBar} />
                <Text style={s.lockTitle}>Kein Zugriff</Text>
              </View>
              <Text style={s.lockText}>
                LV ist nur für Bauleiter, Abrechnung, Büro, Polier und Vermessung sichtbar.
              </Text>
              <Text style={s.lockText2}>Melde dich mit einer berechtigten Rolle an.</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.bg}>
          <FlatList
            data={filtered}
            keyExtractor={(it, idx) => (it.id || it.position || String(idx)) + ":" + idx}
            contentContainerStyle={s.listPad}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={s.headerWrap}>
                {/* ===== Dark header like ProjectHome/TeamRoles ===== */}
                <View style={s.topHeader}>
                  <View style={s.hRow}>
                    <View style={s.accentBarDark} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.brandTop}>RLC Bausoftware</Text>
                      <Text style={s.brandSub}>Leistungsverzeichnis</Text>
                      <Text style={s.h1}>LV (Read Only)</Text>
                      <Text style={s.hSub}>
                        Nur Lesen • Offline Cache • Modus:{" "}
                        <Text style={{ fontWeight: "900" }}>{mode === "SERVER_SYNC" ? "Server Sync" : "Ohne Server"}</Text>
                      </Text>
                    </View>
                  </View>

                  <View style={s.badgeRow}>
                    <View style={s.badgeDark}>
                      <Text style={s.badgeDarkTxt}>
                        Code: <Text style={{ fontWeight: "900" }}>{codeLine}</Text>
                      </Text>
                    </View>
                    <View style={s.badgeDark}>
                      <Text style={s.badgeDarkTxt} numberOfLines={1}>
                        ID: <Text style={{ fontWeight: "900" }}>{String(projectId)}</Text>
                      </Text>
                    </View>
                    <View style={[s.badgeDark, items.length ? s.badgeOkDark : s.badgeEmptyDark]}>
                      <Text style={s.badgeDarkTxt}>{items.length ? "Cache" : "Leer"}</Text>
                    </View>
                  </View>
                </View>

                {/* ===== White panel ===== */}
                <View style={s.panel}>
                  <Text style={s.metaSmall}>{cacheInfo}</Text>

                  {!canServer ? (
                    <View style={s.offlineWarn}>
                      <Text style={s.offlineWarnTitle}>Ohne Server</Text>
                      <Text style={s.offlineWarnText}>
                        In diesem Modus wird nichts vom Server geladen. Du kannst nur den Cache anzeigen.
                      </Text>
                    </View>
                  ) : null}

                  <View style={s.actionsRow}>
                    <Pressable
                      style={[
                        s.btn,
                        s.btnPrimary,
                        (busy || !canServer) && { opacity: 0.55 },
                      ]}
                      onPress={downloadLv}
                      disabled={busy || !canServer}
                    >
                      <Text style={s.btnPrimaryTxt}>
                        {busy ? "Lädt..." : canServer ? "LV offline speichern" : "LV Download (Server)"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[s.btn, s.btnOutline, busy && { opacity: 0.7 }]}
                      onPress={loadCache}
                      disabled={busy}
                    >
                      <Text style={s.btnOutlineTxt}>Cache laden</Text>
                    </Pressable>
                  </View>

                  <View style={s.chipsRow}>
                    <FilterChip label="Alles" active={filterMode === "ALL"} onPress={() => setFilterMode("ALL")} />
                    <FilterChip label="Position" active={filterMode === "POS"} onPress={() => setFilterMode("POS")} />
                    <FilterChip label="Kurztext" active={filterMode === "KURZ"} onPress={() => setFilterMode("KURZ")} />
                    <FilterChip label="Langtext" active={filterMode === "LANG"} onPress={() => setFilterMode("LANG")} />
                  </View>

                  <TextInput
                    value={q}
                    onChangeText={setQ}
                    placeholder="Suchen (Position, Kurztext, Langtext)…"
                    style={s.search}
                    placeholderTextColor="rgba(11,23,32,0.45)"
                    autoCorrect={false}
                    autoCapitalize="none"
                    blurOnSubmit={false}
                  />

                  <Text style={s.sectionTitle}>
                    {items.length ? `Positionen (${filtered.length})` : "Keine Daten"}
                  </Text>
                </View>
              </View>
            }
            renderItem={({ item, index }) => {
              const key = item.id || item.position || String(index);
              const isOpen = openId === key;

              return (
                <Pressable style={[s.card, isOpen && s.cardOpen]} onPress={() => setOpenId(isOpen ? null : key)}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pos}>
                        {item.position || "—"}
                        {item.einheit ? <Text style={s.unit}>  ({item.einheit})</Text> : null}
                      </Text>
                      <Text style={s.kurz} numberOfLines={isOpen ? 20 : 2}>
                        {item.kurztext || "—"}
                      </Text>
                    </View>

                    <View style={s.chev}>
                      <Text style={s.chevTxt}>{isOpen ? "–" : "+"}</Text>
                    </View>
                  </View>

                  {isOpen ? (
                    <>
                      {item.kategorie ? (
                        <View style={s.katRow}>
                          <Text style={s.katLabel}>Kategorie</Text>
                          <Text style={s.katValue}>{item.kategorie}</Text>
                        </View>
                      ) : null}

                      <View style={s.div} />

                      {item.langtext ? (
                        <Text style={s.lang}>{item.langtext}</Text>
                      ) : (
                        <Text style={s.langEmpty}>Kein Langtext vorhanden.</Text>
                      )}

                      <View style={s.div} />

                      <View style={s.metrics}>
                        <Metric label="Menge" value={fmtNum(item.menge)} />
                        <Metric label="EP" value={fmtNum(item.einzelpreis)} />
                        <Metric label="GP" value={fmtNum(item.gesamt)} />
                      </View>

                      <Text style={s.tapHint}>Tippen zum Zuklappen</Text>
                    </>
                  ) : (
                    <Text style={s.tapHint}>Tippen für Details</Text>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 24, paddingHorizontal: 16 }}>
                <Text style={s.empty}>
                  {items.length === 0 ? "Kein LV im Cache. (Server Sync: einmal herunterladen)" : "Keine Treffer."}
                </Text>
              </View>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        active ? { backgroundColor: UI.chipActiveBg, borderColor: UI.chipActiveBg } : null,
      ]}
    >
      <Text style={[s.chipTxt, active ? { color: UI.chipActiveText, opacity: 1 } : null]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metricBox}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  bg: { flex: 1, backgroundColor: UI.bg },

  listPad: { paddingBottom: 26 },

  headerWrap: { paddingBottom: 10 },
  topHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  hRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accentBarDark: { width: 8, height: 44, borderRadius: 8, backgroundColor: UI.primary },

  brandTop: { color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: "800" },
  brandSub: { color: "rgba(255,255,255,0.60)", marginTop: 2, fontSize: 12, fontWeight: "800" },

  h1: { marginTop: 8, fontSize: 30, fontWeight: "900", color: "#fff" },
  hSub: { marginTop: 4, fontWeight: "800", color: UI.textOnDarkMuted, fontSize: 12 },

  badgeRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  badgeDark: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  badgeDarkTxt: { fontWeight: "900", color: UI.textOnDark, fontSize: 12 },
  badgeOkDark: { borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.14)" },
  badgeEmptyDark: { borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.06)" },

  panel: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: UI.panel,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.panelBorder,
    ...shadowElev(),
  },

  metaSmall: { fontSize: 12, color: UI.muted, fontWeight: "800" },

  offlineWarn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: UI.dangerBorder,
    backgroundColor: UI.dangerBg,
    borderRadius: 14,
    padding: 12,
  },
  offlineWarnTitle: { fontWeight: "900", color: UI.dangerText },
  offlineWarnText: { marginTop: 6, fontWeight: "800", color: "rgba(11,23,32,0.70)" },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },

  btn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: UI.primary, borderWidth: 1, borderColor: UI.primary },
  btnPrimaryTxt: { color: UI.primaryText, fontWeight: "900", fontSize: 13 },

  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(37,99,235,0.35)" },
  btnOutlineTxt: { color: UI.primary, fontWeight: "900", fontSize: 13 },

  chipsRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: UI.lineStrong,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: UI.chipBg,
  },
  chipTxt: { fontWeight: "900", color: UI.text, opacity: 0.78, fontSize: 12 },

  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.22)",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontWeight: "900",
    color: UI.text,
  },

  sectionTitle: { marginTop: 14, fontWeight: "900", color: UI.text, opacity: 0.92 },

  card: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: UI.panel,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.panelBorder,
    ...shadowElev(),
  },
  cardOpen: { borderColor: "rgba(0,0,0,0.12)" },

  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  pos: { fontWeight: "900", fontSize: 16, color: UI.text },
  unit: { fontWeight: "800", color: UI.muted, fontSize: 13 },
  kurz: { marginTop: 6, fontWeight: "900", color: UI.text, opacity: 0.92 },

  chev: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.25)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.10)",
  },
  chevTxt: { fontWeight: "900", fontSize: 18, color: UI.primary, opacity: 0.95 },

  katRow: { marginTop: 12 },
  katLabel: { fontSize: 12, fontWeight: "900", color: UI.muted2 },
  katValue: { marginTop: 3, fontSize: 13, fontWeight: "900", color: UI.text, opacity: 0.92 },

  div: { height: 1, backgroundColor: UI.line, marginTop: 12 },

  lang: { marginTop: 12, color: UI.text, opacity: 0.78, lineHeight: 18, fontWeight: "700" },
  langEmpty: { marginTop: 12, color: UI.muted, fontStyle: "italic", fontWeight: "800" },

  metrics: { flexDirection: "row", gap: 10, marginTop: 12 },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI.line,
    backgroundColor: "rgba(37,99,235,0.06)",
    borderRadius: 14,
    padding: 10,
  },
  metricLabel: { fontSize: 11, fontWeight: "900", color: UI.muted2 },
  metricValue: { marginTop: 4, fontSize: 14, fontWeight: "900", color: UI.text },

  tapHint: { marginTop: 10, color: UI.muted, fontWeight: "900", opacity: 0.65, fontSize: 12 },
  empty: { color: "rgba(255,255,255,0.72)", textAlign: "center", fontWeight: "900" },

  centerWrap: { flex: 1, padding: 16, justifyContent: "center" },
  lockCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: UI.panelBorder,
    ...shadowElev(),
  },
  lockHead: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 10 },
  accentBar: { width: 6, height: 22, borderRadius: 6, backgroundColor: UI.primary },
  lockTitle: { fontSize: 18, fontWeight: "900", color: UI.text },
  lockText: { marginTop: 8, color: UI.text, opacity: 0.78, fontWeight: "800" },
  lockText2: { marginTop: 6, color: UI.muted, fontWeight: "800" },
});
