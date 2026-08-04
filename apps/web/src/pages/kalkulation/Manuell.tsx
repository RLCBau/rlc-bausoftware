import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/Manuell.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { API_BASE } from "../../lib/apiBase";
import { LV, type LVPos } from "./store.lv";
import {
  openPdfBlobPreview,
  reservePdfPreview } from
"../../lib/pdf/companyPdfHeader";

const MWST_KEY = "rlc_lv_mwst_v1";
const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const ANGEBOT_HANDOFF_KEY = "rlc_kalkulation_angebot_handoff_v1";

type ManualRow = LVPos & {
  rabatt?: number;
  note?: string;
};

type CadPayload = {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  bemerkung?: string;
  einheit?: string;
  menge?: number;
  preis?: number;
  confidence?: number;
  layer?: string;
  geomType?: "line" | "polyline" | "polygon" | "point";
  unitHint?: "m" | "m2" | "m²" | "m3" | "m³" | "stk";
};

type ProjectLike = {
  id?: string;
  code?: string;
  projectCode?: string;
  number?: string;
  name?: string;
  projectName?: string;
  client?: string;
  place?: string;
  location?: string;
  ort?: string;
};

type OfferMeta = {
  number: string;
  place: string;
  clientName: string;
  clientAddress: string;
  notes: string;
};

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function n(value: unknown, fallback = 0): number {
  const x =
  typeof value === "number" ?
  value :
  Number(String(value ?? "").replace(",", ".").trim());

  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(n(value));
}

function safeFileName(value: string): string {
  return String(value || "Datei").
  replace(/[^\w.-]+/g, "_").
  replace(/_+/g, "_");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getAuthToken(): string {
  try {
    const keys = [
    "token",
    "authToken",
    "accessToken",
    "rlc_token",
    "rlc_auth_token",
    "rlc_access_token"];


    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    }

    const jsonKeys = ["auth", "user", "session", "rlc_auth", "rlc_session"];

    for (const key of jsonKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const token =
        parsed?.token ??
        parsed?.accessToken ??
        parsed?.authToken ??
        parsed?.jwt ??
        parsed?.data?.token ??
        parsed?.data?.accessToken;

        if (typeof token === "string" && token.trim()) return token.trim();
      } catch {


        //
      }}} catch {


    //
  }return "";
}

function authJsonHeaders(): HeadersInit {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAuthToken();

  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function getCurrentProject(projectCtx: any): ProjectLike | null {
  return (
    projectCtx?.project ||
    projectCtx?.currentProject ||
    projectCtx?.selectedProject ||
    projectCtx?.current ||
    null);

}

function getProjectKey(projectCtx: any): string {
  const p = getCurrentProject(projectCtx);

  return String(
    p?.code ||
    p?.projectCode ||
    p?.number ||
    projectCtx?.projectCode ||
    projectCtx?.projectId ||
    p?.id ||
    projectCtx?.id ||
    ""
  ).
  trim().
  toUpperCase();
}

function getProjectName(projectCtx: any): string {
  const p = getCurrentProject(projectCtx);
  return String(p?.name || p?.projectName || "").trim();
}

function getProjectPlace(projectCtx: any, offerPlace?: string): string {
  const p = getCurrentProject(projectCtx);

  return String(
    offerPlace ||
    p?.place ||
    p?.location ||
    p?.ort ||
    projectCtx?.place ||
    projectCtx?.location ||
    ""
  ).trim();
}

function localBackupKey(projectKey: string) {
  return `rlc_kalkulation_manuell_elite_v1:${projectKey || "NO_PROJECT"}`;
}

function mapEinheit(p: CadPayload): string {
  if (p.einheit && p.einheit.trim()) {
    const e = p.einheit.trim().toLowerCase();
    if (e === "m2" || e === "m²") return "m²";
    if (e === "m3" || e === "m³") return "m³";
    if (e === "stk" || e === "stück" || e === "st") return "St";
    if (e === "m") return "m";
    return p.einheit.trim();
  }

  if (p.unitHint) return mapEinheit({ einheit: p.unitHint } as CadPayload);
  if (p.geomType === "polygon") return "m²";
  if (p.geomType === "polyline" || p.geomType === "line") return "m";
  if (p.geomType === "point") return "St";

  const layer = String(p.layer || "").toLowerCase();
  if (/fläche|asphalt|pflaster|area|polygon/.test(layer)) return "m²";
  if (/leitung|trasse|kanal|rohr|line/.test(layer)) return "m";
  if (/punkt|schacht|symbol|bohrung/.test(layer)) return "St";
  if (/aushub|volumen|m3|m³/.test(layer)) return "m³";

  const text = `${p.kurztext || ""} ${p.posNr || ""}`.toLowerCase();
  if (/\bm²|\bm2|fläche|schicht|belag/.test(text)) return "m²";
  if (/\bm³|\bm3|volumen|kubatur|aushub/.test(text)) return "m³";
  if (/\bstk|stück|schacht|anschluss|hausanschluss\b/.test(text)) return "St";
  if (/\bm\b|leitung|trasse|kabel|rohr/.test(text)) return "m";

  return "m";
}

function roundForUnit(v: number | undefined, einheit: string): number {
  const x = Number(v || 0);
  const e = einheit.toLowerCase();

  if (e === "stk" || e === "stück" || e === "st") return Math.round(x);
  if (e === "m³" || e === "m3") return Math.round(x * 1000) / 1000;

  return Math.round(x * 100) / 100;
}

function lineNet(row: ManualRow): number {
  const raw = n(row.menge) * n(row.preis);
  const rabatt = n(row.rabatt);
  return round2(raw * (1 - rabatt / 100));
}

function normalizeRow(row: Partial<ManualRow>): ManualRow {
  const einheit = String(row.einheit || "m").trim();
  const menge = roundForUnit(n(row.menge), einheit);
  const preis = n(row.preis);

  return {
    id: String(row.id || safeId()),
    posNr: String(row.posNr || ""),
    parentPosNr: row.parentPosNr || "",
    sortIndex: row.sortIndex,

    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    bemerkung: row.bemerkung || "",

    einheit,
    menge,
    preis,
    gesamt: round2(menge * preis),
    waehrung: row.waehrung || "EUR",

    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    source: row.source || "manual",
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    rabatt: n(row.rabatt),
    note: row.note || ""
  };
}

function cadToLV(p: CadPayload): ManualRow {
  const einheit = mapEinheit(p);

  return normalizeRow({
    id: safeId(),
    posNr: p.posNr ?? "",
    kurztext: p.kurztext ?? "",
    langtext: p.langtext ?? "",
    bemerkung: p.bemerkung ?? "",
    einheit,
    menge: roundForUnit(p.menge ?? 0, einheit),
    preis: typeof p.preis === "number" ? p.preis : 0,
    confidence: typeof p.confidence === "number" ? p.confidence : undefined,
    source: "cad"
  });
}

function toManualRows(rows: LVPos[]): ManualRow[] {
  return rows.map((r) =>
  normalizeRow({
    ...r,
    rabatt: (r as any).rabatt ?? 0,
    note: (r as any).note ?? ""
  })
  );
}

export default function Manuell() {
  const nav = useNavigate();
  const projectCtx: any = useProject() as any;
  const projectKey = getProjectKey(projectCtx);
  const projectName = getProjectName(projectCtx);

  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ManualRow[]>(() => toManualRows(LV.list()));
  const [selectedId, setSelectedId] = useState<string>("");
  const [mwst, setMwst] = useState<number>(() =>
  Number(localStorage.getItem(MWST_KEY) ?? 19)
  );
  const [globalMarkup, setGlobalMarkup] = useState<number>(() => {
    const saved = localStorage.getItem("rlc_kalkulation_global_markup_v1");
    return saved == null ? 10 : Number(saved);
  });

  const [serverBusy, setServerBusy] = useState(false);
  const [serverStatus, setServerStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const [offer, setOffer] = useState<OfferMeta>({
    number: `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    place: "München",
    clientName: "Muster Bau GmbH",
    clientAddress: "Hauptstraße 5, 50667 Köln",
    notes:
    "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage. Manuell kalkulierte Preise."
  });

  useEffect(() => {
    localStorage.setItem("rlc_kalkulation_global_markup_v1", String(globalMarkup));
  }, [globalMarkup]);

  useEffect(() => {
    setRows(toManualRows(LV.list()));
  }, []);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(mwst || 0));
  }, [mwst]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d: any = e.data;
      if (!d || d.type !== "CAD_TO_KALKULATION") return;

      try {
        const list = Array.isArray(d.payload) ?
        (d.payload as CadPayload[]).map(cadToLV) :
        [cadToLV(d.payload as CadPayload)];

        persistRows([...list, ...toManualRows(LV.list())]);
      } catch {


        //
      }};
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );

  const summary = useMemo(() => {
    const subtotal = rows.reduce((s, r) => s + lineNet(r), 0);
    const markupValue = subtotal * (globalMarkup / 100);
    const netto = subtotal + markupValue;
    const tax = netto * (mwst / 100);
    const brutto = netto + tax;
    const priced = rows.filter((r) => n(r.preis) > 0).length;

    return {
      subtotal: round2(subtotal),
      markupValue: round2(markupValue),
      netto: round2(netto),
      tax: round2(tax),
      brutto: round2(brutto),
      priced,
      total: rows.length,
      coveragePct: rows.length ? Math.round(priced / rows.length * 100) : 0
    };
  }, [rows, mwst, globalMarkup]);

  function persistRows(next: ManualRow[]) {
    const normalized = next.map(normalizeRow);
    setRows(normalized);

    LV.bulkUpsert(
      normalized.map((r) => ({
        ...r,
        preis: n(r.preis),
        gesamt: lineNet(r),
        confidence: r.confidence,
        source: r.source || "manual"
      })) as LVPos[]
    );
  }

  function updateRow(id: string, patch: Partial<ManualRow>) {
    const next = rows.map((r) =>
    r.id === id ? normalizeRow({ ...r, ...patch }) : r
    );
    persistRows(next);
  }

  function addRow() {
    const row = normalizeRow({
      id: safeId(),
      posNr: "",
      kurztext: "",
      langtext: "",
      einheit: "m",
      menge: 0,
      preis: 0,
      rabatt: 0,
      source: "manual"
    });

    persistRows([row, ...rows]);
    setSelectedId(row.id);
  }

  function removeRow(id: string) {
    const next = rows.filter((r) => r.id !== id);
    persistRows(next);
    LV.remove(id);
    if (selectedId === id) setSelectedId(next[0]?.id || "");
  }

  function clearAll() {
    if (!confirm("Alle manuellen Positionen wirklich löschen?")) return;
    LV.clear();
    setRows([]);
    setSelectedId("");
  }

  async function saveToServer() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    const payload = {
      version: "manual-elite-v1",
      meta: {
        projectKey,
        projectName,
        savedAt: new Date().toISOString(),
        mwst,
        globalMarkup,
        offer
      },
      rows,
      summary,
      totals: {
        netto: summary.netto,
        aufschlagWert: summary.markupValue,
        brutto: summary.brutto
      }
    };

    try {
      setServerBusy(true);
      setServerStatus("Speichere…");

      const r = await fetch(
        apiUrl(`/api/kalkulation/${encodeURIComponent(projectKey)}/manuell/save`),
        {
          method: "POST",
          credentials: "include",
          headers: authJsonHeaders(),
          body: JSON.stringify(payload)
        }
      );

      if (r.status === 401 || r.status === 403 || r.status === 404) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
        setServerStatus(
          r.status === 404 ?
          "Server-Route fehlt · lokal gesichert" :
          "Nicht angemeldet · lokal gesichert"
        );
        return;
      }

      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
        setServerStatus("Serverfehler · lokal gesichert");
        return;
      }

      setServerStatus("Gespeichert");
      setTimeout(() => setServerStatus(""), 2000);
    } catch {
      localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
      setServerStatus("Fehler · lokal gesichert");
    } finally {
      setServerBusy(false);
    }
  }

  async function loadFromServer() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    try {
      setServerBusy(true);
      setServerStatus("Lade…");

      const r = await fetch(
        apiUrl(`/api/kalkulation/${encodeURIComponent(projectKey)}/manuell`),
        {
          method: "GET",
          credentials: "include",
          headers: authJsonHeaders()
        }
      );

      const json = await r.json().catch(() => null);

      if (r.status === 401 || r.status === 403 || r.status === 404 || !json?.exists) {
        const raw = localStorage.getItem(localBackupKey(projectKey));
        if (!raw) {
          setServerStatus("Kein Speicherstand");
          return;
        }

        applySnapshot(JSON.parse(raw));
        setServerStatus(r.status === 404 ? "Lokal geladen" : "Backup geladen");
        return;
      }

      if (!r.ok || !json?.ok) {
        setServerStatus("Laden fehlgeschlagen");
        return;
      }

      applySnapshot(json.data || {});
      setServerStatus("Geladen");
      setTimeout(() => setServerStatus(""), 2000);
    } catch {
      setServerStatus("Fehler beim Laden");
    } finally {
      setServerBusy(false);
    }
  }

  function applySnapshot(data: any) {
    const loadedRows = Array.isArray(data.rows) ? data.rows.map(normalizeRow) : [];

    if (loadedRows.length) persistRows(loadedRows);

    const meta = data.meta || {};
    if (typeof meta.mwst === "number") setMwst(meta.mwst);
    if (typeof meta.globalMarkup === "number") setGlobalMarkup(meta.globalMarkup);
    if (meta.offer) setOffer(meta.offer);
  }

  function handleAddFromCAD() {
    const raw = localStorage.getItem("cad_inbox");

    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          const list = (arr as CadPayload[]).map(cadToLV);
          persistRows([...list, ...rows]);
          localStorage.removeItem("cad_inbox");
          return;
        }
      } catch {


        //
      }}
    const pasted = prompt(
      'CAD JSON einfügen ({posNr,kurztext,einheit?,menge,preis} oder Array):'
    );
    if (!pasted) return;

    try {
      const data = JSON.parse(pasted);
      const list = Array.isArray(data) ?
      (data as CadPayload[]).map(cadToLV) :
      [cadToLV(data as CadPayload)];

      persistRows([...list, ...rows]);
    } catch {
      alert("JSON nicht gültig.");
    }
  }

  function exportCSV() {
    const csv = LV.exportCSV(rows);
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `kalkulation_manuell_${safeFileName(offer.number)}.csv`
    );
  }

  function importCSVFile(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      LV.importCSV(String(reader.result || ""));
      setRows(toManualRows(LV.list()));
      if (fileRef.current) fileRef.current.value = "";
    };

    reader.readAsText(file, "utf-8");
  }

  function exportXLSX() {
    const wsRows = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        PosNr: r.posNr,
        Kurztext: r.kurztext,
        Langtext: r.langtext,
        Einheit: r.einheit,
        Menge: r.menge,
        EP_Netto: r.preis ?? 0,
        Rabatt_Prozent: r.rabatt ?? 0,
        Zeilen_Netto: lineNet(r),
        Confidence: r.confidence ?? "",
        Quelle: r.source ?? "manual",
        Notiz: r.note ?? ""
      }))
    );

    const wsSummary = XLSX.utils.json_to_sheet([
    { Kennzahl: "Projekt", Wert: projectKey || "—" },
    { Kennzahl: "Angebot", Wert: offer.number },
    { Kennzahl: "Netto", Wert: summary.netto },
    { Kennzahl: "MwSt %", Wert: mwst },
    { Kennzahl: "MwSt €", Wert: summary.tax },
    { Kennzahl: "Brutto", Wert: summary.brutto },
    { Kennzahl: "Positionen", Wert: rows.length },
    { Kennzahl: "Abdeckung %", Wert: summary.coveragePct }]
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsRows, "Manuelle Kalkulation");
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    XLSX.writeFile(wb, `Manuelle_Kalkulation_${safeFileName(offer.number)}.xlsx`);
  }

  async function exportPDF() {
    if (!rows.length) return;

    const pdfFileName = `Angebot_${safeFileName(offer.number)}.pdf`;
    const preview = reservePdfPreview(pdfFileName);

    try {
      setPdfBusy(true);
      setServerStatus("PDF wird erzeugt…");

      const payload = {
        title: "Angebot",
        project: {
          id: projectKey,
          code: projectKey,
          number: projectKey,
          name: projectName,
          client: offer.clientName,
          auftraggeber: offer.clientName,
          address: offer.clientAddress,
          adresse: offer.clientAddress,
          location: getProjectPlace(projectCtx, offer.place),
          place: getProjectPlace(projectCtx, offer.place)
        },
        recipient: {
          name: offer.clientName,
          client: offer.clientName,
          auftraggeber: offer.clientName,
          address: offer.clientAddress,
          adresse: offer.clientAddress,
          city: "",
          ort: ""
        },
        options: {
          offerNumber: offer.number,
          number: offer.number,
          city: offer.place,
          place: offer.place,
          dateISO: new Date().toISOString().slice(0, 10),
          payment: offer.notes,
          mwst,
          showWatermark: false,
          colorHeader: true,
          showTableHeader: true,
          showChapterRows: false
        },
        rows: rows.map((r) => ({
          id: r.id,
          posNr: r.posNr,
          lvPos: r.posNr,
          text: r.kurztext,
          kurztext: r.kurztext,
          title: r.kurztext,
          langtext: r.langtext,
          bemerkung: r.bemerkung,
          einheit: r.einheit,
          unit: r.einheit,
          menge: n(r.menge),
          qty: n(r.menge),
          preis: n(r.preis),
          ep: n(r.preis),
          rabatt: n(r.rabatt),
          zeilen: lineNet(r),
          total: lineNet(r),
          source: r.source || "manual"
        })),
        totals: {
          netto: summary.netto,
          subtotal: summary.subtotal,
          aufschlag: globalMarkup,
          aufschlagWert: summary.markupValue,
          mwst,
          steuer: summary.tax,
          brutto: summary.brutto
        }
      };

      const res = await fetch("/api/pdf/kalkulation-manuell", {
        method: "POST",
        credentials: "include",
        headers: authJsonHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `PDF Fehler (${res.status})`);
      }

      const blob = await res.blob();
      openPdfBlobPreview(blob, pdfFileName, preview);

      setServerStatus("PDF erzeugt");
      setTimeout(() => setServerStatus(""), 1800);
    } catch (e: any) {
      if (preview && !preview.closed) preview.close();
      setServerStatus("PDF Fehler");
      alert("PDF Export fehlgeschlagen: " + (e?.message || e));
    } finally {
      setPdfBusy(false);
    }
  }

  function goToKi() {
    const payload = {
      source: "rezepte",
      origin: "manuell",
      ts: new Date().toISOString(),
      projectKey,
      rows: rows.map((r) => ({
        posNr: r.posNr,
        pos: r.posNr,
        kurztext: r.kurztext,
        text: r.kurztext,
        langtext: r.langtext,
        einheit: r.einheit,
        unit: r.einheit,
        menge: r.menge,
        qty: r.menge,
        preis: r.preis ?? 0,
        ep: r.preis ?? 0,
        confidence: r.confidence
      }))
    };

    localStorage.setItem(KI_HANDOFF_KEY, JSON.stringify(payload));
    localStorage.setItem(MANUELL_HANDOFF_KEY, JSON.stringify(payload));

    nav(`/kalkulation/mit-ki${projectKey ? `?projectCode=${encodeURIComponent(projectKey)}` : ""}`);
  }

  function goToAngebot() {
    const payload = {
      source: "manuell",
      ts: new Date().toISOString(),
      projectKey,
      offer,
      mwst,
      globalMarkup,
      rows: rows.map((r) => ({
        id: r.id,
        pos: r.posNr,
        posNr: r.posNr,
        text: r.kurztext,
        kurztext: r.kurztext,
        langtext: r.langtext,
        unit: r.einheit,
        einheit: r.einheit,
        qty: r.menge,
        menge: r.menge,
        ep: r.preis ?? 0,
        preis: r.preis ?? 0,
        rabatt: r.rabatt ?? 0
      })),
      summary
    };

    localStorage.setItem(ANGEBOT_HANDOFF_KEY, JSON.stringify(payload));
    sessionStorage.setItem("kalkulation:lastDraft", JSON.stringify(payload));

    nav(`/kalkulation/angebot${projectKey ? `?projectCode=${encodeURIComponent(projectKey)}` : ""}`);
  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Manuelle Elite-Kalkulation</div>
          <h1 className={rlcClass(null, title)}>Kalkulation manuell</h1>
          <p className={rlcClass(null, subtitle)}>
            Professionelle manuelle Kalkulation mit Server-Snapshot, CAD-Import,
            Angebotsübergabe und direkter Verbindung zur KI-Kalkulation.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button className={rlcClass(null, btnSecondary)} onClick={addRow}>
            + Position
          </button>
          <button className={rlcClass(null, btnSecondary)} onClick={handleAddFromCAD}>
            + aus CAD
          </button>
          <button className={rlcClass(null, btnPrimary)} onClick={goToKi} disabled={!rows.length}>
            An KI übergeben
          </button>
          <button className={rlcClass(null, btnPrimary)} onClick={goToAngebot} disabled={!rows.length}>
            Angebot erstellen
          </button>
          <button className={rlcClass(null,
          btnSecondary)}
          onClick={saveToServer}
          disabled={serverBusy || !projectKey}>
            
            Speichern
          </button>
          <button className={rlcClass(null,
          btnSecondary)}
          onClick={loadFromServer}
          disabled={serverBusy || !projectKey}>
            
            Laden
          </button>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{projectKey || "—"}</b>
          {projectName ? <span> · {projectName}</span> : null}
          {serverStatus ? <span> · {serverStatus}</span> : null}
        </div>
      </section>

      <section className={rlcClass(null, grid4)}>
        <KpiCard label="Netto gesamt" value={money(summary.netto)} />
        <KpiCard label="Brutto gesamt" value={money(summary.brutto)} />
        <KpiCard
          label="Positionen"
          value={`${summary.total}`}
          sub={`${summary.coveragePct}% mit EP`} />
        
        <KpiCard
          label="MwSt / Aufschlag"
          value={`${mwst}% / ${globalMarkup}%`}
          sub={`Aufschlag: ${money(summary.markupValue)}`} />
        
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Angebot / Rahmenwerte</h2>
            <div className={rlcClass(null, sectionText)}>
              Diese Daten werden für PDF, XLSX, Server-Snapshot und Angebot verwendet.
            </div>
          </div>

          <div className={rlcClass(null, exportRow)}>
            <button className={rlcClass(null, btnSecondary)} onClick={exportCSV} disabled={!rows.length}>
              CSV
            </button>
            <button className={rlcClass(null, btnSecondary)} onClick={exportXLSX} disabled={!rows.length}>
              XLSX
            </button>
            <button className={rlcClass(null,
            btnSecondary)}
            onClick={exportPDF}
            disabled={!rows.length || pdfBusy}>
              
              {pdfBusy ? "PDF…" : "PDF"}
            </button>
            <button className={rlcClass(null, btnDanger)} onClick={clearAll} disabled={!rows.length}>
              Alles löschen
            </button>
          </div>
        </div>

        <div className={rlcClass(null, formGrid)}>
          <Field label="Angebot Nr.">
            <input className={rlcClass(null,
            input)}
            value={offer.number}
            onChange={(e) => setOffer({ ...offer, number: e.target.value })} />
            
          </Field>
          <Field label="Ort">
            <input className={rlcClass(null,
            input)}
            value={offer.place}
            onChange={(e) => setOffer({ ...offer, place: e.target.value })} />
            
          </Field>
          <Field label="Kunde">
            <input className={rlcClass(null,
            input)}
            value={offer.clientName}
            onChange={(e) => setOffer({ ...offer, clientName: e.target.value })} />
            
          </Field>
          <Field label="Kundenadresse">
            <input className={rlcClass(null,
            input)}
            value={offer.clientAddress}
            onChange={(e) =>
            setOffer({ ...offer, clientAddress: e.target.value })
            } />
            
          </Field>
          <Field label="MwSt %">
            <input
              type="number" className={rlcClass(null,
              input)}
              value={mwst}
              onChange={(e) => setMwst(n(e.target.value))} />
            
          </Field>
          <Field label="Globaler Aufschlag %">
            <input
              type="number" className={rlcClass(null,
              input)}
              value={globalMarkup}
              onChange={(e) => setGlobalMarkup(n(e.target.value))} />
            
          </Field>
        </div>

        <div className="rlc-migrated-pages-kalkulation-manuell-tsx-822">
          <Field label="Notizen / Zahlungsbedingungen">
            <textarea className={rlcClass(null,
            { ...input, minHeight: 72 })}
            value={offer.notes}
            onChange={(e) => setOffer({ ...offer, notes: e.target.value })} />
            
          </Field>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"

          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importCSVFile(f);
          }} className="rlc-migrated-pages-kalkulation-manuell-tsx-823" />
        

        <div className="rlc-migrated-pages-kalkulation-manuell-tsx-824">
          <button className={rlcClass(null, btnSecondary)} onClick={() => fileRef.current?.click()}>
            Import CSV
          </button>
        </div>
      </section>

      <section className={rlcClass(null, mainGrid)}>
        <div className={rlcClass(null, card)}>
          <div className={rlcClass(null, sectionHead)}>
            <div>
              <h2 className={rlcClass(null, sectionTitle)}>LV-Positionen · manuelle Kalkulation</h2>
              <div className={rlcClass(null, sectionText)}>
                Kompakte Haupttabelle. Langtext, Rabatt und Notizen stehen im Detailpanel rechts.
              </div>
            </div>
          </div>

          <div className={rlcClass(null, tableWrap)}>
            <table className={rlcClass(null, table)}>
              <thead>
                <tr>
                  <th className={rlcClass(null, th)}>Pos-Nr</th>
                  <th className={rlcClass(null, th)}>Kurztext</th>
                  <th className={rlcClass(null, th)}>ME</th>
                  <th className={rlcClass(null, th)}>Menge</th>
                  <th className={rlcClass(null, th)}>EP netto</th>
                  <th className={rlcClass(null, th)}>Rabatt</th>
                  <th className={rlcClass(null, th)}>Gesamt</th>
                  <th className={rlcClass(null, th)}>Quelle</th>
                  <th className={rlcClass(null, th)}></th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) =>
                <tr
                  key={r.id} className={rlcClass(null,
                  {
                    background: selectedRow?.id === r.id ? "#EAF2FF" : "#FFFFFF",
                    cursor: "pointer"
                  })}
                  onClick={() => setSelectedId(r.id)}>
                  
                    <td className={rlcClass(null, td)}>
                      <input className={rlcClass(null,
                    { ...cellInput, width: 92 })}
                    value={r.posNr}
                    onChange={(e) => updateRow(r.id, { posNr: e.target.value })} />
                    
                    </td>
                    <td className={rlcClass(null, td)}>
                      <input className={rlcClass(null,
                    { ...cellInput, width: "100%" })}
                    value={r.kurztext}
                    onChange={(e) =>
                    updateRow(r.id, { kurztext: e.target.value })
                    } />
                    
                    </td>
                    <td className={rlcClass(null, td)}>
                      <input className={rlcClass(null,
                    { ...cellInput, width: 58 })}
                    value={r.einheit}
                    onChange={(e) => updateRow(r.id, { einheit: e.target.value })} />
                    
                    </td>
                    <td className={rlcClass(null, tdRight)}>
                      <input
                      type="number" className={rlcClass(null,
                      { ...cellInput, width: 80, textAlign: "right" })}
                      value={r.menge}
                      onChange={(e) => updateRow(r.id, { menge: n(e.target.value) })} />
                    
                    </td>
                    <td className={rlcClass(null, tdRight)}>
                      <input
                      type="number" className={rlcClass(null,
                      { ...cellInput, width: 90, textAlign: "right" })}
                      value={r.preis ?? 0}
                      onChange={(e) => updateRow(r.id, { preis: n(e.target.value) })} />
                    
                    </td>
                    <td className={rlcClass(null, tdRight)}>
                      <input
                      type="number" className={rlcClass(null,
                      { ...cellInput, width: 72, textAlign: "right" })}
                      value={r.rabatt ?? 0}
                      onChange={(e) => updateRow(r.id, { rabatt: n(e.target.value) })} />
                    
                    </td>
                    <td className={rlcClass(null, tdRight)}>{money(lineNet(r))}</td>
                    <td className={rlcClass(null, td)}>
                      <span className={rlcClass(null, badgeNeutral)}>{r.source || "manual"}</span>
                    </td>
                    <td className={rlcClass(null, td)}>
                      <button className={rlcClass(null,
                    btnDangerMini)}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRow(r.id);
                    }}>
                      
                        Löschen
                      </button>
                    </td>
                  </tr>
                )}

                {!rows.length ?
                <tr>
                    <td colSpan={9} className={rlcClass(null, { ...td, color: "#64748B" })}>
                      Keine Positionen vorhanden.
                    </td>
                  </tr> :
                null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className={rlcClass(null, sideCard)}>
          <h2 className={rlcClass(null, sectionTitle)}>Positionsdetails</h2>

          {selectedRow ?
          <div className="rlc-migrated-pages-kalkulation-manuell-tsx-825">
              <div>
                <div className={rlcClass(null, label)}>Position</div>
                <div className={rlcClass(null, sideTitle)}>
                  {selectedRow.posNr || "—"} · {selectedRow.kurztext || "Ohne Text"}
                </div>
              </div>

              <div className={rlcClass(null, sideBadges)}>
                <span className={rlcClass(null, badgeOk)}>Manuell kalkuliert</span>
                <span className={rlcClass(null, badgeNeutral)}>{selectedRow.einheit || "—"}</span>
              </div>

              <Detail label="Menge" value={String(selectedRow.menge ?? 0)} />
              <Detail label="EP netto" value={money(selectedRow.preis)} />
              <Detail label="Rabatt" value={`${n(selectedRow.rabatt).toFixed(1)} %`} />
              <Detail label="Zeilensumme netto" value={money(lineNet(selectedRow))} />

              <div className={rlcClass(null, separator)} />

              <Field label="Langtext">
                <textarea className={rlcClass(null,
              { ...input, minHeight: 110 })}
              value={selectedRow.langtext}
              onChange={(e) =>
              updateRow(selectedRow.id, { langtext: e.target.value })
              } />
              
              </Field>

              <Field label="Bemerkung">
                <textarea className={rlcClass(null,
              { ...input, minHeight: 80 })}
              value={selectedRow.bemerkung || ""}
              onChange={(e) =>
              updateRow(selectedRow.id, { bemerkung: e.target.value })
              } />
              
              </Field>

              <Field label="Confidence / Sicherheit">
                <input
                type="number" className={rlcClass(null,
                input)}
                value={selectedRow.confidence ?? ""}
                onChange={(e) =>
                updateRow(selectedRow.id, { confidence: n(e.target.value) })
                } />
              
              </Field>
            </div> :

          <div className={rlcClass(null, muted)}>Keine Position gewählt.</div>
          }
        </aside>
      </section>
    </div>);

}

/* ================= UI ================= */

function KpiCard({
  label,
  value,
  sub




}: {label: string;value: string;sub?: string;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>{value}</div>
      {sub ? <div className={rlcClass(null, kpiSub)}>{sub}</div> : null}
    </div>);

}

function Field({
  label: fieldLabel,
  children



}: {label: string;children: React.ReactNode;}) {
  return (
    <label className="rlc-migrated-pages-kalkulation-manuell-tsx-826">
      <span className={rlcClass(null, label)}>{fieldLabel}</span>
      {children}
    </label>);

}

function Detail({ label: l, value }: {label: string;value: string;}) {
  return (
    <div>
      <div className={rlcClass(null, label)}>{l}</div>
      <div className={rlcClass(null, detailValue)}>{value}</div>
    </div>);

}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 700
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 700
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 850,
  opacity: 0.88,
  lineHeight: 1.55
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 700
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B"
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const sideCard: React.CSSProperties = {
  ...card,
  alignSelf: "start",
  position: "sticky",
  top: 12
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B"
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 12
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box"
};

const cellInput: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#FFFFFF",
  boxSizing: "border-box"
};

const mainGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 370px",
  gap: 16,
  alignItems: "start"
};

const exportRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle"
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap"
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};

const btnDangerMini: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer"
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 700
};

const badgeOk: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D"
};

const sideTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 15,
  fontWeight: 700,
  color: "#0F172A",
  lineHeight: 1.35
};

const sideBadges: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};

const separator: React.CSSProperties = {
  height: 1,
  background: "#E5E7EB"
};

const detailValue: React.CSSProperties = {
  marginTop: 4,
  color: "#0F172A",
  fontWeight: 600,
  fontSize: 13
};

const muted: React.CSSProperties = {
  color: "#64748B",
  fontSize: 13
};
