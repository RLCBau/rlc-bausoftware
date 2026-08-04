import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/Uebersicht.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { useProject } from "../../store/useProject";
import { API_BASE } from "../../lib/apiBase";
function getCurrentProject(projectCtx) {
    return (projectCtx?.currentProject ??
        projectCtx?.current ??
        projectCtx?.selectedProject ??
        projectCtx?.project ?? (typeof projectCtx?.getSelectedProject === "function" ?
        projectCtx.getSelectedProject() :
        null) ?? (typeof projectCtx?.getCurrentProject === "function" ?
        projectCtx.getCurrentProject() :
        null) ??
        null);
}
function projectCode(project) {
    return String(project?.code ?? project?.number ?? project?.id ?? "").
        trim().
        toUpperCase();
}
function projectName(project) {
    return String(project?.name ?? project?.projectName ?? "").trim();
}
function safeJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
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
async function loadServerAufmassCount(code) {
    if (!code)
        return 0;
    const response = await fetch(apiUrl(`/api/aufmass/aufmass/${encodeURIComponent(code)}`), {
        method: "GET",
        credentials: "include"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || `Aufmaß konnte nicht geladen werden: HTTP ${response.status}`);
    }
    const rows = Array.isArray(payload?.rows) ?
        payload.rows :
        Array.isArray(payload?.items) ?
            payload.items :
            Array.isArray(payload) ?
                payload :
                [];
    return rows.filter((row) => {
        const raw = row?.ist ??
            row?.istMenge ??
            row?.measuredQuantity ??
            row?.quantityActual ??
            0;
        const value = typeof raw === "string" ?
            Number(raw.replace(/\./g, "").replace(",", ".")) :
            Number(raw);
        return Number.isFinite(value) && Math.abs(value) > 0;
    }).length;
}
function TileButton({ tile }) {
    const nav = useNavigate();
    return (_jsxs("button", { type: "button", className: rlcClass(null, tileCard), onClick: () => nav(tile.to), children: [_jsxs("div", { className: rlcClass(null, tileTop), children: [_jsx("div", { className: rlcClass(null, iconBox), children: tile.icon }), tile.badge ? _jsx("span", { className: rlcClass(null, tileBadge), children: tile.badge }) : null] }), _jsx("div", { className: rlcClass(null, tileTitle), children: tile.title }), _jsx("div", { className: rlcClass(null, tileText), children: tile.desc }), _jsx("div", { className: rlcClass(null, tileFooter), children: "\u00D6ffnen \u2192" })] }));
}
function Section({ title, subtitle, tiles }) {
    return (_jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: title }), _jsx("div", { className: rlcClass(null, sectionText), children: subtitle })] }) }), _jsx("div", { className: rlcClass(null, tilesGrid), children: tiles.map((tile) => _jsx(TileButton, { tile: tile }, tile.to)) })] }));
}
function Kpi({ label, value, sub, danger }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
export default function MengenermittlungUebersicht() {
    const nav = useNavigate();
    const projectCtx = useProject();
    const currentProject = getCurrentProject(projectCtx);
    const code = projectCode(currentProject);
    const name = projectName(currentProject);
    const [serverAufmassRows, setServerAufmassRows] = React.useState(0);
    const [aufmassLoading, setAufmassLoading] = React.useState(false);
    const [aufmassError, setAufmassError] = React.useState("");
    React.useEffect(() => {
        let cancelled = false;
        if (!code) {
            setServerAufmassRows(0);
            setAufmassError("");
            return;
        }
        setAufmassLoading(true);
        setAufmassError("");
        loadServerAufmassCount(code).
            then((count) => {
            if (!cancelled)
                setServerAufmassRows(count);
        }).
            catch((error) => {
            console.error("[Mengenermittlung] Server-Aufmaß konnte nicht geladen werden", error);
            if (!cancelled) {
                setServerAufmassRows(0);
                setAufmassError("Serverdaten konnten nicht geladen werden");
            }
        }).
            finally(() => {
            if (!cancelled)
                setAufmassLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [code]);
    const nextStep = React.useMemo(() => {
        if (!code) {
            return {
                title: "Projekt auswählen",
                text: "Wähle zuerst ein Projekt, damit Aufmaß, Soll/Ist und Nachträge eindeutig gespeichert werden.",
                to: "/start"
            };
        }
        if (serverAufmassRows <= 0) {
            return {
                title: "Aufmaß starten",
                text: "Auf dem Server sind noch keine Positionen mit Ist-Menge vorhanden. Öffne den Aufmaß-Editor und erfasse Mengen.",
                to: "/mengenermittlung/aufmasseditor"
            };
        }
        return {
            title: "Soll/Ist prüfen",
            text: "Aufmaßdaten sind vorhanden. Prüfe Fortschritt, Abweichungen und abrechenbare Mengen.",
            to: "/mengenermittlung/soll-ist"
        };
    }, [code, serverAufmassRows]);
    const tiles = [
        {
            title: "Aufmaß-Editor",
            desc: "Zentrale Erfassung je LV-Position: Formel, Teilmengen, Ist-Menge, Notizen und strukturierte Aufmaßzeilen.",
            to: "/mengenermittlung/aufmasseditor",
            icon: "📋",
            group: "workflow",
            badge: "Zentral"
        },
        {
            title: "Positionen aus LV",
            desc: "LV-gestützte Mengenermittlung: Position wählen, Soll-Menge prüfen und Aufmaß direkt der Position zuordnen.",
            to: "/mengenermittlung/aufmasseditor",
            icon: "📐",
            group: "workflow"
        },
        {
            title: "Soll / Ist",
            desc: "Soll-Mengen, Ist-Mengen, Differenzen, Fortschritt und Überschreitungen je Position kontrollieren.",
            to: "/mengenermittlung/soll-ist",
            icon: "📊",
            group: "kontrolle",
            badge: serverAufmassRows ? `${serverAufmassRows} IST` : undefined
        },
        {
            title: "Auto KI",
            desc: "Automatische Mengenermittlung mit KI-Vorschlägen, Erkennung, Plausibilisierung und manueller Kontrolle.",
            to: "/mengenermittlung/auto",
            icon: "🧾",
            group: "erfassung"
        },
        {
            title: "GPS / GNSS",
            desc: "Messpunkte, GPS-Zuweisungen und Baustellenpositionen mit LV-Positionen und Aufmaß verknüpfen.",
            to: "/mengenermittlung/gps",
            icon: "✨",
            group: "erfassung"
        },
        {
            title: "Regieberichte",
            desc: "Regieleistungen erfassen, dokumentieren, prüfen und für Abrechnung oder Nachtrag vorbereiten.",
            to: "/mengenermittlung/regieberichte",
            icon: "📷",
            group: "workflow"
        },
        {
            title: "Lieferscheine",
            desc: "Lieferscheine verwalten, Mengen übernehmen und Material / Lieferung mit Positionen verknüpfen.",
            to: "/mengenermittlung/lieferscheine",
            icon: "📥",
            group: "workflow"
        },
        {
            title: "Historie",
            desc: "Änderungen, Snapshots, Aufmaßstände und ältere Mengenstände nachvollziehen.",
            to: "/mengenermittlung/historie",
            icon: "🚚",
            group: "kontrolle"
        },
        {
            title: "Aufmaß-Vergleich",
            desc: "Aufmaßstände vergleichen, Abweichungen erkennen und Differenzen strukturiert prüfen.",
            to: "/mengenermittlung/soll-ist",
            icon: "➕",
            group: "kontrolle"
        },
        {
            title: "Ausdrucke / Export",
            desc: "Massenaufstellung, Aufmaßblätter, Nachweise und prüfbare Exporte erzeugen.",
            to: "/mengenermittlung/aufmasseditor",
            icon: "💶",
            group: "export",
            badge: "PDF/XLSX"
        },
        {
            title: "Stammdaten",
            desc: "Formeln, Standardansätze, Einheiten und Grundlagen für die Mengenermittlung pflegen.",
            to: "/kalkulation/datenbank/preise",
            icon: "🕘",
            group: "kontrolle"
        }
    ];
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsx(PageHeader, { breadcrumb: "RLC Module / Mengenermittlung", title: "Mengenermittlung", subtitle: "Zentrale Steuerung f\u00FCr Aufma\u00DF, Soll/Ist, Regie, Lieferscheine, GPS, Import, Nachtr\u00E4ge und Abrechnung." }), _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Mengenermittlung" }), _jsx("h1", { className: rlcClass(null, heroTitle), children: "Aufma\u00DF- und Mengenzentrale" }), _jsx("p", { className: rlcClass(null, heroText), children: "Diese \u00DCbersicht steuert den gesamten Mengenprozess: LV-Position ausw\u00E4hlen, Aufma\u00DF erfassen, Soll/Ist pr\u00FCfen, Regie und Lieferscheine \u00FCbernehmen, Nachtr\u00E4ge verkn\u00FCpfen und pr\u00FCfbare Ausgaben vorbereiten." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => nav(nextStep.to), children: "N\u00E4chster Schritt" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/mengenermittlung/aufmasseditor"), children: "Aufma\u00DF \u00F6ffnen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/mengenermittlung/soll-ist"), children: "Soll/Ist pr\u00FCfen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/mengenermittlung/regieberichte"), children: "Regieberichte" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: code || "—" }), name ?
                                _jsxs(_Fragment, { children: [" ", "\u00B7 ", _jsx("b", { children: name })] }) :
                                null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(Kpi, { label: "Projekt", value: code || "Kein Projekt", sub: name || "Bitte Projekt auswählen", danger: !code }), _jsx(Kpi, { label: "Aufgemessen (IST)", value: String(serverAufmassRows), sub: aufmassLoading ? "Serverdaten werden geladen…" : aufmassError || "Positionen mit Ist-Menge auf dem Server", danger: !!code && serverAufmassRows <= 0 }), _jsx(Kpi, { label: "Datenfluss", value: "LV \u2192 Aufma\u00DF \u2192 Soll/Ist", sub: "Grundlage f\u00FCr Abrechnung und Nachtr\u00E4ge" }), _jsx(Kpi, { label: "N\u00E4chster Schritt", value: nextStep.title, sub: nextStep.text, danger: !code })] }), _jsxs("section", { className: rlcClass(null, workflowCard), children: [_jsx("button", { type: "button", className: rlcClass(null, workflowStep), onClick: () => nav("/mengenermittlung/aufmasseditor"), children: "1. LV-Position" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("button", { type: "button", className: rlcClass(null, workflowStep), onClick: () => nav("/mengenermittlung/aufmasseditor"), children: "2. Aufma\u00DF" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("button", { type: "button", className: rlcClass(null, workflowStep), onClick: () => nav("/mengenermittlung/soll-ist"), children: "3. Soll/Ist" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("button", { type: "button", className: rlcClass(null, workflowStep), onClick: () => nav("/mengenermittlung/regieberichte"), children: "4. Regie / LS / GPS" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" })] }), _jsxs("section", { className: rlcClass(null, diagnoseGrid), children: [_jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Aufma\u00DF-Kontrolle" }), _jsxs("div", { className: rlcClass(null, miniStats), children: [_jsx("span", { children: "Aktuelles Projekt" }), _jsx("b", { children: code || "—" }), _jsx("span", { children: "Aufgemessen auf Server" }), _jsx("b", { children: serverAufmassRows }), _jsx("span", { children: "Prim\u00E4rer Speicher" }), _jsx("b", { children: "Server" }), _jsx("span", { children: "Lokale Daten" }), _jsx("b", { children: "Cache / Fallback" }), _jsx("span", { children: "Ziel" }), _jsx("b", { children: "pr\u00FCfbares Aufma\u00DF" })] }), _jsx("button", { type: "button", className: rlcClass(null, btnFull), onClick: () => nav("/mengenermittlung/aufmasseditor"), children: "Aufma\u00DF-Editor \u00F6ffnen" })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Pr\u00FCf- und Abrechnungsfluss" }), _jsxs("div", { className: rlcClass(null, miniStats), children: [_jsx("span", { children: "Soll/Ist" }), _jsx("b", { children: "aktiv" }), _jsx("span", { children: "Regie" }), _jsx("b", { children: "angebunden" }), _jsx("span", { children: "Lieferscheine" }), _jsx("b", { children: "angebunden" }), _jsx("span", { children: "Nachtr\u00E4ge" }), _jsx("b", { children: "verkn\u00FCpfbar" }), _jsx("span", { children: "Export" }), _jsx("b", { children: "pr\u00FCfbar" })] }), _jsx("button", { type: "button", className: rlcClass(null, btnFull), onClick: () => nav("/mengenermittlung/soll-ist"), children: "Soll/Ist \u00F6ffnen" })] })] }), _jsx(Section, { title: "Hauptworkflow", subtitle: "Diese Bereiche sind der t\u00E4gliche Kern der Mengenermittlung.", tiles: tiles.filter((x) => x.group === "workflow") }), _jsx(Section, { title: "Erfassung & Import", subtitle: "Manuelle Erfassung, KI, Fotos, Dateien, CAD und GPS/GNSS.", tiles: tiles.filter((x) => x.group === "erfassung") }), _jsx(Section, { title: "Kontrolle & Historie", subtitle: "Soll/Ist, Vergleich, Historie und fachliche Stammdaten.", tiles: tiles.filter((x) => x.group === "kontrolle") }), _jsx(Section, { title: "Nachtr\u00E4ge, Abrechnung & Ausgabe", subtitle: "Alles f\u00FCr Abrechnung, Nachweise, Nachtr\u00E4ge und pr\u00FCfbare Exporte.", tiles: tiles.filter((x) => x.group === "export") })] }));
}
/* ===================== STYLES ===================== */
const page = {
    maxWidth: 1480,
    margin: "0 auto",
    padding: "16px 18px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
    color: "#0f172a",
    background: "radial-gradient(circle at top left, rgba(37,99,235,0.06), transparent 30%), #f6f8fc",
    minHeight: "100%"
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
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
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.1
};
const heroText = {
    margin: 0,
    maxWidth: 980,
    opacity: 0.9,
    lineHeight: 1.55
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
const btnBase = {
    fontSize: 13,
    borderRadius: 10,
    padding: "11px 16px",
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#0F172A",
    cursor: "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const btnPrimary = {
    padding: "9px 12px",
    border: "1px solid #146ef5",
    background: "linear-gradient(135deg,#146ef5,#155eef)",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 700,
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(37,99,235,0.18)"
};
const btnSecondary = {
    ...btnBase
};
const btnFull = {
    ...btnPrimary,
    marginTop: 14,
    width: "100%"
};
const grid4 = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
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
    marginTop: 6,
    fontSize: 20,
    color: "#0F172A",
    fontWeight: 700,
    lineHeight: 1.25
};
const kpiSub = {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.35
};
const workflowCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
};
const workflowStep = {
    background: "#EAF2FF",
    cursor: "pointer",
    color: "#1E3A8A",
    border: "1px solid #BED6FF",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700
};
const workflowArrow = {
    color: "#64748B",
    fontWeight: 700
};
const diagnoseGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
    gap: 14
};
const card = {
    background: "#ffffff",
    border: "1px solid #e5eaf3",
    borderRadius: 18,
    boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
    padding: 16
};
const miniStats = {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    fontSize: 13,
    color: "#0F172A"
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
    lineHeight: 1.5
};
const tilesGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: 14
};
const tileCard = {
    textAlign: "left",
    padding: 16,
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    background: "#FFFFFF",
    cursor: "pointer",
    minHeight: 158,
    display: "grid",
    alignContent: "start",
    gap: 8,
    boxShadow: "0 1px 2px rgba(15,23,42,0.035)"
};
const tileTop = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
};
const iconBox = {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: "#EAF2FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    border: "1px solid #DBEAFE"
};
const tileBadge = {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    color: "#0B5BD3",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const tileTitle = {
    fontWeight: 700,
    fontSize: 16,
    color: "#0F172A",
    marginTop: 2
};
const tileText = {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 1.5
};
const tileFooter = {
    marginTop: 6,
    color: "#146EF5",
    fontSize: 13,
    fontWeight: 700
};
