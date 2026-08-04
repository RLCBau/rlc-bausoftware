import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { PersonalDB } from "./store.personal";
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
export default function Personalverwaltung() {
    const [all, setAll] = React.useState(PersonalDB.list());
    const [selId, setSelId] = React.useState(PersonalDB.list()[0]?.id ?? null);
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const refresh = React.useCallback(() => {
        const next = PersonalDB.list();
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
        return all.filter((e) => {
            const s = `${e.name} ${e.role ?? ""} ${(e.projects ?? []).join(" ")}`.toLowerCase();
            const okQ = !qq || s.includes(qq);
            const okP = !proj || (e.projects ?? []).includes(proj);
            return okQ && okP;
        });
    }, [all, q, proj]);
    const projects = React.useMemo(() => Array.from(new Set(all.flatMap((e) => e.projects ?? []))).sort(), [all]);
    const add = React.useCallback(() => {
        const e = PersonalDB.create();
        refresh();
        setSelId(e.id);
    }, [refresh]);
    const del = React.useCallback(() => {
        if (!sel)
            return;
        if (!confirm("Mitarbeiter löschen?"))
            return;
        PersonalDB.remove(sel.id);
        refresh();
    }, [sel, refresh]);
    const up = React.useCallback((p) => {
        if (!sel)
            return;
        const next = { ...sel, ...p, updatedAt: Date.now() };
        PersonalDB.upsert(next);
        setSelId(next.id);
        refresh();
    }, [sel, refresh]);
    const expWarn = React.useCallback((d) => {
        return d ? daysLeft(d) : null;
    }, []);
    const addCert = React.useCallback(() => {
        if (!sel)
            return;
        const c = {
            id: crypto.randomUUID(),
            name: "",
            validUntil: new Date().toISOString()
        };
        up({ certs: [c, ...(sel.certs || [])] });
    }, [sel, up]);
    const delCert = React.useCallback((id) => {
        if (!sel)
            return;
        up({ certs: (sel.certs || []).filter((c) => c.id !== id) });
    }, [sel, up]);
    const onDrop = React.useCallback(async (ev) => {
        ev.preventDefault();
        if (!sel)
            return;
        const f = ev.dataTransfer.files?.[0];
        if (!f)
            return;
        await PersonalDB.attach(sel.id, f);
        refresh();
    }, [sel, refresh]);
    const open = React.useCallback((a) => {
        const w = window.open(a.dataURL, "_blank");
        if (!w)
            alert("Popup blockiert.");
    }, []);
    const exportCSV = React.useCallback(() => {
        download("text/csv;charset=utf-8", "personal.csv", PersonalDB.exportCSV(filtered));
    }, [filtered]);
    const importCSV = React.useCallback(() => {
        pickFile(async (f) => {
            const n = PersonalDB.importCSV(await f.text());
            alert(`Import: ${n} Datensätze.`);
            refresh();
        });
    }, [refresh]);
    const exportJSON = React.useCallback(() => {
        download("application/json", "personal_backup.json", PersonalDB.exportJSON());
    }, []);
    const importJSON = React.useCallback(() => {
        pickFile(async (f) => {
            const n = PersonalDB.importJSON(await f.text());
            alert(`Backup importiert: ${n}.`);
            refresh();
        });
    }, [refresh]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-589", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-personalverwaltung-tsx-590", children: [_jsx("button", { className: "btn", onClick: add, children: "+ Mitarbeiter" }), _jsx("button", { className: "btn", onClick: del, disabled: !sel, children: "L\u00F6schen" }), _jsx("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-591" }), _jsx("input", { placeholder: "Suche Name / Rolle / Projekt\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 280 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: importCSV, children: "Import CSV" }), _jsx("button", { className: "btn", onClick: exportCSV, children: "Export CSV" }), _jsx("button", { className: "btn", onClick: importJSON, children: "Import JSON" }), _jsx("button", { className: "btn", onClick: exportJSON, children: "Export JSON" })] }), _jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-592", children: [_jsx("div", { className: "card rlc-migrated-pages-buro-personalverwaltung-tsx-593", children: _jsxs("table", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-594", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Name" }), _jsx("th", { className: rlcClass(null, th), children: "Rolle" }), _jsx("th", { className: rlcClass(null, th), children: "E-Mail" }), _jsx("th", { className: rlcClass(null, th), children: "Std.-Satz" }), _jsx("th", { className: rlcClass(null, th), children: "Projekte" }), _jsx("th", { className: rlcClass(null, th), children: "Abl\u00E4ufe" })] }) }), _jsxs("tbody", { children: [filtered.map((e) => {
                                            const exp = Math.min(...(e.certs || []).map((c) => daysLeft(c.validUntil)), e.contractEnd ? daysLeft(e.contractEnd) : Infinity);
                                            const warn = Number.isFinite(exp) && exp <= 30;
                                            return (_jsxs("tr", { onClick: () => setSelId(e.id), className: rlcClass(null, {
                                                    cursor: "pointer",
                                                    background: sel?.id === e.id ? "#f1f5ff" : undefined
                                                }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: e.name }) }), _jsx("td", { className: rlcClass(null, td), children: e.role || "—" }), _jsx("td", { className: rlcClass(null, td), children: e.email || "—" }), _jsx("td", { className: rlcClass(null, td), children: typeof e.hourlyRate === "number" ?
                                                            `${e.hourlyRate.toFixed(2)} €` :
                                                            "—" }), _jsx("td", { className: rlcClass(null, td), children: (e.projects || []).join(", ") || "—" }), _jsx("td", { className: rlcClass(null, td), children: warn ? `⚠️ ${exp} Tg.` : "—" })] }, e.id));
                                        }), filtered.length === 0 &&
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 6, children: "Keine Mitarbeiter." }) })] })] }) }), _jsx("div", { className: "card rlc-migrated-pages-buro-personalverwaltung-tsx-595", onDragOver: (e) => e.preventDefault(), onDrop: onDrop, children: !sel ?
                            _jsx("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-596", children: "Links Mitarbeiter w\u00E4hlen oder neu anlegen." }) :
                            _jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-597", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Name" }), _jsx("input", { className: rlcClass(null, inp), value: sel.name, onChange: (e) => up({ name: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Rolle" }), _jsx("input", { className: rlcClass(null, inp), value: sel.role ?? "", onChange: (e) => up({ role: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "E-Mail" }), _jsx("input", { className: rlcClass(null, inp), value: sel.email ?? "", onChange: (e) => up({ email: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Telefon" }), _jsx("input", { className: rlcClass(null, inp), value: sel.phone ?? "", onChange: (e) => up({ phone: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Kostenstelle" }), _jsx("input", { className: rlcClass(null, inp), value: sel.costCenter ?? "", onChange: (e) => up({ costCenter: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Std.-Satz (\u20AC)" }), _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, inp), value: sel.hourlyRate ?? 0, onChange: (e) => up({ hourlyRate: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekte" }), _jsx("input", { className: rlcClass(null, inp), placeholder: "P001, P002", value: (sel.projects ?? []).join(", "), onChange: (e) => up({
                                            projects: e.target.value.
                                                split(",").
                                                map((s) => s.trim()).
                                                filter(Boolean)
                                        }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Anstellung" }), _jsxs("select", { className: rlcClass(null, inp), value: sel.employmentType ?? "Vollzeit", onChange: (e) => up({ employmentType: e.target.value }), children: [_jsx("option", { children: "Vollzeit" }), _jsx("option", { children: "Teilzeit" }), _jsx("option", { children: "Werkvertrag" }), _jsx("option", { children: "Praktikum" })] }), _jsx("label", { className: rlcClass(null, lbl), children: "Vertragsbeginn" }), _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(sel.contractStart), onChange: (e) => up({ contractStart: fromDateInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Vertragsende" }), _jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(sel.contractEnd), onChange: (e) => up({ contractEnd: fromDateInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Urlaub (gesamt)" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.vacationTotal ?? 25, onChange: (e) => up({ vacationTotal: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Urlaub (genommen)" }), _jsx("input", { type: "number", className: rlcClass(null, inp), value: sel.vacationTaken ?? 0, onChange: (e) => up({ vacationTaken: Number(e.target.value) || 0 }) }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Zertifikate & Schulungen" }), _jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-598", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-599", children: [_jsx("button", { className: "btn", onClick: addCert, children: "+ Zertifikat" }), _jsx("small", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-600", children: "Warnung bei Ablauf <= 30 Tage" })] }), _jsxs("table", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-601", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Bezeichnung" }), _jsx("th", { className: rlcClass(null, th), children: "g\u00FCltig bis" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsxs("tbody", { children: [(sel.certs || []).map((c) => {
                                                                const d = expWarn(c.validUntil);
                                                                const warn = d !== null && d <= 30;
                                                                return (_jsxs("tr", { className: rlcClass(null, { background: warn ? "#fff3f0" : undefined }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: c.name, onChange: (e) => up({
                                                                                    certs: (sel.certs || []).map((x) => x.id === c.id ? { ...c, name: e.target.value } : x)
                                                                                }) }) }), _jsxs("td", { className: rlcClass(null, td), children: [_jsx("input", { type: "date", className: rlcClass(null, inp), value: toDateInput(c.validUntil), onChange: (e) => up({
                                                                                        certs: (sel.certs || []).map((x) => x.id === c.id ?
                                                                                            { ...c, validUntil: fromDateInput(e.target.value) } :
                                                                                            x)
                                                                                    }) }), warn &&
                                                                                    _jsxs("span", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-602", children: ["\u26A0 ", d, " Tg"] })] }), _jsx("td", { className: rlcClass(null, { ...td, whiteSpace: "nowrap" }), children: _jsx("button", { className: "btn", onClick: () => delCert(c.id), children: "Entfernen" }) })] }, c.id));
                                                            }), (sel.certs || []).length === 0 &&
                                                                _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 3, children: "Keine Zertifikate." }) })] })] })] }), _jsx("label", { className: rlcClass(null, { ...lbl, gridColumn: "1 / -1" }), children: "Dokumente (Drag&Drop hier)" }), _jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-603", children: [(sel.attachments || []).map((a) => _jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-604", children: [_jsxs("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-605", children: [_jsx("b", { title: a.name, className: "rlc-migrated-pages-buro-personalverwaltung-tsx-606", children: a.name }), _jsx("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-607" }), _jsx("button", { className: "btn", onClick: () => open(a), children: "\u00D6ffnen" })] }), (a.mime || "").startsWith("image/") &&
                                                        _jsx("img", { src: a.dataURL, alt: a.name, className: "rlc-migrated-pages-buro-personalverwaltung-tsx-608" })] }, a.id)), (sel.attachments || []).length === 0 &&
                                                _jsx("div", { className: "rlc-migrated-pages-buro-personalverwaltung-tsx-609", children: "Keine Anh\u00E4nge." })] })] }) })] })] }));
}
/* utils */
function daysLeft(iso) {
    const d = (new Date(iso).getTime() - Date.now()) / 86400000;
    return Math.ceil(d);
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
