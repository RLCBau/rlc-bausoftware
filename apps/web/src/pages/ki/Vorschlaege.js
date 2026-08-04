import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { LV } from "./store.lv";
import { useKiPropose } from "./useKiPropose";
import { useKiSuggest } from "./useKiSuggest";
const card = { padding: "12px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "#fff" };
const inp = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
export default function Vorschlaege() {
    const [desc, setDesc] = React.useState("");
    const [items, setItems] = React.useState([]);
    const [busyAdd, setBusyAdd] = React.useState(false);
    const { propose, loading: genLoading } = useKiPropose();
    const { suggest, loading: priceLoading } = useKiSuggest();
    async function handleGenerate() {
        const out = await propose(desc);
        setItems(out);
    }
    async function priceAll() {
        const next = [];
        for (const it of items) {
            const s = await suggest(it.kurztext, it.einheit);
            next.push({ ...it, preis: s.unitPrice, confidence: s.confidence });
        }
        setItems(next);
    }
    async function addToLV() {
        setBusyAdd(true);
        try {
            LV.bulkUpsert(items.map(i => ({ ...i, id: i.id || crypto.randomUUID() })));
            alert(`${items.length} Positionen in LV eingefügt.`);
        }
        finally {
            setBusyAdd(false);
        }
    }
    return (_jsxs("div", { style: { display: "grid", gap: 12 }, children: [_jsxs("div", { style: card, children: [_jsx("h1", { style: { margin: "0 0 10px" }, children: "Vorschl\u00E4ge (KI)" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }, children: [_jsx("textarea", { style: { ...inp, minHeight: 110 }, placeholder: "Projektbeschreibung\u2026 (Ort, Gewerke, Leitungen/Trassen, Stra\u00DFentyp, Tiefen, Materialien, Mengen grob\u2026)", value: desc, onChange: e => setDesc(e.target.value) }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsx("button", { className: "btn", onClick: handleGenerate, disabled: !desc || genLoading, children: genLoading ? "Generiere…" : "Vorschläge generieren" }), _jsx("button", { className: "btn", onClick: priceAll, disabled: items.length === 0 || priceLoading, children: priceLoading ? "Bepreise…" : "KI-Preise berechnen" }), _jsx("button", { className: "btn", onClick: addToLV, disabled: items.length === 0 || busyAdd, children: busyAdd ? "Füge hinzu…" : "→ In LV übernehmen" })] })] })] }), _jsx("div", { style: card, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Kap." }), _jsx("th", { style: th, children: "Pos-Nr" }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "E-Preis [\u20AC]" }), _jsx("th", { style: th, children: "Confidence" })] }) }), _jsxs("tbody", { children: [items.map((r) => {
                                    const kap = getChapter(r.posNr);
                                    return (_jsxs("tr", { children: [_jsx("td", { style: td, children: kap }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 90 }, value: r.posNr || "", onChange: e => setItems(p => p.map(x => x.id === r.id ? { ...x, posNr: e.target.value } : x)) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: r.kurztext, onChange: e => setItems(p => p.map(x => x.id === r.id ? { ...x, kurztext: e.target.value } : x)) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 70 }, value: r.einheit, onChange: e => setItems(p => p.map(x => x.id === r.id ? { ...x, einheit: e.target.value } : x)) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 90, textAlign: "right" }, type: "number", value: r.menge || 0, onChange: e => setItems(p => p.map(x => x.id === r.id ? { ...x, menge: +e.target.value } : x)) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 100, textAlign: "right" }, type: "number", value: r.preis ?? "", onChange: e => setItems(p => p.map(x => x.id === r.id ? { ...x, preis: +e.target.value } : x)) }) }), _jsx("td", { style: td, children: r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—" })] }, r.id));
                                }), items.length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 7, children: "Noch keine Vorschl\u00E4ge." }) })] })] }) })] }));
}
function getChapter(posNr) { if (!posNr)
    return "—"; const m = posNr.match(/^(\d{2})/); return m ? m[1] : "—"; }
