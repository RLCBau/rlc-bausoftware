import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import DataSheet from '../ui/DataSheet';
import { Card } from '../ui/kit';
export default function Hilfe() {
    const cols = [
        { key: 'modulo', header: 'Modulo', width: 200, editable: true },
        { key: 'titolo', header: 'Titolo', width: 320, editable: true },
        { key: 'link', header: 'Link', width: 360, editable: true },
        { key: 'tipo', header: 'Tipo', width: 140, editable: true }
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: "6. Info / Hilfe / Videoerkl\u00E4rung", children: _jsx("p", { className: "muted", children: "Materiale di supporto." }) }), _jsx(DataSheet, { title: "Guide / Video", columns: cols, rows: [], onChange: () => { } })] }));
}
