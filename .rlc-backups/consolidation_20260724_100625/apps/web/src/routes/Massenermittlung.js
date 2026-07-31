import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { Link, Outlet } from 'react-router-dom';
export default function Massenermittlung() {
    const subs = [
        { to: 'calc', label: 'Rechnerische Massen' },
        { to: 'regie', label: 'Regieberichte' },
        { to: 'ddt', label: 'Lieferscheine' },
    ];
    return (_jsxs("div", { className: "grid", children: [_jsx("h2", { style: { margin: 0 }, children: "Mengenermittlung" }), _jsx("div", { className: "row", style: { flexWrap: 'wrap', gap: 8 }, children: subs.map(s => _jsx(Link, { className: "tab", to: s.to, children: s.label }, s.to)) }), _jsx(Outlet, {})] }));
}
