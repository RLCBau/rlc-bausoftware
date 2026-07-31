import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listLVItems } from '../lib/api';
export default function Angebot() {
    const { activeProject } = useOutletContext();
    const [items, setItems] = useState([]);
    useEffect(() => { if (activeProject)
        listLVItems(activeProject).then(setItems); }, [activeProject]);
    const exportCSV = () => {
        const rows = [['Pos', 'Kurztext', 'Einheit', 'Menge', 'EP', 'Summe'], ...items.map(i => [
                i.positionNumber, i.shortText, i.unit, i.quantity, i.unitPrice, (i.quantity * i.unitPrice).toFixed(2)
            ])];
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Angebot.csv';
        a.click();
    };
    return (_jsxs("div", { className: "card grid", children: [_jsx("div", { style: { fontWeight: 600 }, children: "Angebot generieren" }), _jsx("button", { onClick: exportCSV, children: "Export CSV (Excel)" }), _jsx("div", { className: "muted", children: "PDF renderer verr\u00E0 aggiunto; ora export CSV compatibile Excel." })] }));
}
