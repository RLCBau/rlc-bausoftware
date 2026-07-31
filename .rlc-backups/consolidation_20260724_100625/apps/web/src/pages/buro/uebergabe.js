import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { UebergabeDB } from "./store.uebergabe";
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
export default function Uebergabe() {
    const [all, setAll] = React.useState(UebergabeDB.list());
    const [sel, setSel] = React.useState(all[0] ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const refresh = () => setAll(UebergabeDB.list());
    const itemsFiltered = () => all.filter(d => {
        const s = (d.title + " " + (d.projectId ?? "") + " " + (d.client ?? "")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okP = !proj || (d.projectId === proj);
        return okQ && okP;
    });
    const projects = Array.from(new Set(all.map(d => d.projectId).filter(Boolean)));
    const add = () => { const d = UebergabeDB.create(); refresh(); setSel(d); };
    const del = () => { if (!sel)
        return; if (!confirm("Protokoll löschen?"))
        return; UebergabeDB.remove(sel.id); refresh(); setSel(UebergabeDB.list()[0] ?? null); };
    // ✅ campi editabili
    const up = (p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        setSel(next);
        UebergabeDB.upsert(next);
        setAll(UebergabeDB.list());
    };
    const addItem = () => { if (!sel)
        return; const it = { id: crypto.randomUUID(), text: "", status: "open", note: "" }; up({ checklist: [it, ...(sel.checklist || [])] }); };
    const delItem = (id) => { if (!sel)
        return; up({ checklist: (sel.checklist || []).filter(i => i.id !== id) }); };
    const addSign = (role) => {
        if (!sel)
            return;
        pickFile(async (f) => {
            const url = await fileToDataURL(f);
            const s = { role, name: "", when: new Date().toISOString(), image: url };
            const signs = { ...(sel.signs || {}) };
            signs[role] = s;
            up({ signs });
        });
    };
    const onDrop = async (ev) => { ev.preventDefault(); if (!sel)
        return; const f = ev.dataTransfer.files?.[0]; if (!f)
        return; await UebergabeDB.attach(sel.id, f); refresh(); };
    const open = (a) => { const w = window.open(a.dataURL, "_blank"); if (!w)
        alert("Popup blockiert."); };
    const exportCSV = () => download("text/csv;charset=utf-8", "uebergabe.csv", UebergabeDB.exportCSV(itemsFiltered()));
    const exportJSON = () => download("application/json", "uebergabe_backup.json", UebergabeDB.exportJSON());
    const importJSON = () => pickFile(async (f) => { const n = UebergabeDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: add, children: "+ Protokoll" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Titel / Kunde / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 280 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(520px,48vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Titel" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Kunde" }), _jsx("th", { style: th, children: "Adresse" }), _jsx("th", { style: th, children: "Status" }), _jsx("th", { style: th, children: "Stand" })] }) }), _jsxs("tbody", { children: [itemsFiltered().map(d => {
                                            const total = d.checklist?.length || 0;
                                            const done = d.checklist?.filter(i => i.status === "ok").length || 0;
                                            return (_jsxs("tr", { onClick: () => setSel(d), style: { cursor: "pointer", background: sel?.id === d.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: _jsx("b", { children: d.title }) }), _jsx("td", { style: td, children: d.projectId || "—" }), _jsx("td", { style: td, children: d.client || "—" }), _jsx("td", { style: td, children: d.address || "—" }), _jsx("td", { style: td, children: d.status || "Entwurf" }), _jsxs("td", { style: td, children: [done, "/", total] })] }, d.id));
                                        }), itemsFiltered().length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 6, children: "Keine Protokolle." }) })] })] }) }), _jsx("div", { className: "card", onDragOver: e => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Protokoll w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "140px 1fr 140px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Titel" }), _jsx("input", { style: inp, value: sel.title, onChange: e => up({ title: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projectId ?? "", onChange: e => up({ projectId: e.target.value }) }), _jsx("label", { style: lbl, children: "Kunde" }), _jsx("input", { style: inp, value: sel.client ?? "", onChange: e => up({ client: e.target.value }) }), _jsx("label", { style: lbl, children: "Adresse" }), _jsx("input", { style: inp, value: sel.address ?? "", onChange: e => up({ address: e.target.value }) }), _jsx("label", { style: lbl, children: "Datum" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.date), onChange: e => up({ date: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Status" }), _jsxs("select", { style: inp, value: sel.status ?? "Entwurf", onChange: e => up({ status: e.target.value }), children: [_jsx("option", { children: "Entwurf" }), _jsx("option", { children: "Im Gange" }), _jsx("option", { children: "Abgeschlossen" }), _jsx("option", { children: "Abgelehnt" })] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Checkliste" }), _jsxs("div", { style: { gridColumn: "1 / -1" }, children: [_jsx("div", { style: { marginBottom: 6 }, children: _jsx("button", { className: "btn", onClick: addItem, children: "+ Punkt" }) }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Punkt" }), _jsx("th", { style: th, children: "Status" }), _jsx("th", { style: th, children: "Notiz" }), _jsx("th", { style: th })] }) }), _jsxs("tbody", { children: [(sel.checklist || []).map(it => (_jsxs("tr", { children: [_jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: it.text, onChange: e => up({ checklist: (sel.checklist || []).map(x => x.id === it.id ? { ...it, text: e.target.value } : x) }) }) }), _jsx("td", { style: td, children: _jsxs("select", { style: inp, value: it.status, onChange: e => up({ checklist: (sel.checklist || []).map(x => x.id === it.id ? { ...it, status: e.target.value } : x) }), children: [_jsx("option", { value: "open", children: "offen" }), _jsx("option", { value: "ok", children: "ok" }), _jsx("option", { value: "mangel", children: "Mangel" })] }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: it.note ?? "", onChange: e => up({ checklist: (sel.checklist || []).map(x => x.id === it.id ? { ...it, note: e.target.value } : x) }) }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { className: "btn", onClick: () => delItem(it.id), children: "Entfernen" }) })] }, it.id))), (sel.checklist || []).length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 4, children: "Keine Punkte." }) })] })] })] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Unterschriften" }), _jsx("div", { style: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: ["auftragnehmer", "auftraggeber"].map(role => {
                                        const s = (sel.signs || {})[role];
                                        return (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, padding: 8, background: "#fff" }, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("b", { style: { textTransform: "capitalize" }, children: role }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => addSign(role), children: "+ Bild" })] }), _jsxs("div", { style: { marginTop: 8, display: "grid", gridTemplateColumns: "100px 1fr 120px 1fr", gap: 8 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: s?.name ?? "", onChange: e => up({ signs: { ...(sel.signs || {}), [role]: { ...s, name: e.target.value } } }) }), _jsx("label", { style: lbl, children: "Datum" }), _jsx("input", { type: "date", style: inp, value: toDateInput(s?.when), onChange: e => up({ signs: { ...(sel.signs || {}), [role]: { ...s, when: new Date(e.target.value).toISOString() } } }) }), s?.image && _jsx("img", { src: s.image, alt: "sign", style: { gridColumn: "1 / -1", maxHeight: 100 } })] })] }, role));
                                    }) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Anh\u00E4nge (Drag&Drop)" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }, children: [(sel.attachments || []).map(a => (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }, children: [_jsxs("div", { style: { padding: "6px 8px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("b", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), ((a.mime || "").startsWith("image/")) && _jsx("img", { src: a.dataURL, alt: a.name, style: { width: "100%", height: "auto" } })] }, a.id))), (sel.attachments || []).length === 0 && _jsx("div", { style: { opacity: .6 }, children: "Keine Anh\u00E4nge." })] })] })) })] })] }));
}
function toDateInput(iso) { if (!iso)
    return ""; const d = new Date(iso); const p = (n) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
async function fileToDataURL(f) { return await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }); }
function pickFile(onPick) { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files?.[0]; if (f)
    onPick(f); }; i.click(); }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
