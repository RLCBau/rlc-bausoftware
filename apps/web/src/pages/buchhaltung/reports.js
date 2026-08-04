import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
const fmtSize = (n) => !n ?
    "–" :
    n < 1024 ?
        `${n} B` :
        n < 1024 * 1024 ?
            `${(n / 1024).toFixed(1)} KB` :
            `${(n / 1024 / 1024).toFixed(1)} MB`;
const fmtDate = (d = new Date()) => d.toLocaleDateString("de-DE");
function safeTrim(v) {
    return String(v ?? "").trim();
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
const parseDE = (s) => {
    const value = safeTrim(s);
    if (!value)
        return new Date("1970-01-01");
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const [d, m, y] = value.split(".").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};
const withinDays = (d, days) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    return d >= from;
};
const isSameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
function csvEscape(v) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
export default function Reports() {
    const [rows, setRows] = useState([
        {
            id: 1,
            nummer: "RPT-001",
            titel: "Abrechnung Oktober",
            typ: "Abrechnung",
            projekt: "BA III",
            kostenstelle: "Erdarbeiten",
            datum: "25.10.2025",
            version: 1,
            bearbeiter: "Müller",
            status: "in Prüfung"
        },
        {
            id: 2,
            nummer: "RPT-002",
            titel: "Regiebericht 12.10",
            typ: "Regiebericht",
            projekt: "Parkplatz Süd",
            kostenstelle: "Leitungen",
            datum: "12.10.2025",
            version: 1,
            bearbeiter: "Kraus",
            status: "abgeschlossen"
        },
        {
            id: 3,
            nummer: "RPT-003",
            titel: "Nachtrag DN200",
            typ: "Nachtrag",
            projekt: "BA IV",
            kostenstelle: "Rohrbau",
            datum: "20.10.2025",
            version: 2,
            bearbeiter: "Schmidt",
            status: "offen"
        }
    ]);
    const [zeitraum, setZeitraum] = useState("THIS_MONTH");
    const [typ, setTyp] = useState("ALL");
    const [status, setStatus] = useState("ALL");
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
        let arr = rows.slice();
        arr = arr.filter((r) => {
            const d = parseDE(r.datum);
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
        if (typ !== "ALL")
            arr = arr.filter((r) => r.typ === typ);
        if (status !== "ALL")
            arr = arr.filter((r) => r.status === status);
        if (query.trim()) {
            const q = query.toLowerCase().trim();
            arr = arr.filter((r) => [
                r.titel,
                r.nummer,
                r.projekt || "",
                r.kostenstelle || "",
                r.dateiname || "",
                r.bearbeiter || ""
            ].
                join(" ").
                toLowerCase().
                includes(q));
        }
        arr.sort((a, b) => parseDE(b.datum).getTime() - parseDE(a.datum).getTime());
        return arr;
    }, [rows, zeitraum, typ, status, query]);
    const total = filtered.length;
    const fileRef = useRef(null);
    const [hover, setHover] = useState(false);
    const addFiles = (files) => {
        if (!files?.length)
            return;
        let nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
        const added = Array.from(files).map((f) => {
            const currentId = nextId++;
            return {
                id: currentId,
                nummer: `RPT-${String(currentId).padStart(3, "0")}`,
                titel: f.name.replace(/\.[^.]+$/, ""),
                typ: "Sonstiges",
                datum: fmtDate(),
                version: 1,
                status: "offen",
                bearbeiter: "System",
                dateiname: f.name,
                size: f.size,
                url: URL.createObjectURL(f)
            };
        });
        setRows((p) => [...added, ...p]);
    };
    const onDrop = (e) => {
        e.preventDefault();
        setHover(false);
        addFiles(e.dataTransfer.files);
    };
    const exportCSV = (useFiltered) => {
        const list = useFiltered ? filtered : rows;
        if (!list.length) {
            alert("Keine Daten für den Export vorhanden.");
            return;
        }
        const data = list.map((r) => ({
            Nummer: r.nummer,
            Titel: r.titel,
            Typ: r.typ,
            Projekt: r.projekt || "",
            Kostenstelle: r.kostenstelle || "",
            Datum: r.datum,
            Version: r.version,
            Bearbeiter: r.bearbeiter || "",
            Status: r.status,
            Datei: r.dateiname || "",
            Größe: fmtSize(r.size)
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
        a.download = useFiltered ? "reports_gefiltert.csv" : "reports_alle.csv";
        a.click();
        URL.revokeObjectURL(href);
    };
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
    const printList = (useFiltered) => openPrint(printableHTML(useFiltered ? filtered : rows));
    const remove = (id) => {
        setRows((p) => {
            const found = p.find((r) => r.id === id);
            if (found?.url?.startsWith("blob:")) {
                try {
                    URL.revokeObjectURL(found.url);
                }
                catch { }
            }
            return p.filter((r) => r.id !== id);
        });
    };
    const update = (i, key, val) => {
        setRows((p) => {
            const c = [...p];
            if (!c[i])
                return p;
            c[i] = { ...c[i], [key]: val };
            return c;
        });
    };
    const [preview, setPreview] = useState(null);
    useEffect(() => {
        return () => {
            rows.forEach((r) => {
                if (r.url?.startsWith("blob:")) {
                    try {
                        URL.revokeObjectURL(r.url);
                    }
                    catch { }
                }
            });
        };
    }, [rows]);
    const isPdfPreview = preview ? /\.pdf$/i.test(preview.name) : false;
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("div", { className: "bh-header-row", children: [_jsx("h2", { children: "Reports verwalten" }), _jsxs("div", { className: "bh-actions", children: [_jsx("button", { className: "bh-btn", onClick: () => fileRef.current?.click(), children: "+ Datei hochladen" }), _jsx("button", { className: "bh-btn ghost", onClick: () => exportCSV(true), children: "Export CSV (gefiltert)" }), _jsx("button", { className: "bh-btn ghost", onClick: () => printList(true), children: "PDF Liste (gefiltert)" })] })] }), _jsx("input", { ref: fileRef, type: "file", multiple: true, onChange: (e) => addFiles(e.target.files), className: "rlc-migrated-pages-buchhaltung-reports-tsx-283" }), _jsx("div", { onDragEnter: (e) => {
                    setHover(true);
                    e.preventDefault();
                }, onDragOver: (e) => e.preventDefault(), onDragLeave: () => setHover(false), onDrop: onDrop, className: rlcClass("bh-dropzone", {
                    border: "1px dashed #ccc",
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 12,
                    background: hover ? "rgba(0,0,0,0.05)" : "transparent",
                    cursor: "pointer"
                }), onClick: () => fileRef.current?.click(), children: "\uD83D\uDCCE Datei hier ablegen oder klicken zum Hochladen" }), _jsxs("div", { className: "bh-filters", children: [_jsxs("div", { children: [_jsx("label", { children: "Zeitraum" }), _jsxs("select", { value: zeitraum, onChange: (e) => setZeitraum(e.target.value), children: [_jsx("option", { value: "THIS_MONTH", children: "Dieser Monat" }), _jsx("option", { value: "30", children: "Letzte 30 Tage" }), _jsx("option", { value: "60", children: "Letzte 60 Tage" }), _jsx("option", { value: "90", children: "Letzte 90 Tage" }), _jsx("option", { value: "YTD", children: "YTD" }), _jsx("option", { value: "ALL", children: "Alle" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Typ" }), _jsxs("select", { value: typ, onChange: (e) => setTyp(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "Abrechnung", children: "Abrechnung" }), _jsx("option", { value: "Regiebericht", children: "Regiebericht" }), _jsx("option", { value: "Nachtrag", children: "Nachtrag" }), _jsx("option", { value: "Pr\u00FCfbericht", children: "Pr\u00FCfbericht" }), _jsx("option", { value: "Rechnung", children: "Rechnung" }), _jsx("option", { value: "Sonstiges", children: "Sonstiges" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Status" }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), children: [_jsx("option", { value: "ALL", children: "Alle" }), _jsx("option", { value: "offen", children: "Offen" }), _jsx("option", { value: "in Pr\u00FCfung", children: "In Pr\u00FCfung" }), _jsx("option", { value: "abgeschlossen", children: "Abgeschlossen" })] })] }), _jsxs("div", { children: [_jsx("label", { children: "Suche" }), _jsx("input", { type: "text", value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Titel / Projekt / Kostenstelle" })] }), _jsxs("div", { className: "rlc-migrated-pages-buchhaltung-reports-tsx-284", children: [total, " Reports"] })] }), _jsxs("table", { className: "bh-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktionen" }), _jsx("th", { children: "Nummer" }), _jsx("th", { children: "Titel" }), _jsx("th", { children: "Typ" }), _jsx("th", { children: "Projekt" }), _jsx("th", { children: "Kostenstelle" }), _jsx("th", { children: "Datum" }), _jsx("th", { children: "Version" }), _jsx("th", { children: "Bearbeiter" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Datei" }), _jsx("th", { children: "Gr\u00F6\u00DFe" }), _jsx("th", { children: "Preview" })] }) }), _jsxs("tbody", { children: [filtered.map((r) => {
                                const i = rows.findIndex((x) => x.id === r.id);
                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { className: "bh-btn rlc-migrated-pages-buchhaltung-reports-tsx-285", onClick: () => remove(r.id), children: "L\u00F6schen" }) }), _jsx("td", { children: r.nummer }), _jsx("td", { children: _jsx("input", { type: "text", value: r.titel, onChange: (e) => update(i, "titel", e.target.value), className: "rlc-migrated-pages-buchhaltung-reports-tsx-286" }) }), _jsx("td", { children: r.typ }), _jsx("td", { children: _jsx("input", { type: "text", value: r.projekt || "", onChange: (e) => update(i, "projekt", e.target.value), className: "rlc-migrated-pages-buchhaltung-reports-tsx-287" }) }), _jsx("td", { children: _jsx("input", { type: "text", value: r.kostenstelle || "", onChange: (e) => update(i, "kostenstelle", e.target.value), className: "rlc-migrated-pages-buchhaltung-reports-tsx-288" }) }), _jsx("td", { children: r.datum }), _jsx("td", { className: "rlc-migrated-pages-buchhaltung-reports-tsx-289", children: r.version }), _jsx("td", { children: r.bearbeiter }), _jsx("td", { children: _jsxs("select", { value: r.status, onChange: (e) => update(i, "status", e.target.value), children: [_jsx("option", { value: "offen", children: "offen" }), _jsx("option", { value: "in Pr\u00FCfung", children: "in Pr\u00FCfung" }), _jsx("option", { value: "abgeschlossen", children: "abgeschlossen" })] }) }), _jsx("td", { children: r.dateiname || "–" }), _jsx("td", { className: "right", children: fmtSize(r.size) }), _jsx("td", { children: r.url ?
                                                _jsx("button", { className: "bh-btn ghost", onClick: () => setPreview({
                                                        url: r.url,
                                                        name: r.dateiname || r.titel
                                                    }), children: "\u00D6ffnen" }) :
                                                _jsx("span", { className: "bh-text-muted", children: "\u2013" }) })] }, r.id));
                            }), filtered.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 13, className: "rlc-migrated-pages-buchhaltung-reports-tsx-290", children: "Keine Reports im aktuellen Filter." }) })] })] }), preview &&
                _jsx("div", { onClick: () => setPreview(null), className: "rlc-migrated-pages-buchhaltung-reports-tsx-291", children: _jsxs("div", { onClick: (e) => e.stopPropagation(), className: "rlc-migrated-pages-buchhaltung-reports-tsx-292", children: [_jsxs("div", { className: "rlc-migrated-pages-buchhaltung-reports-tsx-293", children: [_jsx("strong", { children: preview.name }), _jsx("button", { className: "bh-btn", onClick: () => setPreview(null), children: "Schlie\u00DFen" })] }), _jsx("div", { className: "rlc-migrated-pages-buchhaltung-reports-tsx-294", children: isPdfPreview ?
                                    _jsx("iframe", { src: preview.url, title: "Report PDF", className: "rlc-migrated-pages-buchhaltung-reports-tsx-295" }) :
                                    _jsx("img", { src: preview.url, alt: "Preview", className: "rlc-migrated-pages-buchhaltung-reports-tsx-296" }) })] }) })] }));
}
function printableHTML(list) {
    const body = list.
        map((r) => `
    <tr>
      <td>${escapeHtml(r.nummer)}</td>
      <td>${escapeHtml(r.titel)}</td>
      <td>${escapeHtml(r.typ)}</td>
      <td>${escapeHtml(r.projekt || "")}</td>
      <td>${escapeHtml(r.kostenstelle || "")}</td>
      <td>${escapeHtml(r.datum)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.bearbeiter || "")}</td>
    </tr>`).
        join("");
    return `<!doctype html><html><head><meta charset="utf-8"/><title>Reports</title>
  <style>
  body{font-family:Arial, sans-serif;margin:32px;color:#222}
  h1{margin:0 0 12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
  th{background:#f5f5f5}
  </style></head><body>
  <h1>Reports – Übersicht</h1>
  <table>
    <thead><tr><th>Nummer</th><th>Titel</th><th>Typ</th><th>Projekt</th><th>Kostenstelle</th><th>Datum</th><th>Status</th><th>Bearbeiter</th></tr></thead>
    <tbody>${body || `<tr><td colspan="8">Keine Daten.</td></tr>`}</tbody>
  </table>
  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
