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
import * as FileSystem from "expo-file-system"; // ✅ NEW (non elimina niente)
import {
  downloadPdf,
  importLocalPdf, // ✅ NEW (usa pdfStorage come source of truth)
  getLocalUri,
  isDownloaded,
  deletePdf,
  listDownloadedPdfs,
  PdfMetaItem,
} from "../lib/pdfStorage";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectPdfs">;

type Row = {
  name: string;
  url: string; // relative or absolute from server
  folder?: string;
  mtime?: string;
  absUrl?: string; // computed
  offline?: boolean; // local exists
  busy?: boolean; // downloading
};

export default function ProjectPdfsScreen({ route, navigation }: Props) {
  const { projectFsKey, title } = route.params;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  // NEW: UI state for offline fallback / last error
  const [offlineMode, setOfflineMode] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [title, navigation]);

  /**
   * ✅ Helpers
   */
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

  /**
   * ✅ Robust FS root
   * - prefer documentDirectory (persistente)
   * - fallback cacheDirectory
   * - NO trim()
   */
  function getFsRootOrThrow(): string {
    const doc = FileSystem.documentDirectory;
    const cache = FileSystem.cacheDirectory;

    const root = (doc && typeof doc === "string" ? doc : "") || (cache && typeof cache === "string" ? cache : "");
    if (!root) {
      throw new Error(
        "FileSystem directory fehlt (document/cache).\n\n" +
          "Tipico su Expo quando:\n" +
          "• App non ha inizializzato FS correttamente\n" +
          "• build/dev-client incoerente\n\n" +
          "Prova:\n" +
          "1) Chiudi Expo Go completamente\n" +
          "2) Riapri Expo Go\n" +
          "3) Avvia di nuovo `npx expo start --lan`\n"
      );
    }
    return root.endsWith("/") ? root : `${root}/`;
  }

  async function ensureDir(dirUri: string) {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (info.exists && info.isDirectory) return;
    if (info.exists && !info.isDirectory) {
      await FileSystem.deleteAsync(dirUri, { idempotent: true });
    }
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }

  // ✅ NEW: “vera” cartella progetto (documentDirectory/rlc/projects/<key>/pdf/)
  function projectPdfDirPreferred(projectFsKey0: string) {
    const k = safeProjectKey(projectFsKey0);
    return `${getFsRootOrThrow()}rlc/projects/${k}/pdf/`;
  }

  // ✅ compat: vecchia cartella (non la tolgo)
  function projectDir(projectFsKey0: string) {
    const k = safeProjectKey(projectFsKey0);
    return `${getFsRootOrThrow()}rlc_pdfs/${k}/`;
  }

  /**
   * ✅ ensure dirs (FIX “directory fehlt”)
   * - protegge con try/catch e mostra alert chiaro
   */
  const ensureAllPdfDirs = useCallback(async () => {
    if (Platform.OS === "web") return;

    try {
      const d1 = projectPdfDirPreferred(projectFsKey);
      const d2 = projectDir(projectFsKey);
      await ensureDir(d1);
      await ensureDir(d2);

      // (extra) compat sicurezza
      try {
        const root = getFsRootOrThrow();
        await ensureDir(`${root}projects/`);
        await ensureDir(`${root}projects/${safeProjectKey(projectFsKey)}/`);
        await ensureDir(`${root}projects/${safeProjectKey(projectFsKey)}/pdf/`);
      } catch {}
    } catch (e: any) {
      // Qui intercettiamo il vero motivo dell'errore che vedi nello screenshot
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

  // ✅ helper: robust copy from picker uris (file://, content://, ph://)
  async function copyPickedPdfToTarget(fromUri: string, toUri: string) {
    try {
      await FileSystem.copyAsync({ from: fromUri, to: toUri });
      return;
    } catch {}

    if (fromUri.startsWith("http://") || fromUri.startsWith("https://")) {
      const root = getFsRootOrThrow();
      try {
        await ensureDir(`${root}rlc/`);
      } catch {}
      const tmp = `${root}rlc/tmp_${Date.now()}.pdf`;
      const dl = await FileSystem.downloadAsync(fromUri, tmp);
      await FileSystem.copyAsync({ from: dl.uri, to: toUri });
      try {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
      } catch {}
      return;
    }

    throw new Error(
      "PDF konnte nicht kopiert werden (URI nicht lesbar). " +
        "Bitte wähle die Datei erneut oder teile sie zuerst in 'Dateien' (iOS Files) " +
        "und versuche dann nochmals."
    );
  }

  // ✅ load local PDFs (offline list)
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
        const off = await isDownloaded(projectFsKey, name);

        mapped.push({
          name,
          url,
          folder: it?.folder,
          mtime: it?.mtime,
          absUrl: abs,
          offline: off,
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
        Alert.alert("Download", "Offline-Modus: Bitte online gehen, um PDFs vom Server zu laden.");
        return;
      }

      const abs = r.absUrl || (await api.absUrl(r.url));
      setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, busy: true } : x)));

      try {
        await ensureAllPdfDirs();
        await downloadPdf(projectFsKey, r.name, abs);

        setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, busy: false, offline: true } : x)));
      } catch (e: any) {
        setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, busy: false } : x)));
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

        setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, offline: false } : x)));
      } catch (e: any) {
        Alert.alert("Offline löschen", e?.message || "Löschen fehlgeschlagen.");
      }
    },
    [projectFsKey, offlineMode]
  );

  /**
   * ✅ "PDF laden (offline)" – pick a PDF already on the phone
   */
  const onPickOfflinePdf = useCallback(async () => {
    try {
      // ✅ ensure dirs FIRST (fix “directory fehlt”)
      await ensureAllPdfDirs();

      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        multiple: false,
        copyToCacheDirectory: true, // ✅ important (iOS)
      });

      const asset: any = (res as any)?.assets?.[0] || null;
      const okLegacy = (res as any)?.type === "success";
      const uri = String(asset?.uri || (okLegacy ? (res as any)?.uri : "") || "").trim();
      const nameRaw = String(asset?.name || (okLegacy ? (res as any)?.name : "") || "").trim();

      if (!uri) return;

      const name = nameRaw || `Offline_${new Date().toISOString().slice(0, 10)}.pdf`;

      // ✅ BEST: pdfStorage come source-of-truth
      let imported: { uri: string; name: string } | null = null;
      try {
        imported = await importLocalPdf(projectFsKey, name, uri);
      } catch {
        // fallback: copia manuale nelle nostre due folder
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
      navigation.navigate("PdfViewer", { uri: imported.uri, title: imported.name });
    } catch (e: any) {
      Alert.alert("PDF laden", e?.message || "PDF konnte nicht geladen werden.");
    }
  }, [projectFsKey, navigation, loadOffline, ensureAllPdfDirs]);

  /** UI helpers */
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
      <View style={s.header}>
        <View style={s.headerRow}>
          <BackButton navigation={navigation} />
          <View style={{ flex: 1 }} />
          <View style={s.pill}>
            <Text style={s.pillTxt}>{offlineMode ? "OFFLINE" : "SERVER"}</Text>
          </View>
        </View>

        <Text style={s.h1}>{titleTop}</Text>
        <Text style={s.h2}>{projectFsKey}</Text>

        <View style={s.actionsRow}>
          <Pressable
            style={s.actionBtn}
            onPress={() => setRefreshTick((x) => x + 1)}
            disabled={loading}
          >
            <Text style={s.actionTxt}>{loading ? "Lade..." : "Aktualisieren"}</Text>
          </Pressable>

          <Pressable style={s.actionBtn} onPress={onPickOfflinePdf} disabled={loading}>
            <Text style={s.actionTxt}>PDF laden (offline)</Text>
          </Pressable>

          <Pressable style={s.actionBtnGhost} onPress={() => navigation.goBack()}>
            <Text style={s.actionTxtGhost}>Schließen</Text>
          </Pressable>
        </View>

        {offlineMode ? (
          <Text style={s.hint}>
            Hinweis: Server nicht erreichbar. Zeige lokal gespeicherte PDFs (Download zuvor nötig).
          </Text>
        ) : null}

        {!!lastError ? <Text style={s.hintSmall}>Letzter Fehler: {String(lastError)}</Text> : null}
      </View>
    );
  }, [navigation, projectFsKey, titleTop, offlineMode, lastError, loading, onPickOfflinePdf]);

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
          <ScrollView contentContainerStyle={s.list}>
            {rows.map((r) => (
              <View key={`${r.name}:${r.url || "offline"}`} style={s.card}>
                <Pressable onPress={() => onOpen(r)} style={{ flex: 1 }}>
                  <View style={s.cardTop}>
                    <View style={[s.dot, { backgroundColor: r.offline ? "#1A7F37" : "#0B57D0" }]} />
                    <Text style={s.title} numberOfLines={2}>
                      {r.name}
                    </Text>

                    <View style={[s.badge, r.offline ? s.badgeOk : s.badgeNeutral]}>
                      <Text style={[s.badgeTxt, r.offline ? s.badgeTxtOk : s.badgeTxtNeutral]}>
                        {rowIcon(r)}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.sub} numberOfLines={2}>
                    {(r.folder ? `${r.folder}` : "")}
                    {r.folder && r.mtime ? " • " : ""}
                    {r.mtime ? String(r.mtime) : ""}
                  </Text>
                </Pressable>

                <View style={s.actions}>
                  {r.offline ? (
                    <>
                      <Pressable style={[s.btn, s.btnGhost]} onPress={() => onOpen(r)}>
                        <Text style={[s.btnTxt, s.btnGhostTxt]}>Öffnen</Text>
                      </Pressable>

                      <Pressable style={[s.btn, s.btnDanger]} onPress={() => onDelete(r)}>
                        <Text style={[s.btnTxt, s.btnTxtWhite]}>Löschen</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable style={[s.btn, s.btnGhost]} onPress={() => onOpen(r)}>
                        <Text style={[s.btnTxt, s.btnGhostTxt]}>Öffnen</Text>
                      </Pressable>

                      <Pressable
                        style={[s.btn, s.btnPrimary, r.busy ? { opacity: 0.6 } : null]}
                        onPress={() => onDownload(r)}
                        disabled={r.busy}
                      >
                        <Text style={[s.btnTxt, s.btnTxtWhite]}>{r.busy ? "Download…" : "Download"}</Text>
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

            <View style={{ height: 22 }} />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  bg: { flex: 1, backgroundColor: "#0B1720" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },

  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backTxt: { color: "#fff", fontWeight: "900" },

  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillTxt: { color: "rgba(255,255,255,0.9)", fontWeight: "900", fontSize: 12 },

  h1: { fontSize: 34, fontWeight: "900", color: "#fff" },
  h2: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800" },

  actionsRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  actionBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  actionTxt: { color: "#fff", fontWeight: "900" },

  actionBtnGhost: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  actionTxtGhost: { color: "rgba(255,255,255,0.92)", fontWeight: "900" },

  hint: { marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: "700" },
  hintSmall: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: "700", fontSize: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerTxt: { marginTop: 10, fontWeight: "800", color: "rgba(255,255,255,0.70)" },

  list: { padding: 16, paddingBottom: 30, gap: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 3 },
      default: {},
    }),
  },

  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 99 },

  title: { flex: 1, fontSize: 16, fontWeight: "900", color: "#0B1720" },
  sub: { marginTop: 8, opacity: 0.75, fontWeight: "700", color: "#0B1720" },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  badgeNeutral: { borderColor: "rgba(11,23,32,0.18)" },
  badgeOk: { borderColor: "rgba(26,127,55,0.35)" },
  badgeTxt: { fontSize: 11, fontWeight: "900" },
  badgeTxtNeutral: { color: "rgba(11,23,32,0.65)" },
  badgeTxtOk: { color: "#1A7F37" },

  actions: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },

  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "#111" },
  btnTxt: { fontWeight: "900" },

  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(11,23,32,0.20)" },
  btnGhostTxt: { color: "#0B1720" },

  btnPrimary: { backgroundColor: "#111" },
  btnDanger: { backgroundColor: "#991B1B" },
  btnTxtWhite: { color: "#fff" },

  empty: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: { fontWeight: "900", fontSize: 15, color: "#0B1720" },
  emptyText: { marginTop: 6, fontWeight: "700", opacity: 0.7, color: "#0B1720" },
});
