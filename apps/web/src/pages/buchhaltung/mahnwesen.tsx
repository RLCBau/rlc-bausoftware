import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type Forderung = {
  id: number;
  nr: string;                 // R-2025-001
  kunde: string;
  datum: string;              // Rechnungsdatum dd.mm.yyyy
  faellig: string;            // Fällig dd.mm.yyyy
  brutto: number;             // € Gesamt
  bezahlt: number;            // € erhalten
  stufe: 0 | 1 | 2 | 3;       // Mahnstufe
  letzteMahnung?: string;     // dd.mm.yyyy
  gebuehr?: number;           // pauschale Mahngebühr €
  zinssatz?: number;          // Jahreszins % (Standard: 5–9)
  notiz?: string;
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH" | "YTD";
type Status = "ALL" | "OVERDUE" | "DUNNED" | "CLEARED";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseDE = (s: string) => {
  if (!s) return new Date("1970-01-01");
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
};
const daysBetween = (a: Date, b: Date) => Math.round((+a - +b) / 86400000);
const isSameMonth = (d: Date, ref = new Date()) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return d >= from;
};

const todayDE = () => new Date().toLocaleDateString("de-DE");

const offen = (f: Forderung) => Math.max(0, f.brutto - (f.bezahlt || 0));
const overdueDays = (f: Forderung) => Math.max(0, daysBetween(new Date(), parseDE(f.faellig)));

const defaultGebuehr = (stufe: number) => (stufe === 1 ? 5 : stufe === 2 ? 10 : stufe >= 3 ? 20 : 0);
const defaultZins = (stufe: number) => (stufe >= 2 ? 9.0 : 5.0); // Demo: Verbraucher 5%, Geschäftsverkehr 9%

/* =========================
   COMPONENT
   ========================= */
export default function Mahnwesen() {
  const [rows, setRows] = useState<Forderung[]>([
    { id: 1, nr: "R-2025-001", kunde: "Muster GmbH", datum: "30.09.2025", faellig: "30.10.2025", brutto: 5355.00, bezahlt: 1200, stufe: 1, letzteMahnung: "05.11.2025", gebuehr: 5, zinssatz: 5, notiz: "Erinnerung per Mail" },
    { id: 2, nr: "R-2025-002", kunde: "Bau AG",      datum: "15.09.2025", faellig: "15.10.2025", brutto: 3439.10, bezahlt: 0,    stufe: 2, letzteMahnung: "01.11.2025", gebuehr: 10, zinssatz: 9 },
    { id: 3, nr: "R-2025-003", kunde: "Stadtwerke",  datum: "28.10.2025", faellig: "27.11.2025", brutto: 10486.00, bezahlt: 0,  stufe: 0 },
    { id: 4, nr: "R-2025-004", kunde: "Privat Huber",datum: "01.09.2025", faellig: "01.10.2025", brutto: 890.00, bezahlt: 890.00,stufe: 0 },
  ]);

  /* Selezione */
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const toggleSel = (id: number) => setSel(s => ({ ...s, [id]: !s[id] }));
  const allFilteredSelected = (arr: Forderung[]) => arr.length > 0 && arr.every(r => sel[r.id]);
  const toggleAll = (arr: Forderung[]) => {
    const all = allFilteredSelected(arr);
    const n: Record<number, boolean> = { ...sel };
    arr.forEach(r => n[r.id] = !all);
    setSel(n);
  };

  /* FILTRI */
  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [status, setStatus] = useState<Status>("ALL");
  const [kunde, setKunde] = useState<string>("ALL");
  const kundenListe = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.kunde)))], [rows]);

  const filtered = useMemo(() => {
    let arr = rows.slice();
    // periodo sul Rechnungsdatum
    arr = arr.filter(r => {
      const d = parseDE(r.datum);
      switch (zeitraum) {
        case "30": return withinDays(d, 30);
        case "60": return withinDays(d, 60);
        case "90": return withinDays(d, 90);
        case "THIS_MONTH": return isSameMonth(d, new Date());
        case "YTD": return d.getFullYear() === new Date().getFullYear();
        default: return true;
      }
    });
    if (kunde !== "ALL") arr = arr.filter(r => r.kunde === kunde);

    if (status !== "ALL") {
      arr = arr.filter(r => {
        const of = offen(r);
        const od = overdueDays(r);
        const hatMahnung = (r.stufe || 0) > 0 || !!r.letzteMahnung;
        if (status === "CLEARED") return of <= 0.01;
        if (status === "DUNNED") return of > 0.01 && hatMahnung;
        if (status === "OVERDUE") return of > 0.01 && od > 0;
        return true;
      });
    }
    // ordina per urgenza (più scadute e stufe alte prima)
    arr.sort((a, b) => (overdueDays(b) - overdueDays(a)) || (b.stufe - a.stufe));
    return arr;
  }, [rows, zeitraum, status, kunde]);

  /* TOTALI */
  const totals = useMemo(() => {
    const off = filtered.reduce((s, r) => s + offen(r), 0);
    const due = filtered.reduce((s, r) => s + (overdueDays(r) > 0 ? offen(r) : 0), 0);
    return { off, due };
  }, [filtered]);

  /* CRUD/azioni */
  const update = <K extends keyof Forderung>(id: number, key: K, val: Forderung[K]) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));
  };
  const hochstufen = (ids: number[]) => {
    setRows(prev =>
      prev.map(r => {
        if (!ids.includes(r.id)) return r;
        const next = Math.min(3, (r.stufe || 0) + 1) as 0 | 1 | 2 | 3;
        return {
          ...r,
          stufe: next,
          letzteMahnung: todayDE(),
          gebuehr: r.gebuehr ?? defaultGebuehr(next),
          zinssatz: r.zinssatz ?? defaultZins(next),
        };
      })
    );
  };
  const zuruecksetzen = (ids: number[]) =>
    setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, stufe: 0, letzteMahnung: undefined, gebuehr: undefined } : r)));

  /* EXPORT CSV */
  const exportCSV = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    const data = list.map(r => ({
      Rechnung: r.nr,
      Kunde: r.kunde,
      Datum: r.datum,
      Faellig: r.faellig,
      Brutto: fmt(r.brutto),
      Bezahlt: fmt(r.bezahlt || 0),
      Offen: fmt(offen(r)),
      Überfällig_Tage: overdueDays(r),
      Stufe: r.stufe,
      LetzteMahnung: r.letzteMahnung || "",
      Gebühr: fmt(r.gebuehr ?? defaultGebuehr(r.stufe)),
      Zinssatz: (r.zinssatz ?? defaultZins(r.stufe)).toString().replace(".", ","),
      Notiz: r.notiz || "",
    }));
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(";"), ...data.map(row => headers.map(h => String((row as any)[h] ?? "")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = useFiltered ? "mahnwesen_gefiltert.csv" : "mahnwesen_alle.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* PRINT & DOWNLOAD PDF (singolo/multiplo) */
  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) { alert("Pop-ups blockiert – bitte erlauben."); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 400);
  }
  const printMahnungEinzeln = (r: Forderung) => openPrint(briefHTML(r));
  const printMahnungListe = (list: Forderung[]) => openPrint(reportHTML(list));

  const downloadMahnungEinzeln = async (r: Forderung) => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const node = buildBriefNode(r);
    const canvas = await html2canvas(node, { scale: 2 }); node.remove();
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    addCanvas(pdf, canvas); pdf.save(`Mahnung_${r.nr}.pdf`);
  };
  const downloadMahnungListe = async (list: Forderung[]) => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    for (let i = 0; i < list.length; i++) {
      const node = buildBriefNode(list[i]);
      const canvas = await html2canvas(node, { scale: 2 }); node.remove();
      if (i > 0) pdf.addPage();
      addCanvas(pdf, canvas);
    }
    pdf.save("Mahnschreiben.pdf");
  };
  const addCanvas = (pdf: any, canvas: HTMLCanvasElement) => {
    const img = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio, h = canvas.height * ratio;
    const x = (pageW - w) / 2, y = (pageH - h) / 2;
    pdf.addImage(img, "PNG", x, y, w, h);
  };
  const buildBriefNode = (r: Forderung) => {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed"; wrap.style.left = "-10000px"; wrap.style.top = "0";
    wrap.style.width = "794px"; wrap.style.background = "#fff"; wrap.style.padding = "28px";
    wrap.innerHTML = briefInnerHTML(r);
    document.body.appendChild(wrap);
    return wrap;
  };

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Mahnwesen</h2>
        <div className="bh-actions">
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>Export CSV (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>Export CSV (alle)</button>
          <button className="bh-btn ghost" onClick={() => printMahnungListe(filtered)}>PDF Report (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => downloadMahnungListe(filtered)}>Download PDF (gefiltert)</button>
          <button className="bh-btn" onClick={() => hochstufen(Object.keys(sel).filter(k => sel[+k]).map(Number))}>Ausgewählte hochstufen</button>
          <button className="bh-btn" style={{ background: "#f39c12" }} onClick={() => zuruecksetzen(Object.keys(sel).filter(k => sel[+k]).map(Number))}>Stufe zurücksetzen</button>
        </div>
      </div>

      {/* FILTRI */}
      <div className="bh-filters">
        <div>
          <label>Zeitraum (Rechnungsdatum)</label>
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
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as Status)}>
            <option value="ALL">Alle</option>
            <option value="OVERDUE">Überfällig</option>
            <option value="DUNNED">Abgemahnt</option>
            <option value="CLEARED">Ausgeglichen</option>
          </select>
        </div>
        <div>
          <label>Kunde</label>
          <select value={kunde} onChange={e => setKunde(e.target.value)}>
            {kundenListe.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div style={{ alignSelf: "end", fontWeight: 600 }}>
          Offen gesamt: {fmt(totals.off)} € · Davon überfällig: {fmt(totals.due)} €
        </div>
      </div>

      {/* TABELLA */}
      <table className="bh-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input type="checkbox" checked={allFilteredSelected(filtered)} onChange={() => toggleAll(filtered)} />
            </th>
            <th>Rechnung</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Fällig</th>
            <th className="right">Brutto (€)</th>
            <th className="right">Bezahlt (€)</th>
            <th className="right">Offen (€)</th>
            <th>Überfällig (Tage)</th>
            <th>Stufe</th>
            <th>Gebühr (€)</th>
            <th>Zins p.a. (%)</th>
            <th>Letzte Mahnung</th>
            <th>Aktionen</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const of = offen(r);
            const od = overdueDays(r);
            const idSel = !!sel[r.id];
            const warn = of > 0.01 && od > 0;
            return (
              <tr key={r.id} style={{ background: warn ? "#fff7f5" : undefined }}>
                <td><input type="checkbox" checked={idSel} onChange={() => toggleSel(r.id)} /></td>
                <td>{r.nr}</td>
                <td>{r.kunde}</td>
                <td>{r.datum}</td>
                <td>{r.faellig}</td>
                <td className="right">{fmt(r.brutto)}</td>
                <td className="right">
                  <input
                    type="number" step="0.01" value={r.bezahlt}
                    onChange={e => update(r.id, "bezahlt", parseFloat(e.target.value || "0"))}
                    style={{ width: 110, textAlign: "right" }}
                  />
                </td>
                <td className="right" style={{ fontWeight: 600, color: of > 0 ? "#c0392b" : "#2c3e50" }}>{fmt(of)}</td>
                <td style={{ fontWeight: 600, color: od > 0 ? "#b02a1a" : "#2c3e50" }}>{od}</td>
                <td>
                  <select value={r.stufe} onChange={e => update(r.id, "stufe", Number(e.target.value) as any)}>
                    <option value={0}>0 – Erinnerung</option>
                    <option value={1}>1 – 1. Mahnung</option>
                    <option value={2}>2 – 2. Mahnung</option>
                    <option value={3}>3 – Letzte Mahnung</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number" step="0.01" value={r.gebuehr ?? defaultGebuehr(r.stufe)}
                    onChange={e => update(r.id, "gebuehr", parseFloat(e.target.value || "0"))}
                    style={{ width: 90, textAlign: "right" }}
                  />
                </td>
                <td>
                  <input
                    type="number" step="0.1" value={r.zinssatz ?? defaultZins(r.stufe)}
                    onChange={e => update(r.id, "zinssatz", parseFloat(e.target.value || "0"))}
                    style={{ width: 80, textAlign: "right" }}
                  />
                </td>
                <td>
                  <input
                    type="text" value={r.letzteMahnung || ""} placeholder="tt.mm.jjjj"
                    onChange={e => update(r.id, "letzteMahnung", e.target.value)}
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="bh-btn ghost" onClick={() => hochstufen([r.id])}>Hochstufen</button>
                    <button className="bh-btn ghost" style={{ background: "#f39c12" }} onClick={() => zuruecksetzen([r.id])}>Zurücksetzen</button>
                    <button className="bh-btn ghost" onClick={() => printMahnungEinzeln(r)}>Print</button>
                    <button className="bh-btn ghost" onClick={() => downloadMahnungEinzeln(r)}>Download</button>
                  </div>
                </td>
                <td>
                  {/* Stato sintetico */}
                  {of <= 0.01 ? <span className="chip ok">Ausgeglichen</span> :
                   r.stufe > 0 ? <span className="chip warn">Abgemahnt</span> :
                   od > 0 ? <span className="chip warn">Überfällig</span> :
                   <span className="chip">Offen</span>}
                </td>
              </tr>
            );
          })}

          {/* Totali */}
          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={7} style={{ textAlign: "right" }}>Summe (gefiltert) – Offen:</td>
            <td className="right">{fmt(totals.off)}</td>
            <td colSpan={6}></td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note" style={{ marginTop: 8 }}>
        *Demo – Per l’invio email: POST `/api/mahnung/send` con HTML/PDF, CC Bauleiter; per automatismi, pianifica escalation (z.B. +7 / +14 / +21 giorni).
      </div>
    </div>
  );
}

/* =========================
   TEMPLATES & HTML
   ========================= */
function briefInnerHTML(r: Forderung) {
  const of = offen(r);
  const od = overdueDays(r);
  const geb = r.gebuehr ?? defaultGebuehr(r.stufe);
  const zinssatz = r.zinssatz ?? defaultZins(r.stufe);
  const zinsProTag = (of * (zinssatz / 100)) / 365;
  const zinsBisher = Math.max(0, Math.round(zinsProDagSafe(zinsProTag, od) * 100) / 100);

  const stufeTitel = r.stufe === 0 ? "Zahlungserinnerung"
                    : r.stufe === 1 ? "1. Mahnung"
                    : r.stufe === 2 ? "2. Mahnung"
                    : "Letzte Mahnung";

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${stufeTitel} ${r.nr}</title>
<style>
body{font-family:Arial, sans-serif;margin:40px;color:#222}
h1{margin:0 0 8px}
.muted{color:#666}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
.right{text-align:right}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#fff7e6;color:#9a6700;font-size:12px}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <div style="font-weight:800;font-size:20px">RLC Bausoftware</div>
    <div class="muted">Mahnwesen</div>
  </div>
  <div class="right">
    <div>${new Date().toLocaleDateString("de-DE")}</div>
    <div class="badge">${stufeTitel}</div>
  </div>
</div>

<p>Sehr geehrte Damen und Herren (${escape(r.kunde)}),</p>
<p>zu der unten genannten Rechnung liegt ein offener Betrag vor. Bitte begleichen Sie die Forderung unverzüglich.</p>

<table>
  <tbody>
    <tr><td>Rechnung</td><td>${r.nr}</td></tr>
    <tr><td>Rechnungsdatum</td><td>${r.datum}</td></tr>
    <tr><td>Fällig am</td><td>${r.faellig}</td></tr>
    <tr><td>Überfällig</td><td>${od} Tage</td></tr>
    <tr><td>Gesamt (brutto)</td><td class="right">${fmt(r.brutto)} €</td></tr>
    <tr><td>Bezahlt</td><td class="right">${fmt(r.bezahlt || 0)} €</td></tr>
    <tr><td>Offen</td><td class="right"><b>${fmt(of)} €</b></td></tr>
    ${geb ? `<tr><td>Mahngebühr</td><td class="right">${fmt(geb)} €</td></tr>` : ""}
    ${zinsBisher > 0 ? `<tr><td>Zinsen (bis heute)</td><td class="right">${fmt(zinsBisher)} €</td></tr>` : ""}
  </tbody>
</table>

<p>Bitte überweisen Sie den Gesamtbetrag innerhalb von 7 Tagen auf das bekannte Konto. Bei Rückfragen wenden Sie sich bitte an unsere Buchhaltung.</p>

<p class="muted">Hinweis: Mit Ausbleiben der Zahlung behalten wir uns weitere rechtliche Schritte vor.</p>

<p>Mit freundlichen Grüßen<br/>RLC Bausoftware</p>
</body></html>`;
}

function reportHTML(list: Forderung[]) {
  const body = list.map(r => `
    <tr>
      <td>${r.nr}</td>
      <td>${escape(r.kunde)}</td>
      <td>${r.datum}</td>
      <td>${r.faellig}</td>
      <td class="right">${fmt(r.brutto)}</td>
      <td class="right">${fmt(r.bezahlt || 0)}</td>
      <td class="right">${fmt(offen(r))}</td>
      <td>${overdueDays(r)}</td>
      <td>${r.stufe}</td>
      <td>${r.letzteMahnung || ""}</td>
    </tr>
  `).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Mahn-Report</title>
<style>
body{font-family:Arial, sans-serif;margin:32px;color:#222}
h1{margin:0 0 12px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
.right{text-align:right}
</style></head><body>
<h1>Mahnwesen – Report</h1>
<table>
  <thead><tr>
    <th>Rechnung</th><th>Kunde</th><th>Datum</th><th>Fällig</th>
    <th class="right">Brutto</th><th class="right">Bezahlt</th><th class="right">Offen</th>
    <th>Überfällig</th><th>Stufe</th><th>Letzte Mahnung</th>
  </tr></thead>
  <tbody>${body || `<tr><td colspan="10" style="color:#666">Keine Daten.</td></tr>`}</tbody>
</table>
</body></html>`;
}

function briefHTML(r: Forderung) {
  return briefInnerHTML(r);
}

/* small utils */
function escape(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]!));
}
function zinsProDagSafe(proTag: number, tage: number) {
  if (!isFinite(proTag) || proTag <= 0 || tage <= 0) return 0;
  return proTag * tage;
}
