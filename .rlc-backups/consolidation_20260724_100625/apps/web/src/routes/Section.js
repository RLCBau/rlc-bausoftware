import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { useParams, Link } from 'react-router-dom';
const titles = {
    kalkulation: 'Kalkulation',
    massenermittlung: 'Massenermittlung',
    cad: 'CAD',
    buero: 'Büro / Verwaltung',
    ki: 'KI',
    info: 'Info / Hilfe',
    buchhaltung: 'Buchhaltung'
};
export default function Section() {
    const { section } = useParams();
    const title = titles[section || ''] || 'Bereich';
    return (_jsxs("div", { style: { fontFamily: 'system-ui', padding: 24 }, children: [_jsx("h1", { children: title }), _jsxs("p", { children: ["Placeholder-Seite f\u00FCr ", _jsx("b", { children: title }), ". Hier kommen die echten Unterseiten rein."] }), _jsx(Link, { to: "/", children: "\u2190 Zur\u00FCck zum Start" })] }));
}
