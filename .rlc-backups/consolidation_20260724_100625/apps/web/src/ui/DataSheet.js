import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
export default function DataSheet({ title, columns, rows, onChange, sumKeys = [], dense = false, zebra = false, rowSeparator = false, onRowClick, }) {
    function toNumber(v) {
        const n = Number(String(v ?? "").replace(",", "."));
        return Number.isFinite(n) ? n : 0;
    }
    function updateCell(i, key, value, col) {
        const next = rows.slice();
        if (col?.type === "number")
            next[i][key] = toNumber(value);
        else if (col?.type === "checkbox")
            next[i][key] = Boolean(value);
        else
            next[i][key] = value;
        onChange(next);
    }
    function addRow() { onChange([...(rows || []), {}]); }
    function deleteRow(i) {
        const next = rows.slice();
        next.splice(i, 1);
        onChange(next);
    }
    const totals = useMemo(() => {
        const acc = {};
        sumKeys.forEach(k => (acc[k] = rows.reduce((a, r) => a + (toNumber(r[k]) || 0), 0)));
        return acc;
    }, [rows, sumKeys]);
    return (_jsxs("div", { className: `card ${dense ? "card--dense" : ""}`, children: [_jsx("div", { className: "card-title", children: title }), _jsx("div", { className: "toolbar", children: _jsx("button", { className: "input", onClick: addRow, children: "+ Zeile" }) }), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { className: `table ${zebra ? "table--zebra" : ""} ${rowSeparator ? "table--rowsep" : ""}`, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: 60 }, children: "Aktion" }), columns.map(c => (_jsx("th", { style: { width: c.width }, children: c.header }, c.key)))] }) }), _jsxs("tbody", { children: [rows.map((r, i) => (_jsxs("tr", { onClick: () => onRowClick?.(r, i), className: onRowClick ? "row--clickable" : "", children: [_jsx("td", { children: _jsx("button", { className: "input danger", onClick: (e) => { e.stopPropagation(); deleteRow(i); }, children: "L\u00F6schen" }) }), columns.map(c => {
                                            const v = r[c.key];
                                            const align = c.align || (c.type === "number" ? "right" : "left");
                                            if (!c.editable) {
                                                return (_jsx("td", { style: { textAlign: align }, children: _jsx("span", { className: align === "right" ? "cell-number" : "", children: c.type === "number" ? toNumber(v).toFixed(2) : String(v ?? "") }) }, c.key));
                                            }
                                            if (c.type === "checkbox") {
                                                return (_jsx("td", { style: { textAlign: "center" }, children: _jsx("input", { type: "checkbox", checked: Boolean(v), onChange: (e) => updateCell(i, c.key, e.currentTarget.checked, c) }) }, c.key));
                                            }
                                            return (_jsx("td", { style: { textAlign: align }, children: _jsx("input", { style: { width: c.width ? c.width - 20 : 160, textAlign: align }, defaultValue: v ?? "", onBlur: (e) => updateCell(i, c.key, e.currentTarget.value, c), type: "text", placeholder: c.type === "number" ? "z.B. 1*3+2" : "" }) }, c.key));
                                        })] }, i))), sumKeys.length > 0 && (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600 }, children: "Summe" }), columns.map(c => (_jsx("td", { style: { textAlign: (c.align || (c.type === "number" ? "right" : "left")), fontWeight: 600 }, children: sumKeys.includes(c.key) ? (totals[c.key] || 0).toFixed(2) : "" }, c.key)))] }))] })] }) })] }));
}
