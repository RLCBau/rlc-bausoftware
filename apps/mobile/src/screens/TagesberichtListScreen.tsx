// apps/mobile/src/screens/TagesberichtListScreen.tsx
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import { exportAndOpenTagesberichtPdf } from "../lib/exporters/projectExport";

type Props = NativeStackScreenProps<RootStackParamList, "TagesberichtList">;

const KEY = "rlc_tagesbericht_list:";

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
  createdAt?: number;
  updatedAt?: number;
};

function ymdNow() {
  return new Date().toISOString().slice(0, 10);
}

function monthNow() {
  return ymdNow().slice(0, 7);
}

function sortDesc(a: TagesberichtRow, b: TagesberichtRow) {
  const ad = String(a.date || "");
  const bd = String(b.date || "");
  if (ad < bd) return 1;
  if (ad > bd) return -1;
  return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
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

function summarizeLines(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) return "";

  return arr
    .map((x) => String(x?.taetigkeit || x?.notiz || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ");
}

function totalHours(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.reduce((sum, x) => sum + (Number(x?.stunden || 0) || 0), 0);
}

function totalWorkers(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  const set = new Set<string>();

  for (const x of arr) {
    const raw = String(x?.mitarbeiter || "").trim();
    if (!raw) continue;
    raw
      .split(/[;,/]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => set.add(s));
  }

  return set.size;
}

function totalMachines(lines?: TagesberichtLine[]) {
  const arr = Array.isArray(lines) ? lines : [];
  const set = new Set<string>();

  for (const x of arr) {
    const raw = String(x?.maschine || "").trim();
    if (!raw) continue;
    set.add(raw);
  }

  return set.size;
}

export default function TagesberichtListScreen({
  route,
  navigation,
}: Props) {
  const { projectId, projectCode, title } = route.params;
  const projectKey = String(projectCode || projectId || "").trim();

  const [rows, setRows] = useState<TagesberichtRow[]>([]);
  const [monthFilter, setMonthFilter] = useState(monthNow());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const list = await loadRows(projectKey);
      setRows([...list].sort(sortDesc));
    } finally {
      setBusy(false);
    }
  }, [projectKey]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Tagesberichte",
      headerStyle: { backgroundColor: "#12324A" },
      headerTitleStyle: { color: COLORS.card, fontWeight: "800" },
      headerTintColor: COLORS.card,
      headerRight: () => (
        <Pressable
          onPress={() => {
            navigation.navigate("SupportChat" as any, {
              projectId: String(projectId || ""),
              projectCode: String(projectCode || "").trim() || undefined,
              title: "RLC KI",
              screen: "TagesberichtList",
              initialMessage: "",
            });
          }}
          style={[s.headerKiBtn, { display: "none" }]}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={18}
            color="#12324A"
          />
          <Text style={s.headerKiTxt}>RLC KI</Text>
        </Pressable>
      ),
    });
  }, [navigation, projectId, projectCode]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();

    return rows.filter((r) => {
      const byMonth = !monthFilter || String(r.date || "").startsWith(monthFilter);
      if (!byMonth) return false;

      if (!q) return true;

      const lineText = summarizeLines(r.lines);

      const hay = [
        r.date,
        r.weather,
        r.temperature,
        r.workers,
        r.machines,
        r.workDone,
        r.issues,
        r.notes,
        lineText,
        ...(Array.isArray(r.lines)
          ? r.lines.flatMap((x) => [
              x?.mitarbeiter,
              x?.maschine,
              x?.ort,
              x?.taetigkeit,
              x?.notiz,
            ])
          : []),
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");

      return hay.includes(q);
    });
  }, [rows, monthFilter, search]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const withIssues = filtered.filter((x) => String(x.issues || "").trim()).length;
    const withMachines = filtered.filter(
      (x) => totalMachines(x.lines) > 0 || String(x.machines || "").trim()
    ).length;
    return { total, withIssues, withMachines };
  }, [filtered]);

  const onNew = () => {
    navigation.navigate("TagesberichtEditor" as any, {
      projectId,
      projectCode,
      title: title || "Tagesbericht",
    });
  };

  const onOpen = (item: TagesberichtRow) => {
    navigation.navigate("TagesberichtEditor" as any, {
      projectId,
      projectCode,
      title: title || "Tagesbericht",
      tagesberichtId: item.id,
    });
  };

  const onDelete = useCallback(
    (item: TagesberichtRow) => {
      Alert.alert(
        "Tagesbericht löschen",
        `Soll der Tagesbericht vom ${String(item.date || "—")} wirklich gelöscht werden?`,
        [
          { text: "Abbrechen", style: "cancel" },
          {
            text: "Löschen",
            style: "destructive",
            onPress: async () => {
              try {
                const list = await loadRows(projectKey);
                const next = list.filter((x) => String(x.id) !== String(item.id));
                await saveRows(projectKey, next);
                setRows([...next].sort(sortDesc));
              } catch (e: any) {
                Alert.alert(
                  "Fehler",
                  e?.message || "Tagesbericht konnte nicht gelöscht werden."
                );
              }
            },
          },
        ]
      );
    },
    [projectKey]
  );

  const onSinglePdf = useCallback(
    async (item: TagesberichtRow) => {
      try {
        setBusy(true);

        await exportAndOpenTagesberichtPdf({
          projectFsKey: projectKey,
          projectTitle: String(title || "Projekt"),
          filenameHint: `Tagesbericht_${String(item.date || "").slice(0, 10)}_${projectKey}`,
          row: {
            ...item,
            reportType: "TAGESBERICHT",
            docType: "TAGESBERICHT",
          } as any,
        });
      } catch (e: any) {
        Alert.alert("PDF Fehler", e?.message || "PDF konnte nicht erstellt werden.");
      } finally {
        setBusy(false);
      }
    },
    [projectKey, title]
  );

  const onBautagebuchPdf = useCallback(() => {
    navigation.navigate("Bautagebuch" as any, {
      projectId,
      projectCode,
      title: title || "Bautagebuch",
    });
  }, [navigation, projectId, projectCode, title]);

  const renderItem = ({ item }: { item: TagesberichtRow }) => {
    const lineSummary = summarizeLines(item.lines);
    const desc =
      lineSummary ||
      String(item.workDone || "").trim() ||
      String(item.notes || "").trim() ||
      "Kein Beschreibungstext";

    const lineCount = Array.isArray(item.lines) ? item.lines.length : 0;
    const hours = totalHours(item.lines);
    const workerCount = totalWorkers(item.lines);
    const machineCount = totalMachines(item.lines);

    return (
      <View style={s.rowCard}>
        <Pressable onPress={() => onOpen(item)} style={s.rowPressArea}>
          <View style={s.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{item.date || "—"}</Text>
              <Text style={s.rowSub} numberOfLines={2}>
                {desc}
              </Text>
            </View>

            <View style={s.openPill}>
              <Text style={s.openPillTxt}>Öffnen</Text>
            </View>
          </View>

          <View style={s.metaGrid}>
            <Text style={s.metaTxt}>Wetter: {item.weather || "—"}</Text>
            <Text style={s.metaTxt}>Temp.: {item.temperature || "—"}</Text>
            <Text style={s.metaTxt}>Zeilen: {lineCount}</Text>
            <Text style={s.metaTxt}>
              Stunden: {hours ? Number(hours).toLocaleString("de-DE") : "0"}
            </Text>
            <Text style={s.metaTxt}>
              Mitarbeiter: {workerCount || item.workers || "—"}
            </Text>
            <Text style={s.metaTxt}>
              Maschinen: {machineCount || item.machines || "—"}
            </Text>
          </View>

          <View style={s.footerRow}>
            <Text style={s.footerTxt}>
              Aktualisiert:{" "}
              {item.updatedAt
                ? new Date(item.updatedAt).toLocaleDateString()
                : "—"}
            </Text>
          </View>
        </Pressable>

        <View style={s.rowActionBar}>
          <Pressable style={s.rowGhostBtn} onPress={() => onOpen(item)}>
            <Text style={s.rowGhostBtnTxt}>Bearbeiten</Text>
          </Pressable>

          <Pressable
            style={s.rowGhostBtn}
            onPress={() => onSinglePdf(item)}
            disabled={busy}
          >
            <Text style={s.rowGhostBtnTxt}>PDF</Text>
          </Pressable>

          <Pressable
            style={[s.rowGhostBtn, s.rowDangerBtn]}
            onPress={() => onDelete(item)}
          >
            <Text style={[s.rowGhostBtnTxt, s.rowDangerBtnTxt]}>Löschen</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View style={s.headerWrap}>
      <View style={s.heroCompact}>
        <View style={s.heroLeft}>
          <Text style={s.heroTitle}>Tagesberichte</Text>
          <Text style={s.heroSub}>{title || "Projekt"}</Text>
          <Text style={s.projectTxt}>{projectKey}</Text>
        </View>

        <View style={s.heroBadge}>
          <Text style={s.heroBadgeTxt}>{summary.total}</Text>
        </View>
      </View>

      <View style={s.statRow}>
        <View style={s.statChip}>
          <Text style={s.statValue}>{summary.total}</Text>
          <Text style={s.statLabel}>Einträge</Text>
        </View>

        <View style={s.statChip}>
          <Text style={s.statValue}>{summary.withIssues}</Text>
          <Text style={s.statLabel}>Vorkommnisse</Text>
        </View>

        <View style={s.statChip}>
          <Text style={s.statValue}>{summary.withMachines}</Text>
          <Text style={s.statLabel}>Maschinen</Text>
        </View>
      </View>

      <View style={s.filterCompact}>
        <View style={s.monthBox}>
          <Text style={s.inputLabel}>Monat</Text>
          <TextInput
            value={monthFilter}
            onChangeText={setMonthFilter}
            style={s.input}
            placeholder="YYYY-MM"
            placeholderTextColor="#B8C1CC"
          />
        </View>

        <View style={s.searchBox}>
          <Text style={s.inputLabel}>Suche</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            style={s.input}
            placeholder="Wetter, Tätigkeit, Mitarbeiter..."
            placeholderTextColor="#B8C1CC"
          />
        </View>
      </View>

      <View style={s.actionRow}>
        <Pressable style={s.primaryBtn} onPress={onNew}>
          <Text style={s.primaryBtnTxt}>+ Neu</Text>
        </Pressable>

        <Pressable style={s.secondaryBtn} onPress={onBautagebuchPdf}>
          <Text style={s.secondaryBtnTxt}>PDF</Text>
        </Pressable>

        <Pressable style={s.refreshBtn} onPress={refresh} disabled={busy}>
          <Text style={s.refreshBtnTxt}>{busy ? "..." : "Refresh"}</Text>
        </Pressable>
      </View>

      <View style={s.counterRow}>
        <Text style={s.counterTxt}>
          {summary.total} Einträge{monthFilter ? ` · ${monthFilter}` : ""}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Keine Tagesberichte gefunden</Text>
            <Text style={s.emptySub}>
              Für den gewählten Zeitraum oder die Suche sind noch keine Einträge vorhanden.
            </Text>

            <Pressable style={s.emptyBtn} onPress={onNew}>
              <Text style={s.emptyBtnTxt}>Ersten Tagesbericht anlegen</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  headerKiBtn: { display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#DDF1FF",
    borderWidth: 1,
    borderColor: "#A8D3F5",
  },

  headerKiTxt: {
    color: "#12324A",
    fontWeight: "900",
    fontSize: 13,
  },

  listContent: {
    padding: 16,
    paddingBottom: 24,
  },

  headerWrap: {
    marginBottom: 12,
    gap: 10,
  },

  heroCompact: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },

  heroLeft: {
    flex: 1,
  },

  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },

  heroSub: {
    marginTop: 2,
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 14,
  },

  projectTxt: {
    marginTop: 6,
    color: COLORS.accent,
    fontWeight: "900",
    fontSize: 14,
  },

  heroBadge: {
    minWidth: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  heroBadgeTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 16,
  },

  statRow: {
    flexDirection: "row",
    gap: 8,
  },

  statChip: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },

  statValue: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },

  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.sub,
    textAlign: "center",
  },

  filterCompact: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },

  monthBox: {
    gap: 6,
  },

  searchBox: {
    gap: 6,
  },

  inputLabel: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "800",
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
  },

  primaryBtn: {
    flex: 1.2,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
    paddingHorizontal: 12,
  },

  primaryBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 14,
  },

  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },

  secondaryBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
  },

  refreshBtn: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  refreshBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  counterRow: {
    paddingHorizontal: 2,
    marginTop: 2,
  },

  counterTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  rowCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },

  rowPressArea: {
    gap: 0,
  },

  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  rowTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  rowSub: {
    marginTop: 5,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 18,
    fontSize: 13,
  },

  openPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },

  openPillTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 12,
  },

  metaGrid: {
    marginTop: 10,
    gap: 6,
  },

  metaTxt: {
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 12,
  },

  footerRow: {
    marginTop: 10,
  },

  footerTxt: {
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 12,
  },

  rowActionBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexWrap: "wrap",
  },

  rowGhostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  rowGhostBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  rowDangerBtn: {
    backgroundColor: "#FFF1F3",
    borderColor: "#F3C7CF",
  },

  rowDangerBtnTxt: {
    color: "#C33",
  },

  emptyCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    marginTop: 4,
  },

  emptyTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  emptySub: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 19,
  },

  emptyBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
  },

  emptyBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },
});





