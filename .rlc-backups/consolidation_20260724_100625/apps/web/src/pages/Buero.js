import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import DataSheet from '../ui/DataSheet';
import { Card } from '../ui/kit';
export default function Buero() {
    const docCols = [
        { key: 'numero', header: 'Nr.', width: 120, editable: true },
        { key: 'titolo', header: 'Titolo', width: 320, editable: true },
        { key: 'versione', header: 'Ver.', width: 80, editable: true },
        { key: 'stato', header: 'Stato', width: 140, editable: true },
        { key: 'link', header: 'Link', width: 240, editable: true },
    ];
    const taskCols = [
        { key: 'data', header: 'Data', width: 120, editable: true },
        { key: 'assegnato', header: 'Assegnato a', width: 220, editable: true },
        { key: 'descrizione', header: 'Descrizione', width: 420, editable: true },
        { key: 'stato', header: 'Stato', width: 140, editable: true },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: "4. B\u00FCro / Verwaltung", children: _jsx("p", { className: "muted", children: "Documenti, note, persone." }) }), _jsx(DataSheet, { title: "Documenti (versioning)", columns: docCols, rows: [], onChange: () => { } }), _jsx(DataSheet, { title: "Attivit\u00E0 / Note", columns: taskCols, rows: [], onChange: () => { } })] }));
}
