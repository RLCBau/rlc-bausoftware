import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  clearServerProfile,
  getServerProfile,
  verifyAndSaveCloudServer,
  verifyAndSavePairingQr,
  type RlcServerProfile,
} from "../lib/serverProfile";
import { COLORS, createRlcStyles } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ServerSetup">;

const CLOUD_API_URL = String(
  process.env.EXPO_PUBLIC_API_URL || "https://api.rlcbausoftware.com"
)
  .trim()
  .replace(/\/$/, "");

export default function ServerSetupScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<RlcServerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [error, setError] = useState("");
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    void getServerProfile().then(setProfile);
  }, []);

  function goLogin(next: RlcServerProfile) {
    setProfile(next);
    navigation.reset({
      index: 0,
      routes: [{ name: "Login", params: { mode: "SERVER_SYNC" } }],
    });
  }

  async function connectCloud() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await verifyAndSaveCloudServer(CLOUD_API_URL);
      goLogin(next);
    } catch (e: any) {
      setError(String(e?.message || "RLC Cloud nicht erreichbar."));
    } finally {
      setBusy(false);
    }
  }

  async function openScanner() {
    setError("");
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("Bitte Kamerazugriff erlauben, um den Server-QR zu scannen.");
        return;
      }
    }
    setScanLocked(false);
    setScannerOpen(true);
  }

  async function onBarcodeScanned(result: any) {
    if (scanLocked || busy) return;
    setScanLocked(true);
    setBusy(true);
    setError("");
    try {
      const next = await verifyAndSavePairingQr(String(result?.data || ""));
      setScannerOpen(false);
      goLogin(next);
    } catch (e: any) {
      setError(String(e?.message || "Server-QR konnte nicht geprüft werden."));
      setScannerOpen(false);
    } finally {
      setBusy(false);
      setTimeout(() => setScanLocked(false), 1200);
    }
  }

  function useCurrent() {
    if (profile) goLogin(profile);
  }

  function removeCurrent() {
    Alert.alert(
      "Server-Verbindung entfernen?",
      "Die Server-Anmeldung wird gelöscht. Lokale Projektdaten bleiben erhalten.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Entfernen",
          style: "destructive",
          onPress: async () => {
            await clearServerProfile();
            setProfile(null);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.hero}>
          <Ionicons name="server-outline" size={31} color={COLORS.card} />
          <View style={s.flex}>
            <Text style={s.eyebrow}>RLC Enterprise</Text>
            <Text style={s.title}>Server verbinden</Text>
            <Text style={s.heroText}>
              Mobile, Web und RLC KI arbeiten danach über denselben Server.
            </Text>
          </View>
        </View>

        {profile ? (
          <View style={[s.card, s.activeCard]}>
            <View style={s.cardHeader}>
              <View style={s.okIcon}>
                <Ionicons name="checkmark" size={18} color={COLORS.card} />
              </View>
              <View style={s.flex}>
                <Text style={s.cardTitle}>{profile.serverName}</Text>
                <Text style={s.meta}>{profile.apiUrl}</Text>
              </View>
              <Text style={s.modePill}>{profile.aiMode || "RLC KI"}</Text>
            </View>
            <Pressable style={s.primary} onPress={useCurrent} disabled={busy}>
              <Text style={s.primaryText}>Diese Verbindung verwenden</Text>
            </Pressable>
            <Pressable style={s.remove} onPress={removeCurrent} disabled={busy}>
              <Text style={s.removeText}>Verbindung entfernen</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={s.card}>
          <View style={s.optionRow}>
            <View style={s.optionIcon}>
              <Ionicons name="cloud-outline" size={24} color={COLORS.accent} />
            </View>
            <View style={s.flex}>
              <Text style={s.cardTitle}>RLC Cloud</Text>
              <Text style={s.desc}>Unser verwalteter Hetzner-Server.</Text>
            </View>
          </View>
          <Pressable style={s.secondary} onPress={connectCloud} disabled={busy}>
            <Text style={s.secondaryText}>RLC Cloud verbinden</Text>
          </Pressable>
        </View>

        <View style={[s.card, s.privateCard]}>
          <View style={s.optionRow}>
            <View style={s.optionIcon}>
              <Ionicons name="qr-code-outline" size={24} color={COLORS.accent} />
            </View>
            <View style={s.flex}>
              <Text style={s.cardTitle}>Privater Kundenserver</Text>
              <Text style={s.desc}>
                QR vom RLC Server scannen. Die Verbindung wird vor dem Speichern geprüft.
              </Text>
            </View>
          </View>
          <Pressable style={s.primary} onPress={openScanner} disabled={busy}>
            <Ionicons name="scan-outline" size={20} color={COLORS.card} />
            <Text style={s.primaryText}>Server-QR scannen</Text>
          </Pressable>
        </View>

        {busy ? (
          <View style={s.statusRow}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={s.statusText}>Server wird verifiziert…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={s.errorCard}>
            <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={s.note}>
          Private Server benötigen eine gültige HTTPS-Adresse. OpenAI wird nie direkt vom
          Mobile aufgerufen, sondern ausschließlich über den verbundenen RLC Server.
        </Text>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={s.scannerSafe}>
          <View style={s.scannerHeader}>
            <Pressable onPress={() => setScannerOpen(false)} style={s.closeButton}>
              <Ionicons name="close" size={26} color={COLORS.card} />
            </Pressable>
            <Text style={s.scannerTitle}>RLC Server-QR scannen</Text>
            <View style={s.closeSpacer} />
          </View>
          <CameraView
            style={s.camera}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanLocked ? undefined : onBarcodeScanned}
          >
            <View style={s.scanFrame} />
          </CameraView>
          <Text style={s.scannerHint}>
            Der QR-Code wird nur übernommen, wenn der private RLC Server ihn bestätigt.
          </Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = createRlcStyles("ServerSetupScreen", {
  safe: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 14, paddingBottom: 28, gap: 12 },
  flex: { flex: 1 },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: COLORS.navyDark,
  },
  eyebrow: { color: COLORS.sky, fontSize: 13, fontWeight: "700" },
  title: { color: COLORS.card, fontSize: 20, fontWeight: "700", marginTop: 2 },
  heroText: { color: "rgba(255,255,255,0.78)", lineHeight: 19, marginTop: 5 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    gap: 12,
  },
  activeCard: { borderLeftWidth: 4, borderLeftColor: COLORS.success },
  privateCard: { backgroundColor: COLORS.accentSoft },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  okIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.success,
  },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  desc: { color: COLORS.sub, lineHeight: 19, marginTop: 3 },
  meta: { color: COLORS.sub, fontSize: 12, marginTop: 2 },
  modePill: {
    overflow: "hidden",
    color: COLORS.accentDark,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "700",
  },
  primary: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryText: { color: COLORS.card, fontWeight: "700" },
  secondary: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: COLORS.accentDark, fontWeight: "700" },
  remove: { alignItems: "center", paddingVertical: 4 },
  removeText: { color: COLORS.danger, fontWeight: "600" },
  statusRow: { flexDirection: "row", justifyContent: "center", gap: 9, padding: 8 },
  statusText: { color: COLORS.sub, fontWeight: "600" },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorText: { color: COLORS.danger, flex: 1, lineHeight: 19 },
  note: { color: COLORS.sub, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  scannerSafe: { flex: 1, backgroundColor: COLORS.navyDark },
  scannerHeader: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeSpacer: { width: 44 },
  scannerTitle: { color: COLORS.card, fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
  camera: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: COLORS.sky,
    borderRadius: 22,
    backgroundColor: "transparent",
  },
  scannerHint: { color: COLORS.card, textAlign: "center", lineHeight: 19, padding: 18 },
});
