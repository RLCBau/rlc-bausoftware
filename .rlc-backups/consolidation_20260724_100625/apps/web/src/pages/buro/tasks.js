import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { BuroAPI } from "../../lib/buro/store";
const shell = {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "16px 20px",
    fontFamily: "Inter, system-ui, Arial",
};
const h1 = {
    fontSize: 20,
    fontWeight: 600,
    margin: "0 0 14px 0",
};
const toolbar = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 12,
};
const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
};
const head = {
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid #e3e3e3",
    background: "#fafafa",
    fontWeight: 600,
};
const cell = {
    padding: "8px",
    borderBottom: "1px solid #efefef",
    verticalAlign: "top",
};
const badge = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    border: "1px solid #dbe1ff",
};
export default function TasksPage() {
    const [query, setQuery] = useState("");
    const [openOnly, setOpenOnly] = useState(false);
    const tasks = BuroAPI.use((s) => s.tasks);
    const filtered = useMemo(() => {
        let list = tasks;
        if (openOnly)
            list = list.filter((t) => !t.done);
        if (query.trim()) {
            const q = query.toLowerCase();
            list = list.filter((t) => t.title.toLowerCase().includes(q) ||
                (t.assignee || "").toLowerCase().includes(q) ||
                (t.projectId || "").toLowerCase().includes(q));
        }
        return list;
    }, [tasks, query, openOnly]);
    const addQuick = () => {
        const title = prompt("Neue Aufgabe:");
        if (!title)
            return;
        BuroAPI.addTask({ title });
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h1", { style: h1, children: "B\u00FCro \u2192 Aufgaben" }), _jsxs("div", { style: toolbar, children: [_jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Suche: Titel / Verantwortlich / Projekt \u2026", style: { padding: "6px 8px", fontSize: 13, minWidth: 280 } }), _jsxs("label", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: openOnly, onChange: (e) => setOpenOnly(e.target.checked) }), "Nur offene"] }), _jsx("button", { onClick: addQuick, style: { padding: "6px 10px" }, children: "+ Neue Aufgabe" }), _jsxs("div", { style: { marginLeft: "auto", ...badge }, children: ["Offen: ", tasks.filter((t) => !t.done).length] })] }), _jsxs("table", { style: tableStyle, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Titel" }), _jsx("th", { style: head, children: "F\u00E4llig" }), _jsx("th", { style: head, children: "Projekt" }), _jsx("th", { style: head, children: "Zust\u00E4ndig" }), _jsx("th", { style: head, children: "Prio" }), _jsx("th", { style: head, children: "Erledigt" }), _jsx("th", { style: head, children: "Aktion" })] }) }), _jsxs("tbody", { children: [filtered.map((t) => (_jsxs("tr", { children: [_jsx("td", { style: cell, children: t.title }), _jsx("td", { style: cell, children: t.due || "—" }), _jsx("td", { style: cell, children: t.projectId || "—" }), _jsx("td", { style: cell, children: t.assignee || "—" }), _jsx("td", { style: cell, children: t.priority || "—" }), _jsx("td", { style: cell, children: _jsx("input", { type: "checkbox", checked: t.done, onChange: () => BuroAPI.toggleTask(t.id) }) }), _jsxs("td", { style: cell, children: [_jsx("button", { onClick: () => BuroAPI.updateTask(t.id, {
                                                    title: prompt("Titel ändern:", t.title) || t.title,
                                                }), style: { marginRight: 6 }, children: "Bearbeiten" }), _jsx("button", { onClick: () => BuroAPI.updateTask(t.id, { done: true }), disabled: t.done, style: { marginRight: 6 }, children: "\u2713 Abschlie\u00DFen" })] })] }, t.id))), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { style: cell, colSpan: 7, children: "Keine Aufgaben gefunden." }) }))] })] })] }));
}
