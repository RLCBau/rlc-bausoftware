import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { listProjects, listRegie, listNotes } from '../lib/api';
import { Card, Row } from '../ui/kit';
import DataSheet from '../ui/DataSheet';
export default function Mengenermittlung() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState('');
    const [regie, setRegie] = useState([]);
    const [notes, setNotes] = useState([]);
    useEffect(() => { listProjects().then(p => { setProjects(p); if (p.length)
        setProjectId(p[0].id); }); }, []);
    useEffect(() => {
        if (!projectId)
            return;
        listRegie(projectId).then(setRegie);
        listNotes(projectId).then(setNotes);
    }, [projectId]);
    const regieCols = [
        { key: 'data', header: 'Data', width: 120, editable: true },
        { key: 'descrizione', header: 'Descrizione', width: 420, editable: true },
        { key: 'ore', header: 'Ore', width: 100, align: 'right', type: 'number', editable: true },
        { key: 'costo', header: 'Costo', width: 120, align: 'right', type: 'number', editable: true }
    ];
    const noteCols = [
        { key: 'data', header: 'Data', width: 120, editable: true },
        { key: 'fornitore', header: 'Fornitore', width: 200, editable: true },
        { key: 'ddt', header: 'DDT', width: 140, editable: true },
        { key: 'materiale', header: 'Materiale', width: 240, editable: true },
        { key: 'quantita', header: 'Q.tà', width: 100, align: 'right', type: 'number', editable: true },
        { key: 'costo', header: 'Costo', width: 120, align: 'right', type: 'number', editable: true }
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: "2. Mengenermittlung", children: _jsxs(Row, { children: [_jsx("div", { className: "muted", children: "Progetto:" }), _jsx("select", { className: "input", value: projectId, onChange: e => setProjectId(e.target.value), children: projects.map(p => _jsxs("option", { value: p.id, children: [p.code, " \u2013 ", p.name] }, p.id)) }), _jsx("button", { className: "input", onClick: () => { listRegie(projectId).then(setRegie); listNotes(projectId).then(setNotes); }, children: "Aggiorna" })] }) }), _jsx(DataSheet, { title: "Regieberichte", columns: regieCols, rows: regie, onChange: setRegie }), _jsx(DataSheet, { title: "Lieferscheine", columns: noteCols, rows: notes, onChange: setNotes })] }));
}
