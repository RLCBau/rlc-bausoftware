import { rlcClass } from "../../ui/rlcRuntimeStyle";import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const capitalize = (s: string) =>
s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";

/* =========================
   TYPES
   ========================= */
type Eingangsrechnung = {
  id: number;
  belegnr: string;
  datum: string; // dd.mm.yyyy o ISO
  faellig?: string;
  lieferant: string;
  kostenstelle?: string;
  netto: number; // €
  mwstPct: number; // 19
  bezahlt: number; // €
  bemerkung?: string;
  anhangName?: string; // nome file caricato
  anhangUrl?: string; // objectURL per preview
  anhangMime?: string; // mime
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "YTD" | "THIS_MONTH";
type Status = "ALL" | "OPEN" | "PART" | "PAID" | "OVERDUE";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
Number(n || 0).toLocaleString("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const safeTrim = (v: unknown) => String(v ?? "").trim();

const safeNumber = (v: unknown, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;
  const normalized =
  typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
};

const brutto = (r: Eingangsrechnung) =>
safeNumber(r.netto) * (1 + safeNumber(r.mwstPct) / 100);

const offen = (r: Eingangsrechnung) =>
Math.max(0, brutto(r) - safeNumber(r.bezahlt));

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

const today = () => new Date();

const isOverdue = (r: Eingangsrechnung) =>
r.faellig ? parseDate(r.faellig) < today() && offen(r) > 0.01 : false;

const statusOf = (r: Eingangsrechnung): Exclude<Status, "ALL"> => {
  if (isOverdue(r)) return "OVERDUE";
  const b = brutto(r);
  const bezahlt = safeNumber(r.bezahlt);
  if (bezahlt <= 0.01) return "OPEN";
  if (bezahlt >= b - 0.01) return "PAID";
  return "PART";
};

const escapeHtml = (str: string) =>
String(str ?? "").replace(
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

/* =========================
   COMPONENT
   ========================= */
export default function Eingangsrechnungen() {
  const [rows, setRows] = useState<Eingangsrechnung[]>([
  {
    id: 1,
    belegnr: "E-2025-001",
    datum: "18.10.2025",
    faellig: "17.11.2025",
    lieferant: "Schotter AG",
    kostenstelle: "Erdarbeiten",
    netto: 1800,
    mwstPct: 19,
    bezahlt: 0,
    bemerkung: "Kies Lieferung"
  },
  {
    id: 2,
    belegnr: "E-2025-002",
    datum: "12.10.2025",
    faellig: "11.11.2025",
    lieferant: "Rohre GmbH",
    kostenstelle: "Leitungen",
    netto: 2450,
    mwstPct: 19,
    bezahlt: 1000,
    bemerkung: "KG-Rohre DN160"
  },
  {
    id: 3,
    belegnr: "E-2025-003",
    datum: "28.10.2025",
    faellig: "27.11.2025",
    lieferant: "Spedition X",
    kostenstelle: "Transport",
    netto: 970,
    mwstPct: 19,
    bezahlt: 970
  }]
  );

  /* FILTRI */
  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [lieferant, setLieferant] = useState<string>("ALL");
  const [kostenstelle, setKostenstelle] = useState<string>("ALL");
  const [status, setStatus] = useState<Status>("ALL");

  const lieferantenListe = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((r) => safeTrim(r.lieferant)).filter(Boolean)))],
    [rows]
  );

  const kostenstellenListe = useMemo(
    () => [
    "ALL",
    ...Array.from(
      new Set(rows.map((r) => safeTrim(r.kostenstelle) || "—").filter(Boolean))
    )],

    [rows]
  );

  const filtered = useMemo(() => {
    let arr = rows.slice();

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

    if (lieferant !== "ALL") {
      arr = arr.filter((r) => safeTrim(r.lieferant) === lieferant);
    }

    if (kostenstelle !== "ALL") {
      arr = arr.filter((r) => (safeTrim(r.kostenstelle) || "—") === kostenstelle);
    }

    if (status !== "ALL") {
      arr = arr.filter((r) => statusOf(r) === status);
    }

    return arr;
  }, [rows, zeitraum, lieferant, kostenstelle, status]);

  /* TOTALI */
  const totals = useMemo(() => {
    const netto = filtered.reduce((s, r) => s + safeNumber(r.netto), 0);
    const mwst = filtered.reduce((s, r) => s + (brutto(r) - safeNumber(r.netto)), 0);
    const brut = filtered.reduce((s, r) => s + brutto(r), 0);
    const bez = filtered.reduce((s, r) => s + safeNumber(r.bezahlt), 0);
    const off = filtered.reduce((s, r) => s + offen(r), 0);
    return { netto, mwst, brut, bez, off };
  }, [filtered]);

  /* CRUD */
  const addRow = () => {
    const year = new Date().getFullYear();
    const nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;

    setRows((prev) => [
    ...prev,
    {
      id: nextId,
      belegnr: `E-${year}-${String(nextId).padStart(3, "0")}`,
      datum: new Date().toLocaleDateString("de-DE"),
      faellig: "",
      lieferant: "Neuer Lieferant",
      kostenstelle: "",
      netto: 0,
      mwstPct: 19,
      bezahlt: 0,
      bemerkung: ""
    }]
    );
  };

  const duplicate = (r: Eingangsrechnung) => {
    const year = new Date().getFullYear();
    const nextId = rows.length ? Math.max(...rows.map((x) => x.id)) + 1 : 1;

    setRows((prev) => [
    ...prev,
    {
      ...r,
      id: nextId,
      belegnr: `E-${year}-${String(nextId).padStart(3, "0")}`
    }]
    );
  };

  const remove = (id: number) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row?.anhangUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(row.anhangUrl);
        } catch {}
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const update = <K extends keyof Eingangsrechnung,>(
  i: number,
  key: K,
  val: Eingangsrechnung[K]) =>
  {
    setRows((prev) => {
      const copy = [...prev];
      if (!copy[i]) return prev;

      if (key === "netto" || key === "mwstPct" || key === "bezahlt") {
        (copy[i] as Eingangsrechnung)[key] = safeNumber(val, 0) as Eingangsrechnung[K];
      } else {
        (copy[i] as Eingangsrechnung)[key] = val;
      }

      return copy;
    });
  };

  /* ========= UPLOAD BELEG (PDF/JPG/PNG) ========= */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const chooseFile = () => fileInputRef.current?.click();

  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return;

    let targetIndex = rows.length ? rows.length - 1 : -1;
    if (targetIndex < 0) {
      addRow();
      targetIndex = 0;
    }

    const f = files[0];
    const url = URL.createObjectURL(f);
    const mime = f.type || "application/octet-stream";
    const name = f.name;

    const guess: Partial<Eingangsrechnung> = {};

    const dateMatch = name.match(
      /(\d{4}[-_.]\d{2}[-_.]\d{2})|(\d{2}[-_.]\d{2}[-_.]\d{4})/
    );
    if (dateMatch) {
      const raw = dateMatch[0].replace(/_/g, ".").replace(/-/g, ".");
      guess.datum = /^\d{4}\./.test(raw) ? toDE(raw) : raw;
    }

    const eurMatch = name.match(/(\d{1,6})(?:[.,](\d{2}))?\s?(?:eur|€)/i);
    if (eurMatch) {
      const val = parseFloat(`${eurMatch[1]}.${eurMatch[2] || "00"}`);
      guess.netto = Number.isFinite(val) ? val : 0;
    }

    const ksMatch = name.match(
      /(Leitungen|Erdarbeiten|Transport|Straßenbau|Hochbau|Material|Büro)/i
    );
    if (ksMatch) {
      guess.kostenstelle = capitalize(ksMatch[1]);
    }

    const parts = name.replace(/\.[^.]+$/, "").split(/[_\-\.]+/);
    if (parts.length >= 2) {
      const maybe = parts.find((p) => !/\d{2,4}/.test(p) && !/E-\d+/i.test(p));
      if (maybe && maybe.length > 2) {
        guess.lieferant = prettyWord(maybe);
      }
    }

    setRows((prev) => {
      let copy = [...prev];

      if (!copy.length) {
        const year = new Date().getFullYear();
        copy = [
        {
          id: 1,
          belegnr: `E-${year}-001`,
          datum: new Date().toLocaleDateString("de-DE"),
          faellig: "",
          lieferant: "Neuer Lieferant",
          kostenstelle: "",
          netto: 0,
          mwstPct: 19,
          bezahlt: 0,
          bemerkung: ""
        }];

        targetIndex = 0;
      }

      const oldUrl = copy[targetIndex]?.anhangUrl;
      if (oldUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch {}
      }

      copy[targetIndex] = {
        ...copy[targetIndex],
        ...guess,
        anhangName: f.name,
        anhangUrl: url,
        anhangMime: mime
      };

      if (!copy[targetIndex].belegnr) {
        const year = new Date().getFullYear();
        const nextId = Math.max(0, ...copy.map((r) => r.id)) + 1;
        copy[targetIndex].belegnr = `E-${year}-${String(nextId).padStart(3, "0")}`;
      }

      if (!copy[targetIndex].kostenstelle && copy[targetIndex].lieferant) {
        copy[targetIndex].kostenstelle = suggestKostenstelle(copy[targetIndex].lieferant);
      }

      return copy;
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    onFiles(e.dataTransfer.files);
  };

  const onBrowse = (e: React.ChangeEvent<HTMLInputElement>) => onFiles(e.target.files);

  const prevent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /* ========= EXPORT CSV ========= */
  const exportCSV = (useFiltered: boolean) => {
    const data = (useFiltered ? filtered : rows).map((r) => ({
      Beleg: r.belegnr,
      Datum: r.datum,
      Faellig: r.faellig || "",
      Lieferant: r.lieferant,
      Kostenstelle: r.kostenstelle || "",
      Netto: fmt(r.netto),
      MwStPct: fmt(r.mwstPct),
      MwSt: fmt(brutto(r) - safeNumber(r.netto)),
      Brutto: fmt(brutto(r)),
      Bezahlt: fmt(r.bezahlt || 0),
      Offen: fmt(offen(r)),
      Status: labelOf(statusOf(r)),
      Bemerkung: r.bemerkung || "",
      Anhang: r.anhangName || ""
    }));

    if (!data.length) {
      alert("Keine Daten für CSV-Export vorhanden.");
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
    headers.join(";"),
    ...data.map((row) =>
    headers.
    map((h) =>
    `"${String((row as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`
    ).
    join(";")
    )].
    join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = useFiltered ?
    "eingangsrechnungen_gefiltert.csv" :
    "eingangsrechnungen_alle.csv";
    a.click();
    URL.revokeObjectURL(href);
  };

  /* ========= PRINT / DOWNLOAD PDF ========= */
  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) {
      alert("Pop-ups blockiert – bitte im Browser zulassen!");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {}
    }, 400);
  }

  const printSinglePDF = (r: Eingangsrechnung) => openPrint(printableInvoiceHTML(r));
  const printAllPDF = (useFiltered: boolean) =>
  openPrint(printableReportHTML(useFiltered ? filtered : rows));

  const downloadSinglePDF = async (r: Eingangsrechnung) => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const node = buildInvoiceNode(r);
    const canvas = await html2canvas(node, { scale: 2 });
    node.remove();

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    drawCanvas(pdf, canvas);
    saveRlcPdfWithCompanyHeader(pdf, `${r.belegnr}.pdf`);
  };

  const downloadAllPDF = async (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    if (!list.length) {
      alert("Keine Eingangsrechnungen für den PDF-Download vorhanden.");
      return;
    }

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    for (let i = 0; i < list.length; i++) {
      const node = buildInvoiceNode(list[i]);
      const canvas = await html2canvas(node, { scale: 2 });
      node.remove();

      if (i > 0) pdf.addPage();
      drawCanvas(pdf, canvas);
    }

    saveRlcPdfWithCompanyHeader(pdf,
    useFiltered ?
    "Eingangsrechnungen_gefiltert.pdf" :
    "Eingangsrechnungen_alle.pdf"
    );
  };

  function invoiceInnerHTML(r: Eingangsrechnung) {
    return `
      <div style="font-family:Arial,sans-serif;color:#111;font-size:14px;line-height:1.4">
        <h2 style="margin:0 0 16px 0;">Eingangsrechnung</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-weight:700;">Belegnr.</td><td>${escapeHtml(r.belegnr || "")}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Datum</td><td>${escapeHtml(r.datum || "")}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Fällig</td><td>${escapeHtml(r.faellig || "")}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Lieferant</td><td>${escapeHtml(r.lieferant || "")}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Kostenstelle</td><td>${escapeHtml(r.kostenstelle || "")}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Netto</td><td>${fmt(r.netto)} €</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">MwSt %</td><td>${fmt(r.mwstPct ?? 0)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Brutto</td><td>${fmt(brutto(r))} €</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Bezahlt</td><td>${fmt(r.bezahlt || 0)} €</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Offen</td><td>${fmt(offen(r))} €</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Status</td><td>${escapeHtml(labelOf(statusOf(r)))}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Bemerkung</td><td>${escapeHtml(r.bemerkung || "")}</td></tr>
        </table>
      </div>
    `;
  }

  function buildInvoiceNode(r: Eingangsrechnung) {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.left = "-10000px";
    wrap.style.top = "0";
    wrap.style.width = "794px";
    wrap.style.padding = "24px";
    wrap.style.background = "#fff";
    wrap.innerHTML = invoiceInnerHTML(r);
    document.body.appendChild(wrap);
    return wrap;
  }

  function drawCanvas(pdf: any, canvas: HTMLCanvasElement) {
    const img = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(img, "PNG", x, y, w, h);
  }

  /* ========= PREVIEW MODALE ========= */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewMime, setPreviewMime] = useState<string>("");

  const openPreview = (url?: string, name?: string, mime?: string) => {
    if (!url) return;
    setPreviewUrl(url);
    setPreviewName(name || "");
    setPreviewMime(mime || "");
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewName("");
    setPreviewMime("");
  };

  useEffect(() => {
    return () => {
      rows.forEach((r) => {
        if (r.anhangUrl?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(r.anhangUrl);
          } catch {}
        }
      });
    };
  }, [rows]);

  const isPdfPreview =
  previewMime === "application/pdf" ||
  previewName.toLowerCase().endsWith(".pdf") ||
  previewUrl?.toLowerCase().includes(".pdf");

  /* ========= RENDER ========= */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Eingangsrechnungen (Kosten)</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addRow}>
            + Neue Eingangsrechnung
          </button>
          <button className="bh-btn ghost" onClick={chooseFile}>
            Beleg hochladen
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
          <button className="bh-btn ghost" onClick={() => downloadAllPDF(true)}>
            Download PDF (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => downloadAllPDF(false)}>
            Download PDF (alle)
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"

        onChange={onBrowse} className="rlc-migrated-pages-buchhaltung-eingang-tsx-183" />
      

      <div

        onDragEnter={(e) => {
          setHover(true);
          prevent(e);
        }}
        onDragOver={prevent}
        onDragLeave={(e) => {
          setHover(false);
          prevent(e);
        }}
        onDrop={onDrop} className={rlcClass("bh-dropzone",
          {
            border: "1px dashed var(--border,#d0d7de)",
            borderRadius: 8,
            padding: 14,
            marginBottom: 12,
            background: hover ? "rgba(0,0,0,0.03)" : "transparent",
            cursor: "pointer"
          })}
        onClick={chooseFile}
        title="PDF/Immagine – Trascina qui o clicca per scegliere">
        
        📎 PDF/Immagine hier ablegen oder klicken, um den Beleg zu wählen
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
          <label>Lieferant</label>
          <select value={lieferant} onChange={(e) => setLieferant(e.target.value)}>
            {lieferantenListe.map((k) =>
            <option key={k} value={k}>
                {k === "ALL" ? "Alle" : k}
              </option>
            )}
          </select>
        </div>

        <div>
          <label>Kostenstelle</label>
          <select value={kostenstelle} onChange={(e) => setKostenstelle(e.target.value)}>
            {kostenstellenListe.map((k) =>
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
            <option value="OVERDUE">Überfällig</option>
          </select>
        </div>
      </div>

      <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-184">






        
        <div className="bh-card">
          <div className="bh-note">Netto</div>
          <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-185">{fmt(totals.netto)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">MwSt</div>
          <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-186">{fmt(totals.mwst)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">Brutto</div>
          <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-187">{fmt(totals.brut)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">Bezahlt</div>
          <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-188">{fmt(totals.bez)} €</div>
        </div>
        <div className="bh-card">
          <div className="bh-note">Offen</div>
          <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-189">{fmt(totals.off)} €</div>
        </div>
      </div>

      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Beleg</th>
            <th>Datum</th>
            <th>Fällig</th>
            <th>Lieferant</th>
            <th>Kostenstelle</th>
            <th>Netto (€)</th>
            <th>MWSt (%)</th>
            <th>Brutto (€)</th>
            <th>Bezahlt (€)</th>
            <th>Offen (€)</th>
            <th>Status</th>
            <th>Anhang</th>
            <th>PDF</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((r) => {
            const i = rows.findIndex((x) => x.id === r.id);

            return (
              <tr key={r.id}>
                <td>
                  <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-190">
                    <button className="bh-btn ghost" onClick={() => duplicate(r)}>
                      Duplizieren
                    </button>
                    <button
                      className="bh-btn rlc-migrated-pages-buchhaltung-eingang-tsx-191"

                      onClick={() => remove(r.id)}>
                      
                      Löschen
                    </button>
                  </div>
                </td>

                <td>{r.belegnr}</td>

                <td>
                  <input
                    type="text"
                    value={r.datum}
                    onChange={(e) => update(i, "datum", e.target.value)} className="rlc-migrated-pages-buchhaltung-eingang-tsx-192" />

                  
                </td>

                <td>
                  <input
                    type="text"
                    value={r.faellig || ""}
                    onChange={(e) => update(i, "faellig", e.target.value)} className="rlc-migrated-pages-buchhaltung-eingang-tsx-193" />

                  
                </td>

                <td>
                  <input
                    type="text"
                    value={r.lieferant}
                    onChange={(e) => update(i, "lieferant", e.target.value)} className="rlc-migrated-pages-buchhaltung-eingang-tsx-194" />

                  
                </td>

                <td>
                  <input
                    type="text"
                    value={r.kostenstelle || ""}
                    onChange={(e) => update(i, "kostenstelle", e.target.value)} className="rlc-migrated-pages-buchhaltung-eingang-tsx-195" />

                  
                </td>

                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.netto}
                    onChange={(e) => update(i, "netto", safeNumber(e.target.value, 0))} className="rlc-migrated-pages-buchhaltung-eingang-tsx-196" />

                  
                </td>

                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={r.mwstPct}
                    onChange={(e) => update(i, "mwstPct", safeNumber(e.target.value, 19))} className="rlc-migrated-pages-buchhaltung-eingang-tsx-197" />

                  
                </td>

                <td>{fmt(brutto(r))}</td>

                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.bezahlt}
                    onChange={(e) => update(i, "bezahlt", safeNumber(e.target.value, 0))} className="rlc-migrated-pages-buchhaltung-eingang-tsx-198" />

                  
                </td>

                <td className="rlc-migrated-pages-buchhaltung-eingang-tsx-199">{fmt(offen(r))}</td>

                <td>
                  <StatusChip value={statusOf(r)} />
                </td>

                <td>
                  {r.anhangUrl ?
                  <button
                    className="bh-btn ghost"
                    onClick={() => openPreview(r.anhangUrl, r.anhangName, r.anhangMime)}>
                    
                      Ansehen
                    </button> :

                  <span className="bh-text-muted">–</span>
                  }
                </td>

                <td>
                  <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-200">
                    <button className="bh-btn ghost" onClick={() => printSinglePDF(r)}>
                      Print
                    </button>
                    <button className="bh-btn ghost" onClick={() => downloadSinglePDF(r)}>
                      Download
                    </button>
                  </div>
                </td>
              </tr>);

          })}

          {!filtered.length &&
          <tr>
              <td colSpan={14} className="rlc-migrated-pages-buchhaltung-eingang-tsx-201">
                Keine Eingangsrechnungen für die aktuelle Auswahl gefunden.
              </td>
            </tr>
          }
        </tbody>
      </table>

      <div className="bh-note rlc-migrated-pages-buchhaltung-eingang-tsx-202">
        *Demo – Upload salva solo in memoria. Per collegare davvero: invia <i>File</i> al
        backend (Projekt-ID), memorizza URL e metadati (Lieferant, Kostenstelle). Heuristica dal
        nome file: data, netto, kostenstelle, lieferant → compilati automaticamente.
      </div>

      {previewUrl &&
      <div









        onClick={closePreview} className="rlc-migrated-pages-buchhaltung-eingang-tsx-203">
        
          <div









          onClick={(e) => e.stopPropagation()} className="rlc-migrated-pages-buchhaltung-eingang-tsx-204">
          
            <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-205">







            
              <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-206">{previewName || "Anhang"}</div>
              <button className="bh-btn" onClick={closePreview}>
                Schließen
              </button>
            </div>

            <div className="rlc-migrated-pages-buchhaltung-eingang-tsx-207">
              {isPdfPreview ?
            <iframe
              src={previewUrl}

              title="Beleg PDF" className="rlc-migrated-pages-buchhaltung-eingang-tsx-208" /> :


            <img
              src={previewUrl}
              alt="Beleg" className="rlc-migrated-pages-buchhaltung-eingang-tsx-209" />







            }
            </div>
          </div>
        </div>
      }
    </div>);

}

/* =========================
   UI SMALLS
   ========================= */
function StatusChip({ value }: {value: Exclude<Status, "ALL">;}) {
  const map: Record<Exclude<Status, "ALL">, {bg: string;fg: string;label: string;}> = {
    OPEN: { bg: "#fdecea", fg: "#b02a1a", label: "Offen" },
    PART: { bg: "#fff7e6", fg: "#9a6700", label: "Teilbezahlt" },
    PAID: { bg: "#eafaf1", fg: "#0a6c3e", label: "Bezahlt" },
    OVERDUE: { bg: "#fdebd0", fg: "#8b4a00", label: "Überfällig" }
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

/* =========================
   PRINTABLE HTML
   ========================= */
function printableInvoiceHTML(r: Eingangsrechnung) {
  const b = brutto(r);
  const mw = b - safeNumber(r.netto);
  const of = offen(r);

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(
    r.belegnr
  )}</title>
<style>
body{font-family:Arial, sans-serif; margin:32px; color:#222}
h1{margin:0 0 6px} .muted{color:#666}
table{width:100%; border-collapse:collapse; margin-top:14px}
th,td{border-bottom:1px solid #ddd; padding:8px; text-align:left}
.right{text-align:right} .tot{font-weight:700; background:#f7f7f7}
.head{display:flex; justify-content:space-between; align-items:flex-start}
.logo{font-weight:800; font-size:20px}
</style></head><body>
<div class="head">
  <div><div class="logo">RLC Bausoftware</div><div class="muted">Buchhaltung · Eingangsrechnung</div></div>
  <div><b>Beleg:</b> ${escapeHtml(r.belegnr)}<br><b>Datum:</b> ${escapeHtml(r.datum)}${
  r.faellig ? `<br><b>Fällig:</b> ${escapeHtml(r.faellig)}` : ""}</div>
</div>
<div style="margin-top:10px"><b>Lieferant:</b> ${
  escapeHtml(r.lieferant)}</div>
${
  r.kostenstelle ?
  `<div class="muted">Kostenstelle: ${escapeHtml(r.kostenstelle)}</div>` :
  ""}
${

  r.bemerkung ?
  `<div class="muted" style="margin-top:4px">${escapeHtml(r.bemerkung)}</div>` :
  ""}
<table>
  <thead><tr><th>Beschreibung</th><th class="right">Netto (€)</th><th class="right">MwSt (%)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th></tr></thead>
  <tbody>
    <tr><td>${
  escapeHtml(r.bemerkung || "Material/Lieferung")}</td>
        <td class="right">${fmt(r.netto)}</td><td class="right">${fmt(
    r.mwstPct
  )}</td><td class="right">${fmt(mw)}</td><td class="right">${fmt(b)}</td></tr>
    <tr class="tot"><td colspan="4" class="right">Bezahlt</td><td class="right">${fmt(
    r.bezahlt || 0
  )}</td></tr>
    <tr class="tot"><td colspan="4" class="right">Offen</td><td class="right">${fmt(
    of
  )}</td></tr>
  </tbody>
</table>
<div class="muted" style="margin-top:10px">Automatisch erstellt · ${new Date().toLocaleString(
    "de-DE"
  )}</div>
</body></html>`;
}

function printableReportHTML(list: Eingangsrechnung[]) {
  const rows = list.
  map((r) => {
    const b = brutto(r);
    const of = offen(r);
    return `<tr>
        <td>${escapeHtml(r.belegnr)}</td>
        <td>${escapeHtml(r.datum)}</td>
        <td>${escapeHtml(r.lieferant)}</td>
        <td>${escapeHtml(r.kostenstelle || "")}</td>
        <td class="right">${fmt(r.netto)}</td>
        <td class="right">${fmt(b - safeNumber(r.netto))}</td>
        <td class="right">${fmt(b)}</td>
        <td class="right">${fmt(r.bezahlt || 0)}</td>
        <td class="right">${fmt(of)}</td>
        <td>${escapeHtml(labelOf(statusOf(r)))}</td>
      </tr>`;
  }).
  join("");

  const totals = list.reduce(
    (a, r) => {
      const b = brutto(r);
      a.net += safeNumber(r.netto);
      a.mw += b - safeNumber(r.netto);
      a.br += b;
      a.bez += safeNumber(r.bezahlt);
      a.off += offen(r);
      return a;
    },
    { net: 0, mw: 0, br: 0, bez: 0, off: 0 }
  );

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Eingangsrechnungen Report</title>
<style>
body{font-family:Arial, sans-serif; margin:32px; color:#222}
h1{margin:0 0 16px} .muted{color:#666}
table{width:100%; border-collapse:collapse; margin-top:14px}
th,td{border-bottom:1px solid #ddd; padding:8px; text-align:left}
.right{text-align:right} tfoot td{font-weight:700; background:#f7f7f7}
</style></head><body>
<h1>Eingangsrechnungen – Report</h1>
<div class="muted">Gefilterte Liste · ${new Date().toLocaleString("de-DE")}</div>
<table>
  <thead><tr>
    <th>Belegnr.</th><th>Datum</th><th>Lieferant</th><th>Kostenstelle</th>
    <th class="right">Netto (€)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th>
    <th class="right">Bezahlt (€)</th><th class="right">Offen (€)</th><th>Status</th>
  </tr></thead>
  <tbody>${rows || `<tr><td colspan="10" class="muted">Keine Daten.</td></tr>`}</tbody>
  <tfoot><tr>
    <td colspan="4" class="right">Gesamt</td>
    <td class="right">${fmt(totals.net)}</td>
    <td class="right">${fmt(totals.mw)}</td>
    <td class="right">${fmt(totals.br)}</td>
    <td class="right">${fmt(totals.bez)}</td>
    <td class="right">${fmt(totals.off)}</td>
    <td></td>
  </tr></tfoot>
</table>
</body></html>`;
}

function labelOf(s: Exclude<ReturnType<typeof statusOf>, "ALL">) {
  return s === "OPEN" ?
  "Offen" :
  s === "PART" ?
  "Teilbezahlt" :
  s === "PAID" ?
  "Bezahlt" :
  "Überfällig";
}

/* =========================
   Small utils
   ========================= */
function toDE(isoOrDotted: string) {
  const clean = isoOrDotted.replace(/-/g, ".");
  const [y, m, d] = clean.split(".").map(Number);
  if (!y || !m || !d) return new Date().toLocaleDateString("de-DE");
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function prettyWord(s: string) {
  return s.replace(/[_\-\.]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function suggestKostenstelle(lieferant: string) {
  const s = lieferant.toLowerCase();
  if (/(rohr|leitung|kg)/.test(s)) return "Leitungen";
  if (/(schotter|kies|erd|aushub)/.test(s)) return "Erdarbeiten";
  if (/(sped|logistik|transport)/.test(s)) return "Transport";
  if (/(straß|asphalt|pflaster)/.test(s)) return "Straßenbau";
  return "Material";
}
