// apps/mobile/src/screens/RechnungEditorScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import { buildDocumentPdf } from "../lib/exporters/documentPdfBuilder";
import { api } from "../lib/api";
import { submitToEingangPruefung } from "../lib/submitToEingangPruefung";
import { registerRlcKiModuleHandler } from "../lib/rlcKiModuleBridge";
import { parseRlcKiSmartDoc } from "../lib/rlcKiSmartParser";

type Props = NativeStackScreenProps<RootStackParamList, "RechnungEditor">;

const KEY = "rlc_rechnung_list:";
const OFFER_KEY = "rlc_angebot_list:";
const MENGEN_KEY = "rlc_mengen_list:";
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

function sanitizeFileBase(v: string) {
  return String(v || "rechnung")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function normalizeRow(r: any, idx: number) {
  return {
    id: String(r?.id || makeId()),
    pos: String(r?.pos || r?.position || idx + 1),
    text: String(r?.text || r?.beschreibung || r?.title || ""),
    unit: String(r?.unit || r?.einheit || ""),
    qty: String(
      r?.qty ??
        r?.quantity ??
        r?.menge ??
        r?.qtyMeasured ??
        r?.qtyOffered ??
        r?.measuredQty ??
        ""
    ),
    ep: String(r?.ep ?? r?.einzelpreis ?? r?.price ?? "0"),
  };
}

function normalizeAbschlag(a: any, idx: number): AbschlagItem {
  return {
    id: String(a?.id || makeId()),
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

function createEmptyDoc(params: {
  projectId?: string;
  projectCode?: string;
  fromAngebotId?: string | null;
  fromMengen?: boolean;
  fromMengenId?: string | null;
}) {
  return {
    id: makeId(),

    projectId: String(params.projectId || ""),
    projectCode: String(params.projectCode || ""),

    sourceType: params.fromMengen
      ? "MENGEN"
      : params.fromAngebotId
      ? "ANGEBOT"
      : "FREE",

    angebotId: params.fromAngebotId || null,
    mengenId: params.fromMengenId || null,
    mengenPdfUri: "",
    mengenTitle: "",
    rechnungFromMengen: !!params.fromMengen,

    rechnungNr: `RE-${new Date().getFullYear()}-${Date.now()
      .toString()
      .slice(-5)}`,

    datum: new Date().toISOString().slice(0, 10),
    leistungszeitraum: "",

    customerName: "",
    address: "",
    email: "",
    phone: "",

    iban: "",
    bic: "",
    bank: "",
    owner: "",

    steuerNr: "",
    ustId: "",

    zahlungsziel: "14 Tage",
    mwstPct: "19",

    note: "",
    pdfUri: "",
    abschlaege: [] as AbschlagItem[],
    updatedAt: Date.now(),
    createdAt: Date.now(),

    rows: [
      {
        id: makeId(),
        pos: "1",
        text: "",
        unit: "",
        qty: "",
        ep: "",
      },
    ],
  };
}

function isEffectivelyEmpty(doc: any) {
  const first = Array.isArray(doc?.rows) ? doc.rows[0] : null;
  const hasRows =
    Array.isArray(doc?.rows) &&
    doc.rows.some(
      (r: any) =>
        String(r?.text || "").trim() ||
        String(r?.unit || "").trim() ||
        String(r?.qty || "").trim() ||
        String(r?.ep || "").trim()
    );

  return (
    !String(doc?.customerName || "").trim() &&
    !String(doc?.address || "").trim() &&
    !String(doc?.email || "").trim() &&
    !String(doc?.phone || "").trim() &&
    !hasRows &&
    !!first
  );
}

function normalizeAngebotToRechnung(a: any, prev: any) {
  const rows =
    Array.isArray(a?.rows) && a.rows.length
      ? a.rows.map((r: any, i: number) =>
          normalizeRow(
            {
              id: r?.id,
              pos: r?.pos,
              text: r?.text || r?.beschreibung,
              unit: r?.unit || r?.einheit,
              qty: r?.quantity ?? r?.qty ?? r?.menge ?? "",
              ep: r?.ep ?? r?.price ?? r?.einzelpreis ?? "0",
            },
            i
          )
        )
      : [normalizeRow({}, 0)];

  return {
    ...prev,
    sourceType: "ANGEBOT",
    angebotId: String(a?.id || ""),
    customerName: String(
      a?.customerName || a?.kunde || a?.customer || a?.clientName || ""
    ),
    address: String(a?.customerAddress || a?.address || a?.kundeAdresse || ""),
    email: String(a?.customerEmail || a?.email || ""),
    phone: String(a?.customerPhone || a?.phone || ""),
    mwstPct: String(a?.mwstPct || a?.vatPct || prev?.mwstPct || "19"),
    note:
      String(prev?.note || "").trim() ||
      "Automatisch aus Angebot übernommen.",
    rows,
  };
}

function normalizeMengenToRechnung(m: any, prev: any) {
  const rows =
    Array.isArray(m?.rows) && m.rows.length
      ? m.rows.map((r: any, i: number) =>
          normalizeRow(
            {
              id: r?.id,
              pos: r?.pos,
              text: r?.text || r?.beschreibung,
              unit: r?.unit || r?.einheit,
              qty:
                r?.qty ??
                r?.quantity ??
                r?.menge ??
                r?.qtyMeasured ??
                r?.measuredQty ??
                "",
              ep: r?.ep ?? r?.price ?? r?.einzelpreis ?? "0",
            },
            i
          )
        )
      : [normalizeRow({}, 0)];

  return {
    ...prev,
    sourceType: "MENGEN",
    mengenId: String(m?.id || ""),
    mengenPdfUri: String(m?.pdfUri || prev?.mengenPdfUri || ""),
    mengenTitle: String(m?.title || prev?.mengenTitle || ""),
    angebotId: m?.angebotId ? String(m.angebotId) : prev?.angebotId || null,
    leistungszeitraum: String(
      m?.datum ||
        m?.date ||
        m?.leistungszeitraum ||
        prev?.leistungszeitraum ||
        ""
    ),
    note:
      String(prev?.note || "").trim() ||
      `Automatisch aus Mengenermittlung${
        m?.title ? ` (${String(m.title)})` : ""
      } übernommen.`,
    rows,
  };
}

function calcNettoFromRows(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).reduce((sum: number, r: any) => {
    return sum + num(r?.qty) * num(r?.ep);
  }, 0);
}

function calcMwstFromDoc(d: any) {
  const netto = calcNettoFromRows(d?.rows || []);
  return (netto * num(d?.mwstPct || "19")) / 100;
}

function calcBruttoFromDoc(d: any) {
  const netto = calcNettoFromRows(d?.rows || []);
  const mwst = calcMwstFromDoc(d);
  return netto + mwst;
}

function getTs(v: any) {
  const n =
    Number(v?.updatedAt || 0) ||
    Number(v?.createdAt || 0) ||
    Date.parse(String(v?.datum || "")) ||
    0;
  return Number.isFinite(n) ? n : 0;
}

function getOfferStatusRank(v: any) {
  const s = String(v?.status || "").trim().toLowerCase();
  if (s === "angenommen") return 4;
  if (s === "gesendet") return 3;
  if (s === "entwurf") return 2;
  if (s === "abgelehnt") return 1;
  return 0;
}

function pickBestOfferForRechnung(list: any[]) {
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    const statusDiff = getOfferStatusRank(b) - getOfferStatusRank(a);
    if (statusDiff !== 0) return statusDiff;
    return getTs(b) - getTs(a);
  });

  return sorted[0] || null;
}

function pickBestMengenForRechnung(list: any[], wantedAngebotId?: string | null) {
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) return null;

  if (wantedAngebotId) {
    const linked = rows
      .filter((x: any) => String(x?.angebotId || "") === String(wantedAngebotId))
      .sort((a: any, b: any) => getTs(b) - getTs(a));
    if (linked.length) return linked[0];
  }

  const sorted = [...rows].sort((a: any, b: any) => getTs(b) - getTs(a));
  return sorted[0] || null;
}

function normalizeStoredRechnung(
  input: any,
  params: {
    projectId?: string;
    projectCode?: string;
    fromAngebotId?: string | null;
    fromMengen?: boolean;
    fromMengenId?: string | null;
  }
) {
  return {
    ...createEmptyDoc(params),
    ...input,
    projectId: String(input?.projectId || params.projectId || ""),
    projectCode: String(input?.projectCode || params.projectCode || ""),
    sourceType: String(input?.sourceType || "FREE"),
    angebotId: input?.angebotId ? String(input.angebotId) : null,
    mengenId: input?.mengenId ? String(input.mengenId) : null,
    mengenPdfUri: String(input?.mengenPdfUri || ""),
    mengenTitle: String(input?.mengenTitle || ""),
    rechnungFromMengen: !!input?.rechnungFromMengen,
    rechnungNr: String(input?.rechnungNr || ""),
    datum: String(input?.datum || new Date().toISOString().slice(0, 10)),
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
    pdfUri: String(input?.pdfUri || ""),
    updatedAt: Number(input?.updatedAt || Date.now()),
    createdAt: Number(input?.createdAt || Date.now()),
    abschlaege: Array.isArray(input?.abschlaege)
      ? input.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i))
      : [],
    rows:
      Array.isArray(input?.rows) && input.rows.length
        ? input.rows.map((r: any, i: number) => normalizeRow(r, i))
        : [normalizeRow({}, 0)],
  };
}

function buildPdfRows(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    pos: r.pos,
    text: r.text,
    unit: r.unit,
    qty: r.qty,
    ep: r.ep,
    gp: num(r.qty) * num(r.ep),
  }));
}

function buildAbschlagHistoryLines(abschlaege: AbschlagItem[]) {
  const safe = Array.isArray(abschlaege) ? abschlaege : [];
  if (!safe.length) return ["Noch keine Abschläge vorhanden."];

  return safe.map(
    (a) =>
      `${a.nummer}. Abschlag (${a.datum}): ${money(a.betrag)} €${
        a.prozent !== undefined ? ` • ${money(a.prozent)} %` : ""
      }${a.note ? ` • ${a.note}` : ""}`
  );
}

function mergeStoredRechnungWithCurrentSources(params: {
  stored: any;
  currentMengen?: any | null;
  currentOffer?: any | null;
  projectId?: string;
  projectCode?: string;
}) {
  const { stored, currentMengen, currentOffer, projectId, projectCode } = params;

  let next = normalizeStoredRechnung(stored, {
    projectId,
    projectCode,
    fromAngebotId: stored?.angebotId || null,
    fromMengen: stored?.sourceType === "MENGEN" || !!stored?.mengenId,
    fromMengenId: stored?.mengenId || null,
  });

  if (currentOffer) {
    const preserved = next;
    next = {
      ...normalizeAngebotToRechnung(currentOffer, next),
      id: preserved.id,
      rechnungNr: preserved.rechnungNr,
      datum: preserved.datum,
      leistungszeitraum:
        String(preserved?.leistungszeitraum || "").trim() ||
        String(next?.leistungszeitraum || "").trim(),
      iban: preserved.iban,
      bic: preserved.bic,
      bank: preserved.bank,
      owner: preserved.owner,
      steuerNr: preserved.steuerNr,
      ustId: preserved.ustId,
      zahlungsziel: preserved.zahlungsziel,
      note: preserved.note,
      pdfUri: preserved.pdfUri,
      abschlaege: preserved.abschlaege,
      createdAt: preserved.createdAt,
      updatedAt: preserved.updatedAt,
      mengenId: preserved.mengenId,
      mengenPdfUri: preserved.mengenPdfUri,
      mengenTitle: preserved.mengenTitle,
      rechnungFromMengen: preserved.rechnungFromMengen,
    };
  }

  if (currentMengen) {
    const preserved = next;
    next = {
      ...normalizeMengenToRechnung(currentMengen, next),
      id: preserved.id,
      rechnungNr: preserved.rechnungNr,
      datum: preserved.datum,
      customerName:
        String(preserved?.customerName || "").trim() ||
        String(next?.customerName || "").trim(),
      address:
        String(preserved?.address || "").trim() ||
        String(next?.address || "").trim(),
      email:
        String(preserved?.email || "").trim() ||
        String(next?.email || "").trim(),
      phone:
        String(preserved?.phone || "").trim() ||
        String(next?.phone || "").trim(),
      iban: preserved.iban,
      bic: preserved.bic,
      bank: preserved.bank,
      owner: preserved.owner,
      steuerNr: preserved.steuerNr,
      ustId: preserved.ustId,
      zahlungsziel: preserved.zahlungsziel,
      mwstPct: preserved.mwstPct || next.mwstPct,
      note: preserved.note,
      pdfUri: preserved.pdfUri,
      abschlaege: preserved.abschlaege,
      createdAt: preserved.createdAt,
      updatedAt: preserved.updatedAt,
      angebotId: currentMengen?.angebotId
        ? String(currentMengen.angebotId)
        : preserved.angebotId || null,
      sourceType: "MENGEN",
      rechnungFromMengen: true,
    };
  }

  return next;
}

async function getMode(): Promise<"NUR_APP" | "SERVER_SYNC"> {
  const raw = await AsyncStorage.getItem(KEY_MODE);
  return raw === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
}

export default function RechnungEditorScreen({ route, navigation }: Props) {
  const params = route.params as any;
  const {
    projectCode,
    projectId,
    rechnungId,
    fromAngebotId,
    fromMengen,
    mengenId,
  } = params || {};

  const [doc, setDoc] = useState<any>(() =>
    createEmptyDoc({
      projectId,
      projectCode,
      fromAngebotId,
      fromMengen,
      fromMengenId: mengenId || null,
    })
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [angebotList, setAngebotList] = useState<any[]>([]);
  const [mengenList, setMengenList] = useState<any[]>([]);

  const [abschlagPctInput, setAbschlagPctInput] = useState("");
  const [abschlagAmountInput, setAbschlagAmountInput] = useState("");
  const [abschlagNoteInput, setAbschlagNoteInput] = useState("");

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: rechnungId ? "Rechnung bearbeiten" : "Rechnung",
      });
      void load();
    }, [
      navigation,
      rechnungId,
      projectCode,
      projectId,
      fromAngebotId,
      fromMengen,
      mengenId,
    ])
  );

  async function loadAngebote() {
    const mode = await getMode();

    if (mode === "NUR_APP") {
      const raw = await AsyncStorage.getItem(OFFER_KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      const normalized = Array.isArray(list) ? list : [];
      setAngebotList(normalized);
      return normalized;
    }

    try {
      const list = await api.getAngebote(projectCode);
      const normalized = Array.isArray(list) ? list : [];
      await AsyncStorage.setItem(OFFER_KEY + projectCode, JSON.stringify(normalized));
      setAngebotList(normalized);
      return normalized;
    } catch (e) {
      console.log("loadAngebote server fallback -> local", e);
      const raw = await AsyncStorage.getItem(OFFER_KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      const normalized = Array.isArray(list) ? list : [];
      setAngebotList(normalized);
      return normalized;
    }
  }

  async function loadMengen() {
    const mode = await getMode();

    if (mode === "NUR_APP") {
      const raw = await AsyncStorage.getItem(MENGEN_KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      const normalized = Array.isArray(list) ? list : [];
      setMengenList(normalized);
      return normalized;
    }

    try {
      const list = await api.getMengen(projectCode);
      const normalized = Array.isArray(list) ? list : [];
      await AsyncStorage.setItem(MENGEN_KEY + projectCode, JSON.stringify(normalized));
      setMengenList(normalized);
      return normalized;
    } catch (e) {
      console.log("loadMengen server fallback -> local", e);
      const raw = await AsyncStorage.getItem(MENGEN_KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      const normalized = Array.isArray(list) ? list : [];
      setMengenList(normalized);
      return normalized;
    }
  }

  async function loadRechnungen() {
    const mode = await getMode();

    if (mode === "NUR_APP") {
      const raw = await AsyncStorage.getItem(KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }

    try {
      const list = await api.getRechnungen(projectCode);
      const normalized = Array.isArray(list) ? list : [];
      await AsyncStorage.setItem(KEY + projectCode, JSON.stringify(normalized));
      return normalized;
    } catch (e) {
      console.log("loadRechnungen server fallback -> local", e);
      const raw = await AsyncStorage.getItem(KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }
  }

  function buildRechnungFromMengen(m: any, offers: any[]) {
    let nextDoc = normalizeMengenToRechnung(
      m,
      createEmptyDoc({
        projectId,
        projectCode,
        fromAngebotId: null,
        fromMengen: true,
        fromMengenId: m?.id || null,
      })
    );

    if (m?.angebotId) {
      const linkedAngebot = offers.find(
        (x: any) => String(x.id) === String(m.angebotId)
      );
      if (linkedAngebot) {
        nextDoc = {
          ...normalizeAngebotToRechnung(linkedAngebot, nextDoc),
          ...normalizeMengenToRechnung(m, nextDoc),
          sourceType: "MENGEN",
        };
      }
    }

    return {
      ...nextDoc,
      projectId: String(nextDoc?.projectId || projectId || ""),
      projectCode: String(nextDoc?.projectCode || projectCode || ""),
      abschlaege: Array.isArray(nextDoc?.abschlaege) ? nextDoc.abschlaege : [],
    };
  }

  function buildRechnungFromAngebot(a: any) {
    const nextDoc = normalizeAngebotToRechnung(
      a,
      createEmptyDoc({
        projectId,
        projectCode,
        fromAngebotId: a?.id || null,
        fromMengen: false,
        fromMengenId: null,
      })
    );

    return {
      ...nextDoc,
      projectId: String(nextDoc?.projectId || projectId || ""),
      projectCode: String(nextDoc?.projectCode || projectCode || ""),
      abschlaege: Array.isArray(nextDoc?.abschlaege) ? nextDoc.abschlaege : [],
    };
  }

  async function load() {
    try {
      setLoading(true);

      const [offers, mengen, rechnungen] = await Promise.all([
        loadAngebote(),
        loadMengen(),
        loadRechnungen(),
      ]);

      if (rechnungId) {
        const found = rechnungen.find(
          (x: any) => String(x?.id) === String(rechnungId)
        );

        if (found) {
          const currentMengen = found?.mengenId
            ? mengen.find((x: any) => String(x?.id) === String(found.mengenId)) ||
              null
            : null;

          const offerIdForFound =
            found?.angebotId || currentMengen?.angebotId || null;

          const currentOffer = offerIdForFound
            ? offers.find((x: any) => String(x?.id) === String(offerIdForFound)) ||
              null
            : null;

          setDoc(
            mergeStoredRechnungWithCurrentSources({
              stored: found,
              currentMengen,
              currentOffer,
              projectId,
              projectCode,
            })
          );
          return;
        }
      }

      if (mengenId) {
        const m =
          mengen.find((x: any) => String(x?.id) === String(mengenId)) || null;

        const existingRechnungFromMengen = rechnungen.find(
          (x: any) => String(x?.mengenId || "") === String(mengenId)
        );

        if (existingRechnungFromMengen) {
          const offerIdForStored =
            m?.angebotId ||
            existingRechnungFromMengen?.angebotId ||
            fromAngebotId ||
            null;

          const currentOffer = offerIdForStored
            ? offers.find((x: any) => String(x?.id) === String(offerIdForStored)) ||
              null
            : null;

          setDoc(
            mergeStoredRechnungWithCurrentSources({
              stored: existingRechnungFromMengen,
              currentMengen: m,
              currentOffer,
              projectId,
              projectCode,
            })
          );
          return;
        }

        if (m) {
          setDoc(buildRechnungFromMengen(m, offers));
          return;
        }
      }

      if (fromAngebotId) {
        const linkedMengen = pickBestMengenForRechnung(mengen, fromAngebotId);

        if (linkedMengen) {
          const existingRechnungFromLinkedMengen = rechnungen.find(
            (x: any) => String(x?.mengenId || "") === String(linkedMengen.id)
          );

          if (existingRechnungFromLinkedMengen) {
            const linkedOffer =
              offers.find(
                (x: any) =>
                  String(x?.id) === String(linkedMengen?.angebotId || fromAngebotId)
              ) || null;

            setDoc(
              mergeStoredRechnungWithCurrentSources({
                stored: existingRechnungFromLinkedMengen,
                currentMengen: linkedMengen,
                currentOffer: linkedOffer,
                projectId,
                projectCode,
              })
            );
            return;
          }

          setDoc(buildRechnungFromMengen(linkedMengen, offers));
          return;
        }

        const existingRechnungFromAngebot = rechnungen.find(
          (x: any) => String(x?.angebotId || "") === String(fromAngebotId)
        );

        if (existingRechnungFromAngebot) {
          const currentOffer =
            offers.find((x: any) => String(x?.id) === String(fromAngebotId)) ||
            null;

          setDoc(
            mergeStoredRechnungWithCurrentSources({
              stored: existingRechnungFromAngebot,
              currentOffer,
              projectId,
              projectCode,
            })
          );
          return;
        }

        const a =
          offers.find((x: any) => String(x.id) === String(fromAngebotId)) || null;

        if (a) {
          setDoc(buildRechnungFromAngebot(a));
          return;
        }
      }

      if (fromMengen) {
        const resolvedMengen = pickBestMengenForRechnung(
          mengen,
          fromAngebotId || null
        );

        if (resolvedMengen) {
          const existingRechnung = rechnungen.find(
            (x: any) => String(x?.mengenId || "") === String(resolvedMengen.id)
          );

          if (existingRechnung) {
            const linkedOffer =
              offers.find(
                (x: any) =>
                  String(x?.id) ===
                  String(
                    existingRechnung?.angebotId ||
                      resolvedMengen?.angebotId ||
                      fromAngebotId ||
                      ""
                  )
              ) || null;

            setDoc(
              mergeStoredRechnungWithCurrentSources({
                stored: existingRechnung,
                currentMengen: resolvedMengen,
                currentOffer: linkedOffer,
                projectId,
                projectCode,
              })
            );
            return;
          }

          setDoc(buildRechnungFromMengen(resolvedMengen, offers));
          return;
        }
      }

      const bestMengen = pickBestMengenForRechnung(mengen, null);
      if (bestMengen) {
        const existingRechnungFromBestMengen = rechnungen.find(
          (x: any) => String(x?.mengenId || "") === String(bestMengen.id)
        );

        if (existingRechnungFromBestMengen) {
          const linkedOffer =
            offers.find(
              (x: any) =>
                String(x?.id) ===
                String(
                  existingRechnungFromBestMengen?.angebotId ||
                    bestMengen?.angebotId ||
                    ""
                )
            ) || null;

          setDoc(
            mergeStoredRechnungWithCurrentSources({
              stored: existingRechnungFromBestMengen,
              currentMengen: bestMengen,
              currentOffer: linkedOffer,
              projectId,
              projectCode,
            })
          );
          return;
        }

        setDoc(buildRechnungFromMengen(bestMengen, offers));
        return;
      }

      const bestOffer = pickBestOfferForRechnung(offers);
      if (bestOffer) {
        const existingRechnungFromBestOffer = rechnungen.find(
          (x: any) => String(x?.angebotId || "") === String(bestOffer.id)
        );

        if (existingRechnungFromBestOffer) {
          setDoc(
            mergeStoredRechnungWithCurrentSources({
              stored: existingRechnungFromBestOffer,
              currentOffer: bestOffer,
              projectId,
              projectCode,
            })
          );
          return;
        }

        setDoc(buildRechnungFromAngebot(bestOffer));
        return;
      }

      setDoc(
        createEmptyDoc({
          projectId,
          projectCode,
          fromAngebotId: fromAngebotId || null,
          fromMengen: !!fromMengen,
          fromMengenId: mengenId || null,
        })
      );
    } catch (e) {
      console.log("LOAD RECHNUNG ERROR", e);
      Alert.alert("Fehler", "Rechnung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function importFromAngebot(angebotId?: string) {
    try {
      const offers = angebotList.length ? angebotList : await loadAngebote();

      let a = null;
      if (angebotId) {
        a = offers.find((x: any) => String(x.id) === String(angebotId)) || null;
      } else {
        a = pickBestOfferForRechnung(offers);
      }

      if (!a) {
        Alert.alert("Hinweis", "Kein Angebot gefunden.");
        return;
      }

      setDoc((prev: any) => ({
        ...prev,
        ...normalizeAngebotToRechnung(a, prev),
        projectId: String(prev?.projectId || projectId || ""),
        projectCode: String(prev?.projectCode || projectCode || ""),
        abschlaege: Array.isArray(prev?.abschlaege) ? prev.abschlaege : [],
      }));
    } catch (e) {
      console.log("IMPORT ANGEBOT ERROR", e);
      Alert.alert("Fehler", "Angebot konnte nicht übernommen werden.");
    }
  }

  async function importFromMengen(mId?: string) {
    try {
      const mengen = mengenList.length ? mengenList : await loadMengen();
      const offers = angebotList.length ? angebotList : await loadAngebote();

      let m = null;
      if (mId) {
        m = mengen.find((x: any) => String(x.id) === String(mId)) || null;
      } else {
        m = pickBestMengenForRechnung(
          mengen,
          doc?.angebotId || fromAngebotId || null
        );
      }

      if (!m) {
        Alert.alert("Hinweis", "Keine passende Mengenermittlung gefunden.");
        return;
      }

      const linkedAngebot = m?.angebotId
        ? offers.find((x: any) => String(x.id) === String(m.angebotId)) || null
        : null;

      setDoc((prev: any) =>
        mergeStoredRechnungWithCurrentSources({
          stored: {
            ...prev,
            sourceType: "MENGEN",
            mengenId: m?.id || prev?.mengenId || null,
            angebotId: m?.angebotId || prev?.angebotId || null,
            rechnungFromMengen: true,
          },
          currentMengen: m,
          currentOffer: linkedAngebot,
          projectId: String(prev?.projectId || projectId || ""),
          projectCode: String(prev?.projectCode || projectCode || ""),
        })
      );
    } catch (e) {
      console.log("IMPORT MENGEN ERROR", e);
      Alert.alert("Fehler", "Mengenermittlung konnte nicht übernommen werden.");
    }
  }


  // RLC_KI_MODULE_HANDLER_RECHNUNG_V2_SMART
  useEffect(() => {
    return registerRlcKiModuleHandler("RechnungEditor", async (payload: any) => {
      const input = String(payload?.input || "").trim();
      const lower = input.toLowerCase();
      const parsed = parseRlcKiSmartDoc(input);

      if (lower.includes("angebot")) {
        await importFromAngebot();
        return { ok: true, handled: true, message: "RECHNUNG_FROM_ANGEBOT" };
      }

      if (
        lower.includes("mengen") ||
        lower.includes("mengenermittlung") ||
        lower.includes("aufmaß") ||
        lower.includes("aufmass")
      ) {
        await importFromMengen();
        return { ok: true, handled: true, message: "RECHNUNG_FROM_MENGEN" };
      }

      setDoc((prev: any) => {
        const parsedRows = parsed.rows.length
          ? parsed.rows.map((r: any, i: number) => ({
              id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
              pos: r.pos || String(i + 1),
              text: r.text || "",
              unit: r.unit || "",
              qty: r.qty || "",
              ep: r.ep || "",
            }))
          : prev.rows;

        return {
          ...prev,
          rechnungNr: parsed.rechnungNr || prev.rechnungNr,
          datum: parsed.datum || prev.datum || new Date().toISOString().slice(0, 10),
          leistungszeitraum: parsed.leistungszeitraum || prev.leistungszeitraum,
          customerName: parsed.customerName || prev.customerName,
          address: parsed.address || prev.address,
          email: parsed.email || prev.email,
          phone: parsed.phone || prev.phone,
          mwstPct: prev?.mwstPct || "19",
          note:
            parsed.warnings?.length
              ? `${parsed.note || ""}

RLC KI Hinweise:
${parsed.warnings.map((w: string) => `- ${w}`).join("\n")}`
              : parsed.note || prev.note,
          rows: parsedRows,
          updatedAt: Date.now(),
        };
      });

      return {
        ok: true,
        handled: true,
        message: parsed.rows.length ? "RECHNUNG_SMART_ROWS_FILLED" : "RECHNUNG_SMART_FIELDS_FILLED",
      };
    });
  }, [importFromAngebot, importFromMengen]);
  const netto = useMemo(() => {
    return calcNettoFromRows(doc.rows || []);
  }, [doc.rows]);

  const mwst = useMemo(() => {
    return calcMwstFromDoc(doc);
  }, [doc.rows, doc.mwstPct]);

  const brutto = useMemo(() => {
    return calcBruttoFromDoc(doc);
  }, [doc.rows, doc.mwstPct]);

  const bezahlt = useMemo(() => {
    return (doc?.abschlaege || []).reduce(
      (sum: number, a: AbschlagItem) => sum + Number(a?.betrag || 0),
      0
    );
  }, [doc?.abschlaege]);

  const rest = useMemo(() => Math.max(0, brutto - bezahlt), [brutto, bezahlt]);

  async function persistDoc(nextDoc?: any) {
    const base = nextDoc || doc;

    const normalizedRows =
      Array.isArray(base?.rows) && base.rows.length
        ? base.rows.map((r: any, i: number) => normalizeRow(r, i))
        : [normalizeRow({}, 0)];

    const tempDoc = {
      ...base,
      rows: normalizedRows,
      mwstPct: String(base?.mwstPct || "19").trim(),
    };

    const calcNetto = calcNettoFromRows(tempDoc.rows);
    const calcMwst = calcMwstFromDoc(tempDoc);
    const calcBrutto = calcBruttoFromDoc(tempDoc);

    const normalized = {
      ...tempDoc,
      projectId: String(tempDoc.projectId || projectId),
      projectCode: String(tempDoc.projectCode || projectCode),
      rechnungNr: String(tempDoc.rechnungNr || "").trim(),
      datum: String(tempDoc.datum || "").trim(),
      leistungszeitraum: String(tempDoc.leistungszeitraum || "").trim(),
      customerName: String(tempDoc.customerName || "").trim(),
      address: String(tempDoc.address || "").trim(),
      email: String(tempDoc.email || "").trim(),
      phone: String(tempDoc.phone || "").trim(),
      iban: String(tempDoc.iban || "").trim(),
      bic: String(tempDoc.bic || "").trim(),
      bank: String(tempDoc.bank || "").trim(),
      owner: String(tempDoc.owner || "").trim(),
      steuerNr: String(tempDoc.steuerNr || "").trim(),
      ustId: String(tempDoc.ustId || "").trim(),
      zahlungsziel: String(tempDoc.zahlungsziel || "").trim(),
      note: String(tempDoc.note || "").trim(),
      sourceType: String(tempDoc.sourceType || "FREE"),
      angebotId: tempDoc.angebotId || null,
      mengenId: tempDoc.mengenId || null,
      mengenPdfUri: String(tempDoc.mengenPdfUri || ""),
      mengenTitle: String(tempDoc.mengenTitle || ""),
      rechnungFromMengen: !!tempDoc.rechnungFromMengen,
      pdfUri: String(tempDoc.pdfUri || ""),
      updatedAt: Date.now(),
      createdAt: Number(tempDoc.createdAt || Date.now()),
      netto: calcNetto,
      mwst: calcMwst,
      brutto: calcBrutto,
      abschlaege: Array.isArray(tempDoc.abschlaege)
        ? tempDoc.abschlaege.map((a: any, i: number) => normalizeAbschlag(a, i))
        : [],
      rows: normalizedRows,
    };

    const raw = await AsyncStorage.getItem(KEY + projectCode);
    const list = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const idx = safeList.findIndex((x: any) => String(x.id) === String(normalized.id));

    if (idx >= 0) safeList[idx] = normalized;
    else safeList.unshift(normalized);

    await AsyncStorage.setItem(KEY + projectCode, JSON.stringify(safeList));

    const mode = await getMode();
    if (mode === "SERVER_SYNC") {
      try {
        await api.saveRechnung(projectCode, normalized);
      } catch (e) {
        console.log("persistDoc saveRechnung server fallback -> local", e);
      }
    }

    await submitToEingangPruefung({
      type: "RECHNUNG",
      projectKey: normalized.projectCode || projectCode,
      projectId: normalized.projectId || projectId,
      projectCode: normalized.projectCode || projectCode,
      title: normalized.rechnungNr || "Rechnung",
      doc: normalized,
      pdfUri: normalized.pdfUri || null,
      status: "EINGEREICHT",
      sourceScreen: "RechnungEditor",
    });

    setDoc(normalized);
    return normalized;
  }

  async function save() {
    try {
      setBusy(true);
      await persistDoc();
      navigation.goBack();
    } catch (e) {
      console.log("SAVE RECHNUNG ERROR", e);
      Alert.alert("Fehler", "Rechnung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function shareLinkedMengenPdf() {
    try {
      const uri = String(doc?.mengenPdfUri || "").trim();

      if (!uri) {
        Alert.alert("Hinweis", "Kein Mengenermittlung-PDF verknüpft.");
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Hinweis", uri);
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Mengenermittlung PDF",
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      console.log("SHARE LINKED MENGEN PDF ERROR", e);
      Alert.alert("Fehler", "Mengenermittlung-PDF konnte nicht geteilt werden.");
    }
  }

  async function exportPdf() {
    try {
      setBusy(true);

      const saved = await persistDoc();
      const fileNameBase = sanitizeFileBase(saved.rechnungNr || "rechnung");

      const extraBlocks =
        saved.sourceType === "MENGEN"
          ? [
              {
                title: "Grundlage",
                lines: [
                  "Mengenermittlung",
                  ...(saved.mengenTitle
                    ? [`Titel: ${String(saved.mengenTitle)}`]
                    : []),
                  ...(saved.mengenId ? [`ID: ${String(saved.mengenId)}`] : []),
                  ...(saved.mengenPdfUri ? ["PDF: verknüpft"] : []),
                ],
              },
            ]
          : saved.sourceType === "ANGEBOT"
          ? [
              {
                title: "Grundlage",
                lines: [
                  "Angebot",
                  ...(saved.angebotId ? [`ID: ${String(saved.angebotId)}`] : []),
                ],
              },
            ]
          : [];

      const { pdfUri } = await buildDocumentPdf({
        type: "RECHNUNG",
        projectCode: saved.projectCode || projectCode,
        fileName: `${fileNameBase}.pdf`,
        title: "RECHNUNG",
        subTitle:
          saved.sourceType === "MENGEN"
            ? "Erstellt aus Mengenermittlung"
            : saved.sourceType === "ANGEBOT"
            ? "Erstellt aus Angebot"
            : "Freie Rechnung",
        docNo: saved.rechnungNr || "",
        date: saved.datum || "",
        period: saved.leistungszeitraum || "",
        customer: {
          name: saved.customerName || "",
          address: saved.address || "",
          email: saved.email || "",
          phone: saved.phone || "",
        },
        rows: buildPdfRows(saved.rows || []),
        totals: {
          netto: Number(saved?.netto || 0),
          mwstPct: num(saved?.mwstPct || "19"),
          mwstValue: Number(saved?.mwst || 0),
          brutto: Number(saved?.brutto || 0),
        },
        bank: {
          bank: saved.bank || "",
          iban: saved.iban || "",
          bic: saved.bic || "",
          owner: saved.owner || "",
          steuerNr: saved.steuerNr || "",
          ustId: saved.ustId || "",
          zahlungsziel: saved.zahlungsziel || "",
        },
        note: saved.note || "",
        extraBlocks,
        shareAfterCreate: true,
      });

      const nextDoc = { ...saved, pdfUri };
      setDoc(nextDoc);
      await persistDoc(nextDoc);
    } catch (e) {
      console.log("PDF RECHNUNG ERROR", e);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function exportSchlussrechnungPdf() {
    try {
      setBusy(true);

      const saved = await persistDoc();
      const fileNameBase = sanitizeFileBase(saved.rechnungNr || "schlussrechnung");
      const finalRest = Math.max(0, Number(saved?.brutto || 0) - bezahlt);

      await buildDocumentPdf({
        type: "SCHLUSSRECHNUNG",
        projectCode: saved.projectCode || projectCode,
        fileName: `${fileNameBase}_schlussrechnung.pdf`,
        title: "SCHLUSSRECHNUNG",
        subTitle:
          (saved.abschlaege || []).length > 0
            ? "Restbetrag nach Abschlägen"
            : "Schlussbetrag",
        docNo: saved.rechnungNr || "",
        date: saved.datum || "",
        period: saved.leistungszeitraum || "",
        customer: {
          name: saved.customerName || "",
          address: saved.address || "",
          email: saved.email || "",
          phone: saved.phone || "",
        },
        rows: buildPdfRows(saved.rows || []),
        totals: {
          netto: Number(saved?.netto || 0),
          mwstPct: num(saved?.mwstPct || "19"),
          mwstValue: Number(saved?.mwst || 0),
          bezahlt: bezahlt,
          rest: finalRest,
          brutto: finalRest,
        },
        bank: {
          bank: saved.bank || "",
          iban: saved.iban || "",
          bic: saved.bic || "",
          owner: saved.owner || "",
          steuerNr: saved.steuerNr || "",
          ustId: saved.ustId || "",
          zahlungsziel: saved.zahlungsziel || "",
        },
        extraBlocks: [
          {
            title: "Schlussstand",
            lines: [
              `Rechnungsnummer: ${String(saved.rechnungNr || "")}`,
              `Gesamt netto: ${money(Number(saved?.netto || 0))} €`,
              `MwSt: ${money(Number(saved?.mwst || 0))} €`,
              `Gesamt brutto Rechnung: ${money(Number(saved?.brutto || 0))} €`,
              `Summe Abschläge: ${money(bezahlt)} €`,
              `Zu zahlen / Schlussrechnung: ${money(finalRest)} €`,
            ],
          },
          {
            title: "Abschlagsübersicht",
            lines: buildAbschlagHistoryLines(saved.abschlaege || []),
          },
        ],
        note: saved.note || "",
        shareAfterCreate: true,
      });
    } catch (e) {
      console.log("PDF SCHLUSSRECHNUNG ERROR", e);
      Alert.alert("Fehler", "Schlussrechnung-PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, key: string, val: string) {
    setDoc((prev: any) => {
      const rows = [...prev.rows];
      rows[i] = { ...rows[i], [key]: val };
      return { ...prev, rows };
    });
  }

  function addRow() {
    setDoc((prev: any) => ({
      ...prev,
      rows: [
        ...prev.rows,
        normalizeRow(
          {
            pos: String((prev.rows?.length || 0) + 1),
          },
          prev.rows?.length || 0
        ),
      ],
    }));
  }

  function removeRow(i: number) {
    setDoc((prev: any) => {
      const rows = [...prev.rows];
      rows.splice(i, 1);

      const normalizedRows =
        rows.length > 0
          ? rows.map((r: any, idx: number) =>
              normalizeRow({ ...r, pos: String(idx + 1) }, idx)
            )
          : [normalizeRow({}, 0)];

      return { ...prev, rows: normalizedRows };
    });
  }

  async function createAbschlagPdf(item: AbschlagItem) {
    try {
      setBusy(true);

      const saved = await persistDoc();
      const currentBrutto = Number(saved?.brutto || 0);

      const beforeThisPaid = Math.max(
        0,
        (saved?.abschlaege || []).reduce(
          (sum: number, a: AbschlagItem) =>
            a.id === item.id ? sum : sum + Number(a?.betrag || 0),
          0
        )
      );

      const currentAbschlag = Number(item?.betrag || 0);
      const afterThisPaid = beforeThisPaid + currentAbschlag;
      const currentRest = Math.max(0, currentBrutto - afterThisPaid);

      const fileNameBase = `${sanitizeFileBase(
        saved.rechnungNr || "rechnung"
      )}_abschlag_${item.nummer}`;

      const { pdfUri } = await buildDocumentPdf({
        type: "ABSCHLAGSRECHNUNG",
        projectCode: saved.projectCode || projectCode,
        fileName: `${fileNameBase}.pdf`,
        title: "ABSCHLAGSRECHNUNG",
        subTitle: `Abschlag Nr. ${item.nummer}`,
        docNo: saved.rechnungNr || "",
        date: item.datum || "",
        period: saved.leistungszeitraum || "",
        customer: {
          name: saved.customerName || "",
          address: saved.address || "",
          email: saved.email || "",
          phone: saved.phone || "",
        },
        rows: buildPdfRows(saved.rows || []),
        totals: {
          netto: currentAbschlag,
          mwstPct: undefined,
          mwstValue: undefined,
          brutto: currentAbschlag,
          bezahlt: beforeThisPaid,
          rest: currentRest,
        },
        bank: {
          bank: saved.bank || "",
          iban: saved.iban || "",
          bic: saved.bic || "",
          owner: saved.owner || "",
          steuerNr: saved.steuerNr || "",
          ustId: saved.ustId || "",
          zahlungsziel: saved.zahlungsziel || "",
        },
        extraBlocks: [
          {
            title: "Abschlag",
            lines: [
              `Abschlag Nr: ${String(item.nummer)}`,
              `Datum: ${String(item.datum)}`,
              `Basis-Rechnung: ${String(saved.rechnungNr || "")}`,
              `Gesamt Rechnung: ${money(currentBrutto)} €`,
              `Vorherige Abschläge: ${money(beforeThisPaid)} €`,
              `Dieser Abschlag: ${money(currentAbschlag)} €`,
              `Rest nach diesem Abschlag: ${money(currentRest)} €`,
              ...(item.prozent !== undefined
                ? [`Abschlag (%): ${money(item.prozent)} %`]
                : []),
              ...(item.note ? [`Hinweis: ${String(item.note)}`] : []),
            ],
          },
        ],
        note: item.note || saved.note || "",
        shareAfterCreate: true,
      });

      const updatedAbschlaege = (saved.abschlaege || []).map((a: AbschlagItem) =>
        a.id === item.id ? { ...a, pdfUri } : a
      );

      const nextDoc = {
        ...saved,
        abschlaege: updatedAbschlaege,
      };

      setDoc(nextDoc);
      await persistDoc(nextDoc);
    } catch (e) {
      console.log("PDF ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "Abschlag-PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function addAbschlag() {
    try {
      const pct = num(abschlagPctInput);
      const manualAmount = num(abschlagAmountInput);

      let betrag = 0;
      let prozent: number | undefined = undefined;

      if (manualAmount > 0) {
        betrag = manualAmount;
      } else if (pct > 0) {
        prozent = pct;
        betrag = (brutto * pct) / 100;
      }

      if (betrag <= 0) {
        Alert.alert(
          "Hinweis",
          "Bitte einen Abschlagbetrag oder einen Prozentwert eingeben."
        );
        return;
      }

      if (betrag > rest) {
        Alert.alert(
          "Hinweis",
          `Der Abschlag ist größer als der offene Rest (${money(rest)} €).`
        );
        return;
      }

      const nextItem: AbschlagItem = {
        id: makeId(),
        nummer: (doc.abschlaege?.length || 0) + 1,
        datum: new Date().toISOString().slice(0, 10),
        betrag,
        prozent,
        note: abschlagNoteInput.trim(),
        pdfUri: "",
        createdAt: Date.now(),
      };

      const nextDoc = {
        ...doc,
        abschlaege: [...(doc.abschlaege || []), nextItem],
      };

      setDoc(nextDoc);
      await persistDoc(nextDoc);

      setAbschlagPctInput("");
      setAbschlagAmountInput("");
      setAbschlagNoteInput("");

      Alert.alert(
        "Erfolg",
        "Abschlag wurde gespeichert. Jetzt kannst du das PDF erstellen."
      );
    } catch (e) {
      console.log("ADD ABSCHLAG ERROR", e);
      Alert.alert("Fehler", "Abschlag konnte nicht gespeichert werden.");
    }
  }

  async function deleteAbschlag(itemId: string) {
    Alert.alert("Abschlag löschen", "Diesen Abschlag wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            const restList = (doc.abschlaege || [])
              .filter((a: AbschlagItem) => a.id !== itemId)
              .map((a: AbschlagItem, idx: number) => ({
                ...a,
                nummer: idx + 1,
              }));

            const nextDoc = { ...doc, abschlaege: restList };
            setDoc(nextDoc);
            await persistDoc(nextDoc);
          } catch (e) {
            console.log("DELETE ABSCHLAG ERROR", e);
            Alert.alert("Fehler", "Abschlag konnte nicht gelöscht werden.");
          }
        },
      },
    ]);
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

  const showImportBox = !rechnungId && isEffectivelyEmpty(doc);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.headerRow}>
          <Text style={s.title}>Rechnung</Text>

          <Pressable
            style={[s.kiBtn, { display: "none" }]}
            onPress={() =>
              navigation.navigate("SupportChat", {
                projectId,
                projectCode,
                title: "RLC KI",
                screen: "RechnungEditor",
              })
            }
          >
            <Text style={s.kiBtnTxt}>RLC KI</Text>
          </Pressable>
        </View>

        <View style={s.sourceBox}>
          <Text style={s.sourceTitle}>Quelle</Text>
          <Text style={s.sourceText}>
            {doc.sourceType === "ANGEBOT"
              ? "Diese Rechnung basiert auf einem Angebot."
              : doc.sourceType === "MENGEN"
              ? "Diese Rechnung basiert auf einer Mengenermittlung."
              : "Freie Rechnung ohne Quelle."}
          </Text>
          {doc.mengenId ? (
            <Text style={s.sourceText}>
              Mengenermittlung-ID: {String(doc.mengenId)}
            </Text>
          ) : null}
          {doc.mengenTitle ? (
            <Text style={s.sourceText}>
              Mengenermittlung: {String(doc.mengenTitle)}
            </Text>
          ) : null}
          {doc.mengenPdfUri ? (
            <Text style={s.sourceText}>Mengenermittlung-PDF verknüpft.</Text>
          ) : null}
        </View>

        {doc.sourceType === "MENGEN" && doc.mengenPdfUri ? (
          <Pressable
            style={s.linkedPdfBtn}
            onPress={() => void shareLinkedMengenPdf()}
          >
            <Text style={s.btnTxt}>Mengenermittlung PDF teilen</Text>
          </Pressable>
        ) : null}

        {showImportBox ? (
          <View style={s.importBox}>
            <Text style={s.importTitle}>Rechnung vorbereiten</Text>
            <Text style={s.importSub}>
              Du kannst die Rechnung leer erstellen oder Daten aus bestehenden
              Dokumenten übernehmen.
            </Text>

            <View style={s.importBtnRow}>
              <Pressable
                style={s.importBtn}
                onPress={() => void importFromAngebot(fromAngebotId)}
              >
                <Text style={s.importBtnTxt}>Aus Angebot laden</Text>
              </Pressable>

              <Pressable
                style={[s.importBtn, s.importBtnAlt]}
                onPress={() => void importFromMengen(mengenId)}
              >
                <Text style={s.importBtnTxt}>Aus Mengen laden</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Input
          label="Rechnungsnummer"
          v={doc.rechnungNr}
          k="rechnungNr"
          set={setDoc}
        />
        <Input label="Datum" v={doc.datum} k="datum" set={setDoc} />
        <Input
          label="Leistungszeitraum"
          v={doc.leistungszeitraum}
          k="leistungszeitraum"
          set={setDoc}
        />

        <Text style={s.section}>Kunde</Text>
        <Input label="Name" v={doc.customerName} k="customerName" set={setDoc} />
        <Input label="Adresse" v={doc.address} k="address" set={setDoc} />
        <Input label="Email" v={doc.email} k="email" set={setDoc} />
        <Input label="Telefon" v={doc.phone} k="phone" set={setDoc} />

        <Text style={s.section}>Bank</Text>
        <Input label="IBAN" v={doc.iban} k="iban" set={setDoc} />
        <Input label="BIC" v={doc.bic} k="bic" set={setDoc} />
        <Input label="Bank" v={doc.bank} k="bank" set={setDoc} />
        <Input label="Kontoinhaber" v={doc.owner} k="owner" set={setDoc} />

        <Text style={s.section}>Steuer</Text>
        <Input label="SteuerNr" v={doc.steuerNr} k="steuerNr" set={setDoc} />
        <Input label="USt-ID" v={doc.ustId} k="ustId" set={setDoc} />
        <Input
          label="Zahlungsziel"
          v={doc.zahlungsziel}
          k="zahlungsziel"
          set={setDoc}
        />
        <Input label="MwSt %" v={doc.mwstPct} k="mwstPct" set={setDoc} />

        <Text style={s.section}>Positionen</Text>

        {doc.rows.map((r: any, i: number) => (
          <View key={r.id} style={s.rowCard}>
            <View style={s.rowCardTop}>
              <Text style={s.rowTitle}>Pos. {r.pos}</Text>
              <Pressable onPress={() => removeRow(i)} style={s.removeBtn}>
                <Text style={s.removeBtnTxt}>Löschen</Text>
              </Pressable>
            </View>

            <InputSmall
              placeholder="Beschreibung"
              v={r.text}
              onChange={(v) => updateRow(i, "text", v)}
            />

            <View style={s.row}>
              <InputSmall
                placeholder="Einheit"
                v={r.unit}
                onChange={(v) => updateRow(i, "unit", v)}
              />
              <InputSmall
                placeholder="Menge"
                v={r.qty}
                onChange={(v) => updateRow(i, "qty", v)}
              />
              <InputSmall
                placeholder="EP"
                v={r.ep}
                onChange={(v) => updateRow(i, "ep", v)}
              />
            </View>

            <Text style={s.gp}>GP: {money(num(r.qty) * num(r.ep))} €</Text>
          </View>
        ))}

        <Pressable style={s.addBtn} onPress={addRow}>
          <Text style={s.addBtnTxt}>+ Position hinzufügen</Text>
        </Pressable>

        <Text style={s.section}>Bemerkung</Text>
        <TextInput
          value={doc.note}
          onChangeText={(t) => setDoc((p: any) => ({ ...p, note: t }))}
          style={[s.input, s.textArea]}
          multiline
          placeholder="Notiz / Hinweis"
          placeholderTextColor="#B8C1CC"
        />

        <View style={s.sumBox}>
          <Text style={s.sum}>Netto: {money(netto)} €</Text>
          <Text style={s.sum}>MwSt: {money(mwst)} €</Text>
          <Text style={s.sumStrong}>Brutto: {money(brutto)} €</Text>
        </View>

        <Text style={s.section}>Abschlagsrechnungen</Text>

        <View style={s.summaryGrid}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Bereits als Abschlag</Text>
            <Text style={s.summaryValue}>{money(bezahlt)} €</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Offener Rest</Text>
            <Text style={s.summaryValue}>{money(rest)} €</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Anzahl Abschläge</Text>
            <Text style={s.summaryValue}>{doc.abschlaege?.length || 0}</Text>
          </View>
        </View>

        <View style={s.abschlagForm}>
          <Text style={s.abschlagFormTitle}>Neuen Abschlag anlegen</Text>

          <View style={s.row}>
            <InputSmall
              placeholder="%"
              v={abschlagPctInput}
              onChange={setAbschlagPctInput}
            />
            <InputSmall
              placeholder="Betrag €"
              v={abschlagAmountInput}
              onChange={setAbschlagAmountInput}
            />
          </View>

          <TextInput
            value={abschlagNoteInput}
            onChangeText={setAbschlagNoteInput}
            style={[s.input, { marginTop: 8, marginBottom: 0 }]}
            placeholder="Hinweis zum Abschlag"
            placeholderTextColor="#B8C1CC"
          />

          <Pressable style={s.addAbschlagBtn} onPress={() => void addAbschlag()}>
            <Text style={s.addBtnTxt}>+ Abschlag speichern</Text>
          </Pressable>
        </View>

        {Array.isArray(doc.abschlaege) && doc.abschlaege.length ? (
          doc.abschlaege.map((a: AbschlagItem) => (
            <View key={a.id} style={s.abschlagCard}>
              <View style={s.abschlagTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.abschlagTitle}>Abschlag {a.nummer}</Text>
                  <Text style={s.abschlagMeta}>Datum: {a.datum}</Text>
                  <Text style={s.abschlagMeta}>Betrag: {money(a.betrag)} €</Text>
                  {a.prozent !== undefined ? (
                    <Text style={s.abschlagMeta}>
                      Prozent: {money(a.prozent)} %
                    </Text>
                  ) : null}
                  {a.note ? (
                    <Text style={s.abschlagMeta}>Hinweis: {a.note}</Text>
                  ) : null}
                </View>

                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{money(a.betrag)} €</Text>
                </View>
              </View>

              <View style={s.abschlagActions}>
                <Pressable
                  style={s.abschlagBtnPrimary}
                  onPress={() => void createAbschlagPdf(a)}
                >
                  <Text style={s.abschlagBtnTxt}>
                    {a.pdfUri ? "PDF teilen" : "PDF erstellen"}
                  </Text>
                </Pressable>

                <Pressable
                  style={s.abschlagBtnDanger}
                  onPress={() => void deleteAbschlag(a.id)}
                >
                  <Text style={s.abschlagBtnTxt}>Löschen</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={s.sourceText}>Noch keine Abschläge vorhanden.</Text>
        )}

        <Pressable style={s.btn} onPress={exportPdf} disabled={busy}>
          <Text style={s.btnTxt}>
            {busy ? "Bitte warten..." : "Rechnung PDF exportieren"}
          </Text>
        </Pressable>

        <Pressable
          style={s.btnSecondary}
          onPress={exportSchlussrechnungPdf}
          disabled={busy}
        >
          <Text style={s.btnTxt}>
            {busy ? "Bitte warten..." : "Schlussrechnung PDF exportieren"}
          </Text>
        </Pressable>

        <Pressable style={s.save} onPress={save} disabled={busy}>
          <Text style={s.btnTxt}>{busy ? "Bitte warten..." : "Speichern"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Input({ label, v, k, set }: any) {
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={String(v ?? "")}
        onChangeText={(t) => set((p: any) => ({ ...p, [k]: t }))}
        style={s.input}
        placeholder={label}
        placeholderTextColor="#B8C1CC"
      />
    </>
  );
}

function InputSmall({
  v,
  onChange,
  placeholder,
}: {
  v: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={String(v ?? "")}
      onChangeText={onChange}
      style={s.inputSmall}
      placeholder={placeholder}
      placeholderTextColor="#B8C1CC"
    />
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 16, paddingBottom: 28 },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loading: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: "900",
    color: COLORS.text,
  },

  kiBtn: { display: "none",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },

  kiBtnTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  sourceBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  sourceTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
  },

  sourceText: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 4,
  },

  linkedPdfBtn: {
    backgroundColor: "#0f766e",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },

  importBox: {
    backgroundColor: COLORS.card2,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  importTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
  },

  importSub: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 10,
  },

  importBtnRow: {
    flexDirection: "row",
    gap: 8,
  },

  importBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  importBtnAlt: {
    backgroundColor: "#0F766E",
  },

  importBtnTxt: {
    color: COLORS.textLight,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 13,
  },

  section: {
    marginTop: 20,
    marginBottom: 6,
    fontWeight: "900",
    fontSize: 16,
    color: COLORS.text,
  },

  label: {
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: 4,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },

  inputSmall: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  row: {
    flexDirection: "row",
    gap: 6,
  },

  rowCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: COLORS.card,
  },

  rowCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  rowTitle: {
    fontWeight: "900",
    color: COLORS.text,
  },

  removeBtn: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  removeBtnTxt: {
    color: "#b91c1c",
    fontWeight: "900",
    fontSize: 12,
  },

  gp: {
    marginTop: 8,
    fontWeight: "900",
    color: COLORS.text,
  },

  addBtn: {
    backgroundColor: "#1d4ed8",
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
  },

  addBtnTxt: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "900",
  },

  sumBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
  },

  sum: {
    marginTop: 4,
    color: COLORS.text,
    fontWeight: "700",
  },

  sumStrong: {
    marginTop: 8,
    fontWeight: "900",
    fontSize: 18,
    color: COLORS.text,
  },

  summaryGrid: {
    gap: 8,
  },

  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },

  summaryLabel: {
    color: COLORS.sub,
    fontWeight: "700",
    marginBottom: 4,
  },

  summaryValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 20,
  },

  abschlagForm: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: COLORS.card2,
  },

  abschlagFormTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
    marginBottom: 10,
  },

  addAbschlagBtn: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },

  abschlagCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: COLORS.card,
  },

  abschlagTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  abschlagTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },

  abschlagMeta: {
    marginTop: 4,
    color: COLORS.sub,
    fontWeight: "700",
  },

  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.card2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  badgeTxt: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
  },

  abschlagActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  abschlagBtnPrimary: {
    flex: 1,
    backgroundColor: "#0f4c81",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },

  abschlagBtnDanger: {
    flex: 1,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },

  abschlagBtnTxt: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "900",
  },

  btn: {
    backgroundColor: "#0ea5e9",
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
  },

  btnSecondary: {
    backgroundColor: "#334155",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },

  save: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },

  btnTxt: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "900",
  },
});













