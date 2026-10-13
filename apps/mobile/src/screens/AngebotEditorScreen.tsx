// apps/mobile/src/screens/AngebotEditorScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS, RLC_SPACING, RLC_RADIUS } from "../ui/theme";
import { buildDocumentPdf } from "../lib/exporters/documentPdfBuilder";
import { api } from "../lib/api";
import { submitToEingangPruefung } from "../lib/submitToEingangPruefung";
import { registerRlcKiModuleHandler } from "../lib/rlcKiModuleBridge";
import { parseRlcKiSmartDoc } from "../lib/rlcKiSmartParser";
type Props = NativeStackScreenProps<RootStackParamList, "AngebotEditor">;

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

  createdAt: string;
  updatedAt: string;
};

const OFFER_STORAGE_PREFIX = "rlc_angebot_list:";
const KEY_MODE = "rlc_mobile_mode";
const ANGEBOT_STATUSES: AngebotStatus[] = [
  "Entwurf",
  "Gesendet",
  "Angenommen",
  "Abgelehnt",
];

function offerListKey(projectCode: string) {
  return `${OFFER_STORAGE_PREFIX}${projectCode}`;
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayDE() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function plusDaysDE(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function cleanNumInput(v: string) {
  return v.replace(",", ".").replace(/[^\d.\-]/g, "");
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

function createEmptyRow(index: number): AngebotRow {
  return {
    id: makeId(),
    pos: String(index + 1),
    text: "",
    unit: "",
    quantity: "",
    ep: "",
  };
}

function normalizeStatus(v: any): AngebotStatus {
  return ANGEBOT_STATUSES.includes(v) ? v : "Entwurf";
}

function normalizeOfferDoc(input: any): AngebotDoc {
  return {
    id: String(input?.id || makeId()),
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
    rows:
      Array.isArray(input?.rows) && input.rows.length
        ? input.rows.map((r: any, i: number) => ({
            id: String(r?.id || makeId()),
            pos: String(r?.pos || i + 1),
            text: String(r?.text || ""),
            unit: String(r?.unit || ""),
            quantity: String(r?.quantity || ""),
            ep: String(r?.ep || ""),
          }))
        : [createEmptyRow(0)],

    createdAt: String(input?.createdAt || new Date().toISOString()),
    updatedAt: String(input?.updatedAt || new Date().toISOString()),
  };
}

function createEmptyOffer(params: {
  projectId: string;
  projectCode: string;
  title?: string;
}): AngebotDoc {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    projectId: params.projectId,
    projectCode: params.projectCode,
    title: params.title,

    angebotNr: `ANG-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    angebotTitle: "Angebot",
    status: "Entwurf",

    customerName: "",
    customerAddress: "",
    customerEmail: "",
    customerPhone: "",

    baustelle: params.title || "",
    datum: todayDE(),
    validUntil: plusDaysDE(14),

    rabattPct: "0",
    zuschlagPct: "0",
    mwstPct: "19",

    note: "",
    rows: [createEmptyRow(0)],

    createdAt: now,
    updatedAt: now,
  };
}

async function loadOffer(projectCode: string, angebotId: string) {
  const raw = await AsyncStorage.getItem(offerListKey(projectCode));
  const list: AngebotDoc[] = raw ? JSON.parse(raw) : [];
  const found = list.find((x) => x.id === angebotId) || null;
  return found ? normalizeOfferDoc(found) : null;
}

async function saveOffer(doc: AngebotDoc) {
  const key = offerListKey(doc.projectCode);
  const raw = await AsyncStorage.getItem(key);
  const list: AngebotDoc[] = raw ? JSON.parse(raw) : [];

  const idx = list.findIndex((x) => x.id === doc.id);
  const next = normalizeOfferDoc({
    ...doc,
    updatedAt: new Date().toISOString(),
  });

  if (idx >= 0) {
    list[idx] = next;
  } else {
    list.unshift(next);
  }

  await AsyncStorage.setItem(key, JSON.stringify(list));
  return next;
}

async function getMode(): Promise<"NUR_APP" | "SERVER_SYNC"> {
  const raw = await AsyncStorage.getItem(KEY_MODE);
  return raw === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
}

async function loadOfferSmart(projectCode: string, angebotId: string) {
  // Prima locale: evita che server vuoto/stale azzeri l'offerta in modifica
  const local = await loadOffer(projectCode, angebotId);
  if (local && Array.isArray((local as any).rows) && (local as any).rows.length) {
    return local;
  }

  const mode = await getMode();
  if (mode === "NUR_APP") return local;

  try {
    const list = await api.getAngebote(projectCode);
    const found = Array.isArray(list)
      ? list.find((x: any) => String(x?.id) === String(angebotId))
      : null;

    if (found && Array.isArray(found?.rows) && found.rows.length) {
      const normalized = normalizeOfferDoc(found);
      await saveOffer(normalized);
      return normalized;
    }
  } catch (e) {
    console.log("loadOfferSmart server fallback -> local", e);
  }

  return local;
}
async function saveOfferSmart(doc: AngebotDoc) {
  const mode = await getMode();

  const next = normalizeOfferDoc({
    ...doc,
    updatedAt: new Date().toISOString(),
  });

  if (mode === "NUR_APP") {
    return saveOffer(next);
  }

  try {
    await api.saveAngebot(next.projectCode, next);
    await saveOffer(next); // cache locale aggiornata
    return next;
  } catch (e) {
    console.log("saveOfferSmart server fallback -> local", e);
    return saveOffer(next);
  }
}

async function syncAngebotToMengenAuto(saved: any) {
  const projectCode = String(saved?.projectCode || "").trim();
  if (!projectCode || !saved?.id) return;

  const key = `rlc_mengen_list:${projectCode}`;
  const raw = await AsyncStorage.getItem(key);
  const list = raw ? JSON.parse(raw) : [];
  const next = Array.isArray(list) ? list : [];

  const existingIdx = next.findIndex((x: any) => String(x?.angebotId || "") === String(saved.id));

  const rows = Array.isArray(saved?.rows)
    ? saved.rows.map((r: any, i: number) => ({
        id: String(r?.id || `${Date.now()}_${i}`),
        pos: String(r?.pos || i + 1),
        text: String(r?.text || r?.beschreibung || ""),
        unit: String(r?.unit || r?.einheit || ""),
        formula: "",
        qty: String(r?.quantity ?? r?.qty ?? r?.menge ?? "0"),
        ep: String(r?.ep ?? r?.price ?? r?.einzelpreis ?? "0"),
        angebotRowId: r?.id ? String(r.id) : null,
      }))
    : [];

  const mengenDoc = {
    id: existingIdx >= 0 ? next[existingIdx].id : `mengen_${Date.now()}`,
    projectId: saved.projectId,
    projectCode,
    sourceType: "ANGEBOT",
    sourceLocked: true,
    angebotId: String(saved.id),
    angebotSnapshot: saved,
    title: String(saved?.angebotTitle || saved?.angebotNr || "Mengenermittlung"),
    datum: new Date().toISOString().slice(0, 10),
    pdfUri: "",
    rows: rows.length ? rows : [{
      id: `${Date.now()}_0`,
      pos: "1",
      text: "",
      unit: "",
      formula: "",
      qty: "0",
      ep: "0",
      angebotRowId: null,
    }],
    createdAt: existingIdx >= 0 ? next[existingIdx].createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
  };

  if (existingIdx >= 0) next[existingIdx] = mengenDoc;
  else next.unshift(mengenDoc);

  await AsyncStorage.setItem(key, JSON.stringify(next));
}
async function exportOfferPdf(params: {
  doc: AngebotDoc;
  netto: number;
  rabattValue: number;
  zuschlagValue: number;
  nettoFinal: number;
  mwstValue: number;
  brutto: number;
}) {
  const {
    doc,
    netto,
    rabattValue,
    zuschlagValue,
    nettoFinal,
    mwstValue,
    brutto,
  } = params;

  const rows = (doc.rows || []).map((r) => {
    const qty = toNum(r.quantity);
    const ep = toNum(r.ep);
    const gp = qty * ep;

    return {
      pos: r.pos,
      text: r.text,
      unit: r.unit,
      quantity: r.quantity,
      ep: r.ep,
      gp,
    };
  });

  const out = await buildDocumentPdf({
    type: "ANGEBOT",
    projectCode: doc.projectCode,
    fileName: `${doc.angebotNr || "angebot"}.pdf`,
    title: doc.angebotTitle || "Angebot",
    subTitle: doc.status || "Entwurf",
    docNo: doc.angebotNr || "",
    date: doc.datum || "",
    customer: {
      name: doc.customerName || "",
      address: doc.customerAddress || "",
      email: doc.customerEmail || "",
      phone: doc.customerPhone || "",
    },
    rows,
    totals: {
      netto,
      rabattValue,
      zuschlagValue,
      nettoFinal,
      mwstValue,
      brutto,
    } as any,
    extraBlocks: [
      {
        title: "Projekt / Baustelle",
        lines: [
          doc.baustelle || "",
          doc.validUntil ? `Gültig bis: ${doc.validUntil}` : "",
        ].filter(Boolean),
      },
      {
        title: "Zusammenfassung",
        lines: [
          `Netto: ${fmtMoney(netto)} €`,
          `Rabatt: ${fmtMoney(rabattValue)} €`,
          `Zuschlag: ${fmtMoney(zuschlagValue)} €`,
          `Netto gesamt: ${fmtMoney(nettoFinal)} €`,
          `MwSt.: ${fmtMoney(mwstValue)} €`,
          `Brutto: ${fmtMoney(brutto)} €`,
        ],
      },
    ],
    note: doc.note || "",
    shareAfterCreate: false,
  });

  return out;
}

async function exportOfferExcel(params: {
  doc: AngebotDoc;
  netto: number;
  rabattValue: number;
  zuschlagValue: number;
  nettoFinal: number;
  mwstValue: number;
  brutto: number;
}) {
  const {
    doc,
    netto,
    rabattValue,
    zuschlagValue,
    nettoFinal,
    mwstValue,
    brutto,
  } = params;

  const rows = doc.rows.map((r) => {
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
    { Feld: "Angebotsnummer", Wert: doc.angebotNr || "" },
    { Feld: "Angebotstitel", Wert: doc.angebotTitle || "" },
    { Feld: "Status", Wert: doc.status || "Entwurf" },
    { Feld: "Kunde", Wert: doc.customerName || "" },
    { Feld: "Adresse", Wert: doc.customerAddress || "" },
    { Feld: "E-Mail", Wert: doc.customerEmail || "" },
    { Feld: "Telefon", Wert: doc.customerPhone || "" },
    { Feld: "Baustelle", Wert: doc.baustelle || "" },
    { Feld: "Datum", Wert: doc.datum || "" },
    { Feld: "Gültig bis", Wert: doc.validUntil || "" },
    { Feld: "Rabatt %", Wert: toNum(doc.rabattPct) },
    { Feld: "Zuschlag %", Wert: toNum(doc.zuschlagPct) },
    { Feld: "MwSt %", Wert: toNum(doc.mwstPct) },
    { Feld: "Zwischensumme netto", Wert: netto },
    { Feld: "Rabatt Wert", Wert: rabattValue },
    { Feld: "Zuschlag Wert", Wert: zuschlagValue },
    { Feld: "Netto gesamt", Wert: nettoFinal },
    { Feld: "MwSt Wert", Wert: mwstValue },
    { Feld: "Endsumme brutto", Wert: brutto },
    { Feld: "Bemerkung", Wert: doc.note || "" },
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(rows);
  const ws2 = XLSX.utils.json_to_sheet(summary);

  XLSX.utils.book_append_sheet(wb, ws1, "Positionen");
  XLSX.utils.book_append_sheet(wb, ws2, "Zusammenfassung");

  const base64 = XLSX.write(wb, {
    type: "base64",
    bookType: "xlsx",
  });

  const fileName = `${doc.angebotNr || "angebot"}.xlsx`;
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

export default function AngebotEditorScreen({ route, navigation }: Props) {
  const { projectId, projectCode: routeProjectCode, title } = route.params;
  const projectCode = String(routeProjectCode || projectId || "").trim();
  const angebotId = String((route.params as any)?.angebotId || (route.params as any)?.docId || (route.params as any)?.editId || "").trim() || undefined;

  const [doc, setDoc] = useState<AngebotDoc>(() =>
    createEmptyOffer({ projectId, projectCode, title })
  );
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isAccepted = doc.status === "Angenommen";

  useLayoutEffect(() => {
    navigation.setOptions({
      title: angebotId ? "Angebot bearbeiten" : "Angebot erstellen",
    });
  }, [navigation, angebotId]);

  const hydrate = useCallback(async () => {
    try {
      setBusy(true);

      if (!angebotId) {
        setDoc(createEmptyOffer({ projectId, projectCode, title }));
        setLoaded(true);
        return;
      }

      const found = await loadOfferSmart(projectCode, angebotId);
if (found) {
  setDoc(found);
}
      setLoaded(true);
    } catch (e: any) {
      Alert.alert(
        "Angebot",
        String(e?.message || "Angebot konnte nicht geladen werden")
      );
      setLoaded(true);
    } finally {
      setBusy(false);
    }
  }, [angebotId, projectCode, projectId, title]);

  useFocusEffect(
    useCallback(() => {
      void hydrate();
    }, [hydrate])
  );

  function showLockedAlert() {
    Alert.alert(
      "Gesperrt",
      "Dieses Angebot ist angenommen und kann nicht mehr bearbeitet werden."
    );
  }

  function setField<K extends keyof AngebotDoc>(key: K, value: AngebotDoc[K]) {
    setDoc((prev) => ({
      ...prev,
      [key]: value,
      updatedAt: new Date().toISOString(),
    }));
  }

  function setRow(rowId: string, patch: Partial<AngebotRow>) {
    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  }

  function addRow() {
    if (isAccepted) {
      showLockedAlert();
      return;
    }

    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: [...prev.rows, createEmptyRow(prev.rows.length)],
    }));
  }

  function removeRow(rowId: string) {
    if (isAccepted) {
      showLockedAlert();
      return;
    }

    setDoc((prev) => {
      if (prev.rows.length <= 1) {
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          rows: [createEmptyRow(0)],
        };
      }
      const nextRows = prev.rows.filter((r) => r.id !== rowId);
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        rows: nextRows.map((r, i) => ({
          ...r,
          pos: r.pos.trim() || String(i + 1),
        })),
      };
    });
  }

  const calcRows = useMemo(() => {
    return doc.rows.map((r) => {
      const qty = toNum(r.quantity);
      const ep = toNum(r.ep);
      const gp = qty * ep;
      return { ...r, qty, epNum: ep, gp };
    });
  }, [doc.rows]);

  const netto = useMemo(
    () => calcRows.reduce((sum, r) => sum + r.gp, 0),
    [calcRows]
  );

  const rabattValue = useMemo(() => {
    const pct = toNum(doc.rabattPct);
    return (netto * pct) / 100;
  }, [doc.rabattPct, netto]);

  const afterRabatt = useMemo(() => netto - rabattValue, [netto, rabattValue]);

  const zuschlagValue = useMemo(() => {
    const pct = toNum(doc.zuschlagPct);
    return (afterRabatt * pct) / 100;
  }, [doc.zuschlagPct, afterRabatt]);

  const nettoFinal = useMemo(
    () => afterRabatt + zuschlagValue,
    [afterRabatt, zuschlagValue]
  );

  const mwstValue = useMemo(() => {
    const pct = toNum(doc.mwstPct);
    return (nettoFinal * pct) / 100;
  }, [doc.mwstPct, nettoFinal]);

  const brutto = useMemo(() => nettoFinal + mwstValue, [nettoFinal, mwstValue]);

  async function normalizeAndSaveCurrentDoc() {
    const normalized: AngebotDoc = normalizeOfferDoc({
      ...doc,
      angebotTitle: doc.angebotTitle.trim() || "Angebot",
      angebotNr: doc.angebotNr.trim() || `ANG-${Date.now()}`,
      status: normalizeStatus(doc.status),
      customerName: doc.customerName.trim(),
      customerAddress: doc.customerAddress.trim(),
      customerEmail: doc.customerEmail.trim(),
      customerPhone: doc.customerPhone.trim(),
      baustelle: doc.baustelle.trim(),
      datum: doc.datum.trim(),
      validUntil: doc.validUntil.trim(),
      rabattPct: cleanNumInput(doc.rabattPct),
      zuschlagPct: cleanNumInput(doc.zuschlagPct),
      mwstPct: cleanNumInput(doc.mwstPct),
      note: doc.note.trim(),
      updatedAt: new Date().toISOString(),
      rows: doc.rows.map((r, i) => ({
        ...r,
        pos: r.pos.trim() || String(i + 1),
        text: r.text.trim(),
        unit: r.unit.trim(),
        quantity: cleanNumInput(r.quantity),
        ep: cleanNumInput(r.ep),
      })),
    });

    const saved = await saveOfferSmart(normalized);
    await syncAngebotToMengenAuto(saved);
    setDoc(saved);
    return saved;
  }

  async function onSave() {
    try {
      setBusy(true);

      if (isAccepted) {
        Alert.alert(
          "Gesperrt",
          "Dieses Angebot ist angenommen und kann nicht mehr geändert werden."
        );
        return;
      }

      const saved = await normalizeAndSaveCurrentDoc();

      await submitToEingangPruefung({
        type: "ANGEBOT",
        projectKey: saved.projectCode || projectCode,
        projectId: saved.projectId || projectId,
        projectCode: saved.projectCode || projectCode,
        title: saved.angebotTitle || saved.angebotNr || "Angebot",
        doc: saved,
        pdfUri: (saved as any)?.pdfUri || null,
        status: "EINGEREICHT",
        sourceScreen: "AngebotEditor",
      });

      Alert.alert("Angebot", "Angebot gespeichert.", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (e: any) {
      Alert.alert(
        "Fehler",
        String(e?.message || "Angebot konnte nicht gespeichert werden")
      );
    } finally {
      setBusy(false);
    }
  }

  async function onExportPdf() {
    try {
      setBusy(true);

      const saved = await normalizeAndSaveCurrentDoc();

      const out: any = await exportOfferPdf({
        doc: saved,
        netto,
        rabattValue,
        zuschlagValue,
        nettoFinal,
        mwstValue,
        brutto,
      });

      const pdfUri = String(out?.pdfUri || out?.uri || "").trim();

      if (!pdfUri) {
        throw new Error("PDF wurde erstellt, aber kein pdfUri zurückgegeben.");
      }

      const withPdf = await saveOfferSmart({ ...(saved as any), pdfUri } as any);
      setDoc(withPdf as any);

      await submitToEingangPruefung({
        type: "ANGEBOT",
        projectKey: withPdf.projectCode || projectCode,
        projectId: withPdf.projectId || projectId,
        projectCode: withPdf.projectCode || projectCode,
        title: withPdf.angebotTitle || withPdf.angebotNr || "Angebot",
        doc: withPdf,
        pdfUri,
        status: "EINGEREICHT",
        sourceScreen: "AngebotEditor",
      });

      await Linking.openURL(pdfUri);
    } catch (e: any) {
      Alert.alert("PDF Export", String(e?.message || "PDF Export fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  }

  async function onExportExcel() {
    try {
      setBusy(true);
      const saved = await normalizeAndSaveCurrentDoc();
      await exportOfferExcel({
        doc: saved,
        netto,
        rabattValue,
        zuschlagValue,
        nettoFinal,
        mwstValue,
        brutto,
      });
    } catch (e: any) {
      Alert.alert(
        "Excel Export",
        String(e?.message || "Excel Export fehlgeschlagen")
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCreateMengen() {
    try {
      const saved = await normalizeAndSaveCurrentDoc();

      if (saved.status !== "Angenommen") {
        Alert.alert(
          "Mengenermittlung",
          "Eine Mengenermittlung soll hier nur aus einem angenommenen Angebot gestartet werden."
        );
        return;
      }

      navigation.navigate("MengenEditor", {
        projectId,
        projectCode,
        title: "Mengenermittlung",
        angebotId: saved.id,
      });
    } catch (e: any) {
      Alert.alert(
        "Mengenermittlung",
        String(e?.message || "Mengenermittlung konnte nicht vorbereitet werden")
      );
    }
  }

  async function onCreateRechnung() {
    try {
      const saved = await normalizeAndSaveCurrentDoc();

      if (saved.status !== "Angenommen") {
        Alert.alert(
          "Rechnung",
          "Eine Rechnung kann nur aus einem angenommenen Angebot erstellt werden."
        );
        return;
      }

      navigation.navigate("RechnungEditor", {
        projectId,
        projectCode,
        title,
        fromAngebotId: saved.id,
      });
    } catch (e: any) {
      Alert.alert(
        "Rechnung",
        String(e?.message || "Rechnung konnte nicht vorbereitet werden")
      );
    }
  }


  // RLC_KI_MODULE_HANDLER_ANGEBOT_V2_SMART
  useEffect(() => {
    return registerRlcKiModuleHandler("AngebotEditor", async (payload: any) => {
      const input = String(payload?.input || "").trim();
      const parsed = parseRlcKiSmartDoc(input);

      if (isAccepted) {
        return { ok: true, handled: true, message: "ANGEBOT_LOCKED" };
      }

      setDoc((prev) => {
        const parsedRows = parsed.rows.length
          ? parsed.rows.map((r: any, i: number) => ({
              id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
              pos: r.pos || String(i + 1),
              text: r.text || "",
              unit: r.unit || "",
              quantity: r.qty || "",
              ep: r.ep || "",
            }))
          : prev.rows;

        return {
          ...prev,
          angebotNr: parsed.angebotNr || prev.angebotNr,
          angebotTitle: parsed.title || prev.angebotTitle || "Angebot",
          baustelle: parsed.baustelle || prev.baustelle,
          datum: parsed.datum || prev.datum,
          customerName: parsed.customerName || prev.customerName,
          customerAddress: parsed.address || prev.customerAddress,
          customerEmail: parsed.email || prev.customerEmail,
          customerPhone: parsed.phone || prev.customerPhone,
          note:
            parsed.warnings?.length
              ? `${parsed.note || ""}

RLC KI Hinweise:
${parsed.warnings.map((w: string) => `- ${w}`).join("\n")}`
              : parsed.note || prev.note,
          rows: parsedRows,
          updatedAt: new Date().toISOString(),
        };
      });

      return {
        ok: true,
        handled: true,
        message: parsed.rows.length ? "ANGEBOT_SMART_ROWS_FILLED" : "ANGEBOT_SMART_FIELDS_FILLED",
      };
    });
  }, [isAccepted]);
  if (!loaded) {
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
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={s.wrap}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.hero}>
            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.eyebrow}>RLC Bausoftware</Text>
                <Text style={s.title}>Angebot</Text>
                <Text style={s.sub}>
                  Professionelles Angebot mit Status, Positionen, Netto, Rabatt,
                  Zuschlag und MwSt.
                </Text>
                {isAccepted ? (
                  <Text style={s.lockInfo}>
                    Dieses Angebot ist angenommen und schreibgeschützt.
                  </Text>
                ) : null}
              </View>

              <Pressable
                style={[s.kiBtn, { display: "none" }]}
                onPress={() =>
                  navigation.navigate("SupportChat", {
                    projectId,
                    projectCode,
                    title: "RLC KI",
                    screen: "AngebotEditor",
                  })
                }
              >
                <Text style={s.kiBtnTxt}>RLC KI</Text>
              </Pressable>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.section}>Stammdaten</Text>

            <Label text="Angebotsnummer" />
            <TextInput
              value={doc.angebotNr}
              onChangeText={(v) => setField("angebotNr", v)}
              style={[s.input, isAccepted && s.inputLocked]}
              placeholder="ANG-2026-0001"
              placeholderTextColor={COLORS.sub}
              editable={!isAccepted}
            />

            <Label text="Angebotstitel" />
            <TextInput
              value={doc.angebotTitle}
              onChangeText={(v) => setField("angebotTitle", v)}
              style={[s.input, isAccepted && s.inputLocked]}
              placeholder="Angebot Tiefbauarbeiten"
              placeholderTextColor={COLORS.sub}
              editable={!isAccepted}
            />

            <Label text="Status" />
            <View style={s.statusRow}>
              {ANGEBOT_STATUSES.map((status) => {
                const active = doc.status === status;
                const chipLocked = isAccepted && status !== "Angenommen";

                return (
                  <Pressable
                    key={status}
                    style={[
                      s.statusChip,
                      active && s.statusChipActive,
                      chipLocked && s.disabled,
                    ]}
                    onPress={() => {
                      if (isAccepted && status !== "Angenommen") {
                        showLockedAlert();
                        return;
                      }
                      setField("status", status);
                    }}
                  >
                    <Text style={[s.statusChipTxt, active && s.statusChipTxtActive]}>
                      {status}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Row2>
              <View style={s.col}>
                <Label text="Datum" />
                <TextInput
                  value={doc.datum}
                  onChangeText={(v) => setField("datum", v)}
                  style={[s.input, isAccepted && s.inputLocked]}
                  placeholder="08.04.2026"
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />
              </View>
              <View style={s.col}>
                <Label text="Gültig bis" />
                <TextInput
                  value={doc.validUntil}
                  onChangeText={(v) => setField("validUntil", v)}
                  style={[s.input, isAccepted && s.inputLocked]}
                  placeholder="22.04.2026"
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />
              </View>
            </Row2>

            <Label text="Baustelle / Projekt" />
            <TextInput
              value={doc.baustelle}
              onChangeText={(v) => setField("baustelle", v)}
              style={[s.input, isAccepted && s.inputLocked]}
              placeholder="Projekt / Baustelle"
              placeholderTextColor={COLORS.sub}
              editable={!isAccepted}
            />
          </View>

          <View style={s.card}>
            <Text style={s.section}>Kunde</Text>

            <Label text="Kundenname" />
            <TextInput
              value={doc.customerName}
              onChangeText={(v) => setField("customerName", v)}
              style={[s.input, isAccepted && s.inputLocked]}
              placeholder="Max Mustermann"
              placeholderTextColor={COLORS.sub}
              editable={!isAccepted}
            />

            <Label text="Adresse" />
            <TextInput
              value={doc.customerAddress}
              onChangeText={(v) => setField("customerAddress", v)}
              style={[s.input, s.inputArea, isAccepted && s.inputLocked]}
              multiline
              placeholder="Straße, PLZ Ort"
              placeholderTextColor={COLORS.sub}
              editable={!isAccepted}
            />

            <Row2>
              <View style={s.col}>
                <Label text="E-Mail" />
                <TextInput
                  value={doc.customerEmail}
                  onChangeText={(v) => setField("customerEmail", v)}
                  style={[s.input, isAccepted && s.inputLocked]}
                  placeholder="kunde@email.de"
                  placeholderTextColor={COLORS.sub}
                  autoCapitalize="none"
                  editable={!isAccepted}
                />
              </View>
              <View style={s.col}>
                <Label text="Telefon" />
                <TextInput
                  value={doc.customerPhone}
                  onChangeText={(v) => setField("customerPhone", v)}
                  style={[s.input, isAccepted && s.inputLocked]}
                  placeholder="+49 ..."
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />
              </View>
            </Row2>
          </View>

          <View style={s.card}>
            <View style={s.sectionRow}>
              <Text style={s.section}>Positionen</Text>
              <Pressable
                style={[s.addBtn, isAccepted && s.disabled]}
                onPress={addRow}
              >
                <Text style={s.addBtnTxt}>+ Position</Text>
              </Pressable>
            </View>

            {calcRows.map((row, idx) => (
              <View key={row.id} style={s.rowCard}>
                <Row2>
                  <View style={[s.col, { flex: 0.9 }]}>
                    <Label text="Pos." />
                    <TextInput
                      value={row.pos}
                      onChangeText={(v) => setRow(row.id, { pos: v })}
                      style={[s.input, isAccepted && s.inputLocked]}
                      placeholder={String(idx + 1)}
                      placeholderTextColor={COLORS.sub}
                      editable={!isAccepted}
                    />
                  </View>

                  <View style={[s.col, { flex: 1.1 }]}>
                    <Label text="Einheit" />
                    <TextInput
                      value={row.unit}
                      onChangeText={(v) => setRow(row.id, { unit: v })}
                      style={[s.input, isAccepted && s.inputLocked]}
                      placeholder="m / m² / Stk"
                      placeholderTextColor={COLORS.sub}
                      editable={!isAccepted}
                    />
                  </View>
                </Row2>

                <Label text="Beschreibung" />
                <TextInput
                  value={row.text}
                  onChangeText={(v) => setRow(row.id, { text: v })}
                  style={[s.input, s.inputArea, isAccepted && s.inputLocked]}
                  multiline
                  placeholder="Leistungsbeschreibung"
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />

                <Row3>
                  <View style={s.col}>
                    <Label text="Menge" />
                    <TextInput
                      value={row.quantity}
                      onChangeText={(v) =>
                        setRow(row.id, { quantity: cleanNumInput(v) })
                      }
                      style={[s.input, isAccepted && s.inputLocked]}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={COLORS.sub}
                      editable={!isAccepted}
                    />
                  </View>

                  <View style={s.col}>
                    <Label text="EP" />
                    <TextInput
                      value={row.ep}
                      onChangeText={(v) =>
                        setRow(row.id, { ep: cleanNumInput(v) })
                      }
                      style={[s.input, isAccepted && s.inputLocked]}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={COLORS.sub}
                      editable={!isAccepted}
                    />
                  </View>

                  <View style={s.col}>
                    <Label text="GP" />
                    <View style={s.readonlyBox}>
                      <Text style={s.readonlyText}>{fmtMoney(row.gp)}</Text>
                    </View>
                  </View>
                </Row3>

                <Pressable
                  style={[s.removeBtn, isAccepted && s.disabled]}
                  onPress={() => removeRow(row.id)}
                >
                  <Text style={s.removeBtnTxt}>Position löschen</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={s.card}>
            <Text style={s.section}>Konditionen</Text>

            <Row3>
              <View style={s.col}>
                <Label text="Rabatt %" />
                <TextInput
                  value={doc.rabattPct}
                  onChangeText={(v) => setField("rabattPct", cleanNumInput(v))}
                  style={[s.input, isAccepted && s.inputLocked]}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />
              </View>

              <View style={s.col}>
                <Label text="Zuschlag %" />
                <TextInput
                  value={doc.zuschlagPct}
                  onChangeText={(v) =>
                    setField("zuschlagPct", cleanNumInput(v))
                  }
                  style={[s.input, isAccepted && s.inputLocked]}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />
              </View>

              <View style={s.col}>
                <Label text="MwSt %" />
                <TextInput
                  value={doc.mwstPct}
                  onChangeText={(v) => setField("mwstPct", cleanNumInput(v))}
                  style={[s.input, isAccepted && s.inputLocked]}
                  keyboardType="decimal-pad"
                  placeholder="19"
                  placeholderTextColor={COLORS.sub}
                  editable={!isAccepted}
                />
              </View>
            </Row3>

            <Label text="Bemerkung / Hinweis" />
            <TextInput
              value={doc.note}
              onChangeText={(v) => setField("note", v)}
              style={[s.input, s.inputAreaLarge, isAccepted && s.inputLocked]}
              multiline
              placeholder="Zahlungsbedingungen, Ausführungshinweise, Sonstiges..."
              placeholderTextColor={COLORS.sub}
              editable={!isAccepted}
            />
          </View>

          <View style={s.summary}>
            <Text style={s.summaryTitle}>Summen</Text>

            <SumRow label="Zwischensumme netto" value={fmtMoney(netto)} />
            <SumRow
              label={`Rabatt (${toNum(doc.rabattPct)} %)`}
              value={`- ${fmtMoney(rabattValue)}`}
            />
            <SumRow
              label={`Zuschlag (${toNum(doc.zuschlagPct)} %)`}
              value={`+ ${fmtMoney(zuschlagValue)}`}
            />
            <SumRow label="Netto gesamt" value={fmtMoney(nettoFinal)} />
            <SumRow
              label={`MwSt (${toNum(doc.mwstPct)} %)`}
              value={fmtMoney(mwstValue)}
            />
            <View style={s.sumDivider} />
            <SumRow label="Endsumme brutto" value={fmtMoney(brutto)} strong />
          </View>

          {doc.status === "Angenommen" ? (
            <View style={s.flowButtons}>
              <Pressable
                style={[s.flowBtnOrange, busy && s.disabled]}
                onPress={onCreateMengen}
                disabled={busy}
              >
                <Text style={s.flowBtnTxt}>Mengenermittlung erstellen</Text>
              </Pressable>

              <Pressable
                style={[s.createInvoiceBtn, busy && s.disabled]}
                onPress={onCreateRechnung}
                disabled={busy}
              >
                <Text style={s.createInvoiceBtnTxt}>Rechnung erstellen</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={s.actionGrid}>
            <Pressable
              style={[s.actionBtn, s.actionBtnSecondary, busy && s.disabled]}
              onPress={onExportPdf}
              disabled={busy}
            >
              <Text style={s.actionBtnSecondaryTxt}>PDF</Text>
            </Pressable>

            <Pressable
              style={[s.actionBtn, s.actionBtnSecondary, busy && s.disabled]}
              onPress={onExportExcel}
              disabled={busy}
            >
              <Text style={s.actionBtnSecondaryTxt}>Excel exportieren</Text>
            </Pressable>
          </View>

          <Pressable
            style={[s.saveBtn, (busy || isAccepted) && s.disabled]}
            onPress={onSave}
            disabled={busy || isAccepted}
          >
            <Text style={s.saveBtnTxt}>
              {busy
                ? "Speichert..."
                : isAccepted
                ? "Angebot gesperrt"
                : "Angebot speichern"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={s.label}>{text}</Text>;
}

function Row2({ children }: { children: React.ReactNode }) {
  return <View style={s.row2}>{children}</View>;
}

function Row3({ children }: { children: React.ReactNode }) {
  return <View style={s.row3}>{children}</View>;
}

function SumRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={s.sumRow}>
      <Text style={[s.sumLabel, strong && s.sumStrong]}>{label}</Text>
      <Text style={[s.sumValue, strong && s.sumStrong]}>{value} €</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },
  loading: { color: COLORS.text, fontWeight: "900", fontSize: 16 },

  wrap: {
    padding: RLC_SPACING.page,
    paddingBottom: 32,
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

  lockInfo: {
    marginTop: 10,
    color: COLORS.accentDark,
    fontWeight: "900",
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

  section: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 10,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  addBtn: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  addBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
  },

  label: {
    color: COLORS.text,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 8,
  },

  input: {
    minHeight: 46,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "700",
  },

  inputLocked: {
    opacity: 0.75,
  },

  inputArea: {
    minHeight: 78,
    textAlignVertical: "top",
  },

  inputAreaLarge: {
    minHeight: 110,
    textAlignVertical: "top",
  },

  row2: {
    flexDirection: "row",
    gap: 10,
  },

  row3: {
    flexDirection: "row",
    gap: 10,
  },

  col: {
    flex: 1,
  },

  rowCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
  },

  readonlyBox: {
    minHeight: 46,
    borderRadius: RLC_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  readonlyText: {
    color: COLORS.text,
    fontWeight: "900",
  },

  removeBtn: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  removeBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
  },

  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },

  statusChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  statusChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  statusChipTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  statusChipTxtActive: {
    color: COLORS.textLight,
  },

  summary: {
    borderRadius: 20,
    padding: RLC_SPACING.page,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },

  summaryTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 10,
  },

  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 5,
  },

  sumLabel: {
    flex: 1,
    color: COLORS.sub,
    fontWeight: "700",
  },

  sumValue: {
    color: COLORS.text,
    fontWeight: "900",
  },

  sumStrong: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  sumDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },

  flowButtons: {
    gap: 10,
    marginBottom: 12,
  },

  flowBtnOrange: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: COLORS.warning,
    borderWidth: 1,
    borderColor: COLORS.warning,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  flowBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 15,
  },

  createInvoiceBtn: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: COLORS.accentDark,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  createInvoiceBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 15,
  },

  actionGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },

  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: RLC_RADIUS.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
  },

  actionBtnSecondary: {
    backgroundColor: COLORS.card2,
    borderColor: COLORS.border,
  },

  actionBtnSecondaryTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
  },

  saveBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  saveBtnTxt: {
    color: COLORS.textLight,
    fontWeight: "900",
    fontSize: 16,
  },

  disabled: {
    opacity: 0.6,
  },
});




























