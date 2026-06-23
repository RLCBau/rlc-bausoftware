// apps/web/src/pages/kalkulation/Versionsvergleich.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "../../lib/apiBase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import { LV, type LVPos } from "./store.lv";

/* ================= TYPES ================= */

type VersionRow = {
  id: string;
  name: string;
  createdAt: string;
  source: "LV" | "CSV";
  rows: LVPos[];
};

type CompareCell = {
  posNr: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  menge: number;
  preis: number;
  gesamt: number;
};

type CompareRow = {
  key: string;
  posNr: string;
  kurztext: string;
  cells: (CompareCell | null)[];
  diffText: boolean;
  diffUnit: boolean;
  diffQty: boolean;
  diffPrice: boolean;
};

type ProjectLike = {
  id?: string | number;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
};

type ViewMode = "all" | "price" | "qty" | "unit" | "text" | "risk";

type AnalysisResult = {
  title: string;
  warnings: string[];
  changes: string[];
  unchanged: string[];
};

const STORE_PREFIX = "rlc_versionsvergleich_v3_";

/* ================= HELPERS ================= */

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function n(value: unknown): number {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : 0;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(value));
}

function qty(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n(value));
}

function dateDE(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayDE(): string {
  return new Date().toLocaleDateString("de-DE");
}

function getProject(ctx: any): ProjectLike | null {
  const p =
    ctx?.project ||
    ctx?.currentProject ||
    ctx?.selectedProject ||
    ctx?.current ||
    ctx;

  if (!p || typeof p !== "object") return null;
  return p as ProjectLike;
}

function getProjectKey(project: ProjectLike | null): string {
  return String(
    project?.code ||
      project?.number ||
      project?.projektnummer ||
      project?.id ||
      "GLOBAL"
  )
    .trim()
    .toUpperCase();
}

function getProjectName(project: ProjectLike | null): string {
  return String(project?.name || project?.projectName || "").trim();
}

function storeKey(projectKey: string): string {
  return `${STORE_PREFIX}${projectKey || "GLOBAL"}`;
}

function looksLikeUuid(value: unknown): boolean {
  const s = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s
  );
}

function isTrashRow(row: Partial<LVPos>, projectKey: string): boolean {
  const pos = String(row.posNr || "").trim();
  const text = String(row.kurztext || row.langtext || "").trim();
  const unit = String(row.einheit || "").trim();
  const menge = n(row.menge);
  const preis = n(row.preis);

  if (!pos && !text && !unit && menge === 0 && preis === 0) return true;
  if (looksLikeUuid(pos)) return true;
  if (projectKey && pos.toUpperCase() === projectKey.toUpperCase()) return true;
  if (!text && looksLikeUuid(String(row.id || ""))) return true;

  return false;
}

function normalizeLvRow(row: Partial<LVPos>, projectKey = ""): LVPos {
  const menge = n(row.menge);
  const preis = n(row.preis);

  return {
    id: String(row.id || safeId()),
    posNr: String(row.posNr || "").trim(),
    parentPosNr: String(row.parentPosNr || "").trim(),
    sortIndex: row.sortIndex,
    kurztext: String(row.kurztext || "").trim(),
    langtext: String(row.langtext || "").trim(),
    bemerkung: String(row.bemerkung || "").trim(),
    einheit: String(row.einheit || "").trim() || "",
    menge,
    preis,
    gesamt: n(row.gesamt) || Number((menge * preis).toFixed(2)),
    waehrung: row.waehrung || "EUR",
    confidence: row.confidence,
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function cleanRows(rows: Partial<LVPos>[], projectKey: string): LVPos[] {
  return rows
    .filter((r) => !isTrashRow(r, projectKey))
    .map((r) => normalizeLvRow(r, projectKey))
    .sort((a, b) =>
      String(a.posNr || "").localeCompare(String(b.posNr || ""), "de", {
        numeric: true,
        sensitivity: "base",
      })
    );
}

function loadVersions(projectKey: string): VersionRow[] {
  try {
    const raw = localStorage.getItem(storeKey(projectKey));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.map((v) => ({
      id: String(v.id || safeId()),
      name: String(v.name || "Version"),
      createdAt: String(v.createdAt || new Date().toISOString()),
      source: v.source === "CSV" ? "CSV" : "LV",
      rows: cleanRows(Array.isArray(v.rows) ? v.rows : [], projectKey),
    }));
  } catch {
    return [];
  }
}

function saveVersions(projectKey: string, versions: VersionRow[]) {
  try {
    localStorage.setItem(storeKey(projectKey), JSON.stringify(versions));
  } catch {
    // Große Versionsvergleiche werden serverseitig gespeichert.
    // LocalStorage bleibt nur ein optionaler Browser-Cache.
  }
}
function analysisStoreKey(projectKey: string): string {
  return `rlc_versionsvergleich_analysis_v1:${projectKey}`;
}

function loadAnalysisResult(projectKey: string): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(analysisStoreKey(projectKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.title !== "string") return null;

    return {
      title: String(parsed.title || ""),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      changes: Array.isArray(parsed.changes) ? parsed.changes.map(String) : [],
      unchanged: Array.isArray(parsed.unchanged) ? parsed.unchanged.map(String) : [],
    };
  } catch {
    return null;
  }
}

function saveAnalysisResult(projectKey: string, result: AnalysisResult) {
  try {
    localStorage.setItem(analysisStoreKey(projectKey), JSON.stringify(result));
  } catch {
    //
  }
}

function getVersionAuthHeaders(extra: Record<string, string> = {}) {
  const token =
    localStorage.getItem("rlc_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("rlc_token") ||
    sessionStorage.getItem("token") ||
    "";

  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function extractServerVersions(data: any): VersionRow[] {
  const raw =
    data?.data?.versions ||
    data?.versions ||
    data?.snapshot?.data?.versions ||
    [];

  return Array.isArray(raw) ? raw : [];
}

function extractServerAnalysis(data: any): AnalysisResult | null {
  const raw =
    data?.data?.analysis ||
    data?.analysis ||
    data?.snapshot?.data?.analysis ||
    null;

  if (!raw || typeof raw.title !== "string") return null;

  return {
    title: String(raw.title || ""),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
    changes: Array.isArray(raw.changes) ? raw.changes.map(String) : [],
    unchanged: Array.isArray(raw.unchanged) ? raw.unchanged.map(String) : [],
  };
}
function extractRowsFromStoredCalc(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.items)) return parsed.items;
  if (Array.isArray(parsed?.data?.rows)) return parsed.data.rows;
  return [];
}

function toVersionLvRows(rawRows: any[], projectKey: string): LVPos[] {
  const mapped = rawRows.map((r: any, index: number) => {
    const menge = n(r.menge ?? r.quantity ?? r.qty);
    const preis =
      n(r.rlcKiUnitPrice) ||
      n(r.finalUnitPrice) ||
      n(r.suggestedUnitPrice) ||
      n(r.unitPrice) ||
      n(r.preis) ||
      n(r.ep);

    const gesamt =
      n(r.rlcKiTotal) ||
      n(r.totalNet) ||
      n(r.gesamt) ||
      n(r.gp) ||
      Math.round(menge * preis * 100) / 100;

    return {
      id: String(r.id || `${projectKey}-${r.posNr || index}`),
      posNr: String(r.posNr ?? r.position ?? r.nr ?? "").trim(),
      parentPosNr: String(r.parentPosNr || "").trim(),
      sortIndex: r.sortIndex ?? index,
      kurztext: String(r.kurztext ?? r.shortText ?? r.title ?? "").trim(),
      langtext: String(r.langtext ?? r.longText ?? r.description ?? "").trim(),
      einheit: String(r.einheit ?? r.unit ?? r.me ?? "").trim(),
      menge,
      preis,
      gesamt,
    } as Partial<LVPos>;
  });

  return cleanRows(mapped, projectKey).filter(
    (r) =>
      String(r.posNr || r.kurztext || "").trim() &&
      (n(r.menge) > 0 || n(r.preis) > 0 || n(r.gesamt) > 0)
  );
}

function loadCurrentVersionRows(projectKey: string): { rows: LVPos[]; sourceLabel: string } {
  const keys = [
    { key: `rlc_kalkulation_mit_ki_elite_v1:${projectKey}`, label: "RLC-KI Kalkulation" },
    { key: `rlc_lv_data_v1:${projectKey}`, label: "LV / Positionen" },
    { key: `rlc_gaeb_import_v1:${projectKey}`, label: "GAEB Import" },
  ];

  for (const item of keys) {
    try {
      const raw = localStorage.getItem(item.key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const rows = toVersionLvRows(extractRowsFromStoredCalc(parsed), projectKey);

      if (rows.length) return { rows, sourceLabel: item.label };
    } catch {
      //
    }
  }

  return { rows: cleanRows(LV.list(), projectKey), sourceLabel: "LV Snapshot" };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && ch === sep) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }

  cells.push(cur.trim());
  return cells;
}

function parseCsv(text: string, projectKey: string): LVPos[] {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());

  const find = (...names: string[]) =>
    header.findIndex((h) => names.some((name) => h.includes(name)));

  const idxPos = find("pos", "position", "posnr");
  const idxKurz = find("kurz", "text", "beschreibung");
  const idxLang = find("lang");
  const idxEinheit = find("einheit", "me", "unit");
  const idxMenge = find("menge", "qty");
  const idxPreis = find("preis", "ep", "unit price");

  const start = idxPos >= 0 || idxKurz >= 0 ? 1 : 0;

  return cleanRows(
    lines.slice(start).map((line, i) => {
      const c = splitCsvLine(line, sep);

      return {
        id: safeId(),
        posNr: c[idxPos >= 0 ? idxPos : 0] || String(i + 1),
        kurztext: c[idxKurz >= 0 ? idxKurz : 1] || "",
        langtext: idxLang >= 0 ? c[idxLang] || "" : "",
        einheit: idxEinheit >= 0 ? c[idxEinheit] || "" : "",
        menge: idxMenge >= 0 ? n(c[idxMenge]) : 0,
        preis: idxPreis >= 0 ? n(c[idxPreis]) : 0,
      };
    }),
    projectKey
  );
}

function toCell(row?: LVPos | null): CompareCell | null {
  if (!row) return null;

  return {
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    einheit: String(row.einheit || ""),
    menge: n(row.menge),
    preis: n(row.preis),
    gesamt: n(row.gesamt) || n(row.menge) * n(row.preis),
  };
}

function same(values: unknown[]): boolean {
  const clean = values.map((v) => String(v ?? "").trim());
  return clean.every((v) => v === clean[0]);
}

function buildCompare(versions: VersionRow[]): CompareRow[] {
  const keys = new Set<string>();

  versions.forEach((v) => {
    v.rows.forEach((r) => {
      const key = String(r.posNr || r.kurztext || "").trim();
      if (key) keys.add(key);
    });
  });

  return Array.from(keys)
    .sort((a, b) => a.localeCompare(b, "de", { numeric: true }))
    .map((key) => {
      const cells = versions.map((v) => {
        const found = v.rows.find(
          (r) => String(r.posNr || r.kurztext || "").trim() === key
        );
        return toCell(found);
      });

      const first = cells.find(Boolean);
      const kurztext = first?.kurztext || "";
      const posNr = first?.posNr || key;

      const textVals = cells.map((c) => c?.kurztext || "");
      const unitVals = cells.map((c) => c?.einheit || "");
      const qtyVals = cells.map((c) => c?.menge ?? "");
      const priceVals = cells.map((c) => c?.preis ?? "");

      return {
        key,
        posNr,
        kurztext,
        cells,
        diffText: !same(textVals),
        diffUnit: !same(unitVals),
        diffQty: !same(qtyVals),
        diffPrice: !same(priceVals),
      };
    });
}

function analyseVersion(v: VersionRow): AnalysisResult {
  const rows = v.rows;
  const warnings: string[] = [];
  const changes: string[] = [];
  const unchanged: string[] = [];

  const missingText = rows.filter((r) => !r.kurztext && !r.langtext);
  const missingUnit = rows.filter((r) => !r.einheit);
  const missingQty = rows.filter((r) => n(r.menge) <= 0);
  const missingPrice = rows.filter((r) => n(r.preis) <= 0);
  const total = rows.reduce((sum, r) => sum + n(r.gesamt || n(r.menge) * n(r.preis)), 0);

  const expensive = [...rows]
    .filter((r) => n(r.preis) > 0)
    .sort((a, b) => n(b.preis) - n(a.preis))
    .slice(0, 8);

  if (missingText.length) warnings.push(`${missingText.length} Position(en) ohne Kurztext/Langtext.`);
  if (missingUnit.length) warnings.push(`${missingUnit.length} Position(en) ohne Einheit.`);
  if (missingQty.length) warnings.push(`${missingQty.length} Position(en) ohne Menge oder Menge 0.`);
  if (missingPrice.length) warnings.push(`${missingPrice.length} Position(en) ohne EP / Preis.`);

  changes.push(`Analysierte Version: ${v.name}.`);
  changes.push(`Positionen: ${rows.length}.`);
  changes.push(`Gesamtsumme: ${money(total)}.`);

  expensive.forEach((r) => {
    changes.push(`Hoher EP: Pos. ${r.posNr || "—"} · ${r.kurztext || "—"} · ${money(r.preis)}.`);
  });

  if (!warnings.length) unchanged.push("Keine offensichtlichen Datenqualitätsprobleme gefunden.");

  return {
    title: "Angebotsanalyse abgeschlossen",
    warnings,
    changes,
    unchanged,
  };
}

function analyseCompare(rows: CompareRow[], versions: VersionRow[]): AnalysisResult {
  const price = rows.filter((r) => r.diffPrice);
  const qtyRows = rows.filter((r) => r.diffQty);
  const unit = rows.filter((r) => r.diffUnit);
  const text = rows.filter((r) => r.diffText);
  const missing = rows.filter((r) => r.cells.some((c) => !c));

  const warnings: string[] = [];
  const changes: string[] = [];
  const unchanged: string[] = [];

  changes.push(`Verglichen: ${versions.map((v) => v.name).join(" ↔ ")}.`);
  changes.push(`Positionen im Vergleich: ${rows.length}.`);
  changes.push(`Preisabweichungen: ${price.length}.`);
  changes.push(`Mengenabweichungen: ${qtyRows.length}.`);
  changes.push(`Einheitsabweichungen: ${unit.length}.`);
  changes.push(`Textabweichungen: ${text.length}.`);

  if (missing.length) warnings.push(`${missing.length} Position(en) fehlen in mindestens einer Version.`);

  price.slice(0, 10).forEach((r) => {
    const prices = r.cells.map((c) => (c ? money(c.preis) : "—")).join(" → ");
    warnings.push(`Preisabweichung Pos. ${r.posNr}: ${prices}`);
  });

  if (!price.length && !qtyRows.length && !unit.length && !text.length) {
    unchanged.push("Keine Abweichungen zwischen den ausgewählten Versionen gefunden.");
  }

  return {
    title: "Versionsvergleich abgeschlossen",
    warnings,
    changes,
    unchanged,
  };
}

function exportCompareCsv(rows: CompareRow[], versions: VersionRow[], projectKey: string) {
  const header = [
    "PosNr",
    "Kurztext",
    ...versions.flatMap((v) => [
      `${v.name} Menge`,
      `${v.name} ME`,
      `${v.name} EP`,
      `${v.name} Gesamt`,
    ]),
    "Diff Menge",
    "Diff ME",
    "Diff Preis",
    "Diff Text",
  ];

  const lines = rows.map((r) =>
    [
      r.posNr,
      r.kurztext,
      ...r.cells.flatMap((c) => [
        c ? qty(c.menge) : "",
        c?.einheit || "",
        c ? money(c.preis) : "",
        c ? money(c.gesamt) : "",
      ]),
      r.diffQty ? "Ja" : "Nein",
      r.diffUnit ? "Ja" : "Nein",
      r.diffPrice ? "Ja" : "Nein",
      r.diffText ? "Ja" : "Nein",
    ]
      .map(csvCell)
      .join(";")
  );

  const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Versionsvergleich_${projectKey}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportComparePdf(
  rows: CompareRow[],
  versions: VersionRow[],
  projectKey: string,
  projectName: string,
  stats: {
    rows: number;
    priceDiff: number;
    qtyDiff: number;
    unitDiff: number;
    textDiff: number;
  }
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mx = 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 18, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Versionsvergleich / Angebotsanalyse", mx, 33);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Projekt: ${projectKey}${projectName ? " · " + projectName : ""}`, mx, 41);
  doc.text(`Datum: ${todayDE()}`, pageW - mx, 41, { align: "right" });

  doc.setDrawColor(203, 213, 225);
  doc.line(mx, 48, pageW - mx, 48);

  const kpis = [
    ["Positionen", String(stats.rows)],
    ["Preisabweichungen", String(stats.priceDiff)],
    ["Mengenabweichungen", String(stats.qtyDiff)],
    ["Einheitsabweichungen", String(stats.unitDiff)],
    ["Textabweichungen", String(stats.textDiff)],
    ["Versionen", String(versions.length)],
  ];

  const boxW = 42;
  const boxH = 18;
  const gap = 5;
  const y = 56;

  kpis.forEach(([label, value], i) => {
    const x = mx + i * (boxW + gap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, boxW, boxH, 3, 3, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 3, y + 6);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(value, x + 3, y + 14);
  });

  const body = rows.map((r) => {
    const a = r.cells[0];
    const b = r.cells[1];

    return [
      r.posNr || "—",
      r.kurztext || "—",
      a ? qty(a.menge) : "—",
      b ? qty(b.menge) : "—",
      a?.einheit || "—",
      b?.einheit || "—",
      a ? money(a.preis) : "—",
      b ? money(b.preis) : "—",
      [
        r.diffQty ? "Menge" : "",
        r.diffUnit ? "ME" : "",
        r.diffPrice ? "Preis" : "",
        r.diffText ? "Text" : "",
      ]
        .filter(Boolean)
        .join(", ") || "—",
    ];
  });

  autoTable(doc, {
    startY: 84,
    margin: { left: mx, right: mx },
    theme: "grid",
    head: [["PosNr", "Kurztext", "Menge V1", "Menge V2", "ME V1", "ME V2", "EP V1", "EP V2", "Abweichung"]],
    body,
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const pages = doc.getNumberOfPages();

  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(mx, pageH - 13, pageW - mx, pageH - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("RLC Bausoftware · Versionsvergleich", mx, pageH - 7);
    doc.text(`Seite ${i}/${pages}`, pageW - mx, pageH - 7, { align: "right" });
  }

  doc.save(`Versionsvergleich_${projectKey}.pdf`);
}

/* ================= COMPONENT ================= */

export default function VersionsvergleichPage() {
  const projectCtx: any = useProject();
  const project = getProject(projectCtx);
  const projectKey = getProjectKey(project);
  const projectName = getProjectName(project);

  const fileRef = useRef<HTMLInputElement>(null);

  const [versions, setVersions] = useState<VersionRow[]>(() => loadVersions(projectKey));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(() => loadAnalysisResult(projectKey));
  const [analysisBusy, setAnalysisBusy] = useState(false);

  useEffect(() => {
    setVersions(loadVersions(projectKey));
    setSelected({});
    setViewMode("all");
    setAnalysis(loadAnalysisResult(projectKey));
    setAnalysisBusy(false);
  }, [projectKey]);

  function persist(next: VersionRow[]) {
    setVersions(next);
    saveVersions(projectKey, next);
  }

  
  async function saveVersionsToServer() {
    try {
      setInfo("Speichere Versionsvergleich auf Server …");

      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/versionsvergleich/${encodeURIComponent(projectKey || "NO_PROJECT")}/save`),
        {
          method: "POST",
          credentials: "include",
          headers: getVersionAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            data: {
              versions,
              selected,
              viewMode,
              savedAt: new Date().toISOString(),
              projectKey,
              projectName,
            },
          }),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setInfo(`Server-Speichern fehlgeschlagen: ${json?.error || res.status}`);
        return;
      }

      setInfo(`Versionsvergleich auf Server gespeichert · ${versions.length} Version(en).`);
    } catch (e: any) {
      setInfo(`Server-Speichern fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    }
  }

  async function loadVersionsFromServer() {
    try {
      setInfo("Lade Versionsvergleich vom Server …");

      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/versionsvergleich/${encodeURIComponent(projectKey || "NO_PROJECT")}`),
        {
          method: "GET",
          credentials: "include",
          headers: getVersionAuthHeaders(),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setInfo(`Server-Laden fehlgeschlagen: ${json?.error || res.status}`);
        return;
      }

      const serverVersions = extractServerVersions(json);

      if (!serverVersions.length) {
        setInfo("Keine Vergleichsversionen auf dem Server gefunden.");
        return;
      }

      setVersions(serverVersions);
      setSelected(json?.data?.selected || {});
      setViewMode(json?.data?.viewMode || "all");
      setInfo(`Versionsvergleich vom Server geladen · ${serverVersions.length} Version(en). Lokaler Browser-Speicher wurde nicht überschrieben.`);
    } catch (e: any) {
      setInfo(`Server-Laden fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    }
  }

  async function saveAnalysisToServer(resultOverride?: AnalysisResult | null) {
    const current = resultOverride || analysis;

    if (!current) {
      setInfo("Keine Analyse vorhanden. Bitte zuerst Analyse starten.");
      return;
    }

    try {
      setInfo("Speichere Angebotsanalyse auf Server …");

      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/angebotsanalyse/${encodeURIComponent(projectKey || "NO_PROJECT")}/save`),
        {
          method: "POST",
          credentials: "include",
          headers: getVersionAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            data: {
              analysis: current,
              selected,
              selectedVersionIds: selectedVersions.map((v) => v.id),
              savedAt: new Date().toISOString(),
              projectKey,
              projectName,
            },
          }),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setInfo(`Analyse-Server-Speichern fehlgeschlagen: ${json?.error || res.status}`);
        return;
      }

      setInfo("Angebotsanalyse auf Server gespeichert.");
    } catch (e: any) {
      setInfo(`Analyse-Server-Speichern fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    }
  }

  async function loadAnalysisFromServer() {
    try {
      setInfo("Lade Angebotsanalyse vom Server …");

      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/angebotsanalyse/${encodeURIComponent(projectKey || "NO_PROJECT")}`),
        {
          method: "GET",
          credentials: "include",
          headers: getVersionAuthHeaders(),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setInfo(`Analyse-Server-Laden fehlgeschlagen: ${json?.error || res.status}`);
        return;
      }

      const serverAnalysis = extractServerAnalysis(json);

      if (!serverAnalysis) {
        setInfo("Keine Angebotsanalyse auf dem Server gefunden.");
        return;
      }

      setAnalysis(serverAnalysis);
      saveAnalysisResult(projectKey, serverAnalysis);
      setInfo("Angebotsanalyse vom Server geladen.");
    } catch (e: any) {
      setInfo(`Analyse-Server-Laden fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    }
  }
function createSnapshot() {
    const loaded = loadCurrentVersionRows(projectKey);
    const lvRows = loaded.rows;

    if (!lvRows.length) {
      setInfo("Keine Kalkulations-/LV-Daten gefunden. Bitte zuerst LV importieren oder RLC-KI Kalkulation erstellen.");
      return;
    }

    const total = lvRows.reduce((sum, r) => sum + n(r.gesamt || n(r.menge) * n(r.preis)), 0);

    const version: VersionRow = {
      id: safeId(),
      name: `${loaded.sourceLabel} ${projectKey} · ${new Date().toLocaleString("de-DE")}`,
      createdAt: new Date().toISOString(),
      source: "LV",
      rows: lvRows,
    };

    persist([version, ...versions]);
    setSelected({ [version.id]: true });
    setInfo(`Version gespeichert: ${loaded.sourceLabel} · ${lvRows.length} Positionen · ${money(total)} netto.`);
  }

  function importCsvFile(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const rows = parseCsv(String(reader.result || ""), projectKey);

      if (!rows.length) {
        alert("CSV konnte nicht gelesen werden oder enthält keine gültigen Positionen.");
        return;
      }

      const version: VersionRow = {
        id: safeId(),
        name: file.name,
        createdAt: new Date().toISOString(),
        source: "CSV",
        rows,
      };

      persist([version, ...versions]);
      setSelected((s) => ({ ...s, [version.id]: true }));
      setInfo(`CSV importiert: ${file.name} · ${rows.length} Positionen.`);
    };

    reader.readAsText(file, "utf-8");
  }

  function deleteVersion(id: string) {
    if (!confirm("Diese Version löschen?")) return;

    persist(versions.filter((v) => v.id !== id));
    setSelected((s) => {
      const copy = { ...s };
      delete copy[id];
      return copy;
    });
  }

  function clearAll() {
    if (!confirm("Alle gespeicherten Vergleichsversionen löschen?")) return;

    persist([]);
    setSelected({});
    setAnalysis(null);
    setAnalysisBusy(false);
    setInfo("Alle Vergleichsversionen und die gespeicherte Analyse wurden gelöscht.");

    try {
      localStorage.removeItem(analysisStoreKey(projectKey));
    } catch {
      //
    }
  }
  const selectedVersions = useMemo(
    () => versions.filter((v) => selected[v.id]),
    [versions, selected]
  );

  const compareRows = useMemo(
    () => (selectedVersions.length >= 2 ? buildCompare(selectedVersions) : []),
    [selectedVersions]
  );

  const stats = useMemo(() => {
    const rows = compareRows;

    return {
      versions: versions.length,
      selected: selectedVersions.length,
      rows: selectedVersions.length === 1 ? selectedVersions[0]?.rows.length || 0 : rows.length,
      priceDiff: rows.filter((r) => r.diffPrice).length,
      qtyDiff: rows.filter((r) => r.diffQty).length,
      unitDiff: rows.filter((r) => r.diffUnit).length,
      textDiff: rows.filter((r) => r.diffText).length,
    };
  }, [versions.length, selectedVersions, compareRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    let rows = compareRows;

    if (viewMode === "price") rows = rows.filter((r) => r.diffPrice);
    if (viewMode === "qty") rows = rows.filter((r) => r.diffQty);
    if (viewMode === "unit") rows = rows.filter((r) => r.diffUnit);
    if (viewMode === "text") rows = rows.filter((r) => r.diffText);
    if (viewMode === "risk") {
      rows = rows.filter(
        (r) =>
          r.diffPrice ||
          r.diffQty ||
          r.cells.some((c) => !c || n(c.preis) <= 0 || n(c.menge) <= 0)
      );
    }

    if (!q) return rows;

    return rows.filter((r) =>
      [r.posNr, r.kurztext, ...r.cells.map((c) => c?.langtext || "")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [compareRows, query, viewMode]);

  function runAnalysis() {
    setAnalysisBusy(true);
    setInfo("Analyse läuft…");

    window.setTimeout(() => {
      try {
        if (selectedVersions.length === 1) {
          const result = analyseVersion(selectedVersions[0]);
          setAnalysis(result);
          saveAnalysisResult(projectKey, result);
          void saveAnalysisToServer(result);
          setInfo("Angebotsanalyse der ausgewählten Version erstellt und gespeichert.");
          return;
        }

        if (selectedVersions.length >= 2) {
          const result = analyseCompare(compareRows, selectedVersions);
          setAnalysis(result);
          saveAnalysisResult(projectKey, result);
          void saveAnalysisToServer(result);
          setInfo("Versionsvergleich der ausgewählten Versionen erstellt und gespeichert.");
          return;
        }

        setInfo("Bitte zuerst eine Version für die Angebotsanalyse oder zwei Versionen für den Vergleich auswählen.");
      } finally {
        setAnalysisBusy(false);
      }
    }, 80);
  }
  function runRiskAnalysis() {
    setViewMode("risk");

    if (selectedVersions.length === 1) {
      const result = analyseVersion(selectedVersions[0]);
      setAnalysis({
        ...result,
        title: "Risikoanalyse abgeschlossen",
      });
      setInfo("Risikoanalyse der ausgewählten Version erstellt.");
      return;
    }

    if (selectedVersions.length >= 2) {
      const result = analyseCompare(compareRows, selectedVersions);
      setAnalysis({
        ...result,
        title: "Risikoanalyse Versionsvergleich abgeschlossen",
      });
      setInfo("Risikoanalyse für den Versionsvergleich erstellt.");
      return;
    }

    setInfo("Bitte zuerst eine oder zwei Versionen auswählen.");
  }

  function exportCurrentPdf() {
    if (selectedVersions.length < 2) {
      setInfo("PDF-Export benötigt mindestens zwei ausgewählte Versionen.");
      return;
    }

    exportComparePdf(filteredRows, selectedVersions, projectKey, projectName, stats);
  }

  useEffect(() => {
    function onVersionsCommand(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};
      const action = String(detail.action || "");
      const filter = String(detail.filter || "");

      if (action === "analyseCurrent" || action === "analyzeCurrent") {
        runAnalysis();
      }

      if (action === "compareSelected") {
        runAnalysis();
        setViewMode("all");
      }

      if (action === "showPriceDiffs" || filter === "price") {
        setViewMode("price");
        setInfo("Filter aktiv: Preisabweichungen.");
      }

      if (action === "showQtyDiffs" || filter === "qty") {
        setViewMode("qty");
        setInfo("Filter aktiv: Mengenabweichungen.");
      }

      if (action === "showUnitDiffs" || filter === "unit") {
        setViewMode("unit");
        setInfo("Filter aktiv: Einheitsabweichungen.");
      }

      if (action === "showTextDiffs" || filter === "text") {
        setViewMode("text");
        setInfo("Filter aktiv: Textabweichungen.");
      }

      if (action === "riskAnalysis") {
        runRiskAnalysis();
      }

      if (action === "exportPdf") {
        exportCurrentPdf();
      }

      if (action === "saveCurrentLv") {
        createSnapshot();
      }

      if (action === "importCsv") {
        fileRef.current?.click();
      }
    }

    window.addEventListener("rlc:versionsvergleich-command", onVersionsCommand);

    return () => {
      window.removeEventListener("rlc:versionsvergleich-command", onVersionsCommand);
    };
  }, [selectedVersions, compareRows, filteredRows, projectKey, projectName, stats]);

  return (
    <div style={page}>
      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC Angebotsanalyse</div>
          <h1 style={title}>Versionsvergleich / Angebotsanalyse</h1>
          <p style={subtitle}>
            Eine Version analysieren oder mehrere LV-/Angebotsversionen vergleichen:
            Preis-, Mengen-, Einheiten- und Textabweichungen werden sauber getrennt.
          </p>
        </div>

        <div style={heroActions}>
          <button style={btnPrimary} onClick={createSnapshot}>
            Aktuelle Kalkulation als Version speichern
          </button>

          <button style={btnSecondary} onClick={() => fileRef.current?.click()}>
            CSV-Version importieren
          </button>

          <button style={btnPrimary} disabled={!selectedVersions.length} onClick={runAnalysis}>
            Analyse starten
          </button>
          <button style={btnSecondary} disabled={!versions.length} onClick={saveVersionsToServer}>
            Server speichern
          </button>

          <button style={btnSecondary} onClick={loadVersionsFromServer}>
            Server laden
          </button>

          <button style={btnSecondary} disabled={!analysis} onClick={() => saveAnalysisToServer()}>
            Analyse speichern
          </button>

          <button style={btnSecondary} onClick={loadAnalysisFromServer}>
            Analyse laden
          </button>

          <button
            style={btnSecondary}
            disabled={selectedVersions.length < 2}
            onClick={() => exportCompareCsv(filteredRows, selectedVersions, projectKey)}
          >
            CSV exportieren
          </button>

          <button
            style={btnSecondary}
            disabled={selectedVersions.length < 2}
            onClick={exportCurrentPdf}
          >
            PDF exportieren
          </button>

          <button style={btnDanger} onClick={clearAll} disabled={!versions.length}>
            Alles löschen
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsvFile(file);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>

        <div style={heroMeta}>
          Projekt: <b>{projectKey}</b>
          {projectName ? <span> · {projectName}</span> : null}
        </div>
      </section>

      {info ? <div style={successBox}>{info}</div> : null}
      {analysisBusy ? <div style={successBox}>Analyse läuft… Bitte warten.</div> : null}

      {analysis ? (
        <section style={analysisBox}>
          <div style={sectionHead}>
            <div>
              <h2 style={sectionTitle}>{analysis.title}</h2>
              <div style={sectionText}>
                KI-/Analyseprotokoll für diese Seite. Hier werden keine LV-Daten automatisch verändert.
              </div>
            </div>
          </div>

          {analysis.changes.length ? (
            <div style={analysisList}>
              {analysis.changes.map((x, i) => (
                <div key={`a-c-${i}`} style={analysisOk}>✓ {x}</div>
              ))}
            </div>
          ) : null}

          {analysis.warnings.length ? (
            <div style={analysisList}>
              {analysis.warnings.map((x, i) => (
                <div key={`a-w-${i}`} style={analysisWarn}>⚠  {x}</div>
              ))}
            </div>
          ) : null}

          {analysis.unchanged.length ? (
            <div style={analysisList}>
              {analysis.unchanged.map((x, i) => (
                <div key={`a-u-${i}`} style={analysisNeutral}>– {x}</div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section style={grid4}>
        <Kpi label="Versionen" value={String(stats.versions)} />
        <Kpi label="Ausgewählt" value={String(stats.selected)} />
        <Kpi label="Positionen" value={String(stats.rows)} />
        <Kpi label="Preisabweichungen" value={String(stats.priceDiff)} danger={stats.priceDiff > 0} />
        <Kpi label="Mengenabweichungen" value={String(stats.qtyDiff)} danger={stats.qtyDiff > 0} />
        <Kpi label="Einheitsabweichungen" value={String(stats.unitDiff)} danger={stats.unitDiff > 0} />
        <Kpi label="Textabweichungen" value={String(stats.textDiff)} danger={stats.textDiff > 0} />
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Gespeicherte Versionen</h2>
            <div style={sectionText}>
              Eine Version = Angebotsanalyse. Zwei oder mehr Versionen = Versionsvergleich.
            </div>
          </div>
        </div>

        <div style={versionGrid}>
          {versions.map((v) => {
            const active = !!selected[v.id];

            return (
              <label
                key={v.id}
                style={{
                  ...versionItem,
                  ...(active ? versionItemActive : {}),
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [v.id]: e.target.checked }))
                  }
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={versionTitle}>{v.name}</div>
                  <div style={versionMeta}>
                    {v.source} · {dateDE(v.createdAt)} · {v.rows.length} Pos.
                  </div>
                </div>

                <button
                  type="button"
                  style={btnMiniDanger}
                  onClick={(e) => {
                    e.preventDefault();
                    deleteVersion(v.id);
                  }}
                >
                  Löschen
                </button>
              </label>
            );
          })}

          {!versions.length ? (
            <div style={emptyBox}>
              Noch keine Version gespeichert. Speichere zuerst die aktuelle Kalkulation
              oder importiere eine CSV-Version.
            </div>
          ) : null}
        </div>
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Vergleichstabelle</h2>
            <div style={sectionText}>
              Rot markiert Abweichungen. Grün bedeutet gleiche Werte.
            </div>
          </div>

          <input
            style={searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche PosNr / Text…"
          />
        </div>

        <div style={filterRow}>
          <button style={viewMode === "all" ? btnPrimary : btnSecondary} onClick={() => setViewMode("all")}>
            Alle
          </button>
          <button style={viewMode === "price" ? btnPrimary : btnSecondary} onClick={() => setViewMode("price")}>
            Preisabweichungen
          </button>
          <button style={viewMode === "qty" ? btnPrimary : btnSecondary} onClick={() => setViewMode("qty")}>
            Mengenabweichungen
          </button>
          <button style={viewMode === "unit" ? btnPrimary : btnSecondary} onClick={() => setViewMode("unit")}>
            Einheitsabweichungen
          </button>
          <button style={viewMode === "text" ? btnPrimary : btnSecondary} onClick={() => setViewMode("text")}>
            Textabweichungen
          </button>
          <button style={viewMode === "risk" ? btnPrimary : btnSecondary} onClick={runRiskAnalysis}>
            Risikoanalyse
          </button>
        </div>

        {selectedVersions.length < 2 ? (
          <div style={emptyBox}>
            Für die Tabelle bitte mindestens zwei Versionen auswählen. Für eine einzelne Version nutze „Analyse starten“.
          </div>
        ) : (
          <CompareTable rows={filteredRows} versions={selectedVersions} />
        )}
      </section>
    </div>
  );
}

/* ================= TABLE ================= */

function CompareTable({
  rows,
  versions,
}: {
  rows: CompareRow[];
  versions: VersionRow[];
}) {
  return (
    <div style={tableWrap}>
      <table style={table}>
        <thead>
          <tr>
            <th style={thFixed}>PosNr</th>
            <th style={thText}>Kurztext</th>
            {versions.map((v) => (
              <th key={v.id} style={thGroup} colSpan={4}>
                {v.name}
              </th>
            ))}
          </tr>

          <tr>
            <th style={thFixed}></th>
            <th style={thText}></th>
            {versions.map((v) => (
              <React.Fragment key={`sub-${v.id}`}>
                <th style={thSmall}>Menge</th>
                <th style={thSmall}>ME</th>
                <th style={thSmall}>EP</th>
                <th style={thSmall}>Gesamt</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} style={{ background: i % 2 ? "#FCFCFC" : "#FFFFFF" }}>
              <td style={tdStrong}>{r.posNr || "—"}</td>
              <td style={tdText}>{r.kurztext || "—"}</td>

              {r.cells.map((c, idx) => (
                <React.Fragment key={`${r.key}-${idx}`}>
                  <td style={tdState(!r.diffQty)}>{c ? qty(c.menge) : "—"}</td>
                  <td style={tdState(!r.diffUnit)}>{c?.einheit || "—"}</td>
                  <td style={tdState(!r.diffPrice)}>{c ? money(c.preis) : "—"}</td>
                  <td style={tdState(!r.diffPrice || !r.diffQty)}>
                    {c ? money(c.gesamt) : "—"}
                  </td>
                </React.Fragment>
              ))}
            </tr>
          ))}

          {!rows.length ? (
            <tr>
              <td colSpan={2 + versions.length * 4} style={emptyCell}>
                Keine Positionen gefunden.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ================= UI ================= */

function Kpi({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={{ ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }}>
        {value}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
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
  opacity: 0.8,
  fontWeight: 800,
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 900,
  opacity: 0.88,
  lineHeight: 1.55,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 12,
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

const filterRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
  textTransform: "uppercase",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  fontWeight: 900,
};

const searchInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: 300,
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 800,
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

const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const btnMiniDanger: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 8,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const versionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
  gap: 10,
};

const versionItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 10,
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  background: "#FFFFFF",
};

const versionItemActive: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
};

const versionTitle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 13,
  color: "#0F172A",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const versionMeta: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B",
};

const tableWrap: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  overflow: "auto",
  maxHeight: "72vh",
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1250,
  borderCollapse: "collapse",
};

const thBase: React.CSSProperties = {
  background: "#F8FAFC",
  color: "#475569",
  fontSize: 12,
  fontWeight: 900,
  padding: "9px",
  borderBottom: "1px solid #E5E7EB",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const thFixed: React.CSSProperties = {
  ...thBase,
  minWidth: 100,
};

const thText: React.CSSProperties = {
  ...thBase,
  minWidth: 300,
};

const thGroup: React.CSSProperties = {
  ...thBase,
  textAlign: "center",
  borderLeft: "1px solid #E5E7EB",
};

const thSmall: React.CSSProperties = {
  ...thBase,
  textAlign: "right",
  minWidth: 95,
};

const tdBase: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle",
};

const tdStrong: React.CSSProperties = {
  ...tdBase,
  fontWeight: 900,
};

const tdText: React.CSSProperties = {
  ...tdBase,
  maxWidth: 420,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function tdState(ok: boolean): React.CSSProperties {
  return {
    ...tdBase,
    textAlign: "right",
    whiteSpace: "nowrap",
    background: ok ? "#F0FDF4" : "#FEF2F2",
    color: ok ? "#166534" : "#B91C1C",
    fontWeight: ok ? 700 : 900,
  };
}

const successBox: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#14532D",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
};

const analysisBox: React.CSSProperties = {
  ...card,
  border: "1px solid #BFDBFE",
  background: "#F8FAFC",
};

const analysisList: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 8,
};

const analysisOk: React.CSSProperties = {
  fontSize: 13,
  color: "#166534",
  fontWeight: 800,
};

const analysisWarn: React.CSSProperties = {
  fontSize: 13,
  color: "#92400E",
  fontWeight: 800,
};

const analysisNeutral: React.CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  fontWeight: 800,
};

const emptyBox: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 16,
  color: "#64748B",
  fontSize: 13,
};

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13,
};





















