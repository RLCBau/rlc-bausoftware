// apps/mobile/src/screens/PdfViewerScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Platform, SafeAreaView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, createRlcStyles } from "../ui/theme";
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
  const base = String(input || "PDF").trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return base || "PDF";
}
function ensurePdfExtension(name: string) {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
async function ensureDirExists(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, {
        intermediates: true
      });
    }
  } catch {
    try {
      await FileSystem.makeDirectoryAsync(dir, {
        intermediates: true
      });
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
      await FileSystem.copyAsync({
        from: u,
        to: target
      });
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
  const {
    sourceUri,
    title
  } = params;
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
    await FileSystem.copyAsync({
      from: src,
      to: target
    });
    return target;
  }
  if (isContentUrl(src)) {
    await FileSystem.copyAsync({
      from: src,
      to: target
    });
    return target;
  }
  throw new Error("PDF konnte nicht lokal vorbereitet werden.");
}
export default function PdfViewerScreen({
  route,
  navigation
}: Props) {
  const {
    uri,
    title
  } = route.params;
  const anyParams: any = route.params || {};
  const projectId = String(anyParams.projectId || anyParams.projectCode || "");
  const projectCode = String(anyParams.projectCode || anyParams.projectId || "");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [normalizedUri, setNormalizedUri] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [emailing, setEmailing] = useState(false);
  useEffect(() => {
    navigation.setOptions({
      title: title || "PDF"
    });
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
        title: title || "PDF"
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("PDF gespeichert", localUri);
        return;
      }
      await Sharing.shareAsync(localUri, {
        mimeType: "application/pdf",
        dialogTitle: "PDF speichern",
        UTI: "com.adobe.pdf"
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
        title: title || "PDF"
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("PDF", "Teilen ist auf diesem Gerät nicht verfügbar.");
        return;
      }
      await Sharing.shareAsync(localUri, {
        mimeType: "application/pdf",
        dialogTitle: title || "PDF teilen",
        UTI: "com.adobe.pdf"
      });
    } catch (e: any) {
      Alert.alert("PDF", String(e?.message || e || "Teilen fehlgeschlagen."));
    } finally {
      setSharing(false);
    }
  }, [sourceUri, title]);
  const handlePrint = useCallback(async () => {
    try {
      if (!sourceUri) {
        Alert.alert("PDF", "Keine PDF-Datei gefunden.");
        return;
      }
      if (Platform.OS === "web") {
        Alert.alert("PDF", "Drucken ist hier nicht verfügbar.");
        return;
      }
      setPrinting(true);
      const localUri = await materializePdfToLocalFile({
        sourceUri,
        title: title || "PDF"
      });
      await Print.printAsync({
        uri: localUri
      });
    } catch (e: any) {
      Alert.alert("PDF", String(e?.message || e || "Drucken fehlgeschlagen."));
    } finally {
      setPrinting(false);
    }
  }, [sourceUri, title]);
  const handleEmail = useCallback(async () => {
    try {
      if (!sourceUri) {
        Alert.alert("PDF", "Keine PDF-Datei gefunden.");
        return;
      }
      if (Platform.OS === "web") {
        Alert.alert("PDF", "E-Mail ist hier nicht verfügbar.");
        return;
      }
      setEmailing(true);
      const available = await MailComposer.isAvailableAsync().catch(() => false);
      if (!available) {
        Alert.alert("E-Mail", "Auf diesem Gerät ist kein E-Mail-Konto eingerichtet.");
        return;
      }
      const localUri = await materializePdfToLocalFile({
        sourceUri,
        title: title || "PDF"
      });
      await MailComposer.composeAsync({
        subject: title || "RLC PDF",
        body: "",
        attachments: [localUri]
      });
    } catch (e: any) {
      Alert.alert("E-Mail", String(e?.message || e || "E-Mail konnte nicht geöffnet werden."));
    } finally {
      setEmailing(false);
    }
  }, [sourceUri, title]);
  const actionBusy = saving || sharing || printing || emailing;
  if (errorMsg) {
    return <SafeAreaView style={s.safe}>
        <View style={s.errorWrap}>
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>PDF konnte nicht geöffnet werden</Text>
            <Text style={s.errorText}>{errorMsg}</Text>

            <View style={s.errorActions}>
              <Pressable style={s.btnSecondary} onPress={() => navigation.goBack()}>
                <Text style={s.btnSecondaryTxt}>Zurück</Text>
              </Pressable>

              <Pressable style={s.btnPrimary} onPress={() => {
              setLoading(true);
              setErrorMsg(null);
              setRetryKey(k => k + 1);
            }}>
                <Text style={s.btnPrimaryTxt}>Neu versuchen</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <RlcKiFloatingButton projectId={projectId} projectCode={projectCode} title={title || "PDF"} screen="PdfViewer" initialMessage="Ich bin im PDF-Viewer. Hilf mir konkret mit diesem PDF, Speichern, Teilen oder Rücksprung zum Projekt." />
      </SafeAreaView>;
  }
  return <SafeAreaView style={s.safe}>
      <View style={s.viewerWrap}>
        <View style={s.topBar}>
          <Pressable style={s.btnSecondaryCompact} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={COLORS.text} />
            <Text style={s.btnSecondaryCompactTxt}>Zurück</Text>
          </Pressable>
          <Text style={s.topBarTitle} numberOfLines={1}>{title || "PDF-Vorschau"}</Text>
        </View>

        <View style={s.hintBar}>
          <Text style={s.hintTxt}>
            {isFileUrl(sourceUri) ? "PDF lokal gespeichert" : "PDF vom Server"}
          </Text>
        </View>

        <View style={s.webWrap}>
          {loading ? <View style={s.loading}>
              <ActivityIndicator />
              <Text style={s.loadingTxt}>PDF wird geladen…</Text>
            </View> : null}

          {canRender ? <WebView key={String(retryKey)} source={{
          uri: sourceUri
        }} style={s.web} onLoadStart={() => setLoading(true)} onLoadEnd={() => setLoading(false)} allowingReadAccessToURL={Platform.OS === "ios" && isFileUrl(sourceUri) ? dirOfFileUri(sourceUri) : undefined} allowFileAccess={true} allowUniversalAccessFromFileURLs={true} originWhitelist={["*"]} onError={e => {
          setLoading(false);
          const msg = e?.nativeEvent?.description || "WebView error";
          setErrorMsg(msg);
          Alert.alert("PDF", msg);
        }} onHttpError={e => {
          setLoading(false);
          const status = e?.nativeEvent?.statusCode;
          const msg = `HTTP Fehler: ${status}`;
          setErrorMsg(msg);
          Alert.alert("PDF", msg);
        }} /> : <View style={s.errorWrap}>
              <View style={s.errorCard}>
                <Text style={s.errorTitle}>PDF konnte nicht geöffnet werden</Text>
                <Text style={s.errorText}>
                  Ungültige oder nicht unterstützte PDF-Quelle.
                </Text>
              </View>
            </View>}
        </View>

        <View style={s.actionBar}>
          <PdfAction icon="mail-outline" label={emailing ? "Öffnet…" : "E-Mail"} onPress={handleEmail} disabled={actionBusy} />
          <PdfAction icon="print-outline" label={printing ? "Druckt…" : "Drucken"} onPress={handlePrint} disabled={actionBusy} />
          <PdfAction icon="share-outline" label={sharing ? "Öffnet…" : "Teilen"} onPress={handleShare} disabled={actionBusy} primary />
          <PdfAction icon="download-outline" label={saving ? "Speichert…" : "Speichern"} onPress={handleSave} disabled={actionBusy} />
        </View>
      </View>
      <RlcKiFloatingButton projectId={projectId} projectCode={projectCode} title={title || "PDF"} screen="PdfViewer" initialMessage="Ich bin im PDF-Viewer. Hilf mir konkret mit diesem PDF, Speichern, Teilen oder Rücksprung zum Projekt." />
    </SafeAreaView>;
}
function PdfAction({
  icon,
  label,
  onPress,
  disabled,
  primary = false
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return <Pressable style={[s.actionBtn, primary && s.actionBtnPrimary, disabled && s.btnDisabled]} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={20} color={primary ? COLORS.textLight : COLORS.text} />
      <Text style={[s.actionBtnText, primary && s.actionBtnTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>;
}
const s = createRlcStyles("PdfViewerScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  viewerWrap: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  topBar: {
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  topBarTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600"
  },
  hintBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  hintTxt: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12
  },
  webWrap: {
    flex: 1
  },
  web: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  actionBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4
  },
  actionBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  actionBtnText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "600"
  },
  actionBtnTextPrimary: {
    color: COLORS.textLight
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    alignItems: "center",
    zIndex: 10
  },
  loadingTxt: {
    marginTop: 10,
    fontWeight: "600",
    color: COLORS.sub
  },
  errorWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 14,
    justifyContent: "center"
  },
  errorCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: COLORS.card,
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
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text
  },
  errorText: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20
  },
  errorActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
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
    paddingHorizontal: 12
  },
  btnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 13
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
    paddingHorizontal: 12
  },
  btnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 13
  },
  btnPrimaryCompact: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.accent
  },
  btnPrimaryCompactTxt: {
    color: COLORS.textLight,
    fontWeight: "600"
  },
  btnSecondaryCompact: {
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  btnSecondaryCompactTxt: {
    color: COLORS.text,
    fontWeight: "600"
  },
  btnDisabled: {
    opacity: 0.6
  }
});
