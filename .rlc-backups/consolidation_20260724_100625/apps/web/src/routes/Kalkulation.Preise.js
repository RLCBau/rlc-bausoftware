import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listLVItems, updateLVItem } from '../lib/api';
export default function Preise() {
    const { activeProject } = useOutletContext();
    const [items, setItems] = useState([]);
    useEffect(() => {
        if (!activeProject)
            return;
        listLVItems(activeProject).then(setItems);
    }, [activeProject]);
    const save = async (id, unitPrice, quantity) => {
        const u = await updateLVItem(id, { unitPrice, quantity });
        setItems(s => s.map(it => it.id === id ? u : it));
    };
    const total = (it) => (it.unitPrice * it.quantity);
    return (_jsxs("div", { className: "card", children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "Preise & Mengen" }), _jsxs("table", { className: "mono", style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { align: "left", children: "Pos" }), _jsx("th", { align: "left", children: "Text" }), _jsx("th", { children: "Einheit" }), _jsx("th", { children: "EP" }), _jsx("th", { children: "Menge" }), _jsx("th", { children: "Summe" }), _jsx("th", {})] }) }), _jsx("tbody", { children: items.map(it => (_jsxs("tr", { children: [_jsx("td", { children: it.positionNumber }), _jsx("td", { children: it.shortText }), _jsx("td", { align: "center", children: it.unit }), _jsx("td", { children: _jsx("input", { type: "number", defaultValue: it.unitPrice, onChange: e => (it.unitPrice = Number(e.target.value)), style: { width: 100 } }) }), _jsx("td", { children: _jsx("input", { type: "number", defaultValue: it.quantity, onChange: e => (it.quantity = Number(e.target.value)), style: { width: 100 } }) }), _jsx("td", { align: "right", children: total(it).toFixed(2) }), _jsx("td", { children: _jsx("button", { onClick: () => save(it.id, it.unitPrice, it.quantity), children: "Speichern" }) })] }, it.id))) })] })] }));
}
