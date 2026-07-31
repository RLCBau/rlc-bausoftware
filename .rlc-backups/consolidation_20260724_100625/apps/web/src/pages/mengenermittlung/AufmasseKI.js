import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13 };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13 };
export default function AufmasseKI() {
    const [docs, setDocs] = React.useState([]);
    const [docId, setDocId] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [unitScale, setUnitScale] = React.useState(1); // fattore scala (metri/pixel, ecc.)
    const [items, setItems] = React.useState([]);
    const current = docs.find(d => d.id === docId) || null;
    React.useEffect(() => {
        (async () => {
            try {
                const r = await fetch("/api/docs");
                const j = await r.json();
                setDocs(j.docs || []);
                if (j.docs?.length && !docId)
                    setDocId(j.docs[0].id);
            }
            catch (err) {
                console.error(err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const analyze = async () => {
        if (!docId)
            return;
        setLoading(true);
        try {
            const r = await fetch("/api/ki/measure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId, unitScale }),
            });
            const j = await r.json();
            setItems(j.items || []);
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setLoading(false);
        }
    };
    const totalByUnit = (u) => items.filter(i => i.unit === u).reduce((a, i) => a + i.value, 0);
    return (_jsxs("div", { className: "card", style: { padding: 10 }, children: [_jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }, children: [_jsx("label", { style: { fontSize: 13, opacity: .8 }, children: "Dokument" }), _jsx("select", { value: docId ?? "", onChange: (e) => setDocId(e.target.value), style: { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px" }, children: docs.map(d => _jsx("option", { value: d.id, children: d.name }, d.id)) }), _jsx("div", { style: { width: 20 } }), _jsx("label", { style: { fontSize: 13, opacity: .8 }, children: "Skalierungsfaktor" }), _jsx("input", { type: "number", step: "0.0001", value: unitScale, onChange: e => setUnitScale(Number(e.target.value) || 1), style: { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", width: 120 }, title: "z. B. Meter pro Pixel oder ein globaler Ma\u00DFstab" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: analyze, disabled: !docId || loading, children: loading ? "Analyse läuft …" : "KI erkennen" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(260px, 40%) 1fr", gap: 10 }, children: [_jsx("div", { className: "card", style: { padding: 0, minHeight: 360, display: "grid", placeItems: "center" }, children: current?.previewUrl ? (_jsx("img", { src: current.previewUrl, alt: current.name, style: { maxWidth: "100%", maxHeight: 500, objectFit: "contain" } })) : (_jsxs("div", { style: { opacity: .7, padding: 12, fontSize: 13 }, children: ["Keine Vorschau verf\u00FCgbar. (Die Dateien werden in der n\u00E4chsten Sektion ", _jsx("b", { children: "Import PDF / CAD / LandXML / GSI / CSV" }), " geladen.)"] })) }), _jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Label" }), _jsx("th", { style: th, children: "Wert" }), _jsx("th", { style: th, children: "Einheit" })] }) }), _jsxs("tbody", { children: [items.map(i => (_jsxs("tr", { children: [_jsx("td", { style: td, children: i.type }), _jsx("td", { style: td, children: i.label }), _jsx("td", { style: td, children: i.value.toLocaleString(undefined, { maximumFractionDigits: 3 }) }), _jsx("td", { style: td, children: i.unit })] }, i.id))), items.length === 0 && (_jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .7 }, colSpan: 4, children: "Noch keine Analyse durchgef\u00FChrt." }) }))] }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { style: { ...td, fontWeight: 700 }, colSpan: 2, children: "Summen" }), _jsx("td", { style: { ...td, fontWeight: 700 }, colSpan: 2, children: [
                                                    ["m", totalByUnit("m")],
                                                    ["m²", totalByUnit("m²")],
                                                    ["m³", totalByUnit("m³")],
                                                ]
                                                    .filter(([, v]) => v > 0)
                                                    .map(([u, v]) => `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${u}`)
                                                    .join("   •   ") })] }) })] }) })] }), _jsxs("div", { style: { marginTop: 10, opacity: .7, fontSize: 13 }, children: ["Hinweis: Diese Seite nutzt aktuell Demo-Ergebnisse. Die echten Erkennungen werden aus den in", _jsx("b", { children: " Import PDF / CAD / LandXML / GSI / CSV" }), " hochgeladenen Dateien berechnet."] })] }));
}
