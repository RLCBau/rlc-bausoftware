// apps/mobile/src/screens/StartScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Image,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Start">;

const KEY_MODE = "rlc_mobile_mode";

type Mode = "NUR_APP" | "SERVER_SYNC";

export default function StartScreen({ navigation }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [booting, setBooting] = useState(true);

  // ✅ prevent double tap / double navigation
  const [navBusy, setNavBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const m = String((await AsyncStorage.getItem(KEY_MODE)) || "");
        const next = m === "NUR_APP" || m === "SERVER_SYNC" ? (m as Mode) : null;

        if (!alive) return;

        setMode(next);
        setBooting(false);

        // POLICY: Start resta sempre prima pagina, nessun redirect automatico.
      } catch {
        if (!alive) return;
        setMode(null);
        setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const goLoginWithMode = async (m: Mode) => {
    if (booting || navBusy) return;
    setNavBusy(true);

    try {
      await AsyncStorage.setItem(KEY_MODE, m);
      setMode(m);

      navigation.reset({
        index: 0,
        routes: [{ name: "Login" as any, params: { mode: m } as any }],
      });
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Konnte Modus nicht speichern.");
    } finally {
      setTimeout(() => setNavBusy(false), 250);
    }
  };

  const goNext = async () => {
    if (booting || navBusy) return;
    if (!mode) return;
    await goLoginWithMode(mode);
  };

  const goArbeitsmodus = () => {
    if (booting || navBusy) return;

    navigation.reset({
      index: 0,
      routes: [{ name: "Arbeitsmodus" as any, params: { force: true } as any }],
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <View style={s.heroCard}>
          <View style={s.headerRow}>
            <View style={s.logoWrap}>
              <Image
                source={require("../../assets/icon.png")}
                style={s.logo}
                resizeMode="contain"
              />
            </View>

            <View style={s.headerTextWrap}>
              <Text style={s.brand}>RLC Bausoftware</Text>
              <Text style={s.sub}>mobile</Text>
            </View>

            <View style={s.modePill}>
              <Text style={s.modeTxt}>
                {booting
                  ? "..."
                  : mode === "NUR_APP"
                  ? "NUR_APP"
                  : mode === "SERVER_SYNC"
                  ? "SERVER"
                  : "MODE?"}
              </Text>
            </View>
          </View>

          <Text style={s.eyebrow}>Start</Text>
          <Text style={s.h1}>Arbeitsmodus wählen</Text>
          <Text style={s.muted}>
            {booting
              ? "Initialisiere…"
              : mode
              ? "Modus vorhanden. Du kannst direkt zu Login."
              : "Bitte wählen: Ohne Server oder Mit Server."}
          </Text>
        </View>

        <View style={s.card}>
          <View style={s.buttonStack}>
            <Pressable
              onPress={() => goLoginWithMode("NUR_APP")}
              disabled={booting || navBusy}
              style={({ pressed }) => [
                s.btnPrimary,
                (booting || navBusy) && s.btnDisabled,
                pressed && !(booting || navBusy) ? s.btnPressed : null,
              ]}
            >
              <Text style={s.btnPrimaryTxt}>Ohne Server (NUR_APP)</Text>
            </Pressable>

            <Pressable
              onPress={() => goLoginWithMode("SERVER_SYNC")}
              disabled={booting || navBusy}
              style={({ pressed }) => [
                s.btnSecondary,
                (booting || navBusy) && s.btnDisabled,
                pressed && !(booting || navBusy) ? s.btnPressed : null,
              ]}
            >
              <Text style={s.btnSecondaryTxt}>Mit Server (SERVER_SYNC)</Text>
            </Pressable>
          </View>

          <View style={s.divider} />

          <Pressable
            onPress={goNext}
            disabled={booting || navBusy || !mode}
            style={({ pressed }) => [
              s.btnGhost,
              (booting || navBusy || !mode) && s.btnDisabled,
              pressed && mode ? s.btnPressed : null,
            ]}
          >
            <Text style={s.btnGhostTxt}>{booting ? "..." : "Weiter (zu Login)"}</Text>
          </Pressable>

          <Pressable
            onPress={goArbeitsmodus}
            style={({ pressed }) => [
              s.linkBtn,
              (booting || navBusy) && s.btnDisabled,
              pressed && !(booting || navBusy) ? s.btnPressed : null,
            ]}
            disabled={booting || navBusy}
          >
            <Text style={s.linkTxt}>Arbeitsmodus ändern (optional)</Text>
          </Pressable>
        </View>

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Hinweis</Text>
          <Text style={s.infoText}>
            NUR_APP arbeitet lokal auf dem Gerät. SERVER_SYNC verbindet die App mit dem Server
            und synchronisiert Projekte und Dokumente.
          </Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerTxt}>© {new Date().getFullYear()} RLC Bausoftware</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  wrap: {
    flex: 1,
    padding: 16,
    paddingBottom: 22,
  },

  heroCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  logoWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    width: 34,
    height: 34,
  },

  headerTextWrap: {
    flex: 1,
  },

  brand: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
  },

  sub: {
    color: COLORS.sub,
    fontWeight: "800",
    marginTop: 2,
  },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  modeTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  eyebrow: {
    marginTop: 18,
    color: COLORS.accentDark,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  h1: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text,
  },

  muted: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 20,
  },

  card: {
    marginTop: 14,
    borderRadius: 20,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  buttonStack: {
    gap: 10,
  },

  btnPrimary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  btnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },

  btnSecondary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  btnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },

  btnGhost: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  btnGhostTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
  },

  linkBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  linkTxt: {
    color: COLORS.text,
    fontWeight: "900",
    textDecorationLine: "underline",
  },

  infoCard: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  infoTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
    marginBottom: 6,
  },

  infoText: {
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 20,
  },

  btnDisabled: {
    opacity: 0.55,
  },

  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },

  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },

  footerTxt: {
    color: COLORS.sub,
    fontWeight: "800",
  },
});


