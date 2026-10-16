/// apps/mobile/src/screens/ArbeitsmodusScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, SafeAreaView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { getAppMode, setAppMode, type AppMode } from "../lib/appMode";
import { getServerProfile } from "../lib/serverProfile";
import { COLORS, createRlcStyles } from "../ui/theme";
type Props = NativeStackScreenProps<RootStackParamList, "Arbeitsmodus">;
export default function ArbeitsmodusScreen({
  navigation,
  route
}: Props) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const force = !!(route as any)?.params?.force;
      if (force) {
        if (alive) setLoading(false);
        return;
      }
      const m = await getAppMode();
      if (m) {
        if (m === "SERVER_SYNC" && !(await getServerProfile())) {
          navigation.reset({
            index: 0,
            routes: [{ name: "ServerSetup" as any }]
          });
          return;
        }
        navigation.reset({
          index: 0,
          routes: [{
            name: "Login",
            params: {
              mode: m as any
            }
          }]
        });
        return;
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [navigation, route]);
  async function choose(mode: AppMode) {
    await setAppMode(mode);
    if (mode === "SERVER_SYNC") {
      navigation.reset({
        index: 0,
        routes: [{ name: "ServerSetup" as any }]
      });
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{
        name: "Login",
        params: {
          mode: mode as any
        }
      }]
    });
  }
  return <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <View style={s.heroCard}>
          <View style={s.heroBlueprintA} />
          <View style={s.heroBlueprintB} />
          <Text style={s.heroEyebrow}>RLC Bausoftware</Text>
          <Text style={s.heroH1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>Arbeitsmodus wählen</Text>
          <View style={s.heroAccentLine} />
          <Text style={s.heroSub}>Du kannst später jederzeit wechseln.</Text>
        </View>

        <Pressable style={({
        pressed
      }) => [s.card, s.cardLocal, loading && s.disabled, pressed && s.pressed]} onPress={() => choose("NUR_APP")} disabled={loading}>
          <View style={s.rowTop}>
            <Text style={s.title}>Nur App (ohne Büro-Sync)</Text>
            <View style={s.pill}>
              <Text style={s.pillTxt}>NUR_APP</Text>
            </View>
          </View>
          <Text style={s.desc}>
            Daten bleiben auf dem Handy. E-Mail & KI inklusive.
          </Text>
        </Pressable>

        <Pressable style={({
        pressed
      }) => [s.card, s.cardServer, loading && s.disabled, pressed && s.pressed]} onPress={() => choose("SERVER_SYNC")} disabled={loading}>
          <View style={s.rowTop}>
            <Text style={s.title}>Mit Server / Büro-Sync</Text>
            <View style={[s.pill, s.pillStrong]}>
              <Text style={s.pillTxtStrong}>SERVER</Text>
            </View>
          </View>
          <Text style={s.desc}>
            Inbox im Büro, Synchronisierung, Freigaben, Mehrgeräte.
          </Text>
        </Pressable>

        <View style={s._inline1} />

        <View style={s.hintCard}>
          <Text style={s.hintTitle}>Hinweis</Text>
          <Text style={s.hintTxt}>
            Du kannst später im Menü wieder auf diese Seite kommen und den Modus
            ändern.
          </Text>
        </View>
      </View>
    </SafeAreaView>;
}
const s = createRlcStyles("ArbeitsmodusScreen", {
  // RLC_ARBEITSMODUS_PREMIUM_V1
  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    backgroundColor: COLORS.navyDark,
    borderWidth: 1,
    borderColor: COLORS.navy
  },
  heroBlueprintA: {
    position: "absolute",
    right: -34,
    top: 22,
    width: 170,
    height: 95,
    borderWidth: 1,
    borderColor: "rgba(45,154,255,0.22)",
    transform: [{
      rotate: "-8deg"
    }]
  },
  heroBlueprintB: {
    position: "absolute",
    right: 34,
    bottom: -24,
    width: 130,
    height: 88,
    borderWidth: 1,
    borderColor: "rgba(45,154,255,0.18)",
    transform: [{
      rotate: "7deg"
    }]
  },
  heroEyebrow: {
    color: COLORS.sky,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8
  },
  heroAccentLine: {
    width: 42,
    height: 4,
    borderRadius: 14,
    backgroundColor: COLORS.sky,
    marginTop: 8,
    marginBottom: 12
  },
  heroH1: {
    color: COLORS.card,
    fontSize: 18,
    lineHeight: 31,
    fontWeight: "600",
    letterSpacing: -1.0
  },
  heroSub: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "600"
  },
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    flex: 1,
    padding: 14,
    justifyContent: "center",
    gap: 12
  },
  header: {
    marginBottom: 10
  },
  h1: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text
  },
  sub: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600"
  },
  card: {
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    gap: 8,
    ...({
      shadowColor: COLORS.text,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: {
        width: 0,
        height: 6
      },
      elevation: 2
    } as any)
  },
  cardLocal: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border
  },
  cardServer: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.border
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1
  },
  desc: {
    marginTop: 2,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  pillTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 12
  },
  pillStrong: {
    borderColor: COLORS.accentDark,
    backgroundColor: COLORS.accent
  },
  pillTxtStrong: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 12
  },
  hintCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  hintTitle: {
    color: COLORS.text,
    fontWeight: "600"
  },
  hintTxt: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.92,
    transform: [{
      scale: 0.995
    }]
  },
  _inline1: {
    height: 8
  }
});
