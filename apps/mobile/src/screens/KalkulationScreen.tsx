// apps/mobile/src/screens/KalkulationScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, SafeAreaView, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { KalkulationFilterType, RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { COLORS, RLC_SPACING, RLC_RADIUS, createRlcStyles } from "../ui/theme";
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, "Kalkulation">;
type KalkRow = {
  id?: string;
  positionId?: string;
  posNr?: string;
  positionsnummer?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number | string;
  quantity?: number | string;
  ep?: number | string;
  gp?: number | string;
  preis?: number | string;
  unitPrice?: number | string;
  unitPriceNet?: number | string;
  finalUnitPrice?: number | string;
  suggestedUnitPrice?: number | string;
  baseUnitPrice?: number | string;
  calculatedUnitPrice?: number | string;
  kiUnitPrice?: number | string;
  rlcKiUnitPrice?: number | string;
  total?: number | string;
  totalNet?: number | string;
  calculatedTotal?: number | string;
  kiTotal?: number | string;
  rlcKiTotal?: number | string;
  angebotUnitPrice?: number | string;
  angebotTotal?: number | string;
  x84UnitPrice?: number | string;
  x84Total?: number | string;
  warning?: string;
  pruefHinweis?: string;
  warnings?: string[];
  riskLevel?: string;
  calculationStatus?: string;
  status?: string;
  source?: string;
  duplicate?: boolean;
  isDuplicate?: boolean;
};
type LoadResult = {
  rows: KalkRow[];
  totalNet?: number;
  sourceLabel: string;
  hasSavedCalculation: boolean;
  message?: string;
};
const FILTERS: {
  key: KalkulationFilterType;
  label: string;
}[] = [{
  key: "ALL",
  label: "Alle"
}, {
  key: "KRITISCH",
  label: "Kritisch"
}, {
  key: "PRUEFHINWEISE",
  label: "Hinweise"
}, {
  key: "PRUEFPFLICHTIG",
  label: "Prüfpflichtig"
}, {
  key: "OUTLIER",
  label: "Outlier"
}, {
  key: "OHNE_PREIS",
  label: "Ohne Preis"
}, {
  key: "DOPPELTE",
  label: "Doppelte"
}];
function n(value: any): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
function money(value: any): string {
  return `${n(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}
function compact(value?: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function rowPos(row: KalkRow): string {
  return compact(row.posNr || row.positionsnummer || "-");
}
function rowTitle(row: KalkRow): string {
  return compact(row.kurztext || row.langtext || "Ohne Kurztext");
}
function rowQty(row: KalkRow): number {
  return n(row.menge ?? row.quantity);
}
function rowEp(row: KalkRow): number {
  return n(row.rlcKiUnitPrice ?? row.kiUnitPrice ?? row.calculatedUnitPrice ?? row.finalUnitPrice ?? row.suggestedUnitPrice ?? row.unitPriceNet ?? row.unitPrice ?? row.ep ?? row.preis);
}
function rowGp(row: KalkRow): number {
  const explicit = n(row.rlcKiTotal ?? row.kiTotal ?? row.calculatedTotal ?? row.totalNet ?? row.total ?? row.gp);
  if (explicit > 0) return explicit;
  const qty = rowQty(row);
  const ep = rowEp(row);
  return qty > 0 && ep > 0 ? round2(qty * ep) : 0;
}
function rowWarning(row: KalkRow): string {
  if (Array.isArray(row.warnings)) return compact(row.warnings.join(" · "));
  return compact(row.warning || row.pruefHinweis || "");
}
function isCritical(row: KalkRow): boolean {
  const warning = rowWarning(row).toLowerCase();
  const status = String(row.calculationStatus || row.status || "").toLowerCase();
  return String(row.riskLevel || "").toLowerCase() === "high" || warning.includes("kritisch") || warning.includes("outlier") || warning.includes("prüfen") || warning.includes("pruefen") || status.includes("review") || status.includes("needs_review") || status.includes("warning") || status.includes("critical");
}
function isOutlier(row: KalkRow): boolean {
  const warning = rowWarning(row).toLowerCase();
  return warning.includes("outlier") || warning.includes("ausreißer") || warning.includes("ausreisser");
}
function filterRows(rows: KalkRow[], filter: KalkulationFilterType, query: string): KalkRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(row => {
    if (q) {
      const hay = `${rowPos(row)} ${rowTitle(row)} ${row.langtext || ""} ${rowWarning(row)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === "KRITISCH") return isCritical(row);
    if (filter === "PRUEFHINWEISE") return !!rowWarning(row);
    if (filter === "PRUEFPFLICHTIG") return String(row.calculationStatus || row.status || "").toLowerCase().includes("review") || isCritical(row);
    if (filter === "OUTLIER") return isOutlier(row);
    if (filter === "OHNE_PREIS") return rowEp(row) <= 0 && rowGp(row) <= 0;
    if (filter === "DOPPELTE") return Boolean(row.duplicate || row.isDuplicate);
    return true;
  });
}
function extractRows(payload: any): KalkRow[] {
  const candidates = [payload?.kalkulation?.rows, payload?.kalkulation?.positions, payload?.calculation?.rows, payload?.calculation?.positions, payload?.data?.kalkulation?.rows, payload?.data?.kalkulation?.positions, payload?.data?.calculation?.rows, payload?.data?.calculation?.positions, payload?.data?.rows, payload?.data?.positions, payload?.result?.rows, payload?.result?.positions, payload?.rows, payload?.positions];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as KalkRow[];
  }
  return [];
}
function getPayloadTotal(payload: any): number {
  return n(payload?.summary?.rlcKiNet ?? payload?.summary?.rlcKiTotalNet ?? payload?.summary?.totalNet ?? payload?.summary?.netto ?? payload?.summary?.net ?? payload?.totals?.netto ?? payload?.totals?.net ?? payload?.kalkulation?.summary?.rlcKiNet ?? payload?.kalkulation?.summary?.totalNet ?? payload?.calculation?.summary?.rlcKiNet ?? payload?.calculation?.summary?.totalNet ?? payload?.data?.summary?.rlcKiNet ?? payload?.data?.summary?.rlcKiTotalNet ?? payload?.data?.summary?.totalNet ?? payload?.data?.summary?.netto ?? payload?.data?.summary?.net ?? payload?.data?.totals?.netto ?? payload?.data?.totals?.net ?? payload?.data?.kalkulation?.summary?.rlcKiNet ?? payload?.data?.kalkulation?.summary?.totalNet ?? payload?.data?.totalNet ?? payload?.data?.netto ?? payload?.totalNet ?? payload?.netto);
}
function getPayloadCount(payload: any): number {
  return n(payload?.summary?.count ?? payload?.summary?.positionCount ?? payload?.kalkulation?.summary?.count ?? payload?.kalkulation?.summary?.positionCount ?? payload?.calculation?.summary?.count ?? payload?.data?.summary?.count ?? payload?.data?.summary?.positionCount);
}
function hasCalculatedMoney(row: KalkRow): boolean {
  return n(row.rlcKiUnitPrice) > 0 || n(row.kiUnitPrice) > 0 || n(row.calculatedUnitPrice) > 0 || n(row.finalUnitPrice) > 0 || n(row.suggestedUnitPrice) > 0 || n(row.unitPriceNet) > 0 || n(row.ep) > 0 || n(row.rlcKiTotal) > 0 || n(row.kiTotal) > 0 || n(row.calculatedTotal) > 0 || n(row.totalNet) > 0 || n(row.gp) > 0;
}
function looksLikeSavedCalculation(payload: any, rows: KalkRow[]): boolean {
  if (payload?.exists === false) return false;
  if (!rows.length) return false;

  // Non basta un totale server: alcune route LV restituiscono 465 righe e un
  // summary, ma senza EP/GP. Quelle NON sono una Kalkulation KI salvata.
  const priced = rows.filter(hasCalculatedMoney).length;
  return priced > 0 && priced / rows.length >= 0.4;
}
function scaleMoneyValue(value: any, scale: number): number {
  const parsed = n(value);
  return parsed > 0 ? round2(parsed / scale) : parsed;
}
function withScaledMoney(row: KalkRow, scale: number): KalkRow {
  if (scale === 1) return row;
  return {
    ...row,
    ep: scaleMoneyValue(row.ep, scale),
    gp: scaleMoneyValue(row.gp, scale),
    preis: scaleMoneyValue(row.preis, scale),
    unitPrice: scaleMoneyValue(row.unitPrice, scale),
    unitPriceNet: scaleMoneyValue(row.unitPriceNet, scale),
    finalUnitPrice: scaleMoneyValue(row.finalUnitPrice, scale),
    suggestedUnitPrice: scaleMoneyValue(row.suggestedUnitPrice, scale),
    baseUnitPrice: scaleMoneyValue(row.baseUnitPrice, scale),
    calculatedUnitPrice: scaleMoneyValue(row.calculatedUnitPrice, scale),
    kiUnitPrice: scaleMoneyValue(row.kiUnitPrice, scale),
    rlcKiUnitPrice: scaleMoneyValue(row.rlcKiUnitPrice, scale),
    total: scaleMoneyValue(row.total, scale),
    totalNet: scaleMoneyValue(row.totalNet, scale),
    calculatedTotal: scaleMoneyValue(row.calculatedTotal, scale),
    kiTotal: scaleMoneyValue(row.kiTotal, scale),
    rlcKiTotal: scaleMoneyValue(row.rlcKiTotal, scale),
    angebotUnitPrice: scaleMoneyValue(row.angebotUnitPrice, scale),
    angebotTotal: scaleMoneyValue(row.angebotTotal, scale),
    x84UnitPrice: scaleMoneyValue(row.x84UnitPrice, scale),
    x84Total: scaleMoneyValue(row.x84Total, scale)
  };
}
function normalizeMoneyScale(rows: KalkRow[], explicitTotal?: number): {
  rows: KalkRow[];
  totalNet?: number;
  scale: number;
} {
  const rawTotal = rows.reduce((sum, row) => sum + rowGp(row), 0);
  const totalCandidate = explicitTotal && explicitTotal > 0 ? explicitTotal : rawTotal;
  const shouldScaleCents = rows.length >= 20 && totalCandidate > 50000000 && totalCandidate / 100 > 10000 && totalCandidate / 100 < 50000000;
  const scale = shouldScaleCents ? 100 : 1;
  if (scale === 1) return {
    rows,
    totalNet: explicitTotal,
    scale
  };
  return {
    rows: rows.map(r => withScaledMoney(r, scale)),
    totalNet: explicitTotal && explicitTotal > 0 ? round2(explicitTotal / scale) : undefined,
    scale
  };
}
async function readJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
function payloadToLoadResult(payload: any, sourceLabel: string): LoadResult | null {
  const rows = extractRows(payload);
  if (!looksLikeSavedCalculation(payload, rows)) return null;
  const normalized = normalizeMoneyScale(rows, getPayloadTotal(payload));
  return {
    rows: normalized.rows,
    totalNet: normalized.totalNet,
    sourceLabel: normalized.scale === 100 ? `${sourceLabel} · Cent normalisiert` : sourceLabel,
    hasSavedCalculation: true
  };
}
async function loadSavedKalkulation(projectId: string, projectCode?: string): Promise<LoadResult> {
  const anyApi = api as any;
  const apiCandidates = [() => anyApi.getMobileKalkulation?.(projectId, projectCode), () => anyApi.getProjectKalkulation?.(projectId, projectCode), () => anyApi.getKalkulationRows?.(projectId, projectCode)];
  for (const fn of apiCandidates) {
    try {
      const payload = await fn();
      const result = payloadToLoadResult(payload, "Server-Kalkulation");
      if (result) return result;
    } catch {
      // next fallback
    }
  }
  const base = await anyApi.getApiUrl?.();
  if (!base) {
    return {
      rows: [],
      sourceLabel: "Keine API",
      hasSavedCalculation: false,
      message: "API-URL nicht verfügbar."
    };
  }
  const ids = [projectId, projectCode].filter(Boolean).map(x => encodeURIComponent(String(x)));
  const urls = ids.flatMap(id => [`${base}/api/kalkulation/${id}/ki`, `${base}/api/mobile/projects/${id}/kalkulation`, `${base}/api/projects/${id}/kalkulation`, `${base}/api/kalkulation/projects/${id}`, `${base}/api/kalkulation/project/${id}`, `${base}/api/project-kalkulation/${id}`]);
  let lastError = "";
  for (const url of urls) {
    try {
      const payload = await readJson(url);
      const result = payloadToLoadResult(payload, "Server-Kalkulation");
      if (result) return result;
    } catch (e: any) {
      lastError = String(e?.message || e);
    }
  }
  return {
    rows: [],
    sourceLabel: "Keine gespeicherte Kalkulation",
    hasSavedCalculation: false,
    message: lastError || "Keine gültige Server-Kalkulation gefunden. Web-Kalkulation bitte einmal auf dem Server speichern oder neu berechnen."
  };
}
export default function KalkulationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const {
    projectId,
    projectCode,
    title
  } = route.params;
  const [rows, setRows] = useState<KalkRow[]>([]);
  const [serverTotalNet, setServerTotalNet] = useState<number | undefined>(undefined);
  const [hasSavedCalculation, setHasSavedCalculation] = useState(false);
  const [filter, setFilter] = useState<KalkulationFilterType>(route.params.filter || "ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const result = await loadSavedKalkulation(projectId, projectCode);
      setRows(result.rows);
      setServerTotalNet(result.totalNet);
      setHasSavedCalculation(result.hasSavedCalculation);
      setSourceLabel(result.sourceLabel);
      if (result.message) setError(result.message);
    } catch (e: any) {
      setError(String(e?.message || e));
      setRows([]);
      setServerTotalNet(undefined);
      setHasSavedCalculation(false);
      setSourceLabel("Fehler");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectCode, projectId]);
  useEffect(() => {
    load(false);
  }, [load]);
  const visibleRows = useMemo(() => filterRows(rows, filter, query), [filter, query, rows]);
  const calculatedTotalNet = useMemo(() => round2(rows.reduce((sum, row) => sum + rowGp(row), 0)), [rows]);
  const totalNet = serverTotalNet && serverTotalNet > 0 ? serverTotalNet : calculatedTotalNet;
  const visibleTotal = useMemo(() => round2(visibleRows.reduce((sum, row) => sum + rowGp(row), 0)), [visibleRows]);
  const criticalCount = useMemo(() => rows.filter(isCritical).length, [rows]);
  const outlierCount = useMemo(() => rows.filter(isOutlier).length, [rows]);
  const openKi = () => navigation.navigate("KiCalculation", {
    projectId,
    projectCode,
    title
  });
  const openOutliers = () => navigation.navigate("KalkulationOutlier", {
    projectId,
    projectCode,
    title,
    filter: "OUTLIER"
  });
  const openCopilot = () => navigation.navigate("RlcCopilot", {
    projectId,
    projectCode,
    title,
    entryMode: "kalkulation"
  });
  const explainRow = (row: KalkRow) => {
    navigation.navigate("RlcCopilot", {
      projectId,
      projectCode,
      title,
      entryMode: "position",
      positionId: row.id || row.positionId,
      posNr: rowPos(row),
      initialMessage: `Erkläre mir Position ${rowPos(row)}: ${rowTitle(row)}`
    });
  };
  const renderRow = ({
    item
  }: {
    item: KalkRow;
  }) => {
    const warning = rowWarning(item);
    const source = compact(String(item.source || ""));
    return <Pressable style={styles.card} onPress={() => explainRow(item)}>
        <View style={styles.cardTop}>
          <Text style={styles.pos}>{rowPos(item)}</Text>
          <Text style={styles.gp} numberOfLines={1}>{money(rowGp(item))}</Text>
        </View>
        <Text style={styles.title}>{rowTitle(item)}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{rowQty(item).toLocaleString("de-DE")} {item.einheit || ""}</Text>
          <Text style={styles.meta}>EP {money(rowEp(item))}</Text>
          {!!source && <Text style={styles.meta} numberOfLines={1}>{source}</Text>}
        </View>
        {!!warning && <Text style={styles.warning} numberOfLines={3}>{warning}</Text>}
      </Pressable>;
  };
  if (loading) {
    return <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.centerText}>Server-Kalkulation wird geladen…</Text>
      </SafeAreaView>;
  }
  return <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kalkulation</Text>
        <Text style={styles.headerSub}>{title || projectCode || projectId}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{rows.length}</Text>
            <Text style={styles.statLabel}>Positionen</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue} numberOfLines={2}>{money(totalNet)}</Text>
            <Text style={styles.statLabel}>Netto</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{criticalCount}</Text>
            <Text style={styles.statLabel}>Prüfen</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.primaryButton} onPress={openKi}><Text style={styles.primaryText}>KI rechnen</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={openOutliers}><Text style={styles.secondaryText}>Outlier {outlierCount}</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={openCopilot}><Text style={styles.secondaryText}>Copilot</Text></Pressable>
      </View>

      <TextInput value={query} onChangeText={setQuery} placeholder="Position, Kurztext oder Hinweis suchen…" style={styles.search} placeholderTextColor={COLORS.sub} />

      <FlatList horizontal data={FILTERS} keyExtractor={item => item.key} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList} renderItem={({
      item
    }) => <Pressable style={[styles.filterChip, filter === item.key && styles.filterChipActive]} onPress={() => setFilter(item.key)}>
            <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
          </Pressable>} />

      <View style={styles.listInfo}>
        <Text style={styles.listInfoText}>{visibleRows.length} sichtbar · {money(visibleTotal)}</Text>
        {!!sourceLabel && <Text style={styles.listInfoText} numberOfLines={1}>Quelle: {sourceLabel}</Text>}
      </View>

      {!!error && <Pressable style={hasSavedCalculation ? styles.errorBox : styles.noticeBox} onPress={() => Alert.alert("Kalkulation", error)}>
          <Text style={hasSavedCalculation ? styles.errorText : styles.noticeText}>{error}</Text>
        </Pressable>}

      {!hasSavedCalculation && !rows.length ? <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Keine Server-Kalkulation gefunden.</Text>
          <Text style={styles.emptyText}>Mobile zeigt keine LV-Rohdaten als Kalkulation an. Erstelle oder speichere zuerst eine KI-Kalkulation auf dem Server.</Text>
          <Pressable style={styles.emptyAction} onPress={openKi}><Text style={styles.emptyActionText}>KI-Kalkulation öffnen</Text></Pressable>
        </View> : <FlatList data={visibleRows} keyExtractor={(item, index) => String(item.id || item.positionId || `${rowPos(item)}-${index}`)} renderItem={renderRow} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
      setRefreshing(true);
      load(true);
    }} />} contentContainerStyle={visibleRows.length ? styles.rows : styles.emptyRows} ListEmptyComponent={<Text style={styles.emptyText}>Keine Positionen gefunden.</Text>} />}
    </SafeAreaView>;
}
const styles = createRlcStyles("KalkulationScreen", {
  container: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg
  },
  centerText: {
    marginTop: 12,
    fontWeight: "600",
    color: COLORS.text
  },
  header: {
    padding: RLC_SPACING.page,
    paddingBottom: 10,
    backgroundColor: COLORS.bg
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 27
  },
  headerSub: {
    color: COLORS.sub,
    marginTop: 4,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RLC_RADIUS.button,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 94,
    justifyContent: "space-between"
  },
  statValue: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 18,
    lineHeight: 23
  },
  statLabel: {
    color: COLORS.sub,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600"
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: COLORS.bg
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    padding: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  primaryText: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.card2,
    padding: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  secondaryText: {
    color: COLORS.text,
    fontWeight: "600"
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontWeight: "600"
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  filterChipActive: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.text
  },
  filterText: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12
  },
  filterTextActive: {
    color: COLORS.textLight
  },
  listInfo: {
    paddingHorizontal: 16,
    paddingBottom: 6
  },
  listInfoText: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12
  },
  errorBox: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 12,
    marginBottom: 8
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: "600"
  },
  noticeBox: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8
  },
  noticeText: {
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 18
  },
  rows: {
    paddingHorizontal: 16,
    paddingBottom: 26
  },
  emptyRows: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyState: {
    margin: 16,
    padding: RLC_SPACING.page,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  emptyTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 18,
    marginBottom: 8
  },
  emptyText: {
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20
  },
  emptyAction: {
    marginTop: 14,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: "center"
  },
  emptyActionText: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RLC_RADIUS.button,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start"
  },
  pos: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "600"
  },
  gp: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "600",
    maxWidth: "62%",
    textAlign: "right"
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    lineHeight: 22
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  meta: {
    color: COLORS.sub,
    backgroundColor: COLORS.card2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    fontWeight: "600",
    fontSize: 12
  },
  warning: {
    color: COLORS.warning,
    marginTop: 10,
    fontWeight: "600",
    lineHeight: 18
  }
});
