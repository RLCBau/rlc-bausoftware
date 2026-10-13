import React, { useLayoutEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { setSession, SessionRole } from "../storage/session";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Anmelden">;

const ROLES: { role: SessionRole; label: string }[] = [
  { role: "BAULEITER", label: "Bauleiter" },
  { role: "BUERO", label: "Büro" },
  { role: "KALKULATOR", label: "Kalkulator" },
  { role: "POLIER", label: "Polier / Vorarbeiter" },
  { role: "FAHRER", label: "Fahrer" },
  { role: "MITARBEITER", label: "Mitarbeiter" },
];

export default function AnmeldenScreen({ route, navigation }: Props) {
  const { projectId, title } = route.params;

  const [role, setRole] = useState<SessionRole>("MITARBEITER");
  const [name, setName] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({
      title: title || "Anmelden",
      headerStyle: {
        backgroundColor: COLORS.accentDark,
      },
      headerTitleStyle: {
        color: COLORS.card,
        fontWeight: "800",
      },
      headerTintColor: COLORS.card,
    });
  }, [title, navigation]);

  const roleLabel = useMemo(
    () => ROLES.find((x) => x.role === role)?.label || "",
    [role]
  );

  async function onSubmit() {
    const n = name.trim();
    if (!n) return Alert.alert("Anmelden", "Bitte Namen eingeben.");

    await setSession(projectId, { projectId, role, name: n });

    navigation.replace("ProjectHome", { projectId });
  }

  return (
    <View style={s.wrap}>
      <Text style={s.h1}>Anmelden</Text>
      <Text style={s.sub}>Projekt: {projectId}</Text>

      <View style={s.card}>
        <Text style={s.label}>Rolle</Text>
        <View style={s.roleGrid}>
          {ROLES.map((r) => {
            const active = r.role === role;
            return (
              <Pressable
                key={r.role}
                style={[s.roleBtn, active && s.roleBtnActive]}
                onPress={() => setRole(r.role)}
              >
                <Text
                  style={[s.roleTxt, active && s.roleTxtActive]}
                  numberOfLines={1}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.label}>Name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={COLORS.sub}
        />

        <Pressable style={s.submit} onPress={onSubmit}>
          <Text style={s.submitTxt}>Anmelden</Text>
          <Text style={s.submitSub}>Als: {roleLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.bg,
  },

  h1: {
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text,
  },

  sub: {
    color: COLORS.sub,
    marginTop: 6,
    marginBottom: 14,
    fontWeight: "700",
  },

  card: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  label: {
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 8,
    color: COLORS.text,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    fontWeight: "700",
  },

  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  roleBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card2,
    maxWidth: "48%",
  },

  roleBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },

  roleTxt: {
    fontWeight: "900",
    color: COLORS.text,
    opacity: 0.85,
  },

  roleTxtActive: {
    color: COLORS.accent,
    opacity: 1,
  },

  submit: {
    marginTop: 16,
    backgroundColor: COLORS.accentDark,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },

  submitTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 16,
  },

  submitSub: {
    color: COLORS.textLight,
    opacity: 0.75,
    marginTop: 4,
    fontWeight: "700",
  },
});








