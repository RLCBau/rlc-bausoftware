// apps/mobile/src/screens/CompanyOfflineSetupScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

import {
  getCompanyHeaderCached,
  getCompanyLogoUriCached,
  setCompanyBrandingOffline,
} from "../lib/companyCache";

type Props = NativeStackScreenProps<RootStackParamList, "CompanyOfflineSetup">;

export default function CompanyOfflineSetupScreen({ navigation }: Props) {
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [logoUri, setLogoUri] = useState<string | null>(null);

  const headerObj = useMemo(
    () => ({
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    }),
    [name, address, phone, email]
  );

  useEffect(() => {
    (async () => {
      try {
        const h = await getCompanyHeaderCached();
        const l = await getCompanyLogoUriCached();

        if (h?.name) setName(String(h.name));
        if (h?.address) setAddress(String(h.address));
        if (h?.phone) setPhone(String(h.phone));
        if (h?.email) setEmail(String(h.email));

        if (l) setLogoUri(l);
      } catch {}
    })();
  }, []);

  const pickLogo = useCallback(async () => {
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

      setLogoUri(uri);
    } catch (e: any) {
      Alert.alert("Logo", e?.message || String(e));
    }
  }, []);

  const validate = useCallback(() => {
    if (!headerObj.name) return "Firmenname fehlt.";
    if (!headerObj.email) return "E-Mail fehlt.";
    return null;
  }, [headerObj]);

  const saveOffline = useCallback(async () => {
    const err = validate();
    if (err) {
      Alert.alert("Fehlt", err);
      return;
    }

    setBusy(true);
    try {
      const { logoUri: persisted } = await setCompanyBrandingOffline({
        header: headerObj,
        logoUri,
      });

      Alert.alert(
        "OK",
        `Offline gespeichert.${persisted ? "" : " (ohne Logo)"}`
      );

      // torna ai progetti o dove preferisci
      navigation.navigate("Projects");
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [headerObj, logoUri, navigation, validate]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>Firma – Offline Setup</Text>
      <Text style={styles.p}>
        Modus: NUR_APP (ohne Server). Daten + Logo werden lokal gespeichert und
        in PDFs benutzt.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Firmenname *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="z.B. RLC Tiefbau KG"
          placeholderTextColor={COLORS.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Adresse</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Straße, PLZ Ort"
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          multiline
        />

        <Text style={styles.label}>Telefon</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+49 ..."
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"}
        />

        <Text style={styles.label}>E-Mail *</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="info@firma.de"
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
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
              <Pressable onPress={() => setLogoUri(null)} style={styles.btnGhost}>
                <Text style={styles.btnGhostText}>Logo entfernen</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.small}>Kein Logo gewählt.</Text>
        )}

        <Pressable onPress={pickLogo} style={styles.btn}>
          <Text style={styles.btnText}>Logo auswählen</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={busy}
        onPress={saveOffline}
        style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
      >
        <Text style={styles.btnPrimaryText}>
          {busy ? "Speichere..." : "Offline speichern"}
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        Nächster Schritt: Export (QR / .rlccompany) kommt im Bundle-Modul.
      </Text>
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
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 6,
  },
  p: {
    color: COLORS.muted,
    marginBottom: 14,
    lineHeight: 18,
  },
  hint: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    color: COLORS.text,
    fontWeight: "700",
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
    backgroundColor: COLORS.bg,
  },
  btn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  btnText: {
    color: COLORS.text,
    fontWeight: "800",
  },
  btnPrimary: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "900",
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
    backgroundColor: COLORS.bg,
  },
  small: {
    color: COLORS.muted,
    fontSize: 12,
  },
  btnGhost: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
});
