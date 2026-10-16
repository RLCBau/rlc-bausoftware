// apps/mobile/src/screens/LvReadOnlyScreen.tsx
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, Alert, Platform, SafeAreaView, KeyboardAvoidingView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { getSession, SessionRole } from "../storage/session";
import { resolveProjectCode, looksLikeProjectCode, request, api } from "../lib/api";
import { getAuthMode, type AuthMode } from "../lib/auth";
import * as Sharing from "expo-sharing";
import { COLORS, createRlcStyles } from "../ui/theme";
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
  pos?: string;
  text?: string;
  unit?: string;
  quantity?: number;
  ep?: number;
};
type FilterMode = "ALL" | "POS" | "KURZ" | "LANG";
type CacheMeta = {
  ts?: number;
  version?: string;
  sourceType?: string;
  title?: string;
  currency?: string;
  savedAt?: string;
  offline?: boolean;
  fileName?: string;
};
type CacheCandidate = {
  key: string;
  list: LvItem[];
  meta: CacheMeta;
  raw: any;
  score: number;
};
function canLvRead(role?: SessionRole) {
  return String(role) === "BAULEITER" || String(role) === "KALKULATOR" || String(role) === "BUERO" || String(role) === "POLIER" || String(role) === "KALKULATOR";
}
function toNum(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const normalized = String(v).replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
function mapLvItem(raw: any): LvItem {
  const quantity = toNum(raw?.quantity ?? raw?.menge);
  const ep = toNum(raw?.ep ?? raw?.einzelpreis);
  const gesamt = toNum(raw?.gesamt) ?? (typeof quantity === "number" && typeof ep === "number" ? Number((quantity * ep).toFixed(2)) : undefined);
  return {
    id: raw?.id ? String(raw.id) : undefined,
    position: raw?.position ?? raw?.pos ?? undefined,
    pos: raw?.pos ?? raw?.position ?? undefined,
    kurztext: raw?.kurztext ?? raw?.text ?? undefined,
    text: raw?.text ?? raw?.kurztext ?? undefined,
    langtext: raw?.langtext ?? undefined,
    einheit: raw?.einheit ?? raw?.unit ?? undefined,
    unit: raw?.unit ?? raw?.einheit ?? undefined,
    menge: quantity,
    quantity,
    einzelpreis: ep,
    ep,
    gesamt,
    kategorie: raw?.kategorie ?? undefined
  };
}
function fmtNum(v: any): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function normalizeProjectRef(v: unknown): string {
  return String(v || "").trim();
}
function buildProjectRefs(projectId: unknown, projectCode: unknown): string[] {
  const id = normalizeProjectRef(projectId);
  const code = normalizeProjectRef(projectCode);
  const refs = [code, id].filter(Boolean);
  return Array.from(new Set(refs));
}
function buildCacheKeys(projectId: unknown, projectCode: unknown): string[] {
  const refs = buildProjectRefs(projectId, projectCode);
  const keys = refs.flatMap(ref => [`rlc.project.lv.${ref}`, `rlc_lv_cache:${ref}`, `rlc_mobile_lv_cache:${ref}`, `lv_cache:${ref}`, `project_lv_cache:${ref}`, `rlc_project_lv:${ref}`, `rlc_lv_readonly_cache:${ref}`, `rlc_lv_payload:${ref}`, `rlc_lv_last_import:${ref}`]);
  return Array.from(new Set(keys));
}
function extractListRaw(data: any): any[] {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.positions)) return data.positions;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.lv) {
    if (Array.isArray(data.lv?.items)) return data.lv.items;
    if (Array.isArray(data.lv?.positions)) return data.lv.positions;
    if (Array.isArray(data.lv?.rows)) return data.lv.rows;
    if (Array.isArray(data.lv?.data)) return data.lv.data;
  }
  if (Array.isArray(data)) return data;
  return [];
}
function extractMeta(data: any): CacheMeta {
  const ts = typeof data?.ts === "number" ? data.ts : data?.savedAt ? Date.parse(String(data.savedAt)) : data?.lv?.savedAt ? Date.parse(String(data.lv.savedAt)) : undefined;
  return {
    ts: Number.isFinite(ts as number) ? ts : undefined,
    version: data?.version != null ? String(data.version) : data?.lv?.version != null ? String(data.lv.version) : undefined,
    sourceType: data?.sourceType != null ? String(data.sourceType) : data?.lv?.sourceType != null ? String(data.lv.sourceType) : undefined,
    title: typeof data?.title === "string" ? data.title : typeof data?.lv?.title === "string" ? data.lv.title : undefined,
    currency: typeof data?.currency === "string" ? data.currency : typeof data?.lv?.currency === "string" ? data.lv.currency : undefined,
    savedAt: typeof data?.savedAt === "string" ? data.savedAt : typeof data?.lv?.savedAt === "string" ? data.lv.savedAt : undefined,
    offline: !!data?.offline,
    fileName: typeof data?.fileName === "string" ? data.fileName : typeof data?.lv?.fileName === "string" ? data.lv.fileName : undefined
  };
}
function scoreCacheCandidate(list: LvItem[], meta: CacheMeta, raw: any): number {
  const itemCount = list.length;
  const ts = typeof meta?.ts === "number" ? meta.ts : 0;
  const sourceType = String(meta?.sourceType || "").toUpperCase();
  let score = 0;

  // priorità massima: cache con elementi
  score += itemCount * 1000000;

  // cache recenti meglio
  score += ts;

  // penalizza leggermente manuale vuoto
  if (sourceType === "MANUAL" && itemCount === 0) {
    score -= 500000000;
  }

  // premia import veri
  if (["JSON", "CSV", "XML", "GAEB", "X83", "X84", "XLSX", "XLS", "PDF"].includes(sourceType)) {
    score += 10000;
  }

  // se il payload contiene lv/items ma lista è vuota, piccolo bonus ma non troppo
  if ((raw?.lv || raw?.items || raw?.positions || raw?.rows) && itemCount === 0) {
    score += 100;
  }
  return score;
}
async function findBestCache(projectId: unknown, projectCode: unknown) {
  const keys = buildCacheKeys(projectId, projectCode);
  const candidates: CacheCandidate[] = [];
  for (const key of keys) {
    try {
      const rawText = await AsyncStorage.getItem(key);
      if (!rawText) continue;
      const data = JSON.parse(rawText);
      const listRaw = extractListRaw(data);
      const list = listRaw.map(mapLvItem);
      const meta = extractMeta(data);
      const score = scoreCacheCandidate(list, meta, data);
      candidates.push({
        key,
        list,
        meta,
        raw: data,
        score
      });
    } catch {}
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}
export default function LvReadOnlyScreen({
  route,
  navigation
}: Props) {
  const {
    projectId,
    title,
    projectCode: routeProjectCode
  } = route.params as any;
  useLayoutEffect(() => {
    navigation.setOptions({
      title: title || "LV"
    });
  }, [title, navigation]);
  const [mode, setMode] = useState<AuthMode>("NUR_APP");
  const canServer = useMemo(() => mode === "SERVER_SYNC", [mode]);
  const [projectCode, setProjectCode] = useState<string>(String(routeProjectCode || "").trim());
  const effectiveProjectKey = useMemo(() => {
    const c = String(projectCode || "").trim();
    return looksLikeProjectCode(c) ? c : String(projectId || "").trim();
  }, [projectCode, projectId]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LvItem[]>([]);
  const [meta, setMeta] = useState<CacheMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<SessionRole | undefined>(undefined);
  const [filterMode, setFilterMode] = useState<FilterMode>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const allowed = useMemo(() => canLvRead(role), [role]);
  async function ensureProjectCodeValue(): Promise<string> {
    if (!canServer) return String(projectCode || "").trim();
    const current = String(projectCode || "").trim();
    if (looksLikeProjectCode(current)) return current;
    const routeCode = String(routeProjectCode || "").trim();
    if (looksLikeProjectCode(routeCode)) {
      setProjectCode(routeCode);
      return routeCode;
    }
    try {
      const pk = await resolveProjectCode(projectId);
      if (looksLikeProjectCode(pk)) {
        setProjectCode(pk);
        return pk;
      }
    } catch {}
    return "";
  }
  async function loadCache() {
    try {
      const found = await findBestCache(projectId, projectCode || routeProjectCode);
      if (!found) {
        setItems([]);
        setMeta(null);
        return;
      }
      const list = found.list;
      const parsedMeta = found.meta;
      const syncPayload = {
        ts: parsedMeta?.ts || Date.now(),
        version: parsedMeta?.version || "1",
        sourceType: parsedMeta?.sourceType,
        title: parsedMeta?.title,
        currency: parsedMeta?.currency,
        offline: parsedMeta?.offline,
        savedAt: parsedMeta?.savedAt,
        fileName: parsedMeta?.fileName,
        items: list
      };
      const syncKeys = buildCacheKeys(projectId, projectCode || routeProjectCode);
      await Promise.all(syncKeys.filter(k => k.startsWith("rlc.project.lv.")).map(k => AsyncStorage.setItem(k, JSON.stringify(syncPayload))));
      setItems(list);
      setMeta(parsedMeta);
      setOpenId(null);
    } catch {
      setItems([]);
      setMeta(null);
    }
  }
  async function refreshFromServer(showAlert = false) {
    if (!allowed) {
      if (showAlert) {
        Alert.alert("LV", "Kein Zugriff. LV ist nur für Bauleiter, Büro, Kalkulator und Polier sichtbar.");
      }
      return;
    }
    if (!canServer) {
      if (showAlert) {
        Alert.alert("LV (Offline)", "Du bist im Modus „Ohne Server“. Server-Refresh ist deaktiviert.");
      }
      return;
    }
    const finalKey = await ensureProjectCodeValue();
    if (!looksLikeProjectCode(finalKey)) {
      if (showAlert) {
        Alert.alert("LV", "Projekt-Code (BA-YYYY-...) konnte nicht ermittelt werden.");
      }
      return;
    }
    setBusy(true);
    try {
      const json = await request<any>(`/api/project-lv/${encodeURIComponent(finalKey)}`, {
        method: "GET"
      });
      const listRaw = extractListRaw(json);
      const list: LvItem[] = listRaw.map(mapLvItem);
      const payload = {
        ts: Date.now(),
        version: String(json?.header?.version ?? json?.version ?? json?.lvVersion ?? "1"),
        sourceType: "server",
        title: json?.header?.title ?? json?.title ?? json?.lv?.title ?? "Leistungsverzeichnis",
        currency: json?.currency ?? json?.lv?.currency ?? "EUR",
        offline: false,
        items: list
      };
      const keys = buildCacheKeys(projectId, finalKey);
      await Promise.all(keys.filter(k => k.startsWith("rlc.project.lv.") || k.startsWith("rlc_lv_cache:")).map(k => AsyncStorage.setItem(k, JSON.stringify(payload))));
      setItems(list);
      setMeta({
        ts: payload.ts,
        version: payload.version,
        sourceType: payload.sourceType,
        title: payload.title,
        currency: payload.currency,
        offline: false
      });
      setOpenId(null);
      if (showAlert) {
        Alert.alert("LV", "LV wurde vom Server geladen und Cache aktualisiert.");
      }
    } catch (e: any) {
      const msg = String(e?.message || "Server-Refresh fehlgeschlagen");
      if (showAlert) {
        Alert.alert("LV", msg);
      }
    } finally {
      setBusy(false);
    }
  }
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const m = await getAuthMode().catch(() => "NUR_APP" as AuthMode);
      if (cancelled) return;
      setMode(m);
      const s = (await getSession(effectiveProjectKey)) || (await getSession(projectId));
      if (cancelled) return;
      setRole(s?.role);
      await loadCache();
      if (cancelled) return;
      if (m === "SERVER_SYNC") {
        await refreshFromServer(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, effectiveProjectKey, routeProjectCode]));
  async function downloadLv() {
    await refreshFromServer(true);
  }
  async function handleExport(type: "excel" | "pdf" | "gaeb") {
    if (!allowed) {
      Alert.alert("Export", "Kein Zugriff auf LV-Export.");
      return;
    }
    if (!canServer) {
      Alert.alert("Export", "Nur im Server-Modus möglich.");
      return;
    }
    let finalKey = effectiveProjectKey;
    if (!looksLikeProjectCode(finalKey)) {
      const resolved = await ensureProjectCodeValue();
      if (looksLikeProjectCode(resolved)) {
        finalKey = resolved;
      }
    }
    if (!looksLikeProjectCode(finalKey)) {
      Alert.alert("Export", "Projekt-Code fehlt.");
      return;
    }
    setBusy(true);
    try {
      const {
        uri,
        filename,
        mimeType
      } = await api.exportLvToFile(finalKey, type);
      if (type === "pdf") {
        navigation.navigate("PdfViewer", {
          uri,
          title: filename || `Leistungsverzeichnis ${finalKey}`,
          projectId: String(projectId || finalKey),
          projectCode: finalKey,
          documentType: "LEISTUNGSVERZEICHNIS"
        });
        return;
      }
      const canShareNow = await Sharing.isAvailableAsync();
      if (!canShareNow) {
        Alert.alert("Export OK", `${filename}\n\nGespeichert unter:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType,
        dialogTitle: filename,
        UTI: type === "excel" ? "org.openxmlformats.spreadsheetml.sheet" : "public.xml"
      });
    } catch (e: any) {
      Alert.alert("Export Fehler", String(e?.message || e || "Export fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  }
  const filtered = useMemo(() => {
    const sTerm = q.trim().toLowerCase();
    if (!sTerm) return items;
    return items.filter(it => {
      const p = String(it.position || it.pos || "").toLowerCase();
      const k = String(it.kurztext || it.text || "").toLowerCase();
      const l = String(it.langtext || "").toLowerCase();
      if (filterMode === "POS") return p.includes(sTerm);
      if (filterMode === "KURZ") return k.includes(sTerm);
      if (filterMode === "LANG") return l.includes(sTerm);
      return p.includes(sTerm) || k.includes(sTerm) || l.includes(sTerm);
    });
  }, [q, items, filterMode]);
  const cacheInfo = useMemo(() => {
    const t = meta?.ts ? new Date(meta.ts).toLocaleString() : "nicht vorhanden";
    const v = meta?.version ? ` • v${meta.version}` : "";
    const src = meta?.sourceType ? ` • ${String(meta.sourceType).toUpperCase()}` : "";
    return `Cache: ${t}${v}${src}`;
  }, [meta]);
  const codeLine = useMemo(() => {
    const c = looksLikeProjectCode(projectCode) ? projectCode : "";
    return c ? c : "—";
  }, [projectCode]);
  const subtitleInfo = useMemo(() => {
    if (!meta) return null;
    const parts = [meta.title ? `Titel: ${meta.title}` : null, meta.fileName ? `Datei: ${meta.fileName}` : null, meta.currency ? `Währung: ${meta.currency}` : null].filter(Boolean);
    return parts.join(" • ");
  }, [meta]);
  if (!allowed) {
    return <SafeAreaView style={s.safe}>
        <View style={s.bg}>
          <View style={s.centerWrap}>
            <View style={s.lockCard}>
              <View style={s.lockHead}>
                <View style={s.accentBar} />
                <Text style={s.lockTitle}>Kein Zugriff</Text>
              </View>
              <Text style={s.lockText}>
                LV ist nur für Bauleiter, Büro, Kalkulator und Polier sichtbar.
              </Text>
              <Text style={s.lockText2}>
                Melde dich mit einer berechtigten Rolle an.
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>;
  }
  return <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.bg}>
          <FlatList data={filtered} keyExtractor={(it, idx) => (it.id || it.position || it.pos || String(idx)) + ":" + idx} contentContainerStyle={s.listPad} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} ListHeaderComponent={<View style={s.headerWrap}>
                <View style={s.headerCard}>
                  <View style={s.hRow}>
                    <View style={s.accentBarDark} />
                    <View style={s.headerTextWrap}>
                      <Text style={s.brandTop}>RLC Bausoftware</Text>
                      <Text style={s.brandSub}>Leistungsverzeichnis</Text>
                      <Text style={s.h1}>LV (Read Only)</Text>
                      <Text style={s.hSub}>
                        Nur Lesen • Offline Cache • Modus:{" "}
                        <Text style={s.hSubStrong}>
                          {mode === "SERVER_SYNC" ? "Server Sync" : "Ohne Server"}
                        </Text>
                      </Text>
                      {subtitleInfo ? <Text style={s.hSub2}>{subtitleInfo}</Text> : null}
                    </View>
                  </View>

                  <View style={s.badgeRow}>
                    <View style={s.badge}>
                      <Text style={s.badgeTxt}>
                        Code: <Text style={s.badgeTxtStrong}>{codeLine}</Text>
                      </Text>
                    </View>
                    <View style={s.badge}>
                      <Text style={s.badgeTxt} numberOfLines={1}>
                        ID: <Text style={s.badgeTxtStrong}>{String(projectId)}</Text>
                      </Text>
                    </View>
                    <View style={[s.badge, items.length ? s.badgeOk : null]}>
                      <Text style={s.badgeTxt}>{items.length ? "Cache" : "Leer"}</Text>
                    </View>
                  </View>
                </View>

                <View style={s.panel}>
                  <Text style={s.metaSmall}>{cacheInfo}</Text>

                  {!canServer ? <View style={s.offlineWarn}>
                      <Text style={s.offlineWarnTitle}>Ohne Server</Text>
                      <Text style={s.offlineWarnText}>
                        In diesem Modus wird nichts vom Server geladen. Angezeigt wird der lokal gespeicherte LV-Cache.
                      </Text>
                    </View> : null}

                  <View style={s.actionsWrap}>
                    <Pressable style={[s.btnFull, s.btnSecondary, {
                opacity: 0.95
              }]} onPress={() => navigation.navigate("LvImport", {
                projectId,
                projectCode,
                title
              })}>
                      <Text style={s.btnSecondaryTxt}>LV importieren</Text>
                    </Pressable>

                    <View style={s.actionsRow}>
                      <Pressable style={[s.btn, s.btnPrimary, (busy || !canServer) && s.disabledBtn]} onPress={downloadLv} disabled={busy || !canServer}>
                        <Text style={s.btnPrimaryTxt}>
                          {busy ? "Lädt..." : "LV Download (Server)"}
                        </Text>
                      </Pressable>

                      <Pressable style={[s.btn, s.btnSecondary, busy && s.disabledBtn]} onPress={() => {
                  if (canServer) {
                    refreshFromServer(true);
                  } else {
                    loadCache();
                  }
                }} disabled={busy}>
                        <Text style={s.btnSecondaryTxt}>
                          {canServer ? "Server neu laden" : "Cache laden"}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={s.actionsRow}>
                      <Pressable style={[s.btn, s.btnSecondary, (busy || !canServer) && s.disabledBtn]} onPress={() => handleExport("excel")} disabled={busy || !canServer}>
                        <Text style={s.btnSecondaryTxt}>Excel</Text>
                      </Pressable>

                      <Pressable style={[s.btn, s.btnSecondary, (busy || !canServer) && s.disabledBtn]} onPress={() => handleExport("pdf")} disabled={busy || !canServer}>
                        <Text style={s.btnSecondaryTxt}>PDF</Text>
                      </Pressable>

                      <Pressable style={[s.btn, s.btnSecondary, (busy || !canServer) && s.disabledBtn]} onPress={() => handleExport("gaeb")} disabled={busy || !canServer}>
                        <Text style={s.btnSecondaryTxt}>GAEB</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={s.chipsRow}>
                    <FilterChip label="Alles" active={filterMode === "ALL"} onPress={() => setFilterMode("ALL")} />
                    <FilterChip label="Position" active={filterMode === "POS"} onPress={() => setFilterMode("POS")} />
                    <FilterChip label="Kurztext" active={filterMode === "KURZ"} onPress={() => setFilterMode("KURZ")} />
                    <FilterChip label="Langtext" active={filterMode === "LANG"} onPress={() => setFilterMode("LANG")} />
                  </View>

                  <TextInput value={q} onChangeText={setQ} placeholder="Suchen (Position, Kurztext, Langtext)…" style={s.search} placeholderTextColor={COLORS.sub} autoCorrect={false} autoCapitalize="none" blurOnSubmit={false} />

                  <Text style={s.sectionTitle}>
                    {items.length ? `Positionen (${filtered.length})` : "Keine Daten"}
                  </Text>
                </View>
              </View>} renderItem={({
          item,
          index
        }) => {
          const key = item.id || item.position || item.pos || String(index);
          const isOpen = openId === key;
          const pos = item.pos ?? item.position ?? "—";
          const kurz = item.text ?? item.kurztext ?? "—";
          const lang = item.langtext ?? "";
          const unit = item.unit ?? item.einheit ?? "";
          const menge = item.quantity ?? item.menge;
          const ep = item.ep ?? item.einzelpreis;
          const gp = typeof item.gesamt === "number" ? item.gesamt : typeof menge === "number" && typeof ep === "number" ? Number((menge * ep).toFixed(2)) : undefined;
          return <Pressable style={[s.card, isOpen && s.cardOpen]} onPress={() => setOpenId(isOpen ? null : key)}>
                  <View style={s.cardTop}>
                    <View style={s.cardTextWrap}>
                      <Text style={s.pos}>
                        {pos}
                        {unit ? <Text style={s.unit}>  ({unit})</Text> : null}
                      </Text>
                      <Text style={s.kurz} numberOfLines={isOpen ? 20 : 2}>
                        {kurz}
                      </Text>
                    </View>

                    <View style={s.chev}>
                      <Text style={s.chevTxt}>{isOpen ? "–" : "+"}</Text>
                    </View>
                  </View>

                  {isOpen ? <>
                      {item.kategorie ? <View style={s.katRow}>
                          <Text style={s.katLabel}>Kategorie</Text>
                          <Text style={s.katValue}>{item.kategorie}</Text>
                        </View> : null}

                      <View style={s.div} />

                      {lang ? <Text style={s.lang}>{lang}</Text> : <Text style={s.langEmpty}>Kein Langtext vorhanden.</Text>}

                      <View style={s.div} />

                      <View style={s.metrics}>
                        <Metric label="Menge" value={fmtNum(menge)} />
                        <Metric label="EP" value={fmtNum(ep)} />
                        <Metric label="GP" value={fmtNum(gp)} />
                      </View>

                      <Text style={s.tapHint}>Tippen zum Zuklappen</Text>
                    </> : <Text style={s.tapHint}>Tippen für Details</Text>}
                </Pressable>;
        }} ListEmptyComponent={<View style={s.emptyWrap}>
                <Text style={s.empty}>
                  {items.length === 0 ? canServer ? "Kein LV im Cache. Einmal vom Server laden oder importieren." : "Kein LV im Cache. Bitte importieren oder Cache laden." : "Keine Treffer."}
                </Text>
              </View>} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>;
}
function FilterChip({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipTxt, active && s.chipTxtActive]}>{label}</Text>
    </Pressable>;
}
function Metric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return <View style={s.metricBox}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </View>;
}
const s = createRlcStyles("LvReadOnlyScreen", {
  flex: {
    flex: 1
  },
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  bg: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  listPad: {
    paddingBottom: 26
  },
  headerWrap: {
    paddingBottom: 10
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  hRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  accentBarDark: {
    width: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.accent
  },
  headerTextWrap: {
    flex: 1
  },
  brandTop: {
    color: COLORS.accentDark,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  brandSub: {
    color: COLORS.sub,
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600"
  },
  h1: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600",
    color: COLORS.text
  },
  hSub: {
    marginTop: 6,
    fontWeight: "600",
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 18
  },
  hSubStrong: {
    fontWeight: "600",
    color: COLORS.text
  },
  hSub2: {
    marginTop: 6,
    fontWeight: "600",
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 18
  },
  badgeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap"
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  badgeOk: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.card2
  },
  badgeTxt: {
    fontWeight: "600",
    color: COLORS.text,
    fontSize: 12
  },
  badgeTxtStrong: {
    fontWeight: "600",
    color: COLORS.text
  },
  panel: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
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
  metaSmall: {
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: "600"
  },
  offlineWarn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    padding: 12
  },
  offlineWarnTitle: {
    fontWeight: "600",
    color: COLORS.text
  },
  offlineWarnText: {
    marginTop: 6,
    fontWeight: "600",
    color: COLORS.sub,
    lineHeight: 19
  },
  actionsWrap: {
    marginTop: 12,
    gap: 10
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10
  },
  btn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46
  },
  btnFull: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46
  },
  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent
  },
  btnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 13,
    textAlign: "center"
  },
  btnSecondary: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  btnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 13,
    textAlign: "center"
  },
  disabledBtn: {
    opacity: 0.55
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap"
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card2
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  chipTxt: {
    fontWeight: "600",
    color: COLORS.text,
    fontSize: 12
  },
  chipTxtActive: {
    color: COLORS.textLight
  },
  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "600",
    color: COLORS.text
  },
  sectionTitle: {
    marginTop: 14,
    fontWeight: "600",
    color: COLORS.text,
    fontSize: 15
  },
  card: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
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
  cardOpen: {
    borderColor: COLORS.accent
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  cardTextWrap: {
    flex: 1
  },
  pos: {
    fontWeight: "600",
    fontSize: 16,
    color: COLORS.text
  },
  unit: {
    fontWeight: "600",
    color: COLORS.sub,
    fontSize: 13
  },
  kurz: {
    marginTop: 6,
    fontWeight: "600",
    color: COLORS.text,
    lineHeight: 19
  },
  chev: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card2
  },
  chevTxt: {
    fontWeight: "600",
    fontSize: 18,
    color: COLORS.accentDark
  },
  katRow: {
    marginTop: 12
  },
  katLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.sub
  },
  katValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text
  },
  div: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 12
  },
  lang: {
    marginTop: 12,
    color: COLORS.text,
    lineHeight: 19,
    fontWeight: "600"
  },
  langEmpty: {
    marginTop: 12,
    color: COLORS.sub,
    fontWeight: "600",
    fontStyle: "italic"
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    padding: 10
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.sub
  },
  metricValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text
  },
  tapHint: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12
  },
  emptyWrap: {
    paddingTop: 24,
    paddingHorizontal: 16
  },
  empty: {
    color: COLORS.sub,
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 20
  },
  centerWrap: {
    flex: 1,
    padding: 14,
    justifyContent: "center"
  },
  lockCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
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
  lockHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10
  },
  accentBar: {
    width: 6,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORS.accent
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text
  },
  lockText: {
    marginTop: 8,
    color: COLORS.text,
    fontWeight: "600",
    lineHeight: 20
  },
  lockText2: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 19
  }
});
