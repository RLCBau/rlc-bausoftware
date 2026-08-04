import { rlcClass } from "../../ui/rlcRuntimeStyle";import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import { apiUrl } from "../../lib/apiBase";
// apps/web/src/pages/aufmass/AufmassEditor.tsx
import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import { consumeCadExport } from "../../utils/cadImport";
import { getStandardFormel } from "../../lib/stammdaten";

/* ============================================================
   Typen
   ============================================================ */

type AufmassEntry = {
  id: string;
  label: string;
  formula: string;
  menge: number;
  note?: string;
  factor?: number;
  unit?: string;
  ep?: number;
  createdAt: string;
  sourceId?: string;
  source?: string;
  kreis?: number;
  blatt?: number;
  nr?: number;
  reb?: string;
  messzahl?: number;
  ortId?: string;
};

type LVRow = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  ep: number;
  soll: number;
  formula: string;
  ist: number;
  note?: string;
  factor?: number;
  langtext?: string;
  entries?: AufmassEntry[];
};

type LvPosition = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  quantity: number;
  ep: number;
  langtext?: string;
  longText?: string;
  description?: string;
  beschreibung?: string;
  textLang?: string;
};

type Ort = {
  id: string;
  projectId: string;
  parentId: string | null;
  nummer: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
};

type OrtPosition = {
  ortId: string;
  positionId: string;
};

type CompanyPdfHeader = {
  name: string;
  address: string;
  phone: string;
  email: string;
  code: string;
  logoDataUrl?: string | null;
};

type FotoExtra = {
  id: string;
  typ: "KI" | "Manuell";
  beschreibung: string;
  einheit: string;
  menge: number;
  lvPos?: string;
};

const FOTO_STORAGE_KEY = "rlc-manuell-foto-v1";

/** Bridge-Keys */
const AUFMASS_LAST_CODE = "RLC_AUFMASS_LAST_CODE";
const AUFMASS_LAST_ID = "RLC_AUFMASS_LAST_ID";

type GpsTransferItem = {
  id: string;
  type: "DISTANCE" | "AREA";
  label: string;
  qty: number;
  unit: string;
  comment?: string;
};

type GpsTransferPayload = {
  projectId: string;
  transferId: string;
  lvPosId?: string;
  lvPosition: string;
  lvKurztext?: string;
  items: GpsTransferItem[];
  createdAt: number;
  consumedAt?: number | null;
};

/* ============================================================
   Angebot Snapshot Bridge
   ============================================================ */

type AngebotSnapshotRow = {
  id?: string;
  posNr?: string;
  kurztext?: string;
  einheit?: string;
  menge?: number;
  preis?: number;
};

type AngebotSnapshot = {
  projectKey: string;
  createdAt: string;
  rows: AngebotSnapshotRow[];
  options?: any;
};

function loadOfferSnapshot(
project: any,
stickyCode?: string,
stickyId?: string)
: AngebotSnapshot | null {
  try {
    const candidates = [
    project?.id,
    project?.number,
    project?.name,
    project?.code,
    stickyId,
    stickyCode].

    map((v) => String(v ?? "").trim()).
    filter(Boolean);

    for (const c of candidates) {
      const raw = localStorage.getItem(`rlc_angebot_snapshot:${c}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as AngebotSnapshot;
      if (parsed && Array.isArray(parsed.rows)) return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

function safeUUID() {
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto?.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {


    // ignore
  }return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;}

function buildLvRowFromOfferRow(r: AngebotSnapshotRow, idx: number): LVRow {
  const unit = String(r.einheit ?? "m");
  return {
    id: safeUUID(),
    pos: String(r.posNr ?? `ANG.${String(idx + 1).padStart(3, "0")}`),
    text: String(r.kurztext ?? ""),
    unit,
    ep: Number(r.preis ?? 0),
    soll: Number(r.menge ?? 0),
    formula: getStandardFormel(unit),
    ist: 0,
    note: "Aus Angebot übernommen",
    factor: 1
  };
}

function angebotRowsToAufmassRows(rows: AngebotSnapshotRow[]): LVRow[] {
  return (Array.isArray(rows) ? rows : []).map(buildLvRowFromOfferRow);
}

/* ============================================================
   Helper
   ============================================================ */

const fmtEUR = (v: number) => "€ " + (isFinite(v) ? v.toFixed(2) : "0.00");

function nrmNumber(v: any, fallback = 0) {
  const x = Number(String(v ?? "").replace(",", "."));
  return isFinite(x) ? x : fallback;
}

function calc(formula: string): number {
  const raw = String(formula || "").trim();
  if (!raw) return 0;

  if (raw.startsWith("AUFMASS:")) {
    return parseMassEditorLines(raw.replace(/^AUFMASS:/, ""));
  }

  const cleaned = raw.
  replace(/^=/, "").
  replace(/,/g, ".").
  replace(/[×xX]/g, "*").
  replace(/[^\d+\-*/().\s]/g, "");
  if (!cleaned.trim()) return 0;

  try {
    // eslint-disable-next-line no-new-func
    const f = new Function(`return (${cleaned});`);
    const v = Number(f());
    return isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function safeTrim(s: any) {
  return String(s ?? "").trim();
}

function fmtNumDE(v: number, digits = 3) {
  if (!isFinite(v)) return "0";
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function fmtPlainInput(v: any) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!isFinite(n)) return String(v ?? "");
  return String(n).replace(".", ",");
}

function byPosAsc(a: LVRow, b: LVRow) {
  return String(a.pos ?? "").localeCompare(String(b.pos ?? ""), "de-DE", {
    numeric: true,
    sensitivity: "base"
  });
}


type RebExportLine = {
  position: string;
  oz9: string;
  levels: [string, string];
  item: string;
  index: string;
  row80: string;
  kind: "FORMULA" | "COMMENT";
};

function xmlEscape(value: unknown): string {
  return String(value ?? "").
  replace(/&/g, "&amp;").
  replace(/</g, "&lt;").
  replace(/>/g, "&gt;").
  replace(/"/g, "&quot;").
  replace(/'/g, "&apos;");
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function encodeWindows1252(value: string): Uint8Array {
  const special: Record<number, number> = {
    0x20ac: 0x80,
    0x201a: 0x82,
    0x0192: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x02c6: 0x88,
    0x2030: 0x89,
    0x0160: 0x8a,
    0x2039: 0x8b,
    0x0152: 0x8c,
    0x017d: 0x8e,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x02dc: 0x98,
    0x2122: 0x99,
    0x0161: 0x9a,
    0x203a: 0x9b,
    0x0153: 0x9c,
    0x017e: 0x9e,
    0x0178: 0x9f
  };

  const output: number[] = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0x3f;

    if (codePoint <= 0xff) {
      output.push(codePoint);
    } else {
      output.push(special[codePoint] ?? 0x3f);
    }
  }

  return new Uint8Array(output);
}

function downloadBinaryFile(
filename: string,
content: Uint8Array,
type: string)
{
  const sourceBuffer = content.buffer as ArrayBuffer;
  const buffer = sourceBuffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength
  );

  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function rebDigits(value: unknown, length: number, fallback: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return fallback;
  return digits.padStart(length, "0").slice(-length);
}

/**
 * GAEB X31/DA11 OZ layout used by the supplied reference:
 * 2 digits BoQ level + 2 digits BoQ level + 4 digits Item + 1 index.
 *
 * Supported RLC position forms:
 * 01.01.0001.A
 * 01.01.0001
 * 01.0001       -> level 01 / level 00 / item 0001
 * 01010001A
 */
function normalizeRebPosition(position: unknown): {
  levels: [string, string];
  item: string;
  index: string;
  oz9: string;
} {
  const raw = safeTrim(position);
  const parts = raw.split(/[^0-9A-Za-z]+/).filter(Boolean);

  let level1 = "00";
  let level2 = "00";
  let item = "0001";
  let index = " ";

  if (parts.length >= 3) {
    level1 = rebDigits(parts[0], 2, "00");
    level2 = rebDigits(parts[1], 2, "00");
    item = rebDigits(parts[2], 4, "0001");
    index = safeTrim(parts[3] || " ").slice(0, 1).toUpperCase() || " ";
  } else if (parts.length === 2) {
    level1 = rebDigits(parts[0], 2, "00");
    level2 = "00";
    item = rebDigits(parts[1], 4, "0001");
  } else {
    const compact = raw.replace(/[^0-9A-Za-z]/g, "");
    const numeric = compact.replace(/\D/g, "");

    if (numeric.length >= 8) {
      level1 = numeric.slice(0, 2);
      level2 = numeric.slice(2, 4);
      item = numeric.slice(4, 8);
      index = compact.slice(8, 9).toUpperCase() || " ";
    } else if (numeric.length >= 6) {
      level1 = numeric.slice(0, 2);
      level2 = "00";
      item = numeric.slice(2, 6);
    } else if (numeric.length) {
      item = numeric.padStart(4, "0").slice(-4);
    }
  }

  return {
    levels: [level1, level2],
    item,
    index,
    oz9: `${level1}${level2}${item}${index}`.slice(0, 9).padEnd(9, " ")
  };
}

function rebAddress(index: number): string {
  const safeIndex = Math.max(0, index);
  const perSheet = 130;
  const sheet = Math.floor(safeIndex / perSheet) + 1;
  const within = safeIndex % perSheet;
  const letter = String.fromCharCode(65 + Math.floor(within / 5));
  const digit = String(within % 5 * 2);
  return `${String(sheet).padStart(4, "0")}${letter}${digit}00001`;
}

function normalizeRebExpression(value: unknown): string {
  return String(value ?? "").
  trim().
  replace(/^AUFMASS:/i, "").
  replace(/^=/, "").
  replace(/[×xX]/g, "*").
  replace(/\./g, ",").
  replace(/\s+/g, "");
}

function formatRebValue(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(3).replace(/\.?0+$/, "").replace(".", ",") || "0";
}

function buildRebRow80(
content: string,
addressIndex: number,
label = "")
: string {
  const safeLabel = String(label || "").replace(/\r?\n/g, " ").slice(0, 16);
  const left = `${" ".repeat(13)}${safeLabel.padEnd(16, " ")}${content}`.
  slice(0, 69).
  padEnd(69, " ");
  return `${left}${rebAddress(addressIndex)}`.slice(0, 80).padEnd(80, " ");
}

function buildRebCommentRow80(
comment: unknown,
addressIndex: number)
: string {
  const text = String(comment ?? "").
  replace(/\r?\n/g, " ").
  trim().
  slice(0, 56);

  const left = `${" ".repeat(12)}*${text}`.
  slice(0, 69).
  padEnd(69, " ");

  return `${left}${rebAddress(addressIndex)}`.
  slice(0, 80).
  padEnd(80, " ");
}

function buildRebFormulaRow80(
expression: unknown,
result: number,
addressIndex: number,
label = "")
: string {
  let normalized = normalizeRebExpression(expression);
  if (!normalized) normalized = formatRebValue(result);

  // Formula 91 is the free arithmetic approach used in the supplied X31.
  // Keep the original arithmetic where it fits; otherwise export the
  // calculated quantity as a direct formula-91 value.
  let formula = `91${normalized}=`;
  if (formula.length > 40) {
    formula = `91${formatRebValue(result)}=`;
  }

  return buildRebRow80(formula, addressIndex, label);
}

function buildRebExportLines(rows: LVRow[]): RebExportLine[] {
  const lines: RebExportLine[] = [];
  let addressIndex = 0;

  const pushLine = (
  row: LVRow,
  row80: string,
  kind: "FORMULA" | "COMMENT") =>
  {
    const pos = normalizeRebPosition(row.pos);
    lines.push({
      position: safeTrim(row.pos),
      oz9: pos.oz9,
      levels: pos.levels,
      item: pos.item,
      index: pos.index,
      row80,
      kind
    });
  };

  rows.slice().sort(byPosAsc).forEach((row) => {
    const storedEntries = Array.isArray(row.entries) ?
    row.entries.filter((entry) => {
      const formula = normalizeRebExpression(entry.formula);
      const quantity = Number(entry.menge || 0);

      return (
        Boolean(formula) ||
        Math.abs(quantity) > 0.0000001);

    }) :
    [];

    const hasFallback =
    Boolean(normalizeRebExpression(row.formula)) ||
    Math.abs(Number(row.ist || 0)) > 0.0000001;

    if (!storedEntries.length && !hasFallback) {
      return;
    }

    const entries =
    storedEntries.length ?
    storedEntries :
    [
    {
      label: "",
      formula: row.formula,
      menge: Number(row.ist || 0),
      note: row.note || "",
      factor: row.factor ?? 1
    } as AufmassEntry];

    entries.forEach((entry, entryIndex) => {
      const noteParts = [
      safeTrim(entry.note),
      entryIndex === 0 ? safeTrim(row.note) : ""].
      filter(Boolean);

      Array.from(new Set(noteParts)).forEach((note) => {
        pushLine(
          row,
          buildRebCommentRow80(note, addressIndex++),
          "COMMENT"
        );
      });

      const formulaLines = String(entry.formula || "").
      replace(/^AUFMASS:/i, "").
      split(/\r?\n|\\n/g).
      map((line) => line.trim()).
      filter(Boolean);

      const entryFactor = Number(entry.factor ?? 1) || 1;
      const result = Number(entry.menge || 0);

      if (formulaLines.length) {
        formulaLines.forEach((formulaLine, formulaIndex) => {
          const calculated = parseMassEditorLines(formulaLine) * entryFactor;
          const exportedResult = Number.isFinite(calculated) ?
          calculated :
          result;

          const withFactor =
          entryFactor !== 1 ?
          `(${formulaLine})*${String(entryFactor).replace(".", ",")}` :
          formulaLine;

          pushLine(
            row,
            buildRebFormulaRow80(
              withFactor,
              exportedResult,
              addressIndex++,
              formulaIndex === 0 ? safeTrim(entry.label) : ""
            ),
            "FORMULA"
          );
        });
      } else {
        pushLine(
          row,
          buildRebFormulaRow80(
            "",
            result,
            addressIndex++,
            safeTrim(entry.label)
          ),
          "FORMULA"
        );
      }
    });
  });

  return lines;
}

/* ============================================================
   UUID helper
   ============================================================ */

const UUID_RE =
/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: any) {
  return UUID_RE.test(String(s || "").trim());
}

function getLastCode(): string | null {
  try {
    return localStorage.getItem(AUFMASS_LAST_CODE);
  } catch {
    return null;
  }
}

function setLastCode(k: string) {
  try {
    localStorage.setItem(AUFMASS_LAST_CODE, k);
  } catch {


    // ignore
  }}
function getLastId(): string | null {
  try {
    return localStorage.getItem(AUFMASS_LAST_ID);
  } catch {
    return null;
  }
}

function setLastId(k: string) {
  try {
    localStorage.setItem(AUFMASS_LAST_ID, k);
  } catch {


    // ignore
  }}
/* ============================================================
   Aufmaß-Storage
   - Lokal: IMMER pro UUID (projectId)
   ============================================================ */

const AUFMASS = {
  load(projectId: string | null | undefined): LVRow[] {
    if (!projectId) return [];
    try {
      const key = `RLC_AUFMASS_${projectId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as LVRow[];
    } catch {
      return [];
    }
  },

  save(projectId: string | null | undefined, rows: LVRow[]) {
    if (!projectId) return;
    try {
      const key = `RLC_AUFMASS_${projectId}`;
      localStorage.setItem(key, JSON.stringify(rows));
    } catch {


      // ignore
    }},
  clear(projectId: string | null | undefined) {
    if (!projectId) return;
    try {
      const key = `RLC_AUFMASS_${projectId}`;
      localStorage.removeItem(key);
    } catch {


      // ignore
    }},
  selKey(projectId: string) {
    return `RLC_AUFMASS_SEL_${projectId}`;
  },

  loadSel(projectId: string | null | undefined): string | null {
    if (!projectId) return null;
    try {
      return localStorage.getItem(AUFMASS.selKey(projectId));
    } catch {
      return null;
    }
  },

  saveSel(projectId: string | null | undefined, selId: string | null) {
    if (!projectId) return;
    try {
      if (!selId) localStorage.removeItem(AUFMASS.selKey(projectId));else
      localStorage.setItem(AUFMASS.selKey(projectId), selId);
    } catch {


      // ignore
    }} };

/* ============================================================
   Layout Styles — RLC Übersicht/Kalkulation Look
   ============================================================ */

const pageContainer: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: "12px 16px 24px",
  color: "#0F172A",
  background:
  "radial-gradient(circle at top left, rgba(37,99,235,0.045), transparent 30%), #F6F8FC",
  minHeight: "100%"
};

const breadcrumb: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#64748B",
  fontWeight: 600
};

const breadcrumbStrong: React.CSSProperties = {
  color: "#0F172A",
  fontWeight: 700
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 20,
  padding: "14px 20px 16px",
  display: "grid",
  gap: 10,
  boxShadow: "0 14px 34px rgba(15, 23, 42, 0.16)",
  border: "1px solid rgba(255,255,255,0.14)"
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "flex-start"
};

const heroTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap"
};

const heroIcon: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 11,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.14)",
  border: "1px solid rgba(255,255,255,0.22)",
  fontSize: 18
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.82,
  fontWeight: 700
};

const title: React.CSSProperties = {
  color: "#FFFFFF", margin: 0,
  fontSize: 24,
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  fontWeight: 700
};

const subtitle: React.CSSProperties = {
  margin: "6px 0 0",
  maxWidth: 860,
  opacity: 0.92,
  lineHeight: 1.38,
  fontSize: 12.5
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 11,
  flexWrap: "wrap",
  alignItems: "center"
};

const heroMeta: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center"
};

const heroPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.14)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 700
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(190px, 1fr))",
  gap: 14
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 18,
  border: "1px solid #E5EAF3",
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
  padding: "18px 20px",
  display: "flex",
  alignItems: "center",
  gap: 16,
  minHeight: 94
};

const kpiIconBase: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 13,
  display: "grid",
  placeItems: "center",
  color: "#FFFFFF",
  fontSize: 23,
  fontWeight: 700,
  flex: "0 0 auto"
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  color: "#475569",
  fontWeight: 700
};

const kpiValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 19,
  lineHeight: 1.1,
  color: "#0F172A",
  fontWeight: 700,
  letterSpacing: "-0.02em"
};

const kpiHint: React.CSSProperties = {
  marginTop: 5,
  fontSize: 12,
  color: "#64748B",
  fontWeight: 650
};

const workflowCard: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 18,
  border: "1px solid #E5EAF3",
  boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
  padding: "16px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap"
};

const workflowStep: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  color: "#0B5BD3",
  fontSize: 14,
  fontWeight: 700,
  whiteSpace: "nowrap"
};

const workflowStepActive: React.CSSProperties = {
  ...workflowStep,
  background: "#EAF2FF",
  border: "1px solid #BED6FF",
  borderRadius: 999,
  padding: "8px 12px"
};

const workflowBubble: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "#FFFFFF",
  border: "1px solid #93C5FD",
  color: "#146EF5",
  fontWeight: 700
};

const workflowArrow: React.CSSProperties = {
  color: "#94A3B8",
  fontWeight: 700
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 18,
  border: "1px solid #E5EAF3",
  boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
  padding: 18
};

const cardTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
  gap: 14,
  flexWrap: "wrap"
};

const cardTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "#0F172A",
  letterSpacing: "-0.01em"
};

const cardHint: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B"
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
};

const btn: React.CSSProperties = {
  border: "1px solid #D9E2F1",
  borderRadius: 10,
  padding: "7px 11px",
  minHeight: 34,
  fontSize: 12.5,
  fontWeight: 700,
  background: "#FFFFFF",
  color: "#0F172A",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.42rem",
  whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const btnHero: React.CSSProperties = {
  ...btn,
  minHeight: 32,
  padding: "6px 10px",
  fontSize: 12,
  background: "rgba(255,255,255,0.08)",
  borderColor: "rgba(255,255,255,0.48)",
  color: "#FFFFFF",
  boxShadow: "none"
};

const btnDisabled: React.CSSProperties = {
  opacity: 0.55,
  cursor: "not-allowed"
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "linear-gradient(135deg,#146EF5,#146EF5)",
  borderColor: "#146EF5",
  color: "#FFFFFF",
  fontWeight: 700
};

const btnDanger: React.CSSProperties = {
  ...btn,
  color: "#DC2626",
  borderColor: "#FECACA",
  background: "#FFFFFF"
};

const tableWrap: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid #E5EAF3",
  overflow: "hidden",
  background: "#FFFFFF"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #E5EAF3",
  fontSize: 12,
  whiteSpace: "nowrap",
  background: "#F8FAFC",
  color: "#475569",
  fontWeight: 700
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #EDF2F7",
  fontSize: 13,
  verticalAlign: "middle",
  color: "#0F172A"
};

const lbl: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  fontWeight: 700
};

const inpBase: React.CSSProperties = {
  border: "1px solid #D9E2F1",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
  background: "#FFFFFF",
  color: "#0F172A",
  boxShadow: "inset 0 1px 0 rgba(15,23,42,0.02)",
  boxSizing: "border-box"
};

const inpNarrow: React.CSSProperties = { ...inpBase, width: 150 };
const inpMini: React.CSSProperties = { ...inpBase, width: 112 };
const inpWide: React.CSSProperties = { ...inpBase, width: "100%" };

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #E5EAF3",
  background: "#F8FAFC",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  color: "#334155",
  fontWeight: 750
};

const sectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateRows: "minmax(180px, 31vh) minmax(300px, 1fr)",
  gap: 18
};

const modalWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.42)",
  zIndex: 999,
  display: "grid",
  placeItems: "center",
  padding: 20,
  backdropFilter: "blur(4px)"
};

const modalBox: React.CSSProperties = {
  background: "#fff",
  color: "#111",
  border: "1px solid #E5EAF3",
  borderRadius: 18,
  width: "min(980px,95vw)",
  maxHeight: "82vh",
  padding: 18,
  boxShadow: "0 26px 70px rgba(15,23,42,.22)"
};

const modalTextarea: React.CSSProperties = {
  width: "100%",
  height: "42vh",
  resize: "vertical",
  fontFamily:
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: 14,
  lineHeight: 1.4,
  border: "1px solid #D9E2F1",
  borderRadius: 12,
  padding: 12
};

function rowTint(_diff: number, active: boolean): React.CSSProperties {
  return {
    background: active ? "#F8FBFF" : "#FFFFFF",
    boxShadow: active ? "inset 3px 0 0 #146EF5" : "none"
  };
}

/* ============================================================
   Server mapping
   ============================================================ */

type AufmassJsonRow = {
  id?: string;
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
  formula?: string;
  note?: string;
  factor?: number;
  langtext?: string;
  entries?: AufmassEntry[];
};

type SollIstRow = AufmassJsonRow;

function toAufmassJson(rows: LVRow[]): AufmassJsonRow[] {
  return rows.map((r) => ({
    id: r.id,
    pos: String(r.pos ?? ""),
    text: String(r.text ?? ""),
    unit: String(r.unit ?? "m"),
    soll: Number(r.soll || 0),
    ist: Number(r.ist || 0),
    ep: Number(r.ep || 0),
    formula: String(r.formula ?? ""),
    note: String(r.note ?? ""),
    factor: Number(r.factor ?? 1),
    langtext: String(r.langtext ?? ""),
    entries: Array.isArray(r.entries) ? r.entries : []
  }));
}

function restoreAufmassEntriesFromServerRow(r: AufmassJsonRow): AufmassEntry[] {
  if (Array.isArray(r.entries) && r.entries.length) {
    return r.entries.map((entry, index) => ({
      ...entry,
      id: String(entry.id || safeUUID()),
      label: String(entry.label || `Aufmaß ${index + 1}`),
      formula: String(entry.formula || ""),
      menge: Number(entry.menge ?? 0),
      factor: Number(entry.factor ?? 1) || 1,
      unit: String(entry.unit || r.unit || "m"),
      ep: Number(entry.ep ?? r.ep ?? 0),
      createdAt: String(entry.createdAt || new Date().toISOString()),
      kreis: Number(entry.kreis ?? 1),
      blatt: Number(entry.blatt ?? 1),
      nr: Number(entry.nr ?? index + 1),
      reb: String(entry.reb || `000${String(index + 1).padStart(2, "0")}`),
      messzahl: Number(entry.messzahl ?? 91)
    }));
  }

  const formulaText = String(r.formula || "").replace(/^AUFMASS:/i, "").trim();
  if (!formulaText) return [];

  const formulaLines = formulaText.
  split(/\r?\n|\\n/g).
  map((line) => line.trim()).
  filter(Boolean);

  if (!formulaLines.length) return [];

  const rowFactor = Number(r.factor ?? 1) || 1;
  return formulaLines.map((formula, index) => ({
    id: safeUUID(),
    label: formulaLines.length === 1 && safeTrim(r.note) ?
    safeTrim(r.note) :
    `Aufmaß ${index + 1}`,
    formula,
    menge: parseMassEditorLines(formula) * rowFactor,
    note: formulaLines.length === 1 ? String(r.note || "") : "",
    factor: rowFactor,
    unit: String(r.unit || "m"),
    ep: Number(r.ep ?? 0),
    createdAt: new Date().toISOString(),
    kreis: 1,
    blatt: 1,
    nr: index + 1,
    reb: `000${String(index + 1).padStart(2, "0")}`,
    messzahl: 91
  }));
}

function fromAufmassJson(rows: AufmassJsonRow[]): LVRow[] {
  return (rows || []).map((r) => {
    const entries = restoreAufmassEntriesFromServerRow(r);
    return {
      id: String(r.id || safeUUID()),
      pos: String(r.pos ?? ""),
      text: String(r.text ?? ""),
      unit: String(r.unit ?? "m"),
      ep: Number(r.ep ?? 0),
      soll: Number(r.soll ?? 0),
      formula: String(r.formula ?? ""),
      ist: entries.length ? entriesSum(entries) : Number(r.ist ?? 0),
      note: String(r.note ?? ""),
      factor: Number(r.factor ?? 1),
      langtext: String(r.langtext ?? ""),
      entries
    };
  });
}

function toSollIst(rows: LVRow[]): SollIstRow[] {
  return toAufmassJson(rows);
}

function fromSollIst(rows: SollIstRow[]): LVRow[] {
  return fromAufmassJson(rows);
}

/* ============================================================
   MERGE helper
   ============================================================ */

function mergeByPos(primary: LVRow[], legacy: LVRow[]): LVRow[] {
  const map = new Map<string, LVRow>();
  const normPos = (p: any) => String(p ?? "").trim();

  for (const r of primary || []) {
    const k = normPos(r.pos);
    if (!k) continue;
    map.set(k, { ...r, pos: k });
  }

  for (const lr of legacy || []) {
    const k = normPos(lr.pos);
    if (!k) continue;

    const ex = map.get(k);
    if (!ex) {
      map.set(k, { ...lr, id: safeUUID(), pos: k });
      continue;
    }

    const merged: LVRow = {
      ...ex,
      pos: k,
      text: ex.text?.trim() ? ex.text : lr.text,
      unit: ex.unit?.trim() ? ex.unit : lr.unit,
      ep: ex.ep && ex.ep > 0 ? ex.ep : lr.ep,
      soll: ex.soll && ex.soll > 0 ? ex.soll : lr.soll,
      ist: Math.max(Number(ex.ist || 0), Number(lr.ist || 0)),
      note: ex.note?.trim() ? ex.note : lr.note as any,
      factor: ex.factor ?? lr.factor as any ?? 1,
      entries:
      Array.isArray(ex.entries) && ex.entries.length ?
      ex.entries :
      Array.isArray(lr.entries) ?
      lr.entries :
      [],
      formula: safeTrim(ex.formula) ? ex.formula : lr.formula
    };

    map.set(k, merged);
  }

  return Array.from(map.values()).sort(byPosAsc);
}

/* ============================================================
   robust server fetch
   ============================================================ */

function mergeServerRowsByPos<
  T extends {
    pos: string;
    text?: string;
    unit?: string;
    soll?: any;
    ist?: any;
    ep?: any;
  }>(
a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  const norm = (p: any) => String(p ?? "").trim();

  const put = (r: any) => {
    const k = norm(r?.pos);
    if (!k) return;

    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        pos: k,
        text: String(r?.text ?? ""),
        unit: String(r?.unit ?? "m"),
        soll: Number(r?.soll ?? 0),
        ist: Number(r?.ist ?? 0),
        ep: Number(r?.ep ?? 0)
      } as any);
      return;
    }

    const next: any = { ...prev };
    next.ist = Math.max(Number(prev?.ist ?? 0), Number(r?.ist ?? 0));
    if (!safeTrim(next.text) && safeTrim(r?.text)) next.text = String(r.text);
    if (!safeTrim(next.unit) && safeTrim(r?.unit)) next.unit = String(r.unit);
    if (!Number(next.ep) && Number(r?.ep)) next.ep = Number(r.ep);
    if (!Number(next.soll) && Number(r?.soll)) next.soll = Number(r.soll);

    map.set(k, next);
  };

  (Array.isArray(a) ? a : []).forEach(put);
  (Array.isArray(b) ? b : []).forEach(put);

  return Array.from(map.values()) as T[];
}

async function fetchRowsForKey<T>(urlBase: string, key: string): Promise<T[]> {
  if (!safeTrim(key)) return [];

  // Aufmaßdaten dürfen niemals aus einem alten 304-/Browser-Cache kommen.
  // Nach dem Speichern müssen insbesondere die verschachtelten `entries`
  // sofort wieder vom Server gelesen werden.
  const separator = urlBase.includes("?") ? "&" : "?";
  const url = apiUrl(
    `${urlBase}/${encodeURIComponent(key)}${separator}_=${Date.now()}`
  );

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      ...getHistorieAuthHeaders()
    }
  });

  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray((data as any)?.rows) ? (data as any).rows as T[] : [];
}

/* ============================================================
   AutoKI
   ============================================================ */

type AutoKiBox = {
  id?: string;
  label?: string;
  score?: number;
  qty?: number;
  unit?: string;
};

type AutoKiPayload = {
  ok?: boolean;
  projectKey?: string;
  savedAt?: string | null;
  note?: string;
  scale?: string | number | null;
  sourceFile?: string | null;
  preview?: string | null;
  boxes?: AutoKiBox[];
};

function fromAutoKiBoxesToRows(
boxes: AutoKiBox[],
noteFallback = "AutoKI Import")
: LVRow[] {
  const arr = Array.isArray(boxes) ? boxes : [];
  return arr.map((b, idx) => {
    const pos = `AUTO.${String(idx + 1).padStart(3, "0")}`;
    const qty = Number(b?.qty ?? 0);
    const unit = String(b?.unit ?? "m");

    return {
      id: safeUUID(),
      pos,
      text: String(b?.label ?? "AutoKI Position"),
      unit,
      ep: 0,
      soll: 0,
      formula: "",
      ist: isFinite(qty) ? qty : 0,
      note: noteFallback,
      factor: 1
    };
  });
}

/* ============================================================
   Builders
   ============================================================ */

function normPosKey(pos: any): string {
  return String(pos ?? "").
  trim().
  replace(/\s+/g, "").
  replace(/,+/g, ".").
  replace(/\.+/g, ".").
  replace(/^\./, "").
  replace(/\.$/, "").
  split(".").
  map((part) => {
    const value = String(part || "").trim();
    if (!value) return "";

    if (/^\d+$/.test(value)) {
      return String(Number(value));
    }

    return value.toLowerCase();
  }).
  filter(Boolean).
  join(".");
}

function loadLvLangtextMap(projectCode?: string | null): Map<string, string> {
  const map = new Map<string, string>();

  try {
    const keys = Object.keys(localStorage).filter((k) =>
    projectCode ?
    k === `rlc_lv_data_v1:${projectCode}` :
    k.startsWith("rlc_lv_data_v1:")
    );

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ?
      parsed :
      Array.isArray(parsed?.rows) ?
      parsed.rows :
      Array.isArray(parsed?.items) ?
      parsed.items :
      Array.isArray(parsed?.positions) ?
      parsed.positions :
      [];
      if (!arr.length) continue;

      for (const x of arr) {
        const pos = normPosKey(x?.posNr ?? x?.pos ?? x?.position ?? x?.nr);
        const lang = extractLvLangtext(x);
        if (pos && lang) map.set(pos, lang);
      }
    }
  } catch {


    // ignore
  }return map;
}

function hydrateAufmassRowsWithLangtext(
rows: LVRow[],
projectCode?: string | null)
: LVRow[] {
  const langMap = loadLvLangtextMap(projectCode);
  if (!langMap.size) return rows;

  return (rows || []).map((r) => {
    const existing =
    safeTrim((r as any).langtext) || safeTrim((r as any).longText);
    if (existing) return r;

    const lang = langMap.get(normPosKey(r.pos));
    if (!lang) return r;

    return {
      ...r,
      langtext: lang,
      longText: lang
    } as any;
  });
}

function hydrateAufmassRowsFromLv(
rows: LVRow[],
lvRows: LvPosition[],
projectCode?: string | null)
: LVRow[] {
  const localMap = loadLvLangtextMap(projectCode);
  const exactMap = new Map<string, string>();
  const normalizedMap = new Map<string, string>();

  for (const lv of Array.isArray(lvRows) ? lvRows : []) {
    const lang = extractLvLangtext(lv);
    if (!lang) continue;

    const exact = safeTrim(lv.pos);
    if (exact) exactMap.set(exact, lang);

    const normalized = normPosKey(lv.pos);
    if (normalized) normalizedMap.set(normalized, lang);
  }

  return (rows || []).map((row) => {
    const existing =
    safeTrim((row as any).langtext) || safeTrim((row as any).longText);
    if (existing) return row;

    const lang =
    exactMap.get(safeTrim(row.pos)) ||
    normalizedMap.get(normPosKey(row.pos)) ||
    localMap.get(normPosKey(row.pos));

    if (!lang) return row;

    return {
      ...row,
      langtext: lang,
      longText: lang
    } as LVRow;
  });
}

function buildRowFromLv(lv: LvPosition): LVRow {
  const unit = String(lv.unit || "m");
  return {
    id: safeUUID(),
    pos: lv.pos,
    text: lv.text,
    unit,
    ep: lv.ep,
    soll: lv.quantity,
    formula: "",
    ist: 0,
    note: "",
    factor: 1,
    langtext: extractLvLangtext(lv),
    entries: []
  };
}

function buildFallbackRow(): LVRow {
  return {
    id: safeUUID(),
    pos: "001.001",
    text: "Neue Position",
    unit: "m",
    ep: 0,
    soll: 0,
    formula: getStandardFormel("m"),
    ist: 0,
    note: "",
    factor: 1
  };
}


function aufmassLvSignature(row: any): string {
  return [
  safeTrim(row?.text ?? row?.kurztext ?? row?.title ?? "").
  toLowerCase().
  replace(/\s+/g, " "),
  safeTrim(row?.unit ?? row?.einheit ?? row?.me ?? "").toLowerCase()].
  join("|");
}

function isIndependentAufmassRow(row: LVRow): boolean {
  const pos = safeTrim(row?.pos).toUpperCase();
  return /^(AUTO|CAD|FOTO|NACHTRAG|NT|REGIE)[.-]/.test(pos);
}

function reconcileAufmassRowsWithLv(
currentRows: LVRow[],
currentLvRows: LvPosition[])
: LVRow[] {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const lv = Array.isArray(currentLvRows) ? currentLvRows : [];
  if (!lv.length) return current;

  const used = new Set<number>();
  const exact = new Map<string, number[]>();
  const signatures = new Map<string, number[]>();

  current.forEach((row, index) => {
    const pos = safeTrim(row.pos);
    if (pos) {
      const list = exact.get(pos) || [];
      list.push(index);
      exact.set(pos, list);
    }

    const signature = aufmassLvSignature(row);
    if (signature !== "|") {
      const list = signatures.get(signature) || [];
      list.push(index);
      signatures.set(signature, list);
    }
  });

  const takeUnused = (indexes?: number[]): number | null => {
    for (const index of indexes || []) {
      if (!used.has(index)) {
        used.add(index);
        return index;
      }
    }
    return null;
  };

  const reconciled = lv.map((lvRow, lvIndex) => {
    let oldIndex = takeUnused(exact.get(safeTrim(lvRow.pos)));
    if (oldIndex === null) {
      oldIndex = takeUnused(signatures.get(aufmassLvSignature(lvRow)));
    }

    if (oldIndex === null) {
      const candidate = current[lvIndex];
      const candidatePos = safeTrim(candidate?.pos);
      if (
      candidate &&
      !used.has(lvIndex) && (
      /^\d{1,4}$/.test(candidatePos) || /^\d{1,3}\.\d{1,3}$/.test(candidatePos)))
      {
        used.add(lvIndex);
        oldIndex = lvIndex;
      }
    }

    const old = oldIndex === null ? null : current[oldIndex];
    const base = buildRowFromLv(lvRow);

    return {
      ...base,
      ...(old || {}),
      id: old?.id || base.id,
      pos: lvRow.pos,
      text: lvRow.text || old?.text || "",
      unit: lvRow.unit || old?.unit || "m",
      soll: Number(lvRow.quantity ?? old?.soll ?? 0),
      ep: Number(old?.ep || lvRow.ep || 0),
      langtext: extractLvLangtext(lvRow) || old?.langtext || "",
      entries: Array.isArray(old?.entries) ? old.entries : [],
      formula: old?.formula || "",
      ist: Number(old?.ist || 0),
      note: old?.note || "",
      factor: old?.factor ?? 1
    } as LVRow;
  });

  const extras = current.filter(
    (row, index) => !used.has(index) && isIndependentAufmassRow(row)
  );

  return [...reconciled, ...extras].sort(byPosAsc);
}

/* ============================================================
   Professional Mass Editor
   ============================================================ */

function parseMassEditorLines(input: string): number {
  const lines = String(input || "").
  split(/\r?\n/).
  map((x) => x.trim()).
  filter(Boolean);

  let sum = 0;

  for (const line of lines) {
    const clean = line.
    replace(/,/g, ".").
    replace(/[×xX]/g, "*").
    replace(/;/g, " ").
    replace(/[^\d+\-*/().\s]/g, " ").
    replace(/\s+/g, " ").
    trim();

    if (!clean) continue;

    try {
      // eslint-disable-next-line no-new-func
      const f = new Function(`return (${clean});`);
      const v = Number(f());
      if (isFinite(v)) sum += v;
    } catch {


      // ignore invalid line
    }}
  return isFinite(sum) ? sum : 0;
}

function formulaToMassText(formula: string): string {
  const f = safeTrim(formula);
  if (!f) return "";
  if (f.startsWith("AUFMASS:")) return f.replace(/^AUFMASS:/, "").trim();
  if (f.startsWith("=")) return f.slice(1).trim();
  return f;
}

function massTextToFormula(text: string): string {
  const t = String(text || "").trim();
  if (!t) return "";
  return `AUFMASS:${t}`;
}

function extractLvLangtext(src: any): string {
  const candidates = [
  src?.langtext,
  src?.langText,
  src?.longText,
  src?.longtext,
  src?.long_text,
  src?.beschreibung,
  src?.beschreibungLang,
  src?.description,
  src?.longDescription,
  src?.textLang,
  src?.leistungsbeschreibung,
  src?.leistungstext,
  src?.lvLangtext,
  src?.gaebLangtext,
  src?.raw?.langtext,
  src?.raw?.langText,
  src?.raw?.longText,
  src?.raw?.beschreibung,
  src?.details?.langtext,
  src?.details?.longText,
  src?.gaeb?.langtext,
  src?.gaeb?.longText];


  const shortText = safeTrim(
    src?.text ??
    src?.kurztext ??
    src?.title ??
    src?.shortText ??
    src?.kurzText ??
    ""
  );

  for (const c of candidates) {
    const v = safeTrim(c);
    if (!v) continue;
    if (v === shortText) continue;
    return v;
  }

  return "";
}

function makeAufmassEntry(
formulaText: string,
idx: number,
note = "",
factor = 1,
unit = "",
ep = 0)
: AufmassEntry {
  const clean = String(formulaText || "").trim();
  const f = nrmNumber(factor, 1) || 1;
  const ansatzMenge = parseMassEditorLines(clean);

  return {
    id: safeUUID(),
    label: `Aufmaß ${idx}`,
    formula: clean,
    menge: ansatzMenge * f,
    note,
    factor: f,
    unit,
    ep,
    createdAt: new Date().toISOString(),
    kreis: 1,
    blatt: 1,
    nr: idx,
    reb: `000${String(idx).padStart(2, "0")}`,
    messzahl: 91
  };
}

function entriesSum(entries?: AufmassEntry[]) {
  return (Array.isArray(entries) ? entries : []).reduce(
    (s, e) => s + nrmNumber(e?.menge),
    0
  );
}

function entriesToFormula(entries?: AufmassEntry[]) {
  const arr = Array.isArray(entries) ? entries : [];
  if (!arr.length) return "";
  return `AUFMASS:${arr.
  map((e) => e.formula).
  filter(Boolean).
  join("\\n")}`;
}

/* ============================================================
   Component
   ============================================================ */

type InitSource =
"none" |
"angebot" |
"server" |
"server-legacy" |
"server+legacy" |
"auto-ki" |
"local" |
"lv" |
"fallback";

function RlcSaveIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4v6h8V4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 17h8" stroke="currentColor" strokeWidth="2" />
    </svg>);

}

function RlcSettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path
        d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"
        stroke="currentColor"
        strokeWidth="2" />
      
      <path
        d="M19 12a7.2 7.2 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.2 7.2 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"
        stroke="currentColor"
        strokeWidth="2" />
      
    </svg>);

}

function RlcLvIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path d="M7 3h8l4 4v14H7V3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 13h6M9 17h6" stroke="currentColor" strokeWidth="2" />
    </svg>);

}

function RlcDocumentIcon() {
  return <RlcLvIcon />;
}

function RlcPlusMinusIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path
        d="M6 7h8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round" />
      
      <path
        d="M10 3v8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round" />
      
      <path
        d="M6 17h8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round" />
      
      <path
        d="M17 6h4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round" />
      
      <path
        d="M17 17h4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round" />
      
    </svg>);

}
function RlcMeasureIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path
        d="M4 17 17 4l3 3L7 20H4v-3Z"
        stroke="currentColor"
        strokeWidth="2" />
      
      <path d="M13 8l3 3" stroke="currentColor" strokeWidth="2" />
    </svg>);

}

function RlcDiffIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" />
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" />
    </svg>);

}

function RlcCheckIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      
      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" />
    </svg>);

}

function showRlcMessage(message: unknown) {
  const text = String(message ?? "");
  const old = document.getElementById("rlc-message-window");
  if (old) old.remove();

  const escapeHtml = (value: string) =>
  value.
  replace(/&/g, "&amp;").
  replace(/</g, "&lt;").
  replace(/>/g, "&gt;").
  replace(/"/g, "&quot;").
  replace(/'/g, "&#039;").
  replace(/\n/g, "<br />");

  const isError = /fehler|error|kein projekt|konnte nicht|nicht gefunden/i.test(
    text
  );

  const title = isError ? "RLC Hinweis / Fehler" : "RLC Meldung";
  const icon = isError ? "!" : "✓";
  const colorA = isError ? "#EF4444" : "#146EF5";
  const colorB = isError ? "#B91C1C" : "#0B5BD3";

  const overlay = document.createElement("div");
  overlay.id = "rlc-message-window";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "99999";
  overlay.style.background = "rgba(15,23,42,0.38)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "24px";

  const box = document.createElement("div");
  box.style.width = "min(520px, calc(100vw - 40px))";
  box.style.background = "#ffffff";
  box.style.borderRadius = "20px";
  box.style.boxShadow = "0 28px 80px rgba(15,23,42,0.30)";
  box.style.border = "1px solid rgba(148,163,184,0.45)";
  box.style.padding = "24px";
  box.style.fontFamily = "inherit";

  box.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:14px;">
      <div style="
        width:46px;height:46px;border-radius:15px;
        display:flex;align-items:center;justify-content:center;
        background:linear-gradient(135deg,${colorA},${colorB});
        color:white;font-size:24px;font-weight:900;
        flex:0 0 auto;
      ">${icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:20px;font-weight:900;color:#0F172A;margin-bottom:8px;">
          ${title}
        </div>
        <div style="font-size:14px;line-height:1.55;color:#475569;word-break:break-word;">
          ${escapeHtml(text)}
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:24px;">
      <button id="rlc-message-window-ok" style="
        border:0;border-radius:13px;padding:10px 20px;
        background:#146EF5;color:white;font-weight:900;
        cursor:pointer;font-size:14px;
      ">OK</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.
  getElementById("rlc-message-window-ok")?.
  addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function escClose(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escClose);
    }
  });
}
function getHistorieAuthHeaders(): Record<string, string> {
  const keys = [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc.auth.token",
  "rlc_mobile_token",
  "rlc_auth_token",
  "rlc_access_token"];


  for (const key of keys) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  try {
    const raw =
    localStorage.getItem("auth") ||
    localStorage.getItem("rlc_auth") ||
    localStorage.getItem("user");

    if (raw) {
      const parsed = JSON.parse(raw);
      const token =
      parsed?.token ||
      parsed?.accessToken ||
      parsed?.authToken ||
      parsed?.data?.token ||
      parsed?.data?.accessToken;

      if (typeof token === "string" && token.trim()) {
        return { Authorization: `Bearer ${token.trim()}` };
      }
    }
  } catch {


    // Keine gespeicherten Auth-Daten.
  }return {};
}
async function companyLogoBlobToPng(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, image.naturalWidth || image.width);
        canvas.height = Math.max(1, image.naturalHeight || image.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas nicht verfügbar");

        ctx.drawImage(image, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");

        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Firmenlogo konnte nicht verarbeitet werden"));
    };

    image.src = objectUrl;
  });
}

function drawCompanyPdfHeader(
pdf: jsPDF,
company: CompanyPdfHeader | null)
{
  if (!company) return;

  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setTextColor(255, 255, 255);

  let textRight = pageWidth - 14;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text(company.name || "", textRight, 7.5, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.8);

  const lines = [
  company.address,
  [company.phone, company.email].filter(Boolean).join(" · ")].
  filter(Boolean);

  lines.forEach((line, index) => {
    pdf.text(line, textRight, 12 + index * 4, { align: "right" });
  });
}
export default function AufmassEditor() {
  const navigate = useNavigate();
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const [stickyCode, setStickyCode] = React.useState<string>(() =>
  safeTrim(getLastCode() || "")
  );
  const [stickyId, setStickyId] = React.useState<string>(() =>
  safeTrim(getLastId() || "")
  );

  React.useEffect(() => {
    const c = safeTrim(project?.code || "");
    const id = safeTrim(project?.id || "");
    if (c) {
      setStickyCode(c);
      setLastCode(c);
    }
    if (id) {
      setStickyId(id);
      setLastId(id);
    }
  }, [project?.id, project?.code]);

  const angebotSnapshot = React.useMemo(
    () => loadOfferSnapshot(project, stickyCode, stickyId),
    [project, stickyCode, stickyId]
  );

  const projectFsKey = safeTrim(project?.code || stickyCode || "");
  const projectId = safeTrim(project?.id || stickyId) || null;

  const serverProjectKey = safeTrim(
    project?.code || stickyCode || project?.id || stickyId || ""
  );

  const lvProjectUuid = safeTrim(project?.id || stickyId || "");
  const lvProjectCode = safeTrim(project?.code || stickyCode || "");
  const lvProjectId = isUuid(lvProjectUuid) ? lvProjectUuid : null;
  const lvLegacyKey = lvProjectCode || lvProjectUuid || null;

  const [lvRows, setLvRows] = React.useState<LvPosition[]>([]);
  const [lvLoading, setLvLoading] = React.useState(false);
  const [lvError, setLvError] = React.useState<string | null>(null);

  const [rows, setRows] = React.useState<LVRow[]>([]);
  const [selId, setSelId] = React.useState<string | null>(null);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editBuffer, setEditBuffer] = React.useState("");
  const [massLabelBuffer, setMassLabelBuffer] = React.useState("");
  const [massNoteBuffer, setMassNoteBuffer] = React.useState("");
  const [massFactorBuffer, setMassFactorBuffer] = React.useState("1");
  const [massKreisBuffer, setMassKreisBuffer] = React.useState("1");
  const [massBlattBuffer, setMassBlattBuffer] = React.useState("1");
  const [massOrtBuffer, setMassOrtBuffer] = React.useState("");
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [expandedRowIds, setExpandedRowIds] = React.useState<Set<string>>(new Set());
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteBuffer, setNoteBuffer] = React.useState("");
  const [massOpen, setMassOpen] = React.useState(false);
  const [massBuffer, setMassBuffer] = React.useState("");

  const [loadBusy, setLoadBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [companyPdfHeader, setCompanyPdfHeader] =
  React.useState<CompanyPdfHeader | null>(null);

  const [lvFilter, setLvFilter] = React.useState("");
  const [rowFilter, setRowFilter] = React.useState("");
  const [onlyDiff, setOnlyDiff] = React.useState(false);

  const [activeOrtId, setActiveOrtId] = React.useState<string | null>(null);
  const [orte, setOrte] = React.useState<Ort[]>([]);
  const [ortPositions, setOrtPositions] = React.useState<OrtPosition[]>([]);
  const [checkedRowIds, setCheckedRowIds] = React.useState<Set<string>>(
    new Set()
  );
  const [newOrtNummer, setNewOrtNummer] = React.useState("");
  const [newOrtName, setNewOrtName] = React.useState("");
  const [newOrtParentId, setNewOrtParentId] = React.useState<string>("");
  const [positionOrtId, setPositionOrtId] = React.useState<string>("");

  const didInitRef = React.useRef(false);
  const initSourceRef = React.useRef<InitSource>("none");
  const fotoImportedRef = React.useRef(false);
  const cadImportedRef = React.useRef(false);
  const gpsImportedRef = React.useRef(false);

  const saveTimerRef = React.useRef<number | null>(null);
  const serverSaveTimerRef = React.useRef<number | null>(null);
  const rowsRef = React.useRef<LVRow[]>([]);
  const serverSaveGenerationRef = React.useRef(0);
  const orteLoadedRef = React.useRef(false);
  const orteSaveTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const loadCompanyPdfHeader = async () => {
      try {
        const headerResponse = await fetch(apiUrl("/api/company/header"), {
          method: "GET",
          credentials: "include",
          headers: {
            ...getHistorieAuthHeaders()
          }
        });

        const headerText = await headerResponse.text().catch(() => "");

        if (!headerResponse.ok) {
          throw new Error(
            headerText || `Firmendaten HTTP ${headerResponse.status}`
          );
        }

        const headerData = headerText ? JSON.parse(headerText) : {};
        const company = headerData?.company;

        if (!company) {
          throw new Error("Keine Firmendaten gefunden");
        }

        let logoDataUrl: string | null = null;

        if (company.logoPath || company.logoUrl) {
          const logoResponse = await fetch(apiUrl("/api/company/logo"), {
            method: "GET",
            credentials: "include",
            headers: {
              ...getHistorieAuthHeaders()
            }
          });

          if (logoResponse.ok) {
            const logoBlob = await logoResponse.blob();
            logoDataUrl = await companyLogoBlobToPng(logoBlob).catch(
              () => null
            );
          }
        }

        if (cancelled) return;

        setCompanyPdfHeader({
          name: String(company.name || ""),
          address: String(company.address || ""),
          phone: String(company.phone || ""),
          email: String(company.email || ""),
          code: String(company.code || ""),
          logoDataUrl
        });
      } catch (error) {
        console.error(
          "Firmendaten für PDF konnten nicht geladen werden",
          error
        );

        if (!cancelled) {
          setCompanyPdfHeader(null);
        }
      }
    };

    void loadCompanyPdfHeader();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const selected = rows.find((r) => r.id === selId) || null;

  const selectedIndex = React.useMemo(
    () => rows.findIndex((row) => row.id === selId),
    [rows, selId]
  );

  const selectPreviousPosition = React.useCallback(() => {
    if (!rows.length) return;
    const nextIndex = selectedIndex > 0 ? selectedIndex - 1 : rows.length - 1;
    setSelId(rows[nextIndex]?.id ?? null);
  }, [rows, selectedIndex]);

  const selectNextPosition = React.useCallback(() => {
    if (!rows.length) return;
    const nextIndex =
    selectedIndex >= 0 && selectedIndex < rows.length - 1 ?
    selectedIndex + 1 :
    0;
    setSelId(rows[nextIndex]?.id ?? null);
  }, [rows, selectedIndex]);

  const lastSavedLabel = React.useMemo(() => {
    if (!lastSavedAt) return "Noch nicht gespeichert";
    try {
      return new Date(lastSavedAt).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "Gespeichert";
    }
  }, [lastSavedAt]);

  const showComingSoon = React.useCallback((name: string) => {
    showRlcMessage(`${name} wird als nächster Abrechnungs-Workflow verbunden.`);
  }, []);

  const setRow = React.useCallback((id: string, patch: Partial<LVRow>) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  React.useEffect(() => {
    if (!projectId) return;

    didInitRef.current = false;
    initSourceRef.current = "none";
    fotoImportedRef.current = false;
    cadImportedRef.current = false;
    gpsImportedRef.current = false;

    setRows([]);
    setSelId(AUFMASS.loadSel(projectId));

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId) return;
    AUFMASS.saveSel(projectId, selId);
  }, [projectId, selId]);

  React.useEffect(() => {
    orteLoadedRef.current = false;
    if (orteSaveTimerRef.current) {
      window.clearTimeout(orteSaveTimerRef.current);
      orteSaveTimerRef.current = null;
    }

    if (!serverProjectKey) {
      setOrte([]);
      setOrtPositions([]);
      setActiveOrtId(null);
      setCheckedRowIds(new Set());
      return;
    }

    let cancelled = false;

    const loadOrte = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/aufmass/orte/${encodeURIComponent(serverProjectKey)}`),
          {
            credentials: "include",
            cache: "no-store",
            headers: { ...getHistorieAuthHeaders() }
          }
        );
        const txt = await res.text().catch(() => "");
        if (!res.ok) throw new Error(txt || `Orte HTTP ${res.status}`);

        const data = txt ? JSON.parse(txt) : {};
        if (cancelled) return;

        setOrte(Array.isArray(data?.orte) ? data.orte : []);
        setOrtPositions(Array.isArray(data?.links) ? data.links : []);
        setActiveOrtId(null);
        setCheckedRowIds(new Set());
        orteLoadedRef.current = true;
      } catch (error) {
        console.error("Orte konnten nicht vom Server geladen werden", error);
        if (cancelled) return;
        setOrte([]);
        setOrtPositions([]);
        orteLoadedRef.current = true;
      }
    };

    void loadOrte();
    return () => {
      cancelled = true;
    };
  }, [serverProjectKey]);

  React.useEffect(() => {
    if (!serverProjectKey || !orteLoadedRef.current) return;

    if (orteSaveTimerRef.current) {
      window.clearTimeout(orteSaveTimerRef.current);
    }

    orteSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/aufmass/orte/${encodeURIComponent(serverProjectKey)}`),
          {
            method: "PUT",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...getHistorieAuthHeaders()
            },
            body: JSON.stringify({ orte, links: ortPositions })
          }
        );
        const txt = await res.text().catch(() => "");
        if (!res.ok) throw new Error(txt || `Orte HTTP ${res.status}`);
      } catch (error) {
        console.error("Orte konnten nicht auf dem Server gespeichert werden", error);
      } finally {
        orteSaveTimerRef.current = null;
      }
    }, 350);

    return () => {
      if (orteSaveTimerRef.current) {
        window.clearTimeout(orteSaveTimerRef.current);
        orteSaveTimerRef.current = null;
      }
    };
  }, [serverProjectKey, orte, ortPositions]);

  React.useEffect(() => {
    if (!projectId) return;
    if (!didInitRef.current) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(() => {
      AUFMASS.save(projectId, rows);
      setLastSavedAt(new Date().toISOString());
      saveTimerRef.current = null;
    }, 250);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [rows, projectId]);

  React.useEffect(() => {
    if (!projectId) return;
    const onUnload = () => {
      try {
        AUFMASS.save(projectId, rows);
      } catch {


        // ignore
      }};window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [projectId, rows]);

  const serverLoadAufmass = React.useCallback(async (): Promise<
    AufmassJsonRow[]> =>
  {
    if (!serverProjectKey) return [];

    return fetchRowsForKey<AufmassJsonRow>(
      "/api/aufmass/aufmass",
      serverProjectKey
    );
  }, [serverProjectKey]);

  const serverSaveAufmass = React.useCallback(
    async (payloadRows: AufmassJsonRow[]): Promise<void> => {
      if (!serverProjectKey) {
        throw new Error("Kein Projekt gewählt");
      }

      const res = await fetch(
        apiUrl(`/api/aufmass/aufmass/${encodeURIComponent(serverProjectKey)}`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getHistorieAuthHeaders()
          },
          body: JSON.stringify({ rows: payloadRows })
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Server-Fehler (${res.status})`);
      }
    },
    [serverProjectKey]
  );

  const serverLoadSollIst = React.useCallback(async (): Promise<
    SollIstRow[]> =>
  {
    if (!serverProjectKey) return [];

    return fetchRowsForKey<SollIstRow>(
      "/api/aufmass/soll-ist",
      serverProjectKey
    );
  }, [serverProjectKey]);

  const serverSaveSollIst = React.useCallback(
    async (payloadRows: SollIstRow[]): Promise<void> => {
      if (!serverProjectKey) {
        throw new Error("Kein Projekt gewählt");
      }

      const res = await fetch(
        apiUrl(`/api/aufmass/soll-ist/${encodeURIComponent(serverProjectKey)}`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getHistorieAuthHeaders()
          },
          body: JSON.stringify({ rows: payloadRows })
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Soll/Ist Server-Fehler (${res.status})`);
      }
    },
    [serverProjectKey]
  );

  const serverSaveOrte = React.useCallback(
    async (payloadOrte: Ort[], payloadLinks: OrtPosition[]): Promise<void> => {
      if (!serverProjectKey) {
        throw new Error("Kein Projekt gewählt");
      }

      const res = await fetch(
        apiUrl(`/api/aufmass/orte/${encodeURIComponent(serverProjectKey)}`),
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getHistorieAuthHeaders()
          },
          body: JSON.stringify({ orte: payloadOrte, links: payloadLinks })
        }
      );

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(text || `Orte Server-Fehler (${res.status})`);
      }
    },
    [serverProjectKey]
  );

  React.useEffect(() => {
    if (!didInitRef.current || !serverProjectKey) return;

    if (serverSaveTimerRef.current) {
      window.clearTimeout(serverSaveTimerRef.current);
    }

    const generation = ++serverSaveGenerationRef.current;
    const localSnapshot = projectId ? AUFMASS.load(projectId) : [];
    const snapshot = mergeByPos(rows, localSnapshot);

    // Sincronizza subito il fallback locale con lo snapshot più ricco.
    if (projectId) AUFMASS.save(projectId, snapshot);

    serverSaveTimerRef.current = window.setTimeout(async () => {
      try {
        if (generation !== serverSaveGenerationRef.current) return;
        await Promise.all([
        serverSaveAufmass(toAufmassJson(snapshot)),
        serverSaveSollIst(toSollIst(snapshot))]
        );
        if (generation === serverSaveGenerationRef.current) {
          setLastSavedAt(new Date().toISOString());
        }
      } catch (error) {
        console.error("[AUFMASS] Automatische Server-Speicherung fehlgeschlagen", error);
      } finally {
        if (generation === serverSaveGenerationRef.current) {
          serverSaveTimerRef.current = null;
        }
      }
    }, 400);

    return () => {
      if (serverSaveTimerRef.current) {
        window.clearTimeout(serverSaveTimerRef.current);
        serverSaveTimerRef.current = null;
      }
    };
  }, [rows, projectId, serverProjectKey, serverSaveAufmass, serverSaveSollIst]);

  const serverLoadAutoKi =
  React.useCallback(async (): Promise<AutoKiPayload | null> => {
    if (!serverProjectKey) return null;

    const res = await fetch(
      apiUrl(`/api/auto-ki/${encodeURIComponent(serverProjectKey)}`),
      {
        credentials: "include",
        headers: {
          ...getHistorieAuthHeaders()
        }
      }
    );

    if (!res.ok) return null;
    return res.json().catch(() => null);
  }, [serverProjectKey]);

  const fetchJson = React.useCallback(async (url: string) => {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      headers: { ...getHistorieAuthHeaders() }
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok) throw new Error(txt || `HTTP ${res.status} (${url})`);
    try {
      return txt ? JSON.parse(txt) : {};
    } catch {
      return {};
    }
  }, []);

  const mapAnyToLvPositions = React.useCallback((list: any[]): LvPosition[] => {
    const arr = Array.isArray(list) ? list : [];
    return arr.map((x: any, idx: number) => ({
      id: String(x.id ?? x.lvPosId ?? x.posId ?? idx),
      pos: String(
        x.pos ??
        x.position ??
        x.posNr ??
        x.nr ??
        x.positionsnummer ??
        x.positionsNummer ??
        ""
      ),
      text: String(
        x.text ??
        x.kurztext ??
        x.kurzText ??
        x.title ??
        x.shortText ??
        "ohne Text"
      ),
      unit: String(x.unit ?? x.einheit ?? x.me ?? "m"),
      quantity: Number(x.soll ?? x.menge ?? x.quantity ?? x.qty ?? 0),
      ep: Number(x.ep ?? x.einheitspreis ?? x.price ?? x.unitPrice ?? 0),
      langtext: extractLvLangtext(x),
      longText: extractLvLangtext(x),
      description: extractLvLangtext(x)
    }));
  }, []);

  const loadKalkulationPriceRows = React.useCallback(async (): Promise<any[]> => {
    if (!serverProjectKey) return [];

    const res = await fetch(
      apiUrl(
        `/api/kalkulation/${encodeURIComponent(serverProjectKey)}/ki?_=${Date.now()}`
      ),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { ...getHistorieAuthHeaders() }
      }
    );

    if (!res.ok) return [];

    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data?.rows)) return data.data.rows;
    return [];
  }, [serverProjectKey]);

  const mergeLvWithKalkulationPrices = React.useCallback(
    (positions: LvPosition[], kalkulationRows: any[]): LvPosition[] => {
      if (!Array.isArray(positions) || !positions.length) return [];
      if (!Array.isArray(kalkulationRows) || !kalkulationRows.length) {
        return positions;
      }

      const normalizeText = (value: unknown) =>
      safeTrim(value).toLowerCase().replace(/\s+/g, " ");

      const normalizeUnit = (value: unknown) =>
      safeTrim(value).toLowerCase();

      const priceOf = (row: any): number => {
        const candidates = [
        row?.rlcKiUnitPrice,
        row?.finalUnitPrice,
        row?.unitPrice,
        row?.rlcEp,
        row?.suggestedUnitPrice,
        row?.preis,
        row?.ep];


        for (const candidate of candidates) {
          const value = Number(candidate);
          if (Number.isFinite(value) && value > 0) return value;
        }
        return 0;
      };

      const byPosition = new Map<string, any[]>();
      const bySignature = new Map<string, any[]>();

      kalkulationRows.forEach((row: any) => {
        const pos = safeTrim(
          row?.posNr ?? row?.pos ?? row?.position ?? row?.positionsnummer
        );
        if (pos) {
          const list = byPosition.get(pos) || [];
          list.push(row);
          byPosition.set(pos, list);
        }

        const signature = `${normalizeText(
          row?.kurztext ?? row?.text ?? row?.title
        )}|${normalizeUnit(row?.einheit ?? row?.unit ?? row?.me)}`;

        if (signature !== "|") {
          const list = bySignature.get(signature) || [];
          list.push(row);
          bySignature.set(signature, list);
        }
      });

      const used = new Set<any>();
      const takeFirstUnused = (rows?: any[]) =>
      (rows || []).find((row) => !used.has(row));

      return positions.map((position, index) => {
        let match = takeFirstUnused(byPosition.get(safeTrim(position.pos)));

        if (!match) {
          const signature = `${normalizeText(position.text)}|${normalizeUnit(
            position.unit
          )}`;
          match = takeFirstUnused(bySignature.get(signature));
        }

        if (!match && kalkulationRows.length === positions.length) {
          const candidate = kalkulationRows[index];
          if (candidate && !used.has(candidate)) match = candidate;
        }

        if (!match) return position;
        used.add(match);

        const kalkulationPrice = priceOf(match);
        if (!(kalkulationPrice > 0)) return position;

        return {
          ...position,
          ep: kalkulationPrice
        };
      });
    },
    []
  );

  const extractLvListFromNewEndpoint = React.useCallback((data: any): any[] => {
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.positions)) return data.positions;
    if (Array.isArray(data?.lv)) return data.lv;
    if (Array.isArray(data)) return data;

    const latest = Array.isArray(data?.rows) ? data.rows[0] : null;
    if (Array.isArray(latest?.positions)) return latest.positions;

    return [];
  }, []);

  const extractLvListFromOldEndpoint = React.useCallback((data: any): any[] => {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.lv)) return data.lv;
    if (Array.isArray(data)) return data;
    return [];
  }, []);

  const loadLvPagedNew = React.useCallback(
    async (pid: string) => {
      const pageSize = 500;
      const maxPages = 50;
      const all: any[] = [];

      for (let page = 1; page <= maxPages; page++) {
        const data = await fetchJson(
          apiUrl(
            `/api/projects/${encodeURIComponent(pid)}/lv?page=${page}&pageSize=${pageSize}`
          )
        );
        const list = extractLvListFromNewEndpoint(data);

        if (Array.isArray(list) && list.length) {
          all.push(...list);
          if (list.length < pageSize) break;
        } else {
          break;
        }
      }

      return all;
    },
    [fetchJson, extractLvListFromNewEndpoint]
  );

  React.useEffect(() => {
    if (!lvProjectId && !lvLegacyKey) {
      setLvRows([]);
      return;
    }

    let cancelled = false;

    const loadLv = async () => {
      setLvLoading(true);
      setLvError(null);

      try {
        if (lvProjectId) {
          try {
            const listAll = await loadLvPagedNew(lvProjectId);
            const mapped = mapAnyToLvPositions(listAll);
            const kalkulationRows = await loadKalkulationPriceRows().catch(
              () => []
            );
            const merged = mergeLvWithKalkulationPrices(
              mapped,
              kalkulationRows
            );
            if (!cancelled) setLvRows(merged);
            return;
          } catch (eNew: any) {
            console.warn(
              "[LV] new endpoint failed, trying legacy:",
              eNew?.message || eNew
            );
          }
        }

        if (!lvLegacyKey) {
          throw new Error(
            "Projekt nicht gefunden (keine project key vorhanden)"
          );
        }

        const dataLegacy = await fetchJson(
          apiUrl(`/api/project-lv/${encodeURIComponent(lvLegacyKey)}`)
        );
        const listLegacy = extractLvListFromOldEndpoint(dataLegacy);
        const mappedLegacy = mapAnyToLvPositions(listLegacy);
        const kalkulationRows = await loadKalkulationPriceRows().catch(
          () => []
        );
        const mergedLegacy = mergeLvWithKalkulationPrices(
          mappedLegacy,
          kalkulationRows
        );

        if (!cancelled) setLvRows(mergedLegacy);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setLvError(e?.message || "Fehler beim Laden des LV");
          setLvRows([]);
        }
      } finally {
        if (!cancelled) setLvLoading(false);
      }
    };

    loadLv();
    return () => {
      cancelled = true;
    };
  }, [
  lvProjectId,
  lvLegacyKey,
  fetchJson,
  mapAnyToLvPositions,
  extractLvListFromOldEndpoint,
  loadLvPagedNew,
  loadKalkulationPriceRows,
  mergeLvWithKalkulationPrices]
  );

  React.useEffect(() => {
    if (!lvRows.length) return;

    setRows((prev) => {
      if (!prev.length) return prev;

      const next = reconcileAufmassRowsWithLv(prev, lvRows);
      const same =
      next.length === prev.length &&
      next.every(
        (row, index) =>
        row.id === prev[index]?.id &&
        row.pos === prev[index]?.pos &&
        row.text === prev[index]?.text &&
        row.unit === prev[index]?.unit &&
        row.soll === prev[index]?.soll &&
        row.ep === prev[index]?.ep &&
        safeTrim(row.langtext) === safeTrim(prev[index]?.langtext)
      );

      if (same) return prev;

      if (projectId) AUFMASS.save(projectId, next);

      // Persist the canonical GAEB OZ to the server as well.
      // This prevents a later reload/export from restoring 001/002/... .
      void Promise.all([
      serverSaveAufmass(toAufmassJson(next)),
      serverSaveSollIst(toSollIst(next))]
      ).catch((error) => {
        console.error("[AUFMASS] LV-OZ server sync failed", error);
      });

      setSelId((current) =>
      current && next.some((row) => row.id === current) ?
      current :
      next[0]?.id ?? null
      );
      return next;
    });
  }, [lvRows, projectId, serverSaveAufmass, serverSaveSollIst]);

  const isPristineFallback = React.useCallback((arr: LVRow[]) => {
    if (!Array.isArray(arr) || arr.length !== 1) return false;
    const r = arr[0];
    return (
      safeTrim(r.pos) === "001.001" &&
      safeTrim(r.text) === "Neue Position" &&
      nrmNumber(r.ep) === 0 &&
      nrmNumber(r.soll) === 0 &&
      safeTrim(r.formula) === getStandardFormel("m") &&
      nrmNumber(r.ist) === 0);

  }, []);

  React.useEffect(() => {
    if (didInitRef.current) return;
    if (!projectId && !projectFsKey) return;

    let cancelled = false;

    const init = async () => {
      // Server sempre prima di Angebot/localStorage: evita di sovrascrivere
      // Aufmaßzeilen già persistite quando si rientra nella pagina.
      if (projectFsKey || projectId) {
        try {
          const srv = await serverLoadAufmass();
          const srvLegacy = await serverLoadSollIst().catch(() => []);

          if (!cancelled && (srv.length || srvLegacy.length)) {
            const primary = srv.length ? fromAufmassJson(srv) : [];
            const legacy = srvLegacy.length ? fromSollIst(srvLegacy) : [];
            const localRows = projectId ? AUFMASS.load(projectId) : [];

            // Beim Wiedereintritt niemals einen reicheren lokalen Datensatz
            // (entries/Formel/Ist) durch eine unvollständige Serverantwort
            // oder Soll-Ist-Zeile ohne Teilaufmaße ersetzen.
            const serverPlusLocal = mergeByPos(primary, localRows);
            const merged = hydrateAufmassRowsFromLv(
              mergeByPos(serverPlusLocal, legacy),
              lvRows,
              lvProjectCode
            );

            setRows(merged);

            if (projectId) {
              const storedSel = AUFMASS.loadSel(projectId);
              const nextSel =
              storedSel && merged.some((x) => x.id === storedSel) ?
              storedSel :
              merged[0]?.id ?? null;

              setSelId(nextSel);
              AUFMASS.save(projectId, merged);
            } else {
              setSelId(merged[0]?.id ?? null);
            }

            didInitRef.current = true;
            initSourceRef.current =
            srv.length && srvLegacy.length ?
            "server+legacy" :
            srv.length ?
            "server" :
            "server-legacy";
            return;
          }
        } catch {


          // ignore
        }try {
          const srvLegacy = await serverLoadSollIst();
          if (!cancelled && srvLegacy.length) {
            const mapped = hydrateAufmassRowsFromLv(
              fromSollIst(srvLegacy),
              lvRows,
              lvProjectCode
            );

            setRows(mapped);

            if (projectId) {
              const storedSel = AUFMASS.loadSel(projectId);
              const nextSel =
              storedSel && mapped.some((x) => x.id === storedSel) ?
              storedSel :
              mapped[0]?.id ?? null;

              setSelId(nextSel);
              AUFMASS.save(projectId, mapped);
            } else {
              setSelId(mapped[0]?.id ?? null);
            }

            didInitRef.current = true;
            initSourceRef.current = "server-legacy";
            return;
          }
        } catch {


          // ignore
        }}
      // Angebot nur als Fallback verwenden, wenn Aufmaß und Soll/Ist
      // auf dem Server wirklich leer sind.
      if (projectId) {
        const angebotRows = angebotRowsToAufmassRows(
          angebotSnapshot?.rows || []
        );

        if (!cancelled && angebotRows.length) {
          setRows(angebotRows);
          setSelId(angebotRows[0]?.id ?? null);
          AUFMASS.save(projectId, angebotRows);
          didInitRef.current = true;
          initSourceRef.current = "angebot";
          return;
        }
      }

      if ((projectFsKey || projectId) && projectId) {
        try {
          const auto = await serverLoadAutoKi();
          const boxes = Array.isArray(auto?.boxes) ? auto.boxes : [];

          if (!cancelled && boxes.length) {
            const note = safeTrim(auto?.note) || "AutoKI Import";
            const autoRows = fromAutoKiBoxesToRows(boxes, note);

            setRows(autoRows);
            setSelId(autoRows[0]?.id ?? null);
            AUFMASS.save(projectId, autoRows);

            didInitRef.current = true;
            initSourceRef.current = "auto-ki";
            return;
          }
        } catch {


          // ignore
        }}

      // Server-first: lokaler Projektstand ist nur noch Fallback, wenn
      // Aufmaß, Soll/Ist, Angebot und AutoKI auf dem Server leer sind.
      if (projectId) {
        const stored = AUFMASS.load(projectId);
        if (!cancelled && stored.length) {
          const storedSel = AUFMASS.loadSel(projectId);
          const hydrated = hydrateAufmassRowsFromLv(
            stored,
            lvRows,
            lvProjectCode
          );
          setRows(hydrated);
          setSelId(
            storedSel && hydrated.some((x) => x.id === storedSel) ?
            storedSel :
            hydrated[0]?.id ?? null
          );
          didInitRef.current = true;
          initSourceRef.current = "local";
          return;
        }
      }

      if (!cancelled && lvRows.length && projectId) {
        const mapped = lvRows.map(buildRowFromLv);
        setRows(mapped);
        setSelId(mapped[0]?.id ?? null);
        AUFMASS.save(projectId, mapped);
        didInitRef.current = true;
        initSourceRef.current = "lv";
        return;
      }

      if (!cancelled && projectId) {
        const fallback = [buildFallbackRow()];
        setRows(fallback);
        setSelId(fallback[0].id);
        AUFMASS.save(projectId, fallback);
        didInitRef.current = true;
        initSourceRef.current = "fallback";
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [
  projectFsKey,
  projectId,
  lvRows,
  serverLoadAufmass,
  serverLoadSollIst,
  serverLoadAutoKi,
  angebotSnapshot]
  );

  React.useEffect(() => {
    if (!didInitRef.current) return;
    if (initSourceRef.current !== "fallback") return;
    if (!projectId) return;
    if (!lvRows.length) return;

    setRows((prev) => {
      if (!isPristineFallback(prev)) return prev;

      const mapped = lvRows.map(buildRowFromLv);
      setSelId(mapped[0]?.id ?? null);
      initSourceRef.current = "lv";
      AUFMASS.save(projectId, mapped);
      return mapped;
    });
  }, [lvRows, isPristineFallback, projectId]);

  React.useEffect(() => {
    if (!didInitRef.current) return;
    if (!projectId) return;
    if (fotoImportedRef.current) return;

    try {
      const raw = localStorage.getItem(FOTO_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as any;
      const extras: FotoExtra[] | undefined = Array.isArray(parsed?.extras) ?
      parsed.extras :
      undefined;

      if (!extras || extras.length === 0) return;

      const note = String(parsed?.note || "Aus Foto / KI übernommen");

      setRows((prev) => {
        const base = [...prev];

        extras.forEach((ex) => {
          if (!ex?.beschreibung || !String(ex.beschreibung).trim()) return;

          base.push({
            id: safeUUID(),
            pos: `FOTO.${String(base.length + 1).padStart(3, "0")}`,
            text: String(ex.beschreibung),
            unit: String(ex.einheit || "m"),
            ep: 0,
            soll: 0,
            formula: "",
            ist: Number(ex.menge || 0),
            note,
            factor: 1
          });
        });

        AUFMASS.save(projectId, base);
        return base;
      });

      fotoImportedRef.current = true;
    } catch (e) {
      console.error("Fehler beim Import aus Foto-Aufmaß", e);
    }
  }, [projectId]);

  React.useEffect(() => {
    if (cadImportedRef.current) return;
    if (!projectId) return;

    const hasFlag =
    new URLSearchParams(window.location.search).get("import") === "cad";
    if (!hasFlag) return;

    const items = consumeCadExport("aufmasseditor");
    if (!items || !Array.isArray(items) || items.length === 0) return;

    setRows((prev) => {
      let idx =
      prev.filter((x) => String(x.pos || "").startsWith("CAD.")).length + 1;

      const importedRows: LVRow[] = items.map((item) => {
        const unit = item.kind === "AREA" ? "m²" : "m";
        const ist =
        item.kind === "AREA" ? item.area_m2 ?? 0 : item.length_m ?? 0;

        return {
          id: safeUUID(),
          pos: "CAD." + String(idx++).padStart(3, "0"),
          text:
          (item.label ?? item.layer ?? "CAD-Element") + (
          item.kind === "AREA" ? " (CAD-Fläche)" : " (CAD-Länge)"),
          unit,
          ep: 0,
          soll: 0,
          formula: "",
          ist,
          note: "Import aus CAD",
          factor: 1
        };
      });

      return [...importedRows, ...prev];
    });

    cadImportedRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("import");
    window.history.replaceState({}, "", url.toString());
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId || gpsImportedRef.current || !didInitRef.current) return;

    const hasGpsFlag =
    new URLSearchParams(window.location.search).get("import") === "gps";
    if (!hasGpsFlag) return;

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch(
          apiUrl(
            `/api/gps/aufmass-transfer?projectId=${encodeURIComponent(projectId)}`
          ),
          {
            credentials: "include",
            cache: "no-store",
            headers: { ...getHistorieAuthHeaders() }
          }
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok)
        throw new Error(json?.error || `HTTP ${response.status}`);

        const payload = json?.data as GpsTransferPayload | null;
        if (
        !payload ||
        payload.consumedAt ||
        !Array.isArray(payload.items) ||
        !payload.items.length)
        {
          showRlcMessage("Keine neue GPS-Übertragung gefunden.");
          return;
        }

        if (cancelled) return;

        setRows((prev) => {
          const next = [...prev];
          let targetIndex = next.findIndex(
            (row) =>
            String(row.pos || "").trim() ===
            String(payload.lvPosition || "").trim()
          );

          if (targetIndex < 0) {
            next.push({
              id: safeUUID(),
              pos:
              payload.lvPosition ||
              `GPS.${String(next.length + 1).padStart(3, "0")}`,
              text: payload.lvKurztext || "GPS-Aufmaß",
              unit: payload.items[0]?.unit || "m",
              ep: 0,
              soll: 0,
              formula: "",
              ist: 0,
              note: "Import aus GPS-Zuweisung",
              factor: 1,
              entries: []
            });
            targetIndex = next.length - 1;
          }

          const target = next[targetIndex];
          const existingEntries = Array.isArray(target.entries) ?
          target.entries :
          [];
          const existingSourceIds = new Set(
            existingEntries.
            map((entry) => String(entry.sourceId || "")).
            filter(Boolean)
          );

          const newEntries: AufmassEntry[] = payload.items.
          filter((item) => !existingSourceIds.has(item.id)).
          map((item, index) => ({
            id: safeUUID(),
            label: item.label || `GPS-Aufmaß ${index + 1}`,
            formula: String(Number(item.qty || 0)),
            menge: Number(item.qty || 0),
            note:
            item.comment ||
            `GPS ${item.type === "AREA" ? "Fläche" : "Strecke"}`,
            factor: 1,
            unit: item.unit,
            ep: target.ep,
            createdAt: new Date(
              payload.createdAt || Date.now()
            ).toISOString(),
            sourceId: item.id,
            source: "gps"
          }));

          const entries = [...existingEntries, ...newEntries];
          next[targetIndex] = {
            ...target,
            unit: payload.items[0]?.unit || target.unit,
            entries,
            formula: entriesToFormula(entries),
            ist: entriesSum(entries),
            note: [target.note, `GPS-Transfer ${payload.transferId}`].
            filter(Boolean).
            join(" | ")
          };

          if (projectId) AUFMASS.save(projectId, next);
          setSelId(next[targetIndex].id);
          return next;
        });

        await fetch(apiUrl("/api/gps/aufmass-transfer/consume"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getHistorieAuthHeaders()
          },
          body: JSON.stringify({ projectId })
        });

        gpsImportedRef.current = true;
        const url = new URL(window.location.href);
        url.searchParams.delete("import");
        window.history.replaceState({}, "", url.toString());
        showRlcMessage(
          `${payload.items.length} GPS-Aufmaßzeile(n) übernommen.`
        );
      } catch (error: any) {
        showRlcMessage(
          `GPS-Import fehlgeschlagen:\n${error?.message || error}`
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId, rows.length]);

  const handleSaveAufmass = React.useCallback(async () => {
    if (!projectFsKey && !projectId || !projectId) {
      showRlcMessage("Kein Projekt gewählt.");
      return;
    }

    setSaving(true);

    try {
      const historyRows = toSollIst(rows);

      await serverSaveAufmass(toAufmassJson(rows));
      await serverSaveSollIst(historyRows);
      await serverSaveOrte(orte, ortPositions);
      setLastSavedAt(new Date().toISOString());

      const historyProjectId = String(
        project?.code || stickyCode || projectFsKey || projectId || ""
      ).trim();

      if (historyProjectId) {
        const currentResponse = await fetch(
          apiUrl(
            `/api/historie/current?projectId=${encodeURIComponent(
              historyProjectId
            )}`
          ),
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...getHistorieAuthHeaders()
            },
            body: JSON.stringify({ rows: historyRows })
          }
        );

        if (!currentResponse.ok) {
          throw new Error(`Historie Current HTTP ${currentResponse.status}`);
        }

        const createdAt = Date.now();

        const historyVersion = {
          id:
          typeof crypto !== "undefined" && crypto.randomUUID ?
          crypto.randomUUID() :
          `${createdAt}-${Math.random().toString(36).slice(2)}`,
          projectId: historyProjectId,
          createdAt,
          updatedAt: createdAt,
          createdBy: "Bauleitung",
          user: "Bauleitung",
          status: "GESPEICHERT",
          documentName: `Aufmaß ${new Date(createdAt).toLocaleString("de-DE")}`,
          note: "Im Aufmaß-Editor gespeichert",
          data: historyRows
        };

        const historyResponse = await fetch(apiUrl("/api/historie"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...getHistorieAuthHeaders()
          },
          body: JSON.stringify(historyVersion)
        });

        if (!historyResponse.ok) {
          throw new Error(`Historie Version HTTP ${historyResponse.status}`);
        }
      }

      showRlcMessage(
        "Aufmaß gespeichert und in der Aufmaß-Historie dokumentiert."
      );
    } catch (e: any) {
      console.error(e);
      showRlcMessage(
        `Server-Speicherung fehlgeschlagen:\n${
        e?.message || "Unbekannter Fehler"}`

      );
    } finally {
      setSaving(false);
    }
  }, [
  projectFsKey,
  projectId,
  project?.code,
  stickyCode,
  rows,
  orte,
  ortPositions,
  serverSaveAufmass,
  serverSaveSollIst,
  serverSaveOrte]
  );

  const handleTransferToKalkulation = React.useCallback(() => {
    if (!projectId) {
      showRlcMessage("Kein Projekt gewählt.");
      return;
    }

    const payload = {
      projectId,
      projectCode: project?.code || stickyCode || "",
      createdAt: new Date().toISOString(),
      source: "aufmass-editor",
      rows: rows.map((r) => ({
        id: r.id,
        pos: r.pos,
        kurztext: r.text,
        einheit: r.unit,
        lvSoll: r.soll,
        istMenge: r.ist,
        differenz: r.soll - r.ist,
        ep: r.ep,
        faktor: r.factor ?? 1,
        gesamt: r.ist * (r.ep * (r.factor ?? 1)),
        beschriftung: r.note || "",
        teilaufmass: r.entries || []
      }))
    };

    try {
      AUFMASS.save(projectId, rows);
      localStorage.setItem(
        `RLC_AUFMASS_TO_KALKULATION_${projectId}`,
        JSON.stringify(payload)
      );
      localStorage.setItem(
        "RLC_AUFMASS_TO_KALKULATION_LAST",
        JSON.stringify(payload)
      );
      setLastSavedAt(payload.createdAt);
      showRlcMessage("Aufmaß wurde für Kalkulation übertragen.");
    } catch (e) {
      console.error(e);
      showRlcMessage(
        "Übertragung in Kalkulation konnte nicht gespeichert werden."
      );
    }
  }, [projectId, project?.code, stickyCode, rows]);

  const handleTransferToBilling = React.useCallback(
    (documentType: "ABSCHLAGSRECHNUNG" | "RECHNUNG") => {
      if (!projectId) {
        showRlcMessage("Kein Projekt gewählt.");
        return;
      }

      const createdAt = new Date().toISOString();
      const rowById = new Map(rows.map((row) => [safeTrim(row.pos), row]));
      const linkedIds = new Set(ortPositions.map((link) => link.positionId));

      const mapBillingRow = (row: LVRow) => {
        const faktor = row.factor ?? 1;
        const aktuellMenge = Number(row.ist || 0);
        const epNetto = Number(row.ep || 0) * faktor;
        return {
          id: row.id,
          positionId: safeTrim(row.pos),
          pos: row.pos,
          kurztext: row.text,
          langtext: row.langtext || "",
          einheit: row.unit,
          lvMenge: Number(row.soll || 0),
          vorherMenge: 0,
          aktuellMenge,
          kumuliertMenge: aktuellMenge,
          epNetto,
          vorherBetrag: 0,
          aktuellBetrag: aktuellMenge * epNetto,
          kumuliertBetrag: aktuellMenge * epNetto,
          differenzMenge: Number(row.soll || 0) - aktuellMenge,
          beschriftung: row.note || "",
          teilaufmass: row.entries || []
        };
      };

      const groups = orte.
      slice().
      sort(
        (a, b) =>
        a.sortOrder - b.sortOrder ||
        String(a.nummer || "").localeCompare(String(b.nummer || ""), "de-DE", {
          numeric: true
        })
      ).
      map((ort) => {
        const positions = ortPositions.
        filter((link) => link.ortId === ort.id).
        map((link) => rowById.get(link.positionId)).
        filter((row): row is LVRow => Boolean(row)).
        map(mapBillingRow);

        return {
          ortId: ort.id,
          parentId: ort.parentId,
          nummer: ort.nummer,
          name: ort.name,
          sortOrder: ort.sortOrder,
          positions,
          netto: positions.reduce((sum, row) => sum + row.aktuellBetrag, 0)
        };
      });

      const unassignedPositions = rows.
      filter((row) => !linkedIds.has(safeTrim(row.pos))).
      map(mapBillingRow);

      const payload = {
        schemaVersion: 1,
        source: "aufmass-editor",
        documentType,
        projectId,
        projectCode: project?.code || stickyCode || "",
        createdAt,
        ortStructure: orte,
        ortPositionLinks: ortPositions,
        groups,
        unassigned: {
          nummer: "",
          name: "Nicht zugeordnet",
          positions: unassignedPositions,
          netto: unassignedPositions.reduce(
            (sum, row) => sum + row.aktuellBetrag,
            0
          )
        },
        totals: {
          uniquePositions: rows.length,
          assignedLinks: ortPositions.length,
          mehrfachZuordnungen: Math.max(0, ortPositions.length - linkedIds.size),
          netto: rows.reduce(
            (sum, row) =>
            sum + Number(row.ist || 0) * Number(row.ep || 0) * (row.factor ?? 1),
            0
          )
        }
      };

      const typeKey =
      documentType === "ABSCHLAGSRECHNUNG" ?
      "ABSCHLAGSRECHNUNG" :
      "RECHNUNG";

      try {
        localStorage.setItem(
          `RLC_AUFMASS_TO_${typeKey}_${projectId}`,
          JSON.stringify(payload)
        );
        localStorage.setItem(
          `RLC_AUFMASS_TO_${typeKey}_LAST`,
          JSON.stringify(payload)
        );
        localStorage.setItem(
          "RLC_AUFMASS_TO_BUCHHALTUNG_LAST",
          JSON.stringify(payload)
        );

        navigate(
          documentType === "ABSCHLAGSRECHNUNG" ?
          "/buchhaltung/abschlagsrechnungen?from=aufmasseditor" :
          "/buchhaltung/rechnungen?from=aufmasseditor"
        );
      } catch (error) {
        console.error(error);
        showRlcMessage(
          documentType === "ABSCHLAGSRECHNUNG" ?
          "Übertragung zur Abschlagsrechnung fehlgeschlagen." :
          "Übertragung zur Rechnung fehlgeschlagen."
        );
      }
    },
    [
    projectId,
    project?.code,
    stickyCode,
    rows,
    orte,
    ortPositions,
    navigate]

  );

  const handleLoadAufmass = React.useCallback(async () => {
    if (!projectFsKey && !projectId || !projectId) {
      showRlcMessage("Kein Projekt gewählt.");
      return;
    }
    if (loadBusy) return;

    setLoadBusy(true);

    try {
      const srv = await serverLoadAufmass().catch(() => []);
      const srvLegacy = await serverLoadSollIst().catch(() => []);

      if (srv.length || srvLegacy.length) {
        const primary = srv.length ? fromAufmassJson(srv) : [];
        const legacy = srvLegacy.length ? fromSollIst(srvLegacy) : [];
        const merged = hydrateAufmassRowsFromLv(
          mergeByPos(primary, legacy),
          lvRows,
          lvProjectCode
        );

        const storedSel = AUFMASS.loadSel(projectId);
        const nextSel =
        storedSel && merged.some((x) => x.id === storedSel) ?
        storedSel :
        merged[0]?.id ?? null;

        setRows(merged);
        setSelId(nextSel);
        AUFMASS.save(projectId, merged);

        showRlcMessage(
          `Aufmaß geladen (Server merge) • ${merged.length} Zeile(n)`
        );
        return;
      }

      const stored = AUFMASS.load(projectId);
      if (stored.length) {
        const storedSel = AUFMASS.loadSel(projectId);
        const nextSel =
        storedSel && stored.some((x) => x.id === storedSel) ?
        storedSel :
        stored[0]?.id ?? null;

        setRows(hydrateAufmassRowsFromLv(stored, lvRows, lvProjectCode));
        setSelId(nextSel);
        showRlcMessage(`Aufmaß geladen (lokal) • ${stored.length} Zeile(n)`);
        return;
      }

      showRlcMessage("Kein gespeichertes Aufmaß (Server oder lokal) gefunden.");
    } catch (e: any) {
      console.error(e);

      const stored = AUFMASS.load(projectId);
      if (stored.length) {
        const storedSel = AUFMASS.loadSel(projectId);
        const nextSel =
        storedSel && stored.some((x) => x.id === storedSel) ?
        storedSel :
        stored[0]?.id ?? null;

        setRows(hydrateAufmassRowsFromLv(stored, lvRows, lvProjectCode));
        setSelId(nextSel);
        showRlcMessage(
          `Server-Fehler beim Laden.\nFallback: lokal geladen • ${
          stored.length} Zeile(n)\n\n${
          e?.message || "Unbekannter Fehler"}`
        );
        return;
      }

      showRlcMessage(
        `Fehler beim Laden:\n${e?.message || "Unbekannter Fehler"}`
      );
    } finally {
      setLoadBusy(false);
    }
  }, [
  projectFsKey,
  projectId,
  loadBusy,
  serverLoadAufmass,
  serverLoadSollIst,
  lvRows,
  lvProjectCode]
  );

  const handleClearAufmass = React.useCallback(() => {
    if (!projectId) return;

    if (
    !window.confirm(
      "Gesamtes Aufmaß für dieses Projekt wirklich löschen?\n\nHinweis: Das entfernt nur den lokalen Speicher."
    ))
    {
      return;
    }

    AUFMASS.clear(projectId);

    const fallback = [buildFallbackRow()];
    setRows(fallback);
    setSelId(fallback[0].id);
    AUFMASS.save(projectId, fallback);
    initSourceRef.current = "fallback";
    didInitRef.current = true;
  }, [projectId]);


  const exportAufmassPdf = React.useCallback(async (
  options?: {delivery?: boolean;}) =>
  {
    if (!rows.length) {
      showRlcMessage("Keine Aufmaßpositionen für den PDF-Export vorhanden.");
      return null;
    }

    const projectCode = String(
      project?.code ||
      stickyCode ||
      projectId ||
      "Projekt"
    );

    const projectName = String(
      project?.name ||
      project?.name ||
      projectCode
    );

    const ortById = new Map(
      orte.map((ort) => [safeTrim(ort.id), ort])
    );

    const linkedOrtIds = new Map<string, string[]>();

    for (const link of ortPositions) {
      const positionId = safeTrim(link.positionId);
      const ortId = safeTrim(link.ortId);

      if (!positionId || !ortId) continue;

      const current = linkedOrtIds.get(positionId) || [];
      if (!current.includes(ortId)) current.push(ortId);
      linkedOrtIds.set(positionId, current);
    }

    const pdfRows = rows.flatMap((row) => {
      const entries =
      Array.isArray(row.entries) && row.entries.length ?
      row.entries :
      [{
        id: row.id,
        label: row.text,
        formula: row.formula,
        menge: row.ist,
        note: row.note,
        factor: row.factor,
        unit: row.unit,
        ep: row.ep,
        kreis: undefined,
        blatt: undefined,
        nr: undefined,
        reb: undefined,
        messzahl: undefined,
        ortId: undefined
      }];

      return entries.map((entry: any, entryIndex: number) => {
        const directOrtId = safeTrim(entry?.ortId);
        const positionOrtIds = linkedOrtIds.get(safeTrim(row.id)) || [];
        const ortIds = directOrtId ?
        [directOrtId] :
        positionOrtIds;

        const ortLabels = ortIds.
        map((id) => ortById.get(id)).
        filter(Boolean).
        map((ort: any) => {
          const typ = ort.parentId ? "Unterort" : "Ort";
          return `${typ} ${safeTrim(ort.nummer) || "—"} · ${ort.name}`;
        });

        return {
          id: entry?.id || `${row.id}-${entryIndex + 1}`,

          posNr: row.pos,
          position: row.pos,
          pos: row.pos,

          kurztext: row.text,
          bezeichnung: entry?.label || row.text,
          text: entry?.label || row.text,
          langtext: row.langtext || "",

          kreis: entry?.kreis ?? "",
          blatt: entry?.blatt ?? "",
          nr: entry?.nr ?? entryIndex + 1,
          nummer: entry?.nr ?? entryIndex + 1,
          reb: entry?.reb ?? "",
          messzahl: entry?.messzahl ?? "",

          rechenansatz:
          entry?.formula ||
          row.formula ||
          "",

          formel:
          entry?.formula ||
          row.formula ||
          "",

          ergebnis:
          entry?.menge ??
          row.ist ??
          0,

          result:
          entry?.menge ??
          row.ist ??
          0,

          menge:
          entry?.menge ??
          row.ist ??
          0,

          soll: row.soll ?? 0,
          ist: entry?.menge ?? row.ist ?? 0,

          faktor:
          entry?.factor ??
          row.factor ??
          1,

          factor:
          entry?.factor ??
          row.factor ??
          1,

          einheit:
          entry?.unit ||
          row.unit ||
          "",

          unit:
          entry?.unit ||
          row.unit ||
          "",

          ep:
          entry?.ep ??
          row.ep ??
          0,

          preis:
          entry?.ep ??
          row.ep ??
          0,

          bemerkung:
          entry?.note ||
          row.note ||
          "",

          ort:
          ortLabels.join(", "),

          ortId:
          directOrtId ||
          positionOrtIds[0] ||
          ""
        };
      });
    });

    const response = await fetch(apiUrl("/api/pdf/aufmass"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(localStorage.getItem("token") ?
        {
          Authorization:
          `Bearer ${localStorage.getItem("token")}`
        } :
        {})
      },
      body: JSON.stringify({
        projectId: projectCode,
        projectKey: projectCode,
        projectName,
        projectTitle: projectName,

        project: {
          id: projectCode,
          code: projectCode,
          name: projectName
        },

        date: new Date().toISOString(),
        rows: pdfRows,
        lines: pdfRows,
        aufmass: pdfRows,

        ort: pdfRows.
        map((row: any) => row.ort).
        filter(Boolean).
        filter(
          (value: string, index: number, values: string[]) =>
          values.indexOf(value) === index
        ).
        join(" · "),

        company: companyPdfHeader
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      throw new Error(
        detail ||
        `RLC PDF Core Fehler: HTTP ${response.status}`
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error(
        "RLC PDF Core hat eine leere Aufmaß-PDF geliefert."
      );
    }

    const filenameProject = projectCode.
    replace(/[<>:"/\\|?*]/g, "_").
    replace(/\s+/g, "_");

    const deliveryFileName =
    `Aufmassblatt_${filenameProject}.pdf`;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, i + chunkSize)
      );
    }

    const result = {
      blob,
      name: deliveryFileName,
      base64: btoa(binary)
    };

    if (!options?.delivery) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = deliveryFileName;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        0
      );
    }

    return result;
  }, [
  rows,
  orte,
  ortPositions,
  project?.code,
  project?.name,
  project?.name,
  stickyCode,
  projectId,
  companyPdfHeader]
  );

  React.useEffect(() => {
    const target = window as any;
    const producer = async () => exportAufmassPdf({ delivery: true });

    target.__RLC_DOCUMENT_PDF_PRODUCER__ = producer;

    return () => {
      if (target.__RLC_DOCUMENT_PDF_PRODUCER__ === producer) {
        delete target.__RLC_DOCUMENT_PDF_PRODUCER__;
      }
    };
  }, [exportAufmassPdf]);

  const exportRebPdf = React.useCallback(() => {
    if (!rows.length) {
      showRlcMessage("Keine Aufmaßpositionen für den REB-Export vorhanden.");
      return;
    }

    const projectCode = String(
      project?.code || stickyCode || projectId || "Projekt"
    );

    const toNumber = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const formatNumber = (value: unknown, digits = 3): string =>
    new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(toNumber(value));

    const getOrtLabel = (positionId: string): string => {
      const linkedIds = new Set(
        ortPositions.
        filter(
          (link) =>
          safeTrim(link.positionId) === safeTrim(positionId)
        ).
        map((link) => link.ortId)
      );

      return orte.
      filter((ort) => linkedIds.has(ort.id)).
      sort(
        (a, b) =>
        a.sortOrder - b.sortOrder ||
        String(a.nummer || "").localeCompare(
          String(b.nummer || ""),
          "de-DE",
          { numeric: true }
        )
      ).
      map((ort) => {
        const type = ort.parentId ? "Unterort" : "Ort";

        return `${type} ${safeTrim(ort.nummer) || "—"} · ${ort.name}`;
      }).
      join("\n");
    };

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const drawRebPageHeader = () => {
      pdf.setFillColor(15, 54, 120);
      pdf.rect(0, 25, pageWidth, 17, "F");

      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text("REB-Aufmaßblatt 23.003 · Prüfnachweis", 14, 35);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.text(
        `Projekt ${projectCode}`,
        pageWidth - 14,
        35,
        { align: "right" }
      );
    };

    const drawRebFooter = () => {
      pdf.setDrawColor(203, 213, 225);
      pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139);

      pdf.text(
        "REB-Prüfnachweis · Kein Ersatz für strukturierten X31-/DA11-Datenaustausch",
        14,
        pageHeight - 6
      );

      pdf.text(
        `Seite ${pdf.getNumberOfPages()}`,
        pageWidth - 14,
        pageHeight - 6,
        { align: "right" }
      );
    };

    drawRebPageHeader();

    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(`Projekt: ${projectCode}`, 14, 50);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(
      `Erstellt: ${new Date().toLocaleString("de-DE")}`,
      14,
      56
    );
    pdf.text(
      `Aufmaßzeilen: ${rows.length}`,
      14,
      61
    );

    const rebRows = rows.
    slice().
    sort(byPosAsc).
    map((row, index) => {
      const ist = toNumber(row.ist);
      const faktor = toNumber(row.factor ?? 1) || 1;
      const ergebnis = ist * faktor;

      return [
      String(index + 1).padStart(4, "0"),
      String(row.pos || ""),
      getOrtLabel(String(row.pos || "")) || "Nicht zugeordnet",
      String(row.text || ""),
      "Freier Ansatz",
      `${formatNumber(faktor)} × ${formatNumber(ist)}`,
      formatNumber(ergebnis),
      String(row.unit || ""),
      String(row.note || "")];

    });

    autoTable(pdf, {
      startY: 67,
      margin: {
        left: 14,
        right: 14,
        top: 48,
        bottom: 17
      },
      head: [[
      "Zeile",
      "LV-Pos.",
      "Ort / Unterort",
      "Kurztext",
      "Formelart",
      "Rechenansatz",
      "Ergebnis",
      "ME",
      "Bemerkung"]],

      body: rebRows,
      styles: {
        fontSize: 6.6,
        cellPadding: 1.5,
        valign: "top",
        overflow: "linebreak",
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: 255,
        fontStyle: "bold"
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 13, halign: "right" },
        1: { cellWidth: 18, fontStyle: "bold" },
        2: { cellWidth: 37 },
        3: { cellWidth: 57 },
        4: { cellWidth: 23 },
        5: { cellWidth: 36, halign: "right" },
        6: { cellWidth: 24, halign: "right", fontStyle: "bold" },
        7: { cellWidth: 12 },
        8: { cellWidth: 45 }
      },
      didDrawPage: () => {
        if (pdf.getNumberOfPages() > 1) {
          drawRebPageHeader();
        }

        drawRebFooter();
      }
    });

    const finalY = Number(
      (pdf as any).lastAutoTable?.finalY || 70
    );

    const totalMenge = rows.reduce(
      (sum, row) =>
      sum +
      toNumber(row.ist) * (
      toNumber(row.factor ?? 1) || 1),
      0
    );

    if (finalY + 15 < pageHeight - 17) {
      pdf.setFillColor(239, 246, 255);
      pdf.setDrawColor(147, 197, 253);
      pdf.roundedRect(
        pageWidth - 89,
        finalY + 5,
        75,
        11,
        2,
        2,
        "FD"
      );

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(30, 64, 175);
      pdf.text(
        `Summe Mengenansätze: ${formatNumber(totalMenge)}`,
        pageWidth - 17,
        finalY + 12,
        { align: "right" }
      );
    }

    const filenameProject = projectCode.
    replace(/[<>:"/\\|?*]/g, "_").
    replace(/\s+/g, "_");

    saveRlcPdfWithCompanyHeader(
      pdf,
      `REB_Aufmassblatt_${filenameProject}.pdf`
    );
  }, [
  rows,
  orte,
  ortPositions,
  project?.code,
  stickyCode,
  projectId]
  );

  const exportX31 = React.useCallback(() => {
    if (!rows.length) {
      showRlcMessage("Keine Aufmaßzeilen für X31 vorhanden.");
      return;
    }

    const projectCode = String(project?.code || stickyCode || projectId || "Projekt");
    const officialLvPositions = new Set(
      lvRows.map((lv) => safeTrim(lv.pos)).filter(Boolean)
    );

    const exportRows = reconcileAufmassRowsWithLv(rows, lvRows).filter((row) =>
    officialLvPositions.has(safeTrim(row.pos))
    );

    const lines = buildRebExportLines(exportRows);
    if (!lines.length) {
      showRlcMessage("Keine gültigen Aufmaßzeilen für X31 vorhanden.");
      return;
    }

    const grouped = new Map<string, Map<string, Map<string, RebExportLine[]>>>();
    lines.forEach((line) => {
      const [l1, l2] = line.levels;
      if (!grouped.has(l1)) grouped.set(l1, new Map());
      const level2 = grouped.get(l1)!;
      if (!level2.has(l2)) level2.set(l2, new Map());
      const items = level2.get(l2)!;
      const itemKey = `${line.item}|${line.index}`;
      if (!items.has(itemKey)) items.set(itemKey, []);
      items.get(itemKey)!.push(line);
    });

    let idCounter = 1;
    const nextId = () => `ID${String(idCounter++).padStart(6, "0")}`;
    const boqId = nextId();
    const body: string[] = [];

    grouped.forEach((level2Map, level1) => {
      body.push(`    <BoQCtgy RNoPart="${xmlEscape(level1)}" ID="${nextId()}">`);
      body.push("     <BoQBody>");
      level2Map.forEach((itemMap, level2) => {
        body.push(`      <BoQCtgy RNoPart="${xmlEscape(level2)}" ID="${nextId()}">`);
        body.push("       <BoQBody>");
        body.push("        <Itemlist>");
        itemMap.forEach((itemLines, itemKey) => {
          const [item, itemIndex] = itemKey.split("|");
          const indexAttribute = safeTrim(itemIndex) ?
          ` RNoIndex="${xmlEscape(itemIndex)}"` :
          "";
          body.push(`         <Item RNoPart="${xmlEscape(item)}"${indexAttribute} ID="${nextId()}">`);
          body.push("          <QtyDeterm>");
          itemLines.forEach((line) => {
            body.push("           <QDetermItem>");
            body.push(`            <QTakeoff Row="${xmlEscape(line.row80)}"/>`);
            body.push("           </QDetermItem>");
          });
          body.push("          </QtyDeterm>");
          body.push("         </Item>");
        });
        body.push("        </Itemlist>");
        body.push("       </BoQBody>");
        body.push("      </BoQCtgy>");
      });
      body.push("     </BoQBody>");
      body.push("    </BoQCtgy>");
    });

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);
    const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA31/3.3">',
    ' <GAEBInfo>',
    '  <Version>3.3</Version>',
    '  <VersDate>2023-01</VersDate>',
    `  <Date>${date}</Date>`,
    `  <Time>${time}</Time>`,
    '  <ProgSystem>RLC Bausoftware</ProgSystem>',
    '  <ProgName>RLC Aufmaß-Editor</ProgName>',
    ' </GAEBInfo>',
    ' <QtyDeterm>',
    '  <QtyDetermInfo>',
    '   <MethodDescription>REB23003-2009</MethodDescription>',
    `   <OrdDescr>${xmlEscape(projectCode)}</OrdDescr>`,
    '  </QtyDetermInfo>',
    '  <DP>31</DP>',
    `  <BoQ ID="${boqId}">`,
    '   <BoQBkdn><Type>BoQLevel</Type><Length>2</Length><Num>Yes</Num></BoQBkdn>',
    '   <BoQBkdn><Type>BoQLevel</Type><Length>2</Length><Num>Yes</Num></BoQBkdn>',
    '   <BoQBkdn><Type>Item</Type><Length>4</Length><Num>Yes</Num></BoQBkdn>',
    '   <BoQBkdn><Type>Index</Type><Length>1</Length><Num>No</Num></BoQBkdn>',
    '   <BoQBody>',
    ...body,
    '   </BoQBody>',
    '  </BoQ>',
    ' </QtyDeterm>',
    '</GAEB>',
    ''].
    join("\r\n");

    const safeProject = projectCode.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");
    downloadTextFile(`Mengenermittlung_${safeProject}.X31`, xml, "application/xml;charset=utf-8");
    showRlcMessage(`${lines.length} Aufmaßzeile(n) als X31 exportiert.`);
  }, [rows, lvRows, project?.code, stickyCode, projectId]);

  const exportDa11 = React.useCallback(() => {
    if (!rows.length) {
      showRlcMessage("Keine Aufmaßzeilen für DA11 vorhanden.");
      return;
    }

    const projectCode = String(project?.code || stickyCode || projectId || "Projekt");
    const officialLvPositions = new Set(
      lvRows.map((lv) => safeTrim(lv.pos)).filter(Boolean)
    );

    const exportRows = reconcileAufmassRowsWithLv(rows, lvRows).filter((row) =>
    officialLvPositions.has(safeTrim(row.pos))
    );

    const lines = buildRebExportLines(exportRows);
    if (!lines.length) {
      showRlcMessage("Keine gültigen Aufmaßzeilen für DA11 vorhanden.");
      return;
    }
    const da11 = lines.
    map((line) => `11${line.oz9}${line.row80.slice(11)}`.slice(0, 80).padEnd(80, " ")).
    join("\r\n") + "\r\n";

    const safeProject = projectCode.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");
    downloadBinaryFile(
      `Mengenermittlung_${safeProject}.D11`,
      encodeWindows1252(da11),
      "application/octet-stream"
    );
    showRlcMessage(`${lines.length} Aufmaßzeile(n) als DA11 exportiert.`);
  }, [rows, lvRows, project?.code, stickyCode, projectId]);

  const exportCsv = React.useCallback(() => {
    const header = [
    "Pos",
    "Kurztext",
    "Einheit",
    "LV (Soll)",
    "Ist (Abgerechnet)",
    "Differenz (Soll–Ist)",
    "EP",
    "Faktor",
    "Eff. EP",
    "Gesamt (€)",
    "Beschreibung",
    "Formel"];


    const lines = rows.map((r) => {
      const factor = r.factor ?? 1;
      const effEP = r.ep * factor;
      const total = r.ist * effEP;
      const diff = r.soll - r.ist;

      return [
      r.pos,
      String(r.text ?? "").replace(/"/g, '""'),
      r.unit,
      String(r.soll).replace(".", ","),
      String(r.ist).replace(".", ","),
      String(diff).replace(".", ","),
      String(r.ep).replace(".", ","),
      String(factor).replace(".", ","),
      String(effEP.toFixed(2)).replace(".", ","),
      String(total.toFixed(2)).replace(".", ","),
      String(r.note ?? "").replace(/"/g, '""'),
      String(r.formula ?? "").replace(/"/g, '""')];

    });

    const csv = [header, ...lines].
    map((row) => row.map((c) => `"${c}"`).join(";")).
    join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aufmass.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows]);

  const onFormulaChange = React.useCallback(
    (id: string, formula: string) => {
      const v = calc(formula);
      setRow(id, { formula, ist: v });
    },
    [setRow]
  );

  const onEPChange = React.useCallback(
    (id: string, v: string) => setRow(id, { ep: nrmNumber(v, 0) }),
    [setRow]
  );

  const onSollChange = React.useCallback(
    (id: string, v: string) => setRow(id, { soll: nrmNumber(v, 0) }),
    [setRow]
  );

  const onIstManualChange = React.useCallback(
    (id: string, v: string) => {
      const ist = nrmNumber(v, 0);
      setRow(id, { ist, formula: "" });
    },
    [setRow]
  );

  const onFactorChange = React.useCallback(
    (id: string, v: string) => {
      const f = nrmNumber(v, 1);
      setRow(id, { factor: isFinite(f) && f > 0 ? f : 1 });
    },
    [setRow]
  );

  const onNoteChange = React.useCallback(
    (id: string, val: string) => setRow(id, { note: val }),
    [setRow]
  );

  const addRow = React.useCallback(() => {
    setRows((prev) => {
      const n = prev.length + 1;
      const r: LVRow = {
        id: safeUUID(),
        pos: `001.${String(n).padStart(3, "0")}`,
        text: "Neue Position",
        unit: "m",
        ep: 0,
        soll: 0,
        formula: getStandardFormel("m"),
        ist: 0,
        note: "",
        factor: 1
      };
      const next = [...prev, r];
      setSelId(r.id);
      return next;
    });
  }, []);

  const addRowFromLv = React.useCallback((lv: LvPosition) => {
    const base = buildRowFromLv(lv);
    const nextId = safeUUID();
    setRows((prev) => {
      const sameCount = prev.filter(
        (x) => String(x.pos).split(".")[0] === String(lv.pos)
      ).length;
      const next: LVRow = {
        ...base,
        id: nextId,
        pos: sameCount > 0 ? `${lv.pos}.${sameCount + 1}` : lv.pos,
        note: sameCount > 0 ? `Teilaufmaß zu LV-Pos. ${lv.pos}` : "",
        langtext: extractLvLangtext(lv),
        entries: []
      };
      return [...prev, next];
    });
    setSelId(nextId);
  }, []);

  const dupRow = React.useCallback(() => {
    if (!selected) return;

    const nextId = safeUUID();
    const copy: LVRow = {
      ...selected,
      id: nextId,
      pos: `${selected.pos}.K`,
      text: selected.text,
      note: selected.note ? `${selected.note} (Kopie)` : "Kopie",
      entries: Array.isArray(selected.entries) ?
      selected.entries.map((e) => ({
        ...e,
        id: safeUUID(),
        createdAt: new Date().toISOString()
      })) :
      []
    };

    setRows((prev) => [...prev, copy]);
    setSelId(nextId);
  }, [selected]);

  const delRow = React.useCallback(() => {
    if (!selected) return;

    const ok = window.confirm(`Position ${selected.pos} wirklich löschen?`);
    if (!ok) return;

    setRows((prev) => {
      const next = prev.filter((r) => r.id !== selected.id);
      setSelId(next[0]?.id ?? null);
      return next;
    });
  }, [selected]);

  const sortByPos = React.useCallback(() => {
    setRows((prev) => [...prev].sort(byPosAsc));
  }, []);
  const totals = React.useMemo(() => {
    const totalAbgerechnet = rows.reduce(
      (s, r) => s + r.ist * r.ep * (r.factor ?? 1),
      0
    );

    const fallbackLvSumme = rows.reduce((s, r) => s + r.soll * r.ep, 0);

    const candidateProjectKeys = Array.from(
      new Set(
        [project?.code, stickyCode, projectFsKey, projectId].
        map((x) => String(x || "").trim()).
        filter(Boolean)
      )
    );

    let rlcKiNetto = 0;

    try {
      for (const key of candidateProjectKeys) {
        const raw = localStorage.getItem(`rlc_lv_data_v1:${key}`);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ?
        parsed :
        Array.isArray(parsed?.rows) ?
        parsed.rows :
        [];
        if (!arr.length) continue;

        const sum = arr.reduce((s: number, r: any) => {
          const menge = Number(r?.menge ?? r?.quantity ?? r?.soll ?? 0);
          const ep = Number(
            r?.rlcKiUnitPrice ??
            r?.rlcEp ??
            r?.finalUnitPrice ??
            r?.suggestedUnitPrice ??
            0
          );
          return s + menge * ep;
        }, 0);

        if (sum > 0) {
          rlcKiNetto = sum;
          break;
        }
      }
    } catch {
      rlcKiNetto = 0;
    }

    const lvSumme = rlcKiNetto > 0 ? rlcKiNetto : fallbackLvSumme;
    const diffSum = lvSumme - totalAbgerechnet;

    const erledigt = rows.filter((r) => {
      const soll = Number(r.soll || 0);
      const ist = Number(r.ist || 0);
      return soll > 0 && Math.abs(soll - ist) < 0.0001;
    }).length;

    const ueberfuellt = rows.filter((r) => {
      const soll = Number(r.soll || 0);
      const ist = Number(r.ist || 0);
      return soll > 0 && ist > soll + 0.0001;
    }).length;

    const ohneAufmass = rows.filter((r) => Math.abs(Number(r.ist || 0)) < 0.0001).length;
    const offen = rows.filter((r) => Number(r.soll || 0) - Number(r.ist || 0) > 0.0001).length;
    const mitAufmass = rows.length - ohneAufmass;

    const erfuellungMenge = rows.reduce(
      (sum, r) => sum + Math.max(0, Number(r.ist || 0)),
      0
    );
    const sollMenge = rows.reduce(
      (sum, r) => sum + Math.max(0, Number(r.soll || 0)),
      0
    );
    const erfuellungPct =
    sollMenge > 0 ? erfuellungMenge / sollMenge * 100 : 0;

    return {
      totalAbgerechnet,
      lvSumme,
      diffSum,
      erledigt,
      ueberfuellt,
      ohneAufmass,
      offen,
      mitAufmass,
      erfuellungPct
    };
  }, [rows, project?.code, stickyCode, projectFsKey, projectId]);

  const activeOrt = React.useMemo(
    () => orte.find((ort) => ort.id === activeOrtId) || null,
    [orte, activeOrtId]
  );

  const linkedPositionIds = React.useMemo(() => {
    if (!activeOrtId) return null;
    return new Set(
      ortPositions.
      filter((link) => link.ortId === activeOrtId).
      map((link) => link.positionId)
    );
  }, [activeOrtId, ortPositions]);

  const activeOrtExportRows = React.useMemo(() => {
    if (!activeOrtId) return [] as LVRow[];

    const ortIds = new Set<string>([activeOrtId]);
    let changed = true;
    while (changed) {
      changed = false;
      orte.forEach((ort) => {
        if (ort.parentId && ortIds.has(ort.parentId) && !ortIds.has(ort.id)) {
          ortIds.add(ort.id);
          changed = true;
        }
      });
    }

    const positionIds = new Set(
      ortPositions.
      filter((link) => ortIds.has(link.ortId)).
      map((link) => link.positionId)
    );

    return rows.filter((row) => positionIds.has(safeTrim(row.pos)));
  }, [activeOrtId, orte, ortPositions, rows]);

  const exportActiveOrtPdf = React.useCallback(() => {
    if (!activeOrt) {
      showRlcMessage("Bitte zuerst einen Ort auswählen.");
      return;
    }
    if (!activeOrtExportRows.length) {
      showRlcMessage("Dieser Ort enthält keine Aufmaß-Positionen.");
      return;
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const ortLabel = `${safeTrim(activeOrt.nummer) || "—"} · ${activeOrt.name}`;
    const projectCode = String(project?.code || stickyCode || projectId || "Projekt");
    const createdLabel = new Date().toLocaleString("de-DE");
    const summe = activeOrtExportRows.reduce(
      (sum, row) => sum + row.ist * row.ep * (row.factor ?? 1),
      0
    );
    const sollWert = activeOrtExportRows.reduce(
      (sum, row) => sum + row.soll * row.ep,
      0
    );
    const offeneDifferenz = sollWert - summe;

    const ortLabelForRow = (row: LVRow): string => {
      const linkedOrtIds = new Set(
        ortPositions.
        filter((link) => link.positionId === safeTrim(row.pos)).
        map((link) => link.ortId)
      );

      return orte.
      filter((ort) => linkedOrtIds.has(ort.id)).
      sort(
        (a, b) =>
        a.sortOrder - b.sortOrder ||
        String(a.nummer || "").localeCompare(
          String(b.nummer || ""),
          "de-DE",
          { numeric: true }
        )
      ).
      map((ort) => {
        const prefix = ort.parentId ? "Unterort" : "Ort";
        return `${prefix}: ${safeTrim(ort.nummer) || "—"} · ${ort.name}`;
      }).
      join("\n");
    };

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.setFillColor(11, 58, 173);
    pdf.rect(0, 0, pageWidth, 26, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("RLC Bausoftware", 14, 11);
    pdf.setFontSize(12);
    pdf.text("Aufmaßblatt nach Ort", 14, 19);

    drawCompanyPdfHeader(pdf, companyPdfHeader);

    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text(`Ort: ${ortLabel}`, 14, 36);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Projekt: ${projectCode}`, 14, 43);
    pdf.text(`Erstellt: ${createdLabel}`, 14, 48);
    pdf.text(`Positionen: ${activeOrtExportRows.length}`, 14, 53);

    const metrics = [
    { label: "LV-Wert netto", value: fmtEUR(sollWert) },
    { label: "Abgerechnet netto", value: fmtEUR(summe) },
    { label: "Offene Differenz", value: fmtEUR(offeneDifferenz) }];

    metrics.forEach((metric, index) => {
      const x = 125 + index * 55;
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(217, 226, 241);
      pdf.roundedRect(x, 33, 50, 20, 2, 2, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(metric.label, x + 3, 39);
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 42);
      pdf.text(metric.value, x + 3, 48);
    });

    autoTable(pdf, {
      startY: 60,
      margin: { left: 14, right: 14, bottom: 16 },
      head: [[
      "Ort / Unterort",
      "Pos.",
      "Kurztext",
      "ME",
      "LV Soll",
      "Ist",
      "Differenz",
      "Faktor",
      "EP netto",
      "Gesamt netto"]],

      body: activeOrtExportRows.map((row) => {
        const faktor = row.factor ?? 1;
        return [
        ortLabelForRow(row),
        row.pos,
        row.text,
        row.unit,
        fmtNumDE(row.soll),
        fmtNumDE(row.ist),
        fmtNumDE(row.soll - row.ist),
        fmtNumDE(faktor, 2),
        fmtEUR(row.ep),
        fmtEUR(row.ist * row.ep * faktor)];

      }),
      styles: {
        fontSize: 7.5,
        cellPadding: 2.1,
        valign: "middle",
        overflow: "linebreak",
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [21, 94, 239],
        textColor: 255,
        fontStyle: "bold",
        minCellHeight: 8
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: "bold" },
        1: { cellWidth: 16, fontStyle: "bold" },
        2: { cellWidth: 58 },
        3: { cellWidth: 12 },
        4: { cellWidth: 19, halign: "right" },
        5: { cellWidth: 19, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 16, halign: "right" },
        8: { cellWidth: 23, halign: "right" },
        9: { cellWidth: 27, halign: "right", fontStyle: "bold" }
      },
      didDrawPage: () => {
        pdf.setDrawColor(226, 232, 240);
        pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`RLC Bausoftware · Projekt ${projectCode} · Ort ${ortLabel}`, 14, pageHeight - 6);
        pdf.text(`Seite ${pdf.getNumberOfPages()}`, pageWidth - 14, pageHeight - 6, { align: "right" });
      }
    });

    const filename = `${safeTrim(activeOrt.nummer)}_${activeOrt.name}`.
    replace(/[<>:"/\|?*]/g, "_").
    replace(/\s+/g, "_");
    saveRlcPdfWithCompanyHeader(pdf, `Aufmass_Ort_${filename}.pdf`);
  }, [activeOrt, activeOrtExportRows, project?.code, stickyCode, projectId]);

  const exportActiveOrtCsv = React.useCallback(() => {
    if (!activeOrt) {
      showRlcMessage("Bitte zuerst einen Ort auswählen.");
      return;
    }
    if (!activeOrtExportRows.length) {
      showRlcMessage("Dieser Ort enthält keine Aufmaß-Positionen.");
      return;
    }

    const header = ["Ort-Nr.", "Ort", "Pos.", "Kurztext", "Einheit", "LV Soll", "Ist", "Differenz", "EP", "Faktor", "Gesamt"];
    const lines = activeOrtExportRows.map((row) => {
      const faktor = row.factor ?? 1;
      return [
      activeOrt.nummer,
      activeOrt.name,
      row.pos,
      row.text,
      row.unit,
      row.soll,
      row.ist,
      row.soll - row.ist,
      row.ep,
      faktor,
      row.ist * row.ep * faktor];

    });
    const csv = [header, ...lines].
    map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).
    join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const filename = `${safeTrim(activeOrt.nummer)}_${activeOrt.name}`.
    replace(/[<>:"/\|?*]/g, "_").
    replace(/\s+/g, "_");
    a.download = `Aufmass_Ort_${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [activeOrt, activeOrtExportRows]);

  const createOrt = React.useCallback(() => {
    const nummer = safeTrim(newOrtNummer);
    const name = safeTrim(newOrtName);
    if (!projectId || !nummer || !name) {
      showRlcMessage("Bitte Ort-Nummer und Bezeichnung eingeben.");
      return;
    }
    const duplicate = orte.some(
      (ort) =>
      ort.parentId === (newOrtParentId || null) && (
      safeTrim(ort.nummer).toLowerCase() === nummer.toLowerCase() ||
      ort.name.toLowerCase() === name.toLowerCase())
    );
    if (duplicate) {
      showRlcMessage("Dieser Ort existiert in dieser Ebene bereits.");
      return;
    }
    const next: Ort = {
      id: safeUUID(),
      projectId,
      parentId: newOrtParentId || null,
      nummer,
      name,
      description: "",
      color: "#146EF5",
      sortOrder: orte.length + 1
    };
    setOrte((prev) => [...prev, next]);
    setNewOrtNummer("");
    setNewOrtName("");
    setNewOrtParentId("");
  }, [projectId, newOrtNummer, newOrtName, newOrtParentId, orte]);

  const assignCheckedToOrt = React.useCallback(
    (ortId: string) => {
      const ids = checkedRowIds.size ?
      Array.from(checkedRowIds) :
      selId ?
      [selId] :
      [];
      if (!ids.length) {
        showRlcMessage(
          "Bitte zuerst mindestens eine Aufmaß-Position auswählen."
        );
        return;
      }
      const positionKeys = ids.
      map((rowId) => rows.find((row) => row.id === rowId)).
      filter((row): row is LVRow => Boolean(row)).
      map((row) => safeTrim(row.pos)).
      filter(Boolean);

      setOrtPositions((prev) => {
        const keys = new Set(prev.map((x) => `${x.ortId}:${x.positionId}`));
        const next = [...prev];
        positionKeys.forEach((positionId) => {
          const key = `${ortId}:${positionId}`;
          if (!keys.has(key)) next.push({ ortId, positionId });
        });
        return next;
      });
    },
    [checkedRowIds, selId, rows]
  );

  const removeCheckedFromOrt = React.useCallback(() => {
    if (!activeOrtId) return;
    const rowIds = checkedRowIds.size ?
    checkedRowIds :
    selId ?
    new Set([selId]) :
    new Set<string>();
    if (!rowIds.size) return;
    const positionKeys = new Set(
      rows.
      filter((row) => rowIds.has(row.id)).
      map((row) => safeTrim(row.pos)).
      filter(Boolean)
    );
    setOrtPositions((prev) =>
    prev.filter(
      (link) => !(link.ortId === activeOrtId && positionKeys.has(link.positionId))
    )
    );
  }, [activeOrtId, checkedRowIds, selId, rows]);

  const removeSelectedFromOrt = React.useCallback(
    (ortId: string) => {
      if (!selected) return;
      setOrtPositions((prev) =>
      prev.filter(
        (link) =>
        !(link.ortId === ortId && link.positionId === safeTrim(selected.pos))
      )
      );
    },
    [selected]
  );

  const selectedOrte = React.useMemo(() => {
    if (!selected) return [];
    const ids = new Set(
      ortPositions.
      filter((link) => link.positionId === safeTrim(selected.pos)).
      map((link) => link.ortId)
    );
    return orte.
    filter((ort) => ids.has(ort.id)).
    sort((a, b) =>
    String(a.nummer || "").localeCompare(String(b.nummer || ""), "de-DE", { numeric: true })
    );
  }, [selected, ortPositions, orte]);

  const deleteOrt = React.useCallback(
    (ortId: string) => {
      const target = orte.find((x) => x.id === ortId);
      if (!target) return;
      if (
      !window.confirm(
        `Ort „${target.name}“ und seine Unterorte wirklich löschen?`
      ))

      return;
      const deleteIds = new Set<string>([ortId]);
      let changed = true;
      while (changed) {
        changed = false;
        orte.forEach((x) => {
          if (x.parentId && deleteIds.has(x.parentId) && !deleteIds.has(x.id)) {
            deleteIds.add(x.id);
            changed = true;
          }
        });
      }
      setOrte((prev) => prev.filter((x) => !deleteIds.has(x.id)));
      setOrtPositions((prev) => prev.filter((x) => !deleteIds.has(x.ortId)));
      if (activeOrtId && deleteIds.has(activeOrtId)) setActiveOrtId(null);
    },
    [orte, activeOrtId]
  );

  const filteredLv = React.useMemo(() => {
    const q = safeTrim(lvFilter).toLowerCase();
    return lvRows.filter((x) => {
      if (!q) return true;
      return `${x.pos} ${x.text} ${x.unit}`.toLowerCase().includes(q);
    });
  }, [lvRows, lvFilter]);

  const filteredRows = React.useMemo(() => {
    const q = safeTrim(rowFilter).toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter((r) =>
      `${r.pos} ${r.text} ${r.unit} ${r.note ?? ""} ${orte.
      filter((ort) =>
      ortPositions.some(
        (link) => link.ortId === ort.id && link.positionId === safeTrim(r.pos)
      )
      ).
      map((ort) => `${ort.nummer} ${ort.name}`).
      join(" ")}`.
      toLowerCase().
      includes(q)
      );
    }
    if (linkedPositionIds) out = out.filter((r) => linkedPositionIds.has(safeTrim(r.pos)));
    if (onlyDiff)
    out = out.filter((r) => Math.abs((r.soll ?? 0) - (r.ist ?? 0)) > 0);
    return out;
  }, [rows, rowFilter, onlyDiff, linkedPositionIds, orte, ortPositions]);

  const aufmassStatus = React.useMemo(() => {
    const epsilon = 0.0001;
    let erledigt = 0;
    let offen = 0;
    let ohne = 0;
    let ueber = 0;
    let differenzen = 0;

    rows.forEach((row) => {
      const soll = Number(row.soll || 0);
      const ist = Number(row.ist || 0);
      if (Math.abs(ist) <= epsilon) ohne += 1;
      if (soll > epsilon && Math.abs(soll - ist) <= epsilon) erledigt += 1;
      if (soll > epsilon && ist < soll - epsilon) offen += 1;
      if (soll > epsilon && ist > soll + epsilon) ueber += 1;
      if (Math.abs(soll - ist) > epsilon) differenzen += 1;
    });

    return { erledigt, offen, ohne, ueber, differenzen };
  }, [rows]);

  const prepareUnterort = React.useCallback(
    (parent: Ort) => {
      setNewOrtParentId(parent.id);
      setNewOrtNummer(
        safeTrim(parent.nummer) ? `${safeTrim(parent.nummer)}.` : ""
      );
      setNewOrtName("");

      window.setTimeout(() => {
        const input = document.getElementById(
          "rlc-new-ort-nummer"
        ) as HTMLInputElement | null;
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    },
    []
  );

  const renderOrtTree = React.useCallback(
    (parentId: string | null = null, depth = 0): React.ReactNode => {
      return orte.
      filter((ort) => ort.parentId === parentId).
      sort(
        (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de-DE")
      ).
      map((ort) => {
        const count = ortPositions.filter(
          (link) => link.ortId === ort.id
        ).length;
        return (
          <React.Fragment key={ort.id}>
              <div className={rlcClass(null,
            {
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto auto",
              gap: 6,
              alignItems: "center",
              marginLeft: depth * 22,
              paddingLeft: 10,
              borderLeft: depth === 0 ? "3px solid #146EF5" : "2px solid #CBD5E1"
            })}>
              
                <button
                type="button" className={rlcClass(null,
                {
                  ...btn,
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "90px minmax(0, 1fr) 70px",
                  textAlign: "left",
                  justifyContent: "stretch",
                  background: activeOrtId === ort.id ? "#EAF2FF" : "#FFFFFF",
                  borderColor: activeOrtId === ort.id ? "#93C5FD" : "#D9E2F1",
                  color: activeOrtId === ort.id ? "#0B5BD3" : "#0F172A"
                })}
                onClick={() => setActiveOrtId(ort.id)}>
                
                  <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1105">{safeTrim(ort.nummer) || "—"}</span>
                  <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1106">{ort.name}</span>
                  <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1107">{count}</span>
                </button>
                <button
                type="button" className={rlcClass(null,
                { ...btn, padding: "6px 10px" })}
                onClick={() => prepareUnterort(ort)}
                title={`Unterort unter ${ort.name} anlegen`}>
                
                  + Unterort
                </button>
                <button
                type="button" className={rlcClass(null,
                { ...btnDanger, padding: "6px 8px" })}
                onClick={() => deleteOrt(ort.id)}
                title="Bereich löschen">
                
                  ×
                </button>
              </div>
              {renderOrtTree(ort.id, depth + 1)}
            </React.Fragment>);

      });
    },
    [orte, ortPositions, activeOrtId, deleteOrt, prepareUnterort]
  );

  const openFormulaEditor = React.useCallback(() => {
    if (!selected) return;
    setEditingEntryId(null);
    setEditBuffer("");
    setMassLabelBuffer(`Aufmaß ${(selected.entries?.length || 0) + 1}`);
    setMassNoteBuffer("");
    setMassFactorBuffer(String(selected.factor ?? 1).replace(".", ","));
    setMassKreisBuffer("1");
    setMassBlattBuffer("1");
    setMassOrtBuffer("");
    setEditOpen(true);
  }, [selected]);

  const openMassEditor = React.useCallback(() => {
    if (!selected) return;
    setMassBuffer(formulaToMassText(selected.formula ?? ""));
    setMassOpen(true);
  }, [selected]);

  const addMassEntryToSelected = React.useCallback(async () => {
    if (!selected) return;

    const formulaText = safeTrim(editBuffer);
    if (!formulaText) {
      showRlcMessage("Bitte einen Rechenansatz eingeben.");
      return;
    }

    try {
      // Verhindert, dass ein älterer Auto-Save mit leeren entries
      // den gerade gespeicherten Stand unmittelbar wieder überschreibt.
      serverSaveGenerationRef.current += 1;
      if (serverSaveTimerRef.current) {
        window.clearTimeout(serverSaveTimerRef.current);
        serverSaveTimerRef.current = null;
      }

      const currentRows = rowsRef.current;
      const currentSelected = currentRows.find((row) => row.id === selected.id);
      if (!currentSelected) {
        throw new Error("Ausgewählte Aufmaßposition wurde nicht gefunden.");
      }

      const entryFactor = nrmNumber(massFactorBuffer, 1) || 1;
      const kreis = Math.max(1, Math.trunc(nrmNumber(massKreisBuffer, 1)));
      const blatt = Math.max(1, Math.trunc(nrmNumber(massBlattBuffer, 1)));

      const nextRows = currentRows.map((row) => {
        if (row.id !== selected.id) return row;

        const oldEntries = Array.isArray(row.entries) ? row.entries : [];
        let entries: AufmassEntry[];

        if (editingEntryId) {
          entries = oldEntries.map((entry) =>
          entry.id !== editingEntryId ?
          entry :
          {
            ...entry,
            label: safeTrim(massLabelBuffer) || entry.label,
            note: massNoteBuffer,
            formula: formulaText,
            factor: entryFactor,
            kreis,
            blatt,
            ortId: massOrtBuffer || undefined,
            menge: parseMassEditorLines(formulaText) * entryFactor,
            unit: row.unit,
            ep: row.ep
          }
          );
        } else {
          const nextEntry = makeAufmassEntry(
            formulaText,
            oldEntries.length + 1,
            massNoteBuffer,
            entryFactor,
            row.unit,
            row.ep
          );
          entries = [
          ...oldEntries,
          {
            ...nextEntry,
            label: safeTrim(massLabelBuffer) || nextEntry.label,
            kreis,
            blatt,
            ortId: massOrtBuffer || undefined
          }];

        }

        return {
          ...row,
          entries,
          formula: entriesToFormula(entries),
          ist: entriesSum(entries)
        };
      });

      const positionId = safeTrim(currentSelected.pos);
      const editedEntry = (currentSelected.entries || []).find(
        (entry) => entry.id === editingEntryId
      );
      const oldOrtId = safeTrim(editedEntry?.ortId);
      let nextOrtPositions = [...ortPositions];

      if (oldOrtId && oldOrtId !== massOrtBuffer) {
        const oldOrtStillUsed = nextRows.some((row) =>
        (row.entries || []).some((entry) => safeTrim(entry.ortId) === oldOrtId)
        );
        if (!oldOrtStillUsed) {
          nextOrtPositions = nextOrtPositions.filter(
            (link) => !(link.positionId === positionId && link.ortId === oldOrtId)
          );
        }
      }

      if (massOrtBuffer) {
        const exists = nextOrtPositions.some(
          (link) => link.ortId === massOrtBuffer && link.positionId === positionId
        );
        if (!exists) {
          nextOrtPositions.push({ ortId: massOrtBuffer, positionId });
        }
      }

      // Prima aggiorna il riferimento sincrono e lo stato locale,
      // poi salva esattamente questo snapshot sul server.
      rowsRef.current = nextRows;
      setRows(nextRows);
      setOrtPositions(nextOrtPositions);
      setExpandedRowIds((prev) => new Set(prev).add(selected.id));
      if (projectId) AUFMASS.save(projectId, nextRows);

      await Promise.all([
      serverSaveAufmass(toAufmassJson(nextRows)),
      serverSaveSollIst(toSollIst(nextRows)),
      serverSaveOrte(orte, nextOrtPositions)]
      );

      setLastSavedAt(new Date().toISOString());
      setEditOpen(false);
      setEditingEntryId(null);
      setEditBuffer("");
      setMassLabelBuffer("");
      setMassNoteBuffer("");
      setMassFactorBuffer("1");
      setMassKreisBuffer("1");
      setMassBlattBuffer("1");
      setMassOrtBuffer("");
    } catch (error: any) {
      console.error("[AUFMASS] Aufmaßzeile konnte nicht gespeichert werden", error);
      showRlcMessage(
        `Aufmaßzeile konnte nicht auf dem Server gespeichert werden:\n${
        error?.message || "Unbekannter Fehler"}`

      );
    }
  }, [
  selected,
  rows,
  orte,
  ortPositions,
  projectId,
  editBuffer,
  massLabelBuffer,
  massNoteBuffer,
  massFactorBuffer,
  massKreisBuffer,
  massBlattBuffer,
  massOrtBuffer,
  editingEntryId,
  serverSaveAufmass,
  serverSaveSollIst,
  serverSaveOrte]
  );

  const editMassEntry = React.useCallback(
    (row: LVRow, entry: AufmassEntry) => {
      setSelId(row.id);
      setEditingEntryId(entry.id);
      setEditBuffer(entry.formula || "");
      setMassLabelBuffer(entry.label || "");
      setMassNoteBuffer(entry.note || "");
      setMassFactorBuffer(String(entry.factor ?? 1).replace(".", ","));
      setMassKreisBuffer(String(entry.kreis ?? 1));
      setMassBlattBuffer(String(entry.blatt ?? 1));
      const linkedOrt = ortPositions.find(
        (link) => link.positionId === safeTrim(row.pos)
      );
      setMassOrtBuffer(entry.ortId || linkedOrt?.ortId || "");
      setEditOpen(true);
    },
    [ortPositions]
  );

  const updateMassEntry = React.useCallback(
    (rowId: string, entryId: string, patch: Partial<AufmassEntry>) => {
      setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const entries = (row.entries || []).map((entry) => {
          if (entry.id !== entryId) return entry;
          const next = { ...entry, ...patch };
          const factor = Number(next.factor ?? 1) || 1;
          const menge = parseMassEditorLines(next.formula || "") * factor;
          return { ...next, menge };
        });
        return {
          ...row,
          entries,
          formula: entriesToFormula(entries),
          ist: entriesSum(entries)
        };
      })
      );
    },
    []
  );

  const removeMassEntry = React.useCallback(
    (rowId: string, entryId: string) => {
      setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const entries = (Array.isArray(r.entries) ? r.entries : []).filter(
          (e) => e.id !== entryId
        );
        return {
          ...r,
          entries,
          formula: entriesToFormula(entries),
          ist: entriesSum(entries)
        };
      })
      );
    },
    []
  );

  const openNoteEditor = React.useCallback(() => {
    if (!selected) return;
    setNoteBuffer(selected.note ?? "");
    setNoteOpen(true);
  }, [selected]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
      editOpen && (
      e.key === "Escape" || e.key === "Enter" && (e.ctrlKey || e.metaKey)))
      {
        e.preventDefault();
        if (e.key === "Escape") {
          setEditOpen(false);
        } else if (selected) {
          onFormulaChange(selected.id, massTextToFormula(editBuffer));
          setEditOpen(false);
        }
      }

      if (
      massOpen && (
      e.key === "Escape" || e.key === "Enter" && (e.ctrlKey || e.metaKey)))
      {
        e.preventDefault();
        if (e.key === "Escape") {
          setMassOpen(false);
        } else if (selected) {
          void addMassEntryToSelected();
        }
      }

      if (
      noteOpen && (
      e.key === "Escape" || e.key === "Enter" && (e.ctrlKey || e.metaKey)))
      {
        e.preventDefault();
        if (e.key === "Escape") {
          setNoteOpen(false);
        } else if (selected) {
          onNoteChange(selected.id, noteBuffer);
          setNoteOpen(false);
        }
      }

      if (!editOpen && !noteOpen && (e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSaveAufmass();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
  editOpen,
  noteOpen,
  massOpen,
  editBuffer,
  noteBuffer,
  massBuffer,
  massFactorBuffer,
  selected,
  onFormulaChange,
  onNoteChange,
  handleSaveAufmass,
  addMassEntryToSelected]
  );

  return (
    <div className={rlcClass(null, pageContainer)}>
      <style>{`
        /* RLC AUFMASS VISUAL PATCH V3 - deutlich sichtbar */
        input, textarea, button { box-sizing: border-box; }
        table { border-spacing: 0; }
        tbody tr { background: #fff !important; }
        tbody tr[style] { background: #fff !important; }
        tbody tr:hover { background: #f8fbff !important; }
        td { background: inherit !important; }
        button {
          letter-spacing: -0.01em;
        }
      `}</style>

      <div className={rlcClass(null, breadcrumb)}>
        <span>RLC</span>
        <span>/</span>
        <span>Mengenermittlung</span>
        <span>/</span>
        <span className={rlcClass(null, breadcrumbStrong)}>Aufmaß-Editor</span>
      </div>

      <section className={rlcClass("rlc-page-hero", heroCard)}>
        <div className={rlcClass(null, heroTop)}>
          <div>
            <div className={rlcClass(null, heroTitleRow)}>
              <h1 className={rlcClass(null, title)}>Aufmaß-Editor</h1>
            </div>
            <p className={rlcClass(null, subtitle)}>
              Erfassen, bearbeiten und verwalten Sie Aufmaße. Übernehmen Sie
              Positionen aus dem LV, berechnen Sie Mengen, vergleichen Sie
              Soll/Ist und erstellen Sie Abrechnungen und Nachträge.
            </p>
          </div>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          <span className={rlcClass(null, heroPill)}>
            Projekt: {project?.code || stickyCode || "—"}
          </span>
          <span className={rlcClass(null, heroPill)}>RLC-KI Netto: {fmtEUR(totals.lvSumme)}</span>
          <span className={rlcClass(null, heroPill)}>
            Abgerechnet: {fmtEUR(totals.totalAbgerechnet)}
          </span>
          <span className={rlcClass(null, heroPill)}>
            Differenz RLC-KI / Abgerechnet: {fmtEUR(totals.diffSum)}
          </span>
          <span className={rlcClass(null, heroPill)}>
            Bereich: {activeOrt?.name || "Alle Positionen"}
          </span>
          <span className={rlcClass(null, heroPill)}>Status: Entwurf</span>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button className={rlcClass(null,
          { ...btnPrimary, ...(saving ? btnDisabled : {}) })}
          onClick={() => void handleSaveAufmass()}
          disabled={saving}
          title="Ctrl+S"
          type="button">
            
            <RlcSaveIcon /> {saving ? "Speichert..." : "Aufmaß speichern"}
          </button>

          <button className={rlcClass(null,
          btnHero)}
          type="button"
          onClick={handleTransferToKalkulation}>
            
            In Kalkulation übertragen
          </button>

          <button className={rlcClass(null,
          btnHero)}
          type="button"
          onClick={() => handleTransferToBilling("ABSCHLAGSRECHNUNG")}>
            
            In Abschlagsrechnung übernehmen
          </button>

          <button className={rlcClass(null,
          btnHero)}
          type="button"
          onClick={() => handleTransferToBilling("RECHNUNG")}>
            
            In Rechnung übernehmen
          </button>

          <button className={rlcClass(null, btnHero)} type="button" onClick={() => void exportAufmassPdf()}>
            Aufmaßübersicht PDF
          </button>

          <button className={rlcClass(null, btnHero)} type="button" onClick={exportRebPdf}>
            REB-Aufmaßblatt 23.003
          </button>

          <button className={rlcClass(null, btnHero)} type="button" onClick={exportX31}>
            X31 exportieren
          </button>

          <button className={rlcClass(null, btnHero)} type="button" onClick={exportDa11}>
            DA11 exportieren
          </button>

          <button className={rlcClass(null, btnHero)} type="button" onClick={exportCsv}>
            CSV erzeugen
          </button>

          <button className={rlcClass(null,
          btn)}
          type="button"
          onClick={() => navigate("/mengenermittlung/gps")}>
            
            Fotos/GPS verknüpfen
          </button>

        </div>
      </section>

      <section className={rlcClass(null, kpiGrid)}>
        <div className={rlcClass(null, kpiCard)}>
          <div className={rlcClass(null,
          {
            ...kpiIconBase,
            background: "linear-gradient(135deg,#60A5FA,#146EF5)"
          })}>
            
            <RlcDocumentIcon />
          </div>
          <div>
            <div className={rlcClass(null, kpiLabel)}>LV-Positionen</div>
            <div className={rlcClass(null, kpiValue)}>
              {lvRows.length} / {lvRows.length}
            </div>
            <div className={rlcClass(null, kpiHint)}>Gesamtpositionen</div>
          </div>
        </div>

        <div className={rlcClass(null, kpiCard)}>
          <div className={rlcClass(null,
          {
            ...kpiIconBase,
            background: "linear-gradient(135deg,#22C55E,#059669)"
          })}>
            
            <RlcMeasureIcon />
          </div>
          <div>
            <div className={rlcClass(null, kpiLabel)}>Aufgemessen (Ist)</div>
            <div className={rlcClass(null, kpiValue)}>
              {rows.filter((r) => Math.abs(r.ist || 0) > 0).length}
            </div>
            <div className={rlcClass(null, kpiHint)}>Positionen mit Ist-Menge</div>
          </div>
        </div>

        <div className={rlcClass(null, kpiCard)}>
          <div className={rlcClass(null,
          {
            ...kpiIconBase,
            background: "linear-gradient(135deg,#FBBF24,#F59E0B)"
          })}>
            
            <RlcPlusMinusIcon />
          </div>
          <div>
            <div className={rlcClass(null, kpiLabel)}>Differenz RLC-KI / Abgerechnet</div>
            <div className={rlcClass(null, kpiValue)}>{fmtEUR(totals.diffSum)}</div>
            <div className={rlcClass(null, kpiHint)}>
              {Math.abs(totals.diffSum) < 0.005 ?
              "Keine Abweichung" :
              "Differenz offen"}
            </div>
          </div>
        </div>

        <div className={rlcClass(null, kpiCard)}>
          <div className={rlcClass(null,
          {
            ...kpiIconBase,
            background: "linear-gradient(135deg,#8B5CF6,#7C3AED)"
          })}>
            
            <RlcCheckIcon />
          </div>
          <div>
            <div className={rlcClass(null, kpiLabel)}>Letzte Speicherung</div>
            <div className={rlcClass(null, { ...kpiValue, fontSize: 22 })}>{lastSavedLabel}</div>
            <div className={rlcClass(null, kpiHint)}>Auto-Save aktiv · Ctrl+S</div>
          </div>
        </div>
      </section>

      <section className={rlcClass(null, workflowCard)}>
        <button className={rlcClass(null,
        workflowStep)}
        type="button"
        onClick={() => navigate("/mengenermittlung/aufmasseditor")}>
          
          <span className={rlcClass(null, workflowBubble)}>1</span> LV-Position
        </button>
        <span className={rlcClass(null, workflowArrow)}>→</span>
        <span className={rlcClass(null, workflowStepActive)}>
          <span className={rlcClass(null, workflowBubble)}>2</span> Aufmaß
        </span>
        <span className={rlcClass(null, workflowArrow)}>→</span>
        <button className={rlcClass(null,
        workflowStep)}
        type="button"
        onClick={() => navigate("/mengenermittlung/soll-ist")}>
          
          <span className={rlcClass(null, workflowBubble)}>3</span> Soll/Ist
        </button>
        <span className={rlcClass(null, workflowArrow)}>→</span>
        <button className={rlcClass(null, workflowStep)} type="button" onClick={() => navigate("/mengenermittlung/soll-ist")}>
          <span className={rlcClass(null, workflowBubble)}>4</span> Kontrolle
        </button>
        <span className={rlcClass(null, workflowArrow)}>→</span>
        <button className={rlcClass(null, workflowStep)} type="button" onClick={exportRebPdf}>
          <span className={rlcClass(null, workflowBubble)}>5</span> REB
        </button>
        <span className={rlcClass(null, workflowArrow)}>→</span>
        <button className={rlcClass(null, workflowStep)} type="button" onClick={() => handleTransferToBilling("RECHNUNG")}>
          <span className={rlcClass(null, workflowBubble)}>6</span> Rechnung
        </button>
      </section>

      <section className={rlcClass(null,
      {
        ...card,
        padding: "12px 16px",
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
        gap: 10,
        alignItems: "stretch"
      })}>
        
        {[
        ["Positionen", rows.length, "#0F172A"],
        ["Mit Aufmaß", totals.mitAufmass, "#146EF5"],
        ["Erledigt", totals.erledigt, "#059669"],
        ["Offen", totals.offen, "#D97706"],
        ["Ohne Aufmaß", totals.ohneAufmass, "#64748B"],
        ["Übererfüllt", totals.ueberfuellt, "#DC2626"]].
        map(([label, value, color]) =>
        <div
          key={String(label)} className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1108">






          
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1109">
              {label}
            </div>
            <div className={rlcClass(null,
          {
            marginTop: 3,
            fontSize: 20,
            lineHeight: 1,
            color: String(color),
            fontWeight: 700
          })}>
            
              {value}
            </div>
          </div>
        )}
      </section>

      <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1110">
          <section className={rlcClass(null,
        {
          ...card,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1
        })}>
          
            <div className={rlcClass(null, { ...cardTitleRow, flex: "0 0 auto" })}>
              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1111">
                <div className={rlcClass(null, cardTitle)}>Leistungsverzeichnis (Projekt-LV)</div>
                <div className={rlcClass(null, cardHint)}>
                  Doppelklick auf eine LV-Zeile, um sie unten ins Aufmaß zu
                  übernehmen.
                </div>
              </div>

              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1112">






              
                <input className={rlcClass(null,
              { ...inpBase, width: 360 })}
              placeholder="LV filtern (Pos / Text / Einheit)…"
              value={lvFilter}
              onChange={(e) => setLvFilter(e.target.value)} />
              
                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1113">

                
                  {lvRows.length ?
                <>
                      Treffer: <b>{filteredLv.length}</b> / {lvRows.length}
                    </> :

                <>—</>
                }
                </div>
                <button className={rlcClass(null, btn)} type="button">
                  Filter
                </button>
              </div>
            </div>

            <div className={rlcClass(null,
          {
            ...tableWrap,
            maxHeight: 260,
            overflow: "hidden",
            flex: "0 0 auto",
            marginTop: 14
          })}>
            
              {lvLoading ?
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1114">
                  LV wird geladen …
                </div> :
            lvError ?
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1115">






              
                  {lvError}
                </div> :
            lvRows.length === 0 ?
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1116">





              
                  Für dieses Projekt wurde noch kein LV gefunden.
                </div> :

            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1117">





              
                  <table className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1118">





                
                    <thead>
                      <tr>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          Pos.
                        </th>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          Kurztext
                        </th>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          ME
                        </th>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          LV-Menge
                        </th>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          EP (netto)
                        </th>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          Gesamt (netto)
                        </th>
                        <th className={rlcClass(null,
                    {
                      ...th,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#F8FAFC"
                    })}>
                      
                          Aktion
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLv.map((lv) =>
                  <tr
                    key={lv.id}
                    onDoubleClick={() => addRowFromLv(lv)}

                    onMouseEnter={(ev) => {
                      (
                      ev.currentTarget as HTMLTableRowElement).
                      style.background = "#EAF2FF";
                    }}
                    onMouseLeave={(ev) => {
                      (
                      ev.currentTarget as HTMLTableRowElement).
                      style.background = "#FFFFFF";
                    }} className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1119">
                    
                          <td className={rlcClass(null, td)}>
                            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1120">{lv.pos}</div>
                          </td>
                          <td className={rlcClass(null, td)}>{lv.text}</td>
                          <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                            {lv.unit}
                          </td>
                          <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                            {lv.quantity.toLocaleString("de-DE", {
                        maximumFractionDigits: 3
                      })}
                          </td>
                          <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                            {lv.ep.toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}{" "}
                            €
                          </td>
                          <td className={rlcClass(null,
                    {
                      ...td,
                      whiteSpace: "nowrap",
                      fontWeight: 700
                    })}>
                      
                            {fmtEUR(lv.quantity * lv.ep)}
                          </td>
                          <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                            <button className={rlcClass(null,
                      btn)}
                      onClick={() => addRowFromLv(lv)}
                      type="button">
                        
                              + übernehmen
                            </button>
                          </td>
                        </tr>
                  )}
                    </tbody>
                  </table>
                </div>
            }
            </div>

            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1121">













            
              <span>{rows.length} Positionen</span>
              <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1122">{aufmassStatus.erledigt} erledigt</span>
              <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1123">{aufmassStatus.offen} offen</span>
              <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1124">{aufmassStatus.ohne} ohne Aufmaß</span>
              <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1125">{aufmassStatus.ueber} übererfüllt</span>
              <span>{aufmassStatus.differenzen} Differenzen</span>
              <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1126">Netto {fmtEUR(totals.totalAbgerechnet)}</span>
            </div>
          </section>

                    <section className={rlcClass(null,
        {
          ...card,
          overflow: "visible",
          display: "grid",
          gap: 7,
          position: "relative",
          zIndex: 2,
          padding: 12
        })}>
          
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1127">






            
              <div>
                <div className={rlcClass(null, { ...cardTitle, fontSize: 14 })}>
                  Orte / Projektbereiche
                </div>

                <div className={rlcClass(null, { ...cardHint, fontSize: 10.5, marginTop: 2 })}>
                  Ort wählen oder Verwaltung aufklappen.
                </div>
              </div>

              <select className={rlcClass(null,
            {
              ...inpBase,
              width: "100%",
              minHeight: 31,
              padding: "5px 8px",
              fontSize: 11,
              fontWeight: 700
            })}
            value={activeOrtId || ""}
            onChange={(e) => setActiveOrtId(e.target.value || null)}>
              
                <option value="">Alle Positionen</option>

                {orte.
              slice().
              sort(
                (a, b) =>
                a.sortOrder - b.sortOrder ||
                String(a.nummer || "").localeCompare(
                  String(b.nummer || ""),
                  "de-DE",
                  { numeric: true }
                )
              ).
              map((ort) =>
              <option key={ort.id} value={ort.id}>
                      {ort.parentId ? "↳ " : ""}
                      {safeTrim(ort.nummer) || "—"} · {ort.name}
                      {" · "}
                      {
                ortPositions.filter(
                  (link) => link.ortId === ort.id
                ).length
                } Pos.
                    </option>
              )}
              </select>

              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1128">






              
                <button
                type="button" className={rlcClass(null,
                {
                  ...btn,
                  minHeight: 31,
                  padding: "5px 9px",
                  fontSize: 10.5,
                  ...(!activeOrt ? btnDisabled : {})
                })}
                disabled={!activeOrt}
                onClick={exportActiveOrtPdf}>
                
                  PDF
                </button>

                <button
                type="button" className={rlcClass(null,
                {
                  ...btn,
                  minHeight: 31,
                  padding: "5px 9px",
                  fontSize: 10.5,
                  ...(!activeOrt ? btnDisabled : {})
                })}
                disabled={!activeOrt}
                onClick={exportActiveOrtCsv}>
                
                  CSV
                </button>

                <button
                type="button" className={rlcClass(null,
                {
                  ...(activeOrtId === null ? btnPrimary : btn),
                  minHeight: 31,
                  padding: "5px 9px",
                  fontSize: 10.5
                })}
                onClick={() => setActiveOrtId(null)}>
                
                  Alle
                </button>
              </div>
            </div>

            <details className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1129">





            
              <summary className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1130">








              
                Orte verwalten · {orte.length} Bereiche ·{" "}
                {ortPositions.length} Zuordnungen
              </summary>

              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1131">








              
                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1132">







                
                  {orte.length ?
                renderOrtTree() :

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1133">
                      Noch keine Bereiche angelegt.
                    </div>
                }
                </div>

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1134">
                  {newOrtParentId ?
                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1135">









                  
                      Unterort von:{" "}
                      {orte.find((ort) => ort.id === newOrtParentId)?.nummer ||
                  "—"}{" "}
                      ·{" "}
                      {orte.find((ort) => ort.id === newOrtParentId)?.name ||
                  "—"}
                    </div> :
                null}

                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1136">







                  
                    <select className={rlcClass(null,
                  {
                    ...inpBase,
                    width: "100%",
                    minHeight: 30,
                    padding: "4px 7px",
                    fontSize: 10.5
                  })}
                  value={newOrtParentId}
                  onChange={(e) => setNewOrtParentId(e.target.value)}>
                    
                      <option value="">Hauptebene</option>

                      {orte.map((ort) =>
                    <option key={ort.id} value={ort.id}>
                          {safeTrim(ort.nummer) || "—"} · {ort.name}
                        </option>
                    )}
                    </select>

                    <input
                    id="rlc-new-ort-nummer" className={rlcClass(null,
                    {
                      ...inpBase,
                      width: "100%",
                      minHeight: 30,
                      padding: "4px 7px",
                      fontSize: 10.5
                    })}
                    value={newOrtNummer}
                    onChange={(e) => setNewOrtNummer(e.target.value)}
                    placeholder="Nr."
                    onKeyDown={(e) => e.key === "Enter" && createOrt()} />
                  

                    <input className={rlcClass(null,
                  {
                    ...inpBase,
                    width: "100%",
                    minHeight: 30,
                    padding: "4px 7px",
                    fontSize: 10.5
                  })}
                  value={newOrtName}
                  onChange={(e) => setNewOrtName(e.target.value)}
                  placeholder="Bezeichnung"
                  onKeyDown={(e) => e.key === "Enter" && createOrt()} />
                  

                    <button
                    type="button" className={rlcClass(null,
                    {
                      ...btnPrimary,
                      minHeight: 30,
                      padding: "4px 8px",
                      fontSize: 10.5
                    })}
                    onClick={createOrt}>
                    
                      {newOrtParentId ? "+ Unterort" : "+ Neu"}
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </section>
<section className={rlcClass(null,
        {
          ...card,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1
        })}>
          
            <div className={rlcClass(null, cardTitleRow)}>
              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1137">
                <div className={rlcClass(null, cardTitle)}>Aufmaß-Positionen</div>
                <div className={rlcClass(null, cardHint)}>
                  Erfasste Positionen mit Soll/Ist, Teilaufmaßen, EP, Faktor und
                  Gesamtbetrag.
                </div>
              </div>

              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1138">






              
                <button
                type="button" className={rlcClass(null,
                { ...btn, minWidth: 38 })}
                onClick={selectPreviousPosition}
                disabled={!rows.length}
                title="Vorherige Position">
                
                  ‹
                </button>
                <span className={rlcClass(null,
              {
                ...pill,
                minWidth: 165,
                justifyContent: "center",
                background: "#EAF2FF",
                borderColor: "#BED6FF",
                color: "#0B5BD3"
              })}>
                
                  {selected ?
                `${selectedIndex + 1} / ${rows.length} · ${selected.pos}` :
                `0 / ${rows.length}`}
                </span>
                <button
                type="button" className={rlcClass(null,
                { ...btn, minWidth: 38 })}
                onClick={selectNextPosition}
                disabled={!rows.length}
                title="Nächste Position">
                
                  ›
                </button>

                <input className={rlcClass(null,
              { ...inpBase, width: 300 })}
              placeholder="Aufmaß filtern (Pos / Text / Notiz)…"
              value={rowFilter}
              onChange={(e) => setRowFilter(e.target.value)} />
              

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1139">

                
                  Treffer: <b>{filteredRows.length}</b> / {rows.length}
                </div>

                <label className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1140">









                
                  <input
                  type="checkbox"
                  checked={onlyDiff}
                  onChange={(e) => setOnlyDiff(e.target.checked)} />
                
                  nur Differenzen
                </label>
              </div>
            </div>

            <div className={rlcClass(null,
          {
            ...tableWrap,
            height: "min(76vh, 880px)",
            minHeight: 720,
            maxHeight: 880,
            overflow: "auto",
            background: "#FFFFFF",
            marginTop: 14
          })}>
            
              <table className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1141">







              
                <thead>
                  <tr>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 44,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      ✓
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 145,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Pos.
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 560,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Kurztext
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 105,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Einheit
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 120,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      LV Soll
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 120,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Ist
                    </th>
                    <th className={rlcClass(null, { ...th, width: 120, position: "sticky", top: 0, zIndex: 5, background: "#F8FAFC" })}>Offen</th>
                    <th className={rlcClass(null, { ...th, width: 115, position: "sticky", top: 0, zIndex: 5, background: "#F8FAFC" })}>Erfüllung</th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 120,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Differenz
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 170,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      EP (€)
                    </th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 130,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Faktor
                    </th>
                    <th className={rlcClass(null, { ...th, width: 165, position: "sticky", top: 0, zIndex: 5, background: "#F8FAFC" })}>GP LV (€)</th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 170,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      GP Aufmaß (€)
                    </th>
                    <th className={rlcClass(null, { ...th, width: 140, position: "sticky", top: 0, zIndex: 5, background: "#F8FAFC" })}>Status</th>
                    <th className={rlcClass(null,
                  {
                    ...th,
                    width: 120,
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                    background: "#F8FAFC"
                  })}>
                    
                      Aktion
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((r) => {
                  const positionOrteLabel = orte.
                  filter((ort) =>
                  ortPositions.some(
                    (link) =>
                    link.ortId === ort.id &&
                    link.positionId === safeTrim(r.pos)
                  )
                  ).
                  sort(
                    (a, b) =>
                    a.sortOrder - b.sortOrder ||
                    String(a.nummer || "").localeCompare(
                      String(b.nummer || ""),
                      "de-DE",
                      { numeric: true }
                    )
                  ).
                  map((ort) =>
                  `${safeTrim(ort.nummer) || "—"} · ${ort.name}`
                  ).
                  join(", ") || "Nicht zugeordnet";
                  const factor = r.factor ?? 1;
                  const effEP = r.ep * factor;
                  const total = r.ist * effEP;
                  const diff = r.soll - r.ist;
                  const offenMenge = Math.max(0, diff);
                  const gpLv = r.soll * r.ep;
                  const active = r.id === selId;
                  const fulfillment =
                  Number(r.soll || 0) > 0 ?
                  Number(r.ist || 0) / Number(r.soll || 0) * 100 :
                  0;
                  const statusLabel =
                  Math.abs(Number(r.ist || 0)) < 0.0001 ?
                  "Ohne Aufmaß" :
                  fulfillment > 100.0001 ?
                  "Übererfüllt" :
                  fulfillment >= 99.9999 ?
                  "Erledigt" :
                  "Offen";
                  const statusBackground =
                  Math.abs(Number(r.ist || 0)) < 0.0001 ?
                  "#F8FAFC" :
                  fulfillment > 100.0001 ?
                  "#FEF2F2" :
                  fulfillment >= 99.9999 ?
                  "#F0FDF4" :
                  fulfillment >= 80 ?
                  "#FFFBEB" :
                  "#FFFFFF";

                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => {
                          setSelId(r.id);
                          setExpandedRowIds((prev) => {
                            const next = new Set(prev);

                            if (next.has(r.id)) {
                              next.delete(r.id);
                            } else {
                              next.add(r.id);
                            }

                            return next;
                          });
                        }} className={rlcClass(null,
                        {
                          cursor: "pointer",
                          background: active ? "#EAF2FF" : statusBackground,
                          boxShadow: active ? "inset 3px 0 0 #146EF5" : "none"
                        })}
                        onMouseEnter={(ev) => {
                          if (r.id !== selId)
                          (
                          ev.currentTarget as HTMLTableRowElement).
                          style.background = "#EAF2FF";
                        }}
                        onMouseLeave={(ev) => {
                          if (r.id !== selId)
                          (
                          ev.currentTarget as HTMLTableRowElement).
                          style.background = statusBackground;
                        }}>
                        
                        <td className={rlcClass(null, td)}>
                          <input
                            type="checkbox"
                            checked={checkedRowIds.has(r.id)}
                            onClick={(ev) => ev.stopPropagation()}
                            onChange={(e) => {
                              setCheckedRowIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(r.id);else
                                next.delete(r.id);
                                return next;
                              });
                            }} />
                          
                        </td>
                        <td className={rlcClass(null,
                        {
                          ...td,
                          fontWeight: 700,
                          width: 145,
                          minWidth: 145,
                          maxWidth: 145,
                          overflow: "hidden",
                          whiteSpace: "nowrap"
                        })}>
                          
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelId(r.id);

                              setExpandedRowIds((prev) => {
                                const next = new Set(prev);

                                if (next.has(r.id)) {
                                  next.delete(r.id);
                                } else {
                                  next.add(r.id);
                                }

                                return next;
                              });
                            }}















                            title={
                            expandedRowIds.has(r.id) ?
                            "Aufmaßzeilen schließen" :
                            "Aufmaßzeilen öffnen"
                            } className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1142">
                            
                            <span className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1143">






                              
                              {expandedRowIds.has(r.id) ? "▼" : "▶"}
                            </span>

                            <span>{r.pos}</span>
                          </button>
                        </td>

                        <td className={rlcClass(null,
                        {
                          ...td,
                          width: 560,
                          minWidth: 560,
                          overflow: "hidden"
                        })}>
                          
                          <input
                            type="text"
                            value={r.text}
                            onChange={(e) =>
                            setRow(r.id, { text: e.target.value })
                            } className={rlcClass(null,
                            {
                              ...inpBase,
                              width: "100%",
                              minWidth: 0,
                              fontWeight: 750
                            })} />
                          
                        </td>

                        <td className={rlcClass(null, td)}>
                          <input
                            type="text"
                            value={r.unit}
                            onChange={(e) => {
                              const unit = e.target.value;
                              setRow(r.id, {
                                unit,
                                formula: getStandardFormel(unit)
                              });
                            }} className={rlcClass(null,
                            { ...inpBase, width: "100%" })} />
                          
                        </td>

                        <td className={rlcClass(null, td)}>
                          <input
                            type="number"
                            step="0.001"
                            value={r.soll}
                            onChange={(e) => onSollChange(r.id, e.target.value)} className={rlcClass(null,
                            { ...inpBase, width: "100%" })} />
                          
                        </td>

                        <td className={rlcClass(null, { ...td, fontWeight: 700 })}>
                          {safeTrim(r.formula) ?
                          <span>{fmtNumDE(r.ist)}</span> :

                          <input
                            type="number"
                            step="0.001"
                            value={r.ist}
                            onChange={(e) =>
                            onIstManualChange(r.id, e.target.value)
                            } className={rlcClass(null,
                            { ...inpBase, width: "100%" })} />

                          }
                        </td>

                        <td className={rlcClass(null, { ...td, fontWeight: 700 })}>{fmtNumDE(offenMenge)}</td>
                        <td className={rlcClass(null, { ...td, fontWeight: 700, color: fulfillment > 100 ? "#B91C1C" : fulfillment >= 100 ? "#047857" : "#B45309" })}>
                          {fmtNumDE(fulfillment, 1)} %
                        </td>

                        <td className={rlcClass(null,
                        {
                          ...td,
                          fontWeight: 700,
                          color:
                          Math.abs(diff) < 0.0001 ? "#047857" : "#B45309"
                        })}>
                          
                          {fmtNumDE(diff)}
                        </td>

                        <td className={rlcClass(null, td)}>
                          <input
                            type="number"
                            step="0.01"
                            value={r.ep}
                            onChange={(e) => onEPChange(r.id, e.target.value)} className={rlcClass(null,
                            {
                              ...inpBase,
                              width: "100%",
                              minWidth: 132,
                              fontVariantNumeric: "tabular-nums"
                            })} />
                          
                        </td>

                        <td className={rlcClass(null, td)}>
                          <input
                            type="number"
                            step="0.01"
                            value={factor}
                            onChange={(e) =>
                            onFactorChange(r.id, e.target.value)
                            } className={rlcClass(null,
                            {
                              ...inpBase,
                              width: "100%",
                              minWidth: 96,
                              fontVariantNumeric: "tabular-nums"
                            })} />
                          
                        </td>

                        <td className={rlcClass(null, { ...td, whiteSpace: "nowrap", fontWeight: 700 })}>{fmtEUR(gpLv)}</td>
                        <td className={rlcClass(null,
                        {
                          ...td,
                          whiteSpace: "nowrap",
                          fontWeight: 700
                        })}>
                          
                          {fmtEUR(total)}
                        </td>
                        <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                          <span className={rlcClass(null, { ...pill, padding: "5px 9px", background: statusBackground, color: statusLabel === "Übererfüllt" ? "#B91C1C" : statusLabel === "Erledigt" ? "#047857" : statusLabel === "Ohne Aufmaß" ? "#64748B" : "#B45309" })}>
                            {statusLabel}
                          </span>
                        </td>

                        <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                          <button className={rlcClass(null,
                          btnPrimary)}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelId(r.id);
                            window.setTimeout(() => {
                              document.
                              getElementById("rlc-position-bearbeiten")?.
                              scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 0);
                          }}>
                            
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                        {expandedRowIds.has(r.id) &&
                      <tr>
                            <td colSpan={15} className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1144">
                              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1145">
                                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1146">
                                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1147">
                                    Aufmaßzeilen zu Pos. {r.pos} · {r.text}
                                  </div>
                                  <button
                                type="button" className={rlcClass(null,
                                btnPrimary)}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setSelId(r.id);
                                  setEditingEntryId(null);
                                  setEditBuffer("");
                                  setMassLabelBuffer(`Aufmaß ${(r.entries?.length || 0) + 1}`);
                                  setMassNoteBuffer("");
                                  setMassFactorBuffer(String(r.factor ?? 1).replace(".", ","));
                                  setEditOpen(true);
                                }}>
                                
                                    + Zeile
                                  </button>
                                </div>
                                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1148">






                              
                                  <table className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1149">







                                
                                    <thead>
                                      <tr>
                                        {["Kreis", "Blatt", "Nr.", "REB", "Messzahl", "Orte", "Pos.", "Kurztext", "Bezeichnung", "Beschriftung", "Rechenansatz / Masse", "Menge", "Einheit", "Faktor", "Ergebnis", "Aktion"].map((label) =>
                                    <th
                                      key={label} className={rlcClass(null,
                                      {
                                        ...th,
                                        padding: "8px 10px",
                                        position: "sticky",
                                        top: 0,
                                        zIndex: 2,
                                        background: "#F8FAFC"
                                      })}>
                                      
                                            {label}
                                          </th>
                                    )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(r.entries || []).length ?
                                  (r.entries || []).map((entry, entryIndex) =>
                                  <tr key={entry.id}>
                                            <td className={rlcClass(null, td)}>{entry.kreis ?? 1}</td>
                                            <td className={rlcClass(null, td)}>{entry.blatt ?? 1}</td>
                                            <td className={rlcClass(null, td)}>{entry.nr ?? entryIndex + 1}</td>
                                            <td className={rlcClass(null, td)}>{entry.reb || `000${String(entryIndex + 1).padStart(2, "0")}`}</td>
                                            <td className={rlcClass(null, td)}>{entry.messzahl ?? 91}</td>
                                            <td className={rlcClass(null, { ...td, minWidth: 180, whiteSpace: "normal" })}>
                                              {entry.ortId ?
                                      (() => {
                                        const ort = orte.find((item) => item.id === entry.ortId);
                                        return ort ?
                                        `${safeTrim(ort.nummer) || "—"} · ${ort.name}` :
                                        "Nicht zugeordnet";
                                      })() :
                                      "Nicht zugeordnet"}
                                            </td>
                                            <td className={rlcClass(null, { ...td, fontWeight: 700, minWidth: 120 })}>{r.pos}</td>
                                            <td className={rlcClass(null, { ...td, minWidth: 240, fontWeight: 700 })}>{r.text}</td>
                                            <td className={rlcClass(null, { ...td, minWidth: 150 })}>{entry.label || `Aufmaß ${entryIndex + 1}`}</td>
                                            <td className={rlcClass(null, { ...td, minWidth: 220 })}>{entry.note || "—"}</td>
                                            <td className={rlcClass(null, { ...td, fontFamily: "ui-monospace, Menlo, Consolas, monospace", whiteSpace: "pre-wrap", minWidth: 260 })}>{entry.formula}</td>
                                            <td className={rlcClass(null, { ...td, fontWeight: 700 })}>{fmtNumDE(entry.menge)}</td>
                                            <td className={rlcClass(null, td)}>{entry.unit || r.unit}</td>
                                            <td className={rlcClass(null, td)}>{fmtNumDE(entry.factor ?? 1, 2)}</td>
                                            <td className={rlcClass(null, { ...td, fontWeight: 700 })}>{fmtEUR(entry.menge * r.ep * (entry.factor ?? 1))}</td>
                                            <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                                              <button type="button" className={rlcClass(null, btn)} onClick={(ev) => {ev.stopPropagation();editMassEntry(r, entry);}}>Bearbeiten</button>
                                              <button type="button" className={rlcClass(null, { ...btnDanger, marginLeft: 6 })} onClick={(ev) => {ev.stopPropagation();removeMassEntry(r.id, entry.id);}}>Löschen</button>
                                            </td>
                                          </tr>
                                  ) :

                                  <tr>
                                          <td
                                      colSpan={16} className={rlcClass(null,
                                      {
                                        ...td,
                                        color: "#64748B",
                                        padding: "14px 12px",
                                        background: "#FFFFFF"
                                      })}>
                                      
                                            Noch keine Aufmaßzeilen vorhanden. Mit „+ Zeile“ eine neue Aufmaßzeile anlegen.
                                          </td>
                                        </tr>
                                  }
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                      }
                      </React.Fragment>);

                })}
                </tbody>

                <tfoot>
                  <tr>
                    <td className={rlcClass(null,
                  { ...td, fontWeight: 700, background: "#F8FAFC" })}
                  colSpan={8}>
                    
                      RLC-KI Netto: {fmtEUR(totals.lvSumme)}
                    </td>
                    <td className={rlcClass(null,
                  { ...td, fontWeight: 700, background: "#F8FAFC" })}
                  colSpan={6}>
                    
                      Summe Total Abgerechnet: {fmtEUR(totals.totalAbgerechnet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className={rlcClass(null, { ...toolbar, marginTop: 14, marginBottom: 14 })}>
              <button className={rlcClass(null, btn)} onClick={addRow} type="button">
                + Zeile
              </button>

              <button className={rlcClass(null,
            { ...btn, ...(selected ? {} : btnDisabled) })}
            onClick={dupRow}
            disabled={!selected}
            type="button">
              
                Zeile duplizieren
              </button>

              <button className={rlcClass(null,
            { ...btn, ...(selected ? {} : btnDisabled) })}
            onClick={delRow}
            disabled={!selected}
            type="button">
              
                Löschen
              </button>

              <button className={rlcClass(null, btn)} onClick={sortByPos} type="button">
                Sortieren (Pos)
              </button>

              <button className={rlcClass(null,
            btn)}
            type="button"
            onClick={async () => {
              if (!projectFsKey && !projectId || !projectId) {
                showRlcMessage("Kein Projekt gewählt.");
                return;
              }

              try {
                const data = await serverLoadAutoKi();
                const boxes = Array.isArray(data?.boxes) ? data.boxes : [];
                if (!boxes.length) {
                  showRlcMessage("AutoKI: keine Boxen gefunden.");
                  return;
                }

                const note = safeTrim(data?.note) || "AutoKI Import";
                const autoRows = fromAutoKiBoxesToRows(boxes, note);

                setRows(autoRows);
                setSelId(autoRows[0]?.id ?? null);
                AUFMASS.save(projectId, autoRows);

                showRlcMessage(
                  `AutoKI geladen • ${autoRows.length} Zeile(n)`
                );
              } catch (e: any) {
                showRlcMessage(
                  `AutoKI Fehler:\n${e?.message || "Unbekannt"}`
                );
              }
            }}
            title="Lädt data/projects/<FSKEY>/auto-ki/auto-ki.json">
              
                AutoKI laden
              </button>

              <button className={rlcClass(null,
            btn)}
            type="button"
            onClick={() => {
              if (!projectFsKey && !projectId) {
                showRlcMessage("Kein Projekt gewählt.");
                return;
              }

              navigate(
                `/ki/fotoerkennung?projectId=${encodeURIComponent(
                  projectId || ""
                )}&projectKey=${encodeURIComponent(projectFsKey)}&from=aufmasseditor`
              );
            }}>
              
                KI Foto-Aufmaß
              </button>

              <button className={rlcClass(null,
            btn)}
            type="button"
            onClick={() => navigate("/mengenermittlung/aufmasseditor")}>
              
                Zur Mengenermittlung (LV)
              </button>
              <button className={rlcClass(null,
            { ...btn, ...(loadBusy ? btnDisabled : {}) })}
            onClick={() => void handleLoadAufmass()}
            disabled={loadBusy}
            title={loadBusy ? "Lädt..." : "Aufmaß laden"}
            type="button">
              
                {loadBusy ? "Lädt…" : "Aufmaß laden"}
              </button>

              <button className={rlcClass(null,
            btnDanger)}
            onClick={handleClearAufmass}
            type="button">
              
                Aufmaß zurücksetzen
              </button>

              <button className={rlcClass(null,
            { ...btnPrimary, ...(saving ? btnDisabled : {}) })}
            onClick={() => void handleSaveAufmass()}
            disabled={saving}
            title="Ctrl+S"
            type="button">
              
                <RlcSaveIcon /> {saving ? "Speichert..." : "Aufmaß speichern"}
              </button>
            </div>
          </section>

          <section className={rlcClass(null,
        {
          ...card,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1
        })}>
          
            <div
            id="rlc-position-bearbeiten" className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1150">








            
              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1151">










              
                <div>
                  <div className={rlcClass(null, { ...cardTitle, marginBottom: 3 })}>
                    Position bearbeiten
                  </div>
                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1152">
                    Technische Aufmaß-Maske: Positionsdaten, Langtext,
                    Masseingabe, Beschriftung und Ergebnis in einer Ansicht.
                  </div>
                </div>
                {selected ?
              <div className={rlcClass(null,
              {
                ...pill,
                background: "#EAF2FF",
                borderColor: "#BED6FF",
                color: "#0B5BD3",
                fontWeight: 700
              })}>
                
                    Pos. {selected.pos || "—"}
                  </div> :
              null}
              </div>

              {!selected ?
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1153">
                  Wähle oben eine Position aus.
                </div> :

            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1154">
                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1155">





                
                    {[
                ["LV", selected.unit],
                ["LV Soll", fmtNumDE(selected.soll)],
                ["Ist", fmtNumDE(selected.ist)],
                ["GP LV", fmtEUR(selected.soll * selected.ep)],
                ["EP", fmtEUR(selected.ep)],
                ["Eff. EP", fmtEUR(selected.ep * (selected.factor ?? 1))],
                [
                "Erfüllung",
                `${fmtNumDE(
                  selected.soll > 0 ?
                  selected.ist / selected.soll * 100 :
                  0,
                  1
                )} %`],

                ["Aufmaßzeilen", String(selected.entries?.length || 0)],
                [
                "Gesamt (€)",
                fmtEUR(
                  selected.ist * (
                  selected.ep * (selected.factor ?? 1))
                )],

                [
                "Status",
                selected.ist > 0 ? "Masse vorhanden" : "Masse fehlt"]].

                map(([label, value]) =>
                <div
                  key={label} className={rlcClass(null,
                  {
                    ...inpBase,
                    background: "#F8FAFC",
                    minWidth: 0
                  })}>
                  
                        <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1156">






                    
                          {label}
                        </div>
                        <div className={rlcClass(null,
                  {
                    marginTop: 3,
                    fontSize: label === "Gesamt (€)" ? 16 : 14,
                    fontWeight: 700,
                    color:
                    label === "Status" ?
                    selected.ist > 0 ?
                    "#047857" :
                    "#B45309" :
                    "#0F172A",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  })}
                  title={String(value)}>
                    
                          {value}
                        </div>
                      </div>
                )}
                  </div>
                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1157">







                
                    <div className={rlcClass(null, lbl)}>Pos.</div>
                    <input
                  type="text"
                  value={selected.pos}
                  onChange={(e) =>
                  setRow(selected.id, { pos: e.target.value })
                  } className={rlcClass(null,
                  { ...inpBase, width: "100%" })} />
                

                    <div className={rlcClass(null, lbl)}>Einheit</div>
                    <input
                  type="text"
                  value={selected.unit}
                  onChange={(e) => {
                    const unit = e.target.value;
                    setRow(selected.id, {
                      unit,
                      formula: getStandardFormel(unit)
                    });
                  }} className={rlcClass(null,
                  { ...inpBase, width: "100%" })} />
                

                    <div className={rlcClass(null, lbl)}>LV Soll</div>
                    <input
                  type="number"
                  step="0.001"
                  value={selected.soll}
                  onChange={(e) =>
                  onSollChange(selected.id, e.target.value)
                  } className={rlcClass(null,
                  { ...inpBase, width: "100%" })} />
                

                    <div className={rlcClass(null, lbl)}>Ist</div>
                    <div className={rlcClass(null,
                {
                  ...inpBase,
                  width: "100%",
                  minHeight: 36,
                  display: "flex",
                  alignItems: "center",
                  fontWeight: 700,
                  background: "#F8FAFC"
                })}>
                  
                      {fmtNumDE(selected.ist)}
                    </div>
                  </div>

                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1158">






                
                    <div className={rlcClass(null, { ...lbl, paddingTop: 9 })}>Kurztext</div>
                    <input
                  type="text"
                  value={selected.text}
                  onChange={(e) =>
                  setRow(selected.id, { text: e.target.value })
                  } className={rlcClass(null,
                  {
                    ...inpBase,
                    width: "100%",
                    minWidth: 560,
                    fontWeight: 750
                  })} />
                
                  </div>


                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1159">







                
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1160">
                      <div className={rlcClass(null, lbl)}>Langtext / Leistungsbeschreibung</div>
                      <div className={rlcClass(null,
                  {
                    ...inpBase,
                    width: "100%",
                    minHeight: 150,
                    maxHeight: 230,
                    overflow: "auto",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    background: "#F8FAFC"
                  })}>
                    
                        {safeTrim((selected as any).langtext) ||
                    safeTrim((selected as any).longText) ||
                    "Kein Langtext im LV vorhanden."}
                      </div>
                    </div>

                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1161">
                      <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1162">







                    
                        <div>
                          <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>
                            Teilaufmaß-Zeilen
                          </div>
                          <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1163">
                            Jede Zeile enthält Pos., Kurztext, Beschriftung und
                            Rechenansatz.
                          </div>
                        </div>

                      </div>

                      <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1164">





                    
                        <div className={rlcClass(null, { ...inpBase, background: "#F8FAFC" })}>
                          <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1165">





                        
                            Differenz
                          </div>
                          <div className={rlcClass(null,
                      {
                        fontSize: 18,
                        fontWeight: 700,
                        color:
                        Math.abs(selected.soll - selected.ist) < 0.0001 ?
                        "#047857" :
                        "#B45309"
                      })}>
                        
                            {fmtNumDE(selected.soll - selected.ist)}
                          </div>
                        </div>

                        <div>
                          <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>EP (€)</div>
                          <input
                        type="number"
                        step="0.01"
                        value={selected.ep}
                        onChange={(e) =>
                        onEPChange(selected.id, e.target.value)
                        } className={rlcClass(null,
                        { ...inpBase, width: "100%" })} />
                      
                        </div>

                        <div>
                          <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Faktor</div>
                          <input
                        type="number"
                        step="0.01"
                        value={selected.factor ?? 1}
                        onChange={(e) =>
                        onFactorChange(selected.id, e.target.value)
                        } className={rlcClass(null,
                        { ...inpBase, width: "100%" })} />
                      
                        </div>

                        <div className={rlcClass(null, { ...inpBase, background: "#F8FAFC" })}>
                          <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1166">





                        
                            Gesamt
                          </div>
                          <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1167">
                            {fmtEUR(
                          selected.ist * (
                          selected.ep * (selected.factor ?? 1))
                        )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1168">
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1169">
                      <div className={rlcClass(null, { ...lbl, marginBottom: 2 })}>
                        Teilaufmaß pro Zeile
                      </div>
                      <button
                    type="button" className={rlcClass(null,
                    btnPrimary)}
                    onClick={openFormulaEditor}>
                    
                        + Zeile
                      </button>
                    </div>
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1170">






                  
                      <table className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1171">





                    
                        <thead>
                          <tr className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1172">
                            {[
                        "Kreis", "Blatt", "Nr.", "REB", "Messzahl", "Orte"].
                        map((label) =>
                        <th key={label} className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1173">
                                {label}
                              </th>
                        )}
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1174">







                          
                              Pos.
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1175">







                          
                              Kurztext
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1176">







                          
                              Bezeichnung
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1177">







                          
                              Beschriftung
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1178">







                          
                              Rechenansatz / Masse
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1179">







                          
                              Faktor
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1180">







                          
                              Menge
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1181">







                          
                              Gesamt
                            </th>
                            <th className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1182">







                          
                              Aktion
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selected.entries || []).length ?
                      (selected.entries || []).map((e, idx) =>
                      <tr key={e.id}>
                                {[
                        { key: "kreis", value: e.kreis ?? 1, width: 70 },
                        { key: "blatt", value: e.blatt ?? 1, width: 70 },
                        { key: "nr", value: e.nr ?? idx + 1, width: 80 },
                        { key: "reb", value: e.reb ?? `000${String(idx + 1).padStart(2, "0")}`, width: 105 },
                        { key: "messzahl", value: e.messzahl ?? 91, width: 90 }].
                        map((field) =>
                        <td key={field.key} className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1183">
                                    <input
                            value={field.value}
                            onChange={(event) =>
                            updateMassEntry(selected.id, e.id, {
                              [field.key]: field.key === "reb" ? event.target.value : nrmNumber(event.target.value, 0)
                            } as Partial<AufmassEntry>)
                            } className={rlcClass(null,
                            { ...inpBase, width: field.width, padding: "7px 8px" })} />
                          
                                  </td>
                        )}
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1184">







                          
                                  {e.ortId ?
                          (() => {
                            const ort = orte.find((item) => item.id === e.ortId);
                            return ort ?
                            `${safeTrim(ort.nummer) || "—"} · ${ort.name}` :
                            "Nicht zugeordnet";
                          })() :
                          "Nicht zugeordnet"}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1185">






                          
                                  {selected.pos}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1186">








                          
                                  {selected.text}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1187">






                          
                                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1188">
                                    {e.label || `Aufmaß ${idx + 1}`}
                                  </div>
                                </td>
                                <td className={rlcClass(null,
                        {
                          padding: "10px 12px",
                          borderBottom: "1px solid #EDF2F7",
                          verticalAlign: "top",
                          minWidth: 220,
                          lineHeight: 1.4,
                          color: e.note ? "#0F172A" : "#94A3B8"
                        })}>
                          
                                  {safeTrim(e.note) || "—"}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1189">










                          
                                  <textarea
                            value={e.formula}
                            onChange={(event) => updateMassEntry(selected.id, e.id, { formula: event.target.value })} className={rlcClass(null,
                            { ...inpBase, width: "100%", minWidth: 260, minHeight: 54, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", resize: "vertical" })} />
                          
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1190">








                          
                                  {fmtNumDE(e.factor ?? 1)}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1191">








                          
                                  {fmtNumDE(e.menge)}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1192">








                          
                                  {fmtEUR(
                            e.menge * (
                            selected.ep * (selected.factor ?? 1))
                          )}
                                </td>
                                <td className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1193">






                          
                                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1194">
                                    <button className={rlcClass(null,
                            { ...btn, minHeight: 32, padding: "6px 10px" })}
                            type="button"
                            onClick={() => editMassEntry(selected, e)}>
                              
                                      Bearbeiten
                                    </button>
                                    <button className={rlcClass(null,
                            { ...btnDanger, minHeight: 32, padding: "6px 10px" })}
                            type="button"
                            onClick={() => removeMassEntry(selected.id, e.id)}>
                              
                                      Löschen
                                    </button>
                                  </div>
                                </td>
                              </tr>
                      ) :

                      <tr>
                              <td
                          colSpan={14} className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1195">





                          
                                Noch kein Teilaufmaß eingetragen. Mit „+ Zeile
                                hinzufügen“ neue Masse hinzufügen.
                              </td>
                            </tr>
                      }
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
            }
            </div>
          </section>
      </div>

      {editOpen &&
      <div className={rlcClass(null,
      modalWrap)}
      onMouseDown={(e) =>
      e.target === e.currentTarget && setEditOpen(false)
      }>
        
          <div className={rlcClass(null,
        {
          ...modalBox,
          width: "min(1180px, calc(100vw - 28px))",
          maxHeight: "calc(100vh - 24px)",
          overflow: "auto",
          padding: 14,
          fontSize: 12
        })}>
          
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1196">







            
              <div>
                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1197">
                  {editingEntryId ? "Aufmaß-Zeile bearbeiten" : "Aufmaß-Zeile eintragen"}
                </div>
                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1198">
                  Vollständige Teilaufmaß-Zeile mit Positionsdaten,
                  Beschriftung, Rechenansatz, Faktor und Ergebnis.
                </div>
              </div>

              {selected &&
            <div className={rlcClass(null, { ...pill, fontWeight: 700 })}>
                  Pos. {selected.pos}
                </div>
            }
            </div>

            {selected &&
          <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1199">
                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1200">










              
                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Pos.</div>
                    <div className={rlcClass(null,
                {
                  ...inpBase,
                  background: "#FFFFFF",
                  fontWeight: 700
                })}>
                  
                      {selected.pos}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Kurztext</div>
                    <div className={rlcClass(null,
                {
                  ...inpBase,
                  background: "#FFFFFF",
                  fontWeight: 700,
                  minHeight: 38,
                  display: "flex",
                  alignItems: "center"
                })}>
                  
                      {selected.text}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Einheit</div>
                    <div className={rlcClass(null,
                {
                  ...inpBase,
                  background: "#FFFFFF",
                  fontWeight: 700
                })}>
                  
                      {selected.unit}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>LV Soll</div>
                    <div className={rlcClass(null,
                {
                  ...inpBase,
                  background: "#FFFFFF",
                  fontWeight: 700
                })}>
                  
                      {fmtNumDE(selected.soll)}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>EP (€)</div>
                    <div className={rlcClass(null,
                {
                  ...inpBase,
                  background: "#FFFFFF",
                  fontWeight: 700
                })}>
                  
                      {fmtEUR(selected.ep)}
                    </div>
                  </div>
                </div>

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1201">







              
                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Kreis</div>
                    <input
                  type="number"
                  min="1"
                  step="1" className={rlcClass(null,
                  { ...inpBase, width: "100%", fontWeight: 700 })}
                  value={massKreisBuffer}
                  onChange={(e) => setMassKreisBuffer(e.target.value)} />
                
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Blatt</div>
                    <input
                  type="number"
                  min="1"
                  step="1" className={rlcClass(null,
                  { ...inpBase, width: "100%", fontWeight: 700 })}
                  value={massBlattBuffer}
                  onChange={(e) => setMassBlattBuffer(e.target.value)} />
                
                  </div>
                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Bezeichnung</div>
                    <input className={rlcClass(null,
                { ...inpBase, width: "100%", fontWeight: 700 })}
                value={massLabelBuffer}
                onChange={(e) => setMassLabelBuffer(e.target.value)}
                placeholder="z. B. Aufmaß 3" />
                
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>
                      Beschriftung / Bereich / Achse / Foto-Hinweis
                    </div>
                    <textarea className={rlcClass(null,
                {
                  ...modalTextarea,
                  height: 62,
                  minHeight: 62,
                  lineHeight: 1.45
                })}
                value={massNoteBuffer}
                onChange={(e) => setMassNoteBuffer(e.target.value)}
                placeholder="z. B. Achse 1–3, linke Straßenseite, Bereich Nord, Foto/GPS später verknüpfen" />
                
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Orte</div>
                    <select className={rlcClass(null,
                { ...inpBase, width: "100%", fontWeight: 700 })}
                value={massOrtBuffer}
                onChange={(e) => setMassOrtBuffer(e.target.value)}>
                  
                      <option value="">Keinem Ort zugeordnet</option>
                      {orte.
                  slice().
                  sort(
                    (a, b) =>
                    a.sortOrder - b.sortOrder ||
                    String(a.nummer || "").localeCompare(
                      String(b.nummer || ""),
                      "de-DE",
                      { numeric: true }
                    )
                  ).
                  map((ort) =>
                  <option key={ort.id} value={ort.id}>
                            {safeTrim(ort.nummer) || "—"} · {ort.name}
                          </option>
                  )}
                    </select>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>Faktor</div>
                    <input
                  type="text"
                  inputMode="decimal" className={rlcClass(null,
                  { ...inpBase, width: "100%", fontWeight: 700 })}
                  value={massFactorBuffer}
                  onChange={(e) => setMassFactorBuffer(e.target.value)}
                  placeholder="1" />
                
                  </div>
                </div>

                <div>
                  <div className={rlcClass(null, { ...lbl, marginBottom: 6 })}>
                    Rechenansatz / Masse
                  </div>
                  <textarea className={rlcClass(null,
              {
                ...modalTextarea,
                height: "20vh",
                minHeight: 135,
                lineHeight: 1.4
              })}
              value={editBuffer}
              onChange={(e) => setEditBuffer(e.target.value)}
              autoFocus
              placeholder={
              "Masse / Rechenansatz eintragen…\nz. B. 12.50 * 2 + 8.40\noder 5.20 * 1.10 * 0.30"
              } />
              
                </div>

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1202">









              
                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 4 })}>Ansatz-Menge</div>
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1203">
                      {fmtNumDE(parseMassEditorLines(editBuffer))}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 4 })}>Faktor</div>
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1204">
                      {fmtNumDE(nrmNumber(massFactorBuffer, 1) || 1)}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 4 })}>
                      Übernahme-Menge
                    </div>
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1205">
                      {fmtNumDE(
                    parseMassEditorLines(editBuffer) * (
                    nrmNumber(massFactorBuffer, 1) || 1)
                  )}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 4 })}>Eff. EP</div>
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1206">
                      {fmtEUR(selected.ep * (selected.factor ?? 1))}
                    </div>
                  </div>

                  <div>
                    <div className={rlcClass(null, { ...lbl, marginBottom: 4 })}>Zeilenbetrag</div>
                    <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1207">
                      {fmtEUR(
                    parseMassEditorLines(editBuffer) * (
                    nrmNumber(massFactorBuffer, 1) || 1) * (
                    selected.ep * (selected.factor ?? 1))
                  )}
                    </div>
                  </div>
                </div>

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1208">






              
                  <div className={rlcClass(null, { ...pill, background: "#EAF2FF", borderColor: "#BED6FF" })}>
                    Ergebnis: <b>{fmtNumDE(parseMassEditorLines(editBuffer) * (nrmNumber(massFactorBuffer, 1) || 1))}</b> {selected.unit}
                  </div>
                  <button
                type="button" className={rlcClass(null,
                btnPrimary)}
                onClick={() => void addMassEntryToSelected()}>
                
                    Berechnen & speichern
                  </button>
                </div>

                <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1209">










              
                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1210">
                    Tastatur: <b>Ctrl/Cmd + Enter</b> speichert, <b>Esc</b>{" "}
                    schließt
                  </div>

                  <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1211">
                    <button className={rlcClass(null,
                btn)}
                onClick={() => {
                  setEditOpen(false);
                  setEditingEntryId(null);
                }}
                type="button">
                  
                      Abbrechen
                    </button>

                    <button className={rlcClass(null,
                btn)}
                type="button"
                onClick={() => {
                  setEditBuffer("");
                  setMassNoteBuffer("");
                  setMassFactorBuffer("1");
                  setMassKreisBuffer("1");
                  setMassBlattBuffer("1");
                  setMassOrtBuffer("");
                }}>
                  
                      Eingabe leeren
                    </button>

                    <button className={rlcClass(null,
                btnPrimary)}
                type="button"
                onClick={() => {
                  void addMassEntryToSelected();
                }}>
                  
                      {editingEntryId ? "Änderungen speichern" : "Zeile speichern"}
                    </button>
                  </div>
                </div>
              </div>
          }
          </div>
        </div>
      }

      {massOpen &&
      <div className={rlcClass(null,
      modalWrap)}
      onMouseDown={(e) =>
      e.target === e.currentTarget && setMassOpen(false)
      }>
        
          <div className={rlcClass(null, modalBox)}>
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1212">
              Masse eintragen
            </div>
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1213">
              Jede Zeile ist ein eigener Rechenansatz. Die Summe wird als
              Ist-Menge in die Position übernommen.
            </div>

            <textarea className={rlcClass(null,
          { ...modalTextarea, height: "46vh" })}
          value={massBuffer}
          onChange={(e) => setMassBuffer(e.target.value)}
          autoFocus
          placeholder={
          "Beispiele:\\n12.50 * 0.80 * 0.30  // Länge × Breite × Stärke\\n8.40 * 1.20\\n3 * 2.50"
          } />
          

            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1214">








            
              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1215">
                Vorschau Ist:{" "}
                <b>
                  {parseMassEditorLines(massBuffer).toLocaleString("de-DE", {
                  maximumFractionDigits: 3
                })}
                </b>
              </div>

              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1216">
                <button className={rlcClass(null,
              btn)}
              onClick={() => setMassOpen(false)}
              type="button">
                
                  Abbrechen
                </button>

                <button className={rlcClass(null,
              btn)}
              type="button"
              onClick={() => setMassBuffer("")}>
                
                  Leeren
                </button>

                <button className={rlcClass(null,
              btnPrimary)}
              type="button"
              onClick={() => {
                if (!selected) return;
                onFormulaChange(selected.id, massTextToFormula(massBuffer));
                setMassOpen(false);
              }}>
                
                  Masse übernehmen
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      {noteOpen &&
      <div className={rlcClass(null,
      modalWrap)}
      onMouseDown={(e) =>
      e.target === e.currentTarget && setNoteOpen(false)
      }>
        
          <div className={rlcClass(null, modalBox)}>
            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1217">
              Beschreibung bearbeiten
            </div>

            <textarea className={rlcClass(null,
          modalTextarea)}
          value={noteBuffer}
          onChange={(e) => setNoteBuffer(e.target.value)}
          autoFocus
          placeholder="z. B. Asphalt im Bereich Nord" />
          

            <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1218">








            
              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1219">
                Tastatur: <b>Ctrl/Cmd + Enter</b> speichert, <b>Esc</b> schließt
              </div>

              <div className="rlc-migrated-pages-mengenermittlung-aufmasseditor-tsx-1220">
                <button className={rlcClass(null,
              btn)}
              onClick={() => setNoteOpen(false)}
              type="button">
                
                  Abbrechen
                </button>

                <button className={rlcClass(null,
              btn)}
              type="button"
              onClick={() => {
                setNoteBuffer("");
                if (selected) onNoteChange(selected.id, "");
              }}
              disabled={!selected}>
                
                  Leeren
                </button>

                <button className={rlcClass(null,
              btnPrimary)}
              type="button"
              onClick={() => {
                if (!selected) return;
                onNoteChange(selected.id, noteBuffer);
                setNoteOpen(false);
              }}>
                
                  Zeile speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>);

}
