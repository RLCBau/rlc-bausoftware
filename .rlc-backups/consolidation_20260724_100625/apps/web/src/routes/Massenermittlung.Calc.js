import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getLVItem, listLVItems, updateLVItem } from '../lib/api';
function evalExpr(expr, vars) {
    const safe = expr.replace(/[a-zA-Z_\u00C0-\u017F][\w\u00C0-\u017F]*/g, m => Object.prototype.hasOwnProperty.call(vars, m) ? String(vars[m]) : '0');
    if (!/^[0-9+\-*/().\s]*$/.test(safe))
        throw new Error('Ungültig');
    // eslint-disable-next-line no-new-func
    const v = Number(new Function(`return (${safe});`)());
    return Number.isFinite(v) ? v : 0;
}
export default function Calc() {
    const { activeProject } = useOutletContext();
    const [items, setItems] = useState([]);
    const [currentId, setCurrentId] = useState(null);
    const [expr, setExpr] = useState('(laenge * breite) - aussparungen');
    const [vars, setVars] = useState({ laenge: 20, breite: 3, aussparungen: 2 });
    useEffect(() => {
        if (!activeProject)
            return;
        listLVItems(activeProject).then((list) => {
            setItems(list);
            if (list.length)
                setCurrentId(list[0].id);
        });
    }, [activeProject]);
    useEffect(() => {
        if (!currentId)
            return;
        getLVItem(currentId).then(it => {
            setExpr(it.calcExpression ?? '(laenge * breite) - aussparungen');
            try {
                setVars(it.calcVariables ? JSON.parse(it.calcVariables) : {});
            }
            catch {
                setVars({});
            }
        });
    }, [currentId]);
    const result = useMemo(() => { try {
        return evalExpr(expr, vars);
    }
    catch {
        return 0;
    } }, [expr, vars]);
    const save = async () => {
        if (!currentId)
            return;
        const payload = { calcExpression: expr, calcVariables: JSON.stringify(vars), calcResult: result, quantity: result };
        await updateLVItem(currentId, payload);
        alert('Gespeichert');
    };
    return (_jsxs("div", { className: "card grid", children: [_jsxs("div", { className: "row", children: [_jsx("label", { children: "Position" }), _jsx("select", { value: currentId ?? '', onChange: e => setCurrentId(e.target.value), style: { minWidth: 260 }, children: items.map(i => _jsxs("option", { value: i.id, children: [i.positionNumber, " \u2014 ", i.shortText] }, i.id)) }), _jsx("span", { className: "pill", children: items.length })] }), _jsx("label", { children: "Ausdruck" }), _jsx("input", { value: expr, onChange: e => setExpr(e.target.value), className: "mono" }), _jsx("div", { className: "row", children: Object.entries(vars).map(([k, v]) => (_jsxs("div", { className: "row", children: [_jsx("label", { className: "muted", style: { width: 110 }, children: k }), _jsx("input", { type: "number", value: v, onChange: e => setVars(s => ({ ...s, [k]: Number(e.target.value) })), style: { width: 120 } }), _jsx("button", { onClick: () => setVars(s => { const c = { ...s }; delete c[k]; return c; }), children: "Entfernen" })] }, k))) }), _jsxs("div", { className: "row", children: [_jsx("input", { placeholder: "neueVariable", style: { width: 160 }, id: "nv" }), _jsx("input", { placeholder: "Wert", type: "number", style: { width: 120 }, id: "vv" }), _jsx("button", { onClick: () => {
                            const nk = document.getElementById('nv').value.trim();
                            const nv = Number(document.getElementById('vv').value);
                            if (nk)
                                setVars(s => ({ ...s, [nk]: Number.isFinite(nv) ? nv : 0 }));
                        }, children: "Variable hinzuf\u00FCgen" })] }), _jsxs("div", { className: "row", children: [_jsx("div", { children: "Ergebnis:" }), _jsx("div", { className: "pill mono", children: result }), _jsx("button", { onClick: save, children: "Speichern" })] })] }));
}
