import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import DataSheet from '../ui/DataSheet';
import { Card } from '../ui/kit';
export default function Buchhaltung() {
    const invCols = [
        { key: 'numero', header: 'Nr.', width: 120, editable: true },
        { key: 'data', header: 'Data', width: 120, editable: true },
        { key: 'cliente', header: 'Cliente', width: 260, editable: true },
        { key: 'imponibile', header: 'Imponibile', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'iva', header: 'IVA', width: 100, align: 'right', type: 'number', editable: true },
        { key: 'totale', header: 'Totale', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'stato', header: 'Stato', width: 140, editable: true },
    ];
    const kpiCols = [
        { key: 'kpi', header: 'KPI', width: 260, editable: true },
        { key: 'valore', header: 'Valore', width: 120, align: 'right', type: 'number', editable: true },
        { key: 'note', header: 'Note', width: 320, editable: true },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: "7. Buchhaltung", children: _jsx("p", { className: "muted", children: "Fatture, partite, export e KPI." }) }), _jsx(DataSheet, { title: "Fatture / Abschl\u00E4ge", columns: invCols, rows: [], onChange: () => { }, sumKeys: ['imponibile', 'iva', 'totale'] }), _jsx(DataSheet, { title: "KPI Dashboard", columns: kpiCols, rows: [], onChange: () => { } })] }));
}
