import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { listProjects, listLVItems, updateLVItem } from '../lib/api';
import { Card, Row } from '../ui/kit';
import DataSheet from '../ui/DataSheet';
import { exportToXlsx } from '../utils/excel';
export default function Kalkulation() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState('');
    const [lv, setLv] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const importTextRef = useRef(null);
    // list projects + default selection
    useEffect(() => {
        listProjects().then(p => { setProjects(p); if (p.length)
            setProjectId(p[0].id); })
            .catch(e => setErr(String(e)));
    }, []);
    // load LV
    useEffect(() => {
        if (!projectId)
            return;
        setLoading(true);
        listLVItems(projectId).then(setLv).catch(e => setErr(String(e))).finally(() => setLoading(false));
    }, [projectId]);
    const lvCols = [
        { key: 'positionNumber', header: 'Pos.', width: 100, editable: false },
        { key: 'shortText', header: 'Testo', width: 360, editable: false },
        { key: 'unit', header: 'UM', width: 70 },
        { key: 'unitPrice', header: 'Prezzo', width: 100, align: 'right', type: 'number' },
        { key: 'quantity', header: 'Q.tà', width: 100, align: 'right', type: 'number', editable: true },
        { key: 'totale', header: 'Totale', width: 120, align: 'right', type: 'number' }
    ];
    const lvView = useMemo(() => lv.map(r => ({ ...r, totale: (r.unitPrice || 0) * (r.quantity || 0) })), [lv]);
    const lvTotal = useMemo(() => lvView.reduce((a, r) => a + (r.totale || 0), 0), [lvView]);
    async function setQty(id, qty) {
        const updated = await updateLVItem(id, { quantity: qty });
        setLv(prev => prev.map(r => (r.id === id ? updated : r)));
    }
    async function importJsonAsLV() {
        if (!projectId || !importTextRef.current)
            return;
        const txt = importTextRef.current.value.trim();
        if (!txt)
            return;
        const items = JSON.parse(txt);
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://api.rlcbausoftware.com'}/projects/${projectId}/lv-items`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items })
        });
        if (!res.ok) {
            alert(await res.text());
            return;
        }
        listLVItems(projectId).then(setLv);
        importTextRef.current.value = '';
    }
    function exportLvNoPrices() {
        const out = lv.map(r => ({ positionNumber: r.positionNumber, shortText: r.shortText, longText: r.longText || '', unit: r.unit }));
        exportToXlsx('LV_senza_prezzi', out);
    }
    // ======= Prezzi catalogs (Materiali/Operai/Macchine) =======
    const [mat, setMat] = useState([]);
    const [man, setMan] = useState([]);
    const [mac, setMac] = useState([]);
    const priceCols = [
        { key: 'codice', header: 'Codice', width: 120, editable: true },
        { key: 'descrizione', header: 'Descrizione', width: 360, editable: true },
        { key: 'unita', header: 'UM', width: 80, editable: true },
        { key: 'prezzo', header: 'Prezzo', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'fornitore', header: 'Fornitore', width: 180, editable: true },
        { key: 'note', header: 'Note', width: 200, editable: true }
    ];
    // ======= Versioni & Analisi =======
    const [versions, setVersions] = useState([]);
    const versionCols = [
        { key: 'versione', header: 'Versione', width: 120, editable: true },
        { key: 'data', header: 'Data', width: 120, editable: true },
        { key: 'autore', header: 'Autore', width: 180, editable: true },
        { key: 'totale', header: 'Totale', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'stato', header: 'Stato', width: 140, editable: true },
        { key: 'note', header: 'Note', width: 240, editable: true }
    ];
    // ======= Nachträge (varianti) =======
    const [nach, setNach] = useState([]);
    const nachCols = [
        { key: 'numero', header: 'Nr.', width: 100, editable: true },
        { key: 'descrizione', header: 'Descrizione', width: 420, editable: true },
        { key: 'importo', header: 'Importo', width: 140, align: 'right', type: 'number', editable: true },
        { key: 'stato', header: 'Stato', width: 160, editable: true }
    ];
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { title: "1. Kalkulation", children: [_jsxs(Row, { children: [_jsx("div", { className: "muted", children: "Progetto:" }), _jsx("select", { className: "input", value: projectId, onChange: e => setProjectId(e.target.value), children: projects.map(p => _jsxs("option", { value: p.id, children: [p.code, " \u2013 ", p.name] }, p.id)) }), loading && _jsx("span", { className: "muted", children: "carico\u2026" }), _jsx("button", { className: "input", onClick: () => listLVItems(projectId).then(setLv), children: "Aggiorna LV" }), _jsx("button", { className: "input", onClick: exportLvNoPrices, children: "Esporta LV senza prezzi (XLSX)" })] }), _jsx(DataSheet, { title: "LV \u2013 Voci (edit quantit\u00E0)", columns: lvCols, rows: lvView, onChange: (rows) => {
                            const next = rows;
                            next.forEach((r, i) => {
                                const old = lv[i];
                                if (!old)
                                    return;
                                if (old.quantity !== r.quantity)
                                    setQty(old.id, Number(r.quantity || 0));
                            });
                        }, sumKeys: ['totale'], actions: _jsxs("span", { className: "muted", children: ["Totale: ", lvTotal.toFixed(2)] }) })] }), _jsxs(Card, { title: "Import LV (JSON)", children: [_jsx("p", { className: "muted", children: "Incolla JSON con array: positionNumber, shortText, longText, unit, unitPrice (facoltativo), quantity (facoltativo)." }), _jsx("textarea", { ref: importTextRef, className: "input", rows: 6, style: { width: '100%' }, placeholder: '[{"positionNumber":"001.001","shortText":"Scavo","unit":"m","unitPrice":10,"quantity":5}]' }), _jsx(Row, { children: _jsx("button", { className: "input", onClick: importJsonAsLV, children: "Importa nel progetto" }) })] }), _jsx(DataSheet, { title: "Prezzi Materiali", columns: priceCols, rows: mat, onChange: setMat, sumKeys: ['prezzo'] }), _jsx(DataSheet, { title: "Prezzi Operai", columns: priceCols, rows: man, onChange: setMan, sumKeys: ['prezzo'] }), _jsx(DataSheet, { title: "Prezzi Macchine", columns: priceCols, rows: mac, onChange: setMac, sumKeys: ['prezzo'] }), _jsx(DataSheet, { title: "Versioni & Analisi", columns: versionCols, rows: versions, onChange: setVersions, sumKeys: ['totale'] }), _jsx(DataSheet, { title: "Nachtr\u00E4ge (Varianti)", columns: nachCols, rows: nach, onChange: setNach, sumKeys: ['importo'] })] }));
}
