// apps/mobile/src/screens/ArbeitsmodusScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { getAppMode, setAppMode, type AppMode } from "../lib/appMode";

type Props = NativeStackScreenProps<RootStackParamList, "Arbeitsmodus">;

export default function ArbeitsmodusScreen({ navigation, route }: Props) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      const force = !!(route as any)?.params?.force;

      // ✅ se arrivo da "Modus wechseln", NON fare auto-redirect
      if (force) {
        if (alive) setLoading(false);
        return;
      }

      const m = await getAppMode();
      if (m) {
        // ✅ reset stack: niente "salti" dovuti a stack vecchie
        navigation.reset({
          index: 0,
          routes: [{ name: "Login", params: { mode: m as any } }],
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

    // ✅ reset stack: Login è sempre la prima schermata dopo la scelta
    navigation.reset({
      index: 0,
      routes: [{ name: "Login", params: { mode: mode as any } }],
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <View style={s.header}>
          <Text style={s.h1}>Arbeitsmodus wählen</Text>
          <Text style={s.sub}>Du kannst später jederzeit wechseln.</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            s.card,
            loading && { opacity: 0.55 },
            pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
          ]}
          onPress={() => choose("NUR_APP")}
          disabled={loading}
        >
          <View style={s.rowTop}>
            <Text style={s.title}>Nur App (ohne Büro-Sync)</Text>
            <View style={s.pill}>
              <Text style={s.pillTxt}>NUR_APP</Text>
            </View>
          </View>
          <Text style={s.desc}>Daten bleiben auf dem Handy. E-Mail & KI inklusive.</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            s.card,
            loading && { opacity: 0.55 },
            pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
          ]}
          onPress={() => choose("SERVER_SYNC")}
          disabled={loading}
        >
          <View style={s.rowTop}>
            <Text style={s.title}>Mit Server / Büro-Sync</Text>
            <View style={s.pill}>
              <Text style={s.pillTxt}>SERVER</Text>
            </View>
          </View>
          <Text style={s.desc}>Inbox im Büro, Synchronisierung, Freigaben, Mehrgeräte.</Text>
        </Pressable>

        <View style={{ height: 8 }} />

        <View style={s.hintCard}>
          <Text style={s.hintTitle}>Hinweis</Text>
          <Text style={s.hintTxt}>
            Du kannst später im Menü wieder auf diese Seite kommen und den Modus ändern.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  wrap: { flex: 1, padding: 16, justifyContent: "center", gap: 12 },

  header: { marginBottom: 8 },
  h1: { fontSize: 26, fontWeight: "900", color: "#fff" },
  sub: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800" },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },

  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 16, fontWeight: "900", color: "#fff", flex: 1 },
  desc: { marginTop: 2, color: "rgba(255,255,255,0.72)", fontWeight: "800", lineHeight: 20 },

  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillTxt: { color: "rgba(255,255,255,0.9)", fontWeight: "900", fontSize: 12 },

  hintCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  hintTitle: { color: "#fff", fontWeight: "900" },
  hintTxt: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", lineHeight: 20 },
});
