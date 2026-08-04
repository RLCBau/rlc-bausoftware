import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { PersonalDB } from "./store.personal";
import { MachinesDB } from "./store.machines";
import { ResDB } from "./store.ressourcen";
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
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
function monday(d = new Date()) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function ymd(d) {
    return d.toISOString().slice(0, 10);
}
export default function Ressourcenplanung() {
    const [week0, setWeek0] = React.useState(monday());
    const [people, setPeople] = React.useState(PersonalDB.list());
    const [machines, setMachines] = React.useState(MachinesDB.list());
    const [assign, setAssign] = React.useState(ResDB.list());
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const refresh = React.useCallback(() => {
        setPeople(PersonalDB.list());
        setMachines(MachinesDB.list());
        setAssign(ResDB.list());
    }, []);
    const days = React.useMemo(() => {
        return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week0, i));
    }, [week0]);
    const dayKeys = React.useMemo(() => days.map(ymd), [days]);
    const resources = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return [
            ...people.map((p) => ({ kind: "emp", id: p.id, name: p.name })),
            ...machines.map((m) => ({
                kind: "mac",
                id: m.id,
                name: m.name || m.serial || "Maschine"
            }))
        ].
            filter((r) => !qq || r.name.toLowerCase().includes(qq));
    }, [people, machines, q]);
    const projects = React.useMemo(() => Array.from(new Set(assign.map((a) => a.projectId).filter(Boolean))).sort(), [assign]);
    const cellData = React.useCallback((rId, day) => {
        return assign.filter((a) => a.resourceId === rId &&
            a.date === day && (!proj || a.projectId === proj));
    }, [assign, proj]);
    const sumDay = React.useCallback((rId, day) => {
        return cellData(rId, day).reduce((s, a) => s + (a.hours || 0), 0);
    }, [cellData]);
    const newAssign = React.useCallback((rId, date) => {
        const a = {
            id: crypto.randomUUID(),
            resourceId: rId,
            date,
            projectId: "",
            hours: 8,
            notes: ""
        };
        ResDB.upsert(a);
        refresh();
    }, [refresh]);
    const upd = React.useCallback((patch) => {
        ResDB.upsert(patch);
        setAssign(ResDB.list());
    }, []);
    const del = React.useCallback((id) => {
        ResDB.remove(id);
        setAssign(ResDB.list());
    }, []);
    const prevWeek = React.useCallback(() => {
        setWeek0((w) => addDays(w, -7));
    }, []);
    const nextWeek = React.useCallback(() => {
        setWeek0((w) => addDays(w, 7));
    }, []);
    const clearWeek = React.useCallback(() => {
        if (!confirm("Diese Woche wirklich komplett leeren?"))
            return;
        ResDB.clearWeek(dayKeys);
        refresh();
    }, [dayKeys, refresh]);
    const exportCsv = React.useCallback(() => {
        download("text/csv;charset=utf-8", "ressourcen.csv", ResDB.exportCSV(assign));
    }, [assign]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-619", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-ressourcenplanung-tsx-620", children: [_jsx("button", { className: "btn", onClick: prevWeek, children: "\u25C0 KW" }), _jsx("div", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-621", children: `KW ${kw(week0)}  (${ymd(days[0])} – ${ymd(days[6])})` }), _jsx("button", { className: "btn", onClick: nextWeek, children: "KW \u25B6" }), _jsx("div", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-622" }), _jsx("input", { placeholder: "Suche Ressource\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 220 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 180 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: clearWeek, children: "Woche leeren" }), _jsx("button", { className: "btn", onClick: exportCsv, children: "Export CSV" })] }), _jsx("div", { className: "card rlc-migrated-pages-buro-ressourcenplanung-tsx-623", children: _jsxs("table", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-624", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, { ...th, width: 240 }), children: "Ressource" }), days.map((d, i) => _jsx("th", { className: rlcClass(null, th), children: d.toLocaleDateString(undefined, {
                                            weekday: "short",
                                            day: "2-digit",
                                            month: "2-digit"
                                        }) }, i)), _jsx("th", { className: rlcClass(null, th), children: "\u03A3 Woche" })] }) }), _jsxs("tbody", { children: [resources.map((r) => {
                                    const weekSum = dayKeys.reduce((s, k) => s + sumDay(r.id, k), 0);
                                    return (_jsxs("tr", { children: [_jsxs("td", { className: rlcClass(null, td), children: [_jsx("b", { children: r.name }), " ", _jsxs("span", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-625", children: ["(", r.kind === "emp" ? "MA" : "Maschine", ")"] })] }), dayKeys.map((k, idx) => {
                                                const sum = sumDay(r.id, k);
                                                const over = r.kind === "emp" && sum > 8;
                                                const items = cellData(r.id, k);
                                                return (_jsxs("td", { className: rlcClass(null, {
                                                        ...td,
                                                        verticalAlign: "top",
                                                        background: over ? "#fff3f0" : undefined
                                                    }), children: [items.map((a) => _jsxs("div", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-626", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-627", children: [_jsx("input", { className: rlcClass(null, { ...inp, width: 90 }), placeholder: "Projekt", value: a.projectId, onChange: (e) => upd({ ...a, projectId: e.target.value }) }), _jsx("input", { type: "number", min: 0, max: 24, className: rlcClass(null, { ...inp, width: 70 }), value: a.hours, onChange: (e) => upd({
                                                                                ...a,
                                                                                hours: Number(e.target.value) || 0
                                                                            }) }), _jsx("button", { className: "btn", onClick: () => del(a.id), children: "\u2715" })] }), _jsx("input", { className: rlcClass(null, { ...inp, marginTop: 6, width: "100%" }), placeholder: "Notiz", value: a.notes ?? "", onChange: (e) => upd({ ...a, notes: e.target.value }) })] }, a.id)), _jsx("button", { className: "btn", onClick: () => newAssign(r.id, k), children: "+ Eintrag" }), sum > 0 &&
                                                            _jsxs("div", { className: "rlc-migrated-pages-buro-ressourcenplanung-tsx-628", children: ["\u03A3 ", sum, "h"] })] }, idx));
                                            }), _jsxs("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: [weekSum, "h"] })] }, r.id));
                                }), resources.length === 0 &&
                                    _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 9, children: "Keine Ressourcen gefunden." }) })] })] }) })] }));
}
function kw(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const n = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - n + 3);
    const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return (1 +
        Math.round(((t.getTime() - f.getTime()) / 86400000 -
            3 +
            (f.getUTCDay() + 6) % 7) /
            7));
}
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
