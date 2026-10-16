import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, SafeAreaView, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS, createRlcStyles } from "../ui/theme";
import { submitToEingangPruefung } from "../lib/submitToEingangPruefung";
import { buildDocumentPdf } from "../lib/exporters/documentPdfBuilder";
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
    maximumFractionDigits: 2
  });
}
function esc(v: any) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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
  return netto + netto * mwstPct / 100;
}
function normalizeAbschlag(input: any, idx: number) {
  return {
    id: String(input?.id || makeId()),
    nummer: Number(input?.nummer || idx + 1),
    datum: String(input?.datum || new Date().toISOString().slice(0, 10)),
    betrag: Number(input?.betrag || 0),
    prozent: input?.prozent === null || input?.prozent === undefined ? undefined : Number(input.prozent || 0),
    note: String(input?.note || ""),
    pdfUri: String(input?.pdfUri || ""),
    createdAt: Number(input?.createdAt || Date.now())
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
    abschlaege: Array.isArray(input?.abschlaege) ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i)) : [],
    brutto: typeof input?.brutto === "number" ? Number(input.brutto) : undefined,
    mwstPct: String(input?.mwstPct || "19")
  };
}
function rechnungStorageKeys(projectCode?: string, projectId?: string) {
  return Array.from(new Set([projectCode, projectId].map(v => String(v || "").trim()).filter(Boolean).map(v => RECHNUNG_KEY + v)));
}
async function loadRechnungen(projectCode?: string, projectId?: string) {
  for (const key of rechnungStorageKeys(projectCode, projectId)) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return {
        key,
        items: parsed.map(normalizeRechnung)
      };
    }
  }
  const fallbackKey = RECHNUNG_KEY + String(projectCode || projectId || "");
  return {
    key: fallbackKey,
    items: [] as any[]
  };
}
export default function AbschlagEditorScreen({
  route,
  navigation
}: Props) {
  const {
    projectId,
    projectCode,
    rechnungId,
    abschlagNr,
    inboxSnapshot,
    editId,
    fromInbox
  } = route.params as any;
  const [doc, setDoc] = useState<any>({
    id: makeId(),
    rechnungId: rechnungId || "",
    abschlagNr: abschlagNr ? String(abschlagNr) : "",
    datum: new Date().toISOString().slice(0, 10),
    percent: "",
    betrag: "",
    note: ""
  });
  const [rechnung, setRechnung] = useState<any>(null);
  const [baseTotal, setBaseTotal] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedRechnungId, setResolvedRechnungId] = useState(String(rechnungId || ""));
  useEffect(() => {
    navigation.setOptions({
      title: "Abschlagsrechnung"
    });
  }, [navigation]);
  useEffect(() => {
    void load();
  }, [projectCode, projectId, rechnungId]);
  async function load() {
    try {
      setLoading(true);
      const snapshot = inboxSnapshot || {};
      const snapshotRechnung = snapshot?.rechnung || snapshot?.basisRechnung || null;
      const effectiveId = String(rechnungId || snapshot?.rechnungId || snapshot?.basisRechnungId || snapshot?.invoiceId || snapshotRechnung?.id || snapshot?.rechnungNr || snapshot?.basisRechnungNr || "").trim();
      const loaded = await loadRechnungen(projectCode, projectId);
      const rechnungen = loaded.items;
      const r = rechnungen.find((x: any) => String(x?.id) === effectiveId) || rechnungen.find((x: any) => String(x?.rechnungNr) === effectiveId) || (snapshotRechnung ? normalizeRechnung(snapshotRechnung) : null) || (snapshot?.rows || snapshot?.brutto || snapshot?.customerName ? normalizeRechnung(snapshot) : null) || (rechnungen.length === 1 ? rechnungen[0] : null);
      let resolved = r;

      // Eingang/Offline-Inbox kann eine vollständige Basis-Rechnung mitsenden,
      // obwohl sie unter dem lokalen Projektschlüssel noch nicht gespeichert ist.
      // In diesem Fall wird sie kanonisch unter rlc_rechnung_list:<Projekt> abgelegt.
      if (resolved && !rechnungen.some((x: any) => String(x?.id) === String(resolved?.id))) {
        const canonicalId = String(resolved?.id || effectiveId || makeId());
        resolved = normalizeRechnung({
          ...resolved,
          id: canonicalId
        });
        rechnungen.push(resolved);
        await AsyncStorage.setItem(loaded.key, JSON.stringify(rechnungen));
      }
      setRechnung(resolved);
      setResolvedRechnungId(String(resolved?.id || effectiveId || ""));
      if (resolved) {
        const total = calcRechnungBrutto(resolved);
        setBaseTotal(total);
        const related = Array.isArray(resolved?.abschlaege) ? resolved.abschlaege : [];
        setHistory(related);
        const snapshotDoc = snapshot?.doc || snapshot?.payload?.doc || snapshot?.payload?.row || snapshot;
        const existing = related.find((a: any) => String(a?.id || "") === String(editId || snapshotDoc?.id || "") || Number(a?.nummer || 0) === Number(abschlagNr || snapshotDoc?.abschlagNr || snapshotDoc?.nummer || 0));
        const nr = existing?.nummer || related.length + 1;
        setDoc((p: any) => ({
          ...p,
          id: String(existing?.id || snapshotDoc?.id || p?.id || makeId()),
          abschlagNr: String(existing?.nummer || snapshotDoc?.abschlagNr || snapshotDoc?.nummer || p?.abschlagNr || nr),
          datum: String(existing?.datum || snapshotDoc?.datum || snapshotDoc?.date || p?.datum || ""),
          percent: String(existing?.prozent ?? snapshotDoc?.prozent ?? snapshotDoc?.percent ?? p?.percent ?? ""),
          betrag: String(existing?.betrag ?? snapshotDoc?.betrag ?? snapshotDoc?.brutto ?? p?.betrag ?? ""),
          note: String(existing?.note || snapshotDoc?.note || snapshotDoc?.bemerkungen || p?.note || "")
        }));
      } else {
        setBaseTotal(0);
        setHistory([]);
        Alert.alert("Hinweis", "Die Basis-Rechnung wurde nicht gefunden. Öffne zuerst die Rechnung und speichere sie erneut.");
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
    const val = baseTotal * pctNum / 100;
    setDoc((d: any) => ({
      ...d,
      percent: pct,
      betrag: val > 0 ? val.toFixed(2) : ""
    }));
  }
  function calcFromAmount(v: string) {
    const amountNum = num(v);
    const pct = baseTotal > 0 ? amountNum / baseTotal * 100 : 0;
    setDoc((d: any) => ({
      ...d,
      betrag: v,
      percent: amountNum > 0 ? pct.toFixed(2) : ""
    }));
  }
  async function save() {
    try {
      const activeRechnungId = String(resolvedRechnungId || rechnung?.id || rechnungId || "");
      if (!activeRechnungId) {
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
        Alert.alert("Fehler", `Der Abschlagsbetrag (${money(betragNum)} €) ist größer als der Restbetrag (${money(rest)} €).`);
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
        createdAt: Date.now()
      };
      const loaded = await loadRechnungen(projectCode, projectId);
      const rechnungen = loaded.items;
      const idx = rechnungen.findIndex((x: any) => String(x?.id) === activeRechnungId);
      if (idx < 0) {
        Alert.alert("Fehler", "Basis-Rechnung nicht gefunden.");
        return;
      }
      const baseRechnung = rechnungen[idx];
      const currentAbschlaege = Array.isArray(baseRechnung?.abschlaege) ? baseRechnung.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i)) : [];
      const existingIndex = currentAbschlaege.findIndex((a: any) => String(a?.id || "") === String(normalizedAbschlag.id || "") || fromInbox && Number(a?.nummer || 0) === Number(normalizedAbschlag.nummer || 0));
      if (existingIndex >= 0) currentAbschlaege[existingIndex] = normalizedAbschlag;else currentAbschlaege.push(normalizedAbschlag);
      const nextAbschlaege = currentAbschlaege.sort((a: any, b: any) => Number(a?.nummer || 0) - Number(b?.nummer || 0)).map((a: any, i: number) => ({
        ...normalizeAbschlag(a, i),
        nummer: i + 1
      }));
      const nextRechnung = {
        ...baseRechnung,
        abschlaege: nextAbschlaege,
        updatedAt: Date.now()
      };
      rechnungen[idx] = nextRechnung;
      await AsyncStorage.setItem(loaded.key, JSON.stringify(rechnungen));
      await submitToEingangPruefung({
        type: "ABSCHLAGSRECHNUNG",
        projectKey: projectCode,
        projectCode,
        title: `Abschlagsrechnung ${normalizedAbschlag.nummer}`,
        doc: {
          ...normalizedAbschlag,
          rechnungId: activeRechnungId,
          rechnungNr: baseRechnung?.rechnungNr || "",
          abschlagNr: normalizedAbschlag.nummer,
          betrag: normalizedAbschlag.betrag,
          brutto: normalizedAbschlag.betrag,
          customerName: baseRechnung?.customerName || "",
          rows: Array.isArray(baseRechnung?.rows) ? baseRechnung.rows : []
        },
        status: "EINGEREICHT",
        sourceScreen: "AbschlagEditor"
      });
      navigation.goBack();
    } catch (e) {
      console.log("SAVE ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "Abschlagsrechnung konnte nicht gespeichert werden.");
    }
  }
  async function pdfForAbschlag(abschlag: any) {
    try {
      if (!rechnung) {
        Alert.alert("Fehler", "Keine Basis-Rechnung gefunden.");
        return;
      }
      const amount = num(abschlag?.betrag);
      if (!amount || amount <= 0) {
        Alert.alert("Fehler", "Der Abschlag enthält keinen gültigen Betrag.");
        return;
      }
      const previousPaid = history.filter((x: any) => Number(x?.nummer || 0) < Number(abschlag?.nummer || 0)).reduce((sum: number, x: any) => sum + num(x?.betrag), 0);
      const out = await buildDocumentPdf({
        type: "ABSCHLAGSRECHNUNG",
        projectCode,
        fileName: `Abschlagsrechnung_${String(abschlag?.nummer || "1")}.pdf`,
        title: "Abschlagsrechnung",
        subTitle: "Gespeicherter Abschlag",
        docNo: String(abschlag?.nummer || ""),
        date: String(abschlag?.datum || ""),
        customer: {
          name: rechnung?.customerName || "",
          address: rechnung?.address || "",
          email: rechnung?.email || "",
          phone: rechnung?.phone || ""
        },
        totals: {
          netto: baseTotal,
          bezahlt: previousPaid,
          rest: Math.max(0, baseTotal - previousPaid - amount),
          brutto: amount
        },
        extraBlocks: [{
          title: "Basis-Rechnung",
          lines: [`Rechnung: ${String(rechnung?.rechnungNr || "-")}`, `Abschlag: ${String(abschlag?.prozent ?? "-")} %`]
        }],
        note: String(abschlag?.note || ""),
        shareAfterCreate: false
      });
      navigation.navigate("PdfViewer", {
        uri: out.pdfUri,
        title: `Abschlagsrechnung ${String(abschlag?.nummer || "")}`.trim(),
        projectCode,
        documentType: "ABSCHLAGSRECHNUNG"
      });
    } catch (e) {
      console.log("PDF SAVED ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "Der gespeicherte Abschlag konnte nicht geladen werden.");
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
      const out = await buildDocumentPdf({
        type: "ABSCHLAGSRECHNUNG",
        projectCode,
        fileName: `Abschlagsrechnung_${String(doc.abschlagNr || "1")}.pdf`,
        title: "Abschlagsrechnung",
        subTitle: "Eingang / Entwurf",
        docNo: String(doc.abschlagNr || ""),
        date: String(doc.datum || ""),
        customer: {
          name: rechnung?.customerName || "",
          address: rechnung?.address || "",
          email: rechnung?.email || "",
          phone: rechnung?.phone || ""
        },
        totals: {
          netto: baseTotal,
          bezahlt: sumDone,
          rest,
          brutto: betragNum
        },
        extraBlocks: [{
          title: "Basis-Rechnung",
          lines: [`Rechnung: ${String(rechnung?.rechnungNr || "-")}`, `Abschlag: ${String(doc.percent || "-")} %`]
        }],
        note: String(doc.note || ""),
        shareAfterCreate: false
      });
      navigation.navigate("PdfViewer", {
        uri: out.pdfUri,
        title: `Abschlagsrechnung ${String(doc.abschlagNr || "")}`.trim(),
        projectCode,
        documentType: "ABSCHLAGSRECHNUNG"
      });
    } catch (e) {
      console.log("PDF ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden.");
    }
  }
  if (loading) {
    return <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.loading}>Lädt...</Text>
        </View>
      </SafeAreaView>;
  }
  if (!rechnung) {
    return <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.title}>Abschlagsrechnung</Text>
          <Text style={s.emptyText}>Keine Basis-Rechnung gefunden.</Text>
        </View>
      </SafeAreaView>;
  }
  return <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.pageHeader}><View><Text style={s.title}>Abschlagsrechnung</Text><Text style={s.pageSub}>{rechnung?.rechnungNr || "Basis-Rechnung"}</Text></View></View>

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

        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? "Abschlag bearbeiten" : "Neuen Abschlag anlegen"}</Text>
        <Text style={s.label}>Abschlag Nr</Text>
        <TextInput placeholder="Nr." value={doc.abschlagNr} onChangeText={v => setDoc((p: any) => ({
          ...p,
          abschlagNr: v
        }))} style={s.input} placeholderTextColor={COLORS.sub} />

        <Text style={s.label}>Datum</Text>
        <TextInput placeholder="YYYY-MM-DD" value={doc.datum} onChangeText={v => setDoc((p: any) => ({
          ...p,
          datum: v
        }))} style={s.input} placeholderTextColor={COLORS.sub} />

        <Text style={s.label}>Prozent %</Text>
        <TextInput placeholder="%" value={doc.percent} onChangeText={calcFromPercent} style={s.input} placeholderTextColor={COLORS.sub} keyboardType="decimal-pad" />

        <Text style={s.label}>Betrag €</Text>
        <TextInput placeholder="Betrag €" value={doc.betrag} onChangeText={calcFromAmount} style={s.input} placeholderTextColor={COLORS.sub} keyboardType="decimal-pad" />

        <Text style={s.label}>Notiz</Text>
        <TextInput placeholder="Notiz" value={doc.note} onChangeText={v => setDoc((p: any) => ({
          ...p,
          note: v
        }))} style={[s.input, s.textArea]} placeholderTextColor={COLORS.sub} multiline />

        </View>

        <View style={s.actionRow}>
        <Pressable style={s.btn} onPress={pdf}>
          <Text style={s.btnTxt}>PDF</Text>
        </Pressable>

        <Pressable style={s.save} onPress={save}>
          <Text style={s.btnTxt}>Speichern</Text>
        </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>;
}
const s = createRlcStyles("AbschlagEditorScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  wrap: {
    padding: 12,
    paddingBottom: 28,
    gap: 8
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  loading: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 15
  },
  emptyText: {
    color: COLORS.sub,
    fontWeight: "600",
    marginTop: 7,
    textAlign: "center",
    fontSize: 12
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 1
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: COLORS.text
  },
  pageSub: {
    marginTop: 2,
    color: COLORS.sub,
    fontSize: 11,
    fontWeight: "600"
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10
  },
  infoLabel: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 10,
    marginTop: 2
  },
  infoValue: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 2,
    marginBottom: 5
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 27
  },
  summaryLabel: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 11
  },
  summaryValue: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12
  },
  summaryStrongLabel: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12
  },
  summaryStrongValue: {
    color: COLORS.accent,
    fontWeight: "700",
    fontSize: 15
  },
  existingCard: {
    display: "none"
  },
  existingTitle: {
    display: "none"
  },
  existingRow: {
    display: "none"
  },
  existingName: {
    display: "none"
  },
  existingMeta: {
    display: "none"
  },
  existingPdfBtn: {
    display: "none"
  },
  existingPdfTxt: {
    display: "none"
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10
  },
  formTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4
  },
  label: {
    color: COLORS.sub,
    fontWeight: "600",
    fontSize: 11,
    marginBottom: 2,
    marginTop: 6
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
    borderRadius: 9,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    fontSize: 12
  },
  textArea: {
    minHeight: 58,
    textAlignVertical: "top"
  },
  actionRow: {
    flexDirection: "row",
    gap: 8
  },
  btn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 10,
    borderRadius: 9
  },
  save: {
    flex: 1,
    backgroundColor: COLORS.accent,
    padding: 10,
    borderRadius: 9
  },
  btnTxt: {
    color: COLORS.textLight,
    textAlign: "center",
    fontWeight: "700",
    fontSize: 12
  }
});
