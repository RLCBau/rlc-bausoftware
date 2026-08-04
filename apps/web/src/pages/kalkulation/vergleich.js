import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/vergleich.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
function getProjectKey(projectCtx) {
    const p = projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        projectCtx;
    return String(p?.code ||
        p?.projectCode ||
        p?.number ||
        p?.projektnummer ||
        p?.id ||
        "").trim();
}
function storageKey(projectKey, key) {
    return `rlc_versionsvergleich_v2:${projectKey || "NO_PROJECT"}:${key}`;
}
function safeNumber(value) {
    if (value === null || value === undefined || value === "")
        return 0;
    const raw = String(value).
        trim().
        replace(/\s/g, "").
        replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
        replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}
function money(value) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(value || 0);
}
function numberFmt(value) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
}
function parseCsvLine(line, sep = ";") {
    const out = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"') {
            if (quoted && next === '"') {
                cur += '"';
                i += 1;
            }
            else {
                quoted = !quoted;
            }
            continue;
        }
        if (ch === sep && !quoted) {
            out.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}
function normalizeHeader(value) {
    return value.
        trim().
        toLowerCase().
        replace(/\s+/g, "").
        replace(/[_-]/g, "");
}
function parseCsv(text) {
    const content = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!content)
        return [];
    const lines = content.split(/\r?\n/).filter((x) => x.trim());
    if (!lines.length)
        return [];
    const header = parseCsvLine(lines[0]).map(normalizeHeader);
    const hasHeader = header.includes("posnr") ||
        header.includes("position") ||
        header.includes("kurztext") ||
        header.includes("menge") ||
        header.includes("ep") ||
        header.includes("betrag");
    const idx = (names, fallback) => {
        const found = header.findIndex((h) => names.includes(h));
        return found >= 0 ? found : fallback;
    };
    const iPos = hasHeader ?
        idx(["posnr", "position", "positionsnummer", "pos"], 0) :
        0;
    const iText = hasHeader ?
        idx(["kurztext", "text", "bezeichnung", "beschreibung"], 1) :
        1;
    const iEinheit = hasHeader ? idx(["me", "einheit", "unit", "eh"], 2) : 2;
    const iMenge = hasHeader ? idx(["menge", "qty", "quantity"], 3) : 3;
    const iEp = hasHeader ?
        idx(["ep", "preis", "einheitspreis", "einzelpreis"], 4) :
        4;
    const iBetrag = hasHeader ?
        idx(["betrag", "gesamt", "gp", "gesamtpreis", "total"], 5) :
        5;
    const body = hasHeader ? lines.slice(1) : lines;
    return body.
        map((line) => {
        const c = parseCsvLine(line);
        const menge = safeNumber(c[iMenge]);
        const ep = safeNumber(c[iEp]);
        const betragRaw = safeNumber(c[iBetrag]);
        const betrag = betragRaw || menge * ep;
        return {
            position: String(c[iPos] || "").trim(),
            kurztext: String(c[iText] || "").trim(),
            einheit: String(c[iEinheit] || "").trim(),
            menge,
            ep,
            betrag
        };
    }).
        filter((r) => r.position || r.kurztext);
}
function loadRows(projectKey, key) {
    try {
        const raw = localStorage.getItem(storageKey(projectKey, key));
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
function saveRows(projectKey, key, rows) {
    localStorage.setItem(storageKey(projectKey, key), JSON.stringify(rows));
}
function exportCsv(rows, projectKey) {
    const head = [
        "Position",
        "Kurztext",
        "ME",
        "Menge A",
        "Menge B",
        "EP A",
        "EP B",
        "Betrag A",
        "Betrag B",
        "Delta",
        "Status"
    ];
    const body = rows.map((r) => [
        r.position,
        r.kurztext,
        r.einheit,
        r.mengeA,
        r.mengeB,
        r.epA,
        r.epB,
        r.betragA,
        r.betragB,
        r.delta,
        r.status
    ].
        map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).
        join(";"));
    const blob = new Blob([[head.join(";"), ...body].join("\n")], {
        type: "text/csv;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Versionsvergleich_${projectKey || "Projekt"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
export default function Versionsvergleich() {
    const navigate = useNavigate();
    const projectCtx = useProject();
    const activeProjectKey = getProjectKey(projectCtx);
    const [projectKey, setProjectKey] = useState(activeProjectKey || "PROJ-ANG-001");
    const [rowsA, setRowsA] = useState(() => loadRows(activeProjectKey || "PROJ-ANG-001", "A"));
    const [rowsB, setRowsB] = useState(() => loadRows(activeProjectKey || "PROJ-ANG-001", "B"));
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("alle");
    const [info, setInfo] = useState("");
    useEffect(() => {
        if (!activeProjectKey)
            return;
        setProjectKey(activeProjectKey);
        setRowsA(loadRows(activeProjectKey, "A"));
        setRowsB(loadRows(activeProjectKey, "B"));
    }, [activeProjectKey]);
    const diff = useMemo(() => {
        const mapA = new Map(rowsA.map((p) => [p.position, p]));
        const mapB = new Map(rowsB.map((p) => [p.position, p]));
        const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
        return keys.map((key) => {
            const a = mapA.get(key);
            const b = mapB.get(key);
            const betragA = a?.betrag || 0;
            const betragB = b?.betrag || 0;
            const delta = betragB - betragA;
            let status = "gleich";
            if (a && !b)
                status = "nurA";
            else if (!a && b)
                status = "nurB";
            else if (delta > 0.009)
                status = "teurer";
            else if (delta < -0.009)
                status = "guenstiger";
            return {
                position: key,
                kurztext: a?.kurztext || b?.kurztext || "",
                einheit: a?.einheit || b?.einheit || "",
                mengeA: a?.menge || 0,
                mengeB: b?.menge || 0,
                epA: a?.ep || 0,
                epB: b?.ep || 0,
                betragA,
                betragB,
                delta,
                status
            };
        });
    }, [rowsA, rowsB]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return diff.filter((r) => {
            if (q) {
                const hay = `${r.position} ${r.kurztext} ${r.einheit}`.toLowerCase();
                if (!hay.includes(q))
                    return false;
            }
            if (statusFilter === "alle")
                return true;
            if (statusFilter === "abweichend")
                return r.status !== "gleich";
            return r.status === statusFilter;
        });
    }, [diff, query, statusFilter]);
    const summary = useMemo(() => {
        const sumA = rowsA.reduce((s, p) => s + (p.betrag || 0), 0);
        const sumB = rowsB.reduce((s, p) => s + (p.betrag || 0), 0);
        const delta = sumB - sumA;
        return {
            sumA,
            sumB,
            delta,
            countA: rowsA.length,
            countB: rowsB.length,
            total: diff.length,
            changed: diff.filter((r) => r.status !== "gleich").length,
            teurer: diff.filter((r) => r.status === "teurer").length,
            guenstiger: diff.filter((r) => r.status === "guenstiger").length,
            nurA: diff.filter((r) => r.status === "nurA").length,
            nurB: diff.filter((r) => r.status === "nurB").length
        };
    }, [rowsA, rowsB, diff]);
    function importCsv(which, file) {
        const reader = new FileReader();
        reader.onload = () => {
            const parsed = parseCsv(String(reader.result || ""));
            saveRows(projectKey, which, parsed);
            if (which === "A")
                setRowsA(parsed);
            else
                setRowsB(parsed);
            setInfo(`Import ${which} abgeschlossen: ${parsed.length.toLocaleString("de-DE")} Positionen.`);
            setTimeout(() => setInfo(""), 2500);
        };
        reader.readAsText(file, "utf-8");
    }
    function clear(which) {
        if (!confirm(`Version ${which} wirklich löschen?`))
            return;
        saveRows(projectKey, which, []);
        if (which === "A")
            setRowsA([]);
        else
            setRowsB([]);
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Angebotsanalyse" }), _jsx("h1", { className: rlcClass(null, title), children: "Versionsvergleich" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Zwei LV-/Angebotsst\u00E4nde vergleichen, Preisabweichungen pr\u00FCfen und Differenzen sauber auswerten." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/mit-ki"), children: "\u21E2 Kalkulation mit KI" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/manuell"), children: "\u21E2 Manuell" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/angebot"), children: "\u21E2 Angebot" }), _jsx("button", { className: rlcClass(null, btnPrimary), onClick: () => exportCsv(filtered, projectKey), disabled: !filtered.length, children: "Ergebnis exportieren" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectKey || "—" }), info ? _jsxs("span", { children: [" \u00B7 ", info] }) : null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(Kpi, { label: "Summe A", value: money(summary.sumA), sub: `${summary.countA} Positionen` }), _jsx(Kpi, { label: "Summe B", value: money(summary.sumB), sub: `${summary.countB} Positionen` }), _jsx(Kpi, { label: "Delta", value: money(summary.delta), sub: summary.delta >= 0 ? "B ist teurer" : "B ist günstiger", danger: summary.delta > 0, ok: summary.delta < 0 }), _jsx(Kpi, { label: "Abweichungen", value: `${summary.changed}/${summary.total}`, sub: `${summary.teurer} teurer · ${summary.guenstiger} günstiger` })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Import & Filter" }), _jsx("div", { className: rlcClass(null, sectionText), children: "CSV-Struktur: Position;Kurztext;ME;Menge;EP;Betrag" })] }) }), _jsxs("div", { className: rlcClass(null, toolbar), children: [_jsx(Field, { label: "Projekt", children: _jsx("input", { className: rlcClass(null, input), value: projectKey, onChange: (e) => {
                                        const next = e.target.value;
                                        setProjectKey(next);
                                        setRowsA(loadRows(next, "A"));
                                        setRowsB(loadRows(next, "B"));
                                    } }) }), _jsx(Field, { label: "Suche", children: _jsx("input", { className: rlcClass(null, input), placeholder: "PosNr / Kurztext / Einheit", value: query, onChange: (e) => setQuery(e.target.value) }) }), _jsx(Field, { label: "Filter", children: _jsxs("select", { className: rlcClass(null, input), value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), children: [_jsx("option", { value: "alle", children: "Alle" }), _jsx("option", { value: "abweichend", children: "Nur abweichend" }), _jsx("option", { value: "teurer", children: "B teurer" }), _jsx("option", { value: "guenstiger", children: "B g\u00FCnstiger" }), _jsx("option", { value: "nurA", children: "Nur in A" }), _jsx("option", { value: "nurB", children: "Nur in B" })] }) }), _jsxs("div", { className: rlcClass(null, buttonCluster), children: [_jsxs("label", { className: rlcClass(null, btnSecondary), children: ["Import A", _jsx("input", { type: "file", accept: ".csv,text/csv", onChange: (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f)
                                                        importCsv("A", f);
                                                    e.currentTarget.value = "";
                                                }, className: "rlc-migrated-pages-kalkulation-vergleich-tsx-933" })] }), _jsxs("label", { className: rlcClass(null, btnSecondary), children: ["Import B", _jsx("input", { type: "file", accept: ".csv,text/csv", onChange: (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f)
                                                        importCsv("B", f);
                                                    e.currentTarget.value = "";
                                                }, className: "rlc-migrated-pages-kalkulation-vergleich-tsx-934" })] }), _jsx("button", { className: rlcClass(null, btnDanger), onClick: () => clear("A"), disabled: !rowsA.length, children: "A l\u00F6schen" }), _jsx("button", { className: rlcClass(null, btnDanger), onClick: () => clear("B"), disabled: !rowsB.length, children: "B l\u00F6schen" })] })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Vergleichstabelle" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Gr\u00FCn = B g\u00FCnstiger. Rot = B teurer. Grau = nur in einer Version vorhanden." })] }), _jsxs("div", { className: rlcClass(null, badgeNeutral), children: ["Sichtbar: ", filtered.length.toLocaleString("de-DE"), " Positionen"] })] }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Pos." }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge A" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge B" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP A" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP B" }), _jsx("th", { className: rlcClass(null, thRight), children: "Betrag A" }), _jsx("th", { className: rlcClass(null, thRight), children: "Betrag B" }), _jsx("th", { className: rlcClass(null, thRight), children: "Delta" }), _jsx("th", { className: rlcClass(null, th), children: "Status" })] }) }), _jsxs("tbody", { children: [filtered.map((r, i) => {
                                            const rowBg = r.status === "teurer" ?
                                                "#FEF2F2" :
                                                r.status === "guenstiger" ?
                                                    "#F0FDF4" :
                                                    r.status === "nurA" || r.status === "nurB" ?
                                                        "#F8FAFC" :
                                                        i % 2 ?
                                                            "#FCFCFC" :
                                                            "#FFFFFF";
                                            return (_jsxs("tr", { className: rlcClass(null, { background: rowBg }), children: [_jsx("td", { className: rlcClass(null, tdStrong), children: r.position }), _jsx("td", { className: rlcClass(null, td), children: r.kurztext }), _jsx("td", { className: rlcClass(null, td), children: r.einheit }), _jsx("td", { className: rlcClass(null, tdRight), children: numberFmt(r.mengeA) }), _jsx("td", { className: rlcClass(null, tdRight), children: numberFmt(r.mengeB) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(r.epA) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(r.epB) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(r.betragA) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(r.betragB) }), _jsx("td", { className: rlcClass(null, {
                                                            ...tdRight,
                                                            fontWeight: 700,
                                                            color: r.delta > 0 ?
                                                                "#B91C1C" :
                                                                r.delta < 0 ?
                                                                    "#15803D" :
                                                                    "#475569"
                                                        }), children: money(r.delta) }), _jsx("td", { className: rlcClass(null, td), children: _jsx(StatusBadge, { status: r.status }) })] }, `${r.position}-${i}`));
                                        }), !filtered.length ?
                                            _jsx("tr", { children: _jsx("td", { colSpan: 11, className: rlcClass(null, { ...td, color: "#64748B" }), children: "Keine Daten vorhanden oder kein Treffer im aktuellen Filter." }) }) :
                                            null] }), filtered.length ?
                                    _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, tfootCell), colSpan: 7, children: "Summe" }), _jsx("td", { className: rlcClass(null, tfootRight), children: money(summary.sumA) }), _jsx("td", { className: rlcClass(null, tfootRight), children: money(summary.sumB) }), _jsx("td", { className: rlcClass(null, {
                                                        ...tfootRight,
                                                        color: summary.delta > 0 ? "#B91C1C" : "#15803D"
                                                    }), children: money(summary.delta) }), _jsx("td", { className: rlcClass(null, tfootCell) })] }) }) :
                                    null] }) })] })] }));
}
/* ================= UI ================= */
function Kpi({ label, value, sub, danger, ok }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, {
                    ...kpiValue,
                    color: danger ? "#B91C1C" : ok ? "#15803D" : "#0F172A"
                }), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-vergleich-tsx-935", children: [_jsx("span", { className: rlcClass(null, fieldLabel), children: label }), children] }));
}
function StatusBadge({ status }) {
    if (status === "teurer")
        return _jsx("span", { className: rlcClass(null, badgeDanger), children: "B teurer" });
    if (status === "guenstiger")
        return _jsx("span", { className: rlcClass(null, badgeOk), children: "B g\u00FCnstiger" });
    if (status === "nurA")
        return _jsx("span", { className: rlcClass(null, badgeNeutral), children: "Nur A" });
    if (status === "nurB")
        return _jsx("span", { className: rlcClass(null, badgeNeutral), children: "Nur B" });
    return _jsx("span", { className: rlcClass(null, badgeOk), children: "Gleich" });
}
/* ================= STYLES ================= */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    display: "grid",
    gap: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.8,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 30,
    fontWeight: 700
};
const subtitle = {
    margin: 0,
    maxWidth: 840,
    opacity: 0.88,
    lineHeight: 1.55
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.9
};
const grid4 = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
    gap: 12
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12
};
const sectionTitle = {
    margin: 0,
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 700
};
const sectionText = {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B"
};
const toolbar = {
    display: "flex",
    gap: 12,
    alignItems: "end",
    flexWrap: "wrap"
};
const buttonCluster = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
};
const fieldLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const input = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    background: "#FFFFFF"
};
const kpiCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 6,
    fontSize: 22,
    fontWeight: 700
};
const kpiSub = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnPrimary = {
    ...btnBase,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF"
};
const btnSecondary = {
    ...btnBase,
    background: "#FFFFFF",
    color: "#0F172A"
};
const btnDanger = {
    ...btnBase,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const tableWrap = {
    overflowX: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
    minWidth: 1160,
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 9px",
    fontSize: 12,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap"
};
const thRight = {
    ...th,
    textAlign: "right"
};
const td = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle"
};
const tdStrong = {
    ...td,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap"
};
const tfootCell = {
    padding: "10px 9px",
    fontSize: 13,
    borderTop: "2px solid #E5E7EB",
    background: "#F8FAFC",
    fontWeight: 700,
    textAlign: "right"
};
const tfootRight = {
    ...tfootCell,
    textAlign: "right"
};
const badgeNeutral = {
    display: "inline-flex",
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#475569",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700
};
const badgeOk = {
    ...badgeNeutral,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D"
};
const badgeDanger = {
    ...badgeNeutral,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
