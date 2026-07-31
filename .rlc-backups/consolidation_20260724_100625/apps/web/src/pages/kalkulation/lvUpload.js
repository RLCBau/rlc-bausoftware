import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
// === UI styles (semplici) ===
const shell = { maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" };
const toolbar = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left" };
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px" };
const STORAGE_KEY = (proj) => `rlc_lvupload_${proj || "default"}`;
const LV_STORE_KEY = "rlc_lv_data_v1"; // stesso della Manuell
export default function LVUpload() {
    const [rows, setRows] = useState([]);
    const [projekt, setProjekt] = useState(() => localStorage.getItem("rlc_lvupload_current") || "PROJ-ANG-001");
    const [mwst, setMwst] = useState(() => Number(localStorage.getItem("rlc_lvupload_mwst")) || 19);
    const fileRef = useRef(null);
    // load per progetto
    useEffect(() => {
        localStorage.setItem("rlc_lvupload_current", projekt);
        try {
            const raw = localStorage.getItem(STORAGE_KEY(projekt));
            setRows(raw ? JSON.parse(raw) : []);
        }
        catch {
            setRows([]);
        }
    }, [projekt]);
    // autosave
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY(projekt), JSON.stringify(rows));
    }, [rows, projekt]);
    useEffect(() => localStorage.setItem("rlc_lvupload_mwst", String(mwst)), [mwst]);
    // ===== helpers =====
    const safeNumber = (v) => {
        if (v == null || v === "")
            return 0;
        const s = String(v).trim().replace(/\./g, "").replace(",", ".");
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };
    // valuta formula semplice (solo numeri + operatori)
    const evalFormula = (expr) => {
        if (!expr)
            return 0;
        const s = expr.replace(/,/g, ".").replace(/\s+/g, "");
        if (!/^[0-9+\-*/().]*$/.test(s))
            return 0; // sicurezza
        try {
            // eslint-disable-next-line no-new-func
            const value = Function(`"use strict"; return (${s});`)();
            return Number.isFinite(value) ? Number(value) : 0;
        }
        catch {
            return 0;
        }
    };
    const parsedRows = useMemo(() => {
        return rows.map(r => {
            const menge = evalFormula(r.menge);
            const einheit = mapEinheit(r.einheit, r.kurztext);
            const zeile = roundForUnit(menge, einheit) * (safeNumber(r.ep) || 0);
            return { ...r, _mengeNum: roundForUnit(menge, einheit), _einheitNorm: einheit, _zeilenpreis: zeile };
        });
    }, [rows]);
    const totals = useMemo(() => {
        const netto = parsedRows.reduce((s, r) => s + (r._zeilenpreis || 0), 0);
        const brutto = netto * (1 + (mwst || 0) / 100);
        return { netto, brutto };
    }, [parsedRows, mwst]);
    // ===== import/export =====
    const importCsv = (f) => {
        const r = new FileReader();
        r.onload = () => {
            const text = String(r.result || "");
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (!lines.length)
                return;
            // trova header
            const header = lines[0].split(";").map(s => s.replace(/^"|"$/g, "").trim().toLowerCase());
            const iPos = header.findIndex(h => /position|pos[-\s]?nr/.test(h));
            const iKurz = header.findIndex(h => /kurztext|text|bezeichnung/.test(h));
            const iEin = header.findIndex(h => /einheit|me|unit/.test(h));
            const iMenge = header.findIndex(h => /menge|formel|qty/.test(h));
            const iEp = header.findIndex(h => /ep|einzelpreis|preis/.test(h));
            const body = (iPos >= 0 && iKurz >= 0 && iEin >= 0 && iMenge >= 0 && iEp >= 0 ? lines.slice(1) : lines).map(l => l.split(";").map(s => s.replace(/^"|"$/g, "")));
            const arr = body.map(c => ({
                position: c[iPos >= 0 ? iPos : 0] || "",
                kurztext: c[iKurz >= 0 ? iKurz : 1] || "",
                einheit: c[iEin >= 0 ? iEin : 2] || "m",
                menge: c[iMenge >= 0 ? iMenge : 3] || "0",
                ep: safeNumber(c[iEp >= 0 ? iEp : 4] || 0),
            }));
            setRows(arr);
        };
        r.readAsText(f, "utf-8");
    };
    const exportCsv = () => {
        const hdr = "Position;Kurztext;Einheit;Menge(Formula);EP;Zeilenpreis\n";
        const body = parsedRows.map((r) => [r.position, jsonCell(r.kurztext), r._einheitNorm, r.menge, fix(r.ep), fix(r._zeilenpreis)].join(";")).join("\n");
        download(hdr + body, `LV_${projekt}.csv`);
    };
    const exportXlsx = () => {
        const xmlHeader = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
            `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
            `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
            `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
            `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
        const sheetOpen = `<Worksheet ss:Name="LV"><Table>`;
        const headRow = `<Row>` + ["Position", "Kurztext", "Einheit", "Menge", "EP", "Zeilenpreis"]
            .map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("") + `</Row>`;
        const body = parsedRows.map((r) => `<Row>` +
            `<Cell><Data ss:Type="String">${escapeXml(r.position)}</Data></Cell>` +
            `<Cell><Data ss:Type="String">${escapeXml(r.kurztext)}</Data></Cell>` +
            `<Cell><Data ss:Type="String">${escapeXml(r._einheitNorm)}</Data></Cell>` +
            `<Cell><Data ss:Type="Number">${num(r._mengeNum)}</Data></Cell>` +
            `<Cell><Data ss:Type="Number">${num(r.ep)}</Data></Cell>` +
            `<Cell><Data ss:Type="Number">${num(r._zeilenpreis)}</Data></Cell>` +
            `</Row>`).join("");
        const foot = `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/>` +
            `<Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>`;
        const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
        const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
        downloadBlob(blob, `LV_${projekt}.xlsx`);
    };
    // bulk paste da clipboard/Excel (prompt)
    const pasteBulk = () => {
        const t = prompt("Incolla righe (CSV con ; — header facoltativo):");
        if (!t)
            return;
        try {
            const fake = new File([t], "paste.csv", { type: "text/csv" });
            importCsv(fake);
        }
        catch { }
    };
    // auto pos numbering es. 01.0001 …
    const autoNumber = () => {
        let kap = "01";
        let n = 1;
        const pad = (x, len) => String(x).padStart(len, "0");
        const out = rows.map(r => {
            const pos = r.position?.trim();
            const next = pos ? pos : `${kap}.${pad(n, 4)}`;
            n++;
            return { ...r, position: next };
        });
        setRows(out);
    };
    // invia a Kalkulation Manuell
    const sendToManuell = () => {
        const existing = (() => {
            try {
                return JSON.parse(localStorage.getItem(LV_STORE_KEY) || "[]");
            }
            catch {
                return [];
            }
        })();
        const mapped = parsedRows.map((r) => ({
            id: crypto.randomUUID(),
            posNr: r.position || "",
            kurztext: r.kurztext || "",
            einheit: r._einheitNorm || "m",
            menge: r._mengeNum || 0,
            preis: r.ep || 0,
            confidence: undefined
        }));
        localStorage.setItem(LV_STORE_KEY, JSON.stringify([...mapped, ...existing]));
        // naviga
        try {
            window.router?.navigate?.("/kalkulation/manuell");
        }
        catch { }
        // fallback
        window.location.href = "/kalkulation/manuell";
    };
    // ===== CRUD =====
    const add = () => setRows(p => [...p, { position: "", kurztext: "", einheit: "m", menge: "0", ep: 0 }]);
    const upd = (i, patch) => setRows(p => p.map((x, idx) => idx === i ? { ...x, ...patch } : x));
    const del = (i) => setRows(p => p.filter((_, idx) => idx !== i));
    const clear = () => { if (confirm("Sicuro di cancellare tutto?"))
        setRows([]); };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "LV hochladen / erstellen" }), _jsxs("div", { style: toolbar, children: [_jsxs("label", { children: ["Projekt:", _jsx("input", { style: { ...input, width: 220, marginLeft: 6 }, value: projekt, onChange: e => setProjekt(e.target.value) })] }), _jsxs("label", { style: btn, children: ["CSV Import", _jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", onChange: e => { const f = e.target.files?.[0]; if (f)
                                    importCsv(f); if (fileRef.current)
                                    fileRef.current.value = ""; }, style: { display: "none" } })] }), _jsx("button", { style: btn, onClick: pasteBulk, children: "Incolla righe" }), _jsx("button", { style: btn, onClick: exportCsv, children: "CSV Export" }), _jsx("button", { style: btn, onClick: exportXlsx, children: "XLSX Export" }), _jsx("button", { style: btn, onClick: add, children: "+ Zeile" }), _jsx("button", { style: btn, onClick: autoNumber, children: "Auto-Position" }), _jsx("button", { style: { ...btn, color: "#b91c1c" }, onClick: clear, children: "Alles l\u00F6schen" }), _jsxs("label", { style: { marginLeft: 16 }, children: ["MwSt %", _jsx("input", { type: "number", style: { ...input, width: 80, marginLeft: 6 }, value: mwst, onChange: e => setMwst(Number(e.target.value || 0)) })] }), _jsx("button", { style: { ...btn, marginLeft: "auto", background: "#0ea5e9", color: "#fff", borderColor: "#0284c7" }, onClick: sendToManuell, children: "\u2192 In \u201CKalkulation manuell\u201D" })] }), _jsx("div", { style: { overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Position" }), _jsx("th", { style: head, children: "Kurztext" }), _jsx("th", { style: head, children: "ME" }), _jsx("th", { style: head, children: "Menge (Formel)" }), _jsx("th", { style: head, children: "EP (netto)" }), _jsx("th", { style: head, children: "Menge (calc.)" }), _jsx("th", { style: head, children: "Zeilenpreis" }), _jsx("th", { style: head, children: "Aktion" })] }) }), _jsxs("tbody", { children: [parsedRows.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: _jsx("input", { style: input, value: r.position, onChange: e => upd(i, { position: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, value: r.kurztext, onChange: e => upd(i, { kurztext: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, value: r.einheit, onChange: e => upd(i, { einheit: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, value: rows[i].menge, onChange: e => upd(i, { menge: e.target.value }), placeholder: "es. 12*3+5/2" }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, type: "number", step: "0.01", value: rows[i].ep, onChange: e => upd(i, { ep: Number(e.target.value) }) }) }), _jsx("td", { style: thtd, children: fmtQty(r._mengeNum, r._einheitNorm) }), _jsx("td", { style: thtd, children: fmt(r._zeilenpreis) }), _jsx("td", { style: thtd, children: _jsx("button", { style: { ...btn, color: "#b91c1c" }, onClick: () => del(i), children: "L\u00F6schen" }) })] }, i))), parsedRows.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, style: { ...thtd, textAlign: "center", color: "#64748b" }, children: "Noch keine Zeilen." }) }))] })] }) }), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 16 }, children: [_jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Netto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.netto) })] }), _jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Brutto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.brutto) })] })] })] }));
}
/* === Helpers === */
const sumBox = { border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", minWidth: 220, background: "#fcfcfc" };
function download(text, name) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, name);
}
function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
const escapeXml = (s) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonCell = (s) => JSON.stringify(s ?? "");
const fix = (v) => (Number(v) || 0).toString().replace(".", ",");
const num = (v) => Number(v || 0);
const fmt = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);
function mapEinheit(einheit, text) {
    const e = (einheit || "").trim().toLowerCase();
    if (e === "m2" || e === "m²")
        return "m²";
    if (e === "m3" || e === "m³")
        return "m³";
    if (e === "stk" || e === "stück")
        return "Stk";
    if (e === "m")
        return "m";
    const t = (text || "").toLowerCase();
    if (/\bm²|\bm2|fläche|belag|schicht/.test(t))
        return "m²";
    if (/\bm³|\bm3|kubatur|aushub|volumen/.test(t))
        return "m³";
    if (/\bstk|stück|schacht|anschluss\b/.test(t))
        return "Stk";
    return "m";
}
function roundForUnit(v, einheit) {
    const e = (einheit || "").toLowerCase();
    if (e === "stk" || e === "stück")
        return Math.round(v);
    if (e === "m³" || e === "m3")
        return Math.round(v * 1000) / 1000;
    return Math.round(v * 100) / 100;
}
function fmtQty(v, e) {
    const dec = (e.toLowerCase() === "stk" || e.toLowerCase() === "stück") ? 0 : (e.toLowerCase() === "m³" || e.toLowerCase() === "m3") ? 3 : 2;
    return `${v.toFixed(dec)} ${e}`;
}
