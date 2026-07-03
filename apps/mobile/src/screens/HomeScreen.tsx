// apps/mobile/src/screens/HomeScreen.tsx
import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectHome">;

function looksLikeProjectCode(s: string) {
  return /^BA-\d{4}[-_]/i.test(String(s || "").trim());
}

export default function HomeScreen({ route, navigation }: Props) {
  const { projectId, projectCode } = route.params as any;
  const fsKey = projectCode || projectId;

  const displayProject = useMemo(() => {
    const id = String(projectId || "").trim();
    return looksLikeProjectCode(id) ? id : id || "—";
  }, [projectId]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.headerCard}>
          <Text style={s.eyebrow}>RLC Bausoftware</Text>
          <Text style={s.title}>Projekt</Text>
          <Text style={s.sub}>Schneller Zugriff auf die wichtigsten Baustellen-Funktionen.</Text>

          <View style={s.projectBadge}>
            <Text style={s.projectBadgeLabel}>Projekt-ID</Text>
            <Text style={s.projectBadgeValue}>{displayProject}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Pressable
            style={s.card}
            onPress={() => navigation.navigate("Regie", { projectId, projectCode: fsKey })}
          >
            <View style={s.cardIconWrap}>
              <Text style={s.cardIcon}>📄</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>Regiebericht</Text>
              <Text style={s.cardSub}>Arbeitsleistungen schnell erfassen und dokumentieren.</Text>
            </View>
            <Text style={s.cardArrow}>›</Text>
          </Pressable>

          <Pressable
            style={s.card}
            onPress={() => navigation.navigate("Lieferschein", { projectId, projectCode: fsKey })}
          >
            <View style={s.cardIconWrap}>
              <Text style={s.cardIcon}>📦</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>Lieferschein</Text>
              <Text style={s.cardSub}>Material, Lieferungen und Zuordnung zur Baustelle.</Text>
            </View>
            <Text style={s.cardArrow}>›</Text>
          </Pressable>

          <Pressable
            style={s.card}
            onPress={() => navigation.navigate("PhotosNotes", { projectId, projectCode: fsKey })}
          >
            <View style={s.cardIconWrap}>
              <Text style={s.cardIcon}>📷</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>Fotos / Notizen</Text>
              <Text style={s.cardSub}>Baustelle fotografisch und schriftlich festhalten.</Text>
            </View>
            <Text style={s.cardArrow}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },

  headerCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 18,
  },

  eyebrow: {
    color: COLORS.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  title: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text,
  },

  sub: {
    marginTop: 8,
    color: COLORS.sub,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },

  projectBadge: {
    marginTop: 16,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  projectBadgeLabel: {
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "800",
  },

  projectBadgeValue: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  section: {
    marginTop: 16,
    gap: 12,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 16,
  },

  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  cardIcon: {
    fontSize: 24,
  },

  cardBody: {
    flex: 1,
  },

  cardTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  cardSub: {
    marginTop: 5,
    color: COLORS.sub,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },

  cardArrow: {
    marginLeft: 12,
    color: COLORS.accent,
    fontSize: 28,
    fontWeight: "700",
  },
});



