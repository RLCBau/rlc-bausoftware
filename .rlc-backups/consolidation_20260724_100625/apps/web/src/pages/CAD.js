import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import DataSheet from '../ui/DataSheet';
import { Card } from '../ui/kit';
export default function CAD() {
    const layerCols = [
        { key: 'layer', header: 'Layer', width: 160, editable: true },
        { key: 'descrizione', header: 'Descrizione', width: 320, editable: true },
        { key: 'colore', header: 'Colore', width: 120, editable: true },
        { key: 'spessore', header: 'Spessore', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'visibile', header: 'Visibile', width: 120, editable: true },
    ];
    const asBuiltCols = [
        { key: 'elemento', header: 'Elemento', width: 240, editable: true },
        { key: 'coordinata', header: 'Coordinate', width: 220, editable: true },
        { key: 'quota', header: 'Quota', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'note', header: 'Note', width: 260, editable: true },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: "3. CAD", children: _jsx("p", { className: "muted", children: "Strumenti CAD con esportazioni/import." }) }), _jsx(DataSheet, { title: "Layer / Struttura IFC", columns: layerCols, rows: [], onChange: () => { } }), _jsx(DataSheet, { title: "As-Built (rilievo)", columns: asBuiltCols, rows: [], onChange: () => { } })] }));
}
