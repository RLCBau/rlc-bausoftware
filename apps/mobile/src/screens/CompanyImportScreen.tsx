// apps/mobile/src/screens/CompanyImportScreen.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";

import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

import {
  applyCompanyBundle,
  importCompanyBundleFromFile,
  verifyCompanyBundle,
} from "../lib/companyBundle";

// ✅ QR Scan (requires: expo-camera)
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  // module not installed -> scan disabled (file import + paste still work)
}

type Props = NativeStackScreenProps<RootStackParamList, "CompanyImport">;

type Tab = "SCAN" | "FILE" | "PASTE";

export default function CompanyImportScreen({ navigation, route }: Props) {
  const mode = route.params?.mode;
  const [tab, setTab] = useState<Tab>(CameraView ? "SCAN" : "FILE");
  const [busy, setBusy] = useState(false);

  // QR JSON paste
  const [paste, setPaste] = useState("");

  // camera permission
  const camHook = useMemo(() => {
    if (!useCameraPermissions) return null;
    try {
      return useCameraPermissions();
    } catch {
      return null;
    }
  }, []);
  const permission = camHook?.[0];
  const requestPermission = camHook?.[1];

  const scanEnabled = !!CameraView && !!useCameraPermissions;

  const onImported = useCallback(async (bundle: any) => {
    const v = await verifyCompanyBundle(bundle);
    if (!v.ok) throw new Error(v.error);

    await applyCompanyBundle(bundle);

    Alert.alert("OK", "Setup importiert. Firma/Logo sind lokal gespeichert.");
    navigation.navigate("Projects");
  }, [navigation]);

  const importFromFile = useCallback(async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const uri = res.assets?.[0]?.uri;
      if (!uri) throw new Error("DATEI_FEHLT");

      const bundle = await importCompanyBundleFromFile(uri);
      await onImported(bundle);
    } catch (e: any) {
      Alert.alert("Import", e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [onImported]);

  const importFromPaste = useCallback(async () => {
    const raw = (paste || "").trim();
    if (!raw) {
      Alert.alert("Fehlt", "Bitte QR/Text JSON einfügen.");
      return;
    }

    setBusy(true);
    try {
      const bundle = JSON.parse(raw);
      await onImported(bundle);
    } catch (e: any) {
      Alert.alert("Import", e?.message || "JSON ungültig.");
    } finally {
      setBusy(false);
    }
  }, [paste, onImported]);

  const onScanned = useCallback(async (data: string) => {
    if (busy) return;
    if (!data) return;

    setBusy(true);
    try {
      const bundle = JSON.parse(String(data));
      await onImported(bundle);
    } catch (e: any) {
      Alert.alert("QR", e?.message || "QR Inhalt ist kein gültiges JSON.");
      setBusy(false); // non bloccare
    }
  }, [busy, onImported]);

  const ensureCamera = useCallback(async () => {
    if (!scanEnabled) {
      Alert.alert(
        "QR Scan nicht verfügbar",
        "Bitte installiere expo-camera:\n\nnpx expo install expo-camera"
      );
      return false;
    }

    if (permission?.granted) return true;

    try {
      const p = await requestPermission?.();
      return !!p?.granted;
    } catch {
      return false;
    }
  }, [permission?.granted, requestPermission, scanEnabled]);

  const openScan = useCallback(async () => {
    const ok = await ensureCamera();
    if (!ok) {
      Alert.alert("Berechtigung", "Kamera-Berechtigung fehlt.");
      return;
    }
    setTab("SCAN");
  }, [ensureCamera]);

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Setup importieren</Text>
          <Text style={styles.p}>
            {mode ? `Modus: ${mode}` : "NUR_APP oder SERVER_SYNC (Onboarding)"}
          </Text>
        </View>

        <Pressable onPress={() => navigation.goBack()} style={styles.btnX}>
          <Text style={styles.btnXText}>✕</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          onPress={openScan}
          style={[styles.tab, tab === "SCAN" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "SCAN" && styles.tabTextOn]}>
            QR Scan
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("FILE")}
          style={[styles.tab, tab === "FILE" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "FILE" && styles.tabTextOn]}>
            Datei
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("PASTE")}
          style={[styles.tab, tab === "PASTE" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "PASTE" && styles.tabTextOn]}>
            Einfügen
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {tab === "SCAN" ? (
        <View style={styles.scanWrap}>
          {!scanEnabled ? (
            <View style={styles.card}>
              <Text style={styles.label}>QR Scan nicht installiert</Text>
              <Text style={styles.small}>
                Installiere: npx expo install expo-camera
              </Text>
              <Pressable onPress={() => setTab("FILE")} style={styles.btn}>
                <Text style={styles.btnText}>Weiter mit Datei-Import</Text>
              </Pressable>
            </View>
          ) : !permission?.granted ? (
            <View style={styles.card}>
              <Text style={styles.label}>Kamera-Berechtigung</Text>
              <Text style={styles.small}>
                Bitte Kamera erlauben, um QR zu scannen.
              </Text>
              <Pressable
                onPress={() => requestPermission?.()}
                style={styles.btnPrimary}
              >
                <Text style={styles.btnPrimaryText}>Berechtigung erlauben</Text>
              </Pressable>
              <Pressable onPress={() => setTab("FILE")} style={styles.btn}>
                <Text style={styles.btnText}>Datei-Import</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cameraBox}>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={(ev: any) => onScanned(ev?.data)}
              />
              <View style={styles.scanOverlay}>
                <Text style={styles.scanText}>
                  QR in den Rahmen halten (Light-Bundle)
                </Text>
                <Pressable onPress={() => setTab("FILE")} style={styles.btnGhost}>
                  <Text style={styles.btnGhostText}>oder Datei importieren</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : tab === "FILE" ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>.rlccompany Datei importieren</Text>
            <Text style={styles.small}>
              Importiert Setup inkl. Logo (wenn im Bundle enthalten).
            </Text>

            <Pressable
              disabled={busy}
              onPress={importFromFile}
              style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? "Importiere..." : "Datei auswählen"}
              </Text>
            </Pressable>

            <Text style={styles.smallHint}>
              Tipp: Datei kommt vom Admin via WhatsApp/Email.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Alternative</Text>
            <Text style={styles.small}>
              Falls QR nicht geht: Tab „Einfügen“ benutzen.
            </Text>
            <Pressable onPress={() => setTab("PASTE")} style={styles.btn}>
              <Text style={styles.btnText}>Zu Einfügen wechseln</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.label}>QR/Text JSON einfügen</Text>
            <Text style={styles.small}>
              Für QR-Light (nur Header) oder Debug. JSON muss signiert sein.
            </Text>

            <TextInput
              value={paste}
              onChangeText={setPaste}
              placeholder='{"v":1,"kind":"RLC_COMPANY_LIGHT",...}'
              placeholderTextColor={COLORS.muted}
              style={styles.textarea}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              disabled={busy}
              onPress={importFromPaste}
              style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? "Prüfe..." : "Importieren"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Hinweis</Text>
            <Text style={styles.small}>
              Wenn du QR Scan willst: installiere expo-camera.
            </Text>
            <Pressable onPress={openScan} style={styles.btn}>
              <Text style={styles.btnText}>Zu QR Scan</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, padding: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  h1: { fontSize: 20, fontWeight: "900", color: COLORS.text },
  p: { color: COLORS.muted, marginTop: 2 },
  btnX: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  btnXText: { color: COLORS.text, fontSize: 16, fontWeight: "900" },

  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabOn: { backgroundColor: COLORS.card },
  tabText: { color: COLORS.muted, fontWeight: "800" },
  tabTextOn: { color: COLORS.text },

  content: { paddingBottom: 22 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  label: { color: COLORS.text, fontWeight: "900", marginBottom: 6 },
  small: { color: COLORS.muted, fontSize: 12, lineHeight: 16 },
  smallHint: { marginTop: 10, color: COLORS.muted, fontSize: 12 },

  btn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  btnText: { color: COLORS.text, fontWeight: "900" },

  btnPrimary: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900" },

  textarea: {
    marginTop: 10,
    minHeight: 150,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    textAlignVertical: "top",
  },

  scanWrap: { flex: 1 },
  cameraBox: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  scanOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    gap: 10,
  },
  scanText: { color: "#fff", fontWeight: "900" },
  btnGhost: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  btnGhostText: { color: "#fff", fontWeight: "900", fontSize: 12 },
});
