import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
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
function storageKeys(projectCode?: string, projectId?: string) {
  return Array.from(new Set([projectCode, projectId].map(v => String(v || "").trim()).filter(Boolean).map(v => `${KEY_PREFIX}${v}`)));
}
async function loadStoredRechnungen(projectCode?: string, projectId?: string) {
  for (const key of storageKeys(projectCode, projectId)) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return {
      key,
      items: parsed as RechnungDoc[]
    };
  }
  return {
    key: `${KEY_PREFIX}${String(projectCode || projectId || "")}`,
    items: [] as RechnungDoc[]
  };
}
function num(v: unknown) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}
function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function normalizeAbschlag(input: any, idx: number): AbschlagItem {
  return {
    id: String(input?.id || `abschlag_${idx + 1}`),
    nummer: Number(input?.nummer || input?.abschlagNr || idx + 1),
    datum: String(input?.datum || ""),
    betrag: Number(input?.betrag || input?.brutto || 0),
    prozent: input?.prozent == null ? undefined : Number(input.prozent || 0),
    note: String(input?.note || ""),
    pdfUri: String(input?.pdfUri || ""),
    createdAt: Number(input?.createdAt || Date.now())
  };
}
function normalizeDoc(input: any): RechnungDoc {
  return {
    ...input,
    id: String(input?.id || ""),
    sourceType: input?.sourceType || "FREE",
    rechnungNr: String(input?.rechnungNr || ""),
    datum: String(input?.datum || ""),
    leistungszeitraum: String(input?.leistungszeitraum || ""),
    customerName: String(input?.customerName || ""),
    mwstPct: String(input?.mwstPct || "19"),
    rows: Array.isArray(input?.rows) ? input.rows : [],
    abschlaege: Array.isArray(input?.abschlaege) ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i)).sort((a: AbschlagItem, b: AbschlagItem) => a.nummer - b.nummer) : []
  };
}
function calcNetto(rows: RechnungRow[]) {
  return (rows || []).reduce((sum, row) => sum + num(row?.qty) * num(row?.ep), 0);
}
function calcBrutto(doc: RechnungDoc) {
  if (typeof doc.brutto === "number" && Number.isFinite(doc.brutto)) return doc.brutto;
  const netto = calcNetto(doc.rows || []);
  return netto + netto * num(doc.mwstPct || "19") / 100;
}
function calcAbschlagSum(doc: RechnungDoc) {
  return (doc.abschlaege || []).reduce((sum, item) => sum + Number(item.betrag || 0), 0);
}
function parseTime(v?: string | number) {
  if (typeof v === "number") return v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}
export default function RechnungListScreen({
  route,
  navigation
}: Props) {
  const {
    projectId,
    projectCode,
    title
  } = route.params;
  const [items, setItems] = useState<RechnungDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  useLayoutEffect(() => navigation.setOptions({
    title: "Rechnungen"
  }), [navigation]);
  const load = useCallback(async () => {
    try {
      setBusy(true);
      const stored = await loadStoredRechnungen(projectCode, projectId);
      const list = stored.items.map(normalizeDoc).sort((a, b) => parseTime(b.updatedAt || b.createdAt || b.datum) - parseTime(a.updatedAt || a.createdAt || a.datum));
      setItems(list);
    } catch (e: any) {
      Alert.alert("Rechnungen", String(e?.message || "Rechnungen konnten nicht geladen werden."));
    } finally {
      setBusy(false);
    }
  }, [projectCode, projectId]);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  async function deleteItem(id: string) {
    const stored = await loadStoredRechnungen(projectCode, projectId);
    const next = stored.items.map(normalizeDoc).filter(x => x.id !== id);
    await AsyncStorage.setItem(stored.key, JSON.stringify(next));
    setItems(next);
  }
  function showMore(item: RechnungDoc) {
    Alert.alert(item.rechnungNr || "Rechnung", "Aktion auswählen", [{
      text: "Abbrechen",
      style: "cancel"
    }, {
      text: "Schlussrechnung erstellen",
      onPress: () => navigation.navigate("Schlussrechnung", {
        projectId,
        projectCode,
        title: "Schlussrechnung",
        rechnungId: item.id
      } as any)
    }, {
      text: "Rechnung löschen",
      style: "destructive",
      onPress: () => Alert.alert("Rechnung löschen", "Rechnung einschließlich ihrer Abschläge löschen?", [{
        text: "Abbrechen",
        style: "cancel"
      }, {
        text: "Löschen",
        style: "destructive",
        onPress: () => void deleteItem(item.id)
      }])
    }]);
  }
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(it => [it.rechnungNr, it.customerName, it.datum, money(calcBrutto(it))].join(" ").toLowerCase().includes(term));
  }, [items, q]);
  const totals = useMemo(() => filtered.reduce((acc, it) => {
    const total = calcBrutto(it);
    const paid = calcAbschlagSum(it);
    acc.total += total;
    acc.paid += paid;
    acc.open += Math.max(0, total - paid);
    return acc;
  }, {
    total: 0,
    paid: 0,
    open: 0
  }), [filtered]);
  return <SafeAreaView style={s.safe}>
      <FlatList data={filtered} keyExtractor={item => item.id} contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} ListHeaderComponent={<View>
            <View style={s.headerCard}>
              <View style={s.headerLine}>
                <View style={s._inline1}>
                  <Text style={s.title}>Rechnungen</Text>
                  <Text style={s.sub}>{title || projectCode || projectId}</Text>
                </View>
                <Pressable style={s.newBtn} onPress={() => navigation.navigate("RechnungEditor", {
            projectId,
            projectCode,
            title: "Neue Rechnung",
            typ: "RECHNUNG"
          })}>
                  <Text style={s.newBtnTxt}>+ Neu</Text>
                </Pressable>
              </View>

              <TextInput value={q} onChangeText={setQ} placeholder="Rechnung oder Kunde suchen" placeholderTextColor={COLORS.sub} style={s.search} autoCorrect={false} />

              <View style={s.summaryRow}>
                <Summary label="Brutto" value={`${money(totals.total)} €`} />
                <Summary label="Abschläge" value={`${money(totals.paid)} €`} />
                <Summary label="Offen" value={`${money(totals.open)} €`} strong />
              </View>
            </View>
            <Text style={s.sectionTitle}>{busy ? "Wird geladen…" : `${filtered.length} Rechnung${filtered.length === 1 ? "" : "en"}`}</Text>
          </View>} renderItem={({
      item
    }) => {
      const total = calcBrutto(item);
      const paid = calcAbschlagSum(item);
      const open = Math.max(0, total - paid);
      const abschlaege = item.abschlaege || [];
      return <View style={s.card}>
              <View style={s.cardHead}>
                <Pressable style={s._inline2} onPress={() => navigation.navigate("RechnungEditor", {
            projectId,
            projectCode,
            title: "Rechnung",
            rechnungId: item.id
          })}>
                  <Text style={s.cardNr}>{item.rechnungNr || "Ohne Nummer"}</Text>
                  <Text style={s.cardTitle}>{item.customerName || "Kunde nicht eingetragen"}</Text>
                  <Text style={s.cardMeta}>{item.datum || "Kein Datum"} · {item.rows?.length || 0} Positionen</Text>
                </Pressable>
                <Pressable style={s.moreBtn} onPress={() => showMore(item)}><Text style={s.moreTxt}>•••</Text></Pressable>
              </View>

              <View style={s.amountRow}>
                <Amount label="Rechnung" value={total} />
                <Amount label="Bezahlt" value={paid} />
                <Amount label="Offen" value={open} strong />
              </View>

              <View style={s.divider} />
              <View style={s.abschlagHead}>
                <Text style={s.abschlagTitle}>Abschläge ({abschlaege.length})</Text>
                <Pressable style={s.addAbschlagBtn} onPress={() => navigation.navigate("AbschlagEditor", {
            projectId,
            projectCode,
            title: "Neuer Abschlag",
            rechnungId: item.id
          })}>
                  <Text style={s.addAbschlagTxt}>+ Neuer Abschlag</Text>
                </Pressable>
              </View>

              {abschlaege.length === 0 ? <Text style={s.emptyInline}>Noch kein Abschlag zu dieser Rechnung.</Text> : abschlaege.map(a => <Pressable key={a.id} style={s.abschlagRow} onPress={() => navigation.navigate("AbschlagEditor", {
          projectId,
          projectCode,
          title: `${a.nummer}. Abschlagsrechnung`,
          rechnungId: item.id,
          abschlagNr: a.nummer,
          inboxSnapshot: {
            ...a,
            rechnungId: item.id,
            rechnungNr: item.rechnungNr
          }
        })}>
                  <View style={s._inline3}>
                    <Text style={s.abschlagNr}>{a.nummer}. Abschlagsrechnung</Text>
                    <Text style={s.abschlagMeta}>{a.datum || "Kein Datum"}{a.prozent ? ` · ${a.prozent.toLocaleString("de-DE")} %` : ""}</Text>
                  </View>
                  <Text style={s.abschlagAmount}>{money(a.betrag)} €</Text>
                  <Text style={s.chevron}>›</Text>
                </Pressable>)}

              <Pressable style={s.openInvoiceBtn} onPress={() => navigation.navigate("RechnungEditor", {
          projectId,
          projectCode,
          title: "Rechnung",
          rechnungId: item.id
        })}>
                <Text style={s.openInvoiceTxt}>Rechnung öffnen</Text>
              </Pressable>
            </View>;
    }} ListEmptyComponent={<View style={s.emptyBox}><Text style={s.emptyTitle}>Keine Rechnungen vorhanden</Text><Text style={s.emptySub}>Erstelle zuerst eine Rechnung. Abschläge werden anschließend direkt darunter verwaltet.</Text></View>} />
    </SafeAreaView>;
}
function Summary({
  label,
  value,
  strong
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return <View style={s.summary}><Text style={s.summaryLabel}>{label}</Text><Text style={[s.summaryValue, strong && s.strong]} numberOfLines={1}>{value}</Text></View>;
}
function Amount({
  label,
  value,
  strong
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return <View style={s.amount}><Text style={s.amountLabel}>{label}</Text><Text style={[s.amountValue, strong && s.strong]} numberOfLines={1}>{money(value)} €</Text></View>;
}
const s = createRlcStyles("RechnungListScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28
  },
  headerCard: {
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 10
  },
  headerLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600",
    color: COLORS.text
  },
  sub: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.sub
  },
  newBtn: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  newBtnTxt: {
    color: COLORS.card,
    fontWeight: "700",
    fontSize: 13
  },
  search: {
    marginTop: 10,
    minHeight: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 13
  },
  summaryRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 7
  },
  summary: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primaryBorder
  },
  summaryLabel: {
    color: COLORS.sub,
    fontSize: 10,
    fontWeight: "600"
  },
  summaryValue: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600"
  },
  strong: {
    color: COLORS.accent,
    fontWeight: "700"
  },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 7,
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "600"
  },
  card: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 2
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  cardNr: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700"
  },
  cardTitle: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600"
  },
  cardMeta: {
    marginTop: 3,
    color: COLORS.sub,
    fontSize: 11
  },
  moreBtn: {
    width: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  moreTxt: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1
  },
  amountRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 6
  },
  amount: {
    flex: 1,
    minWidth: 0
  },
  amountLabel: {
    color: COLORS.sub,
    fontSize: 10
  },
  amountValue: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600"
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 11
  },
  abschlagHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6
  },
  abschlagTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700"
  },
  addAbschlagBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  addAbschlagTxt: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "700"
  },
  emptyInline: {
    paddingVertical: 9,
    color: COLORS.sub,
    fontSize: 12
  },
  abschlagRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  abschlagNr: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600"
  },
  abschlagMeta: {
    marginTop: 2,
    color: COLORS.sub,
    fontSize: 10
  },
  abschlagAmount: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700"
  },
  chevron: {
    color: COLORS.sub,
    fontSize: 22,
    lineHeight: 22
  },
  openInvoiceBtn: {
    marginTop: 10,
    minHeight: 38,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  openInvoiceTxt: {
    color: COLORS.card,
    fontSize: 12,
    fontWeight: "700"
  },
  emptyBox: {
    marginTop: 12,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center"
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700"
  },
  emptySub: {
    marginTop: 6,
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  _inline1: {
    flex: 1
  },
  _inline2: {
    flex: 1
  },
  _inline3: {
    flex: 1
  }
});
