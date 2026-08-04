import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/Uebersicht.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { useProject } from "../../store/useProject";
import { LV } from "./store.lv";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";
function getCurrentProject(projectCtx) {
    return (projectCtx?.currentProject ??
        projectCtx?.current ??
        projectCtx?.selectedProject ??
        projectCtx?.project ?? (typeof projectCtx?.getCurrentProject === "function" ?
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
function n(value) {
    const raw = String(value ?? "0").
        replace(/\s/g, "").
        replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
        replace(",", ".");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}
function money(value) {
    return `${n(value).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} €`;
}
function rowPrice(row) {
    return n(row.finalUnitPrice ?? row.preis ?? row.suggestedUnitPrice);
}
function rowTotal(row) {
    const stored = n(row.gesamt);
    if (stored > 0)
        return stored;
    return n(row.menge) * rowPrice(row);
}
function norm(value) {
    return String(value ?? "").
        toLowerCase().
        normalize("NFKD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/[^\p{L}\p{N}]+/gu, " ").
        replace(/\s+/g, " ").
        trim();
}
function duplicateKey(row) {
    const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
    if (text.length < 8)
        return "";
    return [
        text,
        norm(row.einheit),
        Math.round(n(row.menge) * 1000) / 1000,
        Math.round(rowPrice(row) * 100) / 100
    ].
        join("|");
}
function getDuplicateCount(rows) {
    const map = new Map();
    for (const row of rows) {
        const key = duplicateKey(row);
        if (!key)
            continue;
        const list = map.get(key) || [];
        list.push(row);
        map.set(key, list);
    }
    return Array.from(map.values()).reduce((sum, group) => sum + Math.max(0, group.length - 1), 0);
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
export default function KalkulationUebersicht() {
    const nav = useNavigate();
    const projectCtx = useProject();
    const currentProject = getCurrentProject(projectCtx);
    const code = projectCode(currentProject);
    const name = projectName(currentProject);
    const lvRows = React.useMemo(() => {
        try {
            return LV.list();
        }
        catch {
            return [];
        }
    }, []);
    const dbRows = React.useMemo(() => {
        try {
            return KalkulationsDatenbank.list();
        }
        catch {
            return [];
        }
    }, []);
    const lvStats = React.useMemo(() => {
        const total = lvRows.length;
        const net = lvRows.reduce((sum, row) => sum + rowTotal(row), 0);
        const missingQty = lvRows.filter((r) => n(r.menge) <= 0).length;
        const missingUnit = lvRows.filter((r) => !String(r.einheit || "").trim()).length;
        const missingPrice = lvRows.filter((r) => rowPrice(r) <= 0).length;
        const missingText = lvRows.filter((r) => !String(r.kurztext || "").trim()).length;
        const missingLang = lvRows.filter((r) => !String(r.langtext || "").trim()).length;
        const duplicates = getDuplicateCount(lvRows);
        const ready = lvRows.filter((r) => String(r.posNr || "").trim() &&
            String(r.kurztext || "").trim() &&
            String(r.einheit || "").trim() &&
            n(r.menge) > 0 &&
            rowPrice(r) > 0).length;
        return {
            total,
            net,
            missingQty,
            missingUnit,
            missingPrice,
            missingText,
            missingLang,
            duplicates,
            ready,
            problems: missingQty + missingUnit + missingPrice + missingText + missingLang + duplicates
        };
    }, [lvRows]);
    const dbStats = React.useMemo(() => {
        const total = dbRows.length;
        const missingEp = dbRows.filter((r) => n(r.kosten?.epNetto) <= 0).length;
        const missingUnit = dbRows.filter((r) => !String(r.einheit || "").trim()).length;
        const missingResources = dbRows.filter((r) => !r.ressourcen?.length).length;
        const highRisk = dbRows.filter((r) => r.risiko === "hoch" || r.risiko === "kritisch").length;
        const lowConfidence = dbRows.filter((r) => n(r.confidence) < 0.7).length;
        return {
            total,
            missingEp,
            missingUnit,
            missingResources,
            highRisk,
            lowConfidence,
            problems: missingEp + missingUnit + missingResources + highRisk + lowConfidence
        };
    }, [dbRows]);
    const nextStep = React.useMemo(() => {
        if (!lvStats.total) {
            return {
                title: "LV importieren oder Positionen anlegen",
                text: "Es sind noch keine LV-Positionen vorhanden. Starte mit LV / Positionen.",
                to: "/kalkulation/lv-import"
            };
        }
        if (lvStats.problems > 0) {
            return {
                title: "LV-Daten prüfen",
                text: "Es gibt fehlende Mengen, Einheiten, Texte, Preise oder doppelte Positionen.",
                to: "/kalkulation/lv-import"
            };
        }
        if (dbStats.problems > 0) {
            return {
                title: "Kalkulationsdatenbank bereinigen",
                text: "Die Datenbank enthält fehlende EP, Ressourcen, Einheiten oder Risiko-Einträge.",
                to: "/kalkulation/datenbank"
            };
        }
        return {
            title: "KI-Kalkulation starten",
            text: "LV und Datenbasis sind vorbereitet. Jetzt kann die Kalkulation mit KI geprüft werden.",
            to: "/kalkulation/mit-ki"
        };
    }, [lvStats, dbStats]);
    const tiles = [
        {
            title: "LV / Positionen",
            desc: "Leistungsverzeichnis importieren, Positionen prüfen, neue Positionen anlegen und Projekt-LV vorbereiten.",
            to: "/kalkulation/lv-import",
            icon: "📋",
            group: "workflow",
            badge: lvStats.problems ? `${lvStats.problems} prüfen` : "Start"
        },
        {
            title: "Kalkulation",
            desc: "Zentrale Kalkulation mit Hauptauftrag, Unteraufträgen, KI-Vorschlag, manueller Bearbeitung, Preisaufbau und Urkalkulation.",
            to: "/kalkulation/mit-ki",
            icon: "🧮",
            group: "workflow",
            badge: "Zentral"
        },
        {
            title: "Preise & Ressourcen",
            desc: "Firmenpreise, Personal, Maschinen, Material, Transport, Entsorgung und Standardansätze pflegen.",
            to: "/kalkulation/preise",
            icon: "💶",
            group: "daten"
        },
        {
            title: "Kalkulationsdatenbank",
            desc: "Erfahrungswerte, gelernte Positionen, Preisansätze und wiederverwendbare Kalkulationsdaten verwalten.",
            to: "/kalkulation/datenbank",
            icon: "🧠",
            group: "daten",
            badge: dbStats.problems ? `${dbStats.problems} prüfen` : undefined
        },
        {
            title: "GAEB Import / Export",
            desc: "GAEB-Dateien importieren, prüfen, übernehmen und als X83/X84 exportieren.",
            to: "/kalkulation/gaeb",
            icon: "📦",
            group: "daten",
            badge: "GAEB"
        },
        {
            title: "Nachträge",
            desc: "Zusatzleistungen, Varianten und Nachtragspositionen erstellen und prüfen.",
            to: "/kalkulation/nachtraege",
            icon: "➕",
            group: "export"
        },
        {
            title: "Angebot / Export",
            desc: "Angebot aus der Kalkulation erzeugen und als PDF, Excel oder weitere Ausgabeformate exportieren.",
            to: "/kalkulation/angebot",
            icon: "📄",
            group: "export",
            badge: "PDF/XLSX"
        },
        {
            title: "Versionsvergleich / Analyse",
            desc: "Kalkulationsstände, Angebotsversionen, Preisabweichungen und Risiken vergleichen.",
            to: "/kalkulation/versionsvergleich",
            icon: "📊",
            group: "export"
        },
        {
            title: "CRM / Angebotsverfolgung",
            desc: "Angebote nachverfolgen, Status pflegen und Rückmeldungen strukturiert verwalten.",
            to: "/kalkulation/crm",
            icon: "📌",
            group: "export"
        }
    ];
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsx(PageHeader, { breadcrumb: "RLC Module / Kalkulation", title: "Kalkulation", subtitle: "Zentrale Steuerung f\u00FCr LV, KI-Kalkulation, Datenbank, GAEB und Angebot." }), _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Kalkulation" }), _jsx("h1", { className: rlcClass(null, heroTitle), children: "Kalkulationszentrale" }), _jsx("p", { className: rlcClass(null, heroText), children: "Diese \u00DCbersicht steuert den gesamten Kalkulationsprozess: LV pr\u00FCfen, KI-Kalkulation starten, Datenbank bereinigen, Urkalkulation aufbauen und Angebot / GAEB vorbereiten." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => nav(nextStep.to), children: "N\u00E4chster Schritt" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/lv-import"), children: "LV pr\u00FCfen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/mit-ki"), children: "KI-Kalkulation" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => nav("/kalkulation/datenbank"), children: "Datenbank" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: code || "—" }), name ?
                                _jsxs(_Fragment, { children: [" ", "\u00B7 ", _jsx("b", { children: name })] }) :
                                null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(Kpi, { label: "LV-Positionen", value: String(lvStats.total), sub: `${lvStats.ready} plausibel · ${lvStats.problems} prüfen`, danger: lvStats.problems > 0 }), _jsx(Kpi, { label: "Netto aus LV", value: money(lvStats.net) }), _jsx(Kpi, { label: "Datenbank", value: String(dbStats.total), sub: `${dbStats.problems} Datenbank-Probleme`, danger: dbStats.problems > 0 }), _jsx(Kpi, { label: "N\u00E4chster Schritt", value: nextStep.title, sub: nextStep.text, danger: lvStats.problems > 0 || dbStats.problems > 0 })] }), _jsxs("section", { className: rlcClass(null, workflowCard), children: [_jsx("div", { className: rlcClass(null, workflowStep), children: "1. LV / Positionen" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("div", { className: rlcClass(null, workflowStep), children: "2. KI-Kalkulation" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("div", { className: rlcClass(null, workflowStep), children: "3. Datenbank / Preise" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("div", { className: rlcClass(null, workflowStep), children: "4. Urkalkulation" }), _jsx("div", { className: rlcClass(null, workflowArrow), children: "\u2192" }), _jsx("div", { className: rlcClass(null, workflowStep), children: "5. Angebot / GAEB" })] }), _jsxs("section", { className: rlcClass(null, diagnoseGrid), children: [_jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "LV-Kontrolle" }), _jsxs("div", { className: rlcClass(null, miniStats), children: [_jsx("span", { children: "Positionen" }), _jsx("b", { children: lvStats.total }), _jsx("span", { children: "Menge fehlt / 0" }), _jsx("b", { children: lvStats.missingQty }), _jsx("span", { children: "Einheit fehlt" }), _jsx("b", { children: lvStats.missingUnit }), _jsx("span", { children: "EP fehlt" }), _jsx("b", { children: lvStats.missingPrice }), _jsx("span", { children: "Kurztext fehlt" }), _jsx("b", { children: lvStats.missingText }), _jsx("span", { children: "Langtext fehlt" }), _jsx("b", { children: lvStats.missingLang }), _jsx("span", { children: "Doppelte" }), _jsx("b", { children: lvStats.duplicates })] }), _jsx("button", { type: "button", className: rlcClass(null, btnFull), onClick: () => nav("/kalkulation/lv-import"), children: "LV / Positionen \u00F6ffnen" })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Datenbank-Kontrolle" }), _jsxs("div", { className: rlcClass(null, miniStats), children: [_jsx("span", { children: "Eintr\u00E4ge" }), _jsx("b", { children: dbStats.total }), _jsx("span", { children: "EP fehlt" }), _jsx("b", { children: dbStats.missingEp }), _jsx("span", { children: "Einheit fehlt" }), _jsx("b", { children: dbStats.missingUnit }), _jsx("span", { children: "Ressourcen fehlen" }), _jsx("b", { children: dbStats.missingResources }), _jsx("span", { children: "Risiko hoch/kritisch" }), _jsx("b", { children: dbStats.highRisk }), _jsx("span", { children: "Confidence niedrig" }), _jsx("b", { children: dbStats.lowConfidence })] }), _jsx("button", { type: "button", className: rlcClass(null, btnFull), onClick: () => nav("/kalkulation/datenbank"), children: "Kalkulationsdatenbank \u00F6ffnen" })] })] }), _jsx(Section, { title: "Hauptworkflow", subtitle: "Diese zwei Bereiche sind der t\u00E4gliche Kern der Kalkulation.", tiles: tiles.filter((x) => x.group === "workflow") }), _jsx(Section, { title: "Daten & Preisgrundlagen", subtitle: "Hier liegen Preisbasis, Ressourcen, GAEB und Erfahrungswerte.", tiles: tiles.filter((x) => x.group === "daten") }), _jsx(Section, { title: "Nachtr\u00E4ge, Angebot & Analyse", subtitle: "Alles f\u00FCr Ausgabe, Nachtr\u00E4ge, Vergleich und Angebotsverfolgung.", tiles: tiles.filter((x) => x.group === "export") })] }));
}
/* ===================== STYLES ===================== */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
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
    ...btnBase,
    background: "#146EF5",
    border: "1px solid #146EF5",
    color: "#FFFFFF",
    boxShadow: "0 10px 20px rgba(37,99,235,0.22)"
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
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
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
