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
const pct = (a, b) => b > 0 ? a / b * 100 : 0;
function csvEscape(v) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
/* =========================
   COMPONENT
   ========================= */
export default function Kostenstellenstruktur() {
    const [rows, setRows] = useState([
        {
            id: 1,
            code: "KS-01",
            bezeichnung: "Erdarbeiten",
            hauptbereich: "Baugrube",
            budget: 80000,
            istKosten: 60000
        },
        {
            id: 2,
            code: "KS-02",
            bezeichnung: "Leitungen / Rohrbau",
            hauptbereich: "Tiefbau",
            budget: 65000,
            istKosten: 42000
        },
        {
            id: 3,
            code: "KS-03",
            bezeichnung: "Straßenbau / Asphalt",
            hauptbereich: "Oberbau",
            budget: 72000,
            istKosten: 74000
        },
        {
            id: 4,
            code: "KS-04",
            bezeichnung: "Materiallager / Zwischenlager",
            hauptbereich: "Logistik",
            budget: 15000,
            istKosten: 9000
        },
        {
            id: 5,
            code: "KS-05",
            bezeichnung: "Vermessung & Dokumentation",
            hauptbereich: "Vermessung",
            budget: 10000,
            istKosten: 3000
        }
    ]);
    const [bereich, setBereich] = useState("ALL");
    const bereiche = useMemo(() => ["ALL", ...Array.from(new Set(rows.map((r) => r.hauptbereich).filter(Boolean)))], [rows]);
    const filtered = useMemo(() => bereich === "ALL" ? rows : rows.filter((r) => r.hauptbereich === bereich), [rows, bereich]);
    const totals = useMemo(() => {
        const bud = filtered.reduce((s, r) => s + safeNumber(r.budget), 0);
        const ist = filtered.reduce((s, r) => s + safeNumber(r.istKosten), 0);
        return { bud, ist, diff: bud - ist };
    }, [filtered]);
    /* CRUD */
    const addRow = () => {
        const nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
        setRows((prev) => [
            ...prev,
            {
                id: nextId,
                code: `KS-${String(nextId).padStart(2, "0")}`,
                bezeichnung: "Neue Kostenstelle",
                hauptbereich: "Allgemein",
                budget: 0,
                istKosten: 0
            }
        ]);
    };
    const remove = (id) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };
    const update = (i, key, val) => {
        setRows((prev) => {
            const c = [...prev];
            if (!c[i])
                return prev;
            c[i] = {
                ...c[i],
                [key]: key === "budget" || key === "istKosten" ?
                    safeNumber(val, 0) :
                    val
            };
            return c;
        });
    };
    /* EXPORT CSV */
    const exportCSV = (useFiltered) => {
        const list = useFiltered ? filtered : rows;
        if (!list.length) {
            alert("Keine Daten für den Export vorhanden.");
            return;
        }
        const data = list.map((r) => ({
            Code: r.code,
            Bezeichnung: r.bezeichnung,
            Hauptbereich: r.hauptbereich,
            Budget: fmt(r.budget),
            IstKosten: fmt(r.istKosten),
            Abweichung: fmt(safeNumber(r.budget) - safeNumber(r.istKosten)),
            Prozent: `${fmt(pct(safeNumber(r.istKosten), safeNumber(r.budget)))} %`
        }));
        const headers = Object.keys(data[0]);
        const csv = [
            headers.map(csvEscape).join(";"),
            ...data.map((d) => headers.map((h) => csvEscape(d[h])).join(";"))
        ].
            join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = useFiltered ?
            "kostenstellen_gefiltert.csv" :
            "kostenstellen_alle.csv";
        a.click();
        URL.revokeObjectURL(href);
    };
    /* PRINT */
    function openPrint(html) {
        const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
        if (!w) {
            alert("Pop-ups blockiert – bitte im Browser zulassen!");
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(() => {
            try {
                w.print();
            }
            catch { }
        }, 400);
    }
    const printAllPDF = (useFiltered) => openPrint(printableHTML(useFiltered ? filtered : rows));
    /* =========================
       RENDER
       ========================= */
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Projekt-Kostenstellenstruktur" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: addRow, children: "+ Neue Kostenstelle" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(true), children: "Export CSV (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(false), children: "Export CSV (alle)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printAllPDF(true), children: "PDF (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printAllPDF(false), children: "PDF (alle)" })] })] }), _jsx("div", { className: "bh-filters", children: _jsxs("div", { children: [_jsx("label", { children: "Hauptbereich" }), _jsx("select", { value: bereich, onChange: (e) => setBereich(e.target.value), children: bereiche.map((b) => _jsx("option", { value: b, children: b === "ALL" ? "Alle" : b }, b)) })] }) }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktionen" }), _jsx("th", { children: "Kostenstelle" }), _jsx("th", { children: "Bezeichnung" }), _jsx("th", { children: "Hauptbereich" }), _jsx("th", { children: "Budget (\u20AC)" }), _jsx("th", { children: "Ist-Kosten (\u20AC)" }), _jsx("th", { children: "Abweichung (\u20AC)" }), _jsx("th", { children: "Verbrauch (%)" })] }) }), _jsxs("tbody", { children: [filtered.map((r) => {
                                const i = rows.findIndex((x) => x.id === r.id);
                                const abw = safeNumber(r.budget) - safeNumber(r.istKosten);
                                const per = pct(safeNumber(r.istKosten), safeNumber(r.budget));
                                const farbe = per > 100 ? "#e74c3c" : per > 80 ? "#f39c12" : "#27ae60";
                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { className: "bh-btn ghost", onClick: () => remove(r.id), children: "L\u00F6schen" }) }), _jsx("td", { children: r.code }), _jsx("td", { children: _jsx("input", { type: "text", value: r.bezeichnung, onChange: (e) => update(i, "bezeichnung", e.target.value), className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-228" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.hauptbereich, onChange: (e) => update(i, "hauptbereich", e.target.value), className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-229" }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.01", value: r.budget, onChange: (e) => update(i, "budget", safeNumber(e.target.value, 0)), className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-230" }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "0.01", value: r.istKosten, onChange: (e) => update(i, "istKosten", safeNumber(e.target.value, 0)), className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-231" }) }), _jsx("td", { className: rlcClass("right", {
                                                color: abw < 0 ? "#c0392b" : "#2c3e50",
                                                fontWeight: 600
                                            }), children: fmt(abw) }), _jsxs("td", { children: [_jsx("div", { className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-232", children: _jsx("div", { className: rlcClass(null, {
                                                            position: "absolute",
                                                            top: 0,
                                                            left: 0,
                                                            height: "100%",
                                                            width: `${Math.min(per, 100)}%`,
                                                            background: farbe,
                                                            borderRadius: 4,
                                                            transition: "width .3s"
                                                        }) }) }), _jsxs("div", { className: rlcClass(null, {
                                                        fontSize: 12,
                                                        textAlign: "center",
                                                        color: farbe,
                                                        fontWeight: 600
                                                    }), children: [fmt(per), " %"] })] })] }, r.id));
                            }), filtered.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 8, className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-233", children: "Keine Kostenstellen im aktuellen Filter." }) }), _jsxs("tr", { className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-234", children: [_jsx("td", { colSpan: 4, className: "rlc-migrated-pages-buchhaltung-kostenstellen-tsx-235", children: "Summe (gefiltert):" }), _jsx("td", { className: "right", children: fmt(totals.bud) }), _jsx("td", { className: "right", children: fmt(totals.ist) }), _jsx("td", { className: "right", children: fmt(totals.diff) }), _jsxs("td", { className: "right", children: [fmt(pct(totals.ist, totals.bud)), " %"] })] })] })] }), _jsx("div", { className: "bh-note rlc-migrated-pages-buchhaltung-kostenstellen-tsx-236", children: "*Demo-Daten \u00B7 Integrierbar mit Kalkulation/Abrechnung \u2192 automatische Bef\u00FCllung per Projekt-ID." })] }));
}
/* =========================
   PRINTABLE HTML
   ========================= */
function printableHTML(list) {
    const body = list.
        map((r) => `
    <tr>
      <td>${escapeHtml(r.code)}</td>
      <td>${escapeHtml(r.bezeichnung)}</td>
      <td>${escapeHtml(r.hauptbereich)}</td>
      <td style="text-align:right">${fmt(r.budget)}</td>
      <td style="text-align:right">${fmt(r.istKosten)}</td>
      <td style="text-align:right">${fmt(safeNumber(r.budget) - safeNumber(r.istKosten))}</td>
      <td style="text-align:right">${fmt(pct(safeNumber(r.istKosten), safeNumber(r.budget)))} %</td>
    </tr>`).
        join("");
    const totalBudget = list.reduce((a, r) => a + safeNumber(r.budget), 0);
    const totalIst = list.reduce((a, r) => a + safeNumber(r.istKosten), 0);
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
    <tbody>${body || `<tr><td colspan="7">Keine Daten.</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="right">Summe</td>
        <td class="right">${fmt(totalBudget)}</td>
        <td class="right">${fmt(totalIst)}</td>
        <td class="right">${fmt(totalBudget - totalIst)}</td>
        <td class="right">${fmt(pct(totalIst, totalBudget))}%</td>
      </tr>
    </tfoot>
  </table>
  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
