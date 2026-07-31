import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { LagerDB } from "./store.lager";
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
export default function Lager() {
    const [items, setItems] = React.useState(LagerDB.listItems());
    const [pos, setPOs] = React.useState(LagerDB.listPOs());
    const [sel, setSel] = React.useState(items[0] ?? null);
    const [selPO, setSelPO] = React.useState(pos[0] ?? null);
    const [q, setQ] = React.useState("");
    const [onlyLow, setOnlyLow] = React.useState(false);
    const refresh = () => { setItems(LagerDB.listItems()); setPOs(LagerDB.listPOs()); };
    const filtered = () => items.filter(i => {
        const s = (i.name + " " + (i.sku ?? "") + " " + (i.location ?? "")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okL = !onlyLow || ((i.stock ?? 0) <= (i.minStock ?? 0));
        return okQ && okL;
    });
    // ==== Articoli ====
    const addItem = () => { const it = LagerDB.createItem(); refresh(); setSel(it); };
    const delItem = () => { if (!sel)
        return; if (!confirm("Artikel löschen?"))
        return; LagerDB.removeItem(sel.id); refresh(); setSel(LagerDB.listItems()[0] ?? null); };
    const upItem = (p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        setSel(next);
        LagerDB.upsertItem(next);
        setItems(LagerDB.listItems());
    };
    const receive = (qty) => { if (!sel || !qty)
        return; LagerDB.move(sel.id, "IN", qty); refresh(); };
    const issue = (qty) => { if (!sel || !qty)
        return; LagerDB.move(sel.id, "OUT", qty); refresh(); };
    // ==== Ordini d'acquisto (PO) ====
    const addPO = () => { const p = LagerDB.createPO(); refresh(); setSelPO(p); };
    const delPO = () => { if (!selPO)
        return; if (!confirm("Bestellung löschen?"))
        return; LagerDB.removePO(selPO.id); refresh(); setSelPO(LagerDB.listPOs()[0] ?? null); };
    const upPO = (p) => {
        if (!selPO)
            return;
        const next = { ...selPO, ...p, updatedAt: Date.now() };
        setSelPO(next);
        LagerDB.upsertPO(next);
        setPOs(LagerDB.listPOs());
    };
    const addLine = (item) => {
        if (!selPO)
            return;
        const l = { id: crypto.randomUUID(), sku: item?.sku ?? "", name: item?.name ?? "", qty: 1, price: 0 };
        upPO({ lines: [l, ...(selPO.lines || [])] });
    };
    const delLine = (id) => { if (!selPO)
        return; upPO({ lines: (selPO.lines || []).filter(x => x.id !== id) }); };
    const totalPO = (po) => (po.lines || []).reduce((s, l) => s + (l.qty * l.price), 0);
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr auto", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: addItem, children: "+ Artikel" }), _jsx("button", { className: "btn", onClick: delItem, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Name / SKU / Lager\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 260 } }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: onlyLow, onChange: e => setOnlyLow(e.target.checked) }), " ", _jsx("span", { style: { fontSize: 13 }, children: "nur Unterbestand" })] }), _jsx("button", { className: "btn", onClick: () => download("text/csv;charset=utf-8", "lager.csv", LagerDB.exportCSV(filtered())), children: "Export CSV" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(520px,48vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name" }), _jsx("th", { style: th, children: "SKU" }), _jsx("th", { style: th, children: "Lager" }), _jsx("th", { style: th, children: "Bestand" }), _jsx("th", { style: th, children: "min" }), _jsx("th", { style: th, children: "Preis" })] }) }), _jsxs("tbody", { children: [filtered().map(i => {
                                            const low = (i.stock ?? 0) <= (i.minStock ?? 0);
                                            return (_jsxs("tr", { onClick: () => setSel(i), style: { cursor: "pointer", background: sel?.id === i.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: _jsx("b", { children: i.name }) }), _jsx("td", { style: td, children: i.sku || "—" }), _jsx("td", { style: td, children: i.location || "—" }), _jsx("td", { style: { ...td, color: low ? "#c03" : undefined }, children: i.stock ?? 0 }), _jsx("td", { style: td, children: i.minStock ?? 0 }), _jsx("td", { style: td, children: i.price ? `${i.price.toFixed(2)} €` : "—" })] }, i.id));
                                        }), filtered().length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 6, children: "Keine Artikel." }) })] })] }) }), _jsx("div", { className: "card", style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Artikel w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: sel.name, onChange: e => upItem({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "SKU" }), _jsx("input", { style: inp, value: sel.sku ?? "", onChange: e => upItem({ sku: e.target.value }) }), _jsx("label", { style: lbl, children: "Lagerort" }), _jsx("input", { style: inp, value: sel.location ?? "", onChange: e => upItem({ location: e.target.value }) }), _jsx("label", { style: lbl, children: "Preis (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", style: inp, value: sel.price ?? 0, onChange: e => upItem({ price: +e.target.value }) }), _jsx("label", { style: lbl, children: "Bestand" }), _jsx("input", { type: "number", style: inp, value: sel.stock ?? 0, onChange: e => upItem({ stock: +e.target.value }) }), _jsx("label", { style: lbl, children: "Mindestbestand" }), _jsx("input", { type: "number", style: inp, value: sel.minStock ?? 0, onChange: e => upItem({ minStock: +e.target.value }) }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }, children: [_jsx("button", { className: "btn", onClick: () => receive(Number(prompt("Eingang Menge:", "1")) || 0), children: "+ Eingang" }), _jsx("button", { className: "btn", onClick: () => issue(Number(prompt("Ausgang Menge:", "1")) || 0), children: "\u2212 Ausgang" }), _jsx("button", { className: "btn", onClick: () => { if (!sel)
                                                return; addLine(sel); }, children: "In Bestellung \u00FCbernehmen" })] })] })) })] }), _jsxs("div", { className: "card", style: { padding: "8px 10px" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Bestellungen" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: addPO, children: "+ Bestellung" }), _jsx("button", { className: "btn", onClick: delPO, disabled: !selPO, children: "L\u00F6schen" })] }), !selPO ? _jsx("div", { style: { opacity: .7 }, children: "Keine Bestellung ausgew\u00E4hlt." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Nummer" }), _jsx("input", { style: inp, value: selPO.number, onChange: e => upPO({ number: e.target.value }) }), _jsx("label", { style: lbl, children: "Lieferant" }), _jsx("input", { style: inp, value: selPO.vendor ?? "", onChange: e => upPO({ vendor: e.target.value }) }), _jsx("label", { style: lbl, children: "Status" }), _jsxs("select", { style: inp, value: selPO.status ?? "Entwurf", onChange: e => upPO({ status: e.target.value }), children: [_jsx("option", { children: "Entwurf" }), _jsx("option", { children: "Bestellt" }), _jsx("option", { children: "Geliefert" }), _jsx("option", { children: "Storniert" })] }), _jsx("label", { style: lbl, children: "Lieferdatum" }), _jsx("input", { type: "date", style: inp, value: toDateInput(selPO.deliveryDate), onChange: e => upPO({ deliveryDate: new Date(e.target.value).toISOString() }) }), _jsx("div", { style: { gridColumn: "1 / -1" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "SKU" }), _jsx("th", { style: th, children: "Bezeichnung" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Preis" }), _jsx("th", { style: th, children: "Summe" }), _jsx("th", { style: th })] }) }), _jsxs("tbody", { children: [(selPO.lines || []).map(l => (_jsxs("tr", { children: [_jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: l.sku, onChange: e => upPO({ lines: (selPO.lines || []).map(x => x.id === l.id ? { ...l, sku: e.target.value } : x) }) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: l.name, onChange: e => upPO({ lines: (selPO.lines || []).map(x => x.id === l.id ? { ...l, name: e.target.value } : x) }) }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", style: inp, value: l.qty, onChange: e => upPO({ lines: (selPO.lines || []).map(x => x.id === l.id ? { ...l, qty: +e.target.value } : x) }) }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", step: "0.01", style: inp, value: l.price, onChange: e => upPO({ lines: (selPO.lines || []).map(x => x.id === l.id ? { ...l, price: +e.target.value } : x) }) }) }), _jsxs("td", { style: td, children: [(l.qty * l.price).toFixed(2), " \u20AC"] }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { className: "btn", onClick: () => delLine(l.id), children: "Entfernen" }) })] }, l.id))), (selPO.lines || []).length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 6, children: "Keine Positionen." }) }), (selPO.lines || []).length > 0 && (_jsxs("tr", { children: [_jsx("td", { style: td, colSpan: 4, children: _jsx("b", { children: "Gesamt" }) }), _jsxs("td", { style: { ...td, fontWeight: 700 }, children: [totalPO(selPO).toFixed(2), " \u20AC"] }), _jsx("td", { style: td })] }))] })] }) })] }))] })] }));
}
function toDateInput(iso) { if (!iso)
    return ""; const d = new Date(iso); const p = (n) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
