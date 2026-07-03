// apps/mobile/src/screens/ProjectPdfsScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  SafeAreaView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  downloadPdf,
  importLocalPdf,
  getLocalUri,
  deletePdf,
  listDownloadedPdfs,
  PdfMetaItem,
} from "../lib/pdfStorage";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectPdfs">;

type Row = {
  name: string;
  url: string;
  folder?: string;
  mtime?: string;
  absUrl?: string;
  offline?: boolean;
  busy?: boolean;
};

export default function ProjectPdfsScreen({ route, navigation }: Props) {
  const { projectFsKey, title } = route.params;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [title, navigation]);

  function safeProjectKey(k: string) {
    return String(k || "")
      .trim()
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 80);
  }

  function safeFilename(name: string) {
    const n = String(name || "file.pdf").trim();
    const base = n.replace(/[^\w.\-]+/g, "_").slice(0, 160);
    return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  }

  function ensureTrailingSlash(v: string) {
    return v.endsWith("/") ? v : `${v}/`;
  }

  function getFsRootOrThrow(): string {
    const doc =
      typeof FileSystem.documentDirectory === "string"
        ? FileSystem.documentDirectory
        : "";
    const cache =
      typeof FileSystem.cacheDirectory === "string"
        ? FileSystem.cacheDirectory
        : "";

    const root = doc || cache;
    if (!root) {
      throw new Error(
        "FileSystem directory fehlt (document/cache).\n\n" +
          "Bitte Expo Go komplett schließen und neu öffnen. " +
          "Danach `npx expo start --lan` neu starten."
      );
    }

    return ensureTrailingSlash(root);
  }

  async function ensureDir(dirUri: string) {
    try {
      const info = await FileSystem.getInfoAsync(dirUri);
      if (info.exists && (info as any).isDirectory !== false) return;

      if (info.exists && (info as any).isDirectory === false) {
        await FileSystem.deleteAsync(dirUri, { idempotent: true });
      }

      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    } catch {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }
  }

  function projectPdfDirPreferred(projectFsKey0: string) {
    const k = safeProjectKey(projectFsKey0);
    return `${getFsRootOrThrow()}rlc/projects/${k}/pdf/`;
  }

  function projectDir(projectFsKey0: string) {
    const k = safeProjectKey(projectFsKey0);
    return `${getFsRootOrThrow()}rlc_pdfs/${k}/`;
  }

  const ensureAllPdfDirs = useCallback(async () => {
    if (Platform.OS === "web") return;

    try {
      const root = getFsRootOrThrow();
      const d1 = projectPdfDirPreferred(projectFsKey);
      const d2 = projectDir(projectFsKey);

      await ensureDir(root);
      await ensureDir(`${root}rlc/`);
      await ensureDir(`${root}rlc/projects/`);
      await ensureDir(`${root}rlc/projects/${safeProjectKey(projectFsKey)}/`);
      await ensureDir(d1);

      await ensureDir(`${root}rlc_pdfs/`);
      await ensureDir(d2);
    } catch (e: any) {
      Alert.alert("PDF laden", String(e?.message || "FileSystem Fehler"));
      throw e;
    }
  }, [projectFsKey]);

  async function uniqueTargetUri(dir: string, desiredName: string) {
    const base = safeFilename(desiredName);
    const baseStem = base.replace(/\.pdf$/i, "");
    let name = base;
    let to = `${dir}${name}`;

    for (let i = 0; i < 50; i++) {
      const info = await FileSystem.getInfoAsync(to);
      if (!info.exists) return { name, uri: to };
      name = `${baseStem}_${i + 2}.pdf`;
      to = `${dir}${name}`;
    }

    return { name, uri: `${dir}${baseStem}_${Date.now()}.pdf` };
  }

  async function copyPickedPdfToTarget(fromUri: string, toUri: string) {
    try {
      await FileSystem.copyAsync({ from: fromUri, to: toUri });
      return;
    } catch {}

    if (fromUri.startsWith("http://") || fromUri.startsWith("https://")) {
      const root = getFsRootOrThrow();
      const tmp = `${root}rlc/tmp_${Date.now()}.pdf`;
      try {
        await ensureDir(`${root}rlc/`);
      } catch {}

      const dl = await FileSystem.downloadAsync(fromUri, tmp);
      await FileSystem.copyAsync({ from: dl.uri, to: toUri });

      try {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
      } catch {}
      return;
    }

    throw new Error(
      "PDF konnte nicht kopiert werden. Bitte Datei erneut wählen."
    );
  }

  const loadOffline = useCallback(async () => {
    try {
      await ensureAllPdfDirs();

      const locals: PdfMetaItem[] = await listDownloadedPdfs(projectFsKey);

      const mapped: Row[] = locals
        .map((x) => ({
          name: String(x?.name || "").trim(),
          url: "",
          folder: "offline",
          mtime: x?.mtime,
          absUrl: x?.uri,
          offline: true,
          busy: false,
        }))
        .filter((x) => !!x.name);

      setRows(mapped);
      setOfflineMode(true);
      setLastError(null);
    } catch (e: any) {
      setRows([]);
      setOfflineMode(true);
      setLastError(e?.message || "Offline-Liste fehlgeschlagen.");
    }
  }, [projectFsKey, ensureAllPdfDirs]);

  const load = useCallback(async () => {
    setLoading(true);
    setOfflineMode(false);
    setLastError(null);

    try {
      await ensureAllPdfDirs();

      const items = await api.projectPdfs(projectFsKey);

      const mapped: Row[] = [];
      for (const it of items) {
        const name = String(it?.name || "").trim();
        const url = String(it?.url || "").trim();
        if (!name || !url) continue;

        const abs = await api.absUrl(url);
        const local = await getLocalUri(projectFsKey, name);

        mapped.push({
          name,
          url,
          folder: it?.folder,
          mtime: it?.mtime,
          absUrl: local || abs,
          offline: !!local,
          busy: false,
        });
      }

      setRows(mapped);
    } catch (e: any) {
      setLastError(e?.message || "PDF-Liste fehlgeschlagen.");
      await loadOffline();
    } finally {
      setLoading(false);
    }
  }, [projectFsKey, loadOffline, ensureAllPdfDirs]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const onOpen = useCallback(
    async (r: Row) => {
      try {
        const local = await getLocalUri(projectFsKey, r.name);
        if (local) {
          navigation.navigate("PdfViewer", { uri: local, title: r.name });
          return;
        }

        if (r.offline && r.absUrl && String(r.absUrl).startsWith("file:")) {
          navigation.navigate("PdfViewer", { uri: r.absUrl, title: r.name });
          return;
        }

        const abs = r.absUrl || (await api.absUrl(r.url));
        navigation.navigate("PdfViewer", { uri: abs, title: r.name });
      } catch (e: any) {
        Alert.alert("PDF", e?.message || "Öffnen fehlgeschlagen.");
      }
    },
    [navigation, projectFsKey]
  );

  const onDownload = useCallback(
    async (r: Row) => {
      if (!r?.url && offlineMode) {
        Alert.alert(
          "Download",
          "Offline-Modus: Bitte online gehen, um PDFs vom Server zu laden."
        );
        return;
      }

      const abs = r.absUrl || (await api.absUrl(r.url));
      setRows((prev) =>
        prev.map((x) => (x.name === r.name ? { ...x, busy: true } : x))
      );

      try {
        await ensureAllPdfDirs();
        await downloadPdf(projectFsKey, r.name, abs);

        const local = await getLocalUri(projectFsKey, r.name);

        setRows((prev) =>
          prev.map((x) =>
            x.name === r.name
              ? { ...x, busy: false, offline: true, absUrl: local || x.absUrl }
              : x
          )
        );
      } catch (e: any) {
        setRows((prev) =>
          prev.map((x) => (x.name === r.name ? { ...x, busy: false } : x))
        );
        Alert.alert("Download", e?.message || "Download fehlgeschlagen.");
      }
    },
    [projectFsKey, offlineMode, ensureAllPdfDirs]
  );

  const onDelete = useCallback(
    async (r: Row) => {
      try {
        await deletePdf(projectFsKey, r.name);

        if (offlineMode) {
          setRows((prev) => prev.filter((x) => x.name !== r.name));
          return;
        }

        const remoteAbs = r.url ? await api.absUrl(r.url) : "";

        setRows((prev) =>
          prev.map((x) =>
            x.name === r.name
              ? { ...x, offline: false, absUrl: remoteAbs || x.absUrl }
              : x
          )
        );
      } catch (e: any) {
        Alert.alert("Offline löschen", e?.message || "Löschen fehlgeschlagen.");
      }
    },
    [projectFsKey, offlineMode]
  );

  const onPickOfflinePdf = useCallback(async () => {
    try {
      await ensureAllPdfDirs();

      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });

      const asset: any = (res as any)?.assets?.[0] || null;
      const okLegacy = (res as any)?.type === "success";
      const uri = String(
        asset?.uri || (okLegacy ? (res as any)?.uri : "") || ""
      ).trim();
      const nameRaw = String(
        asset?.name || (okLegacy ? (res as any)?.name : "") || ""
      ).trim();

      if (!uri) return;

      const name =
        nameRaw || `Offline_${new Date().toISOString().slice(0, 10)}.pdf`;

      let imported: { uri: string; name: string } | null = null;

      try {
        const importedRes = await importLocalPdf(projectFsKey, uri, name);
        imported = importedRes;
      } catch {
        const dirPreferred = projectPdfDirPreferred(projectFsKey);
        const targetPreferred = await uniqueTargetUri(dirPreferred, name);
        await copyPickedPdfToTarget(uri, targetPreferred.uri);

        try {
          const dirCompat = projectDir(projectFsKey);
          const targetCompat = await uniqueTargetUri(dirCompat, name);
          await copyPickedPdfToTarget(uri, targetCompat.uri);
        } catch {}

        imported = { uri: targetPreferred.uri, name: targetPreferred.name };
      }

      await loadOffline();
      navigation.navigate("PdfViewer", {
        uri: imported.uri,
        title: imported.name,
      });
    } catch (e: any) {
      Alert.alert("PDF laden", e?.message || "PDF konnte nicht geladen werden.");
    }
  }, [projectFsKey, navigation, loadOffline, ensureAllPdfDirs]);

  const titleTop = useMemo(() => String(title || "Projekt PDFs"), [title]);

  function BackButton({ navigation: nav }: any) {
    return (
      <Pressable onPress={() => nav.goBack()} style={s.backBtn}>
        <Text style={s.backTxt}>Zurück</Text>
      </Pressable>
    );
  }

  const header = useMemo(() => {
    return (
      <View style={s.headerCard}>
        <View style={s.headerRow}>
          <BackButton navigation={navigation} />
          <View style={s.headerSpacer} />
          <View style={s.modePill}>
            <Text style={s.modePillTxt}>{offlineMode ? "OFFLINE" : "SERVER"}</Text>
          </View>
        </View>

        <Text style={s.eyebrow}>RLC Bausoftware</Text>
        <Text style={s.h1}>{titleTop}</Text>
        <Text style={s.h2}>{projectFsKey}</Text>

        <View style={s.actionsRow}>
          <Pressable
            style={s.actionBtnPrimary}
            onPress={() => setRefreshTick((x) => x + 1)}
            disabled={loading}
          >
            <Text style={s.actionBtnPrimaryTxt}>
              {loading ? "Lade..." : "Aktualisieren"}
            </Text>
          </Pressable>

          <Pressable
            style={s.actionBtnSecondary}
            onPress={onPickOfflinePdf}
            disabled={loading}
          >
            <Text style={s.actionBtnSecondaryTxt}>PDF laden (offline)</Text>
          </Pressable>

          <Pressable
            style={s.actionBtnGhost}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.actionBtnGhostTxt}>Schließen</Text>
          </Pressable>
        </View>

        {offlineMode ? (
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Offline-Modus</Text>
            <Text style={s.infoText}>
              Server nicht erreichbar. Zeige lokal gespeicherte PDFs.
            </Text>
          </View>
        ) : null}

        {!!lastError ? (
          <Text style={s.hintSmall}>Letzter Fehler: {String(lastError)}</Text>
        ) : null}
      </View>
    );
  }, [
    navigation,
    projectFsKey,
    titleTop,
    offlineMode,
    lastError,
    loading,
    onPickOfflinePdf,
  ]);

  const rowIcon = (r: Row) => {
    if (r.offline) return "Offline";
    if (r.busy) return "…";
    return "PDF";
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.bg}>
        {header}

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator />
            <Text style={s.centerTxt}>Lade PDFs…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {rows.map((r) => (
              <View key={`${r.name}:${r.url || "offline"}`} style={s.card}>
                <Pressable onPress={() => onOpen(r)} style={s.cardMain}>
                  <View style={s.cardTop}>
                    <View
                      style={[
                        s.dot,
                        {
                          backgroundColor: r.offline
                            ? COLORS.accent
                            : COLORS.accentDark,
                        },
                      ]}
                    />
                    <Text style={s.title} numberOfLines={2}>
                      {r.name}
                    </Text>

                    <View style={[s.badge, r.offline ? s.badgeOk : s.badgeNeutral]}>
                      <Text
                        style={[
                          s.badgeTxt,
                          r.offline ? s.badgeTxtOk : s.badgeTxtNeutral,
                        ]}
                      >
                        {rowIcon(r)}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.sub} numberOfLines={2}>
                    {r.folder ? `${r.folder}` : ""}
                    {r.folder && r.mtime ? " • " : ""}
                    {r.mtime ? String(r.mtime) : ""}
                  </Text>
                </Pressable>

                <View style={s.actions}>
                  {r.offline ? (
                    <>
                      <Pressable
                        style={[s.btn, s.btnGhost]}
                        onPress={() => onOpen(r)}
                      >
                        <Text style={[s.btnTxt, s.btnGhostTxt]}>Öffnen</Text>
                      </Pressable>

                      <Pressable
                        style={[s.btn, s.btnDanger]}
                        onPress={() => onDelete(r)}
                      >
                        <Text style={[s.btnTxt, s.btnTxtWhite]}>Löschen</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={[s.btn, s.btnGhost]}
                        onPress={() => onOpen(r)}
                      >
                        <Text style={[s.btnTxt, s.btnGhostTxt]}>Öffnen</Text>
                      </Pressable>

                      <Pressable
                        style={[
                          s.btn,
                          s.btnPrimary,
                          r.busy ? s.btnDisabled : null,
                        ]}
                        onPress={() => onDownload(r)}
                        disabled={r.busy}
                      >
                        <Text style={[s.btnTxt, s.btnTxtWhite]}>
                          {r.busy ? "Download…" : "Download"}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))}

            {!rows.length ? (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>Keine PDFs</Text>
                <Text style={s.emptyText}>
                  {offlineMode
                    ? "Du bist offline und hast noch keine PDFs lokal gespeichert. Gehe online und lade PDFs herunter."
                    : "Server liefert aktuell keine PDFs für dieses Projekt."}
                </Text>
              </View>
            ) : null}

            <View style={s.bottomSpace} />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  bg: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  headerCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    padding: 16,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  headerSpacer: {
    flex: 1,
  },

  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  backTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  modePillTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  eyebrow: {
    color: COLORS.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  h1: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text,
  },

  h2: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "800",
    lineHeight: 18,
  },

  actionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  actionBtnPrimary: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  actionBtnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  actionBtnSecondary: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  actionBtnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  actionBtnGhost: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  actionBtnGhostTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  infoBox: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  infoTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  infoText: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 19,
  },

  hintSmall: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 18,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  centerTxt: {
    marginTop: 10,
    fontWeight: "800",
    color: COLORS.sub,
  },

  list: {
    padding: 16,
    paddingBottom: 30,
    gap: 12,
  },

  card: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  cardMain: {
    flex: 1,
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },

  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    lineHeight: 20,
  },

  sub: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 18,
  },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.card2,
    alignSelf: "flex-start",
  },

  badgeNeutral: {
    borderColor: COLORS.border,
  },

  badgeOk: {
    borderColor: COLORS.accent,
  },

  badgeTxt: {
    fontSize: 11,
    fontWeight: "900",
  },

  badgeTxtNeutral: {
    color: COLORS.text,
  },

  badgeTxtOk: {
    color: COLORS.accentDark,
  },

  actions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  btnTxt: {
    fontWeight: "900",
    fontSize: 13,
  },

  btnGhost: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  btnGhostTxt: {
    color: COLORS.text,
  },

  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  btnDanger: {
    backgroundColor: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.text,
  },

  btnTxtWhite: {
    color: COLORS.textLight,
  },

  btnDisabled: {
    opacity: 0.6,
  },

  empty: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  emptyTitle: {
    fontWeight: "900",
    fontSize: 15,
    color: COLORS.text,
  },

  emptyText: {
    marginTop: 6,
    fontWeight: "700",
    color: COLORS.sub,
    lineHeight: 20,
  },

  bottomSpace: {
    height: 22,
  },
});



