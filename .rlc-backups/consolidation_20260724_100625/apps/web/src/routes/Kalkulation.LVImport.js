import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createLVItems } from '../lib/api';
export default function LVImport() {
    const { activeProject } = useOutletContext();
    const [text, setText] = useState('001.001;Speedpipe;Liefern & Verlegen;m;24.5\n001.002;Asphalt;Deckschicht;m²;39.9');
    const [count, setCount] = useState(null);
    const parse = (raw) => raw
        .split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        .map(line => {
        const [positionNumber, shortText, longText, unit, unitPrice] = line.split(';');
        return { positionNumber, shortText, longText, unit, unitPrice: Number(unitPrice) };
    });
    const send = async () => {
        if (!activeProject)
            return alert('Projekt wählen');
        const rows = parse(text);
        const res = await createLVItems(activeProject, rows);
        setCount(res.created ?? 0);
    };
    return (_jsxs("div", { className: "card grid", children: [_jsx("div", { style: { fontWeight: 600 }, children: "LV Import (CSV; sep=;)" }), _jsx("textarea", { rows: 8, value: text, onChange: e => setText(e.target.value), className: "mono" }), _jsxs("div", { className: "row", children: [_jsx("button", { onClick: send, children: "Importieren" }), count !== null && _jsxs("span", { className: "pill", children: [count, " Positionen erstellt"] })] }), _jsx("div", { className: "muted", children: "Format: Positionsnummer;Kurztext;Langtext;Einheit;EP" })] }));
}
