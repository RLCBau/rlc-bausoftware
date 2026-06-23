// apps/web/src/pages/kalkulation/crm.tsx
import React, { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../../lib/apiBase";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";

/* ================= TYPES ================= */

type OfferStatus =
  | "Offen"
  | "Abgegeben"
  | "Nachverhandlung"
  | "Zuschlag"
  | "Abgelehnt";

type OfferSource = "manual" | "angebot" | "ki" | "manuell";

type Offer = {
  id: string;
  angebotNr: string;
  projectCode: string;
  projectName: string;
  kunde: string;
  betragNetto: number;
  betragBrutto: number;
  datum: string;
  status: OfferStatus;
  wahrscheinlichkeit: number;
  followUp: string;
  nextAction: string;
  kontakt: string;
  notiz: string;
  pdfUrl: string;
  source: OfferSource;
  createdAt: string;
  updatedAt: string;
};

type SortBy =
  | "datum"
  | "betragBrutto"
  | "projectCode"
  | "kunde"
  | "status"
  | "wahrscheinlichkeit"
  | "followUp";

type SortDir = "asc" | "desc";

type FollowUpFilter =
  | "Alle"
  | "Offen"
  | "Überfällig"
  | "Heute"
  | "7 Tage"
  | "Ohne Follow-up";

type QuickFilter =
  | "Alle"
  | "Ohne Kontakt"
  | "Ohne nächste Aktion"
  | "Ohne PDF / Link";

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
  projektName?: string;
  client?: string;
  kunde?: string;
  auftraggeber?: string;
};

type CrmRiskResult = {
  title: string;
  changes: string[];
  warnings: string[];
  unchanged: string[];
};

const STORE_KEY = "rlc_crm_angebote_v3";
const LEGACY_STORE_KEY = "rlc_crm_angebote_v2";
const ANGEBOT_HANDOFF_KEY = "rlc_kalkulation_angebot_handoff_v1";

const STATUS_OPTIONS: OfferStatus[] = [
  "Offen",
  "Abgegeben",
  "Nachverhandlung",
  "Zuschlag",
  "Abgelehnt",
];

const FOLLOW_UP_FILTERS: FollowUpFilter[] = [
  "Alle",
  "Offen",
  "Überfällig",
  "Heute",
  "7 Tage",
  "Ohne Follow-up",
];

const QUICK_FILTERS: QuickFilter[] = [
  "Alle",
  "Ohne Kontakt",
  "Ohne nächste Aktion",
  "Ohne PDF / Link",
];

/* ================= HELPERS ================= */

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function n(value: unknown, fallback = 0): number {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(value));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getProject(projectCtx: any): ProjectLike | null {
  const p =
    projectCtx?.project ||
    projectCtx?.currentProject ||
    projectCtx?.selectedProject ||
    projectCtx?.current ||
    projectCtx;

  if (!p || typeof p !== "object") return null;
  return p as ProjectLike;
}

function getProjectCode(project: ProjectLike | null): string {
  return String(
    project?.code ||
      project?.number ||
      project?.projektnummer ||
      project?.id ||
      ""
  ).trim();
}

function getProjectName(project: ProjectLike | null): string {
  return String(project?.name || project?.projectName || project?.projektName || "").trim();
}

function getProjectClient(project: ProjectLike | null): string {
  return String(project?.client || project?.kunde || project?.auftraggeber || "").trim();
}

function fmtDate(value: string): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE");
}

function normalizeOffer(row: Partial<Offer> & any): Offer {
  const status = STATUS_OPTIONS.includes(row.status) ? row.status : "Offen";
  const netto = n(row.betragNetto);
  const brutto = n(row.betragBrutto) || netto * 1.19;

  return {
    id: String(row.id || safeId()),
    angebotNr: String(row.angebotNr || ""),
    projectCode: String(row.projectCode || row.projektCode || ""),
    projectName: String(row.projectName || row.projektName || ""),
    kunde: String(row.kunde || ""),
    betragNetto: netto,
    betragBrutto: brutto,
    datum: String(row.datum || todayISO()),
    status,
    wahrscheinlichkeit: Math.max(0, Math.min(100, n(row.wahrscheinlichkeit, 50))),
    followUp: String(row.followUp || ""),
    nextAction: String(row.nextAction || ""),
    kontakt: String(row.kontakt || ""),
    notiz: String(row.notiz || ""),
    pdfUrl: String(row.pdfUrl || ""),
    source: row.source || "manual",
    createdAt: String(row.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
}

function loadOffers(): Offer[] {
  try {
    const raw =
      localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY);

    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeOffer);
  } catch {
    return [];
  }
}

function saveOffers(rows: Offer[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(rows.map(normalizeOffer)));
}

function getCrmAuthHeaders(extra: Record<string, string> = {}) {
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

function extractServerOffers(data: any): Offer[] {
  const raw =
    data?.data?.items ||
    data?.items ||
    data?.snapshot?.data?.items ||
    [];

  return Array.isArray(raw) ? raw.map(normalizeOffer) : [];
}
function findLatestAngebotSnapshot(projectCode?: string): string | null {
  if (typeof localStorage === "undefined") return null;

  const exactKey = projectCode ? `rlc_angebot_snapshot_v4:${projectCode}` : "";
  if (exactKey) {
    const exact = localStorage.getItem(exactKey);
    if (exact) return exact;
  }

  const candidates: { raw: string; savedAt: string }[] = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i) || "";
    if (!key.startsWith("rlc_angebot_snapshot_v4:")) continue;

    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      candidates.push({
        raw,
        savedAt: String(parsed?.meta?.savedAt || parsed?.savedAt || ""),
      });
    } catch {
      candidates.push({ raw, savedAt: "" });
    }
  }

  candidates.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  return candidates[0]?.raw || null;
}

function statusStyle(status: OfferStatus): React.CSSProperties {
  if (status === "Zuschlag") return badgeOk;
  if (status === "Abgelehnt") return badgeCritical;
  if (status === "Nachverhandlung") return badgeWarn;
  if (status === "Abgegeben") return badgeBlue;
  return badgeNeutral;
}

function statusWeight(status: OfferStatus): number {
  if (status === "Offen") return 1;
  if (status === "Abgegeben") return 2;
  if (status === "Nachverhandlung") return 3;
  if (status === "Zuschlag") return 4;
  if (status === "Abgelehnt") return 5;
  return 0;
}

function isClosed(status: OfferStatus): boolean {
  return status === "Zuschlag" || status === "Abgelehnt";
}

function dateOnly(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysDiffFromToday(value: string): number | null {
  const d = dateOnly(value);
  const today = dateOnly(todayISO());

  if (!d || !today) return null;

  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function followUpLabel(offer: Offer): string {
  if (!offer.followUp) return "—";

  const diff = daysDiffFromToday(offer.followUp);
  if (diff == null) return fmtDate(offer.followUp);
  if (isClosed(offer.status)) return fmtDate(offer.followUp);

  if (diff < 0) return `Überfällig (${fmtDate(offer.followUp)})`;
  if (diff === 0) return `Heute (${fmtDate(offer.followUp)})`;
  if (diff === 1) return `Morgen (${fmtDate(offer.followUp)})`;

  return `${fmtDate(offer.followUp)} · in ${diff} Tagen`;
}

function followUpStyle(offer: Offer): React.CSSProperties {
  const diff = daysDiffFromToday(offer.followUp);

  if (!offer.followUp || isClosed(offer.status) || diff == null) {
    return badgeNeutral;
  }

  if (diff < 0) return badgeCritical;
  if (diff === 0) return badgeWarn;
  if (diff <= 7) return badgeBlue;

  return badgeNeutral;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(rows: Offer[]) {
  const header = [
    "AngebotNr",
    "ProjectCode",
    "ProjectName",
    "Kunde",
    "Netto",
    "Brutto",
    "Datum",
    "Status",
    "Wahrscheinlichkeit",
    "FollowUp",
    "NaechsteAktion",
    "Kontakt",
    "Notiz",
    "PDF",
    "Quelle",
  ];

  const lines = rows.map((r) =>
    [
      r.angebotNr,
      r.projectCode,
      r.projectName,
      r.kunde,
      r.betragNetto,
      r.betragBrutto,
      r.datum,
      r.status,
      r.wahrscheinlichkeit,
      r.followUp,
      r.nextAction,
      r.kontakt,
      r.notiz,
      r.pdfUrl,
      r.source,
    ]
      .map(csvCell)
      .join(";")
  );

  const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Angebotsverfolgung.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildRiskAnalysis(rows: Offer[]): CrmRiskResult {
  const warnings: string[] = [];
  const changes: string[] = [];
  const unchanged: string[] = [];

  const openRows = rows.filter((r) => !isClosed(r.status));
  const overdueRows = openRows.filter((r) => {
    const diff = daysDiffFromToday(r.followUp);
    return diff != null && diff < 0;
  });

  const noFollowUp = openRows.filter((r) => !r.followUp);
  const noAction = openRows.filter((r) => !r.nextAction.trim());
  const noContact = openRows.filter((r) => !r.kontakt.trim());
  const noPdf = rows.filter((r) => !r.pdfUrl.trim());
  const highValueOpen = openRows.filter((r) => r.betragBrutto >= 25000);
  const lowChanceHighValue = openRows.filter(
    (r) => r.betragBrutto >= 25000 && r.wahrscheinlichkeit < 40
  );

  changes.push(`Analysierte Angebote: ${rows.length}.`);
  changes.push(`Offene Angebote: ${openRows.length}.`);
  changes.push(`Überfällige Follow-ups: ${overdueRows.length}.`);
  changes.push(`Angebote ohne Follow-up: ${noFollowUp.length}.`);
  changes.push(`Angebote ohne nächste Aktion: ${noAction.length}.`);

  if (overdueRows.length) {
    warnings.push(`${overdueRows.length} Angebot(e) sind überfällig und müssen nachgefasst werden.`);
  }

  if (noFollowUp.length) {
    warnings.push(`${noFollowUp.length} offene Angebot(e) haben kein Follow-up-Datum.`);
  }

  if (noAction.length) {
    warnings.push(`${noAction.length} offene Angebot(e) haben keine nächste Aktion.`);
  }

  if (noContact.length) {
    warnings.push(`${noContact.length} offene Angebot(e) haben keinen Kontakt hinterlegt.`);
  }

  if (noPdf.length) {
    warnings.push(`${noPdf.length} Angebot(e) haben keinen PDF-/Link-Nachweis.`);
  }

  if (highValueOpen.length) {
    warnings.push(`${highValueOpen.length} offene Angebot(e) über 25.000 € sollten aktiv verfolgt werden.`);
  }

  if (lowChanceHighValue.length) {
    warnings.push(`${lowChanceHighValue.length} wertvolle Angebot(e) haben niedrige Abschlusschance.`);
  }

  if (!warnings.length) {
    unchanged.push("Keine kritischen Angebotsrisiken gefunden.");
  }

  return {
    title: "Angebotsanalyse abgeschlossen",
    changes,
    warnings,
    unchanged,
  };
}

function emitKiStart(text: string) {
  window.dispatchEvent(
    new CustomEvent("rlc:ki-action-start", {
      detail: { title: text, text, progress: 12 },
    })
  );
}

function emitKiProgress(text: string, progress: number) {
  window.dispatchEvent(
    new CustomEvent("rlc:ki-action-progress", {
      detail: { text, progress },
    })
  );
}

function emitKiResult(result: CrmRiskResult) {
  window.dispatchEvent(
    new CustomEvent("rlc:ki-action-result", {
      detail: result,
    })
  );
}

function exportPdfReport(rows: Offer[], totals: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const today = fmtDate(todayISO());

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 32, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("RLC Bausoftware", marginX, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text("Angebotsverfolgung · Angebotsmanagement", marginX, 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`Stand: ${today}`, pageW - marginX, 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text("RLC Angebotsreport", pageW - marginX, 21, { align: "right" });

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text("Angebotsverfolgung", marginX, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Übersicht über offene Angebote, Follow-ups, Zuschläge, Absagen und gewichtetes Angebotsvolumen.",
    marginX,
    56
  );

  const kpiY = 68;
  const kpiH = 22;
  const kpiGap = 4;
  const kpiW = (pageW - marginX * 2 - kpiGap * 5) / 6;

  const kpis: [string, string][] = [
    ["Angebote", String(totals.count)],
    ["Volumen gesamt", money(totals.total)],
    ["Offen", money(totals.sumOpen)],
    ["Gewichtet", money(totals.weighted)],
    ["Zuschlag", money(totals.sumWon)],
    ["Quote", `${totals.quote}%`],
  ];

  kpis.forEach(([label, value], index) => {
    const x = marginX + index * (kpiW + kpiGap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 4, kpiY + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x + 4, kpiY + 16, {
      maxWidth: kpiW - 8,
    });
  });

  const statusCounts = STATUS_OPTIONS.map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
    total: rows
      .filter((r) => r.status === status)
      .reduce((sum, r) => sum + n(r.betragBrutto), 0),
  }));

  const statusY = 99;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Statusübersicht", marginX, statusY);

  let sx = marginX;
  statusCounts.forEach((item) => {
    const label = `${item.status}: ${item.count} · ${money(item.total)}`;
    const w = Math.max(36, doc.getTextWidth(label) + 10);

    if (item.status === "Zuschlag") {
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.setTextColor(21, 128, 61);
    } else if (item.status === "Abgelehnt") {
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
      doc.setTextColor(185, 28, 28);
    } else if (item.status === "Nachverhandlung") {
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(253, 230, 138);
      doc.setTextColor(180, 83, 9);
    } else {
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(191, 219, 254);
      doc.setTextColor(29, 78, 216);
    }

    doc.roundedRect(sx, statusY + 5, w, 8.5, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(label, sx + 5, statusY + 10.8);

    sx += w + 4;
  });

  autoTable(doc, {
    startY: 123,
    margin: { left: marginX, right: marginX },
    tableWidth: pageW - marginX * 2,
    theme: "grid",
    head: [
      [
        "Angebot",
        "Projekt",
        "Kunde",
        "Netto",
        "Brutto",
        "Datum",
        "Status",
        "Chance",
        "Follow-up / Aktion",
      ],
    ],
    body: rows.map((r) => [
      r.angebotNr || "—",
      `${r.projectCode || "—"}${r.projectName ? "\n" + r.projectName : ""}`,
      r.kunde || "—",
      money(r.betragNetto),
      money(r.betragBrutto),
      fmtDate(r.datum),
      r.status,
      `${r.wahrscheinlichkeit}%`,
      [followUpLabel(r), r.nextAction || r.notiz || ""].filter(Boolean).join("\n"),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.7,
      overflow: "linebreak",
      valign: "top",
      lineColor: [210, 218, 230],
      lineWidth: 0.15,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.4,
      cellPadding: 1.8,
      lineColor: [30, 64, 175],
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 38 },
      2: { cellWidth: 34 },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 27, halign: "right" },
      5: { cellWidth: 21 },
      6: { cellWidth: 24 },
      7: { cellWidth: 16, halign: "right" },
      8: { cellWidth: 52 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const status = String(data.cell.raw || "");

        if (status === "Zuschlag") {
          data.cell.styles.textColor = [21, 128, 61];
          data.cell.styles.fontStyle = "bold";
        }

        if (status === "Abgelehnt") {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }

        if (status === "Nachverhandlung") {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        }

        if (status === "Abgegeben") {
          data.cell.styles.textColor = [29, 78, 216];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  const pages = doc.getNumberOfPages();

  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);

    doc.text("RLC Bausoftware · Angebotsverfolgung", marginX, pageH - 8);
    doc.text(`Seite ${i}/${pages}`, pageW - marginX, pageH - 8, {
      align: "right",
    });
  }

  doc.save("Angebotsverfolgung_Report.pdf");
}

/* ================= COMPONENT ================= */

export default function CRMAngebotsverfolgungPage() {
  const navigate = useNavigate();
  const projectCtx: any = useProject();
  const project = getProject(projectCtx);

  const currentProjectCode = getProjectCode(project);
  const currentProjectName = getProjectName(project);
  const currentProjectClient = getProjectClient(project);

  const [offers, setOffers] = useState<Offer[]>(() => loadOffers());
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "Alle">("Alle");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("Alle");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("Alle");
  const [sortBy, setSortBy] = useState<SortBy>("datum");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [info, setInfo] = useState("");

  const [form, setForm] = useState<Partial<Offer>>({
    angebotNr: `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    projectCode: currentProjectCode,
    projectName: currentProjectName,
    kunde: currentProjectClient,
    betragNetto: 0,
    betragBrutto: 0,
    datum: todayISO(),
    status: "Offen",
    wahrscheinlichkeit: 50,
    followUp: "",
    nextAction: "",
    kontakt: "",
    notiz: "",
    pdfUrl: "",
  });

  useEffect(() => {
    saveOffers(offers);
  }, [offers]);

  
  async function saveOffersToServer() {
    try {
      setInfo("Speichere Angebotsverfolgung auf Server …");

      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/angebotsverfolgung/${encodeURIComponent(currentProjectCode || "NO_PROJECT")}/save`),
        {
          method: "POST",
          credentials: "include",
          headers: getCrmAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            data: {
              items: offers.map(normalizeOffer),
              savedAt: new Date().toISOString(),
              projectCode: currentProjectCode,
              projectName: currentProjectName,
            },
          }),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setInfo(`Server-Speichern fehlgeschlagen: ${json?.error || res.status}`);
        return;
      }

      setInfo(`Angebotsverfolgung auf Server gespeichert · ${offers.length} Angebot(e).`);
    } catch (e: any) {
      setInfo(`Server-Speichern fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    }
  }

  async function loadOffersFromServer() {
    try {
      setInfo("Lade Angebotsverfolgung vom Server …");

      const res = await fetch(
        apiUrl(`/api/kalkulation/storage/angebotsverfolgung/${encodeURIComponent(currentProjectCode || "NO_PROJECT")}`),
        {
          method: "GET",
          credentials: "include",
          headers: getCrmAuthHeaders(),
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setInfo(`Server-Laden fehlgeschlagen: ${json?.error || res.status}`);
        return;
      }

      const serverOffers = extractServerOffers(json);

      if (!serverOffers.length) {
        setInfo("Keine Angebotsverfolgung auf dem Server gefunden.");
        return;
      }

      const clean = serverOffers.map(normalizeOffer);
      setOffers(clean);
      saveOffers(clean);

      setInfo(`Angebotsverfolgung vom Server geladen · ${serverOffers.length} Angebot(e).`);
    } catch (e: any) {
      setInfo(`Server-Laden fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    }
  }
useEffect(() => {
    setForm((prev) => ({
      ...prev,
      projectCode: prev.projectCode || currentProjectCode,
      projectName: prev.projectName || currentProjectName,
      kunde: prev.kunde || currentProjectClient,
    }));
  }, [currentProjectCode, currentProjectName, currentProjectClient]);

  function persist(next: Offer[]) {
    const clean = next.map(normalizeOffer);
    setOffers(clean);
    saveOffers(clean);
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();

    let result = offers.filter((offer) => {
      if (statusFilter !== "Alle" && offer.status !== statusFilter) return false;

      const diff = daysDiffFromToday(offer.followUp);

      if (followUpFilter === "Offen" && isClosed(offer.status)) return false;
      if (
        followUpFilter === "Überfällig" &&
        !(diff != null && diff < 0 && !isClosed(offer.status))
      ) {
        return false;
      }
      if (followUpFilter === "Heute" && !(diff === 0 && !isClosed(offer.status))) {
        return false;
      }
      if (
        followUpFilter === "7 Tage" &&
        !(diff != null && diff >= 0 && diff <= 7 && !isClosed(offer.status))
      ) {
        return false;
      }
      if (followUpFilter === "Ohne Follow-up" && offer.followUp) return false;

      if (quickFilter === "Ohne Kontakt" && offer.kontakt.trim()) return false;
      if (quickFilter === "Ohne nächste Aktion" && offer.nextAction.trim()) return false;
      if (quickFilter === "Ohne PDF / Link" && offer.pdfUrl.trim()) return false;

      if (!q) return true;

      const hay = [
        offer.angebotNr,
        offer.projectCode,
        offer.projectName,
        offer.kunde,
        offer.status,
        offer.kontakt,
        offer.nextAction,
        offer.notiz,
        offer.betragNetto,
        offer.betragBrutto,
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    result = [...result].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      if (sortBy === "betragBrutto") {
        av = a.betragBrutto;
        bv = b.betragBrutto;
      } else if (sortBy === "wahrscheinlichkeit") {
        av = a.wahrscheinlichkeit;
        bv = b.wahrscheinlichkeit;
      } else if (sortBy === "status") {
        av = statusWeight(a.status);
        bv = statusWeight(b.status);
      } else {
        av = String(a[sortBy] ?? "");
        bv = String(b[sortBy] ?? "");
      }

      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }

      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "de", {
            numeric: true,
            sensitivity: "base",
          })
        : String(bv).localeCompare(String(av), "de", {
            numeric: true,
            sensitivity: "base",
          });
    });

    return result;
  }, [offers, filter, statusFilter, followUpFilter, quickFilter, sortBy, sortDir]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const selectedOffers = useMemo(
    () => offers.filter((offer) => selectedIds.includes(offer.id)),
    [offers, selectedIds]
  );

  const actionTargetRows = selectedOffers.length ? selectedOffers : filtered.slice(0, 1);

  const totals = useMemo(() => {
    const sumOpen = filtered
      .filter((offer) => offer.status !== "Zuschlag" && offer.status !== "Abgelehnt")
      .reduce((sum, offer) => sum + offer.betragBrutto, 0);

    const sumWon = filtered
      .filter((offer) => offer.status === "Zuschlag")
      .reduce((sum, offer) => sum + offer.betragBrutto, 0);

    const sumLost = filtered
      .filter((offer) => offer.status === "Abgelehnt")
      .reduce((sum, offer) => sum + offer.betragBrutto, 0);

    const total = filtered.reduce((sum, offer) => sum + offer.betragBrutto, 0);
    const wonCount = filtered.filter((offer) => offer.status === "Zuschlag").length;

    const overdue = filtered.filter((offer) => {
      const diff = daysDiffFromToday(offer.followUp);
      return diff != null && diff < 0 && !isClosed(offer.status);
    }).length;

    const due7 = filtered.filter((offer) => {
      const diff = daysDiffFromToday(offer.followUp);
      return diff != null && diff >= 0 && diff <= 7 && !isClosed(offer.status);
    }).length;

    const weighted = filtered.reduce(
      (sum, offer) =>
        isClosed(offer.status)
          ? sum
          : sum + offer.betragBrutto * (offer.wahrscheinlichkeit / 100),
      0
    );

    const quote = filtered.length ? Math.round((wonCount / filtered.length) * 100) : 0;

    return {
      count: filtered.length,
      total,
      sumOpen,
      sumWon,
      sumLost,
      quote,
      overdue,
      due7,
      weighted,
    };
  }, [filtered]);

  function importFromAngebot() {
    setInfo("");

    try {
      const raw =
        findLatestAngebotSnapshot(currentProjectCode) ||
        localStorage.getItem(ANGEBOT_HANDOFF_KEY) ||
        sessionStorage.getItem("kalkulation:lastDraft");

      if (!raw) {
        setInfo("Keine Angebotsdaten gefunden. Erst ein Angebot erzeugen oder übergeben.");
        return;
      }

      const data = JSON.parse(raw);
      const offerData = data.offer || {};
      const summary = data.summary || {};
      const totals = data.totals || {};
      const meta = data.meta || {};
      const metaProject = meta.project || {};

      const angebotNr =
        offerData.number ||
        data.angebotNr ||
        data.offerNo ||
        `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

      const imported: Offer = normalizeOffer({
        id: `angebot-${angebotNr}`,
        angebotNr,
        projectCode: meta.projectKey || data.projectKey || data.projectCode || currentProjectCode,
        projectName:
          metaProject.name ||
          metaProject.projectName ||
          metaProject.projektname ||
          data.projectName ||
          currentProjectName ||
          "",
        kunde:
          offerData.clientName ||
          offerData.kunde ||
          data.client?.name ||
          data.kunde ||
          currentProjectClient ||
          "",
        betragNetto: n(summary.netto ?? summary.net ?? totals.netto),
        betragBrutto: n(summary.brutto ?? summary.gross ?? totals.brutto),
        datum: String(meta.savedAt || "").slice(0, 10) || todayISO(),
        status: "Offen",
        wahrscheinlichkeit: 50,
        followUp: "",
        nextAction: "Angebot nachfassen",
        kontakt: "",
        notiz: "Automatisch aus Angebot übernommen.",
        pdfUrl: String(data.pdfUrl || data.fileUrl || data.offerPdfUrl || ""),
        source:
          data.source === "ki"
            ? "ki"
            : data.source === "manuell"
            ? "manuell"
            : "angebot",
      });

      const withoutDuplicate = offers.filter(
        (offer) => offer.angebotNr !== imported.angebotNr
      );

      persist([imported, ...withoutDuplicate]);

      setForm((prev) => ({
        ...prev,
        angebotNr: imported.angebotNr,
        projectCode: imported.projectCode,
        projectName: imported.projectName,
        kunde: imported.kunde,
        betragNetto: imported.betragNetto,
        betragBrutto: imported.betragBrutto,
      }));

      setInfo(`Angebot ${imported.angebotNr} wurde übernommen.`);
    } catch (e: any) {
      setInfo(`Import fehlgeschlagen: ${e?.message || e}`);
    }
  }

  function addOffer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const netto = n(form.betragNetto);
    const brutto = n(form.betragBrutto) || netto * 1.19;

    const item = normalizeOffer({
      ...form,
      id: safeId(),
      betragNetto: netto,
      betragBrutto: brutto,
      source: "manual",
      createdAt: new Date().toISOString(),
    });

    persist([item, ...offers]);

    setForm({
      angebotNr: `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
      projectCode: currentProjectCode,
      projectName: currentProjectName,
      kunde: currentProjectClient,
      betragNetto: 0,
      betragBrutto: 0,
      datum: todayISO(),
      status: "Offen",
      wahrscheinlichkeit: 50,
      followUp: "",
      nextAction: "",
      kontakt: "",
      notiz: "",
      pdfUrl: "",
    });

    setInfo("Angebot wurde hinzugefügt.");
  }

  function updateOffer(id: string, patch: Partial<Offer>) {
    persist(
      offers.map((offer) =>
        offer.id === id ? normalizeOffer({ ...offer, ...patch }) : offer
      )
    );
  }

  function updateMany(ids: string[], patch: Partial<Offer>) {
    if (!ids.length) {
      setInfo("Keine Angebote ausgewählt.");
      return;
    }

    persist(
      offers.map((offer) =>
        ids.includes(offer.id)
          ? normalizeOffer({ ...offer, ...patch, updatedAt: new Date().toISOString() })
          : offer
      )
    );
  }

  function deleteOffer(id: string) {
    if (!confirm("Dieses Angebot wirklich löschen?")) return;
    persist(offers.filter((offer) => offer.id !== id));
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function clearAll() {
    if (!confirm("Alle Angebote löschen?")) return;
    persist([]);
    setSelected({});
  }

  function openOffer(offer: Offer) {
    if (offer.pdfUrl) {
      window.open(offer.pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const payload = {
      source: offer.source,
      projectKey: offer.projectCode,
      offer: {
        number: offer.angebotNr,
        clientName: offer.kunde,
      },
      summary: {
        netto: offer.betragNetto,
        brutto: offer.betragBrutto,
      },
    };

    sessionStorage.setItem("kalkulation:lastDraft", JSON.stringify(payload));

    navigate(
      `/kalkulation/angebot${
        offer.projectCode ? `?projectCode=${encodeURIComponent(offer.projectCode)}` : ""
      }`
    );
  }

  function selectVisible() {
    const next = { ...selected };
    filtered.forEach((offer) => {
      next[offer.id] = true;
    });
    setSelected(next);
    setInfo(`${filtered.length} sichtbare Angebot(e) ausgewählt.`);
  }

  function clearSelection() {
    setSelected({});
    setInfo("Auswahl aufgehoben.");
  }

  function runRiskAnalysis(rows = filtered) {
    emitKiStart("Angebotsanalyse läuft…");
    window.setTimeout(() => emitKiProgress("Follow-ups werden geprüft…", 45), 120);
    window.setTimeout(() => emitKiProgress("Status und Angebotssummen werden bewertet…", 75), 260);

    const result = buildRiskAnalysis(rows);

    window.setTimeout(() => {
      emitKiResult(result);
      setInfo("Angebotsanalyse abgeschlossen.");
    }, 420);
  }

  function handleCrmCommand(action: string) {
    if (action === "showOpen") {
      setStatusFilter("Offen");
      setFollowUpFilter("Alle");
      setQuickFilter("Alle");
      setInfo("Offene Angebote werden angezeigt.");
      return;
    }

    if (action === "showOverdue") {
      setStatusFilter("Alle");
      setFollowUpFilter("Überfällig");
      setQuickFilter("Alle");
      setInfo("Überfällige Follow-ups werden angezeigt.");
      return;
    }

    if (action === "showToday") {
      setStatusFilter("Alle");
      setFollowUpFilter("Heute");
      setQuickFilter("Alle");
      setInfo("Heutige Follow-ups werden angezeigt.");
      return;
    }

    if (action === "showMissingContact") {
      setQuickFilter("Ohne Kontakt");
      setInfo("Angebote ohne Kontakt werden angezeigt.");
      return;
    }

    if (action === "showMissingAction") {
      setQuickFilter("Ohne nächste Aktion");
      setInfo("Angebote ohne nächste Aktion werden angezeigt.");
      return;
    }

    if (action === "showMissingPdf") {
      setQuickFilter("Ohne PDF / Link");
      setInfo("Angebote ohne PDF/Link werden angezeigt.");
      return;
    }

    if (action === "createFollowUp") {
      const ids = actionTargetRows.map((x) => x.id);
      updateMany(ids, {
        followUp: addDaysISO(7),
        nextAction: "Angebot nachfassen",
      });
      setInfo(`${ids.length} Angebot(e) mit Follow-up in 7 Tagen vorbereitet.`);
      return;
    }

    if (action === "markNachgefasst") {
      const ids = actionTargetRows.map((x) => x.id);
      updateMany(ids, {
        status: "Nachverhandlung",
        followUp: addDaysISO(7),
        nextAction: "Nachverhandlung / Rückmeldung prüfen",
        notiz: `Nachgefasst am ${fmtDate(todayISO())}.`,
      });
      setInfo(`${ids.length} Angebot(e) als nachgefasst markiert.`);
      return;
    }

    if (action === "markGewonnen") {
      const ids = actionTargetRows.map((x) => x.id);
      updateMany(ids, {
        status: "Zuschlag",
        wahrscheinlichkeit: 100,
        nextAction: "Auftrag vorbereiten / Projektübergabe",
      });
      setInfo(`${ids.length} Angebot(e) als gewonnen markiert.`);
      return;
    }

    if (action === "markVerloren") {
      const ids = actionTargetRows.map((x) => x.id);
      updateMany(ids, {
        status: "Abgelehnt",
        wahrscheinlichkeit: 0,
        nextAction: "Absagegrund dokumentieren",
      });
      setInfo(`${ids.length} Angebot(e) als verloren markiert.`);
      return;
    }

    if (action === "riskAnalysis") {
      runRiskAnalysis(filtered);
      return;
    }

    if (action === "exportPdf") {
      if (!filtered.length) {
        setInfo("Keine Angebote für PDF-Export vorhanden.");
        return;
      }
      exportPdfReport(filtered, totals);
      setInfo("PDF-Report wurde erzeugt.");
      return;
    }

    if (action === "syncServer") {
      void saveOffersToServer();
      return;
    }

    if (action === "loadServer") {
      void loadOffersFromServer();
      return;
    }
  }

  useEffect(() => {
    function onCrmCommand(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};
      const action = String(detail.action || "");
      if (!action) return;
      handleCrmCommand(action);
    }

    window.addEventListener("rlc:crm-command", onCrmCommand);

    return () => {
      window.removeEventListener("rlc:crm-command", onCrmCommand);
    };
  }, [filtered, offers, selectedOffers, actionTargetRows, totals]);

  return (
    <div style={page}>
      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC Modul · Angebotsverfolgung</div>
          <h1 style={title}>Angebotsverfolgung</h1>
          <p style={subtitle}>
            Angebote übernehmen, Status verfolgen, Follow-ups planen und Zuschläge auswerten.
          </p>
        </div>

        <div style={heroActions}>
          <button type="button" style={btnPrimary} onClick={importFromAngebot}>
            Aus Angebot übernehmen
          </button>
          <button type="button" style={btnSecondary} onClick={saveOffersToServer} disabled={!offers.length}>
            Server speichern
          </button>

          <button type="button" style={btnSecondary} onClick={loadOffersFromServer}>
            Server laden
          </button>

          <button type="button" style={btnSecondary} onClick={selectVisible} disabled={!filtered.length}>
            Sichtbare auswählen
          </button>

          <button type="button" style={btnSecondary} onClick={clearSelection} disabled={!selectedIds.length}>
            Auswahl löschen ({selectedIds.length})
          </button>

          <button type="button" style={btnSecondary} onClick={() => runRiskAnalysis(filtered)} disabled={!filtered.length}>
            Risikoanalyse
          </button>

          <button type="button" style={btnSecondary} onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
            CSV exportieren
          </button>

          <button type="button" style={btnSecondary} onClick={() => exportPdfReport(filtered, totals)} disabled={!filtered.length}>
            PDF-Report
          </button>

          <button type="button" style={btnDanger} onClick={clearAll} disabled={!offers.length}>
            Alles löschen
          </button>
        </div>

        <div style={heroMeta}>
          Projekt: <b>{currentProjectCode || "—"}</b>
          {currentProjectName ? <span> · {currentProjectName}</span> : null}
        </div>
      </section>

      {info ? <div style={infoBox}>{info}</div> : null}

      <section style={kpiGrid}>
        <Kpi label="Angebote" value={String(totals.count)} />
        <Kpi label="Ausgewählt" value={String(selectedIds.length)} />
        <Kpi label="Volumen gesamt" value={money(totals.total)} />
        <Kpi label="Offenes Volumen" value={money(totals.sumOpen)} />
        <Kpi label="Gewichtet" value={money(totals.weighted)} />
        <Kpi label="Zuschlag gesamt" value={money(totals.sumWon)} />
        <Kpi label="Abgelehnt gesamt" value={money(totals.sumLost)} danger />
        <Kpi label="Follow-up 7 Tage" value={String(totals.due7)} />
        <Kpi label="Überfällig" value={String(totals.overdue)} danger={totals.overdue > 0} />
        <Kpi label="Erfolgsquote" value={`${totals.quote}%`} />
      </section>

      <form onSubmit={addOffer} style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Neues Angebot erfassen</h2>
            <div style={sectionText}>
              Für manuelle Einträge oder Angebote, die nicht automatisch aus der Kalkulation kommen.
            </div>
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Angebot Nr.">
            <input
              required
              value={form.angebotNr || ""}
              onChange={(e) => setForm({ ...form, angebotNr: e.target.value })}
              style={input}
            />
          </Field>

          <Field label="Projekt-Nr.">
            <input
              value={form.projectCode || ""}
              onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
              style={input}
            />
          </Field>

          <Field label="Projektname">
            <input
              value={form.projectName || ""}
              onChange={(e) => setForm({ ...form, projectName: e.target.value })}
              style={input}
            />
          </Field>

          <Field label="Kunde / Auftraggeber">
            <input
              required
              value={form.kunde || ""}
              onChange={(e) => setForm({ ...form, kunde: e.target.value })}
              style={input}
            />
          </Field>

          <Field label="Netto">
            <input
              type="number"
              step="0.01"
              value={form.betragNetto ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  betragNetto: n(e.target.value),
                  betragBrutto: n(e.target.value) * 1.19,
                })
              }
              style={input}
            />
          </Field>

          <Field label="Brutto">
            <input
              type="number"
              step="0.01"
              value={form.betragBrutto ?? 0}
              onChange={(e) =>
                setForm({ ...form, betragBrutto: n(e.target.value) })
              }
              style={input}
            />
          </Field>

          <Field label="Datum">
            <input
              type="date"
              value={form.datum || todayISO()}
              onChange={(e) => setForm({ ...form, datum: e.target.value })}
              style={input}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status || "Offen"}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as OfferStatus })
              }
              style={input}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </Field>

          <Field label="Chance %">
            <input
              type="number"
              min={0}
              max={100}
              value={form.wahrscheinlichkeit ?? 50}
              onChange={(e) =>
                setForm({ ...form, wahrscheinlichkeit: n(e.target.value) })
              }
              style={input}
            />
          </Field>

          <Field label="Follow-up">
            <input
              type="date"
              value={form.followUp || ""}
              onChange={(e) => setForm({ ...form, followUp: e.target.value })}
              style={input}
            />
          </Field>

          <Field label="Kontakt">
            <input
              value={form.kontakt || ""}
              onChange={(e) => setForm({ ...form, kontakt: e.target.value })}
              style={input}
              placeholder="Name / Telefon / E-Mail"
            />
          </Field>

          <Field label="PDF / Link">
            <input
              value={form.pdfUrl || ""}
              onChange={(e) => setForm({ ...form, pdfUrl: e.target.value })}
              style={input}
              placeholder="Optional: PDF-Link"
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Nächste Aktion">
            <input
              value={form.nextAction || ""}
              onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
              style={input}
              placeholder="z.B. Kunde anrufen, Angebot nachfassen, Preis prüfen..."
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Notiz">
            <textarea
              value={form.notiz || ""}
              onChange={(e) => setForm({ ...form, notiz: e.target.value })}
              style={{ ...input, minHeight: 70 }}
              placeholder="Follow-up, Gesprächsnotiz, Besonderheiten..."
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="submit" style={btnPrimary}>
            Angebot hinzufügen
          </button>
        </div>
      </form>

      <section style={card}>
        <div style={toolbar}>
          <input
            placeholder="Suche nach Angebot, Projekt, Kunde, Status, Kontakt, Aktion oder Betrag…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={searchInput}
          />

          <div style={toolbarRight}>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as OfferStatus | "Alle")
              }
              style={select}
            >
              <option value="Alle">Alle Status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              value={followUpFilter}
              onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)}
              style={select}
            >
              {FOLLOW_UP_FILTERS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>

            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
              style={select}
            >
              {QUICK_FILTERS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              style={select}
            >
              <option value="datum">Datum</option>
              <option value="followUp">Follow-up</option>
              <option value="betragBrutto">Betrag</option>
              <option value="projectCode">Projekt</option>
              <option value="kunde">Kunde</option>
              <option value="status">Status</option>
              <option value="wahrscheinlichkeit">Chance</option>
            </select>

            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDir)}
              style={select}
            >
              <option value="desc">Absteigend</option>
              <option value="asc">Aufsteigend</option>
            </select>
          </div>
        </div>

        {selectedIds.length ? (
          <div style={bulkBar}>
            <b>{selectedIds.length} Angebot(e) ausgewählt</b>

            <button
              type="button"
              style={btnMini}
              onClick={() =>
                updateMany(selectedIds, {
                  followUp: addDaysISO(7),
                  nextAction: "Angebot nachfassen",
                })
              }
            >
              Follow-up +7 Tage
            </button>

            <button
              type="button"
              style={btnMini}
              onClick={() =>
                updateMany(selectedIds, {
                  status: "Nachverhandlung",
                  nextAction: "Nachverhandlung / Rückmeldung prüfen",
                })
              }
            >
              Nachverhandlung
            </button>

            <button
              type="button"
              style={btnMini}
              onClick={() =>
                updateMany(selectedIds, {
                  status: "Zuschlag",
                  wahrscheinlichkeit: 100,
                  nextAction: "Auftrag vorbereiten / Projektübergabe",
                })
              }
            >
              Zuschlag
            </button>

            <button
              type="button"
              style={btnDangerMini}
              onClick={() =>
                updateMany(selectedIds, {
                  status: "Abgelehnt",
                  wahrscheinlichkeit: 0,
                  nextAction: "Absagegrund dokumentieren",
                })
              }
            >
              Abgelehnt
            </button>
          </div>
        ) : null}

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((o) => selected[o.id])}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectVisible();
                      } else {
                        clearSelection();
                      }
                    }}
                  />
                </th>
                <th style={th}>Angebot</th>
                <th style={th}>Projekt</th>
                <th style={th}>Kunde</th>
                <th style={thRight}>Netto</th>
                <th style={thRight}>Brutto</th>
                <th style={th}>Datum</th>
                <th style={th}>Status</th>
                <th style={thRight}>Chance</th>
                <th style={th}>Follow-up</th>
                <th style={th}>Nächste Aktion</th>
                <th style={th}>Kontakt / Notiz</th>
                <th style={th}>Aktion</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((offer, i) => (
                <tr
                  key={offer.id}
                  style={{ background: i % 2 ? "#FCFCFC" : "#FFFFFF" }}
                >
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={!!selected[offer.id]}
                      onChange={(e) =>
                        setSelected((prev) => ({
                          ...prev,
                          [offer.id]: e.target.checked,
                        }))
                      }
                    />
                  </td>

                  <td style={tdStrong}>
                    {offer.angebotNr || "—"}
                    <div style={tiny}>Quelle: {offer.source}</div>
                    {offer.pdfUrl ? <div style={tinyOk}>PDF vorhanden</div> : null}
                  </td>

                  <td style={td}>
                    <b>{offer.projectCode || "—"}</b>
                    <div style={tiny}>{offer.projectName || "—"}</div>
                  </td>

                  <td style={td}>{offer.kunde || "—"}</td>
                  <td style={tdRight}>{money(offer.betragNetto)}</td>
                  <td style={tdRight}>{money(offer.betragBrutto)}</td>
                  <td style={td}>{fmtDate(offer.datum)}</td>

                  <td style={td}>
                    <select
                      value={offer.status}
                      onChange={(e) =>
                        updateOffer(offer.id, {
                          status: e.target.value as OfferStatus,
                        })
                      }
                      style={smallSelect}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                    <div style={{ marginTop: 5 }}>
                      <span style={statusStyle(offer.status)}>{offer.status}</span>
                    </div>
                  </td>

                  <td style={tdRight}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={offer.wahrscheinlichkeit}
                      onChange={(e) =>
                        updateOffer(offer.id, {
                          wahrscheinlichkeit: n(e.target.value),
                        })
                      }
                      style={chanceInput}
                    />
                    %
                  </td>

                  <td style={td}>
                    <input
                      type="date"
                      value={offer.followUp || ""}
                      onChange={(e) =>
                        updateOffer(offer.id, { followUp: e.target.value })
                      }
                      style={dateInput}
                    />
                    <div style={{ marginTop: 5 }}>
                      <span style={followUpStyle(offer)}>
                        {followUpLabel(offer)}
                      </span>
                    </div>
                  </td>

                  <td style={td}>
                    <textarea
                      value={offer.nextAction}
                      onChange={(e) =>
                        updateOffer(offer.id, { nextAction: e.target.value })
                      }
                      placeholder="Nächste Aktion"
                      style={miniTextarea}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={offer.kontakt}
                      onChange={(e) =>
                        updateOffer(offer.id, { kontakt: e.target.value })
                      }
                      placeholder="Kontakt"
                      style={miniInput}
                    />
                    <textarea
                      value={offer.notiz}
                      onChange={(e) =>
                        updateOffer(offer.id, { notiz: e.target.value })
                      }
                      placeholder="Notiz"
                      style={miniTextarea}
                    />
                    <input
                      value={offer.pdfUrl}
                      onChange={(e) =>
                        updateOffer(offer.id, { pdfUrl: e.target.value })
                      }
                      placeholder="PDF-Link optional"
                      style={miniInputLast}
                    />
                  </td>

                  <td style={td}>
                    <div style={actionCol}>
                      <button
                        type="button"
                        style={btnMini}
                        onClick={() => openOffer(offer)}
                      >
                        Angebot öffnen
                      </button>

                      <button
                        type="button"
                        style={btnMini}
                        onClick={() =>
                          updateOffer(offer.id, {
                            followUp: addDaysISO(7),
                            nextAction: "Angebot nachfassen",
                          })
                        }
                      >
                        Follow-up +7
                      </button>

                      <button
                        type="button"
                        style={btnDangerMini}
                        onClick={() => deleteOffer(offer.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!filtered.length ? (
                <tr>
                  <td colSpan={13} style={emptyCell}>
                    Noch keine Angebote vorhanden. Erstelle ein Angebot in der Kalkulation oder übernimm es über „Aus Angebot übernehmen“.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
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
  maxWidth: 980,
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

const infoBox: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 800,
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
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
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 900,
};

const card: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  background: "#FFFFFF",
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
  lineHeight: 1.45,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 10,
  alignItems: "end",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const input: React.CSSProperties = {
  padding: "9px 11px",
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
  flexWrap: "wrap",
};

const toolbarRight: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const searchInput: React.CSSProperties = {
  ...input,
  width: 480,
  maxWidth: "100%",
};

const select: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  background: "#FFFFFF",
  fontSize: 13,
};

const smallSelect: React.CSSProperties = {
  ...select,
  width: 145,
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

const btnMini: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnDangerMini: React.CSSProperties = {
  ...btnMini,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const bulkBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 12,
  padding: 10,
  marginBottom: 12,
  fontSize: 13,
};

const tableWrap: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  overflow: "auto",
};

const table: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  minWidth: 1840,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  borderBottom: "1px solid #E5E7EB",
  background: "#F8FAFC",
  fontSize: 12,
  color: "#475569",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right",
};

const td: React.CSSProperties = {
  padding: "9px",
  borderBottom: "1px solid #F1F5F9",
  fontSize: 13,
  color: "#0F172A",
  verticalAlign: "top",
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 900,
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const tiny: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: "#64748B",
  fontWeight: 600,
};

const tinyOk: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: "#15803D",
  fontWeight: 800,
};

const chanceInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  width: 62,
  textAlign: "right",
  boxSizing: "border-box",
  marginRight: 4,
};

const dateInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  width: 130,
  boxSizing: "border-box",
};

const miniInput: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 6,
};

const miniInputLast: React.CSSProperties = {
  ...miniInput,
  marginBottom: 0,
};

const miniTextarea: React.CSSProperties = {
  ...miniInput,
  minHeight: 48,
  resize: "vertical",
  marginBottom: 6,
  fontFamily: "inherit",
};

const actionCol: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexDirection: "column",
};

const emptyCell: React.CSSProperties = {
  padding: 14,
  color: "#64748B",
  fontSize: 13,
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const badgeOk: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
};

const badgeBlue: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const badgeWarn: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309",
};

const badgeCritical: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};


















