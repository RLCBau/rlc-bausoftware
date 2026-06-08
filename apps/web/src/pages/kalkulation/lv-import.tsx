// apps/web/src/pages/kalkulation/lv-import.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import { runRlcAction } from "../../lib/rlcProgress";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { LV, type LVPos } from "./store.lv";

const MWST_KEY = "rlc_lv_mwst_v1";

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
  projektname?: string;
  client?: string;
  place?: string;
  location?: string;
};

type ViewMode = "liste" | "editor";

type LvQualityFilter =
  | "alle"
  | "kritisch"
  | "warning"
  | "epFehlt"
  | "einheitFehlt"
  | "mengeFehlt"
  | "kurztextFehlt"
  | "langtextFehlt"
  | "doppelte";

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
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

function withAuthHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAuthToken();

  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getCurrentProjectFromSources(projectCtx: any): ProjectLike | null {
  const ctxProject =
    projectCtx?.currentProject ??
    projectCtx?.current ??
    projectCtx?.selectedProject ??
    projectCtx?.project ??
    (typeof projectCtx?.getCurrentProject === "function"
      ? projectCtx.getCurrentProject()
      : null);

  if (ctxProject) return ctxProject as ProjectLike;

  try {
    return ((globalThis as any).__RLC_CURRENT_PROJECT ?? null) as ProjectLike | null;
  } catch {
    return null;
  }
}

function getProjectCode(project: ProjectLike | null): string {
  return String(project?.code ?? project?.number ?? project?.projektnummer ?? "")
    .trim()
    .toUpperCase();
}

function getProjectName(project: ProjectLike | null): string {
  return String(project?.name ?? project?.projectName ?? project?.projektname ?? "").trim();
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fmtCurrency(v: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(v));
}

function fmtNumber(v: unknown): string {
  return toNumber(v).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineTotal(row: LVPos): number {
  if (typeof row.gesamt === "number" && Number.isFinite(row.gesamt)) {
    return row.gesamt;
  }

  return round2(toNumber(row.menge) * toNumber(row.preis));
}

function safeUuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function makeLvRow(patch?: Partial<LVPos>): LVPos {
  const menge = toNumber(patch?.menge);
  const preis = patch?.preis === undefined || patch?.preis === null ? 0 : toNumber(patch.preis);

  return {
    id: String(patch?.id || safeUuid()),
    posNr: String(patch?.posNr ?? ""),
    parentPosNr: String(patch?.parentPosNr ?? ""),
    sortIndex: patch?.sortIndex,
    kurztext: String(patch?.kurztext ?? ""),
    langtext: String(patch?.langtext ?? ""),
    bemerkung: String(patch?.bemerkung ?? ""),
    einheit: String(patch?.einheit ?? "m"),
    menge,
    preis,
    gesamt:
      patch?.gesamt === undefined || patch?.gesamt === null
        ? round2(menge * preis)
        : toNumber(patch.gesamt),
    waehrung: String(patch?.waehrung ?? "EUR"),
    confidence: patch?.confidence,
    source: patch?.source ?? "manual",
    createdAt: patch?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as LVPos;
}

function lvTextKey(row: LVPos): string {
  return String(`${row.kurztext || ""} ${row.langtext || ""}`)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLvDuplicateGroups(rows: LVPos[]): LVPos[][] {
  const map = new Map<string, LVPos[]>();

  for (const row of rows) {
    const text = lvTextKey(row);
    if (text.length < 8) continue;

    const key = [
      text.slice(0, 140),
      String(row.einheit || "").trim().toLowerCase(),
      round2(toNumber(row.menge)),
      round2(toNumber(row.preis)),
    ].join("|");

    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  return Array.from(map.values()).filter((group) => group.length > 1);
}

function lvRowScore(row: LVPos): number {
  return (
    (String(row.posNr || "").trim() ? 10 : 0) +
    (String(row.kurztext || "").trim() ? 10 : 0) +
    (String(row.langtext || "").trim() ? 8 : 0) +
    (String(row.einheit || "").trim() ? 6 : 0) +
    (toNumber(row.menge) > 0 ? 10 : 0) +
    (toNumber(row.preis) > 0 ? 10 : 0)
  );
}

function suggestUnit(row: LVPos): string {
  const existing = String(row.einheit || "").trim();
  if (existing) return existing;

  const text = lvTextKey(row);

  if (
    text.includes("aushub") ||
    text.includes("boden") ||
    text.includes("verfull") ||
    text.includes("verfüll") ||
    text.includes("kies") ||
    text.includes("schotter") ||
    text.includes("beton")
  ) {
    return "m³";
  }

  if (
    text.includes("asphalt") ||
    text.includes("pflaster") ||
    text.includes("fläche") ||
    text.includes("flache") ||
    text.includes("tragschicht") ||
    text.includes("deckschicht")
  ) {
    return "m²";
  }

  if (
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("kabel") ||
    text.includes("speedpipe") ||
    text.includes("trasse")
  ) {
    return "m";
  }

  if (
    text.includes("schacht") ||
    text.includes("anschluss") ||
    text.includes("bogen") ||
    text.includes("muffe") ||
    text.includes("abzweig")
  ) {
    return "St";
  }

  if (text.includes("abfuhr") || text.includes("entsorgung")) return "t";

  return "m";
}

function suggestKurztext(row: LVPos): string {
  const kurz = String(row.kurztext || "").trim();
  if (kurz.length >= 6) return kurz;

  const lang = String(row.langtext || "").replace(/\s+/g, " ").trim();
  if (lang.length >= 6) return lang.slice(0, 90);

  const pos = String(row.posNr || "").trim();
  return pos ? `Leistung zu Position ${pos}` : "Leistung prüfen";
}

function suggestLangtext(row: LVPos): string {
  const existing = String(row.langtext || "").trim();
  if (existing.length >= 25) return existing;

  const kurz = suggestKurztext(row);
  const unit = suggestUnit(row);
  const text = lvTextKey(row);
  const parts: string[] = [];

  parts.push(`${kurz}.`);
  parts.push(`Ausführung gemäß Leistungsbeschreibung und Ausführungsplanung.`);
  parts.push(`Abrechnung nach tatsächlich ausgeführter Menge in ${unit}.`);

  if (text.includes("aushub") || text.includes("graben")) {
    parts.push("Einschließlich Lösen, Laden, profilgerechtem Herstellen und seitlichem Lagern beziehungsweise Abfahren nach Erfordernis.");
  }

  if (text.includes("verfull") || text.includes("verfüll") || text.includes("kies") || text.includes("schotter")) {
    parts.push("Einschließlich lagenweisem Einbau, Verdichtung und Herstellung der geforderten Tragfähigkeit.");
  }

  if (text.includes("rohr") || text.includes("leitung") || text.includes("speedpipe") || text.includes("kabel")) {
    parts.push("Einschließlich Lieferung beziehungsweise Verlegung, Ausrichtung, Bettung und fachgerechtem Anschluss.");
  }

  if (text.includes("asphalt") || text.includes("pflaster")) {
    parts.push("Einschließlich Vorbereitung des Untergrundes, Einbau, Verdichtung und höhengerechter Wiederherstellung der Oberfläche.");
  }

  parts.push("Nebenleistungen, Geräte, Personal, Material und erforderliche Hilfsleistungen sind einzukalkulieren.");

  return parts.join(" ");
}
function rowStatus(row: LVPos): "ok" | "warning" | "critical" {
  if (!String(row.posNr || "").trim() || !String(row.kurztext || "").trim()) {
    return "critical";
  }

  if (!String(row.einheit || "").trim() || toNumber(row.menge) <= 0) {
    return "warning";
  }

  return "ok";
}

function statusLabel(status: "ok" | "warning" | "critical"): string {
  if (status === "ok") return "OK";
  if (status === "warning") return "Prüfen";
  return "Fehlt";
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

export default function LVImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const projectCtx: any = useProject();

  const currentProject = getCurrentProjectFromSources(projectCtx);
  const projectCode = getProjectCode(currentProject);
  const projectName = getProjectName(currentProject);

  const [rows, setRows] = useState<LVPos[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [mwst, setMwst] = useState<number>(() =>
    Number(localStorage.getItem(MWST_KEY) ?? 19)
  );
  const [info, setInfo] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [qualityFilter, setQualityFilter] = useState<LvQualityFilter>("alle");
  const [kiWorking, setKiWorking] = useState(false);
  const [kiProgress, setKiProgress] = useState(0);
  const [kiLog, setKiLog] = useState<string[]>([]);

  useEffect(() => {
    const list = LV.list();
    setRows(list);
    setSelectedId(list[0]?.id || "");
  }, []);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(mwst || 0));
  }, [mwst]);

  const duplicateGroups = useMemo(() => getLvDuplicateGroups(rows), [rows]);

  const duplicateIds = useMemo(() => {
    return new Set(
      duplicateGroups.flatMap((group) => group.map((row) => row.id))
    );
  }, [duplicateGroups]);

  const qualityStats = useMemo(() => {
    return {
      total: rows.length,
      critical: rows.filter((r) => rowStatus(r) === "critical").length,
      warning: rows.filter((r) => rowStatus(r) === "warning").length,
      epFehlt: rows.filter((r) => toNumber(r.preis) <= 0).length,
      einheitFehlt: rows.filter((r) => !String(r.einheit || "").trim()).length,
      mengeFehlt: rows.filter((r) => toNumber(r.menge) <= 0).length,
      kurztextFehlt: rows.filter((r) => !String(r.kurztext || "").trim()).length,
      langtextFehlt: rows.filter((r) => !String(r.langtext || "").trim()).length,
      doppelte: duplicateGroups.reduce((sum, g) => sum + Math.max(0, g.length - 1), 0),
    };
  }, [rows, duplicateGroups]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      if (qualityFilter === "kritisch" && rowStatus(r) !== "critical") return false;
      if (qualityFilter === "warning" && rowStatus(r) !== "warning") return false;
      if (qualityFilter === "epFehlt" && toNumber(r.preis) > 0) return false;
      if (qualityFilter === "einheitFehlt" && String(r.einheit || "").trim()) return false;
      if (qualityFilter === "mengeFehlt" && toNumber(r.menge) > 0) return false;
      if (qualityFilter === "kurztextFehlt" && String(r.kurztext || "").trim()) return false;
      if (qualityFilter === "langtextFehlt" && String(r.langtext || "").trim()) return false;
      if (qualityFilter === "doppelte" && !duplicateIds.has(r.id)) return false;

      if (!q) return true;

      const hay = `${r.posNr || ""} ${r.kurztext || ""} ${r.langtext || ""} ${
        r.einheit || ""
      } ${r.source || ""}`.toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query, qualityFilter, duplicateIds]);

  const selectedRow = useMemo(() => {
    return rows.find((r) => r.id === selectedId) || rows[0] || null;
  }, [rows, selectedId]);

  const totals = useMemo(() => {
    const netto = rows.reduce((sum, row) => sum + lineTotal(row), 0);
    const brutto = netto * (1 + (mwst || 0) / 100);
    const priced = rows.filter((r) => toNumber(r.preis) > 0).length;
    const critical = rows.filter((r) => rowStatus(r) === "critical").length;
    const warning = rows.filter((r) => rowStatus(r) === "warning").length;

    return {
      netto: round2(netto),
      brutto: round2(brutto),
      priced,
      total: rows.length,
      coverage: rows.length ? Math.round((priced / rows.length) * 100) : 0,
      critical,
      warning,
    };
  }, [rows, mwst]);

  function refreshRows(preselectId?: string) {
    const next = LV.list();
    setRows(next);

    if (preselectId) {
      setSelectedId(preselectId);
      return;
    }

    if (!next.some((r) => r.id === selectedId)) {
      setSelectedId(next[0]?.id || "");
    }
  }

  function saveRow(row: LVPos) {
    const next = makeLvRow({
      ...row,
      gesamt: round2(toNumber(row.menge) * toNumber(row.preis)),
    });

    LV.upsert(next);
    refreshRows(next.id);
  }

  function patchSelected(patch: Partial<LVPos>) {
    if (!selectedRow) return;
    saveRow({ ...selectedRow, ...patch });
  }

  function addRow() {
    const row = makeLvRow({
      posNr: "",
      kurztext: "",
      langtext: "",
      bemerkung: "",
      einheit: "m",
      menge: 1,
      preis: 0,
      waehrung: "EUR",
      source: "manual",
    });

    LV.upsert(row);
    refreshRows(row.id);
    setViewMode("editor");
    setInfo("Neue LV-Position erstellt.");
  }

  function duplicateSelected() {
    if (!selectedRow) return;

    const copy = makeLvRow({
      ...selectedRow,
      id: safeUuid(),
      posNr: `${selectedRow.posNr || ""}.Kopie`,
      source: "manual",
    });

    LV.upsert(copy);
    refreshRows(copy.id);
    setInfo("Position dupliziert.");
  }

  function deleteRow(id: string) {
    if (!window.confirm("Diese LV-Position wirklich löschen?")) return;

    LV.remove(id);
    refreshRows();
    setInfo("LV-Position gelöscht.");
  }

  function clearAll() {
    if (!window.confirm("Alle LV-Zeilen wirklich löschen?")) return;

    LV.clear();
    setRows([]);
    setSelectedId("");
    setInfo("LV lokal geleert.");
  }

  function importCSV(text: string) {
    try {
      LV.importCSV(text);
      refreshRows();
      setInfo("CSV lokal importiert.");
    } catch (e: any) {
      setInfo(`Fehler beim CSV-Import: ${e?.message || e}`);
    }
  }

  function exportCSV() {
    const csv = LV.exportCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = projectCode ? `${projectCode}-lv.csv` : "lv.csv";
    a.click();

    URL.revokeObjectURL(url);
    setInfo("CSV exportiert.");
  }

  function pasteRows() {
    const example = `PosNr;Kurztext;Langtext;Einheit;Menge;Preis
01.0001;"Aushub Baugrube";"Aushub Baugrube gemäß Leistungsbeschreibung";m³;120;35,50`;

    const text = window.prompt("Zeilen einfügen, CSV mit Semikolon:", example);
    if (!text) return;

    importCSV(text);
  }

  function exportXLSX() {
    const xmlHeader =
      `<?xml version="1.0"?>` +
      `<?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;

    const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;

    const headRow =
      `<Row>` +
      [
        "PosNr",
        "Kurztext",
        "Langtext",
        "Bemerkung",
        "Einheit",
        "Menge",
        "EP netto",
        "Gesamt",
        "Währung",
        "Quelle",
      ]
        .map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`)
        .join("") +
      `</Row>`;

    const body = rows
      .map((r) => {
        const total = lineTotal(r);

        return (
          `<Row>` +
          `<Cell><Data ss:Type="String">${esc(r.posNr || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.kurztext || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.langtext || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.bemerkung || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.einheit || "")}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${toNumber(r.menge)}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${toNumber(r.preis)}</Data></Cell>` +
          `<Cell><Data ss:Type="Number">${toNumber(total)}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.waehrung || "EUR")}</Data></Cell>` +
          `<Cell><Data ss:Type="String">${esc(r.source || "manual")}</Data></Cell>` +
          `</Row>`
        );
      })
      .join("");

    const xml =
      xmlHeader +
      sheetOpen +
      headRow +
      body +
      `</Table></Worksheet></Workbook>`;

    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = projectCode ? `${projectCode}-lv.xlsx` : "lv.xlsx";
    a.click();

    URL.revokeObjectURL(url);
    setInfo("XLSX exportiert.");
  }

  function autoPosNr() {
    const next = LV.renumber("01", 1, 4);
    setRows(next);
    setSelectedId(next[0]?.id || "");
    setInfo("Positionen automatisch nummeriert.");
  }

  async function syncRowsToServer(customRows?: LVPos[]) {
    const code = String(projectCode || "").trim().toUpperCase();

    if (!code) {
      setInfo("Kein Projektcode vorhanden. Server-Speicherung nicht möglich.");
      return false;
    }

    const sourceRows = customRows ?? LV.list();

    const payloadItems = sourceRows
      .filter((r) => String(r.posNr ?? "").trim() || String(r.kurztext ?? "").trim())
      .map((r) => ({
        pos: String(r.posNr ?? "").trim(),
        parentPos: String(r.parentPosNr ?? "").trim(),
        text: String(r.kurztext ?? "").trim(),
        langtext: String(r.langtext ?? "").trim(),
        bemerkung: String(r.bemerkung ?? "").trim(),
        unit: String(r.einheit ?? "").trim(),
        quantity: Number(r.menge ?? 0),
        ep:
          r.preis === null || r.preis === undefined || !Number.isFinite(Number(r.preis))
            ? null
            : Number(r.preis),
        total: Number.isFinite(lineTotal(r)) ? lineTotal(r) : null,
        currency: r.waehrung || "EUR",
      }));

    if (!payloadItems.length) {
      setInfo("Keine gültigen LV-Zeilen für die Server-Speicherung vorhanden.");
      return false;
    }

    try {
      setSyncBusy(true);
      setInfo("Speichere Projekt-LV am Server …");

      const response = await fetch(
        apiUrl(`/api/project-lv/${encodeURIComponent(code)}/import`),
        {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            title: `LV ${code}`,
            currency: "EUR",
            items: payloadItems,
          }),
        }
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || "Server-Speicherung fehlgeschlagen");
      }

      setInfo(`Projekt-LV am Server gespeichert. Zeilen: ${Number(json?.count || payloadItems.length)}.`);
      return true;
    } catch (e: any) {
      setInfo(`Server-Fehler: ${e?.message || e}`);
      return false;
    } finally {
      setSyncBusy(false);
    }
  }

  function applyLvFilter(filter: LvQualityFilter) {
    setQualityFilter(filter);
    setViewMode("editor");
    setInfo(`LV-Filter aktiviert: ${filter}`);
  }

  function runWithProgress(title: string, work: () => string[]) {
    setKiWorking(true);
    setKiProgress(10);
    setKiLog([`${title} gestartet …`]);

    window.setTimeout(() => {
      setKiProgress(45);

      window.setTimeout(() => {
        const log = work();

        setKiProgress(100);
        setKiLog(log.length ? log : ["Keine sichtbaren Änderungen erkannt."]);
        setInfo(`${title} abgeschlossen.`);

        window.setTimeout(() => {
          setKiWorking(false);
          setKiProgress(0);
        }, 900);
      }, 300);
    }, 250);
  }

  function fixMissingFields() {
    runWithProgress("LV-Prüfung", () => {
      const log: string[] = [];

      const next = rows.map((row) => {
        let changed = false;
        const patch: Partial<LVPos> = {};

        if (!String(row.einheit || "").trim()) {
          const unit = suggestUnit(row);
          patch.einheit = unit;
          log.push(`✓ Pos. ${row.posNr || "—"} – Einheit ergänzt: leer → ${unit}`);
          changed = true;
        }

        if (!String(row.kurztext || "").trim()) {
          const kurz = suggestKurztext(row);
          patch.kurztext = kurz;
          log.push(`✓ Pos. ${row.posNr || "—"} – Kurztext ergänzt.`);
          changed = true;
        }

        if (!String(row.langtext || "").trim()) {
          const lang = suggestLangtext({ ...row, ...patch });
          patch.langtext = lang;
          log.push(`✓ Pos. ${row.posNr || "—"} – Langtext ergänzt.`);
          changed = true;
        }

        if (toNumber(row.menge) <= 0) {
          log.push(`⚠ Pos. ${row.posNr || "—"} – Menge fehlt / 0. Manuelle Prüfung notwendig.`);
        }

        if (toNumber(row.preis) <= 0) {
          log.push(`⚠ Pos. ${row.posNr || "—"} – EP fehlt. Preisprüfung in Kalkulation notwendig.`);
        }

        if (!changed) return row;

        return makeLvRow({
          ...row,
          ...patch,
          gesamt: round2(toNumber(row.menge) * toNumber(row.preis)),
        });
      });

      LV.setAll(next);
      setRows(next);
      return log;
    });
  }

  function deleteDuplicateLvRows() {
    runWithProgress("Dublettenbereinigung", () => {
      const groups = getLvDuplicateGroups(rows);

      if (!groups.length) return ["Keine doppelten LV-Positionen gefunden."];

      const removeIds = new Set<string>();
      const log: string[] = [];

      for (const group of groups) {
        const sorted = [...group].sort((a, b) => lvRowScore(b) - lvRowScore(a));
        const keep = sorted[0];

        for (const row of sorted.slice(1)) {
          removeIds.add(row.id);
          log.push(`✓ Dublette gelöscht: Pos. ${row.posNr || "—"} – behalten wurde Pos. ${keep.posNr || "—"}`);
        }
      }

      const next = rows.filter((row) => !removeIds.has(row.id));
      LV.setAll(next);
      setRows(next);
      setSelectedId(next[0]?.id || "");

      return log;
    });
  }

  useEffect(() => {
    function handleLvCommand(event: Event) {
      const detail = (event as CustomEvent<{ filter?: LvQualityFilter; action?: string }>).detail;
      if (!detail) return;

      if (detail.filter) {
        applyLvFilter(detail.filter);
      }

      if (detail.action === "fixMissing") {
        fixMissingFields();
      }

      if (detail.action === "deleteDuplicates") {
        deleteDuplicateLvRows();
      }

      if (detail.action === "syncServer") {
        void syncRowsToServer(rows);
      }

      if (detail.action === "goKi") {
        navigate("/kalkulation/mit-ki");
      }

      if (detail.action === "goGaeb") {
        navigate(`/kalkulation/gaeb${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ""}`);
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    window.addEventListener("rlc:lv-command", handleLvCommand);

    return () => {
      window.removeEventListener("rlc:lv-command", handleLvCommand);
    };
  }, [rows, projectCode, navigate]);

  const selectedStatus = selectedRow ? rowStatus(selectedRow) : "critical";

  return (
    <div style={page}>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = () => importCSV(String(reader.result || ""));
          reader.readAsText(file, "utf-8");

          e.currentTarget.value = "";
        }}
      />

      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC Leistungsverzeichnis</div>
          <h1 style={title}>LV / Positionen</h1>
          <p style={subtitle}>
            Kompakte LV-Verwaltung: importieren, prüfen, bearbeiten und direkt in Kalkulation, GAEB oder Angebot weitergeben.
          </p>
        </div>

        <div style={heroActions}>
          <button type="button" style={btnHeroPrimary} onClick={addRow}>
            + Position
          </button>

          <button type="button" style={btnHeroSecondary} onClick={() => fileRef.current?.click()}>
            CSV importieren
          </button>

          <button
            type="button"
            style={btnHeroSecondary}
            onClick={() => void syncRowsToServer(rows)}
            disabled={syncBusy || rows.length === 0}
          >
            {syncBusy ? "Speichert …" : "Server speichern"}
          </button>

          <button
            type="button"
            style={btnHeroSecondary}
            onClick={() =>
              navigate(
                `/kalkulation/gaeb${
                  projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ""
                }`
              )
            }
          >
            GAEB
          </button>

          <button type="button" style={btnHeroSecondary} onClick={() => navigate("/kalkulation/mit-ki")}>
            Kalkulation mit KI
          </button>
        </div>

        <div style={heroMeta}>
          Projekt: <b>{projectCode || "—"}</b>
          {projectName ? <span> · <b>{projectName}</b></span> : null}
          {info ? <span> · {info}</span> : null}
        </div>
      </section>

      <section style={grid4}>
        <KpiCard label="Netto" value={fmtCurrency(totals.netto)} />
        <KpiCard label="Brutto" value={fmtCurrency(totals.brutto)} />
        <KpiCard label="Positionen" value={String(totals.total)} sub={`${totals.coverage}% mit EP`} />
        <KpiCard label="Prüfung" value={String(totals.critical + totals.warning)} sub={`${totals.critical} fehlt · ${totals.warning} prüfen`} />
      </section>

      <section style={compactToolbar}>
        <div style={toolbarLeft}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={searchInput}
            placeholder="LV durchsuchen: PosNr, Kurztext, Langtext, ME…"
          />

          <div style={mwstBox}>
            <span>MwSt</span>
            <input
              type="number"
              value={mwst}
              onChange={(e) => setMwst(Number(e.target.value || 0))}
              style={mwstInput}
            />
            <span>%</span>
          </div>
        </div>

        <div style={toolbarButtons}>
          <button type="button" style={buttonBase} onClick={pasteRows}>
            Einfügen
          </button>

          <button type="button" style={buttonBase} onClick={exportCSV}>
            CSV
          </button>

          <button type="button" style={buttonBase} onClick={exportXLSX}>
            XLSX
          </button>

          <button type="button" style={buttonBase} onClick={autoPosNr}>
            Auto-Nr.
          </button>

          <button
            type="button"
            style={viewMode === "editor" ? buttonPrimary : buttonBase}
            onClick={() => setViewMode("editor")}
          >
            Editor
          </button>

          <button
            type="button"
            style={viewMode === "liste" ? buttonPrimary : buttonBase}
            onClick={() => setViewMode("liste")}
          >
            Liste
          </button>

          <button type="button" style={buttonDanger} onClick={clearAll}>
            Leeren
          </button>
        </div>
      </section>

      <section style={qualityPanel}>
        <div style={qualityTop}>
          <div>
            <b>LV-KI Prüfung</b>
            <div style={qualitySub}>
              Filter, Datenprüfung, automatische Ergänzung und Änderungsprotokoll.
            </div>
          </div>

          <div style={qualityActions}>
            <button type="button" style={qualityFilter === "alle" ? chipActive : chip} onClick={() => applyLvFilter("alle")}>
              Alle {qualityStats.total}
            </button>
            <button type="button" style={qualityFilter === "kritisch" ? chipActive : chip} onClick={() => applyLvFilter("kritisch")}>
              Kritisch {qualityStats.critical}
            </button>
            <button type="button" style={qualityFilter === "warning" ? chipActive : chip} onClick={() => applyLvFilter("warning")}>
              Prüfen {qualityStats.warning}
            </button>
            <button type="button" style={qualityFilter === "epFehlt" ? chipActive : chip} onClick={() => applyLvFilter("epFehlt")}>
              EP fehlt {qualityStats.epFehlt}
            </button>
            <button type="button" style={qualityFilter === "einheitFehlt" ? chipActive : chip} onClick={() => applyLvFilter("einheitFehlt")}>
              Einheit fehlt {qualityStats.einheitFehlt}
            </button>
            <button type="button" style={qualityFilter === "mengeFehlt" ? chipActive : chip} onClick={() => applyLvFilter("mengeFehlt")}>
              Menge fehlt {qualityStats.mengeFehlt}
            </button>
            <button type="button" style={qualityFilter === "langtextFehlt" ? chipActive : chip} onClick={() => applyLvFilter("langtextFehlt")}>
              Langtext fehlt {qualityStats.langtextFehlt}
            </button>
            <button type="button" style={qualityFilter === "doppelte" ? chipActive : chip} onClick={() => applyLvFilter("doppelte")}>
              Doppelte {qualityStats.doppelte}
            </button>
          </div>
        </div>

        <div style={qualityActions}>
          <button type="button" style={buttonPrimary} onClick={fixMissingFields}>
            Fehlende Daten automatisch ergänzen
          </button>

          <button type="button" style={buttonBase} onClick={deleteDuplicateLvRows}>
            Doppelte bereinigen
          </button>

          <button type="button" style={buttonBase} onClick={() => void syncRowsToServer(rows)}>
            Server speichern
          </button>
        </div>

        {kiWorking || kiLog.length ? (
          <div style={kiProtocolBox}>
            <div style={protocolHead}>
              <b>KI-Protokoll</b>
              <span>{kiWorking ? `${kiProgress}%` : "abgeschlossen"}</span>
            </div>

            <div style={progressTrack}>
              <div style={{ ...progressFill, width: `${kiWorking ? kiProgress : 100}%` }} />
            </div>

            <div style={protocolList}>
              {kiLog.slice(0, 8).map((line, idx) => (
                <div key={`${line}-${idx}`} style={line.startsWith("⚠") ? protocolWarn : protocolOk}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {info ? <div style={statusBox(info)}>{info}</div> : null}

      {viewMode === "editor" ? (
        <section style={mainLayout}>
          <aside style={listCard}>
            <div style={listHeader}>
              <div>
                <h2 style={sectionTitle}>LV-Positionen</h2>
                <div style={sectionText}>
                  {filteredRows.length.toLocaleString("de-DE")} von {rows.length.toLocaleString("de-DE")}
                </div>
              </div>
            </div>

            <div style={positionList}>
              {filteredRows.map((r) => {
                const active = r.id === selectedId;
                const status = rowStatus(r);

                return (
                  <button
                    key={r.id}
                    type="button"
                    style={{
                      ...positionItem,
                      ...(active ? positionItemActive : {}),
                    }}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <div style={positionTop}>
                      <b>{r.posNr || "—"}</b>
                      <span style={statusBadge(status)}>{statusLabel(status)}</span>
                    </div>

                    <div style={positionText}>{r.kurztext || "Ohne Kurztext"}</div>

                    <div style={positionMeta}>
                      {fmtNumber(r.menge)} {r.einheit || "ME"} · EP {fmtCurrency(r.preis || 0)} · GP {fmtCurrency(lineTotal(r))}
                    </div>
                  </button>
                );
              })}

              {!filteredRows.length ? (
                <div style={emptyState}>Keine LV-Position vorhanden.</div>
              ) : null}
            </div>
          </aside>

          <main style={editorCard}>
            {selectedRow ? (
              <>
                <div style={editorHead}>
                  <div>
                    <h2 style={sectionTitle}>Position bearbeiten</h2>
                    <div style={sectionText}>
                      {selectedRow.posNr || "Neue Position"} · {selectedRow.kurztext || "Ohne Kurztext"}
                    </div>
                  </div>

                  <div style={editorActions}>
                    <span style={statusBadge(selectedStatus)}>{statusLabel(selectedStatus)}</span>

                    <button type="button" style={buttonBase} onClick={duplicateSelected}>
                      Duplizieren
                    </button>

                    <button type="button" style={buttonDanger} onClick={() => deleteRow(selectedRow.id)}>
                      Löschen
                    </button>
                  </div>
                </div>

                <div style={formGrid}>
                  <Field label="Positionsnummer">
                    <input
                      value={selectedRow.posNr || ""}
                      onChange={(e) => patchSelected({ posNr: e.target.value })}
                      style={inputStyle}
                      placeholder="z.B. 01.0010"
                    />
                  </Field>

                  <Field label="Einheit">
                    <input
                      value={selectedRow.einheit || ""}
                      onChange={(e) => patchSelected({ einheit: e.target.value })}
                      style={inputStyle}
                      placeholder="m / m² / m³ / St"
                    />
                  </Field>

                  <Field label="Menge">
                    <input
                      type="number"
                      value={selectedRow.menge ?? 0}
                      onChange={(e) =>
                        patchSelected({
                          menge: toNumber(e.target.value),
                          gesamt: round2(toNumber(e.target.value) * toNumber(selectedRow.preis)),
                        })
                      }
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="EP netto">
                    <input
                      type="number"
                      value={selectedRow.preis ?? 0}
                      onChange={(e) =>
                        patchSelected({
                          preis: toNumber(e.target.value),
                          gesamt: round2(toNumber(selectedRow.menge) * toNumber(e.target.value)),
                        })
                      }
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <div style={formGrid2}>
                  <Field label="Kurztext">
                    <input
                      value={selectedRow.kurztext || ""}
                      onChange={(e) => patchSelected({ kurztext: e.target.value })}
                      style={inputStyle}
                      placeholder="Kurze Leistungsbeschreibung"
                    />
                  </Field>

                  <div style={sumBox}>
                    <div style={sumLabel}>Gesamt netto</div>
                    <div style={sumValue}>{fmtCurrency(lineTotal(selectedRow))}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Field label="Langtext">
                    <textarea
                      value={selectedRow.langtext || ""}
                      onChange={(e) => patchSelected({ langtext: e.target.value })}
                      style={largeTextArea}
                      placeholder="Ausführliche Leistungsbeschreibung, Nebenleistungen, Abrechnung, technische Anforderungen…"
                    />
                  </Field>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Field label="Bemerkung / interne Notiz">
                    <textarea
                      value={selectedRow.bemerkung || ""}
                      onChange={(e) => patchSelected({ bemerkung: e.target.value })}
                      style={noteTextArea}
                      placeholder="Optionale Bemerkung"
                    />
                  </Field>
                </div>

                <div style={bottomActions}>
                  <button
                    type="button"
                    style={buttonPrimary}
                    onClick={() => navigate("/kalkulation/rezepte")}
                  >
                    Urkalkulation / Rezept erstellen
                  </button>

                  <button
                    type="button"
                    style={buttonBase}
                    onClick={() => navigate("/kalkulation/mit-ki")}
                  >
                    Zur KI-Kalkulation
                  </button>

                  <button
                    type="button"
                    style={buttonBase}
                    onClick={() => navigate("/kalkulation/angebot")}
                  >
                    Angebot
                  </button>
                </div>
              </>
            ) : (
              <div style={emptyState}>Keine Position gewählt.</div>
            )}
          </main>
        </section>
      ) : (
        <section style={card}>
          <div style={sectionHead}>
            <div>
              <h2 style={sectionTitle}>LV-Kompaktliste</h2>
              <div style={sectionText}>
                Schnelle Übersicht. Für Langtext und Details bitte Editor verwenden.
              </div>
            </div>
          </div>

          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Status</th>
                  <th style={th}>Position</th>
                  <th style={th}>Kurztext</th>
                  <th style={th}>ME</th>
                  <th style={thRight}>Menge</th>
                  <th style={thRight}>EP</th>
                  <th style={thRight}>GP</th>
                  <th style={th}>Quelle</th>
                  <th style={th}>Aktion</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((r) => {
                  const status = rowStatus(r);

                  return (
                    <tr key={r.id}>
                      <td style={td}>
                        <span style={statusBadge(status)}>{statusLabel(status)}</span>
                      </td>

                      <td style={td}>
                        <b>{r.posNr || "—"}</b>
                      </td>

                      <td style={td}>{r.kurztext || "—"}</td>
                      <td style={td}>{r.einheit || "—"}</td>
                      <td style={tdRight}>{fmtNumber(r.menge)}</td>
                      <td style={tdRight}>{fmtCurrency(r.preis || 0)}</td>
                      <td style={{ ...tdRight, fontWeight: 900 }}>{fmtCurrency(lineTotal(r))}</td>

                      <td style={td}>
                        <span style={badgeNeutral}>{r.source || "manual"}</span>
                      </td>

                      <td style={td}>
                        <button
                          type="button"
                          style={buttonBase}
                          onClick={() => {
                            setSelectedId(r.id);
                            setViewMode("editor");
                          }}
                        >
                          Öffnen
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 16, color: "#64748B" }}>
                      Keine LV-Positionen vorhanden.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ===================== STYLES ===================== */


const qualityPanel: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D7E3F5",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 12,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const qualityTop: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const qualitySub: React.CSSProperties = {
  marginTop: 3,
  color: "#64748B",
  fontSize: 13,
  fontWeight: 700,
};

const qualityActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const chip: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const chipActive: React.CSSProperties = {
  ...chip,
  border: "1px solid #2563EB",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const kiProtocolBox: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 9,
};

const protocolHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#0F172A",
  fontSize: 13,
};

const progressTrack: React.CSSProperties = {
  height: 9,
  borderRadius: 999,
  background: "#DBEAFE",
  overflow: "hidden",
};

const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#2563EB,#22C55E)",
  transition: "width 220ms ease",
};

const protocolList: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const protocolOk: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#166534",
  borderRadius: 10,
  padding: "7px 9px",
  fontSize: 12,
  fontWeight: 800,
};

const protocolWarn: React.CSSProperties = {
  ...protocolOk,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E",
};

const page: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 16,
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 20,
  display: "grid",
  gap: 12,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.82,
  fontWeight: 900,
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.1,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 940,
  opacity: 0.9,
  lineHeight: 1.5,
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
  padding: 14,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  minWidth: 0,
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
  fontSize: 21,
  color: "#0F172A",
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B",
};

const compactToolbar: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const toolbarLeft: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flex: "1 1 420px",
  minWidth: 280,
};

const toolbarButtons: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const searchInput: React.CSSProperties = {
  width: "100%",
  fontSize: 14,
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  padding: "10px 12px",
  background: "#FFFFFF",
  color: "#111827",
  boxSizing: "border-box",
};

const mwstBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 10,
  padding: "7px 9px",
  color: "#475569",
  fontSize: 13,
  fontWeight: 800,
};

const mwstInput: React.CSSProperties = {
  width: 58,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 7px",
  fontSize: 13,
  textAlign: "right",
};

const statusBox = (info: string): React.CSSProperties => {
  const isError =
    info.startsWith("Fehler") ||
    info.startsWith("Server-Fehler") ||
    info.includes("fehlgeschlagen");

  const isSuccess =
    info.includes("gespeichert") ||
    info.includes("importiert") ||
    info.includes("exportiert") ||
    info.includes("erstellt");

  return {
    padding: "11px 13px",
    borderRadius: 12,
    border: `1px solid ${isError ? "#FECACA" : isSuccess ? "#BBF7D0" : "#D1D5DB"}`,
    background: isError ? "#FEF2F2" : isSuccess ? "#F0FDF4" : "#F8FAFC",
    color: isError ? "#B91C1C" : isSuccess ? "#15803D" : "#475569",
    fontSize: 13,
    fontWeight: 700,
  };
};

const mainLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "390px minmax(0,1fr)",
  gap: 14,
  alignItems: "start",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const listCard: React.CSSProperties = {
  ...card,
  position: "sticky",
  top: 12,
  maxHeight: "calc(100vh - 24px)",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto minmax(0,1fr)",
};

const listHeader: React.CSSProperties = {
  marginBottom: 12,
};

const positionList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  overflow: "auto",
  paddingRight: 4,
};

const positionItem: React.CSSProperties = {
  display: "grid",
  gap: 6,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 10,
  cursor: "pointer",
  textAlign: "left",
  color: "#0F172A",
};

const positionItemActive: React.CSSProperties = {
  borderColor: "#2563EB",
  background: "#EFF6FF",
};

const positionTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const positionText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.35,
  color: "#0F172A",
};

const positionMeta: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  lineHeight: 1.4,
};

const editorCard: React.CSSProperties = {
  ...card,
  minWidth: 0,
};

const editorHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const editorActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
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
  lineHeight: 1.45,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 900,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.7fr",
  gap: 12,
};

const formGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 220px",
  gap: 12,
  marginTop: 12,
  alignItems: "end",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 14,
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  padding: "10px 12px",
  background: "#FFFFFF",
  color: "#111827",
  boxSizing: "border-box",
};

const largeTextArea: React.CSSProperties = {
  ...inputStyle,
  minHeight: 180,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const noteTextArea: React.CSSProperties = {
  ...inputStyle,
  minHeight: 78,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.45,
};

const sumBox: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  borderRadius: 12,
  padding: "10px 12px",
};

const sumLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#1D4ED8",
  fontWeight: 900,
  textTransform: "uppercase",
};

const sumValue: React.CSSProperties = {
  marginTop: 5,
  fontSize: 20,
  color: "#0F172A",
  fontWeight: 900,
};

const bottomActions: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const tableWrap: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  overflow: "auto",
  background: "#FFFFFF",
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1120,
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #E5E7EB",
  background: "#F8FAFC",
  fontWeight: 900,
  whiteSpace: "nowrap",
  fontSize: 12,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.02em",
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right",
};

const td: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle",
  fontSize: 13,
  color: "#0F172A",
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const buttonBase: React.CSSProperties = {
  fontSize: 13,
  borderRadius: 10,
  padding: "9px 12px",
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  cursor: "pointer",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "#2563EB",
  border: "1px solid #1D4ED8",
  color: "#FFFFFF",
};

const buttonDanger: React.CSSProperties = {
  ...buttonBase,
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
};

const btnHeroPrimary: React.CSSProperties = {
  ...buttonPrimary,
  padding: "10px 15px",
  boxShadow: "0 10px 20px rgba(37,99,235,0.22)",
};

const btnHeroSecondary: React.CSSProperties = {
  ...buttonBase,
  padding: "10px 15px",
  background: "#FFFFFF",
  color: "#0F172A",
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

function statusBadge(status: "ok" | "warning" | "critical"): React.CSSProperties {
  if (status === "ok") {
    return {
      ...badgeNeutral,
      border: "1px solid #BBF7D0",
      background: "#F0FDF4",
      color: "#15803D",
    };
  }

  if (status === "warning") {
    return {
      ...badgeNeutral,
      border: "1px solid #FDE68A",
      background: "#FFFBEB",
      color: "#B45309",
    };
  }

  return {
    ...badgeNeutral,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
  };
}

const emptyState: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 14,
  color: "#64748B",
  fontSize: 13,
};






