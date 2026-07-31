// apps/mobile/src/screens/KalkulationOutlierScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { COLORS, createRlcStyles } from "../ui/theme";
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, "KalkulationOutlier">;
type OutlierRow = {
  id?: string;
  positionId?: string;
  posNr?: string;
  positionsnummer?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number | string;
  ep?: number | string;
  gp?: number | string;
  finalUnitPrice?: number | string;
  rlcKiUnitPrice?: number | string;
  totalNet?: number | string;
  warning?: string;
  warnings?: string[];
  riskLevel?: string;
  reason?: string;
  type?: string;
};
function n(value: any): number {
  const parsed = typeof value === "number" ? value : Number(String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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
function pos(row: OutlierRow): string {
  return compact(row.posNr || row.positionsnummer || "-");
}
function title(row: OutlierRow): string {
  return compact(row.kurztext || row.langtext || "Ohne Kurztext");
}
function warning(row: OutlierRow): string {
  if (row.reason) return compact(row.reason);
  if (Array.isArray(row.warnings)) return compact(row.warnings.join(" · "));
  return compact(row.warning || "");
}
function ep(row: OutlierRow): number {
  return n(row.finalUnitPrice ?? row.rlcKiUnitPrice ?? row.ep);
}
function gp(row: OutlierRow): number {
  const explicit = n(row.gp ?? row.totalNet);
  if (explicit > 0) return explicit;
  return n(row.menge) * ep(row);
}
function isOutlier(row: OutlierRow): boolean {
  const w = warning(row).toLowerCase();
  return String(row.riskLevel || "").toLowerCase() === "high" || w.includes("outlier") || w.includes("plaus") || w.includes("prüf") || w.includes("pruef") || w.includes("abweich") || ep(row) <= 0;
}
function extractRows(payload: any): OutlierRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.outliers)) return payload.outliers;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.positions)) return payload.positions;
  if (Array.isArray(payload?.data?.outliers)) return payload.data.outliers;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  return [];
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
async function loadOutliers(projectId: string, projectCode?: string): Promise<OutlierRow[]> {
  const anyApi = api as any;
  const apiCandidates = [() => anyApi.getMobileKalkulationOutliers?.(projectId, projectCode), () => anyApi.getProjectKalkulationOutliers?.(projectId, projectCode), () => anyApi.getKalkulationOutliers?.(projectId, projectCode), () => anyApi.getMobileKalkulation?.(projectId, projectCode), () => anyApi.getProjectKalkulation?.(projectId, projectCode)];
  for (const fn of apiCandidates) {
    try {
      const payload = await fn();
      const rows = extractRows(payload);
      if (rows.length) return rows.filter(isOutlier);
    } catch {
      // next
    }
  }
  const base = await anyApi.getApiUrl?.();
  if (!base) return [];
  const encodedId = encodeURIComponent(projectId);
  const urls = [`${base}/api/mobile/projects/${encodedId}/kalkulation/outliers`, `${base}/api/projects/${encodedId}/kalkulation/outliers`, `${base}/api/project-lv/${encodedId}`];
  for (const url of urls) {
    try {
      const payload = await readJson(url);
      const rows = extractRows(payload);
      if (rows.length) return rows.filter(isOutlier);
    } catch {
      // next
    }
  }
  return [];
}
export default function KalkulationOutlierScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const {
    projectId,
    projectCode,
    title: projectTitle
  } = route.params;
  const [rows, setRows] = useState<OutlierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await loadOutliers(projectId, projectCode);
      setRows(result);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectCode, projectId]);
  useEffect(() => {
    load();
  }, [load]);
  const totalRisk = useMemo(() => rows.reduce((sum, row) => sum + gp(row), 0), [rows]);
  const askCopilot = (row?: OutlierRow) => {
    navigation.navigate("RlcCopilot", {
      projectId,
      projectCode,
      title: projectTitle,
      entryMode: row ? "position" : "outlier",
      positionId: row?.id || row?.positionId,
      posNr: row ? pos(row) : undefined,
      initialMessage: row ? `Prüfe diesen Outlier fachlich: Position ${pos(row)} ${title(row)}. Hinweis: ${warning(row)}` : "Analysiere den Outlier Report dieses Projekts und priorisiere die wichtigsten Risiken."
    });
  };
  if (loading) {
    return <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.centerText}>Outlier Report wird geladen…</Text>
      </SafeAreaView>;
  }
  return <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Outlier Report</Text>
        <Text style={styles.sub}>{projectTitle || projectCode || projectId}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{rows.length}</Text><Text style={styles.statLabel}>Risiken</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{money(totalRisk)}</Text><Text style={styles.statLabel}>betroffener GP</Text></View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => askCopilot()}><Text style={styles.primaryText}>Mit Copilot analysieren</Text></Pressable>
        <Pressable style={styles.secondary} onPress={() => navigation.navigate("Kalkulation", {
        projectId,
        projectCode,
        title: projectTitle,
        filter: "ALL"
      })}><Text style={styles.secondaryText}>Kalkulation</Text></Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <FlatList data={rows} keyExtractor={(item, index) => String(item.id || item.positionId || `${pos(item)}-${index}`)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
      setRefreshing(true);
      load();
    }} />} contentContainerStyle={rows.length ? styles.list : styles.emptyList} ListEmptyComponent={<Text style={styles.empty}>Keine Outlier gefunden.</Text>} renderItem={({
      item
    }) => <Pressable style={styles.card} onPress={() => askCopilot(item)}>
            <View style={styles.cardTop}>
              <Text style={styles.pos}>{pos(item)}</Text>
              <Text style={styles.gp}>{money(gp(item))}</Text>
            </View>
            <Text style={styles.cardTitle}>{title(item)}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>EP {money(ep(item))}</Text>
              {!!item.einheit && <Text style={styles.meta}>Einheit {item.einheit}</Text>}
              {!!item.riskLevel && <Text style={styles.meta}>{item.riskLevel}</Text>}
            </View>
            <Text style={styles.warning}>{warning(item) || "Prüfpflichtige Position"}</Text>
          </Pressable>} />
    </SafeAreaView>;
}
const styles = createRlcStyles("KalkulationOutlierScreen", {
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
    backgroundColor: COLORS.bg,
    padding: 14,
    paddingBottom: 10
  },
  title: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 18,
    lineHeight: 27
  },
  sub: {
    color: COLORS.sub,
    marginTop: 4,
    fontWeight: "600"
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  stat: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44
  },
  statValue: {
    color: COLORS.text,
    fontWeight: "600"
  },
  statLabel: {
    color: COLORS.sub,
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600"
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: COLORS.bg
  },
  primary: {
    flex: 1.25,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 13,
    alignItems: "center"
  },
  primaryText: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  secondary: {
    flex: 1,
    backgroundColor: COLORS.card2,
    borderRadius: 12,
    padding: 13,
    alignItems: "center"
  },
  secondaryText: {
    color: COLORS.text,
    fontWeight: "600"
  },
  error: {
    margin: 16,
    color: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 12,
    padding: 12,
    fontWeight: "600"
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 28
  },
  emptyList: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  empty: {
    color: COLORS.sub,
    fontWeight: "600"
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  pos: {
    color: COLORS.text,
    fontWeight: "600"
  },
  gp: {
    color: COLORS.text,
    fontWeight: "600"
  },
  cardTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontWeight: "600",
    lineHeight: 20
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  meta: {
    backgroundColor: COLORS.card2,
    color: COLORS.sub,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
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
