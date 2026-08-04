import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/start/projektUebersicht.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
/* ================= API ================= */
function apiUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!base)
        return cleanPath;
    if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
        return `${base}${cleanPath.slice(4)}`;
    }
    return `${base}${cleanPath}`;
}
/* ================= IMPORT WIDGET ================= */
function ImportProjectJsonInline({ onDone }) {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    async function upload() {
        if (!file) {
            window.alert("Bitte zuerst eine project.json auswählen.");
            return;
        }
        setBusy(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(apiUrl("/api/import/project-json"), {
                method: "POST",
                body: form,
                credentials: "include"
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) {
                throw new Error(json?.error || "Import fehlgeschlagen.");
            }
            window.alert("Projekt importiert.");
            setFile(null);
            onDone?.();
        }
        catch (e) {
            console.error(e);
            window.alert(`Import fehlgeschlagen: ${e?.message || e}`);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, importInline), children: [_jsx("input", { type: "file", accept: ".json,application/json", onChange: (e) => setFile(e.target.files?.[0] || null), className: rlcClass(null, fileInput) }), _jsx("button", { type: "button", onClick: upload, disabled: !file || busy, className: rlcClass(null, !file || busy ? btnDisabled : btnPrimary), children: busy ? "Importiere…" : "Project.json importieren" })] }));
}
/* ================= HELPERS ================= */
function getProjectStatus(cur) {
    if (!cur)
        return "Unbekannt";
    if (cur.id && String(cur.id).startsWith("local-"))
        return "Local";
    if (cur.id)
        return "Cloud";
    return "Unbekannt";
}
function readLastOpenedAt(idOrCode) {
    try {
        const raw = localStorage.getItem("rlc_recent_projects_meta");
        const parsed = raw ? JSON.parse(raw) : {};
        const ts = parsed?.[idOrCode];
        if (!ts)
            return "—";
        const d = new Date(ts);
        if (Number.isNaN(d.getTime()))
            return "—";
        return d.toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }
    catch {
        return "—";
    }
}
function saveLastOpenedAt(idOrCode) {
    try {
        const raw = localStorage.getItem("rlc_recent_projects_meta");
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[idOrCode] = new Date().toISOString();
        localStorage.setItem("rlc_recent_projects_meta", JSON.stringify(parsed));
    }
    catch {
        // ignore
    }
}
function getProjectFromCtx(projectCtx) {
    const p = projectCtx?.currentProject ??
        projectCtx?.current ??
        projectCtx?.selectedProject ??
        projectCtx?.project ?? (typeof projectCtx?.getCurrentProject === "function" ?
        projectCtx.getCurrentProject() :
        null);
    if (p && typeof p === "object")
        return p;
    try {
        const g = globalThis;
        return g.__RLC_CURRENT_PROJECT ?? null;
    }
    catch {
        return null;
    }
}
function statusBadge(status) {
    if (status === "Cloud") {
        return {
            ...badgeBase,
            border: "1px solid #BED6FF",
            background: "#EAF2FF",
            color: "#0B5BD3"
        };
    }
    if (status === "Local") {
        return {
            ...badgeBase,
            border: "1px solid #FDE68A",
            background: "#FFFBEB",
            color: "#92400E"
        };
    }
    return {
        ...badgeBase,
        border: "1px solid #CBD5E1",
        background: "#F8FAFC",
        color: "#475569"
    };
}
/* ================= COMPONENT ================= */
export default function ProjektUebersicht() {
    const nav = useNavigate();
    const projectCtx = useProject?.() ?? null;
    const cur = getProjectFromCtx(projectCtx);
    useEffect(() => {
        if (!projectCtx || !cur)
            return;
        const already = projectCtx.currentProject ??
            projectCtx.current ??
            projectCtx.selectedProject ??
            projectCtx.project ??
            null;
        if (already && (already.id && cur.id && already.id === cur.id ||
            already.code && cur.code && already.code === cur.code)) {
            return;
        }
        try {
            projectCtx?.setCurrentProject?.(cur);
            if (cur.id) {
                projectCtx?.setCurrentProjectId?.(cur.id);
                projectCtx?.selectProjectById?.(cur.id);
            }
            projectCtx?.selectProject?.(cur);
        }
        catch (e) {
            console.warn("Projekt-Kontext konnte nicht synchronisiert werden:", e);
        }
        try {
            const g = globalThis;
            g.__RLC_CURRENT_PROJECT = cur;
        }
        catch {
            // ignore
        }
    }, [projectCtx, cur]);
    useEffect(() => {
        const key = String(cur?.id || cur?.code || "");
        if (key)
            saveLastOpenedAt(key);
    }, [cur?.id, cur?.code]);
    const normalized = useMemo(() => {
        const number = cur?.code ?? cur?.number ?? cur?.projektnummer ?? "";
        const name = cur?.name ?? cur?.projectName ?? cur?.projektname ?? "";
        const client = cur?.client ?? cur?.auftraggeber ?? cur?.kunde ?? "";
        const location = cur?.place ?? cur?.city ?? cur?.ort ?? cur?.location ?? "";
        const status = getProjectStatus(cur);
        const lastOpened = readLastOpenedAt(String(cur?.id || cur?.code || ""));
        return {
            number,
            name,
            client,
            location,
            status,
            lastOpened
        };
    }, [cur]);
    const tiles = [
        {
            nr: "01",
            title: "Kalkulation",
            desc: "LV, Preise, KI-Kalkulation, Nachträge, Angebot, GAEB und Angebotsanalyse.",
            to: "/kalkulation",
            icon: "💰",
            accent: "#DCFCE7",
            accentText: "#166534",
            main: true
        },
        {
            nr: "02",
            title: "Mengenermittlung",
            desc: "Aufmaß, Regieberichte, Lieferscheine, Fotos, Soll-Ist und Abrechnung.",
            to: "/mengenermittlung",
            icon: "📋",
            accent: "#DBEAFE",
            accentText: "#0B5BD3",
            main: true
        },
        {
            nr: "03",
            title: "CAD / Planung",
            desc: "Pläne, Viewer, PDF, As-Built, technische Projektansicht und Export.",
            to: "/cad/viewer",
            icon: "📐",
            accent: "#EDE9FE",
            accentText: "#6D28D9",
            main: true
        },
        {
            nr: "04",
            title: "Büro / Verwaltung",
            desc: "Dokumente, Kommunikation, Aufgaben, Nutzer, Kalender und Organisation.",
            to: "/buro",
            icon: "🏢",
            accent: "#E0F2FE",
            accentText: "#0369A1",
            main: true
        },
        {
            nr: "05",
            title: "KI",
            desc: "Intelligente Unterstützung für Kalkulation, Analyse und Baustellenlogik.",
            to: "/ki",
            icon: "🤖",
            accent: "#FCE7F3",
            accentText: "#BE185D",
            main: true
        },
        {
            nr: "06",
            title: "Buchhaltung",
            desc: "Rechnungen, Abschläge, Zahlungen, Kostenstellen, DATEV und Auswertung.",
            to: "/buchhaltung",
            icon: "📒",
            accent: "#FEF3C7",
            accentText: "#B45309",
            main: true
        },
        {
            nr: "07",
            title: "Info / Hilfe",
            desc: "Anleitungen, Updates, Support, Videoerklärungen und Systeminformationen.",
            to: "/info",
            icon: "ℹ️",
            accent: "#E2E8F0",
            accentText: "#334155"
        }
    ];
    if (!cur) {
        return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Projekt" }), _jsx("h1", { className: rlcClass(null, heroTitle), children: "Kein Projekt gew\u00E4hlt" }), _jsx("p", { className: rlcClass(null, heroSubtitle), children: "Bitte zuerst ein Projekt ausw\u00E4hlen oder eine project.json importieren." })] }), _jsx("div", { className: rlcClass(null, heroActions), children: _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => nav("/start"), children: "Projekt ausw\u00E4hlen" }) })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Projekt importieren" }), _jsx("p", { className: rlcClass(null, sectionText), children: "Optional kann ein bestehendes Projekt \u00FCber eine project.json \u00FCbernommen werden." }), _jsx("div", { className: "rlc-migrated-pages-start-projektuebersicht-tsx-1566", children: _jsx(ImportProjectJsonInline, { onDone: () => nav("/start") }) })] })] }));
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Projektzentrale" }), _jsx("h1", { className: rlcClass(null, heroTitle), children: "Projekt-\u00DCbersicht" }), _jsx("p", { className: rlcClass(null, heroSubtitle), children: "Zentrale Projektseite f\u00FCr Module, Status, Schnellzugriffe und Weiterbearbeitung." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => nav("/kalkulation"), children: "Kalkulation \u00F6ffnen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondaryDark), onClick: () => nav("/kalkulation/lv-import"), children: "LV / Positionen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondaryDark), onClick: () => nav("/kalkulation/angebot"), children: "Angebot / Export" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondaryDark), onClick: () => nav("/start"), children: "Projekt wechseln" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: normalized.number || "—" }), normalized.name ? _jsxs("span", { children: [" \u00B7 ", normalized.name] }) : null, _jsx("span", { children: " \u00B7 Status: " }), _jsx("b", { children: normalized.status })] })] }), _jsxs("section", { className: rlcClass(null, kpiGrid), children: [_jsx(InfoKpi, { label: "Projektcode", value: normalized.number || "—" }), _jsx(InfoKpi, { label: "Projektname", value: normalized.name || "—" }), _jsx(InfoKpi, { label: "Auftraggeber", value: normalized.client || "—" }), _jsx(InfoKpi, { label: "Ort", value: normalized.location || "—" }), _jsx(InfoKpi, { label: "Letzter Zugriff", value: normalized.lastOpened }), _jsx(InfoKpi, { label: "Speicherart", value: normalized.status, badge: normalized.status })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Module" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Gleiche Struktur wie in der Kalkulation: klare Module, schnelle Navigation, saubere Projektlogik." })] }), _jsx("div", { className: rlcClass(null, statusBadge(normalized.status)), children: normalized.status })] }), _jsx("div", { className: rlcClass(null, tilesGrid), children: tiles.map((tile) => _jsxs("button", { type: "button", onClick: () => nav(tile.to), className: rlcClass(null, {
                                ...tileCard,
                                minHeight: tile.main ? 178 : 154
                            }), onMouseEnter: (e) => {
                                e.currentTarget.style.transform = "translateY(-2px)";
                                e.currentTarget.style.boxShadow = "0 14px 32px rgba(15,23,42,0.10)";
                                e.currentTarget.style.borderColor = "#BED6FF";
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)";
                                e.currentTarget.style.borderColor = "#E5E7EB";
                            }, children: [_jsxs("div", { className: rlcClass(null, tileTop), children: [_jsx("div", { className: rlcClass(null, { ...tileIcon, background: tile.accent, color: tile.accentText }), children: tile.icon }), _jsx("div", { className: rlcClass(null, tileNr), children: tile.nr })] }), _jsx("div", { className: rlcClass(null, tileTitle), children: tile.title }), _jsx("div", { className: rlcClass(null, tileDesc), children: tile.desc }), _jsxs("div", { className: rlcClass(null, tileFooter), children: ["\u00D6ffnen ", _jsx("span", { children: "\u2192" })] })] }, tile.to)) })] }), _jsxs("section", { className: rlcClass(null, quickCard), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Schnellzugriffe" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Direkte Wege zu den wichtigsten Projektfunktionen." })] }), _jsxs("div", { className: rlcClass(null, quickActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/gaeb"), children: "GAEB pr\u00FCfen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/nachtraege"), children: "Nachtr\u00E4ge" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/crm"), children: "CRM / Angebotsverfolgung" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/versionsvergleich"), children: "Versionsvergleich / Analyse" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/start"), children: "Zur\u00FCck zur Projektauswahl" })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Weiteres Projekt importieren" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Optional: project.json direkt importieren und danach zur Projekt-Auswahl wechseln." })] }) }), _jsx(ImportProjectJsonInline, { onDone: () => nav("/start") })] })] }));
}
/* ================= UI ================= */
function InfoKpi({ label, value, badge }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: badge ? _jsx("span", { className: rlcClass(null, statusBadge(badge)), children: value }) : value })] }));
}
/* ================= STYLES ================= */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    display: "grid",
    gap: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.82,
    fontWeight: 700
};
const heroTitle = {
    color: "#FFFFFF", margin: "4px 0",
    fontSize: 32,
    lineHeight: 1.12,
    fontWeight: 700
};
const heroSubtitle = {
    margin: 0,
    maxWidth: 980,
    opacity: 0.9,
    lineHeight: 1.55,
    fontSize: 14
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.92
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const quickCard = {
    ...card,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    border: "1px solid #DBEAFE"
};
const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 12
};
const kpiCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 7,
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 700,
    wordBreak: "break-word"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14
};
const sectionTitle = {
    margin: 0,
    fontSize: 19,
    color: "#0F172A",
    fontWeight: 700
};
const sectionText = {
    marginTop: 5,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.45
};
const tilesGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(285px,1fr))",
    gap: 14
};
const tileCard = {
    textAlign: "left",
    padding: 18,
    border: "1px solid #E5E7EB",
    borderRadius: 18,
    background: "#FFFFFF",
    cursor: "pointer",
    transition: "all 160ms ease",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    display: "grid",
    alignContent: "space-between",
    gap: 10
};
const tileTop = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
};
const tileIcon = {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    fontSize: 25,
    fontWeight: 700
};
const tileNr = {
    border: "1px solid #DBEAFE",
    background: "#EAF2FF",
    color: "#0B5BD3",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 700
};
const tileTitle = {
    marginTop: 4,
    fontSize: 19,
    fontWeight: 700,
    color: "#0F172A"
};
const tileDesc = {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 1.5
};
const tileFooter = {
    marginTop: 6,
    color: "#0B5BD3",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    gap: 6,
    alignItems: "center"
};
const quickActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "10px 14px",
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
const btnSecondaryDark = {
    ...btnBase,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.95)",
    color: "#0F172A"
};
const btnDisabled = {
    ...btnPrimary,
    border: "1px solid #CBD5E1",
    background: "#E5E7EB",
    color: "#64748B",
    cursor: "not-allowed",
    opacity: 0.75
};
const badgeBase = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 700
};
const importInline = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap"
};
const fileInput = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    background: "#FFFFFF",
    fontSize: 13
};
