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
  SafeAreaView,
  KeyboardAvoidingView,
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
        if (l) setLogoUri(String(l));
      } catch {
        // ignore initial load errors
      }
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
        allowsEditing: true,
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
        "Gespeichert",
        `Firmendaten wurden lokal gespeichert${persisted ? "." : " (ohne Logo)."}`,
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Speichern", e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [headerObj, logoUri, navigation, validate]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.bg}
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.backTxt}>Zurück</Text>
              </Pressable>
              <View style={styles.headerSpacer} />
            </View>

            <Text style={styles.eyebrow}>RLC Bausoftware</Text>
            <Text style={styles.eyebrowSub}>Firma / Branding / PDF</Text>

            <Text style={styles.h1}>Firmendaten einrichten</Text>

            <Text style={styles.p}>
              Modus: NUR_APP (ohne Server). Diese Daten und das Logo werden lokal
              gespeichert und später automatisch in PDFs verwendet.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Firmendaten</Text>

            <Text style={styles.label}>Firmenname *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Firmenname"
              placeholderTextColor="#B8C1CC"
              style={styles.input}
            />

            <Text style={styles.label}>Adresse</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Straße, PLZ Ort"
              placeholderTextColor="#B8C1CC"
              style={[styles.input, styles.inputMultiline]}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>Telefon</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefon"
              placeholderTextColor="#B8C1CC"
              style={styles.input}
              keyboardType={
                Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"
              }
            />

            <Text style={styles.label}>E-Mail *</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="E-Mail Firma"
              placeholderTextColor="#B8C1CC"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Logo</Text>

            {logoUri ? (
              <View style={styles.logoRow}>
                <Image source={{ uri: logoUri }} style={styles.logo} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.small} numberOfLines={2}>
                    {logoUri}
                  </Text>

                  <Pressable
                    onPress={() => setLogoUri(null)}
                    style={styles.btnGhost}
                  >
                    <Text style={styles.btnGhostText}>Logo entfernen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.small}>Kein Logo gewählt.</Text>
            )}

            <Pressable onPress={pickLogo} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>Logo auswählen</Text>
            </Pressable>
          </View>

          <View style={styles.ctaWrap}>
            <Pressable
              disabled={busy}
              onPress={saveOffline}
              style={[styles.btnPrimary, busy && styles.btnDisabled]}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? "Speichere..." : "Offline speichern"}
              </Text>
            </Pressable>

            <Text style={styles.hint}>
              Diese Angaben werden lokal gespeichert und für PDF-Header verwendet.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  bg: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  wrap: {
    paddingBottom: 28,
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
    marginBottom: 8,
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

  eyebrow: {
    color: COLORS.accentDark,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  eyebrowSub: {
    marginTop: 2,
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "800",
  },

  h1: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text,
  },

  p: {
    marginTop: 10,
    color: COLORS.sub,
    lineHeight: 18,
    fontWeight: "700",
  },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
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

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 4,
  },

  label: {
    color: COLORS.text,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 10,
    fontSize: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }),
    color: COLORS.text,
    backgroundColor: COLORS.inputBg,
    fontWeight: "800",
    fontSize: 14,
  },

  inputMultiline: {
    minHeight: 76,
  },

  logoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 10,
  },

  logo: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  small: {
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },

  btnSecondary: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: COLORS.card2,
  },

  btnSecondaryText: {
    color: COLORS.text,
    fontWeight: "800",
  },

  btnGhost: {
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  btnGhostText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },

  ctaWrap: {
    marginTop: 14,
    paddingHorizontal: 16,
  },

  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },

  btnPrimaryText: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 14,
  },

  btnDisabled: {
    opacity: 0.6,
  },

  hint: {
    marginTop: 10,
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
});



