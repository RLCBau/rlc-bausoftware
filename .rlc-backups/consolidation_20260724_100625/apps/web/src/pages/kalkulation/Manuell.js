import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/kalkulation/Manuell.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LV } from "./store.lv";
const MWST_KEY = "rlc_lv_mwst_v1";
function mapEinheit(p) {
    if (p.einheit && p.einheit.trim()) {
        const e = p.einheit.trim().toLowerCase();
        if (e === "m2" || e === "m²")
            return "m²";
        if (e === "m3" || e === "m³")
            return "m³";
        if (e === "stk" || e === "stück")
            return "Stk";
        if (e === "m")
            return "m";
        return p.einheit;
    }
    if (p.unitHint)
        return mapEinheit({ einheit: p.unitHint });
    if (p.geomType === "polygon")
        return "m²";
    if (p.geomType === "polyline" || p.geomType === "line")
        return "m";
    if (p.geomType === "point")
        return "Stk";
    const L = (p.layer || "").toLowerCase();
    if (/fläche|asphalt|pflaster|area|polygon/.test(L))
        return "m²";
    if (/leitung|trasse|kanal|rohr|line/.test(L))
        return "m";
    if (/punkt|schacht|symbol|bohrung/.test(L))
        return "Stk";
    if (/aushub|volumen|m3|m³/.test(L))
        return "m³";
    const T = `${p.kurztext || ""} ${p.posNr || ""}`.toLowerCase();
    if (/\bm²|\bm2|fläche|schicht|belag/.test(T))
        return "m²";
    if (/\bm³|\bm3|volumen|kubatur|aushub/.test(T))
        return "m³";
    if (/\bstk|stück|schacht|anschluss|hausanschluss\b/.test(T))
        return "Stk";
    if (/\bm\b|leitung|trasse|kabel|rohr/.test(T))
        return "m";
    return "m";
}
function roundForUnit(v, einheit) {
    const x = Number(v || 0);
    const e = einheit.toLowerCase();
    if (e === "stk" || e === "stück")
        return Math.round(x);
    if (e === "m³" || e === "m3")
        return Math.round(x * 1000) / 1000;
    return Math.round(x * 100) / 100;
}
function cadToLV(p) {
    const einheit = mapEinheit(p);
    return {
        id: crypto.randomUUID(),
        posNr: p.posNr ?? "",
        kurztext: p.kurztext ?? "",
        einheit,
        menge: roundForUnit(p.menge ?? 0, einheit),
        preis: typeof p.preis === "number" ? p.preis : undefined,
        confidence: typeof p.confidence === "number" ? p.confidence : undefined,
    };
}
export default function Manuell() {
    const [rows, setRows] = useState([]);
    const [mwst, setMwst] = useState(() => Number(localStorage.getItem(MWST_KEY) ?? 19));
    const fileRef = useRef(null);
    useEffect(() => {
        setRows(LV.list());
    }, []);
    useEffect(() => {
        localStorage.setItem(MWST_KEY, String(mwst || 0));
    }, [mwst]);
    const saveRow = (patch) => {
        const cur = rows.find((r) => r.id === patch.id);
        if (!cur)
            return;
        const next = { ...cur, ...patch };
        if (patch.einheit || typeof patch.menge === "number") {
            const e = (patch.einheit ?? cur.einheit) || "m";
            next.menge = roundForUnit(next.menge, e);
        }
        LV.upsert(next);
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
    const removeRow = (id) => {
        LV.remove(id);
        setRows(LV.list());
    };
    const clearAll = () => {
        if (confirm("Sicuro di cancellare tutte le righe?")) {
            LV.clear();
            setRows([]);
        }
    };
    const exportCSV = () => {
        const csv = LV.exportCSV(rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kalkulation_manuell.csv";
        a.click();
        URL.revokeObjectURL(url);
    };
    // ===== Export XLSX (SpreadsheetML .xls compatibile) =====
    const exportXLSX = () => {
        const xmlHeader = `<?xml version="1.0"?>` +
            `<?mso-application progid="Excel.Sheet"?>` +
            `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
            `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
            `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
            `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
        const sheetOpen = `<Worksheet ss:Name="Kalkulation"><Table>`;
        const headRow = `<Row>` +
            ["PosNr", "Kurztext", "Einheit", "Menge", "EP (netto)", "Confidence", "Zeilen-Netto"]
                .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
                .join("") +
            `</Row>`;
        const body = rows
            .map((r) => {
            const zeilen = (r.menge || 0) * (r.preis || 0);
            return (`<Row>` +
                `<Cell><Data ss:Type="String">${escapeXml(r.posNr || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${escapeXml(r.kurztext || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="String">${escapeXml(r.einheit || "")}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.menge)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.preis)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(r.confidence)}</Data></Cell>` +
                `<Cell><Data ss:Type="Number">${num(zeilen)}</Data></Cell>` +
                `</Row>`);
        })
            .join("");
        const summary = `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/>` +
            `<Cell/><Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>`;
        const sheetClose = `</Table></Worksheet>`;
        const xmlClose = `</Workbook>`;
        const xml = xmlHeader + sheetOpen + headRow + body + summary + sheetClose + xmlClose;
        // NB: è SpreadsheetML; molti Excel lo aprono comunque se lo chiami .xls.
        const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kalkulation_manuell.xls";
        a.click();
        URL.revokeObjectURL(url);
    };
    // ===== PDF Angebot via API =====
    const exportPDF = async () => {
        try {
            const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
            const brutto = netto * (1 + (mwst || 0) / 100);
            // ✅ Allineato con pdf.ts:
            // - mwst va in options.mwst
            // - totals include netto/brutto (e mettiamo anche mwst per compatibilità)
            const payload = {
                project: {}, // opzionale: puoi riempirlo con currentProject se vuoi
                options: {
                    mwst,
                    // city/dateISO/payment possono essere aggiunti in futuro
                },
                rows: rows.map((r) => ({
                    posNr: r.posNr,
                    text: r.kurztext,
                    einheit: r.einheit,
                    menge: r.menge,
                    preis: r.preis ?? 0,
                    zeilen: (r.menge || 0) * (r.preis || 0),
                })),
                totals: { mwst, netto, brutto },
            };
            // ✅ URL relativo: usa proxy in dev e funziona in prod
            const res = await fetch("/api/pdf/angebot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const t = await res.text().catch(() => "");
                throw new Error(`PDF Fehler (${res.status}): ${t || "request failed"}`);
            }
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
    const totals = useMemo(() => {
        const netto = rows.reduce((s, r) => s + (r.menge || 0) * (r.preis || 0), 0);
        const brutto = netto * (1 + (mwst || 0) / 100);
        return { netto, brutto };
    }, [rows, mwst]);
    // ingest da CAD (postMessage)
    useEffect(() => {
        const onMsg = (e) => {
            const d = e.data;
            if (!d || d.type !== "CAD_TO_KALKULATION")
                return;
            try {
                if (Array.isArray(d.payload)) {
                    const list = d.payload.map(cadToLV);
                    const all = [...list, ...LV.list()];
                    localStorage.setItem("rlc_lv_data_v1", JSON.stringify(all));
                }
                else {
                    const lv = cadToLV(d.payload);
                    const all = [lv, ...LV.list()];
                    localStorage.setItem("rlc_lv_data_v1", JSON.stringify(all));
                }
                setRows(LV.list());
            }
            catch {
                // ignore
            }
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);
    const handleAddFromCAD = () => {
        const raw = localStorage.getItem("cad_inbox");
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length) {
                    const list = arr.map(cadToLV);
                    const all = [...list, ...LV.list()];
                    localStorage.setItem("rlc_lv_data_v1", JSON.stringify(all));
                    localStorage.removeItem("cad_inbox");
                    setRows(LV.list());
                    return;
                }
            }
            catch {
                // ignore
            }
        }
        const pasted = prompt('Incolla JSON CAD ({posNr,kurztext,einheit?,menge,preis} o array):');
        if (!pasted)
            return;
        try {
            const data = JSON.parse(pasted);
            if (Array.isArray(data)) {
                const list = data.map(cadToLV);
                const all = [...list, ...LV.list()];
                localStorage.setItem("rlc_lv_data_v1", JSON.stringify(all));
            }
            else {
                const lv = cadToLV(data);
                const all = [lv, ...LV.list()];
                localStorage.setItem("rlc_lv_data_v1", JSON.stringify(all));
            }
            setRows(LV.list());
        }
        catch {
            alert("JSON non valido.");
        }
    };
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("h2", { children: "Kalkulation \u2013 Manuell" }), _jsxs("div", { style: {
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginBottom: 12,
                    flexWrap: "wrap",
                }, children: [_jsx("button", { onClick: addRow, children: "+ Position" }), _jsx("button", { onClick: handleAddFromCAD, children: "+ da CAD" }), _jsx("button", { onClick: exportCSV, children: "Export CSV" }), _jsx("button", { onClick: exportXLSX, children: "Export XLS" }), _jsx("button", { onClick: exportPDF, children: "PDF Angebot" }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv", style: { display: "none" }, onChange: (e) => {
                            const f = e.target.files?.[0];
                            if (!f)
                                return;
                            const r = new FileReader();
                            r.onload = () => {
                                LV.importCSV(String(r.result || ""));
                                setRows(LV.list());
                                // ✅ reset input, così puoi importare lo stesso file due volte
                                if (fileRef.current)
                                    fileRef.current.value = "";
                            };
                            r.readAsText(f, "utf-8");
                        } }), _jsx("button", { onClick: () => fileRef.current?.click(), children: "Import CSV" }), _jsxs("label", { style: { marginLeft: 24 }, children: ["MwSt %", _jsx("input", { type: "number", value: mwst, onChange: (e) => setMwst(Number(e.target.value || 0)), style: { width: 80, marginLeft: 6 } })] }), _jsx("button", { onClick: clearAll, style: { marginLeft: "auto" }, children: "Alles l\u00F6schen" })] }), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: [
                                    "Pos-Nr",
                                    "Kurztext",
                                    "Einheit",
                                    "Menge",
                                    "EP (netto)",
                                    "Confidence",
                                    "Zeilen-Netto",
                                    "",
                                ].map((h, i) => (_jsx("th", { style: th, children: h }, i))) }) }), _jsx("tbody", { children: rows.map((r) => {
                                const zeilen = (r.menge || 0) * (r.preis || 0);
                                return (_jsxs("tr", { children: [_jsx("td", { style: td, children: _jsx("input", { value: r.posNr, onChange: (e) => saveRow({ id: r.id, posNr: e.target.value }), style: inp(110) }) }), _jsx("td", { style: td, children: _jsx("input", { value: r.kurztext, onChange: (e) => saveRow({ id: r.id, kurztext: e.target.value }), style: inp(520) }) }), _jsx("td", { style: td, children: _jsx("input", { value: r.einheit, onChange: (e) => saveRow({ id: r.id, einheit: e.target.value }), onBlur: (e) => saveRow({ id: r.id, einheit: e.target.value }), style: inp(70) }) }), _jsx("td", { style: tdNum, children: _jsx("input", { type: "number", value: r.menge, onChange: (e) => saveRow({ id: r.id, menge: Number(e.target.value || 0) }), onBlur: (e) => saveRow({ id: r.id, menge: Number(e.target.value || 0) }), style: inp(100, "right") }) }), _jsx("td", { style: tdNum, children: _jsx("input", { type: "number", value: r.preis ?? 0, onChange: (e) => saveRow({ id: r.id, preis: Number(e.target.value || 0) }), style: inp(120, "right") }) }), _jsx("td", { style: tdNum, children: _jsx("input", { type: "number", value: r.confidence ?? "", onChange: (e) => saveRow({
                                                    id: r.id,
                                                    confidence: Number(e.target.value || 0),
                                                }), style: inp(110, "right") }) }), _jsx("td", { style: { ...tdNum, fontWeight: 600 }, children: fmt(zeilen) }), _jsx("td", { style: td, children: _jsx("button", { onClick: () => removeRow(r.id), children: "L\u00F6schen" }) })] }, r.id));
                            }) })] }) }), _jsxs("div", { style: {
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 24,
                    marginTop: 16,
                }, children: [_jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Netto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.netto) })] }), _jsxs("div", { style: sumBox, children: [_jsx("div", { children: "Gesamt Brutto" }), _jsx("div", { style: { fontWeight: 700 }, children: fmt(totals.brutto) })] })] })] }));
}
const th = {
    textAlign: "left",
    padding: "8px 6px",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    fontWeight: 600,
    whiteSpace: "nowrap",
};
const td = { padding: "6px", borderBottom: "1px solid #f0f0f0" };
const tdNum = { ...td, textAlign: "right" };
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
const num = (v) => Number(v || 0);
const fmt = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v || 0);
const escapeXml = (s) => (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
