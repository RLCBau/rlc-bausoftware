import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { SafetyDB } from "./store.sicherheit";
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
const lbl = {
    fontSize: 12,
    opacity: 0.8
};
export default function Sicherheit() {
    const [all, setAll] = React.useState(SafetyDB.list());
    const [selId, setSelId] = React.useState(SafetyDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const refresh = React.useCallback(() => {
        const next = SafetyDB.list();
        setAll(next);
        setSelId((prev) => {
            if (prev && next.some((x) => x.id === prev))
                return prev;
            return next[0]?.id ?? null;
        });
    }, []);
    const sel = React.useMemo(() => all.find((x) => x.id === selId) ?? null, [all, selId]);
    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return all.filter((r) => {
            const s = `${r.title} ${r.person ?? ""} ${r.project ?? ""}`.toLowerCase();
            return !qq || s.includes(qq);
        });
    }, [all, q]);
    const add = React.useCallback(() => {
        const n = SafetyDB.create();
        refresh();
        setSelId(n.id);
    }, [refresh]);
    const del = React.useCallback(() => {
        if (!sel)
            return;
        if (!confirm("Unterweisung löschen?"))
            return;
        SafetyDB.remove(sel.id);
        refresh();
    }, [sel, refresh]);
    const up = React.useCallback((p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        SafetyDB.upsert(next);
        setSelId(next.id);
        refresh();
    }, [sel, refresh]);
    const onDrop = React.useCallback(async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await SafetyDB.attach(sel.id, f);
        refresh();
    }, [sel, refresh]);
    const open = React.useCallback((a) => {
        const w = window.open(a.dataURL, "_blank");
        if (!w)
            alert("Popup blockiert.");
    }, []);
    const exportCSV = React.useCallback(() => {
        download("text/csv;charset=utf-8", "sicherheit.csv", SafetyDB.exportCSV(filtered));
    }, [filtered]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-629", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-sicherheit-tsx-630", children: [_jsx("button", { className: "btn", onClick: add, children: "+ Unterweisung" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-631" }), _jsx("input", { placeholder: "Suche Titel / Person / Projekt\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 260 }) }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-632", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-sicherheit-tsx-633", children: _jsxs("table", { className: "rlc-migrated-pages-buro-sicherheit-tsx-634", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Titel" }), _jsx("th", { className: rlcClass(null, th), children: "Person" }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Datum" }), _jsx("th", { className: rlcClass(null, th), children: "N\u00E4chste Unterweisung" })] }) }), _jsxs("tbody", { children: [filtered.map((r) => {
                                            const warn = daysLeft(r.nextDate) <= 30;
                                            return (_jsxs("tr", { onClick: () => setSelId(r.id), className: rlcClass(null, {
                                                    cursor: "pointer",
                                                    background: sel?.id === r.id ? "#f1f5ff" : undefined
                                                }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: r.title }) }), _jsx("td", { className: rlcClass(null, td), children: r.person || "—" }), _jsx("td", { className: rlcClass(null, td), children: r.project || "—" }), _jsx("td", { className: rlcClass(null, td), children: r.date ? fmt(r.date) : "—" }), _jsx("td", { className: rlcClass(null, { ...td, color: warn ? "#c03" : undefined }), children: r.nextDate ? fmt(r.nextDate) : "—" })] }, r.id));
                                        }), filtered.length === 0 &&
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 5, children: "Keine Unterweisungen." }) })] })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-sicherheit-tsx-635", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: !sel ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-636", children: "Links Unterweisung w\u00E4hlen oder neu anlegen." }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-637", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Titel" }), _jsx("input", { className: rlcClass(null, inp), value: sel.title, onChange: (e) => up({ title: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekt" }), _jsx("input", { className: rlcClass(null, inp), value: sel.project ?? "", onChange: (e) => up({ project: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Person" }), _jsx("input", { className: rlcClass(null, inp), value: sel.person ?? "", onChange: (e) => up({ person: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Datum" }), _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(sel.date), onChange: (e) => up({ date: fromDateInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "N\u00E4chste Unterweisung" }), _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(sel.nextDate), onChange: (e) => up({ nextDate: fromDateInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Bemerkung" }), _jsx("textarea", { className: rlcClass(null, { ...inp, minHeight: 80, resize: "vertical", gridColumn: "1 / -1" }), value: sel.notes ?? "", onChange: (e) => up({ notes: e.target.value }) }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Dokumente / Fotos (Drag&Drop)" }), _jsxs("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-638", children: [(sel.attachments || []).map((a) => _jsxs("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-639", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-640", children: [_jsx("b", { title: a.name, className: "rlc-migrated-pages-buro-sicherheit-tsx-641", children: a.name }), _jsx("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-642" }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), (a.mime || "").startsWith("image/") &&
                                                        _jsx("img", { src: a.dataURL, alt: a.name, className: "rlc-migrated-pages-buro-sicherheit-tsx-643" })] }, a.id)), (sel.attachments || []).length === 0 &&
                                                _jsx("div", { className: "rlc-migrated-pages-buro-sicherheit-tsx-644", children: "Keine Anh\u00E4nge." })] })] }) })] })] }));
}
function fmt(iso) {
    return iso ? new Date(iso).toLocaleDateString() : "—";
}
function daysLeft(iso) {
    if (!iso)
        return Infinity;
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function toDateInput(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    const p = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromDateInput(v) {
    if (!v)
        return "";
    return `${v}T12:00:00.000Z`;
}
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
