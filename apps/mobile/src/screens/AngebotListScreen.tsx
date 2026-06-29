// apps/mobile/src/screens/AngebotListScreen.tsx
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
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import { buildDocumentPdf } from "../lib/exporters/documentPdfBuilder";

type Props = NativeStackScreenProps<RootStackParamList, "AngebotList">;

type AngebotStatus = "Entwurf" | "Gesendet" | "Angenommen" | "Abgelehnt";

type AngebotRow = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  quantity: string;
  ep: string;
};

type AngebotDoc = {
  id: string;
  projectId: string;
  projectCode: string;
  title?: string;

  angebotNr: string;
  angebotTitle: string;
  status: AngebotStatus;

  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;

  baustelle: string;
  datum: string;
  validUntil: string;

  rabattPct: string;
  zuschlagPct: string;
  mwstPct: string;

  note: string;
  rows: AngebotRow[];

  createdAt: string | number;
  updatedAt: string | number;
};

const OFFER_STORAGE_PREFIX = "rlc_angebot_list:";
const ANGEBOT_STATUSES: AngebotStatus[] = [
  "Entwurf",
  "Gesendet",
  "Angenommen",
  "Abgelehnt",
];

function offerListKey(projectCode: string) {
  return `${OFFER_STORAGE_PREFIX}${projectCode}`;
}

function normalizeStatus(v: any): AngebotStatus {
  return ANGEBOT_STATUSES.includes(v) ? v : "Entwurf";
}

function normalizeOfferDoc(input: any): AngebotDoc {
  return {
    id: String(input?.id || ""),
    projectId: String(input?.projectId || ""),
    projectCode: String(input?.projectCode || ""),
    title: input?.title ? String(input.title) : undefined,

    angebotNr: String(input?.angebotNr || ""),
    angebotTitle: String(input?.angebotTitle || "Angebot"),
    status: normalizeStatus(input?.status),

    customerName: String(input?.customerName || ""),
    customerAddress: String(input?.customerAddress || ""),
    customerEmail: String(input?.customerEmail || ""),
    customerPhone: String(input?.customerPhone || ""),

    baustelle: String(input?.baustelle || ""),
    datum: String(input?.datum || ""),
    validUntil: String(input?.validUntil || ""),

    rabattPct: String(input?.rabattPct ?? "0"),
    zuschlagPct: String(input?.zuschlagPct ?? "0"),
    mwstPct: String(input?.mwstPct ?? "19"),

    note: String(input?.note || ""),
    rows: Array.isArray(input?.rows) ? input.rows : [],

    createdAt: input?.createdAt || new Date().toISOString(),
    updatedAt: input?.updatedAt || new Date().toISOString(),
  };
}

function toNum(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: number) {
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calcNetto(rows: AngebotRow[]) {
  return rows.reduce((sum, r) => {
    const qty = toNum(r.quantity);
    const ep = toNum(r.ep);
    return sum + qty * ep;
  }, 0);
}

function calcRabattValue(doc: AngebotDoc) {
  const netto = calcNetto(doc.rows);
  return (netto * toNum(doc.rabattPct)) / 100;
}

function calcZuschlagValue(doc: AngebotDoc) {
  const netto = calcNetto(doc.rows);
  const rabattValue = calcRabattValue(doc);
  const afterRabatt = netto - rabattValue;
  return (afterRabatt * toNum(doc.zuschlagPct)) / 100;
}

function calcNettoFinal(doc: AngebotDoc) {
  const netto = calcNetto(doc.rows);
  const rabattValue = calcRabattValue(doc);
  const afterRabatt = netto - rabattValue;
  const zuschlagValue = calcZuschlagValue(doc);
  return afterRabatt + zuschlagValue;
}

function calcMwstValue(doc: AngebotDoc) {
  const nettoFinal = calcNettoFinal(doc);
  return (nettoFinal * toNum(doc.mwstPct)) / 100;
}

function calcBrutto(doc: AngebotDoc) {
  return calcNettoFinal(doc) + calcMwstValue(doc);
}

function getStatusBadgeStyle(status: AngebotStatus) {
  switch (status) {
    case "Entwurf":
      return { bg: COLORS.card2, border: COLORS.border, text: COLORS.text };
    case "Gesendet":
      return { bg: "#EEF5FF", border: "#BFDBFE", text: "#1D4ED8" };
    case "Angenommen":
      return { bg: "#ECFDF5", border: "#A7F3D0", text: "#047857" };
    case "Abgelehnt":
      return { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" };
    default:
      return { bg: COLORS.card2, border: COLORS.border, text: COLORS.text };
  }
}

function parseTime(v?: string | number) {
  if (typeof v === "number") return v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}

function sanitizeFileName(v: string) {
  return String(v || "angebot")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

async function exportOfferPdf(item: AngebotDoc) {
  const netto = calcNetto(item.rows || []);
  const rabattValue = calcRabattValue(item);
  const zuschlagValue = calcZuschlagValue(item);
  const nettoFinal = calcNettoFinal(item);
  const mwstValue = calcMwstValue(item);
  const brutto = calcBrutto(item);

  const fileBase = sanitizeFileName(item.angebotNr || item.angebotTitle || "angebot");

  await buildDocumentPdf({
    type: "ANGEBOT",
    projectCode: item.projectCode,
    fileName: `${fileBase}.pdf`,
    title: item.angebotTitle?.trim() || "ANGEBOT",
    subTitle: item.status || "Entwurf",
    docNo: item.angebotNr || "",
    date: item.datum || "",
    customer: {
      name: item.customerName || "",
      address: item.customerAddress || "",
      email: item.customerEmail || "",
      phone: item.customerPhone || "",
    },
    rows: (item.rows || []).map((r) => {
      const qty = toNum(r.quantity);
      const ep = toNum(r.ep);
      return {
        pos: r.pos || "",
        text: r.text || "",
        unit: r.unit || "",
        qty,
        ep,
        gp: qty * ep,
      };
    }),
    totals: {
      netto,
      rabattPct: toNum(item.rabattPct),
      rabattValue,
      zuschlagPct: toNum(item.zuschlagPct),
      zuschlagValue,
      mwstPct: toNum(item.mwstPct),
      mwstValue,
      brutto,
    },
    extraBlocks: [
      {
        title: "Projekt",
        lines: [
          `Baustelle: ${item.baustelle || item.title || "-"}`,
          `Projektcode: ${item.projectCode || "-"}`,
          `Gültig bis: ${item.validUntil || "-"}`,
        ],
      },
    ],
    note: item.note || "",
    shareAfterCreate: true,
  });
}

async function exportOfferExcel(item: AngebotDoc) {
  const netto = calcNetto(item.rows || []);
  const rabattValue = calcRabattValue(item);
  const zuschlagValue = calcZuschlagValue(item);
  const nettoFinal = calcNettoFinal(item);
  const mwstValue = calcMwstValue(item);
  const brutto = calcBrutto(item);

  const rows = (item.rows || []).map((r) => {
    const qty = toNum(r.quantity);
    const ep = toNum(r.ep);
    return {
      Pos: r.pos || "",
      Beschreibung: r.text || "",
      Einheit: r.unit || "",
      Menge: qty,
      EP: ep,
      GP: qty * ep,
    };
  });

  const summary = [
    { Feld: "Angebotsnummer", Wert: item.angebotNr || "" },
    { Feld: "Angebotstitel", Wert: item.angebotTitle || "" },
    { Feld: "Status", Wert: item.status || "" },
    { Feld: "Kunde", Wert: item.customerName || "" },
    { Feld: "Adresse", Wert: item.customerAddress || "" },
    { Feld: "E-Mail", Wert: item.customerEmail || "" },
    { Feld: "Telefon", Wert: item.customerPhone || "" },
    { Feld: "Baustelle", Wert: item.baustelle || "" },
    { Feld: "Datum", Wert: item.datum || "" },
    { Feld: "Gültig bis", Wert: item.validUntil || "" },
    { Feld: "Rabatt %", Wert: toNum(item.rabattPct) },
    { Feld: "Rabatt Wert", Wert: rabattValue },
    { Feld: "Zuschlag %", Wert: toNum(item.zuschlagPct) },
    { Feld: "Zuschlag Wert", Wert: zuschlagValue },
    { Feld: "MwSt %", Wert: toNum(item.mwstPct) },
    { Feld: "Netto", Wert: netto },
    { Feld: "Netto gesamt", Wert: nettoFinal },
    { Feld: "MwSt Wert", Wert: mwstValue },
    { Feld: "Brutto", Wert: brutto },
    { Feld: "Bemerkung", Wert: item.note || "" },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Positionen");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(summary),
    "Zusammenfassung"
  );

  const base64 = XLSX.write(wb, {
    type: "base64",
    bookType: "xlsx",
  });

  const fileName = `${sanitizeFileName(item.angebotNr || item.angebotTitle || "angebot")}.xlsx`;
  const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: fileName,
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
  } else {
    Alert.alert("Excel exportiert", uri);
  }
}

export default function AngebotListScreen({ route, navigation }: Props) {
  const { projectId, projectCode, title } = route.params;

  const [items, setItems] = useState<AngebotDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Angebote" });
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const raw = await AsyncStorage.getItem(offerListKey(projectCode));
      const listRaw: AngebotDoc[] = raw ? JSON.parse(raw) : [];
      const list = (Array.isArray(listRaw) ? listRaw : []).map(normalizeOfferDoc);

      list.sort((a, b) => {
        const ta = parseTime(a.updatedAt || a.createdAt);
        const tb = parseTime(b.updatedAt || b.createdAt);
        return tb - ta;
      });

      setItems(list);

      await AsyncStorage.setItem(offerListKey(projectCode), JSON.stringify(list));
    } catch (e: any) {
      Alert.alert(
        "Angebote",
        String(e?.message || "Angebote konnten nicht geladen werden")
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
      const raw = await AsyncStorage.getItem(offerListKey(projectCode));
      const listRaw: AngebotDoc[] = raw ? JSON.parse(raw) : [];
      const list = (Array.isArray(listRaw) ? listRaw : []).map(normalizeOfferDoc);
      const next = list.filter((x) => x.id !== id);
      await AsyncStorage.setItem(offerListKey(projectCode), JSON.stringify(next));
      setItems(next);
    } catch (e: any) {
      Alert.alert(
        "Fehler",
        String(e?.message || "Angebot konnte nicht gelöscht werden")
      );
    }
  }

  function confirmDelete(id: string) {
    Alert.alert("Angebot löschen", "Möchtest du dieses Angebot wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: () => void deleteItem(id),
      },
    ]);
  }

  async function onPdf(item: AngebotDoc) {
    try {
      setBusy(true);
      await exportOfferPdf(item);
    } catch (e: any) {
      Alert.alert("PDF Export", String(e?.message || "PDF Export fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  }

  async function onExcel(item: AngebotDoc) {
    try {
      setBusy(true);
      await exportOfferExcel(item);
    } catch (e: any) {
      Alert.alert(
        "Excel Export",
        String(e?.message || "Excel Export fehlgeschlagen")
      );
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items.filter((it) => {
      const netto = calcNetto(it.rows || []);
      const brutto = calcBrutto(it);

      const hay = [
        it.angebotNr,
        it.angebotTitle,
        it.status,
        it.customerName,
        it.baustelle,
        it.datum,
        it.validUntil,
        fmtMoney(netto),
        fmtMoney(brutto),
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

  const totalAccepted = useMemo(
    () => filtered.filter((x) => x.status === "Angenommen").length,
    [filtered]
  );

  const totalRows = useMemo(
    () =>
      filtered.reduce(
        (sum, it) => sum + (Array.isArray(it.rows) ? it.rows.length : 0),
        0
      ),
    [filtered]
  );

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
                  <Text style={s.title}>Angebote</Text>
                  <Text style={s.sub}>
                    Professionelle Angebotsliste mit Status, Projekt, Kunde und Positionen.
                  </Text>
                </View>

                <Pressable
                  style={[s.kiBtn, { display: "none" }]}
                  onPress={() =>
                    navigation.navigate("SupportChat", {
                      projectId,
                      projectCode,
                      title: "RLC KI",
                      screen: "AngebotList",
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
                  navigation.navigate("AngebotEditor", {
                    projectId,
                    projectCode,
                    title,
                  })
                }
              >
                <Text style={s.primaryBtnTxt}>+ Neues Angebot</Text>
              </Pressable>

              <Pressable style={s.secondaryBtn} onPress={() => void load()} disabled={busy}>
                <Text style={s.secondaryBtnTxt}>
                  {busy ? "Lädt..." : "Liste neu laden"}
                </Text>
              </Pressable>

              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Suchen (Nr., Titel, Status, Kunde, Baustelle)…"
                placeholderTextColor="#B8C1CC"
                style={s.search}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <View style={s.metrics}>
                <Metric label="Angebote" value={String(filtered.length)} />
                <Metric label="Angenommen" value={String(totalAccepted)} />
                <Metric label="Positionen" value={String(totalRows)} />
              </View>

              <View style={[s.metrics, { marginTop: 10 }]}>
                <Metric label="Brutto gesamt" value={`${fmtMoney(totalBrutto)} €`} />
              </View>

              <Text style={s.sectionTitle}>
                {filtered.length ? `Angebote (${filtered.length})` : "Keine Angebote"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const netto = calcNetto(item.rows || []);
          const brutto = calcBrutto(item);
          const badge = getStatusBadgeStyle(item.status);

          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.cardTextWrap}>
                  <Text style={s.cardNr}>{item.angebotNr || "—"}</Text>
                  <Text style={s.cardTitle}>
                    {item.angebotTitle?.trim() || "Angebot"}
                  </Text>

                  <View
                    style={[
                      s.statusBadge,
                      { backgroundColor: badge.bg, borderColor: badge.border },
                    ]}
                  >
                    <Text style={[s.statusBadgeTxt, { color: badge.text }]}>
                      {item.status}
                    </Text>
                  </View>

                  <Text style={s.cardSub}>
                    Kunde: {item.customerName?.trim() || "—"}
                  </Text>
                  <Text style={s.cardSub}>
                    Baustelle: {item.baustelle?.trim() || title || "—"}
                  </Text>
                  <Text style={s.cardSub}>
                    Datum: {item.datum || "—"} • Gültig bis: {item.validUntil || "—"}
                  </Text>
                </View>
              </View>

              <View style={s.divider} />

              <View style={s.metrics}>
                <Metric label="Positionen" value={String(item.rows?.length || 0)} />
                <Metric label="Netto" value={`${fmtMoney(netto)} €`} />
                <Metric label="Brutto" value={`${fmtMoney(brutto)} €`} />
              </View>

              <View style={s.exportRow}>
                <Pressable
                  style={[s.smallActionBtn, s.pdfBtn, busy && s.disabled]}
                  onPress={() => void onPdf(item)}
                  disabled={busy}
                >
                  <Text style={s.smallActionBtnTxtLight}>PDF</Text>
                </Pressable>

                <Pressable
                  style={[s.smallActionBtn, s.excelBtn, busy && s.disabled]}
                  onPress={() => void onExcel(item)}
                  disabled={busy}
                >
                  <Text style={s.smallActionBtnTxt}>Excel</Text>
                </Pressable>
              </View>

              {item.status === "Angenommen" ? (
                <>
                  <View style={s.flowBox}>
                    <Text style={s.flowTitle}>Weiterer Ablauf</Text>
                    <Text style={s.flowText}>
                      Dieses Angebot ist angenommen. Du kannst jetzt direkt die
                      Mengenermittlung und danach die Rechnung erstellen.
                    </Text>
                  </View>

                  <View style={s.actionRow}>
                    <Pressable
                      style={[s.actionBtn, s.editBtn]}
                      onPress={() =>
                        navigation.navigate("AngebotEditor", {
                          projectId,
                          projectCode,
                          title,
                          angebotId: item.id,
                        })
                      }
                    >
                      <Text style={s.editBtnTxt}>Bearbeiten</Text>
                    </Pressable>

                    <Pressable
                      style={[s.actionBtn, s.mengenBtn]}
                      onPress={() =>
                        navigation.navigate("MengenEditor", {
                          projectId,
                          projectCode,
                          title: "Mengenermittlung",
                          angebotId: item.id,
                        })
                      }
                    >
                      <Text style={s.invoiceBtnTxt}>Mengen</Text>
                    </Pressable>
                  </View>

                  <View style={s.actionRow}>
                    <Pressable
                      style={[s.actionBtn, s.invoiceBtn]}
                      onPress={() =>
                        navigation.navigate("RechnungEditor", {
                          projectId,
                          projectCode,
                          title: "Rechnung",
                          fromAngebotId: item.id,
                        })
                      }
                    >
                      <Text style={s.invoiceBtnTxt}>Rechnung</Text>
                    </Pressable>

                    <Pressable
                      style={[s.actionBtn, s.deleteBtn]}
                      onPress={() => confirmDelete(item.id)}
                    >
                      <Text style={s.deleteBtnTxt}>Löschen</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={s.actionRow}>
                  <Pressable
                    style={[s.actionBtn, s.editBtn]}
                    onPress={() =>
                      navigation.navigate("AngebotEditor", {
                        projectId,
                        projectCode,
                        title,
                        angebotId: item.id,
                      })
                    }
                  >
                    <Text style={s.editBtnTxt}>Bearbeiten</Text>
                  </Pressable>

                  <Pressable
                    style={[s.actionBtn, s.deleteBtn]}
                    onPress={() => confirmDelete(item.id)}
                  >
                    <Text style={s.deleteBtnTxt}>Löschen</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>
              {q.trim()
                ? "Keine passenden Angebote gefunden."
                : "Noch keine Angebote vorhanden."}
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

  secondaryBtn: {
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

  secondaryBtnTxt: {
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

  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  statusBadgeTxt: {
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

  exportRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  smallActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
  },

  pdfBtn: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accentDark,
  },

  excelBtn: {
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
  },

  smallActionBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  smallActionBtnTxtLight: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  flowBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: COLORS.card2,
  },

  flowTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  flowText: {
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

  mengenBtn: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },

  invoiceBtn: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accentDark,
  },

  invoiceBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
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
    opacity: 0.6,
  },
});





