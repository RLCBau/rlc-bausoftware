// apps/mobile/src/screens/PdfViewerScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system"; // ✅ NEW (robusto per content://)

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

/** iOS WKWebView: allowingReadAccessToURL deve essere una directory URL */
function dirOfFileUri(fileUri: string) {
  const u = String(fileUri || "").trim();
  if (!isFileUrl(u)) return u;

  // file:///.../name.pdf -> file:///.../
  const idx = u.lastIndexOf("/");
  if (idx <= "file://".length) return u;
  return u.slice(0, idx + 1);
}

async function ensureFileUriFromMaybeContent(inputUri: string): Promise<string> {
  const u = String(inputUri || "").trim();
  if (!u) return "";

  if (Platform.OS === "web") return u;

  // already ok
  if (isFileUrl(u) || isHttpUrl(u)) return u;

  // Android content:// -> copia in cache
  if (isContentUrl(u)) {
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) return u;

    const tmpDir = `${base}tmp_pdf/`;
    try {
      const info = await FileSystem.getInfoAsync(tmpDir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(tmpDir, { intermediates: true });
    } catch {
      try {
        await FileSystem.makeDirectoryAsync(tmpDir, { intermediates: true });
      } catch {}
    }

    const target = `${tmpDir}${Date.now()}_${Math.floor(Math.random() * 1e9)}.pdf`;

    try {
      await FileSystem.copyAsync({ from: u, to: target });
      return target; // file://...
    } catch (e: any) {
      console.log("[PDFVIEW] content->file copy failed:", String(e?.message || e));
      return u; // fallback (WebView probabilmente fallirà, ma mostriamo errore)
    }
  }

  // altri schemi non supportati
  return u;
}

export default function PdfViewerScreen({ route, navigation }: Props) {
  const { uri, title } = route.params;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // ✅ NEW: normalized source (content:// -> file://)
  const [normalizedUri, setNormalizedUri] = useState<string>("");

  useEffect(() => {
    navigation.setOptions({ title: title || "PDF" });
  }, [title, navigation]);

  const sourceUriRaw = useMemo(() => {
    const u = String(uri || "").trim();
    return u;
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

      // can render only http(s) and file:// (content:// viene convertito sopra)
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
    const u = String(normalizedUri || sourceUriRaw || "").trim();
    return u;
  }, [normalizedUri, sourceUriRaw]);

  const canRender = useMemo(() => {
    // WebView can render https and file URLs.
    // For other schemes, we block.
    return isHttpUrl(sourceUri) || isFileUrl(sourceUri);
  }, [sourceUri]);

  useEffect(() => {
    if (!sourceUriRaw) setErrorMsg("PDF URI fehlt");
  }, [sourceUriRaw]);

  if (errorMsg) {
    return (
      <View style={s.wrap}>
        <Text style={s.txt}>PDF konnte nicht geöffnet werden</Text>
        <Text style={s.sub}>{errorMsg}</Text>

        <Pressable style={s.btnOutline} onPress={() => navigation.goBack()}>
          <Text style={s.btnOutlineTxt}>Zurück</Text>
        </Pressable>

        <Pressable
          style={[s.btn, { marginTop: 10 }]}
          onPress={() => {
            setLoading(true);
            setErrorMsg(null);
            setRetryKey((k) => k + 1);
          }}
        >
          <Text style={s.btnTxt}>Neu versuchen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.viewerWrap}>
      <View style={s.topBar}>
        <Pressable style={s.btnOutline} onPress={() => navigation.goBack()}>
          <Text style={s.btnOutlineTxt}>Zurück</Text>
        </Pressable>

        <Pressable
          style={s.btn}
          onPress={() => {
            setLoading(true);
            setErrorMsg(null);
            setRetryKey((k) => k + 1);
          }}
        >
          <Text style={s.btnTxt}>Neu laden</Text>
        </Pressable>
      </View>

      <View style={s.hint}>
        <Text style={s.hintTxt}>
          {isFileUrl(sourceUri) ? "Offline-Datei (lokal)" : "Online-Datei"}
        </Text>
      </View>

      <View style={s.webWrap}>
        {loading ? (
          <View style={s.loading}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, fontWeight: "800", opacity: 0.7 }}>PDF wird geladen…</Text>
          </View>
        ) : null}

        <WebView
          key={String(retryKey)}
          source={{ uri: sourceUri }}
          style={s.web}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          // iOS: allow file:// (✅ directory access, not file path)
          allowingReadAccessToURL={Platform.OS === "ios" && isFileUrl(sourceUri) ? dirOfFileUri(sourceUri) : undefined}
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
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  viewerWrap: { flex: 1, backgroundColor: "#F3F4F6" },

  topBar: {
    padding: 12,
    paddingTop: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },

  hint: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  hintTxt: { fontWeight: "800", opacity: 0.7 },

  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: "#F3F4F6" },

  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    alignItems: "center",
    zIndex: 10,
  },

  wrap: { flex: 1, backgroundColor: "#F3F4F6", padding: 18, justifyContent: "center" },
  txt: { fontSize: 16, fontWeight: "900", color: "#0B0B0C" },
  sub: { marginTop: 8, opacity: 0.65, fontWeight: "700" },

  btn: {
    backgroundColor: "#111",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnTxt: { color: "#fff", fontWeight: "900" },

  btnOutline: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  btnOutlineTxt: { fontWeight: "900" },
});
