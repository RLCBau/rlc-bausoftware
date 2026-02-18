import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView, Image, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

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

    // se non c’è mode ancora, l’utente deve scegliere qui sotto
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
        {/* Header row */}
        <View style={s.headerRow}>
          <View style={s.logoWrap}>
            <Image source={require("../../assets/icon.png")} style={s.logo} resizeMode="contain" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.brand}>RLC Bausoftware</Text>
            <Text style={s.sub}>mobile</Text>
          </View>

          <View style={s.modePill}>
            <Text style={s.modeTxt}>
              {booting ? "..." : mode === "NUR_APP" ? "NUR_APP" : mode === "SERVER_SYNC" ? "SERVER" : "MODE?"}
            </Text>
          </View>
        </View>

        {/* Main card */}
        <View style={s.card}>
          <Text style={s.h1}>Start</Text>

          <Text style={s.muted}>
            {booting
              ? "Initialisiere…"
              : mode
              ? "Modus vorhanden. Du kannst direkt zu Login."
              : "Bitte wählen: Ohne Server oder Mit Server."}
          </Text>

          <View style={{ height: 14 }} />

          {/* ✅ Scelta diretta (Start -> Login) */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => goLoginWithMode("NUR_APP")}
              disabled={booting || navBusy}
              style={({ pressed }) => [
                s.btn,
                (booting || navBusy) && { opacity: 0.55 },
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={s.btnTxt}>Ohne Server (NUR_APP)</Text>
            </Pressable>

            <Pressable
              onPress={() => goLoginWithMode("SERVER_SYNC")}
              disabled={booting || navBusy}
              style={({ pressed }) => [
                s.btn,
                (booting || navBusy) && { opacity: 0.55 },
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={s.btnTxt}>Mit Server (SERVER_SYNC)</Text>
            </Pressable>
          </View>

          <View style={{ height: 14 }} />

          {/* ✅ fallback: se già salvato un mode, “Weiter” porta a Login */}
          <Pressable
            onPress={goNext}
            disabled={booting || navBusy || !mode}
            style={({ pressed }) => [
              s.btnGhost,
              (booting || navBusy || !mode) && { opacity: 0.55 },
              pressed && mode ? { opacity: 0.9 } : null,
            ]}
          >
            <Text style={s.btnGhostTxt}>{booting ? "..." : "Weiter (zu Login)"}</Text>
          </Pressable>

          <View style={{ height: 10 }} />

          {/* opzionale: tieni ArbeitsmodusScreen se ti serve ancora */}
          <Pressable
            onPress={goArbeitsmodus}
            style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.9 }]}
            disabled={booting || navBusy}
          >
            <Text style={s.linkTxt}>Arbeitsmodus ändern (optional)</Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>© {new Date().getFullYear()} RLC Bausoftware</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  wrap: { flex: 1, padding: 16, paddingBottom: 22, gap: 12 },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 34, height: 34 },

  brand: { color: "#fff", fontWeight: "900", fontSize: 18 },
  sub: { color: "rgba(255,255,255,0.70)", fontWeight: "800", marginTop: 1 },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modeTxt: { color: "rgba(255,255,255,0.9)", fontWeight: "900", fontSize: 12 },

  card: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  h1: { fontSize: 34, fontWeight: "900", color: "#fff" },
  muted: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800" },

  btn: {
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnTxt: { color: "#fff", fontWeight: "900" },

  btnGhost: {
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostTxt: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },

  linkBtn: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  linkTxt: { color: "rgba(255,255,255,0.85)", fontWeight: "900", textDecorationLine: "underline" },

  footer: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  footerTxt: { color: "rgba(255,255,255,0.45)", fontWeight: "800" },
});
