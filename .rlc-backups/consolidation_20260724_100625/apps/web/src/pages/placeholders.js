import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/placeholders.tsx
import React, { useMemo, useState } from "react";
import { evalExpression } from "../utils/formulas";
export function makeSheetPage(title) {
    return function SheetPage() {
        const [rows, setRows] = useState(Array.from({ length: 8 }).map((_, i) => ({
            id: i + 1,
            bezeichnung: "",
            wert: "",
        })));
        const exportCsv = () => {
            const header = "Pos;Bezeichnung;Wert\n";
            const body = rows.map(r => `${r.id};${r.bezeichnung};${r.wert}`).join("\n");
            const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title.replace(/\s+/g, "_")}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        };
        return (_jsxs("div", { className: "page", children: [_jsxs("div", { className: "page-head", children: [_jsx("h1", { children: title }), _jsxs("div", { className: "page-actions", children: [_jsx("button", { onClick: () => setRows(r => [...r, { id: r.length + 1, bezeichnung: "", wert: "" }]), children: "Zeile +" }), _jsx("button", { onClick: exportCsv, children: "CSV Export" })] })] }), _jsxs("table", { className: "sheet", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: 70 }, children: "Pos" }), _jsx("th", { children: "Bezeichnung" }), _jsx("th", { style: { width: 200 }, children: "Wert" })] }) }), _jsx("tbody", { children: rows.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { className: "muted", children: r.id }), _jsx("td", { children: _jsx("input", { value: r.bezeichnung, onChange: (e) => {
                                                const v = e.target.value;
                                                setRows(prev => prev.map((x, idx) => idx === i ? { ...x, bezeichnung: v } : x));
                                            }, placeholder: "Text\u2026" }) }), _jsx("td", { children: _jsx("input", { value: r.wert, onChange: (e) => {
                                                const v = e.target.value;
                                                setRows(prev => prev.map((x, idx) => idx === i ? { ...x, wert: v } : x));
                                            }, placeholder: "Wert / Formel (z.B. 1*3)" }) })] }, r.id))) })] })] }));
    };
}
export function AufmassEditorPage() {
    const [rows, setRows] = useState(Array.from({ length: 12 }).map((_, i) => ({
        id: i + 1,
        kurztext: "",
        einheit: "",
        formel: "",
    })));
    const summe = useMemo(() => rows.reduce((acc, r) => acc + evalExpression(r.formel), 0), [rows]);
    return (_jsxs("div", { className: "page", children: [_jsxs("div", { className: "page-head", children: [_jsx("h1", { children: "Aufma\u00DFeditor (Excel)" }), _jsx("div", { className: "page-actions", children: _jsx("button", { onClick: () => setRows(r => [...r, { id: r.length + 1, kurztext: "", einheit: "", formel: "" }]), children: "Zeile +" }) })] }), _jsxs("table", { className: "sheet", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: 70 }, children: "Pos" }), _jsx("th", { children: "Kurztext" }), _jsx("th", { style: { width: 120 }, children: "Einheit" }), _jsx("th", { style: { width: 220 }, children: "Formel (z.B. 2*(3+1))" }), _jsx("th", { style: { width: 150 }, children: "Ergebnis" })] }) }), _jsxs("tbody", { children: [rows.map((r, i) => {
                                const res = evalExpression(r.formel);
                                return (_jsxs("tr", { children: [_jsx("td", { className: "muted", children: r.id }), _jsx("td", { children: _jsx("input", { value: r.kurztext, onChange: (e) => {
                                                    const v = e.target.value;
                                                    setRows(prev => prev.map((x, idx) => idx === i ? { ...x, kurztext: v } : x));
                                                }, placeholder: "Bezeichnung\u2026" }) }), _jsx("td", { children: _jsx("input", { value: r.einheit, onChange: (e) => {
                                                    const v = e.target.value;
                                                    setRows(prev => prev.map((x, idx) => idx === i ? { ...x, einheit: v } : x));
                                                }, placeholder: "m, m\u00B2, h\u2026" }) }), _jsx("td", { children: _jsx("input", { value: r.formel, onChange: (e) => {
                                                    const v = e.target.value;
                                                    setRows(prev => prev.map((x, idx) => idx === i ? { ...x, formel: v } : x));
                                                }, placeholder: "Formel\u2026" }) }), _jsx("td", { className: "number", children: res.toLocaleString() })] }, r.id));
                            }), _jsxs("tr", { className: "sheet-footer", children: [_jsx("td", { colSpan: 4, className: "align-right", children: _jsx("b", { children: "Summe" }) }), _jsx("td", { className: "number", children: _jsx("b", { children: summe.toLocaleString() }) })] })] })] })] }));
}
