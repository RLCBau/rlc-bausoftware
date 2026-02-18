// apps/mobile/src/screens/ProjectsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Alert,
  TextInput,
  RefreshControl,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import {
  api,
  projectFsKey,
  looksLikeProjectCode,
  extractBaCode,
  Project,
  // @ts-ignore (se non esiste, rimuovi questa riga)
  IS_DEV,
} from "../lib/api";

type Props = NativeStackScreenProps<RootStackParamList, "Projects">;

type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";

type Counter = {
  draft: number;
  eingereicht: number;
  freigegeben: number;
  abgelehnt: number;
};

type ProjectCounters = {
  regie: Counter;
  ls: Counter;
};

const ZERO: Counter = {
  draft: 0,
  eingereicht: 0,
  freigegeben: 0,
  abgelehnt: 0,
};

/** AsyncStorage keys */
const KEY_MODE = "rlc_mobile_mode";
const KEY_LOCAL_PROJECTS = "rlc_mobile_local_projects_v1";

// ✅ CHANGED: scope codemap by mode (prevents mixing NUR_APP <-> SERVER)
const CODEMAP_KEY_BASE = "rlc_project_code_map_v1";

async function loadCodeMap(
  mode: "SERVER_SYNC" | "NUR_APP"
): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(`${CODEMAP_KEY_BASE}:${mode}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function saveCodeMap(
  mode: "SERVER_SYNC" | "NUR_APP",
  map: Record<string, string>
) {
  await AsyncStorage.setItem(
    `${CODEMAP_KEY_BASE}:${mode}`,
    JSON.stringify(map || {})
  );
}

function getBaForProject(
  map: Record<string, string>,
  projectId: string,
  fallback?: string
) {
  return extractBaCode(map?.[projectId] || fallback || "") || "";
}

function titleOf(p: Project) {
  return (
    String((p as any)?.name || "").trim() ||
    String((p as any)?.number || (p as any)?.baustellenNummer || "").trim() ||
    String((p as any)?.code || "").trim() ||
    String((p as any)?.id || "").trim()
  );
}

function subOf(p: Project) {
  const code = String((p as any)?.code || "").trim();
  const num = String(
    (p as any)?.baustellenNummer || (p as any)?.number || ""
  ).trim();
  const ort = String((p as any)?.ort || (p as any)?.place || "").trim();
  const kunde = String((p as any)?.kunde || (p as any)?.client || "").trim();

  const parts = [
    code ? `Code: ${code}` : null,
    num ? `Baustelle: ${num}` : null,
    ort ? `Ort: ${ort}` : null,
    kunde ? `Kunde: ${kunde}` : null,
  ].filter(Boolean);

  return parts.join(" • ");
}

/** ✅ Avoid showing huge HTML pages in Alert (ngrok error pages etc.) */
function humanizeLoadError(e: any) {
  const msg = String(e?.message || "Laden fehlgeschlagen.");
  const lower = msg.toLowerCase();

  if (
    lower.includes("<!doctype html") ||
    lower.includes("<html") ||
    lower.includes("assets.ngrok.com") ||
    lower.includes("ngrok")
  ) {
    return (
      "Server-Antwort ist HTML (kein JSON). Das passiert wenn:\n" +
      "• EXPO_PUBLIC_API_URL falsch ist (z.B. .app statt .dev)\n" +
      "• ngrok läuft, aber forwardet nicht auf :4000\n" +
      "• Backend läuft nicht / Route /api/projects fehlt\n\n" +
      "Bitte prüfe: ngrok Forwarding -> http://localhost:4000 und API_URL."
    );
  }

  if (lower.includes("unexpected token") && lower.includes("<")) {
    return "Antwort ist keine JSON-API (HTML/Text). Prüfe EXPO_PUBLIC_API_URL und ob das Backend erreichbar ist.";
  }

  if (msg.length > 600) return msg.slice(0, 600) + "…";
  return msg;
}

/* ===========================
   Counters (Regie + LS)
=========================== */

function countByStatus(list: any[]): Counter {
  const c: Counter = { ...ZERO };
  for (const r of list || []) {
    const st = String(r?.workflowStatus || "DRAFT") as WorkflowStatus;
    if (st === "EINGEREICHT") c.eingereicht += 1;
    else if (st === "FREIGEGEBEN") c.freigegeben += 1;
    else if (st === "ABGELEHNT") c.abgelehnt += 1;
    else c.draft += 1;
  }
  return c;
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

function regieKeys(projectKey: string) {
  return {
    store: [`rlc_mobile_regie_rows:${projectKey}`],
    inbox: [`rlc_mobile_inbox_regie:${projectKey}`],
  };
}

function lieferscheinKeys(projectKey: string) {
  return {
    store: [
      `rlc_mobile_lieferschein_rows:${projectKey}`,
      `rlc_mobile_ls_rows:${projectKey}`,
    ],
    inbox: [
      `rlc_mobile_inbox_lieferschein:${projectKey}`,
      `rlc_mobile_inbox_ls:${projectKey}`,
    ],
  };
}

async function loadCountersForProject(
  projectKey: string
): Promise<ProjectCounters> {
  const rk = regieKeys(projectKey);
  const lk = lieferscheinKeys(projectKey);

  const [regieStore, regieInbox, lsStore, lsInbox] = await Promise.all([
    loadArrayFromFirstKey(rk.store),
    loadArrayFromFirstKey(rk.inbox),
    loadArrayFromFirstKey(lk.store),
    loadArrayFromFirstKey(lk.inbox),
  ]);

  const regieAll = [
    ...(Array.isArray(regieStore) ? regieStore : []),
    ...(Array.isArray(regieInbox) ? regieInbox : []),
  ];
  const lsAll = [
    ...(Array.isArray(lsStore) ? lsStore : []),
    ...(Array.isArray(lsInbox) ? lsInbox : []),
  ];

  return {
    regie: countByStatus(regieAll),
    ls: countByStatus(lsAll),
  };
}

function sumCounter(c: Counter) {
  return c.draft + c.eingereicht + c.freigegeben + c.abgelehnt;
}

/* ===========================
   Local Projects (NUR_APP)
=========================== */

type LocalProject = {
  id: string; // local id
  name: string;
  code?: string; // BA-...
  baustellenNummer?: string;
  ort?: string;
  kunde?: string;
  createdAt: number;
};

async function loadLocalProjects(): Promise<LocalProject[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LOCAL_PROJECTS);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as LocalProject[]) : [];
  } catch {
    return [];
  }
}
async function saveLocalProjects(list: LocalProject[]) {
  await AsyncStorage.setItem(KEY_LOCAL_PROJECTS, JSON.stringify(list || []));
}

function localToProject(lp: LocalProject): Project {
  return {
    id: lp.id,
    name: lp.name,
    code: lp.code,
    baustellenNummer: lp.baustellenNummer,
    ort: lp.ort,
    kunde: lp.kunde,
  } as any;
}

function makeLocalId() {
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** ✅ FlatList keys: make them unique even if backend returns duplicate ids */
function listKeyOf(p: Project, index: number) {
  const base = String((p as any)?.id || projectFsKey(p) || "").trim() || "row";
  // index suffix prevents React "same key" warning when duplicates exist
  return `${base}__${index}`;
}

/* ===========================
   Screen
=========================== */

export default function ProjectsScreen({ navigation }: Props) {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");

  const isStandalone = mode === ("NUR_APP" as any);

  // ✅ BA code map state (scoped by mode)
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});

  // editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // ✅ when user tapped a project without BA-code, we remember and navigate right after saving
  const [pendingOpen, setPendingOpen] = useState<Project | null>(null);

  // counters[fsKey] = { regie, ls }
  const [counters, setCounters] = useState<Record<string, ProjectCounters>>({});
  const countersReqId = useRef(0);

  const readMode = useCallback(async (): Promise<"SERVER_SYNC" | "NUR_APP"> => {
    try {
      const m = (await AsyncStorage.getItem(KEY_MODE)) as any;
      if (m === "NUR_APP" || m === "SERVER_SYNC") {
        setMode(m);
        return m;
      }
    } catch {}

    // ✅ FIX: always keep state consistent with returned fallback
    setMode("SERVER_SYNC");
    return "SERVER_SYNC";
  }, []);

  const readCodeMap = useCallback(async (m: "SERVER_SYNC" | "NUR_APP") => {
    const map = await loadCodeMap(m);
    setCodeMap(map || {});
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      // always re-check mode (in case user switched)
      const mNow = await readMode();

      // always refresh code map (scoped)
      await readCodeMap(mNow);

      // STANDALONE: load local projects
      if (mNow === "NUR_APP") {
        const local = await loadLocalProjects();
        const arr = local.map(localToProject);
        setItems(arr);

        const myReq = ++countersReqId.current;
        const next: Record<string, ProjectCounters> = {};
        const slice = arr.slice(0, 30);

        await Promise.all(
          slice.map(async (p) => {
            const key = projectFsKey(p);
            try {
              next[key] = await loadCountersForProject(key);
            } catch {
              next[key] = { regie: { ...ZERO }, ls: { ...ZERO } };
            }
          })
        );

        if (myReq === countersReqId.current) {
          setCounters((prev) => ({ ...prev, ...next }));
        }

        return;
      }

      // SERVER_SYNC: load from api
      const list = await api.projects();
      const arr = Array.isArray(list) ? list : [];
      setItems(arr);

      const myReq = ++countersReqId.current;
      const next: Record<string, ProjectCounters> = {};

      const slice = arr.slice(0, 30);
      await Promise.all(
        slice.map(async (p) => {
          const key = projectFsKey(p);
          try {
            next[key] = await loadCountersForProject(key);
          } catch {
            next[key] = { regie: { ...ZERO }, ls: { ...ZERO } };
          }
        })
      );

      if (myReq === countersReqId.current) {
        setCounters((prev) => ({ ...prev, ...next }));
      }
    } catch (e: any) {
      Alert.alert("Projekte", humanizeLoadError(e));
    } finally {
      setLoading(false);
    }
  }, [readMode, readCodeMap]);

  useEffect(() => {
    (async () => {
      const m = await readMode();
      await readCodeMap(m);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s2 = String(q || "").trim().toLowerCase();
    if (!s2) return items;

    return items.filter((p) => {
      const blob = [
        (p as any).id,
        (p as any).code,
        (p as any).name,
        (p as any).number,
        (p as any).baustellenNummer,
        (p as any).ort,
        (p as any).place,
        (p as any).kunde,
        (p as any).client,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return blob.includes(s2);
    });
  }, [items, q]);

  const goBackSafe = useCallback(() => {
    if (navigation.canGoBack()) return navigation.goBack();
    navigation.replace("Login", { mode } as any);
  }, [navigation, mode]);

  const openProject = useCallback(
    async (p: Project) => {
      const projectId = String((p as any)?.id || "").trim();
      if (!projectId) {
        Alert.alert("Projekt", "Projekt-ID fehlt.");
        return;
      }

      // ✅ BA code from map first, fallback to p.code
      const baCode = getBaForProject(
        codeMap,
        projectId,
        String((p as any)?.code || "")
      );
      const codeOk = looksLikeProjectCode(baCode);

      // ✅ SERVER_SYNC: se BA mancante/errato -> resta qui e chiedi BA
      if (!isStandalone && !codeOk) {
        const current = getBaForProject(
          codeMap,
          projectId,
          String((p as any)?.code || "")
        );
        setEditingId(projectId);
        setEditingValue(current);
        setPendingOpen(p); // ✅ remember: user wanted to open THIS project
        return;
      }

      navigation.navigate("ProjectHome", {
        projectId,
        projectCode: baCode || undefined,
        title: titleOf(p),
      });
    },
    [navigation, codeMap, isStandalone]
  );

  const ensureCounters = useCallback(
    async (fsKey: string) => {
      if (!fsKey) return;
      if (counters[fsKey]) return;

      const myReq = ++countersReqId.current;
      try {
        const c = await loadCountersForProject(fsKey);
        if (myReq === countersReqId.current) {
          setCounters((prev) => ({ ...prev, [fsKey]: c }));
        }
      } catch {
        if (myReq === countersReqId.current) {
          setCounters((prev) => ({
            ...prev,
            [fsKey]: { regie: { ...ZERO }, ls: { ...ZERO } },
          }));
        }
      }
    },
    [counters]
  );

  const onCreateLocalProject = useCallback(async () => {
    try {
      const nameDefault = `Projekt ${new Date().getFullYear()}`;
      const id = makeLocalId();

      const lp: LocalProject = {
        id,
        name: nameDefault,
        createdAt: Date.now(),
      };

      const list = await loadLocalProjects();
      const next = [lp, ...(Array.isArray(list) ? list : [])];
      await saveLocalProjects(next);

      const p = localToProject(lp);
      setItems((prev) => [p, ...prev]);

      // open immediately
      await openProject(p);
    } catch (e: any) {
      Alert.alert(
        "Projekt",
        e?.message || "Lokales Projekt konnte nicht erstellt werden."
      );
    }
  }, [openProject]);

  const startEdit = useCallback(
    (p: Project) => {
      const projectId = String((p as any)?.id || "").trim();
      if (!projectId) return;

      const current = getBaForProject(
        codeMap,
        projectId,
        String((p as any)?.code || "")
      );
      setEditingId(projectId);
      setEditingValue(current);
      setPendingOpen(null); // manual edit does not auto-open
    },
    [codeMap]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingValue("");
    setPendingOpen(null);
  }, []);

  const saveEdit = useCallback(
    async (p: Project) => {
      const projectId = String((p as any)?.id || "").trim();
      if (!projectId) return;

      const ba = extractBaCode(editingValue) || "";

      const next = { ...(codeMap || {}) };
      next[projectId] = ba;
      setCodeMap(next);

      // ✅ save codemap scoped by current mode
      await saveCodeMap(mode, next);

      // optional: if local project, persist into local projects list too
      if (/^local-/i.test(projectId)) {
        try {
          const list = await loadLocalProjects();
          const updated = (list || []).map((x) =>
            x.id === projectId ? { ...x, code: ba } : x
          );
          await saveLocalProjects(updated);
        } catch {}
      }

      setEditingId(null);
      setEditingValue("");

      // ✅ snapshot pendingOpen BEFORE we clear it
      const pending = pendingOpen;
      const shouldAutoOpen =
        pending && String((pending as any)?.id || "").trim() === projectId;

      setPendingOpen(null);

      if (shouldAutoOpen && looksLikeProjectCode(ba)) {
        navigation.navigate("ProjectHome", {
          projectId,
          projectCode: ba || undefined,
          title: titleOf(pending as any),
        });
      }
    },
    [codeMap, editingValue, pendingOpen, navigation, mode]
  );

  function StatPill({
    label,
    c,
    kind,
  }: {
    label: string;
    c: Counter;
    kind: "REGIE" | "LS";
  }) {
    const total = sumCounter(c);
    const accent = kind === "REGIE" ? "#0B57D0" : "#1A7F37";

    return (
      <View style={s.pill}>
        <View style={[s.pillDot, { backgroundColor: accent }]} />
        <Text style={s.pillLabel}>{label}</Text>
        <View style={s.pillNums}>
          {total > 0 ? (
            <>
              {c.draft > 0 ? (
                <Text style={s.pillNumMuted}>D {c.draft}</Text>
              ) : null}
              {c.eingereicht > 0 ? (
                <Text style={s.pillNumBlue}>E {c.eingereicht}</Text>
              ) : null}
              {c.freigegeben > 0 ? (
                <Text style={s.pillNumGreen}>F {c.freigegeben}</Text>
              ) : null}
              {c.abgelehnt > 0 ? (
                <Text style={s.pillNumRed}>A {c.abgelehnt}</Text>
              ) : null}
            </>
          ) : (
            <Text style={s.pillNumMuted}>0</Text>
          )}
        </View>
      </View>
    );
  }

  function renderItem({ item }: { item: Project }) {
    const projectId = String((item as any)?.id || "").trim();

    // ✅ BA from map (preferred) else item.code
    const baCode = getBaForProject(
      codeMap,
      projectId,
      String((item as any)?.code || "")
    );
    const codeOk = looksLikeProjectCode(baCode);

    // counters should follow FS policy (prefer BA if available, else uuid/local id)
    const fsKey = codeOk ? baCode : projectFsKey(item);

    if (fsKey && !counters[fsKey]) {
      ensureCounters(fsKey);
    }

    const c = counters[fsKey] || { regie: { ...ZERO }, ls: { ...ZERO } };
    const isEditing = editingId === projectId;

    return (
      <Pressable style={s.card} onPress={() => openProject(item)}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              {titleOf(item)}
            </Text>
            <Text style={s.sub} numberOfLines={2}>
              {subOf(item) || `FS-Key: ${fsKey}`}
            </Text>
          </View>

          {baCode ? (
            <View
              style={[s.badge, { borderColor: codeOk ? "#1a7f37" : "#c33" }]}
            >
              <Text style={[s.badgeTxt, { color: codeOk ? "#1a7f37" : "#c33" }]}>
                {codeOk ? "BA" : "CODE?"}
              </Text>
            </View>
          ) : (
            <View style={[s.badge, { borderColor: "#999" }]}>
              <Text style={[s.badgeTxt, { color: "#999" }]}>—</Text>
            </View>
          )}
        </View>

        {/* ✅ NEW: BA-Code editor row */}
        <View style={s.codeRow}>
          <Text style={s.codeLabel}>BA-Code</Text>

          {isEditing ? (
            <View style={s.codeEditWrap}>
              <TextInput
                value={editingValue}
                onChangeText={setEditingValue}
                placeholder="BA-2025-DEMO"
                autoCapitalize="characters"
                style={s.codeInput}
              />

              <Pressable
                style={s.codeBtn}
                onPress={(e: any) => {
                  // prevent card navigation
                  e?.stopPropagation?.();
                  saveEdit(item);
                }}
              >
                <Text style={s.codeBtnTxt}>Speichern</Text>
              </Pressable>

              <Pressable
                style={[s.codeBtn, s.codeBtnGhost]}
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  cancelEdit();
                }}
              >
                <Text style={[s.codeBtnTxt, s.codeBtnGhostTxt]}>Abbrechen</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.codeViewWrap}>
              <Text
                style={[
                  s.codeValue,
                  !codeOk && baCode ? { color: "#C33" } : null,
                ]}
              >
                {baCode || "Nicht gesetzt"}
              </Text>

              <Pressable
                style={s.codeBtn}
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  startEdit(item);
                }}
              >
                <Text style={s.codeBtnTxt}>{baCode ? "Ändern" : "Setzen"}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={s.statsRow}>
          <StatPill label="Regie" c={c.regie} kind="REGIE" />
          <StatPill label="Lieferschein" c={c.ls} kind="LS" />
        </View>

        {!codeOk && baCode ? (
          <Text style={s.warn}>
            Hinweis: BA-Code ist ungültig. Verwende Format BA-YYYY-XXX.
          </Text>
        ) : null}
      </Pressable>
    );
  }

  const listEmpty = filtered.length === 0;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.bg}>
        <View style={s.header}>
          <View style={s.headerRow}>
            <Pressable onPress={goBackSafe} style={s.backBtn}>
              <Text style={s.backTxt}>Projekt</Text>
            </Pressable>

            <View style={{ flex: 1 }} />
            {isStandalone ? (
              <View style={s.modePill}>
                <Text style={s.modeTxt}>NUR_APP</Text>
              </View>
            ) : (
              <View style={s.modePill}>
                <Text style={s.modeTxt}>SERVER</Text>
              </View>
            )}
          </View>

          <Text style={s.brandTop}>RLC Bausoftware</Text>
          <Text style={s.brandSub}>mobile</Text>
          <Text style={s.h1}>Projekte</Text>

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Suchen (Code, Name, Ort, Kunde …)"
            placeholderTextColor="rgba(255,255,255,0.65)"
            style={s.search}
            autoCapitalize="none"
          />

          {isStandalone && listEmpty ? (
            <View style={{ marginTop: 12 }}>
              <Pressable
                style={s.ctaBtn}
                onPress={onCreateLocalProject}
                disabled={loading}
              >
                <Text style={s.ctaTxt}>
                  {loading ? "Bitte warten..." : "Projekt lokal erstellen"}
                </Text>
              </Pressable>
              <Text style={s.ctaHint}>
                Offline-Modus: Projekte werden lokal gespeichert. Sync ist
                deaktiviert.
              </Text>
            </View>
          ) : null}
        </View>

        {/* ✅ LIST */}
        <View style={s.listWrap}>
          <FlatList
            data={filtered}
            // ✅ IMPORTANT: always unique keys (fixes "same key" warning if backend duplicates ids)
            keyExtractor={(x, i) => listKeyOf(x, i)}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingVertical: 12,
              gap: 12,
              paddingBottom: 28,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={load}
                tintColor="#fff"
              />
            }
            ListEmptyComponent={
              <View style={{ paddingVertical: 24 }}>
                <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                  {isStandalone
                    ? "Keine lokalen Projekte. Erstelle ein Projekt oben."
                    : "Keine Projekte gefunden. Ziehe zum Aktualisieren nach unten."}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ===========================
// Styles
// ===========================

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  bg: { flex: 1, backgroundColor: "#0B1720" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "#0B1720",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
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
  modeTxt: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "900",
    fontSize: 12,
  },

  brandTop: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontWeight: "800",
  },
  brandSub: {
    color: "rgba(255,255,255,0.60)",
    marginTop: 2,
    fontSize: 12,
    fontWeight: "800",
  },

  h1: { marginTop: 10, fontSize: 34, fontWeight: "900", color: "#fff" },

  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }),
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  ctaBtn: {
    marginTop: 4,
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  ctaTxt: { color: "#fff", fontWeight: "900" },
  ctaHint: {
    marginTop: 8,
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "700",
  },

  listWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: "900", color: "#0B1720" },
  sub: { marginTop: 6, opacity: 0.75, fontWeight: "700", color: "#0B1720" },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#fff",
  },
  badgeTxt: { fontSize: 11, fontWeight: "900" },

  // ✅ BA-Code row styles
  codeRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(11,23,32,0.08)",
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(11,23,32,0.70)",
  },

  codeViewWrap: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  codeValue: {
    flex: 1,
    fontWeight: "900",
    color: "#0B1720",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(11,23,32,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,23,32,0.08)",
  },

  codeEditWrap: {
    marginTop: 8,
    gap: 10,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: "rgba(11,23,32,0.16)",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }),
    fontWeight: "900",
    color: "#0B1720",
  },

  codeBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111",
  },
  codeBtnTxt: { color: "#fff", fontWeight: "900" },

  codeBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(11,23,32,0.20)",
  },
  codeBtnGhostTxt: { color: "#0B1720" },

  statsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(11,23,32,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,23,32,0.08)",
  },
  pillDot: { width: 8, height: 8, borderRadius: 99 },
  pillLabel: { fontSize: 12, fontWeight: "900", color: "#0B1720" },

  pillNums: { flexDirection: "row", alignItems: "center", gap: 8 },
  pillNumMuted: {
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(11,23,32,0.55)",
  },
  pillNumBlue: { fontSize: 12, fontWeight: "900", color: "#0B57D0" },
  pillNumGreen: { fontSize: 12, fontWeight: "900", color: "#1A7F37" },
  pillNumRed: { fontSize: 12, fontWeight: "900", color: "#C33" },

  warn: { marginTop: 10, color: "#c33", fontSize: 12, fontWeight: "800" },
});
