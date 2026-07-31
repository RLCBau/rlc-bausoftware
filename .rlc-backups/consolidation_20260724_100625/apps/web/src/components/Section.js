import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Outlet } from "react-router-dom";
/**
 * Layout:
 * - centerVisible !== false  -> 260px | 1fr | 320px   (left | center | right)
 * - centerVisible === false  -> 260px | 1fr          (left | right=children/Outlet)
 */
export default function Section({ left, right, centerVisible = true, children, style }) {
    const twoCols = centerVisible === false;
    return (_jsxs("div", { style: {
            display: "grid",
            gridTemplateColumns: twoCols ? "260px 1fr" : (right ? "260px 1fr 320px" : "260px 1fr"),
            gap: 16,
            padding: 16,
            ...style,
        }, children: [_jsx("aside", { children: left }), twoCols ? (
            // Modalità 2 colonne: il contenuto va a DESTRA
            _jsx("section", { style: { minWidth: 0 }, children: children ?? _jsx(Outlet, {}) })) : (
            // Modalità 3 colonne: centro + opzionale right
            _jsxs(_Fragment, { children: [_jsx("main", { style: { minWidth: 0 }, children: children ?? _jsx(Outlet, {}) }), right ? _jsx("aside", { children: right }) : null] }))] }));
}
