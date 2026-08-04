import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useEffect, useMemo, useState } from "react";
import { evaluateExpression } from "../../lib/formulas";
const shell = {
    maxWidth: 1480,
    margin: "0 auto",
    padding: "16px 18px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
    color: "#0f172a",
    background: "radial-gradient(circle at top left, rgba(37,99,235,0.06), transparent 30%), #f6f8fc",
    minHeight: "100%"
};
const toolbar = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap"
};
const textInput = {
    width: 260,
    border: "1px solid #d9e2f1",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 650
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    background: "#ffffff",
    borderRadius: 14,
    overflow: "hidden"
};
const thtd = {
    borderBottom: "1px solid #eef2f7",
    padding: "8px 10px",
    verticalAlign: "middle"
};
const head = {
    borderBottom: "1px solid #e5eaf3",
    padding: "8px 10px",
    verticalAlign: "middle",
    background: "#f8fafc",
    color: "#475569",
    fontWeight: 700,
    textAlign: "left"
};
const sectionBox = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    marginBottom: 14,
    overflow: "hidden"
};
const sectionHead = {
    padding: "8px 10px",
    background: "#f8fafc",
    fontWeight: 600
};
const smallBtn = {
    padding: "7px 10px",
    border: "1px solid #d7e2f0",
    background: "#ffffff",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    color: "#0f172a",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(15,23,42,0.04)"
};
const numberInput = {
    width: 110,
    border: "1px solid #d9e2f1",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 650,
    textAlign: "right"
};
const demoRows = [
    {
        id: "1",
        posNr: "100.001",
        kurztext: "[AK:K1] Graben ausheben",
        einheit: "m³",
        ep: 16,
        variablen: { L: 12, B: 0.7, H: 1.2 },
        formel: "=L*B*H",
        menge: 0,
        betrag: 0
    },
    {
        id: "2",
        posNr: "100.002",
        kurztext: "[AK:K1] Rohre verlegen",
        einheit: "m",
        ep: 24.5,
        variablen: { L: 12 },
        formel: "=L",
        menge: 0,
        betrag: 0
    },
    {
        id: "3",
        posNr: "200.100",
        kurztext: "[AK:K2] Asphaltdeckschicht",
        einheit: "m²",
        ep: 39.9,
        variablen: { L: 22, B: 3 },
        formel: "=L*B",
        menge: 0,
        betrag: 0
    }
];
const fmt = (n) => new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Number.isFinite(n) ? n : 0);
const parseNum = (v) => {
    if (typeof v === "number")
        return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").
        trim().
        replace(/\./g, "").
        replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};
const getAkKey = (row) => {
    const text = String(row.kurztext || "");
    const m = text.match(/\[AK:(.+?)\]/i);
    return (m?.[1] || "Unzugeordnet").trim();
};
const getStorageKey = (props) => {
    if (props.storageKey)
        return props.storageKey;
    const code = (props.projectCode || "").trim();
    const id = (props.projectId || "").trim();
    const suffix = code || id || "default";
    return `rlc_abrechnungskreise:${suffix}`;
};
export default function Abrechnungskreise(props) {
    const storageKey = useMemo(() => getStorageKey(props), [props.storageKey, props.projectCode, props.projectId]);
    const [filter, setFilter] = useState("");
    const [rowsState, setRowsState] = useState(() => {
        if (typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length)
                        return parsed;
                }
            }
            catch {
                // ignore
            }
        }
        return props.rows?.length ? props.rows : demoRows;
    });
    useEffect(() => {
        if (props.rows && props.rows.length) {
            setRowsState((prev) => {
                if (!prev.length || prev === demoRows)
                    return props.rows;
                return prev;
            });
        }
    }, [props.rows]);
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(rowsState));
        }
        catch {
            // ignore storage errors
        }
    }, [rowsState, storageKey]);
    const normalizedRows = useMemo(() => {
        return rowsState.map((row) => {
            const menge = evaluateExpression(row.formel || "", (row.variablen || {}));
            const ep = parseNum(row.ep);
            const betrag = menge * ep;
            return {
                ...row,
                ep,
                menge,
                betrag
            };
        });
    }, [rowsState]);
    const grouped = useMemo(() => {
        const map = new Map();
        for (const row of normalizedRows) {
            const key = getAkKey(row);
            if (!map.has(key))
                map.set(key, []);
            map.get(key).push(row);
        }
        const entries = [...map.entries()].filter(([kreis]) => kreis.toLowerCase().includes(filter.trim().toLowerCase()));
        return entries.map(([kreis, pos]) => ({
            kreis,
            pos,
            sumMenge: pos.reduce((a, b) => a + parseNum(b.menge), 0),
            sumBetrag: pos.reduce((a, b) => a + parseNum(b.betrag), 0)
        }));
    }, [normalizedRows, filter]);
    const total = useMemo(() => grouped.reduce((a, b) => a + b.sumBetrag, 0), [grouped]);
    const updateEp = (id, value) => {
        setRowsState((prev) => prev.map((row) => row.id === id ?
            {
                ...row,
                ep: parseNum(value)
            } :
            row));
    };
    const updateFormel = (id, value) => {
        setRowsState((prev) => prev.map((row) => row.id === id ?
            {
                ...row,
                formel: value
            } :
            row));
    };
    const resetToInput = () => {
        setRowsState(props.rows?.length ? props.rows : demoRows);
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1374", children: "Abrechnungskreise" }), _jsxs("div", { className: rlcClass(null, toolbar), children: [_jsx("input", { placeholder: "Filter Kreis\u2026", className: rlcClass(null, textInput), value: filter, onChange: (e) => setFilter(e.target.value) }), !props.readOnly &&
                        _jsx("button", { type: "button", className: rlcClass(null, smallBtn), onClick: resetToInput, children: "Zur\u00FCcksetzen" })] }), grouped.length === 0 ?
                _jsx("div", { className: rlcClass(null, sectionBox), children: _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1375", children: "Keine Daten gefunden." }) }) :
                null, grouped.map((g) => _jsxs("div", { className: rlcClass(null, sectionBox), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: g.kreis }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1376", children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Pos-Nr" }), _jsx("th", { className: rlcClass(null, head), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, head), children: "ME" }), _jsx("th", { className: rlcClass(null, head), children: "EP" }), _jsx("th", { className: rlcClass(null, head), children: "Formel" }), _jsx("th", { className: rlcClass(null, head), children: "Menge" }), _jsx("th", { className: rlcClass(null, head), children: "Betrag" })] }) }), _jsxs("tbody", { children: [g.pos.map((p) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: p.posNr }), _jsx("td", { className: rlcClass(null, thtd), children: p.kurztext }), _jsx("td", { className: rlcClass(null, thtd), children: p.einheit }), _jsx("td", { className: rlcClass(null, thtd), children: props.readOnly ?
                                                        fmt(parseNum(p.ep)) :
                                                        _jsx("input", { value: String(parseNum(p.ep)).replace(".", ","), onChange: (e) => updateEp(p.id, e.target.value), className: rlcClass(null, numberInput) }) }), _jsx("td", { className: rlcClass(null, thtd), children: props.readOnly ?
                                                        p.formel :
                                                        _jsx("input", { value: p.formel || "", onChange: (e) => updateFormel(p.id, e.target.value), className: rlcClass(null, { ...textInput, width: 180 }) }) }), _jsx("td", { className: rlcClass(null, thtd), children: fmt(parseNum(p.menge)) }), _jsx("td", { className: rlcClass(null, thtd), children: fmt(parseNum(p.betrag)) })] }, p.id)), _jsxs("tr", { children: [_jsx("td", { colSpan: 5, className: rlcClass(null, { ...thtd, textAlign: "right" }), children: _jsx("b", { children: "Summe Kreis" }) }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("b", { children: fmt(g.sumMenge) }) }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("b", { children: fmt(g.sumBetrag) }) })] })] })] }) })] }, g.kreis)), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-abrechnungskreise-tsx-1377", children: ["Gesamtsumme: ", fmt(total), " \u20AC"] })] }));
}
