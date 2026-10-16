import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ route }: Props) {
  const { projectId } = route.params;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Projekt</Text>
      <Text style={s.sub}>ID: {projectId}</Text>

      <Pressable style={s.card}>
        <Text style={s.cardTitle}>📄 Regiebericht</Text>
        <Text style={s.cardSub}>Arbeitsleistungen erfassen</Text>
      </Pressable>

      <Pressable style={s.card}>
        <Text style={s.cardTitle}>📦 Lieferschein</Text>
        <Text style={s.cardSub}>Material & Lieferungen</Text>
      </Pressable>

      <Pressable style={s.card}>
        <Text style={s.cardTitle}>📷 Fotos / Notizen</Text>
        <Text style={s.cardSub}>Dokumentation Baustelle</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: "800" },
  sub: { opacity: 0.6, marginBottom: 20 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardSub: { opacity: 0.6, marginTop: 4 },
});
