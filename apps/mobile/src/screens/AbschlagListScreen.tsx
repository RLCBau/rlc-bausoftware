import React, { useCallback, useState } from "react";
import { FlatList, Pressable, SafeAreaView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
type Props = NativeStackScreenProps<RootStackParamList, "AbschlagList">;
const KEY_PREFIX = "rlc_rechnung_list:";
function num(v: unknown) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}
function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function storageKeys(projectCode?: string, projectId?: string) {
  return Array.from(new Set([projectCode, projectId].map(v => String(v || "").trim()).filter(Boolean).map(v => `${KEY_PREFIX}${v}`)));
}
function total(doc: any) {
  if (typeof doc?.brutto === "number" && Number.isFinite(doc.brutto)) return Number(doc.brutto);
  const netto = (Array.isArray(doc?.rows) ? doc.rows : []).reduce((sum: number, row: any) => sum + num(row?.qty) * num(row?.ep), 0);
  return netto + netto * num(doc?.mwstPct || "19") / 100;
}
export default function AbschlagListScreen({
  route,
  navigation
}: Props) {
  const {
    projectId,
    projectCode,
    title
  } = route.params;
  const [rechnungen, setRechnungen] = useState<any[]>([]);
  const load = useCallback(async () => {
    for (const key of storageKeys(projectCode, projectId)) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRechnungen(parsed);
        return;
      }
    }
    setRechnungen([]);
  }, [projectCode, projectId]);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  return <SafeAreaView style={s.safe}>
      <FlatList data={rechnungen} keyExtractor={(item, index) => String(item?.id || index)} contentContainerStyle={s.wrap} ListHeaderComponent={<View style={s.header}>
            <Text style={s.title}>Abschläge</Text>
            <Text style={s.sub}>{title || projectCode || projectId}</Text>
            <Text style={s.info}>Jeder Abschlag gehört direkt zu seiner Basis-Rechnung.</Text>
          </View>} renderItem={({
      item
    }) => {
      const abschlaege = Array.isArray(item?.abschlaege) ? item.abschlaege : [];
      const brutto = total(item);
      const bezahlt = abschlaege.reduce((sum: number, a: any) => sum + num(a?.betrag), 0);
      const offen = Math.max(0, brutto - bezahlt);
      return <View style={s.card}>
              <View style={s.headRow}>
                <View style={s._inline1}>
                  <Text style={s.nr}>{item?.rechnungNr || "Ohne Rechnungsnummer"}</Text>
                  <Text style={s.customer}>{item?.customerName || "Kunde nicht eingetragen"}</Text>
                </View>
                <Text style={s.open}>{money(offen)} € offen</Text>
              </View>

              <View style={s.amountRow}>
                <Text style={s.amount}>Rechnung {money(brutto)} €</Text>
                <Text style={s.amount}>Abschläge {money(bezahlt)} €</Text>
              </View>

              {abschlaege.length === 0 ? <Text style={s.empty}>Noch kein Abschlag vorhanden.</Text> : abschlaege.map((a: any, index: number) => <Pressable key={String(a?.id || index)} style={s.row} onPress={() => navigation.navigate("AbschlagEditor", {
          projectId,
          projectCode,
          title: `${a?.nummer || index + 1}. Abschlagsrechnung`,
          rechnungId: String(item?.id || ""),
          abschlagNr: a?.nummer || index + 1,
          inboxSnapshot: {
            ...a,
            rechnungId: item?.id,
            rechnungNr: item?.rechnungNr
          }
        })}>
                  <View style={s._inline2}>
                    <Text style={s.rowTitle}>{a?.nummer || index + 1}. Abschlagsrechnung</Text>
                    <Text style={s.rowMeta}>{a?.datum || "Kein Datum"}</Text>
                  </View>
                  <Text style={s.rowAmount}>{money(num(a?.betrag))} €</Text>
                  <Text style={s.chevron}>›</Text>
                </Pressable>)}

              <Pressable style={s.newBtn} onPress={() => navigation.navigate("AbschlagEditor", {
          projectId,
          projectCode,
          title: "Neuer Abschlag",
          rechnungId: String(item?.id || "")
        })}>
                <Text style={s.newBtnTxt}>+ Neuer Abschlag</Text>
              </Pressable>
            </View>;
    }} ListEmptyComponent={<View style={s.emptyBox}>
            <Text style={s.emptyTitle}>Keine Basis-Rechnung vorhanden</Text>
            <Text style={s.emptyText}>Erstelle zuerst eine Rechnung. Danach können hier Abschläge hinzugefügt werden.</Text>
            <Pressable style={s.goBtn} onPress={() => navigation.navigate("RechnungList", {
        projectId,
        projectCode,
        title: "Rechnungen"
      })}>
              <Text style={s.goBtnTxt}>Zu Rechnungen</Text>
            </Pressable>
          </View>} />
    </SafeAreaView>;
}
const s = createRlcStyles("AbschlagListScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28
  },
  header: {
    marginBottom: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "600"
  },
  sub: {
    marginTop: 2,
    color: COLORS.sub,
    fontSize: 12
  },
  info: {
    marginTop: 8,
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 17
  },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card
  },
  headRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start"
  },
  nr: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700"
  },
  customer: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600"
  },
  open: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700"
  },
  amountRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 12
  },
  amount: {
    color: COLORS.sub,
    fontSize: 11
  },
  empty: {
    paddingVertical: 12,
    color: COLORS.sub,
    fontSize: 12
  },
  row: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600"
  },
  rowMeta: {
    marginTop: 2,
    color: COLORS.sub,
    fontSize: 10
  },
  rowAmount: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700"
  },
  chevron: {
    color: COLORS.sub,
    fontSize: 22
  },
  newBtn: {
    marginTop: 8,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: COLORS.accent
  },
  newBtnTxt: {
    color: COLORS.card,
    fontSize: 12,
    fontWeight: "700"
  },
  emptyBox: {
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
  emptyText: {
    marginTop: 6,
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  goBtn: {
    marginTop: 14,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  goBtnTxt: {
    color: COLORS.card,
    fontSize: 12,
    fontWeight: "700"
  },
  _inline1: {
    flex: 1
  },
  _inline2: {
    flex: 1
  }
});
