// apps/mobile/src/screens/CompanyAdminScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import { api, CompanyHeader } from "../lib/api";
import { COLORS } from "../ui/theme";

export default function CompanyAdminScreen() {
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const [header, setHeader] = useState<CompanyHeader | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const cached = await api.getCompanyHeaderCached();
      if (cached) {
        setHeader(cached);
        setName(String(cached.name || ""));
        setAddress(String(cached.address || ""));
        setPhone(String(cached.phone || ""));
        setEmail(String(cached.email || ""));
      }

      const cachedLogo = await api.getCompanyLogoCachedUri();
      if (cachedLogo) setLogoUri(cachedLogo);

      const fresh = await api.getCompanyHeader();
      setHeader(fresh);
      setName(String(fresh.name || ""));
      setAddress(String(fresh.address || ""));
      setPhone(String(fresh.phone || ""));
      setEmail(String(fresh.email || ""));

      const logo = await api.downloadCompanyLogoToCache(false);
      if (logo) setLogoUri(logo);
    } catch (e: any) {
      Alert.alert("Firma", e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const payload = useMemo(
    () => ({
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    }),
    [name, address, phone, email]
  );

  const saveHeader = useCallback(async () => {
    if (!payload.name) {
      Alert.alert("Fehlt", "Firmenname fehlt.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.updateCompanyHeaderAdmin(payload);
      setHeader(updated);
      Alert.alert("OK", "Firmendaten gespeichert.");
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [payload]);

  const pickAndUploadLogo = useCallback(async () => {
    setLogoBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Berechtigung", "Bitte Fotos-Berechtigung erlauben.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });

      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (!uri) return;

      const u = uri.toLowerCase();
      const mime =
        u.endsWith(".jpg") || u.endsWith(".jpeg")
          ? "image/jpeg"
          : u.endsWith(".webp")
          ? "image/webp"
          : "image/png";

      const updated = await api.uploadCompanyLogoAdmin(uri, mime);
      setHeader(updated);

      const localLogo = await api.downloadCompanyLogoToCache(true);
      if (localLogo) setLogoUri(localLogo);

      Alert.alert("OK", "Logo hochgeladen.");
    } catch (e: any) {
      Alert.alert("Logo", e?.message || String(e));
    } finally {
      setLogoBusy(false);
    }
  }, []);

  const syncToOffline = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.syncCompanyBrandingToOfflineCache();
      if (r?.header) setHeader(r.header);
      if (r?.logoUri) setLogoUri(r.logoUri);
      Alert.alert("OK", "Offline Cache aktualisiert.");
    } catch (e: any) {
      Alert.alert("Sync", e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>Firma – Admin (SERVER_SYNC)</Text>
      <Text style={styles.p}>
        Header + Logo werden am Server gespeichert. Alle Nutzer bekommen es via
        Sync.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Firmenname *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Firmenname"
          placeholderTextColor={COLORS.sub}
          style={styles.input}
        />

        <Text style={styles.label}>Adresse</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Straße, PLZ Ort"
          placeholderTextColor={COLORS.sub}
          style={styles.input}
          multiline
        />

        <Text style={styles.label}>Telefon</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Telefon"
          placeholderTextColor={COLORS.sub}
          style={styles.input}
          keyboardType={
            Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"
          }
        />

        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-Mail Firma"
          placeholderTextColor={COLORS.sub}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Pressable
          disabled={busy}
          onPress={saveHeader}
          style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
        >
          <Text style={styles.btnPrimaryText}>
            {busy ? "Speichere..." : "Daten speichern"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Logo</Text>

        {logoUri ? (
          <View style={styles.logoRow}>
            <Image source={{ uri: logoUri }} style={styles.logo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.small} numberOfLines={2}>
                {logoUri}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.small}>Kein Logo im Cache.</Text>
        )}

        <Pressable
          disabled={logoBusy}
          onPress={pickAndUploadLogo}
          style={[styles.btn, logoBusy && { opacity: 0.6 }]}
        >
          <Text style={styles.btnText}>
            {logoBusy ? "Upload..." : "Logo auswählen & hochladen"}
          </Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={syncToOffline}
          style={[styles.btnGhost, busy && { opacity: 0.6 }]}
        >
          <Text style={styles.btnGhostText}>Offline Cache aktualisieren</Text>
        </Pressable>

        <Pressable onPress={load} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>Neu laden</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.small}>
          Debug: Header-ID: {String(header?.id || "-")}
        </Text>
        <Text style={styles.small}>
          Updated: {String(header?.updatedAt || "-")}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    paddingBottom: 28,
    backgroundColor: COLORS.bg,
  },

  h1: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 6,
  },

  p: {
    color: COLORS.sub,
    marginBottom: 14,
    lineHeight: 18,
    fontWeight: "700",
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  label: {
    color: COLORS.text,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: COLORS.inputBg,
    fontWeight: "700",
  },

  btnPrimary: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accentDark,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },

  btnPrimaryText: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  btn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: COLORS.card2,
  },

  btnText: {
    color: COLORS.text,
    fontWeight: "900",
  },

  btnGhost: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: COLORS.card,
  },

  btnGhostText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
  },

  small: {
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },

  logoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },

  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});





