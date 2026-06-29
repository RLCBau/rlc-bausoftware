import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  FlatList,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "AbschlagList">;

const RECHNUNG_KEY = "rlc_rechnung_list:";

function num(v: any) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}

function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calcRechnungNetto(rows: any[]) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => {
    return sum + num(row?.qty) * num(row?.ep);
  }, 0);
}

function calcRechnungBrutto(doc: any) {
  if (typeof doc?.brutto === "number" && Number.isFinite(doc.brutto)) {
    return Number(doc.brutto);
  }
  const netto = calcRechnungNetto(doc?.rows || []);
  const mwstPct = num(doc?.mwstPct || "19");
  return netto + (netto * mwstPct) / 100;
}

function normalizeAbschlag(input: any, idx: number) {
  return {
    id: String(input?.id || `abschlag_${idx}`),
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

function normalizeRechnung(input: any) {
  return {
    id: String(input?.id || ""),
    rechnungNr: String(input?.rechnungNr || ""),
    customerName: String(input?.customerName || ""),
    datum: String(input?.datum || ""),
    mwstPct: String(input?.mwstPct || "19"),
    rows: Array.isArray(input?.rows) ? input.rows : [],
    abschlaege: Array.isArray(input?.abschlaege)
      ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i))
      : [],
    brutto:
      typeof input?.brutto === "number" ? Number(input.brutto) : undefined,
  };
}

export default function AbschlagListScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title } = route.params;

  const [rechnungen, setRechnungen] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const rawR = await AsyncStorage.getItem(RECHNUNG_KEY + projectCode);
      const listR = rawR ? JSON.parse(rawR) : [];
      const normalized = (Array.isArray(listR) ? listR : []).map(normalizeRechnung);
      setRechnungen(normalized);
    } catch {
      setRechnungen([]);
    }
  }, [projectCode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <View style={s.topCard}>
          <Text style={s.title}>{title || "Abschlagsrechnungen"}</Text>
          <Text style={s.sub}>Projekt: {projectCode || projectId}</Text>
        </View>

        <FlatList
          data={rechnungen}
          keyExtractor={(item, idx) =>
            String(item?.id || `rechnung-${idx}`)
          }
          contentContainerStyle={
            rechnungen.length === 0 ? s.emptyListContent : s.listContent
          }
          renderItem={({ item }) => {
            const total = calcRechnungBrutto(item);
            const related = Array.isArray(item?.abschlaege) ? item.abschlaege : [];
            const paid = related.reduce(
              (sum: number, x: any) => sum + num(x?.betrag),
              0
            );
            const rest = Math.max(0, total - paid);

            return (
              <View style={s.card}>
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>
                      {item?.rechnungNr || `Rechnung ${item?.id}`}
                    </Text>
                    <Text style={s.cardSub}>
                      Kunde: {String(item?.customerName || "—")}
                    </Text>
                    <Text style={s.cardSub}>
                      Rechnung-ID: {String(item?.id || "—")}
                    </Text>
                  </View>

                  <View style={s.amountBadge}>
                    <Text style={s.amountBadgeTxt}>{money(total)} €</Text>
                  </View>
                </View>

                <Text style={s.infoLine}>
                  Bereits als Abschlag:{" "}
                  <Text style={s.infoStrong}>{money(paid)} €</Text>
                </Text>

                <Text style={s.infoLine}>
                  Rest: <Text style={s.infoStrong}>{money(rest)} €</Text>
                </Text>

                <Text style={s.infoLine}>
                  Anzahl Abschläge:{" "}
                  <Text style={s.infoStrong}>{related.length}</Text>
                </Text>

                {related.length ? (
                  <View style={s.historyBox}>
                    <Text style={s.historyTitle}>Vorhandene Abschläge</Text>
                    {related.map((a: any, i: number) => (
                      <Text key={String(a?.id || i)} style={s.historyRow}>
                        {i + 1}. Abschlag
                        {a?.nummer ? ` Nr. ${a.nummer}` : ""} ·{" "}
                        {a?.datum || "—"} · {money(num(a?.betrag))} €
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={s.rowBtns}>
                  <Pressable
                    style={s.btn}
                    onPress={() =>
                      navigation.navigate("RechnungEditor", {
                        projectId,
                        projectCode,
                        title: "Rechnung",
                        rechnungId: String(item.id),
                        typ: "ABSCHLAG",
                      })
                    }
                  >
                    <Text style={s.btnTxt}>Abschläge verwalten</Text>
                  </Pressable>

                  <Pressable
                    style={[s.btn, s.btnDark]}
                    onPress={() =>
                      navigation.navigate("Schlussrechnung", {
                        projectId,
                        projectCode,
                        title: "Schlussrechnung",
                        rechnungId: String(item.id),
                      } as any)
                    }
                  >
                    <Text style={s.btnTxt}>Schlussrechnung</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyTitle}>Keine Rechnungen gefunden</Text>
              <Text style={s.emptySub}>
                Erstelle zuerst eine Rechnung, damit Abschläge verwaltet werden
                können.
              </Text>

              <Pressable
                style={s.primaryBtn}
                onPress={() =>
                  navigation.navigate("RechnungList", {
                    projectId,
                    projectCode,
                    title: "Rechnungen",
                  })
                }
              >
                <Text style={s.primaryBtnTxt}>Zu Rechnungen</Text>
              </Pressable>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { flex: 1, padding: 16, backgroundColor: COLORS.bg },

  topCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },

  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
  },

  sub: {
    color: COLORS.sub,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },

  listContent: {
    paddingBottom: 24,
  },

  emptyListContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },

  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  cardSub: {
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  amountBadge: {
    backgroundColor: COLORS.card2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  amountBadgeTxt: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  infoLine: {
    color: COLORS.sub,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },

  infoStrong: {
    color: COLORS.text,
    fontWeight: "900",
  },

  historyBox: {
    marginTop: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
  },

  historyTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
    marginBottom: 6,
  },

  historyRow: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 18,
  },

  rowBtns: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  },

  btn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },

  btnDark: {
    backgroundColor: "#12324A",
  },

  btnTxt: {
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
  },

  emptyBox: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  emptySub: {
    color: COLORS.sub,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
    marginBottom: 14,
  },

  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },

  primaryBtnTxt: {
    color: COLORS.textLight,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 14,
  },
});


