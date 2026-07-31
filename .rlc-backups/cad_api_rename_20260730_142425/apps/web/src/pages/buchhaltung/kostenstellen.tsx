import React, { useMemo, useState } from "react";
import "./styles.css";

/* =========================
   TYPES
   ========================= */
type Kostenstelle = {
  id: number;
  code: string;
  bezeichnung: string;
  hauptbereich: string;
  budget: number;
  istKosten: number;
  einheit?: string;
  bemerkung?: string;
};

type Zeitraum = "ALL" | "YTD" | "THIS_MONTH";

/* =========================
   HELPERS
   ========================= */
const fmt = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

/* =========================
   COMPONENT
   ========================= */
export default function Kostenstellenstruktur() {
  const [rows, setRows] = useState<Kostenstelle[]>([
    { id: 1, code: "KS-01", bezeichnung: "Erdarbeiten", hauptbereich: "Baugrube", budget: 80000, istKosten: 60000 },
    { id: 2, code: "KS-02", bezeichnung: "Leitungen / Rohrbau", hauptbereich: "Tiefbau", budget: 65000, istKosten: 42000 },
    { id: 3, code: "KS-03", bezeichnung: "Straßenbau / Asphalt", hauptbereich: "Oberbau", budget: 72000, istKosten: 74000 },
    { id: 4, code: "KS-04", bezeichnung: "Materiallager / Zwischenlager", hauptbereich: "Logistik", budget: 15000, istKosten: 9000 },
    { id: 5, code: "KS-05", bezeichnung: "Vermessung & Dokumentation", hauptbereich: "Vermessung", budget: 10000, istKosten: 3000 },
  ]);

  const [bereich, setBereich] = useState<string>("ALL");
  const bereiche = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.hauptbereich)))], [rows]);

  const filtered = useMemo(
    () => (bereich === "ALL" ? rows : rows.filter(r => r.hauptbereich === bereich)),
    [rows, bereich]
  );

  const totals = useMemo(() => {
    const bud = filtered.reduce((s, r) => s + r.budget, 0);
    const ist = filtered.reduce((s, r) => s + r.istKosten, 0);
    return { bud, ist, diff: bud - ist };
  }, [filtered]);

  /* CRUD */
  const addRow = () => {
    const nextId = rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows(prev => [
      ...prev,
      { id: nextId, code: `KS-${String(nextId).padStart(2, "0")}`, bezeichnung: "Neue Kostenstelle", hauptbereich: "Allgemein", budget: 0, istKosten: 0 },
    ]);
  };
  const remove = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const update = <K extends keyof Kostenstelle>(i: number, key: K, val: Kostenstelle[K]) => {
    setRows(prev => {
      const c = [...prev];
      (c[i] as any)[key] = val;
      return c;
    });
  };

  /* EXPORT CSV */
  const exportCSV = (useFiltered: boolean) => {
    const data = (useFiltered ? filtered : rows).map(r => ({
      Code: r.code,
      Bezeichnung: r.bezeichnung,
      Hauptbereich: r.hauptbereich,
      Budget: fmt(r.budget),
      IstKosten: fmt(r.istKosten),
      Abweichung: fmt(r.budget - r.istKosten),
      Prozent: fmt(pct(r.istKosten, r.budget)) + " %",
    }));
    const headers = Object.keys(data[0]);
    const csv = [headers.join(";"), ...data.map(d => headers.map(h => (d as any)[h]).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = useFiltered ? "kostenstellen_gefiltert.csv" : "kostenstellen_alle.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* PRINT / DOWNLOAD PDF */
  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) return alert("Pop-ups blockiert – bitte im Browser zulassen!");
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  const printAllPDF = (useFiltered: boolean) => openPrint(printableHTML(useFiltered ? filtered : rows));

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Projekt-Kostenstellenstruktur</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={addRow}>+ Neue Kostenstelle</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>Export CSV (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(false)}>Export CSV (alle)</button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(true)}>PDF (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => printAllPDF(false)}>PDF (alle)</button>
        </div>
      </div>

      {/* FILTER */}
      <div className="bh-filters">
        <div>
          <label>Hauptbereich</label>
          <select value={bereich} onChange={e => setBereich(e.target.value)}>
            {bereiche.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* TABLE */}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Kostenstelle</th>
            <th>Bezeichnung</th>
            <th>Hauptbereich</th>
            <th>Budget (€)</th>
            <th>Ist-Kosten (€)</th>
            <th>Abweichung (€)</th>
            <th>Verbrauch (%)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const i = rows.findIndex(x => x.id === r.id);
            const abw = r.budget - r.istKosten;
            const per = pct(r.istKosten, r.budget);
            const farbe = per > 100 ? "#e74c3c" : per > 80 ? "#f39c12" : "#27ae60";
            return (
              <tr key={r.id}>
                <td>
                  <button className="bh-btn ghost" onClick={() => remove(r.id)}>Löschen</button>
                </td>
                <td>{r.code}</td>
                <td>
                  <input
                    type="text"
                    value={r.bezeichnung}
                    onChange={(e) => update(i, "bezeichnung", e.target.value)}
                    style={{ minWidth: 180 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.hauptbereich}
                    onChange={(e) => update(i, "hauptbereich", e.target.value)}
                    style={{ minWidth: 140 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.budget}
                    onChange={(e) => update(i, "budget", parseFloat(e.target.value))}
                    style={{ width: 120, textAlign: "right" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={r.istKosten}
                    onChange={(e) => update(i, "istKosten", parseFloat(e.target.value))}
                    style={{ width: 120, textAlign: "right" }}
                  />
                </td>
                <td className="right" style={{ color: abw < 0 ? "#c0392b" : "#2c3e50", fontWeight: 600 }}>
                  {fmt(abw)}
                </td>
                <td>
                  <div style={{ width: 120, position: "relative", height: 8, background: "#eee", borderRadius: 4 }}>
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: "100%",
                        width: `${Math.min(per, 100)}%`,
                        background: farbe,
                        borderRadius: 4,
                        transition: "width .3s",
                      }}
                    ></div>
                  </div>
                  <div style={{ fontSize: 12, textAlign: "center", color: farbe, fontWeight: 600 }}>
                    {fmt(per)} %
                  </div>
                </td>
              </tr>
            );
          })}

          {/* TOTALE */}
          <tr style={{ background: "#fafafa", fontWeight: 600 }}>
            <td colSpan={4} style={{ textAlign: "right" }}>Summe (gefiltert):</td>
            <td className="right">{fmt(totals.bud)}</td>
            <td className="right">{fmt(totals.ist)}</td>
            <td className="right">{fmt(totals.diff)}</td>
            <td className="right">
              {fmt(pct(totals.ist, totals.bud))} %
            </td>
          </tr>
        </tbody>
      </table>

      <div className="bh-note" style={{ marginTop: 8 }}>
        *Demo-Daten · Integrierbar mit Kalkulation/Abrechnung → automatische Befüllung per Projekt-ID.
      </div>
    </div>
  );
}

/* =========================
   PRINTABLE HTML
   ========================= */
function printableHTML(list: Kostenstelle[]) {
  const body = list
    .map(
      (r) => `
    <tr>
      <td>${r.code}</td>
      <td>${r.bezeichnung}</td>
      <td>${r.hauptbereich}</td>
      <td style="text-align:right">${fmt(r.budget)}</td>
      <td style="text-align:right">${fmt(r.istKosten)}</td>
      <td style="text-align:right">${fmt(r.budget - r.istKosten)}</td>
      <td style="text-align:right">${fmt(pct(r.istKosten, r.budget))} %</td>
    </tr>`
    )
    .join("");

  const totalBudget = list.reduce((a, r) => a + r.budget, 0);
  const totalIst = list.reduce((a, r) => a + r.istKosten, 0);

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Kostenstellenstruktur</title>
  <style>
  body{font-family:Arial, sans-serif;margin:32px;color:#222}
  h1{margin:0 0 10px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
  th{text-align:left;background:#f5f5f5}
  .right{text-align:right}
  tfoot td{font-weight:700;background:#f7f7f7}
  </style></head><body>
  <h1>Projekt-Kostenstellenstruktur</h1>
  <table>
    <thead>
      <tr><th>Code</th><th>Bezeichnung</th><th>Hauptbereich</th><th class="right">Budget (€)</th><th class="right">Ist (€)</th><th class="right">Abw (€)</th><th class="right">%</th></tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="3" class="right">Summe</td><td class="right">${fmt(totalBudget)}</td><td class="right">${fmt(totalIst)}</td><td class="right">${fmt(totalBudget - totalIst)}</td><td class="right">${fmt(pct(totalIst,totalBudget))}%</td></tr></tfoot>
  </table>
  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
