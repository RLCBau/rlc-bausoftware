import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV } from "./store.lv";
import { Projects } from "./projectStore";
const MWST_KEY = "rlc_lv_mwst_v1";
const API_BASE = "https://api.rlcbausoftware.com";
export default function LVImportPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [mwst, setMwst] = useState(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
    const fileRef = useRef(null);
    const [gaebResult, setGaebResult] = useState(null);
    const [gaebBusy, setGaebBusy] = useState(null);
    const [gaebInfo, setGaebInfo] = useState("");
    // initial load
    useEffect(() => {
        setRows(LV.list());
    }, []);
    useEffect(() => {
        localStorage.setItem(MWST_KEY, String(mwst || 0));
    }, [mwst]);
    const curProject = Projects.getCurrent();
    const projectCode = String(curProject?.number || "").trim().toUpperCase();
    // helpers
    const save = (r) => {
        LV.upsert(r);
        setRows(LV.list());
    };
    const addRow = () => {
        LV.upsert({
            id: crypto.randomUUID(),
            posNr: "",
            kurztext: "",
            einheit: "m",
            menge: 0,
            preis: 0,
        });
        setRows(LV.list());
    };
    const del = (id) => {
        LV.remove(id);
        setRows(LV.list());
    };
    const clearAll = () => {
        if (confirm("Alle Zeilen wirklich löschen?")) {
            LV.clear();
            setRows([]);
            setGaebResult(null);
            setGaebInfo("");
        }
    };
    // CSV
    const exportCSV = () => {
        const csv = LV.exportCSV(rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lv.csv";
        a.click();
        URL.revokeObjectURL(url);
    };
    const importCSV = (text) => {
        LV.importCSV(text);
        setRows(LV.list());
        setGaebResult(null);
        setGaebInfo("");
    };
    // Paste rows (semicolon CSV)
    const pasteRows = () => {
        const example = `PosNr;Kurztext;Einheit;Menge;Preis;Confidence
01.0001;"Aushub Baugrube";m³;120;35.5;`;
        const t = prompt("Zeilen einfügen (CSV mit ; – Kopfzeile erlaubt):", example);
        if (!t)
            return;
        LV.importCSV(t);
        setRows(LV.list());
        setGaebResult(null);
        setGaebInfo("");
    };
    // XLSX (SpreadsheetML)
    const exportXLSX = () => {
        const xmlHeader = `<?xml version="1.0"?>` +
            `<?mso-application progid="Excel.Sheet"?>` +
            `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
            `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
            `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
            `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
        const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;
        const headRow = `<Row>` +
            ["PosNr", "Kurztext", "Einheit", "Menge", "EP (netto)", "Confidence", "Zeilen-Netto"]
                .map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`)
                .join("") +
            `</Row>`;
        const body = rows
            .map((r) => {
            const z = (r.menge || 0) * (r.preis || 0);
            return (`<Row>` +
                `<Cell><Data ss:Type="String">${esc(r.posNr || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.kurztext || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.einheit || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.menge)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.preis)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.confidence)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(z)}</Data></Cell>` +
                `</Row>`);
        })
            .join("");
        const foot = `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/>` +
            `<Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>`;
        const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
        const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lv.xlsx";
        a.click();
        URL.revokeObjectURL(url);
    };
    // Auto-PosNr helper
    const autoPosNr = () => {
        const next = [...rows];
        let i = 1;
        for (const r of next) {
            if (!r.posNr || /^\s*$/.test(r.posNr)) {
                r.posNr = `01.${String(i).padStart(4, "0")}`;
                LV.upsert(r);
                i++;
            }
        }
        setRows(LV.list());
        setGaebResult(null);
        setGaebInfo("");
    };
    async function validateGAEB(mode) {
        if (!projectCode) {
            alert("Kein Projekt gewählt");
            return null;
        }
        setGaebBusy(mode);
        setGaebInfo("");
        try {
            const r = await fetch(`${API_BASE}/api/project-lv/${encodeURIComponent(projectCode)}/export/gaeb/validate?mode=${mode}`, { method: "POST" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                throw new Error(j?.error || "Validierung fehlgeschlagen");
            }
            const result = {
                ...j,
                mode,
                valid: !!j?.valid,
                errorCount: Number(j?.errorCount || 0),
                warningCount: Number(j?.warningCount || 0),
                errors: normalizeIssues(j?.errors),
                warnings: normalizeIssues(j?.warnings),
            };
            setGaebResult(result);
            if (result.valid) {
                setGaebInfo(`GAEB ${mode.toUpperCase()} ist valide.`);
            }
            else {
                setGaebInfo(`GAEB ${mode.toUpperCase()} ist nicht valide. Fehler: ${result.errorCount || 0}, Warnungen: ${result.warningCount || 0}.`);
            }
            return result;
        }
        catch (e) {
            const errResult = {
                mode,
                valid: false,
                errorCount: 1,
                warningCount: 0,
                errors: [
                    {
                        type: "error",
                        field: "system",
                        message: e?.message || "Unbekannter Fehler",
                    },
                ],
                warnings: [],
            };
            setGaebResult(errResult);
            setGaebInfo(`Validierungs-Fehler: ${e?.message || e}`);
            return errResult;
        }
        finally {
            setGaebBusy(null);
        }
    }
    async function exportGAEBProject(mode) {
        if (!projectCode) {
            alert("Kein Projekt gewählt");
            return;
        }
        setGaebBusy(mode);
        setGaebInfo("");
        try {
            const validation = await fetch(`${API_BASE}/api/project-lv/${encodeURIComponent(projectCode)}/export/gaeb/validate?mode=${mode}`, { method: "POST" });
            const val = await validation.json().catch(() => ({}));
            if (!validation.ok) {
                throw new Error(val?.error || "Validierung fehlgeschlagen");
            }
            const result = {
                ...val,
                mode,
                valid: !!val?.valid,
                errorCount: Number(val?.errorCount || 0),
                warningCount: Number(val?.warningCount || 0),
                errors: normalizeIssues(val?.errors),
                warnings: normalizeIssues(val?.warnings),
            };
            setGaebResult(result);
            if (!result.valid) {
                setGaebInfo(`Export ${mode.toUpperCase()} blockiert. Fehler: ${result.errorCount || 0}, Warnungen: ${result.warningCount || 0}.`);
                return;
            }
            const r = await fetch(`${API_BASE}/api/project-lv/${encodeURIComponent(projectCode)}/export/gaeb/${mode}`, { method: "POST" });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j?.error || "Export fehlgeschlagen");
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${projectCode}.${mode}.xml`;
            a.click();
            URL.revokeObjectURL(url);
            setGaebInfo(`Export ${mode.toUpperCase()} erfolgreich erstellt.`);
        }
        catch (e) {
            setGaebInfo(`Export-Fehler: ${e?.message || e}`);
        }
        finally {
            setGaebBusy(null);
        }
    }
    const totals = useMemo(() => {
        const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
        const brutto = netto * (1 + (mwst || 0) / 100);
        return { netto, brutto };
    }, [rows, mwst]);
    const gaebStatusColor = gaebResult ? (gaebResult.valid ? "#2a7" : "#d33") : "#666";
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("h2", { children: "LV hochladen / erstellen" }), _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }, children: [_jsxs("div", { children: [_jsx("b", { children: "Projekt:" }), " ", curProject ? `${curProject.number} — ${curProject.name}` : "kein Projekt ausgewählt"] }), _jsxs("label", { style: { marginLeft: 12 }, children: ["MwSt %", _jsx("input", { type: "number", value: mwst, onChange: (e) => setMwst(Number(e.target.value || 0)), style: { width: 70, marginLeft: 6 } })] }), _jsx("button", { onClick: () => fileRef.current?.click(), children: "CSV Import" }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv", style: { display: "none" }, onChange: (e) => {
                            const f = e.target.files?.[0];
                            if (!f)
                                return;
                            const r = new FileReader();
                            r.onload = () => importCSV(String(r.result || ""));
                            r.readAsText(f, "utf-8");
                        } }), _jsx("button", { onClick: pasteRows, children: "Zeilen einf\u00FCgen" }), _jsx("button", { onClick: exportCSV, children: "CSV Export" }), _jsx("button", { onClick: exportXLSX, children: "XLSX Export" }), _jsx("button", { onClick: () => validateGAEB("x83"), disabled: !projectCode || !!gaebBusy, title: !projectCode ? "Kein Projekt gewählt" : "GAEB X83 prüfen", children: gaebBusy === "x83" ? "X83 prüft …" : "X83 prüfen" }), _jsx("button", { onClick: () => exportGAEBProject("x83"), disabled: !projectCode || !!gaebBusy, title: !projectCode ? "Kein Projekt gewählt" : "GAEB X83 exportieren", children: gaebBusy === "x83" ? "X83 Export …" : "X83 Export" }), _jsx("button", { onClick: () => validateGAEB("x84"), disabled: !projectCode || !!gaebBusy, title: !projectCode ? "Kein Projekt gewählt" : "GAEB X84 prüfen", children: gaebBusy === "x84" ? "X84 prüft …" : "X84 prüfen" }), _jsx("button", { onClick: () => exportGAEBProject("x84"), disabled: !projectCode || !!gaebBusy, title: !projectCode ? "Kein Projekt gewählt" : "GAEB X84 exportieren", children: gaebBusy === "x84" ? "X84 Export …" : "X84 Export" }), _jsx("button", { onClick: addRow, children: "+ Zeile" }), _jsx("button", { onClick: autoPosNr, children: "Auto-Position" }), _jsx("button", { onClick: clearAll, children: "Alles l\u00F6schen" }), _jsx("button", { style: { marginLeft: "auto" }, onClick: () => navigate("/kalkulation/manuell"), title: "Wechsel zur Kalkulation \u2013 Manuell", children: "\u21E2 in \u201EKalkulation manuell\u201C" }), _jsx("button", { onClick: () => navigate("/kalkulation/mit-ki"), title: "Wechsel zur Kalkulation \u2013 KI", children: "\u21E2 in \u201EKalkulation mit KI\u201C" })] }), _jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }, children: [_jsx("span", { style: { ...badge, borderColor: gaebStatusColor, color: gaebStatusColor }, children: gaebResult ? (gaebResult.valid ? "GAEB valide" : "GAEB nicht valide") : "GAEB Status offen" }), _jsxs("span", { style: pill, children: ["Projektcode: ", projectCode || "—"] }), gaebResult && (_jsxs(_Fragment, { children: [_jsxs("span", { style: { ...pill, borderColor: "#d33", color: "#d33" }, children: ["Fehler: ", gaebResult.errorCount || 0] }), _jsxs("span", { style: { ...pill, borderColor: "#c80", color: "#c80" }, children: ["Warnungen: ", gaebResult.warningCount || 0] }), gaebResult.mode && _jsxs("span", { style: pill, children: ["Modus: ", gaebResult.mode.toUpperCase()] })] }))] }), !!gaebInfo && (_jsx("div", { style: { marginBottom: 12, color: gaebInfo.includes("Fehler") || gaebInfo.includes("blockiert") ? "#b00" : "#0a7" }, children: gaebInfo })), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: ["Position", "Kurztext", "ME", "Menge (Formel)", "EP (netto)", "Menge (calc.)", "Zeilenpreis", "Aktion"].map((h, i) => (_jsx("th", { style: th, children: h }, i))) }) }), _jsxs("tbody", { children: [rows.map((r) => {
                                    const zeile = (r.menge || 0) * (r.preis || 0);
                                    return (_jsxs("tr", { children: [_jsx("td", { style: td, children: _jsx("input", { value: r.posNr, onChange: (e) => save({ ...r, posNr: e.target.value }), style: inp(110) }) }), _jsx("td", { style: td, children: _jsx("input", { value: r.kurztext, onChange: (e) => save({ ...r, kurztext: e.target.value }), style: inp(520) }) }), _jsx("td", { style: td, children: _jsx("input", { value: r.einheit, onChange: (e) => save({ ...r, einheit: e.target.value }), style: inp(60) }) }), _jsx("td", { style: tdNum, children: _jsx("input", { type: "number", value: r.menge, onChange: (e) => save({ ...r, menge: num(e.target.value) }), style: inp(120, "right") }) }), _jsx("td", { style: tdNum, children: _jsx("input", { type: "number", value: r.preis ?? 0, onChange: (e) => save({ ...r, preis: num(e.target.value) }), style: inp(120, "right") }) }), _jsx("td", { style: { ...tdNum, color: "#999" }, children: r.menge ?? 0 }), _jsx("td", { style: { ...tdNum, fontWeight: 600 }, children: fmt(zeile) }), _jsx("td", { style: td, children: _jsx("button", { onClick: () => del(r.id), children: "L\u00F6schen" }) })] }, r.id));
                                }), rows.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, style: { padding: 12, color: "#666" }, children: "Noch keine Zeilen." }) }))] })] }) }), gaebResult && !gaebResult.valid && (_jsxs("div", { style: { marginTop: 20 }, children: [_jsx("h3", { style: { marginBottom: 10 }, children: "GAEB Fehler / Warnungen" }), _jsx("div", { style: { border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { style: { background: "#fafafa" }, children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Feld" }), _jsx("th", { style: th, children: "Meldung" })] }) }), _jsxs("tbody", { children: [(gaebResult.errors || []).map((err, i) => (_jsxs("tr", { style: { background: "#fff5f5" }, children: [_jsx("td", { style: td, children: err.position || err.posNr || "—" }), _jsx("td", { style: { ...td, color: "#d33", fontWeight: 600 }, children: err.type || "error" }), _jsx("td", { style: td, children: err.field || "—" }), _jsx("td", { style: td, children: err.message || err.reason || err.code || "—" })] }, `e-${i}`))), (gaebResult.warnings || []).map((warn, i) => (_jsxs("tr", { style: { background: "#fff9e8" }, children: [_jsx("td", { style: td, children: warn.position || warn.posNr || "—" }), _jsx("td", { style: { ...td, color: "#c80", fontWeight: 600 }, children: warn.type || "warning" }), _jsx("td", { style: td, children: warn.field || "—" }), _jsx("td", { style: td, children: warn.message || warn.reason || warn.code || "—" })] }, `w-${i}`))), !(gaebResult.errors || []).length && !(gaebResult.warnings || []).length && (_jsx("tr", { children: _jsx("td", { colSpan: 4, style: { padding: 12, color: "#666" }, children: "Keine Detailfehler vorhanden." }) }))] })] }) })] })), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 16 }, children: [_jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Netto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.netto) })] }), _jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Brutto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.brutto) })] })] })] }));
}
function normalizeIssues(items) {
    if (!Array.isArray(items))
        return [];
    return items.map((it) => ({
        position: it?.position ?? it?.posNr ?? it?.positionNo ?? "",
        posNr: it?.posNr ?? it?.position ?? it?.positionNo ?? "",
        type: it?.type ?? "",
        field: it?.field ?? it?.path ?? "",
        message: it?.message ?? it?.reason ?? it?.error ?? "",
        reason: it?.reason ?? it?.message ?? "",
        code: it?.code ?? "",
    }));
}
/* UI helpers */
const th = {
    textAlign: "left",
    padding: "8px 6px",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    fontWeight: 600,
    whiteSpace: "nowrap",
};
const td = {
    padding: "6px",
    borderBottom: "1px solid #f0f0f0",
};
const tdNum = {
    ...td,
    textAlign: "right",
};
const sumBox = {
    border: "1px solid #eee",
    borderRadius: 8,
    padding: "10px 14px",
    minWidth: 220,
    background: "#fcfcfc",
};
const inp = (w, align = "left") => ({
    width: w,
    padding: "6px 8px",
    textAlign: align,
});
const badge = {
    border: "1px solid #bbb",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    background: "#fff",
};
const pill = {
    border: "1px solid #ccc",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    background: "#fff",
};
const num = (v) => Number(v || 0);
const fmt = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);
const esc = (s) => (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
