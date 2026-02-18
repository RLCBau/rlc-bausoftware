// apps/mobile/src/screens/TeamRolesScreen.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  SafeAreaView,
  KeyboardAvoidingView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { getProjectRoles, setProjectRoles, ProjectRoles } from "../storage/projectMeta";
import { getSession, SessionRole } from "../storage/session";
import { resolveProjectCode, looksLikeProjectCode } from "../lib/api";

type Props = NativeStackScreenProps<RootStackParamList, "TeamRoles">;

function canEdit(role?: SessionRole) {
  return role === "BAULEITER" || role === "ABRECHNUNG" || role === "BUERO";
}

/**
 * ✅ STABILE Input-Komponente (fuori dal render!)
 * Motivo: se definita dentro TeamRolesScreen, cambia identità ad ogni render => remount => "una sola lettera".
 */
function RoleInput({
  editable,
  multiline,
  style,
  ...rest
}: any & { editable: boolean }) {
  return (
    <TextInput
      {...rest}
      editable={editable}
      selectTextOnFocus={editable}
      placeholderTextColor="rgba(11,23,32,0.45)"
      autoCorrect={false}
      blurOnSubmit={false}
      returnKeyType={multiline ? "default" : "done"}
      multiline={multiline}
      style={[
        s.input,
        !editable && s.inputDisabled,
        multiline && s.inputMultiline,
        style,
      ]}
    />
  );
}

export default function TeamRolesScreen({ route, navigation }: Props) {
  const { projectId, title } = route.params;

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || "Team / Rollen" });
  }, [title, navigation]);

  // ✅ resolve UUID -> BA-... (for display + correct storage key)
  const [projectCode, setProjectCode] = useState<string>("");
  const effectiveProjectKey = useMemo(() => {
    const c = String(projectCode || "").trim();
    return looksLikeProjectCode(c) ? c : String(projectId || "").trim();
  }, [projectCode, projectId]);

  const [sessionRole, setSessionRole] = useState<SessionRole | undefined>();
  const editable = useMemo(() => canEdit(sessionRole), [sessionRole]);

  // ✅ evita che una load async sovrascriva mentre l’utente scrive
  const isEditingRef = useRef(false);
  const lastLoadedKeyRef = useRef<string>("");

  const initialModel = useMemo(
    () =>
      ({
        bauleiter: { name: "" },
        polier: { name: "" },
        vermessung: { name: "" },
        abrechnung: { name: "" },
        buero: { name: "" }, // ✅ neu
        fahrer: { name: "" }, // ✅ neu
        mitarbeiter: { name: "" }, // ✅ neu
        emails: {
          bauleiter: "",
          buero: "",
          extern: "",
        },

        auftraggeber: {
          company: "",
          contactName: "",
          phone: "",
          email: "",
          note: "",
        },
        ansprechpartnerIntern: {
          einkauf: { name: "" },
          lager: { name: "" },
          logistik: { name: "" },
        },
      } as any),
    []
  );

  const [model, setModel] = useState<ProjectRoles>(initialModel as any);

  // helper: safe patch that marks editing
  const patchModel = (fn: (m: any) => any) => {
    isEditingRef.current = true;
    setModel((m: any) => fn(m));
  };

  useEffect(() => {
    (async () => {
      // resolve code (best effort)
      try {
        const pk = await resolveProjectCode(projectId);
        if (looksLikeProjectCode(pk)) setProjectCode(pk);
      } catch {
        // ignore
      }
    })();
  }, [projectId]);

  useEffect(() => {
    (async () => {
      // session: prefer resolved key, fallback UUID
      const s = (await getSession(effectiveProjectKey)) || (await getSession(projectId));
      setSessionRole(s?.role);

      // roles: prefer resolved key, fallback UUID; migrate to resolved key if needed
      const existing =
        (await getProjectRoles(effectiveProjectKey)) || (await getProjectRoles(projectId));

      // ✅ carica solo una volta per projectKey (e NON durante editing)
      if (
        existing &&
        lastLoadedKeyRef.current !== String(effectiveProjectKey) &&
        !isEditingRef.current
      ) {
        lastLoadedKeyRef.current = String(effectiveProjectKey);

        // merge con base per evitare campi mancanti
        setModel((m: any) => ({
          ...(initialModel as any),
          ...m,
          ...existing,
        }));

        // migrate: if we loaded from UUID but now have BA-code, persist under BA-code
        if (looksLikeProjectCode(effectiveProjectKey) && effectiveProjectKey !== projectId) {
          const alreadyOnCode = await getProjectRoles(effectiveProjectKey);
          if (!alreadyOnCode) {
            await setProjectRoles(effectiveProjectKey, existing as any);
          }
        }
      }

      // ✅ se non esiste nulla, assicura almeno base model (solo se mai caricato)
      if (!existing && lastLoadedKeyRef.current !== String(effectiveProjectKey)) {
        lastLoadedKeyRef.current = String(effectiveProjectKey);
        // non sovrascrivere se l’utente sta già scrivendo
        if (!isEditingRef.current) setModel((m: any) => ({ ...(initialModel as any), ...m }));
      }
    })();
  }, [effectiveProjectKey, projectId, initialModel]);

  async function onSave() {
    if (!editable) return;
    await setProjectRoles(effectiveProjectKey, normalize(model));
    isEditingRef.current = false; // ✅ editing concluso
    Alert.alert("Gespeichert", "Team/Rollen wurden offline gespeichert.");
  }

  const bauleiterMissing = !(model.bauleiter?.name || "").trim();

  const headerCode = looksLikeProjectCode(projectCode) ? projectCode : "-";
  const modeLabel = editable ? "Bearbeiten" : "Nur Ansicht";

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.bg}>
          <ScrollView
            style={s.screen}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* ===== Header (ProjectHome/Projects style) ===== */}
            <View style={s.header}>
              <View style={s.headerRow}>
                <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
                  <Text style={s.backTxt}>Zurück</Text>
                </Pressable>

                <View style={{ flex: 1 }} />

                <View style={[s.modePill, editable ? s.pillOk : s.pillNeutral]}>
                  <Text style={s.modePillTxt}>{modeLabel}</Text>
                </View>
              </View>

              <Text style={s.brandTop}>RLC Bausoftware</Text>
              <Text style={s.brandSub}>Team / Rollen</Text>

              <Text style={s.h1}>Projekt</Text>
              <View style={s.pillRow}>
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>
                    Code: <Text style={{ fontWeight: "900" }}>{headerCode}</Text>
                  </Text>
                </View>
                <View style={s.badge}>
                  <Text style={s.badgeTxt} numberOfLines={1}>
                    ID: <Text style={{ fontWeight: "900" }}>{String(projectId)}</Text>
                  </Text>
                </View>
              </View>

              {bauleiterMissing ? (
                <View style={s.warnBox}>
                  <Text style={s.warnTitle}>Bauleiter fehlt</Text>
                  <Text style={s.warnText}>
                    Bitte einen Bauleiter setzen (Pflicht), damit Team/Workflow sauber bleibt.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={s.body}>
              <Section title="Interne Rollen">
                <Row label="Bauleiter (Pflicht)">
                  <RoleInput
                    editable={editable}
                    value={model.bauleiter?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        bauleiter: { ...(m.bauleiter || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Abrechnung">
                  <RoleInput
                    editable={editable}
                    value={(model as any).abrechnung?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        abrechnung: { ...(m.abrechnung || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Büro">
                  <RoleInput
                    editable={editable}
                    value={(model as any).buero?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        buero: { ...(m.buero || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Polier / Vorarbeiter">
                  <RoleInput
                    editable={editable}
                    value={model.polier?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        polier: { ...(m.polier || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Vermessung">
                  <RoleInput
                    editable={editable}
                    value={model.vermessung?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        vermessung: { ...(m.vermessung || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Fahrer">
                  <RoleInput
                    editable={editable}
                    value={(model as any).fahrer?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        fahrer: { ...(m.fahrer || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Mitarbeiter">
                  <RoleInput
                    editable={editable}
                    value={(model as any).mitarbeiter?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        mitarbeiter: { ...(m.mitarbeiter || {}), name: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>
              </Section>

              <Section title="Auftraggeber / Ansprechpartner">
                <Row label="Firma / Kunde">
                  <RoleInput
                    editable={editable}
                    value={model.auftraggeber?.company || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        auftraggeber: { ...(m.auftraggeber || {}), company: t },
                      }))
                    }
                    placeholder="z.B. Gemeinde XY"
                  />
                </Row>

                <Row label="Ansprechpartner">
                  <RoleInput
                    editable={editable}
                    value={model.auftraggeber?.contactName || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        auftraggeber: { ...(m.auftraggeber || {}), contactName: t },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Telefon">
                  <RoleInput
                    editable={editable}
                    value={model.auftraggeber?.phone || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        auftraggeber: { ...(m.auftraggeber || {}), phone: t },
                      }))
                    }
                    placeholder="+49..."
                  />
                </Row>

                <Row label="E-Mail">
                  <RoleInput
                    editable={editable}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={model.auftraggeber?.email || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        auftraggeber: { ...(m.auftraggeber || {}), email: t },
                      }))
                    }
                    placeholder="mail@example.de"
                  />
                </Row>

                <Row label="Notiz">
                  <RoleInput
                    editable={editable}
                    value={model.auftraggeber?.note || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        auftraggeber: { ...(m.auftraggeber || {}), note: t },
                      }))
                    }
                    placeholder="Kurz notieren..."
                    multiline
                    style={{ height: 110, textAlignVertical: "top" }}
                  />
                </Row>
              </Section>

              <Section title="Weitere interne Ansprechpartner (optional)">
                <Row label="Einkauf">
                  <RoleInput
                    editable={editable}
                    value={model.ansprechpartnerIntern?.einkauf?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        ansprechpartnerIntern: {
                          ...(m.ansprechpartnerIntern || {}),
                          einkauf: {
                            ...((m.ansprechpartnerIntern || {}).einkauf || {}),
                            name: t,
                          },
                        },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Lager">
                  <RoleInput
                    editable={editable}
                    value={model.ansprechpartnerIntern?.lager?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        ansprechpartnerIntern: {
                          ...(m.ansprechpartnerIntern || {}),
                          lager: {
                            ...((m.ansprechpartnerIntern || {}).lager || {}),
                            name: t,
                          },
                        },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>

                <Row label="Logistik">
                  <RoleInput
                    editable={editable}
                    value={model.ansprechpartnerIntern?.logistik?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m) => ({
                        ...m,
                        ansprechpartnerIntern: {
                          ...(m.ansprechpartnerIntern || {}),
                          logistik: {
                            ...((m.ansprechpartnerIntern || {}).logistik || {}),
                            name: t,
                          },
                        },
                      }))
                    }
                    placeholder="Name"
                  />
                </Row>
              </Section>

              {/* ✅ Emails */}
              <Section title="E-Mails (Versand / Ansprechpartner)">
                <Row label="Bauleiter – E-Mail">
                  <RoleInput
                    editable={editable}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={(model as any).emails?.bauleiter || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        emails: { ...(m.emails || {}), bauleiter: t },
                      }))
                    }
                    placeholder="bauleiter@example.de"
                  />
                </Row>

                <Row label="Büro – E-Mail">
                  <RoleInput
                    editable={editable}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={(model as any).emails?.buero || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        emails: { ...(m.emails || {}), buero: t },
                      }))
                    }
                    placeholder="buero@example.de"
                  />
                </Row>

                <Row label="Extern / Prüfer – E-Mail">
                  <RoleInput
                    editable={editable}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={(model as any).emails?.extern || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        emails: { ...(m.emails || {}), extern: t },
                      }))
                    }
                    placeholder="extern@example.de"
                  />
                </Row>
              </Section>

              {/* ===== Footer Action ===== */}
              {editable ? (
                <Pressable style={s.primaryBtn} onPress={onSave}>
                  <Text style={s.primaryBtnTxt}>Speichern (offline)</Text>
                </Pressable>
              ) : (
                <View style={s.readOnlyBox}>
                  <Text style={s.readOnlyTxt}>
                    Nur Ansicht: Änderungen sind nur für Bauleiter/Abrechnung/Büro möglich.
                  </Text>
                </View>
              )}

              <View style={{ height: 20 }} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function normalize(x: ProjectRoles): ProjectRoles {
  const trim = (v?: string) => (v || "").trim();

  const out: any = {
    bauleiter: trim((x as any).bauleiter?.name)
      ? { ...((x as any).bauleiter || {}), name: trim((x as any).bauleiter?.name) }
      : undefined,

    abrechnung: trim((x as any).abrechnung?.name)
      ? { ...((x as any).abrechnung || {}), name: trim((x as any).abrechnung?.name) }
      : undefined,

    buero: trim((x as any).buero?.name)
      ? { ...((x as any).buero || {}), name: trim((x as any).buero?.name) }
      : undefined,

    polier: trim((x as any).polier?.name)
      ? { ...((x as any).polier || {}), name: trim((x as any).polier?.name) }
      : undefined,

    vermessung: trim((x as any).vermessung?.name)
      ? { ...((x as any).vermessung || {}), name: trim((x as any).vermessung?.name) }
      : undefined,

    fahrer: trim((x as any).fahrer?.name)
      ? { ...((x as any).fahrer || {}), name: trim((x as any).fahrer?.name) }
      : undefined,

    mitarbeiter: trim((x as any).mitarbeiter?.name)
      ? { ...((x as any).mitarbeiter || {}), name: trim((x as any).mitarbeiter?.name) }
      : undefined,

    auftraggeber:
      trim((x as any).auftraggeber?.company) ||
      trim((x as any).auftraggeber?.contactName) ||
      trim((x as any).auftraggeber?.phone) ||
      trim((x as any).auftraggeber?.email) ||
      trim((x as any).auftraggeber?.note)
        ? {
            company: trim((x as any).auftraggeber?.company) || undefined,
            contactName: trim((x as any).auftraggeber?.contactName) || undefined,
            phone: trim((x as any).auftraggeber?.phone) || undefined,
            email: trim((x as any).auftraggeber?.email) || undefined,
            note: trim((x as any).auftraggeber?.note) || undefined,
          }
        : undefined,

    emails:
      trim((x as any).emails?.bauleiter) ||
      trim((x as any).emails?.buero) ||
      trim((x as any).emails?.extern)
        ? {
            bauleiter: trim((x as any).emails?.bauleiter) || undefined,
            buero: trim((x as any).emails?.buero) || undefined,
            extern: trim((x as any).emails?.extern) || undefined,
          }
        : undefined,

    ansprechpartnerIntern: (x as any).ansprechpartnerIntern,
  };

  return out as ProjectRoles;
}

function Section({ title, children }: any) {
  return (
    <View style={s.sectionCard}>
      <View style={s.sectionHeader}>
        <View style={s.sectionAccent} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, children }: any) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  bg: { flex: 1, backgroundColor: "#0B1720" },

  screen: { flex: 1, backgroundColor: "#0B1720" },
  content: { paddingBottom: 26 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "#0B1720",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },

  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backTxt: { color: "#fff", fontWeight: "900" },

  brandTop: { color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: "800" },
  brandSub: { color: "rgba(255,255,255,0.60)", marginTop: 2, fontSize: 12, fontWeight: "800" },
  h1: { marginTop: 10, fontSize: 34, fontWeight: "900", color: "#fff" },

  pillRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
    maxWidth: "100%",
  },
  badgeTxt: { fontWeight: "900", color: "rgba(255,255,255,0.90)", fontSize: 12 },

  modePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  pillOk: { borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.14)" },
  pillNeutral: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modePillTxt: { fontWeight: "900", fontSize: 12, color: "rgba(255,255,255,0.90)" },

  warnBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(234,88,12,0.35)",
    backgroundColor: "rgba(234,88,12,0.14)",
    borderRadius: 18,
    padding: 12,
  },
  warnTitle: { fontWeight: "900", color: "#FDBA74" },
  warnText: { marginTop: 6, fontWeight: "800", color: "rgba(255,255,255,0.78)", lineHeight: 18 },

  body: { paddingHorizontal: 16, paddingTop: 12 },

  sectionCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionAccent: { width: 6, height: 22, borderRadius: 6, backgroundColor: "#2563EB" },
  sectionTitle: { fontWeight: "900", fontSize: 16, color: "#0B1720" },

  row: { marginBottom: 12 },
  label: { fontWeight: "900", marginBottom: 6, opacity: 0.75, color: "#0B1720" },

  input: {
    borderWidth: 1,
    borderColor: "rgba(11,23,32,0.14)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "900",
    color: "#0B1720",
    backgroundColor: "#fff",
  },
  inputMultiline: { paddingTop: 12, paddingBottom: 12 },
  inputDisabled: { backgroundColor: "#F3F4F6", opacity: 0.92 },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#111",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "900" },

  readOnlyBox: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  readOnlyTxt: { opacity: 0.75, fontWeight: "900", color: "#0B1720" },
});
