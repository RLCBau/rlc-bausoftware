import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { CalendarDB } from "./store.calendar";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
export default function OutlookKalender() {
    const [all, setAll] = React.useState(CalendarDB.list());
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [showForm, setShowForm] = React.useState(false);
    const [draft, setDraft] = React.useState(CalendarDB.blank());
    const refresh = () => setAll(CalendarDB.list());
    const filtered = () => all.filter(e => {
        const text = (e.title + " " + (e.projectId ?? "") + " " + (e.location ?? "")).toLowerCase();
        const okQ = !q || text.includes(q.toLowerCase());
        const okP = !proj || (e.projectId ?? "") === proj;
        return okQ && okP;
    });
    const projects = Array.from(new Set(all.map(e => e.projectId).filter(Boolean)));
    const openForm = (e) => { setDraft(e ? { ...e } : CalendarDB.blank()); setShowForm(true); };
    const save = () => { CalendarDB.upsert(draft); setShowForm(false); refresh(); };
    const del = (id) => { if (!confirm("Termin löschen?"))
        return; CalendarDB.remove(id); refresh(); };
    const importICS = () => pickFile(async (f) => { const txt = await f.text(); const n = CalendarDB.importICS(txt); alert(`Import: ${n} Termine.`); refresh(); });
    const exportICS = () => downloadBlob(CalendarDB.exportICS(filtered()), "kalender_export.ics", "text/calendar;charset=utf-8");
    const openOutlookDesktop = () => {
        const ics = CalendarDB.exportICS(filtered());
        const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "RLC_Kalender.ics";
        a.click();
        URL.revokeObjectURL(url);
    };
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: () => openForm(), children: "+ Neuer Termin" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Titel / Ort / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 280 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: importICS, children: "Import .ics" }), _jsx("button", { className: "btn", onClick: exportICS, children: "Export .ics" }), _jsx("button", { className: "btn", onClick: openOutlookDesktop, children: "In Outlook/Google \u00F6ffnen" })] }), _jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Beginn" }), _jsx("th", { style: th, children: "Ende" }), _jsx("th", { style: th, children: "Titel" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Ort" }), _jsx("th", { style: th, children: "Teilnehmer" }), _jsx("th", { style: th })] }) }), _jsxs("tbody", { children: [filtered().map(ev => (_jsxs("tr", { children: [_jsx("td", { style: td, children: fmt(ev.start) }), _jsx("td", { style: td, children: fmt(ev.end) }), _jsx("td", { style: td, children: _jsx("b", { children: ev.title }) }), _jsx("td", { style: td, children: ev.projectId || "—" }), _jsx("td", { style: td, children: ev.location || "—" }), _jsx("td", { style: td, children: (ev.attendees ?? []).join(", ") }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap" }, children: [_jsx("button", { className: "btn", onClick: () => openForm(ev), children: "Bearbeiten" }), _jsx("button", { className: "btn", onClick: () => del(ev.id), children: "L\u00F6schen" })] })] }, ev.id))), filtered().length === 0 && (_jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 7, children: "Keine Termine." }) }))] })] }) }), showForm && (_jsx(Modal, { onClose: () => setShowForm(false), children: _jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Titel" }), _jsx("input", { style: inp, value: draft.title, onChange: e => setDraft({ ...draft, title: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: draft.projectId ?? "", onChange: e => setDraft({ ...draft, projectId: e.target.value }) }), _jsx("label", { style: lbl, children: "Beginn" }), _jsx("input", { style: inp, type: "datetime-local", value: toLocalInput(draft.start), onChange: e => setDraft({ ...draft, start: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Ende" }), _jsx("input", { style: inp, type: "datetime-local", value: toLocalInput(draft.end), onChange: e => setDraft({ ...draft, end: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Ort" }), _jsx("input", { style: inp, value: draft.location ?? "", onChange: e => setDraft({ ...draft, location: e.target.value }) }), _jsx("label", { style: lbl, children: "Teilnehmer" }), _jsx("input", { style: inp, placeholder: "mail1@..., mail2@...", value: (draft.attendees ?? []).join(", "), onChange: e => setDraft({ ...draft, attendees: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }) }), _jsx("label", { style: lbl, children: "Beschreibung" }), _jsx("textarea", { style: { ...inp, gridColumn: "1 / -1", minHeight: 100 }, value: draft.notes ?? "", onChange: e => setDraft({ ...draft, notes: e.target.value }) }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }, children: [_jsx("button", { className: "btn", onClick: () => setShowForm(false), children: "Abbrechen" }), _jsx("button", { className: "btn", onClick: save, children: "Speichern" })] })] }) }))] }));
}
/* ==== Utils ==== */
function fmt(iso) { return iso ? new Date(iso).toLocaleString() : "—"; }
function toLocalInput(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    const pad = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pickFile(onPick) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.onchange = () => { const f = inp.files?.[0]; if (f)
        onPick(f); };
    inp.click();
}
function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
function Modal({ children, onClose }) {
    return (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 9999 }, children: _jsxs("div", { className: "card", style: { padding: 20, minWidth: 480, background: "#fff", borderRadius: 8 }, children: [children, _jsx("div", { style: { marginTop: 10, textAlign: "right" }, children: _jsx("button", { className: "btn", onClick: onClose, children: "Schlie\u00DFen" }) })] }) }));
}
