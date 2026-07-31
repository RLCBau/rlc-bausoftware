import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { UserDB } from "./store.users";
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "middle" };
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: .8 };
export default function Nutzerverwaltung() {
    const [all, setAll] = React.useState(UserDB.list());
    const [sel, setSel] = React.useState(null);
    const refresh = () => setAll(UserDB.list());
    const newUser = () => { const u = UserDB.create(); refresh(); setSel(u); };
    const del = () => { if (!sel)
        return; if (!confirm("Benutzer löschen?"))
        return; UserDB.remove(sel.id); refresh(); setSel(null); };
    const update = (p) => { if (!sel)
        return; UserDB.upsert({ ...sel, ...p }); refresh(); };
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }, children: [_jsxs("div", { className: "card", style: { padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { className: "btn", onClick: newUser, children: "+ Neuer Benutzer" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr min(40vw,600px)", gap: 10 }, children: [_jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Name" }), _jsx("th", { style: th, children: "Rolle" }), _jsx("th", { style: th, children: "E-Mail" }), _jsx("th", { style: th, children: "Aktiv" })] }) }), _jsx("tbody", { children: all.map(u => (_jsxs("tr", { onClick: () => setSel(u), style: { cursor: "pointer", background: sel?.id === u.id ? "#f1f5ff" : undefined }, children: [_jsx("td", { style: td, children: u.name }), _jsx("td", { style: td, children: u.role }), _jsx("td", { style: td, children: u.email }), _jsx("td", { style: td, children: u.active ? "✔️" : "—" })] }, u.id))) })] }) }), _jsx("div", { className: "card", style: { padding: 12 }, children: !sel ? (_jsx("div", { style: { opacity: .7 }, children: "Links Benutzer ausw\u00E4hlen oder neu anlegen." })) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }, children: [_jsx("label", { style: lbl, children: "Name" }), _jsx("input", { style: inp, value: sel.name, onChange: e => update({ name: e.target.value }) }), _jsx("label", { style: lbl, children: "E-Mail" }), _jsx("input", { style: inp, value: sel.email, onChange: e => update({ email: e.target.value }) }), _jsx("label", { style: lbl, children: "Rolle" }), _jsxs("select", { style: inp, value: sel.role, onChange: e => update({ role: e.target.value }), children: [_jsx("option", { children: "Admin" }), _jsx("option", { children: "Bauleiter" }), _jsx("option", { children: "Polier" }), _jsx("option", { children: "Mitarbeiter" }), _jsx("option", { children: "Leser" })] }), _jsx("label", { style: lbl, children: "Aktiv" }), _jsx("input", { type: "checkbox", checked: sel.active, onChange: e => update({ active: e.target.checked }) }), _jsx("label", { style: lbl, children: "Berechtigungen" }), _jsx("textarea", { style: { ...inp, gridColumn: "1 / -1", minHeight: 80 }, value: (sel.rights ?? []).join(", "), onChange: e => update({ rights: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }) })] })) })] })] }));
}
