import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { MachinesDB } from "./store.machines";
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
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13
};
const lbl = {
    fontSize: 12,
    opacity: 0.8
};
export default function Maschinenverwaltung() {
    const [all, setAll] = React.useState(MachinesDB.list());
    const [selId, setSelId] = React.useState(MachinesDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [onlyDue, setOnlyDue] = React.useState(false);
    const refresh = React.useCallback(() => {
        const next = MachinesDB.list();
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
        return all.filter((m) => {
            const s = `${m.name} ${m.type ?? ""} ${m.serial ?? ""} ${m.projectId ?? ""}`.toLowerCase();
            const okQ = !qq || s.includes(qq);
            const okP = !proj || (m.projectId ?? "") === proj;
            const due = isDue(m);
            const okD = !onlyDue || due;
            return okQ && okP && okD;
        });
    }, [all, q, proj, onlyDue]);
    const projects = React.useMemo(() => Array.from(new Set(all.map((m) => m.projectId).filter(Boolean))), [all]);
    const add = React.useCallback(() => {
        const m = MachinesDB.create();
        refresh();
        setSelId(m.id);
    }, [refresh]);
    const del = React.useCallback(() => {
        if (!sel)
            return;
        if (!confirm("Maschine löschen?"))
            return;
        MachinesDB.remove(sel.id);
        refresh();
    }, [sel, refresh]);
    const up = React.useCallback((p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        MachinesDB.upsert(next);
        setSelId(next.id);
        refresh();
    }, [sel, refresh]);
    const addMaint = React.useCallback(() => {
        if (!sel)
            return;
        const r = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            hours: sel.hours || 0,
            notes: ""
        };
        up({ maintenance: [r, ...(sel.maintenance || [])] });
    }, [sel, up]);
    const delMaint = React.useCallback((id) => {
        if (!sel)
            return;
        up({ maintenance: (sel.maintenance || []).filter((x) => x.id !== id) });
    }, [sel, up]);
    const onDrop = React.useCallback(async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await MachinesDB.attach(sel.id, f);
        refresh();
    }, [sel, refresh]);
    const open = React.useCallback((a) => {
        const w = window.open(a.dataURL, "_blank");
        if (!w)
            alert("Popup blockiert.");
    }, []);
    const importCSV = React.useCallback(() => {
        pickFile(async (f) => {
            const n = MachinesDB.importCSV(await f.text());
            alert(`Import: ${n} Maschinen.`);
            refresh();
        });
    }, [refresh]);
    const exportCSV = React.useCallback(() => {
        download("text/csv;charset=utf-8", "maschinen.csv", MachinesDB.exportCSV(filtered));
    }, [filtered]);
    const exportJSON = React.useCallback(() => {
        download("application/json", "maschinen_backup.json", MachinesDB.exportJSON());
    }, []);
    const importJSON = React.useCallback(() => {
        pickFile(async (f) => {
            const n = MachinesDB.importJSON(await f.text());
            alert(`Backup importiert: ${n}.`);
            refresh();
        });
    }, [refresh]);
    const recalcNext = React.useCallback(() => {
        if (!sel)
            return;
        const last = sel.lastService ?? new Date().toISOString();
        const days = sel.serviceIntervalDays ?? 180;
        const next = new Date(new Date(last).getTime() + days * 86400000).toISOString();
        up({ nextService: next });
    }, [sel, up]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-536", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-maschinenverwaltung-tsx-537", children: [_jsx("button", { className: "btn", onClick: add, children: "+ Maschine" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-538" }), _jsx("input", { placeholder: "Suche Name / Typ / Seriennr. / Projekt\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 300 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { value: p, children: p }, p))] }), _jsxs("label", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-539", children: [_jsx("input", { type: "checkbox", checked: onlyDue, onChange: (e) => setOnlyDue(e.target.checked) }), _jsx("span", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-540", children: "nur f\u00E4llige" })] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-541", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-maschinenverwaltung-tsx-542", children: _jsxs("table", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-543", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "Seriennr." }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Stunden" }), _jsx("th", { className: rlcClass(null, th), children: "n\u00E4chster Service" }), _jsx("th", { className: rlcClass(null, th), children: "Status" })] }) }), _jsxs("tbody", { children: [filtered.map((m) => {
                                            const due = isDue(m);
                                            const days = daysLeft(m.nextService);
                                            return (_jsxs("tr", { onClick: () => setSelId(m.id), className: rlcClass(null, {
                                                    cursor: "pointer",
                                                    background: sel?.id === m.id ? "#f1f5ff" : undefined
                                                }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: m.name }) }), _jsx("td", { className: rlcClass(null, td), children: m.type || "—" }), _jsx("td", { className: rlcClass(null, td), children: m.serial || "—" }), _jsx("td", { className: rlcClass(null, td), children: m.projectId || "—" }), _jsx("td", { className: rlcClass(null, td), children: m.hours ?? 0 }), _jsxs("td", { className: rlcClass(null, td), children: [m.nextService ? fmt(m.nextService) : "—", m.nextService &&
                                                                _jsxs("span", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-544", children: ["(", days, " Tg)"] })] }), _jsx("td", { className: rlcClass(null, td), children: due ? "⚠️ fällig" : m.status || "Betrieb" })] }, m.id));
                                        }), filtered.length === 0 &&
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 7, children: "Keine Maschinen." }) })] })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-maschinenverwaltung-tsx-545", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: !sel ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-546", children: "Links Maschine w\u00E4hlen oder neu anlegen." }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-547", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Name" }), _jsx("input", { className: rlcClass(null, inp), value: sel.name, onChange: (e) => up({ name: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Typ" }), _jsx("input", { className: rlcClass(null, inp), value: sel.type ?? "", onChange: (e) => up({ type: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Seriennr." }), _jsx("input", { className: rlcClass(null, inp), value: sel.serial ?? "", onChange: (e) => up({ serial: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, inp), value: sel.projectId ?? "", onChange: (e) => up({ projectId: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Standort" }), _jsx("input", { className: rlcClass(null, inp), value: sel.location ?? "", onChange: (e) => up({ location: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Status" }), _jsxs("select", { className: rlcClass(null, inp), value: sel.status ?? "Betrieb", onChange: (e) => up({ status: e.target.value }), children: [_jsx("option", { children: "Betrieb" }), _jsx("option", { children: "Wartung" }), _jsx("option", { children: "Au\u00DFer Betrieb" })] }), _jsx("label", { className: rlcClass(null, lbl), children: "Betriebsstunden" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.hours ?? 0, onChange: (e) => up({ hours: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Letzter Service" }), _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(sel.lastService), onChange: (e) => up({ lastService: fromDateInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Intervall (Tage)" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.serviceIntervalDays ?? 180, onChange: (e) => up({ serviceIntervalDays: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "N\u00E4chster Service" }), _jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-548", children: [_jsx("input", { type: "date", className: rlcClass(null, { ...inp, flex: 1 }), value: toDateInput(sel.nextService), onChange: (e) => up({ nextService: fromDateInput(e.target.value) }) }), _jsx("button", { className: "btn", onClick: recalcNext, children: "Berechnen" })] }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Wartungsprotokolle" }), _jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-549", children: [_jsx("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-550", children: _jsx("button", { className: "btn", onClick: addMaint, children: "+ Eintrag" }) }), _jsxs("table", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-551", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Datum" }), _jsx("th", { className: rlcClass(null, th), children: "Std." }), _jsx("th", { className: rlcClass(null, th), children: "Notizen" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsxs("tbody", { children: [(sel.maintenance || []).map((r) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(r.date), onChange: (e) => up({
                                                                                maintenance: (sel.maintenance || []).map((x) => x.id === r.id ?
                                                                                    { ...r, date: fromDateInput(e.target.value) } :
                                                                                    x)
                                                                            }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { type: "number", className: rlcClass(null, inp), value: r.hours ?? 0, onChange: (e) => up({
                                                                                maintenance: (sel.maintenance || []).map((x) => x.id === r.id ?
                                                                                    { ...r, hours: Number(e.target.value) || 0 } :
                                                                                    x)
                                                                            }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: r.notes ?? "", onChange: (e) => up({
                                                                                maintenance: (sel.maintenance || []).map((x) => x.id === r.id ? { ...r, notes: e.target.value } : x)
                                                                            }) }) }), _jsx("td", { className: rlcClass(null, { ...td, whiteSpace: "nowrap" }), children: _jsx("button", { className: "btn", onClick: () => delMaint(r.id), children: "Entfernen" }) })] }, r.id)), (sel.maintenance || []).length === 0 &&
                                                                _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 4, children: "Keine Eintr\u00E4ge." }) })] })] })] }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Dokumente / Fotos (Drag&Drop)" }), _jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-552", children: [(sel.attachments || []).map((a) => _jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-553", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-554", children: [_jsx("b", { title: a.name, className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-555", children: a.name }), _jsx("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-556" }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), (a.mime || "").startsWith("image/") &&
                                                        _jsx("img", { src: a.dataURL, alt: a.name, className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-557" })] }, a.id)), (sel.attachments || []).length === 0 &&
                                                _jsx("div", { className: "rlc-migrated-pages-buro-maschinenverwaltung-tsx-558", children: "Keine Anh\u00E4nge." })] })] }) })] })] }));
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
function fmt(iso) {
    return iso ? new Date(iso).toLocaleDateString() : "—";
}
function daysLeft(iso) {
    if (!iso)
        return NaN;
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function isDue(m) {
    const d = daysLeft(m.nextService);
    return !isNaN(d) && d <= 14 || m.status === "Wartung";
}
function pickFile(onPick) {
    const i = document.createElement("input");
    i.type = "file";
    i.onchange = () => {
        const f = i.files?.[0];
        if (f)
            onPick(f);
    };
    i.click();
}
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
