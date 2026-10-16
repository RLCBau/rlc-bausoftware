import React, { useEffect, useState } from "react";
import { View, Text, Pressable, SafeAreaView, Image, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
import { getServerProfile } from "../lib/serverProfile";
type Props = NativeStackScreenProps<RootStackParamList, "Start">;
const KEY_MODE = "rlc_mobile_mode";
type Mode = "NUR_APP" | "SERVER_SYNC";
export default function StartScreen({
  navigation
}: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [booting, setBooting] = useState(true);
  const [navBusy, setNavBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = String((await AsyncStorage.getItem(KEY_MODE)) || "");
        const next = m === "NUR_APP" || m === "SERVER_SYNC" ? m as Mode : null;
        if (!alive) return;
        setMode(next);
      } catch {
        if (!alive) return;
        setMode(null);
      } finally {
        if (alive) setBooting(false);
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
      if (m === "SERVER_SYNC" && !(await getServerProfile())) {
        navigation.reset({
          index: 0,
          routes: [{ name: "ServerSetup" as any }],
        });
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{
          name: "Login" as any,
          params: {
            mode: m
          } as any
        }]
      });
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Konnte Modus nicht speichern.");
    } finally {
      setTimeout(() => setNavBusy(false), 250);
    }
  };
  const goNext = async () => {
    if (!mode) return;
    await goLoginWithMode(mode);
  };
  const goArbeitsmodus = () => {
    navigation.reset({
      index: 0,
      routes: [{
        name: "Arbeitsmodus" as any,
        params: {
          force: true
        } as any
      }]
    });
  };
  const modeLabel = mode === "SERVER_SYNC" ? "SERVER" : mode === "NUR_APP" ? "APP" : "MODE";
  return <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <View style={s.mainCard}>
          <View style={s.heroTop}>
            <View style={s.planLineA} />
            <View style={s.planLineB} />

            <View style={s.headerRow}>
              <View style={s.logoBox}>
                <Image source={require("../../assets/icon.png")} style={s.logo} resizeMode="contain" />
              </View>

              <View style={s.brandBox}>
                <Text style={s.brandRlc}>RLC</Text>
                <Text style={s.brandName}>Bausoftware</Text>
                <Text style={s.brandMobile}>mobile</Text>
              </View>

              <View style={s.serverPill}>
                <Text style={s.serverTxt}>{modeLabel}</Text>
              </View>
            </View>
          </View>

          <View style={s.bodyCard}>
            <Text style={s.eyebrow}>Start</Text>

            <Text style={s.title}>{"Arbeitsmodus\nw\u00e4hlen"}</Text>

            <Text style={s.subtitle}>
              {booting ? "Initialisiere..." : mode ? "Modus vorhanden. Du kannst direkt zu Login." : "Bitte Arbeitsmodus ausw\u00e4hlen."}
            </Text>

            <View style={s.stack}>
              <Pressable onPress={() => goLoginWithMode("NUR_APP")} disabled={booting || navBusy} style={({
              pressed
            }) => [s.primaryBtn, pressed ? s.pressed : null, booting || navBusy ? s.disabled : null]}>
                <Ionicons name="cloud-outline" size={22} color={COLORS.card} />
                <Text style={s.primaryTxt}>Ohne Server (NUR_APP)</Text>
              </Pressable>

              <Pressable onPress={() => goLoginWithMode("SERVER_SYNC")} disabled={booting || navBusy} style={({
              pressed
            }) => [s.secondaryBtn, pressed ? s.pressed : null, booting || navBusy ? s.disabled : null]}>
                <Ionicons name="sync-outline" size={23} color={NAVY} />
                <Text style={s.secondaryTxt}>Mit Server (SERVER_SYNC)</Text>
              </Pressable>
            </View>

            <View style={s.orRow}>
              <View style={s.orLine} />
              <Text style={s.orTxt}>oder</Text>
              <View style={s.orLine} />
            </View>

            <Pressable onPress={goNext} disabled={booting || navBusy || !mode} style={({
            pressed
          }) => [s.actionBtn, pressed ? s.pressed : null, booting || navBusy || !mode ? s.disabled : null]}>
              <Ionicons name="log-in-outline" size={23} color={NAVY} />
              <Text style={s.actionTxt}>Weiter (zu Login)</Text>
            </Pressable>

            <Pressable onPress={goArbeitsmodus} disabled={booting || navBusy} style={({
            pressed
          }) => [s.actionBtn, s.actionBtnSoft, pressed ? s.pressed : null, booting || navBusy ? s.disabled : null]}>
              <Ionicons name="settings-outline" size={23} color={NAVY} />
              <Text style={s.linkTxt}>{"Arbeitsmodus \u00e4ndern (optional)"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.infoCard}>
          <View style={s.infoIcon}>
            <Ionicons name="information" size={18} color={COLORS.card} />
          </View>

          <View style={s._inline1}>
            <Text style={s.infoTitle}>Hinweis</Text>
            <Text style={s.infoText}>
              {"NUR_APP arbeitet lokal auf dem Ger\u00e4t.\nSERVER_SYNC verbindet die App mit dem Server und synchronisiert Projekte und Dokumente."}
            </Text>
          </View>
        </View>

        <Text style={s.footer}>© 2026 RLC Bausoftware</Text>
      </View>
    </SafeAreaView>;
}
const NAVY = COLORS.navyDark;
const NAVY2 = COLORS.navy;
const BLUE = COLORS.accent;
const CYAN = COLORS.sky;
const BORDER = COLORS.border;
const s = createRlcStyles("StartScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    flex: 1,
    padding: 14,
    paddingBottom: 18
  },
  mainCard: {
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    shadowColor: COLORS.text,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 1
  },
  heroTop: {
    minHeight: 112,
    backgroundColor: BLUE,
    padding: 14,
    overflow: "hidden"
  },
  planLineA: {
    position: "absolute",
    right: 18,
    top: 20,
    width: 180,
    height: 110,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    transform: [{
      rotate: "-8deg"
    }]
  },
  planLineB: {
    position: "absolute",
    right: 54,
    bottom: -18,
    width: 150,
    height: 110,
    borderWidth: 1,
    borderColor: "rgba(10,132,255,0.22)",
    transform: [{
      rotate: "6deg"
    }]
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  logoBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.70)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  logo: {
    width: 44,
    height: 44
  },
  brandBox: {
    flex: 1,
    minWidth: 0
  },
  brandRlc: {
    color: COLORS.card,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "600"
  },
  brandName: {
    color: COLORS.card,
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "600"
  },
  brandMobile: {
    marginTop: 1,
    color: CYAN,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "600"
  },
  serverPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.80)"
  },
  serverTxt: {
    color: NAVY2,
    fontSize: 12,
    fontWeight: "600"
  },
  bodyCard: {
    padding: 16,
    backgroundColor: COLORS.card
  },
  eyebrow: {
    color: BLUE,
    fontSize: 15,
    fontWeight: "600"
  },
  title: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 31,
    fontWeight: "600",
    letterSpacing: -0.7
  },
  subtitle: {
    marginTop: 10,
    color: COLORS.sub,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400"
  },
  stack: {
    marginTop: 20,
    gap: 10
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 9,
    backgroundColor: BLUE,
    borderWidth: 1,
    borderColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  primaryTxt: {
    color: COLORS.card,
    fontSize: 15,
    fontWeight: "600"
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 9,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  secondaryTxt: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "600"
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 13
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER
  },
  orTxt: {
    color: COLORS.sub,
    fontSize: 13,
    fontWeight: "600"
  },
  actionBtn: {
    minHeight: 46,
    borderRadius: 9,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 9
  },
  actionBtnSoft: {
    backgroundColor: COLORS.card2
  },
  actionTxt: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600"
  },
  linkTxt: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.accentDark
  },
  infoCard: {
    marginTop: 14,
    borderRadius: 10,
    padding: 13,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    flexDirection: "row",
    gap: 10
  },
  infoIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  infoTitle: {
    color: NAVY2,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4
  },
  infoText: {
    color: COLORS.sub,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "400"
  },
  footer: {
    marginTop: 12,
    textAlign: "center",
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 12
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.9,
    transform: [{
      scale: 0.99
    }]
  },
  _inline1: {
    flex: 1
  }
});
