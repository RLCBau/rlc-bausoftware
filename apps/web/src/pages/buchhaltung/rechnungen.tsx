import { rlcClass } from "../../ui/rlcRuntimeStyle";
import {
  savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader,
  outputPdfBlobWithCompanyHeader as outputRlcPdfBlobWithCompanyHeader,
  openPdfBlobPreview,
  reservePdfPreview
} from "../../lib/pdf/companyPdfHeader";
import { archiveWebPdf } from "../../lib/dmsArchive";
import React, { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";

import { renderRlcServerPdf } from "./serverPdfCore";
import { getAccountingProject } from "./accountingApi";
type AufmassRow = {
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
};

type RechnungPos = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  qty: number;
  ep: number;
  factor: number;
  total: number;
  note?: string;
};

type Rechnung = {
  id: number | string;
  nr: string;
  datum: string;
  faellig?: string;
  leistungsdatum?: string;
  kunde: string;
  customerStreet?: string;
  customerPostalCode?: string;
  customerCity?: string;
  customerCountry?: string;
  customerEmail?: string;
  buyerReference?: string;
  customerVatId?: string;
  taxTreatment?: "STANDARD" | "REVERSE_CHARGE_13B";
  ust1tgReference?: string;
  ust1tgValidUntil?: string;
  recipientType?: "B2B" | "B2G" | "B2C";
  fiscalStatus?: "ENTWURF" | "AUSGESTELLT" | "STORNIERT" | "KORRIGIERT";
  issuedAt?: string;
  issuedBy?: string | null;
  immutableHash?: string;
  originalInvoiceNumber?: string;
  originalInvoiceDate?: string;
  advanceDeductions?: Array<{ nr: string; datum: string; netto: number; tax: number; brutto: number }>;
  netto: number;
  mwstPct: number;
  gezahlt: number;
  hinweis?: string;
  typ: "RECHNUNG" | "ABSCHLAG" | "SCHLUSS" | "KORREKTUR";
  projectId?: string;
  projectCode?: string;
  positions: RechnungPos[];
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "YTD" | "THIS_MONTH";
type Status = "ALL" | "OPEN" | "PART" | "PAID";

const RECHNUNG_STORAGE_KEY = "rlc_rechnungen_v1";

const fmt = (n: number) =>
Number(n || 0).toLocaleString("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const invoiceGrossTotal = (r: Rechnung) =>
  r.taxTreatment === "REVERSE_CHARGE_13B"
    ? safeNumber(r.netto)
    : safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);
const advanceNet = (r: Rechnung) => (r.advanceDeductions || []).reduce((sum, item) => sum + safeNumber(item.netto), 0);
const advanceGross = (r: Rechnung) => (r.advanceDeductions || []).reduce((sum, item) => sum + safeNumber(item.brutto), 0);
const accountingNet = (r: Rechnung) => r.typ === "SCHLUSS" ? Math.max(0, safeNumber(r.netto) - advanceNet(r)) : safeNumber(r.netto);
const brutto = (r: Rechnung) => r.typ === "SCHLUSS" ? Math.max(0, invoiceGrossTotal(r) - advanceGross(r)) : invoiceGrossTotal(r);
const offen = (r: Rechnung) => Math.max(0, brutto(r) - safeNumber(r.gezahlt));

const statusOf = (r: Rechnung): Exclude<Status, "ALL"> => {
  const b = brutto(r);
  const g = safeNumber(r.gezahlt);
  if (g <= 0.01) return "OPEN";
  if (g >= b - 0.01) return "PAID";
  return "PART";
};

const parseDate = (s: string) => {
  if (!s) return new Date("1970-01-01");
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};

const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return d >= from;
};

const isSameMonth = (d: Date, ref: Date) =>
d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function safeNumber(v: unknown, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const normalized =
  typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function fiscalLocked(r?: Rechnung | null) {
  return ["AUSGESTELLT", "STORNIERT", "KORRIGIERT"].includes(String(r?.fiscalStatus || "ENTWURF").toUpperCase());
}

function escapeHtml(str: string) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]!
  );
}

function labelOf(s: Exclude<Status, "ALL">) {
  return s === "OPEN" ? "Offen" : s === "PART" ? "Teilbezahlt" : "Bezahlt";
}

function getAufmassKey(projectId: string) {
  return `RLC_AUFMASS_${projectId}`;
}

function loadAufmass(projectId?: string | null): AufmassRow[] {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(getAufmassKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadRechnungen(): Rechnung[] {
  try {
    const raw = localStorage.getItem(RECHNUNG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRechnungen(rows: Rechnung[]) {
  localStorage.setItem(RECHNUNG_STORAGE_KEY, JSON.stringify(rows));
}

function authHeaders(): Record<string, string> {
  for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

function normalizeServerRechnung(row: any, index: number): Rechnung {
  const positionsRaw = Array.isArray(row?.positions) ?
  row.positions :
  Array.isArray(row?.rows) ?
  row.rows :
  [];
  const positions = positionsRaw.map((p: any, i: number) => {
    const qty = safeNumber(p?.qty ?? p?.quantity ?? p?.menge, 0);
    const ep = safeNumber(p?.ep ?? p?.price, 0);
    const factor = safeNumber(p?.factor, 1) || 1;
    return {
      ...p,
      id: safeTrim(p?.id || `${row?.id || index}-${i + 1}`),
      pos: safeTrim(p?.pos || p?.position || i + 1),
      text: safeTrim(p?.text || p?.beschreibung || p?.kurztext),
      unit: safeTrim(p?.unit || p?.einheit),
      qty,
      ep,
      factor,
      total: safeNumber(p?.total, qty * ep * factor)
    };
  });

  return {
    ...row,
    id: row?.id ?? index + 1,
    nr: safeTrim(row?.nr || row?.rechnungNr),
    datum: safeTrim(row?.datum || row?.date),
    leistungsdatum: safeTrim(row?.leistungsdatum || row?.deliveryDate || row?.serviceDate),
    kunde: safeTrim(row?.kunde || row?.customerName),
    customerStreet: safeTrim(row?.customerStreet || row?.buyerStreet),
    customerPostalCode: safeTrim(row?.customerPostalCode || row?.buyerPostalCode),
    customerCity: safeTrim(row?.customerCity || row?.buyerCity),
    customerCountry: safeTrim(row?.customerCountry || row?.buyerCountry || "DE"),
    customerEmail: safeTrim(row?.customerEmail || row?.buyerEmail),
    buyerReference: safeTrim(row?.buyerReference || row?.leitwegId || row?.customerReference),
    customerVatId: safeTrim(row?.customerVatId || row?.buyerVatId || row?.kundeUstId),
    taxTreatment: row?.taxTreatment === "REVERSE_CHARGE_13B" ? "REVERSE_CHARGE_13B" : "STANDARD",
    ust1tgReference: safeTrim(row?.ust1tgReference || row?.reverseChargeEvidence),
    ust1tgValidUntil: safeTrim(row?.ust1tgValidUntil),
    recipientType: (["B2B", "B2G", "B2C"].includes(String(row?.recipientType).toUpperCase()) ? String(row.recipientType).toUpperCase() : "B2B") as Rechnung["recipientType"],
    fiscalStatus: (["AUSGESTELLT", "STORNIERT", "KORRIGIERT"].includes(String(row?.fiscalStatus).toUpperCase()) ? String(row.fiscalStatus).toUpperCase() : "ENTWURF") as Rechnung["fiscalStatus"],
    issuedAt: safeTrim(row?.issuedAt),
    issuedBy: row?.issuedBy ? safeTrim(row.issuedBy) : null,
    immutableHash: safeTrim(row?.immutableHash),
    advanceDeductions: Array.isArray(row?.advanceDeductions) ? row.advanceDeductions.map((item: any) => ({
      nr: safeTrim(item?.nr), datum: safeTrim(item?.datum), netto: safeNumber(item?.netto), tax: safeNumber(item?.tax), brutto: safeNumber(item?.brutto)
    })) : [],
    netto: safeNumber(row?.netto, positions.reduce((sum: number, p: any) => sum + p.total, 0)),
    mwstPct: safeNumber(row?.mwstPct ?? row?.mwst, 19),
    gezahlt: safeNumber(row?.gezahlt, 0),
    typ: (["ABSCHLAG", "SCHLUSS", "KORREKTUR"].includes(String(row?.typ).toUpperCase()) ? String(row.typ).toUpperCase() : "RECHNUNG") as Rechnung["typ"],
    originalInvoiceNumber: safeTrim(row?.originalInvoiceNumber),
    originalInvoiceDate: safeTrim(row?.originalInvoiceDate),
    positions
  };
}

function nextRechnungNr(rows: Rechnung[]) {
  const year = new Date().getFullYear();
  const nextId = rows.length ? Math.max(...rows.map((r) => safeNumber(r.id))) + 1 : 1;
  return `R-${year}-${String(nextId).padStart(3, "0")}`;
}

function aufmassToPositions(rows: AufmassRow[]): RechnungPos[] {
  return rows.
  filter((r) => safeNumber(r.ist, 0) > 0).
  map((r) => {
    const factor = safeNumber(r.factor, 1) || 1;
    const qty = safeNumber(r.ist, 0);
    const ep = safeNumber(r.ep, 0);
    return {
      id: safeTrim(r.id),
      pos: safeTrim(r.pos),
      text: safeTrim(r.text),
      unit: safeTrim(r.unit) || "m",
      qty,
      ep,
      factor,
      total: qty * ep * factor,
      note: safeTrim(r.note)
    };
  });
}

function printableInvoiceHTML(r: Rechnung) {
  const b = brutto(r);
  const mwst = b - r.netto;
  const of = offen(r);

  const posRows = r.positions.length ?
  r.positions.
  map(
    (p) => `
        <tr>
          <td>${escapeHtml(p.pos)}</td>
          <td>${escapeHtml(p.text)}</td>
          <td>${escapeHtml(p.unit)}</td>
          <td class="right">${fmt(p.qty)}</td>
          <td class="right">${fmt(p.ep)}</td>
          <td class="right">${fmt(p.factor)}</td>
          <td class="right">${fmt(p.total)}</td>
        </tr>
      `
  ).
  join("") :
  `<tr><td colspan="7" class="muted">Keine Positionen vorhanden.</td></tr>`;

  return `
<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Rechnung ${escapeHtml(r.nr)}</title>
<style>
  body{ font-family: Arial, sans-serif; margin:32px; color:#222; }
  h1{ margin:0 0 4px 0; }
  h2{ margin:0 0 16px 0; }
  .muted{ color:#666; }
  table{ width:100%; border-collapse:collapse; margin-top:16px; }
  th,td{ border-bottom:1px solid #ddd; padding:8px; text-align:left; vertical-align:top; }
  .right{ text-align:right; }
  .tot{ font-weight:700; background:#f7f7f7; }
  .meta{ margin-top:10px; line-height:1.5; }
</style>
</head><body>
  <h1>${r.typ === "ABSCHLAG" ? "Abschlagsrechnung" : r.typ === "SCHLUSS" ? "Schlussrechnung" : "Rechnung"}</h1>
  <div class="muted">RLC Bausoftware – Buchhaltung</div>
  <h2>${escapeHtml(r.nr)}</h2>

  <div class="meta">
    <div><b>Kunde:</b> ${escapeHtml(r.kunde)}</div>
    <div><b>Datum:</b> ${escapeHtml(r.datum)}</div>
    ${r.faellig ? `<div><b>Fällig:</b> ${escapeHtml(r.faellig)}</div>` : ""}
    ${r.projectCode ? `<div><b>Projekt:</b> ${escapeHtml(r.projectCode)}</div>` : ""}
    ${r.hinweis ? `<div><b>Hinweis:</b> ${escapeHtml(r.hinweis)}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Pos.</th>
        <th>Leistung</th>
        <th>ME</th>
        <th class="right">Menge</th>
        <th class="right">EP (€)</th>
        <th class="right">Faktor</th>
        <th class="right">Gesamt (€)</th>
      </tr>
    </thead>
    <tbody>
      ${posRows}
      <tr class="tot"><td colspan="6" class="right">Netto</td><td class="right">${fmt(r.netto)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">MwSt (${fmt(r.mwstPct)} %)</td><td class="right">${fmt(mwst)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">Brutto</td><td class="right">${fmt(b)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">Gezahlt</td><td class="right">${fmt(r.gezahlt || 0)}</td></tr>
      <tr class="tot"><td colspan="6" class="right">Offen</td><td class="right">${fmt(of)}</td></tr>
    </tbody>
  </table>

  <p class="muted" style="margin-top:16px">Automatisch erstellt · ${new Date().toLocaleString("de-DE")}</p>
</body></html>`;
}

function printableReportHTML(list: Rechnung[]) {
  const rows = list.
  map((r) => {
    const b = brutto(r);
    const of = offen(r);
    return `<tr>
      <td>${escapeHtml(r.nr)}</td>
      <td>${escapeHtml(r.datum)}</td>
      <td>${escapeHtml(r.kunde)}</td>
      <td>${escapeHtml(r.typ)}</td>
      <td class="right">${fmt(r.netto)}</td>
      <td class="right">${fmt(b - r.netto)}</td>
      <td class="right">${fmt(b)}</td>
      <td class="right">${fmt(r.gezahlt || 0)}</td>
      <td class="right">${fmt(of)}</td>
      <td>${labelOf(statusOf(r))}</td>
    </tr>`;
  }).
  join("");

  const totals = list.reduce(
    (acc, r) => {
      const b = brutto(r);
      acc.netto += safeNumber(r.netto);
      acc.mwst += b - safeNumber(r.netto);
      acc.brutto += b;
      acc.gez += safeNumber(r.gezahlt);
      acc.off += Math.max(0, b - safeNumber(r.gezahlt));
      return acc;
    },
    { netto: 0, mwst: 0, brutto: 0, gez: 0, off: 0 }
  );

  return `
<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Rechnungen Report</title>
<style>
  body{ font-family: Arial, sans-serif; margin:32px; color:#222; }
  h1{ margin:0 0 16px 0; }
  .muted{ color:#666; }
  table{ width:100%; border-collapse:collapse; margin-top:16px; }
  th,td{ border-bottom:1px solid #ddd; padding:8px; text-align:left; }
  .right{ text-align:right; }
  tfoot td{ font-weight:700; background:#f7f7f7; }
</style>
</head><body>
  <h1>Rechnungen – Report</h1>
  <div class="muted">Automatisch erstellt · ${new Date().toLocaleString("de-DE")}</div>

  <table>
    <thead>
      <tr>
        <th>Nr.</th><th>Datum</th><th>Kunde</th><th>Typ</th>
        <th class="right">Netto (€)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th>
        <th class="right">Gezahlt (€)</th><th class="right">Offen (€)</th><th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="10" class="muted">Keine Daten.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="right">Gesamt</td>
        <td class="right">${fmt(totals.netto)}</td>
        <td class="right">${fmt(totals.mwst)}</td>
        <td class="right">${fmt(totals.brutto)}</td>
        <td class="right">${fmt(totals.gez)}</td>
        <td class="right">${fmt(totals.off)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</body></html>`;
}

function openPrint(html: string) {
  const printWin = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
  if (!printWin) {
    alert("Pop-ups blockiert – bitte im Browser zulassen!");
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    try {
      printWin.focus();
      printWin.print();
    } catch (err) {
      console.error("Fehler beim Drucken:", err);
      alert("Druckfenster konnte nicht geöffnet werden.");
    }
  }, 400);
}

async function downloadSinglePDF(
  r: Rechnung,
  projectId: string,
  preview = false,
  _previewWindow: Window | null = null
) {
  const fileName = `${r.nr || "Rechnung"}.pdf`;

  await renderRlcServerPdf({
    documentType:
      String(r.typ || "").toLowerCase().includes("schluss")
        ? "SCHLUSSRECHNUNG"
        : String(r.typ || "").toLowerCase().includes("abschlag")
          ? "ABSCHLAGSRECHNUNG"
          : "RECHNUNG",

    projectId: getAccountingProject(),

    fileName,

    mode: preview
      ? "preview"
      : "download",

    payload: {
      ...r,
      projectId: getAccountingProject(),
      projectCode: getAccountingProject(),
      invoiceNumber: r.nr,
      number: r.nr
    }
  });
}

async function downloadAllPDF(
  list: Rechnung[],
  preview = false,
  _previewWindow: Window | null = null
) {
  if (!list.length) {
    alert("Keine Rechnungen vorhanden.");
    return;
  }

  await renderRlcServerPdf({
    documentType: "RECHNUNG",
    projectId: getAccountingProject(),
    fileName: "Rechnungen.pdf",
    mode: preview
      ? "preview"
      : "download",

    payload: {
      projectId: getAccountingProject(),
      projectCode: getAccountingProject(),
      rows: list,
      invoices: list,
      entries: list
    }
  });
}

function StatusChip({ value }: {value: Exclude<Status, "ALL">;}) {
  const map: Record<Exclude<Status, "ALL">, {bg: string;fg: string;label: string;}> = {
    OPEN: { bg: "#fdecea", fg: "#b02a1a", label: "Offen" },
    PART: { bg: "#fff7e6", fg: "#9a6700", label: "Teilbezahlt" },
    PAID: { bg: "#eafaf1", fg: "#0a6c3e", label: "Bezahlt" }
  };

  const c = map[value];

  return (
    <span className={rlcClass(null,
    {
      background: c.bg,
      color: c.fg,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 12
    })}>
      
      {c.label}
    </span>);

}

export default function Rechnungen() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectId = safeTrim(project?.id);
  const projectCode = safeTrim(project?.code);
  const projectKey = projectCode || projectId;
  const projectName = safeTrim(project?.name);
  const customerName = safeTrim((project as any)?.client) || "Neuer Kunde";

  const [rows, setRows] = useState<Rechnung[]>(() => loadRechnungen());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<Rechnung["id"] | null>(null);
  const [invoiceMode, setInvoiceMode] = useState<"view" | "edit" | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const [aufmassRows, setAufmassRows] = useState<AufmassRow[]>([]);
  const [mwstDefault, setMwstDefault] = useState<number>(19);

  const currentPositions = useMemo(
    () => aufmassToPositions(aufmassRows),
    [aufmassRows]
  );

  const currentNetto = useMemo(
    () => currentPositions.reduce((s, p) => s + safeNumber(p.total), 0),
    [currentPositions]
  );

  useEffect(() => {
    let cancelled = false;
    setServerReady(false);
    if (!projectKey) {
      setRows(loadRechnungen());
      setAufmassRows(loadAufmass(projectId));
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
    fetch(apiUrl(`/api/kalkulation/rechnung/${encodeURIComponent(projectKey)}`), {
      credentials: "include",
      headers: { Accept: "application/json", ...authHeaders() }
    }),
    fetch(apiUrl(`/api/aufmass/aufmass/${encodeURIComponent(projectKey)}`), {
      credentials: "include",
      headers: { Accept: "application/json", ...authHeaders() }
    })]
    ).then(async ([rechnungResponse, aufmassResponse]) => {
      if (cancelled) return;
      const rechnungJson = await rechnungResponse.json().catch(() => []);
      const aufmassJson = await aufmassResponse.json().catch(() => []);

      if (rechnungResponse.ok && Array.isArray(rechnungJson)) {
        const normalized = rechnungJson.map(normalizeServerRechnung);
        setRows(normalized);
        saveRechnungen(normalized);
      } else {
        setRows(loadRechnungen());
      }

      const serverAufmass = Array.isArray(aufmassJson) ?
      aufmassJson :
      Array.isArray(aufmassJson?.items) ?
      aufmassJson.items :
      [];
      setAufmassRows(
        aufmassResponse.ok && serverAufmass.length ? serverAufmass : loadAufmass(projectId || projectKey)
      );
      setServerReady(rechnungResponse.ok && Array.isArray(rechnungJson));
    }).catch(() => {
      if (cancelled) return;
      setRows(loadRechnungen());
      setAufmassRows(loadAufmass(projectId || projectKey));
      setServerReady(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, projectKey]);

  useEffect(() => {
    saveRechnungen(rows);
    if (!serverReady || !projectKey) return;

    const timer = window.setTimeout(() => {
      void fetch(apiUrl(`/api/kalkulation/rechnung/${encodeURIComponent(projectKey)}/replace`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items: rows })
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [rows, projectKey, serverReady]);

  const filteredProjectRows = useMemo(() => {
    if (!projectKey) return rows;
    return rows.filter(
      (r) => safeTrim(r.projectId) === projectId || safeTrim(r.projectCode) === projectCode
    );
  }, [rows, projectId, projectCode, projectKey]);

  const [zeitraum, setZeitraum] = useState<Zeitraum>("ALL");
  const [kunde, setKunde] = useState<string>("ALL");
  const [status, setStatus] = useState<Status>("ALL");

  const kundenListe = useMemo(
    () => ["ALL", ...Array.from(new Set(filteredProjectRows.map((r) => safeTrim(r.kunde)).filter(Boolean)))],
    [filteredProjectRows]
  );

  const filtered = useMemo(() => {
    let arr = filteredProjectRows.slice();

    arr = arr.filter((r) => {
      const d = parseDate(r.datum);
      switch (zeitraum) {
        case "30":
          return withinDays(d, 30);
        case "60":
          return withinDays(d, 60);
        case "90":
          return withinDays(d, 90);
        case "YTD":
          return d.getFullYear() === new Date().getFullYear();
        case "THIS_MONTH":
          return isSameMonth(d, new Date());
        default:
          return true;
      }
    });

    if (kunde !== "ALL") arr = arr.filter((r) => safeTrim(r.kunde) === kunde);
    if (status !== "ALL") arr = arr.filter((r) => statusOf(r) === status);

    return arr;
  }, [filteredProjectRows, zeitraum, kunde, status]);

  const totals = useMemo(() => {
    const netto = filtered.reduce((s, r) => s + accountingNet(r), 0);
    const brut = filtered.reduce((s, r) => s + brutto(r), 0);
    const gez = filtered.reduce((s, r) => s + safeNumber(r.gezahlt), 0);
    const off = filtered.reduce((s, r) => s + offen(r), 0);
    const mwstSum = filtered.reduce((s, r) => s + (brutto(r) - safeNumber(r.netto)), 0);
    return { netto, mwstSum, brut, gez, off };
  }, [filtered]);

  const createManualInvoice = () => {
    if (!serverReady) { alert("Serververbindung ist für Rechnungsentwürfe erforderlich."); return; }
    if (!projectId) {
      alert("Kein Projekt gewählt.");
      return;
    }

    const newRow: Rechnung = {
      id: `manual-${Date.now()}`,
      nr: nextRechnungNr(rows),
      datum: new Date().toLocaleDateString("de-DE"),
      faellig: "",
      leistungsdatum: "",
      kunde: customerName || "",
      customerStreet: "",
      customerPostalCode: "",
      customerCity: "",
      customerCountry: "DE",
      customerEmail: "",
      buyerReference: "",
      customerVatId: "",
      taxTreatment: "STANDARD",
      ust1tgReference: "",
      ust1tgValidUntil: "",
      recipientType: "B2B",
      fiscalStatus: "ENTWURF",
      advanceDeductions: [],
      netto: 0,
      mwstPct: mwstDefault,
      gezahlt: 0,
      hinweis: "",
      typ: "RECHNUNG",
      projectId,
      projectCode,
      positions: []
    };

    setRows((prev) => [...prev, newRow]);
    setSelectedInvoiceId(newRow.id);
    setInvoiceMode("edit");
  };

  const createFromAufmass = (typ: Rechnung["typ"]) => {
    if (!serverReady) { alert("Serververbindung ist für Rechnungsentwürfe erforderlich."); return; }
    if (!projectId) {
      alert("Kein Projekt gewählt.");
      return;
    }

    if (!currentPositions.length) {
      alert("Kein abrechenbares Aufmaß gefunden.");
      return;
    }

    setRows((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((r) => safeNumber(r.id))) + 1 : 1;
      const nr = nextRechnungNr(prev);
      const datum = new Date().toLocaleDateString("de-DE");
      const projectAdvances = typ === "SCHLUSS"
        ? prev.filter((row) =>
            row.typ === "ABSCHLAG" &&
            row.fiscalStatus === "AUSGESTELLT" &&
            (safeTrim(row.projectId) === projectId || safeTrim(row.projectCode) === projectCode)
          ).map((row) => {
            const gross = invoiceGrossTotal(row);
            return {
              nr: row.nr,
              datum: row.datum,
              netto: safeNumber(row.netto),
              tax: Math.max(0, gross - safeNumber(row.netto)),
              brutto: gross
            };
          })
        : [];

      const newRow: Rechnung = {
        id: nextId,
        nr,
        datum,
        faellig: "",
        leistungsdatum: "",
        kunde: customerName,
        customerStreet: "",
        customerPostalCode: "",
        customerCity: "",
        customerCountry: "DE",
        customerEmail: "",
        buyerReference: "",
        customerVatId: "",
        taxTreatment: "STANDARD",
        ust1tgReference: "",
        ust1tgValidUntil: "",
        recipientType: "B2B",
        fiscalStatus: "ENTWURF",
        advanceDeductions: projectAdvances,
        netto: Number(currentNetto.toFixed(2)),
        mwstPct: mwstDefault,
        gezahlt: 0,
        hinweis:
        typ === "ABSCHLAG" ?
        `Abschlagsrechnung aus Aufmaß (${projectCode || projectName})` :
        typ === "SCHLUSS" ?
        `Schlussrechnung aus Aufmaß (${projectCode || projectName})` :
        `Rechnung aus Aufmaß (${projectCode || projectName})`,
        typ,
        projectId,
        projectCode,
        positions: currentPositions
      };

      return [...prev, newRow];
    });
  };

  const duplicate = (r: Rechnung) => {
    if (!serverReady) { alert("Serververbindung erforderlich."); return; }
    setRows((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((x) => safeNumber(x.id))) + 1 : 1;
      return [
      ...prev,
      {
        ...r,
        id: nextId,
        nr: nextRechnungNr(prev),
        datum: new Date().toLocaleDateString("de-DE"),
        fiscalStatus: "ENTWURF",
        issuedAt: "",
        issuedBy: null,
        immutableHash: ""
      }];

    });
  };

  const createCorrection = (original: Rechnung) => {
    if (!serverReady) { alert("Serververbindung erforderlich."); return; }
    if (original.fiscalStatus !== "AUSGESTELLT") { alert("Eine Korrekturrechnung kann nur zu einer ausgestellten Rechnung erstellt werden."); return; }
    setRows((prev) => {
      const numericIds = prev.map((row) => safeNumber(row.id, 0));
      const nextId = Math.max(0, ...numericIds) + 1;
      const correction: Rechnung = {
        ...original,
        id: `korrektur-${Date.now()}-${nextId}`,
        nr: nextRechnungNr(prev),
        datum: new Date().toLocaleDateString("de-DE"),
        typ: "KORREKTUR",
        fiscalStatus: "ENTWURF",
        issuedAt: "",
        issuedBy: null,
        immutableHash: "",
        originalInvoiceNumber: original.nr,
        originalInvoiceDate: original.datum,
        gezahlt: 0,
        hinweis: `Korrektur zu Rechnung ${original.nr} vom ${original.datum}`
      };
      setSelectedInvoiceId(correction.id);
      setInvoiceMode("edit");
      return [...prev, correction];
    });
  };

  const remove = async (id: Rechnung["id"]) => {
    const target = rows.find((row) => String(row.id) === String(id));
    if (fiscalLocked(target)) { alert("Ausgestellte Rechnungen dürfen nicht gelöscht werden. Verwenden Sie Storno/Korrektur."); return; }
    if (!serverReady || !projectKey) { alert("Serververbindung erforderlich."); return; }
    if (!window.confirm("Rechnungsentwurf wirklich löschen?")) return;
    const response = await fetch(apiUrl(`/api/kalkulation/rechnung/${encodeURIComponent(projectKey)}/${encodeURIComponent(String(id))}`), {
      method: "DELETE", credentials: "include", headers: { Accept: "application/json", ...authHeaders() }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { alert(payload?.error || "Entwurf konnte nicht gelöscht werden."); return; }
    setRows((prev) => prev.filter((r) => String(r.id) !== String(id)));
    if (String(selectedInvoiceId) === String(id)) { setSelectedInvoiceId(null); setInvoiceMode(null); }
  };

  const update = <K extends keyof Rechnung,>(i: number, key: K, val: Rechnung[K]) => {
    if (!serverReady) return;
    setRows((prev) => {
      const copy = [...prev];
      if (!copy[i] || fiscalLocked(copy[i])) return prev;

      if (key === "netto" || key === "mwstPct" || key === "gezahlt") {
        (copy[i] as Rechnung)[key] = safeNumber(val, 0) as Rechnung[K];
      } else {
        (copy[i] as Rechnung)[key] = val;
      }

      return copy;
    });
  };

  const issueInvoice = async (invoice: Rechnung) => {
    if (!serverReady || !projectKey) { alert("Serververbindung für die Rechnungsstellung erforderlich."); return; }
    if (fiscalLocked(invoice)) { alert(`Rechnung ist bereits ${invoice.fiscalStatus}.`); return; }
    if (!window.confirm(`Rechnung ${invoice.nr} jetzt verbindlich ausstellen? Danach sind Inhalt und Nummer gesperrt.`)) return;
    const response = await fetch(apiUrl(`/api/kalkulation/rechnung/${encodeURIComponent(projectKey)}/${encodeURIComponent(String(invoice.id))}/issue`), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders() }, body: "{}"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const details = Array.isArray(payload?.errors) ? `\n${payload.errors.join("\n")}` : "";
      alert(`${payload?.error || "Rechnung konnte nicht ausgestellt werden."}${details}`); return;
    }
    setRows((prev) => prev.map((row) => String(row.id) === String(invoice.id) ? normalizeServerRechnung(payload.invoice, 0) : row));
    setInvoiceMode("view");
    alert("Rechnung wurde ausgestellt, archiviert und gegen Änderung gesperrt.");
  };

  const exportCSV = (useFiltered: boolean) => {
    const src = useFiltered ? filtered : filteredProjectRows;
    if (!src.length) {
      alert("Keine Daten für CSV-Export vorhanden.");
      return;
    }

    const data = src.map((r) => ({
      Nr: r.nr,
      Typ: r.typ,
      Datum: r.datum,
      Faellig: r.faellig || "",
      Kunde: r.kunde,
      Projekt: r.projectCode || "",
      Netto: fmt(r.netto),
      MwStPct: fmt(r.mwstPct),
      Brutto: fmt(brutto(r)),
      Gezahlt: fmt(r.gezahlt || 0),
      Offen: fmt(offen(r)),
      Status: labelOf(statusOf(r)),
      Hinweis: r.hinweis || ""
    }));

    const headers = Object.keys(data[0]);
    const csv = [
    headers.join(";"),
    ...data.map((row) =>
    headers.
    map((h) => `"${String((row as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).
    join(";")
    )].
    join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    const fileName = useFiltered ? "rechnungen_gefiltert.csv" : "rechnungen_alle.csv";
    a.href = href;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(href);

    if (projectId) {
      void import("../../lib/dmsArchive")
        .then(({ archiveWebFile }) => archiveWebFile(projectId, fileName, blob))
        .catch((error) => console.warn("[rechnungen:csv:dms]", error));
    }
  };

  const printSinglePDF = (r: Rechnung) => {
    const previewWindow = reservePdfPreview(
      `Rechnung_${r.nr || "Vorschau"}.pdf`
    );

    void downloadSinglePDF(
      r,
      projectId,
      true,
      previewWindow
    );
  };
  const printAllPDF = (useFiltered: boolean) => {
    const previewWindow =
      reservePdfPreview("Rechnungen.pdf");

    void downloadAllPDF(
      useFiltered
        ? filtered
        : filteredProjectRows,
      true,
      previewWindow
    );
  };

  const selectedInvoice = useMemo(
    () => rows.find((row) => String(row.id) === String(selectedInvoiceId)) || null,
    [rows, selectedInvoiceId]
  );

  useEffect(() => {
    if (selectedInvoiceId === null || selectedInvoiceId === undefined) {
      sessionStorage.removeItem("rlc_delivery_invoice_id");
      return;
    }
    sessionStorage.setItem("rlc_delivery_invoice_id", String(selectedInvoiceId));
  }, [selectedInvoiceId]);
  const selectedIndex = selectedInvoice
    ? rows.findIndex((row) => String(row.id) === String(selectedInvoice.id))
    : -1;

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>Rechnungen / Abschläge</h2>
          <div className="bh-note rlc-migrated-pages-buchhaltung-rechnungen-tsx-262">
            {projectCode ?
            <>
                Projekt: <b>{projectCode}</b> {projectName ? `— ${projectName}` : ""}
              </> :

            "Kein Projekt ausgewählt"
            }
          </div>
        </div>

        <div className="bh-actions">
          <button className="bh-btn" onClick={createManualInvoice}>
            + Neue Rechnung
          </button>
          <button className="bh-btn ghost" onClick={() => createFromAufmass("RECHNUNG")}>
            Aus Aufmaß erstellen
          </button>
          <button className="bh-btn ghost" onClick={() => createFromAufmass("ABSCHLAG")}>
            + Abschlagsrechnung
          </button>
          <button className="bh-btn ghost" onClick={() => createFromAufmass("SCHLUSS")}>
            + Schlussrechnung
          </button>

          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>
            Export CSV (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>
            Export CSV (alle)
          </button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(true)}>
            PDF Report (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(false)}>
            PDF Report (alle)
          </button>
          <button className="bh-btn ghost" onClick={() => downloadAllPDF(filtered)}>
            Download PDF (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => downloadAllPDF(filteredProjectRows)}>
            Download PDF (alle)
          </button>
        </div>
      </div>

      <div className="bh-filters">
        <div>
          <label>Zeitraum</label>
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value as Zeitraum)}>
            <option value="THIS_MONTH">Dieser Monat</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="60">Letzte 60 Tage</option>
            <option value="90">Letzte 90 Tage</option>
            <option value="YTD">YTD</option>
            <option value="ALL">Alle</option>
          </select>
        </div>

        <div>
          <label>Kunde</label>
          <select value={kunde} onChange={(e) => setKunde(e.target.value)}>
            {kundenListe.map((k) =>
            <option key={k} value={k}>
                {k === "ALL" ? "Alle" : k}
              </option>
            )}
          </select>
        </div>

        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="ALL">Alle</option>
            <option value="OPEN">Offen</option>
            <option value="PART">Teilbezahlt</option>
            <option value="PAID">Bezahlt</option>
          </select>
        </div>

        <div>
          <label>Standard MwSt %</label>
          <input
            type="number"
            step="0.1"
            value={mwstDefault}
            onChange={(e) => setMwstDefault(safeNumber(e.target.value, 19))} className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-263" />

          
        </div>
      </div>

      <div className="bh-note rlc-migrated-pages-buchhaltung-rechnungen-tsx-264">
        Aktuelles Aufmaß: <b>{currentPositions.length}</b> abrechenbare Position(en) · Netto aktuell:{" "}
        <b>{fmt(currentNetto)} €</b>
      </div>

      <div className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-265">






        
        <div className="bh-card">
          <div className="bh-note">Netto</div>
          <div className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-266">{fmt(totals.netto)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">MwSt</div>
          <div className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-267">{fmt(totals.mwstSum)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">Brutto</div>
          <div className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-268">{fmt(totals.brut)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">Gezahlt</div>
          <div className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-269">{fmt(totals.gez)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">Offen</div>
          <div className="rlc-migrated-pages-buchhaltung-rechnungen-tsx-270">{fmt(totals.off)} €</div>
        </div>
      </div>

      {selectedInvoice ? (
        <section className="bh-card" style={{ marginBottom: 18, padding: 18 }}>
          <div className="bh-header-row">
            <div>
              <div className="bh-note">{invoiceMode === "edit" ? "Rechnung bearbeiten" : "Rechnung geöffnet"}</div>
              <h3 style={{ margin: "4px 0 0" }}>{selectedInvoice.nr || "Neue Rechnung"} · {selectedInvoice.fiscalStatus || "ENTWURF"}</h3>
            </div>
            <div className="bh-actions">
              {invoiceMode === "edit"
                ? <button className="bh-btn" onClick={() => setInvoiceMode("view")}>Änderungen übernehmen</button>
                : !fiscalLocked(selectedInvoice) ? <button className="bh-btn" onClick={() => setInvoiceMode("edit")}>Bearbeiten</button> : null}
              {!fiscalLocked(selectedInvoice) ? <button className="bh-btn" onClick={() => void issueInvoice(selectedInvoice)}>Rechnung ausstellen</button> : null}
              <button className="bh-btn ghost" onClick={() => { setSelectedInvoiceId(null); setInvoiceMode(null); }}>Schließen</button>
            </div>
          </div>

          {invoiceMode === "edit" && selectedIndex >= 0 ? (
            <div className="bh-filters">
              <div><label>Art</label><select value={selectedInvoice.typ} onChange={(e) => update(selectedIndex, "typ", e.target.value as Rechnung["typ"])}><option value="RECHNUNG">Rechnung</option><option value="ABSCHLAG">Abschlagsrechnung</option><option value="SCHLUSS">Schlussrechnung</option><option value="KORREKTUR">Rechnungskorrektur</option></select></div>
              <div><label>Empfängerart</label><select value={selectedInvoice.recipientType || "B2B"} onChange={(e) => update(selectedIndex, "recipientType", e.target.value as Rechnung["recipientType"])}><option value="B2B">B2B Unternehmen</option><option value="B2G">B2G öffentliche Hand</option><option value="B2C">B2C Privatkunde</option></select></div>
              <div><label>Rechnungsnummer</label><input value={selectedInvoice.nr} onChange={(e) => update(selectedIndex, "nr", e.target.value)} /></div>
              {selectedInvoice.typ === "KORREKTUR" ? <>
                <div><label>Ursprüngliche Rechnung</label><input value={selectedInvoice.originalInvoiceNumber || ""} readOnly /></div>
                <div><label>Ursprüngliches Datum</label><input value={selectedInvoice.originalInvoiceDate || ""} readOnly /></div>
              </> : null}
              <div><label>Datum</label><input value={selectedInvoice.datum} onChange={(e) => update(selectedIndex, "datum", e.target.value)} placeholder="TT.MM.JJJJ" /></div>
              <div><label>Fällig am</label><input value={selectedInvoice.faellig || ""} onChange={(e) => update(selectedIndex, "faellig", e.target.value)} placeholder="TT.MM.JJJJ" /></div>
              <div><label>Leistungsdatum</label><input value={selectedInvoice.leistungsdatum || ""} onChange={(e) => update(selectedIndex, "leistungsdatum", e.target.value)} placeholder="TT.MM.JJJJ" /></div>
              <div><label>Kunde</label><input value={selectedInvoice.kunde} onChange={(e) => update(selectedIndex, "kunde", e.target.value)} /></div>
              <div><label>Straße</label><input value={selectedInvoice.customerStreet || ""} onChange={(e) => update(selectedIndex, "customerStreet", e.target.value)} /></div>
              <div><label>PLZ</label><input value={selectedInvoice.customerPostalCode || ""} onChange={(e) => update(selectedIndex, "customerPostalCode", e.target.value)} /></div>
              <div><label>Ort</label><input value={selectedInvoice.customerCity || ""} onChange={(e) => update(selectedIndex, "customerCity", e.target.value)} /></div>
              <div><label>Land</label><input value={selectedInvoice.customerCountry || "DE"} onChange={(e) => update(selectedIndex, "customerCountry", e.target.value)} /></div>
              <div><label>Kunden-E-Mail</label><input type="email" value={selectedInvoice.customerEmail || ""} onChange={(e) => update(selectedIndex, "customerEmail", e.target.value)} /></div>
              <div><label>BuyerReference / Leitweg-ID</label><input value={selectedInvoice.buyerReference || ""} onChange={(e) => update(selectedIndex, "buyerReference", e.target.value)} /></div>
              <div><label>Kunden-USt-IdNr.</label><input value={selectedInvoice.customerVatId || ""} onChange={(e) => update(selectedIndex, "customerVatId", e.target.value)} /></div>
              <div><label>Umsatzsteuer</label><select value={selectedInvoice.taxTreatment || "STANDARD"} onChange={(e) => { const value = e.target.value as Rechnung["taxTreatment"]; update(selectedIndex, "taxTreatment", value); update(selectedIndex, "mwstPct", value === "REVERSE_CHARGE_13B" ? 0 : (selectedInvoice.mwstPct > 0 ? selectedInvoice.mwstPct : mwstDefault)); }}><option value="STANDARD">Regelbesteuerung</option><option value="REVERSE_CHARGE_13B">§ 13b UStG – Bauleistung / Reverse Charge</option></select></div>
              {selectedInvoice.taxTreatment === "REVERSE_CHARGE_13B" ? <>
                <div><label>USt 1 TG / Nachweis-Referenz</label><input value={selectedInvoice.ust1tgReference || ""} onChange={(e) => update(selectedIndex, "ust1tgReference", e.target.value)} placeholder="z. B. Bescheinigung / Prüfvermerk" /></div>
                <div><label>Nachweis gültig bis</label><input value={selectedInvoice.ust1tgValidUntil || ""} onChange={(e) => update(selectedIndex, "ust1tgValidUntil", e.target.value)} placeholder="TT.MM.JJJJ" /></div>
              </> : null}
              <div><label>Netto (€)</label><input type="number" step="0.01" value={selectedInvoice.netto} onChange={(e) => update(selectedIndex, "netto", safeNumber(e.target.value, 0))} /></div>
              <div><label>MwSt. (%)</label><input type="number" step="0.1" value={selectedInvoice.mwstPct} onChange={(e) => update(selectedIndex, "mwstPct", safeNumber(e.target.value, 19))} /></div>
              <div><label>Hinweis</label><input value={selectedInvoice.hinweis || ""} onChange={(e) => update(selectedIndex, "hinweis", e.target.value)} /></div>
            </div>
          ) : (
            <div className="bh-filters">
              <div><label>Art</label><div>{selectedInvoice.typ}</div></div>
              <div><label>Empfängerart</label><div>{selectedInvoice.recipientType || "B2B"}</div></div>
              {selectedInvoice.typ === "KORREKTUR" ? <div><label>Bezug</label><div>{selectedInvoice.originalInvoiceNumber || "—"} · {selectedInvoice.originalInvoiceDate || "—"}</div></div> : null}
              <div><label>Fiskalstatus</label><div><b>{selectedInvoice.fiscalStatus || "ENTWURF"}</b>{selectedInvoice.issuedAt ? ` · ${selectedInvoice.issuedAt}` : ""}</div></div>
              <div><label>Kunde</label><div>{selectedInvoice.kunde || "—"}</div></div>
              <div><label>Adresse</label><div>{[selectedInvoice.customerStreet, [selectedInvoice.customerPostalCode, selectedInvoice.customerCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</div></div>
              <div><label>E-Mail</label><div>{selectedInvoice.customerEmail || "—"}</div></div>
              <div><label>BuyerReference</label><div>{selectedInvoice.buyerReference || "—"}</div></div>
              <div><label>Umsatzsteuer</label><div>{selectedInvoice.taxTreatment === "REVERSE_CHARGE_13B" ? "§ 13b UStG – Steuerschuldnerschaft des Leistungsempfängers" : `Regelbesteuerung ${fmt(selectedInvoice.mwstPct)} %`}</div></div>
              {selectedInvoice.taxTreatment === "REVERSE_CHARGE_13B" ? <div><label>Kunden-USt-IdNr.</label><div>{selectedInvoice.customerVatId || "—"}</div></div> : null}
              <div><label>Datum</label><div>{selectedInvoice.datum || "—"}</div></div>
              <div><label>Fällig</label><div>{selectedInvoice.faellig || "—"}</div></div>
              <div><label>Leistungsdatum</label><div>{selectedInvoice.leistungsdatum || "—"}</div></div>
              <div><label>Brutto</label><div><b>{fmt(brutto(selectedInvoice))} €</b></div></div>
              <div><label>Offen</label><div><b>{fmt(offen(selectedInvoice))} €</b></div></div>
              <div><label>Positionen</label><div>{selectedInvoice.positions.length}</div></div>
              {selectedInvoice.typ === "SCHLUSS" ? <>
                <div><label>Gesamtleistung netto</label><div>{fmt(selectedInvoice.netto)} €</div></div>
                <div><label>Abschläge netto</label><div>- {fmt(advanceNet(selectedInvoice))} €</div></div>
                <div><label>Rest netto</label><div><b>{fmt(accountingNet(selectedInvoice))} €</b></div></div>
              </> : null}
            </div>
          )}

          <div className="bh-actions" style={{ marginTop: 14 }}>
            <button className="bh-btn ghost" onClick={() => printSinglePDF(selectedInvoice)}>PDF öffnen</button>
            <button className="bh-btn ghost" onClick={() => downloadSinglePDF(selectedInvoice, projectId)}>PDF herunterladen</button>
          </div>
        </section>
      ) : null}

      <table className="bh-table">
        <thead>
          <tr>
            <th>Nr.</th><th>Art</th><th>Kunde</th><th>Datum</th><th>Fällig</th>
            <th>Brutto (€)</th><th>Offen (€)</th><th>Status</th><th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nr}</b></td>
              <td>{r.typ === "ABSCHLAG" ? "Abschlag" : r.typ === "SCHLUSS" ? "Schlussrechnung" : r.typ === "KORREKTUR" ? "Korrektur" : "Rechnung"}</td>
              <td>{r.kunde || "—"}</td>
              <td>{r.datum || "—"}</td>
              <td>{r.faellig || "—"}</td>
              <td>{fmt(brutto(r))}</td>
              <td><b>{fmt(offen(r))}</b></td>
              <td><StatusChip value={statusOf(r)} /></td>
              <td>
                <div className="bh-actions" style={{ gap: 6 }}>
                  <button className="bh-btn ghost" onClick={() => { setSelectedInvoiceId(r.id); setInvoiceMode("view"); }}>Öffnen</button>
                  {!fiscalLocked(r) ? <button className="bh-btn ghost" onClick={() => { setSelectedInvoiceId(r.id); setInvoiceMode("edit"); }}>Bearbeiten</button> : null}
                  {r.fiscalStatus === "AUSGESTELLT" ? <button className="bh-btn ghost" onClick={() => createCorrection(r)}>Korrektur erstellen</button> : null}
                  <button className="bh-btn ghost" onClick={() => duplicate(r)}>Duplizieren</button>
                  {!fiscalLocked(r) ? <button className="bh-btn" onClick={() => void remove(r.id)}>Entwurf löschen</button> : <span className="bh-note">{r.fiscalStatus}</span>}
                </div>
              </td>
            </tr>
          ))}
          {!filtered.length ? <tr><td colSpan={9}>Keine Rechnungen für die aktuelle Auswahl gefunden.</td></tr> : null}
        </tbody>
      </table>

      <div className="bh-note rlc-migrated-pages-buchhaltung-rechnungen-tsx-282">
        Flow aktiv: <b>Angebot → Aufmaß/Mengenermittlung → Rechnung</b>
      </div>
    </div>);

}
