import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { PersonalDB } from "./store.personal";
import { MachinesDB } from "./store.machines";
import { ResDB } from "./store.ressourcen";
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
function monday(d = new Date()) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return d.toISOString().slice(0, 10); }
export default function Ressourcenplanung() {
    const [week0, setWeek0] = React.useState(monday());
    const [people, setPeople] = React.useState(PersonalDB.list());
    const [machines, setMachines] = React.useState(MachinesDB.list());
    const [assign, setAssign] = React.useState(ResDB.list());
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const refresh = () => { setPeople(PersonalDB.list()); setMachines(MachinesDB.list()); setAssign(ResDB.list()); };
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(week0, i));
    const dayKeys = days.map(ymd);
    const resources = [...people.map(p => ({ kind: "emp", id: p.id, name: p.name })),
        ...machines.map(m => ({ kind: "mac", id: m.id, name: m.name || m.serial || "Maschine" }))]
        .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));
    const projects = Array.from(new Set(assign.map(a => a.projectId).filter(Boolean))).sort();
    const cellData = (rId, day) => assign.filter(a => a.resourceId === rId && a.date === day && (!proj || a.projectId === proj));
    const sumDay = (rId, day) => cellData(rId, day).reduce((s, a) => s + (a.hours || 0), 0);
    const newAssign = (rId, date) => {
        const a = { id: crypto.randomUUID(), resourceId: rId, date, projectId: "", hours: 8, notes: "" };
        ResDB.upsert(a);
        refresh();
    };
    const upd = (patch) => { ResDB.upsert(patch); setAssign(ResDB.list()); };
    const del = (id) => { ResDB.remove(id); setAssign(ResDB.list()); };
    const prevWeek = () => setWeek0(addDays(week0, -7));
    const nextWeek = () => setWeek0(addDays(week0, 7));
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: prevWeek, children: "\u25C0 KW" }), _jsx("div", { style: { fontWeight: 700 }, children: `KW ${kw(week0)}  (${ymd(days[0])} – ${ymd(days[6])})` }), _jsx("button", { className: "btn", onClick: nextWeek, children: "KW \u25B6" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Ressource\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 220 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 180 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: () => { ResDB.clearWeek(dayKeys); refresh(); }, children: "Woche leeren" }), _jsx("button", { className: "btn", onClick: () => download("text/csv;charset=utf-8", "ressourcen.csv", ResDB.exportCSV(assign)), children: "Export CSV" })] }), _jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { ...th, width: 240 }, children: "Ressource" }), days.map((d, i) => _jsx("th", { style: th, children: d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" }) }, i)), _jsx("th", { style: th, children: "\u03A3 Woche" })] }) }), _jsxs("tbody", { children: [resources.map(r => {
                                    const weekSum = dayKeys.reduce((s, k) => s + sumDay(r.id, k), 0);
                                    return (_jsxs("tr", { children: [_jsxs("td", { style: td, children: [_jsx("b", { children: r.name }), " ", _jsxs("span", { style: { opacity: .6, fontSize: 12 }, children: ["(", r.kind === "emp" ? "MA" : "Maschine", ")"] })] }), dayKeys.map((k, idx) => {
                                                const sum = sumDay(r.id, k);
                                                const over = (r.kind === "emp" && sum > 8);
                                                const items = cellData(r.id, k);
                                                return (_jsxs("td", { style: { ...td, verticalAlign: "top", background: over ? "#fff3f0" : undefined }, children: [items.map(a => (_jsxs("div", { style: { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", marginBottom: 6, background: "#fafafa" }, children: [_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [_jsx("input", { style: { ...inp, width: 90 }, placeholder: "Projekt", value: a.projectId, onChange: e => upd({ ...a, projectId: e.target.value }) }), _jsx("input", { type: "number", min: 0, max: 24, style: { ...inp, width: 70 }, value: a.hours, onChange: e => upd({ ...a, hours: +e.target.value }) }), _jsx("button", { className: "btn", onClick: () => del(a.id), children: "\u2715" })] }), _jsx("input", { style: { ...inp, marginTop: 6, width: "100%" }, placeholder: "Notiz", value: a.notes ?? "", onChange: e => upd({ ...a, notes: e.target.value }) })] }, a.id))), _jsx("button", { className: "btn", onClick: () => newAssign(r.id, k), children: "+ Eintrag" }), sum > 0 && _jsxs("div", { style: { marginTop: 4, fontSize: 12, opacity: .7 }, children: ["\u03A3 ", sum, "h"] })] }, idx));
                                            }), _jsxs("td", { style: { ...td, fontWeight: 700 }, children: [weekSum, "h"] })] }, r.id));
                                }), resources.length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 9, children: "Keine Ressourcen gefunden." }) })] })] }) })] }));
}
function kw(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - n + 3); const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t.getTime() - f.getTime()) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
