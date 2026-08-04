import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useMemo, useState } from "react";
import { BuroAPI } from "../../lib/buro/store";
/* ================= STYLES ================= */
const shell = {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "16px 20px",
    fontFamily: "Inter, system-ui, Arial"
};
const h1 = {
    fontSize: 20,
    fontWeight: 600,
    margin: "0 0 14px 0"
};
const toolbar = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 12
};
const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13
};
const head = {
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid #e3e3e3",
    background: "#fafafa",
    fontWeight: 600
};
const cell = {
    padding: "8px",
    borderBottom: "1px solid #efefef",
    verticalAlign: "top"
};
const badge = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    border: "1px solid #dbe1ff"
};
/* ================= COMPONENT ================= */
export default function TasksPage() {
    const [query, setQuery] = useState("");
    const [openOnly, setOpenOnly] = useState(false);
    const tasks = BuroAPI.use((s) => s.tasks);
    /* ================= FILTER ================= */
    const filtered = useMemo(() => {
        let list = [...tasks];
        if (openOnly) {
            list = list.filter((t) => !t.done);
        }
        if (query.trim()) {
            const q = query.toLowerCase();
            list = list.filter((t) => [
                t.title,
                t.assignee || "",
                t.projectId || ""
            ].
                join(" ").
                toLowerCase().
                includes(q));
        }
        return list;
    }, [tasks, query, openOnly]);
    /* ================= ACTIONS ================= */
    const addQuick = () => {
        const title = prompt("Neue Aufgabe:");
        if (!title?.trim())
            return;
        BuroAPI.addTask({
            title: title.trim(),
            done: false
        });
    };
    const editTask = (t) => {
        const title = prompt("Titel ändern:", t.title);
        if (!title)
            return;
        BuroAPI.updateTask(t.id, { title: title.trim() });
    };
    const openCount = tasks.filter((t) => !t.done).length;
    /* ================= UI ================= */
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h1", { className: rlcClass(null, h1), children: "B\u00FCro \u2192 Aufgaben" }), _jsxs("div", { className: rlcClass(null, toolbar), children: [_jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Suche: Titel / Verantwortlich / Projekt \u2026", className: "rlc-migrated-pages-buro-tasks-tsx-645" }), _jsxs("label", { className: "rlc-migrated-pages-buro-tasks-tsx-646", children: [_jsx("input", { type: "checkbox", checked: openOnly, onChange: (e) => setOpenOnly(e.target.checked) }), "Nur offene"] }), _jsx("button", { onClick: addQuick, className: "rlc-migrated-pages-buro-tasks-tsx-647", children: "+ Neue Aufgabe" }), _jsxs("div", { className: rlcClass(null, { marginLeft: "auto", ...badge }), children: ["Offen: ", openCount] })] }), _jsxs("table", { className: rlcClass(null, tableStyle), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Titel" }), _jsx("th", { className: rlcClass(null, head), children: "F\u00E4llig" }), _jsx("th", { className: rlcClass(null, head), children: "Projekt" }), _jsx("th", { className: rlcClass(null, head), children: "Zust\u00E4ndig" }), _jsx("th", { className: rlcClass(null, head), children: "Prio" }), _jsx("th", { className: rlcClass(null, head), children: "Erledigt" }), _jsx("th", { className: rlcClass(null, head), children: "Aktion" })] }) }), _jsxs("tbody", { children: [filtered.map((t) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, cell), children: t.title || "—" }), _jsx("td", { className: rlcClass(null, cell), children: t.due || "—" }), _jsx("td", { className: rlcClass(null, cell), children: t.projectId || "—" }), _jsx("td", { className: rlcClass(null, cell), children: t.assignee || "—" }), _jsx("td", { className: rlcClass(null, cell), children: t.priority || "—" }), _jsx("td", { className: rlcClass(null, cell), children: _jsx("input", { type: "checkbox", checked: !!t.done, onChange: () => BuroAPI.toggleTask(t.id) }) }), _jsxs("td", { className: rlcClass(null, cell), children: [_jsx("button", { onClick: () => editTask(t), className: "rlc-migrated-pages-buro-tasks-tsx-648", children: "Bearbeiten" }), _jsx("button", { onClick: () => BuroAPI.updateTask(t.id, { done: true }), disabled: t.done, className: "rlc-migrated-pages-buro-tasks-tsx-649", children: "\u2713 Abschlie\u00DFen" })] })] }, t.id)), filtered.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { className: rlcClass(null, cell), colSpan: 7, children: "Keine Aufgaben gefunden." }) })] })] })] }));
}
