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
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "TeamRoles">;

function canEdit(role?: SessionRole) {
  return role === "BAULEITER" || role === "KALKULATOR" || role === "BUERO";
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
  const { projectId, projectCode: routeProjectCode, title } = route.params as any;

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || "Team / Rollen" });
  }, [title, navigation]);

  const [projectCode, setProjectCode] = useState<string>(
    String(routeProjectCode || "").trim()
  );

  const effectiveProjectCode = useMemo(() => {
    const fromRoute = String(routeProjectCode || "").trim();
    const fromState = String(projectCode || "").trim();
    const fromId = looksLikeProjectCode(String(projectId || "").trim())
      ? String(projectId || "").trim()
      : "";
    return fromRoute || fromState || fromId;
  }, [routeProjectCode, projectCode, projectId]);

  const effectiveProjectKey = useMemo(() => {
    return looksLikeProjectCode(effectiveProjectCode)
      ? effectiveProjectCode
      : String(projectId || "").trim();
  }, [effectiveProjectCode, projectId]);

  const [sessionRole, setSessionRole] = useState<SessionRole | undefined>();
  const editable = useMemo(() => canEdit(sessionRole), [sessionRole]);

  const isEditingRef = useRef(false);
  const lastLoadedKeyRef = useRef<string>("");

  const initialModel = useMemo(
    () =>
      ({
        bauleiter: { name: "" },
        polier: { name: "" },
        kalkulator: { name: "" },
        buero: { name: "" },
        fahrer: { name: "" },
        mitarbeiter: { name: "" },
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

  const patchModel = (fn: (m: any) => any) => {
    isEditingRef.current = true;
    setModel((m: any) => fn(m));
  };

  useEffect(() => {
    (async () => {
      try {
        if (looksLikeProjectCode(String(routeProjectCode || "").trim())) {
          setProjectCode(String(routeProjectCode).trim());
          return;
        }

        if (looksLikeProjectCode(String(projectId || "").trim())) {
          setProjectCode(String(projectId).trim());
          return;
        }

        const pk = await resolveProjectCode(projectId);
        if (looksLikeProjectCode(pk)) setProjectCode(pk);
      } catch {
        // ignore
      }
    })();
  }, [projectId, routeProjectCode]);

  useEffect(() => {
    (async () => {
      const s0 =
        (await getSession(effectiveProjectKey)) ||
        (looksLikeProjectCode(String(routeProjectCode || "").trim())
          ? await getSession(String(routeProjectCode).trim())
          : null) ||
        (await getSession(String(projectId).trim()));

      setSessionRole(s0?.role);

      const existing =
        (await getProjectRoles(effectiveProjectKey)) || (await getProjectRoles(projectId));

      if (
        existing &&
        lastLoadedKeyRef.current !== String(effectiveProjectKey) &&
        !isEditingRef.current
      ) {
        lastLoadedKeyRef.current = String(effectiveProjectKey);

        setModel((m: any) => ({
          ...(initialModel as any),
          ...m,
          ...existing,
        }));

        if (looksLikeProjectCode(effectiveProjectKey) && effectiveProjectKey !== projectId) {
          const alreadyOnCode = await getProjectRoles(effectiveProjectKey);
          if (!alreadyOnCode) {
            await setProjectRoles(effectiveProjectKey, existing as any);
          }
        }
      }

      if (!existing && lastLoadedKeyRef.current !== String(effectiveProjectKey)) {
        lastLoadedKeyRef.current = String(effectiveProjectKey);
        if (!isEditingRef.current) setModel((m: any) => ({ ...(initialModel as any), ...m }));
      }
    })();
  }, [effectiveProjectKey, projectId, initialModel]);

  async function onSave() {
    if (!editable) return;
    await setProjectRoles(effectiveProjectKey, normalize(model));
    isEditingRef.current = false;
    Alert.alert("Gespeichert", "Team/Rollen wurden offline gespeichert.");
  }

  const bauleiterMissing = !(model.bauleiter?.name || "").trim();

  const headerCode = looksLikeProjectCode(effectiveProjectCode)
    ? effectiveProjectCode
    : "-";
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
            showsVerticalScrollIndicator={false}
          >
            <View style={s.header}>
              <View style={s.headerRow}>
                <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
                  <Text style={s.backTxt}>Zurück</Text>
                </Pressable>

                <View style={{ flex: 1 }} />

                <View style={[s.modePill, editable ? s.pillOk : s.pillNeutral]}>
                  <Text style={[s.modePillTxt, editable && s.modePillTxtOk]}>{modeLabel}</Text>
                </View>
              </View>

              <Text style={s.brandTop}>RLC Bausoftware</Text>
              <Text style={s.brandSub}>Team / Rollen</Text>

              <Text style={s.h1}>Projektrollen</Text>

              <View style={s.pillRow}>
                <View style={s.badge}>
                  <Text style={s.badgeTxt} numberOfLines={1}>
  ID: <Text style={s.badgeTxtStrong}>{String(projectId)}</Text>
</Text>
                </View>
                <View style={s.badge}>
                  <Text style={s.badgeTxt} numberOfLines={1}>
                    ID: <Text style={s.badgeTxtStrong}>{String(projectId)}</Text>
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

                <Row label="Kalkulator">
                  <RoleInput
                    editable={editable}
                    value={(model as any).kalkulator?.name || ""}
                    onChangeText={(t: string) =>
                      patchModel((m: any) => ({
                        ...m,
                        kalkulator: { ...(m.kalkulator || {}), name: t },
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

              {editable ? (
                <Pressable style={s.primaryBtn} onPress={onSave}>
                  <Text style={s.primaryBtnTxt}>Speichern (offline)</Text>
                </Pressable>
              ) : (
                <View style={s.readOnlyBox}>
                  <Text style={s.readOnlyTxt}>
                    Nur Ansicht: Änderungen sind nur für Bauleiter/Büro/Kalkulator möglich.
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


    kalkulator: trim((x as any).kalkulator?.name)
      ? { ...((x as any).kalkulator || {}), name: trim((x as any).kalkulator?.name) }
      : undefined,

    buero: trim((x as any).buero?.name)
      ? { ...((x as any).buero || {}), name: trim((x as any).buero?.name) }
      : undefined,

    polier: trim((x as any).polier?.name)
      ? { ...((x as any).polier || {}), name: trim((x as any).polier?.name) }
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
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  bg: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  content: {
    paddingBottom: 28,
  },

  header: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    padding: 16,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  backTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  brandTop: {
    color: COLORS.accentDark,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  brandSub: {
    marginTop: 2,
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "800",
  },

  h1: {
    marginTop: 10,
    fontSize: 32,
    fontWeight: "900",
    color: COLORS.text,
  },

  pillRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
    maxWidth: "100%",
  },

  badgeTxt: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.text,
  },

  badgeTxtStrong: {
    fontWeight: "900",
    color: COLORS.text,
  },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  pillOk: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successSoft,
  },

  pillNeutral: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  modePillTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  modePillTxtOk: {
    color: COLORS.success,
  },

  warnBox: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningBg,
  },

  warnTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  warnText: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  sectionCard: {
    marginTop: 12,
    borderRadius: 20,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  sectionAccent: {
    width: 8,
    height: 22,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    flex: 1,
  },

  row: {
    marginBottom: 14,
  },

  label: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.text,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }),
    fontWeight: "800",
    color: COLORS.text,
    fontSize: 14,
  },

  inputMultiline: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
  },

  inputDisabled: {
    backgroundColor: COLORS.card2,
    color: COLORS.sub,
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: COLORS.accent,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  primaryBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 14,
  },

  readOnlyBox: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  readOnlyTxt: {
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 18,
  },
});





