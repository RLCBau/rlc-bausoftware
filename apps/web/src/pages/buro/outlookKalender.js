import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { CalendarDB } from "./store.calendar";
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
export default function OutlookKalender() {
    const [all, setAll] = React.useState(CalendarDB.list());
    const [q, setQ] = React.useState("");
    const [proj, setProj] = React.useState("");
    const [showForm, setShowForm] = React.useState(false);
    const [draft, setDraft] = React.useState(CalendarDB.blank());
    const refresh = React.useCallback(() => {
        setAll(CalendarDB.list());
    }, []);
    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return all.filter((e) => {
            const text = `${e.title} ${e.projectId ?? ""} ${e.location ?? ""}`.toLowerCase();
            const okQ = !qq || text.includes(qq);
            const okP = !proj || (e.projectId ?? "") === proj;
            return okQ && okP;
        });
    }, [all, q, proj]);
    const projects = React.useMemo(() => Array.from(new Set(all.map((e) => e.projectId).filter(Boolean))), [all]);
    const openForm = React.useCallback((e) => {
        setDraft(e ? { ...e } : CalendarDB.blank());
        setShowForm(true);
    }, []);
    const save = React.useCallback(() => {
        if (!draft.title.trim()) {
            alert("Bitte einen Titel eingeben.");
            return;
        }
        if (!draft.start || !draft.end) {
            alert("Bitte Beginn und Ende eingeben.");
            return;
        }
        if (new Date(draft.end).getTime() < new Date(draft.start).getTime()) {
            alert("Ende darf nicht vor Beginn liegen.");
            return;
        }
        CalendarDB.upsert(draft);
        setShowForm(false);
        refresh();
    }, [draft, refresh]);
    const del = React.useCallback((id) => {
        if (!confirm("Termin löschen?"))
            return;
        CalendarDB.remove(id);
        refresh();
    }, [refresh]);
    const importICS = React.useCallback(() => {
        pickFile(async (f) => {
            const txt = await f.text();
            const n = CalendarDB.importICS(txt);
            alert(`Import: ${n} Termine.`);
            refresh();
        });
    }, [refresh]);
    const exportICS = React.useCallback(() => {
        downloadBlob(CalendarDB.exportICS(filtered), "kalender_export.ics", "text/calendar;charset=utf-8");
    }, [filtered]);
    const openOutlookDesktop = React.useCallback(() => {
        const ics = CalendarDB.exportICS(filtered);
        const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "RLC_Kalender.ics";
        a.click();
        URL.revokeObjectURL(url);
    }, [filtered]);
    return (_jsxs("div", { className: "rlc-migrated-pages-buro-outlookkalender-tsx-580", children: [_jsxs("div", { className: "card rlc-migrated-pages-buro-outlookkalender-tsx-581", children: [_jsx("button", { className: "btn", onClick: () => openForm(), children: "+ Neuer Termin" }), _jsx("div", { className: "rlc-migrated-pages-buro-outlookkalender-tsx-582" }), _jsx("input", { placeholder: "Suche Titel / Ort / Projekt\u2026", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, { ...inp, width: 280 }) }), _jsxs("select", { value: proj, onChange: (e) => setProj(e.target.value), className: rlcClass(null, { ...inp, width: 160 }), children: [_jsx("option", { value: "", children: "Alle Projekte" }), projects.map((p) => _jsx("option", { value: p, children: p }, p))] }), _jsx("button", { className: "btn", onClick: importICS, children: "Import .ics" }), _jsx("button", { className: "btn", onClick: exportICS, children: "Export .ics" }), _jsx("button", { className: "btn", onClick: openOutlookDesktop, children: "In Outlook/Google \u00F6ffnen" })] }), _jsx("div", { className: "card rlc-migrated-pages-buro-outlookkalender-tsx-583", children: _jsxs("table", { className: "rlc-migrated-pages-buro-outlookkalender-tsx-584", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Beginn" }), _jsx("th", { className: rlcClass(null, th), children: "Ende" }), _jsx("th", { className: rlcClass(null, th), children: "Titel" }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Ort" }), _jsx("th", { className: rlcClass(null, th), children: "Teilnehmer" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsxs("tbody", { children: [filtered.map((ev) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: fmt(ev.start) }), _jsx("td", { className: rlcClass(null, td), children: fmt(ev.end) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("b", { children: ev.title }) }), _jsx("td", { className: rlcClass(null, td), children: ev.projectId || "—" }), _jsx("td", { className: rlcClass(null, td), children: ev.location || "—" }), _jsx("td", { className: rlcClass(null, td), children: (ev.attendees ?? []).join(", ") || "—" }), _jsxs("td", { className: rlcClass(null, { ...td, whiteSpace: "nowrap" }), children: [_jsx("button", { className: "btn", onClick: () => openForm(ev), children: "Bearbeiten" }), _jsx("button", { className: "btn", onClick: () => del(ev.id), children: "L\u00F6schen" })] })] }, ev.id)), filtered.length === 0 &&
                                    _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 7, children: "Keine Termine." }) })] })] }) }), showForm &&
                _jsx(Modal, { onClose: () => setShowForm(false), children: _jsxs("div", { className: "rlc-migrated-pages-buro-outlookkalender-tsx-585", children: [_jsx("label", { className: rlcClass(null, lbl), children: "Titel" }), _jsx("input", { className: rlcClass(null, inp), value: draft.title, onChange: (e) => setDraft({ ...draft, title: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, inp), value: draft.projectId ?? "", onChange: (e) => setDraft({ ...draft, projectId: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Beginn" }), _jsx("input", { className: rlcClass(null, inp), type: "datetime-local", value: toLocalInput(draft.start), onChange: (e) => setDraft({ ...draft, start: fromLocalInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Ende" }), _jsx("input", { className: rlcClass(null, inp), type: "datetime-local", value: toLocalInput(draft.end), onChange: (e) => setDraft({ ...draft, end: fromLocalInput(e.target.value) }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Ort" }), _jsx("input", { className: rlcClass(null, inp), value: draft.location ?? "", onChange: (e) => setDraft({ ...draft, location: e.target.value }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Teilnehmer" }), _jsx("input", { className: rlcClass(null, inp), placeholder: "mail1@..., mail2@...", value: (draft.attendees ?? []).join(", "), onChange: (e) => setDraft({
                                    ...draft,
                                    attendees: e.target.value.
                                        split(",").
                                        map((s) => s.trim()).
                                        filter(Boolean)
                                }) }), _jsx("label", { className: rlcClass(null, lbl), children: "Beschreibung" }), _jsx("textarea", { className: rlcClass(null, { ...inp, gridColumn: "1 / -1", minHeight: 100 }), value: draft.notes ?? "", onChange: (e) => setDraft({ ...draft, notes: e.target.value }) }), _jsxs("div", { className: "rlc-migrated-pages-buro-outlookkalender-tsx-586", children: [_jsx("button", { className: "btn", onClick: () => setShowForm(false), children: "Abbrechen" }), _jsx("button", { className: "btn", onClick: save, children: "Speichern" })] })] }) })] }));
}
/* ==== Utils ==== */
function fmt(iso) {
    return iso ? new Date(iso).toLocaleString() : "—";
}
function toLocalInput(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    const pad = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
    if (!v)
        return "";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function pickFile(onPick) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.onchange = () => {
        const f = inp.files?.[0];
        if (f)
            onPick(f);
    };
    inp.click();
}
function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
function Modal({ children, onClose }) {
    return (_jsx("div", { className: "rlc-migrated-pages-buro-outlookkalender-tsx-587", children: _jsx("div", { className: "card rlc-migrated-pages-buro-outlookkalender-tsx-588", children: children }) }));
}
