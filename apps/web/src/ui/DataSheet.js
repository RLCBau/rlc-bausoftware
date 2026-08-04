import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "./rlcRuntimeStyle";
import { useMemo } from "react";
function toNumber(v) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}
function getAlign(col) {
    return col.align || (col.type === "number" ? "right" : "left");
}
export default function DataSheet({ title, columns, rows, onChange, sumKeys = [], dense = false, zebra = false, rowSeparator = false, onRowClick, createEmptyRow }) {
    function updateCell(rowIndex, key, value, col) {
        const next = rows.slice();
        const row = { ...next[rowIndex] };
        if (col?.type === "number") {
            row[key] = toNumber(value);
        }
        else if (col?.type === "checkbox") {
            row[key] = Boolean(value);
        }
        else {
            row[key] = String(value ?? "");
        }
        next[rowIndex] = row;
        onChange(next);
    }
    function addRow() {
        const empty = createEmptyRow?.() ??
            Object.fromEntries(columns.map((c) => [
                c.key,
                c.type === "checkbox" ? false : c.type === "number" ? 0 : ""
            ]));
        onChange([...(rows || []), empty]);
    }
    function deleteRow(rowIndex) {
        const next = rows.slice();
        next.splice(rowIndex, 1);
        onChange(next);
    }
    const totals = useMemo(() => {
        const acc = {};
        for (const key of sumKeys) {
            acc[key] = rows.reduce((sum, row) => sum + toNumber(row[key]), 0);
        }
        return acc;
    }, [rows, sumKeys]);
    return (_jsxs("div", { className: `card ${dense ? "card--dense" : ""}`, children: [_jsx("div", { className: "card-title", children: title }), _jsx("div", { className: "toolbar", children: _jsx("button", { type: "button", className: "input", onClick: addRow, children: "+ Zeile" }) }), _jsx("div", { className: "rlc-migrated-ui-datasheet-tsx-1570", children: _jsxs("table", { className: `table ${zebra ? "table--zebra" : ""} ${rowSeparator ? "table--rowsep" : ""}`, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "rlc-migrated-ui-datasheet-tsx-1571", children: "Aktion" }), columns.map((col) => _jsx("th", { className: rlcClass(null, { width: col.width }), children: col.header }, col.key))] }) }), _jsxs("tbody", { children: [rows.map((row, rowIndex) => _jsxs("tr", { onClick: () => onRowClick?.(row, rowIndex), className: onRowClick ? "row--clickable" : "", children: [_jsx("td", { children: _jsx("button", { type: "button", className: "input danger", onClick: (e) => {
                                                    e.stopPropagation();
                                                    deleteRow(rowIndex);
                                                }, children: "L\u00F6schen" }) }), columns.map((col) => {
                                            const value = row[col.key];
                                            const align = getAlign(col);
                                            if (!col.editable) {
                                                return (_jsx("td", { className: rlcClass(null, { textAlign: align }), children: _jsx("span", { className: align === "right" ? "cell-number" : "", children: col.type === "number" ?
                                                            toNumber(value).toFixed(2) :
                                                            String(value ?? "") }) }, col.key));
                                            }
                                            if (col.type === "checkbox") {
                                                return (_jsx("td", { className: "rlc-migrated-ui-datasheet-tsx-1572", children: _jsx("input", { type: "checkbox", checked: Boolean(value), onChange: (e) => updateCell(rowIndex, col.key, e.currentTarget.checked, col), onClick: (e) => e.stopPropagation() }) }, col.key));
                                            }
                                            return (_jsx("td", { className: rlcClass(null, { textAlign: align }), children: _jsx("input", { type: "text", className: rlcClass("input", {
                                                        width: col.width ? Math.max(col.width - 20, 80) : 160,
                                                        textAlign: align
                                                    }), value: col.type === "number" ? String(value ?? 0) : String(value ?? ""), onClick: (e) => e.stopPropagation(), onChange: (e) => updateCell(rowIndex, col.key, e.currentTarget.value, col), placeholder: col.type === "number" ? "z. B. 12.50" : "" }) }, col.key));
                                        })] }, rowIndex)), sumKeys.length > 0 &&
                                    _jsxs("tr", { children: [_jsx("td", { className: "rlc-migrated-ui-datasheet-tsx-1573", children: "Summe" }), columns.map((col) => {
                                                const align = getAlign(col);
                                                return (_jsx("td", { className: rlcClass(null, { textAlign: align, fontWeight: 600 }), children: sumKeys.includes(col.key) ?
                                                        (totals[col.key] || 0).toFixed(2) :
                                                        "" }, col.key));
                                            })] })] })] }) })] }));
}
