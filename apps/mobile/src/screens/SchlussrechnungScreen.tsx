// apps/mobile/src/screens/SchlussrechnungsScreen.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import { buildSchlussrechnungPdf } from "../lib/exporters/schlussrechnungPdfBuilder";
import { api } from "../lib/api";

type Props = NativeStackScreenProps<RootStackParamList, "Schlussrechnung">;

const RECHNUNG_KEY = "rlc_rechnung_list:";
const KEY_MODE = "rlc_mobile_mode";

type AbschlagItem = {
  id: string;
  nummer: number;
  datum: string;
  betrag: number;
  prozent?: number;
  note?: string;
  pdfUri?: string;
  createdAt: number;
};

function num(v: string | number | null | undefined) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}

function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeFileBase(v: string) {
  return String(v || "schlussrechnung")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function normalizeAbschlag(a: any, idx: number): AbschlagItem {
  return {
    id: String(a?.id || `${Date.now()}_${idx}`),
    nummer: Number(a?.nummer || idx + 1),
    datum: String(a?.datum || new Date().toISOString().slice(0, 10)),
    betrag: Number(a?.betrag || 0),
    prozent:
      a?.prozent === null || a?.prozent === undefined
        ? undefined
        : Number(a.prozent || 0),
    note: String(a?.note || ""),
    pdfUri: String(a?.pdfUri || ""),
    createdAt: Number(a?.createdAt || Date.now()),
  };
}

function normalizeRechnung(input: any) {
  return {
    ...input,
    id: String(input?.id || ""),
    projectId: String(input?.projectId || ""),
    projectCode: String(input?.projectCode || ""),
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
    zahlungsziel: String(input?.zahlungsziel || "14 Tage"),
    mwstPct: String(input?.mwstPct || "19"),
    note: String(input?.note || ""),
    netto: Number(input?.netto || 0),
    mwst: Number(input?.mwst || 0),
    brutto: Number(input?.brutto || 0),
    rows: Array.isArray(input?.rows) ? input.rows : [],
    abschlaege: Array.isArray(input?.abschlaege)
      ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i))
      : [],
  };
}

function buildAbschlagLines(abschlaege: AbschlagItem[]) {
  const safe = Array.isArray(abschlaege) ? abschlaege : [];
  if (!safe.length) return ["Noch keine Abschläge vorhanden."];

  return safe.map(
    (a) =>
      `${a.nummer}. Abschlag Nr. ${a.nummer} (${a.datum}): ${money(a.betrag)} €${
        a.note ? ` • ${a.note}` : ""
      }`
  );
}

async function getMode(): Promise<"NUR_APP" | "SERVER_SYNC"> {
  const raw = await AsyncStorage.getItem(KEY_MODE);
  return raw === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
}

export default function SchlussrechnungsScreen({
  route,
  navigation,
}: Props) {
  const { projectId, projectCode, rechnungId } = route.params as any;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rechnung, setRechnung] = useState<any | null>(null);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: "Schlussrechnung",
      });
      void load();
    }, [navigation, projectCode, rechnungId])
  );

  async function load() {
    try {
      setLoading(true);

      const mode = await getMode();

      let found: any | null = null;

      if (mode === "SERVER_SYNC") {
        try {
          const serverList = await api.getRechnungen(projectCode);
          const safeServerList = Array.isArray(serverList) ? serverList : [];

          found =
            safeServerList.find(
              (x: any) => String(x?.id) === String(rechnungId)
            ) || null;

          if (safeServerList.length) {
            await AsyncStorage.setItem(
              RECHNUNG_KEY + projectCode,
              JSON.stringify(safeServerList)
            );
          }
        } catch (e) {
          console.log("Schlussrechnung load server fallback -> local", e);
        }
      }

      if (!found) {
        const raw = await AsyncStorage.getItem(RECHNUNG_KEY + projectCode);
        const list = raw ? JSON.parse(raw) : [];
        const safe = Array.isArray(list) ? list : [];

        found =
          safe.find((x: any) => String(x?.id) === String(rechnungId)) || null;
      }

      if (!found) {
        Alert.alert("Fehler", "Basis-Rechnung wurde nicht gefunden.");
        navigation.goBack();
        return;
      }

      setRechnung(normalizeRechnung(found));
    } catch (e) {
      console.log("LOAD SCHLUSSRECHNUNG ERROR", e);
      Alert.alert("Fehler", "Schlussrechnung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const netto = useMemo(() => Number(rechnung?.netto || 0), [rechnung?.netto]);

  const mwst = useMemo(() => Number(rechnung?.mwst || 0), [rechnung?.mwst]);

  const brutto = useMemo(
    () => Number(rechnung?.brutto || 0),
    [rechnung?.brutto]
  );

  const abschlaege: AbschlagItem[] = useMemo(
    () =>
      Array.isArray(rechnung?.abschlaege)
        ? rechnung.abschlaege.map((a: any, i: number) =>
            normalizeAbschlag(a, i)
          )
        : [],
    [rechnung?.abschlaege]
  );

  const bezahlt = useMemo(
    () =>
      abschlaege.reduce(
        (sum: number, a: AbschlagItem) => sum + Number(a?.betrag || 0),
        0
      ),
    [abschlaege]
  );

  const rest = useMemo(() => Math.max(0, brutto - bezahlt), [brutto, bezahlt]);

  async function onExportPdf() {
    try {
      if (!rechnung) return;

      setBusy(true);

      const fileNameBase = sanitizeFileBase(
        `${rechnung?.rechnungNr || "schlussrechnung"}_schlussrechnung`
      );

      const out: any = await buildSchlussrechnungPdf({
        projectCode,
        fileName: `${fileNameBase}.pdf`,
        title: "SCHLUSSRECHNUNG",
        subTitle:
          abschlaege.length > 0
            ? "Restbetrag nach Abschlägen"
            : "Schlussbetrag",
        docNo: rechnung?.rechnungNr || "",
        date: rechnung?.datum || "",
        period: rechnung?.leistungszeitraum || "",
        customer: {
          name: rechnung?.customerName || "",
          address: rechnung?.address || "",
          email: rechnung?.email || "",
          phone: rechnung?.phone || "",
        },
        bank: {
          bank: rechnung?.bank || "",
          iban: rechnung?.iban || "",
          bic: rechnung?.bic || "",
          owner: rechnung?.owner || "",
          steuerNr: rechnung?.steuerNr || "",
          ustId: rechnung?.ustId || "",
          zahlungsziel: rechnung?.zahlungsziel || "",
        },
        rows: Array.isArray(rechnung?.rows) ? rechnung.rows : [],
        netto,
        mwstPct: num(rechnung?.mwstPct || "19"),
        mwstValue: mwst,
        brutto,
        bezahlt,
        rest,
        abschlagLines: buildAbschlagLines(abschlaege),
        note: rechnung?.note || "",
        shareAfterCreate: false,
      });

      const pdfUri = String(out?.pdfUri || out?.uri || "").trim();
      if (pdfUri) {
        await Linking.openURL(pdfUri);
      }
    } catch (e) {
      console.log("EXPORT SCHLUSSRECHNUNG PDF ERROR", e);
      Alert.alert("Fehler", "Schlussrechnung PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !rechnung) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.loading}>Lädt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.card}>
          <Text style={s.title}>Schlussrechnung</Text>

          <Text style={s.label}>Kunde</Text>
          <Text style={s.value}>{rechnung?.customerName || "—"}</Text>

          <Text style={s.label}>Datum</Text>
          <Text style={s.value}>{rechnung?.datum || "—"}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.blockTitle}>Gesamtbetrag Rechnung</Text>
          <Text style={s.big}>{money(brutto)} €</Text>

          <Text style={s.label}>Netto</Text>
          <Text style={s.value}>{money(netto)} €</Text>

          <Text style={s.label}>MwSt</Text>
          <Text style={s.value}>{money(mwst)} €</Text>
        </View>

        <View style={s.card}>
          <Text style={s.blockTitle}>Abschlagsrechnungen</Text>

          {abschlaege.length ? (
            abschlaege.map((a) => (
              <View key={a.id} style={s.absRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.absTitle}>
                    {a.nummer}. Abschlag Nr. {a.nummer}
                  </Text>
                  <Text style={s.absDate}>{a.datum}</Text>
                </View>
                <Text style={s.absAmount}>{money(a.betrag)} €</Text>
              </View>
            ))
          ) : (
            <Text style={s.muted}>Keine Abschläge vorhanden.</Text>
          )}
        </View>

        <View style={s.card}>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Gesamt</Text>
            <Text style={s.sumValue}>{money(brutto)} €</Text>
          </View>

          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Summe Abschläge</Text>
            <Text style={s.sumValue}>{money(bezahlt)} €</Text>
          </View>

          <View style={s.divider} />

          <View style={s.sumRow}>
            <Text style={s.sumStrong}>Restbetrag</Text>
            <Text style={s.sumStrong}>{money(rest)} €</Text>
          </View>
        </View>

        <Pressable
          style={s.secondaryBtn}
          onPress={() =>
            navigation.navigate("RechnungEditor", {
              projectId,
              projectCode,
              rechnungId,
            })
          }
        >
          <Text style={s.secondaryBtnTxt}>Basis-Rechnung öffnen</Text>
        </Pressable>

        <Pressable style={s.primaryBtn} onPress={onExportPdf} disabled={busy}>
          <Text style={s.primaryBtnTxt}>
            {busy ? "Bitte warten..." : "PDF"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 16, paddingBottom: 28 },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loading: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },

  title: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 12,
  },

  blockTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 10,
  },

  big: {
    fontSize: 34,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 10,
  },

  label: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 6,
  },

  value: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
    marginTop: 2,
  },

  muted: {
    color: COLORS.sub,
    fontWeight: "700",
  },

  absRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  absTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  absDate: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 2,
  },

  absAmount: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
  },

  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  sumLabel: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 16,
  },

  sumValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
  },

  sumStrong: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 20,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },

  secondaryBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 12,
  },

  secondaryBtnTxt: {
    color: COLORS.text,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 16,
  },

  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 18,
  },

  primaryBtnTxt: {
    color: COLORS.textLight,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 18,
  },
});






