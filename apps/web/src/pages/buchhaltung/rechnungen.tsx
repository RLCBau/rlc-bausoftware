import React, { useMemo, useState } from "react";
import "./styles.css";

type Rechnung = {
  id: number;
  nr: string;
  datum: string;     // dd.mm.yyyy o ISO
  faellig?: string;  // scadenza
  kunde: string;
  netto: number;     // €
  mwstPct: number;   // 19
  gezahlt: number;   // €
  hinweis?: string;
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "YTD" | "THIS_MONTH";
type Status = "ALL" | "OPEN" | "PART" | "PAID";

const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brutto = (r: Rechnung) => r.netto * (1 + (r.mwstPct || 0) / 100);
const offen  = (r: Rechnung) => Math.max(0, brutto(r) - (r.gezahlt || 0));
const statusOf = (r: Rechnung): Exclude<Status, "ALL"> => {
  const b = brutto(r);
  if ((r.gezahlt || 0) <= 0.01) return "OPEN";
  if ((r.gezahlt || 0) >= b - 0.01) return "PAID";
  return "PART";
};

const parseDate = (s: string) => {
  if (!s) return new Date("1970-01-01");
  if (/\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  return new Date(s);
};
const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return d >= from;
};
const isSameMonth = (d: Date, ref: Date) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

export default function Rechnungen() {
  const [rows, setRows] = useState<Rechnung[]>([
    { id: 1, nr: "R-2025-001", datum: "30.10.2025", faellig: "30.11.2025", kunde: "Muster GmbH", netto: 4500, mwstPct: 19, gezahlt: 1200, hinweis: "Abschlag 1" },
    { id: 2, nr: "R-2025-002", datum: "29.10.2025", faellig: "28.11.2025", kunde: "Bau AG",     netto: 2890, mwstPct: 19, gezahlt: 2890 },
    { id: 3, nr: "R-2025-003", datum: "15.09.2025", faellig: "15.10.2025", kunde: "Stadtwerke", netto: 9800, mwstPct: 7,  gezahlt: 0,    hinweis: "Schlussrechnung" },
  ]);

  // FILTRI
  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [kunde, setKunde] = useState<string>("ALL");
  const [status, setStatus] = useState<Status>("ALL");
  const kundenListe = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.kunde)))], [rows]);

  const filtered = useMemo(() => {
    let arr = rows.slice();
    // periodo
    arr = arr.filter(r => {
      const d = parseDate(r.datum);
      switch (zeitraum) {
        case "30":  return withinDays(d, 30);
        case "60":  return withinDays(d, 60);
        case "90":  return withinDays(d, 90);
        case "YTD": return d.getFullYear() === new Date().getFullYear();
        case "THIS_MONTH": return isSameMonth(d, new Date());
        default: return true;
      }
    });
    // cliente
    if (kunde !== "ALL") arr = arr.filter(r => r.kunde === kunde);
    // stato
    if (status !== "ALL") arr = arr.filter(r => statusOf(r) === status);
    return arr;
  }, [rows, zeitraum, kunde, status]);

  // TOTALI
  const totals = useMemo(() => {
    const netto = filtered.reduce((s, r) => s + r.netto, 0);
    const brut = filtered.reduce((s, r) => s + brutto(r), 0);
    const gez  = filtered.reduce((s, r) => s + (r.gezahlt || 0), 0);
    const off  = Math.max(0, brut - gez);
    const mwstSum = filtered.reduce((s, r) => s + (brutto(r) - r.netto), 0);
    return { netto, mwstSum, brut, gez, off };
  }, [filtered]);

  // CRUD
  const addRow = () => {
    const nextId = rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows(prev => [
      ...prev,
      {
        id: nextId,
        nr: `R-2025-${String(nextId).padStart(3, "0")}`,
        datum: new Date().toLocaleDateString("de-DE"),
        faellig: "",
        kunde: "Neuer Kunde",
        netto: 0,
        mwstPct: 19,
        gezahlt: 0,
      },
    ]);
  };
  const duplicate = (r: Rechnung) => {
    const nextId = rows.length ? Math.max(...rows.map(x => x.id)) + 1 : 1;
    setRows(prev => [...prev, { ...r, id: nextId, nr: `R-2025-${String(nextId).padStart(3, "0")}` }]);
  };
  const remove = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const update = <K extends keyof Rechnung>(i: number, key: K, val: Rechnung[K]) => {
    setRows(prev => {
      const copy = [...prev];
      if (key === "netto" || key === "mwstPct" || key === "gezahlt") (val as unknown as number) ||= 0;
      (copy[i] as any)[key] = val;
      return copy;
    });
  };

  // EXPORT CSV
  const exportCSV = (useFiltered: boolean) => {
    const data = (useFiltered ? filtered : rows).map(r => ({
      Nr: r.nr,
      Datum: r.datum,
      Faellig: r.faellig || "",
      Kunde: r.kunde,
      Netto: fmt(r.netto),
      MwStPct: r.mwstPct,
      Brutto: fmt(brutto(r)),
      Gezahlt: fmt(r.gezahlt || 0),
      Offen: fmt(offen(r)),
      Status: statusOf(r),
      Hinweis: r.hinweis || "",
    }));
    if (!data.length) return;

    const headers = Object.keys(data[0]);
    const csv = [headers.join(";"), ...data.map(row => headers.map(h => String((row as any)[h] ?? "")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = useFiltered ? "rechnungen_gefiltert.csv" : "rechnungen_alle.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // PDF: finestra stampabile (singola fattura)
  const printSinglePDF = (r: Rechnung) => {
    const html = printableInvoiceHTML(r);
    openPrint(html);
  };

  // PDF: report di tutte (o filtrate)
  const printAllPDF = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    const html = printableReportHTML(list);
    openPrint(html);
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Rechnungen / Abschläge</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addRow}>+ Neue Rechnung</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>Export CSV (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>Export CSV (alle)</button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(true)}>PDF Report (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(false)}>PDF Report (alle)</button>
          <button className="bh-btn ghost" onClick={() => downloadAllPDF(filtered)}>Download PDF (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => downloadAllPDF(rows)}>Download PDF (alle)</button>
          <button className="bh-btn ghost" onClick={() => downloadSinglePDF(r)}>Download</button>

        </div>
      </div>

      {/* FILTRI */}
      <div className="bh-filters">
        <div>
          <label>Zeitraum</label>
          <select value={zeitraum} onChange={e => setZeitraum(e.target.value as Zeitraum)}>
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
          <select value={kunde} onChange={e => setKunde(e.target.value)}>
            {kundenListe.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as Status)}>
            <option value="ALL">Alle</option>
            <option value="OPEN">Offen</option>
            <option value="PART">Teilbezahlt</option>
            <option value="PAID">Bezahlt</option>
          </select>
        </div>
      </div>

      {/* TABELLA */}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Nr.</th>
            <th>Datum</th>
            <th>Fällig</th>
            <th>Kunde</th>
            <th>Netto (€)</th>
            <th>MWSt (%)</th>
            <th>Brutto (€)</th>
            <th>Gezahlt (€)</th>
            <th>Offen (€)</th>
            <th>Status</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, iFiltered) => {
            const idx = rows.findIndex(x => x.id === r.id);
            return (
              <tr key={r.id}>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="bh-btn ghost" onClick={() => duplicate(r)}>Duplizieren</button>
                    <button className="bh-btn" style={{ background: "#e74c3c" }} onClick={() => remove(r.id)}>Löschen</button>
                  </div>
                </td>
                <td>{r.nr}</td>
                <td>
                  <input
                    type="text"
                    value={r.datum}
                    onChange={(e) => update(idx, "datum", e.target.value)}
                    title="dd.mm.yyyy oder ISO"
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.faellig || ""}
                    onChange={(e) => update(idx, "faellig", e.target.value)}
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.kunde}
                    onChange={(e) => update(idx, "kunde", e.target.value)}
                    style={{ minWidth: 160 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.netto}
                    onChange={(e) => update(idx, "netto", parseFloat(e.target.value))}
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={r.mwstPct}
                    onChange={(e) => update(idx, "mwstPct", parseFloat(e.target.value))}
                    style={{ width: 80 }}
                  />
                </td>
                <td>{fmt(brutto(r))}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.gezahlt}
                    onChange={(e) => update(idx, "gezahlt", parseFloat(e.target.value))}
                    style={{ width: 110 }}
                  />
                </td>
                <td style={{ fontWeight: 600 }}>{fmt(offen(r))}</td>
                <td>
                  <StatusChip value={statusOf(r)} />
                </td>
                <td>
                  <button className="bh-btn ghost" onClick={() => printSinglePDF(r)}>PDF</button>
                </td>
              </tr>
            );
          })}

          {/* Totali */}
          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={5} style={{ textAlign: "right" }}>Gesamt (gefiltert):</td>
            <td>{fmt(totals.netto)}</td>
            <td>{fmt(totals.mwstSum)}</td>
            <td>{fmt(totals.brut)}</td>
            <td>{fmt(totals.gez)}</td>
            <td>{fmt(totals.off)}</td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note" style={{ marginTop: 8 }}>
        *Tip: Für reale Daten binde hier eure Stores/Backend an (Projekt-ID).
      </div>
    </div>
  );
}

/* ===== UI Helpers ===== */
function StatusChip({ value }: { value: Exclude<Status, "ALL"> }) {
  const map: Record<typeof value, { bg: string; fg: string; label: string }> = {
    OPEN: { bg: "#fdecea", fg: "#b02a1a", label: "Offen" },
    PART: { bg: "#fff7e6", fg: "#9a6700", label: "Teilbezahlt" },
    PAID: { bg: "#eafaf1", fg: "#0a6c3e", label: "Bezahlt" },
  };
  const c = map[value];
  return (
    <span style={{ background: c.bg, color: c.fg, padding: "3px 8px", borderRadius: 999, fontSize: 12 }}>
      {c.label}
    </span>
  );
}

/* ===== Print Helpers (no-libs) ===== */
function openPrint(html: string) {
  // apre subito la finestra, così il popup-blocker non la ferma
  const printWin = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
  if (!printWin) {
    alert("Pop-ups blockiert – bitte im Browser zulassen!");
    return;
  }

  // scrive il contenuto e forzatamente chiude il documento
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();

  // alcuni browser hanno bisogno di un piccolo delay
  printWin.focus();
  setTimeout(() => {
    try {
      printWin.focus();
      printWin.print();
    } catch (err) {
      console.error("Fehler beim Drucken:", err);
      alert("Druckfenster konnte nicht geöffnet werden.");
    }
  }, 500);
}
async function downloadSinglePDF(r: Rechnung) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // crea nodo HTML fattura (riuso dello stesso contenuto del printable)
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "794px"; // A4 96dpi approx
  wrapper.style.padding = "24px";
  wrapper.style.background = "#fff";
  wrapper.innerHTML = invoiceInnerHTML(r); // vedi funzione sotto
  document.body.appendChild(wrapper);

  const canvas = await html2canvas(wrapper, { scale: 2 });
  document.body.removeChild(wrapper);

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  // fit keeping ratio
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(imgData, "PNG", x, y, w, h);
  pdf.save(`${r.nr}.pdf`);
}

async function downloadAllPDF(list: Rechnung[]) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  for (let idx = 0; idx < list.length; idx++) {
    const r = list[idx];
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-10000px";
    wrapper.style.top = "0";
    wrapper.style.width = "794px";
    wrapper.style.padding = "24px";
    wrapper.style.background = "#fff";
    wrapper.innerHTML = invoiceInnerHTML(r);
    document.body.appendChild(wrapper);

    const canvas = await html2canvas(wrapper, { scale: 2 });
    document.body.removeChild(wrapper);

    const imgData = canvas.toDataURL("image/png");
    if (idx > 0) pdf.addPage();
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(imgData, "PNG", x, y, w, h);
  }
  pdf.save("Rechnungen.pdf");
}

// contenuto fattura riutilizzabile
function invoiceInnerHTML(r: Rechnung) {
  const b = brutto(r);
  const mwst = b - r.netto;
  const of = offen(r);
  return `
    <style>
      *{box-sizing:border-box} body{font-family:Arial, sans-serif}
      h1{margin:0 0 6px} .muted{color:#666}
      table{width:100%; border-collapse:collapse; margin-top:14px}
      th,td{border-bottom:1px solid #ddd; padding:8px; text-align:left}
      .right{text-align:right} .tot{font-weight:700; background:#f7f7f7}
      .head{display:flex; justify-content:space-between; align-items:flex-start}
      .logo{font-weight:800; font-size:20px}
    </style>
    <div class="head">
      <div>
        <div class="logo">RLC Bausoftware</div>
        <div class="muted">Buchhaltung · KI integriert</div>
      </div>
      <div>
        <div><b>Rechnung:</b> ${r.nr}</div>
        <div><b>Datum:</b> ${r.datum}</div>
        ${r.faellig ? `<div><b>Fällig:</b> ${r.faellig}</div>` : ""}
      </div>
    </div>
    <div style="margin-top:10px"><b>Kunde:</b> ${escapeHtml(r.kunde)}</div>
    ${r.hinweis ? `<div class="muted" style="margin-top:4px">${escapeHtml(r.hinweis)}</div>` : ""}
    <table>
      <thead>
        <tr><th>Leistung</th><th class="right">Netto (€)</th><th class="right">MwSt (%)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(r.hinweis || "Leistungspositionen lt. LV")}</td>
          <td class="right">${fmt(r.netto)}</td>
          <td class="right">${fmt(r.mwstPct)}</td>
          <td class="right">${fmt(mwst)}</td>
          <td class="right">${fmt(b)}</td>
        </tr>
        <tr class="tot"><td colspan="4" class="right">Gezahlt</td><td class="right">${fmt(r.gezahlt || 0)}</td></tr>
        <tr class="tot"><td colspan="4" class="right">Offen</td><td class="right">${fmt(of)}</td></tr>
      </tbody>
    </table>
    <div class="muted" style="margin-top:10px">Automatisch erstellt · ${new Date().toLocaleString("de-DE")}</div>
  `;
}


function printableInvoiceHTML(r: Rechnung) {
  const b = brutto(r);
  const mwst = b - r.netto;
  const of = offen(r);
  return `
<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Rechnung ${r.nr}</title>
<style>
  body{ font-family: Arial, sans-serif; margin:32px; color:#222; }
  h1{ margin:0 0 4px 0; }
  h2{ margin:0 0 16px 0; }
  .muted{ color:#666; }
  table{ width:100%; border-collapse:collapse; margin-top:16px; }
  th,td{ border-bottom:1px solid #ddd; padding:8px; text-align:left; }
  .right{ text-align:right; }
  .tot{ font-weight:700; background:#f7f7f7; }
</style>
</head><body>
  <h1>Rechnung</h1>
  <div class="muted">RLC Bausoftware – Buchhaltung</div>
  <h2>${r.nr}</h2>

  <div>
    <div><b>Kunde:</b> ${escapeHtml(r.kunde)}</div>
    <div><b>Datum:</b> ${r.datum}</div>
    ${r.faellig ? `<div><b>Fällig:</b> ${r.faellig}</div>` : ""}
    ${r.hinweis ? `<div><b>Hinweis:</b> ${escapeHtml(r.hinweis)}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr><th>Leistung</th><th class="right">Netto (€)</th><th class="right">MwSt (%)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(r.hinweis || "Leistungspositionen lt. LV")}</td>
        <td class="right">${fmt(r.netto)}</td>
        <td class="right">${fmt(r.mwstPct)}</td>
        <td class="right">${fmt(mwst)}</td>
        <td class="right">${fmt(b)}</td>
      </tr>
      <tr class="tot">
        <td colspan="4" class="right">Gezahlt</td>
        <td class="right">${fmt(r.gezahlt || 0)}</td>
      </tr>
      <tr class="tot">
        <td colspan="4" class="right">Offen</td>
        <td class="right">${fmt(of)}</td>
      </tr>
    </tbody>
  </table>

  <p class="muted" style="margin-top:16px">Automatisch erstellt mit RLC Bausoftware · ${new Date().toLocaleString("de-DE")}</p>
</body></html>`;
}

function printableReportHTML(list: Rechnung[]) {
  const rows = list.map(r => {
    const b = brutto(r), of = offen(r);
    return `<tr>
      <td>${r.nr}</td>
      <td>${r.datum}</td>
      <td>${escapeHtml(r.kunde)}</td>
      <td class="right">${fmt(r.netto)}</td>
      <td class="right">${fmt(b - r.netto)}</td>
      <td class="right">${fmt(b)}</td>
      <td class="right">${fmt(r.gezahlt || 0)}</td>
      <td class="right">${fmt(of)}</td>
      <td>${labelOf(statusOf(r))}</td>
    </tr>`;
  }).join("");

  const totals = list.reduce((acc, r) => {
    const b = brutto(r);
    acc.netto += r.netto;
    acc.mwst += (b - r.netto);
    acc.brutto += b;
    acc.gez += (r.gezahlt || 0);
    acc.off += Math.max(0, b - (r.gezahlt || 0));
    return acc;
  }, { netto:0, mwst:0, brutto:0, gez:0, off:0 });

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
  <div class="muted">Gefilterte Liste · ${new Date().toLocaleString("de-DE")}</div>

  <table>
    <thead>
      <tr>
        <th>Nr.</th><th>Datum</th><th>Kunde</th>
        <th class="right">Netto (€)</th><th class="right">MwSt (€)</th><th class="right">Brutto (€)</th>
        <th class="right">Gezahlt (€)</th><th class="right">Offen (€)</th><th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="9" class="muted">Keine Daten.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="right">Gesamt</td>
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

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m]!));
}
function labelOf(s: Exclude<ReturnType<typeof statusOf>, "ALL">) {
  return s === "OPEN" ? "Offen" : s === "PART" ? "Teilbezahlt" : "Bezahlt";
}
