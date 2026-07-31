import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { PersonalDB } from "./store.personal";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
export default function Personalverwaltung() {
    const [all, setAll] = React.useState(PersonalDB.list());
    const [sel, setSel] = React.useState(all[0] ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const refresh = () => setAll(PersonalDB.list());
    const filtered = () => all.filter(e => {
        const s = (e.name + " " + (e.role ?? "") + " " + (e.projects ?? []).join(" ")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okP = !proj || (e.projects ?? []).includes(proj);
        return okQ && okP;
    });
    const projects = Array.from(new Set(all.flatMap(e => e.projects ?? []))).sort();
    const add = () => { const e = PersonalDB.create(); refresh(); setSel(e); };
    const del = () => { if (!sel)
        return; if (!confirm("Mitarbeiter löschen?"))
        return; PersonalDB.remove(sel.id); refresh(); setSel(PersonalDB.list()[0] ?? null); };
    // ✅ FIX scrittura: aggiorno anche lo stato locale
    const up = (p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        setSel(next);
        PersonalDB.upsert(next);
        setAll(PersonalDB.list());
    };
    const expWarn = (d) => d ? daysLeft(d) : null;
    const addCert = () => { if (!sel)
        return; const c = { id: crypto.randomUUID(), name: "", validUntil: new Date().toISOString() }; up({ certs: [c, ...(sel.certs || [])] }); };
    const delCert = (id) => { if (!sel)
        return; up({ certs: (sel.certs || []).filter(c => c.id !== id) }); };
    const onDrop = async (ev) => { ev.preventDefault(); if (!sel)
        return; const f = ev.dataTransfer.files?.[0]; if (!f)
        return; await PersonalDB.attach(sel.id, f); refresh(); };
    const open = (a) => { const w = window.open(a.dataURL, "_blank"); if (!w)
        alert("Popup blockiert."); };
    const exportCSV = () => download("text/csv;charset=utf-8", "personal.csv", PersonalDB.exportCSV(filtered()));
    const importCSV = () => pickFile(async (f) => { const n = PersonalDB.importCSV(await f.text()); alert(`Import: ${n} Datensätze.`); refresh(); });
    const exportJSON = () => download("application/json", "personal_backup.json", PersonalDB.exportJSON());
    const importJSON = () => pickFile(async (f) => { const n = PersonalDB.importJSON(await f.text()); alert(`Backup importiert: ${n}.`); refresh(); });
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: add, children: "+ Mitarbeiter" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Name / Rolle / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 280 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(460px, 48vw) 1fr", gap: 10, minHeight: "60vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name" }), _jsx("th", { style: th, children: "Rolle" }), _jsx("th", { style: th, children: "E-Mail" }), _jsx("th", { style: th, children: "Std.-Satz" }), _jsx("th", { style: th, children: "Projekte" }), _jsx("th", { style: th, children: "Abl\u00E4ufe" })] }) }), _jsxs("tbody", { children: [filtered().map(e => {
                                            const exp = Math.min(...[
                                                ...(e.certs || []).map(c => daysLeft(c.validUntil)),
                                                e.contractEnd ? daysLeft(e.contractEnd) : Infinity
                                            ]);
                                            const warn = isFinite(exp) && exp <= 30;
                                            return (_jsxs("tr", { onClick: () => setSel(e), style: { cursor: "pointer", background: sel?.id === e.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: _jsx("b", { children: e.name }) }), _jsx("td", { style: td, children: e.role || "—" }), _jsx("td", { style: td, children: e.email || "—" }), _jsx("td", { style: td, children: e.hourlyRate ? `${e.hourlyRate.toFixed(2)} €` : "—" }), _jsx("td", { style: td, children: (e.projects || []).join(", ") || "—" }), _jsx("td", { style: td, children: warn ? `⚠️ ${exp} Tg.` : "—" })] }, e.id));
                                        }), filtered().length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 6, children: "Keine Mitarbeiter." }) })] })] }) }), _jsx("div", { className: "card", onDragOver: e => e.preventDefault(), onDrop: onDrop, style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Mitarbeiter w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: sel.name, onChange: e => up({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "Rolle" }), _jsx("input", { style: inp, value: sel.role ?? "", onChange: e => up({ role: e.target.value }) }), _jsx("label", { style: lbl, children: "E-Mail" }), _jsx("input", { style: inp, value: sel.email ?? "", onChange: e => up({ email: e.target.value }) }), _jsx("label", { style: lbl, children: "Telefon" }), _jsx("input", { style: inp, value: sel.phone ?? "", onChange: e => up({ phone: e.target.value }) }), _jsx("label", { style: lbl, children: "Kostenstelle" }), _jsx("input", { style: inp, value: sel.costCenter ?? "", onChange: e => up({ costCenter: e.target.value }) }), _jsx("label", { style: lbl, children: "Std.-Satz (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", style: inp, value: sel.hourlyRate ?? 0, onChange: e => up({ hourlyRate: +e.target.value }) }), _jsx("label", { style: lbl, children: "Projekte" }), _jsx("input", { style: inp, placeholder: "P001, P002", value: (sel.projects ?? []).join(", "), onChange: e => up({ projects: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }) }), _jsx("label", { style: lbl, children: "Anstellung" }), _jsxs("select", { style: inp, value: sel.employmentType ?? "Vollzeit", onChange: e => up({ employmentType: e.target.value }), children: [_jsx("option", { children: "Vollzeit" }), _jsx("option", { children: "Teilzeit" }), _jsx("option", { children: "Werkvertrag" }), _jsx("option", { children: "Praktikum" })] }), _jsx("label", { style: lbl, children: "Vertragsbeginn" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.contractStart), onChange: e => up({ contractStart: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Vertragsende" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.contractEnd), onChange: e => up({ contractEnd: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Urlaub (gesamt)" }), _jsx("input", { type: "number", style: inp, value: sel.vacationTotal ?? 25, onChange: e => up({ vacationTotal: +e.target.value }) }), _jsx("label", { style: lbl, children: "Urlaub (genommen)" }), _jsx("input", { type: "number", style: inp, value: sel.vacationTaken ?? 0, onChange: e => up({ vacationTaken: +e.target.value }) }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Zertifikate & Schulungen" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gap: 6 }, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: addCert, children: "+ Zertifikat" }), _jsx("small", { style: { opacity: .7 }, children: "Warnung bei Ablauf <= 30 Tage" })] }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Bezeichnung" }), _jsx("th", { style: th, children: "g\u00FCltig bis" }), _jsx("th", { style: th })] }) }), _jsxs("tbody", { children: [(sel.certs || []).map(c => {
                                                            const d = expWarn(c.validUntil);
                                                            const warn = d !== null && d <= 30;
                                                            return (_jsxs("tr", { style: { background: warn ? "#fff3f0" : undefined }, children: [_jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: c.name, onChange: e => up({ certs: (sel.certs || []).map(x => x.id === c.id ? { ...c, name: e.target.value } : x) }) }) }), _jsxs("td", { style: td, children: [_jsx("input", { type: "date", style: inp, value: toDateInput(c.validUntil), onChange: e => up({ certs: (sel.certs || []).map(x => x.id === c.id ? { ...c, validUntil: new Date(e.target.value).toISOString() } : x) }) }), warn && _jsxs("span", { style: { marginLeft: 8, color: "#c03" }, children: ["\u26A0 ", d, " Tg"] })] }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { className: "btn", onClick: () => delCert(c.id), children: "Entfernen" }) })] }, c.id));
                                                        }), (sel.certs || []).length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 3, children: "Keine Zertifikate." }) })] })] })] }), _jsx("label", { style: { ...lbl, gridColumn: "1 / -1" }, children: "Dokumente (Drag&Drop hier)" }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }, children: [(sel.attachments || []).map(a => (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }, children: [_jsxs("div", { style: { padding: "6px 8px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("b", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: a.name }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), ((a.mime || "").startsWith("image/")) && _jsx("img", { src: a.dataURL, alt: a.name, style: { width: "100%", height: "auto" } })] }, a.id))), (sel.attachments || []).length === 0 && _jsx("div", { style: { opacity: .6 }, children: "Keine Anh\u00E4nge." })] })] })) })] })] }));
}
/* utils */
function daysLeft(iso) { const d = (new Date(iso).getTime() - Date.now()) / 86400000; return Math.ceil(d); }
function toDateInput(iso) { if (!iso)
    return ""; const d = new Date(iso); const p = (n) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function pickFile(onPick) { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files?.[0]; if (f)
    onPick(f); }; i.click(); }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
