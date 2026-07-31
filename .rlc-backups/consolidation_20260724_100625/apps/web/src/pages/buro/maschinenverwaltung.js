import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { MachinesDB } from "./store.machines";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
export default function Maschinenverwaltung() {
    const [all, setAll] = React.useState(MachinesDB.list());
    const [sel, setSel] = React.useState(all[0] ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [onlyDue, setOnlyDue] = React.useState(false);
    const refresh = () => setAll(MachinesDB.list());
    const filtered = () => all.filter(m => {
        const s = (m.name + " " + (m.type ?? "") + " " + (m.serial ?? "") + " " + (m.projectId ?? "")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okP = !proj || (m.projectId ?? "") === proj;
        const due = isDue(m);
        const okD = !onlyDue || due;
        return okQ && okP && okD;
    });
    const projects = Array.from(new Set(all.map(m => m.projectId).filter(Boolean)));
    const add = () => { const m = MachinesDB.create(); refresh(); setSel(m); };
    const del = () => { if (!sel)
        return; if (!confirm("Maschine löschen?"))
        return; MachinesDB.remove(sel.id); refresh(); setSel(MachinesDB.list()[0] ?? null); };
    // ✅ FIX scrittura
    const up = (p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        setSel(next);
        MachinesDB.upsert(next);
        setAll(MachinesDB.list());
    };
    const addMaint = () => { if (!sel)
        return; const r = { id: crypto.randomUUID(), date: new Date().toISOString(), hours: sel.hours || 0, notes: "" }; up({ maintenance: [r, ...(sel.maintenance || [])] }); };
    const delMaint = (id) => { if (!sel)
        return; up({ maintenance: (sel.maintenance || []).filter(x => x.id !== id) }); };
    const onDrop = async (ev) => { ev.preventDefault(); if (!sel)
        return; const f = ev.dataTransfer.files?.[0]; if (!f)
        return; await MachinesDB.attach(sel.id, f); refresh(); };
    const open = (a) => { const w = window.open(a.dataURL, "_blank"); if (!w)
        alert("Popup blockiert."); };
    const importCSV = () => pickFile(async (f) => { const n = MachinesDB.importCSV(await f.text()); alert(`Import: ${n} Maschinen.`); refresh(); });
    const exportCSV = () => download("text/csv;charset=utf-8", "maschinen.csv", MachinesDB.exportCSV(filtered()));
    const exportJSON = () => download("application/json", "maschinen_backup.json", MachinesDB.exportJSON());
    const importJSON = () => pickFile(async (f) => { const n = MachinesDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });
    const recalcNext = () => {
        if (!sel)
            return;
        const last = sel.lastService ?? new Date().toISOString();
        const days = sel.serviceIntervalDays ?? 180;
        const next = new Date(new Date(last).getTime() + days * 86400000).toISOString();
        up({ nextService: next });
    };
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: add, children: "+ Maschine" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Name / Typ / Seriennr. / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 300 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: onlyDue, onChange: e => setOnlyDue(e.target.checked) }), " ", _jsx("span", { style: { fontSize: 13 }, children: "nur f\u00E4llige" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(520px,48vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Seriennr." }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Stunden" }), _jsx("th", { style: th, children: "n\u00E4chster Service" }), _jsx("th", { style: th, children: "Status" })] }) }), _jsxs("tbody", { children: [filtered().map(m => {
                                            const due = isDue(m);
                                            const days = daysLeft(m.nextService);
                                            return (_jsxs("tr", { onClick: () => setSel(m), style: { cursor: "pointer", background: sel?.id === m.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: _jsx("b", { children: m.name }) }), _jsx("td", { style: td, children: m.type || "—" }), _jsx("td", { style: td, children: m.serial || "—" }), _jsx("td", { style: td, children: m.projectId || "—" }), _jsx("td", { style: td, children: m.hours ?? 0 }), _jsxs("td", { style: td, children: [m.nextService ? fmt(m.nextService) : "—", " ", m.nextService && _jsxs("span", { style: { marginLeft: 6, opacity: .7 }, children: ["(", days, " Tg)"] })] }), _jsx("td", { style: td, children: due ? "⚠️ fällig" : (m.status || "Betrieb") })] }, m.id));
                                        }), filtered().length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 7, children: "Keine Maschinen." }) })] })] }) }), _jsx("div", { className: "card", onDragOver: e => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Maschine w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "130px 1fr 130px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: sel.name, onChange: e => up({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "Typ" }), _jsx("input", { style: inp, value: sel.type ?? "", onChange: e => up({ type: e.target.value }) }), _jsx("label", { style: lbl, children: "Seriennr." }), _jsx("input", { style: inp, value: sel.serial ?? "", onChange: e => up({ serial: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projectId ?? "", onChange: e => up({ projectId: e.target.value }) }), _jsx("label", { style: lbl, children: "Standort" }), _jsx("input", { style: inp, value: sel.location ?? "", onChange: e => up({ location: e.target.value }) }), _jsx("label", { style: lbl, children: "Status" }), _jsxs("select", { style: inp, value: sel.status ?? "Betrieb", onChange: e => up({ status: e.target.value }), children: [_jsx("option", { children: "Betrieb" }), _jsx("option", { children: "Wartung" }), _jsx("option", { children: "Au\u00DFer Betrieb" })] }), _jsx("label", { style: lbl, children: "Betriebsstunden" }), _jsx("input", { type: "number", style: inp, value: sel.hours ?? 0, onChange: e => up({ hours: +e.target.value }) }), _jsx("label", { style: lbl, children: "Letzter Service" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.lastService), onChange: e => up({ lastService: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Intervall (Tage)" }), _jsx("input", { type: "number", style: inp, value: sel.serviceIntervalDays ?? 180, onChange: e => up({ serviceIntervalDays: +e.target.value }) }), _jsx("label", { style: lbl, children: "N\u00E4chster Service" }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("input", { type: "date", style: { ...inp, flex: 1 }, value: toDateInput(sel.nextService), onChange: e => up({ nextService: new Date(e.target.value).toISOString() }) }), _jsx("button", { className: "btn", onClick: recalcNext, children: "Berechnen" })] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Wartungsprotokolle" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gap: 6 }, children: [_jsx("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: _jsx("button", { className: "btn", onClick: addMaint, children: "+ Eintrag" }) }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Datum" }), _jsx("th", { style: th, children: "Std." }), _jsx("th", { style: th, children: "Notizen" }), _jsx("th", { style: th })] }) }), _jsxs("tbody", { children: [(sel.maintenance || []).map(r => (_jsxs("tr", { children: [_jsx("td", { style: td, children: _jsx("input", { type: "date", style: inp, value: toDateInput(r.date), onChange: e => up({ maintenance: (sel.maintenance || []).map(x => x.id === r.id ? { ...r, date: new Date(e.target.value).toISOString() } : x) }) }) }), _jsx("td", { style: td, children: _jsx("input", { type: "number", style: inp, value: r.hours ?? 0, onChange: e => up({ maintenance: (sel.maintenance || []).map(x => x.id === r.id ? { ...r, hours: +e.target.value } : x) }) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: r.notes ?? "", onChange: e => up({ maintenance: (sel.maintenance || []).map(x => x.id === r.id ? { ...r, notes: e.target.value } : x) }) }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { className: "btn", onClick: () => delMaint(r.id), children: "Entfernen" }) })] }, r.id))), (sel.maintenance || []).length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 4, children: "Keine Eintr\u00E4ge." }) })] })] })] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Dokumente / Fotos (Drag&Drop)" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }, children: [(sel.attachments || []).map(a => (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }, children: [_jsxs("div", { style: { padding: "6px 8px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("b", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), ((a.mime || "").startsWith("image/")) && _jsx("img", { src: a.dataURL, alt: a.name, style: { width: "100%", height: "auto" } })] }, a.id))), (sel.attachments || []).length === 0 && _jsx("div", { style: { opacity: .6 }, children: "Keine Anh\u00E4nge." })] })] })) })] })] }));
}
function toDateInput(iso) { if (!iso)
    return ""; const d = new Date(iso); const p = (n) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function fmt(iso) { return iso ? new Date(iso).toLocaleDateString() : "—"; }
function daysLeft(iso) { if (!iso)
    return NaN; return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); }
function isDue(m) { const d = daysLeft(m.nextService); return (!isNaN(d) && d <= 14) || (m.status === "Wartung"); }
function pickFile(onPick) { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files?.[0]; if (f)
    onPick(f); }; i.click(); }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
