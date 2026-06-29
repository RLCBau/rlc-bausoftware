// apps/mobile/src/screens/PdfViewerScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { COLORS } from "../ui/theme";
import RlcKiFloatingButton from "../components/RlcKiFloatingButton";

type Props = NativeStackScreenProps<RootStackParamList, "PdfViewer">;

function isHttpUrl(u: string) {
  return /^https?:\/\//i.test(String(u || "").trim());
}
function isFileUrl(u: string) {
  return /^file:\/\//i.test(String(u || "").trim());
}
function isContentUrl(u: string) {
  return /^content:\/\//i.test(String(u || "").trim());
}

function dirOfFileUri(fileUri: string) {
  const u = String(fileUri || "").trim();
  if (!isFileUrl(u)) return u;
  const idx = u.lastIndexOf("/");
  if (idx <= "file://".length) return u;
  return u.slice(0, idx + 1);
}

function sanitizeFileName(input: string) {
  const base = String(input || "PDF")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "PDF";
}

function ensurePdfExtension(name: string) {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

async function ensureDirExists(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {}
  }
}

async function ensureFileUriFromMaybeContent(inputUri: string): Promise<string> {
  const u = String(inputUri || "").trim();
  if (!u) return "";

  if (Platform.OS === "web") return u;

  if (isFileUrl(u) || isHttpUrl(u)) return u;

  if (isContentUrl(u)) {
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) return u;

    const tmpDir = `${base}tmp_pdf/`;
    await ensureDirExists(tmpDir);

    const target = `${tmpDir}${Date.now()}_${Math.floor(Math.random() * 1e9)}.pdf`;

    try {
      await FileSystem.copyAsync({ from: u, to: target });
      return target;
    } catch (e: any) {
      console.log("[PDFVIEW] content->file copy failed:", String(e?.message || e));
      return u;
    }
  }

  return u;
}

async function materializePdfToLocalFile(params: {
  sourceUri: string;
  title?: string;
}): Promise<string> {
  const { sourceUri, title } = params;
  const src = String(sourceUri || "").trim();
  if (!src) throw new Error("PDF URI fehlt");

  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) {
    throw new Error("PDF Speicherpfad nicht verfügbar.");
  }

  const dir = `${base}saved_pdfs/`;
  await ensureDirExists(dir);

  const fileName = ensurePdfExtension(sanitizeFileName(title || "PDF"));
  let target = `${dir}${fileName}`;

  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      target = `${dir}${sanitizeFileName(title || "PDF")}_${Date.now()}.pdf`;
    }
  } catch {}

  if (isHttpUrl(src)) {
    const dl = await FileSystem.downloadAsync(src, target);
    return dl.uri;
  }

  if (isFileUrl(src)) {
    if (src === target) return src;
    await FileSystem.copyAsync({ from: src, to: target });
    return target;
  }

  if (isContentUrl(src)) {
    await FileSystem.copyAsync({ from: src, to: target });
    return target;
  }

  throw new Error("PDF konnte nicht lokal vorbereitet werden.");
}

export default function PdfViewerScreen({ route, navigation }: Props) {
  const { uri, title } = route.params;
  const anyParams: any = route.params || {};
  const projectId = String(anyParams.projectId || anyParams.projectCode || "");
  const projectCode = String(anyParams.projectCode || anyParams.projectId || "");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [normalizedUri, setNormalizedUri] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: title || "PDF" });
  }, [title, navigation]);

  const sourceUriRaw = useMemo(() => {
    return String(uri || "").trim();
  }, [uri]);

  const normalize = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const u = await ensureFileUriFromMaybeContent(sourceUriRaw);
      setNormalizedUri(u);

      if (!u) {
        setErrorMsg("PDF URI fehlt");
        setLoading(false);
        return;
      }

      const ok = isHttpUrl(u) || isFileUrl(u);
      if (!ok) {
        setErrorMsg("Ungültige PDF-URL (nur https:// oder file:// erlaubt)");
      } else {
        setErrorMsg(null);
      }
    } catch (e: any) {
      setErrorMsg(String(e?.message || e || "PDF konnte nicht vorbereitet werden."));
    } finally {
      setLoading(false);
    }
  }, [sourceUriRaw]);

  useEffect(() => {
    normalize();
  }, [normalize, retryKey]);

  const sourceUri = useMemo(() => {
    return String(normalizedUri || sourceUriRaw || "").trim();
  }, [normalizedUri, sourceUriRaw]);

  const canRender = useMemo(() => {
    return isHttpUrl(sourceUri) || isFileUrl(sourceUri);
  }, [sourceUri]);

  useEffect(() => {
    if (!sourceUriRaw) setErrorMsg("PDF URI fehlt");
  }, [sourceUriRaw]);

  const handleSave = useCallback(async () => {
    try {
      if (!sourceUri) {
        Alert.alert("PDF", "Keine PDF-Datei gefunden.");
        return;
      }

      if (Platform.OS === "web") {
        Alert.alert("PDF", "Speichern ist hier nicht verfügbar.");
        return;
      }

      setSaving(true);

      const localUri = await materializePdfToLocalFile({
        sourceUri,
        title: title || "PDF",
      });

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("PDF gespeichert", localUri);
        return;
      }

      await Sharing.shareAsync(localUri, {
        mimeType: "application/pdf",
        dialogTitle: "PDF speichern",
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("PDF", String(e?.message || e || "Speichern fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  }, [sourceUri, title]);

  const handleShare = useCallback(async () => {
    try {
      if (!sourceUri) {
        Alert.alert("PDF", "Keine PDF-Datei gefunden.");
        return;
      }

      if (Platform.OS === "web") {
        Alert.alert("PDF", "Teilen ist hier nicht verfügbar.");
        return;
      }

      setSharing(true);

      const localUri = await materializePdfToLocalFile({
        sourceUri,
        title: title || "PDF",
      });

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("PDF", "Teilen ist auf diesem Gerät nicht verfügbar.");
        return;
      }

      await Sharing.shareAsync(localUri, {
        mimeType: "application/pdf",
        dialogTitle: title || "PDF teilen",
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("PDF", String(e?.message || e || "Teilen fehlgeschlagen."));
    } finally {
      setSharing(false);
    }
  }, [sourceUri, title]);

  if (errorMsg) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.errorWrap}>
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>PDF konnte nicht geöffnet werden</Text>
            <Text style={s.errorText}>{errorMsg}</Text>

            <View style={s.errorActions}>
              <Pressable style={s.btnSecondary} onPress={() => navigation.goBack()}>
                <Text style={s.btnSecondaryTxt}>Zurück</Text>
              </Pressable>

              <Pressable
                style={s.btnPrimary}
                onPress={() => {
                  setLoading(true);
                  setErrorMsg(null);
                  setRetryKey((k) => k + 1);
                }}
              >
                <Text style={s.btnPrimaryTxt}>Neu versuchen</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <RlcKiFloatingButton
          projectId={projectId}
          projectCode={projectCode}
          title={title || "PDF"}
          screen="PdfViewer"
          initialMessage="Ich bin im PDF-Viewer. Hilf mir konkret mit diesem PDF, Speichern, Teilen oder Rücksprung zum Projekt."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.viewerWrap}>
        <View style={s.topBar}>
          <Pressable style={s.btnSecondaryCompact} onPress={() => navigation.goBack()}>
            <Text style={s.btnSecondaryCompactTxt}>Zurück</Text>
          </Pressable>

          <View style={s.topBarSpacer} />

          <Pressable
            style={[s.btnSecondaryCompact, (saving || sharing) && s.btnDisabled]}
            onPress={handleSave}
            disabled={saving || sharing}
          >
            <Text style={s.btnSecondaryCompactTxt}>
              {saving ? "Speichert…" : "Speichern"}
            </Text>
          </Pressable>

          <Pressable
            style={[s.btnPrimaryCompact, (sharing || saving) && s.btnDisabled]}
            onPress={handleShare}
            disabled={sharing || saving}
          >
            <Text style={s.btnPrimaryCompactTxt}>
              {sharing ? "Bereitet vor…" : "Teilen"}
            </Text>
          </Pressable>
        </View>

        <View style={s.hintBar}>
          <Text style={s.hintTxt}>
            {isFileUrl(sourceUri) ? "Offline-Datei (lokal)" : "Online-Datei"}
          </Text>
        </View>

        <View style={s.webWrap}>
          {loading ? (
            <View style={s.loading}>
              <ActivityIndicator />
              <Text style={s.loadingTxt}>PDF wird geladen…</Text>
            </View>
          ) : null}

          {canRender ? (
            <WebView
              key={String(retryKey)}
              source={{ uri: sourceUri }}
              style={s.web}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              allowingReadAccessToURL={
                Platform.OS === "ios" && isFileUrl(sourceUri)
                  ? dirOfFileUri(sourceUri)
                  : undefined
              }
              allowFileAccess={true}
              allowUniversalAccessFromFileURLs={true}
              originWhitelist={["*"]}
              onError={(e) => {
                setLoading(false);
                const msg = e?.nativeEvent?.description || "WebView error";
                setErrorMsg(msg);
                Alert.alert("PDF", msg);
              }}
              onHttpError={(e) => {
                setLoading(false);
                const status = e?.nativeEvent?.statusCode;
                const msg = `HTTP Fehler: ${status}`;
                setErrorMsg(msg);
                Alert.alert("PDF", msg);
              }}
            />
          ) : (
            <View style={s.errorWrap}>
              <View style={s.errorCard}>
                <Text style={s.errorTitle}>PDF konnte nicht geöffnet werden</Text>
                <Text style={s.errorText}>
                  Ungültige oder nicht unterstützte PDF-Quelle.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <RlcKiFloatingButton
        projectId={projectId}
        projectCode={projectCode}
        title={title || "PDF"}
        screen="PdfViewer"
        initialMessage="Ich bin im PDF-Viewer. Hilf mir konkret mit diesem PDF, Speichern, Teilen oder Rücksprung zum Projekt."
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  viewerWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  topBar: {
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  topBarSpacer: {
    flex: 1,
  },

  hintBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  hintTxt: {
    color: COLORS.sub,
    fontWeight: "800",
    fontSize: 12,
  },

  webWrap: {
    flex: 1,
  },

  web: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    alignItems: "center",
    zIndex: 10,
  },

  loadingTxt: {
    marginTop: 10,
    fontWeight: "800",
    color: COLORS.sub,
  },

  errorWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 16,
    justifyContent: "center",
  },

  errorCard: {
    borderRadius: 20,
    padding: 16,
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

  errorTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },

  errorText: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 20,
  },

  errorActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  btnPrimary: {
    flex: 1,
    minHeight: 46,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  btnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 13,
  },

  btnSecondary: {
    flex: 1,
    minHeight: 46,
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  btnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  btnPrimaryCompact: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  btnPrimaryCompactTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  btnSecondaryCompact: {
    backgroundColor: COLORS.card2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  btnSecondaryCompactTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  btnDisabled: {
    opacity: 0.6,
  },
});


