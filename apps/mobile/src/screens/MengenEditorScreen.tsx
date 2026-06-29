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
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { COLORS } from "../ui/theme";
import { buildDocumentPdf } from "../lib/exporters/documentPdfBuilder";
import { api } from "../lib/api";
import { submitToEingangPruefung } from "../lib/submitToEingangPruefung";
import RlcKiFloatingButton from "../components/RlcKiFloatingButton";
import { registerRlcKiModuleHandler } from "../lib/rlcKiModuleBridge";
import { parseRlcKiSmartDoc } from "../lib/rlcKiSmartParser";

type Props = NativeStackScreenProps<RootStackParamList, "MengenEditor">;

const KEY = "rlc_mengen_list:";
const OFFER_KEY = "rlc_angebot_list:";
const KEY_MODE = "rlc_mobile_mode";

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

function safeEvalFormula(expr: string): number {
  try {
    if (!expr) return 0;

    const cleaned = String(expr).replace(/[^0-9+\-*/().]/g, "");
    if (!cleaned) return 0;
    if (cleaned.includes("..") || cleaned.includes("**")) return 0;

    const out = Function(`"use strict"; return (${cleaned})`)();
    return Number.isFinite(Number(out)) ? Number(out) : 0;
  } catch {
    return 0;
  }
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function normalizeMengenRow(r: any, idx: number) {
  return {
    id: String(r?.id || makeId()),
    pos: String(r?.pos || idx + 1),
    text: String(r?.text || r?.beschreibung || ""),
    unit: String(r?.unit || r?.einheit || ""),
    formula: String(r?.formula || ""),
    qty: String(r?.qty ?? r?.quantity ?? r?.menge ?? "0"),
    ep: String(r?.ep ?? r?.price ?? r?.einzelpreis ?? "0"),
    angebotRowId: r?.angebotRowId ? String(r.angebotRowId) : null,
  };
}

function createEmptyDoc(params: {
  projectId: string;
  projectCode: string;
  angebotId?: string | null;
}) {
  return {
    id: makeId(),
    projectId: params.projectId,
    projectCode: params.projectCode,
    sourceType: params?.angebotId ? "ANGEBOT" : "FREE",
    sourceLocked: !!params?.angebotId,
    angebotId: params?.angebotId || null,
    angebotSnapshot: null,
    title: "Mengenermittlung",
    datum: new Date().toISOString().slice(0, 10),
    pdfUri: "",
    rows: [normalizeMengenRow({}, 0)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function normalizeAngebotToMengen(
  a: any,
  params: { projectId: string; projectCode: string }
) {
  const angebotRows = Array.isArray(a?.rows) ? a.rows : [];
  const snapshot = deepClone(a);

  return {
    ...createEmptyDoc({
      projectId: params.projectId,
      projectCode: params.projectCode,
      angebotId: a?.id || null,
    }),
    sourceType: "ANGEBOT",
    sourceLocked: true,
    angebotId: String(a?.id || ""),
    angebotSnapshot: snapshot,
    title: String(
      a?.title || a?.angebotTitle || a?.angebotNr || "Mengenermittlung"
    ),
    datum: new Date().toISOString().slice(0, 10),
    pdfUri: "",
    rows: angebotRows.length
      ? angebotRows.map((r: any, i: number) =>
          normalizeMengenRow(
            {
              angebotRowId: r?.id || null,
              pos: r?.pos,
              text: r?.text || r?.beschreibung,
              unit: r?.unit || r?.einheit,
              formula: "",
              qty: r?.quantity ?? r?.qty ?? r?.menge ?? "0",
              ep: r?.ep ?? r?.price ?? r?.einzelpreis ?? "0",
            },
            i
          )
        )
      : [normalizeMengenRow({}, 0)],
  };
}

function normalizeStoredDoc(
  input: any,
  params: { projectId: string; projectCode: string; angebotId?: string | null }
) {
  return {
    ...createEmptyDoc({
      projectId: params.projectId,
      projectCode: params.projectCode,
      angebotId: params.angebotId || null,
    }),
    ...input,
    projectId: String(input?.projectId || params.projectId),
    projectCode: String(input?.projectCode || params.projectCode),
    sourceType: String(
      input?.sourceType || (input?.angebotId ? "ANGEBOT" : "FREE")
    ),
    sourceLocked:
      typeof input?.sourceLocked === "boolean"
        ? input.sourceLocked
        : !!input?.angebotId,
    angebotId: input?.angebotId ? String(input.angebotId) : null,
    angebotSnapshot: input?.angebotSnapshot
      ? deepClone(input.angebotSnapshot)
      : null,
    title: String(input?.title || "Mengenermittlung"),
    datum: String(input?.datum || new Date().toISOString().slice(0, 10)),
    pdfUri: String(input?.pdfUri || ""),
    createdAt: Number(input?.createdAt || Date.now()),
    updatedAt: Number(input?.updatedAt || Date.now()),
    rows:
      Array.isArray(input?.rows) && input.rows.length
        ? input.rows.map((r: any, i: number) => normalizeMengenRow(r, i))
        : [normalizeMengenRow({}, 0)],
  };
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

function pickBestOfferForMengen(list: any[]) {
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) return null;

  const accepted = rows.filter(
    (x: any) => String(x?.status || "").trim().toLowerCase() === "angenommen"
  );

  const base = accepted.length ? accepted : rows;

  const sorted = [...base].sort((a, b) => {
    const statusDiff = getOfferStatusRank(b) - getOfferStatusRank(a);
    if (statusDiff !== 0) return statusDiff;
    return getTs(b) - getTs(a);
  });

  return sorted[0] || null;
}

async function getMode(): Promise<"NUR_APP" | "SERVER_SYNC"> {
  const raw = await AsyncStorage.getItem(KEY_MODE);
  return raw === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
}

export default function MengenEditorScreen({ route, navigation }: Props) {
  const { projectCode, mengenId, angebotId, projectId } = route.params;

  const [doc, setDoc] = useState<any>(() =>
    createEmptyDoc({
      projectId,
      projectCode,
      angebotId: angebotId || null,
    })
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: mengenId ? "Mengenermittlung bearbeiten" : "Mengenermittlung",
      });
      void load();
    }, [navigation, mengenId, angebotId, projectCode, projectId])
  );

  async function readMengenList() {
    const mode = await getMode();

    if (mode === "NUR_APP") {
      const raw = await AsyncStorage.getItem(KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }

    try {
      const list = await api.getMengen(projectCode);
      const safe = Array.isArray(list) ? list : [];

      await AsyncStorage.setItem(KEY + projectCode, JSON.stringify(safe));
      return safe;
    } catch (e) {
      console.log("readMengenList server fallback -> local", e);
      const raw = await AsyncStorage.getItem(KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }
  }

  async function readOfferList() {
    const mode = await getMode();

    if (mode === "NUR_APP") {
      const raw = await AsyncStorage.getItem(OFFER_KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }

    try {
      const list = await api.getAngebote(projectCode);
      const safe = Array.isArray(list) ? list : [];

      await AsyncStorage.setItem(OFFER_KEY + projectCode, JSON.stringify(safe));
      return safe;
    } catch (e) {
      console.log("readOfferList server fallback -> local", e);
      const raw = await AsyncStorage.getItem(OFFER_KEY + projectCode);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }
  }

  async function load() {
    try {
      setLoading(true);

      const mengenList = await readMengenList();

      if (mengenId) {
        const found = mengenList.find(
          (x: any) => String(x?.id) === String(mengenId)
        );

        if (found) {
          setDoc(
            normalizeStoredDoc(found, {
              projectId,
              projectCode,
              angebotId: found?.angebotId || angebotId || null,
            })
          );
          return;
        }
      }

      const offerList = await readOfferList();

      if (angebotId) {
        const existingFromAngebot = mengenList.find(
          (x: any) => String(x?.angebotId || "") === String(angebotId)
        );

        if (existingFromAngebot) {
          setDoc(
            normalizeStoredDoc(existingFromAngebot, {
              projectId,
              projectCode,
              angebotId,
            })
          );
          return;
        }

        const angebot =
          offerList.find((x: any) => String(x?.id) === String(angebotId)) ||
          null;

        if (angebot) {
          setDoc(
            normalizeAngebotToMengen(angebot, {
              projectId,
              projectCode,
            })
          );
          return;
        }
      }

      const bestOffer = pickBestOfferForMengen(offerList);

      if (bestOffer?.id) {
        const existingFromBestOffer = mengenList.find(
          (x: any) => String(x?.angebotId || "") === String(bestOffer.id)
        );

        if (existingFromBestOffer) {
          setDoc(
            normalizeStoredDoc(existingFromBestOffer, {
              projectId,
              projectCode,
              angebotId: String(bestOffer.id),
            })
          );
          return;
        }

        setDoc(
          normalizeAngebotToMengen(bestOffer, {
            projectId,
            projectCode,
          })
        );
        return;
      }

      if (!angebotId && !mengenId && mengenList.length > 0) {
        const latestMengen = [...mengenList].sort((a: any, b: any) => {
          return getTs(b) - getTs(a);
        })[0];

        if (latestMengen) {
          setDoc(
            normalizeStoredDoc(latestMengen, {
              projectId,
              projectCode,
              angebotId: latestMengen?.angebotId || null,
            })
          );
          return;
        }
      }

      setDoc(
        createEmptyDoc({
          projectId,
          projectCode,
          angebotId: null,
        })
      );
    } catch (e) {
      console.log("LOAD MENGEN ERROR", e);
      Alert.alert("Fehler", "Mengenermittlung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(i: number, key: string, val: string) {
    setDoc((prev: any) => {
      const rows = [...prev.rows];
      rows[i] = { ...rows[i], [key]: val };
      return {
        ...prev,
        rows,
        updatedAt: Date.now(),
      };
    });
  }

  function updateFormula(i: number, formula: string) {
    setDoc((prev: any) => {
      const rows = [...prev.rows];
      const qty = safeEvalFormula(formula);
      rows[i] = {
        ...rows[i],
        formula,
        qty: String(qty),
      };
      return {
        ...prev,
        rows,
        updatedAt: Date.now(),
      };
    });
  }

  function addRow() {
    setDoc((prev: any) => ({
      ...prev,
      rows: [
        ...prev.rows,
        normalizeMengenRow(
          {
            pos: String((prev.rows?.length || 0) + 1),
          },
          prev.rows?.length || 0
        ),
      ],
      updatedAt: Date.now(),
    }));
  }

  function removeRow(i: number) {
    setDoc((prev: any) => {
      const rows = [...prev.rows];
      rows.splice(i, 1);

      const normalizedRows =
        rows.length > 0
          ? rows.map((r: any, idx: number) =>
              normalizeMengenRow({ ...r, pos: String(idx + 1) }, idx)
            )
          : [normalizeMengenRow({}, 0)];

      return {
        ...prev,
        rows: normalizedRows,
        updatedAt: Date.now(),
      };
    });
  }

  const netto = useMemo(() => {
    return (Array.isArray(doc?.rows) ? doc.rows : []).reduce(
      (s: number, r: any) => s + num(r.qty) * num(r.ep),
      0
    );
  }, [doc.rows]);

  async function persistDoc(customDoc?: any) {
    const base = customDoc || doc;

    const normalized = {
      ...base,
      projectId: String(base.projectId || projectId),
      projectCode: String(base.projectCode || projectCode),
      title: String(base.title || "Mengenermittlung").trim(),
      datum: String(base.datum || "").trim(),
      sourceType: String(
        base.sourceType || (base.angebotId ? "ANGEBOT" : "FREE")
      ),
      sourceLocked:
        typeof base.sourceLocked === "boolean"
          ? base.sourceLocked
          : !!base.angebotId,
      angebotId: base.angebotId || null,
      angebotSnapshot: base.angebotSnapshot
        ? deepClone(base.angebotSnapshot)
        : null,
      pdfUri: String(base.pdfUri || ""),
      createdAt: Number(base.createdAt || Date.now()),
      updatedAt: Date.now(),
      rows:
        Array.isArray(base.rows) && base.rows.length
          ? base.rows.map((r: any, i: number) => normalizeMengenRow(r, i))
          : [normalizeMengenRow({}, 0)],
    };

    const raw = await AsyncStorage.getItem(KEY + projectCode);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    const idx = next.findIndex(
      (x: any) => String(x.id) === String(normalized.id)
    );

    if (idx >= 0) next[idx] = normalized;
    else next.unshift(normalized);

    await AsyncStorage.setItem(KEY + projectCode, JSON.stringify(next));

    const mode = await getMode();

    if (mode === "SERVER_SYNC") {
      try {
        await api.saveMengen(projectCode, normalized);
      } catch (e) {
        console.log("persistDoc saveMengen server fallback -> local", e);
      }
    }

    await submitToEingangPruefung({
      type: "MENGENERMITTLUNG",
      projectKey: normalized.projectCode || projectCode,
      projectId: normalized.projectId || projectId,
      projectCode: normalized.projectCode || projectCode,
      title: normalized.title || "Mengenermittlung",
      doc: normalized,
      pdfUri: normalized.pdfUri || null,
      status: "EINGEREICHT",
      sourceScreen: "MengenEditor",
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
      console.log("SAVE MENGEN ERROR", e);
      Alert.alert("Fehler", "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    try {
      setBusy(true);

      const saved = await persistDoc();

      const fileNameBase = String(saved.title || "mengenermittlung")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_");

      const { pdfUri } = await buildDocumentPdf({
        type: "MENGENERMITTLUNG",
        projectCode: saved?.projectCode || projectCode,
        fileName: `${fileNameBase}_${saved.id}.pdf`,
        title: "MENGENERMITTLUNG",
        subTitle:
          saved?.sourceType === "ANGEBOT"
            ? "Basierend auf angenommenem Angebot"
            : "Freie Mengenermittlung",
        date: saved?.datum || "",
        rows: (saved.rows || []).map((r: any) => ({
          pos: r.pos,
          text: r.text,
          unit: r.unit,
          qty: r.qty,
          ep: r.ep,
          gp: num(r.qty) * num(r.ep),
          formula: r.formula || "",
        })),
        totals: {
          netto: (saved.rows || []).reduce(
            (sum: number, r: any) => sum + num(r.qty) * num(r.ep),
            0
          ),
        },
        extraBlocks: [
          {
            title: "Dokument",
            lines: [
              `Titel: ${String(saved.title || "Mengenermittlung")}`,
              `Quelle: ${
                saved.sourceType === "ANGEBOT"
                  ? "Angebot"
                  : "Freie Mengenermittlung"
              }`,
              ...(saved.angebotId
                ? [`Basis-Angebot: ${String(saved.angebotId)}`]
                : []),
            ],
          },
        ],
        showFormulaColumn: true,
        shareAfterCreate: true,
      });

      const nextDoc = { ...saved, pdfUri };
      setDoc(nextDoc);
      await persistDoc(nextDoc);
    } catch (e) {
      console.log("PDF MENGEN ERROR", e);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function createRechnung() {
    try {
      setBusy(true);

      const saved = await persistDoc();

      navigation.navigate("RechnungEditor", {
        projectId,
        projectCode,
        fromMengen: true,
        fromAngebotId: saved?.angebotId || null,
        mengenId: saved.id,
      });
    } catch (e) {
      console.log("CREATE RECHNUNG FROM MENGEN ERROR", e);
      Alert.alert(
        "Fehler",
        "Die Mengenermittlung konnte vor dem Wechsel zur Rechnung nicht gespeichert werden."
      );
    } finally {
      setBusy(false);
    }
  }


  // RLC_KI_MODULE_HANDLER_MENGEN_V2_SMART
  useEffect(() => {
    return registerRlcKiModuleHandler("MengenEditor", async (payload: any) => {
      const input = String(payload?.input || "").trim();
      const parsed = parseRlcKiSmartDoc(input);

      setDoc((prev: any) => {
        const parsedRows = parsed.rows.length
          ? parsed.rows.map((r: any, i: number) => ({
              id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
              pos: r.pos || String(i + 1),
              text: r.text || "",
              unit: r.unit || "",
              formula: "",
              qty: r.qty || "",
              ep: r.ep || "",
            }))
          : prev.rows;

        return {
          ...prev,
          title: parsed.title || parsed.baustelle || prev?.title || "Mengenermittlung",
          datum: parsed.datum || prev?.datum || new Date().toISOString().slice(0, 10),
          rows: parsedRows,
          note:
            parsed.warnings?.length
              ? `RLC KI Hinweise:
${parsed.warnings.map((w: string) => `- ${w}`).join("\n")}`
              : prev?.note,
          updatedAt: Date.now(),
        };
      });

      return {
        ok: true,
        handled: true,
        message: parsed.rows.length ? "MENGEN_SMART_ROWS_FILLED" : "MENGEN_SMART_FIELDS_FILLED",
      };
    });
  }, []);
  if (loading) {
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
        <View style={s.headerRow}>
          <Text style={s.title}>Mengenermittlung</Text>
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoTitle}>Quelle</Text>
          <Text style={s.infoText}>
            {doc.sourceType === "ANGEBOT"
              ? "Diese Mengenermittlung basiert auf einem Angebot."
              : "Freie Mengenermittlung."}
          </Text>
          {doc.angebotId ? (
            <Text style={s.infoSmall}>Angebot-ID: {String(doc.angebotId)}</Text>
          ) : null}
          {doc.sourceLocked ? (
            <Text style={s.infoSmall}>Quelle ist als Snapshot gespeichert.</Text>
          ) : null}
          {doc.pdfUri ? <Text style={s.infoSmall}>PDF vorhanden.</Text> : null}
        </View>

        <Text style={s.label}>Titel</Text>
        <TextInput
          value={String(doc.title || "")}
          onChangeText={(v) =>
            setDoc((p: any) => ({ ...p, title: v, updatedAt: Date.now() }))
          }
          style={s.input}
          placeholder="Titel"
          placeholderTextColor="#B8C1CC"
        />

        <Text style={s.label}>Datum</Text>
        <TextInput
          value={String(doc.datum || "")}
          onChangeText={(v) =>
            setDoc((p: any) => ({ ...p, datum: v, updatedAt: Date.now() }))
          }
          style={s.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#B8C1CC"
        />

        <Pressable style={s.addBtn} onPress={addRow}>
          <Text style={s.addTxt}>+ Position hinzufügen</Text>
        </Pressable>

        {doc.rows.map((r: any, i: number) => {
          const total = num(r.qty) * num(r.ep);

          return (
            <View key={r.id} style={s.rowCard}>
              <View style={s.rowHeader}>
                <Text style={s.pos}>Pos {r.pos}</Text>
                <Pressable onPress={() => removeRow(i)} style={s.delBtn}>
                  <Text style={s.delete}>✕</Text>
                </Pressable>
              </View>

              <TextInput
                placeholder="Beschreibung"
                value={String(r.text || "")}
                onChangeText={(v) => updateRow(i, "text", v)}
                style={s.input}
                placeholderTextColor="#B8C1CC"
              />

              <View style={s.row}>
                <TextInput
                  placeholder="Einheit"
                  value={String(r.unit || "")}
                  onChangeText={(v) => updateRow(i, "unit", v)}
                  style={s.inputSmall}
                  placeholderTextColor="#B8C1CC"
                />

                <TextInput
                  placeholder="Menge"
                  value={String(r.qty || "")}
                  onChangeText={(v) => updateRow(i, "qty", v)}
                  style={s.inputSmall}
                  placeholderTextColor="#B8C1CC"
                  keyboardType="decimal-pad"
                />

                <TextInput
                  placeholder="EP"
                  value={String(r.ep || "")}
                  onChangeText={(v) => updateRow(i, "ep", v)}
                  style={s.inputSmall}
                  placeholderTextColor="#B8C1CC"
                  keyboardType="decimal-pad"
                />
              </View>

              <TextInput
                placeholder="Formel (z.B. 10*2*1.2)"
                value={String(r.formula || "")}
                onChangeText={(v) => updateFormula(i, v)}
                style={s.input}
                placeholderTextColor="#B8C1CC"
              />

              <View style={s.resultRow}>
                <View style={s.resultLeft}>
                  <Text style={s.resultLabel}>Gesamtpreis</Text>
                </View>

                <View style={s.result}>
                  <Text style={s.resultTxt}>{money(total)} €</Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={s.totalBox}>
          <Text style={s.totalLabel}>Netto</Text>
          <Text style={s.totalValue}>{money(netto)} €</Text>
        </View>

        <Pressable style={s.pdfBtn} onPress={exportPdf} disabled={busy}>
          <Text style={s.btnTxt}>
            {busy
              ? "Bitte warten..."
              : doc.pdfUri
              ? "PDF erneut teilen"
              : "PDF exportieren"}
          </Text>
        </Pressable>

        <Pressable style={s.save} onPress={save} disabled={busy}>
          <Text style={s.btnTxt}>{busy ? "Bitte warten..." : "Speichern"}</Text>
        </Pressable>

        <Pressable style={s.rechnung} onPress={createRechnung} disabled={busy}>
          <Text style={s.btnTxt}>
            {busy ? "Bitte warten..." : "➡ Rechnung erstellen"}
          </Text>
        </Pressable>
      </ScrollView>

      <RlcKiFloatingButton
        projectId={projectId}
        projectCode={projectCode}
        title="Mengenermittlung"
        screen="MengenEditor"
        initialMessage="Ich bin in der Mengenermittlung. Hilf mir konkret mit Mengen, Formeln, Positionen, Aufmaß und PDF."
      />
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
    marginBottom: 10,
  },

  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: "900",
    color: COLORS.text,
  },

  kiBtn: {
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

  infoBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  infoTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
  },

  infoText: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 4,
  },

  infoSmall: {
    color: COLORS.sub,
    fontWeight: "700",
    marginTop: 6,
    fontSize: 12,
  },

  label: {
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: 4,
  },

  addBtn: {
    backgroundColor: COLORS.accent,
    padding: 12,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 10,
  },

  addTxt: { color: "#fff", textAlign: "center", fontWeight: "900" },

  rowCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: COLORS.card,
  },

  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  pos: {
    fontWeight: "900",
    color: COLORS.text,
  },

  delBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  delete: {
    color: "#dc2626",
    fontWeight: "900",
    fontSize: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  row: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },

  inputSmall: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },

  resultRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },

  resultLeft: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  resultLabel: {
    color: COLORS.sub,
    fontWeight: "700",
  },

  result: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    minHeight: 48,
  },

  resultTxt: {
    fontWeight: "900",
    color: "#065f46",
    fontSize: 16,
  },

  totalBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  totalLabel: {
    fontWeight: "700",
    color: COLORS.text,
  },

  totalValue: {
    fontWeight: "900",
    fontSize: 18,
    color: COLORS.text,
  },

  pdfBtn: {
    backgroundColor: "#0ea5e9",
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },

  save: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },

  rechnung: {
    backgroundColor: "#16a34a",
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










