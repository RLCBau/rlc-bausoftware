import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import DataSheet from '../ui/DataSheet';
import { Card } from '../ui/kit';
export default function KI() {
    const cols = [
        { key: 'voce', header: 'Voce / Prompt', width: 360, editable: true },
        { key: 'conf', header: 'Conf.', width: 100, align: 'right', type: 'number', editable: true },
        { key: 'prezzoSug', header: 'Prezzo Sug.', width: 140, align: 'right', type: 'number', editable: true },
        { key: 'fonte', header: 'Fonte', width: 200, editable: true },
        { key: 'note', header: 'Note', width: 240, editable: true },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: "5. KI", children: _jsx("p", { className: "muted", children: "Suggerimenti e automazioni (dataset reale quando disponibile)." }) }), _jsx(DataSheet, { title: "Suggerimenti LV (AI)", columns: cols, rows: [], onChange: () => { } })] }));
}
