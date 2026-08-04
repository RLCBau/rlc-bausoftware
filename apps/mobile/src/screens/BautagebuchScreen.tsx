// apps/mobile/src/screens/BautagebuchScreen.tsx
import React, { useLayoutEffect, useState } from "react";
import { View, Text, Pressable, SafeAreaView, ScrollView, Alert, Platform, ActivityIndicator, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
import { buildBautagebuchPdf, type BautagebuchRow } from "../lib/exporters/bautagebuchPdfBuilder";
import { submitToEingangPruefung } from "../lib/submitToEingangPruefung";
type Props = NativeStackScreenProps<RootStackParamList, "Bautagebuch">;
const KEY = "rlc_tagesbericht_list:";
export default function BautagebuchScreen({
  route,
  navigation
}: Props) {
  const {
    projectId,
    projectCode,
    title
  } = route.params;
  const projectKey = String(projectCode || projectId || "").trim();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [statsBusy, setStatsBusy] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    withIssues: 0,
    withMachines: 0
  });
  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Bautagebuch",
      headerStyle: {
        backgroundColor: COLORS.bg
      },
      headerTitleStyle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "600"
      },
      headerTintColor: COLORS.text,
      headerRight: () => <Pressable onPress={() => {
        navigation.navigate("SupportChat" as any, {
          projectId: String(projectId || ""),
          projectCode: String(projectCode || "").trim() || undefined,
          title: "RLC KI",
          screen: "Bautagebuch",
          initialMessage: ""
        });
      }} style={[s.headerKiBtn, {
        display: "none"
      }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.accentDark} />
          <Text style={s.headerKiTxt}>RLC KI</Text>
        </Pressable>
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
        const issues = String(r?.issues || r?.vorkommnisse || r?.besondereVorkommnisse || "").trim();
        return !!issues;
      }).length;
      const withMachines = rows.filter((r: any) => {
        if (Array.isArray(r?.lines) && r.lines.length) {
          return r.lines.some((x: any) => String(x?.machine || x?.maschine || "").trim());
        }
        return String(r?.machines || r?.maschine || "").trim().length > 0;
      }).length;
      setStats({
        total,
        withIssues,
        withMachines
      });
    } catch {
      setStats({
        total: 0,
        withIssues: 0,
        withMachines: 0
      });
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
      title: title || "Tagesbericht"
    });
  };
  const goTagesberichte = () => {
    navigation.navigate("TagesberichtList" as any, {
      projectId,
      projectCode,
      title: title || "Tagesberichte"
    });
  };
  const goBautagebuchPdf = async () => {
    try {
      setPdfBusy(true);
      const rows = await loadTagesberichte();
      if (!rows.length) {
        Alert.alert("PDF", "Für dieses Projekt sind noch keine Tagesberichte vorhanden.");
        return;
      }
      const result = await buildBautagebuchPdf({
        projectFsKey: projectKey,
        projectTitle: String(title || "Projekt"),
        monthLabel: "Gesamt",
        rows,
        filenameHint: `Bautagebuch_${projectKey}`
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
          rows
        },
        pdfUri: (result as any)?.pdfUri || (result as any)?.uri || null,
        status: "EINGEREICHT",
        sourceScreen: "Bautagebuch"
      });
      const pdfUri = String((result as any)?.pdfUri || (result as any)?.uri || "").trim();
      if (!pdfUri) throw new Error("PDF wurde erstellt, aber kein Dateipfad zurückgegeben.");
      navigation.navigate("PdfViewer", {
        uri: pdfUri,
        title: `Bautagebuch ${projectKey}`,
        projectId: String(projectId || projectKey),
        projectCode: String(projectCode || projectKey),
        documentType: "BAUTAGEBUCH"
      });
    } catch (e: any) {
      Alert.alert("PDF", e?.message || "PDF konnte nicht erstellt werden.");
    } finally {
      setPdfBusy(false);
    }
  };
  const saveBautagebuch = async () => {
    try {
      setSaveBusy(true);
      const rows = await loadTagesberichte();
      await submitToEingangPruefung({
        type: "BAUTAGEBUCH",
        projectKey,
        projectId,
        projectCode: projectKey,
        title: `Bautagebuch ${projectKey}`,
        doc: {
          id: `bautagebuch_${projectKey}`,
          projectId,
          projectCode: projectKey,
          title: `Bautagebuch ${projectKey}`,
          rows,
          savedAt: new Date().toISOString()
        },
        pdfUri: null,
        status: "EINGEREICHT",
        sourceScreen: "Bautagebuch"
      });
      Alert.alert("Bautagebuch", "Gespeichert und an Eingang / Prüfung übergeben.");
    } catch (e: any) {
      Alert.alert("Bautagebuch", e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaveBusy(false);
    }
  };
  const exportBautagebuchCsv = async () => {
    try {
      setCsvBusy(true);
      const rows = await loadTagesberichte();
      if (!rows.length) {
        Alert.alert("Bautagebuch CSV", "Für dieses Projekt sind noch keine Tagesberichte vorhanden.");
        return;
      }
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["Datum", "Wetter", "Arbeiten", "Personal", "Maschinen", "Probleme"].map(esc).join(";");
      const body = rows.map((r: any) => [r.date || r.datum || "", r.weather || r.wetter || "", r.workDone || r.arbeiten || "", r.workers || r.personal || "", r.machines || r.maschinen || "", r.issues || r.probleme || ""].map(esc).join(";"));
      const csv = [header, ...body].join("\n");
      const uri = `${FileSystem.cacheDirectory}Bautagebuch_${projectKey}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("CSV erstellt", uri);
      }
    } catch (e: any) {
      Alert.alert("Bautagebuch CSV", e?.message || "CSV konnte nicht erstellt werden.");
    } finally {
      setCsvBusy(false);
    }
  };
  return <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
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
            Tagesberichte erfassen, öffnen und gesammelt als PDF.
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

          <Pressable style={[s.actionCard, pdfBusy ? s.cardDisabled : null]} onPress={goBautagebuchPdf} disabled={pdfBusy}>
            <View style={s.actionIconPdf}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.card} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>PDF</Text>
              <Text style={s.actionSub}>PDF erzeugen</Text>
            </View>
            {pdfBusy ? <ActivityIndicator size="small" color={COLORS.text} /> : null}
          </Pressable>

          <Pressable style={[s.actionCard, saveBusy ? s.cardDisabled : null]} onPress={saveBautagebuch} disabled={saveBusy}>
            <View style={s.actionIconSave}>
              <Ionicons name="save-outline" size={18} color={COLORS.card} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>Speichern</Text>
              <Text style={s.actionSub}>An Eingang / Prüfung übergeben</Text>
            </View>
            {saveBusy ? <ActivityIndicator size="small" color={COLORS.text} /> : null}
          </Pressable>

          <Pressable style={[s.actionCard, csvBusy ? s.cardDisabled : null]} onPress={exportBautagebuchCsv} disabled={csvBusy}>
            <View style={s.actionIconCsv}>
              <Ionicons name="document-outline" size={18} color={COLORS.card} />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>CSV Export</Text>
              <Text style={s.actionSub}>Tagesberichte als CSV</Text>
            </View>
            {csvBusy ? <ActivityIndicator size="small" color={COLORS.text} /> : null}
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
    </SafeAreaView>;
}
const s = createRlcStyles("BautagebuchScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 12
  },
  headerKiBtn: {
    display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  headerKiTxt: {
    color: COLORS.accentDark,
    fontWeight: "600",
    fontSize: 13
  },
  heroCardCompact: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: COLORS.accentFaint,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 5
        }
      },
      android: {
        elevation: 2
      },
      default: {}
    })
  },
  heroMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  heroLeft: {
    flex: 1,
    paddingRight: 8
  },
  eyebrow: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 4
  },
  h1: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: -0.3
  },
  h2: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 15,
    marginTop: 3
  },
  heroProject: {
    marginTop: 8,
    color: COLORS.accent,
    fontWeight: "600",
    fontSize: 15
  },
  heroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    alignSelf: "flex-start"
  },
  heroBadgeTxt: {
    color: COLORS.accentDark,
    fontWeight: "600",
    fontSize: 12
  },
  heroTextCompact: {
    marginTop: 10,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 19,
    fontSize: 14
  },
  statsRow: {
    flexDirection: "row",
    gap: 10
  },
  statCard: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 3,
    borderTopColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  statValue: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 18,
    textAlign: "center"
  },
  statLabel: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16
  },
  actionsGrid: {
    gap: 10
  },
  actionCard: {
    minHeight: 44,
    borderRadius: 14,
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
        shadowOffset: {
          width: 0,
          height: 4
        }
      },
      android: {
        elevation: 1
      },
      default: {}
    })
  },
  actionPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  actionIconPrimary: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  actionIconNeutral: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card2
  },
  actionIconPdf: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.success
  },
  actionIconSave: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentDark
  },
  actionIconCsv: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warning
  },
  actionIconRefresh: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.sub
  },
  actionTextWrap: {
    flex: 1
  },
  actionTitlePrimary: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.card
  },
  actionSubPrimary: {
    marginTop: 3,
    color: "rgba(255,255,255,0.86)",
    fontWeight: "600",
    fontSize: 13
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text
  },
  actionSub: {
    marginTop: 3,
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 13
  },
  cardDisabled: {
    opacity: 0.72
  },
  noteCard: {
    borderRadius: 14,
    padding: 15,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  noteTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 15
  },
  noteText: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20,
    fontSize: 14
  }
});
