import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { ProjekteDB } from "./store";
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
    fontSize: 13,
    opacity: 0.8
};
const inpB = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
const inpN = {
    ...inpB,
    width: 220
};
const inpS = {
    ...inpB,
    width: 150
};
function toDateValue(value) {
    if (value == null || value === "")
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}
function formatDate(value) {
    const d = toDateValue(value);
    return d ? d.toLocaleDateString() : "—";
}
function formatDateTime(value) {
    const d = toDateValue(value);
    return d ? d.toLocaleString() : "—";
}
export default function Projekte() {
    const [all, setAll] = React.useState(ProjekteDB.list());
    const [sel, setSel] = React.useState(ProjekteDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [status, setStatus] = React.useState("alle");
    const refresh = React.useCallback(() => {
        const next = ProjekteDB.list();
        setAll(next);
        setSel((prev) => {
            if (prev && next.some((p) => p.id === prev))
                return prev;
            return next[0]?.id ?? null;
        });
    }, []);
    const selected = React.useMemo(() => all.find((p) => p.id === sel) ?? null, [all, sel]);
    const add = React.useCallback(() => {
        const p = ProjekteDB.create();
        refresh();
        setSel(p.id);
    }, [refresh]);
    const dup = React.useCallback(() => {
        if (!selected)
            return;
        const now = new Date().toISOString();
        const copy = {
            ...selected,
            id: crypto.randomUUID(),
            name: `${selected.name} (Kopie)`,
            createdAt: now,
            updatedAt: now
        };
        ProjekteDB.upsert(copy);
        refresh();
        setSel(copy.id);
    }, [selected, refresh]);
    const del = React.useCallback(() => {
        if (!selected)
            return;
        if (!window.confirm("Projekt löschen?"))
            return;
        ProjekteDB.remove(selected.id);
        refresh();
    }, [selected, refresh]);
    const update = React.useCallback((patch) => {
        if (!selected)
            return;
        const next = {
            ...selected,
            ...patch,
            updatedAt: new Date().toISOString()
        };
        ProjekteDB.upsert(next);
        setSel(next.id);
        refresh();
    }, [selected, refresh]);
    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return all.filter((p) => {
            const s = `${p.name} ${p.baustellenNummer ?? ""} ${p.ort ?? ""} ${p.bauleiter ?? ""}`.toLowerCase();
            const okQ = !qq || s.includes(qq);
            const okS = status === "alle" ? true : p.status === status;
            return okQ && okS;
        });
    }, [all, q, status]);
    const exportCSV = React.useCallback(() => {
        const csv = ProjekteDB.exportCSV(filtered);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "projekte.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    }, [filtered]);
    const importCSV = React.useCallback(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv,text/csv";
        input.onchange = async () => {
            const f = input.files?.[0];
            if (!f)
                return;
            const txt = await f.text();
            const n = ProjekteDB.importCSV(txt);
            window.alert(`${n} Projekte importiert.`);
            refresh();
        };
        input.click();
    }, [refresh]);
    return (_jsxs("div", { className: "card rlc-migrated-pages-buro-projekte-tsx-610", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-projekte-tsx-611", children: [_jsx("button", { className: "btn", onClick: add, children: "+ Projekt" }), _jsx("button", { className: "btn", onClick: dup, disabled: !selected, children: "Duplizieren" }), _jsx("button", { className: "btn", onClick: del, disabled: !selected, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-projekte-tsx-612" }), _jsx("input", { placeholder: "Suchen\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inpN, width: 260 }) }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: rlcClass(null, inpS), children: [_jsx("option", { value: "alle", children: "Alle" }), _jsx("option", { value: "aktiv", children: "Aktiv" }), _jsx("option", { value: "archiv", children: "Archiv" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-projekte-tsx-613", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-projekte-tsx-614", children: _jsxs("table", { className: "rlc-migrated-pages-buro-projekte-tsx-615", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name" }), _jsx("th", { className: rlcClass(null, th), children: "Baustellen-Nr." }), _jsx("th", { className: rlcClass(null, th), children: "Ort" }), _jsx("th", { className: rlcClass(null, th), children: "Bauleiter" }), _jsx("th", { className: rlcClass(null, th), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "Erstellt" })] }) }), _jsx("tbody", { children: filtered.length === 0 ?
                                        _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.7 }), colSpan: 6, children: "Keine Projekte gefunden." }) }) :
                                        filtered.map((p) => _jsxs("tr", { onClick: () => setSel(p.id), className: rlcClass(null, {
                                                cursor: "pointer",
                                                background: p.id === sel ? "#f1f5ff" : undefined
                                            }), children: [_jsx("td", { className: rlcClass(null, td), children: p.name }), _jsx("td", { className: rlcClass(null, td), children: p.baustellenNummer || "—" }), _jsx("td", { className: rlcClass(null, td), children: p.ort || "—" }), _jsx("td", { className: rlcClass(null, td), children: p.bauleiter || "—" }), _jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: p.status }), _jsx("td", { className: rlcClass(null, td), children: formatDate(p.createdAt) })] }, p.id)) })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-projekte-tsx-616", children: !selected ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-projekte-tsx-617", children: "W\u00E4hle links ein Projekt aus oder erstelle ein neues." }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-projekte-tsx-618", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Name" }), _jsx("input", { className: rlcClass(null, { ...inpB, width: "100%" }), value: selected.name, onChange: (e) => update({ name: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Baustellen-Nr." }), _jsx("input", { className: rlcClass(null, inpS), value: selected.baustellenNummer ?? "", onChange: (e) => update({ baustellenNummer: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Ort" }), _jsx("input", { className: rlcClass(null, inpS), value: selected.ort ?? "", onChange: (e) => update({ ort: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Bauleiter" }), _jsx("input", { className: rlcClass(null, inpS), value: selected.bauleiter ?? "", onChange: (e) => update({ bauleiter: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Status" }), _jsxs("select", { className: rlcClass(null, inpS), value: selected.status, onChange: (e) => update({ status: e.target.value }), children: [_jsx("option", { value: "aktiv", children: "Aktiv" }), _jsx("option", { value: "archiv", children: "Archiv" })] }), _jsx("label", { className: rlcClass(null, lbl), children: "Erstellt" }), _jsx("div", { children: formatDateTime(selected.createdAt) }), _jsx("label", { className: rlcClass(null, lbl), children: "Ge\u00E4ndert" }), _jsx("div", { children: formatDateTime(selected.updatedAt) })] }) })] })] }));
}
