import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import "./styles.css";
/* =========================
   HELPERS
   ========================= */
const fmt = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDE = (s) => {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, m - 1, d);
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
/* =========================
   COMPONENT
   ========================= */
export default function USt() {
    const [buchungen, setBuchungen] = useState([
        { id: 1, typ: "Einnahme", datum: "28.10.2025", beleg: "R-2025-104", text: "Erlös Rohrbau", netto: 4200, steuersatz: 19 },
        { id: 2, typ: "Ausgabe", datum: "25.10.2025", beleg: "E-2025-081", text: "Materiallieferung DN200", netto: 1000, steuersatz: 19 },
        { id: 3, typ: "Einnahme", datum: "15.10.2025", beleg: "R-2025-099", text: "Asphaltarbeiten", netto: 3000, steuersatz: 7 },
    ]);
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
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
        const bySatz = {};
        for (const b of filtered) {
            const g = bySatz[b.steuersatz] || { ein: 0, aus: 0 };
            if (b.typ === "Einnahme")
                g.ein += b.netto;
            else
                g.aus += b.netto;
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
    const remove = (id) => setBuchungen((p) => p.filter((b) => b.id !== id));
    const update = (id, key, val) => setBuchungen((p) => p.map((b) => (b.id === id ? { ...b, [key]: val } : b)));
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
    function openPrint(html) {
        const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
        if (!w)
            return alert("Pop-ups blockiert – bitte zulassen!");
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
    }
    const printPDF = () => openPrint(printableHTML(filtered, gruppen, sumUSt, sumVSt, diff));
    /* === UI === */
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Umsatzsteuer-\u00DCbersicht" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: addRow, children: "+ Neuer Eintrag" }), _jsx("button", { className: "bh-btn ghost", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "bh-btn ghost", onClick: printPDF, children: "PDF Vorschau" })] })] }), _jsx("div", { className: "bh-filters", children: _jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }) }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktionen" }), _jsx("th", { children: "Typ" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "Beleg" }), _jsx("th", { children: "Text" }), _jsx("th", { children: "Netto (\u20AC)" }), _jsx("th", { children: "Steuersatz" }), _jsx("th", { children: "USt/VSt (\u20AC)" })] }) }), _jsxs("tbody", { children: [filtered.map((b) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { className: "bh-btn", style: { background: "#e74c3c" }, onClick: () => remove(b.id), children: "L\u00F6schen" }) }), _jsx("td", { children: _jsxs("select", { value: b.typ, onChange: (e) => update(b.id, "typ", e.target.value), children: [_jsx("option", { value: "Einnahme", children: "Einnahme" }), _jsx("option", { value: "Ausgabe", children: "Ausgabe" })] }) }), _jsx("td", { children: _jsx("input", { type: "text", value: b.datum, onChange: (e) => update(b.id, "datum", e.target.value), style: { width: 100 } }) }), _jsx("td", { children: _jsx("input", { type: "text", value: b.beleg, onChange: (e) => update(b.id, "beleg", e.target.value), style: { width: 120 } }) }), _jsx("td", { children: _jsx("input", { type: "text", value: b.text, onChange: (e) => update(b.id, "text", e.target.value), style: { minWidth: 200 } }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.01", value: b.netto, onChange: (e) => update(b.id, "netto", parseFloat(e.target.value)), style: { width: 100, textAlign: "right" } }) }), _jsx("td", { children: _jsxs("select", { value: b.steuersatz, onChange: (e) => update(b.id, "steuersatz", parseFloat(e.target.value)), children: [_jsx("option", { value: 19, children: "19%" }), _jsx("option", { value: 7, children: "7%" }), _jsx("option", { value: 0, children: "0%" })] }) }), _jsx("td", { className: "right", children: fmt(b.netto * (b.steuersatz / 100)) })] }, b.id))), _jsxs("tr", { style: { background: "#fafafa", fontWeight: 600 }, children: [_jsx("td", { colSpan: 4 }), _jsx("td", { style: { textAlign: "right" }, children: "Summe Netto:" }), _jsx("td", { className: "right", children: fmt(sumEin + sumAus) }), _jsx("td", { style: { textAlign: "right" }, children: "Saldo USt:" }), _jsx("td", { className: "right", style: { color: diff >= 0 ? "#27ae60" : "#e74c3c" }, children: fmt(diff) })] })] })] }), _jsxs("div", { style: { marginTop: 20 }, children: [_jsx("h3", { children: "USt / Vorsteuer nach Steuersatz" }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Steuersatz" }), _jsx("th", { children: "Einnahmen Netto" }), _jsx("th", { children: "USt" }), _jsx("th", { children: "Ausgaben Netto" }), _jsx("th", { children: "VSt" }), _jsx("th", { children: "Saldo" })] }) }), _jsxs("tbody", { children: [Object.entries(gruppen).map(([satz, g]) => {
                                        const ust = g.ein * (Number(satz) / 100);
                                        const vst = g.aus * (Number(satz) / 100);
                                        return (_jsxs("tr", { children: [_jsxs("td", { children: [satz, "%"] }), _jsx("td", { className: "right", children: fmt(g.ein) }), _jsx("td", { className: "right", children: fmt(ust) }), _jsx("td", { className: "right", children: fmt(g.aus) }), _jsx("td", { className: "right", children: fmt(vst) }), _jsx("td", { className: "right", children: fmt(ust - vst) })] }, satz));
                                    }), _jsxs("tr", { style: { background: "#fafafa", fontWeight: 600 }, children: [_jsx("td", { children: "Gesamt" }), _jsx("td", { className: "right", children: fmt(sumEin) }), _jsx("td", { className: "right", children: fmt(sumUSt) }), _jsx("td", { className: "right", children: fmt(sumAus) }), _jsx("td", { className: "right", children: fmt(sumVSt) }), _jsx("td", { className: "right", children: fmt(diff) })] })] })] })] })] }));
}
/* =========================
   PRINTABLE HTML
   ========================= */
function printableHTML(list, gruppen, ust, vst, diff) {
    const body = list.map((b) => `<tr><td>${b.datum}</td><td>${b.typ}</td><td>${b.beleg}</td><td>${b.text}</td><td style="text-align:right">${fmt(b.netto)}</td><td>${b.steuersatz}%</td><td style="text-align:right">${fmt(b.netto * (b.steuersatz / 100))}</td></tr>`).join("");
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
