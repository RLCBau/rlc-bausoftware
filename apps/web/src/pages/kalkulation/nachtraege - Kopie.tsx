// apps/web/src/pages/kalkulation/Nachtraege.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
// import { Projects } from "./projectStore";  // ⬅️ NON SERVE PIÙ
import { Changes, type ChangeRow, type ChangeStatus } from "./changeStore";
import { useProject } from "../../store/useProject";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

const MWST_KEY = "rlc_changes_mwst_v1";
const STATI: ChangeStatus[] = ["Entwurf", "Abgegeben", "Beauftragt", "Abgelehnt"];

/* === UI helpers === */
const toolbar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  margin: "12px 0",
  flexWrap: "wrap",
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
  background: "#fafafa",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid #f5f5f5",
};
const tdRight: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right" };
const tdChk: React.CSSProperties = { ...td, textAlign: "center", width: 36 };
const inp = (w: number, align: "left" | "right" = "left"): React.CSSProperties => ({
  width: w,
  padding: "6px 8px",
  textAlign: align,
  border: "1px solid #ddd",
  borderRadius: 6,
});
const numInp: React.CSSProperties = {
  width: 80,
  marginLeft: 6,
  padding: "6px 8px",
  border: "1px solid #ddd",
  borderRadius: 6,
};
const searchInp: React.CSSProperties = {
  padding: "6px 10px",
  minWidth: 280,
  border: "1px solid #ddd",
  borderRadius: 6,
};
const selectInp: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  background: "#fff",
};
const totalsBar: React.CSSProperties = {
  position: "sticky",
  bottom: 0,
  display: "flex",
  justifyContent: "flex-end",
  gap: 16,
  marginTop: 14,
  paddingTop: 10,
  background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 35%)",
};
const sumBox: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: "10px 14px",
  minWidth: 220,
  background: "#fcfcfc",
};
const pill: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid transparent",
  fontSize: 12,
  fontWeight: 600,
};
const btnGroup: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const primaryBtn: React.CSSProperties = {
  fontWeight: 700,
  border: "1px solid #2b7",
  background: "#eafff4",
  padding: "6px 10px",
  borderRadius: 6,
};
const projBadge: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 999,
  padding: "6px 12px",
  background: "#fafafa",
  display: "flex",
  gap: 8,
  alignItems: "center",
  whiteSpace: "nowrap",
};

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);

const fmtNum = (v: number, d = 2) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(
    Number.isFinite(Number(v)) ? Number(v) : 0
  );

function StatusPill({ s }: { s: ChangeStatus }) {
  const map: Record<ChangeStatus, React.CSSProperties> = {
    Entwurf: { background: "#eef2ff", color: "#273ea3", borderColor: "#cdd5ff" },
    Abgegeben: { background: "#fff7e6", color: "#8c5b00", borderColor: "#ffe0a3" },
    Beauftragt: { background: "#e8fff1", color: "#0b7a3c", borderColor: "#b6f1cf" },
    Abgelehnt: { background: "#ffecec", color: "#a01818", borderColor: "#ffc9c9" },
  };
  return <span style={{ ...pill, ...(map[s] || {}) }}>{s}</span>;
}

/* ================= SERVER MAPPING ================= */

type ServerNachtragStatus = "offen" | "inBearbeitung" | "freigegeben" | "abgelehnt";

type ServerNachtrag = {
  id: string;
  projectKey: string;
  lvPos: string;
  number: string; // N01
  title: string;
  qty: number;
  unit: string;
  ep: number;
  total: number;
  status: ServerNachtragStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

function toUiStatus(s: ServerNachtragStatus): ChangeStatus {
  if (s === "freigegeben") return "Beauftragt";
  if (s === "abgelehnt") return "Abgelehnt";
  if (s === "inBearbeitung") return "Abgegeben";
  return "Entwurf"; // "offen"
}

function toServerStatus(s: ChangeStatus): ServerNachtragStatus {
  if (s === "Beauftragt") return "freigegeben";
  if (s === "Abgelehnt") return "abgelehnt";
  if (s === "Abgegeben") return "inBearbeitung";
  return "offen";
}

function fromServer(n: ServerNachtrag): ChangeRow {
  return {
    id: n.id,
    posNr: n.lvPos || "",
    kurztext: n.title || "",
    einheit: n.unit || "m",
    mengeDelta: Number(n.qty || 0),
    preis: Number(n.ep || 0),
    status: toUiStatus(n.status),
    begruendung: n.note || "",
  } as ChangeRow;
}

function toServer(
  projectKey: string,
  row: ChangeRow,
  existingNumber?: string,
  existingCreatedAt?: string
): ServerNachtrag {
  const qty = Number(row.mengeDelta || 0);
  const ep = Number(row.preis || 0);
  const total = qty * ep;

  const now = new Date().toISOString();

  return {
    id: String(row.id || ""),
    projectKey,
    lvPos: String(row.posNr || ""),
    number: existingNumber || "",
    title: String(row.kurztext || ""),
    qty,
    unit: String(row.einheit || "m"),
    ep,
    total,
    status: toServerStatus((row.status || "Entwurf") as ChangeStatus),
    note: String(row.begruendung || ""),
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Server-Fehler (${res.status})`);
  }
  return (await res.json()) as T;
}

/* ================= MERGE HELPERS ================= */

function mergeRowsKeepLocal(prev: ChangeRow[], incoming: ChangeRow[]) {
  const byId = new Map<string, ChangeRow>();
  for (const r of prev) byId.set(String(r.id), r);

  for (const r of incoming) {
    const id = String(r.id);
    if (!byId.has(id)) byId.set(id, r);
  }

  const prevIds = new Set(prev.map((x) => String(x.id)));
  const newOnes = incoming.filter((x) => !prevIds.has(String(x.id)));
  return [...newOnes, ...prev];
}

function parseCsv(text: string) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return [];

  const sep = raw.includes(";") ? ";" : ",";
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("pos") || header.includes("kurz") || header.includes("einheit") || header.includes("status");

  const start = hasHeader ? 1 : 0;
  const out: ChangeRow[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (inQ && line[j + 1] === '"') {
          cur += '"';
          j++;
        } else {
          inQ = !inQ;
        }
      } else if (!inQ && ch === sep) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);

    const posNr = (cells[0] ?? "").trim();
    const kurztext = (cells[1] ?? "").trim();
    const einheit = (cells[2] ?? "m").trim() || "m";
    const mengeDelta = Number(String(cells[3] ?? "0").replace(",", ".")) || 0;
    const preis = Number(String(cells[4] ?? "0").replace(",", ".")) || 0;
    const statusRaw = (cells[5] ?? "Entwurf").trim() as any;
    const status: ChangeStatus = STATI.includes(statusRaw) ? statusRaw : "Entwurf";
    const begruendung = (cells[6] ?? "").trim();

    out.push({
      id: (globalThis as any)?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      posNr,
      kurztext,
      einheit,
      mengeDelta,
      preis,
      status,
      begruendung,
    } as any);
  }

  return out;
}

/* ================= PDF HELPERS (Regiebericht-Style) ================= */

function safeText(s: any) {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number, lw = 0.3) {
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}

function textInBox(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { labelW?: number; alignValue?: "left" | "right"; boldValue?: boolean }
) {
  const labelW = opts?.labelW ?? Math.min(26, w * 0.35);
  const padX = 2.5;
  const midY = y + h / 2 + 1.2;

  // label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(label, x + padX, midY);

  // divider
  doc.setLineWidth(0.2);
  doc.line(x + labelW, y, x + labelW, y + h);

  // value
  doc.setFont("helvetica", opts?.boldValue ? "bold" : "normal");
  const v = safeText(value);
  const align = opts?.alignValue ?? "left";
  const vx = align === "right" ? x + w - padX : x + labelW + padX;
  doc.text(v, vx, midY, { align });
}

export default function NachtraegePage() {
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const projectKey = (currentProject?.code || currentProject?.id || "").trim();
  const pid = currentProject?.id || "_none_";

  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [mwst, setMwst] = useState<number>(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<ChangeStatus | "Alle">("Alle");
  const [sortKey, setSortKey] = useState<"pos" | "status" | "value">("pos");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setInfo(null);

    if (!projectKey) {
      setRows(Changes.list(pid));
      setSelected({});
      return;
    }

    setLoading(true);
    try {
      const data = await apiJson<{ ok: boolean; items: ServerNachtrag[] }>(
        `/api/verknuepfung/nachtraege/${encodeURIComponent(projectKey)}`
      );
      const items = Array.isArray(data?.items) ? data.items : [];
      const incoming = items.map(fromServer);

      setRows((prev) => mergeRowsKeepLocal(prev, incoming));
      setSelected({});
    } catch (e: any) {
      setInfo(e?.message || "Fehler beim Laden (Server)");
      setRows(Changes.list(pid));
      setSelected({});
    } finally {
      setLoading(false);
    }
  }

  async function persist(nextRows: ChangeRow[]) {
    if (!projectKey) {
      nextRows.forEach((r) => Changes.upsert(pid, r));
      setRows(Changes.list(pid));
      return;
    }

    let existing: ServerNachtrag[] = [];
    try {
      const d = await apiJson<{ ok: boolean; items: ServerNachtrag[] }>(
        `/api/verknuepfung/nachtraege/${encodeURIComponent(projectKey)}`
      );
      existing = Array.isArray(d?.items) ? d.items : [];
    } catch {
      existing = [];
    }

    const metaById = new Map<string, { number: string; createdAt: string }>();
    for (const n of existing) {
      metaById.set(String(n.id), {
        number: String(n.number || ""),
        createdAt: String(n.createdAt || ""),
      });
    }

    const payloadItems: ServerNachtrag[] = nextRows.map((r) => {
      const m = metaById.get(String(r.id));
      return toServer(projectKey, r, m?.number || "", m?.createdAt || "");
    });

    await apiJson(`/api/verknuepfung/nachtraege/${encodeURIComponent(projectKey)}`, {
      method: "PUT",
      body: JSON.stringify({ items: payloadItems }),
    });

    setRows(nextRows);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, pid]);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(mwst || 0));
  }, [mwst]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Enter" && tag !== "TEXTAREA" && tag !== "INPUT" && tag !== "SELECT") {
        e.preventDefault();
        add();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportCSV();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, projectKey]);

  const viewRows = useMemo(() => {
    let r = [...rows];
    if (filterStatus !== "Alle") r = r.filter((x) => (x.status || "Entwurf") === filterStatus);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(
        (x) =>
          (x.posNr || "").toLowerCase().includes(s) ||
          (x.kurztext || "").toLowerCase().includes(s) ||
          (x.begruendung || "").toLowerCase().includes(s)
      );
    }
    if (sortKey === "pos") r.sort((a, b) => (a.posNr || "").localeCompare(b.posNr || ""));
    if (sortKey === "status")
      r.sort((a, b) => STATI.indexOf(a.status || "Entwurf") - STATI.indexOf(b.status || "Entwurf"));
    if (sortKey === "value")
      r.sort((a, b) => (b.mengeDelta || 0) * (b.preis || 0) - (a.mengeDelta || 0) * (a.preis || 0));
    return r;
  }, [rows, q, filterStatus, sortKey]);

  const totals = useMemo(() => {
    const netto = viewRows.reduce((s, r) => s + (r.mengeDelta || 0) * (r.preis || 0), 0);
    const brutto = netto * (1 + (mwst || 0) / 100);
    return { netto, brutto };
  }, [viewRows, mwst]);

  /** CRUD **/
  const add = (tpl?: Partial<ChangeRow>) => {
    const newRow: ChangeRow = {
      id: (globalThis as any)?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      kurztext: tpl?.kurztext ?? "",
      einheit: tpl?.einheit ?? "m",
      mengeDelta: tpl?.mengeDelta ?? 0,
      preis: tpl?.preis ?? 0,
      status: (tpl?.status ?? "Entwurf") as any,
      posNr: tpl?.posNr ?? "",
      begruendung: tpl?.begruendung ?? "",
    } as any;

    const next = [newRow, ...rows];
    void persist(next).catch((e: any) => setInfo(e?.message || "Fehler beim Speichern"));
    setSelected({});
  };

  const save = (patch: Partial<ChangeRow> & { id: string }) => {
    const idx = rows.findIndex((x) => x.id === patch.id);
    if (idx === -1) return;
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    setRows(next);
    void persist(next).catch((e: any) => setInfo(e?.message || "Fehler beim Speichern"));
  };

  const del = (id: string) => {
    const next = rows.filter((x) => x.id !== id);
    void persist(next).catch((e: any) => setInfo(e?.message || "Fehler beim Speichern"));
    setSelected((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
  };

  const delSelected = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return;
    if (!confirm(`${ids.length} Nachtrag/Nachträge löschen?`)) return;
    const next = rows.filter((r) => !ids.includes(r.id));
    void persist(next).catch((e: any) => setInfo(e?.message || "Fehler beim Speichern"));
    setSelected({});
  };

  const duplicate = (r0: ChangeRow) => {
    add({ ...r0, id: undefined });
  };

  const clearAll = () => {
    if (confirm("Alle Nachträge löschen?")) {
      void persist([]).catch((e: any) => setInfo(e?.message || "Fehler beim Speichern"));
      setRows([]);
      setSelected({});
    }
  };

  /** CSV/PDF **/
  const exportCSV = () => {
    try {
      const csv = Changes.exportCSV(pid);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nachtraege.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const lines = [
        "PosNr;Kurztext;Einheit;DeltaMenge;EP (netto);Status;Begründung",
        ...viewRows.map((r) =>
          [
            r.posNr || "",
            `"${String(r.kurztext || "").replace(/"/g, '""')}"`,
            r.einheit || "",
            String(r.mengeDelta || 0),
            String(r.preis || 0),
            String(r.status || "Entwurf"),
            `"${String(r.begruendung || "").replace(/"/g, '""')}"`,
          ].join(";")
        ),
      ].join("\n");

      const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nachtraege.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const importCSV = (text: string) => {
    const parsed = parseCsv(text);

    if (!parsed.length) {
      setInfo("CSV Import: keine gültigen Zeilen gefunden.");
      return;
    }

    const next = [...parsed, ...rows];
    setRows(next);
    void persist(next).catch((e: any) => setInfo(e?.message || "Fehler beim Speichern"));
  };

  const pasteRows = () => {
    const example = `PosNr;Kurztext;Einheit;DeltaMenge;EP (netto);Status;Begründung
03.0005;"Mehrlänge Speedpipe";m;85;36.5;Entwurf;"Auftraggeber wünscht zusätzliche Trasse"`;
    const t = prompt("Zeilen einfügen (CSV mit ; – Kopfzeile erlaubt):", example);
    if (!t) return;
    importCSV(t);
  };

// ✅ PDF Export (professioneller, kleiner, passt 100% in A4)
const toPDF = () => {
  try {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const pageW = doc.internal.pageSize.getWidth();   // 210
    const pageH = doc.internal.pageSize.getHeight();  // 297

    // più margine = più “professionale” + evita tagli
    const marginX = 14;
    const topY = 12;

    const usableW = pageW - marginX * 2; // 182mm

    const projTitle = currentProject
      ? `${currentProject.code || ""} – ${currentProject.name || ""}`.trim()
      : "Kein Projekt";
    const place = currentProject?.place ? String(currentProject.place) : "";

    const dateStr = new Intl.DateTimeFormat("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // ---------- Header (Box-Stil) ----------
    const headerH = 24;
    doc.setLineWidth(0.35);
    doc.rect(marginX, topY, usableW, headerH);

    const leftW = usableW * 0.68;
    const rightW = usableW - leftW;

    doc.setLineWidth(0.25);
    doc.line(marginX + leftW, topY, marginX + leftW, topY + headerH);

    // Titel
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Nachträge", marginX + 3, topY + 7.5);

    // Projekt / Ort
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`Projekt: ${String(projTitle)}`, marginX + 3, topY + 14);
    if (place) doc.text(`Ort: ${String(place)}`, marginX + 3, topY + 19.2);

    // rechte Felder: Datum + MwSt
    const rx = marginX + leftW;
    const rowH = headerH / 2;

    doc.rect(rx, topY, rightW, rowH);
    doc.rect(rx, topY + rowH, rightW, rowH);

    doc.setFontSize(9.5);
    doc.text("Datum:", rx + 2.5, topY + rowH / 2 + 1.2);
    doc.text(dateStr, rx + rightW - 2.5, topY + rowH / 2 + 1.2, { align: "right" });

    doc.text("MwSt:", rx + 2.5, topY + rowH + rowH / 2 + 1.2);
    doc.text(`${fmtNum(mwst || 0, 0)} %`, rx + rightW - 2.5, topY + rowH + rowH / 2 + 1.2, {
      align: "right",
    });

    // ---------- Tabelle ----------
    const tableY = topY + headerH + 10;

    const body = viewRows.map((r) => {
      const z = (r.mengeDelta || 0) * (r.preis || 0);

      // Kurztext + “Langtext” (Begründung) in una cella
      const k = String(r.kurztext || "");
      const l = String(r.begruendung || "");
      const textCombined = l ? `${k}\n${l}` : k;

      return [
        String(r.posNr || ""),
        textCombined,
        String(r.einheit || ""),
        fmtNum(r.mengeDelta || 0, 2),
        fmtNum(r.preis || 0, 2),
        String(r.status || "Entwurf"),
        fmtEUR(z),
      ];
    });

    // ✅ colonne che sommano ESATTAMENTE usableW (=182mm)
    const colW = {
      pos: 22,
      text: 74,
      me: 10,
      menge: 16,
      ep: 20,
      status: 20,
      total: 20,
    }; // totale = 182

    autoTable(doc, {
      startY: tableY,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      head: [["PosNr", "Kurztext / Langtext", "ME", "Menge", "EP (netto)", "Status", "Zeilen-Netto"]],
      body,
      styles: {
        font: "helvetica",
        fontSize: 9,                 // ✅ più piccolo
        textColor: 0,
        cellPadding: 2.2,
        lineColor: [0, 0, 0],
        lineWidth: 0.18,             // ✅ più fine
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fontStyle: "bold",
        fillColor: [255, 255, 255],
        textColor: 0,
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { cellWidth: colW.pos },
        1: { cellWidth: colW.text },
        2: { cellWidth: colW.me, halign: "center" },
        3: { cellWidth: colW.menge, halign: "right" },
        4: { cellWidth: colW.ep, halign: "right" },
        5: { cellWidth: colW.status },
        6: { cellWidth: colW.total, halign: "right" },
      },
      didParseCell: (data) => {
        // più aria nella colonna testo
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.minCellHeight = 12;
        }
      },
    });

    const finalY =
      (doc as any).lastAutoTable?.finalY != null ? (doc as any).lastAutoTable.finalY : tableY;

    // ---------- Totali (box in basso a destra) ----------
    const boxW = 80;
    const boxH = 9.5;
    const bx = pageW - marginX - boxW;
    const by = Math.min(finalY + 10, pageH - 2 * boxH - 10);

    doc.setLineWidth(0.25);
    doc.rect(bx, by, boxW, boxH);
    doc.rect(bx, by + boxH, boxW, boxH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Gesamt Netto: ${fmtEUR(totals.netto)}`, bx + boxW - 2.5, by + 6.2, { align: "right" });
    doc.text(`Gesamt Brutto: ${fmtEUR(totals.brutto)}`, bx + boxW - 2.5, by + boxH + 6.2, {
      align: "right",
    });

    const safeCode = (currentProject?.code || "Projekt").replace(/[^\w.-]+/g, "_");
    doc.save(`Nachtraege_${safeCode}.pdf`);
  } catch (e: any) {
    alert("PDF Export fehlgeschlagen: " + (e?.message || e));
  }
};

  return (
    <div style={{ padding: 16 }}>
      {!currentProject && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.5rem 0.75rem",
            borderRadius: 6,
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: "0.85rem",
          }}
        >
          Kein Projekt gewählt. Bitte zuerst unter <b>Start (Projekt auswählen)</b> ein Projekt auswählen.
        </div>
      )}

      {currentProject && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.5rem 0.75rem",
            borderRadius: 999,
            background: "#ECFEFF",
            color: "#0F766E",
            fontSize: "0.85rem",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Aktuelles Projekt:{" "}
          <b>
            {currentProject.code} – {currentProject.name}
          </b>
          {currentProject.place ? <> • {currentProject.place}</> : null}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <nav style={{ color: "#888", fontSize: 13 }}>RLC / 1. Kalkulation /</nav>
          <h2 style={{ margin: 0 }}>Nachträge erstellen</h2>
        </div>
        <div style={projBadge}>
          {currentProject ? (
            <>
              <b>{currentProject.code}</b>
              <span>— {currentProject.name}</span>
            </>
          ) : (
            "kein Projekt ausgewählt"
          )}
        </div>
      </div>

      {info && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #FECACA",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {info}
        </div>
      )}

      <div style={toolbar}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            MwSt %
            <input
              type="number"
              value={mwst}
              onChange={(e) => setMwst(Number(e.target.value || 0))}
              style={numInp}
            />
          </label>
          <input
            placeholder="Suchen… (PosNr / Text / Grund)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={searchInp}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} style={selectInp}>
            <option>Alle</option>
            {STATI.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as any)} style={selectInp}>
            <option value="pos">Sortierung: Position</option>
            <option value="status">Sortierung: Status</option>
            <option value="value">Sortierung: Wert</option>
          </select>

          <button onClick={() => void load()} disabled={loading}>
            {loading ? "Lädt…" : "Vom Server laden"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={btnGroup}>
            <button onClick={() => fileRef.current?.click()}>CSV Import</button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => importCSV(String(r.result || ""));
                r.readAsText(f, "utf-8");
                (e.target as HTMLInputElement).value = "";
              }}
            />
            <button onClick={pasteRows}>Zeilen einfügen</button>
            <button onClick={exportCSV}>CSV Export</button>
            <button onClick={toPDF}>PDF Export</button>
          </div>

          <div style={btnGroup}>
            <button style={primaryBtn} onClick={() => add()}>
              + Nachtrag
            </button>
            <button onClick={delSelected} disabled={!Object.values(selected).some(Boolean)}>
              Auswahl löschen
            </button>
            <button onClick={clearAll}>Alles löschen</button>
          </div>

          <div style={btnGroup}>
            <button onClick={() => navigate("/kalkulation/manuell")}>⇢ Manuell</button>
            <button onClick={() => navigate("/kalkulation/mit-ki")}>⇢ KI</button>
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ position: "sticky", top: 0, background: "#fafafa", zIndex: 1 }}>
            <tr>
              {["", "PosNr", "Kurztext", "ME", "Δ-Menge", "EP (netto)", "Status", "Begründung", "Zeilen-Netto", "Aktion"].map(
                (h, i) => (
                  <th key={i} style={th}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {viewRows.map((r, idx) => {
              const z = (r.mengeDelta || 0) * (r.preis || 0);
              const isSel = !!selected[r.id];

              return (
                <tr key={r.id} style={{ background: idx % 2 === 1 ? "#fcfcfc" : "#fff" }}>
                  <td style={tdChk}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={r.posNr || ""}
                      onChange={(e) => save({ id: r.id, posNr: e.target.value })}
                      style={inp(110)}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={r.kurztext}
                      onChange={(e) => save({ id: r.id, kurztext: e.target.value })}
                      style={inp(500)}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={r.einheit || "m"}
                      onChange={(e) => save({ id: r.id, einheit: e.target.value })}
                      style={inp(60)}
                    />
                  </td>

                  <td style={tdNum}>
                    <input
                      type="number"
                      value={r.mengeDelta}
                      onChange={(e) => save({ id: r.id, mengeDelta: Number(e.target.value || 0) })}
                      style={{
                        ...inp(120, "right"),
                        borderColor:
                          (r.mengeDelta || 0) === 0 ? "#ddd" : (r.mengeDelta || 0) > 0 ? "#c6f3d8" : "#ffc9c9",
                        background:
                          (r.mengeDelta || 0) === 0 ? "#fff" : (r.mengeDelta || 0) > 0 ? "#f6fffb" : "#fff5f5",
                      }}
                    />
                  </td>

                  <td style={tdNum}>
                    <input
                      type="number"
                      value={r.preis ?? 0}
                      onChange={(e) => save({ id: r.id, preis: Number(e.target.value || 0) })}
                      style={inp(120, "right")}
                    />
                  </td>

                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        value={r.status || "Entwurf"}
                        onChange={(e) => save({ id: r.id, status: e.target.value as ChangeStatus })}
                        style={selectInp}
                      >
                        {STATI.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <StatusPill s={r.status || "Entwurf"} />
                    </div>
                  </td>

                  <td style={td}>
                    <input
                      value={r.begruendung || ""}
                      onChange={(e) => save({ id: r.id, begruendung: e.target.value })}
                      style={inp(360)}
                    />
                  </td>

                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmtEUR(z)}</td>

                  <td style={tdRight}>
                    <button onClick={() => duplicate(r)}>Duplizieren</button>{" "}
                    <button onClick={() => del(r.id)}>Löschen</button>
                  </td>
                </tr>
              );
            })}
            {viewRows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 14, color: "#777" }}>
                  Noch keine Nachträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={totalsBar}>
        <div style={sumBox}>
          <div>Gesamt Netto</div>
          <div style={{ fontWeight: 700 }}>{fmtEUR(totals.netto)}</div>
        </div>
        <div style={sumBox}>
          <div>Gesamt Brutto</div>
          <div style={{ fontWeight: 700 }}>{fmtEUR(totals.brutto)}</div>
        </div>
      </div>
    </div>
  );
}
