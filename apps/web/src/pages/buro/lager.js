import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { LagerDB } from "./store.lager";
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
const lbl = {
    fontSize: 12,
    opacity: 0.8
};
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap"
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle"
};
export default function Lager() {
    const [items, setItems] = React.useState(LagerDB.listItems());
    const [pos, setPOs] = React.useState(LagerDB.listPOs());
    const [selId, setSelId] = React.useState(LagerDB.listItems()[0]?.id ?? null);
    const [selPOId, setSelPOId] = React.useState(LagerDB.listPOs()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [onlyLow, setOnlyLow] = React.useState(false);
    const refresh = React.useCallback(() => {
        const nextItems = LagerDB.listItems();
        const nextPOs = LagerDB.listPOs();
        setItems(nextItems);
        setPOs(nextPOs);
        setSelId((prev) => {
            if (prev && nextItems.some((x) => x.id === prev))
                return prev;
            return nextItems[0]?.id ?? null;
        });
        setSelPOId((prev) => {
            if (prev && nextPOs.some((x) => x.id === prev))
                return prev;
            return nextPOs[0]?.id ?? null;
        });
    }, []);
    const sel = React.useMemo(() => items.find((x) => x.id === selId) ?? null, [items, selId]);
    const selPO = React.useMemo(() => pos.find((x) => x.id === selPOId) ?? null, [pos, selPOId]);
    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return items.filter((i) => {
            const s = `${i.name} ${i.sku ?? ""} ${i.location ?? ""}`.toLowerCase();
            const okQ = !qq || s.includes(qq);
            const okL = !onlyLow || (i.stock ?? 0) <= (i.minStock ?? 0);
            return okQ && okL;
        });
    }, [items, q, onlyLow]);
    const addItem = React.useCallback(() => {
        const it = LagerDB.createItem();
        refresh();
        setSelId(it.id);
    }, [refresh]);
    const delItem = React.useCallback(() => {
        if (!sel)
            return;
        if (!confirm("Artikel löschen?"))
            return;
        LagerDB.removeItem(sel.id);
        refresh();
    }, [sel, refresh]);
    const upItem = React.useCallback((p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        LagerDB.upsertItem(next);
        setSelId(next.id);
        refresh();
    }, [sel, refresh]);
    const receive = React.useCallback((qty) => {
        if (!sel || !qty || qty <= 0)
            return;
        LagerDB.move(sel.id, "IN", qty);
        refresh();
    }, [sel, refresh]);
    const issue = React.useCallback((qty) => {
        if (!sel || !qty || qty <= 0)
            return;
        LagerDB.move(sel.id, "OUT", qty);
        refresh();
    }, [sel, refresh]);
    const addPO = React.useCallback(() => {
        const p = LagerDB.createPO();
        refresh();
        setSelPOId(p.id);
    }, [refresh]);
    const delPO = React.useCallback(() => {
        if (!selPO)
            return;
        if (!confirm("Bestellung löschen?"))
            return;
        LagerDB.removePO(selPO.id);
        refresh();
    }, [selPO, refresh]);
    const upPO = React.useCallback((p) => {
        if (!selPO)
            return;
        const next = { ...selPO, ...p, updatedAt: Date.now() };
        LagerDB.upsertPO(next);
        setSelPOId(next.id);
        refresh();
    }, [selPO, refresh]);
    const addLine = React.useCallback((item) => {
        if (!selPO)
            return;
        const l = {
            id: crypto.randomUUID(),
            sku: item?.sku ?? "",
            name: item?.name ?? "",
            qty: 1,
            price: item?.price ?? 0
        };
        upPO({ lines: [l, ...(selPO.lines || [])] });
    }, [selPO, upPO]);
    const delLine = React.useCallback((id) => {
        if (!selPO)
            return;
        upPO({ lines: (selPO.lines || []).filter((x) => x.id !== id) });
    }, [selPO, upPO]);
    const totalPO = React.useCallback((po) => {
        return (po.lines || []).reduce((s, l) => s + l.qty * l.price, 0);
    }, []);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-lager-tsx-516", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-lager-tsx-517", children: [_jsx("button", { className: "btn", onClick: addItem, children: "+ Artikel" }), _jsx("button", { className: "btn", onClick: delItem, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-lager-tsx-518" }), _jsx("input", { placeholder: "Suche Name / SKU / Lager\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 260 }) }), _jsxs("label", { className: "rlc-migrated-pages-buro-lager-tsx-519", children: [_jsx("input", { type: "checkbox", checked: onlyLow, onChange: (e) => setOnlyLow(e.target.checked) }), _jsx("span", { className: "rlc-migrated-pages-buro-lager-tsx-520", children: "nur Unterbestand" })] }), _jsx("button", { className: "btn", onClick: () => download("text/csv;charset=utf-8", "lager.csv", LagerDB.exportCSV(filtered)), children: "Export CSV" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-lager-tsx-521", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-lager-tsx-522", children: _jsxs("table", { className: "rlc-migrated-pages-buro-lager-tsx-523", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name" }), _jsx("th", { className: rlcClass(null, th), children: "SKU" }), _jsx("th", { className: rlcClass(null, th), children: "Lager" }), _jsx("th", { className: rlcClass(null, th), children: "Bestand" }), _jsx("th", { className: rlcClass(null, th), children: "min" }), _jsx("th", { className: rlcClass(null, th), children: "Preis" })] }) }), _jsxs("tbody", { children: [filtered.map((i) => {
                                            const low = (i.stock ?? 0) <= (i.minStock ?? 0);
                                            return (_jsxs("tr", { onClick: () => setSelId(i.id), className: rlcClass(null, {
                                                    cursor: "pointer",
                                                    background: sel?.id === i.id ? "#f1f5ff" : undefined
                                                }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: i.name }) }), _jsx("td", { className: rlcClass(null, td), children: i.sku || "—" }), _jsx("td", { className: rlcClass(null, td), children: i.location || "—" }), _jsx("td", { className: rlcClass(null, { ...td, color: low ? "#c03" : undefined }), children: i.stock ?? 0 }), _jsx("td", { className: rlcClass(null, td), children: i.minStock ?? 0 }), _jsx("td", { className: rlcClass(null, td), children: typeof i.price === "number" ? `${i.price.toFixed(2)} €` : "—" })] }, i.id));
                                        }), filtered.length === 0 &&
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 6, children: "Keine Artikel." }) })] })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-lager-tsx-524", children: !sel ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-lager-tsx-525", children: "Links Artikel w\u00E4hlen oder neu anlegen." }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-lager-tsx-526", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Name" }), _jsx("input", { className: rlcClass(null, inp), value: sel.name, onChange: (e) => upItem({ name: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "SKU" }), _jsx("input", { className: rlcClass(null, inp), value: sel.sku ?? "", onChange: (e) => upItem({ sku: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Lagerort" }), _jsx("input", { className: rlcClass(null, inp), value: sel.location ?? "", onChange: (e) => upItem({ location: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Preis (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, inp), value: sel.price ?? 0, onChange: (e) => upItem({ price: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Bestand" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.stock ?? 0, onChange: (e) => upItem({ stock: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Mindestbestand" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.minStock ?? 0, onChange: (e) => upItem({ minStock: Number(e.target.value) || 0 }) }), _jsxs("div", { className: "rlc-migrated-pages-buro-lager-tsx-527", children: [_jsx("button", { className: "btn", onClick: () => receive(Number(prompt("Eingang Menge:", "1")) || 0), children: "+ Eingang" }), _jsx("button", { className: "btn", onClick: () => issue(Number(prompt("Ausgang Menge:", "1")) || 0), children: "\u2212 Ausgang" }), _jsx("button", { className: "btn", onClick: () => {
                                                    if (!sel)
                                                        return;
                                                    addLine(sel);
                                                }, children: "In Bestellung \u00FCbernehmen" })] })] }) })] }), _jsxs("div", { className: "card rlc-migrated-pages-buro-lager-tsx-528", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-lager-tsx-529", children: [_jsx("div", { className: "rlc-migrated-pages-buro-lager-tsx-530", children: "Bestellungen" }), _jsx("div", { className: "rlc-migrated-pages-buro-lager-tsx-531" }), _jsx("button", { className: "btn", onClick: addPO, children: "+ Bestellung" }), _jsx("button", { className: "btn", onClick: delPO, disabled: !selPO, children: "L\u00F6schen" })] }), !selPO ?
                        _jsx("div", { className: "rlc-migrated-pages-buro-lager-tsx-532", children: "Keine Bestellung ausgew\u00E4hlt." }) :
                        _jsxs("div", { className: "rlc-migrated-pages-buro-lager-tsx-533", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Nummer" }), _jsx("input", { className: rlcClass(null, inp), value: selPO.number, onChange: (e) => upPO({ number: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Lieferant" }), _jsx("input", { className: rlcClass(null, inp), value: selPO.vendor ?? "", onChange: (e) => upPO({ vendor: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Status" }), _jsxs("select", { className: rlcClass(null, inp), value: selPO.status ?? "Entwurf", onChange: (e) => upPO({ status: e.target.value }), children: [_jsx("option", { children: "Entwurf" }), _jsx("option", { children: "Bestellt" }), _jsx("option", { children: "Geliefert" }), _jsx("option", { children: "Storniert" })] }), _jsx("label", { className: rlcClass(null, lbl), children: "Lieferdatum" }), _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(selPO.deliveryDate), onChange: (e) => upPO({ deliveryDate: fromDateInput(e.target.value) }) }), _jsx("div", { className: "rlc-migrated-pages-buro-lager-tsx-534", children: _jsxs("table", { className: "rlc-migrated-pages-buro-lager-tsx-535", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "SKU" }), _jsx("th", { className: rlcClass(null, th), children: "Bezeichnung" }), _jsx("th", { className: rlcClass(null, th), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "Preis" }), _jsx("th", { className: rlcClass(null, th), children: "Summe" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsxs("tbody", { children: [(selPO.lines || []).map((l) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: l.sku, onChange: (e) => upPO({
                                                                        lines: (selPO.lines || []).map((x) => x.id === l.id ? { ...l, sku: e.target.value } : x)
                                                                    }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: l.name, onChange: (e) => upPO({
                                                                        lines: (selPO.lines || []).map((x) => x.id === l.id ? { ...l, name: e.target.value } : x)
                                                                    }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { type: "number", className: rlcClass(null, inp), value: l.qty, onChange: (e) => upPO({
                                                                        lines: (selPO.lines || []).map((x) => x.id === l.id ? { ...l, qty: Number(e.target.value) || 0 } : x)
                                                                    }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, inp), value: l.price, onChange: (e) => upPO({
                                                                        lines: (selPO.lines || []).map((x) => x.id === l.id ? { ...l, price: Number(e.target.value) || 0 } : x)
                                                                    }) }) }), _jsxs("td", { className: rlcClass(null, td), children: [(l.qty * l.price).toFixed(2), " \u20AC"] }), _jsx("td", { className: rlcClass(null, { ...td, whiteSpace: "nowrap" }), children: _jsx("button", { className: "btn", onClick: () => delLine(l.id), children: "Entfernen" }) })] }, l.id)), (selPO.lines || []).length === 0 &&
                                                        _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 6, children: "Keine Positionen." }) }), (selPO.lines || []).length > 0 &&
                                                        _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), colSpan: 4, children: _jsx("b", { children: "Gesamt" }) }), _jsxs("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: [totalPO(selPO).toFixed(2), " \u20AC"] }), _jsx("td", { className: rlcClass(null, td) })] })] })] }) })] })] })] }));
}
function toDateInput(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    const p = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromDateInput(v) {
    if (!v)
        return "";
    return `${v}T12:00:00.000Z`;
}
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
