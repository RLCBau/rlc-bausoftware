import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "AbschlagEditor">;

const RECHNUNG_KEY = "rlc_rechnung_list:";

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function esc(v: any) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function calcRechnungNetto(rows: any[]) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((s: number, x: any) => s + num(x?.qty) * num(x?.ep), 0);
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
    id: String(input?.id || makeId()),
    nummer: Number(input?.nummer || idx + 1),
    datum: String(input?.datum || new Date().toISOString().slice(0, 10)),
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
    ...input,
    id: String(input?.id || ""),
    rechnungNr: String(input?.rechnungNr || ""),
    customerName: String(input?.customerName || ""),
    address: String(input?.address || ""),
    email: String(input?.email || ""),
    phone: String(input?.phone || ""),
    rows: Array.isArray(input?.rows) ? input.rows : [],
    abschlaege: Array.isArray(input?.abschlaege)
      ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i))
      : [],
    brutto:
      typeof input?.brutto === "number" ? Number(input.brutto) : undefined,
    mwstPct: String(input?.mwstPct || "19"),
  };
}

export default function AbschlagEditorScreen({ route, navigation }: Props) {
  const { projectCode, rechnungId, abschlagNr } = route.params as any;

  const [doc, setDoc] = useState<any>({
    id: makeId(),
    rechnungId: rechnungId || "",
    abschlagNr: abschlagNr ? String(abschlagNr) : "",
    datum: new Date().toISOString().slice(0, 10),
    percent: "",
    betrag: "",
    note: "",
  });

  const [rechnung, setRechnung] = useState<any>(null);
  const [baseTotal, setBaseTotal] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({
      title: "Abschlagsrechnung",
    });
  }, [navigation]);

  useEffect(() => {
    void load();
  }, [projectCode, rechnungId]);

  async function load() {
    try {
      setLoading(true);

      if (!rechnungId) {
        Alert.alert("Hinweis", "Keine Basis-Rechnung ausgewählt.");
        return;
      }

      const rawR = await AsyncStorage.getItem(RECHNUNG_KEY + projectCode);
      const listR = rawR ? JSON.parse(rawR) : [];
      const rechnungen = (Array.isArray(listR) ? listR : []).map(normalizeRechnung);

      const r =
        rechnungen.find((x: any) => String(x?.id) === String(rechnungId)) || null;

      setRechnung(r);

      if (r) {
        const total = calcRechnungBrutto(r);
        setBaseTotal(total);

        const related = Array.isArray(r?.abschlaege) ? r.abschlaege : [];
        setHistory(related);

        const nr = related.length + 1;
        setDoc((p: any) => ({
          ...p,
          abschlagNr: p?.abschlagNr || String(nr),
        }));
      } else {
        setBaseTotal(0);
        setHistory([]);
      }
    } catch (e) {
      console.log("LOAD ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "Abschlagsrechnung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const sumDone = useMemo(() => {
    return history.reduce((s: number, x: any) => s + num(x?.betrag), 0);
  }, [history]);

  const rest = useMemo(() => {
    const out = baseTotal - sumDone;
    return out < 0 ? 0 : out;
  }, [baseTotal, sumDone]);

  function calcFromPercent(pct: string) {
    const pctNum = num(pct);
    const val = (baseTotal * pctNum) / 100;
    setDoc((d: any) => ({
      ...d,
      percent: pct,
      betrag: val > 0 ? val.toFixed(2) : "",
    }));
  }

  function calcFromAmount(v: string) {
    const amountNum = num(v);
    const pct = baseTotal > 0 ? (amountNum / baseTotal) * 100 : 0;

    setDoc((d: any) => ({
      ...d,
      betrag: v,
      percent: amountNum > 0 ? pct.toFixed(2) : "",
    }));
  }

  async function save() {
    try {
      if (!rechnungId) {
        Alert.alert("Fehler", "Keine Basis-Rechnung ausgewählt.");
        return;
      }

      if (!rechnung) {
        Alert.alert("Fehler", "Basis-Rechnung nicht gefunden.");
        return;
      }

      const betragNum = num(doc.betrag);
      const pctNum = num(doc.percent);

      if (!betragNum || betragNum <= 0) {
        Alert.alert("Fehler", "Bitte einen gültigen Abschlagsbetrag eingeben.");
        return;
      }

      if (betragNum > rest) {
        Alert.alert(
          "Fehler",
          `Der Abschlagsbetrag (${money(betragNum)} €) ist größer als der Restbetrag (${money(rest)} €).`
        );
        return;
      }

      const normalizedAbschlag = {
        id: String(doc.id || makeId()),
        nummer: Number(doc.abschlagNr || history.length + 1),
        datum: String(doc.datum || "").trim(),
        betrag: Number(betragNum.toFixed(2)),
        prozent: pctNum > 0 ? Number(pctNum.toFixed(2)) : undefined,
        note: String(doc.note || "").trim(),
        pdfUri: "",
        createdAt: Date.now(),
      };

      const rawR = await AsyncStorage.getItem(RECHNUNG_KEY + projectCode);
      const listR = rawR ? JSON.parse(rawR) : [];
      const rechnungen = (Array.isArray(listR) ? listR : []).map(normalizeRechnung);

      const idx = rechnungen.findIndex(
        (x: any) => String(x?.id) === String(rechnungId)
      );

      if (idx < 0) {
        Alert.alert("Fehler", "Basis-Rechnung nicht gefunden.");
        return;
      }

      const baseRechnung = rechnungen[idx];
      const nextAbschlaege = [
        ...(Array.isArray(baseRechnung?.abschlaege) ? baseRechnung.abschlaege : []),
        normalizedAbschlag,
      ].map((a: any, i: number) => ({
        ...normalizeAbschlag(a, i),
        nummer: i + 1,
      }));

      const nextRechnung = {
        ...baseRechnung,
        abschlaege: nextAbschlaege,
        updatedAt: Date.now(),
      };

      rechnungen[idx] = nextRechnung;

      await AsyncStorage.setItem(RECHNUNG_KEY + projectCode, JSON.stringify(rechnungen));

      navigation.goBack();
    } catch (e) {
      console.log("SAVE ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "Abschlagsrechnung konnte nicht gespeichert werden.");
    }
  }

  async function pdf() {
    try {
      const betragNum = num(doc.betrag);

      if (!rechnung) {
        Alert.alert("Fehler", "Keine Basis-Rechnung gefunden.");
        return;
      }

      if (!betragNum || betragNum <= 0) {
        Alert.alert("Fehler", "Bitte zuerst einen gültigen Betrag eingeben.");
        return;
      }

      const html = `
      <html>
      <body style="font-family:Arial;padding:30px;color:#0B1720;">
        <h1>ABSCHLAGSRECHNUNG</h1>

        <div style="margin-bottom:18px;">
          <b>Abschlag Nr:</b> ${esc(doc.abschlagNr)}<br/>
          <b>Datum:</b> ${esc(doc.datum)}<br/>
          <b>Basis-Rechnung:</b> ${esc(rechnung?.rechnungNr || "—")}<br/>
        </div>

        <div style="margin-bottom:18px;">
          <b>Kunde:</b><br/>
          ${esc(rechnung?.customerName || "")}<br/>
          ${esc(rechnung?.address || "")}<br/>
          ${esc(rechnung?.email || "")}<br/>
          ${esc(rechnung?.phone || "")}<br/>
        </div>

        <div style="margin-bottom:18px;">
          <b>Gesamtbetrag Rechnung:</b> ${money(baseTotal)} €<br/>
          <b>Bereits abgerechnet:</b> ${money(sumDone)} €<br/>
          <b>Rest vor diesem Abschlag:</b> ${money(rest)} €<br/>
        </div>

        <div style="margin-bottom:18px;">
          <b>Abschlag (%):</b> ${esc(doc.percent || "—")} %<br/>
          <b>Abschlagsbetrag:</b> ${money(betragNum)} €<br/>
        </div>

        ${
          doc.note
            ? `<div style="margin-top:20px;"><b>Notiz:</b><br/>${esc(doc.note)}</div>`
            : ""
        }
      </body>
      </html>
      `;

      const f = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(f.uri);
    } catch (e) {
      console.log("PDF ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.loading}>Lädt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!rechnung) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.title}>Abschlagsrechnung</Text>
          <Text style={s.emptyText}>Keine Basis-Rechnung gefunden.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.title}>Abschlagsrechnung</Text>

        <View style={s.infoCard}>
          <Text style={s.infoLabel}>Basis-Rechnung</Text>
          <Text style={s.infoValue}>{rechnung?.rechnungNr || "—"}</Text>

          <Text style={s.infoLabel}>Kunde</Text>
          <Text style={s.infoValue}>{rechnung?.customerName || "—"}</Text>
        </View>

        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Gesamt</Text>
            <Text style={s.summaryValue}>{money(baseTotal)} €</Text>
          </View>

          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Bereits abgerechnet</Text>
            <Text style={s.summaryValue}>{money(sumDone)} €</Text>
          </View>

          <View style={s.summaryRow}>
            <Text style={s.summaryStrongLabel}>Rest</Text>
            <Text style={s.summaryStrongValue}>{money(rest)} €</Text>
          </View>
        </View>

        <Text style={s.label}>Abschlag Nr</Text>
        <TextInput
          placeholder="Nr."
          value={doc.abschlagNr}
          onChangeText={(v) => setDoc((p: any) => ({ ...p, abschlagNr: v }))}
          style={s.input}
          placeholderTextColor={COLORS.sub}
        />

        <Text style={s.label}>Datum</Text>
        <TextInput
          placeholder="YYYY-MM-DD"
          value={doc.datum}
          onChangeText={(v) => setDoc((p: any) => ({ ...p, datum: v }))}
          style={s.input}
          placeholderTextColor={COLORS.sub}
        />

        <Text style={s.label}>Prozent %</Text>
        <TextInput
          placeholder="%"
          value={doc.percent}
          onChangeText={calcFromPercent}
          style={s.input}
          placeholderTextColor={COLORS.sub}
          keyboardType="decimal-pad"
        />

        <Text style={s.label}>Betrag €</Text>
        <TextInput
          placeholder="Betrag €"
          value={doc.betrag}
          onChangeText={calcFromAmount}
          style={s.input}
          placeholderTextColor={COLORS.sub}
          keyboardType="decimal-pad"
        />

        <Text style={s.label}>Notiz</Text>
        <TextInput
          placeholder="Notiz"
          value={doc.note}
          onChangeText={(v) => setDoc((p: any) => ({ ...p, note: v }))}
          style={[s.input, s.textArea]}
          placeholderTextColor={COLORS.sub}
          multiline
        />

        <Pressable style={s.btn} onPress={pdf}>
          <Text style={s.btnTxt}>PDF</Text>
        </Pressable>

        <Pressable style={s.save} onPress={save}>
          <Text style={s.btnTxt}>Speichern</Text>
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
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },

  loading: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  emptyText: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },

  title: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 12,
  },

  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  infoLabel: {
    color: COLORS.sub,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 6,
  },

  infoValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
    marginTop: 4,
  },

  summaryCard: {
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },

  summaryLabel: {
    color: COLORS.text,
    fontWeight: "700",
  },

  summaryValue: {
    color: COLORS.text,
    fontWeight: "900",
  },

  summaryStrongLabel: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  summaryStrongValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
  },

  label: {
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    borderRadius: 10,
    marginTop: 2,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  btn: {
    backgroundColor: COLORS.accent,
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
  },

  save: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },

  btnTxt: {
    color: COLORS.textLight,
    textAlign: "center",
    fontWeight: "900",
  },
});




