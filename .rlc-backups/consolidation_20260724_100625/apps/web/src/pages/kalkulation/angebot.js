import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV } from "./store.lv";
import { Projects } from "./projectStore";
const MWST_KEY = "rlc_lv_mwst_v1";
const PDFOPT_KEY = "rlc_offer_pdf_options_v1";
export default function AngebotPage() {
    const navigate = useNavigate();
    // Daten
    const project = Projects.getCurrent();
    const [rows, setRows] = useState([]);
    const [opts, setOpts] = useState(() => {
        const saved = localStorage.getItem(PDFOPT_KEY);
        const mwst = Number(localStorage.getItem(MWST_KEY) ?? 19);
        return saved
            ? { ...JSON.parse(saved), mwst }
            : {
                city: "",
                dateISO: new Date().toISOString().slice(0, 10),
                payment: "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.",
                mwst,
                showWatermark: false,
                colorHeader: true,
                showTableHeader: true,
                showChapterRows: true,
            };
    });
    // Load LV
    useEffect(() => setRows(LV.list()), []);
    useEffect(() => localStorage.setItem(MWST_KEY, String(opts.mwst || 0)), [opts.mwst]);
    useEffect(() => localStorage.setItem(PDFOPT_KEY, JSON.stringify(opts)), [opts]);
    const totals = useMemo(() => {
        const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
        const brutto = netto * (1 + (opts.mwst || 0) / 100);
        return { netto, brutto };
    }, [rows, opts.mwst]);
    // Kapitel-Zwischensummen (optional)
    const withChapterRows = useMemo(() => {
        if (!opts.showChapterRows)
            return rows.map(r => ({ ...r, _chapterRow: false }));
        const out = [];
        let curKey = "";
        let curSum = 0;
        const flush = () => {
            if (!curKey)
                return;
            out.push({
                id: `chap-${curKey}-${out.length}`,
                posNr: curKey,
                kurztext: `Kapitel ${curKey} – Zwischensumme`,
                einheit: "",
                menge: 0,
                preis: undefined,
                confidence: undefined,
                _chapterRow: true,
                _chapterKey: curKey,
            });
            curSum = 0;
        };
        const getKey = (posNr) => {
            const m = String(posNr || "").match(/^(\d{2})\./);
            return m ? m[1] + "." : "";
        };
        for (const r of rows) {
            const key = getKey(r.posNr);
            if (key && key !== curKey) {
                if (curKey)
                    flush();
                curKey = key;
            }
            curSum += (r.menge || 0) * (r.preis || 0);
            out.push({ ...r, _chapterRow: false });
        }
        if (curKey)
            flush();
        return out;
    }, [rows, opts.showChapterRows]);
    // ===== Export XLSX (SpreadsheetML) =====
    const exportXLSX = () => {
        const list = rows;
        const xmlHeader = `<?xml version="1.0"?>` +
            `<?mso-application progid="Excel.Sheet"?>` +
            `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
            `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
            `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
            `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
        const sheetOpen = `<Worksheet ss:Name="Angebot"><Table>`;
        const headRow = `<Row>` +
            ["PosNr", "Kurztext", "Einheit", "Menge", "EP (netto)", "Zeilen-Netto"]
                .map(h => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("") +
            `</Row>`;
        const body = list.map(r => {
            const z = (r.menge || 0) * (r.preis || 0);
            return `<Row>` +
                `<Cell><Data ss:Type="String">${esc(r.posNr || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.kurztext || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${esc(r.einheit || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.menge)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.preis)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(z)}</Data></Cell>` +
                `</Row>`;
        }).join("");
        const foot = `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/>` +
            `<Cell><Data ss:Type="Number">${opts.mwst}</Data></Cell></Row>`;
        const xml = xmlHeader + sheetOpen + headRow + body + foot + `</Table></Worksheet></Workbook>`;
        const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "angebot.xlsx";
        a.click();
        URL.revokeObjectURL(url);
    };
    // ===== PDF (server) =====
    const exportPDF = async () => {
        try {
            const payload = {
                title: "Angebot",
                project: project ? {
                    number: project.number,
                    name: project.name,
                    client: project.client,
                    location: project.location,
                } : undefined,
                options: opts,
                rows: rows.map(r => ({
                    posNr: r.posNr,
                    text: r.kurztext,
                    einheit: r.einheit,
                    menge: r.menge,
                    preis: r.preis ?? 0,
                    zeilen: (r.menge || 0) * (r.preis || 0),
                })),
                totals,
            };
            const res = await fetch("https://api.rlcbausoftware.com/api/pdf/angebot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok)
                throw new Error("PDF Fehler");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Angebot.pdf";
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            alert("PDF Export fehlgeschlagen: " + (e?.message || e));
        }
    };
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsxs("div", { children: [_jsx("div", { style: { color: "#888", fontSize: 13 }, children: "RLC / 1. Kalkulation /" }), _jsx("h2", { style: { margin: "4px 0 12px" }, children: "Angebot generieren (PDF/Excel)" })] }), _jsx("div", { style: projBadge, children: project ? (_jsxs(_Fragment, { children: [_jsx("b", { children: project.number }), _jsxs("span", { children: ["\u2014 ", project.name] })] })) : "kein Projekt ausgewählt" })] }), _jsxs("div", { style: panel, children: [_jsxs("div", { style: { display: "flex", gap: 16, flexWrap: "wrap" }, children: [_jsxs("label", { children: ["Ort", _jsx("input", { value: opts.city || "", onChange: e => setOpts(v => ({ ...v, city: e.target.value })), style: inp(220), placeholder: "M\u00FCnchen" })] }), _jsxs("label", { children: ["Datum", _jsx("input", { type: "date", value: opts.dateISO || "", onChange: e => setOpts(v => ({ ...v, dateISO: e.target.value })), style: inp(170) })] }), _jsxs("label", { children: ["MwSt %", _jsx("input", { type: "number", value: opts.mwst, onChange: e => setOpts(v => ({ ...v, mwst: Number(e.target.value || 0) })), style: inp(90) })] })] }), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx("label", { style: { display: "block" }, children: "Zahlungsbedingungen / Notizen" }), _jsx("textarea", { value: opts.payment || "", onChange: e => setOpts(v => ({ ...v, payment: e.target.value })), rows: 3, style: { width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6 } })] }), _jsxs("div", { style: { display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }, children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: opts.showWatermark, onChange: e => setOpts(v => ({ ...v, showWatermark: e.target.checked })) }), " Watermark \u201EPowered by OpenAI\u201C"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: opts.colorHeader, onChange: e => setOpts(v => ({ ...v, colorHeader: e.target.checked })) }), " Farbiger Tabellenkopf"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: opts.showTableHeader, onChange: e => setOpts(v => ({ ...v, showTableHeader: e.target.checked })) }), " Tabellenkopf anzeigen"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: opts.showChapterRows, onChange: e => setOpts(v => ({ ...v, showChapterRows: e.target.checked })) }), " Kapitel-Zwischensummen"] })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 12 }, children: [_jsx("button", { onClick: exportPDF, style: primaryBtn, children: "PDF erzeugen" }), _jsx("button", { onClick: exportXLSX, children: "Excel (XLSX)" }), _jsx("button", { onClick: () => navigate("/kalkulation/lv-import"), children: "\u21E2 LV bearbeiten" }), _jsx("button", { onClick: () => navigate("/kalkulation/manuell"), children: "\u21E2 Kalkulation manuell" }), _jsx("button", { onClick: () => navigate("/kalkulation/mit-ki"), children: "\u21E2 Kalkulation mit KI" })] })] }), _jsx("div", { style: { marginTop: 12, overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { style: { background: "#fafafa" }, children: _jsx("tr", { children: ["PosNr", "Kurztext", "ME", "Menge", "EP (netto)", "Zeilen-Netto"].map((h, i) => _jsx("th", { style: th, children: h }, i)) }) }), _jsxs("tbody", { children: [withChapterRows.map((r, i) => {
                                    const z = (r.menge || 0) * (r.preis || 0);
                                    if (r._chapterRow) {
                                        return (_jsxs("tr", { style: { background: "#f6f9ff", fontWeight: 600 }, children: [_jsx("td", { style: td, children: r.posNr }), _jsx("td", { style: td, children: r.kurztext }), _jsx("td", { style: td }), _jsx("td", { style: tdNum }), _jsx("td", { style: tdNum }), _jsx("td", { style: { ...tdNum } })] }, `chap-${i}`));
                                    }
                                    return (_jsxs("tr", { children: [_jsx("td", { style: td, children: r.posNr }), _jsx("td", { style: td, children: r.kurztext }), _jsx("td", { style: td, children: r.einheit }), _jsx("td", { style: tdNum, children: fmtNum(r.menge) }), _jsx("td", { style: tdNum, children: fmtNum(r.preis) }), _jsx("td", { style: { ...tdNum, fontWeight: 600 }, children: fmt(z) })] }, r.id));
                                }), rows.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 12, color: "#777" }, children: "Kein LV vorhanden." }) }))] })] }) }), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 14 }, children: [_jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Netto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.netto) })] }), _jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Brutto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.brutto) })] })] })] }));
}
/* ---- UI helpers ---- */
const th = { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "6px", borderBottom: "1px solid #f5f5f5" };
const tdNum = { ...td, textAlign: "right" };
const inp = (w) => ({ width: w, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6 });
const panel = { border: "1px solid #eee", borderRadius: 10, background: "#fff", padding: 14 };
const projBadge = { border: "1px solid #eee", borderRadius: 999, padding: "6px 12px", background: "#fafafa", display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" };
const sumBox = { border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", minWidth: 220, background: "#fcfcfc" };
const primaryBtn = { fontWeight: 700, border: "1px solid #2b7", background: "#eafff4", padding: "6px 10px", borderRadius: 6 };
const num = (v) => Number(v || 0);
const fmt = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);
const fmtNum = (v) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(v || 0));
const esc = (s) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
