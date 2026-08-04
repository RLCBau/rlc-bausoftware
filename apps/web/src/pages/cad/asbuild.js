import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useMemo } from "react";
import { loadDoc } from "../../lib/cad/store";
const shell = {
    maxWidth: 980,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter, system-ui, Arial",
    color: "#0f172a"
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13
};
const thtd = {
    border: "1px solid #e2e8f0",
    padding: "8px 10px",
    verticalAlign: "middle"
};
const head = {
    ...thtd,
    background: "#f8fafc",
    fontWeight: 600,
    textAlign: "left"
};
function normLayerName(v) {
    return String(v || "").trim().toLowerCase();
}
function isVec2(v) {
    if (!v || typeof v !== "object")
        return false;
    const x = v;
    return typeof x.x === "number" && typeof x.y === "number";
}
function isLineEntity(e) {
    if (!e || typeof e !== "object")
        return false;
    const x = e;
    return x.type === "line" && isVec2(x.a) && isVec2(x.b);
}
function isPolylineEntity(e) {
    if (!e || typeof e !== "object")
        return false;
    const x = e;
    return (x.type === "polyline" &&
        Array.isArray(x.points) &&
        x.points.every(isVec2));
}
function isLinearEntity(e) {
    return isLineEntity(e) || isPolylineEntity(e);
}
function entityLength(e) {
    if (e.type === "line") {
        return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    }
    const pts = Array.isArray(e.points) ? e.points : [];
    if (pts.length < 2)
        return 0;
    let sum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        sum += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
    if (e.closed && pts.length >= 3) {
        const first = pts[0];
        const last = pts[pts.length - 1];
        sum += Math.hypot(first.x - last.x, first.y - last.y);
    }
    return sum;
}
export default function AsBuilt() {
    const rawDoc = loadDoc();
    const res = useMemo(() => {
        const doc = rawDoc && typeof rawDoc === "object" ? rawDoc : {};
        const layers = Array.isArray(doc.layers) ? doc.layers : [];
        const entities = Array.isArray(doc.entities) ?
            doc.entities :
            [];
        const layerNameById = new Map();
        for (const l of layers) {
            layerNameById.set(String(l.id), normLayerName(l.name));
        }
        const soll = entities.filter((e) => layerNameById.get(String(e.layerId || "")) === "0");
        const ist = entities.filter((e) => layerNameById.get(String(e.layerId || "")) === "bestand");
        const linearSoll = soll.filter(isLinearEntity);
        const linearIst = ist.filter(isLinearEntity);
        const sumSoll = linearSoll.reduce((acc, e) => acc + entityLength(e), 0);
        const sumIst = linearIst.reduce((acc, e) => acc + entityLength(e), 0);
        return {
            sumSoll,
            sumIst,
            delta: sumIst - sumSoll,
            sollCount: soll.length,
            istCount: ist.length,
            linearSollCount: linearSoll.length,
            linearIstCount: linearIst.length
        };
    }, [rawDoc]);
    const fmt = (n) => new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: 2
    }).format(n || 0);
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { className: "rlc-migrated-pages-cad-asbuild-tsx-750", children: "As-Built \u2013 Soll/Ist Vergleich" }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Kennzahl" }), _jsx("th", { className: rlcClass(null, head), children: "Wert" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Soll-Layer (\u201E0\u201C)" }), _jsxs("td", { className: rlcClass(null, thtd), children: [res.sollCount, " Elemente"] })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Ist-Layer (\u201EBestand\u201C)" }), _jsxs("td", { className: rlcClass(null, thtd), children: [res.istCount, " Elemente"] })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Lineare Soll-Elemente" }), _jsx("td", { className: rlcClass(null, thtd), children: res.linearSollCount })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Lineare Ist-Elemente" }), _jsx("td", { className: rlcClass(null, thtd), children: res.linearIstCount })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Soll gesamt" }), _jsxs("td", { className: rlcClass(null, thtd), children: [fmt(res.sumSoll), " m"] })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Ist gesamt" }), _jsxs("td", { className: rlcClass(null, thtd), children: [fmt(res.sumIst), " m"] })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...thtd, fontWeight: 600 }), children: "\u0394 Ist-Soll" }), _jsxs("td", { className: rlcClass(null, {
                                            ...thtd,
                                            fontWeight: 600,
                                            color: res.delta >= 0 ? "#065f46" : "#b91c1c"
                                        }), children: [fmt(res.delta), " m"] })] })] })] }), _jsx("p", { className: "rlc-migrated-pages-cad-asbuild-tsx-751", children: "Hinweis: Aktuell wird hier die Summenl\u00E4nge nach Layer verglichen. Detaillierte Geometrie-Differenzen (Offset, Stations, Lageabweichung) k\u00F6nnen im n\u00E4chsten Schritt erg\u00E4nzt werden." })] }));
}
