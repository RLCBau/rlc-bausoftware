// apps/mobile/src/screens/KiCalculationScreen.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { COLORS } from "../ui/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, "KiCalculation">;

type KiSummary = {
  ok?: boolean;
  count?: number;
  totalNet?: number;
  source?: string;
  engine?: string;
  warningCount?: number;
  reviewCount?: number;
  outlierCount?: number;
  message?: string;
  loadedOnly?: boolean;
  centsNormalized?: boolean;
  hasSavedCalculation?: boolean;
};

type KiRow = Record<string, any>;

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
  return `${n(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function rowQty(r: KiRow): number {
  return n(r?.menge ?? r?.quantity);
}

function rowEp(r: KiRow): number {
  return n(
    r?.rlcKiUnitPrice ??
      r?.kiUnitPrice ??
      r?.calculatedUnitPrice ??
      r?.finalUnitPrice ??
      r?.suggestedUnitPrice ??
      r?.unitPriceNet ??
      r?.unitPrice ??
      r?.ep ??
      r?.preis
  );
}

function rowGp(r: KiRow): number {
  const explicit = n(r?.rlcKiTotal ?? r?.kiTotal ?? r?.calculatedTotal ?? r?.totalNet ?? r?.total ?? r?.gp);
  if (explicit > 0) return explicit;
  const qty = rowQty(r);
  const ep = rowEp(r);
  return qty > 0 && ep > 0 ? round2(qty * ep) : 0;
}

function extractRows(payload: any): KiRow[] {
  const candidates = [
    payload?.kalkulation?.rows,
    payload?.kalkulation?.positions,
    payload?.calculation?.rows,
    payload?.calculation?.positions,
    payload?.data?.kalkulation?.rows,
    payload?.data?.kalkulation?.positions,
    payload?.data?.calculation?.rows,
    payload?.data?.calculation?.positions,
    payload?.data?.rows,
    payload?.data?.positions,
    payload?.result?.rows,
    payload?.result?.positions,
    payload?.rows,
    payload?.positions,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function payloadTotal(payload: any): number {
  return n(
    payload?.summary?.rlcKiNet ??
      payload?.summary?.rlcKiTotalNet ??
      payload?.summary?.totalNet ??
      payload?.summary?.netto ??
      payload?.kalkulation?.summary?.rlcKiNet ??
      payload?.kalkulation?.summary?.totalNet ??
      payload?.calculation?.summary?.rlcKiNet ??
      payload?.calculation?.summary?.totalNet ??
      payload?.data?.summary?.rlcKiNet ??
      payload?.data?.summary?.totalNet ??
      payload?.data?.kalkulation?.summary?.rlcKiNet ??
      payload?.data?.kalkulation?.summary?.totalNet ??
      payload?.totalNet ??
      payload?.netto
  );
}

function payloadCount(payload: any): number {
  return n(
    payload?.summary?.count ??
      payload?.summary?.positionCount ??
      payload?.kalkulation?.summary?.count ??
      payload?.kalkulation?.summary?.positionCount ??
      payload?.calculation?.summary?.count ??
      payload?.data?.summary?.count ??
      payload?.data?.summary?.positionCount
  );
}

function rowHasCalculatedMoney(r: KiRow): boolean {
  return (
    n(r?.rlcKiUnitPrice) > 0 ||
    n(r?.kiUnitPrice) > 0 ||
    n(r?.calculatedUnitPrice) > 0 ||
    n(r?.finalUnitPrice) > 0 ||
    n(r?.suggestedUnitPrice) > 0 ||
    n(r?.unitPriceNet) > 0 ||
    n(r?.ep) > 0 ||
    n(r?.rlcKiTotal) > 0 ||
    n(r?.kiTotal) > 0 ||
    n(r?.calculatedTotal) > 0 ||
    n(r?.totalNet) > 0 ||
    n(r?.gp) > 0
  );
}

function looksLikeSavedCalculation(payload: any, rows: KiRow[]): boolean {
  const explicitTotal = payloadTotal(payload);
  const explicitCount = payloadCount(payload);
  if (explicitTotal > 0 && (rows.length > 0 || explicitCount > 0)) return true;
  if (!rows.length) return false;
  const priced = rows.filter(rowHasCalculatedMoney).length;
  return priced > 0 && priced / rows.length >= 0.4;
}

function shouldNormalizeCents(rows: KiRow[], totalNet: number): boolean {
  return rows.length >= 20 && totalNet > 50000000 && totalNet / 100 > 10000 && totalNet / 100 < 50000000;
}

function normalizeSummary(payload: any, loadedOnly = false): KiSummary | null {
  const rows = extractRows(payload);
  if (!looksLikeSavedCalculation(payload, rows) && loadedOnly) return null;

  const summary = payload?.summary || payload?.data?.summary || payload?.kalkulation?.summary || payload?.calculation?.summary || payload;
  const rawTotal = payloadTotal(payload) || rows.reduce((sum: number, r: any) => sum + rowGp(r), 0);
  const centsNormalized = shouldNormalizeCents(rows, rawTotal);
  const scale = centsNormalized ? 100 : 1;
  const totalNet = round2(rawTotal / scale);

  const warningCount =
    n(summary?.warningCount ?? summary?.warnings) ||
    rows.filter((r: any) => r.warning || r.pruefHinweis || (Array.isArray(r.warnings) && r.warnings.length)).length;

  const reviewCount =
    n(summary?.reviewCount ?? summary?.needsReview ?? summary?.review) ||
    rows.filter((r: any) => String(r.calculationStatus || r.status || "").toLowerCase().includes("review")).length;

  const outlierCount =
    n(summary?.outlierCount ?? summary?.outliers) ||
    rows.filter((r: any) => String(r.warning || r.pruefHinweis || "").toLowerCase().includes("outlier")).length;

  return {
    ok: payload?.ok ?? true,
    count: n(summary?.count ?? summary?.positionCount) || rows.length,
    totalNet,
    source: loadedOnly ? "gespeicherte Kalkulation" : String(payload?.source || summary?.source || "server"),
    engine: String(payload?.engine || summary?.engine || "RLC-KI"),
    warningCount,
    reviewCount,
    outlierCount,
    message: payload?.message || summary?.message,
    loadedOnly,
    centsNormalized,
    hasSavedCalculation: looksLikeSavedCalculation(payload, rows),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Serverprozess wurde gestartet oder braucht zu lange. Bitte später vorhandene Berechnung laden.")), ms);
    promise.then(
      (value) => {
        clearTimeout(t);
        resolve(value);
      },
      (error) => {
        clearTimeout(t);
        reject(error);
      }
    );
  });
}

async function postJson(url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function readExistingCalculation(projectId: string, projectCode?: string): Promise<KiSummary> {
  const anyApi = api as any;
  const apiCandidates = [
    () => anyApi.getMobileKalkulation?.(projectId, projectCode),
    () => anyApi.getProjectKalkulation?.(projectId, projectCode),
    () => anyApi.getKalkulationRows?.(projectId, projectCode),
  ];

  for (const fn of apiCandidates) {
    try {
      const payload = await fn();
      const normalized = normalizeSummary(payload, true);
      if (normalized) return normalized;
    } catch {
      // next fallback
    }
  }

  const base = await anyApi.getApiUrl?.();
  if (!base) throw new Error("API-URL nicht verfügbar.");

  const ids = [projectId, projectCode].filter(Boolean).map((x) => encodeURIComponent(String(x)));
  const urls = ids.flatMap((id) => [
    `${base}/api/mobile/projects/${id}/kalkulation`,
    `${base}/api/projects/${id}/kalkulation`,
    `${base}/api/kalkulation/projects/${id}`,
    `${base}/api/kalkulation/project/${id}`,
    `${base}/api/project-kalkulation/${id}`,
  ]);

  let lastError = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const payload = await res.json();
      const normalized = normalizeSummary(payload, true);
      if (normalized) return normalized;
    } catch (e: any) {
      lastError = String(e?.message || e);
    }
  }

  throw new Error(lastError || "Keine gespeicherte KI-Kalkulation auf dem Server gefunden.");
}

async function runKiCalculation(projectId: string, projectCode?: string, forceRecalculate?: boolean): Promise<KiSummary> {
  const anyApi = api as any;
  const apiCandidates = [
    () => anyApi.startKiCalculationJob?.({ projectId, projectCode, forceRecalculate }),
    () => anyApi.runMobileKiCalculation?.({ projectId, projectCode, forceRecalculate }),
    () => anyApi.runProjectKiCalculation?.(projectId, { projectCode, forceRecalculate }),
    () => anyApi.calculateProjectKi?.(projectId, projectCode, forceRecalculate),
  ];

  for (const fn of apiCandidates) {
    try {
      const payload = await withTimeout(Promise.resolve(fn()), 30000);
      const normalized = normalizeSummary(payload, false);
      if (normalized) return normalized;
      return { ok: true, count: 0, totalNet: 0, source: "server", engine: "RLC-KI", message: "Serverprozess gestartet. Bitte vorhandene Berechnung später laden." };
    } catch {
      // fallback
    }
  }

  const base = await anyApi.getApiUrl?.();
  if (!base) throw new Error("API-URL nicht verfügbar.");

  const encodedId = encodeURIComponent(projectId);
  const urls = [
    `${base}/api/mobile/projects/${encodedId}/kalkulation/ki/run`,
    `${base}/api/projects/${encodedId}/kalkulation/ki/run`,
    `${base}/api/kalkulation/ki/project/${encodedId}/run`,
  ];

  let lastError = "";
  for (const url of urls) {
    try {
      const payload = await withTimeout(postJson(url, { projectId, projectCode, forceRecalculate: Boolean(forceRecalculate) }), 30000);
      const normalized = normalizeSummary(payload, false);
      if (normalized) return normalized;
      return { ok: true, count: 0, totalNet: 0, source: "server", engine: "RLC-KI", message: "Serverprozess gestartet. Bitte vorhandene Berechnung später laden." };
    } catch (e: any) {
      lastError = String(e?.message || e);
    }
  }

  throw new Error(lastError || "KI-Kalkulation konnte nicht gestartet werden.");
}

export default function KiCalculationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { projectId, projectCode, title, forceRecalculate } = route.params;

  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<KiSummary | null>(null);
  const [error, setError] = useState("");

  const loadExisting = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const result = await readExistingCalculation(projectId, projectCode);
      setSummary(result);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [projectCode, projectId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const startRecalculate = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const result = await runKiCalculation(projectId, projectCode, true);
      setSummary(result);
      if (result.message) Alert.alert("KI-Kalkulation", result.message);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
      Alert.alert("KI-Kalkulation", msg);
    } finally {
      setRunning(false);
    }
  }, [projectCode, projectId]);

  const confirmRecalculate = useCallback(() => {
    if (summary?.hasSavedCalculation || summary?.count || summary?.totalNet) {
      Alert.alert(
        "KI neu berechnen?",
        "Es existiert bereits eine Kalkulation für dieses Projekt. Willst du sie wirklich neu mit KI berechnen? Die bisherige Server-Kalkulation kann überschrieben werden.",
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Neu berechnen", style: "destructive", onPress: startRecalculate },
        ]
      );
      return;
    }
    Alert.alert(
      "KI-Kalkulation starten?",
      "Mobile startet nur den Serverprozess. Das Handy berechnet die  Positionen nicht lokal.",
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Starten", onPress: startRecalculate },
      ]
    );
  }, [startRecalculate, summary]);

  useEffect(() => {
    if (forceRecalculate) confirmRecalculate();
  }, [confirmRecalculate, forceRecalculate]);

  const openKalkulation = () => navigation.navigate("Kalkulation", { projectId, projectCode, title });
  const openOutliers = () => navigation.navigate("KalkulationOutlier", { projectId, projectCode, title, filter: "OUTLIER" });
  const openCopilot = () => navigation.navigate("RlcCopilot", { projectId, projectCode, title, entryMode: "kalkulation", initialMessage: "Analysiere die KI-Kalkulation dieses Projekts." });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>KI-Kalkulation</Text>
          <Text style={styles.heroSub}>{title || projectCode || projectId}</Text>
          <Text style={styles.heroText}>Mobile lädt vorhandene Server-Ergebnisse. Neue Berechnung wird nur nach Bestätigung als Serverprozess gestartet.</Text>
        </View>

        <Pressable style={[styles.runButton, running && styles.disabled]} onPress={confirmRecalculate} disabled={running}>
          {running ? <ActivityIndicator color="white" /> : <Text style={styles.runText}>KI neu berechnen</Text>}
        </Pressable>

        <Pressable style={[styles.secondaryButton, running && styles.disabled]} onPress={loadExisting} disabled={running}>
          <Text style={styles.secondaryText}>Vorhandene Berechnung laden / prüfen</Text>
        </Pressable>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {summary && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Ergebnis</Text>
            <View style={styles.grid}>
              <Info label="Positionen" value={String(summary.count || 0)} />
              <Info label="Netto" value={money(summary.totalNet)} />
              <Info label="Hinweise" value={String(summary.warningCount || 0)} />
              <Info label="Review" value={String(summary.reviewCount || 0)} />
              <Info label="Outlier" value={String(summary.outlierCount || 0)} />
              <Info label="Quelle" value={summary.loadedOnly ? "geladen" : "Serverprozess"} />
            </View>
            <Text style={styles.engine} numberOfLines={2}>Engine: {summary.engine || "RLC-KI"}</Text>
            {summary.centsNormalized && <Text style={styles.message}>Cent-Rohwerte erkannt und für Mobile korrekt normalisiert.</Text>}
            {!!summary.message && <Text style={styles.message}>{summary.message}</Text>}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={openKalkulation}><Text style={styles.actionText}>Kalkulation öffnen</Text></Pressable>
          <Pressable style={styles.action} onPress={openOutliers}><Text style={styles.actionText}>Outlier Report</Text></Pressable>
          <Pressable style={styles.action} onPress={openCopilot}><Text style={styles.actionText}>Copilot fragen</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 32 },
  hero: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  heroTitle: { color: COLORS.text, fontSize: 34, fontWeight: "900", lineHeight: 40 },
  heroSub: { color: COLORS.sub, marginTop: 4, fontWeight: "900", fontSize: 16 },
  heroText: { color: COLORS.sub, marginTop: 10, lineHeight: 20, fontWeight: "800" },
  runButton: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  disabled: { opacity: 0.6 },
  runText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryButton: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  secondaryText: { color: COLORS.text, fontWeight: "900" },
  error: { color: "#991b1b", backgroundColor: "#fee2e2", padding: 12, borderRadius: 12, marginTop: 12, fontWeight: "900" },
  resultBox: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginTop: 14, borderWidth: 1, borderColor: COLORS.border },
  resultTitle: { fontWeight: "900", fontSize: 20, marginBottom: 12, color: COLORS.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  info: { width: "48%", backgroundColor: COLORS.card2, borderRadius: 12, padding: 12, minHeight: 78 },
  infoValue: { color: COLORS.text, fontWeight: "900", fontSize: 15 },
  infoLabel: { color: COLORS.sub, fontWeight: "800", marginTop: 4, fontSize: 12 },
  engine: { marginTop: 12, color: COLORS.sub, fontWeight: "900" },
  message: { marginTop: 8, color: COLORS.sub, fontWeight: "800", lineHeight: 19 },
  actions: { marginTop: 14, gap: 10 },
  action: { backgroundColor: COLORS.card2, borderRadius: 12, padding: 14, alignItems: "center" },
  actionText: { color: COLORS.text, fontWeight: "900" },
});


