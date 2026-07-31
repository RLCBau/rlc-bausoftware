import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { ProjekteDB } from "./store";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const lbl = { fontSize: 13, opacity: .8 };
const inpB = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const inpN = { ...inpB, width: 220 };
const inpS = { ...inpB, width: 150 };
export default function Projekte() {
    const [all, setAll] = React.useState(ProjekteDB.list());
    const [sel, setSel] = React.useState(all[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [status, setStatus] = React.useState("alle");
    const selected = all.find(p => p.id === sel) ?? null;
    const refresh = () => setAll(ProjekteDB.list());
    const add = () => {
        const p = ProjekteDB.create();
        refresh();
        setSel(p.id);
    };
    const dup = () => {
        if (!selected)
            return;
        const copy = { ...selected, id: crypto.randomUUID(), name: selected.name + " (Kopie)" };
        ProjekteDB.upsert(copy);
        refresh();
        setSel(copy.id);
    };
    const del = () => {
        if (!selected)
            return;
        if (!confirm("Projekt löschen?"))
            return;
        ProjekteDB.remove(selected.id);
        const nxt = ProjekteDB.list();
        setAll(nxt);
        setSel(nxt[0]?.id ?? null);
    };
    const update = (patch) => {
        if (!selected)
            return;
        ProjekteDB.upsert({ ...selected, ...patch });
        refresh();
    };
    const filtered = all.filter(p => {
        const s = (p.name + " " + (p.baustellenNummer ?? "") + " " + (p.ort ?? "") + " " + (p.bauleiter ?? "")).toLowerCase();
        const okQ = !q || s.includes(q.toLowerCase());
        const okS = status === "alle" ? true : p.status === status;
        return okQ && okS;
    });
    const exportCSV = () => {
        const csv = ProjekteDB.exportCSV(filtered);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "projekte.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    };
    const importCSV = async () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".csv,text/csv";
        inp.onchange = async () => {
            const f = inp.files?.[0];
            if (!f)
                return;
            const txt = await f.text();
            const n = ProjekteDB.importCSV(txt);
            alert(`${n} Projekte importiert.`);
            refresh();
        };
        inp.click();
    };
    return (_jsxs("div", { className: "card", style: { padding: 0 }, children: [_jsxs("div", { style: { display: "flex", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--line)" }, children: [_jsx("button", { className: "btn", onClick: add, children: "+ Projekt" }), _jsx("button", { className: "btn", onClick: dup, disabled: !selected, children: "Duplizieren" }), _jsx("button", { className: "btn", onClick: del, disabled: !selected, children: "L\u00F6schen" }), _jsx("div", { style: { flex: 1 } }), _jsx("input", { placeholder: "Suchen\u2026", value: q, onChange: e => setQ(e.target.value), style: { ...inpN, width: 260 } }), _jsxs("select", { value: status, onChange: e => setStatus(e.target.value), style: inpS, children: [_jsx("option", { value: "alle", children: "Alle" }), _jsx("option", { value: "aktiv", children: "Aktiv" }), _jsx("option", { value: "archiv", children: "Archiv" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" })] }), _jsxs("div", { style: { display: "grid", gridTemplateRows: "minmax(220px, 44vh) auto", gap: 10, padding: 10 }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name" }), _jsx("th", { style: th, children: "Baustellen-Nr." }), _jsx("th", { style: th, children: "Ort" }), _jsx("th", { style: th, children: "Bauleiter" }), _jsx("th", { style: th, children: "Status" }), _jsx("th", { style: th, children: "Erstellt" })] }) }), _jsx("tbody", { children: filtered.map(p => (_jsxs("tr", { onClick: () => setSel(p.id), style: { cursor: "pointer", background: p.id === sel ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: p.name }), _jsx("td", { style: td, children: p.baustellenNummer }), _jsx("td", { style: td, children: p.ort }), _jsx("td", { style: td, children: p.bauleiter }), _jsx("td", { style: { ...td, fontWeight: 600 }, children: p.status }), _jsx("td", { style: td, children: new Date(p.createdAt).toLocaleDateString() })] }, p.id))) })] }) }), _jsx("div", { className: "card", style: { padding: 12 }, children: !selected ? (_jsx("div", { style: { opacity: .7 }, children: "W\u00E4hle links ein Projekt aus oder erstelle ein neues." })) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "150px 1fr 150px 1fr", gap: 10, alignItems: "start" }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: { ...inpB, width: "100%" }, value: selected.name, onChange: e => update({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "Baustellen-Nr." }), _jsx("input", { style: inpS, value: selected.baustellenNummer ?? "", onChange: e => update({ baustellenNummer: e.target.value }) }), _jsx("label", { style: lbl, children: "Ort" }), _jsx("input", { style: inpS, value: selected.ort ?? "", onChange: e => update({ ort: e.target.value }) }), _jsx("label", { style: lbl, children: "Bauleiter" }), _jsx("input", { style: inpS, value: selected.bauleiter ?? "", onChange: e => update({ bauleiter: e.target.value }) }), _jsx("label", { style: lbl, children: "Status" }), _jsxs("select", { style: inpS, value: selected.status, onChange: e => update({ status: e.target.value }), children: [_jsx("option", { value: "aktiv", children: "Aktiv" }), _jsx("option", { value: "archiv", children: "Archiv" })] }), _jsx("label", { style: lbl, children: "Erstellt" }), _jsx("div", { children: new Date(selected.createdAt).toLocaleString() }), _jsx("label", { style: lbl, children: "Ge\u00E4ndert" }), _jsx("div", { children: new Date(selected.updatedAt).toLocaleString() })] })) })] })] }));
}
