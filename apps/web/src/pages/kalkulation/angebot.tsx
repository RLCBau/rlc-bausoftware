// apps/web/src/pages/kalkulation/angebot.tsx
import React, { useEffect, useMemo, useState } from "react";

import { runRlcAction } from "../../lib/rlcProgress";
import { useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import PageHeader from "../../components/PageHeader";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { LV, type LVPos } from "./store.lv";

type PdfOptions = {
  city: string;
  dateISO: string;
  payment: string;
  mwst: number;
  showWatermark: boolean;
  colorHeader: boolean;
  showTableHeader: boolean;
  showChapterRows: boolean;
  includeNachtraege: boolean;
  nachtragMode: "alle" | "beauftragt";
};

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
  projektname?: string;
  client?: string;
  auftraggeber?: string;
  kunde?: string;
  location?: string;
  place?: string;
  ort?: string;
  city?: string;
};

type NachtragRow = {
  id: string;
  posNr: string;
  kurztext: string;
  langtext?: string;
  einheit: string;
  mengeDelta: number;
  preis: number;
  status?: string;
  begruendung?: string;
};

type AngebotNachtragOnlyBuffer = {
  version: "nachtrag-only-v1";
  ts: number;
  source: "nachtraege";
  projectKey: string;
  projectTitle: string;
  mwst: number;
  rows: NachtragRow[];
};

type PreviewRow =
  | {
      kind: "row";
      row: LVPos;
      chapter?: string;
    }
  | {
      kind: "nachtrag";
      row: NachtragRow;
      chapter?: string;
    }
  | {
      kind: "chapter";
      id: string;
      chapter: string;
      title: string;
      netto: number;
    }
  | {
      kind: "nachtrag-title";
      id: string;
      netto: number;
    };

type OfferSnapshot = {
  version: "angebot-v4";
  meta: {
    projectKey: string;
    savedAt: string;
    options: PdfOptions;
    project: ProjectLike | null;
    mode: "full" | "nachtrag-only";
  };
  rows: LVPos[];
  nachtraege: NachtragRow[];
  totals: {
    lvNetto: number;
    nachtragNetto: number;
    netto: number;
    mwst: number;
    steuer: number;
    brutto: number;
  };
};

const MWST_KEY = "rlc_lv_mwst_v1";
const PDFOPT_KEY = "rlc_offer_pdf_options_v4";
const NACHTRAG_EXT_STORE_KEY = "rlc_changes_ext_v2";
const ANGEBOT_NACHTRAG_ONLY_KEY = "rlc_angebot_nachtrag_only_v1";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

function localBackupKey(projectKey: string) {
  return `rlc_angebot_snapshot_v4:${projectKey || "NO_PROJECT"}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function n(value: unknown, fallback = 0): number {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(value));
}

function num(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 3,
  }).format(n(value));
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function getAuthToken(): string {
  try {
    const directKeys = [
      "token",
      "authToken",
      "accessToken",
      "rlc_token",
      "rlc_auth_token",
      "rlc_access_token",
    ];

    for (const key of directKeys) {
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
      }
    }
  } catch {
    //
  }

  return "";
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAuthToken();

  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getCurrentProject(projectCtx: any): ProjectLike | null {
  const project =
    projectCtx?.currentProject ??
    projectCtx?.project ??
    projectCtx?.selectedProject ??
    projectCtx?.current ??
    (typeof projectCtx?.getCurrentProject === "function"
      ? projectCtx.getCurrentProject()
      : null);

  return project || null;
}

function getProjectKey(project: ProjectLike | null, projectCtx: any): string {
  return String(
    project?.code ??
      project?.number ??
      project?.projektnummer ??
      projectCtx?.projectCode ??
      project?.id ??
      projectCtx?.projectId ??
      ""
  )
    .trim()
    .toUpperCase();
}

function getProjectPid(project: ProjectLike | null, projectKey: string): string {
  return String(project?.id || projectKey || "_none_").trim() || "_none_";
}

function getProjectName(project: ProjectLike | null): string {
  return String(
    project?.name ?? project?.projectName ?? project?.projektname ?? ""
  ).trim();
}

function getProjectClient(project: ProjectLike | null): string {
  return String(
    project?.client ?? project?.auftraggeber ?? project?.kunde ?? ""
  ).trim();
}

function getProjectPlace(project: ProjectLike | null): string {
  return String(
    project?.location ?? project?.place ?? project?.ort ?? project?.city ?? ""
  ).trim();
}

function getChapter(posNr?: string): string {
  const m = String(posNr || "").match(/^(\d{2})/);
  return m ? m[1] : "—";
}

function rowNet(row: LVPos): number {
  return round2(n(row.menge) * n(row.preis));
}

function nachtragNet(row: NachtragRow): number {
  return round2(n(row.mengeDelta) * n(row.preis));
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeNachtrag(row: any): NachtragRow {
  return {
    id: String(row?.id || safeId()),
    posNr: String(row?.posNr || row?.pos || ""),
    kurztext: String(row?.kurztext || row?.title || ""),
    langtext: String(row?.langtext || ""),
    einheit: String(row?.einheit || row?.unit || "m"),
    mengeDelta: n(row?.mengeDelta ?? row?.qty ?? row?.menge),
    preis: n(row?.preis ?? row?.ep ?? row?.finalUnitPrice),
    status: String(row?.status || "Entwurf"),
    begruendung: String(row?.begruendung || row?.note || row?.hint || ""),
  };
}

function lvRowToOfferExport(row: LVPos) {
  return {
    typ: "LV",
    id: row.id,
    posNr: row.posNr,
    text: row.kurztext,
    kurztext: row.kurztext,
    langtext: row.langtext,
    einheit: row.einheit,
    menge: n(row.menge),
    preis: n(row.preis),
    zeilen: rowNet(row),
    waehrung: row.waehrung || "EUR",
    source: row.source || "",

    materialCost: n((row as any).materialCost),
    laborCost: n((row as any).laborCost),
    machineCost: n((row as any).machineCost),
    subcontractorCost: n((row as any).subcontractorCost),
    disposalCost: n((row as any).disposalCost),
    transportCost: n((row as any).transportCost),
    overheadCost: n((row as any).overheadCost),
    riskCost: n((row as any).riskCost),
    profitCost: n((row as any).profitCost),

    baseUnitPrice: n((row as any).baseUnitPrice),
    suggestedUnitPrice: n((row as any).suggestedUnitPrice),
    finalUnitPrice: n((row as any).finalUnitPrice || row.preis),

    confidence: (row as any).confidence ?? "",
    riskLevel: (row as any).riskLevel || "",
    calculationStatus: (row as any).calculationStatus || "",
    gewerk: (row as any).gewerk || "",
    leistungsart: (row as any).leistungsart || "",
    bauverfahren: (row as any).bauverfahren || "",
    warning: (row as any).warning || "",
    aiReason: (row as any).aiReason || "",
    priceBreakdown: Array.isArray((row as any).priceBreakdown)
      ? (row as any).priceBreakdown
      : [],
  };
}
function loadNachtraegeForProject(pid: string, projectKey: string): NachtragRow[] {
  try {
    const db = JSON.parse(localStorage.getItem(NACHTRAG_EXT_STORE_KEY) || "{}");

    const pidRows = Array.isArray(db?.[pid]) ? db[pid] : [];
    const keyRows = Array.isArray(db?.[projectKey]) ? db[projectKey] : [];

    const map = new Map<string, NachtragRow>();

    [...pidRows, ...keyRows].map(normalizeNachtrag).forEach((row) => {
      map.set(String(row.id), row);
    });

    return Array.from(map.values());
  } catch {
    return [];
  }
}

function loadNachtragOnlyBuffer(projectKey: string): AngebotNachtragOnlyBuffer | null {
  try {
    const raw = localStorage.getItem(ANGEBOT_NACHTRAG_ONLY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AngebotNachtragOnlyBuffer;
    const rows = Array.isArray(parsed?.rows)
      ? parsed.rows.map(normalizeNachtrag)
      : [];

    if (!rows.length) return null;

    const bufferProject = String(parsed.projectKey || "").trim().toUpperCase();
    const currentProject = String(projectKey || "").trim().toUpperCase();

    if (bufferProject && currentProject && bufferProject !== currentProject) {
      return null;
    }

    return {
      ...parsed,
      rows,
      mwst: n(parsed.mwst, 19),
    };
  } catch {
    return null;
  }
}

function buildDefaultOptions(project: ProjectLike | null): PdfOptions {
  const storedMwst = n(localStorage.getItem(MWST_KEY), 19);

  return {
    city: getProjectPlace(project),
    dateISO: todayIso(),
    payment: "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.",
    mwst: storedMwst,
    showWatermark: false,
    colorHeader: true,
    showTableHeader: true,
    showChapterRows: true,
    includeNachtraege: true,
    nachtragMode: "alle",
  };
}

function loadSavedOptions(project: ProjectLike | null): PdfOptions {
  try {
    const saved = localStorage.getItem(PDFOPT_KEY);
    const base = buildDefaultOptions(project);

    if (!saved) return base;

    const parsed = JSON.parse(saved);

    return {
      ...base,
      ...parsed,
      mwst: n(localStorage.getItem(MWST_KEY), n(parsed?.mwst, 19)),
      dateISO: parsed?.dateISO || todayIso(),
      city: parsed?.city ?? base.city,
      includeNachtraege:
        typeof parsed?.includeNachtraege === "boolean"
          ? parsed.includeNachtraege
          : true,
      nachtragMode:
        parsed?.nachtragMode === "beauftragt" ? "beauftragt" : "alle",
    };
  } catch {
    return buildDefaultOptions(project);
  }
}

function makeSnapshot(
  projectKey: string,
  project: ProjectLike | null,
  opts: PdfOptions,
  rows: LVPos[],
  nachtraege: NachtragRow[],
  totals: {
    lvNetto: number;
    nachtragNetto: number;
    netto: number;
    mwst: number;
    steuer: number;
    brutto: number;
  },
  mode: "full" | "nachtrag-only"
): OfferSnapshot {
  return {
    version: "angebot-v4",
    meta: {
      projectKey,
      savedAt: new Date().toISOString(),
      options: opts,
      project,
      mode,
    },
    rows,
    nachtraege,
    totals,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


function forceDownloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function forceDownloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  forceDownloadUrl(url, filename);

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(value: string): string {
  return String(value || "Angebot")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_");
}

export default function AngebotPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectCtx: any = useProject() as any;

  const project = getCurrentProject(projectCtx);
  const projectKey = getProjectKey(project, projectCtx);
  const projectName = getProjectName(project);
  const projectClient = getProjectClient(project);
  const pid = getProjectPid(project, projectKey);

  const searchMode = new URLSearchParams(location.search).get("mode");
  const [nachtragOnlyBuffer, setNachtragOnlyBuffer] =
    useState<AngebotNachtragOnlyBuffer | null>(() =>
      loadNachtragOnlyBuffer(projectKey)
    );

  const isNachtragOnlyMode =
    searchMode === "nachtrag-only" && !!nachtragOnlyBuffer?.rows?.length;

  const [rows, setRows] = useState<LVPos[]>(() => LV.list());
  const [nachtraege, setNachtraege] = useState<NachtragRow[]>(() =>
    loadNachtraegeForProject(pid, projectKey)
  );
  const [opts, setOpts] = useState<PdfOptions>(() => {
    const base = loadSavedOptions(project);
    const buffer = loadNachtragOnlyBuffer(projectKey);

    if (searchMode === "nachtrag-only" && buffer) {
      return {
        ...base,
        mwst: n(buffer.mwst, base.mwst),
        includeNachtraege: true,
        nachtragMode: "alle",
      };
    }

    return base;
  });

  const [serverBusy, setServerBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [kiStatus, setKiStatus] = useState("");

  function refreshAll() {
    setRows(LV.list());
    setNachtraege(loadNachtraegeForProject(pid, projectKey));
    setNachtragOnlyBuffer(loadNachtragOnlyBuffer(projectKey));
  }

  function clearNachtragOnlyMode() {
    localStorage.removeItem(ANGEBOT_NACHTRAG_ONLY_KEY);
    setNachtragOnlyBuffer(null);
    setStatus("Vollständiges Angebot aktiv");
    navigate("/kalkulation/angebot", { replace: true });
  }

  useEffect(() => {
    refreshAll();

    const onFocus = () => refreshAll();
    const onStorage = () => refreshAll();

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, projectKey]);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(opts.mwst || 0));
    localStorage.setItem(PDFOPT_KEY, JSON.stringify(opts));
  }, [opts]);

  useEffect(() => {
    if (isNachtragOnlyMode) {
      setStatus("Nachtrag-Angebot aktiv: nur ausgewählte Nachtragspositionen.");
    }
  }, [isNachtragOnlyMode]);

  const offerRows = useMemo(() => {
    return isNachtragOnlyMode ? [] : rows;
  }, [isNachtragOnlyMode, rows]);

  const activeNachtraege = useMemo(() => {
    if (isNachtragOnlyMode) {
      return nachtragOnlyBuffer?.rows?.map(normalizeNachtrag) || [];
    }

    if (!opts.includeNachtraege) return [];

    if (opts.nachtragMode === "beauftragt") {
      return nachtraege.filter((r) => r.status === "Beauftragt");
    }

    return nachtraege;
  }, [
    isNachtragOnlyMode,
    nachtragOnlyBuffer,
    nachtraege,
    opts.includeNachtraege,
    opts.nachtragMode,
  ]);

  const totals = useMemo(() => {
    const lvNetto = round2(offerRows.reduce((sum, row) => sum + rowNet(row), 0));
    const nachtragNetto = round2(
      activeNachtraege.reduce((sum, row) => sum + nachtragNet(row), 0)
    );
    const netto = round2(lvNetto + nachtragNetto);
    const steuer = round2(netto * (n(opts.mwst) / 100));
    const brutto = round2(netto + steuer);

    return {
      lvNetto,
      nachtragNetto,
      netto,
      mwst: n(opts.mwst),
      steuer,
      brutto,
    };
  }, [offerRows, activeNachtraege, opts.mwst]);

  const chapterTotals = useMemo(() => {
    const map: Record<string, number> = {};

    for (const row of offerRows) {
      const ch = getChapter(row.posNr);
      map[ch] = round2((map[ch] || 0) + rowNet(row));
    }

    return map;
  }, [offerRows]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    const out: PreviewRow[] = [];

    if (!opts.showChapterRows) {
      offerRows.forEach((row) =>
        out.push({
          kind: "row",
          row,
          chapter: getChapter(row.posNr),
        })
      );
    } else {
      let currentChapter = "";

      for (const row of offerRows) {
        const ch = getChapter(row.posNr);

        if (ch !== currentChapter) {
          currentChapter = ch;
          out.push({
            kind: "chapter",
            id: `chapter-${ch}-${out.length}`,
            chapter: ch,
            title: `Kapitel ${ch} – Zwischensumme`,
            netto: chapterTotals[ch] || 0,
          });
        }

        out.push({
          kind: "row",
          row,
          chapter: ch,
        });
      }
    }

    if (activeNachtraege.length) {
      out.push({
        kind: "nachtrag-title",
        id: "nachtrag-title",
        netto: totals.nachtragNetto,
      });

      activeNachtraege.forEach((row) =>
        out.push({
          kind: "nachtrag",
          row,
          chapter: "NT",
        })
      );
    }

    return out;
  }, [
    offerRows,
    opts.showChapterRows,
    chapterTotals,
    activeNachtraege,
    totals.nachtragNetto,
  ]);

  const quality = useMemo(() => {
    const priced = offerRows.filter((r) => n(r.preis) > 0).length;
    const withQty = offerRows.filter((r) => n(r.menge) > 0).length;

    return {
      priced,
      withQty,
      total: offerRows.length,
      pricedPct: offerRows.length ? Math.round((priced / offerRows.length) * 100) : 0,
      qtyPct: offerRows.length ? Math.round((withQty / offerRows.length) * 100) : 0,
    };
  }, [offerRows]);

  async function saveSnapshotToServer() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    const snapshot = makeSnapshot(
      projectKey,
      project,
      opts,
      offerRows,
      activeNachtraege,
      totals,
      isNachtragOnlyMode ? "nachtrag-only" : "full"
    );

    try {
      setServerBusy(true);
      setStatus("Speichere Angebot …");

      const response = await fetch(
        apiUrl(`/api/kalkulation/angebot/${encodeURIComponent(projectKey)}/save`),
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(snapshot),
        }
      );

      if (response.status === 404) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(snapshot));
        setStatus("Server-Route fehlt · lokal gesichert");
        return;
      }

      const json = await response.json().catch(() => null);

      if (!response.ok || json?.ok === false) {
        localStorage.setItem(localBackupKey(projectKey), JSON.stringify(snapshot));
        setStatus("Serverfehler · lokal gesichert");
        return;
      }

      setStatus("Angebot gespeichert");
      setTimeout(() => setStatus(""), 2200);
    } catch {
      localStorage.setItem(localBackupKey(projectKey), JSON.stringify(snapshot));
      setStatus("Fehler · lokal gesichert");
    } finally {
      setServerBusy(false);
    }
  }

  async function loadSnapshotFromServer() {
    if (!projectKey) {
      alert("Kein Projekt gewählt.");
      return;
    }

    try {
      setServerBusy(true);
      setStatus("Lade Angebot …");

      const response = await fetch(
        apiUrl(`/api/kalkulation/angebot/${encodeURIComponent(projectKey)}`),
        {
          method: "GET",
          credentials: "include",
          headers: authHeaders(),
        }
      );

      const json = await response.json().catch(() => null);

      if (response.status === 404 || !json?.exists) {
        const raw = localStorage.getItem(localBackupKey(projectKey));
        if (!raw) {
          setStatus("Kein Speicherstand gefunden");
          return;
        }

        applySnapshot(JSON.parse(raw));
        setStatus("Lokaler Speicherstand geladen");
        return;
      }

      if (!response.ok || json?.ok === false) {
        setStatus("Laden fehlgeschlagen");
        return;
      }

      applySnapshot(json?.data || json?.snapshot || json);
      setStatus("Angebot geladen");
      setTimeout(() => setStatus(""), 2200);
    } catch {
      const raw = localStorage.getItem(localBackupKey(projectKey));
      if (raw) {
        applySnapshot(JSON.parse(raw));
        setStatus("Lokal geladen");
      } else {
        setStatus("Fehler beim Laden");
      }
    } finally {
      setServerBusy(false);
    }
  }

  function applySnapshot(snapshot: any) {
    const loadedRows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
    const loadedOptions = snapshot?.meta?.options || snapshot?.options;

    if (loadedRows.length) {
      LV.setAll(loadedRows as LVPos[]);
      setRows(LV.list());
    }

    if (Array.isArray(snapshot?.nachtraege)) {
      setNachtraege(snapshot.nachtraege.map(normalizeNachtrag));
    }

    if (loadedOptions) {
      setOpts((prev) => ({
        ...prev,
        ...loadedOptions,
        mwst: n(loadedOptions.mwst, prev.mwst),
      }));
    }
  }

  function exportXLSX() {
    if (!hasExportRows) {
      alert("Keine Angebotspositionen vorhanden.");
      return;
    }

    const positionRows = offerRows.map((row) => ({
      Typ: "LV",
      Kapitel: getChapter(row.posNr),
      PosNr: row.posNr || "",
      Kurztext: row.kurztext || "",
      Langtext: row.langtext || "",
      Einheit: row.einheit || "",
      Menge: n(row.menge),
      EP_Netto: n(row.preis),
      Zeilen_Netto: rowNet(row),
      Status: "",
      Begruendung: "",
      Waehrung: row.waehrung || "EUR",
      Quelle: row.source || "",
      Confidence: row.confidence ?? "",
    }));

    const nachtragRows = activeNachtraege.map((row) => ({
      Typ: "Nachtrag",
      Kapitel: "NT",
      PosNr: row.posNr || "",
      Kurztext: row.kurztext || "",
      Langtext: row.langtext || "",
      Einheit: row.einheit || "",
      Menge: n(row.mengeDelta),
      EP_Netto: n(row.preis),
      Zeilen_Netto: nachtragNet(row),
      Status: row.status || "Entwurf",
      Begruendung: row.begruendung || "",
      Waehrung: "EUR",
      Quelle: "Nachtrag",
      Confidence: "",
    }));

    const chapterRows = Object.entries(chapterTotals).map(([chapter, netto]) => ({
      Kapitel: chapter,
      Netto: netto,
    }));

    const summaryRows = [
      { Kennzahl: "Modus", Wert: isNachtragOnlyMode ? "Nur Nachtrag" : "Vollständiges Angebot" },
      { Kennzahl: "Projekt", Wert: projectKey },
      { Kennzahl: "Projektname", Wert: projectName },
      { Kennzahl: "Auftraggeber", Wert: projectClient },
      { Kennzahl: "Ort", Wert: opts.city },
      { Kennzahl: "Datum", Wert: opts.dateISO },
      { Kennzahl: "LV Netto", Wert: totals.lvNetto },
      { Kennzahl: "Nachträge Netto", Wert: totals.nachtragNetto },
      { Kennzahl: "Netto Gesamt", Wert: totals.netto },
      { Kennzahl: "MwSt %", Wert: totals.mwst },
      { Kennzahl: "MwSt €", Wert: totals.steuer },
      { Kennzahl: "Brutto", Wert: totals.brutto },
      { Kennzahl: "LV Positionen", Wert: offerRows.length },
      { Kennzahl: "Nachträge", Wert: activeNachtraege.length },
    ];

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([...positionRows, ...nachtragRows]),
      "Angebot"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(chapterRows),
      "Kapitel"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(activeNachtraege),
      "Nachtraege"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "Zusammenfassung"
    );

    const data = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });

    const prefix = isNachtragOnlyMode ? "Nachtrag_Angebot" : "Angebot";
    const filename = `${prefix}_${safeFileName(projectKey || opts.dateISO)}.xlsx`;

    downloadBlob(
      new Blob([data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename
    );

    setStatus("Excel-Datei wurde erzeugt.");
    setKiStatus("Excel-Datei wurde erzeugt.");
  }

  async function exportPDF() {
    try {
      const offerExportRows = [
        ...offerRows.map(lvRowToOfferExport),
        ...activeNachtraege.map((row) => ({
          typ: "Nachtrag",
          posNr: row.posNr,
          text: row.kurztext,
          kurztext: row.kurztext,
          langtext: row.langtext || "",
          einheit: row.einheit,
          menge: n(row.mengeDelta),
          preis: n(row.preis),
          zeilen: nachtragNet(row),
          status: row.status || "Entwurf",
          begruendung: row.begruendung || "",
        })),
      ];

      const payload = {
        title: isNachtragOnlyMode ? "Nachtragsangebot" : "Angebot",
        mode: isNachtragOnlyMode ? "nachtrag-only" : "full",
        project: project
          ? {
              id: project.id,
              code: project.code || project.number || project.projektnummer,
              number: project.number || project.code || project.projektnummer,
              name: projectName,
              client: projectClient,
              location: getProjectPlace(project),
            }
          : null,
        options: {
          ...opts,
          mwst: totals.mwst,
        },
        rows: offerExportRows,
        lvRows: offerRows.map(lvRowToOfferExport),
        nachtraege: activeNachtraege.map((row) => ({
          posNr: row.posNr,
          text: row.kurztext,
          kurztext: row.kurztext,
          langtext: row.langtext || "",
          einheit: row.einheit,
          menge: n(row.mengeDelta),
          preis: n(row.preis),
          zeilen: nachtragNet(row),
          status: row.status || "Entwurf",
          begruendung: row.begruendung || "",
        })),
        totals,
      };

      const response = await fetch(apiUrl("/api/pdf/angebot"), {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        throw new Error(txt || `PDF Fehler (${response.status})`);
      }

      const blob = await response.blob();
      const prefix = isNachtragOnlyMode ? "Nachtrag_Angebot" : "Angebot";

      downloadBlob(
        blob,
        `${prefix}_${safeFileName(projectKey || opts.dateISO)}.pdf`
      );
    } catch (e: any) {
      alert(`PDF Export fehlgeschlagen: ${e?.message || e}`);
    }
  }

  function exportCSV() {
    if (!hasExportRows) {
      alert("Keine Angebotspositionen vorhanden.");
      return;
    }

    const header =
      "Typ;PosNr;Kurztext;Langtext;Einheit;Menge;EP netto;Zeilen netto;Status;Begründung";

    const lvLines = offerRows.map((row) =>
      [
        "LV",
        csvCell(row.posNr || ""),
        csvCell(row.kurztext || ""),
        csvCell(row.langtext || ""),
        csvCell(row.einheit || ""),
        String(n(row.menge)).replace(".", ","),
        String(n(row.preis)).replace(".", ","),
        String(rowNet(row)).replace(".", ","),
        "",
        "",
      ].join(";")
    );

    const ntLines = activeNachtraege.map((row) =>
      [
        "Nachtrag",
        csvCell(row.posNr || ""),
        csvCell(row.kurztext || ""),
        csvCell(row.langtext || ""),
        csvCell(row.einheit || ""),
        String(n(row.mengeDelta)).replace(".", ","),
        String(n(row.preis)).replace(".", ","),
        String(nachtragNet(row)).replace(".", ","),
        csvCell(row.status || ""),
        csvCell(row.begruendung || ""),
      ].join(";")
    );

    const prefix = isNachtragOnlyMode ? "Nachtrag_Angebot" : "Angebot";
    const filename = `${prefix}_${safeFileName(projectKey || opts.dateISO)}.csv`;
    const csv = "\uFEFF" + [header, ...lvLines, ...ntLines].join("\r\n");

    downloadBlob(
      new Blob([csv], {
        type: "text/csv;charset=utf-8",
      }),
      filename
    );

    setStatus("CSV-Datei wurde erzeugt.");
    setKiStatus("CSV-Datei wurde erzeugt.");
  }

  const hasExportRows = offerRows.length > 0 || activeNachtraege.length > 0;

  function pruefeAngebot(): string {
    const problems: string[] = [];

    if (!projectKey) problems.push("Projekt fehlt.");
    if (!opts.city.trim()) problems.push("Ort fehlt.");
    if (!opts.dateISO.trim()) problems.push("Datum fehlt.");
    if (n(opts.mwst) < 0) problems.push("MwSt ist ungültig.");
    if (!offerRows.length && !activeNachtraege.length) {
      problems.push("Keine LV-Positionen und keine Nachträge vorhanden.");
    }

    const lvOhneMenge = offerRows.filter((r) => n(r.menge) <= 0).length;
    const lvOhnePreis = offerRows.filter((r) => n(r.preis) <= 0).length;
    const ntOhneMenge = activeNachtraege.filter((r) => n(r.mengeDelta) === 0).length;
    const ntOhnePreis = activeNachtraege.filter((r) => n(r.preis) <= 0).length;

    if (lvOhneMenge) problems.push(`LV ohne Menge: ${lvOhneMenge}.`);
    if (lvOhnePreis) problems.push(`LV ohne EP: ${lvOhnePreis}.`);
    if (ntOhneMenge) problems.push(`Nachträge ohne Menge: ${ntOhneMenge}.`);
    if (ntOhnePreis) problems.push(`Nachträge ohne EP: ${ntOhnePreis}.`);

    const result = problems.length
      ? `KI-Prüfung: ${problems.join(" ")}`
      : "KI-Prüfung: Angebot ist plausibel. PDF/Excel/CSV können erzeugt werden.";

    setStatus(result);
    setKiStatus(result);
    return result;
  }

  function completeMissingAngebotData() {
    let changed = false;

    setOpts((prev) => {
      const next: PdfOptions = { ...prev };

      if (!next.city.trim()) {
        next.city = getProjectPlace(project) || "München";
        changed = true;
      }

      if (!next.dateISO.trim()) {
        next.dateISO = todayIso();
        changed = true;
      }

      if (!next.payment.trim()) {
        next.payment = "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.";
        changed = true;
      }

      if (!Number.isFinite(n(next.mwst))) {
        next.mwst = 19;
        changed = true;
      }

      return next;
    });

    const result = changed
      ? "Fehlende Angebotsdaten wurden ergänzt."
      : "Keine fehlenden Angebotsdaten erkannt.";

    setStatus(result);
    setKiStatus(result);
  }

  useEffect(() => {
    function handleAngebotCommand(event: Event) {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      const action = String(detail?.action || "").trim();

      if (!action) return;

      if (action === "pdfExport" || action === "pdf" || action === "exportPdf") {
        void exportPDF();
        setStatus("PDF-Export gestartet.");
        setKiStatus("PDF-Export gestartet.");
        return;
      }

      if (action === "excelExport" || action === "xlsx" || action === "exportXlsx") {
        exportXLSX();
        setStatus("Excel-Export gestartet.");
        setKiStatus("Excel-Export gestartet.");
        return;
      }

      if (action === "csvExport" || action === "csv" || action === "exportCsv") {
        exportCSV();
        setStatus("CSV-Export gestartet.");
        setKiStatus("CSV-Export gestartet.");
        return;
      }

      if (action === "save" || action === "speichern" || action === "angebotSpeichern") {
        void saveSnapshotToServer();
        setStatus("Angebot-Speicherung gestartet.");
        setKiStatus("Angebot-Speicherung gestartet.");
        return;
      }

      if (action === "load" || action === "laden" || action === "angebotLaden") {
        void loadSnapshotFromServer();
        setStatus("Angebot wird geladen.");
        setKiStatus("Angebot wird geladen.");
        return;
      }

      if (action === "reload" || action === "neuLaden" || action === "refresh") {
        refreshAll();
        setStatus("Angebotsdaten neu geladen.");
        setKiStatus("Angebotsdaten neu geladen.");
        return;
      }

      if (action === "pruefen" || action === "angebotPruefen" || action === "check") {
        pruefeAngebot();
        return;
      }

      if (action === "completeMissing" || action === "fehlendeDaten" || action === "fehlendeAngebotsdaten") {
        completeMissingAngebotData();
        return;
      }

      if (action === "lv") {
        navigate("/kalkulation/lv-import");
        return;
      }

      if (action === "nachtraege") {
        navigate("/kalkulation/nachtraege");
        return;
      }

      if (action === "ki") {
        navigate("/kalkulation/mit-ki");
        return;
      }

      if (action === "gaeb") {
        navigate("/kalkulation/gaeb");
      }
    }

    window.addEventListener("rlc:angebot-command", handleAngebotCommand);
    window.addEventListener("rlc:angebot-action", handleAngebotCommand);
    window.addEventListener("rlc:kalkulation-angebot-command", handleAngebotCommand);

    return () => {
      window.removeEventListener("rlc:angebot-command", handleAngebotCommand);
      window.removeEventListener("rlc:angebot-action", handleAngebotCommand);
      window.removeEventListener("rlc:kalkulation-angebot-command", handleAngebotCommand);
    };
  });

  useEffect(() => {
    function handleAngebotCommand(event: Event) {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      const action = String(detail?.action || "").trim();

      if (!action) return;

      if (action === "pdf") {
        void exportPDF();
        setStatus("KI: PDF-Erzeugung gestartet.");
        return;
      }

      if (action === "excel") {
        exportXLSX();
        setStatus("KI: Excel-Export ausgeführt.");
        return;
      }

      if (action === "csv") {
        exportCSV();
        setStatus("KI: CSV-Export ausgeführt.");
        return;
      }

      if (action === "save") {
        void saveSnapshotToServer();
        setStatus("KI: Angebot wird gespeichert.");
        return;
      }

      if (action === "load") {
        void loadSnapshotFromServer();
        return;
      }

      if (action === "refresh") {
        refreshAll();
        setStatus("KI: Angebotsdaten neu geladen.");
        return;
      }

      if (action === "check") {
        const issues: string[] = [];

        if (!hasExportRows) issues.push("Keine Angebotspositionen vorhanden");
        if (!String(opts.city || "").trim()) issues.push("Ort fehlt");
        if (!String(opts.dateISO || "").trim()) issues.push("Datum fehlt");
        if (n(opts.mwst) <= 0) issues.push("MwSt fehlt");
        if (!String(opts.payment || "").trim()) issues.push("Zahlungsbedingungen fehlen");

        const result = issues.length
          ? `KI-Prüfung: ${issues.join(" · ")}`
          : "KI-Prüfung: Angebot ist plausibel.";

        setStatus(result);
        setKiStatus(result);
        setKiStatus(result);
        return;
      }

      if (action === "fixMissing") {
        const changes: string[] = [];

        setOpts((prev) => {
          const next = { ...prev };

          if (!String(next.city || "").trim()) {
            next.city = getProjectPlace(project) || "München";
            changes.push(`Ort ergänzt: ${next.city}`);
          }

          if (!String(next.dateISO || "").trim()) {
            next.dateISO = todayIso();
            changes.push(`Datum ergänzt: ${next.dateISO}`);
          }

          if (n(next.mwst) <= 0) {
            next.mwst = 19;
            changes.push("MwSt geändert: 0 % → 19 %");
          }

          if (!String(next.payment || "").trim()) {
            next.payment = "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.";
            changes.push("Zahlungsbedingungen ergänzt.");
          }

          return next;
        });

        const result = changes.length
          ? `KI hat geändert: ${changes.join(" · ")}`
          : "KI: Keine fehlenden Angebotsdaten gefunden.";

        setStatus(result);
        setKiStatus(result);
        setKiStatus(result);
      }
    }

    window.addEventListener("rlc:angebot-command", handleAngebotCommand);

    return () => {
      window.removeEventListener("rlc:angebot-command", handleAngebotCommand);
    };
  });

  useEffect(() => {
    function handleAngebotCommand(event: Event) {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      const action = String(detail?.action || "").trim();

      if (!action) return;

      if (action === "pdf") {
        void exportPDF();
        setStatus("KI-Aktion: PDF-Erzeugung gestartet.");
        return;
      }

      if (action === "excel") {
        exportXLSX();
        setStatus("KI-Aktion: Excel-Export ausgeführt.");
        return;
      }

      if (action === "csv") {
        exportCSV();
        setStatus("KI-Aktion: CSV-Export ausgeführt.");
        return;
      }

      if (action === "save") {
        void saveSnapshotToServer();
        return;
      }

      if (action === "load") {
        void loadSnapshotFromServer();
        return;
      }

      if (action === "refresh") {
        refreshAll();
        setStatus("KI-Aktion: Angebotsdaten neu geladen.");
        return;
      }

      if (action === "fixMissing") {
        const changes: string[] = [];

        setOpts((prev) => {
          const next = { ...prev };

          if (!String(next.city || "").trim()) {
            next.city = getProjectPlace(project) || "München";
            changes.push(`Ort ergänzt: ${next.city}`);
          }

          if (!String(next.dateISO || "").trim()) {
            next.dateISO = todayIso();
            changes.push(`Datum ergänzt: ${next.dateISO}`);
          }

          if (n(next.mwst) <= 0) {
            next.mwst = 19;
            changes.push("MwSt geändert: 0 % → 19 %");
          }

          if (!String(next.payment || "").trim()) {
            next.payment = "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.";
            changes.push("Zahlungsbedingungen ergänzt.");
          }

          if (!isNachtragOnlyMode && nachtraege.length && !next.includeNachtraege) {
            next.includeNachtraege = true;
            changes.push("Nachträge im Angebot aktiviert.");
          }

          return next;
        });

        setStatus(
          changes.length
            ? `KI hat Angebotsdaten ergänzt: ${changes.join(" · ")}`
            : "KI-Prüfung: Keine fehlenden Angebotsdaten gefunden."
        );
        return;
      }

      if (action === "check") {
        const issues: string[] = [];

        if (!hasExportRows) issues.push("Keine Angebotspositionen vorhanden.");
        if (!String(opts.city || "").trim()) issues.push("Ort fehlt.");
        if (!String(opts.dateISO || "").trim()) issues.push("Datum fehlt.");
        if (n(opts.mwst) <= 0) issues.push("MwSt fehlt oder ist 0.");
        if (!String(opts.payment || "").trim()) issues.push("Zahlungsbedingungen fehlen.");
        if (!isNachtragOnlyMode && nachtraege.length > 0 && !opts.includeNachtraege) {
          issues.push("Nachträge vorhanden, aber im Angebot deaktiviert.");
        }

        setStatus(
          issues.length
            ? `KI-Prüfung: ${issues.join(" · ")}`
            : "KI-Prüfung: Angebot ist plausibel."
        );
      }
    }

    window.addEventListener("rlc:angebot-command", handleAngebotCommand);

    return () => {
      window.removeEventListener("rlc:angebot-command", handleAngebotCommand);
    };
  }, [
    opts,
    project,
    nachtraege,
    isNachtragOnlyMode,
    hasExportRows,
    exportPDF,
    exportXLSX,
    exportCSV,
    saveSnapshotToServer,
    loadSnapshotFromServer,
    refreshAll,
  ]);


  return (
    <div style={page}>
      <PageHeader
        breadcrumb="RLC Module / Kalkulation"
        title={isNachtragOnlyMode ? "Nachtragsangebot generieren" : "Angebot generieren"}
        subtitle={
          isNachtragOnlyMode
            ? "Angebotsausgabe nur für ausgewählte Nachtragspositionen."
            : "Professionelle Angebotsausgabe aus LV, Urkalkulation, Nachträgen, manueller Kalkulation oder KI-Kalkulation."
        }
      />

      {isNachtragOnlyMode ? (
        <section style={modeCard}>
          <div>
            <b>Nachtragsangebot aktiv</b>
            <div style={modeText}>
              Es werden nur die aus Nachträge ausgewählten Positionen angeboten.
              LV-Hauptpositionen sind in diesem Modus bewusst ausgeblendet.
            </div>
          </div>

          <div style={heroActions}>
            <button style={btnPrimary} onClick={exportPDF} disabled={!hasExportRows}>
              Nachtragsangebot PDF
            </button>
            <button style={btnSecondary} onClick={clearNachtragOnlyMode}>
              Vollständiges Angebot öffnen
            </button>
          </div>
        </section>
      ) : null}

      <section style={heroCard}>
        <div>
          <div style={eyebrow}>
            {isNachtragOnlyMode
              ? "Nachtragsangebot · PDF / Excel / CSV"
              : "Angebot · PDF / Excel / Nachträge / Server"}
          </div>
          <h1 style={title}>
            {isNachtragOnlyMode ? "Nachtragsangebot" : "Angebotsausgabe"}
          </h1>
          <p style={subtitle}>
            {isNachtragOnlyMode
              ? "Dieses Angebot enthält ausschließlich die ausgewählten Nachtragspositionen."
              : "Das Angebot liest automatisch den gemeinsamen LV-Store und die vorhandenen Nachträge. Dadurch sind LV, Urkalkulation, Nachträge, Manuell, Preise und KI-Kalkulation sauber verbunden."}
          </p>
        </div>

        <div style={heroActions}>
          <button style={btnPrimary} onClick={exportPDF} disabled={!hasExportRows}>
            PDF erzeugen
          </button>
          <button style={btnSecondary} onClick={exportXLSX} disabled={!hasExportRows}>
            Excel exportieren
          </button>
          <button style={btnSecondary} onClick={exportCSV} disabled={!hasExportRows}>
            CSV exportieren
          </button>
          <button
            style={btnSecondary}
            onClick={saveSnapshotToServer}
            disabled={serverBusy || !projectKey}
          >
            Speichern
          </button>
          <button
            style={btnSecondary}
            onClick={loadSnapshotFromServer}
            disabled={serverBusy || !projectKey}
          >
            Laden
          </button>
          <button style={btnSecondary} onClick={refreshAll}>
            Neu laden
          </button>
          {isNachtragOnlyMode ? (
            <button style={btnSecondary} onClick={clearNachtragOnlyMode}>
              Komplettes Angebot
            </button>
          ) : null}
        </div>

        <div style={heroMeta}>
          Projekt: <b>{projectKey || "—"}</b>
          {projectName ? <span> · {projectName}</span> : null}
          {status ? <span> · {status}</span> : null}
        </div>
      </section>

      <section style={grid4}>
        <KpiCard label="LV Netto" value={money(totals.lvNetto)} sub={`${offerRows.length} Positionen`} />
        <KpiCard
          label="Nachträge Netto"
          value={money(totals.nachtragNetto)}
          sub={
            isNachtragOnlyMode
              ? `${activeNachtraege.length} ausgewählt`
              : `${activeNachtraege.length}/${nachtraege.length} aktiv`
          }
        />
        <KpiCard label="Netto Gesamt" value={money(totals.netto)} />
        <KpiCard label="Brutto Gesamt" value={money(totals.brutto)} sub={`${totals.mwst}% MwSt`} />
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Angebotsdaten</h2>
            <div style={sectionText}>
              Diese Angaben werden für PDF, Excel und Server-Snapshot verwendet.
            </div>
          </div>

          <div style={projectBadge}>
            {projectKey ? (
              <>
                <b>{projectKey}</b>
                {projectName ? <span>— {projectName}</span> : null}
              </>
            ) : (
              "kein Projekt gewählt"
            )}
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Ort">
            <input
              style={input}
              value={opts.city}
              onChange={(e) => setOpts((v) => ({ ...v, city: e.target.value }))}
              placeholder="München"
            />
          </Field>

          <Field label="Datum">
            <input
              type="date"
              style={input}
              value={opts.dateISO}
              onChange={(e) =>
                setOpts((v) => ({ ...v, dateISO: e.target.value || todayIso() }))
              }
            />
          </Field>

          <Field label="MwSt %">
            <input
              type="number"
              style={input}
              value={opts.mwst}
              onChange={(e) =>
                setOpts((v) => ({ ...v, mwst: n(e.target.value, 0) }))
              }
            />
          </Field>

          <Field label="Positionen">
            <input
              style={inputMuted}
              value={`${offerRows.length} LV / ${activeNachtraege.length} Nachträge`}
              readOnly
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Zahlungsbedingungen / Notizen">
            <textarea
              style={{ ...input, minHeight: 76 }}
              value={opts.payment}
              onChange={(e) =>
                setOpts((v) => ({ ...v, payment: e.target.value }))
              }
            />
          </Field>
        </div>

        <div style={checkRow}>
          {!isNachtragOnlyMode ? (
            <>
              <label style={checkLabel}>
                <input
                  type="checkbox"
                  checked={opts.includeNachtraege}
                  onChange={(e) =>
                    setOpts((v) => ({ ...v, includeNachtraege: e.target.checked }))
                  }
                />
                Nachträge im Angebot einbeziehen
              </label>

              <label style={checkLabel}>
                <span>Nachträge:</span>
                <select
                  style={smallSelect}
                  value={opts.nachtragMode}
                  onChange={(e) =>
                    setOpts((v) => ({
                      ...v,
                      nachtragMode:
                        e.target.value === "beauftragt" ? "beauftragt" : "alle",
                    }))
                  }
                >
                  <option value="alle">Alle Entwürfe + Beauftragte</option>
                  <option value="beauftragt">Nur Beauftragte</option>
                </select>
              </label>
            </>
          ) : null}

          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={opts.showWatermark}
              onChange={(e) =>
                setOpts((v) => ({ ...v, showWatermark: e.target.checked }))
              }
            />
            Watermark „Powered by OpenAI“
          </label>

          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={opts.colorHeader}
              onChange={(e) =>
                setOpts((v) => ({ ...v, colorHeader: e.target.checked }))
              }
            />
            Farbiger Tabellenkopf
          </label>

          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={opts.showTableHeader}
              onChange={(e) =>
                setOpts((v) => ({ ...v, showTableHeader: e.target.checked }))
              }
            />
            Tabellenkopf anzeigen
          </label>

          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={opts.showChapterRows}
              onChange={(e) =>
                setOpts((v) => ({ ...v, showChapterRows: e.target.checked }))
              }
            />
            Kapitel-Zwischensummen
          </label>
        </div>
        {kiStatus ? (
          <div style={kiBox}>
            <b>KI-Protokoll</b>
            <div style={kiText}>{kiStatus}</div>
          </div>
        ) : null}


        <div style={buttonRow}>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/lv-import")}>
            LV bearbeiten
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/rezepte")}>
            Urkalkulation
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/nachtraege")}>
            Nachträge
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/manuell")}>
            Manuell
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/mit-ki")}>
            KI-Kalkulation
          </button>
          <button style={btnSecondary} onClick={() => navigate("/kalkulation/gaeb")}>
            GAEB
          </button>
        </div>
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Angebotsvorschau</h2>
            <div style={sectionText}>
              {isNachtragOnlyMode
                ? "Vorschau nur der ausgewählten Nachtragspositionen."
                : "Kompakte Vorschau aus LV und Nachträgen. Änderungen an Preisen oder Mengen erfolgen in LV, Urkalkulation, Nachträge, Manuell oder KI-Kalkulation."}
            </div>
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Typ</th>
                <th style={th}>Kap.</th>
                <th style={th}>PosNr</th>
                <th style={th}>Kurztext</th>
                <th style={th}>ME</th>
                <th style={thRight}>Menge</th>
                <th style={thRight}>EP netto</th>
                <th style={thRight}>Zeilen-Netto</th>
              </tr>
            </thead>

            <tbody>
              {previewRows.map((item) => {
                if (item.kind === "chapter") {
                  return (
                    <tr key={item.id}>
                      <td colSpan={8} style={chapterRow}>
                        Kapitel {item.chapter} · Zwischensumme: {money(item.netto)}
                      </td>
                    </tr>
                  );
                }

                if (item.kind === "nachtrag-title") {
                  return (
                    <tr key={item.id}>
                      <td colSpan={8} style={nachtragChapterRow}>
                        {isNachtragOnlyMode ? "Nachtragsangebot" : "Nachträge"} · Zwischensumme:{" "}
                        {money(item.netto)}
                      </td>
                    </tr>
                  );
                }

                if (item.kind === "nachtrag") {
                  const row = item.row;

                  return (
                    <tr key={`nt-${row.id}`}>
                      <td style={td}>
                        <span style={badgeNachtrag}>Nachtrag</span>
                      </td>
                      <td style={td}>NT</td>
                      <td style={td}>{row.posNr}</td>
                      <td style={tdText}>
                        <div style={{ fontWeight: 800 }}>{row.kurztext || "—"}</div>
                        {row.langtext ? <div style={smallMuted}>{row.langtext}</div> : null}
                        {row.begruendung ? (
                          <div style={smallWarn}>Begründung: {row.begruendung}</div>
                        ) : null}
                      </td>
                      <td style={td}>{row.einheit}</td>
                      <td style={tdRight}>{num(row.mengeDelta)}</td>
                      <td style={tdRight}>{money(row.preis)}</td>
                      <td style={tdRightBold}>{money(nachtragNet(row))}</td>
                    </tr>
                  );
                }

                const row = item.row;

                return (
                  <tr key={row.id}>
                    <td style={td}>
                      <span style={badgeLv}>LV</span>
                    </td>
                    <td style={td}>{item.chapter}</td>
                    <td style={td}>{row.posNr}</td>
                    <td style={tdText}>
                      <div style={{ fontWeight: 800 }}>{row.kurztext || "—"}</div>
                      {row.langtext ? <div style={smallMuted}>{row.langtext}</div> : null}
                    </td>
                    <td style={td}>{row.einheit}</td>
                    <td style={tdRight}>{num(row.menge)}</td>
                    <td style={tdRight}>{money(row.preis)}</td>
                    <td style={tdRightBold}>{money(rowNet(row))}</td>
                  </tr>
                );
              })}

              {!offerRows.length && !activeNachtraege.length ? (
                <tr>
                  <td colSpan={8} style={{ ...td, color: "#64748B" }}>
                    Kein LV und keine aktiven Nachträge vorhanden. Bitte zuerst Positionen
                    importieren, manuell erfassen, über Urkalkulation erstellen oder Nachträge übernehmen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={totalsBar}>
        <div style={sumBox}>
          <div style={sumLabel}>LV Netto</div>
          <div style={sumValue}>{money(totals.lvNetto)}</div>
        </div>
        <div style={sumBox}>
          <div style={sumLabel}>Nachträge Netto</div>
          <div style={sumValue}>{money(totals.nachtragNetto)}</div>
        </div>
        <div style={sumBox}>
          <div style={sumLabel}>Gesamt Netto</div>
          <div style={sumValue}>{money(totals.netto)}</div>
        </div>
        <div style={sumBox}>
          <div style={sumLabel}>MwSt</div>
          <div style={sumValue}>{money(totals.steuer)}</div>
        </div>
        <div style={sumBoxStrong}>
          <div style={sumLabel}>Gesamt Brutto</div>
          <div style={sumValue}>{money(totals.brutto)}</div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
      {sub ? <div style={kpiSub}>{sub}</div> : null}
    </div>
  );
}

/* ================= STYLES ================= */


const kiBox: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 14,
  padding: 12,
  fontSize: 13,
  fontWeight: 800,
};

const kiText: React.CSSProperties = {
  marginTop: 5,
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
};

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
};

const modeCard: React.CSSProperties = {
  background: "#FFF7ED",
  border: "1px solid #FED7AA",
  color: "#9A3412",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
};

const modeText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: 1.45,
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.85,
  fontWeight: 900,
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  opacity: 0.9,
  lineHeight: 1.55,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.92,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12,
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 900,
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 900,
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 900,
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF",
  color: "#0F172A",
};

const inputMuted: React.CSSProperties = {
  ...input,
  background: "#F8FAFC",
  color: "#64748B",
};

const smallSelect: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "7px 9px",
  fontSize: 13,
  background: "#FFFFFF",
  color: "#0F172A",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  marginTop: 12,
};

const checkLabel: React.CSSProperties = {
  display: "flex",
  gap: 7,
  alignItems: "center",
  fontSize: 13,
  color: "#334155",
  fontWeight: 700,
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 14,
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A",
};

const projectBadge: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 999,
  padding: "7px 12px",
  background: "#F8FAFC",
  display: "flex",
  gap: 8,
  alignItems: "center",
  whiteSpace: "nowrap",
  fontSize: 13,
  color: "#0F172A",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1080,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 900,
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right",
};

const td: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "top",
};

const tdText: React.CSSProperties = {
  ...td,
  minWidth: 280,
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdRightBold: React.CSSProperties = {
  ...tdRight,
  fontWeight: 900,
  color: "#0F172A",
};

const chapterRow: React.CSSProperties = {
  ...td,
  background: "#EAF2FF",
  color: "#1E3A8A",
  fontWeight: 900,
};

const nachtragChapterRow: React.CSSProperties = {
  ...td,
  background: "#FFF7ED",
  color: "#C2410C",
  fontWeight: 900,
};

const smallMuted: React.CSSProperties = {
  marginTop: 3,
  color: "#64748B",
  fontSize: 11,
  lineHeight: 1.35,
  maxWidth: 560,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const smallWarn: React.CSSProperties = {
  marginTop: 3,
  color: "#B45309",
  fontSize: 11,
  lineHeight: 1.35,
  maxWidth: 560,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const badgeLv: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const badgeNachtrag: React.CSSProperties = {
  ...badgeLv,
  border: "1px solid #FED7AA",
  background: "#FFF7ED",
  color: "#C2410C",
};

const totalsBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const sumBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: "12px 16px",
  minWidth: 190,
  background: "#FFFFFF",
};

const sumBoxStrong: React.CSSProperties = {
  ...sumBox,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
};

const sumLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const sumValue: React.CSSProperties = {
  marginTop: 5,
  fontSize: 18,
  color: "#0F172A",
  fontWeight: 900,
};


















