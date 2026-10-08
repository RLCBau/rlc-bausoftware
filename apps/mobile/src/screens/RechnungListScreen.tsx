import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "RechnungList">;

type RechnungRow = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  qty: string;
  ep: string;
};

type AbschlagItem = {
  id: string;
  nummer: number;
  datum: string;
  betrag: number;
  prozent?: number;
  note?: string;
  pdfUri?: string;
  createdAt?: number;
};

type RechnungDoc = {
  id: string;
  sourceType?: "FREE" | "ANGEBOT" | "MENGEN";

  angebotId?: string | null;
  mengenId?: string | null;

  rechnungNr: string;
  datum: string;
  leistungszeitraum?: string;

  customerName: string;
  address?: string;
  email?: string;
  phone?: string;

  iban?: string;
  bic?: string;
  bank?: string;
  owner?: string;

  steuerNr?: string;
  ustId?: string;

  zahlungsziel?: string;
  mwstPct?: string;

  note?: string;
  pdfUri?: string;

  rows: RechnungRow[];
  abschlaege?: AbschlagItem[];

  netto?: number;
  mwst?: number;
  brutto?: number;

  createdAt?: string | number;
  updatedAt?: string | number;
};

const KEY_PREFIX = "rlc_rechnung_list:";

function storageKey(projectCode: string) {
  return `${KEY_PREFIX}${projectCode}`;
}

function num(v: string | number | null | undefined) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}

function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeAbschlag(input: any, idx: number): AbschlagItem {
  return {
    id: String(input?.id || `${Date.now()}_${idx}`),
    nummer: Number(input?.nummer || idx + 1),
    datum: String(input?.datum || ""),
    betrag: Number(input?.betrag || 0),
    prozent:
      input?.prozent === null || input?.prozent === undefined
        ? undefined
        : Number(input.prozent || 0),
    note: String(input?.note || ""),
    pdfUri: String(input?.pdfUri || ""),
    createdAt: Number(input?.createdAt || Date.now()),
  };
}

function normalizeDoc(input: any): RechnungDoc {
  return {
    id: String(input?.id || ""),
    sourceType: input?.sourceType || "FREE",

    angebotId: input?.angebotId || null,
    mengenId: input?.mengenId || null,

    rechnungNr: String(input?.rechnungNr || ""),
    datum: String(input?.datum || ""),
    leistungszeitraum: String(input?.leistungszeitraum || ""),

    customerName: String(input?.customerName || ""),
    address: String(input?.address || ""),
    email: String(input?.email || ""),
    phone: String(input?.phone || ""),

    iban: String(input?.iban || ""),
    bic: String(input?.bic || ""),
    bank: String(input?.bank || ""),
    owner: String(input?.owner || ""),

    steuerNr: String(input?.steuerNr || ""),
    ustId: String(input?.ustId || ""),

    zahlungsziel: String(input?.zahlungsziel || ""),
    mwstPct: String(input?.mwstPct || "19"),

    note: String(input?.note || ""),
    pdfUri: String(input?.pdfUri || ""),
    rows: Array.isArray(input?.rows) ? input.rows : [],
    abschlaege: Array.isArray(input?.abschlaege)
      ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i))
      : [],

    netto: typeof input?.netto === "number" ? input.netto : undefined,
    mwst: typeof input?.mwst === "number" ? input.mwst : undefined,
    brutto: typeof input?.brutto === "number" ? input.brutto : undefined,

    createdAt: input?.createdAt || "",
    updatedAt: input?.updatedAt || "",
  };
}

function calcNetto(rows: RechnungRow[]) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, r) => {
    return sum + num(r?.qty) * num(r?.ep);
  }, 0);
}

function calcBrutto(doc: RechnungDoc) {
  if (typeof doc?.brutto === "number" && Number.isFinite(doc.brutto)) {
    return doc.brutto;
  }
  const netto = calcNetto(doc.rows || []);
  const mwstPct = num(doc?.mwstPct || "19");
  return netto + (netto * mwstPct) / 100;
}

function calcAbschlagSum(doc: RechnungDoc) {
  return (doc.abschlaege || []).reduce(
    (sum, a) => sum + Number(a?.betrag || 0),
    0
  );
}

function calcRest(doc: RechnungDoc) {
  return Math.max(0, calcBrutto(doc) - calcAbschlagSum(doc));
}

function sourceLabel(doc: RechnungDoc) {
  switch (doc.sourceType) {
    case "ANGEBOT":
      return "Aus Angebot";
    case "MENGEN":
      return "Aus Mengen";
    default:
      return "Freie Rechnung";
  }
}

function sourceBadgeStyle(sourceType?: string) {
  switch (sourceType) {
    case "ANGEBOT":
      return {
        bg: COLORS.accentSoft,
        border: COLORS.border,
        text: COLORS.accent,
      };
    case "MENGEN":
      return {
        bg: COLORS.successBg,
        border: COLORS.successSoft,
        text: COLORS.success,
      };
    default:
      return {
        bg: COLORS.card2,
        border: COLORS.border,
        text: COLORS.text,
      };
  }
}

function parseTime(v?: string | number) {
  if (typeof v === "number") return v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}

export default function RechnungListScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title } = route.params;

  const [items, setItems] = useState<RechnungDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Rechnungen" });
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      setBusy(true);

      const raw = await AsyncStorage.getItem(storageKey(projectCode));
      const listRaw: RechnungDoc[] = raw ? JSON.parse(raw) : [];
      const list = (Array.isArray(listRaw) ? listRaw : []).map(normalizeDoc);

      list.sort((a, b) => {
        const ta = parseTime(a.updatedAt || a.createdAt || a.datum);
        const tb = parseTime(b.updatedAt || b.createdAt || b.datum);
        return tb - ta;
      });

      setItems(list);
    } catch (e: any) {
      Alert.alert(
        "Rechnungen",
        String(e?.message || "Rechnungen konnten nicht geladen werden")
      );
    } finally {
      setBusy(false);
    }
  }, [projectCode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function deleteItem(id: string) {
    try {
      const raw = await AsyncStorage.getItem(storageKey(projectCode));
      const listRaw: RechnungDoc[] = raw ? JSON.parse(raw) : [];
      const list = (Array.isArray(listRaw) ? listRaw : []).map(normalizeDoc);
      const next = list.filter((x) => x.id !== id);

      await AsyncStorage.setItem(storageKey(projectCode), JSON.stringify(next));
      setItems(next);
    } catch (e: any) {
      Alert.alert(
        "Fehler",
        String(e?.message || "Rechnung konnte nicht gelöscht werden")
      );
    }
  }

  function confirmDelete(id: string) {
    Alert.alert("Rechnung löschen", "Möchtest du diese Rechnung wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: () => void deleteItem(id),
      },
    ]);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items.filter((it) => {
      const brutto = calcBrutto(it);
      const bezahlt = calcAbschlagSum(it);
      const rest = calcRest(it);

      const hay = [
        it.rechnungNr,
        it.customerName,
        it.datum,
        it.leistungszeitraum,
        sourceLabel(it),
        money(brutto),
        money(bezahlt),
        money(rest),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [items, q]);

  const totalBrutto = useMemo(
    () => filtered.reduce((sum, it) => sum + calcBrutto(it), 0),
    [filtered]
  );

  const totalBezahlt = useMemo(
    () => filtered.reduce((sum, it) => sum + calcAbschlagSum(it), 0),
    [filtered]
  );

  const totalRest = useMemo(
    () => filtered.reduce((sum, it) => sum + calcRest(it), 0),
    [filtered]
  );

  const hasAnyInvoices = filtered.length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.wrap}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={s.hero}>
              <View style={s.heroTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.eyebrow}>RLC Bausoftware</Text>
                  <Text style={s.title}>Rechnungen</Text>
                  <Text style={s.sub}>
                    Rechnungen, Abschläge und Schlussrechnung pro Projekt verwalten.
                  </Text>
                </View>

                <Pressable
                  style={[s.kiBtn, { display: "none" }]}
                  onPress={() =>
                    navigation.navigate("SupportChat", {
                      projectId,
                      projectCode,
                      title: "RLC KI",
                      screen: "RechnungList",
                    })
                  }
                >
                  <Text style={s.kiBtnTxt}>RLC KI</Text>
                </Pressable>
              </View>

              <View style={s.badgeRow}>
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>Projekt: {title || "—"}</Text>
                </View>
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>Code: {projectCode}</Text>
                </View>
              </View>
            </View>

            <View style={s.panel}>
              <Pressable
                style={s.primaryBtn}
                onPress={() =>
                  navigation.navigate("RechnungEditor", {
                    projectId,
                    projectCode,
                    title: "Rechnung",
                    typ: "RECHNUNG",
                  })
                }
              >
                <Text style={s.primaryBtnTxt}>+ Neue Rechnung</Text>
              </Pressable>

              <View style={s.dualRow}>
                <Pressable
                  style={s.secondaryActionBtn}
                  onPress={() =>
                    navigation.navigate("AbschlagList", {
                      projectId,
                      projectCode,
                      title: "Abschlagsrechnungen",
                    })
                  }
                >
                  <Text style={s.secondaryActionBtnTxt}>Abschläge</Text>
                </Pressable>

                <Pressable
                  style={[
                    s.secondaryActionBtn,
                    !hasAnyInvoices && s.disabled,
                  ]}
                  disabled={!hasAnyInvoices}
                  onPress={() => {
                    const first = filtered[0];
                    if (!first?.id) {
                      Alert.alert(
                        "Hinweis",
                        "Es ist noch keine Rechnung vorhanden."
                      );
                      return;
                    }

                    navigation.navigate("Schlussrechnung", {
                      projectId,
                      projectCode,
                      title: "Schlussrechnung",
                      rechnungId: first.id,
                    } as any);
                  }}
                >
                  <Text style={s.secondaryActionBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Schlussrechnung</Text>
                </Pressable>
              </View>

              <Pressable
                style={s.reloadBtn}
                onPress={() => void load()}
                disabled={busy}
              >
                <Text style={s.reloadBtnTxt}>
                  {busy ? "Lädt..." : "Liste neu laden"}
                </Text>
              </Pressable>

              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Suchen (Nr., Kunde, Datum, Quelle)…"
                placeholderTextColor={COLORS.sub}
                style={s.search}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <View style={s.summaryRow}>
                <Metric label="Rechnungen" value={String(filtered.length)} />
                <Metric label="Brutto gesamt" value={`${money(totalBrutto)} €`} />
                <Metric label="Abschläge" value={`${money(totalBezahlt)} €`} />
              </View>

              <View style={[s.summaryRow, { marginTop: 10 }]}>
                <Metric label="Offener Rest" value={`${money(totalRest)} €`} />
              </View>

              <Text style={s.sectionTitle}>
                {filtered.length
                  ? `Rechnungen (${filtered.length})`
                  : "Keine Rechnungen"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const netto = calcNetto(item.rows || []);
          const brutto = calcBrutto(item);
          const bezahlt = calcAbschlagSum(item);
          const rest = calcRest(item);
          const abschlagCount = item.abschlaege?.length || 0;
          const source = sourceBadgeStyle(item.sourceType);

          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.cardTextWrap}>
                  <Text style={s.cardNr}>{item.rechnungNr || "—"}</Text>
                  <Text style={s.cardTitle}>
                    {item.customerName?.trim() || "Ohne Kunde"}
                  </Text>

                  <View
                    style={[
                      s.sourceBadge,
                      { backgroundColor: source.bg, borderColor: source.border },
                    ]}
                  >
                    <Text style={[s.sourceBadgeTxt, { color: source.text }]}>
                      {sourceLabel(item)}
                    </Text>
                  </View>

                  <Text style={s.cardSub}>Datum: {item.datum || "—"}</Text>
                  <Text style={s.cardSub}>
                    Leistungszeitraum: {item.leistungszeitraum || "—"}
                  </Text>
                </View>
              </View>

              <View style={s.divider} />

              <View style={s.metrics}>
                <Metric label="Positionen" value={String(item.rows?.length || 0)} />
                <Metric label="Netto" value={`${money(netto)} €`} />
                <Metric label="Brutto" value={`${money(brutto)} €`} />
              </View>

              <View style={[s.metrics, { marginTop: 10 }]}>
                <Metric label="Abschläge" value={String(abschlagCount)} />
                <Metric label="Bereits fakturiert" value={`${money(bezahlt)} €`} />
                <Metric label="Rest" value={`${money(rest)} €`} />
              </View>

              {abschlagCount > 0 ? (
                <View style={s.abschlagPreviewBox}>
                  <Text style={s.abschlagPreviewTitle}>Letzter Abschlag</Text>
                  <Text style={s.abschlagPreviewText}>
                    Nr. {item.abschlaege?.[abschlagCount - 1]?.nummer || "—"} ·{" "}
                    {item.abschlaege?.[abschlagCount - 1]?.datum || "—"} ·{" "}
                    {money(item.abschlaege?.[abschlagCount - 1]?.betrag || 0)} €
                  </Text>
                </View>
              ) : null}

              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, s.editBtn]}
                  onPress={() =>
                    navigation.navigate("RechnungEditor", {
                      projectId,
                      projectCode,
                      title: "Rechnung",
                      rechnungId: item.id,
                    })
                  }
                >
                  <Text style={s.editBtnTxt}>Bearbeiten</Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, s.abschlagBtn]}
                  onPress={() =>
                    navigation.navigate("RechnungEditor", {
                      projectId,
                      projectCode,
                      title: "Rechnung",
                      rechnungId: item.id,
                    })
                  }
                >
                  <Text style={s.abschlagBtnTxt}>Abschläge</Text>
                </Pressable>
              </View>

              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, s.openBtn]}
                  onPress={() =>
                    navigation.navigate("RechnungEditor", {
                      projectId,
                      projectCode,
                      title: "Rechnung",
                      rechnungId: item.id,
                    })
                  }
                >
                  <Text style={s.openBtnTxt}>Rechnung öffnen</Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, s.schlussBtn]}
                  onPress={() =>
                    navigation.navigate("Schlussrechnung", {
                      projectId,
                      projectCode,
                      title: "Schlussrechnung",
                      rechnungId: item.id,
                    } as any)
                  }
                >
                  <Text style={s.schlussBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Schlussrechnung</Text>
                </Pressable>
              </View>

              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, s.deleteBtn]}
                  onPress={() => confirmDelete(item.id)}
                >
                  <Text style={s.deleteBtnTxt}>Löschen</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>
              {q.trim()
                ? "Keine passenden Rechnungen gefunden."
                : "Noch keine Rechnungen vorhanden."}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metricBox}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  wrap: {
    padding: 16,
    paddingBottom: 30,
    backgroundColor: COLORS.bg,
  },

  hero: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },

  heroTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },

  kiBtn: { display: "none",
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
  },

  kiBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
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
    fontWeight: "700",
    lineHeight: 20,
  },

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  badgeTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 12,
  },

  panel: {
    marginBottom: 14,
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

  primaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  primaryBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 15,
  },

  dualRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  secondaryActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  secondaryActionBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  reloadBtn: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    marginTop: 10,
  },

  reloadBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  search: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "700",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  sectionTitle: {
    marginTop: 14,
    fontWeight: "900",
    color: COLORS.text,
    fontSize: 16,
  },

  card: {
    marginBottom: 14,
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

  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  cardTextWrap: {
    flex: 1,
  },

  cardNr: {
    color: COLORS.accentDark,
    fontWeight: "900",
    fontSize: 13,
  },

  cardTitle: {
    marginTop: 6,
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 22,
  },

  sourceBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  sourceBadgeTxt: {
    fontWeight: "900",
    fontSize: 12,
  },

  cardSub: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "700",
    lineHeight: 18,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  metrics: {
    flexDirection: "row",
    gap: 10,
  },

  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    padding: 10,
  },

  metricLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.sub,
  },

  metricValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },

  abschlagPreviewBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: COLORS.card2,
  },

  abschlagPreviewTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  abschlagPreviewText: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 18,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  actionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
  },

  editBtn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  editBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  abschlagBtn: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },

  abschlagBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  openBtn: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accentDark,
  },

  openBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  schlussBtn: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },

  schlussBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 13,
    textAlign: "center",
  },

  deleteBtn: {
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
  },

  deleteBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  emptyWrap: {
    paddingTop: 28,
    paddingHorizontal: 16,
  },

  emptyText: {
    color: COLORS.sub,
    textAlign: "center",
    fontWeight: "800",
    lineHeight: 20,
  },

  disabled: {
    opacity: 0.55,
  },
});











