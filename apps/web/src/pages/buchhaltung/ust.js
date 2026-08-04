import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useMemo, useState } from "react";
import "./styles.css";
/* =========================
   HELPERS
   ========================= */
const fmt = (n) => safeNumber(n).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
function safeTrim(v) {
    return String(v ?? "").trim();
}
function safeNumber(v, fallback = 0) {
    if (v === null || v === undefined || v === "")
        return fallback;
    const normalized = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[m]);
}
const parseDate = (s) => {
    const value = safeTrim(s);
    if (!value)
        return new Date("1970-01-01");
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const [d, m, y] = value.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date("1970-01-01") : d;
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
/* =========================
   COMPONENT
   ========================= */
export default function USt() {
    const [buchungen, setBuchungen] = useState([
        {
            id: 1,
            typ: "Einnahme",
            datum: "28.10.2025",
            beleg: "R-2025-104",
            text: "Erlös Rohrbau",
            netto: 4200,
            steuersatz: 19
        },
        {
            id: 2,
            typ: "Ausgabe",
            datum: "25.10.2025",
            beleg: "E-2025-081",
            text: "Materiallieferung DN200",
            netto: 1000,
            steuersatz: 19
        },
        {
            id: 3,
            typ: "Einnahme",
            datum: "15.10.2025",
            beleg: "R-2025-099",
            text: "Asphaltarbeiten",
            netto: 3000,
            steuersatz: 7
        }
    ]);
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const filtered = useMemo(() => {
        let arr = buchungen.slice();
        arr = arr.filter((b) => {
            const d = parseDate(b.datum);
            switch (zeitraum) {
                case "30":
                    return withinDays(d, 30);
                case "60":
                    return withinDays(d, 60);
                case "90":
                    return withinDays(d, 90);
                case "THIS_MONTH":
                    return isSameMonth(d, new Date());
                case "YTD":
                    return d.getFullYear() === new Date().getFullYear();
                default:
                    return true;
            }
        });
        return arr.sort((a, b) => parseDate(b.datum).getTime() - parseDate(a.datum).getTime());
    }, [buchungen, zeitraum]);
    /* === Berechnung nach Steuersatz === */
    const gruppen = useMemo(() => {
        const bySatz = {};
        for (const b of filtered) {
            const satz = safeNumber(b.steuersatz, 0);
            const netto = safeNumber(b.netto, 0);
            const g = bySatz[satz] || { ein: 0, aus: 0 };
            if (b.typ === "Einnahme")
                g.ein += netto;
            else
                g.aus += netto;
            bySatz[satz] = g;
        }
        return bySatz;
    }, [filtered]);
    const sumEin = useMemo(() => Object.values(gruppen).reduce((s, g) => s + g.ein, 0), [gruppen]);
    const sumAus = useMemo(() => Object.values(gruppen).reduce((s, g) => s + g.aus, 0), [gruppen]);
    const sumUSt = useMemo(() => Object.entries(gruppen).reduce((s, [satz, g]) => s + safeNumber(satz) / 100 * g.ein, 0), [gruppen]);
    const sumVSt = useMemo(() => Object.entries(gruppen).reduce((s, [satz, g]) => s + safeNumber(satz) / 100 * g.aus, 0), [gruppen]);
    const diff = sumUSt - sumVSt;
    /* === CRUD === */
    const addRow = () => {
        const id = Math.max(0, ...buchungen.map((b) => b.id)) + 1;
        setBuchungen((p) => [
            ...p,
            {
                id,
                typ: "Einnahme",
                datum: new Date().toLocaleDateString("de-DE"),
                beleg: "",
                text: "",
                netto: 0,
                steuersatz: 19
            }
        ]);
    };
    const remove = (id) => {
        setBuchungen((p) => p.filter((b) => b.id !== id));
    };
    const update = (id, key, val) => setBuchungen((p) => p.map((b) => b.id === id ?
        {
            ...b,
            [key]: key === "netto" || key === "steuersatz" ?
                safeNumber(val, 0) :
                val
        } :
        b));
    /* === EXPORT CSV === */
    const exportCSV = () => {
        const rows = filtered.map((b) => ({
            Typ: b.typ,
            Datum: b.datum,
            Beleg: b.beleg,
            Text: b.text,
            Netto: fmt(b.netto),
            Steuersatz: `${safeNumber(b.steuersatz)}%`,
            "USt/VSt": fmt(safeNumber(b.netto) * (safeNumber(b.steuersatz) / 100))
        }));
        if (!rows.length) {
            alert("Keine Daten für den Export vorhanden.");
            return;
        }
        const header = Object.keys(rows[0]);
        const csv = [
            header.join(";"),
            ...rows.map((row) => header.
                map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).
                join(";"))
        ].
            join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = "USt_Uebersicht.csv";
        a.click();
        URL.revokeObjectURL(href);
    };
    /* === PRINT === */
    function openPrint(html) {
        const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
        if (!w) {
            alert("Pop-ups blockiert – bitte zulassen!");
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => {
            try {
                w.print();
            }
            catch { }
        }, 400);
    }
    const printPDF = () => openPrint(printableHTML(filtered, gruppen, sumUSt, sumVSt, diff));
    /* === UI === */
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Umsatzsteuer-\u00DCbersicht" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: addRow, children: "+ Neuer Eintrag" }), _jsx("button", { className: "bh-btn ghost", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "bh-btn ghost", onClick: printPDF, children: "PDF Vorschau" })] })] }), _jsx("div", { className: "bh-filters", children: _jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }) }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktionen" }), _jsx("th", { children: "Typ" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "Beleg" }), _jsx("th", { children: "Text" }), _jsx("th", { children: "Netto (\u20AC)" }), _jsx("th", { children: "Steuersatz" }), _jsx("th", { children: "USt/VSt (\u20AC)" })] }) }), _jsxs("tbody", { children: [filtered.map((b) => _jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { className: "bh-btn rlc-migrated-pages-buchhaltung-ust-tsx-297", onClick: () => remove(b.id), children: "L\u00F6schen" }) }), _jsx("td", { children: _jsxs("select", { value: b.typ, onChange: (e) => update(b.id, "typ", e.target.value), children: [_jsx("option", { value: "Einnahme", children: "Einnahme" }), _jsx("option", { value: "Ausgabe", children: "Ausgabe" })] }) }), _jsx("td", { children: _jsx("input", { type: "text", value: b.datum, onChange: (e) => update(b.id, "datum", e.target.value), className: "rlc-migrated-pages-buchhaltung-ust-tsx-298" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: b.beleg, onChange: (e) => update(b.id, "beleg", e.target.value), className: "rlc-migrated-pages-buchhaltung-ust-tsx-299" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: b.text, onChange: (e) => update(b.id, "text", e.target.value), className: "rlc-migrated-pages-buchhaltung-ust-tsx-300" }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.01", value: b.netto, onChange: (e) => update(b.id, "netto", safeNumber(e.target.value, 0)), className: "rlc-migrated-pages-buchhaltung-ust-tsx-301" }) }), _jsx("td", { children: _jsxs("select", { value: b.steuersatz, onChange: (e) => update(b.id, "steuersatz", safeNumber(e.target.value, 0)), children: [_jsx("option", { value: 19, children: "19%" }), _jsx("option", { value: 7, children: "7%" }), _jsx("option", { value: 0, children: "0%" })] }) }), _jsx("td", { className: "right", children: fmt(safeNumber(b.netto) * (safeNumber(b.steuersatz) / 100)) })] }, b.id)), filtered.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 8, className: "rlc-migrated-pages-buchhaltung-ust-tsx-302", children: "Keine Buchungen im aktuellen Zeitraum." }) }), _jsxs("tr", { className: "rlc-migrated-pages-buchhaltung-ust-tsx-303", children: [_jsx("td", { colSpan: 4 }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-ust-tsx-304", children: "Summe Netto:" }), _jsx("td", { className: "right", children: fmt(sumEin + sumAus) }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-ust-tsx-305", children: "Saldo USt:" }), _jsx("td", { className: rlcClass("right", { color: diff >= 0 ? "#27ae60" : "#e74c3c" }), children: fmt(diff) })] })] })] }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-ust-tsx-306", children: [_jsx("h3", { children: "USt / Vorsteuer nach Steuersatz" }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Steuersatz" }), _jsx("th", { children: "Einnahmen Netto" }), _jsx("th", { children: "USt" }), _jsx("th", { children: "Ausgaben Netto" }), _jsx("th", { children: "VSt" }), _jsx("th", { children: "Saldo" })] }) }), _jsxs("tbody", { children: [Object.entries(gruppen).
                                        sort((a, b) => safeNumber(b[0]) - safeNumber(a[0])).
                                        map(([satz, g]) => {
                                        const ust = g.ein * (safeNumber(satz) / 100);
                                        const vst = g.aus * (safeNumber(satz) / 100);
                                        return (_jsxs("tr", { children: [_jsxs("td", { children: [satz, "%"] }), _jsx("td", { className: "right", children: fmt(g.ein) }), _jsx("td", { className: "right", children: fmt(ust) }), _jsx("td", { className: "right", children: fmt(g.aus) }), _jsx("td", { className: "right", children: fmt(vst) }), _jsx("td", { className: "right", children: fmt(ust - vst) })] }, satz));
                                    }), _jsxs("tr", { className: "rlc-migrated-pages-buchhaltung-ust-tsx-307", children: [_jsx("td", { children: "Gesamt" }), _jsx("td", { className: "right", children: fmt(sumEin) }), _jsx("td", { className: "right", children: fmt(sumUSt) }), _jsx("td", { className: "right", children: fmt(sumAus) }), _jsx("td", { className: "right", children: fmt(sumVSt) }), _jsx("td", { className: "right", children: fmt(diff) })] })] })] })] })] }));
}
/* =========================
   PRINTABLE HTML
   ========================= */
function printableHTML(list, gruppen, ust, vst, diff) {
    const body = list.
        map((b) => `<tr>
          <td>${escapeHtml(b.datum)}</td>
          <td>${escapeHtml(b.typ)}</td>
          <td>${escapeHtml(b.beleg)}</td>
          <td>${escapeHtml(b.text)}</td>
          <td style="text-align:right">${fmt(b.netto)}</td>
          <td>${safeNumber(b.steuersatz)}%</td>
          <td style="text-align:right">${fmt(safeNumber(b.netto) * (safeNumber(b.steuersatz) / 100))}</td>
        </tr>`).
        join("");
    const gruppenRows = Object.entries(gruppen).
        sort((a, b) => safeNumber(b[0]) - safeNumber(a[0])).
        map(([satz, g]) => {
        const gUst = g.ein * (safeNumber(satz) / 100);
        const gVst = g.aus * (safeNumber(satz) / 100);
        const saldo = gUst - gVst;
        return `<tr>
        <td>${satz}%</td>
        <td style="text-align:right">${fmt(g.ein)}</td>
        <td style="text-align:right">${fmt(gUst)}</td>
        <td style="text-align:right">${fmt(g.aus)}</td>
        <td style="text-align:right">${fmt(gVst)}</td>
        <td style="text-align:right">${fmt(saldo)}</td>
      </tr>`;
    }).
        join("");
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
    <thead>
      <tr>
        <th>Datum</th>
        <th>Typ</th>
        <th>Beleg</th>
        <th>Text</th>
        <th>Netto</th>
        <th>Satz</th>
        <th>USt/VSt</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="7">Keine Daten.</td></tr>`}</tbody>
  </table>

  <h3>USt / Vorsteuer nach Steuersatz</h3>
  <table>
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
      ${gruppenRows || `<tr><td colspan="6">Keine Summen.</td></tr>`}
      <tr>
        <td><b>Gesamt</b></td>
        <td style="text-align:right"><b>${fmt(Object.values(gruppen).reduce((s, g) => s + g.ein, 0))}</b></td>
        <td style="text-align:right"><b>${fmt(ust)}</b></td>
        <td style="text-align:right"><b>${fmt(Object.values(gruppen).reduce((s, g) => s + g.aus, 0))}</b></td>
        <td style="text-align:right"><b>${fmt(vst)}</b></td>
        <td style="text-align:right"><b>${fmt(diff)}</b></td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
