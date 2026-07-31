import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { AUFMASS } from "./AufmassEditor"; // ⬅️ se serve, aggiorna il path
const card = { background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: 12 };
function useAufmassInbox() {
    const [items, setItems] = React.useState([]);
    const reload = React.useCallback(() => {
        try {
            const list = JSON.parse(localStorage.getItem("AUFMASS_INBOX") || "[]");
            setItems(Array.isArray(list) ? list : []);
        }
        catch {
            setItems([]);
        }
    }, []);
    React.useEffect(() => { reload(); }, [reload]);
    const remove = (id) => {
        const rest = items.filter(x => x.id !== id);
        localStorage.setItem("AUFMASS_INBOX", JSON.stringify(rest));
        setItems(rest);
    };
    return { items, reload, remove };
}
export default function AufmassPage() {
    const [tab, setTab] = React.useState("inbox");
    const { items, remove, reload } = useAufmassInbox();
    function importItem(it) {
        // inserisci nello store reale
        AUFMASS.add({
            id: crypto.randomUUID(),
            datum: new Date(it.ts).toISOString().slice(0, 10),
            quelle: it.source,
            datei: it.file,
            layer: it.layer,
            menge: it.area,
            einheit: "m²",
            bemerkung: `Import CAD (${it.layer})`,
        });
        remove(it.id);
        alert(`Importato ${it.area.toFixed(2)} m² da ${it.file}`);
    }
    const list = AUFMASS.list ? AUFMASS.list() : []; // se il tuo store espone list()
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 12, padding: 12 }, children: [_jsxs("div", { className: "card", style: { ...card, display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: () => setTab("inbox"), style: { fontWeight: tab === "inbox" ? 700 : 500 }, children: "\uD83D\uDCE5 CAD \u2192 Aufma\u00DF Inbox" }), _jsx("button", { className: "btn", onClick: () => setTab("liste"), style: { fontWeight: tab === "liste" ? 700 : 500 }, children: "\uD83D\uDCCB Aufma\u00DF-Liste" }), _jsx("div", { style: { flex: 1 } }), tab === "inbox" && _jsx("button", { className: "btn", onClick: reload, children: "Aggiorna" })] }), _jsx("div", { className: "card", style: { ...card }, children: tab === "inbox" ? (_jsx(InboxTable, { items: items, onImport: importItem })) : (_jsx(AufmassList, { items: list })) })] }));
}
function InboxTable({ items, onImport }) {
    if (!items.length)
        return _jsx("div", { style: { opacity: .6 }, children: "Nessuna area in inbox. Vai in CAD \u2192 invia a Aufma\u00DF." });
    return (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: "#f5f6f8" }, children: [_jsx("th", { style: th, children: "Data/Ora" }), _jsx("th", { style: th, children: "Layer" }), _jsx("th", { style: th, children: "Area (m\u00B2)" }), _jsx("th", { style: th, children: "File" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: items.map(it => (_jsxs("tr", { children: [_jsx("td", { style: td, children: new Date(it.ts).toLocaleString() }), _jsx("td", { style: td, children: it.layer }), _jsx("td", { style: td, children: it.area.toFixed(2) }), _jsx("td", { style: td, children: it.file }), _jsx("td", { style: { ...td, textAlign: "right" }, children: _jsx("button", { className: "btn", onClick: () => onImport(it), children: "Importa" }) })] }, it.id))) })] }));
}
function AufmassList({ items }) {
    if (!items?.length)
        return _jsx("div", { style: { opacity: .6 }, children: "Nessuna voce Aufma\u00DF." });
    return (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: "#f5f6f8" }, children: [_jsx("th", { style: th, children: "Datum" }), _jsx("th", { style: th, children: "Quelle" }), _jsx("th", { style: th, children: "Datei/Layer" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Bemerkung" })] }) }), _jsx("tbody", { children: items.map((r) => (_jsxs("tr", { children: [_jsx("td", { style: td, children: r.datum }), _jsx("td", { style: td, children: r.quelle }), _jsxs("td", { style: td, children: [r.datei, " \u00B7 ", r.layer] }), _jsx("td", { style: td, children: Number(r.menge ?? 0).toFixed(2) }), _jsx("td", { style: td, children: r.einheit }), _jsx("td", { style: td, children: r.bemerkung ?? "" })] }, r.id))) })] }));
}
/* styles tabella */
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
