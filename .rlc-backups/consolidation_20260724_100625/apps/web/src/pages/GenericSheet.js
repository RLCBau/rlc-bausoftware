import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DataSheet from "../ui/DataSheet";
import { SHEETS } from "../schemas";
import { Card, Row } from "../ui/kit";
import { exportToCsv, exportToXlsx, importFromFile } from "../utils/excel";
export default function GenericSheet() {
    const { macro, sub } = useParams();
    const key = `${macro}/${sub}`;
    const config = SHEETS[key];
    const [rows, setRows] = useState([]);
    const fileRef = useRef(null);
    if (!config)
        return _jsxs("p", { className: "muted", children: ["Foglio non configurato: ", _jsx("code", { children: key })] });
    const sumKeys = config.sum || [];
    async function onImport(e) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        const data = await importFromFile(f);
        setRows(prev => [...prev, ...data]);
        e.target.value = '';
    }
    const totals = useMemo(() => sumKeys.reduce((acc, k) => ({ ...acc, [k]: rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) }), {}), [rows, sumKeys]);
    return (_jsxs(_Fragment, { children: [_jsx(Card, { title: `${config.title}`, children: _jsxs(Row, { children: [_jsx("input", { type: "file", accept: ".xlsx,.csv", ref: fileRef, style: { display: 'none' }, onChange: onImport }), _jsx("button", { className: "input", onClick: () => fileRef.current?.click(), children: "Importa" }), _jsx("button", { className: "input", onClick: () => exportToXlsx(config.title, rows), children: "Export XLSX" }), _jsx("button", { className: "input", onClick: () => exportToCsv(config.title, rows), children: "Export CSV" }), sumKeys.length > 0 && (_jsxs("span", { className: "muted", children: ["Totali: ", sumKeys.map(k => `${k}=${(totals[k] || 0).toFixed(2)}`).join(' • ')] }))] }) }), _jsx(DataSheet, { title: config.title, columns: config.columns, rows: rows, onChange: setRows, sumKeys: sumKeys })] }));
}
