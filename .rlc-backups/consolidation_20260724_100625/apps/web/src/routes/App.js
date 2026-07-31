import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
const API = import.meta.env.VITE_API_URL || 'https://api.rlcbausoftware.com';
export default function App() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    useEffect(() => {
        fetch(`${API}/projects`)
            .then(r => r.json())
            .then((p) => {
            setProjects(p);
            if (p.length)
                setProjectId(p[0].id);
        })
            .catch(e => setErr(String(e)));
    }, []);
    useEffect(() => {
        if (!projectId)
            return;
        setLoading(true);
        fetch(`${API}/projects/${projectId}/lv-items`)
            .then(r => r.json())
            .then((rows) => setItems(rows))
            .catch(e => setErr(String(e)))
            .finally(() => setLoading(false));
    }, [projectId]);
    const total = useMemo(() => items.reduce((s, r) => s + (r.quantity ?? 0) * (r.unitPrice ?? 0), 0), [items]);
    const saveQty = async (id, qty) => {
        const r = await fetch(`${API}/lv-items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: qty }),
        });
        const updated = await r.json();
        setItems(prev => prev.map(it => (it.id === id ? updated : it)));
    };
    return (_jsxs("div", { children: [_jsx("h1", { children: "RLC \u2013 Progetti & LV" }), err && _jsx("div", { className: "errbox", children: err }), _jsxs("div", { style: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }, children: [_jsx("label", { children: "Progetto:" }), _jsx("select", { value: projectId, onChange: e => setProjectId(e.target.value), children: projects.map(p => _jsxs("option", { value: p.id, children: [p.code, " \u2013 ", p.name] }, p.id)) }), loading && _jsx("span", { children: "carico\u2026" })] }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Pos." }), _jsx("th", { children: "Testo" }), _jsx("th", { children: "UM" }), _jsx("th", { children: "Prezzo" }), _jsx("th", { children: "Q.t\u00E0" }), _jsx("th", { children: "Totale" })] }) }), _jsxs("tbody", { children: [items.map(row => (_jsxs("tr", { children: [_jsx("td", { children: row.positionNumber }), _jsx("td", { children: row.shortText }), _jsx("td", { children: row.unit }), _jsx("td", { style: { textAlign: 'right' }, children: row.unitPrice.toFixed(2) }), _jsx("td", { children: _jsx("input", { type: "number", defaultValue: row.quantity, style: { width: 90 }, onBlur: async (e) => {
                                                const v = Number(e.currentTarget.value);
                                                if (Number.isFinite(v))
                                                    await saveQty(row.id, v);
                                            } }) }), _jsx("td", { style: { textAlign: 'right' }, children: (row.quantity * row.unitPrice).toFixed(2) })] }, row.id))), !items.length && !loading && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 12, textAlign: 'center', color: '#666' }, children: "Nessuna voce." }) }))] }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: 5, style: { textAlign: 'right' }, children: "Totale" }), _jsx("td", { style: { textAlign: 'right' }, children: total.toFixed(2) })] }) })] })] }));
}
