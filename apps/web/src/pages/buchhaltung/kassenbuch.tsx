import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type Buchung = {
  id: number;
  datum: string;          // dd.mm.yyyy o ISO
  beleg?: string;         // Nr / Referenz
  text: string;           // Buchungstext
  kategorie?: string;     // z.B. Material, Transport, Büro …
  kostenstelle?: string;  // optional
  methode: "Kasse" | "Bank" | "Karte" | "Online";
  einnahme: number;       // €
  ausgabe: number;        // €
  mwstPct?: number;       // 0|7|19 …
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH" | "YTD";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseDate = (s: string) => {
  if (!s) return new Date("1970-01-01");
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
};
const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return d >= from;
};
const isSameMonth = (d: Date, ref: Date) =>
  d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

/* =========================
   COMPONENT
   ========================= */
export default function Kassenbuch() {
  // Saldo iniziale (editabile in UI)
  const [anfangsbestand, setAnfangsbestand] = useState<number>(500.0);

  // Dati demo (collega poi al backend/progetto)
  const [rows, setRows] = useState<Buchung[]>([
    { id: 1, datum: "01.10.2025", beleg: "K-0001", text: "Kassenstart", kategorie: "Sonstiges", methode: "Kasse", einnahme: 500, ausgabe: 0, mwstPct: 0 },
    { id: 2, datum: "15.10.2025", beleg: "RE-2025-102", text: "Barverkauf Schachtabdeckung", kategorie: "Erlöse", methode: "Kasse", einnahme: 180, ausgabe: 0, mwstPct: 19 },
    { id: 3, datum: "20.10.2025", beleg: "B-009", text: "Büromaterial (Quittung)", kategorie: "Büro", methode: "Kasse", einnahme: 0, ausgabe: 36.5, mwstPct: 19 },
    { id: 4, datum: "28.10.2025", beleg: "T-117", text: "Parkgebühren", kategorie: "Transport", methode: "Kasse", einnahme: 0, ausgabe: 8, mwstPct: 0 },
    { id: 5, datum: "30.10.2025", beleg: "U-221", text: "Bar-Einzahlung auf Bank", kategorie: "Transfer", methode: "Kasse", einnahme: 0, ausgabe: 200, mwstPct: 0 },
  ]);

  /* --------- FILTRI --------- */
  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [kategorie, setKategorie] = useState<string>("ALL");
  const [methode, setMethode] = useState<Buchung["methode"] | "ALL">("ALL");
  const [query, setQuery] = useState<string>("");

  const kategorienListe = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map(r => r.kategorie || "—")))],
    [rows]
  );

  const filtered = useMemo(() => {
    let arr = rows.slice();
    // periodo
    arr = arr.filter(r => {
      const d = parseDate(r.datum);
      switch (zeitraum) {
        case "30": return withinDays(d, 30);
        case "60": return withinDays(d, 60);
        case "90": return withinDays(d, 90);
        case "THIS_MONTH": return isSameMonth(d, new Date());
        case "YTD": return d.getFullYear() === new Date().getFullYear();
        default: return true;
      }
    });
    if (kategorie !== "ALL") arr = arr.filter(r => (r.kategorie || "—") === kategorie);
    if (methode !== "ALL") arr = arr.filter(r => r.methode === methode);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(r =>
        (r.text || "").toLowerCase().includes(q) ||
        (r.beleg || "").toLowerCase().includes(q) ||
        (r.kategorie || "").toLowerCase().includes(q) ||
        (r.kostenstelle || "").toLowerCase().includes(q)
      );
    }
    // ordina per data (+id) per saldo progressivo
    arr.sort((a, b) => parseDate(a.datum).getTime() - parseDate(b.datum).getTime() || a.id - b.id);
    return arr;
  }, [rows, zeitraum, kategorie, methode, query]);

  /* --------- SALDI / TOTALI --------- */
  const totals = useMemo(() => {
    const ein = filtered.reduce((s, r) => s + (r.einnahme || 0), 0);
    const aus = filtered.reduce((s, r) => s + (r.ausgabe || 0), 0);
    const diff = ein - aus;
    const endSaldo = anfangsbestand + diff;
    return { ein, aus, diff, endSaldo };
  }, [filtered, anfangsbestand]);

  // running saldo per riga (partendo dal saldo iniziale)
  const runningSaldo = useMemo(() => {
    let saldo = anfangsbestand;
    const map = new Map<number, number>(); // id -> saldo dopo riga
    for (const r of filtered) {
      saldo += (r.einnahme || 0) - (r.ausgabe || 0);
      map.set(r.id, saldo);
    }
    return map;
  }, [filtered, anfangsbestand]);

  /* --------- CRUD --------- */
  const addRow = () => {
    const nextId = rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows(prev => [
      ...prev,
      {
        id: nextId,
        datum: new Date().toLocaleDateString("de-DE"),
        beleg: "",
        text: "Neue Buchung",
        kategorie: "",
        kostenstelle: "",
        methode: "Kasse",
        einnahme: 0,
        ausgabe: 0,
        mwstPct: 0,
      },
    ]);
  };
  const duplicate = (r: Buchung) => {
    const nextId = rows.length ? Math.max(...rows.map(x => x.id)) + 1 : 1;
    setRows(prev => [...prev, { ...r, id: nextId, beleg: r.beleg ? `${r.beleg}-K` : "" }]);
  };
  const remove = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const update = <K extends keyof Buchung>(i: number, key: K, val: Buchung[K]) => {
    setRows(prev => { const c = [...prev]; if (key==="einnahme"||key==="ausgabe"||key==="mwstPct") (val as any) ||= 0; (c[i] as any)[key] = val; return c; });
  };

  /* --------- EXPORT CSV --------- */
  const exportCSV = (useFiltered: boolean) => {
    const data = (useFiltered ? filtered : rows).map(r => ({
      Datum: r.datum,
      Beleg: r.beleg || "",
      Text: r.text,
      Kategorie: r.kategorie || "",
      Kostenstelle: r.kostenstelle || "",
      Methode: r.methode,
      Einnahme: fmt(r.einnahme || 0),
      Ausgabe: fmt(r.ausgabe || 0),
      MwStPct: r.mwstPct ?? 0,
    }));
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(";"), ...data.map(row => headers.map(h => String((row as any)[h] ?? "")).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = useFiltered ? "kassenbuch_gefiltert.csv" : "kassenbuch_alle.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* --------- PRINT / DOWNLOAD PDF --------- */
  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) { alert("Pop-ups blockiert – bitte im Browser zulassen!"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 400);
  }
  const printAllPDF = (useFiltered: boolean) => {
    openPrint(printableLedgerHTML(useFiltered ? filtered : rows, anfangsbestand));
  };

  const downloadPDF = async (useFiltered: boolean) => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const node = buildLedgerNode(useFiltered ? filtered : rows, anfangsbestand);
    const canvas = await html2canvas(node, { scale: 2 });
    node.remove();
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const img = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio, h = canvas.height * ratio;
    const x = (pageW - w) / 2, y = (pageH - h) / 2;
    pdf.addImage(img, "PNG", x, y, w, h);
    pdf.save(useFiltered ? "Kassenbuch_gefiltert.pdf" : "Kassenbuch_alle.pdf");
  };

  function buildLedgerNode(list: Buchung[], start: number) {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.left = "-10000px";
    wrap.style.top = "0";
    wrap.style.width = "1024px";
    wrap.style.background = "#fff";
    wrap.style.padding = "24px";
    wrap.innerHTML = ledgerInnerHTML(list, start);
    document.body.appendChild(wrap);
    return wrap;
  }

  /* --------- RENDER --------- */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Kassenbuch</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addRow}>+ Neue Buchung</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>Export CSV (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>Export CSV (alle)</button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(true)}>PDF Report (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(false)}>PDF Report (alle)</button>
          <button className="bh-btn ghost" onClick={() => downloadPDF(true)}>Download PDF (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => downloadPDF(false)}>Download PDF (alle)</button>
        </div>
      </div>

      {/* Saldo iniziale + Filtri */}
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
          <label>Kategorie</label>
          <select value={kategorie} onChange={e => setKategorie(e.target.value)}>
            {kategorienListe.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label>Methode</label>
          <select value={methode} onChange={e => setMethode(e.target.value as any)}>
            <option value="ALL">Alle</option>
            <option value="Kasse">Kasse</option>
            <option value="Bank">Bank</option>
            <option value="Karte">Karte</option>
            <option value="Online">Online</option>
          </select>
        </div>
        <div>
          <label>Suche</label>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Text / Beleg / Kostenstelle" />
        </div>
        <div>
          <label>Anfangsbestand (€)</label>
          <input type="number" step="0.01" value={anfangsbestand} onChange={e => setAnfangsbestand(parseFloat(e.target.value || "0"))} />
        </div>
      </div>

      {/* TABELLA */}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Datum</th>
            <th>Beleg</th>
            <th>Text</th>
            <th>Kategorie</th>
            <th>Kostenstelle</th>
            <th>Methode</th>
            <th className="right">Einnahme (€)</th>
            <th className="right">Ausgabe (€)</th>
            <th className="right">MwSt (%)</th>
            <th className="right">Saldo nach Buchung (€)</th>
          </tr>
        </thead>
        <tbody>
          {/* Riga fissa: saldo iniziale */}
          <tr style={{ background: "#fafafa" }}>
            <td colSpan={10} style={{ textAlign: "right", fontWeight: 600 }}>Anfangsbestand</td>
            <td className="right" style={{ fontWeight: 700 }}>{fmt(anfangsbestand)}</td>
          </tr>

          {filtered.map((r) => {
            const i = rows.findIndex(x => x.id === r.id);
            const saldo = runningSaldo.get(r.id) ?? anfangsbestand;
            return (
              <tr key={r.id}>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="bh-btn ghost" onClick={() => duplicate(r)}>Duplizieren</button>
                    <button className="bh-btn" style={{ background: "#e74c3c" }} onClick={() => remove(r.id)}>Löschen</button>
                  </div>
                </td>
                <td><input type="text" value={r.datum} onChange={e => update(i, "datum", e.target.value)} style={{ width: 110 }} /></td>
                <td><input type="text" value={r.beleg || ""} onChange={e => update(i, "beleg", e.target.value)} style={{ width: 110 }} /></td>
                <td><input type="text" value={r.text} onChange={e => update(i, "text", e.target.value)} style={{ minWidth: 200 }} /></td>
                <td><input type="text" value={r.kategorie || ""} onChange={e => update(i, "kategorie", e.target.value)} style={{ minWidth: 140 }} /></td>
                <td><input type="text" value={r.kostenstelle || ""} onChange={e => update(i, "kostenstelle", e.target.value)} style={{ minWidth: 140 }} /></td>
                <td>
                  <select value={r.methode} onChange={e => update(i, "methode", e.target.value as Buchung["methode"])}>
                    <option value="Kasse">Kasse</option>
                    <option value="Bank">Bank</option>
                    <option value="Karte">Karte</option>
                    <option value="Online">Online</option>
                  </select>
                </td>
                <td className="right">
                  <input type="number" step="0.01" value={r.einnahme} onChange={e => update(i, "einnahme", parseFloat(e.target.value))} style={{ width: 120, textAlign: "right" }} />
                </td>
                <td className="right">
                  <input type="number" step="0.01" value={r.ausgabe} onChange={e => update(i, "ausgabe", parseFloat(e.target.value))} style={{ width: 120, textAlign: "right" }} />
                </td>
                <td className="right">
                  <input type="number" step="0.1" value={r.mwstPct ?? 0} onChange={e => update(i, "mwstPct", parseFloat(e.target.value))} style={{ width: 90, textAlign: "right" }} />
                </td>
                <td className="right" style={{ fontWeight: 600 }}>{fmt(saldo)}</td>
              </tr>
            );
          })}

          {/* Totali */}
          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={7} style={{ textAlign: "right" }}>Summe (gefiltert):</td>
            <td className="right">{fmt(totals.ein)}</td>
            <td className="right">{fmt(totals.aus)}</td>
            <td></td>
            <td className="right">{fmt(totals.endSaldo)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note" style={{ marginTop: 8 }}>
        *Demo – verbinde il Kassenbuch all’API del progetto per persistenza e Audit (User, Zeitstempel).
      </div>
    </div>
  );
}

/* =========================
   PRINTABLE HTML
   ========================= */
function printableLedgerHTML(list: Buchung[], start: number) {
  // Ordina come in tabella
  const arr = [...list].sort((a,b) => parseDate(a.datum).getTime() - parseDate(b.datum).getTime() || a.id - b.id);
  let saldo = start;
  const body = arr.map(r => {
    saldo += (r.einnahme || 0) - (r.ausgabe || 0);
    return `<tr>
      <td>${r.datum}</td>
      <td>${r.beleg || ""}</td>
      <td>${escape(r.text)}</td>
      <td>${escape(r.kategorie || "")}</td>
      <td>${escape(r.kostenstelle || "")}</td>
      <td>${r.methode}</td>
      <td class="right">${fmt(r.einnahme || 0)}</td>
      <td class="right">${fmt(r.ausgabe || 0)}</td>
      <td class="right">${typeof r.mwstPct === "number" ? r.mwstPct.toFixed(1) : ""}</td>
      <td class="right">${fmt(saldo)}</td>
    </tr>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Kassenbuch</title>
<style>
body{font-family:Arial, sans-serif; margin:32px; color:#222}
h1{margin:0 0 12px} .muted{color:#666}
table{width:100%; border-collapse:collapse; margin-top:12px}
th,td{border-bottom:1px solid #ddd; padding:6px; text-align:left}
.right{text-align:right}
tfoot td{font-weight:700; background:#f7f7f7}
</style></head><body>
<h1>Kassenbuch – Report</h1>
<div class="muted">Erstellt: ${new Date().toLocaleString("de-DE")}</div>
<table>
  <thead>
    <tr>
      <th>Datum</th><th>Beleg</th><th>Text</th><th>Kategorie</th><th>Kostenstelle</th>
      <th>Methode</th><th class="right">Einnahme (€)</th><th class="right">Ausgabe (€)</th><th class="right">MwSt (%)</th><th class="right">Saldo (€)</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background:#f7f7f7;font-weight:700">
      <td colspan="9" class="right">Anfangsbestand</td>
      <td class="right">${fmt(start)}</td>
    </tr>
    ${body || `<tr><td colspan="10" class="muted">Keine Daten.</td></tr>`}
  </tbody>
</table>
</body></html>`;
}

function ledgerInnerHTML(list: Buchung[], start: number) {
  return printableLedgerHTML(list, start);
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]!));
}
