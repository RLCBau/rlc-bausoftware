import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { GanttDB } from "././store.gantt";
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
export default function Bauzeitenplan() {
    const [all, setAll] = React.useState(GanttDB.list());
    const [sel, setSel] = React.useState(null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [zoom, setZoom] = React.useState("week");
    const refresh = () => setAll(GanttDB.list());
    const filtered = () => all.filter(t => {
        const s = (t.name + " " + (t.projectId ?? "")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okP = !proj || (t.projectId ?? "") === proj;
        return okQ && okP;
    });
    const projects = Array.from(new Set(all.map(t => t.projectId).filter(Boolean)));
    const newTask = () => { const t = GanttDB.create(); refresh(); setSel(t); };
    const del = () => { if (!sel)
        return; if (!confirm("Vorgang löschen?"))
        return; GanttDB.remove(sel.id); refresh(); setSel(null); };
    const update = (p) => { if (!sel)
        return; GanttDB.upsert({ ...sel, ...p }); refresh(); };
    const exportCSV = () => download("text/csv;charset=utf-8", "bauzeitenplan.csv", GanttDB.exportCSV(filtered()));
    const importCSV = () => pickFile(async (f) => { const n = GanttDB.importCSV(await f.text()); alert(`Import: ${n} Vorgänge.`); refresh(); });
    // ---- GANTT RENDER ----
    const tasks = filtered().slice().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const minDate = tasks.length ? new Date(Math.min(...tasks.map(t => new Date(t.start).getTime()))) : new Date();
    const maxDate = tasks.length ? new Date(Math.max(...tasks.map(t => new Date(t.end).getTime()))) : new Date();
    const padDays = 7;
    const start = new Date(minDate.getTime() - padDays * 86400000);
    const end = new Date(maxDate.getTime() + padDays * 86400000);
    const dayWidth = zoom === "day" ? 28 : zoom === "week" ? 16 : 8; // px per day
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const width = totalDays * dayWidth + 140;
    const rowH = 28;
    const xFor = (iso) => {
        const d = new Date(iso);
        const days = (d.getTime() - start.getTime()) / 86400000;
        return 140 + days * dayWidth;
    };
    const wFor = (a, b) => Math.max(6, (new Date(b).getTime() - new Date(a).getTime()) / 86400000 * dayWidth);
    const gridMarks = [];
    (function buildGrid() {
        const d = new Date(start);
        while (d <= end) {
            const x = 140 + ((d.getTime() - start.getTime()) / 86400000) * dayWidth;
            let label = "";
            if (zoom === "day")
                label = `${d.getDate()}.${d.getMonth() + 1}.`;
            else if (zoom === "week")
                label = `KW ${weekNumber(d)}`;
            else
                label = `${d.getMonth() + 1}/${d.getFullYear()}`;
            gridMarks.push({ x, label });
            if (zoom === "day")
                d.setDate(d.getDate() + 1);
            else if (zoom === "week")
                d.setDate(d.getDate() + 7);
            else {
                d.setMonth(d.getMonth() + 1);
                d.setDate(1);
            }
        }
    })();
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: newTask, children: "+ Neuer Vorgang" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suche Vorgang / Projekt\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inp, width: 280 } }), _jsxs("select", { value: proj, onChange: e => setProj(e.target.value), style: { ...inp, width: 160 }, children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map(p => _jsx("option", { value: p, children: p }, p))] }), _jsxs("select", { value: zoom, onChange: e => setZoom(e.target.value), style: { ...inp, width: 140 }, children: [_jsx("option", { value: "day", children: "Tag" }), _jsx("option", { value: "week", children: "Woche" }), _jsx("option", { value: "month", children: "Monat" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(420px, 44vw) 1fr", gap: 10, minHeight: "52vh" }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Vorgang" }), _jsx("th", { style: th, children: "Projekt" }), _jsx("th", { style: th, children: "Start" }), _jsx("th", { style: th, children: "Ende" }), _jsx("th", { style: th, children: "Fortschritt" })] }) }), _jsxs("tbody", { children: [tasks.map(t => (_jsxs("tr", { onClick: () => setSel(t), style: { cursor: "pointer", background: sel?.id === t.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: t.name }), _jsx("td", { style: td, children: t.projectId || "—" }), _jsx("td", { style: td, children: fmt(t.start) }), _jsx("td", { style: td, children: fmt(t.end) }), _jsxs("td", { style: td, children: [t.progress ?? 0, "%"] })] }, t.id))), tasks.length === 0 && _jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 5, children: "Keine Vorg\u00E4nge." }) })] })] }) }), _jsx("div", { className: "card", style: { padding: 12 }, children: !sel ? _jsx("div", { style: { opacity: .7 }, children: "Links Vorgang w\u00E4hlen oder neu anlegen." }) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr 120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Vorgang" }), _jsx("input", { style: inp, value: sel.name, onChange: e => update({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "Projekt-ID" }), _jsx("input", { style: inp, value: sel.projectId ?? "", onChange: e => update({ projectId: e.target.value }) }), _jsx("label", { style: lbl, children: "Start" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.start), onChange: e => update({ start: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Ende" }), _jsx("input", { type: "date", style: inp, value: toDateInput(sel.end), onChange: e => update({ end: new Date(e.target.value).toISOString() }) }), _jsx("label", { style: lbl, children: "Fortschritt" }), _jsx("input", { type: "number", min: 0, max: 100, style: inp, value: sel.progress ?? 0, onChange: e => update({ progress: clamp(+e.target.value, 0, 100) }) }), _jsx("label", { style: lbl, children: "Abh\u00E4ngigkeiten" }), _jsx("input", { style: inp, placeholder: "IDs kommagetrennt", value: (sel.dependsOn ?? []).join(", "), onChange: e => update({ dependsOn: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }) }), _jsx("label", { style: lbl, children: "Notizen" }), _jsx("textarea", { style: { ...inp, gridColumn: "1 / -1", minHeight: 80 }, value: sel.notes ?? "", onChange: e => update({ notes: e.target.value }) })] })) })] }), _jsx("div", { className: "card", style: { overflow: "auto" }, children: _jsxs("svg", { width: width, height: Math.max(120, (tasks.length + 1) * rowH + 40), children: [_jsx("rect", { x: 0, y: 0, width: width, height: 32, fill: "#f7f8fb" }), _jsx("rect", { x: 0, y: 0, width: 140, height: "100%", fill: "#fafafa", stroke: "var(--line)" }), _jsx("text", { x: 12, y: 22, fontSize: "12", fontWeight: 700, children: "Vorgang" }), gridMarks.map((m, i) => (_jsxs("g", { children: [_jsx("line", { x1: m.x, y1: 0, x2: m.x, y2: 10000, stroke: "#eceff3" }), _jsx("text", { x: m.x + 4, y: 22, fontSize: "11", fill: "#61708b", children: m.label })] }, i))), tasks.map((t, idx) => (_jsxs("g", { children: [_jsx("line", { x1: 0, y1: 32 + idx * rowH, x2: width, y2: 32 + idx * rowH, stroke: "#f0f2f7" }), _jsx("text", { x: 12, y: 32 + idx * rowH + 18, fontSize: "12", children: t.name })] }, t.id))), tasks.map((t, idx) => {
                            const x = xFor(t.start);
                            const w = wFor(t.start, t.end);
                            const y = 32 + idx * rowH + 6;
                            const h = rowH - 12;
                            const progW = (Math.max(0, Math.min(100, t.progress ?? 0)) / 100) * w;
                            return (_jsxs("g", { children: [(t.dependsOn || []).map((depId, i) => {
                                        const dep = tasks.find(x => x.id === depId);
                                        if (!dep)
                                            return null;
                                        const dx = xFor(dep.end);
                                        const dy = 32 + tasks.findIndex(x => x.id === dep.id) * rowH + rowH / 2;
                                        const tx = x;
                                        const ty = y + h / 2;
                                        return _jsx("path", { d: `M ${dx} ${dy} L ${tx - 6} ${ty}`, stroke: "#b7c3d6", fill: "none", markerEnd: "url(#arrow)" }, i);
                                    }), _jsx("rect", { x: x, y: y, width: w, height: h, rx: 4, ry: 4, fill: "#dbe7ff", stroke: "#88aaff" }), _jsx("rect", { x: x, y: y, width: progW, height: h, rx: 4, ry: 4, fill: "#9fc2ff" }), _jsxs("text", { x: x + 4, y: y + h / 2 + 4, fontSize: "11", children: [t.progress ?? 0, "%"] })] }, t.id));
                        }), (() => { const todayX = xFor(new Date().toISOString()); return _jsx("line", { x1: todayX, y1: 0, x2: todayX, y2: 10000, stroke: "#ff6b6b", strokeDasharray: "4 4" }); })(), _jsx("defs", { children: _jsx("marker", { id: "arrow", markerWidth: "10", markerHeight: "6", refX: "10", refY: "3", orient: "auto", children: _jsx("path", { d: "M 0 0 L 10 3 L 0 6 z", fill: "#b7c3d6" }) }) })] }) })] }));
}
/* utils */
function fmt(iso) { return iso ? new Date(iso).toLocaleDateString() : "—"; }
function toDateInput(iso) { if (!iso)
    return ""; const d = new Date(iso); const p = (n) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function weekNumber(d) { const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); const first = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); return 1 + Math.round(((dt.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7); }
function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
function pickFile(onPick) { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files?.[0]; if (f)
    onPick(f); }; i.click(); }
function download(type, name, data) { const b = new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
