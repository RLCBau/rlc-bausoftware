import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { SafetyDB } from "./store.sicherheit";
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const lbl = { fontSize: 12, opacity: .8 };
export default function Sicherheit() {
    const [all, setAll] = React.useState(SafetyDB.list());
    const [sel, setSel] = React.useState(all[0] ?? null);
    const [q, setQ] = React.useState("");
    const refresh = () => setAll(SafetyDB.list());
    const filtered = () => all.filter(r => {
        const s = (r.title + " " + (r.person ?? "") + " " + (r.project ?? "")).toLowerCase();
        return !q || s.includes(q.toLowerCase());
    });
    const add = () => { const n = SafetyDB.create(); refresh(); setSel(n); };
    const del = () => { if (!sel)
        return; if (!confirm("Unterweisung löschen?"))
        return; SafetyDB.remove(sel.id); refresh(); setSel(SafetyDB.list()[0] ?? null); };
    const up = (p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        setSel(next);
        SafetyDB.upsert(next);
        setAll(SafetyDB.list());
    };
    const onDrop = async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await SafetyDB.attach(sel.id, f);
        refresh();
    };
    const open = (a) => { const w = window.open(a.dataURL, "_blank"); if (!w)
        alert("Popup blockiert."); };
    const exportCSV = () => download("text/csv;charset=utf-8", "sicherheit.csv", SafetyDB.exportCSV(filtered()));
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: add, children: "+ Unterweisung" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Titel / Person / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 260 } }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(520px,48vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Titel" }), _jsx("th", { style: th, children: "Person" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Datum" }), _jsx("th", { style: th, children: "N\u00E4chste Unterweisung" })] }) }), _jsxs("tbody", { children: [filtered().map(r => {
                                            const warn = daysLeft(r.nextDate) <= 30;
                                            return (_jsxs("tr", { onClick: () => setSel(r), style: { cursor: "pointer", background: sel?.id === r.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: _jsx("b", { children: r.title }) }), _jsx("td", { style: td, children: r.person || "—" }), _jsx("td", { style: td, children: r.project || "—" }), _jsx("td", { style: td, children: r.date ? fmt(r.date) : "—" }), _jsx("td", { style: { ...td, color: warn ? "#c03" : undefined }, children: r.nextDate ? fmt(r.nextDate) : "—" })] }, r.id));
                                        }), filtered().length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 5, children: "Keine Unterweisungen." }) })] })] }) }), _jsx("div", { className: "card", onDragOver: e => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Unterweisung w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "130px 1fr 130px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Titel" }), _jsx("input", { style: inp, value: sel.title, onChange: e => up({ title: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt" }), _jsx("input", { style: inp, value: sel.project ?? "", onChange: e => up({ project: e.target.value }) }), _jsx("label", { style: lbl, children: "Person" }), _jsx("input", { style: inp, value: sel.person ?? "", onChange: e => up({ person: e.target.value }) }), _jsx("label", { style: lbl, children: "Datum" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.date), onChange: e => up({ date: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "N\u00E4chste Unterweisung" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.nextDate), onChange: e => up({ nextDate: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Bemerkung" }), _jsx("textarea", { style: { ...inp, minHeight: 80, resize: "vertical", gridColumn: "1 / -1" }, value: sel.notes ?? "", onChange: e => up({ notes: e.target.value }) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Dokumente / Fotos (Drag&Drop)" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }, children: [(sel.attachments || []).map(a => (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }, children: [_jsxs("div", { style: { padding: "6px 8px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("b", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), ((a.mime || "").startsWith("image/")) && _jsx("img", { src: a.dataURL, alt: a.name, style: { width: "100%", height: "auto" } })] }, a.id))), (sel.attachments || []).length === 0 && _jsx("div", { style: { opacity: .6 }, children: "Keine Anh\u00E4nge." })] })] })) })] })] }));
}
function fmt(iso) { return iso ? new Date(iso).toLocaleDateString() : "—"; }
function daysLeft(iso) { if (!iso)
    return Infinity; return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); }
function toDateInput(iso) { if (!iso)
    return ""; const d = new Date(iso); const p = (n) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
