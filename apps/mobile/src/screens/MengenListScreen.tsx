import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "MengenList">;

const KEY = "rlc_mengen_list:";

function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(v: any) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}

function calcTotal(rows: any[]) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, r) => {
    const qty = num(r?.qty);
    const ep = num(r?.ep);
    return sum + qty * ep;
  }, 0);
}

function parseTime(v?: string | number) {
  if (typeof v === "number") return v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}

function sourceLabel(item: any) {
  return item?.sourceType === "ANGEBOT" ? "Aus Angebot" : "Freie Mengen";
}

function sourceBadgeStyle(sourceType?: string) {
  switch (sourceType) {
    case "ANGEBOT":
      return {
        bg: "#EEF5FF",
        border: "#BFDBFE",
        text: "#1D4ED8",
      };
    default:
      return {
        bg: COLORS.card2,
        border: COLORS.border,
        text: COLORS.text,
      };
  }
}

function normalizeItem(input: any) {
  return {
    id: String(input?.id || ""),
    sourceType: String(input?.sourceType || "FREE"),
    angebotId: input?.angebotId ? String(input.angebotId) : null,
    title: String(input?.title || "Mengenermittlung"),
    datum: String(input?.datum || input?.date || ""),
    rows: Array.isArray(input?.rows) ? input.rows : [],
    createdAt: input?.createdAt || "",
    updatedAt: input?.updatedAt || "",
  };
}

export default function MengenListScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title } = route.params;

  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Mengenermittlung" });
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      setBusy(true);

      const raw = await AsyncStorage.getItem(KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      const safe = (Array.isArray(list) ? list : []).map(normalizeItem);

      safe.sort((a, b) => {
        const ta = parseTime(a.updatedAt || a.createdAt || a.datum);
        const tb = parseTime(b.updatedAt || b.createdAt || b.datum);
        return tb - ta;
      });

      setItems(safe);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [projectCode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function removeItem(id: string) {
    Alert.alert("Löschen", "Mengenermittlung wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            const raw = await AsyncStorage.getItem(KEY + projectCode);
            const list = raw ? JSON.parse(raw) : [];
            const next = Array.isArray(list)
              ? list.filter((x: any) => String(x?.id) !== String(id))
              : [];
            await AsyncStorage.setItem(KEY + projectCode, JSON.stringify(next));
            setItems(next.map(normalizeItem));
          } catch (e: any) {
            Alert.alert(
              "Fehler",
              String(
                e?.message || "Mengenermittlung konnte nicht gelöscht werden."
              )
            );
          }
        },
      },
    ]);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) => {
      const total = calcTotal(item?.rows || []);
      const hay = [
        item?.title,
        item?.datum,
        item?.angebotId,
        sourceLabel(item),
        money(total),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [items, q]);

  const totalDocs = filtered.length;
  const totalRows = useMemo(
    () =>
      filtered.reduce(
        (sum, item) => sum + (Array.isArray(item?.rows) ? item.rows.length : 0),
        0
      ),
    [filtered]
  );

  const totalValue = useMemo(
    () => filtered.reduce((sum, item) => sum + calcTotal(item?.rows || []), 0),
    [filtered]
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filtered}
        keyExtractor={(item, idx) =>
          String(item?.id || `mengen-${idx}-${Date.now()}`)
        }
        contentContainerStyle={
          filtered.length === 0 ? s.emptyListContent : s.listContent
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={s.topCard}>
              <View style={s.topHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.eyebrow}>RLC Bausoftware</Text>
                  <Text style={s.title}>{title || "Mengenermittlung"}</Text>
                  <Text style={s.sub}>Projekt: {projectCode || projectId}</Text>
                </View>

                <Pressable
                  style={[s.kiBtn, { display: "none" }]}
                  onPress={() =>
                    navigation.navigate("SupportChat", {
                      projectId,
                      projectCode,
                      title: "RLC KI",
                      screen: "MengenList",
                    })
                  }
                >
                  <Text style={s.kiBtnTxt}>RLC KI</Text>
                </Pressable>
              </View>

              <Pressable
                style={s.primaryBtn}
                onPress={() =>
                  navigation.navigate("MengenEditor", {
                    projectId,
                    projectCode,
                    title: "Mengenermittlung",
                  })
                }
              >
                <Text style={s.primaryBtnTxt}>+ Neue Mengenermittlung</Text>
              </Pressable>

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
                placeholder="Suchen (Titel, Datum, Angebot, Wert)…"
                placeholderTextColor="#B8C1CC"
                style={s.search}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <View style={s.metricsRow}>
                <Metric label="Dokumente" value={String(totalDocs)} />
                <Metric label="Positionen" value={String(totalRows)} />
                <Metric label="Gesamtwert" value={`${money(totalValue)} €`} />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const total = calcTotal(item?.rows || []);
          const rowsCount = Array.isArray(item?.rows) ? item.rows.length : 0;
          const source = sourceBadgeStyle(item?.sourceType);

          return (
            <View style={s.card}>
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>
                    {item?.title || `Mengenermittlung ${item?.id || ""}`}
                  </Text>
                  <Text style={s.cardSub}>
                    Datum: {item?.datum || "—"}
                  </Text>

                  <View
                    style={[
                      s.sourceBadge,
                      {
                        backgroundColor: source.bg,
                        borderColor: source.border,
                      },
                    ]}
                  >
                    <Text style={[s.sourceBadgeTxt, { color: source.text }]}>
                      {sourceLabel(item)}
                    </Text>
                  </View>
                </View>

                <View style={s.amountBadge}>
                  <Text style={s.amountBadgeTxt}>{money(total)} €</Text>
                </View>
              </View>

              <View style={s.divider} />

              <View style={s.metricsRow}>
                <Metric label="Positionen" value={String(rowsCount)} />
                <Metric label="Netto" value={`${money(total)} €`} />
              </View>

              {!!item?.angebotId ? (
                <Text style={s.infoLine}>
                  Angebot: <Text style={s.infoStrong}>{item.angebotId}</Text>
                </Text>
              ) : (
                <Text style={s.infoLine}>
                  Quelle: <Text style={s.infoStrong}>Frei</Text>
                </Text>
              )}

              <View style={s.rowBtns}>
                <Pressable
                  style={[s.btn, s.btnPrimary]}
                  onPress={() =>
                    navigation.navigate("MengenEditor", {
                      projectId,
                      projectCode,
                      title: "Mengenermittlung",
                      mengenId: String(item.id),
                      angebotId: item?.angebotId || undefined,
                    })
                  }
                >
                  <Text style={s.btnTxt}>Öffnen</Text>
                </Pressable>

                <Pressable
                  style={[s.btn, s.btnOrange]}
                  onPress={() =>
                    navigation.navigate("RechnungEditor", {
                      projectId,
                      projectCode,
                      title: "Rechnung",
                      fromMengen: true,
                      mengenId: String(item.id),
                    })
                  }
                >
                  <Text style={s.btnTxt}>→ Rechnung</Text>
                </Pressable>
              </View>

              <View style={s.rowBtns}>
                <Pressable
                  style={[s.btn, s.btnGhost]}
                  onPress={() =>
                    navigation.navigate("RechnungList", {
                      projectId,
                      projectCode,
                      title: "Rechnungen",
                    })
                  }
                >
                  <Text style={s.btnGhostTxt}>Rechnungen</Text>
                </Pressable>

                <Pressable
                  style={[s.btn, s.btnDanger]}
                  onPress={() => removeItem(String(item.id))}
                >
                  <Text style={s.btnTxt}>Löschen</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>
              {q.trim()
                ? "Keine passende Mengenermittlung gefunden"
                : "Noch keine Mengenermittlung"}
            </Text>
            <Text style={s.emptySub}>
              {q.trim()
                ? "Passe den Suchbegriff an oder lade die Liste neu."
                : "Erstelle die erste Mengenermittlung für dieses Projekt."}
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
  safe: { flex: 1, backgroundColor: COLORS.bg },

  listContent: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
  },

  emptyListContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
  },

  topCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
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

  topHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },

  eyebrow: {
    color: COLORS.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
  },

  sub: {
    color: COLORS.sub,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },

  kiBtn: { display: "none",
    backgroundColor: COLORS.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  kiBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },

  primaryBtnTxt: {
    color: COLORS.textLight,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 14,
  },

  reloadBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
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

  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
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

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
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

  sourceBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 28,
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

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
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

  rowBtns: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  },

  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
  },

  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  btnOrange: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },

  btnDanger: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },

  btnGhost: {
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
  },

  btnTxt: {
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
  },

  btnGhostTxt: {
    color: COLORS.text,
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
  },
});





