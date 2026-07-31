import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type Buchung = {
  id: number;
  typ: "Einnahme" | "Ausgabe";
  datum: string;
  beleg: string;
  text: string;
  netto: number;
  steuersatz: number; // 0, 7, 19
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH" | "YTD";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseDE = (s: string) => {
  const [d, m, y] = s.split(".").map(Number);
  return new Date(y, m - 1, d);
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
export default function USt() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([
    { id: 1, typ: "Einnahme", datum: "28.10.2025", beleg: "R-2025-104", text: "Erlös Rohrbau", netto: 4200, steuersatz: 19 },
    { id: 2, typ: "Ausgabe", datum: "25.10.2025", beleg: "E-2025-081", text: "Materiallieferung DN200", netto: 1000, steuersatz: 19 },
    { id: 3, typ: "Einnahme", datum: "15.10.2025", beleg: "R-2025-099", text: "Asphaltarbeiten", netto: 3000, steuersatz: 7 },
  ]);

  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");

  const filtered = useMemo(() => {
    let arr = buchungen.slice();
    arr = arr.filter((b) => {
      const d = parseDE(b.datum);
      switch (zeitraum) {
        case "30": return withinDays(d, 30);
        case "60": return withinDays(d, 60);
        case "90": return withinDays(d, 90);
        case "THIS_MONTH": return isSameMonth(d, new Date());
        case "YTD": return d.getFullYear() === new Date().getFullYear();
        default: return true;
      }
    });
    return arr.sort((a, b) => parseDE(b.datum).getTime() - parseDE(a.datum).getTime());
  }, [buchungen, zeitraum]);

  /* === Berechnung nach Steuersatz === */
  const gruppen = useMemo(() => {
    const bySatz: Record<number, { ein: number; aus: number }> = {};
    for (const b of filtered) {
      const g = bySatz[b.steuersatz] || { ein: 0, aus: 0 };
      if (b.typ === "Einnahme") g.ein += b.netto;
      else g.aus += b.netto;
      bySatz[b.steuersatz] = g;
    }
    return bySatz;
  }, [filtered]);

  const sumEin = Object.values(gruppen).reduce((s, g) => s + g.ein, 0);
  const sumAus = Object.values(gruppen).reduce((s, g) => s + g.aus, 0);
  const sumUSt = Object.entries(gruppen).reduce((s, [satz, g]) => s + (Number(satz) / 100) * g.ein, 0);
  const sumVSt = Object.entries(gruppen).reduce((s, [satz, g]) => s + (Number(satz) / 100) * g.aus, 0);
  const diff = sumUSt - sumVSt;

  /* === CRUD === */
  const addRow = () => {
    const id = Math.max(0, ...buchungen.map((b) => b.id)) + 1;
    setBuchungen((p) => [...p, { id, typ: "Einnahme", datum: new Date().toLocaleDateString("de-DE"), beleg: "", text: "", netto: 0, steuersatz: 19 }]);
  };
  const remove = (id: number) => setBuchungen((p) => p.filter((b) => b.id !== id));
  const update = <K extends keyof Buchung>(id: number, key: K, val: Buchung[K]) =>
    setBuchungen((p) => p.map((b) => (b.id === id ? { ...b, [key]: val } : b)));

  /* === EXPORT CSV === */
  const exportCSV = () => {
    const header = ["Typ", "Datum", "Beleg", "Text", "Netto", "Steuersatz", "USt/VSt"];
    const rows = buchungen.map((b) => [
      b.typ,
      b.datum,
      b.beleg,
      b.text,
      fmt(b.netto),
      `${b.steuersatz}%`,
      fmt(b.netto * (b.steuersatz / 100)),
    ]);
    const csv = [header.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "USt_Uebersicht.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* === PRINT === */
  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) return alert("Pop-ups blockiert – bitte zulassen!");
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }
  const printPDF = () => openPrint(printableHTML(filtered, gruppen, sumUSt, sumVSt, diff));

  /* === UI === */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Umsatzsteuer-Übersicht</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addRow}>+ Neuer Eintrag</button>
          <button className="bh-btn ghost" onClick={exportCSV}>Export CSV</button>
          <button className="bh-btn ghost" onClick={printPDF}>PDF Vorschau</button>
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
      </div>

      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Typ</th>
            <th>Datum</th>
            <th>Beleg</th>
            <th>Text</th>
            <th>Netto (€)</th>
            <th>Steuersatz</th>
            <th>USt/VSt (€)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((b) => (
            <tr key={b.id}>
              <td>
                <button className="bh-btn" style={{ background: "#e74c3c" }} onClick={() => remove(b.id)}>
                  Löschen
                </button>
              </td>
              <td>
                <select value={b.typ} onChange={(e) => update(b.id, "typ", e.target.value as any)}>
                  <option value="Einnahme">Einnahme</option>
                  <option value="Ausgabe">Ausgabe</option>
                </select>
              </td>
              <td><input type="text" value={b.datum} onChange={(e) => update(b.id, "datum", e.target.value)} style={{ width: 100 }} /></td>
              <td><input type="text" value={b.beleg} onChange={(e) => update(b.id, "beleg", e.target.value)} style={{ width: 120 }} /></td>
              <td><input type="text" value={b.text} onChange={(e) => update(b.id, "text", e.target.value)} style={{ minWidth: 200 }} /></td>
              <td><input type="number" step="0.01" value={b.netto} onChange={(e) => update(b.id, "netto", parseFloat(e.target.value))} style={{ width: 100, textAlign: "right" }} /></td>
              <td>
                <select value={b.steuersatz} onChange={(e) => update(b.id, "steuersatz", parseFloat(e.target.value))}>
                  <option value={19}>19%</option>
                  <option value={7}>7%</option>
                  <option value={0}>0%</option>
                </select>
              </td>
              <td className="right">{fmt(b.netto * (b.steuersatz / 100))}</td>
            </tr>
          ))}

          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={4} />
            <td style={{ textAlign: "right" }}>Summe Netto:</td>
            <td className="right">{fmt(sumEin + sumAus)}</td>
            <td style={{ textAlign: "right" }}>Saldo USt:</td>
            <td className="right" style={{ color: diff >= 0 ? "#27ae60" : "#e74c3c" }}>
              {fmt(diff)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 20 }}>
        <h3>USt / Vorsteuer nach Steuersatz</h3>
        <table className="bh-table">
          <thead>
            <tr>
              <th>Steuersatz</th>
              <th>Einnahmen Netto</th>
              <th>USt</th>
              <th>Ausgaben Netto</th>
              <th>VSt</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(gruppen).map(([satz, g]) => {
              const ust = g.ein * (Number(satz) / 100);
              const vst = g.aus * (Number(satz) / 100);
              return (
                <tr key={satz}>
                  <td>{satz}%</td>
                  <td className="right">{fmt(g.ein)}</td>
                  <td className="right">{fmt(ust)}</td>
                  <td className="right">{fmt(g.aus)}</td>
                  <td className="right">{fmt(vst)}</td>
                  <td className="right">{fmt(ust - vst)}</td>
                </tr>
              );
            })}
            <tr style={{ background: "#fafafa", fontWeight: 600 }}>
              <td>Gesamt</td>
              <td className="right">{fmt(sumEin)}</td>
              <td className="right">{fmt(sumUSt)}</td>
              <td className="right">{fmt(sumAus)}</td>
              <td className="right">{fmt(sumVSt)}</td>
              <td className="right">{fmt(diff)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================
   PRINTABLE HTML
   ========================= */
function printableHTML(list: Buchung[], gruppen: any, ust: number, vst: number, diff: number) {
  const body = list.map(
    (b) =>
      `<tr><td>${b.datum}</td><td>${b.typ}</td><td>${b.beleg}</td><td>${b.text}</td><td style="text-align:right">${fmt(b.netto)}</td><td>${b.steuersatz}%</td><td style="text-align:right">${fmt(b.netto * (b.steuersatz / 100))}</td></tr>`
  ).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>USt Übersicht</title>
  <style>
  body{font-family:Arial;margin:32px;color:#222}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
  th{background:#f5f5f5}
  .right{text-align:right}
  </style></head><body>
  <h1>Umsatzsteuer-Übersicht</h1>
  <table>
  <thead><tr><th>Datum</th><th>Typ</th><th>Beleg</th><th>Text</th><th>Netto</th><th>Satz</th><th>USt/VSt</th></tr></thead>
  <tbody>${body}</tbody></table>
  <h3>Summen</h3>
  <div>USt: ${fmt(ust)} € · VSt: ${fmt(vst)} € · Saldo: ${fmt(diff)} €</div>
  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
