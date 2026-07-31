import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createNote, listNotes, listLVItems } from '../lib/api';
export default function DDT() {
    const { activeProject } = useOutletContext();
    const [rows, setRows] = useState([]);
    const [lv, setLv] = useState([]);
    const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10) });
    useEffect(() => {
        if (!activeProject)
            return;
        listNotes(activeProject).then(setRows);
        listLVItems(activeProject).then(setLv);
    }, [activeProject]);
    const submit = async () => {
        if (!activeProject)
            return;
        const row = await createNote(activeProject, form);
        setRows(s => [row, ...s]);
    };
    return (_jsxs("div", { className: "card grid", children: [_jsx("div", { style: { fontWeight: 600 }, children: "Lieferscheine" }), _jsxs("div", { className: "row", children: [_jsx("input", { type: "date", value: form.date, onChange: e => setForm({ ...form, date: e.target.value }) }), _jsx("input", { placeholder: "Lieferant", onChange: e => setForm({ ...form, supplier: e.target.value }) }), _jsx("input", { placeholder: "Material", onChange: e => setForm({ ...form, material: e.target.value }) }), _jsx("input", { type: "number", placeholder: "Menge", onChange: e => setForm({ ...form, quantity: Number(e.target.value) }), style: { width: 120 } }), _jsx("input", { placeholder: "Einheit", onChange: e => setForm({ ...form, unit: e.target.value }), style: { width: 100 } }), _jsx("input", { placeholder: "Lieferscheinnummer", onChange: e => setForm({ ...form, documentNo: e.target.value }) })] }), _jsxs("div", { className: "row", children: [_jsxs("select", { onChange: e => setForm({ ...form, lvItemId: e.target.value || null }), defaultValue: "", children: [_jsx("option", { value: "", children: "(ohne LV-Verkn\u00FCpfung)" }), lv.map(i => _jsxs("option", { value: i.id, children: [i.positionNumber, " \u2014 ", i.shortText] }, i.id))] }), _jsx("button", { onClick: submit, children: "Hinzuf\u00FCgen" })] }), _jsxs("table", { className: "mono", style: { width: '100%', marginTop: 8 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Datum" }), _jsx("th", { children: "Lieferant" }), _jsx("th", { children: "Material" }), _jsx("th", { children: "Menge" }), _jsx("th", { children: "Einheit" }), _jsx("th", { children: "LS-Nr" }), _jsx("th", { children: "LV" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { children: [_jsx("td", { children: String(r.date).slice(0, 10) }), _jsx("td", { children: r.supplier }), _jsx("td", { children: r.material }), _jsx("td", { children: r.quantity }), _jsx("td", { children: r.unit }), _jsx("td", { children: r.documentNo ?? '' }), _jsx("td", { children: lv.find(i => i.id === r.lvItemId)?.positionNumber ?? '' })] }, r.id))) })] })] }));
}
