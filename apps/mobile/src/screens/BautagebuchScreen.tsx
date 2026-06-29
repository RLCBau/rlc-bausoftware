// apps/mobile/src/screens/BautagebuchScreen.tsx
import React, { useLayoutEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import {
  buildBautagebuchPdf,
  openBautagebuchPdf,
  type BautagebuchRow,
} from "../lib/exporters/bautagebuchPdfBuilder";
import { submitToEingangPruefung } from "../lib/submitToEingangPruefung";

type Props = NativeStackScreenProps<RootStackParamList, "Bautagebuch">;

const KEY = "rlc_tagesbericht_list:";

export default function BautagebuchScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title } = route.params;

  const projectKey = String(projectCode || projectId || "").trim();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [statsBusy, setStatsBusy] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    withIssues: 0,
    withMachines: 0,
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Bautagebuch",
      headerStyle: {
        backgroundColor: "#12324A",
      },
      headerTitleStyle: {
        color: COLORS.card,
        fontWeight: "800",
      },
      headerTintColor: COLORS.card,
      headerRight: () => (
        <Pressable
          onPress={() => {
            navigation.navigate("SupportChat" as any, {
              projectId: String(projectId || ""),
              projectCode: String(projectCode || "").trim() || undefined,
              title: "RLC KI",
              screen: "Bautagebuch",
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

  async function loadTagesberichte(): Promise<BautagebuchRow[]> {
    try {
      const raw = await AsyncStorage.getItem(`${KEY}${projectKey}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function refreshStats() {
    try {
      setStatsBusy(true);
      const rows = await loadTagesberichte();

      const total = rows.length;

      const withIssues = rows.filter((r: any) => {
        const issues = String(
          r?.issues || r?.vorkommnisse || r?.besondereVorkommnisse || ""
        ).trim();
        return !!issues;
      }).length;

      const withMachines = rows.filter((r: any) => {
        if (Array.isArray(r?.lines) && r.lines.length) {
          return r.lines.some((x: any) => String(x?.machine || x?.maschine || "").trim());
        }
        return String(r?.machines || r?.maschine || "").trim().length > 0;
      }).length;

      setStats({ total, withIssues, withMachines });
    } catch {
      setStats({ total: 0, withIssues: 0, withMachines: 0 });
    } finally {
      setStatsBusy(false);
    }
  }

  React.useEffect(() => {
    refreshStats();
  }, [projectKey]);

  const goNewTagesbericht = () => {
    navigation.navigate("TagesberichtEditor" as any, {
      projectId,
      projectCode,
      title: title || "Tagesbericht",
    });
  };

  const goTagesberichte = () => {
    navigation.navigate("TagesberichtList" as any, {
      projectId,
      projectCode,
      title: title || "Tagesberichte",
    });
  };

  const goBautagebuchPdf = async () => {
    try {
      setPdfBusy(true);

      const rows = await loadTagesberichte();

      if (!rows.length) {
        Alert.alert(
          "Bautagebuch PDF",
          "Für dieses Projekt sind noch keine Tagesberichte vorhanden."
        );
        return;
      }

      const result = await buildBautagebuchPdf({
        projectFsKey: projectKey,
        projectTitle: String(title || "Projekt"),
        monthLabel: "Gesamt",
        rows,
        filenameHint: `Bautagebuch_${projectKey}`,
      });

      await submitToEingangPruefung({
        type: "BAUTAGEBUCH",
        projectKey,
        projectId: String(projectId || projectKey),
        projectCode: String(projectCode || projectKey),
        title: `Bautagebuch ${projectKey}`,
        doc: {
          id: `bautagebuch_${projectKey}`,
          docType: "BAUTAGEBUCH",
          kind: "bautagebuch",
          projectId: String(projectId || projectKey),
          projectCode: String(projectCode || projectKey),
          date: new Date().toISOString().slice(0, 10),
          monthLabel: "Gesamt",
          totalReports: rows.length,
          rows,
        },
        pdfUri: (result as any)?.pdfUri || (result as any)?.uri || null,
        status: "EINGEREICHT",
        sourceScreen: "Bautagebuch",
      });

      await openBautagebuchPdf(result);
    } catch (e: any) {
      Alert.alert(
        "Bautagebuch PDF",
        e?.message || "PDF konnte nicht erstellt werden."
      );
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.wrap}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.topRow}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={16} color={COLORS.text} />
            <Text style={s.backTxt}>Zurück</Text>
          </Pressable>

          <View style={s.projectPill}>
            <Text style={s.projectPillTxt} numberOfLines={1}>
              {projectKey}
            </Text>
          </View>
        </View>

        <View style={s.heroCardCompact}>
          <View style={s.heroMainRow}>
            <View style={s.heroLeft}>
              <Text style={s.eyebrow}>RLC Bausoftware</Text>
              <Text style={s.h1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Bautagebuch</Text>
              <Text style={s.h2} numberOfLines={1}>
                {title || "Projekt"}
              </Text>
              <Text style={s.heroProject}>{projectKey}</Text>
            </View>

            <View style={s.heroBadge}>
              <Text style={s.heroBadgeTxt}>Tagesberichte</Text>
            </View>
          </View>

          <Text style={s.heroTextCompact}>
            Tagesberichte erfassen, öffnen und gesammelt als PDF exportieren.
          </Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{statsBusy ? "…" : stats.total}</Text>
            <Text style={s.statLabel}>Einträge</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statValue}>{statsBusy ? "…" : stats.withIssues}</Text>
            <Text style={s.statLabel}>Vorkommnisse</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statValue}>{statsBusy ? "…" : stats.withMachines}</Text>
            <Text style={s.statLabel}>Maschinen</Text>
          </View>
        </View>

        <View style={s.actionsGrid}>
          <Pressable style={[s.actionCard, s.actionPrimary]} onPress={goNewTagesbericht}>
            <View style={s.actionIconPrimary}>
              <Ionicons name="add" size={18} color={COLORS.card} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitlePrimary}>Neuer Tagesbericht</Text>
              <Text style={s.actionSubPrimary}>Neuen Bericht erfassen</Text>
            </View>
          </Pressable>

          <Pressable style={s.actionCard} onPress={goTagesberichte}>
            <View style={s.actionIconNeutral}>
              <Ionicons name="list" size={18} color={COLORS.text} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>Tagesberichte</Text>
              <Text style={s.actionSub}>Öffnen und verwalten</Text>
            </View>
          </Pressable>

          <Pressable
            style={[s.actionCard, pdfBusy ? s.cardDisabled : null]}
            onPress={goBautagebuchPdf}
            disabled={pdfBusy}
          >
            <View style={s.actionIconPdf}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.card} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>Bautagebuch PDF</Text>
              <Text style={s.actionSub}>Sammel-PDF erzeugen</Text>
            </View>
            {pdfBusy ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : null}
          </Pressable>

          <Pressable style={s.actionCard} onPress={refreshStats}>
            <View style={s.actionIconRefresh}>
              <Ionicons name="refresh" size={18} color={COLORS.card} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>Aktualisieren</Text>
              <Text style={s.actionSub}>Zahlen neu laden</Text>
            </View>
          </Pressable>
        </View>

        <View style={s.noteCard}>
          <Text style={s.noteTitle}>Hinweis</Text>
          <Text style={s.noteText}>
            Dieses Modul bleibt bewusst getrennt von Regieberichten. So bleiben
            Tagesdokumentation, Übersicht und Bautagebuch-PDF sauber strukturiert.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  wrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 12,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
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

  backBtn: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  backTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
  },

  projectPill: {
    maxWidth: "58%",
    minHeight: 42,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  projectPillTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  heroCardCompact: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  heroMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  heroLeft: {
    flex: 1,
    paddingRight: 8,
  },

  eyebrow: {
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 4,
  },

  h1: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -0.3,
  },

  h2: {
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 15,
    marginTop: 3,
  },

  heroProject: {
    marginTop: 8,
    color: COLORS.accent,
    fontWeight: "900",
    fontSize: 15,
  },

  heroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "flex-start",
  },

  heroBadgeTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  heroTextCompact: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 19,
    fontSize: 14,
  },

  statsRow: {
    flexDirection: "row",
    gap: 10,
  },

  statCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  statValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 24,
    textAlign: "center",
  },

  statLabel: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },

  actionsGrid: {
    gap: 10,
  },

  actionCard: {
    minHeight: 76,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.04,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },

  actionPrimary: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },

  actionIconPrimary: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  actionIconNeutral: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card2,
  },

  actionIconPdf: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  actionIconRefresh: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#334155",
  },

  actionTextWrap: {
    flex: 1,
  },

  actionTitlePrimary: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.card,
  },

  actionSubPrimary: {
    marginTop: 3,
    color: "rgba(255,255,255,0.86)",
    fontWeight: "700",
    fontSize: 13,
  },

  actionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },

  actionSub: {
    marginTop: 3,
    color: COLORS.sub,
    fontWeight: "700",
    fontSize: 13,
  },

  cardDisabled: {
    opacity: 0.72,
  },

  noteCard: {
    borderRadius: 18,
    padding: 15,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  noteTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
  },

  noteText: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 20,
    fontSize: 14,
  },
});










