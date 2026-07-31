// apps/mobile/src/screens/ProjectsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, SafeAreaView, Alert, TextInput, RefreshControl, Platform, Modal, KeyboardAvoidingView, ScrollView, Keyboard, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { api, projectFsKey, looksLikeProjectCode, extractBaCode, Project,
// @ts-ignore (se non esiste, rimuovi questa riga)
IS_DEV } from "../lib/api";
import { COLORS, createRlcStyles } from "../ui/theme";
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
  abgelehnt: 0
};

/** AsyncStorage keys */
const KEY_MODE = "rlc_mobile_mode";
const KEY_LOCAL_PROJECTS = "rlc_mobile_local_projects_v1";

// ✅ CHANGED: scope codemap by mode (prevents mixing NUR_APP <-> SERVER)
const CODEMAP_KEY_BASE = "rlc_project_code_map_v1";
async function loadCodeMap(mode: "SERVER_SYNC" | "NUR_APP"): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(`${CODEMAP_KEY_BASE}:${mode}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function saveCodeMap(mode: "SERVER_SYNC" | "NUR_APP", map: Record<string, string>) {
  await AsyncStorage.setItem(`${CODEMAP_KEY_BASE}:${mode}`, JSON.stringify(map || {}));
}
function getBaForProject(map: Record<string, string>, projectId: string, fallback?: string) {
  return extractBaCode(map?.[projectId] || fallback || "") || "";
}
function titleOf(p: Project) {
  return String((p as any)?.name || "").trim() || String((p as any)?.number || (p as any)?.baustellenNummer || "").trim() || String((p as any)?.code || "").trim() || String((p as any)?.id || "").trim();
}
function subOf(p: Project) {
  const code = String((p as any)?.code || "").trim();
  const num = String((p as any)?.baustellenNummer || (p as any)?.number || "").trim();
  const ort = String((p as any)?.ort || (p as any)?.place || "").trim();
  const kunde = String((p as any)?.kunde || (p as any)?.client || "").trim();
  const parts = [code ? `Code: ${code}` : null, num ? `Baustelle: ${num}` : null, ort ? `Ort: ${ort}` : null, kunde ? `Kunde: ${kunde}` : null].filter(Boolean);
  return parts.join(" • ");
}

/** ✅ Avoid showing huge HTML pages in Alert (ngrok error pages etc.) */
function humanizeLoadError(e: any) {
  const msg = String(e?.message || "Laden fehlgeschlagen.");
  const lower = msg.toLowerCase();
  if (lower.includes("<!doctype html") || lower.includes("<html") || lower.includes("assets.ngrok.com") || lower.includes("ngrok")) {
    return "Server-Antwort ist HTML (kein JSON). Das passiert wenn:\n" + "• EXPO_PUBLIC_API_URL falsch ist (z.B. .app statt .dev)\n" + "• ngrok läuft, aber forwardet nicht auf :4000\n" + "• Backend läuft nicht / Route /api/projects fehlt\n\n" + "Bitte prüfe: ngrok Forwarding -> http://localhost:4000 und API_URL.";
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
  const c: Counter = {
    ...ZERO
  };
  for (const r of list || []) {
    const st = String(r?.workflowStatus || "DRAFT") as WorkflowStatus;
    if (st === "EINGEREICHT") c.eingereicht += 1;else if (st === "FREIGEGEBEN") c.freigegeben += 1;else if (st === "ABGELEHNT") c.abgelehnt += 1;else c.draft += 1;
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
    inbox: [`rlc_mobile_inbox_regie:${projectKey}`]
  };
}
function lieferscheinKeys(projectKey: string) {
  return {
    store: [`rlc_mobile_lieferschein_rows:${projectKey}`, `rlc_mobile_ls_rows:${projectKey}`],
    inbox: [`rlc_mobile_inbox_lieferschein:${projectKey}`, `rlc_mobile_inbox_ls:${projectKey}`]
  };
}
async function loadCountersForProject(projectKey: string): Promise<ProjectCounters> {
  const rk = regieKeys(projectKey);
  const lk = lieferscheinKeys(projectKey);
  const [regieStore, regieInbox, lsStore, lsInbox] = await Promise.all([loadArrayFromFirstKey(rk.store), loadArrayFromFirstKey(rk.inbox), loadArrayFromFirstKey(lk.store), loadArrayFromFirstKey(lk.inbox)]);
  const regieAll = [...(Array.isArray(regieStore) ? regieStore : []), ...(Array.isArray(regieInbox) ? regieInbox : [])];
  const lsAll = [...(Array.isArray(lsStore) ? lsStore : []), ...(Array.isArray(lsInbox) ? lsInbox : [])];
  return {
    regie: countByStatus(regieAll),
    ls: countByStatus(lsAll)
  };
}
function sumCounter(c: Counter) {
  return c.draft + c.eingereicht + c.freigegeben + c.abgelehnt;
}

/* ===========================
   Local Projects (NUR_APP)
=========================== */

type LocalProject = {
  id: string;
  name: string;
  code?: string;
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
    return Array.isArray(j) ? j as LocalProject[] : [];
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
    kunde: lp.kunde
  } as any;
}
function makeLocalId() {
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** ✅ FlatList keys: make them unique even if backend returns duplicate ids */
function listKeyOf(p: Project, index: number) {
  const base = String(projectFsKey(p) || (p as any)?.id || "").trim() || "row";
  return `${base}__${index}`;
}

/* ===========================
   Screen
=========================== */

export default function ProjectsScreen({
  navigation
}: Props) {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const isStandalone = mode === "NUR_APP" as any;
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [pendingOpen, setPendingOpen] = useState<Project | null>(null);
  const [counters, setCounters] = useState<Record<string, ProjectCounters>>({});
  const countersReqId = useRef(0);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [creating, setCreating] = useState(false);
  const resetNewForm = useCallback(() => {
    setNewName("");
    setNewClient("");
    setNewPlace("");
    setNewNumber("");
  }, []);
  const readMode = useCallback(async (): Promise<"SERVER_SYNC" | "NUR_APP"> => {
    try {
      const m = (await AsyncStorage.getItem(KEY_MODE)) as any;
      if (m === "NUR_APP" || m === "SERVER_SYNC") {
        setMode(m);
        return m;
      }
    } catch {}
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
      const mNow = await readMode();
      await readCodeMap(mNow);
      if (mNow === "NUR_APP") {
        const local = await loadLocalProjects();
        const arr = local.map(localToProject);
        setItems(arr);
        const myReq = ++countersReqId.current;
        const next: Record<string, ProjectCounters> = {};
        const slice = arr.slice(0, 30);
        await Promise.all(slice.map(async p => {
          const key = projectFsKey(p);
          try {
            next[key] = await loadCountersForProject(key);
          } catch {
            next[key] = {
              regie: {
                ...ZERO
              },
              ls: {
                ...ZERO
              }
            };
          }
        }));
        if (myReq === countersReqId.current) {
          setCounters(prev => ({
            ...prev,
            ...next
          }));
        }
        return;
      }
      const list = await api.projects();
      const arr = Array.isArray(list) ? list : [];
      setItems(arr);
      const myReq = ++countersReqId.current;
      const next: Record<string, ProjectCounters> = {};
      const slice = arr.slice(0, 30);
      await Promise.all(slice.map(async p => {
        const key = projectFsKey(p);
        try {
          next[key] = await loadCountersForProject(key);
        } catch {
          next[key] = {
            regie: {
              ...ZERO
            },
            ls: {
              ...ZERO
            }
          };
        }
      }));
      if (myReq === countersReqId.current) {
        setCounters(prev => ({
          ...prev,
          ...next
        }));
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
    return items.filter(p => {
      const blob = [(p as any).id, (p as any).code, (p as any).name, (p as any).number, (p as any).baustellenNummer, (p as any).ort, (p as any).place, (p as any).kunde, (p as any).client].map(x => String(x || "").toLowerCase()).join(" ");
      return blob.includes(s2);
    });
  }, [items, q]);
  const goBackSafe = useCallback(() => {
    if (navigation.canGoBack()) return navigation.goBack();
    navigation.replace("Login", {
      mode
    } as any);
  }, [navigation, mode]);
  const openProject = useCallback(async (p: Project) => {
    const projectId = String((p as any)?.id || "").trim();
    if (!projectId) {
      Alert.alert("Projekt", "Projekt-ID fehlt.");
      return;
    }
    const baCode = getBaForProject(codeMap, projectId, String((p as any)?.code || ""));
    const codeOk = looksLikeProjectCode(baCode);
    if (!isStandalone && !codeOk) {
      const current = getBaForProject(codeMap, projectId, String((p as any)?.code || ""));
      setEditingId(projectId);
      setEditingValue(current);
      setPendingOpen(p);
      return;
    }
    navigation.navigate("ProjectHome", {
      projectId,
      projectCode: baCode || undefined,
      title: titleOf(p)
    });
  }, [navigation, codeMap, isStandalone]);
  const ensureCounters = useCallback(async (fsKey: string) => {
    if (!fsKey) return;
    if (counters[fsKey]) return;
    const myReq = ++countersReqId.current;
    try {
      const c = await loadCountersForProject(fsKey);
      if (myReq === countersReqId.current) {
        setCounters(prev => ({
          ...prev,
          [fsKey]: c
        }));
      }
    } catch {
      if (myReq === countersReqId.current) {
        setCounters(prev => ({
          ...prev,
          [fsKey]: {
            regie: {
              ...ZERO
            },
            ls: {
              ...ZERO
            }
          }
        }));
      }
    }
  }, [counters]);
  const onCreateLocalProject = useCallback(async (preset?: Partial<LocalProject>) => {
    try {
      const nameDefault = String(preset?.name || `Projekt ${new Date().getFullYear()}`).trim();
      const id = makeLocalId();
      const lp: LocalProject = {
        id,
        name: nameDefault,
        kunde: preset?.kunde ? String(preset.kunde) : undefined,
        ort: preset?.ort ? String(preset.ort) : undefined,
        baustellenNummer: preset?.baustellenNummer ? String(preset.baustellenNummer) : undefined,
        createdAt: Date.now()
      };
      const list = await loadLocalProjects();
      const next = [lp, ...(Array.isArray(list) ? list : [])];
      await saveLocalProjects(next);
      const p = localToProject(lp);
      setItems(prev => [p, ...prev]);
      await openProject(p);
    } catch (e: any) {
      Alert.alert("Projekt", e?.message || "Lokales Projekt konnte nicht erstellt werden.");
    }
  }, [openProject]);
  const startEdit = useCallback((p: Project) => {
    const projectId = String((p as any)?.id || "").trim();
    if (!projectId) return;
    const current = getBaForProject(codeMap, projectId, String((p as any)?.code || ""));
    setEditingId(projectId);
    setEditingValue(current);
    setPendingOpen(null);
  }, [codeMap]);
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingValue("");
    setPendingOpen(null);
  }, []);
  const saveEdit = useCallback(async (p: Project) => {
    const projectId = String((p as any)?.id || "").trim();
    if (!projectId) return;
    const ba = extractBaCode(editingValue) || "";
    const next = {
      ...(codeMap || {})
    };
    next[projectId] = ba;
    setCodeMap(next);
    await saveCodeMap(mode, next);
    if (/^local-/i.test(projectId)) {
      try {
        const list = await loadLocalProjects();
        const updated = (list || []).map(x => x.id === projectId ? {
          ...x,
          code: ba
        } : x);
        await saveLocalProjects(updated);
      } catch {}
    }
    setEditingId(null);
    setEditingValue("");
    const pending = pendingOpen;
    const shouldAutoOpen = pending && String((pending as any)?.id || "").trim() === projectId;
    setPendingOpen(null);
    if (shouldAutoOpen && looksLikeProjectCode(ba)) {
      navigation.navigate("ProjectHome", {
        projectId,
        projectCode: ba || undefined,
        title: titleOf(pending as any)
      });
    }
  }, [codeMap, editingValue, pendingOpen, navigation, mode]);
  const onPressNew = useCallback(() => {
    resetNewForm();
    setNewOpen(true);
  }, [resetNewForm]);
  const submitNewProject = useCallback(async () => {
    const name = String(newName || "").trim();
    const client = String(newClient || "").trim();
    const place = String(newPlace || "").trim();
    const number = String(newNumber || "").trim();
    if (!name) {
      Alert.alert("Neues Projekt", "Bitte Projektnamen eingeben.");
      return;
    }
    setCreating(true);
    try {
      Keyboard.dismiss();
      if (isStandalone) {
        await onCreateLocalProject({
          name,
          kunde: client || undefined,
          ort: place || undefined,
          baustellenNummer: number || undefined
        });
        setNewOpen(false);
        return;
      }
      const resp = await api.createProject({
        name,
        client: client || "",
        place: place || "",
        number: number || null
      });
      const created: Project | null = resp?.project ? resp.project as Project : null;
      await load();
      setNewOpen(false);
      if (created?.id) {
        await openProject(created);
      }
    } catch (e: any) {
      Alert.alert("Neues Projekt", humanizeLoadError(e));
    } finally {
      setCreating(false);
    }
  }, [newName, newClient, newPlace, newNumber, isStandalone, onCreateLocalProject, load, openProject]);
  function StatPill({
    label,
    c,
    kind
  }: {
    label: string;
    c: Counter;
    kind: "REGIE" | "LS";
  }) {
    const total = sumCounter(c);
    const accent = kind === "REGIE" ? COLORS.accent : COLORS.accentDark;
    return <View style={s.statPill}>
        <View style={[s.statPillDot, {
        backgroundColor: accent
      }]} />
        <Text style={s.statPillLabel}>{label}</Text>
        <View style={s.statPillNums}>
          {total > 0 ? <>
              {c.draft > 0 ? <Text style={s.statNumMuted}>D {c.draft}</Text> : null}
              {c.eingereicht > 0 ? <Text style={s.statNumBlue}>E {c.eingereicht}</Text> : null}
              {c.freigegeben > 0 ? <Text style={s.statNumGreen}>F {c.freigegeben}</Text> : null}
              {c.abgelehnt > 0 ? <Text style={s.statNumRed}>A {c.abgelehnt}</Text> : null}
            </> : <Text style={s.statNumMuted}>0</Text>}
        </View>
      </View>;
  }
  function renderItem({
    item
  }: {
    item: Project;
  }) {
    const projectId = String((item as any)?.id || "").trim();
    const baCode = getBaForProject(codeMap, projectId, String((item as any)?.code || ""));
    const codeOk = looksLikeProjectCode(baCode);
    const fsKey = codeOk ? baCode : projectFsKey(item);
    if (fsKey && !counters[fsKey]) {
      ensureCounters(fsKey);
    }
    const c = counters[fsKey] || {
      regie: {
        ...ZERO
      },
      ls: {
        ...ZERO
      }
    };
    const isEditing = editingId === projectId;
    return <Pressable style={s.card} onPress={() => openProject(item)}>
        <View style={s.cardTop}>
          <View style={s.cardTextWrap}>
            <Text style={s.title} numberOfLines={1}>
              {titleOf(item)}
            </Text>
            <Text style={s.sub} numberOfLines={2}>
              {subOf(item) || `FS-Key: ${fsKey}`}
            </Text>
          </View>

          {baCode ? <View style={[s.badge, {
          borderColor: codeOk ? COLORS.accent : COLORS.text
        }]}>
              <Text style={[s.badgeTxt, {
            color: codeOk ? COLORS.accentDark : COLORS.text
          }]}>
                {codeOk ? "BA" : "CODE?"}
              </Text>
            </View> : <View style={s.badge}>
              <Text style={s.badgeTxt}>—</Text>
            </View>}
        </View>

        {isEditing ? <View style={s.codeEditWrap}>
            <TextInput value={editingValue} onChangeText={setEditingValue} placeholder="BA-2025-DEMO" autoCapitalize="characters" placeholderTextColor={COLORS.sub} style={s.codeInput} />
            <View style={s.codeActionsRow}>
              <Pressable style={s.codeBtnPrimary} onPress={(e: any) => {
            e?.stopPropagation?.();
            saveEdit(item);
          }}>
                <Text style={s.codeBtnPrimaryTxt}>Speichern</Text>
              </Pressable>
              <Pressable style={s.codeBtnGhost} onPress={(e: any) => {
            e?.stopPropagation?.();
            cancelEdit();
          }}>
                <Text style={s.codeBtnGhostTxt}>Abbrechen</Text>
              </Pressable>
            </View>
          </View> : <Pressable style={s.codeInline} onPress={(e: any) => {
        e?.stopPropagation?.();
        startEdit(item);
      }}>
            <Text style={s.codeInlineLabel}>Baustellennummer</Text>
            <Text style={s.codeInlineValue} numberOfLines={1}>{baCode || "Nicht gesetzt"}</Text>
            <Text style={s.codeInlineAction}>Ändern</Text>
          </Pressable>}

        <View style={s.statsRow}>
          <StatPill label="Regie" c={c.regie} kind="REGIE" />
          <StatPill label="Lieferschein" c={c.ls} kind="LS" />
        </View>

        {!codeOk && baCode ? <Text style={s.warn}>Hinweis: BA-Code ist ungültig. Verwende Format BA-YYYY-XXX.</Text> : null}
      </Pressable>;
  }
  const listEmpty = filtered.length === 0;
  return <SafeAreaView style={s.safe}>
      <View style={s.bg}>
        <View style={s.headerCard}>
          <View style={s.headerRow}>
            <Text style={s.headerLabel}>Projekte</Text>
            <View style={s.headerSpacer} />
            <View style={s.modePill}>
              <Text style={s.modeTxt}>{isStandalone ? "NUR_APP" : "SERVER"}</Text>
            </View>
          </View>

          <View style={s.titleRow}>
            <Text style={s.h1} numberOfLines={1}>Projekte</Text>

            <Pressable onPress={onPressNew} style={s.newBtn}>
              <Text style={s.newBtnTxt} numberOfLines={1}>+ Neu</Text>
            </Pressable>
          </View>

          <TextInput value={q} onChangeText={setQ} placeholder="Suchen (Code, Name, Ort, Kunde …)" placeholderTextColor={COLORS.sub} style={s.search} autoCapitalize="none" />

          {isStandalone && listEmpty ? <View style={s.ctaWrap}>
              <Pressable style={s.ctaBtn} onPress={() => onPressNew()} disabled={loading}>
                <Text style={s.ctaTxt}>{loading ? "Bitte warten..." : "Projekt erstellen"}</Text>
              </Pressable>
              <Text style={s.ctaHint}>
                Offline-Modus: Projekte werden lokal gespeichert. Sync ist deaktiviert.
              </Text>
            </View> : null}
        </View>

        <View style={s.listWrap}>
          <FlatList data={filtered} keyExtractor={(x, i) => listKeyOf(x, i)} renderItem={renderItem} contentContainerStyle={s.listContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.accent} />} showsVerticalScrollIndicator={false} ListEmptyComponent={<View style={s.emptyWrap}>
                <Text style={s.emptyText}>
                  {isStandalone ? "Keine lokalen Projekte. Erstelle ein Projekt oben." : "Keine Projekte gefunden. Ziehe zum Aktualisieren nach unten."}
                </Text>
              </View>} />
        </View>

        <Modal visible={newOpen} transparent animationType="fade" onRequestClose={() => setNewOpen(false)}>
          <Pressable style={s.modalBackdrop} onPress={() => setNewOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalWrap}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Neues Projekt</Text>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={s.modalLabel}>Projektname *</Text>
                <TextInput value={newName} onChangeText={setNewName} placeholder="z.B. Trinkwasserleitung BA III" placeholderTextColor={COLORS.sub} style={s.modalInput} />

                <Text style={s.modalLabel}>Kunde</Text>
                <TextInput value={newClient} onChangeText={setNewClient} placeholder="z.B. Gemeinde / Stadtwerke" placeholderTextColor={COLORS.sub} style={s.modalInput} />

                <Text style={s.modalLabel}>Ort</Text>
                <TextInput value={newPlace} onChangeText={setNewPlace} placeholder="z.B. Bischofswiesen" placeholderTextColor={COLORS.sub} style={s.modalInput} />

                <Text style={s.modalLabel}>BaustellenNummer</Text>
                <TextInput value={newNumber} onChangeText={setNewNumber} placeholder="z.B. 2026-001" placeholderTextColor={COLORS.sub} style={s.modalInput} />

                <View style={s.modalBtnsRow}>
                  <Pressable style={[s.modalBtn, s.modalBtnGhost]} onPress={() => {
                  setNewOpen(false);
                  resetNewForm();
                }} disabled={creating}>
                    <Text style={[s.modalBtnTxt, s.modalBtnGhostTxt]}>Abbrechen</Text>
                  </Pressable>

                  <Pressable style={[s.modalBtn, s.modalBtnPrimary, creating ? s.modalBtnDisabled : null]} onPress={submitNewProject} disabled={creating}>
                    <Text style={s.modalBtnPrimaryTxt}>{creating ? "Erstelle..." : "Erstellen"}</Text>
                  </Pressable>
                </View>

                <Text style={s.modalHint}>
                  {isStandalone ? "NUR_APP: Projekt wird lokal gespeichert." : "SERVER: Projekt wird am Server erstellt und synchronisiert."}
                </Text>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>;
}
const s = createRlcStyles("ProjectsScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  bg: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  brandCompactRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "600"
  },
  eyebrowSub: {
    color: COLORS.sub,
    fontSize: 11,
    fontWeight: "600"
  },
  titleRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  h1: {
    flex: 1,
    color: COLORS.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "600",
    letterSpacing: -0.45
  },
  newBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  newBtnTxt: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  search: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: COLORS.accentFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "400"
  },
  listWrap: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: COLORS.card
  },
  listContent: {
    paddingVertical: 4,
    paddingBottom: 28
  },
  card: {
    paddingHorizontal: 2,
    paddingVertical: 13,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  cardTextWrap: {
    flex: 1
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text
  },
  sub: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "400",
    lineHeight: 18
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.primaryBorder
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.accentDark
  },
  codeRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.sub
  },
  codeViewWrap: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  codeValue: {
    flex: 1,
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  codeValueWarn: {
    color: COLORS.text
  },
  codeEditWrap: {
    marginTop: 8,
    gap: 10
  },
  codeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({
      ios: 12,
      android: 10,
      default: 10
    }),
    fontWeight: "600",
    color: COLORS.text
  },
  codeActionsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  codeBtnPrimary: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent
  },
  codeBtnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  codeBtnGhost: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  codeBtnGhostTxt: {
    color: COLORS.text,
    fontWeight: "600"
  },
  codeInline: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  codeInlineLabel: {
    fontSize: 11,
    color: COLORS.sub,
    fontWeight: "600"
  },
  codeInlineValue: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "600"
  },
  codeInlineAction: {
    fontSize: 12,
    color: COLORS.accentDark,
    fontWeight: "600"
  },
  statsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 9,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  statPillDot: {
    width: 8,
    height: 8,
    borderRadius: 18
  },
  statPillLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text
  },
  statPillNums: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  statNumMuted: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.sub
  },
  statNumBlue: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.accent
  },
  statNumGreen: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.accentDark
  },
  statNumRed: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text
  },
  warn: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600"
  },
  emptyWrap: {
    paddingVertical: 15
  },
  emptyText: {
    color: COLORS.sub,
    lineHeight: 20,
    fontWeight: "600"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay
  },
  modalWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    borderRadius: 12,
    backgroundColor: COLORS.card,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 10
  },
  modalLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text
  },
  modalInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({
      ios: 12,
      android: 10,
      default: 10
    }),
    fontWeight: "600",
    color: COLORS.text,
    backgroundColor: COLORS.inputBg
  },
  modalBtnsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    justifyContent: "flex-end"
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9
  },
  modalBtnTxt: {
    fontWeight: "600"
  },
  modalBtnGhost: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  modalBtnGhostTxt: {
    color: COLORS.text
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent
  },
  modalBtnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  modalBtnDisabled: {
    opacity: 0.7
  },
  // RLC_PROJECTS_MISSING_STYLES_FIX_V1
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7
  },
  backBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder
  },
  backTxt: {
    color: COLORS.accentDark,
    fontSize: 14,
    fontWeight: "600"
  },
  headerLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600"
  },
  headerSpacer: {
    flex: 1
  },
  modePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder
  },
  modeTxt: {
    color: COLORS.accentDark,
    fontSize: 12,
    fontWeight: "600"
  },
  ctaWrap: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accentFaint,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder
  },
  ctaBtn: {
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: COLORS.primaryDark
  },
  ctaTxt: {
    color: COLORS.card,
    fontSize: 18,
    fontWeight: "600"
  },
  ctaHint: {
    marginTop: 10,
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400"
  },
  modalHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.sub,
    lineHeight: 18
  }
});
