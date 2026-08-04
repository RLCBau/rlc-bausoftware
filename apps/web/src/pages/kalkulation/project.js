import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/project.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Projects } from "./projectStore";
import { setCurrentProjectId } from "../../utils/project";
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function normalizeProjectNumber(value) {
    return String(value || "").
        trim().
        toUpperCase().
        replace(/\s+/g, "-");
}
function getProjectCode(p) {
    return String(p.code || p.number || "").trim().toUpperCase();
}
function asNumericProjectId(p) {
    const raw = p.dbId ?? p.projectId;
    if (raw !== undefined && !Number.isNaN(Number(raw))) {
        return Number(raw);
    }
    const basis = String(p.id ?? p.number ?? p.name ?? "project");
    let h = 0;
    for (let i = 0; i < basis.length; i += 1) {
        h = (h << 5) - h + basis.charCodeAt(i) | 0;
    }
    return Math.abs(h % 9000000) + 1000000;
}
function formatDate(value) {
    const d = new Date(String(value || ""));
    if (Number.isNaN(d.getTime()))
        return "—";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(d);
}
function projectMatches(p, q) {
    const s = q.trim().toLowerCase();
    if (!s)
        return true;
    const hay = [
        p.number,
        p.code,
        p.name,
        p.client,
        p.location,
        p.place,
        p.ort
    ].
        filter(Boolean).
        join(" ").
        toLowerCase();
    return hay.includes(s);
}
function buildRoute(target, p) {
    const code = encodeURIComponent(getProjectCode(p));
    const numericId = asNumericProjectId(p);
    if (target === "manuell") {
        return `/kalkulation/manuell?projectCode=${code}`;
    }
    if (target === "ki") {
        return `/kalkulation/mit-ki?projectCode=${code}`;
    }
    if (target === "gaeb") {
        return `/kalkulation/gaeb?projectCode=${code}`;
    }
    if (target === "angebot") {
        return `/kalkulation/angebot?projectCode=${code}`;
    }
    if (target === "preise") {
        return `/kalkulation/preise?projectCode=${code}`;
    }
    if (target === "nachtraege") {
        return `/kalkulation/nachtraege?projectCode=${code}`;
    }
    return `/kalkulation/versionsvergleich?projectId=${numericId}&projectCode=${code}`;
}
export default function ProjektPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [q, setQ] = useState("");
    const [info, setInfo] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const fileRef = useRef(null);
    useEffect(() => {
        const list = Projects.list();
        setRows(list);
        const cur = Projects.getCurrent?.();
        if (cur?.id)
            setSelectedId(cur.id);
    }, []);
    const selectedProject = useMemo(() => {
        return rows.find((p) => p.id === selectedId) || Projects.getCurrent?.() || null;
    }, [rows, selectedId]);
    const filtered = useMemo(() => {
        return rows.filter((p) => projectMatches(p, q));
    }, [rows, q]);
    const stats = useMemo(() => {
        return {
            total: rows.length,
            filtered: filtered.length,
            active: selectedProject ? getProjectCode(selectedProject) : "—"
        };
    }, [rows, filtered.length, selectedProject]);
    function refresh() {
        const list = Projects.list();
        setRows(list);
        const cur = Projects.getCurrent?.();
        setSelectedId(cur?.id || "");
    }
    function selectProject(p) {
        Projects.setCurrent(p.id);
        setCurrentProjectId(asNumericProjectId(p));
        setSelectedId(p.id);
        setInfo(`Projekt aktiv: ${getProjectCode(p)} — ${p.name}`);
    }
    function openProject(p, target) {
        selectProject(p);
        navigate(buildRoute(target, p));
    }
    function create(e) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const number = normalizeProjectNumber(String(fd.get("number") || ""));
        const name = String(fd.get("name") || "").trim();
        const client = String(fd.get("client") || "").trim();
        const location = String(fd.get("location") || "").trim();
        if (!/^[A-Z0-9\-_.]+$/i.test(number)) {
            alert("BaustellenNummer: nur A-Z, 0-9, - _ .");
            return;
        }
        if (name.length < 3) {
            alert("Projektname zu kurz.");
            return;
        }
        const existing = Projects.list().find((p) => String(p.number || "").toUpperCase() === number);
        if (existing && !confirm("Diese BaustellenNummer existiert bereits. Aktualisieren?")) {
            return;
        }
        const item = Projects.upsert({
            id: existing?.id || safeId(),
            number,
            name,
            client,
            location,
            createdAt: existing?.createdAt || new Date().toISOString()
        });
        Projects.setCurrent(item.id);
        setCurrentProjectId(asNumericProjectId(item));
        setRows(Projects.list());
        setSelectedId(item.id);
        setInfo(`Projekt gespeichert und aktiviert: ${number} — ${name}`);
        e.currentTarget.reset();
    }
    function del(p) {
        if (!confirm(`Projekt wirklich löschen?\n\n${getProjectCode(p)} — ${p.name}`)) {
            return;
        }
        Projects.remove(p.id);
        const list = Projects.list();
        setRows(list);
        const cur = Projects.getCurrent?.();
        setSelectedId(cur?.id || "");
        setInfo("Projekt gelöscht.");
    }
    function exportJSON() {
        const blob = new Blob([Projects.exportJSON()], {
            type: "application/json;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "rlc_projects.json";
        a.click();
        URL.revokeObjectURL(url);
    }
    function importJSON(text) {
        try {
            Projects.importJSON(text);
            refresh();
            setInfo("Projektdatei importiert.");
        }
        catch (e) {
            alert(`Import fehlgeschlagen: ${e?.message || e}`);
        }
    }
    function suggestNumber() {
        const y = new Date().getFullYear();
        const n = Math.floor(Math.random() * 900 + 100);
        const input = document.querySelector('input[name="number"]');
        if (input)
            input.value = `BA-${y}-${n}`;
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", hero), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Bausoftware \u00B7 Kalkulation" }), _jsx("h1", { className: rlcClass(null, title), children: "Projekt ausw\u00E4hlen" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Projekt anlegen, aktivieren und direkt in Manuell, KI, GAEB, Preise, Nachtr\u00E4ge oder Angebotsanalyse weiterarbeiten." })] }), _jsxs("div", { className: rlcClass(null, heroStats), children: [_jsx(Kpi, { label: "Projekte", value: String(stats.total) }), _jsx(Kpi, { label: "Treffer", value: String(stats.filtered) }), _jsx(Kpi, { label: "Aktiv", value: stats.active })] })] }), info ? _jsx("div", { className: rlcClass(null, infoBox), children: info }) : null, _jsxs("div", { className: rlcClass(null, layout), children: [_jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Projektliste" }), _jsx("div", { className: rlcClass(null, sectionText), children: "W\u00E4hle ein Projekt aus und \u00F6ffne direkt das gew\u00FCnschte Modul." })] }), _jsxs("div", { className: rlcClass(null, toolbar), children: [_jsx("input", { placeholder: "Suche: Name / BaustellenNr / Kunde / Ort", value: q, onChange: (e) => setQ(e.target.value), className: rlcClass(null, searchInput) }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: exportJSON, children: "Export" }), _jsx("input", { ref: fileRef, type: "file", accept: "application/json,.json", onChange: (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f)
                                                        return;
                                                    const r = new FileReader();
                                                    r.onload = () => importJSON(String(r.result || ""));
                                                    r.readAsText(f, "utf-8");
                                                    e.currentTarget.value = "";
                                                }, className: "rlc-migrated-pages-kalkulation-project-tsx-932" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => fileRef.current?.click(), children: "Import" })] })] }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "BaustellenNr" }), _jsx("th", { className: rlcClass(null, th), children: "Projektname" }), _jsx("th", { className: rlcClass(null, th), children: "Kunde" }), _jsx("th", { className: rlcClass(null, th), children: "Ort" }), _jsx("th", { className: rlcClass(null, th), children: "Erstellt" }), _jsx("th", { className: rlcClass(null, th), children: "Aktionen" })] }) }), _jsxs("tbody", { children: [filtered.map((p) => {
                                                    const active = selectedProject?.id === p.id;
                                                    const code = getProjectCode(p);
                                                    return (_jsxs("tr", { className: rlcClass(null, {
                                                            background: active ? "#EAF2FF" : "#FFFFFF"
                                                        }), children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, active ? badgeActive : badgeNeutral), children: active ? "Aktiv" : "—" }) }), _jsx("td", { className: rlcClass(null, tdStrong), children: code || "—" }), _jsx("td", { className: rlcClass(null, td), children: p.name || "—" }), _jsx("td", { className: rlcClass(null, td), children: p.client || "—" }), _jsx("td", { className: rlcClass(null, td), children: p.location || "—" }), _jsx("td", { className: rlcClass(null, td), children: formatDate(p.createdAt) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("div", { className: rlcClass(null, buttonGroup), children: [_jsx("button", { type: "button", className: rlcClass(null, active ? btnPrimarySmall : btnSecondarySmall), onClick: () => selectProject(p), children: "Aktivieren" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(p, "manuell"), children: "Manuell" }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimarySmall), onClick: () => openProject(p, "ki"), children: "KI" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(p, "gaeb"), children: "GAEB" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(p, "angebot"), children: "Angebot" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(p, "vergleich"), children: "Analyse" }), _jsx("button", { type: "button", className: rlcClass(null, btnDangerSmall), onClick: () => del(p), children: "L\u00F6schen" })] }) })] }, p.id));
                                                }), !filtered.length ?
                                                    _jsx("tr", { children: _jsx("td", { colSpan: 7, className: rlcClass(null, emptyCell), children: "Keine Projekte gefunden." }) }) :
                                                    null] })] }) })] }), _jsxs("aside", { className: rlcClass(null, sideCard), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Projekt erstellen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Neues Projekt lokal anlegen und direkt als aktives Projekt setzen." })] }) }), _jsxs("form", { onSubmit: create, className: rlcClass(null, form), children: [_jsx(Field, { label: "BaustellenNummer *", hint: "z. B. BA-2026-001", children: _jsx("input", { name: "number", required: true, placeholder: "BA-2026-001", pattern: "[A-Za-z0-9_.-]+", title: "Nur Buchstaben, Ziffern, -, _, .", className: rlcClass(null, input) }) }), _jsx(Field, { label: "Projektname *", hint: "Kurze, eindeutige Bezeichnung", children: _jsx("input", { name: "name", required: true, placeholder: "Erneuerung TWL BA III/IV", className: rlcClass(null, input) }) }), _jsx(Field, { label: "Auftraggeber", children: _jsx("input", { name: "client", placeholder: "Gemeinde / Auftraggeber", className: rlcClass(null, input) }) }), _jsx(Field, { label: "Ort", children: _jsx("input", { name: "location", placeholder: "Ort / Baustelle", className: rlcClass(null, input) }) }), _jsxs("div", { className: rlcClass(null, formActions), children: [_jsx("button", { type: "submit", className: rlcClass(null, btnPrimary), children: "Projekt anlegen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: suggestNumber, children: "Nummer vorschlagen" })] })] }), _jsxs("div", { className: rlcClass(null, currentBox), children: [_jsx("div", { className: rlcClass(null, currentLabel), children: "Aktuelles Projekt" }), selectedProject ?
                                        _jsxs(_Fragment, { children: [_jsxs("div", { className: rlcClass(null, currentTitle), children: [getProjectCode(selectedProject), " \u2014 ", selectedProject.name] }), _jsxs("div", { className: rlcClass(null, currentSub), children: [selectedProject.client || "Kein Auftraggeber", " \u00B7", " ", selectedProject.location || "Kein Ort"] }), _jsxs("div", { className: rlcClass(null, quickActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(selectedProject, "manuell"), children: "Manuell" }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimarySmall), onClick: () => openProject(selectedProject, "ki"), children: "KI" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(selectedProject, "gaeb"), children: "GAEB" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondarySmall), onClick: () => openProject(selectedProject, "nachtraege"), children: "Nachtr\u00E4ge" })] })] }) :
                                        _jsx("div", { className: rlcClass(null, muted), children: "Kein Projekt ausgew\u00E4hlt." })] })] })] })] }));
}
function Kpi({ label, value }) {
    return (_jsxs("div", { className: rlcClass(null, kpi), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value })] }));
}
function Field({ label, hint, children }) {
    return (_jsxs("label", { className: rlcClass(null, field), children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children, hint ? _jsx("small", { className: rlcClass(null, hintStyle), children: hint }) : null] }));
}
/* ===================== STYLES ===================== */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const hero = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.8,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 30,
    fontWeight: 700
};
const subtitle = {
    margin: 0,
    maxWidth: 760,
    opacity: 0.88,
    lineHeight: 1.55
};
const heroStats = {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(95px,1fr))",
    gap: 10,
    minWidth: 320
};
const kpi = {
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 14,
    padding: 12
};
const kpiLabel = {
    fontSize: 11,
    opacity: 0.78,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 4,
    fontSize: 18,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
const layout = {
    display: "grid",
    gridTemplateColumns: "minmax(0,2fr) 390px",
    gap: 16,
    alignItems: "start"
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const sideCard = {
    ...card,
    position: "sticky",
    top: 12
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12
};
const sectionTitle = {
    margin: 0,
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 700
};
const sectionText = {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.45
};
const toolbar = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap"
};
const searchInput = {
    width: 330,
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    boxSizing: "border-box"
};
const tableWrap = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    overflow: "auto"
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1050
};
const th = {
    textAlign: "left",
    padding: "10px 9px",
    fontSize: 12,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
    fontWeight: 700
};
const td = {
    padding: "9px",
    fontSize: 13,
    color: "#0F172A",
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle"
};
const tdStrong = {
    ...td,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const emptyCell = {
    padding: 18,
    color: "#64748B",
    fontSize: 13
};
const buttonGroup = {
    display: "flex",
    gap: 6,
    flexWrap: "wrap"
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnPrimary = {
    ...btnBase,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF"
};
const btnSecondary = {
    ...btnBase,
    background: "#FFFFFF",
    color: "#0F172A"
};
const btnPrimarySmall = {
    ...btnPrimary,
    padding: "6px 9px",
    fontSize: 12,
    borderRadius: 8
};
const btnSecondarySmall = {
    ...btnSecondary,
    padding: "6px 9px",
    fontSize: 12,
    borderRadius: 8
};
const btnDangerSmall = {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
};
const form = {
    display: "grid",
    gap: 12
};
const field = {
    display: "grid",
    gap: 5
};
const labelStyle = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const hintStyle = {
    fontSize: 11,
    color: "#94A3B8"
};
const input = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box"
};
const formActions = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4
};
const currentBox = {
    marginTop: 18,
    padding: 14,
    border: "1px solid #DBEAFE",
    borderRadius: 14,
    background: "#EAF2FF"
};
const currentLabel = {
    fontSize: 12,
    color: "#1E3A8A",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const currentTitle = {
    marginTop: 6,
    color: "#0F172A",
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.35
};
const currentSub = {
    marginTop: 4,
    color: "#64748B",
    fontSize: 13
};
const quickActions = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12
};
const badgeNeutral = {
    display: "inline-flex",
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#475569",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700
};
const badgeActive = {
    ...badgeNeutral,
    border: "1px solid #BED6FF",
    background: "#DBEAFE",
    color: "#0B5BD3"
};
const infoBox = {
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#14532D",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600
};
const muted = {
    color: "#64748B",
    fontSize: 13
};
