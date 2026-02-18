import React, { useLayoutEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { setSession, SessionRole } from "../storage/session";

type Props = NativeStackScreenProps<RootStackParamList, "Anmelden">;

const ROLES: { role: SessionRole; label: string }[] = [
  { role: "BAULEITER", label: "Bauleiter" },
  { role: "ABRECHNUNG", label: "Abrechnung" },
  { role: "BUERO", label: "Büro" },
  { role: "POLIER", label: "Polier / Vorarbeiter" },
  { role: "VERMESSUNG", label: "Vermessung" },
  { role: "FAHRER", label: "Fahrer" },
  { role: "MITARBEITER", label: "Mitarbeiter" },
];

export default function AnmeldenScreen({ route, navigation }: Props) {
  const { projectId, title } = route.params;

  const [role, setRole] = useState<SessionRole>("MITARBEITER");
  const [name, setName] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || "Anmelden" });
  }, [title, navigation]);

  const roleLabel = useMemo(
    () => ROLES.find((x) => x.role === role)?.label || "",
    [role]
  );

  async function onSubmit() {
    const n = name.trim();
    if (!n) return Alert.alert("Anmelden", "Bitte Namen eingeben.");

    await setSession(projectId, { projectId, role, name: n });

    // zurück ins Projekt
    navigation.replace("ProjectHome", { projectId });
  }

  return (
    <View style={s.wrap}>
      <Text style={s.h1}>Anmelden</Text>
      <Text style={s.sub}>Projekt: {projectId}</Text>

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
              <Text style={[s.roleTxt, active && s.roleTxtActive]} numberOfLines={1}>
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
        placeholder="z.B. Roberto"
      />

      <Pressable style={s.submit} onPress={onSubmit}>
        <Text style={s.submitTxt}>Anmelden</Text>
        <Text style={s.submitSub}>Als: {roleLabel}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  h1: { fontSize: 26, fontWeight: "900" },
  sub: { opacity: 0.6, marginTop: 6, marginBottom: 14 },

  label: { fontWeight: "900", marginTop: 10, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
  },

  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roleBtn: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "white",
    maxWidth: "48%",
  },
  roleBtnActive: { borderColor: "#111" },
  roleTxt: { fontWeight: "900", opacity: 0.85 },
  roleTxtActive: { opacity: 1 },

  submit: {
    marginTop: 16,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitTxt: { color: "#fff", fontWeight: "900", fontSize: 16 },
  submitSub: { color: "#fff", opacity: 0.7, marginTop: 4, fontWeight: "700" },
});
