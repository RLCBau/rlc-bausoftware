import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
// apps/web/src/pages/kalkulation/Recipes.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import RlcKiDashboard from "../../components/rlc-ai/RlcKiDashboard";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import { LV } from "./store.lv";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";
import { RecipeLibrary } from "./recipeLibrary";
import { API_BASE as RAW_API_BASE } from "../../lib/apiBase";
import { detectWorkType, isForbiddenForWorkType, shouldForceLocalCalculation } from "./workTypeLibrary";
import { detectTechnicalPosition, getTechnicalPositionCount } from "./technicalPositionLibrary";
const COMPANY_RECIPE_KEY = "rlc_company_resource_recipes_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const RECIPE_CONTEXT_KEY = "rlc_recipes_new_position_context_v1";
const NACHTRAG_BUFFER_KEY = "rlc:nachtrag-buffer";
/* ================= RESOURCE CATALOG ================= */
const RESOURCE_CATALOG = [
    { id: "P-FACHARBEITER", group: "Personal", name: "Facharbeiter Tiefbau", unit: "h", defaultPrice: 52 },
    { id: "P-HELFER", group: "Personal", name: "Bauhelfer", unit: "h", defaultPrice: 39 },
    { id: "P-POLIER", group: "Personal", name: "Polier / Vorarbeiter", unit: "h", defaultPrice: 68 },
    { id: "P-VERMESSER", group: "Personal", name: "Vermessungstechniker", unit: "h", defaultPrice: 72 },
    { id: "P-BAULEITER", group: "Personal", name: "Bauleiter", unit: "h", defaultPrice: 82 },
    { id: "M-MINIBAGGER", group: "Maschinen", name: "Minibagger 2–3 t", unit: "h", defaultPrice: 48 },
    { id: "M-BAGGER-8T", group: "Maschinen", name: "Bagger 8 t", unit: "h", defaultPrice: 78 },
    { id: "M-BAGGER-15T", group: "Maschinen", name: "Bagger 15 t", unit: "h", defaultPrice: 108 },
    { id: "M-BAGGER-22T", group: "Maschinen", name: "Bagger 22 t", unit: "h", defaultPrice: 132 },
    { id: "M-RADLADER", group: "Maschinen", name: "Radlader", unit: "h", defaultPrice: 84 },
    { id: "M-RUETTELPLATTE", group: "Maschinen", name: "Rüttelplatte", unit: "h", defaultPrice: 22 },
    { id: "M-WALZE", group: "Maschinen", name: "Walze", unit: "h", defaultPrice: 58 },
    { id: "M-FUGENSCHNEIDER", group: "Maschinen", name: "Fugenschneider", unit: "h", defaultPrice: 44 },
    { id: "M-PFLASTERKNACKER", group: "Maschinen", name: "Pflasterknacker / Steinschneider", unit: "h", defaultPrice: 28 },
    { id: "T-LKW-3A", group: "LKW / Transport", name: "LKW 3-Achser", unit: "h", defaultPrice: 98 },
    { id: "T-LKW-4A", group: "LKW / Transport", name: "LKW 4-Achser", unit: "h", defaultPrice: 118 },
    { id: "T-LKW-SATTEL", group: "LKW / Transport", name: "Sattelzug / Schubboden", unit: "h", defaultPrice: 135 },
    { id: "T-TIEFLADER", group: "LKW / Transport", name: "Tieflader / Maschinentransport", unit: "pauschal", defaultPrice: 380 },
    { id: "T-ANFAHRT", group: "LKW / Transport", name: "Anfahrt / Baustelleneinrichtung", unit: "km", defaultPrice: 2.9 },
    { id: "MAT-SAND", group: "Material", name: "Sand / Bettungsmaterial", unit: "m³", defaultPrice: 36 },
    { id: "MAT-KIES", group: "Material", name: "Kies / Schotter 0/32", unit: "m³", defaultPrice: 44 },
    { id: "MAT-FROSTSCHUTZ-032", group: "Material", name: "Frostschutzkies 0/32 liefern", unit: "m³", defaultPrice: 48 },
    { id: "MAT-FROSTSCHUTZ-045", group: "Material", name: "Frostschutzmaterial 0/45 liefern", unit: "m³", defaultPrice: 52 },
    { id: "MAT-ASPHALT", group: "Material", name: "Asphalttragschicht / Deckschicht", unit: "m²", defaultPrice: 48 },
    { id: "MAT-SPEEDPIPE", group: "Material", name: "Speedpipe / Rohrverband", unit: "m", defaultPrice: 6.8 },
    { id: "MAT-ROHR", group: "Material", name: "Rohrleitung / Kabelschutzrohr", unit: "m", defaultPrice: 14 },
    { id: "MAT-WARNBAND", group: "Material", name: "Trassenwarnband", unit: "m", defaultPrice: 0.8 },
    { id: "MAT-SCHACHT", group: "Material", name: "Schacht / Muffe / Formteil", unit: "St", defaultPrice: 220 },
    { id: "MAT-PFLASTER-BETON-6", group: "Material", name: "Betonpflaster 6 cm liefern", unit: "m²", defaultPrice: 30 },
    { id: "MAT-PFLASTER-BETON-8", group: "Material", name: "Betonpflaster 8 cm liefern", unit: "m²", defaultPrice: 36 },
    { id: "MAT-PFLASTER-BETON-10", group: "Material", name: "Betonpflaster 10 cm liefern", unit: "m²", defaultPrice: 42 },
    { id: "MAT-PFLASTER-NATUR", group: "Material", name: "Natursteinpflaster liefern", unit: "m²", defaultPrice: 75 },
    { id: "MAT-RASENGITTER", group: "Material", name: "Rasengitterstein Beton liefern", unit: "m²", defaultPrice: 38 },
    { id: "MAT-SPLITT", group: "Material", name: "Splittbett 2/5", unit: "m³", defaultPrice: 54 },
    { id: "MAT-FUGENSAND", group: "Material", name: "Fugensand / Brechsand", unit: "m²", defaultPrice: 3.2 },
    { id: "MAT-BORD-TIEF", group: "Material", name: "Tiefbordstein liefern", unit: "m", defaultPrice: 18 },
    { id: "MAT-BORD-HOCH", group: "Material", name: "Hochbordstein liefern", unit: "m", defaultPrice: 28 },
    { id: "MAT-BORD-RUND", group: "Material", name: "Rundbordstein liefern", unit: "m", defaultPrice: 24 },
    { id: "MAT-BETON-C20", group: "Material", name: "Beton C20/25 für Rückenstütze", unit: "m³", defaultPrice: 155 },
    { id: "E-BODEN", group: "Entsorgung", name: "Bodenaushub entsorgen", unit: "t", defaultPrice: 34 },
    { id: "E-ASPHALT", group: "Entsorgung", name: "Asphaltaufbruch entsorgen", unit: "t", defaultPrice: 58 },
    { id: "E-BAUSCHUTT", group: "Entsorgung", name: "Bauschutt / Mischmaterial entsorgen", unit: "t", defaultPrice: 62 },
    { id: "E-ALTPFLASTER", group: "Entsorgung", name: "Altpflaster / Bettungsmaterial entsorgen", unit: "t", defaultPrice: 44 },
    { id: "Z-LEISTUNG", group: "Zeit / Leistung", name: "Leistung / Produktivität", unit: "m/Tag", defaultPrice: 0 },
    { id: "Z-BAUZEIT", group: "Zeit / Leistung", name: "Bauzeitansatz", unit: "Tag", defaultPrice: 0 },
    { id: "Z-GEMEINKOSTEN", group: "Zuschläge", name: "Baustellengemeinkosten", unit: "%", defaultPrice: 10 },
    { id: "Z-RISIKO", group: "Zuschläge", name: "Risikozuschlag", unit: "%", defaultPrice: 6 },
    { id: "Z-GEWINN", group: "Zuschläge", name: "Gewinnzuschlag", unit: "%", defaultPrice: 10 }
];
const GROUPS = [
    "Personal",
    "Maschinen",
    "LKW / Transport",
    "Material",
    "Entsorgung",
    "Fremdleistung",
    "Gemeinkosten",
    "Risiko",
    "Gewinn",
    "Zeit / Leistung",
    "Zuschläge"
];
/* ================= HELPERS ================= */
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function n(value, fallback = 0) {
    const raw = String(value ?? "").trim();
    if (!raw)
        return fallback;
    const normalized = raw.includes(",") ?
        raw.replace(/\./g, "").replace(",", ".") :
        raw.replace(/\s/g, "");
    const x = typeof value === "number" ? value : Number(normalized);
    return Number.isFinite(x) ? x : fallback;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function money(value) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(n(value));
}
function num(value, digits = 2) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(n(value));
}
function todayDE() {
    return new Date().toLocaleDateString("de-DE");
}
function normalizeText(value) {
    return String(value ?? "").trim();
}
function lowerText(value) {
    return String(value ?? "").toLowerCase();
}
function apiUrl(path) {
    const base = String(RAW_API_BASE || "").replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!base)
        return cleanPath;
    if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
        return `${base}${cleanPath.slice(4)}`;
    }
    return `${base}${cleanPath}`;
}
function getAuthToken() {
    try {
        const keys = [
            "token",
            "authToken",
            "accessToken",
            "rlc_token",
            "rlc_auth_token",
            "rlc_access_token"
        ];
        for (const key of keys) {
            const value = localStorage.getItem(key);
            if (value && value.trim())
                return value.trim();
        }
        const jsonKeys = ["auth", "user", "session", "rlc_auth", "rlc_session"];
        for (const key of jsonKeys) {
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            try {
                const parsed = JSON.parse(raw);
                const token = parsed?.token ??
                    parsed?.accessToken ??
                    parsed?.authToken ??
                    parsed?.jwt ??
                    parsed?.data?.token ??
                    parsed?.data?.accessToken;
                if (typeof token === "string" && token.trim())
                    return token.trim();
            }
            catch {
                //
            }
        }
    }
    catch {
        //
    }
    return "";
}
async function postKiSuggest(projectCode, row) {
    try {
        const token = getAuthToken();
        const res = await fetch(apiUrl("/api/kalkulation/ki/suggest-batch"), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                projectCode: projectCode || "NO_PROJECT",
                rows: [
                    {
                        id: row.id,
                        posNr: row.posNr,
                        kurztext: row.kurztext,
                        langtext: row.langtext,
                        einheit: row.einheit,
                        menge: row.menge,
                        preis: row.preis
                    }
                ],
                options: {
                    language: "de",
                    sector: "Tiefbau/Hochbau",
                    calculationLevel: "elite",
                    includePriceBreakdown: true,
                    useKalkulationsDatenbank: true,
                    useOpenAIIfNoDatabaseHit: false,
                    forceRecalculate: true
                }
            })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok || !Array.isArray(json.rows) || !json.rows[0]) {
            console.warn("[Recipes KI] Server response invalid:", res.status, json);
            return null;
        }
        return json.rows[0];
    }
    catch (e) {
        console.warn("[Recipes KI] Server not reachable:", e);
        return null;
    }
}
function normSearch(value) {
    return String(value ?? "").
        toLowerCase().
        normalize("NFKD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/ß/g, "ss").
        trim();
}
function getProject(projectCtx) {
    const p = projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        projectCtx;
    if (!p || typeof p !== "object")
        return null;
    return p;
}
function getProjectKey(project) {
    return String(project?.code ||
        project?.number ||
        project?.projektnummer ||
        project?.id ||
        "").trim();
}
function getProjectTitle(project) {
    const code = getProjectKey(project);
    const name = String(project?.name || project?.projectName || "Projekt").trim();
    return code ? `${code} — ${name}` : "Kein Projekt gewählt";
}
function getProjectPlace(project) {
    return String(project?.place || project?.ort || project?.location || "").trim();
}
function textSignature(row) {
    const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
    if (text.includes("rasengitter"))
        return "rasengitterstein";
    if (text.includes("frostschutz"))
        return "frostschutz";
    if (text.includes("bord") || text.includes("randstein"))
        return "bordstein";
    if (text.includes("speedpipe"))
        return "speedpipe";
    if (text.includes("glasfaser"))
        return "glasfaser";
    if (text.includes("graben") || text.includes("aushub"))
        return "graben";
    if (text.includes("asphalt"))
        return "asphalt_herstellen";
    if (text.includes("rohr"))
        return "rohrleitung";
    if (text.includes("schacht"))
        return "schacht_setzen";
    if (text.includes("pflaster") ||
        text.includes("verbundstein") ||
        text.includes("betonstein") ||
        text.includes("naturstein")) {
        return "pflaster_verlegen";
    }
    if (text.includes("kabel"))
        return "kabel";
    if (text.includes("verfull") || text.includes("verfuell"))
        return "verfuellung";
    return String(row?.kurztext || row?.posNr || "position").
        toLowerCase().
        replace(/[^a-z0-9äöüß]+/gi, "_").
        slice(0, 50);
}
function inferUnitFromText(textValue) {
    const text = normSearch(textValue);
    if (text.includes("pflaster") ||
        text.includes("asphalt") ||
        text.includes("flache") ||
        text.includes("rasengitter")) {
        return "m²";
    }
    if (text.includes("aushub") ||
        text.includes("boden") ||
        text.includes("kies") ||
        text.includes("schotter") ||
        text.includes("frostschutz")) {
        return "m³";
    }
    if (text.includes("rohr") ||
        text.includes("leitung") ||
        text.includes("speedpipe") ||
        text.includes("kabel") ||
        text.includes("bord") ||
        text.includes("randstein")) {
        return "m";
    }
    if (text.includes("schacht") ||
        text.includes("muffe") ||
        text.includes("abzweig")) {
        return "St";
    }
    if (text.includes("entsorgung") || text.includes("deponie"))
        return "t";
    return "m";
}
function inferGewerk(row) {
    const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
    if (text.includes("rasengitter"))
        return "Straßenbau / Rasengitterarbeiten";
    if (text.includes("pflaster"))
        return "Straßenbau / Pflasterarbeiten";
    if (text.includes("bord") || text.includes("randstein"))
        return "Straßenbau / Bordsteinarbeiten";
    if (text.includes("leitungsgraben") ||
        text.includes("graben herstellen") ||
        text.includes("kabelgraben") ||
        text.includes("rohrgraben") ||
        text.includes("trasse herstellen"))
        return "Tiefbau / Leitungsbau";
    if (text.includes("asphalt"))
        return "Straßenbau / Asphaltbau";
    if (text.includes("frostschutz"))
        return "Straßenbau / Tragschichten";
    if (text.includes("graben") || text.includes("aushub"))
        return "Tiefbau / Erdarbeiten";
    if (text.includes("rohr") ||
        text.includes("leitung") ||
        text.includes("speedpipe") ||
        text.includes("kabel")) {
        return "Tiefbau / Leitungsbau";
    }
    if (text.includes("schacht"))
        return "Tiefbau / Schachtbau";
    return "Tiefbau";
}
function inferBauverfahren(row, ctx) {
    const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
    if (text.includes("rasengitter")) {
        return "Rasengitterfläche herstellen mit Tragschicht, Bettung, Verlegung, Abrütteln und Verfüllen der Kammern";
    }
    if (text.includes("pflaster")) {
        return "Pflasterfläche herstellen mit Tragschicht, Bettung, Verlegung, Zuschnitt, Abrütteln und Verfugung";
    }
    if (text.includes("bord") || text.includes("randstein")) {
        return "Bordstein setzen mit Aushub, Fundamentbeton, Rückenstütze, Ausrichten und Verfugen";
    }
    if (text.includes("frostschutz")) {
        return "Frostschutzschicht lagenweise einbauen, profilgerecht herstellen und verdichten";
    }
    if (text.includes("leitungsgraben") ||
        text.includes("graben herstellen") ||
        text.includes("kabelgraben") ||
        text.includes("rohrgraben") ||
        text.includes("trasse herstellen")) {
        return "Leitungsgraben / Trasse herstellen mit Aushub, Leitungszone, Verfüllung, Verdichtung und Oberflächenbezug";
    }
    if (text.includes("asphalt")) {
        return "Asphaltfläche herstellen / wiederherstellen mit Verdichtung und Anschluss an Bestand";
    }
    if (text.includes("speedpipe"))
        return "Speedpipe-Verlegung im Leitungsgraben";
    if (text.includes("rohr") || text.includes("leitung"))
        return "Rohrleitung liefern und fachgerecht verlegen";
    if (text.includes("graben") || text.includes("aushub")) {
        return `Baggeraushub bis ca. ${ctx.depthM} m mit Laden, Sichern und Verfüllen`;
    }
    if (text.includes("schacht"))
        return "Schacht setzen, ausrichten, anschließen und verfüllen";
    return "Standardausführung gemäß LV und örtlichen Erfordernissen";
}
function suggestLangtextForDraft(draft, ctx) {
    const text = normSearch(`${draft.kurztext} ${draft.langtext}`);
    const unit = draft.einheit || inferUnitFromText(draft.kurztext);
    if (text.includes("rasengitter")) {
        return `Rasengittersteinfläche herstellen. Einschließlich Prüfen und Vorbereiten des Untergrundes, Herstellen der tragfähigen Frostschutz- beziehungsweise Tragschicht, Herstellen der Bettung, Liefern und Verlegen der Rasengittersteine, Schneiden und Anpassen in Rand- und Anschlussbereichen, Abrütteln sowie Verfüllen der Kammern mit geeignetem Material. Einschließlich aller erforderlichen Nebenleistungen, Geräte, Personal, Material, Transport und Baustellenorganisation. Abrechnung nach tatsächlich ausgeführter Fläche in ${unit}.`;
    }
    if (text.includes("pflaster") ||
        text.includes("verbundstein") ||
        text.includes("betonstein") ||
        text.includes("naturstein")) {
        return `Pflasterfläche herstellen. Einschließlich Prüfen und Vorbereiten des Untergrundes, Herstellen beziehungsweise Ergänzen der Tragschicht, Herstellen und Feinplanieren der Bettung, Liefern und Verlegen der Pflastersteine im vereinbarten Verband, Schneiden von Rand- und Anschlussbereichen, höhengerechtem Anschluss an Bestand, Abrütteln der Pflasterfläche sowie Verfüllen der Fugen mit geeignetem Fugenmaterial. Einschließlich aller erforderlichen Nebenleistungen, Geräte, Personal, Material, Transport und Baustellenorganisation. Abrechnung nach tatsächlich ausgeführter Fläche in ${unit}.`;
    }
    if (text.includes("bord") || text.includes("randstein")) {
        return `Bordstein beziehungsweise Einfassung fachgerecht setzen. Einschließlich Aushub, Herstellen des Betonfundaments, Liefern und Setzen der Bordsteine, höhen- und fluchtgerechtem Ausrichten, Herstellen der Rückenstütze, Schneiden und Anpassen, Verfugen sowie Wiederherstellung der angrenzenden Bereiche. Einschließlich Personal, Geräte, Material, Transport und Nebenleistungen. Abrechnung nach tatsächlich gesetzter Länge in ${unit}.`;
    }
    if (text.includes("frostschutz")) {
        return `Frostschutzschicht herstellen. Einschließlich Liefern des geeigneten Frostschutzmaterials, lagenweisem Einbau, profilgerechtem Verteilen, Verdichten, Herstellen der geforderten Tragfähigkeit sowie Kontrolle der Höhenlage. Einschließlich Personal, Maschinen, Transport und Nebenleistungen. Abrechnung nach tatsächlich eingebauter Menge in ${unit}.`;
    }
    if (text.includes("leitungsgraben") ||
        text.includes("graben herstellen") ||
        text.includes("kabelgraben") ||
        text.includes("rohrgraben") ||
        text.includes("trasse herstellen")) {
        return `Leitungsgraben beziehungsweise Trasse fachgerecht herstellen. Einschließlich Schneiden und Aufnehmen vorhandener Oberflächen soweit erforderlich, Aushub, Herstellen der Grabensohle, Sichern des Grabens, Herstellen der Leitungszone, Bettung, Warnband beziehungsweise Trassenkennzeichnung, Verfüllen und lagenweisem Verdichten nach technischem Erfordernis. Oberfläche und Wiederherstellung sind entsprechend der Positionsbeschreibung zu berücksichtigen. Abrechnung nach tatsächlich ausgeführter Länge beziehungsweise Menge in ${unit}.`;
    }
    if (text.includes("asphalt")) {
        return `Asphaltfläche herstellen beziehungsweise wiederherstellen. Einschließlich Schneiden der Anschlusskanten, Vorbereiten des Untergrundes, Einbau der Asphaltschicht, Verdichtung, höhengerechtem Anschluss an Bestand und fachgerechter Oberflächenherstellung. Einschließlich Material, Geräte, Personal, Transport, Entsorgung und Nebenleistungen. Abrechnung nach tatsächlich ausgeführter Fläche in ${unit}.`;
    }
    if (text.includes("speedpipe") ||
        text.includes("rohr") ||
        text.includes("leitung") ||
        text.includes("kabel")) {
        return `Leitung beziehungsweise Rohrsystem liefern und fachgerecht verlegen. Einschließlich Herstellen der Leitungszone, Bettung, Ausrichten, Einbauen, Warnband beziehungsweise Trassenkennzeichnung, fachgerechtem Anschluss sowie Verfüllen und Verdichten nach Erfordernis. Grabentiefe ca. ${ctx.depthM} m, Bodenklasse ${ctx.soilClass}. Abrechnung nach tatsächlich ausgeführter Länge in ${unit}.`;
    }
    if (text.includes("aushub") ||
        text.includes("graben") ||
        text.includes("auskofferung") ||
        text.includes("auskoffern") ||
        text.includes("erdarbeiten") ||
        text.includes("baugrube")) {
        const soil = String(ctx.soilClass || "").toUpperCase().startsWith("BK") ?
            String(ctx.soilClass) :
            `BK ${ctx.soilClass}`;
        const extras = [
            ctx.restricted ? "Ausführung bei eingeschränktem Arbeitsraum." : "",
            ctx.groundwater ? "Erschwernisse durch Grundwasser sind zu berücksichtigen." : "",
            ctx.asphalt ? "Asphaltflächen beziehungsweise befestigte Oberflächen sind im Arbeitsbereich betroffen." : "",
            ctx.trafficControl ? "Verkehrssicherung und Sicherung der Arbeitsstelle sind einzukalkulieren." : ""
        ].
            filter(Boolean).join(" ");
        return `Auskofferung beziehungsweise Erdarbeiten fachgerecht ausführen. Einschließlich Lösen und Laden des Bodens, profilgerechtem Herstellen der Aushubfläche beziehungsweise Baugrube, seitlichem Lagern oder Abfahren des Aushubmaterials, Herstellen der erforderlichen Arbeitsräume, Sichern der Arbeitsstelle sowie aller Nebenleistungen für Personal, Geräte, Maschinen, Transport und Baustellenorganisation.

Ausführungstiefe ca. ${ctx.depthM} m, Bodenklasse ${soil}, Entfernung zur Baustelle beziehungsweise Transportansatz ca. ${ctx.distanceKm} km. Die kalkulierte Leistung basiert auf einer Tagesleistung von ca. ${ctx.dailyOutput} ${unit}/Tag. ${extras}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
    }
    if (text.includes("schacht")) {
        return `Schacht beziehungsweise Formteil fachgerecht einbauen. Einschließlich Herstellen der Baugrube, Bettung, Setzen, Ausrichten, Anschließen, Abdichten, Verfüllen und Verdichten sowie aller erforderlichen Nebenleistungen. Abrechnung nach Stückzahl in ${unit}.`;
    }
    return `Leistung fachgerecht ausführen. Einschließlich aller erforderlichen Nebenleistungen, Material, Personal, Maschinen, Transport, Baustellenorganisation, Dokumentation und Abrechnung nach tatsächlich ausgeführter Menge in ${unit}.`;
}
function loadCompanyRecipes() {
    try {
        const raw = localStorage.getItem(COMPANY_RECIPE_KEY);
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function saveCompanyRecipes(rows) {
    localStorage.setItem(COMPANY_RECIPE_KEY, JSON.stringify(rows));
}
function loadRecipeLibraryRows() {
    const api = RecipeLibrary;
    try {
        if (typeof api.list === "function") {
            const rows = api.list();
            return Array.isArray(rows) ? rows : [];
        }
        if (typeof api.all === "function") {
            const rows = api.all();
            return Array.isArray(rows) ? rows : [];
        }
        if (typeof api.getAll === "function") {
            const rows = api.getAll();
            return Array.isArray(rows) ? rows : [];
        }
    }
    catch {
        return [];
    }
    return [];
}
function importRecipeLibraryCsv(text) {
    const api = RecipeLibrary;
    if (typeof api.importCsvPriceLibrary === "function") {
        return api.importCsvPriceLibrary(text);
    }
    if (typeof api.importCsv === "function") {
        return api.importCsv(text);
    }
    throw new Error("RecipeLibrary Import-Funktion fehlt.");
}
function libraryTitle(item) {
    return String(item.title || item.name || item.kurztext || item.code || item.posNr || "").trim();
}
function libraryCode(item) {
    return String(item.code || item.posNr || item.id || "").trim();
}
function libraryUnit(item) {
    return String(item.unit || item.einheit || "EH").trim();
}
function libraryPrice(item) {
    return n(item.unitPrice ?? item.price ?? item.ep ?? item.defaultPrice);
}
function libraryQty(item) {
    return Math.max(n(item.qty ?? item.menge, 1), 0.0001);
}
function libraryGroup(item) {
    const text = normSearch(`${item.group || ""} ${item.category || ""} ${libraryTitle(item)}`);
    if (text.includes("lohn") ||
        text.includes("personal") ||
        text.includes("arbeiter") ||
        text.includes("facharbeiter") ||
        text.includes("helfer") ||
        text.includes("polier")) {
        return "Personal";
    }
    if (text.includes("maschine") ||
        text.includes("bagger") ||
        text.includes("radlader") ||
        text.includes("walze") ||
        text.includes("ruttel") ||
        text.includes("gerät") ||
        text.includes("geraet")) {
        return "Maschinen";
    }
    if (text.includes("lkw") ||
        text.includes("transport") ||
        text.includes("tieflader") ||
        text.includes("anfahrt")) {
        return "LKW / Transport";
    }
    if (text.includes("entsorgung") ||
        text.includes("deponie") ||
        text.includes("verwertung") ||
        text.includes("boden entsorgen") ||
        text.includes("aufbruch entsorgen")) {
        return "Entsorgung";
    }
    if (text.includes("fremdleistung") || text.includes("subunternehmer")) {
        return "Fremdleistung";
    }
    if (text.includes("gemeinkosten"))
        return "Gemeinkosten";
    if (text.includes("risiko"))
        return "Risiko";
    if (text.includes("gewinn"))
        return "Gewinn";
    if (text.includes("zuschlag"))
        return "Zuschläge";
    return "Material";
}
function libraryResourceId(item) {
    const base = libraryCode(item) ||
        `${libraryTitle(item)}-${libraryUnit(item)}-${libraryPrice(item)}`;
    return `LIB-${String(base).
        trim().
        replace(/[^a-zA-Z0-9_.-]+/g, "_").
        slice(0, 120)}`;
}
function recipeLineFromLibrary(item) {
    const title = libraryTitle(item);
    const unit = libraryUnit(item);
    const group = libraryGroup(item);
    return {
        id: safeId(),
        group,
        resourceId: libraryResourceId(item),
        name: title || "Bibliothek-Position",
        unit,
        qty: libraryQty(item),
        price: libraryPrice(item),
        note: item.source ? `Bibliothek: ${item.source}` : "Aus importierter Bibliothek",
        aiSuggested: false
    };
}
function isSurchargeLike(row) {
    const group = String(row.group || "").trim();
    return (group === "Zuschläge" ||
        group === "Gemeinkosten" ||
        group === "Risiko" ||
        group === "Gewinn" ||
        String(row.unit || "").trim() === "%");
}
function lineTotal(row) {
    if (isSurchargeLike(row))
        return 0;
    return round2(n(row.qty) * n(row.price));
}
function directTotal(lines) {
    return round2(lines.
        filter((r) => !isSurchargeLike(r)).
        reduce((s, r) => s + lineTotal(r), 0));
}
function surchargePercent(lines) {
    return lines.
        filter((x) => x.group === "Zuschläge" && x.unit === "%").
        reduce((s, x) => s + n(x.price), 0);
}
function totalWithSurcharges(lines) {
    const base = directTotal(lines);
    return round2(base * (1 + surchargePercent(lines) / 100));
}
function unitPrice(total, qty) {
    return qty > 0 ? round2(total / qty) : 0;
}
function makeLine(resourceId, qty, note = "", aiSuggested = true) {
    const r = RESOURCE_CATALOG.find((x) => x.id === resourceId);
    if (!r) {
        return {
            id: safeId(),
            group: "Material",
            resourceId: "",
            name: "Neue Ressource",
            unit: "St",
            qty,
            price: 0,
            note,
            aiSuggested
        };
    }
    return {
        id: safeId(),
        group: r.group,
        resourceId: r.id,
        name: r.name,
        unit: r.unit,
        qty,
        price: r.defaultPrice,
        note,
        aiSuggested
    };
}
function makeDefaultDraft() {
    return {
        id: "",
        posNr: "",
        kurztext: "",
        langtext: "",
        einheit: "m",
        menge: 1
    };
}
function draftFromLv(row) {
    return {
        id: String(row.id || ""),
        posNr: String(row.posNr || ""),
        kurztext: String(row.kurztext || ""),
        langtext: String(row.langtext || ""),
        einheit: String(row.einheit || "m"),
        menge: n(row.menge, 1)
    };
}
function draftToLvPos(draft) {
    return {
        id: draft.id || "NEW_RECIPE_POSITION",
        posNr: draft.posNr,
        kurztext: draft.kurztext,
        langtext: draft.langtext,
        einheit: draft.einheit,
        menge: n(draft.menge, 1),
        preis: 0,
        gesamt: 0,
        waehrung: "EUR",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}
function validateDraft(draft) {
    const errors = [];
    if (!normalizeText(draft.posNr))
        errors.push("Positionsnummer fehlt.");
    if (!normalizeText(draft.kurztext))
        errors.push("Kurztext fehlt.");
    if (!normalizeText(draft.einheit))
        errors.push("Einheit fehlt.");
    if (n(draft.menge) <= 0)
        errors.push("Menge muss größer als 0 sein.");
    return errors;
}
function priceBreakdownGroupToResourceGroup(group) {
    const g = String(group || "").trim().toLowerCase();
    if (g === "personal" || g === "lohn")
        return "Personal";
    if (g === "maschinen" || g === "maschine" || g === "geräte" || g === "geraete")
        return "Maschinen";
    if (g === "lkw / transport" || g === "transport" || g === "lkw")
        return "LKW / Transport";
    if (g === "material")
        return "Material";
    if (g === "entsorgung" || g === "deponie")
        return "Entsorgung";
    if (g === "fremdleistung" || g === "nachunternehmer")
        return "Fremdleistung";
    if (g === "gemeinkosten" || g === "bgk")
        return "Gemeinkosten";
    if (g === "risiko")
        return "Risiko";
    if (g === "gewinn")
        return "Gewinn";
    return "Material";
}
function detectRlcUrkalkulationFamily(row) {
    const t = normSearch(`${row.posNr || ""} ${row.kurztext || ""} ${row.langtext || ""} ${row.einheit || ""}`);
    if (t.includes("fremdleistung") ||
        t.includes("subunternehmer") ||
        t.includes("nachunternehmer") ||
        t.includes("spezialfirma")) {
        return "unknown";
    }
    if (t.includes("stundensaetze") ||
        t.includes("stundensatz") ||
        t.includes("baggerstunden") ||
        t.includes("lkw-stunden") ||
        t.includes("lkw stunden") ||
        t.includes("radlader") ||
        t.includes("motorflex") ||
        t.includes("stromaggregat") ||
        t.includes("fahrzeugkosten") ||
        t.includes("verrechnungssaetze") ||
        t.includes("verrechnungssatz")) {
        return "regie";
    }
    if (t.includes("bestandszeichnung") ||
        t.includes("bestandszeichnungen") ||
        t.includes("as-built") ||
        t.includes("as built") ||
        t.includes("aufmassdokumentation") ||
        t.includes("aufmaßdokumentation") ||
        t.includes("dokumentation") ||
        t.includes("revisionsunterlagen") ||
        t.includes("planunterlagen")) {
        return "dokumentation";
    }
    if (t.includes("baustelleneinrichtung") ||
        t.includes("baustelle raeumen") ||
        t.includes("bauzaun") ||
        t.includes("baustellenabsicherung") ||
        t.includes("baustellendokumentation") ||
        t.includes("baustellenkoordination") ||
        t.includes("verkehrssicherung") ||
        t.includes("besucherfuehrung") ||
        t.includes("zufahrt") ||
        t.includes("baustrasse") ||
        t.includes("lagerflaeche") ||
        t.includes("ueberfahrt") ||
        t.includes("besprechungsraum") ||
        t.includes("abstimmung") ||
        t.includes("dokumentation")) {
        return "baustelle";
    }
    if (t.includes("mutterboden") ||
        t.includes("oberboden") ||
        t.includes("humus") ||
        t.includes("humusmiete") ||
        t.includes("grasnarbe")) {
        return "mutterboden";
    }
    if (t.includes("rodung") ||
        t.includes("freimachen") ||
        t.includes("bewuchs") ||
        t.includes("straeucher") ||
        t.includes("wurzeln") ||
        t.includes("wurzelstoecke") ||
        t.includes("stubben") ||
        t.includes("baeume faellen")) {
        return "rodung";
    }
    if (t.includes("wasserhaltung") ||
        t.includes("pumpenstunden") ||
        t.includes("pumpe") ||
        t.includes("grundwasser")) {
        return "wasserhaltung";
    }
    if (t.includes("flaechen einzaeunen") ||
        t.includes("flachen einzaunen") ||
        t.includes("flächen einzäunen") ||
        t.includes("einzaeunen") ||
        t.includes("einzaunen") ||
        t.includes("einzäunen") ||
        t.includes("zaun herstellen") ||
        t.includes("weidezaun herstellen") ||
        t.includes("zaun setzen")) {
        return "zaunbau";
    }
    if (t.includes("wanderweg") ||
        t.includes("forststrasse") ||
        t.includes("forststraße") ||
        t.includes("kiesweg")) {
        return "wanderweg_wiederherstellen";
    }
    if (t.includes("baum") ||
        t.includes("schutzmassnahme") ||
        t.includes("bohlenschutz") ||
        t.includes("weidezaun") ||
        t.includes("zaeune abbauen") ||
        t.includes("zaun")) {
        return "schutzmassnahme";
    }
    if (t.includes("rohrgrabenaushub") ||
        t.includes("rohrgraben") ||
        t.includes("leitungsgraben") ||
        t.includes("kabelgraben") ||
        t.includes("aushub") ||
        t.includes("abtrag") ||
        t.includes("boden loesen") ||
        t.includes("bodenklasse") ||
        t.includes("bd-kl") ||
        t.includes("bd kl") ||
        t.includes("fels") ||
        t.includes("meissel") ||
        t.includes("suchschlitz")) {
        return "aushub";
    }
    if (t.includes("verfuellen") ||
        t.includes("verfuellung") ||
        t.includes("verfuell") ||
        t.includes("auffuellen") ||
        t.includes("auffuell") ||
        t.includes("einbauen") ||
        t.includes("verdichten") ||
        t.includes("planum") ||
        t.includes("planie") ||
        t.includes("flaechen auflockern") ||
        t.includes("entwaesserungsrinne") ||
        t.includes("entwaesserungsmulde") ||
        t.includes("sauberkeitsschicht") ||
        t.includes("mehr- oder mindertiefe") ||
        t.includes("frostschutz") ||
        t.includes("schotter") ||
        t.includes("kies") ||
        t.includes("sand") ||
        t.includes("riesel") ||
        t.includes("schroppen")) {
        return "verfuellung";
    }
    if (t.includes("rohrleitung") ||
        t.includes("rohr verlegen") ||
        t.includes("leitung verlegen") ||
        t.includes("wasserleitung") ||
        t.includes("druckleitung") ||
        t.includes("kanal") ||
        t.includes("schacht") ||
        t.includes("formstueck") ||
        t.includes("formstuecke") ||
        t.includes("passstueck") ||
        t.includes("passstuecke") ||
        t.includes("boeschungsstueck") ||
        t.includes("durchlass") ||
        t.includes("ggg") ||
        t.includes("pe-hd") ||
        t.includes("pe hd") ||
        t.includes("hydrant") ||
        t.includes("schieber") ||
        t.includes("armatur") ||
        t.includes("isolierbinde") ||
        t.includes("be- und entlueftungsrohr") ||
        t.includes("entlueftungsrohr") ||
        t.includes("spuelen und entkeimen")) {
        return "rohrleitung";
    }
    if (t.includes("kabel") ||
        t.includes("speedpipe") ||
        t.includes("leerrohr") ||
        t.includes("schutzrohr") ||
        t.includes("kabelschutzrohr") ||
        t.includes("schutzmatte") ||
        t.includes("trassenwarnband") ||
        t.includes("warnband") ||
        t.includes("runddraht") ||
        t.includes("erdleitung") ||
        t.includes("stromanschlussantrag") ||
        t.includes("warnanlage") ||
        t.includes("endstopfen") ||
        t.includes("doppelsteckmuffe") ||
        t.includes("einzelzugabdichtung")) {
        return "kabel";
    }
    if (t.includes("asphalt") ||
        t.includes("pflaster") ||
        t.includes("bordstein") ||
        t.includes("belag") ||
        t.includes("oberflaeche") ||
        t.includes("decke") ||
        t.includes("fraesen") ||
        t.includes("schneiden") ||
        t.includes("aufbruch") ||
        t.includes("wasserbausteine")) {
        return "oberflaeche";
    }
    if (t.includes("material") ||
        t.includes("liefern") ||
        t.includes("zusaetzliche anreise") ||
        t.includes("wartungs") ||
        t.includes("bedienungsanleitung") ||
        t.includes("tuev") ||
        t.includes("ebb-abnahme") ||
        t.includes("abnahme") ||
        t.includes("bentonit") ||
        t.includes("bohrung") ||
        t.includes("bohrprotokoll") ||
        t.includes("statische berechnung") ||
        t.includes("ueberdachung") ||
        t.includes("kompressorstunden") ||
        t.includes("zulage") ||
        t.includes("zuschlag") ||
        t.includes("mehrpreis")) {
        return "material";
    }
    return "unknown";
}
function detectRlcUrkalkulationFamilyV4(row) {
    const k = normSearch(`${row.kurztext || ""}`);
    const l = normSearch(`${row.langtext || ""}`);
    const t = normSearch(`${row.posNr || ""} ${row.kurztext || ""} ${row.langtext || ""} ${row.einheit || ""}`);
    const hasAny = (value, keys) => keys.some((x) => value.includes(x));
    if (hasAny(t, ["fremdleistung", "subunternehmer", "nachunternehmer", "spezialfirma"]))
        return "unknown";
    // RLC V20: zusätzliche Tiefbau-/STLB-/VOB-C-Familien aus Online-Recherche.
    // Diese Regeln liegen absichtlich vor den generischen Aushub/Rohr/Material-Fallbacks.
    if (hasAny(k, ["brunnenbau", "aufschlussbohrung", "aufschlussbohrungen", "pegelbohrung", "grundwassermessstelle", "brunnenstube", "brunnenkopf", "filterrohr", "vollrohr brunnen", "bohrloch ausbauen"]))
        return "brunnen_aufschlussbohrung";
    if (hasAny(k, ["verbau", "spundwand", "trägerbohlwand", "traegerbohlwand", "kanaldielen", "grabenverbau", "verbaukasten", "gleitschienenverbau", "verbau ziehen", "verbau vorhalten"]))
        return "verbau_spundwand";
    if (hasAny(k, ["rammarbeiten", "rüttelarbeiten", "ruettelarbeiten", "pressarbeiten", "pfahl rammen", "spundbohle rammen", "vibrationsramme", "rammgerät", "rammgeraet", "presspfahl"]))
        return "ramm_press_ruettel";
    if (hasAny(k, ["rohrvortrieb", "vortriebsrohr", "pressbohrung", "einpressarbeiten", "rohr einpressen", "pilotrohrvortrieb", "durchpressung", "vortriebsschacht", "zielschacht vortrieb"]))
        return "rohrvortrieb_einpressen";
    if (hasAny(k, ["nassbagger", "nassbaggerarbeiten", "gewässersohle", "gewaessersohle", "sohle räumen", "sohle raeumen", "sediment räumen", "sediment raeumen", "schlammfang räumen", "schlammfang raeumen"]))
        return "nassbaggerarbeiten";
    if (hasAny(k, ["schlitzwand", "dichtwand", "stützflüssigkeit", "stuetzfluessigkeit", "bentonitschlitzwand", "dichtschlitzwand"]))
        return "schlitzwand";
    if (hasAny(k, ["spritzbeton", "nassspritzbeton", "trockenspritzbeton", "spritzmörtel", "spritzmoertel", "sicherung mit spritzbeton"]))
        return "spritzbeton";
    if (hasAny(k, ["kampfmittel", "kampfmittelräumung", "kampfmittelraeumung", "sondierung", "munition", "blindgänger", "blindgaenger", "bombenfund", "feuerwerker"]))
        return "kampfmittel";
    if (hasAny(k, ["verkehrssicherung", "verkehrsführung", "verkehrsfuehrung", "baustellenampel", "lichtsignalanlage", "beschilderung", "absperrung", "leitbake", "leitkegel", "sicherungsfahrzeug", "rsa", "verkehrszeichenplan"]))
        return "verkehrssicherung";
    if (hasAny(k, ["baulogistik", "logistikfläche", "logistikflaeche", "lagerplatz", "materiallager", "kranstellfläche", "kranstellflaeche", "lieferkoordination", "container umsetzen", "baustellentransport intern"]))
        return "baulogistik";
    if (hasAny(k, ["abfallentsorgung", "entsorgung", "verwertung", "beseitigung", "deponie", "belasteter boden", "belasteten boden", "belastetes material", "kontaminierter boden", "kontaminierten boden", "dk i", "dk ii", "dk iii", "zuordnungswert", "laga", "teerhaltig", "pechhaltig", "asbest", "schadstoff", "boden analyse", "bodenanalyse", "haufwerksbeprobung"]))
        return "abfallentsorgung";
    if (hasAny(k, ["abscheider", "kleinkläranlage", "kleinklaeranlage", "ölabscheider", "oelabscheider", "fettabscheider", "sedimentationsanlage", "regenklärbecken", "regenklaerbecken", "kläranlage", "klaeranlage"]))
        return "abscheider_klaeranlage";
    if (hasAny(k, ["bahnübergang", "bahnuebergang", "gleisbau", "gleis", "weiche", "bahnsteig", "schiene", "schotteroberbau gleis", "stopfmaschine"]))
        return "bahn_gleisbau";
    if (hasAny(k, ["abdichtung", "dichtungsbahn", "fugenband", "quellband", "mauerkragen", "rohrdurchführung abdichten", "rohrdurchfuehrung abdichten", "bitumenbahn", "kunststoffdichtungsbahn"]))
        return "abdichtung_bauwerk";
    if (hasAny(k, ["pflaster", "plattenbelag", "bordstein", "bordsteine", "rinne setzen", "rinnensteine", "zeiler", "muldenrinne", "hochbord", "tiefbord", "rasengitter", "verbundsteinpflaster"]))
        return "pflaster_bord_rinne";
    if (hasAny(k, ["asphaltdeckschicht", "asphalttragschicht", "asphaltbinder", "asphalttragdeckschicht", "bituminöse tragschicht", "bituminoese tragschicht", "walzasphalt", "gussasphalt", "fräsen asphalt", "fraesen asphalt"]))
        return "asphalt_oberbau";
    // RLC V14: remaining X83 families before generic material/rohrleitung fallbacks.
    if (hasAny(k, ["statische berechnung", "statischen berechnung", "statik", "standsicherheitsnachweis", "tragwerksplanung"]))
        return "statik_berechnung";
    if (hasAny(k, ["besucherführung", "besucherfuhrung", "besucherfuehrung", "besucher fuehrung", "besucher fuhrung", "besucher führung", "besucherinformation", "besucher information"]))
        return "besucherfuehrung";
    if (hasAny(k, ["naturschutz", "untere naturschutzbehörde", "untere naturschutzbehoerde", "vorgegebene bauzeiten", "bauzeiten", "bauabschnitte", "naturschutzauflage"]))
        return "naturschutz_auflagen";
    if (hasAny(k, ["straßenbauvlies", "strassenbauvlies", "bauvlies", "geotextil", "filtervlies", "vlies"]))
        return "vlies_geotextil";
    if (hasAny(k, ["rundholzlage", "rundholz", "holzlage", "holzbohlen", "bohlenlage"]))
        return "rundholzlage";
    if (hasAny(k, ["kernbohrung", "kernbohrungen", "bohrkern", "wanddurchbruch", "deckendurchbruch"]))
        return "kernbohrung";
    if (hasAny(k, ["start-und zielgruben", "start- und zielgruben", "start-und zielgrube", "start- und zielgrube", "start und zielgrube", "startgrube", "zielgrube", "zielgruben"]))
        return "hdd_start_zielgrube";
    if (hasAny(k, ["horizontalspülbohrung", "horizontalspuelbohrung", "horizontalspulbohrung", "hdd", "pilotbohrung", "spuelbohrung", "spülbohrung", "spulbohrung", "auflassene bohrung", "aufgelassene bohrung", "stillstandzeiten bei bohrung"]))
        return "hdd_bohrung";
    if (hasAny(k, ["bentonit", "bentonitver", "bentonitentsorgung", "betonit", "betonitver", "betonitentsorgung", "bohrspuelung", "bohrspülung", "bohrspulung"]))
        return "bentonit";
    if (hasAny(k, ["bohrprotokoll", "bohr protokoll", "protokoll bohrung", "bohrdokumentation"]))
        return "bohrprotokoll";
    if (hasAny(k, ["kompressorstunden", "kompressor", "druckluft"]))
        return "kompressor";
    if (hasAny(k, ["überdachung", "ueberdachung", "einstieg überdachung", "einstieg ueberdachung", "einhausung"]))
        return "ueberdachung";
    if (hasAny(k, ["schichtenverbund", "unterlage reinigen", "vorhandene unterlage reinigen", "ansprühen", "anspruehen", "bitumenhaltigem bindemittel", "bitumen bindemittel", "rampenspritzgerät", "rampenspritzgeraet", "haftkleber", "bitumenemulsion"]))
        return "bitumen_anspruehen";
    if (hasAny(k, ["revisionsschacht", "revisionsschächte", "revisionsschaechte", "energieumwandlungsschacht", "energieumwandlungsschächte", "energieumwandlungsschaechte", "abdeckplatte", "ap-m"]))
        return "schachtbau";
    if (hasAny(k, ["wanderweg wiederherstellen", "wanderweg", "forststrasse", "forststraße", "kiesweg", "weg wiederherstellen"]))
        return "wanderweg_wiederherstellen";
    if (hasAny(k, ["flächen und wege wiederherstellen", "flaechen und wege wiederherstellen", "wege wiederherstellen", "flaechen wiederherstellen", "flächen wiederherstellen"]))
        return "oberflaeche";
    if (hasAny(k, ["pe 100", "pe-trinkwasserdruckrohr", "trinkwasserdruckrohr", "polyethylenrohr", "polyethylen-rohr"]))
        return "rohrleitung";
    if (hasAny(k, ["kreuzung durchl", "kreuzung durchlass", "kreuzung durchlässe", "kreuzung durchlaesse"]))
        return "rohrleitung";
    if (hasAny(k, ["vorflut", "endgültiger ableitung", "endgueltiger ableitung", "zusammenschluss der best", "neuen ha-leitung"]))
        return "wasserhaltung";
    // RLC V11: specific LV families first. Kurztext/technical keywords beat generic material.
    if (hasAny(k, ["beweissicherung", "niederschrift über die beweissicherung", "niederschrift ueber die beweissicherung", "zustandsfeststellung", "fotodokumentation beweissicherung"]))
        return "beweissicherung";
    if (hasAny(k, ["grenzsteine", "grenzstein", "vermessungsstein", "markierungsstein"]))
        return "grenzstein";
    if (hasAny(k, ["bauschild", "bautafel", "informationstafel", "besucherinformation"]))
        return "bauschild";
    if (hasAny(k, ["instandhaltung", "anliegerverkehr", "aufrechterhalten", "zufahrt zur baustelle", "beengte bauweise", "erschwerniszuschlag", "erschwernis alter", "zusaetzliche anreise", "zusätzliche anreise"]))
        return "infrastruktur";
    if (hasAny(k, ["bestandspläne", "bestandsplaene", "bestandsplan", "revisionsplan", "lageplan", "kanallängsschnitt", "kanallaengsschnitt"]))
        return "dokumentation";
    if (hasAny(k, ["sohl- und ummantelungsbeton", "sohl und ummantelungsbeton", "ummantelungsbeton", "sohlbeton", "stützbeton", "stuetzbeton", "magerbeton", "betonsockel", "stampfbeton", "lehmpfeiler", "baustahl", "bewehrung", "boeschungsbausteine", "böschungsbausteine", "wasserbausteine", "mauerrohr", "mauerdurchführung", "mauerdurchfuehrung"]))
        return "beton_bauteile";
    if (hasAny(k, ["drainageleitung", "drainageleitungen", "drainagerohr", "drainagerohre", "drainage", "sickerleitung"]))
        return "drainage";
    if (hasAny(k, ["druckprobe", "spülen", "spuelen", "spulen", "kanal spulen", "kanalspulen", "rohr spulen", "leitung spulen", "entkeimung", "spülung", "spuelung", "spulung", "desinfektion", "leitung reinigen", "leitung pruefen", "leitung prüfen", "leitung prufen", "dichtheitsprüfung", "dichtheitspruefung", "dichtheitsprufung"]))
        return "spuelen_pruefen";
    if (hasAny(k, ["elektroverteilung", "elektroverteilungsanlage", "elektro verteilung", "freiluftschrank", "zählerplatz", "zaehlerplatz", "zahlerplatz", "niveaumessung", "fernwirkanlage", "durchflussmesser", "durchflußmesser", "durchflusmesser", "pumpensteuerung", "steuerung", "anschluss schrank", "warnanlage"]))
        return "elektro_msr";
    if (hasAny(k, ["abwasserpumpstation", "pumpstation", "pumpschacht", "abwasserpumpe", "kreiselpumpe", "pumpenanlage"]))
        return "pumpstation";
    if (hasAny(k, ["hausanschluss herstellen", "hausanschlussleitung", "mikrorohrhausanschlussleitung", "verlegung hausanschlussleitung", "anschluss bestehende leitung", "druckleitungsanschluss", "anschluss und verbindung"]))
        return "hausanschluss";
    if (hasAny(k, ["losflansch", "isolierbinde", "ortungsband", "hinweisstein", "hinweissteine", "hinweisschild", "hinweisschilder", "hinweissaeule", "hinweissäule", "schmutzfänger", "schmutzfaenger", "ringraumdichtung", "ringraumdichtungen", "reduzierung", "aufweitung", "ffr-stück", "ffr-stueck", "t-stück", "t-stueck", "bogen", "90 grad", "fitting", "fittings", "messing", "rohrabschluss", "haube", "einsteigleiter", "einstieghilfe", "dichtkappen", "doppelsteckmuffe", "doppelsteckmufen", "mmb-stück", "mmb-stueck", "starre verbindung", "auskreuzen"]))
        return "armaturen_zubehoer";
    if (hasAny(k, ["transport und montage", "verlegung", "transport und montage pumpensteuerung", "zusätzliche anreise", "zusaetzliche anreise"]))
        return "transport_montage";
    if (hasAny(k, ["mehr- oder minderpreis", "mehr oder minderpreis", "mehr- oder minder", "mehr oder minder", "mehrpreis", "minderpreis", "zulage", "zuschlag", "erschwernisse"]) && !hasAny(k, ["rohrgrabenaushub", "bd-kl", "bd kl", "bodenklasse"]))
        return "mehr_minderpreis";
    if (hasAny(k, ["bestandszeichnung", "bestandszeichnungen", "as-built", "as built", "aufmassdokumentation", "aufmaßdokumentation", "revisionsunterlagen", "planunterlagen", "dokumentation"]))
        return "dokumentation";
    if (hasAny(k, ["wartungs- und bedienungsanleitung", "wartungs und bedienungsanleitung", "wartungsanleitung", "bedienungsanleitung", "betriebsanleitung", "anleitung"]))
        return "wartung_anleitung";
    if (hasAny(k, ["tuv-abnahme", "tuev-abnahme", "tüv-abnahme", "tuv abnahme", "tuev abnahme", "tüv abnahme", "tuv", "tuev", "prüfstelle", "pruefstelle", "ebb-abnahme", "ebb abnahme", "abnahme pruefung", "abnahme prüfung"]))
        return "tuev_abnahme";
    if (hasAny(k, ["sprengarbeiten", "sprengarbeit", "spreng", "sprengen"]) && hasAny(k, ["erkundung", "abstimmung", "koordinierung", "koordination", "zulage"]))
        return "spreng_abstimmung";
    if (hasAny(k, ["gesondertes haufwerk", "haufwerk", "separates haufwerk", "haufwerksbildung"]))
        return "haufwerk_zulage";
    if (hasAny(k, ["asphalt trennen", "asphalt schneiden", "asphaltschneiden", "asphaltfuge", "fugenschnitt", "schneiden asphalt", "trennen asphalt"]))
        return "asphalt_trennen";
    if (hasAny(k, ["strassenaufbruch", "straßenaufbruch", "aufbruch strassenbereich", "aufbruch straßenbereich", "asphalt aufnehmen", "asphalt abbrechen", "asphaltaufbruch", "belag aufnehmen", "decke aufnehmen"]))
        return "strassenaufbruch";
    if (hasAny(k, ["endschacht", "druckleitungsendschacht", "schachtbau", "fertigteilschacht", "schacht herstellen", "schacht setzen", "kontrollschacht", "schachtunterteil", "schachtoberteil"]))
        return "schachtbau";
    // Kurztext has priority. This prevents long Langtext references like Mutterboden, Baum or Aushub
    // from stealing the real family of Rohrgrabenaushub, Rohre, Kabel or Zulagen.
    const isAushubZuschlagKurztext = hasAny(k, ["zuschlag", "zulage", "mehrpreis", "erschwerniszuschlag", "mehr- oder minderpreis", "mehr oder minderpreis"]) &&
        hasAny(k, ["rohrgrabenaushub", "rohrgraben", "leitungsgraben", "kabelgraben", "aushub", "bd-kl", "bd kl", "bodenklasse", "fels", "meissel", "meißel"]);
    if (isAushubZuschlagKurztext)
        return "aushub_zuschlag";
    if (hasAny(k, ["rohrgrabenaushub", "rohrgraben", "leitungsgraben", "kabelgraben", "aushub", "bodenabtrag", "abtrag", "suchschlitz", "fels", "meissel", "meißel"]))
        return "aushub";
    if (hasAny(k, ["hdpe rohre", "hdpe", "pe rohre", "pe hd", "duktile gussrohre", "duktile gußrohre", "gussrohre", "gußrohre", "stahlbetonrohr", "kunststoffrohre", "drainagerohre", "rohrleitung", "wasserleitung", "druckleitung", "formstueck", "formstück", "formstuecke", "formstücke", "passstueck", "passstück", "passstuecke", "passstücke", "boeschungsstueck", "böschungsstück", "durchlass", "schacht", "hydrant", "schieber", "armatur", "strassenkappe", "straßenkappe", "entleerungsleitung", "entlueftungsrohr", "entlüftungsrohr", "ggg", "pp kanal", "abflussrohre"]))
        return "rohrleitung";
    if (hasAny(k, ["kabel", "speedpipe", "leerrohr", "schutzrohr", "kabelschutzrohr", "schutzmatte", "trassenwarnband", "warnband", "runddraht", "erdleitung", "warnanlage", "stromanschlussantrag", "endstopfen", "doppelsteckmuffe", "einzelzugabdichtung", "fernwirkanlage"]))
        return "kabel";
    if (hasAny(k, ["mutterboden", "oberboden", "humus", "humusmiete", "grasnarbe"]))
        return "mutterboden";
    if (hasAny(k, ["wasserhaltung", "pumpenstunden", "pumpe", "grundwasser"]))
        return "wasserhaltung";
    if (hasAny(k, ["asphalt", "pflaster", "bordstein", "belag", "oberflaeche", "oberfläche", "decke", "fraesen", "fräsen", "schneiden", "aufbruch", "wasserbausteine", "kiesstrassen", "kiesstraßen", "wanderweg", "wanderweg wiederherstellen"]))
        return "oberflaeche";
    if (hasAny(k, ["rodung", "freimachen", "bewuchs", "straeucher", "sträucher", "hecken", "buschwerk", "gebuesch", "gebüsch", "wurzeln", "wurzelstoecke", "wurzelstöcke", "stubben", "baeume faellen", "bäume fällen"]))
        return "rodung";
    if (hasAny(k, ["flächen einzäunen", "flaechen einzaeunen", "flachen einzaunen", "einzäunen", "einzaeunen", "einzaunen", "zaun herstellen", "weidezaun herstellen", "zaun setzen", "bauzaun setzen"]))
        return "zaunbau";
    if (hasAny(k, ["schutzmassnahme", "schutzmaßnahme", "bohlenschutz", "weidezaun", "weideflaechen", "weideflächen", "zaeune abbauen", "zäune abbauen", "zaun", "baumschutz", "beweissicherung", "besucherinformation"]))
        return "schutzmassnahme";
    if (hasAny(k, ["verfuellen", "verfüllen", "verfuellung", "verfüllung", "auffuellen", "auffüllen", "auffuell", "verdichten", "planum", "planie", "flaechen auflockern", "flächen auflockern", "entwaesserungsrinne", "entwässerungsrinne", "entwaesserungsmulde", "entwässerungsmulde", "sauberkeitsschicht", "frostschutz", "frostsicheres kiesmaterial", "mineralbeton", "schotter", "kies", "sand", "riesel", "rieselueberdeckung", "rieselüberdeckung", "sohlbettung", "rohrumhuellung", "rohrumhüllung", "schroppen"]))
        return "verfuellung";
    if (hasAny(k, ["stundensaetze", "stundensätze", "stundensatz", "baggerstunden", "lkw stunden", "lkw-stunden", "radlader", "motorflex", "stromaggregat", "fahrzeugkosten", "verrechnungssaetze", "verrechnungssätze", "verrechnungssatz"]))
        return "regie";
    if (hasAny(k, ["baustelleneinrichtung", "abbau und abfuhr", "baustelle raeumen", "baustelle räumen", "bauzaun", "baustellenabsicherung", "baustellendokumentation", "baustellenkoordination", "verkehrssicherung", "zufahrt", "baustrasse", "baustraße", "lagerflaeche", "lagerfläche", "ueberfahrt", "überfahrt", "besprechungsraum", "abstimmung", "dokumentation", "instandhaltung", "anliegerverkehr"]))
        return "baustelle";
    if (hasAny(k, ["material", "liefern", "zulage", "zuschlag", "mehrpreis", "mehr oder minderpreis", "mehr- oder minderpreis", "mehr oder mindertiefe", "mehr- oder mindertiefe", "bedienungsanleitung", "tuev", "tüv", "ebb abnahme", "abnahme", "bentonit", "bohrung", "bohrprotokoll", "statische berechnung", "ueberdachung", "überdachung", "kompressorstunden", "erschwerniszuschlag", "erschwernis", "zusaetzliche anreise", "zusätzliche anreise", "reduzierung", "einsteigleiter", "durchflussmesser", "durchflußmesser", "isolierbinde", "entkeimung", "spuelung", "spülung", "spulung", "spuelen", "spülen", "spulen"]))
        return "material";
    return detectRlcUrkalkulationFamily(row);
}
function isRlcForceLocalUrkalkulation(row) {
    return detectRlcUrkalkulationFamilyV4(row) !== "unknown";
}
function createRlcFallbackUrkalkulation(row, ctx) {
    const family = detectRlcUrkalkulationFamilyV4(row);
    if (family === "unknown")
        return [];
    const qty = Math.max(n(row.menge), 1);
    const unit = row.einheit || "EH";
    const mk = (group, resourceId, name, lineUnit, lineQty, price, note) => ({
        id: safeId(),
        group,
        resourceId,
        name,
        unit: lineUnit,
        qty: round2(Math.max(lineQty, 0)),
        price: round2(Math.max(price, 0)),
        note,
        aiSuggested: true
    });
    const dailyOutput = Math.max(n(ctx.dailyOutput), 60);
    const distanceFactor = ctx.distanceKm > 50 ? 1.15 : ctx.distanceKm > 25 ? 1.08 : 1;
    const restrictedFactor = ctx.restricted ? 1.2 : 1;
    const depthFactor = ctx.depthM >= 2.5 ? 1.35 : ctx.depthM >= 1.5 ? 1.18 : 1;
    const factor = distanceFactor * restrictedFactor * depthFactor;
    const lines = [];
    // RLC V7: mk() expects total quantities for the whole LV position.
    // buildPriceBreakdown() later divides by LV Menge to show Menge je Einheit.
    // Therefore per-unit technical assumptions must be multiplied by qty here.
    const qpu = (perUnitQty) => round2(qty * perUnitQty);
    if (family === "statik_berechnung") {
        lines.push(mk("Personal", "P-STATIK-ING", "Statiker / Tragwerksplaner", "h", Math.max(3, qty * 3), 92, "Statische Berechnung erstellen und prüfen"));
        lines.push(mk("Personal", "P-TECHNIK-DOKU", "Technische Dokumentation", "h", Math.max(1, qty), 68, "Berechnungsunterlagen, Plausibilisierung, Ablage"));
        lines.push(mk("Material", "MAT-STATIK-DOKU", "Berechnungsunterlagen / Ausdruck", "Psch", Math.max(1, qty), 45, "PDF, Prüffassung und Nachweisunterlagen"));
    }
    else if (family === "besucherfuehrung") {
        lines.push(mk("Personal", "P-BESUCHERFUEHRUNG", "Bauleitung / Besucherführung", "h", Math.max(2, qty * 1.5), 75, "Besucher informieren, führen und sichern"));
        lines.push(mk("Personal", "P-SICHERUNG", "Einweiser / Sicherungsposten", "h", Math.max(2, qty * 1.5), 58, "Absicherung während der Führung"));
        lines.push(mk("Material", "MAT-BESUCHERINFO", "Besucherinformation / PSA", "Psch", Math.max(1, qty), 45, "Informationsmaterial, Warnwesten, Unterlagen"));
    }
    else if (family === "naturschutz_auflagen") {
        lines.push(mk("Personal", "P-BAULEITUNG-NATUR", "Bauleitung Naturschutzauflagen", "h", Math.max(2, qty * 2), 75, "Bauzeiten, Bauabschnitte und Auflagen koordinieren"));
        lines.push(mk("Personal", "P-POLIER-NATUR", "Polier / Dokumentation", "h", Math.max(1, qty), 68, "Einweisung, Nachweisführung und Abstimmung"));
        lines.push(mk("Material", "MAT-NATUR-DOKU", "Abstimmungsunterlagen", "Psch", Math.max(1, qty), 35, "Protokolle, Auflagen, Dokumentation"));
    }
    else if (family === "vlies_geotextil") {
        lines.push(mk("Personal", "P-VLIES", "Tiefbauer / Einbaukolonne", "h", qpu(0.018 * factor), 52, "Vlies auslegen, überlappen, fixieren"));
        lines.push(mk("Maschinen", "M-KLEINGERAET", "Kleingerät / Hilfsmittel", "h", qpu(0.006 * factor), 38, "Handling und Zuschnitt"));
        lines.push(mk("Material", "MAT-GEOTEXTIL", "Straßenbauvlies / Geotextil", unit, qty, 3.2, "Vliesmaterial gemäß LV"));
    }
    else if (family === "rundholzlage") {
        lines.push(mk("Personal", "P-HOLZLAGE", "Tiefbaukolonne Holzlage", "h", qpu(0.060 * factor), 54, "Rundholz ausrichten und einbauen"));
        lines.push(mk("Maschinen", "M-BAGGER-HOLZ", "Bagger / Greifer", "h", qpu(0.030 * factor), 82, "Rundholz setzen und ausrichten"));
        lines.push(mk("Material", "MAT-RUNDHOLZ", "Rundholz / Verbindungsmaterial", unit, qty, 22, "Holzlage gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-RUNDHOLZ", "Anlieferung Rundholz", "h", qpu(0.010 * distanceFactor), 110, "Transportanteil"));
    }
    else if (family === "kernbohrung") {
        lines.push(mk("Fremdleistung", "FL-KERNBOHRUNG", "Kernbohrgerät / Spezialist", unit.toLowerCase().includes("st") ? unit : "St", qty, 180, "Kernbohrung herstellen, Bohrkrone/Verschleiß"));
        lines.push(mk("Personal", "P-BAULEITUNG-KERN", "Bauleitung / Einweisung", "h", Math.max(0.5, qty * 0.35), 75, "Einweisen, Lage prüfen, Abnahme"));
        lines.push(mk("Material", "MAT-KERNBOHRUNG", "Wasser / Verschleiß / Abdichtung", "Psch", Math.max(1, qty * 0.2), 35, "Nebenmaterial Kernbohrung"));
    }
    else if (family === "hdd_start_zielgrube") {
        lines.push(mk("Personal", "P-GRUBE-HDD", "Tiefbauer / Einweiser Start-Zielgrube", "h", Math.max(2, qty * 2.0), 52, "Start-/Zielgruben herstellen, sichern, einweisen"));
        lines.push(mk("Maschinen", "M-BAGGER-GRUBE-HDD", "Bagger / Minibagger Start-Zielgrube", "h", Math.max(1.5, qty * 1.5), 82, "Aushub, Profilieren, Wiederverfüllen"));
        lines.push(mk("LKW / Transport", "LKW-GRUBE-HDD", "Transport / Umsetzen Boden", "h", Math.max(0.5, qty * 0.75), 118, "Abfuhr, Zwischenlager oder Umsetzung"));
        lines.push(mk("Entsorgung", "E-GRUBE-HDD", "Boden Start-/Zielgrube entsorgen/verwerten", "t", Math.max(1, qty * 4.0), 28, "Entsorgung abhängig von Bodenklasse und Belastung"));
        lines.push(mk("Material", "MAT-GRUBE-SICHERUNG", "Sicherung / Kleinmaterial Grube", "St", Math.max(1, qty), 85, "Absicherung, Bohlen, Kleinteile"));
    }
    else if (family === "hdd_bohrung") {
        lines.push(mk("Fremdleistung", "FL-HDD", "Horizontalspülbohrkolonne", unit, qty, unit.toLowerCase().includes("m") ? 95 : 850, "HDD/Pilotbohrung gemäß LV, Spezialgerät"));
        lines.push(mk("Personal", "P-HDD-BAULEITUNG", "Bauleitung / Vermessung HDD", "h", Math.max(2, qpu(0.030)), 75, "Trasse, Höhen, Koordination"));
        lines.push(mk("Maschinen", "M-HDD-HILFE", "Bagger / Hilfsgerät Start-Zielgrube", "h", Math.max(1, qpu(0.020)), 82, "Start-/Zielgruben, Unterstützung"));
    }
    else if (family === "bentonit") {
        lines.push(mk("Material", "MAT-BENTONIT", "Bentonit / Bohrspülung", unit, qty, unit.toLowerCase().includes("m3") ? 75 : 180, "Bentonit liefern, aufbereiten oder entsorgen"));
        lines.push(mk("LKW / Transport", "LKW-BENTONIT", "Transport / Entsorgung Bentonit", "h", Math.max(1, qpu(0.030 * distanceFactor)), 118, "Abfuhr/Anlieferung"));
        lines.push(mk("Personal", "P-BENTONIT", "Facharbeiter Bohrspülung", "h", Math.max(1, qpu(0.020)), 58, "Handling, Nachweis, Reinigung"));
    }
    else if (family === "bohrprotokoll") {
        lines.push(mk("Personal", "P-BOHR-DOKU", "Techniker Bohrprotokoll", "h", Math.max(1.5, qty * 1.5), 68, "Bohrdaten erfassen und Protokoll erstellen"));
        lines.push(mk("Personal", "P-BAULEITUNG-BOHR", "Bauleitung Prüfung", "h", Math.max(0.5, qty * 0.5), 75, "Plausibilitätsprüfung und Übergabe"));
        lines.push(mk("Material", "MAT-BOHR-DOKU", "Protokoll / Datenausgabe", "Psch", Math.max(1, qty), 35, "PDF, Plot, Ablage"));
    }
    else if (family === "kompressor") {
        lines.push(mk("Maschinen", "M-KOMPRESSOR", "Kompressor einschl. Betrieb", "h", unit.toLowerCase().includes("h") ? qty : Math.max(1, qty), 48, "Kompressorstunden gemäß LV"));
        lines.push(mk("Personal", "P-KOMPRESSOR", "Bedienung / Kontrolle", "h", unit.toLowerCase().includes("h") ? qty * 0.15 : Math.max(0.5, qty * 0.15), 54, "Kontrolle und Umsetzen"));
        lines.push(mk("Material", "MAT-BETRIEB", "Kraftstoff / Verschleiß", "h", unit.toLowerCase().includes("h") ? qty : Math.max(1, qty), 8, "Betriebsstoffe"));
    }
    else if (family === "ueberdachung") {
        lines.push(mk("Material", "MAT-UEBERDACHUNG", "Überdachung / Einhausung", unit, qty, 420, "Material gemäß LV"));
        lines.push(mk("Personal", "P-MONTAGE-UEBERDACHUNG", "Montagekolonne", "h", Math.max(2, qty * 2), 56, "Aufstellen, sichern, abbauen"));
        lines.push(mk("LKW / Transport", "LKW-UEBERDACHUNG", "Transport Überdachung", "h", Math.max(0.5, qty * 0.5), 110, "An-/Abtransport"));
    }
    else if (family === "bitumen_anspruehen") {
        lines.push(mk("Personal", "P-OBERFLAECHE-BITUMEN", "Straßenbauer / Spritzkolonne", "h", qpu(0.018 * factor), 54, "Unterlage reinigen, ansprühen und kontrollieren"));
        lines.push(mk("Maschinen", "M-RAMPENSPRITZGERAET", "Rampenspritzgerät / Kleingerät", "h", qpu(0.010 * factor), 58, "Bitumenhaltiges Bindemittel aufsprühen"));
        lines.push(mk("Material", "MAT-BITUMEN-BINDEMITTEL", "Bitumenemulsion / Haftkleber", unit, qty, 1.35, "Bindemittel je Fläche gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-BITUMEN", "Transport / Einrichtung", "h", qpu(0.004 * distanceFactor), 110, "Geräte- und Materialtransport"));
    }
    else if (family === "brunnen_aufschlussbohrung") {
        lines.push(mk("Fremdleistung", "FL-BRUNNENBOHRUNG", "Bohrgerät / Brunnenbauer", unit.toLowerCase().includes("m") ? unit : "St", qty, unit.toLowerCase().includes("m") ? 135 : 950, "Brunnenbau/Aufschlussbohrung gemäß LV, Spezialgerät"));
        lines.push(mk("Personal", "P-BRUNNEN-BAULEITUNG", "Bauleitung / Vermessung Brunnen", "h", Math.max(1, qpu(0.02)), 75, "Ansatzpunkt, Tiefe, Ausbau und Übergabe prüfen"));
        lines.push(mk("Material", "MAT-BRUNNEN-AUSBAU", "Filterrohr / Vollrohr / Filterkies", unit.toLowerCase().includes("m") ? unit : "Psch", Math.max(1, qty), unit.toLowerCase().includes("m") ? 32 : 180, "Ausbau- und Filtermaterial gemäß LV"));
    }
    else if (family === "verbau_spundwand") {
        lines.push(mk("Personal", "P-VERBAU", "Verbaukolonne / Einweiser", "h", qpu(0.060 * factor), 58, "Verbau herstellen, umsetzen, ziehen"));
        lines.push(mk("Maschinen", "M-VERBAUGERAET", "Bagger / Verbaugerät", "h", qpu(0.045 * factor), 96, "Verbautafeln, Spundwand oder Kanaldielen einbauen"));
        lines.push(mk("Material", "MAT-VERBAU", "Verbaumaterial / Vorhaltung", unit, qty, 28, "Verbau- oder Vorhaltematerial gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-VERBAU", "Transport Verbau", "h", qpu(0.020 * distanceFactor), 118, "An-/Abtransport und Umsetzen"));
    }
    else if (family === "ramm_press_ruettel") {
        lines.push(mk("Fremdleistung", "FL-RAMM-PRESS", "Ramm-/Rüttel-/Pressgerät mit Bedienung", unit, qty, unit.toLowerCase().includes("h") ? 165 : 260, "Spezialgerät für Ramm-, Rüttel- oder Pressarbeiten"));
        lines.push(mk("Personal", "P-RAMM-EINWEISER", "Einweiser / Bauleitung", "h", qpu(0.020 * factor), 75, "Lage, Erschütterung und Ablauf kontrollieren"));
        lines.push(mk("Material", "MAT-RAMMGUT", "Rammgut / Hilfsmaterial", unit, qty, 35, "Material nach LV, falls enthalten"));
    }
    else if (family === "rohrvortrieb_einpressen") {
        lines.push(mk("Fremdleistung", "FL-ROHRVORTRIEB", "Rohrvortrieb / Einpresskolonne", unit, qty, unit.toLowerCase().includes("m") ? 220 : 1200, "Rohrvortrieb/Einpressen als Spezialleistung"));
        lines.push(mk("Personal", "P-VORTRIEB-BAULEITUNG", "Bauleitung / Vermessung Vortrieb", "h", Math.max(2, qpu(0.035)), 75, "Achse, Höhe, Start-/Zielpunkte prüfen"));
        lines.push(mk("Maschinen", "M-VORTRIEB-HILFE", "Bagger / Hilfsgerät Vortrieb", "h", Math.max(1, qpu(0.020)), 82, "Start- und Zielbereich unterstützen"));
    }
    else if (family === "nassbaggerarbeiten") {
        lines.push(mk("Maschinen", "M-NASSBAGGER", "Nassbagger / Langarmbagger", "h", qpu(0.050 * factor), 145, "Sediment, Schlamm oder Gewässersohle aufnehmen"));
        lines.push(mk("Personal", "P-WASSERBAU", "Wasserbaukolonne / Einweiser", "h", qpu(0.040 * factor), 58, "Sicherung, Einweisung, Wasserbauarbeiten"));
        lines.push(mk("Entsorgung", "E-SEDIMENT", "Sediment / Schlamm verwerten", "t", qpu(0.65), 45, "Entsorgung/Verwertung abhängig von Belastung"));
    }
    else if (family === "schlitzwand") {
        lines.push(mk("Fremdleistung", "FL-SCHLITZWAND", "Schlitzwandgerät / Spezialkolonne", unit, qty, unit.toLowerCase().includes("m2") ? 185 : 950, "Schlitzwand/Dichtwand mit Stützflüssigkeit"));
        lines.push(mk("Material", "MAT-STUETZFLUESSIGKEIT", "Bentonit / Stützflüssigkeit", "Psch", Math.max(1, qty * 0.15), 160, "Stützflüssigkeit, Aufbereitung, Nachweis"));
        lines.push(mk("Personal", "P-SCHLITZWAND-QS", "Bauleitung / Qualitätssicherung", "h", Math.max(2, qpu(0.025)), 75, "Lamellen, Tiefe, Protokolle prüfen"));
    }
    else if (family === "spritzbeton") {
        lines.push(mk("Personal", "P-SPRITZBETON", "Spritzbetonkolonne", "h", qpu(0.050 * factor), 62, "Untergrund vorbereiten, Spritzbeton aufbringen"));
        lines.push(mk("Maschinen", "M-SPRITZBETON", "Spritzbetongerät / Kompressor", "h", qpu(0.035 * factor), 95, "Spritzgerät, Luft, Reinigung"));
        lines.push(mk("Material", "MAT-SPRITZBETON", "Spritzbeton / Bewehrungsfasern", unit, qty, unit.toLowerCase().includes("m3") ? 155 : 38, "Spritzbetonmaterial gemäß LV"));
    }
    else if (family === "kampfmittel") {
        lines.push(mk("Fremdleistung", "FL-KAMPFMITTEL", "Kampfmittelsondierung / Feuerwerker", unit, qty, unit.toLowerCase().includes("m2") ? 1.8 : 650, "Sondierung/Räumung als Spezialleistung"));
        lines.push(mk("Personal", "P-KAMPFMITTEL-KOORD", "Bauleitung / Sicherheitskoordination", "h", Math.max(1, qpu(0.010)), 75, "Sperrung, Freigabe und Dokumentation koordinieren"));
        lines.push(mk("Material", "MAT-KAMPFMITTEL-DOKU", "Freigabe / Dokumentation", "Psch", Math.max(1, qty * 0.05), 65, "Protokoll, Lageplan, Freigabe"));
    }
    else if (family === "verkehrssicherung") {
        lines.push(mk("Personal", "P-VERKEHRSSICHERUNG", "Verkehrssicherungskolonne", "h", Math.max(2, qpu(0.020 * factor)), 58, "Beschilderung, Absperrung, Kontrolle"));
        lines.push(mk("Material", "MAT-VZ", "Verkehrszeichen / Absperrmaterial", unit, qty, unit.toLowerCase().includes("psch") ? 420 : 18, "Beschilderung/Absperrung gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-VS", "Transport Verkehrssicherung", "h", Math.max(0.5, qpu(0.010 * distanceFactor)), 110, "An-/Abtransport und Umsetzen"));
    }
    else if (family === "baulogistik") {
        lines.push(mk("Personal", "P-BAULOGISTIK", "Logistikkoordination / Polier", "h", Math.max(2, qty * 1.5), 68, "Lieferungen, Lagerflächen, interne Transporte koordinieren"));
        lines.push(mk("Maschinen", "M-STAPLER-RADLADER", "Stapler / Radlader", "h", Math.max(1, qty), 82, "Umschlag und interne Baustellentransporte"));
        lines.push(mk("Material", "MAT-LOGISTIK", "Lagerfläche / Container / Hilfsmittel", "Psch", Math.max(1, qty), 150, "Baulogistik-Hilfsmittel gemäß LV"));
    }
    else if (family === "abfallentsorgung") {
        lines.push(mk("Personal", "P-ENTSORGUNG-DOKU", "Entsorgungsdokumentation / Einweiser", "h", Math.max(0.5, qpu(0.010)), 62, "Deklaration, Nachweise, Einweisung"));
        lines.push(mk("LKW / Transport", "LKW-ENTSORGUNG", "Transport zur Entsorgung", "h", qpu(0.030 * distanceFactor), 118, "Abfuhr zur Anlage/Deponie"));
        lines.push(mk("Entsorgung", "E-ABFALL", "Abfall / Boden / Bauschutt entsorgen", unit, qty, unit.toLowerCase().includes("t") ? 55 : 28, "Entsorgung/Verwertung gemäß Deklaration"));
    }
    else if (family === "abscheider_klaeranlage") {
        lines.push(mk("Personal", "P-ABSCHEIDER", "Montagekolonne Abscheider/Kleinkläranlage", "h", Math.max(4, qty * 4), 58, "Einbau, Anschluss, Kontrolle"));
        lines.push(mk("Maschinen", "M-KRAN-ABSCHEIDER", "Bagger / Kran Hebeeinsatz", "h", Math.max(2, qty * 2), 98, "Heben, Versetzen, Ausrichten"));
        lines.push(mk("Material", "MAT-ABSCHEIDER", "Abscheider / Kleinkläranlage / Zubehör", unit, qty, 2200, "Anlage gemäß LV"));
        lines.push(mk("Personal", "P-INBETRIEBNAHME", "Inbetriebnahme / Prüfung", "h", Math.max(1, qty), 78, "Prüfung und Übergabe"));
    }
    else if (family === "bahn_gleisbau") {
        lines.push(mk("Fremdleistung", "FL-GLEISBAU", "Gleisbau-/Bahnübergangskolonne", unit, qty, unit.toLowerCase().includes("m") ? 180 : 1200, "Arbeiten im Gleisbereich als Spezialleistung"));
        lines.push(mk("Personal", "P-BAHN-SICHERUNG", "Sicherungsaufsicht / Bauleitung Bahn", "h", Math.max(2, qpu(0.020)), 85, "Sicherung, Sperrpausen, Koordination"));
        lines.push(mk("Material", "MAT-GLEIS", "Gleis-/Bahnübergangsmaterial", unit, qty, 45, "Material gemäß LV"));
    }
    else if (family === "abdichtung_bauwerk") {
        lines.push(mk("Personal", "P-ABDICHTUNG", "Abdichtungskolonne", "h", qpu(0.040 * factor), 56, "Abdichtung vorbereiten und einbauen"));
        lines.push(mk("Material", "MAT-ABDICHTUNG", "Dichtungsbahn / Fugenband / Quellband", unit, qty, 18, "Abdichtungsmaterial gemäß LV"));
        lines.push(mk("Maschinen", "M-ABDICHTUNG-KLEIN", "Kleingerät Abdichtung", "h", qpu(0.012 * factor), 42, "Schneiden, Reinigen, Einpassen"));
    }
    else if (family === "pflaster_bord_rinne") {
        lines.push(mk("Personal", "P-PFLASTER", "Pflasterer / Straßenbauer", "h", qpu(0.070 * factor), 56, "Pflaster, Bord oder Rinne setzen"));
        lines.push(mk("Maschinen", "M-PFLASTER", "Minibagger / Schneidgerät / Rüttelplatte", "h", qpu(0.025 * factor), 52, "Material verteilen, schneiden, verdichten"));
        lines.push(mk("Material", "MAT-PFLASTER-BORD", "Pflaster / Bord / Rinne", unit, qty, unit.toLowerCase().includes("m2") ? 38 : 24, "Oberflächenbauteile gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-PFLASTER", "Transport Oberflächenmaterial", "h", qpu(0.020 * distanceFactor), 118, "Anlieferung / Abfuhr"));
    }
    else if (family === "asphalt_oberbau") {
        lines.push(mk("Personal", "P-ASPHALT", "Asphaltkolonne", "h", qpu(0.030 * factor), 58, "Asphalt einbauen, verteilen, verdichten"));
        lines.push(mk("Maschinen", "M-ASPHALT", "Fertiger / Walze / Kleingerät", "h", qpu(0.020 * factor), 95, "Einbau- und Verdichtungsgerät"));
        lines.push(mk("Material", "MAT-ASPHALT", "Asphaltmischgut", unit, qty, unit.toLowerCase().includes("t") ? 95 : 22, "Asphaltmischgut gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-ASPHALT", "Transport Asphalt", "h", qpu(0.018 * distanceFactor), 118, "Anlieferung Mischgut"));
    }
    else if (family === "regie") {
        if (normSearch(row.kurztext).includes("lkw")) {
            lines.push(mk("LKW / Transport", "LKW-REGIE", "LKW einschl. Fahrer", "h", 1, 118, "Regieansatz gemäß LV-Position"));
        }
        else if (normSearch(row.kurztext).includes("bagger")) {
            lines.push(mk("Maschinen", "M-BAGGER-REGIE", "Bagger einschl. Fahrer", "h", 1, 92, "Regieansatz gemäß LV-Position"));
        }
        else if (normSearch(row.kurztext).includes("radlader")) {
            lines.push(mk("Maschinen", "M-RADLADER-REGIE", "Radlader einschl. Fahrer", "h", 1, 82, "Regieansatz gemäß LV-Position"));
        }
        else {
            lines.push(mk("Personal", "P-REGIE", "Personal Regie", "h", 1, 54, "Regieansatz gemäß LV-Position"));
        }
        lines.push(mk("Zuschläge", "Z-GEMEINKOSTEN", "Baustellengemeinkosten", "%", 1, 10, "10 % Zuschlag"));
        lines.push(mk("Zuschläge", "Z-GEWINN", "Gewinnzuschlag", "%", 1, 10, "10 % Zuschlag"));
        return lines;
    }
    if (family === "infrastruktur") {
        lines.push(mk("Personal", "P-BAULEITUNG-KOORD", "Bauleitung / Koordination", "h", Math.max(2, qty * 2), 75, "Verkehr, Anlieger, Zufahrt oder Erschwernis koordinieren"));
        lines.push(mk("Personal", "P-POLIER", "Polier / Vorarbeiter", "h", Math.max(2, qty * 2), 68, "Einweisung, Kontrolle und tägliche Abstimmung"));
        lines.push(mk("Maschinen", "M-KLEINGERAETE", "Kleingeräte / Absicherung", "Psch", Math.max(1, qty), 120, "Hilfsmittel, Absperrung, laufende Instandhaltung"));
        lines.push(mk("LKW / Transport", "LKW-INFRA", "Transport / Umsetzen", "h", Math.max(1, qty), 110, "Zusätzliche Fahrten und Umsetzen"));
    }
    else if (family === "beweissicherung") {
        lines.push(mk("Fremdleistung", "FL-BEWEISSICHERUNG", "Sachverständiger Beweissicherung", "St", qty, 280, "Externe Beweissicherung / Gutachterleistung"));
        lines.push(mk("Personal", "P-DOKU", "Dokumentation / Zuordnung", "h", Math.max(1, qty * 0.75), 68, "Fotos, Bericht, Zuordnung und Übergabe"));
        lines.push(mk("Material", "MAT-DOKU", "Fotodokumentation / Bericht", "Psch", Math.max(1, qty), 35, "Bericht, Datenträger, Ablage"));
    }
    else if (family === "grenzstein") {
        lines.push(mk("Personal", "P-VERMESSUNG", "Vermesser / Einweiser", "h", qpu(0.35), 72, "Grenzsteine suchen, freilegen, sichern"));
        lines.push(mk("Personal", "P-TIEFBAU", "Tiefbauer", "h", qpu(0.20), 52, "Freilegen und Schutz herstellen"));
        lines.push(mk("Material", "MAT-MARKIERUNG", "Markierung / Schutzmaterial", unit, qty, 8, "Markierung und Schutz während Bauzeit"));
    }
    else if (family === "bauschild") {
        lines.push(mk("Material", "MAT-BAUSCHILD", "Bauschild / Informationstafel", unit, qty, 650, "Schild/Tafel gemäß LV-Text"));
        lines.push(mk("Personal", "P-MONTAGE", "Montagekolonne", "h", qpu(1.20), 54, "Aufstellen, ausrichten, sichern"));
        lines.push(mk("Maschinen", "M-KLEIN", "Kleingerät / Fundament", "h", qpu(0.40), 48, "Montagehilfen / Fundamente"));
        lines.push(mk("LKW / Transport", "LKW-SCHILD", "Anlieferung / Abholung", "h", qpu(0.50), 110, "Transport Bauschild/Informationstafel"));
    }
    else if (family === "beton_bauteile") {
        lines.push(mk("Personal", "P-BETONBAU", "Betonbaukolonne", "h", qpu(0.35 * factor), 56, "Beton-/Bauteilleistung herstellen und einbauen"));
        lines.push(mk("Maschinen", "M-HEBEGERAET", "Bagger / Hebegerät", "h", qpu(0.12 * factor), 82, "Heben, Einbauen, Verdichten"));
        lines.push(mk("Material", "MAT-BETON-BAUTEIL", "Beton / Bauteil / Bewehrung", unit, qty, 115, "Material gemäß LV-Text prüfen"));
        lines.push(mk("LKW / Transport", "LKW-MATERIAL", "Lieferung / Transport", "h", qpu(0.02 * distanceFactor), 110, "Materialtransport"));
    }
    else if (family === "drainage") {
        lines.push(mk("Personal", "P-DRAINAGE", "Drainagekolonne", "h", qpu(0.055 * factor), 54, "Drainageleitung verlegen, ausrichten, anschließen"));
        lines.push(mk("Maschinen", "M-BAGGER-8T", "Bagger 8 t", "h", qpu(0.025 * factor), 78, "Bettung herstellen, Verfüllen"));
        lines.push(mk("Material", "MAT-DRAINAGE", "Drainagerohr / Vlies / Kies", unit, qty, 18, "Drainagematerial gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-DRAINAGE", "Materialtransport", "h", qpu(0.012 * distanceFactor), 110, "Anlieferung Drainagematerial"));
    }
    else if (family === "spuelen_pruefen") {
        const isMeterPosition = normSearch(unit).includes("m");
        lines.push(mk("Personal", "P-PRUEFUNG", "Prüf-/Spülkolonne", "h", Math.max(2, qpu(0.035)), 58, "Spülen, Prüfen, Entkeimen, Protokollieren"));
        lines.push(mk("Maschinen", "M-SPUELGERAET", "Spül-/Prüfgerät", "h", Math.max(1, qpu(0.020)), 85, "Geräteeinsatz Spülen/Prüfen"));
        if (isMeterPosition) {
            lines.push(mk("Material", "MAT-SPUEL-VERBRAUCH", "Wasser / Spülmaterial / Protokoll", unit, qty, 0.65, "Verbrauchsmaterial, Wasser und Nachweis anteilig je Meter"));
            lines.push(mk("Personal", "P-PROTOKOLL", "Protokoll / Nachweis", "h", Math.max(1, qty / 2500), 68, "Spülprotokoll und Übergabe"));
        }
        else {
            lines.push(mk("Material", "MAT-PRUEFUNG", "Wasser / Desinfektion / Protokoll", "Psch", Math.max(1, qty), 60, "Verbrauchsmaterial und Nachweise"));
        }
    }
    else if (family === "elektro_msr") {
        lines.push(mk("Personal", "P-ELEKTRO", "Elektromonteur / MSR-Techniker", "h", Math.max(3, qty * 3), 72, "Montage, Anschluss, Parametrierung"));
        lines.push(mk("Personal", "P-INBETRIEBNAHME", "Inbetriebnahme / Prüfung", "h", Math.max(1.5, qty * 1.5), 78, "Funktionsprüfung und Dokumentation"));
        lines.push(mk("Material", "MAT-ELEKTRO-MSR", "Elektro-/MSR-Komponente", unit, qty, 450, "Komponente gemäß LV-Text"));
        lines.push(mk("LKW / Transport", "LKW-ELEKTRO", "Lieferung / Transport", "h", qpu(0.30), 110, "Anlieferung Schaltschrank/Gerät"));
    }
    else if (family === "armaturen_zubehoer") {
        lines.push(mk("Material", "MAT-ARMATUR-ZUBEHOER", "Armatur / Formteil / Zubehör", unit, qty, 85, "Bauteil gemäß LV-Text"));
        lines.push(mk("Personal", "P-MONTAGE-ZUBEHOER", "Rohrbauer / Monteur", "h", qpu(0.08 * factor), 56, "Einbauen, montieren, abdichten"));
        lines.push(mk("Maschinen", "M-KLEINWERKZEUG", "Kleingerät / Werkzeug", "h", qpu(0.02), 38, "Montagehilfen"));
    }
    else if (family === "pumpstation") {
        lines.push(mk("Personal", "P-PUMPSTATION", "Montagekolonne Pumpstation", "h", Math.max(8, qty * 8), 58, "Pumpstation setzen, anschließen, prüfen"));
        lines.push(mk("Maschinen", "M-BAGGER-KRAN", "Bagger/Kran Hebeeinsatz", "h", Math.max(3, qty * 3), 98, "Heben und Versetzen"));
        lines.push(mk("Material", "MAT-PUMPSTATION", "Pumpstation / Pumpe / Zubehör", unit, qty, 2500, "Aggregat/Station gemäß LV-Text"));
        lines.push(mk("Personal", "P-INBETRIEBNAHME", "Inbetriebnahme", "h", Math.max(2, qty * 2), 78, "Testlauf und Übergabe"));
    }
    else if (family === "hausanschluss") {
        lines.push(mk("Personal", "P-HAUSANSCHLUSS", "Hausanschlusskolonne", "h", qpu(0.09 * factor), 56, "Anschluss herstellen, Leitung verbinden"));
        lines.push(mk("Maschinen", "M-MINIBAGGER", "Minibagger", "h", qpu(0.035 * factor), 68, "Freilegen, Verfüllen, Unterstützen"));
        lines.push(mk("Material", "MAT-HAUSANSCHLUSS", "Hausanschlussmaterial", unit, qty, 28, "Material gemäß LV"));
        lines.push(mk("Zeit / Leistung", "Z-LEISTUNG-HA", "Leistung Hausanschluss", unit.toLowerCase().includes("m") ? "m/Tag" : "St/Tag", Math.max(8, dailyOutput), 0, "Produktivitätsansatz"));
    }
    else if (family === "mehr_minderpreis") {
        lines.push(mk("Personal", "P-ZULAGE", "Mehraufwand Personal", "h", qpu(0.015 * factor), 56, "Nur Mehr-/Minderaufwand, keine komplette Position"));
        lines.push(mk("Maschinen", "M-ZULAGE", "Mehraufwand Gerät", "h", qpu(0.010 * factor), 82, "Reduzierte Leistung / Zusatzhandling"));
        lines.push(mk("Material", "MAT-ZULAGE", "Material-/Preisanteil Zulage", unit, qty, 4, "Zulage/Mehrpreis gemäß LV-Text prüfen"));
    }
    else if (family === "transport_montage") {
        lines.push(mk("LKW / Transport", "LKW-TRANSPORT-MONTAGE", "Transport / Anlieferung", "h", Math.max(1, qpu(0.05 * distanceFactor)), 110, "Transport und Montageanteil"));
        lines.push(mk("Personal", "P-MONTAGE", "Montagepersonal", "h", Math.max(1, qpu(0.08 * factor)), 56, "Montage/Verlegung gemäß LV"));
        lines.push(mk("Maschinen", "M-MONTAGEHILFE", "Montagehilfe / Kleingerät", "h", Math.max(0.5, qpu(0.02)), 45, "Hilfsgerät Montage"));
    }
    if (family === "dokumentation") {
        lines.push(mk("Personal", "P-TECHNIKER-DOKU", "Techniker / Bauzeichner", "h", Math.max(2, qty * 2), 68, "Bestandszeichnungen prüfen, nachführen und erstellen"));
        lines.push(mk("Personal", "P-BAULEITUNG-DOKU", "Bauleitung / Abnahme Dokumentation", "h", Math.max(0.5, qty * 0.75), 75, "Kontrolle, Abstimmung und Übergabe der Unterlagen"));
        lines.push(mk("Material", "MAT-DOKU", "Planunterlagen / Datenausgabe", "Psch", Math.max(1, qty), 35, "Plot, PDF/DWG, Ablage und Übergabe"));
    }
    else if (family === "wartung_anleitung") {
        lines.push(mk("Personal", "P-TECHNIKER-DOKU", "Techniker Dokumentation", "h", Math.max(2, qty * 2), 68, "Wartungs- und Bedienungsanleitung erstellen/pruefen"));
        lines.push(mk("Personal", "P-BAULEITUNG-DOKU", "Bauleitung / technische Kontrolle", "h", Math.max(0.5, qty * 0.75), 75, "Inhalte kontrollieren und Übergabe koordinieren"));
        lines.push(mk("Material", "MAT-DOKU", "PDF / Herstellerunterlagen / Ablage", "Psch", Math.max(1, qty), 75, "Digitale Unterlagen, Zusammenstellung und Ablage"));
    }
    else if (family === "tuev_abnahme") {
        lines.push(mk("Fremdleistung", "FL-TUEV-PRUEFSTELLE", "TÜV / Prüfstelle", "Psch", Math.max(1, qty), 650, "Externe Abnahme-/Prüfleistung"));
        lines.push(mk("Personal", "P-BAULEITUNG-ABNAHME", "Bauleitung Begleitung", "h", Math.max(2, qty * 2), 75, "Termin, Begleitung, Mängelaufnahme"));
        lines.push(mk("Personal", "P-DOKU-ABNAHME", "Dokumentation Abnahme", "h", Math.max(1, qty), 68, "Protokoll, Nachweise, Übergabe"));
    }
    else if (family === "spreng_abstimmung") {
        lines.push(mk("Personal", "P-BAULEITUNG-SPRENG", "Bauleitung / Polier Abstimmung", "h", Math.max(4, qty * 4), 75, "Erkundung, Abstimmung und Koordination Sprengarbeiten"));
        lines.push(mk("Personal", "P-SICHERHEIT-SPRENG", "Sicherheitskoordination", "h", Math.max(2, qty * 2), 68, "Sicherheits- und Ablaufkoordination"));
        lines.push(mk("Fremdleistung", "FL-SPRENG-SPEZIALIST", "Sprengfachliche Beratung / Spezialist", "Psch", Math.max(1, qty), 450, "Spezialleistung nur für Abstimmung/Erkundung, keine Ausführung"));
        lines.push(mk("Material", "MAT-DOKU-SPRENG", "Dokumentation / Lageunterlagen", "Psch", Math.max(1, qty), 60, "Pläne, Abstimmungsunterlagen, Protokoll"));
    }
    else if (family === "haufwerk_zulage") {
        lines.push(mk("Personal", "P-HAUFWERK-EINWEISER", "Einweiser / Polier", "h", qpu(0.008 * factor), 58, "Gesondertes Haufwerk einweisen, kontrollieren"));
        lines.push(mk("Maschinen", "M-RADLADER-HAUFWERK", "Radlader / Bagger", "h", qpu(0.006 * factor), 82, "Haufwerk bilden/umsetzen"));
        lines.push(mk("LKW / Transport", "LKW-INTERN-HAUFWERK", "Interner Transport / Umsetzen", "h", qpu(0.004 * distanceFactor), 110, "Nur zusätzlicher Handling-/Transportanteil"));
    }
    else if (family === "asphalt_trennen") {
        lines.push(mk("Personal", "P-ASFALT-SCHNEIDER", "Straßenbauer / Schneidhelfer", "h", qpu(0.025 * factor), 54, "Asphalt trennen, einmessen, sichern"));
        lines.push(mk("Maschinen", "M-FUGENSCHNEIDER", "Fugenschneider / Asphaltschneider", "h", qpu(0.018 * factor), 44, "Schnitt herstellen"));
        lines.push(mk("Material", "MAT-SCHNEIDVERSCHLEISS", "Wasser / Diamantblatt-Verschleiß", unit, qty, 1.8, "Verschleiß- und Nebenmaterial je Schnittmeter"));
        lines.push(mk("Zeit / Leistung", "Z-LEISTUNG-ASPHALT-SCHNITT", "Leistung Asphaltschnitt", "m/Tag", Math.max(120, dailyOutput), 0, "Produktivitätsansatz"));
    }
    else if (family === "strassenaufbruch") {
        lines.push(mk("Personal", "P-STRASSENAUFBRUCH", "Straßenbauer / Aufbruchkolonne", "h", qpu(0.050 * factor), 54, "Straßenaufbruch herstellen, sichern, laden"));
        lines.push(mk("Maschinen", "M-AUFBRUCHGERAET", "Bagger / Aufbruchgerät", "h", qpu(0.035 * factor), 68, "Aufbrechen und Laden"));
        lines.push(mk("LKW / Transport", "LKW-AUFBRUCH", "LKW Abfuhr Aufbruch", "h", qpu(0.020 * distanceFactor), 118, "Abfuhr Asphalt/Bauschutt"));
        lines.push(mk("Entsorgung", "E-ASPHALT-BAUSCHUTT", "Asphalt/Bauschutt entsorgen", "t", qpu(unit.toLowerCase().includes("m2") ? 0.22 : 0.15), 55, "Entsorgung/Verwertung Aufbruchmaterial"));
    }
    else if (family === "schachtbau") {
        lines.push(mk("Personal", "P-SCHACHTBAU", "Schachtbaukolonne", "h", Math.max(4, qpu(4.0 * factor)), 58, "Schacht setzen, ausrichten, anschließen"));
        lines.push(mk("Maschinen", "M-BAGGER-14T", "Bagger 14 t", "h", Math.max(2, qpu(2.0 * factor)), 92, "Heben, Versetzen, Verfüllen"));
        lines.push(mk("Material", "MAT-SCHACHT", "Schacht / Armaturen / Formstücke", unit, qty, 1000, "Schachtmaterial gemäß LV-Text prüfen"));
        lines.push(mk("Material", "MAT-BETON-DICHTUNG", "Beton / Dichtung / Verguss", "Psch", Math.max(1, qty), 150, "Nebenmaterial Schachtanschluss"));
    }
    else if (family === "baustelle") {
        lines.push(mk("Personal", "P-POLIER", "Polier / Bauleitung", "h", Math.max(4, qty * 2), 68, "Einrichten, koordinieren, kontrollieren"));
        lines.push(mk("Personal", "P-KOLONNE", "Tiefbaukolonne", "h", Math.max(8, qty * 6), 52, "Aufbau, Vorhaltung, Räumen"));
        lines.push(mk("Maschinen", "M-LADER", "Radlader / Stapler", "h", Math.max(2, qty * 2), 82, "Einrichten und Umsetzen"));
        lines.push(mk("LKW / Transport", "LKW-TRANSPORT", "Transport Baustelleneinrichtung", "h", Math.max(3, qty * 3), 118, "An- und Abtransport"));
    }
    else if (family === "mutterboden") {
        const widthM = unit.toLowerCase() === "m" ? 6 : 1;
        const depthM = 0.15;
        const qtyM3 = unit.toLowerCase() === "m" ? qty * widthM * depthM : unit.toLowerCase().includes("m2") ? qty * depthM : qty;
        lines.push(mk("Personal", "P-FACHARBEITER-TIEFBAU", "Facharbeiter Tiefbau", "h", qty * 0.035 * factor, 52, "Mutterboden abtragen, lagern, wieder andecken"));
        lines.push(mk("Maschinen", "M-BAGGER-8T", "Bagger 8 t", "h", qty * 0.030 * factor, 78, "Oberboden profilgerecht abtragen"));
        lines.push(mk("LKW / Transport", "LKW-4A", "LKW 4-Achser", "h", qty * 0.020 * distanceFactor, 118, "Transport / Umsetzen im Baufeld"));
        lines.push(mk("Entsorgung", "E-MUTTERBODEN-LAGERN", "Mutterboden lagern / behandeln", "t", Math.max(0.05, qtyM3 * 1.6), 12, "Humushaltiges Material lagern bzw. verwerten"));
    }
    else if (family === "rodung") {
        lines.push(mk("Personal", "P-LANDSCHAFTSBAU", "Facharbeiter Landschaftsbau", "h", qpu(0.06 * factor), 52, "Bewuchs entfernen, sichern, nacharbeiten"));
        lines.push(mk("Maschinen", "M-MINIBAGGER", "Minibagger / Anbaugerät", "h", qpu(0.035 * factor), 68, "Rodung / Wurzelarbeiten"));
        lines.push(mk("LKW / Transport", "LKW-ABFUHR", "Transport Grüngut", "h", qpu(0.025 * distanceFactor), 110, "Abfuhr / Umsetzen"));
        lines.push(mk("Entsorgung", "E-GRUENGUT", "Grüngut verwerten", "t", qpu(0.08), 35, "Entsorgung / Verwertung"));
    }
    else if (family === "aushub_zuschlag") {
        const k = normSearch(`${row.kurztext || ""} ${row.langtext || ""}`);
        const isBk7 = /(?:bd|bk|bodenklasse)\s*[-.]?\s*7/.test(k) || k.includes("klasse 7");
        const isBk6 = isBk7 || /(?:bd|bk|bodenklasse)\s*[-.]?\s*6/.test(k) || k.includes("klasse 6") || k.includes("fels");
        const hammerQty = isBk7 ? 0.14 : isBk6 ? 0.08 : 0.035;
        const baggerQty = isBk7 ? 0.045 : isBk6 ? 0.030 : 0.015;
        const laborQty = isBk7 ? 0.050 : isBk6 ? 0.030 : 0.015;
        const hammerPrice = isBk7 ? 125 : isBk6 ? 110 : 92;
        lines.push(mk("Personal", "P-ZUSCHLAG-AUSHUB", "Zusatzaufwand Tiefbauer / Einweiser", "h", qpu(laborQty * factor), 52, "Nur Mehraufwand zur Grundposition, keine komplette Aushubposition"));
        lines.push(mk("Maschinen", "M-HYDRAULIKHAMMER", isBk6 ? "Hydraulikhammer / Felslöffel" : "Zusatzgerät Aushub", "h", qpu(hammerQty * factor), hammerPrice, "Zuschlag für schwere Bodenklasse / erschwertes Lösen"));
        lines.push(mk("Maschinen", "M-BAGGER-ZUSCHLAG", "Bagger-Mehraufwand", "h", qpu(baggerQty * factor), 92, "Reduzierte Leistung gegenüber Grundposition"));
        if (ctx.distanceKm > 0 || k.includes("abfuhr") || k.includes("entsorg")) {
            lines.push(mk("LKW / Transport", "LKW-ZUSCHLAG-AUSHUB", "Transport-Mehraufwand", "h", qpu(0.010 * distanceFactor), 118, "Nur wenn zusätzlicher Transport/Handling entsteht"));
        }
    }
    else if (family === "aushub") {
        lines.push(mk("Personal", "P-TIEFBAU-KOLONNE", "Tiefbauer / Einweiser", "h", qpu(0.045 * factor), 52, "Aushub herstellen, sichern, kontrollieren"));
        lines.push(mk("Maschinen", "M-BAGGER-14T", "Kettenbagger 14 t", "h", qpu(0.035 * factor), 92, "Aushub / Laden / Profilieren"));
        lines.push(mk("LKW / Transport", "LKW-4A", "LKW 4-Achser", "h", qpu(0.030 * distanceFactor), 118, "Transport Boden / Zwischenlager"));
        lines.push(mk("Entsorgung", "E-BODEN", "Boden entsorgen / verwerten", "t", unit.toLowerCase().includes("m3") ? qpu(1.8) : qpu(0.25), 28, "Entsorgung abhängig von Bodenklasse"));
    }
    else if (family === "verfuellung") {
        lines.push(mk("Personal", "P-TIEFBAU", "Tiefbauer", "h", qpu(0.035 * factor), 52, "Einbauen, profilieren, verdichten"));
        lines.push(mk("Maschinen", "M-RADLADER", "Radlader", "h", qpu(0.025 * factor), 82, "Material einbauen / verteilen"));
        lines.push(mk("Maschinen", "M-RUETTELPLATTE", "Verdichtungsgerät", "h", qpu(0.018 * factor), 36, "Lagenweise verdichten"));
        lines.push(mk("Material", "MAT-SCHUETTGUT", "Schüttgut / Einbaumaterial", unit, qty, 24, "Materialansatz gemäß LV"));
    }
    else if (family === "rohrleitung") {
        lines.push(mk("Personal", "P-ROHRBAU-KOLONNE", "Rohrbaukolonne", "h", qpu(0.065 * factor), 56, "Rohr/Formstück verlegen und dichten"));
        lines.push(mk("Maschinen", "M-BAGGER-8T", "Bagger 8 t", "h", qpu(0.030 * factor), 78, "Heben, Ausrichten, Verfüllen im Rohrbereich"));
        lines.push(mk("Material", "MAT-ROHR-FORMTEIL", "Rohr/Formstück/Armatur", unit, qty, 45, "Material gemäß LV-Text"));
        lines.push(mk("Zeit / Leistung", "Z-LEISTUNG-ROHRBAU", "Leistung Rohrbau", "m/Tag", Math.max(20, dailyOutput), 0, "Produktivitätsansatz"));
    }
    else if (family === "kabel") {
        lines.push(mk("Personal", "P-KABELBAU", "Kabelbaukolonne", "h", qpu(0.040 * factor), 54, "Schutzrohr/Kabel/Speedpipe verlegen"));
        lines.push(mk("Maschinen", "M-MINIBAGGER", "Minibagger", "h", qpu(0.018 * factor), 68, "Unterstützung Kabelbau"));
        lines.push(mk("Material", "MAT-KABELBAU", "Kabelbau-Material", unit, qty, 8, "Material gemäß LV-Text"));
        lines.push(mk("Zeit / Leistung", "Z-LEISTUNG-KABELBAU", "Leistung Kabelbau", "m/Tag", Math.max(80, dailyOutput), 0, "Produktivitätsansatz"));
    }
    else if (family === "wanderweg_wiederherstellen") {
        lines.push(mk("Personal", "P-WANDERWEG", "Tiefbauer / Wegebaukolonne", "h", qpu(0.050 * factor), 54, "Wanderweg profilgerecht wiederherstellen"));
        lines.push(mk("Maschinen", "M-MINIBAGGER-RADLADER", "Minibagger / Radlader", "h", qpu(0.030 * factor), 76, "Material verteilen, profilieren"));
        lines.push(mk("Maschinen", "M-RUETTELPLATTE", "Rüttelplatte / Walze klein", "h", qpu(0.018 * factor), 42, "Wegematerial verdichten"));
        lines.push(mk("Material", "MAT-WEGEMATERIAL", "Wegematerial / Kies-Schotter", unit, qty, 18, "Wanderwegmaterial gemäß LV, kein Asphalt/Pflaster-Fallback"));
        lines.push(mk("LKW / Transport", "LKW-WEGEMATERIAL", "Transport Wegematerial", "h", qpu(0.020 * distanceFactor), 118, "Anlieferung / Umsetzen Wegematerial"));
    }
    else if (family === "oberflaeche") {
        lines.push(mk("Personal", "P-OBERFLAECHE", "Straßenbauer / Pflasterer", "h", qpu(0.055 * factor), 54, "Oberfläche herstellen / aufnehmen"));
        lines.push(mk("Maschinen", "M-SCHNEIDGERAET", "Schneid-/Verdichtungsgerät", "h", qpu(0.025 * factor), 44, "Schneiden, Einbauen, Verdichten"));
        lines.push(mk("Material", "MAT-OBERFLAECHE", "Oberflächenmaterial", unit, qty, 32, "Asphalt/Pflaster/Bord gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-OBERFLAECHE", "Transport Oberfläche", "h", qpu(0.020 * distanceFactor), 118, "Anlieferung / Abfuhr"));
    }
    else if (family === "wasserhaltung") {
        lines.push(mk("Personal", "P-WASSERHALTUNG", "Facharbeiter Wasserhaltung", "h", qpu(0.04 * factor), 54, "Einrichten, kontrollieren, umsetzen"));
        lines.push(mk("Maschinen", "M-PUMPE", "Pumpe / Zubehör", "h", unit.toLowerCase() === "h" ? qty : qpu(0.04), 34, "Pumpenbetrieb"));
        lines.push(mk("Material", "MAT-SCHLAUCH", "Schläuche / Ableitung", "psch", Math.max(1, qty), 45, "Nebenmaterial Wasserhaltung"));
    }
    else if (family === "zaunbau") {
        lines.push(mk("Personal", "P-ZAUNBAU", "Zaunbaukolonne / Landschaftsbau", "h", qpu(0.050 * factor), 52, "Zaunlinie herstellen, Pfosten setzen, Draht/Netz montieren"));
        lines.push(mk("Maschinen", "M-ERDBOHRER", "Erdbohrer / Kleingerät", "h", qpu(0.015 * factor), 42, "Pfostenlöcher herstellen / Montagehilfe"));
        lines.push(mk("Material", "MAT-ZAUN", "Zaunmaterial / Pfosten / Draht", unit, qty, 18, "Zaunmaterial gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-ZAUN", "Transport Zaunmaterial", "h", qpu(0.015 * distanceFactor), 110, "An-/Abtransport Zaunmaterial"));
    }
    else if (family === "schutzmassnahme") {
        lines.push(mk("Personal", "P-SCHUTZ", "Facharbeiter Schutzmaßnahme", "h", qpu(0.05 * factor), 52, "Schutz herstellen, vorhalten, abbauen"));
        lines.push(mk("Material", "MAT-SCHUTZ", "Schutzmaterial", unit, qty, 18, "Material gemäß LV"));
        lines.push(mk("LKW / Transport", "LKW-SCHUTZ", "Transport Schutzmaterial", "h", qpu(0.015 * distanceFactor), 110, "An-/Abtransport"));
    }
    else if (family === "material") {
        lines.push(mk("Material", "MAT-LV", "Material / Zulage gemäß LV", unit, qty, 10, "Materialpreis oder Zulage aus LV-Text prüfen"));
        lines.push(mk("LKW / Transport", "LKW-LIEFERUNG", "Lieferung / Transport", "h", qpu(0.01 * distanceFactor), 110, "Liefer-/Transportanteil"));
        lines.push(mk("Personal", "P-EINBAU", "Einbau / Montage", "h", qpu(0.015 * factor), 52, "Einbauanteil soweit im LV enthalten"));
    }
    if (!lines.some((x) => x.group === "Personal") && family !== "material") {
        lines.unshift(mk("Personal", "P-TIEFBAU", "Tiefbauer", "h", Math.max(0.02, qty / Math.max(dailyOutput, 1)), 52, "Arbeitszeitansatz"));
    }
    lines.push(mk("Zuschläge", "Z-GEMEINKOSTEN", "Baustellengemeinkosten", "%", 1, 10, "10 % Zuschlag"));
    lines.push(mk("Zuschläge", "Z-RISIKO", "Risikozuschlag", "%", 1, ctx.groundwater || ctx.restricted ? 7 : 5, "Risiko abhängig von Ausführung und Randbedingungen"));
    lines.push(mk("Zuschläge", "Z-GEWINN", "Gewinnzuschlag", "%", 1, 10, "10 % Zuschlag"));
    return lines.filter((line) => n(line.price) > 0 || line.group === "Zeit / Leistung");
}
function createRlcMinimalReviewUrkalkulation(row) {
    const t = normSearch(`${row.posNr || ""} ${row.kurztext || ""} ${row.langtext || ""} ${row.einheit || ""}`);
    const external = t.includes("tuev") ||
        t.includes("abnahme") ||
        t.includes("labor") ||
        t.includes("kampfmittel") ||
        t.includes("subunternehmer") ||
        t.includes("nachunternehmer") ||
        t.includes("fremdleistung") ||
        t.includes("spezialfirma");
    const mk = (group, resourceId, name, unit, qty, price, note) => ({
        id: safeId(),
        group,
        resourceId,
        name,
        unit,
        qty: round2(Math.max(qty, 0)),
        price: round2(Math.max(price, 0)),
        note,
        aiSuggested: true
    });
    const base = external ?
        [
            mk("Fremdleistung", "FL-PRUEFEN", "Externe Spezialleistung prüfen", row.einheit || "EH", 1, 100, "Spezial-/Prüfleistung aus LV-Text, Preis fachlich prüfen"),
            mk("Personal", "P-KOORDINATION", "Koordination / Prüfung", "h", 0.25, 58, "Anfragen, Koordination, technische Kontrolle")
        ] :
        [
            mk("Personal", "P-KOORDINATION", "Tiefbau / Koordination", "h", 0.25, 54, "Mindestansatz für Ausführung/Koordination"),
            mk("Material", "MAT-LV-PRUEFEN", "Material / Leistung gemäß LV prüfen", row.einheit || "EH", 1, 10, "Fallback: LV-Text fachlich prüfen")
        ];
    base.push(mk("Zuschläge", "Z-GEMEINKOSTEN", "Baustellengemeinkosten", "%", 1, 10, "10 % Zuschlag"));
    base.push(mk("Zuschläge", "Z-RISIKO", "Risikozuschlag", "%", 1, 5, "5 % Zuschlag"));
    base.push(mk("Zuschläge", "Z-GEWINN", "Gewinnzuschlag", "%", 1, 10, "10 % Zuschlag"));
    return base;
}
function shouldNeverUseSingleFremdleistung(row) {
    return isRlcForceLocalUrkalkulation(row);
}
function recipeLinesFromServerPriceBreakdown(serverRow) {
    const pb = Array.isArray(serverRow?.priceBreakdown) ?
        serverRow.priceBreakdown :
        [];
    const menge = Math.max(n(serverRow?.menge, 1), 1);
    return pb.
        map((line) => {
        const group = priceBreakdownGroupToResourceGroup(String(line?.group || "Material"));
        const qtyPerUnit = Math.max(n(line?.qty, 1), 0.0001);
        const price = n(line?.unitPrice ?? line?.price ?? line?.total);
        return {
            id: safeId(),
            group,
            resourceId: "",
            name: normalizeText(line?.name) || "KI-Kostenansatz",
            unit: normalizeText(line?.unit) || normalizeText(serverRow?.einheit) || "EH",
            qty: round2(qtyPerUnit * menge),
            price,
            note: normalizeText(line?.note) ||
                `Server-KI / ${serverRow?.source || "openai"}`,
            aiSuggested: true
        };
    }).
        filter((line) => n(line.price) > 0);
}
function cleanRecipeLinesByWorkType(lines, workType) {
    if (workType === "unknown")
        return lines;
    return lines.filter((line) => {
        return !isForbiddenForWorkType({
            workType,
            group: line.group,
            resourceId: line.resourceId,
            name: line.name,
            note: line.note
        });
    });
}
function dispatchWorkTypeAmbiguous(detection) {
    dispatchActiveKiSuggestion({
        id: "recipes-worktype-ambiguous",
        level: "warning",
        title: detection.title || "Leistung unklar",
        text: detection.message ||
            "Die Leistungsart ist zu ungenau. Bitte genauer beschreiben, was kalkuliert werden soll.",
        nextLabel: "Leistung klären",
        action: "focusPosition",
        autoOpen: false,
        pulse: true
    });
}
function createKiSuggestion(row, ctx) {
    const qty = Math.max(n(row.menge), 1);
    const text = normSearch(`${row.posNr} ${row.kurztext} ${row.langtext}`);
    const rlcFamilyDirect = detectRlcUrkalkulationFamilyV4(row);
    // RLC V6: if the X83/LV position belongs to a known Tiefbau family,
    // use the family Urkalkulation immediately. This prevents later generic
    // keyword blocks from misclassifying Rohrgrabenaushub as Mutterboden
    // just because the Langtext contains words like Humus.
    const directFallback = createRlcFallbackUrkalkulation(row, ctx);
    if (directFallback.length) {
        console.warn("[Recipes KI] Direct RLC family fallback used.", {
            posNr: row.posNr,
            kurztext: row.kurztext,
            family: rlcFamilyDirect,
            count: directFallback.length
        });
        return directFallback;
    }
    const isMutterbodenAbtrag = text.includes("mutterboden") ||
        text.includes("oberboden") ||
        text.includes("humus") ||
        text.includes("humusmiete") ||
        text.includes("grasnarbe") ||
        (text.includes("abtrag") || text.includes("boden abtragen") || text.includes("boden aufnehmen") || text.includes("boden lagern")) && (text.includes("oberboden") || text.includes("mutterboden") || text.includes("humus"));
    if (isMutterbodenAbtrag) {
        const depthM = 0.15;
        const widthM = 6;
        const qtyM3 = row.einheit === "m" ? qty * widthM * depthM : qty;
        const disposalTons = round2(qtyM3 * 1.6);
        return [
            {
                id: safeId(),
                group: "Personal",
                resourceId: "P-FACHARBEITER-TIEFBAU",
                name: "Facharbeiter Tiefbau",
                unit: "h",
                qty: 0.035,
                price: 52,
                note: "Mutterboden abtragen, einweisen, profilgerecht arbeiten",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "Maschinen",
                resourceId: "M-BAGGER-8T",
                name: "Bagger 8 t",
                unit: "h",
                qty: 0.030,
                price: 78,
                note: "Oberboden/Mutterboden abtragen und seitlich lagern",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "LKW / Transport",
                resourceId: "LKW-4A",
                name: "LKW 4-Achser",
                unit: "h",
                qty: 0.020,
                price: 118,
                note: "Transport innerhalb Baufeld / Lagerfläche",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "Entsorgung",
                resourceId: "E-MUTTERBODEN-LAGERN",
                name: "Mutterboden lagern / behandeln",
                unit: "t",
                qty: row.einheit === "m" ? round2(disposalTons / qty) : 1.6,
                price: 12,
                note: "Humushaltiges Material lagern bzw. verwerten",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "Zeit / Leistung",
                resourceId: "Z-LEISTUNG",
                name: "Leistung / Produktivität",
                unit: "m/Tag",
                qty: 80,
                price: 0,
                note: "Leistungsansatz für Mutterbodenabtrag",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "Zuschläge",
                resourceId: "Z-GEMEINKOSTEN",
                name: "Baustellengemeinkosten",
                unit: "%",
                qty: 1,
                price: 10,
                note: "10 % Zuschlag",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "Zuschläge",
                resourceId: "Z-RISIKO",
                name: "Risikozuschlag",
                unit: "%",
                qty: 1,
                price: 5,
                note: "Boden, Lagerung, Feuchte",
                aiSuggested: true
            },
            {
                id: safeId(),
                group: "Zuschläge",
                resourceId: "Z-GEWINN",
                name: "Gewinnzuschlag",
                unit: "%",
                qty: 1,
                price: 10,
                note: "Gewinnzuschlag",
                aiSuggested: true
            }
        ];
    }
    const calcText = normSearch(`${row.posNr} ${row.kurztext}`);
    const technicalPosition = detectTechnicalPosition({
        posNr: row.posNr || "",
        kurztext: row.kurztext || "",
        langtext: row.langtext || "",
        einheit: row.einheit || ""
    });
    const detectedWorkType = technicalPosition ?
        {
            key: technicalPosition.workType,
            confidence: 0.99,
            ambiguous: false,
            title: technicalPosition.title,
            message: `Technische Position erkannt: ${technicalPosition.title}`
        } :
        detectWorkType({
            posNr: row.posNr || "",
            kurztext: row.kurztext || "",
            langtext: row.langtext || "",
            einheit: row.einheit || ""
        });
    if (detectedWorkType.ambiguous || detectedWorkType.key === "unknown") {
        const fallback = createRlcFallbackUrkalkulation(row, ctx);
        if (fallback.length) {
            console.warn("[Recipes KI] WorkType unknown/ambiguous, using RLC fallback Urkalkulation.", {
                posNr: row.posNr,
                kurztext: row.kurztext,
                family: detectRlcUrkalkulationFamilyV4(row),
                count: fallback.length
            });
            return fallback;
        }
        const minimal = createRlcMinimalReviewUrkalkulation(row);
        console.warn("[Recipes KI] No technical family found. Using minimal review Urkalkulation.", {
            posNr: row.posNr,
            kurztext: row.kurztext,
            count: minimal.length
        });
        return minimal;
    }
    const workType = detectedWorkType.key;
    const isPlanie = workType === "planie";
    const asphaltAmbiguous = text.includes("asphalt") &&
        !text.includes("herstellen") &&
        !text.includes("wiederherstellen") &&
        !text.includes("einbauen") &&
        !text.includes("asphaltieren") &&
        !text.includes("fras") &&
        !text.includes("fräs") &&
        !text.includes("abfräsen") &&
        !text.includes("aufbruch") &&
        !text.includes("ausbauen") &&
        !text.includes("abbruch") &&
        !text.includes("entfernen");
    if (asphaltAmbiguous) {
        dispatchActiveKiSuggestion({
            id: "recipes-asphalt-ambiguous",
            level: "warning",
            title: "Asphalt-Leistung unklar",
            text: "Ich erkenne Asphalt, aber nicht eindeutig ob Asphalt hergestellt, wiederhergestellt, gefräst, ausgebaut oder entsorgt werden soll. Bitte Kurztext präzisieren oder KI-Klärung starten.",
            nextLabel: "Leistung klären",
            action: "clarifyWorkIntent",
            autoOpen: false,
            pulse: true
        });
        return [];
    }
    const depthFactor = ctx.depthM >= 2.0 ? 1.55 : ctx.depthM >= 1.5 ? 1.32 : ctx.depthM >= 1.2 ? 1.14 : 1;
    const soilFactor = ctx.soilClass === "7" ?
        1.55 :
        ctx.soilClass === "6" ?
            1.38 :
            ctx.soilClass === "5" ?
                1.24 :
                ctx.soilClass === "4" ?
                    1.12 :
                    1;
    const restrictionFactor = ctx.restricted ? 1.28 : 1;
    const waterFactor = ctx.groundwater ? 1.25 : 1;
    const trafficFactor = ctx.trafficControl ? 1.12 : 1;
    const distanceFactor = ctx.distanceKm > 30 ? 1.08 : ctx.distanceKm > 15 ? 1.04 : 1;
    const factor = depthFactor *
        soilFactor *
        restrictionFactor *
        waterFactor *
        trafficFactor *
        distanceFactor;
    let dailyOutput = Math.max(n(ctx.dailyOutput), 1);
    if (technicalPosition && n(ctx.dailyOutput) <= 0) {
        dailyOutput = technicalPosition.defaultDailyOutput;
    }
    if (dailyOutput <= 1) {
        if (isPlanie)
            dailyOutput = 180;
        else if (workType === "auffuellung")
            dailyOutput = 70;
        else if (workType === "kies_tragschicht" || workType === "frostschutz")
            dailyOutput = 85;
        else if (workType === "pflaster_verlegen")
            dailyOutput = 28;
        else if (workType === "asphalt_fraesen")
            dailyOutput = 250;
        else if (workType === "asphalt_herstellen")
            dailyOutput = 120;
        else if (workType === "leitung_graben")
            dailyOutput = 35;
        else if (workType === "bordstein")
            dailyOutput = 45;
        else if (workType === "entsorgung")
            dailyOutput = 80;
        else
            dailyOutput = 35;
    }
    const days = Math.max(qty / dailyOutput, 0.15);
    const lines = [];
    const isRohrgrabenTiefbau = text.includes("rohrgrabenaushub") ||
        text.includes("rohrgraben") ||
        text.includes("leitungsgraben") ||
        text.includes("grabentiefe") ||
        text.includes("bodenklasse") ||
        text.includes("bd-kl");
    if (isRohrgrabenTiefbau) {
        const depthFactor = ctx.depthM >= 2.5 ? 1.35 : ctx.depthM >= 1.5 ? 1.18 : 1.0;
        const soilFactor = /bk\s*[5-7]|bd-kl\.\s*[5-7]|bodenklasse\s*[5-7]/i.test(`${row.kurztext} ${row.langtext}`) ?
            1.25 :
            1.0;
        const distanceFactor = Math.max(1, Math.min(1.35, 1 + n(ctx.distanceKm) / 120));
        const dailyOutput = Math.max(n(ctx.dailyOutput), ctx.depthM >= 2.5 ? 45 : 65);
        const days = Math.max(qty / dailyOutput, 0.15);
        const factor = depthFactor * soilFactor;
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.05 * factor), "Rohrgraben herstellen / Tiefbaukolonne", true));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.75 * factor), "Einweisen, sichern, Nacharbeit", true));
        lines.push(makeLine(ctx.depthM >= 2.5 ? "M-BAGGER-22T" : ctx.depthM >= 1.5 ? "M-BAGGER-15T" : "M-BAGGER-8T", round2(days * 6.8 * factor), "Rohrgrabenaushub lösen und laden", true));
        lines.push(makeLine("T-LKW-4A", round2(days * 3.8 * distanceFactor), "Aushubtransport", true));
        lines.push(makeLine("E-BODEN", round2(qty * 1.6), "Aushubmaterial entsorgen / verwerten", true));
        lines.push(makeLine("Z-LEISTUNG", dailyOutput, "Leistung je Arbeitstag", true));
        lines.push(makeLine("Z-BAUZEIT", round2(days), "rechnerische Bauzeit", true));
        lines.push(makeLine("Z-GEMEINKOSTEN", 1, "10 % aus technischem Preisaufbau", true));
        lines.push(makeLine("Z-RISIKO", 1, soilFactor > 1 ? "erhöht wegen Bodenklasse / Tiefe" : "normaler Risikopuffer", true));
        lines.push(makeLine("Z-GEWINN", 1, "Gewinnzuschlag", true));
        return lines;
    }
    /* ✅ FIX: Planie/Feinplanum ist eine leichte Flächenleistung.
       Nicht als Aushub, Kiestragschicht, Entsorgung oder m²-Stunden-Mix kalkulieren. */
    if (isPlanie) {
        const planieDailyOutput = Math.max(n(ctx.dailyOutput), 180); // m²/Tag Default
        const planieDays = Math.max(qty / planieDailyOutput, 0.12);
        lines.push(makeLine("P-FACHARBEITER", round2(Math.max(planieDays * 5.5 * factor, 2.5)), "Planie / Feinplanum herstellen, Höhenkontrolle, Nacharbeiten"));
        lines.push(makeLine("M-RADLADER", round2(Math.max(planieDays * 2.2 * factor, 1.0)), "Profilieren, Verteilen, Abziehen"));
        lines.push(makeLine("M-WALZE", round2(Math.max(planieDays * 1.5, 0.8)), "Verdichtung / Nachverdichtung nach Erfordernis"));
        if (ctx.restricted) {
            lines.push(makeLine("P-HELFER", round2(Math.max(planieDays * 2.0 * factor, 0.75)), "Unterstützung bei eingeschränktem Arbeitsraum"));
        }
        lines.push({ ...makeLine("Z-LEISTUNG", planieDailyOutput, "Leistung je Arbeitstag", true), price: 0 });
        lines.push({ ...makeLine("Z-BAUZEIT", round2(planieDays), "rechnerische Bauzeit", true), price: 0 });
        lines.push(makeLine("Z-GEMEINKOSTEN", 1, "Baustellengemeinkosten / Organisation", true));
        lines.push(makeLine("Z-RISIKO", 1, ctx.groundwater ? "erhöht wegen Grundwasser / Erschwernis" : "normaler Risikopuffer", true));
        lines.push(makeLine("Z-GEWINN", 1, "Gewinnzuschlag", true));
        // ✅ Sicherheitskorrektur: Planie/Feinplanum darf niemals Material-/Entsorgungs-/Transportaufbau bekommen.
        // Planie ist keine Frostschutzschicht, keine Auskofferung und keine Entsorgung.
        if (isPlanie) {
            const cleaned = lines.filter((line) => {
                const g = String(line.group || "");
                const t = normSearch(`${line.name || ""} ${line.note || ""} ${line.resourceId || ""}`);
                if (g === "Material")
                    return false;
                if (g === "Entsorgung")
                    return false;
                if (g === "LKW / Transport")
                    return false;
                if (t.includes("frostschutz"))
                    return false;
                if (t.includes("splitt"))
                    return false;
                if (t.includes("kies"))
                    return false;
                if (t.includes("aushub"))
                    return false;
                if (t.includes("auskoffer"))
                    return false;
                if (t.includes("entsorg"))
                    return false;
                if (t.includes("transport"))
                    return false;
                return true;
            });
            const hasPersonal = cleaned.some((x) => x.group === "Personal");
            const hasMachine = cleaned.some((x) => x.group === "Maschinen");
            if (!hasPersonal) {
                cleaned.unshift(makeLine("P-FACHARBEITER", round2(Math.max(qty / Math.max(n(ctx.dailyOutput), 180) * 5.5, 2.5)), "Planie / Feinplanum herstellen, Höhenkontrolle, Nacharbeiten"));
            }
            if (!hasMachine) {
                cleaned.splice(1, 0, makeLine("M-RADLADER", round2(Math.max(qty / Math.max(n(ctx.dailyOutput), 180) * 2.2, 1.0)), "Profilieren, Abziehen, leichte Nachverdichtung"));
            }
            return cleaned;
        }
        return cleanRecipeLinesByWorkType(lines, workType);
    }
    if (false) {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.45 * factor), "Planie / Feinplanum herstellen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.25 * factor), "Unterstützung Höhenkontrolle / Nacharbeit"));
        lines.push(makeLine("M-RADLADER", round2(days * 2.0 * factor), "Profilieren / Abziehen"));
        lines.push(makeLine("M-WALZE", round2(days * 1.8), "Verdichtung / Nachverdichtung"));
    }
    if (workType === "auffuellung") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.65 * factor), "Auffüllung lagenweise herstellen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.35 * factor), "Unterstützung Einbau / Kontrolle"));
        lines.push(makeLine("M-RADLADER", round2(days * 4.0 * factor), "Material verteilen"));
        lines.push(makeLine("M-WALZE", round2(days * 3.0), "lagenweise Verdichtung"));
        lines.push(makeLine("T-LKW-4A", round2(days * 2.5 * distanceFactor), "Materialtransport"));
    }
    if (workType === "kies_tragschicht" || workType === "frostschutz") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.55 * factor), "Tragschicht / Frostschutz herstellen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.30 * factor), "Einbaukontrolle / Unterstützung"));
        lines.push(makeLine("M-RADLADER", round2(days * 4.2 * factor), "Material verteilen"));
        lines.push(makeLine("M-WALZE", round2(days * 3.0), "Verdichtung"));
        lines.push(makeLine("MAT-FROSTSCHUTZ-032", qty, "Frostschutzkies / Schotter / Tragschichtmaterial"));
        lines.push(makeLine("T-LKW-4A", round2(days * 3.0 * distanceFactor), "Anlieferung Material"));
    }
    if (workType === "pflaster_verlegen") {
        const isNatur = text.includes("naturstein");
        const is10 = text.includes("10 cm") || text.includes("10cm");
        const mat = isNatur ? "MAT-PFLASTER-NATUR" : is10 ? "MAT-PFLASTER-BETON-10" : "MAT-PFLASTER-BETON-8";
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.25 * factor), "Pflasterfläche herstellen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.95 * factor), "Material verteilen, schneiden, verfugen"));
        lines.push(makeLine("M-RUETTELPLATTE", round2(days * 2.7), "Abrütteln der Pflasterfläche"));
        lines.push(makeLine("M-PFLASTERKNACKER", round2(days * 1.35), "Pflaster schneiden / Randanpassung"));
        lines.push(makeLine(mat, qty, "Pflastersteine liefern"));
        lines.push(makeLine("MAT-SPLITT", round2(qty * 0.045), "Splittbett"));
        lines.push(makeLine("MAT-FUGENSAND", qty, "Fugen verfüllen"));
        lines.push(makeLine("T-LKW-4A", round2(days * 1.8 * distanceFactor), "Materialtransport"));
    }
    if (workType === "asphalt_fraesen") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.45 * factor), "Fräsarbeiten überwachen / einmessen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.30 * factor), "Absicherung / Reinigung"));
        lines.push(makeLine("M-FUGENSCHNEIDER", round2(days * 1.2), "Anschlusskanten schneiden"));
        lines.push(makeLine("M-RADLADER", round2(days * 2.5 * factor), "Fräsgut laden / Fläche reinigen"));
        lines.push(makeLine("T-LKW-4A", round2(days * 3.5 * distanceFactor), "Fräsgut abfahren"));
        lines.push(makeLine("E-ASPHALT", round2(qty * 0.18), "Asphaltfräsgut entsorgen / verwerten"));
    }
    if (workType === "asphalt_herstellen") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.75 * factor), "Asphaltfläche herstellen / wiederherstellen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.45 * factor), "Einbaukontrolle / Unterstützung"));
        lines.push(makeLine("M-RADLADER", round2(days * 4.5 * factor), "Asphalt / Material verteilen"));
        lines.push(makeLine("M-WALZE", round2(days * 3.0), "Verdichtung Asphalt"));
        lines.push(makeLine("M-FUGENSCHNEIDER", round2(days * 1.2), "Anschlusskanten schneiden"));
        lines.push(makeLine("MAT-ASPHALT", qty, "Asphalttragschicht / Asphaltdeckschicht"));
        lines.push(makeLine("T-LKW-4A", round2(days * 2.2 * distanceFactor), "Asphalttransport"));
    }
    if (workType === "auskofferung") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.85 * factor), "Auskofferung / Erdarbeiten"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.45 * factor), "Einweisen / Sichern / Nacharbeit"));
        lines.push(makeLine(ctx.depthM > 1.35 ? "M-BAGGER-15T" : "M-BAGGER-8T", round2(days * 5.5 * factor), "Aushub lösen und laden"));
        lines.push(makeLine("T-LKW-4A", round2(days * 3.5 * distanceFactor), "Aushubtransport"));
        lines.push(makeLine("E-BODEN", round2(qty * Math.max(ctx.depthM || 1, 0.3) * 1.6), "Aushubmaterial entsorgen / verwerten"));
    }
    if (workType === "leitung_graben") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.55 * factor), "Kolonne Tiefbau / Leitungsbau"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 1.05 * factor), "Einbau, Verdichtung, Unterstützung"));
        lines.push(makeLine(ctx.depthM > 1.8 ? "M-BAGGER-22T" : ctx.depthM > 1.35 ? "M-BAGGER-15T" : "M-BAGGER-8T", round2(days * 6.8 * factor), "Graben herstellen"));
        lines.push(makeLine("M-RUETTELPLATTE", round2(days * 3.2), "Verdichtung lagenweise"));
        lines.push(makeLine("T-LKW-4A", round2(days * 4.0 * distanceFactor), "Abfuhr / Anlieferung"));
        lines.push(makeLine("MAT-SAND", round2(qty * 0.22 * Math.max(ctx.depthM || 1, 0.8)), "Bettung / Leitungszone"));
        if (calcText.includes("speedpipe")) {
            lines.push(makeLine("MAT-SPEEDPIPE", qty, "Speedpipe gemäß Position"));
            lines.push(makeLine("MAT-WARNBAND", qty, "Warnband / Trassenband"));
        }
        else if ((calcText.includes("rohr verlegen") || calcText.includes("leitung verlegen") || calcText.includes("kabelschutzrohr") || calcText.includes("rohrleitung")) && !calcText.includes("leitungsgraben")) {
            lines.push(makeLine("MAT-ROHR", qty, "Rohr / Leitung gemäß Position"));
            lines.push(makeLine("MAT-WARNBAND", qty, "Warnband / Trassenband"));
        }
    }
    if (workType === "bordstein") {
        const mat = text.includes("hochbord") ?
            "MAT-BORD-HOCH" :
            text.includes("rundbord") ?
                "MAT-BORD-RUND" :
                "MAT-BORD-TIEF";
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.2 * factor), "Bordstein setzen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.75 * factor), "Aushub, Beton, Ausrichten"));
        lines.push(makeLine("M-MINIBAGGER", round2(days * 2.0 * factor), "Aushub Bordsteinrinne"));
        lines.push(makeLine(mat, qty, "Bordstein liefern"));
        lines.push(makeLine("MAT-BETON-C20", round2(qty * 0.055), "Fundament und Rückenstütze"));
        lines.push(makeLine("T-LKW-3A", round2(days * 1.2 * distanceFactor), "Materialtransport"));
    }
    if (workType === "schacht_setzen") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 1.0 * factor), "Schacht setzen / anschließen"));
        lines.push(makeLine("P-HELFER", round2(days * 8 * 0.7 * factor), "Unterstützung Schachteinbau"));
        lines.push(makeLine("M-BAGGER-8T", round2(days * 4.0 * factor), "Schachtgrube / Einbau"));
        lines.push(makeLine("MAT-SCHACHT", Math.max(qty, 1), "Schacht / Formteil"));
    }
    if (workType === "entsorgung") {
        lines.push(makeLine("P-FACHARBEITER", round2(days * 8 * 0.25 * factor), "Entsorgung organisieren / Nachweis"));
        lines.push(makeLine("M-RADLADER", round2(days * 2.5 * factor), "Material laden"));
        lines.push(makeLine("T-LKW-4A", round2(days * 4.0 * distanceFactor), "Transport Entsorgung"));
        lines.push(makeLine(text.includes("asphalt") ? "E-ASPHALT" : text.includes("pflaster") ? "E-ALTPFLASTER" : "E-BODEN", qty, "Entsorgung / Verwertung"));
    }
    if (isPlanie) {
        for (let i = lines.length - 1; i >= 0; i--) {
            const g = lines[i]?.group;
            const name = normSearch(`${lines[i]?.name || ""} ${lines[i]?.note || ""}`);
            if (g === "Material" ||
                g === "Entsorgung" ||
                g === "LKW / Transport" ||
                name.includes("frostschutz") ||
                name.includes("splitt") ||
                name.includes("aushub") ||
                name.includes("entsorg")) {
                lines.splice(i, 1);
            }
        }
    }
    lines.push({ ...makeLine("Z-LEISTUNG", dailyOutput, "Leistung je Arbeitstag", true), price: 0 });
    lines.push({ ...makeLine("Z-BAUZEIT", round2(days), "rechnerische Bauzeit", true), price: 0 });
    lines.push(makeLine("Z-GEMEINKOSTEN", 1, "Baustellengemeinkosten / Organisation", true));
    lines.push(makeLine("Z-RISIKO", 1, ctx.groundwater ? "erhöht wegen Grundwasser / Erschwernis" : "normaler Risikopuffer", true));
    lines.push(makeLine("Z-GEWINN", 1, "Gewinnzuschlag", true));
    // ✅ Sicherheitskorrektur: Planie/Feinplanum darf niemals Material-/Entsorgungs-/Transportaufbau bekommen.
    // Planie ist keine Frostschutzschicht, keine Auskofferung und keine Entsorgung.
    if (isPlanie) {
        const cleaned = lines.filter((line) => {
            const g = String(line.group || "");
            const t = normSearch(`${line.name || ""} ${line.note || ""} ${line.resourceId || ""}`);
            if (g === "Material")
                return false;
            if (g === "Entsorgung")
                return false;
            if (g === "LKW / Transport")
                return false;
            if (t.includes("frostschutz"))
                return false;
            if (t.includes("splitt"))
                return false;
            if (t.includes("kies"))
                return false;
            if (t.includes("aushub"))
                return false;
            if (t.includes("auskoffer"))
                return false;
            if (t.includes("entsorg"))
                return false;
            if (t.includes("transport"))
                return false;
            return true;
        });
        const hasPersonal = cleaned.some((x) => x.group === "Personal");
        const hasMachine = cleaned.some((x) => x.group === "Maschinen");
        if (!hasPersonal) {
            cleaned.unshift(makeLine("P-FACHARBEITER", round2(Math.max(qty / Math.max(n(ctx.dailyOutput), 180) * 5.5, 2.5)), "Planie / Feinplanum herstellen, Höhenkontrolle, Nacharbeiten"));
        }
        if (!hasMachine) {
            cleaned.splice(1, 0, makeLine("M-RADLADER", round2(Math.max(qty / Math.max(n(ctx.dailyOutput), 180) * 2.2, 1.0)), "Profilieren, Abziehen, leichte Nachverdichtung"));
        }
        return cleaned;
    }
    return cleanRecipeLinesByWorkType(lines, workType);
}
/* ================= PRICE BREAKDOWN ================= */
function mapDirectGroup(group) {
    if (group === "Personal")
        return "Personal";
    if (group === "Maschinen")
        return "Maschinen";
    if (group === "LKW / Transport")
        return "LKW / Transport";
    if (group === "Material")
        return "Material";
    if (group === "Entsorgung")
        return "Entsorgung";
    if (group === "Fremdleistung")
        return "Fremdleistung";
    if (group === "Gemeinkosten")
        return "Gemeinkosten";
    if (group === "Risiko")
        return "Risiko";
    if (group === "Gewinn")
        return "Gewinn";
    return null;
}
function recipeCostTotals(lines, menge) {
    const qtyDivisor = Math.max(n(menge), 1);
    const base = directTotal(lines);
    const materialTotal = lines.filter((x) => x.group === "Material").reduce((s, x) => s + lineTotal(x), 0);
    const laborTotal = lines.filter((x) => x.group === "Personal").reduce((s, x) => s + lineTotal(x), 0);
    const machineTotal = lines.filter((x) => x.group === "Maschinen").reduce((s, x) => s + lineTotal(x), 0);
    const transportTotal = lines.filter((x) => x.group === "LKW / Transport").reduce((s, x) => s + lineTotal(x), 0);
    const disposalTotal = lines.filter((x) => x.group === "Entsorgung").reduce((s, x) => s + lineTotal(x), 0);
    const subcontractorTotal = lines.filter((x) => x.group === "Fremdleistung").reduce((s, x) => s + lineTotal(x), 0);
    const directOverheadTotal = lines.filter((x) => x.group === "Gemeinkosten").reduce((s, x) => s + lineTotal(x), 0);
    const directRiskTotal = lines.filter((x) => x.group === "Risiko").reduce((s, x) => s + lineTotal(x), 0);
    const directProfitTotal = lines.filter((x) => x.group === "Gewinn").reduce((s, x) => s + lineTotal(x), 0);
    const overheadPct = lines.filter((x) => x.resourceId === "Z-GEMEINKOSTEN").reduce((s, x) => s + n(x.price), 0);
    const riskPct = lines.filter((x) => x.resourceId === "Z-RISIKO").reduce((s, x) => s + n(x.price), 0);
    const profitPct = lines.filter((x) => x.resourceId === "Z-GEWINN").reduce((s, x) => s + n(x.price), 0);
    const surchargeBase = materialTotal + laborTotal + machineTotal + transportTotal + disposalTotal + subcontractorTotal;
    const overheadTotal = round2(directOverheadTotal + surchargeBase * (overheadPct / 100));
    const riskTotal = round2(directRiskTotal + surchargeBase * (riskPct / 100));
    const profitTotal = round2(directProfitTotal + surchargeBase * (profitPct / 100));
    return {
        base,
        materialTotal,
        laborTotal,
        machineTotal,
        transportTotal,
        disposalTotal,
        subcontractorTotal,
        overheadPct,
        riskPct,
        profitPct,
        overheadTotal,
        riskTotal,
        profitTotal,
        materialCost: round2(materialTotal / qtyDivisor),
        laborCost: round2(laborTotal / qtyDivisor),
        machineCost: round2(machineTotal / qtyDivisor),
        subcontractorCost: round2(subcontractorTotal / qtyDivisor),
        disposalCost: round2(disposalTotal / qtyDivisor),
        transportCost: round2(transportTotal / qtyDivisor),
        overheadCost: round2(overheadTotal / qtyDivisor),
        riskCost: round2(riskTotal / qtyDivisor),
        profitCost: round2(profitTotal / qtyDivisor)
    };
}
function buildPriceBreakdown(lines, row) {
    const menge = Math.max(n(row?.menge), 1);
    const totals = recipeCostTotals(lines, menge);
    const unit = row?.einheit || "EH";
    const direct = lines.
        filter((line) => line.group !== "Zeit / Leistung" && line.group !== "Zuschläge").
        map((line) => {
        const mapped = mapDirectGroup(line.group) || "Material";
        const totalWholePosition = lineTotal(line);
        const qtyPerUnit = round2(n(line.qty) / menge);
        const totalPerUnit = round2(totalWholePosition / menge);
        return {
            id: safeId(),
            group: mapped,
            name: line.name,
            unit: line.unit,
            qty: qtyPerUnit,
            price: n(line.price),
            total: totalPerUnit,
            note: line.note
        };
    }).
        filter((line) => line.total > 0);
    const hasDirectOverhead = direct.some((x) => x.group === "Gemeinkosten");
    const hasDirectRisk = direct.some((x) => x.group === "Risiko");
    const hasDirectProfit = direct.some((x) => x.group === "Gewinn");
    if (totals.overheadTotal > 0 && !hasDirectOverhead) {
        direct.push({
            id: safeId(),
            group: "Gemeinkosten",
            name: `Baustellengemeinkosten ${num(totals.overheadPct, 2)} %`,
            unit,
            qty: 1,
            price: round2(totals.overheadTotal / menge),
            total: round2(totals.overheadTotal / menge),
            note: "aus Zuschlag berechnet"
        });
    }
    if (totals.riskTotal > 0 && !hasDirectRisk) {
        direct.push({
            id: safeId(),
            group: "Risiko",
            name: `Risikozuschlag ${num(totals.riskPct, 2)} %`,
            unit,
            qty: 1,
            price: round2(totals.riskTotal / menge),
            total: round2(totals.riskTotal / menge),
            note: "aus Zuschlag berechnet"
        });
    }
    if (totals.profitTotal > 0 && !hasDirectProfit) {
        direct.push({
            id: safeId(),
            group: "Gewinn",
            name: `Gewinnzuschlag ${num(totals.profitPct, 2)} %`,
            unit,
            qty: 1,
            price: round2(totals.profitTotal / menge),
            total: round2(totals.profitTotal / menge),
            note: "aus Zuschlag berechnet"
        });
    }
    return direct;
}
function breakdownText(lines) {
    return lines.
        map((line) => `${line.group}: ${line.name} · ${num(line.qty, 2)} ${line.unit} × ${money(line.price)} = ${money(line.total)}`).
        join("\n");
}
function isGenericLangtext(value) {
    const text = normSearch(value);
    if (!text)
        return true;
    const genericPhrases = [
        "leistung fachgerecht ausfuhren",
        "leistung fachgerecht ausführen",
        "einschliesslich aller erforderlichen nebenleistungen",
        "einschließlich aller erforderlichen nebenleistungen",
        "material personal maschinen transport",
        "baustellenorganisation dokumentation und abrechnung"
    ];
    return genericPhrases.some((x) => text.includes(normSearch(x)));
}
function isAmbiguousSmartDraft(draft) {
    const text = normSearch(`${draft.kurztext || ""} ${draft.langtext || ""}`);
    const words = text.split(" ").filter(Boolean);
    if (words.length > 3)
        return false;
    const ambiguous = [
        "asphalt",
        "pflaster",
        "kies",
        "schotter",
        "leitung",
        "rohr",
        "graben",
        "planie",
        "aushub",
        "bordstein",
        "frostschutz"
    ];
    return ambiguous.some((x) => text === x || text === `${x} herstellen`);
}
function dispatchAmbiguousSmartDraft(draft) {
    const text = String(draft.kurztext || "Leistung").trim();
    dispatchActiveKiSuggestion({
        id: "recipes-ambiguous-worktype",
        level: "warning",
        title: "Leistung präzisieren",
        text: `"${text}" ist zu ungenau. Bitte genauer angeben, was gemeint ist, z. B. Asphalt fräsen, Asphalt herstellen, Asphalt aufnehmen, Asphalttragschicht, Asphaltdeckschicht, Pflaster verlegen, Kies einbauen, Leitung verlegen oder Graben herstellen.`,
        nextLabel: "Positionsdaten prüfen",
        action: "focusPosition",
        autoOpen: false,
        pulse: true
    });
}
function isAmbiguousSmartDraftHard(draft) {
    const kurz = normSearch(draft.kurztext || "").trim();
    const lang = normSearch(draft.langtext || "").trim();
    const text = `${kurz} ${lang}`.trim();
    if (!kurz)
        return true;
    // Nur exakt zu kurze/generische Einzelbegriffe blockieren.
    const ambiguousExact = new Set([
        "asphalt",
        "pflaster",
        "kies",
        "schotter",
        "leitung",
        "rohr",
        "graben",
        "erde",
        "boden",
        "material",
        "aushub"
    ]);
    if (ambiguousExact.has(kurz))
        return true;
    // Diese Begriffe sind schon fachlich spezifisch genug und dürfen NICHT blockieren.
    const specificSignals = [
        "asphalttragschicht",
        "asphaltdeckschicht",
        "asphaltbinderschicht",
        "asphalt frasen",
        "asphalt fräsen",
        "asphalt herstellen",
        "asphalt einbauen",
        "asphalt aufnehmen",
        "asphalt schneiden",
        "asphalt wiederherstellen",
        "pflaster aufnehmen",
        "pflaster verlegen",
        "pflaster herstellen",
        "kiestragschicht",
        "schottertragschicht",
        "frostschutzschicht",
        "planie herstellen",
        "feinplanum herstellen",
        "leitung verlegen",
        "graben herstellen",
        "rohrleitung verlegen",
        "speedpipe verlegen"
    ];
    if (specificSignals.some((x) => text.includes(normSearch(x))))
        return false;
    // Wenn nur 1 Wort oder extrem kurzer Text vorhanden ist, muss die KI nachfragen.
    const words = kurz.split(" ").filter(Boolean);
    if (words.length <= 1 && kurz.length < 14)
        return true;
    return false;
}
function ambiguousSmartDraftMessage(draft) {
    const kurz = String(draft.kurztext || "Leistung").trim();
    if (normSearch(kurz).includes("asphalt")) {
        return `"${kurz}" ist zu ungenau. Bitte auswählen/beschreiben: Asphalt fräsen, Asphalt aufnehmen/abbrechen, Asphalttragschicht einbauen, Asphaltdeckschicht einbauen, Asphaltfläche herstellen oder Asphalt wiederherstellen.`;
    }
    if (normSearch(kurz).includes("pflaster")) {
        return `"${kurz}" ist zu ungenau. Bitte genauer beschreiben: Pflaster aufnehmen, Pflaster neu verlegen, Bettung herstellen, Fugen verfüllen oder Fläche wiederherstellen.`;
    }
    if (normSearch(kurz).includes("kies") || normSearch(kurz).includes("schotter") || normSearch(kurz).includes("frostschutz")) {
        return `"${kurz}" ist zu ungenau. Bitte genauer beschreiben: Frostschutz liefern und einbauen, Kiestragschicht herstellen, Splittbettung herstellen oder Material nur liefern.`;
    }
    return `"${kurz}" ist zu ungenau. Bitte die Leistung genauer beschreiben, bevor KI-Langtext, Ressourcen und EP berechnet werden.`;
}
function dispatchAmbiguousSmartDraftHard(draft) {
    dispatchActiveKiSuggestion({
        id: "recipes-ambiguous-hard-stop",
        level: "warning",
        title: "Leistung präzisieren",
        text: ambiguousSmartDraftMessage(draft),
        nextLabel: "Positionsdaten prüfen",
        action: "focusPosition",
        autoOpen: false,
        pulse: true
    });
}
function detectSmartWorkType(draft) {
    const text = normSearch(`${draft.posNr || ""} ${draft.kurztext || ""} ${draft.langtext || ""}`);
    if (text.includes("leitungsgraben") ||
        text.includes("graben herstellen") ||
        text.includes("kabelgraben") ||
        text.includes("rohrgraben") ||
        text.includes("trasse herstellen")) {
        return "leitung_graben";
    }
    if (text.includes("leitungsgraben") ||
        text.includes("graben herstellen") ||
        text.includes("kabelgraben") ||
        text.includes("rohrgraben") ||
        text.includes("trasse herstellen")) {
        return "leitung_graben";
    }
    if (text.includes("asphalt") && (text.includes("fras") || text.includes("fräs") || text.includes("abfräsen"))) {
        return "asphalt_fraesen";
    }
    if (text.includes("auskofferung") ||
        text.includes("auskoffern") ||
        text.includes("aushub") ||
        text.includes("baugrube") ||
        text.includes("erdarbeiten")) {
        return "auskofferung";
    }
    if (text.includes("planie") ||
        text.includes("planum") ||
        text.includes("feinplanum") ||
        text.includes("untergrund profilieren") ||
        text.includes("untergrund herstellen")) {
        return "planie";
    }
    if (text.includes("auffullung") ||
        text.includes("auffüllung") ||
        text.includes("verfullung") ||
        text.includes("verfüllung") ||
        text.includes("einbauen und verdichten") ||
        text.includes("verfuellen") ||
        text.includes("verfüllen")) {
        return "auffuellung";
    }
    if (text.includes("kies") ||
        text.includes("schotter") ||
        text.includes("tragschicht") ||
        text.includes("frostschutz") ||
        text.includes("mineralgemisch")) {
        return text.includes("frostschutz") ? "frostschutz" : "kies_tragschicht";
    }
    if (text.includes("pflaster") ||
        text.includes("verbundstein") ||
        text.includes("betonstein") ||
        text.includes("naturstein") ||
        text.includes("rasengitter")) {
        return "pflaster_verlegen";
    }
    if (text.includes("bord") || text.includes("randstein") || text.includes("einfassung")) {
        return "bordstein";
    }
    if (text.includes("asphalt")) {
        return "asphalt_herstellen";
    }
    if (text.includes("leitung") ||
        text.includes("rohr") ||
        text.includes("speedpipe") ||
        text.includes("kabel") ||
        text.includes("graben") ||
        text.includes("trasse")) {
        return "leitung_graben";
    }
    if (text.includes("schacht") || text.includes("schachtbauwerk") || text.includes("kontrollschacht")) {
        return "schacht_setzen";
    }
    if (text.includes("entsorgung") ||
        text.includes("abfahren") ||
        text.includes("deponie") ||
        text.includes("verwertung") ||
        text.includes("aufbruch entsorgen")) {
        return "entsorgung";
    }
    return "standard";
}
function buildSmartLocalLangtext(draft, ctx) {
    const unit = draft.einheit || inferUnitFromText(draft.kurztext) || "EH";
    const qty = n(draft.menge, 1);
    const title = String(draft.kurztext || "Leistung").trim();
    const workType = detectSmartWorkType(draft);
    const soil = String(ctx.soilClass || "").trim() ?
        `Bodenklasse BK ${ctx.soilClass}` :
        "Bodenklasse gemäß örtlicher Feststellung";
    const depth = n(ctx.depthM) > 0 ? `Ausführungstiefe / Grabentiefe ca. ${ctx.depthM} m.` : "";
    const distance = n(ctx.distanceKm) > 0 ? `Transportansatz / Entfernung zur Baustelle ca. ${ctx.distanceKm} km.` : "";
    const daily = n(ctx.dailyOutput) > 0 ? `Kalkulierter Leistungsansatz ca. ${ctx.dailyOutput} ${unit}/Tag.` : "";
    const extras = [
        ctx.restricted ? "Eingeschränkter Arbeitsraum ist berücksichtigt." : "",
        ctx.groundwater ? "Erschwernisse durch Grundwasser sind zu berücksichtigen." : "",
        ctx.trafficControl ? "Verkehrssicherung und Baustellenabsicherung sind einzukalkulieren." : "",
        ctx.asphalt ? "Asphaltflächen beziehungsweise gebundene Oberflächen sind betroffen." : ""
    ].
        filter(Boolean).join(" ");
    const params = [depth, soil + ".", distance, daily, extras].filter(Boolean).join(" ");
    if (workType === "auskofferung") {
        return `Auskofferung beziehungsweise Erdarbeiten für "${title}" fachgerecht ausführen. Einschließlich Lösen, Laden, profilgerechtem Herstellen der Aushubfläche oder Baugrube, seitlichem Lagern oder Abfahren des Aushubmaterials, Herstellen der erforderlichen Arbeitsräume, Sichern der Arbeitsstelle sowie aller erforderlichen Nebenleistungen.

${params}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
    }
    if (workType === "planie") {
        return `Planie beziehungsweise Feinplanum für "${title}" fachgerecht herstellen. Einschließlich Vorbereiten des Untergrundes, Lösen kleiner Unebenheiten, profil- und höhengerechtem Abziehen, Verdichten nach Erfordernis, Herstellen der geforderten Ebenheit und Tragfähigkeit sowie Kontrolle der Höhenlage.

${params}

Abrechnung nach tatsächlich hergestellter und prüfbarer Menge in ${unit}.`;
    }
    if (workType === "auffuellung") {
        return `Auffüllung beziehungsweise Verfüllung für "${title}" fachgerecht herstellen. Einschließlich Liefern oder Übernehmen des geeigneten Materials, lagenweisem Einbau, profilgerechtem Verteilen, Verdichten nach technischen Anforderungen, Anschluss an Bestand sowie aller Nebenleistungen für Personal, Geräte, Transport und Baustellenorganisation.

${params}

Abrechnung nach tatsächlich eingebauter und verdichteter Menge in ${unit}.`;
    }
    if (workType === "kies_tragschicht" || workType === "frostschutz") {
        return `Kies-, Schotter-, Frostschutz- beziehungsweise Tragschicht für "${title}" fachgerecht herstellen. Einschließlich Liefern des geeigneten Materials, profilgerechtem Einbau, lagenweisem Verteilen, Verdichten, Herstellen der geforderten Tragfähigkeit, Höhenkontrolle und Anschluss an angrenzende Bereiche.

${params}

Abrechnung nach tatsächlich eingebauter und verdichteter Menge in ${unit}.`;
    }
    if (workType === "pflaster_verlegen") {
        return `Pflasterfläche beziehungsweise Steinbelag für "${title}" fachgerecht herstellen. Einschließlich Prüfen und Vorbereiten des Untergrundes, Herstellen oder Ergänzen der Tragschicht, Herstellen der Bettung, Liefern und Verlegen der Steine, Schneiden und Anpassen in Rand- und Anschlussbereichen, höhengerechtem Anschluss an Bestand, Abrütteln sowie Verfüllen der Fugen.

${params}

Abrechnung nach tatsächlich ausgeführter Fläche beziehungsweise Menge in ${unit}.`;
    }
    if (workType === "asphalt_fraesen") {
        return `Asphaltfläche für "${title}" fachgerecht fräsen beziehungsweise aufnehmen. Einschließlich Einrichten und Sichern der Arbeitsstelle, Fräsen der gebundenen Schicht in der erforderlichen Stärke, Laden des Fräsgutes, Abfahren beziehungsweise Verwertung/Entsorgung, Reinigen der Fläche sowie Vorbereiten für den weiteren Aufbau.

${params}

Abrechnung nach tatsächlich gefräster und prüfbarer Menge in ${unit}.`;
    }
    if (workType === "asphalt_herstellen") {
        return `Asphaltfläche für "${title}" fachgerecht herstellen beziehungsweise wiederherstellen. Einschließlich Schneiden oder Vorbereiten der Anschlusskanten, Herstellen des tragfähigen Untergrundes, Einbau der Asphaltschicht, Verdichtung, höhengerechtem Anschluss an Bestand, Oberflächenherstellung sowie aller Nebenleistungen.

${params}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
    }
    if (workType === "leitung_graben") {
        return `Leitungsgraben beziehungsweise Trasse für "${title}" fachgerecht herstellen und bearbeiten. Einschließlich Aushub, Sicherung des Grabens, Herstellen der Leitungszone, Bettung, Verlegen beziehungsweise Vorbereiten der Leitung/Speedpipe/Kabeltrasse, Warnband oder Trassenkennzeichnung, Verfüllen und lagenweisem Verdichten nach technischem Erfordernis.

${params}

Abrechnung nach tatsächlich ausgeführter Länge beziehungsweise Menge in ${unit}.`;
    }
    if (workType === "schacht_setzen") {
        return `Schacht beziehungsweise Formteil für "${title}" fachgerecht einbauen. Einschließlich Herstellen der Baugrube, Bettung, Setzen, Ausrichten, Anschließen, Abdichten, Verfüllen, Verdichten, Anschluss an Bestand sowie aller erforderlichen Nebenleistungen.

${params}

Abrechnung nach tatsächlich eingebauter Stückzahl beziehungsweise Menge in ${unit}.`;
    }
    if (workType === "entsorgung") {
        return `Material für "${title}" fachgerecht aufnehmen, laden, transportieren und entsorgen beziehungsweise verwerten. Einschließlich Sortieren nach Materialart, Laden, Transport, Deponie-/Entsorgungsgebühren soweit zutreffend, Nachweisführung sowie Reinigung der Arbeitsstelle.

${params}

Abrechnung nach tatsächlich entsorgter beziehungsweise verwerteter Menge in ${unit}.`;
    }
    if (workType === "bordstein") {
        return `Bordstein, Randstein beziehungsweise Einfassung für "${title}" fachgerecht setzen. Einschließlich Aushub, Herstellen des Fundaments, Liefern und Setzen der Bauteile, höhen- und fluchtgerechtem Ausrichten, Herstellen der Rückenstütze, Schneiden und Anpassen, Verfugen sowie Wiederherstellung angrenzender Bereiche.

${params}

Abrechnung nach tatsächlich gesetzter Länge beziehungsweise Menge in ${unit}.`;
    }
    return `${title} fachgerecht gemäß Leistungsverzeichnis und örtlichen Erfordernissen ausführen. Einschließlich Arbeitsvorbereitung, Einrichten und Sichern der Arbeitsstelle, Bereitstellung von Personal, Maschinen und Material, fachgerechter Ausführung, Nebenleistungen, Transport, Dokumentation und Übergabe der prüfbaren Leistung.

${params}

Abrechnung nach tatsächlich ausgeführter und prüfbarer Menge in ${unit}.`;
}
function getSmartLangtextAuthToken() {
    try {
        const keys = ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token", "rlc_access_token"];
        for (const key of keys) {
            const v = localStorage.getItem(key);
            if (v && v.trim())
                return v.trim();
        }
    }
    catch {
        //
    }
    return "";
}
async function tryServerSmartLangtext(draft, ctx, localFallback) {
    const base = String(import.meta?.env?.VITE_API_URL ||
        import.meta?.env?.VITE_BACKEND_URL ||
        "").replace(/\/+$/, "");
    if (!base)
        return "";
    const token = getSmartLangtextAuthToken();
    const payload = {
        task: "generate_tiefbau_langtext",
        instruction: "Erzeuge einen professionellen, positionsbezogenen deutschen Langtext für ein Tiefbau-Leistungsverzeichnis. Nicht generisch schreiben. Nutze Kurztext, Menge, Einheit und Ausführungsparameter.",
        draft,
        context: ctx,
        localFallback
    };
    const endpoints = [
        "/api/kalkulation/ki/langtext",
        "/api/ki/langtext",
        "/api/support/chat"
    ];
    for (const endpoint of endpoints) {
        try {
            const body = endpoint === "/api/support/chat" ?
                {
                    message: `${payload.instruction}\n\nKurztext: ${draft.kurztext}\nEinheit: ${draft.einheit}\nMenge: ${draft.menge}\nTiefe: ${ctx.depthM} m\nBodenklasse: ${ctx.soilClass}\nEntfernung: ${ctx.distanceKm} km\nLeistung/Tag: ${ctx.dailyOutput}\n\nBitte nur den fertigen Langtext ausgeben.`,
                    page: "kalkulation-rezepte",
                    module: "Urkalkulation",
                    context: payload
                } :
                payload;
            const res = await fetch(`${base}${endpoint}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(body)
            });
            if (!res.ok)
                continue;
            const json = await res.json().catch(() => null);
            const text = String(json?.langtext ||
                json?.text ||
                json?.answer ||
                json?.message ||
                json?.result ||
                "").trim();
            if (text.length > 80 && !isGenericLangtext(text))
                return text;
        }
        catch {
            //
        }
    }
    return "";
}
function dispatchActiveKiSuggestion(detail) {
    window.dispatchEvent(new CustomEvent("rlc:active-ki-suggestion", {
        detail: {
            ...detail,
            module: "kalkulation",
            pageKey: "kalkulation-rezepte",
            eventName: "rlc:rezepte-command"
        }
    }));
}
function clearActiveKiSuggestion() {
    window.dispatchEvent(new CustomEvent("rlc:active-ki-clear"));
}
function parseCmFromText(text, keys, fallbackCm) {
    const t = normSearch(text);
    for (const key of keys) {
        const k = normSearch(key);
        const rx = new RegExp(`${k}[^0-9]{0,20}(\\d+(?:[,.]\\d+)?)\\s*cm`);
        const m = t.match(rx);
        if (m?.[1])
            return n(m[1], fallbackCm);
    }
    return fallbackCm;
}
function detectCompositeSplitSuggestions(row) {
    const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
    const baseQty = Math.max(n(row?.menge, 1), 1);
    const unit = String(row?.einheit || "").trim();
    if (unit !== "m²" && unit !== "m2")
        return [];
    const hasComposite = (text.includes("mit") || text.includes("inkl") || text.includes("einschl")) && (text.includes("pflaster") ||
        text.includes("planie") ||
        text.includes("auskoffer") ||
        text.includes("fsk") ||
        text.includes("frostschutz") ||
        text.includes("splitt") ||
        text.includes("sandbett") ||
        text.includes("bettung") ||
        text.includes("aufnehmen") ||
        text.includes("entsorgen"));
    if (!hasComposite)
        return [];
    const out = [];
    if (text.includes("pflaster") && (text.includes("aufnehmen") || text.includes("ausbauen") || text.includes("entfernen"))) {
        out.push({
            kurztext: "Pflasterfläche aufnehmen",
            langtext: "Pflasterfläche fachgerecht aufnehmen. Einschließlich Lösen, Aufnehmen, seitlichem Lagern oder Laden sowie Reinigung der Arbeitsfläche.",
            einheit: "m²",
            menge: baseQty,
            preis: 18,
            leistungsart: "pflaster_aufnehmen"
        });
    }
    if (text.includes("pflaster") && (text.includes("entsorgen") || text.includes("abfahren"))) {
        out.push({
            kurztext: "Altpflaster / Bettungsmaterial entsorgen",
            langtext: "Altpflaster beziehungsweise Bettungsmaterial laden, abfahren und fachgerecht entsorgen oder verwerten. Einschließlich Transport, Entsorgungsgebühren und Nachweisführung.",
            einheit: "t",
            menge: round2(baseQty * 0.22),
            preis: 44,
            leistungsart: "pflaster_entsorgung"
        });
    }
    if (text.includes("sandbett") || text.includes("bettung")) {
        out.push({
            kurztext: "Sandbettung aufnehmen und entsorgen",
            langtext: "Vorhandene Sandbettung aufnehmen, laden, abfahren und fachgerecht entsorgen oder verwerten. Einschließlich Reinigung und Vorbereitung des Untergrundes.",
            einheit: "t",
            menge: round2(baseQty * 0.09),
            preis: 44,
            leistungsart: "bettung_entsorgung"
        });
    }
    if (text.includes("auskoffer")) {
        const cm = parseCmFromText(text, ["auskofferung", "auskoffern", "aushub"], 35);
        const m3 = round2(baseQty * (cm / 100));
        out.push({
            kurztext: `Auskofferung ${cm} cm herstellen`,
            langtext: `Auskofferung in einer Stärke von ca. ${cm} cm fachgerecht ausführen. Einschließlich Lösen, Laden, profilgerechtem Herstellen der Aushubfläche, seitlichem Lagern oder Abfahren des Aushubmaterials sowie aller Nebenleistungen.`,
            einheit: "m³",
            menge: m3,
            preis: 45,
            leistungsart: "auskofferung"
        });
    }
    if (text.includes("planie") || text.includes("planum")) {
        out.push({
            kurztext: "Planie / Feinplanum herstellen",
            langtext: "Planie beziehungsweise Feinplanum fachgerecht herstellen. Einschließlich profil- und höhengerechtem Abziehen, Verdichten nach Erfordernis und Kontrolle der Höhenlage.",
            einheit: "m²",
            menge: baseQty,
            preis: 4.5,
            leistungsart: "planie"
        });
    }
    if (text.includes("fsk") || text.includes("frostschutz")) {
        const cm = parseCmFromText(text, ["fsk", "frostschutz", "frostschutzschicht"], 20);
        out.push({
            kurztext: `Frostschutzschicht ${cm} cm herstellen`,
            langtext: `Frostschutzschicht in einer Stärke von ca. ${cm} cm fachgerecht herstellen. Einschließlich Liefern, profilgerechtem Einbau, lagenweisem Verdichten und Höhenkontrolle.`,
            einheit: "m²",
            menge: baseQty,
            preis: round2(12 + cm * 0.75),
            leistungsart: "frostschutz"
        });
    }
    if (text.includes("splitt")) {
        const cm = parseCmFromText(text, ["splitt", "splittbett"], 5);
        out.push({
            kurztext: `Splittbett ${cm} cm herstellen`,
            langtext: `Splittbett in einer Stärke von ca. ${cm} cm fachgerecht herstellen. Einschließlich Liefern, Verteilen, Abziehen und Vorbereiten für die Pflasterverlegung.`,
            einheit: "m²",
            menge: baseQty,
            preis: round2(4 + cm * 0.7),
            leistungsart: "splittbett"
        });
    }
    const isPflasterRueckbau = text.includes("aufnehmen") ||
        text.includes("ausbauen") ||
        text.includes("entfernen") ||
        text.includes("abbrechen") ||
        text.includes("entsorgen") ||
        text.includes("abfahren");
    if (text.includes("pflaster") && !isPflasterRueckbau) {
        out.push({
            kurztext: "Pflasterfläche herstellen",
            langtext: "Pflasterfläche fachgerecht herstellen. Einschließlich Liefern und Verlegen der Pflastersteine, Schneiden und Anpassen, Abrütteln, Verfugen sowie Anschluss an Bestand.",
            einheit: "m²",
            menge: baseQty,
            preis: 55,
            leistungsart: "pflaster_verlegen"
        });
    }
    return out.length >= 2 ? out : [];
}
function buildCompositeSplitLvRows(row, existing) {
    const suggestions = detectCompositeSplitSuggestions(row);
    if (!suggestions.length)
        return [];
    const basePos = String(row.posNr || "POS").trim() || "POS";
    const now = new Date().toISOString();
    return suggestions.map((s, idx) => {
        const posNr = `${basePos}.${String(idx + 1).padStart(2, "0")}`;
        const preis = s.preis;
        return {
            id: safeId(),
            posNr,
            kurztext: s.kurztext,
            langtext: s.langtext,
            einheit: s.einheit,
            menge: s.menge,
            preis,
            gesamt: round2(s.menge * preis),
            waehrung: "EUR",
            source: "rezept",
            materialCost: round2(preis * 0.45),
            laborCost: round2(preis * 0.25),
            machineCost: round2(preis * 0.15),
            subcontractorCost: 0,
            disposalCost: s.leistungsart === "auskofferung" ? round2(preis * 0.15) : 0,
            overheadCost: round2(preis * 0.08),
            riskCost: round2(preis * 0.03),
            profitCost: round2(preis * 0.04),
            baseUnitPrice: preis,
            suggestedUnitPrice: preis,
            finalUnitPrice: preis,
            riskLevel: "medium",
            calculationStatus: "warning",
            gewerk: "Tiefbau / Straßenbau",
            leistungsart: s.leistungsart,
            bauverfahren: s.kurztext,
            warning: "Automatisch aus zusammengesetzter Position erzeugt. Bitte Menge und EP prüfen.",
            aiReason: "Die ursprüngliche Position enthielt mehrere technische Leistungen. Diese wurden in prüfbare Einzelpositionen aufgeteilt.",
            priceBreakdown: [],
            createdAt: now,
            updatedAt: now
        };
    }).filter((p) => !existing.some((e) => String(e.posNr || "") === String(p.posNr || "")));
}
function detectSurfaceFollowUp(row) {
    const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
    const isTrench = text.includes("leitungsgraben") ||
        text.includes("graben herstellen") ||
        text.includes("kabelgraben") ||
        text.includes("rohrgraben") ||
        text.includes("trasse herstellen");
    if (!isTrench)
        return null;
    const hasSurface = text.includes("oberflache") ||
        text.includes("oberfläche") ||
        text.includes("belag") ||
        text.includes("wiederherstellen");
    if (!hasSurface)
        return null;
    if (text.includes("asphalt")) {
        return {
            surface: "asphalt",
            kurztext: "Asphaltfläche nach Leitungsgraben wiederherstellen",
            langtext: "Asphaltfläche nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich Vorbereiten und Reinigen der Anschlusskanten, Herstellen des tragfähigen Untergrundes, Einbau der erforderlichen Asphaltschicht, Verdichtung, höhengerechtem Anschluss an Bestand sowie aller Nebenleistungen. Breite und Schichtaufbau sind projektbezogen zu prüfen.",
            einheit: "m²",
            preis: 65
        };
    }
    if (text.includes("pflaster") || text.includes("platten") || text.includes("verbundstein")) {
        return {
            surface: "pflaster",
            kurztext: "Pflasterfläche nach Leitungsgraben wiederherstellen",
            langtext: "Pflasterfläche nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich Herstellen beziehungsweise Ergänzen der Tragschicht, Splittbett, Verlegen der Pflastersteine, Schneiden und Anpassen, Abrütteln, Verfugen und höhengerechtem Anschluss an Bestand. Breite und vorhandenes Material sind projektbezogen zu prüfen.",
            einheit: "m²",
            preis: 58
        };
    }
    if (text.includes("schotter") || text.includes("kies") || text.includes("mineralgemisch")) {
        return {
            surface: "schotter",
            kurztext: "Schotterfläche nach Leitungsgraben wiederherstellen",
            langtext: "Schotter- beziehungsweise Kiesfläche nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich Liefern und Einbauen geeigneten Materials, profilgerechtem Verteilen, Verdichten und Anschluss an Bestand. Schichtdicke und Körnung sind projektbezogen zu prüfen.",
            einheit: "m²",
            preis: 28
        };
    }
    if (text.includes("grun") || text.includes("grün") || text.includes("rasen") || text.includes("bankett")) {
        return {
            surface: "gruen",
            kurztext: "Grünfläche nach Leitungsgraben wiederherstellen",
            langtext: "Grünfläche beziehungsweise Bankett nach Leitungsgraben fachgerecht wiederherstellen. Einschließlich profilgerechtem Auffüllen, Andecken mit Oberboden, Planieren, Ansaat beziehungsweise Wiederherstellung nach örtlichem Erfordernis.",
            einheit: "m²",
            preis: 12
        };
    }
    return null;
}
function nextSurfaceFollowUpPosNr(basePosNr, existing) {
    const base = String(basePosNr || "OW").trim() || "OW";
    for (let i = 1; i <= 20; i++) {
        const candidate = `${base}.OW${i}`;
        if (!existing.some((r) => String(r.posNr || "") === candidate))
            return candidate;
    }
    return `${base}.OW${Date.now()}`;
}
function detectSurfaceWidthM(row) {
    const text = normSearch(`${row?.kurztext || ""} ${row?.langtext || ""}`);
    const patterns = [
        /(?:oberflache|oberfläche|belag|wiederherstellung|asphalt|pflaster).*?(?:breite|b)\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*m/,
        /(?:breite|b)\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*m/,
        /(\d+(?:[,.]\d+)?)\s*m\s*(?:breit|breite)/
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            const width = n(match[1]);
            if (width >= 0.2 && width <= 5)
                return width;
        }
    }
    if (text.includes("gehweg"))
        return 0.8;
    if (text.includes("strasse") || text.includes("straße"))
        return 1.0;
    if (text.includes("asphalt"))
        return 0.6;
    if (text.includes("pflaster"))
        return 0.6;
    if (text.includes("schotter") || text.includes("kies"))
        return 0.7;
    if (text.includes("grun") || text.includes("grün") || text.includes("rasen") || text.includes("bankett"))
        return 0.8;
    return 0.6;
}
function calcSurfaceFollowUpMenge(row) {
    const length = Math.max(n(row?.menge, 1), 1);
    const unit = String(row?.einheit || "").trim();
    if (unit === "m²")
        return round2(length);
    if (unit === "m")
        return round2(length * detectSurfaceWidthM(row));
    return round2(length);
}
function buildSurfaceFollowUpLv(row, existing) {
    const suggestion = detectSurfaceFollowUp(row);
    if (!suggestion)
        return null;
    const now = new Date().toISOString();
    const menge = calcSurfaceFollowUpMenge(row);
    const preis = suggestion.preis;
    return {
        id: safeId(),
        posNr: nextSurfaceFollowUpPosNr(String(row.posNr || ""), existing),
        kurztext: suggestion.kurztext,
        langtext: suggestion.langtext,
        einheit: suggestion.einheit,
        menge,
        preis,
        gesamt: round2(menge * preis),
        waehrung: "EUR",
        source: "rezept",
        materialCost: round2(preis * 0.55),
        laborCost: round2(preis * 0.18),
        machineCost: round2(preis * 0.12),
        subcontractorCost: 0,
        disposalCost: 0,
        overheadCost: round2(preis * 0.08),
        riskCost: round2(preis * 0.03),
        profitCost: round2(preis * 0.04),
        baseUnitPrice: preis,
        suggestedUnitPrice: preis,
        finalUnitPrice: preis,
        riskLevel: "medium",
        calculationStatus: "warning",
        gewerk: suggestion.surface === "asphalt" ? "Straßenbau / Asphaltbau" : "Oberflächenwiederherstellung",
        leistungsart: `oberflaeche_${suggestion.surface}_wiederherstellen`,
        bauverfahren: suggestion.kurztext,
        warning: `Automatisch erkannte Folgeposition. Menge wurde aus Grabenlänge × angenommener Oberflächenbreite ${detectSurfaceWidthM(row)} m berechnet. Bitte prüfen.`,
        aiReason: "Die Hauptposition enthält eine Oberfläche im Bereich eines Leitungsgrabens. Deshalb wurde eine separate Wiederherstellungsposition vorgeschlagen.",
        priceBreakdown: [
            {
                id: safeId(),
                group: "Material",
                name: suggestion.kurztext,
                unit: suggestion.einheit,
                qty: 1,
                price: preis,
                total: preis,
                note: "Richtwert für automatische Folgeposition"
            }
        ],
        createdAt: now,
        updatedAt: now
    };
}
/* ================= EXPORT ================= */
function exportCsv(lines, row, total, ep) {
    const priceBreakdown = buildPriceBreakdown(lines, row);
    const header = ["Gruppe", "Ressource", "Einheit", "Menge", "Preis", "Gesamt", "Hinweis"];
    const body = lines.map((r) => [r.group, r.name, r.unit, String(r.qty).replace(".", ","), String(r.price).replace(".", ","), String(lineTotal(r)).replace(".", ","), r.note].
        map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).
        join(";"));
    body.push(["", "", "", "", "Gesamt", String(total).replace(".", ","), ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
    body.push(["", "", "", "", "EP", String(ep).replace(".", ","), ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
    body.push(["", "", "", "", "Preisaufbau", breakdownText(priceBreakdown), ""].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob([[header.join(";"), ...body].join("\n")], {
        type: "text/csv;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Ressourcen_Kalkulation_${row?.posNr || "Position"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
function exportPdf(opts) {
    const { projectTitle, projectPlace, row, ctx, lines, total, ep } = opts;
    const priceBreakdown = buildPriceBreakdown(lines, row);
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 14;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.rect(10, 10, pageW - 20, 277);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("RLC Bausoftware", marginX, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Urkalkulation / Rezeptkalkulation", marginX, 28);
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, 34, pageW - marginX, 34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text("Kalkulationsrezept", marginX, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Projekt: ${projectTitle}`, marginX, 58, { maxWidth: 130 });
    doc.text(`Datum: ${todayDE()}`, 150, 58);
    if (projectPlace)
        doc.text(`Ort: ${projectPlace}`, marginX, 65, { maxWidth: 130 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Position: ${row?.posNr || "—"} · ${row?.kurztext || "—"}`, marginX, 78, {
        maxWidth: 180
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Menge: ${num(row?.menge, 3)} ${row?.einheit || ""} · Tiefe: ${ctx.depthM} m · Entfernung: ${ctx.distanceKm} km · Bodenklasse: ${ctx.soilClass}`, marginX, 86);
    autoTable(doc, {
        startY: 96,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        head: [["Gruppe", "Ressource", "ME", "Menge", "EP", "Gesamt", "Hinweis"]],
        body: lines.map((r) => [
            r.group,
            r.name,
            r.unit,
            r.unit === "%" ? "" : num(r.qty, 2),
            r.unit === "%" ? `${num(r.price, 2)} %` : money(r.price),
            r.unit === "%" ? "—" : money(lineTotal(r)),
            r.note || ""
        ]),
        styles: {
            font: "helvetica",
            fontSize: 7.8,
            cellPadding: 1.8,
            overflow: "linebreak",
            lineColor: [226, 232, 240],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [239, 246, 255],
            textColor: [30, 58, 138],
            fontStyle: "bold"
        }
    });
    const y1 = doc.lastAutoTable?.finalY + 8 || 180;
    autoTable(doc, {
        startY: y1,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        head: [["Preisaufbau", "Bezeichnung", "ME", "Menge", "Preis", "Gesamt"]],
        body: priceBreakdown.map((r) => [r.group, r.name, r.unit, num(r.qty, 2), money(r.price), money(r.total)]),
        styles: {
            font: "helvetica",
            fontSize: 7.4,
            cellPadding: 1.7,
            overflow: "linebreak",
            lineColor: [226, 232, 240],
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [240, 253, 244],
            textColor: [21, 128, 61],
            fontStyle: "bold"
        }
    });
    const y = doc.lastAutoTable?.finalY + 10 || 240;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(115, y, 80, 34, 3, 3, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Gesamt netto", 120, y + 9);
    doc.text("EP kalkuliert", 120, y + 18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(money(total), 190, y + 9, { align: "right" });
    doc.text(money(ep), 190, y + 18, { align: "right" });
    saveRlcPdfWithCompanyHeader(doc, `Rezeptkalkulation_${row?.posNr || "Position"}.pdf`);
}
/* ================= COMPONENT ================= */
export default function Recipes() {
    const navigate = useNavigate();
    const nav = useNavigate();
    const projectCtx = useProject();
    const project = getProject(projectCtx);
    const projectKey = getProjectKey(project);
    const projectTitle = getProjectTitle(project);
    const projectPlace = getProjectPlace(project);
    const libraryImportRef = useRef(null);
    const recipeContext = useMemo(() => {
        try {
            const raw = sessionStorage.getItem(RECIPE_CONTEXT_KEY);
            const parsed = JSON.parse(raw || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        }
        catch {
            return {};
        }
    }, []);
    const [lvRows, setLvRows] = useState(() => LV.list());
    const [selectedId, setSelectedId] = useState("");
    const [query, setQuery] = useState("");
    const [draftPos, setDraftPos] = useState(() => makeDefaultDraft());
    const [ctx, setCtx] = useState({
        depthM: 0,
        distanceKm: 0,
        soilClass: "3",
        restricted: false,
        groundwater: false,
        asphalt: false,
        trafficControl: false,
        dailyOutput: 0
    });
    const [lines, setLines] = useState([]);
    const [info, setInfo] = useState("");
    const [globalUrkModalOpen, setGlobalUrkModalOpen] = useState(false);
    const [globalUrkRunning, setGlobalUrkRunning] = useState(false);
    const [globalUrkDone, setGlobalUrkDone] = useState(false);
    const [globalUrkProgress, setGlobalUrkProgress] = useState({ done: 0, total: 0, changed: 0 });
    const [companyRecipes, setCompanyRecipes] = useState(() => loadCompanyRecipes());
    const [libraryRows, setLibraryRows] = useState(() => loadRecipeLibraryRows());
    const [libraryQuery, setLibraryQuery] = useState("");
    const [libraryGroupFilter, setLibraryGroupFilter] = useState("Alle");
    const selectedRow = useMemo(() => draftToLvPos(draftPos), [draftPos]);
    const resourceOptions = useMemo(() => {
        const libOptions = libraryRows.
            map((item) => {
            const id = libraryResourceId(item);
            const title = libraryTitle(item);
            if (!title)
                return null;
            return {
                id,
                label: `${libraryGroup(item)} · ${title}`,
                group: libraryGroup(item),
                source: "library",
                item
            };
        }).
            filter(Boolean);
        const catalogOptions = RESOURCE_CATALOG.map((item) => ({
            id: item.id,
            label: `${item.group} · ${item.name}`,
            group: item.group,
            source: "catalog",
            item
        }));
        const used = new Set();
        const out = [];
        [...catalogOptions, ...libOptions].forEach((option) => {
            if (used.has(option.id))
                return;
            used.add(option.id);
            out.push(option);
        });
        return out;
    }, [libraryRows]);
    const priceBreakdown = useMemo(() => buildPriceBreakdown(lines, selectedRow), [lines, selectedRow]);
    const filteredLv = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return lvRows;
        return lvRows.filter((r) => `${r.posNr || ""} ${r.kurztext || ""} ${r.langtext || ""}`.toLowerCase().includes(q));
    }, [lvRows, query]);
    const filteredLibraryRows = useMemo(() => {
        const q = normSearch(libraryQuery || draftPos.kurztext);
        return libraryRows.
            filter((item) => {
            const g = libraryGroup(item);
            if (libraryGroupFilter !== "Alle" && g !== libraryGroupFilter)
                return false;
            if (!q)
                return true;
            const hay = normSearch(`${libraryCode(item)} ${libraryTitle(item)} ${item.category || ""} ${item.group || ""} ${libraryUnit(item)}`);
            return q.
                split(/\s+/).
                filter(Boolean).
                every((part) => hay.includes(part));
        }).
            slice(0, 200);
    }, [libraryRows, libraryQuery, libraryGroupFilter, draftPos.kurztext]);
    const summary = useMemo(() => {
        const base = directTotal(lines);
        const surcharge = surchargePercent(lines);
        const total = totalWithSurcharges(lines);
        const ep = unitPrice(total, n(selectedRow.menge));
        return {
            base,
            surcharge,
            total,
            ep,
            gp: round2(n(selectedRow.menge) * ep),
            count: lines.length,
            ai: lines.filter((x) => x.aiSuggested).length
        };
    }, [lines, selectedRow]);
    const activeAuftragLabel = recipeContext.auftragName ?
        `${recipeContext.auftragType === "unter" ? "Unterauftrag" : "Hauptauftrag"} · ${recipeContext.auftragName}` :
        "Kein Auftrag-Kontext";
    useEffect(() => {
        setInfo(recipeContext.auftragName ?
            `Position wird für ${activeAuftragLabel} erstellt.` :
            "Neue Position wird ohne Auftrag-Kontext erstellt.");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    function refreshLibrary() {
        const next = loadRecipeLibraryRows();
        setLibraryRows(next);
        setInfo(`Bibliothek aktualisiert: ${next.length.toLocaleString("de-DE")} Einträge.`);
    }
    function importRecipeLibraryFile(file) {
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const result = importRecipeLibraryCsv(String(reader.result || ""));
                const next = loadRecipeLibraryRows();
                setLibraryRows(next);
                const imported = n(result?.imported);
                const merged = n(result?.duplicatesMerged);
                const skipped = n(result?.skipped);
                const total = n(result?.total, next.length);
                setInfo(`Bibliothek importiert: ${imported} neu, ${merged} Duplikate zusammengeführt, ${skipped} übersprungen. Gesamt: ${total}.`);
            }
            catch (e) {
                alert(`Bibliothek Import fehlgeschlagen: ${e?.message || e}`);
            }
            finally {
                if (libraryImportRef.current)
                    libraryImportRef.current.value = "";
            }
        };
        reader.readAsText(file, "utf-8");
    }
    function addLibraryItem(item) {
        const line = recipeLineFromLibrary(item);
        setLines((prev) => [...prev, line]);
        setInfo(`Bibliotheksposition übernommen: ${line.name}`);
    }
    function resetDraft() {
        setSelectedId("");
        setDraftPos(makeDefaultDraft());
        setLines([]);
        setLibraryQuery("");
        setInfo("Neue Position vorbereitet. Bitte Positionsdaten ausfüllen.");
        window.setTimeout(() => {
            document.
                getElementById("rlc-recipes-position-data")?.
                scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
    }
    function loadExistingPosition(row) {
        setSelectedId(String(row.id || ""));
        setDraftPos(draftFromLv(row));
        let nextLines = createKiSuggestion(row, ctx);
        if (!nextLines.length) {
            nextLines = createRlcMinimalReviewUrkalkulation(row);
        }
        setLines(nextLines.map((line) => ({ ...line, id: line.id || safeId() })));
        setLibraryQuery(String(row.kurztext || ""));
        const pb = buildPriceBreakdown(nextLines, row);
        const ep = round2(pb.reduce((sum, line) => sum + n(line.total), 0));
        const gp = round2(n(row.menge) * ep);
        LV.upsert({
            ...row,
            // Beim Öffnen einer Position darf Recipes den Kalkulationspreis nicht ändern.
            urkalkulationUnitPrice: ep,
            urkalkulationTotal: gp,
            preis: row.preis,
            ep: row.ep,
            finalUnitPrice: row.finalUnitPrice,
            suggestedUnitPrice: row.suggestedUnitPrice,
            rlcKiUnitPrice: row.rlcKiUnitPrice,
            gp: row.gp,
            gesamt: row.gesamt,
            totalNet: row.totalNet,
            priceBreakdown: pb,
            recipeLines: nextLines,
            source: "recipes-auto-recalc-on-load",
            calculationStatus: "recipes_ready",
            updatedAt: new Date().toISOString()
        });
        setLvRows(LV.list());
        setInfo(`Position ${row.posNr || "—"} automatisch neu berechnet: EP ${money(ep)}.`);
    }
    async function autoFillLangtext() {
        const unit = draftPos.einheit || inferUnitFromText(draftPos.kurztext);
        const draft = { ...draftPos, einheit: unit };
        if (isAmbiguousSmartDraftHard(draft)) {
            const message = "KI gestoppt: Die Position ist zu ungenau. Bitte genauer beschreiben, z. B. Asphalt fräsen, Asphalttragschicht einbauen, Pflaster aufnehmen, Pflaster neu verlegen, Kiestragschicht herstellen, Auffüllung herstellen.";
            setInfo(message);
            dispatchActiveKiSuggestion({
                id: "recipes-ambiguous-position",
                level: "warning",
                title: "Position zu ungenau",
                text: `Der Kurztext ist zu allgemein. Ich kann daraus keine sichere Urkalkulation erstellen.

Mögliche gemeinte Leistungen:
• Asphalt fräsen / abtragen
• Asphaltaufbruch aufnehmen und entsorgen
• Asphalttragschicht herstellen
• Asphaltdeckschicht herstellen
• Asphaltfläche wiederherstellen
• Anschlusskanten schneiden
• Asphalt im Leitungsgraben wiederherstellen

Bitte den Kurztext genauer formulieren, z. B. "Asphalt fräsen 4 cm", "Asphalttragschicht AC 32 herstellen" oder "Asphaltfläche nach Leitungsgraben wiederherstellen".`,
                nextLabel: "Kurztext präzisieren",
                action: "focusKurztext",
                autoOpen: false,
                pulse: true
            });
            try {
                const el = document.querySelector('input[name="kurztext"], textarea[name="kurztext"]');
                el?.focus();
            }
            catch {
                //
            }
            return;
        }
        const localLangtext = buildSmartLocalLangtext(draft, ctx) || suggestLangtextForDraft(draft, ctx);
        let finalLangtext = localLangtext;
        let usedServerKi = false;
        try {
            setInfo("KI-Langtext wird über Server/OpenAI verbessert…");
            const serverLangtext = await tryServerSmartLangtext(draft, ctx, localLangtext);
            if (serverLangtext) {
                finalLangtext = serverLangtext;
                usedServerKi = true;
            }
        }
        catch {
            //
        }
        setDraftPos({
            ...draft,
            langtext: finalLangtext
        });
        setInfo(usedServerKi ?
            "Langtext wurde über Server-KI fachlich erstellt." :
            "Langtext wurde lokal fachlich erstellt.");
        clearActiveKiSuggestion();
    }
    async function kiSuggest() {
        const errors = validateDraft(draftPos);
        if (errors.length) {
            alert(errors.join("\n"));
            return;
        }
        const withText = draftPos.langtext.trim().length > 10 ?
            draftPos :
            {
                ...draftPos,
                einheit: draftPos.einheit || inferUnitFromText(draftPos.kurztext),
                langtext: suggestLangtextForDraft(draftPos, ctx)
            };
        if (withText !== draftPos)
            setDraftPos(withText);
        const rowForCalc = draftToLvPos(withText);
        const technicalPosition = detectTechnicalPosition({
            posNr: rowForCalc.posNr,
            kurztext: rowForCalc.kurztext,
            langtext: rowForCalc.langtext,
            einheit: rowForCalc.einheit
        });
        const detectedWorkType = technicalPosition ?
            {
                key: technicalPosition.workType,
                confidence: 0.99,
                ambiguous: false,
                title: technicalPosition.title,
                message: `Technische Position erkannt: ${technicalPosition.title}`
            } :
            detectWorkType({
                posNr: rowForCalc.posNr,
                kurztext: rowForCalc.kurztext,
                langtext: rowForCalc.langtext,
                einheit: rowForCalc.einheit
            });
        const forceLocalTiefbauPosition = isRlcForceLocalUrkalkulation(rowForCalc);
        if ((detectedWorkType.ambiguous || detectedWorkType.key === "unknown") && !forceLocalTiefbauPosition) {
            const minimal = createRlcMinimalReviewUrkalkulation(rowForCalc);
            setLines(minimal);
            setInfo("Leistungsart nicht eindeutig erkannt. RLC hat eine prüfpflichtige Mindest-Urkalkulation erstellt statt leer zu bleiben.");
            console.warn("[Recipes KI] Unknown work type replaced by minimal review Urkalkulation.", {
                posNr: rowForCalc.posNr,
                kurztext: rowForCalc.kurztext,
                count: minimal.length
            });
            return;
        }
        setInfo(technicalPosition ?
            `Technische Position erkannt: ${technicalPosition.title} · Bibliothek: ${getTechnicalPositionCount()} Positionen` :
            `KI-Urkalkulation wird berechnet: ${detectedWorkType.title || detectRlcUrkalkulationFamilyV4(rowForCalc)}…`);
        console.log("[Recipes KI TRACE 1] before forceLocal", {
            posNr: rowForCalc.posNr,
            kurztext: rowForCalc.kurztext,
            langtext: rowForCalc.langtext,
            einheit: rowForCalc.einheit,
            menge: rowForCalc.menge,
            detectedWorkType: detectedWorkType.key,
            technicalPosition,
            ctx
        });
        const forceLocal = !!technicalPosition ||
            forceLocalTiefbauPosition ||
            shouldForceLocalCalculation(detectedWorkType.key);
        console.log("[Recipes KI] Urkalkulation flow", {
            posNr: rowForCalc.posNr,
            kurztext: rowForCalc.kurztext,
            detectedWorkType: detectedWorkType.key,
            hasTechnicalPosition: !!technicalPosition,
            forceLocalTiefbauPosition,
            forceLocal
        });
        // Server-Autonomous zuerst versuchen.
        // Falls Server keine echte Urkalkulation liefert, bleibt die lokale Recipes-Urkalkulation als Fallback aktiv.
        const serverRow = await postKiSuggest(projectKey, rowForCalc);
        if (serverRow?.source === "rule-engine") {
            console.warn("[Recipes KI] Rule-Engine rejected for recipe calculation:", serverRow);
            setInfo("Server-KI hat keine vollständige Urkalkulation geliefert. Es wird automatisch eine lokale professionelle Urkalkulation erstellt.");
        }
        else if (serverRow?.priceBreakdown?.length) {
            const serverLinesRaw = recipeLinesFromServerPriceBreakdown(serverRow);
            const serverLines = cleanRecipeLinesByWorkType(serverLinesRaw, detectedWorkType.key);
            const isSingleFremdleistung = serverLines.length === 1 && serverLines[0]?.group === "Fremdleistung";
            const rejectSingleFremdleistung = isSingleFremdleistung && shouldNeverUseSingleFremdleistung(rowForCalc);
            console.log("[Recipes KI] Server breakdown guard", {
                posNr: rowForCalc.posNr,
                kurztext: rowForCalc.kurztext,
                serverLineCount: serverLines.length,
                isSingleFremdleistung,
                rejectSingleFremdleistung
            });
            if (rejectSingleFremdleistung) {
                console.warn("[Recipes KI] Single-Fremdleistung rejected. Falling back to local Urkalkulation.", {
                    posNr: rowForCalc.posNr,
                    kurztext: rowForCalc.kurztext
                });
                setInfo("Server-KI hat nur eine Fremdleistung geliefert. Für diese Tiefbau-Position wird automatisch eine technische Urkalkulation erstellt.");
            }
            else if (serverLines.length) {
                setLines(serverLines);
                setInfo(`Server-KI übernommen: ${serverRow.source || "server"} · EP ${money(serverRow.finalUnitPrice || serverRow.suggestedUnitPrice)} · ${serverLines.length} Urkalkulationszeilen`);
                return;
            }
        }
        const signature = textSignature(rowForCalc);
        const saved = companyRecipes.find((r) => r.signature === signature);
        if (saved?.lines?.length) {
            setLines(saved.lines.map((x) => ({ ...x, id: safeId(), aiSuggested: true })));
            setInfo("Gespeicherte Firmen-Rezeptur angewendet und als Urkalkulation übernommen.");
            return;
        }
        console.log("[Recipes KI TRACE 2] before local createKiSuggestion", {
            posNr: rowForCalc.posNr,
            kurztext: rowForCalc.kurztext
        });
        const suggestedRaw = createKiSuggestion(rowForCalc, ctx);
        const suggested = suggestedRaw.length ? suggestedRaw : createRlcMinimalReviewUrkalkulation(rowForCalc);
        console.log("[Recipes KI TRACE 3] local createKiSuggestion result", {
            count: suggested.length,
            rawCount: suggestedRaw.length,
            groups: suggested.map((x) => x.group),
            suggested
        });
        setLines(suggested);
        const surfaceFollowUp = detectSurfaceFollowUp(rowForCalc);
        if (surfaceFollowUp) {
            dispatchActiveKiSuggestion({
                id: "recipes-surface-followup",
                level: "info",
                title: "Oberfläche erkannt",
                text: `In der Position wurde eine Oberfläche erkannt. Soll zusätzlich die Folgeposition „${surfaceFollowUp.kurztext}“ erstellt werden?`,
                nextLabel: "Folgeposition erstellen",
                action: "createSurfaceFollowup",
                autoOpen: false,
                pulse: true
            });
            setInfo(`Urkalkulation erstellt. Zusätzlich erkannt: ${surfaceFollowUp.kurztext}. Folgeposition kann automatisch erstellt werden.`);
        }
        else {
            setInfo("Professionelle Urkalkulation lokal erstellt: Ressourcen, Zuschläge, EP und Preisaufbau wurden berechnet.");
        }
    }
    useEffect(() => {
        if (!draftPos.kurztext.trim()) {
            clearActiveKiSuggestion();
            return;
        }
        const compositeSplitReady = detectCompositeSplitSuggestions(selectedRow);
        if (compositeSplitReady.length) {
            dispatchActiveKiSuggestion({
                id: "recipes-composite-split",
                level: "warning",
                title: "Mehrere Leistungen erkannt",
                text: `Diese Position enthält mehrere technische Leistungen. Soll ich daraus ${compositeSplitReady.length} prüfbare Einzelpositionen erstellen?`,
                nextLabel: "Einzelpositionen erstellen",
                action: "createCompositeSplit",
                autoOpen: false,
                pulse: true
            });
            return;
        }
        if (!draftPos.langtext.trim() || isGenericLangtext(draftPos.langtext)) {
            dispatchActiveKiSuggestion({
                id: "recipes-langtext-generic",
                level: "warning",
                title: "Langtext fachlich verbessern",
                text: "Der Langtext ist leer oder noch zu allgemein. Soll ich ihn positionsbezogen aus Kurztext, Einheit, Menge und Ausführungsparametern erzeugen?",
                nextLabel: "Langtext erzeugen",
                action: "generateLongText",
                autoOpen: false,
                pulse: true
            });
            return;
        }
        if (!lines.length) {
            dispatchActiveKiSuggestion({
                id: "recipes-resources-missing",
                level: "warning",
                title: "Urkalkulation fehlt",
                text: "Für diese Position fehlen Ressourcen und Preisaufbau. Soll ich Personal, Maschinen, Material, Transport, Zuschläge und EP automatisch vorschlagen?",
                nextLabel: "Urkalkulation starten",
                action: "suggestResources",
                autoOpen: false,
                pulse: true
            });
            return;
        }
        if (summary.ep <= 0) {
            dispatchActiveKiSuggestion({
                id: "recipes-ep-missing",
                level: "critical",
                title: "EP fehlt",
                text: "Die Ressourcen sind vorhanden, aber der Einheitspreis ist noch 0. Soll ich Zuschläge und Preisaufbau neu berechnen?",
                nextLabel: "EP berechnen",
                action: "calculatePriceBuildUp",
                autoOpen: false,
                pulse: true
            });
            return;
        }
        const surfaceFollowUpReady = detectSurfaceFollowUp(selectedRow);
        if (surfaceFollowUpReady) {
            dispatchActiveKiSuggestion({
                id: "recipes-surface-followup",
                level: "info",
                title: "Oberfläche erkannt",
                text: `In der Position wurde eine Oberfläche erkannt. Soll zusätzlich die Folgeposition „${surfaceFollowUpReady.kurztext}“ erstellt werden?`,
                nextLabel: "Folgeposition erstellen",
                action: "createSurfaceFollowup",
                autoOpen: false,
                pulse: true
            });
            return;
        }
        dispatchActiveKiSuggestion({
            id: "recipes-ready",
            level: "success",
            title: "Position bereit",
            text: "Langtext, Ressourcen und EP sind vorhanden. Nächster sinnvoller Schritt: Position ins LV speichern oder als Nachtrag/Angebot weitergeben.",
            nextLabel: "Position einfügen",
            action: "insertPosition",
            autoOpen: false,
            pulse: false
        });
    }, [draftPos.kurztext, draftPos.langtext, draftPos.einheit, draftPos.menge, lines, summary.ep]);
    function addLine(group) {
        const first = RESOURCE_CATALOG.find((x) => x.group === group);
        setLines((prev) => [
            ...prev,
            {
                id: safeId(),
                group,
                resourceId: first?.id || "",
                name: first?.name || "",
                unit: first?.unit || "St",
                qty: 1,
                price: first?.defaultPrice || 0,
                note: "",
                aiSuggested: false
            }
        ]);
    }
    function updateLine(id, patch) {
        setLines((prev) => prev.map((r) => {
            if (r.id !== id)
                return r;
            let next = { ...r, ...patch };
            if (patch.resourceId !== undefined) {
                if (!patch.resourceId)
                    return { ...next, resourceId: "" };
                if (patch.resourceId.startsWith("LIB-")) {
                    const libItem = libraryRows.find((item) => libraryResourceId(item) === patch.resourceId);
                    if (libItem) {
                        const libLine = recipeLineFromLibrary(libItem);
                        next = { ...next, ...libLine, id: r.id };
                    }
                }
                else {
                    const item = RESOURCE_CATALOG.find((x) => x.id === patch.resourceId);
                    if (item) {
                        next = {
                            ...next,
                            group: item.group,
                            name: item.name,
                            unit: item.unit,
                            price: item.defaultPrice
                        };
                    }
                }
            }
            return next;
        }));
    }
    function deleteLine(id) {
        setLines((prev) => prev.filter((r) => r.id !== id));
    }
    function saveAsCompanyRecipe() {
        const errors = validateDraft(draftPos);
        if (errors.length || !lines.length) {
            alert([...errors, !lines.length ? "Keine Ressourcen vorhanden." : ""].filter(Boolean).join("\n"));
            return;
        }
        const signature = textSignature(selectedRow);
        const now = new Date().toISOString();
        const recipe = {
            id: safeId(),
            signature,
            title: selectedRow.kurztext || signature,
            sourcePosNr: selectedRow.posNr || "",
            sourceText: `${selectedRow.kurztext || ""} ${selectedRow.langtext || ""}`,
            unit: selectedRow.einheit || "",
            createdAt: now,
            updatedAt: now,
            lines
        };
        const next = [recipe, ...companyRecipes.filter((r) => r.signature !== signature)];
        setCompanyRecipes(next);
        saveCompanyRecipes(next);
        setInfo("Firmen-Rezeptur gespeichert.");
    }
    function makeLvPayload() {
        const errors = validateDraft(draftPos);
        if (errors.length) {
            alert(errors.join("\n"));
            return null;
        }
        if (!lines.length) {
            alert("Bitte zuerst Ressourcen / Urkalkulation erfassen.");
            return null;
        }
        const menge = Math.max(n(draftPos.menge), 1);
        const totals = recipeCostTotals(lines, menge);
        const pb = buildPriceBreakdown(lines, selectedRow);
        const now = new Date().toISOString();
        const id = draftPos.id || safeId();
        const riskLevel = ctx.groundwater || ctx.restricted || ctx.trafficControl || ctx.soilClass === "6" || ctx.soilClass === "7" ?
            "high" :
            "medium";
        const warning = riskLevel === "high" ? "Erschwerte Bedingungen aus Rezept erkannt." : "";
        const payload = {
            ...selectedRow,
            id,
            auftragId: recipeContext.auftragId || "",
            auftragName: recipeContext.auftragName || "",
            auftragType: recipeContext.auftragType || "",
            posNr: draftPos.posNr,
            kurztext: draftPos.kurztext,
            langtext: draftPos.langtext || suggestLangtextForDraft(draftPos, ctx),
            einheit: draftPos.einheit,
            menge,
            preis: summary.ep,
            gesamt: round2(menge * summary.ep),
            waehrung: "EUR",
            materialCost: totals.materialCost,
            laborCost: totals.laborCost,
            machineCost: totals.machineCost,
            subcontractorCost: totals.subcontractorCost,
            disposalCost: totals.disposalCost,
            transportCost: totals.transportCost,
            overheadCost: totals.overheadCost,
            riskCost: totals.riskCost,
            profitCost: totals.profitCost,
            baseUnitPrice: summary.ep,
            suggestedUnitPrice: summary.ep,
            finalUnitPrice: summary.ep,
            riskLevel,
            calculationStatus: "ok",
            gewerk: inferGewerk(selectedRow),
            leistungsart: textSignature(selectedRow),
            bauverfahren: inferBauverfahren(selectedRow, ctx),
            warning,
            aiReason: `Aus Ressourcen-Rezept übernommen.\n\nPreisaufbau:\n${breakdownText(pb)}`,
            priceBreakdown: pb,
            source: "recipe",
            createdAt: selectedRow.createdAt || now,
            updatedAt: now
        };
        return { payload, totals, pb, riskLevel, warning };
    }
    function saveCurrentToDatenbank() {
        const made = makeLvPayload();
        if (!made)
            return 0;
        const { payload, totals, pb, riskLevel, warning } = made;
        KalkulationsDatenbank.upsert(KalkulationsDatenbank.fromCalculatedPosition({
            quelle: "rezept",
            projektCode: projectKey,
            projektName: projectTitle,
            posNr: payload.posNr || "",
            kurztext: payload.kurztext || "",
            langtext: payload.langtext || "",
            einheit: payload.einheit || "",
            menge: n(payload.menge),
            materialCost: totals.materialCost,
            laborCost: totals.laborCost,
            machineCost: totals.machineCost,
            subcontractorCost: totals.subcontractorCost,
            disposalCost: totals.disposalCost,
            transportCost: totals.transportCost,
            overheadCost: totals.overheadCost,
            riskCost: totals.riskCost,
            profitCost: totals.profitCost,
            finalUnitPrice: n(payload.preis),
            totalNet: round2(n(payload.menge) * n(payload.preis)),
            gewerk: inferGewerk(payload),
            leistungsart: textSignature(payload),
            bauverfahren: inferBauverfahren(payload, ctx),
            riskLevel,
            confidence: 0.9,
            aiReason: `Aus professioneller Rezept- und Ressourcen-Kalkulation übernommen.\n\nPreisaufbau:\n${breakdownText(pb)}`,
            warning
        }));
        setInfo("Position wurde in der Kalkulationsdatenbank gespeichert.");
        return 1;
    }
    function isGlobalUrkRealLvRow(row) {
        const pos = String(row.posNr || "").trim();
        const kurz = String(row.kurztext || "").trim();
        const lang = String(row.langtext || "").trim();
        const unit = String(row.einheit || "").trim();
        const text = normSearch(`${pos} ${kurz} ${lang}`);
        if (!unit || n(row.menge) <= 0)
            return false;
        if (!kurz && !lang)
            return false;
        if (/^\d{1,3}(\.0+)?$/.test(pos) && kurz.length < 5 && lang.length < 10)
            return false;
        if (text.includes("zwischensumme") ||
            text.includes("gesamtsumme") ||
            text.includes("summe titel") ||
            text.includes("titel ") ||
            text.includes("abschnitt ") ||
            text.includes("los ")) {
            return false;
        }
        return true;
    }
    function rowHasUrkalkulation(row) {
        return (Array.isArray(row.priceBreakdown) && row.priceBreakdown.length > 0 ||
            Array.isArray(row.recipeLines) && row.recipeLines.length > 0);
    }
    function createGlobalUrkalkulationForRow(row) {
        const detected = detectWorkType(row);
        let nextLines = createKiSuggestion(row, ctx);
        if (!nextLines.length) {
            nextLines = createRlcFallbackUrkalkulation(row, ctx);
        }
        if (!nextLines.length) {
            nextLines = createRlcMinimalReviewUrkalkulation(row);
        }
        // Wichtig: Globale Urkalkulation muss dieselben RecipeLines verwenden wie die Einzel-Urkalkulation.
        // Keine zusätzliche Bereinigung hier, sonst entstehen andere Preise als bei "Urkalkulation starten".
        if (!nextLines.length) {
            nextLines = createRlcMinimalReviewUrkalkulation(row);
        }
        if (!nextLines.length)
            return null;
        const pb = buildPriceBreakdown(nextLines, row);
        const ep = round2(pb.reduce((sum, line) => sum + n(line.total), 0));
        const qty = n(row.menge);
        const gp = round2(qty * ep);
        const groupSum = (group) => round2(pb.filter((line) => line.group === group).reduce((sum, line) => sum + n(line.total), 0));
        return {
            ...row,
            // Globale Urkalkulation erklärt den Preisaufbau,
            // darf aber den bestehenden EP/RLC-KI-Preis NICHT überschreiben.
            urkalkulationUnitPrice: ep,
            urkalkulationTotal: gp,
            preis: row.preis,
            ep: row.ep,
            finalUnitPrice: row.finalUnitPrice,
            suggestedUnitPrice: row.suggestedUnitPrice,
            rlcKiUnitPrice: row.rlcKiUnitPrice,
            totalNet: row.totalNet,
            gp: row.gp,
            gesamt: row.gesamt,
            materialCost: groupSum("Material"),
            laborCost: groupSum("Personal"),
            machineCost: groupSum("Maschinen"),
            transportCost: groupSum("LKW / Transport"),
            subcontractorCost: groupSum("Fremdleistung"),
            disposalCost: groupSum("Entsorgung"),
            overheadCost: groupSum("Gemeinkosten"),
            riskCost: groupSum("Risiko"),
            profitCost: groupSum("Gewinn"),
            priceBreakdown: pb,
            recipeLines: nextLines,
            source: "recipes-urkalkulation-global-lv-v1",
            calculationStatus: "recipes_ready",
            riskLevel: detected.ambiguous ? "high" : "medium",
            confidence: detected.ambiguous ? 0.7 : 0.88,
            aiReason: `Globale Urkalkulation für gesamtes LV erstellt.\n\nPreisaufbau:\n${breakdownText(pb)}`,
            updatedAt: new Date().toISOString()
        };
    }
    async function createGlobalLvUrkalkulation(mode) {
        const current = LV.list();
        const realRows = current.filter(isGlobalUrkRealLvRow);
        const existingUrk = realRows.filter(rowHasUrkalkulation).length;
        const candidates = realRows.filter((row) => {
            if (mode === "missing" && rowHasUrkalkulation(row))
                return false;
            return true;
        });
        const changed = [];
        let skippedInvalid = current.length - realRows.length;
        let skippedExisting = mode === "missing" ? existingUrk : 0;
        setGlobalUrkModalOpen(false);
        setGlobalUrkRunning(true);
        setGlobalUrkDone(false);
        setGlobalUrkProgress({ done: 0, total: candidates.length, changed: 0 });
        if (!candidates.length) {
            setGlobalUrkRunning(false);
            setGlobalUrkDone(true);
            setGlobalUrkProgress({ done: 0, total: 0, changed: 0 });
            setInfo(`Keine fehlenden Urkalkulationen gefunden. Reale LV-Positionen: ${realRows.length}, bereits mit Urkalkulation: ${existingUrk}. Für komplette Neuberechnung bitte "Alle Positionen neu erstellen" wählen.`);
            return;
        }
        setInfo(`Globale Urkalkulation startet: ${candidates.length} Position(en) zu bearbeiten. Bereits vorhanden: ${existingUrk}.`);
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        for (let i = 0; i < candidates.length; i++) {
            const row = candidates[i];
            const updated = createGlobalUrkalkulationForRow(row);
            if (updated) {
                LV.upsert(updated);
                changed.push(updated);
            }
            else {
                skippedInvalid++;
            }
            const done = i + 1;
            const pct = Math.round(done / candidates.length * 100);
            setGlobalUrkProgress({ done, total: candidates.length, changed: changed.length });
            setInfo(`Globale Urkalkulation läuft… ${done} / ${candidates.length} · ${pct} % · ${changed.length} erstellt`);
            await new Promise((resolve) => window.setTimeout(resolve, 18));
        }
        const refreshedLv = LV.list();
        setLvRows(refreshedLv);
        const refreshedSelected = refreshedLv.find((r) => String(r.id || "") === String(selectedId || "")) ||
            refreshedLv.find((r) => String(r.posNr || "") === String(draftPos.posNr || "")) ||
            refreshedLv[0];
        if (refreshedSelected) {
            setSelectedId(String(refreshedSelected.id || ""));
            setDraftPos(draftFromLv(refreshedSelected));
            setLines(Array.isArray(refreshedSelected.recipeLines) ?
                refreshedSelected.recipeLines :
                []);
        }
        // RLC FIX: Globale Urkalkulation bleibt nur in Recipes/Preisaufbau.
        // Kein global-lv Handoff mehr nach Kalkulation mit KI.
        localStorage.removeItem("rlc_recipes_to_kalkulation_pending");
        const firstDone = changed[0] || candidates[0];
        if (firstDone) {
            setSelectedId(String(firstDone.id || ""));
            setDraftPos(draftFromLv(firstDone));
            const firstLines = Array.isArray(firstDone.recipeLines) ?
                firstDone.recipeLines :
                [];
            const fallbackLines = !firstLines.length && Array.isArray(firstDone.priceBreakdown) ?
                recipeLinesFromServerPriceBreakdown(firstDone) :
                [];
            setLines((firstLines.length ? firstLines : fallbackLines).map((line) => ({ ...line, id: line.id || safeId() })));
            setLibraryQuery(String(firstDone.kurztext || ""));
        }
        setGlobalUrkRunning(false);
        setGlobalUrkDone(true);
        setGlobalUrkProgress({ done: candidates.length, total: candidates.length, changed: changed.length });
        setInfo(`Globale Urkalkulation abgeschlossen: ${changed.length} Position(en) erstellt und erste Position automatisch geladen. Übersprungen: ${skippedExisting} bestehend, ${skippedInvalid} nicht kalkulierbar.`);
    }
    function applyToLv() {
        const made = makeLvPayload();
        if (!made)
            return null;
        LV.upsert(made.payload);
        saveCurrentToDatenbank();
        const next = LV.list();
        setLvRows(next);
        setDraftPos(draftFromLv(made.payload));
        setSelectedId(String(made.payload.id || ""));
        setInfo("Position wurde vollständig mit Urkalkulation ins LV übernommen.");
        return made.payload;
    }
    function createCompositeSplitPositions() {
        const existing = LV.list();
        const rows = buildCompositeSplitLvRows(selectedRow, existing);
        if (!rows.length) {
            setInfo("Keine zusammengesetzte Position erkannt oder Einzelpositionen sind bereits vorhanden.");
            return;
        }
        rows.forEach((r) => LV.upsert(r));
        setLvRows(LV.list());
        setInfo(`Zusammengesetzte Position aufgeteilt: ${rows.length} Einzelposition(en) erstellt.`);
    }
    function createSurfaceFollowUpPosition() {
        const existing = LV.list();
        const followUp = buildSurfaceFollowUpLv(selectedRow, existing);
        if (!followUp) {
            setInfo("Keine passende Oberflächen-Folgeposition erkannt.");
            return;
        }
        LV.upsert(followUp);
        setLvRows(LV.list());
        setInfo(`Folgeposition erstellt: ${followUp.posNr} · ${followUp.kurztext}.`);
    }
    function saveForHandoff() {
        const made = makeLvPayload();
        if (!made)
            return false;
        const payload = made.payload;
        const ep = round2(n(payload.preis || payload.ep || summary.ep));
        const qtyValue = n(payload.menge);
        const gp = round2(ep * qtyValue);
        LV.upsert({
            ...payload,
            preis: ep,
            ep,
            gp,
            source: "recipes-urkalkulation-v21",
            calculationStatus: "recipes_ready",
            recipeLines: lines
        });
        saveCurrentToDatenbank();
        const refreshedLv = LV.list();
        setLvRows(refreshedLv);
        const refreshedSelected = refreshedLv.find((r) => String(r.id || "") === String(selectedId || "")) ||
            refreshedLv.find((r) => String(r.posNr || "") === String(draftPos.posNr || "")) ||
            refreshedLv[0];
        if (refreshedSelected) {
            setSelectedId(String(refreshedSelected.id || ""));
            setDraftPos(draftFromLv(refreshedSelected));
            setLines(Array.isArray(refreshedSelected.recipeLines) ?
                refreshedSelected.recipeLines :
                []);
        }
        localStorage.setItem("rlc_recipes_to_kalkulation_pending", JSON.stringify({
            source: "recipes",
            version: "RLC_RECIPES_TRANSFER_V1",
            createdAt: Date.now(),
            projectKey,
            row: {
                ...payload,
                preis: ep,
                ep,
                gp,
                qty: qtyValue,
                menge: qtyValue,
                unit: payload.einheit || payload.unit || "m",
                einheit: payload.einheit || payload.unit || "m",
                source: "recipes-urkalkulation-v21",
                calculationStatus: "recipes_ready",
                recipeLines: lines,
                recipeSummary: summary
            }
        }));
        return true;
    }
    function savePayloadForNavigation() {
        const made = makeLvPayload();
        if (!made)
            return null;
        LV.upsert(made.payload);
        saveCurrentToDatenbank();
        setLvRows(LV.list());
        return made.payload;
    }
    async function saveUrkalkulation() {
        const ok = saveForHandoff();
        if (!ok)
            return;
        if (!projectKey) {
            setInfo("Urkalkulation lokal gespeichert. Kein Projekt ausgewählt.");
            return;
        }
        const made = makeLvPayload();
        if (!made)
            return;
        const row = made.payload;
        const ep = round2(n(row.preis || row.ep || summary.ep));
        const qty = Math.max(n(row.menge || row.qty, 1), 0.0001);
        const gp = round2(ep * qty);
        const savedAt = new Date().toISOString();
        const snapshot = {
            ok: true,
            version: "RLC_URKALKULATION_PROJECT_V1",
            source: "recipes",
            projectKey,
            projectCode: projectKey,
            projectTitle,
            savedAt,
            selectedId: row.id || selectedId || null,
            row: {
                ...row,
                preis: ep,
                ep,
                gp,
                qty,
                menge: qty,
                unit: row.einheit || row.unit || "m",
                einheit: row.einheit || row.unit || "m",
                recipeLines: lines,
                recipeSummary: summary,
                priceBreakdown: buildPriceBreakdown(lines, selectedRow),
                urkalkulationUnitPrice: ep,
                urkalkulationTotal: gp,
                calculationStatus: "recipes_ready",
                source: "recipes-urkalkulation-server-v1",
                updatedAt: savedAt
            },
            rows: LV.list(),
            context: ctx,
            recipeContext,
            summary
        };
        try {
            const token = getAuthToken();
            const response = await fetch(apiUrl(`/api/kalkulation/storage/urkalkulation/${encodeURIComponent(projectKey)}/save`), {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(snapshot)
            });
            const raw = await response.text();
            let result = null;
            try {
                result = raw ? JSON.parse(raw) : null;
            }
            catch {
                result = raw;
            }
            if (!response.ok) {
                throw new Error(result?.error || result?.message || `HTTP ${response.status}`);
            }
            setInfo("Urkalkulation lokal und auf dem Server gespeichert.");
        }
        catch (error) {
            console.error("[Recipes] Urkalkulation server save failed", error);
            setInfo(`Urkalkulation lokal gespeichert. Serverfehler: ${error?.message || "unbekannt"}`);
        }
    }
    function pushToKi() {
        const ok = saveForHandoff();
        if (!ok)
            return;
        nav(recipeContext.returnTo || "/kalkulation/mit-ki?from=rezepte");
    }
    function pushToManuell() {
        const ok = saveForHandoff();
        if (!ok)
            return;
        nav("/kalkulation/manuell?from=rezepte");
    }
    function pushToAngebot() {
        const payload = savePayloadForNavigation();
        if (!payload)
            return;
        nav("/kalkulation/angebot?from=rezepte");
    }
    function pushToNachtrag() {
        const payload = savePayloadForNavigation();
        if (!payload)
            return;
        localStorage.setItem(NACHTRAG_BUFFER_KEY, JSON.stringify({
            projectId: projectKey,
            projectKey,
            createdAt: Date.now(),
            source: "REZEPTE",
            rows: [{
                    pos: payload.posNr || "",
                    posNr: payload.posNr || "",
                    kurztext: payload.kurztext || "",
                    title: payload.kurztext || "",
                    langtext: payload.langtext || "",
                    einheit: payload.einheit || "m",
                    unit: payload.einheit || "m",
                    qty: n(payload.menge),
                    mengeDelta: n(payload.menge),
                    preis: n(payload.preis),
                    begruendung: "Aus Urkalkulation / Rezeptkalkulation als Nachtrag übernommen.",
                    note: "Aus Urkalkulation / Rezeptkalkulation als Nachtrag übernommen.",
                    regieRowId: payload.id || safeId(),
                    date: new Date().toISOString()
                }]
        }));
        nav("/kalkulation/nachtraege?from=rezepte");
    }
    function openModule(path) {
        if (path === "/kalkulation/nachtraege")
            return pushToNachtrag();
        if (path === "/kalkulation/angebot")
            return pushToAngebot();
        if (lines.length && !saveForHandoff())
            return;
        nav(path);
    }
    useEffect(() => {
        function handleRezepteCommand(event) {
            const detail = event.detail;
            const action = String(detail?.action || "").trim();
            if (!action)
                return;
            if (action === "newPosition")
                return resetDraft();
            if (action === "suggestResources" || action === "calculatePriceBuildUp") {
                void kiSuggest();
                return;
            }
            if (action === "createCompositeSplit") {
                createCompositeSplitPositions();
                return;
            }
            if (action === "createSurfaceFollowup") {
                createSurfaceFollowUpPosition();
                return;
            }
            if (action === "generateLongText") {
                void autoFillLangtext();
                return;
            }
            if (action === "insertPosition") {
                applyToLv();
                return;
            }
        }
        window.addEventListener("rlc:rezepte-command", handleRezepteCommand);
        return () => window.removeEventListener("rlc:rezepte-command", handleRezepteCommand);
    }, [draftPos, lines, selectedRow, summary.ep, companyRecipes, libraryRows]);
    const validationErrors = validateDraft(draftPos);
    const rlcKiDashboardRow = useMemo(() => {
        const byGroup = (group) => lines.
            filter((x) => x.group === group).
            map((x) => x.name).
            filter(Boolean);
        const risks = [
            ctx.restricted ? "Eingeschränkter Arbeitsraum prüfen" : "",
            ctx.groundwater ? "Grundwasser / Wasserhaltung prüfen" : "",
            ctx.asphalt ? "Asphaltaufbruch / Wiederherstellung prüfen" : "",
            ctx.trafficControl ? "Verkehrssicherung prüfen" : "",
            ctx.soilClass ? `Bodenklasse BK ${ctx.soilClass} prüfen` : ""
        ].
            filter(Boolean);
        return {
            ...(selectedRow || {}),
            source: lines.some((x) => x.aiSuggested) ?
                "RLC KI Urkalkulation" :
                "Manuelle Urkalkulation",
            confidence: lines.length ? 0.82 : null,
            calculationStatus: lines.length ? "warning" : "needs_input",
            riskLevel: risks.length ? "medium" : "low",
            technicalBreakdown: {
                machines: [...byGroup("Maschinen"), ...byGroup("LKW / Transport")],
                labor: byGroup("Personal"),
                materials: byGroup("Material"),
                logistics: [
                    ...byGroup("Entsorgung"),
                    ...(ctx.distanceKm ? [`Entfernung Baustelle: ${ctx.distanceKm} km`] : [])
                ],
                risks
            },
            explainability: {
                version: "RLC_RECIPES_DASHBOARD_V1",
                confidence: lines.length ? 0.82 : null,
                source: lines.some((x) => x.aiSuggested) ?
                    "RLC KI Ressourcen" :
                    "Manuelle Ressourcen",
                machines: [...byGroup("Maschinen"), ...byGroup("LKW / Transport")],
                labor: byGroup("Personal"),
                materials: byGroup("Material"),
                logistics: [
                    ...byGroup("Entsorgung"),
                    ...(ctx.distanceKm ? [`Entfernung Baustelle: ${ctx.distanceKm} km`] : [])
                ],
                risks,
                standards: [],
                assumptions: [
                    draftPos.einheit ? `Einheit: ${draftPos.einheit}` : "",
                    draftPos.menge ? `Menge: ${draftPos.menge}` : "",
                    ctx.depthM ? `Tiefe: ${ctx.depthM} m` : "",
                    ctx.dailyOutput ? `Leistung pro Tag: ${ctx.dailyOutput}` : ""
                ].
                    filter(Boolean),
                calculationSteps: [
                    "Positionsdaten gelesen.",
                    "Ausführungsparameter bewertet.",
                    "Ressourcen aus KI, Bibliothek oder manueller Eingabe übernommen.",
                    "Urkalkulation und Preisaufbau gebildet."
                ]
            }
        };
    }, [selectedRow, lines, ctx, draftPos]);
    return (_jsxs("div", { className: rlcClass("rlc-recipes-page", page), children: [_jsx("style", { children: `
        .rlc-recipes-page, .rlc-recipes-page * { box-sizing: border-box; }
        .rlc-recipes-page { width: 100%; max-width: 100%; overflow-x: hidden; }
        .rlc-recipes-toolbar { position: sticky; top: 8px; z-index: 120; }
        .rlc-recipes-layout { min-width: 0; }
        .rlc-recipes-table-wrap { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 1240px) {
          .rlc-recipes-layout { grid-template-columns: 260px minmax(0,1fr) !important; }
          .rlc-recipes-toolbar { align-items: flex-start !important; }
        }
        @media (max-width: 980px) {
          .rlc-recipes-layout { grid-template-columns: 1fr !important; }
          .rlc-recipes-left { position: static !important; top: auto !important; }
          .rlc-recipes-toolbar { top: 4px; }
        }
        @media (max-width: 640px) {
          .rlc-recipes-page { padding: 8px !important; gap: 10px !important; }
          .rlc-recipes-toolbar button { width: 100%; justify-content: center; }
        }
      ` }), _jsx("input", { ref: libraryImportRef, type: "file", accept: ".csv,text/csv", onChange: (e) => importRecipeLibraryFile(e.target.files?.[0]), className: "rlc-migrated-pages-kalkulation-recipes-tsx-827" }), _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Urkalkulation" }), _jsx("h1", { className: rlcClass(null, title), children: "Neue Position mit Urkalkulation" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Position vollst\u00E4ndig erfassen, Ressourcen kalkulieren, EP/GP automatisch bilden und mit Preisaufbau an KI, Nachtr\u00E4ge, Angebot und GAEB \u00FCbergeben." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: resetDraft, children: "Neue Position" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: autoFillLangtext, children: "Langtext automatisch" }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: saveUrkalkulation, disabled: !lines.length, children: "Speichern" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: applyToLv, disabled: !lines.length, children: "Position ins LV speichern" }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: pushToKi, disabled: !lines.length, children: "Position in Kalkulation \u00FCbernehmen" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectTitle }), " \u00B7 Auftrag: ", _jsx("b", { children: activeAuftragLabel }), " \u00B7 Bibliothek:", " ", _jsx("b", { children: libraryRows.length.toLocaleString("de-DE") }), info ? _jsxs("span", { children: [" \u00B7 ", info] }) : null] })] }), globalUrkModalOpen ?
                _jsx("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-828", children: _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-829", children: [_jsx("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-830", children: "RLC Urkalkulation" }), _jsx("h2", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-831", children: "Gesamtes LV urkalkulieren" }), _jsx("p", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-832", children: "RLC erstellt f\u00FCr alle echten LV-Positionen einen technischen Preisaufbau mit Personal, Maschinen, Material, Transport, Gemeinkosten, Risiko und Gewinn. Titel, Summen und Strukturpositionen werden ignoriert." }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-833", children: [_jsx("button", { type: "button", className: rlcClass(null, { ...btnPrimary, justifyContent: "flex-start", padding: "14px 16px" }), onClick: () => void createGlobalLvUrkalkulation("missing"), disabled: globalUrkRunning, children: "Nur Positionen ohne Urkalkulation erstellen und \u00FCbernehmen" }), _jsx("button", { type: "button", className: rlcClass(null, { ...btnSecondary, justifyContent: "flex-start", padding: "14px 16px" }), onClick: () => void createGlobalLvUrkalkulation("all"), disabled: globalUrkRunning, children: "Alle Positionen neu erstellen und in Kalkulation \u00FCbernehmen" }), _jsx("button", { type: "button", className: rlcClass(null, { ...btnSecondary, justifyContent: "flex-start", padding: "14px 16px" }), onClick: () => setGlobalUrkModalOpen(false), children: "Abbrechen" })] })] }) }) :
                null, globalUrkRunning || globalUrkDone ?
                _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-834", children: [_jsx("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-835", children: "RLC Urkalkulation" }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-836", children: globalUrkRunning ? "Globale Urkalkulation läuft…" : "Globale Urkalkulation abgeschlossen" }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-837", children: [globalUrkProgress.done.toLocaleString("de-DE"), " / ", globalUrkProgress.total.toLocaleString("de-DE"), " Positionen \u00B7", " ", globalUrkProgress.total ? Math.round(globalUrkProgress.done / globalUrkProgress.total * 100) : 100, " %"] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-838", children: _jsx("div", { className: rlcClass(null, {
                                    height: "100%",
                                    width: `${globalUrkProgress.total ? Math.round(globalUrkProgress.done / globalUrkProgress.total * 100) : 100}%`,
                                    background: "#146EF5",
                                    transition: "width 160ms ease"
                                }) }) }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-839", children: ["Erstellt: ", _jsx("b", { children: globalUrkProgress.changed.toLocaleString("de-DE") }), " Position(en)"] }), globalUrkDone ?
                            _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-840", children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => navigate("/kalkulation/mit-ki"), children: "Zur Kalkulation mit KI" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => setGlobalUrkDone(false), children: "Schlie\u00DFen" })] }) :
                            null] }) :
                null, _jsxs("section", { className: rlcClass("rlc-recipes-toolbar", stickyActionBar), children: [_jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-841", children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: saveUrkalkulation, disabled: !lines.length, children: "Speichern" }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: pushToKi, disabled: !lines.length, children: "Kalkulation mit KI" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: applyToLv, disabled: !lines.length, children: "Ins LV speichern" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: pushToNachtrag, disabled: !lines.length, children: "Nachtrag" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: pushToAngebot, disabled: !lines.length, children: "Angebot / Export" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => navigate(`/kalkulation/gaeb${projectKey ? `?projectCode=${encodeURIComponent(projectKey)}` : ""}`), disabled: !lines.length, children: "GAEB" })] }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-842", children: [draftPos.posNr || "Neue Position", " \u00B7 ", draftPos.kurztext || "Noch kein Kurztext"] })] }), _jsxs("section", { className: rlcClass(null, grid5), children: [_jsx(KpiCard, { label: "Direkte Kosten", value: money(summary.base) }), _jsx(KpiCard, { label: "Zuschl\u00E4ge", value: `${num(summary.surcharge, 1)} %` }), _jsx(KpiCard, { label: "EP kalkuliert", value: money(summary.ep), sub: `${summary.count} Ressourcen` }), _jsx(KpiCard, { label: "Menge", value: `${num(draftPos.menge, 3)} ${draftPos.einheit}` }), _jsx(KpiCard, { label: "GP kalkuliert", value: money(summary.gp) })] }), _jsxs("section", { className: rlcClass(null, quickNavCard), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Weiterverarbeitung" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Nach dem Erfassen der Position kann sie direkt in die weiteren Kalkulationsmodule \u00FCbernommen werden." })] }), _jsxs("div", { className: rlcClass(null, buttonRowNoTop), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => openModule("/kalkulation/lv-import"), children: "LV / Positionen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => openModule("/kalkulation/nachtraege"), children: "Nachtrag erstellen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => openModule("/kalkulation/angebot"), children: "Angebot / Export" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => openModule("/kalkulation/gaeb"), children: "GAEB" })] })] }), _jsxs("section", { className: rlcClass("rlc-recipes-layout", layout), children: [_jsxs("aside", { className: rlcClass("rlc-recipes-left", leftCard), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "LV als Vorlage" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Bestehende Position laden oder neue Position frei erfassen." })] }) }), _jsx("button", { type: "button", className: rlcClass(null, { ...btnPrimary, width: "100%", marginBottom: 10 }), onClick: resetDraft, children: "+ Neue Position" }), _jsx("input", { className: rlcClass(null, input), value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Suche PosNr / Text\u2026" }), _jsxs("div", { className: rlcClass(null, lvList), children: [filteredLv.map((r) => {
                                        const active = String(r.id) === selectedId;
                                        return (_jsxs("button", { type: "button", className: rlcClass(null, { ...lvItem, ...(active ? lvItemActive : {}) }), onClick: () => loadExistingPosition(r), children: [_jsx("b", { children: r.posNr || "—" }), _jsx("span", { children: r.kurztext || "Ohne Kurztext" }), _jsxs("small", { children: [num(r.menge, 3), " ", r.einheit || ""] })] }, r.id));
                                    }), !filteredLv.length ? _jsx("div", { className: rlcClass(null, emptyState), children: "Kein LV vorhanden." }) : null] })] }), _jsxs("main", { className: rlcClass(null, mainStack), children: [_jsxs("section", { id: "rlc-recipes-position-data", className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("section", { className: rlcClass(null, { ...card, border: "2px solid #146EF5", background: "#EAF2FF" }), children: _jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Urkalkulation starten" }), _jsx("div", { className: rlcClass(null, sectionText), children: "RLC erstellt aus Positionsdaten, Langtext und Ausf\u00FChrungsparametern automatisch Ressourcen, Zuschl\u00E4ge, EP und Preisaufbau." })] }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-843", children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: kiSuggest, children: "Urkalkulation starten" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => setGlobalUrkModalOpen(true), disabled: globalUrkRunning, children: "Urkalkulation gesamtes LV" })] })] }) }), _jsx("h2", { className: rlcClass(null, sectionTitle), children: "1. Positionsdaten" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Hier wird die komplette LV-Position erfasst." })] }), validationErrors.length ?
                                                _jsxs("div", { className: rlcClass(null, warningPill), children: [validationErrors.length, " Pflichtfeld(er) offen"] }) :
                                                _jsx("div", { className: rlcClass(null, okPill), children: "Positionsdaten vollst\u00E4ndig" })] }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Positionsnummer", children: _jsx("input", { className: rlcClass(null, input), value: draftPos.posNr, onChange: (e) => setDraftPos({ ...draftPos, posNr: e.target.value }), placeholder: "z.B. 01.0010" }) }), _jsx(Field, { label: "Einheit", children: _jsxs("select", { className: rlcClass(null, input), value: draftPos.einheit, onChange: (e) => setDraftPos({ ...draftPos, einheit: e.target.value }), children: [_jsx("option", { value: "m", children: "m" }), _jsx("option", { value: "m\u00B2", children: "m\u00B2" }), _jsx("option", { value: "m\u00B3", children: "m\u00B3" }), _jsx("option", { value: "St", children: "St" }), _jsx("option", { value: "t", children: "t" }), _jsx("option", { value: "h", children: "h" }), _jsx("option", { value: "pauschal", children: "pauschal" })] }) }), _jsx(Field, { label: "Menge", children: _jsx("input", { type: "number", step: "0.001", className: rlcClass(null, input), value: draftPos.menge, onChange: (e) => setDraftPos({ ...draftPos, menge: n(e.target.value) }) }) })] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-844", children: _jsx(Field, { label: "Kurztext", children: _jsx("input", { className: rlcClass(null, input), value: draftPos.kurztext, onChange: (e) => {
                                                    const kurztext = e.target.value;
                                                    setDraftPos({
                                                        ...draftPos,
                                                        kurztext,
                                                        einheit: draftPos.einheit || inferUnitFromText(kurztext)
                                                    });
                                                    setLibraryQuery(kurztext);
                                                }, placeholder: "z.B. Frostschutzkies 0/32 einbauen, Rasengitterstein verlegen, Tiefbord setzen" }) }) }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-845", children: [_jsx(Field, { label: "Langtext", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 120, lineHeight: 1.5 }), value: draftPos.langtext, onChange: (e) => setDraftPos({ ...draftPos, langtext: e.target.value }), placeholder: "Ausf\u00FChrliche Leistungsbeschreibung, Nebenleistungen, Abrechnung, technische Anforderungen..." }) }), _jsx("button", { type: "button", className: rlcClass(null, { ...btnSecondary, marginTop: 8 }), onClick: autoFillLangtext, children: "Langtext automatisch erstellen" })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "2. Parameter der Ausf\u00FChrung" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Diese Werte beeinflussen Personal, Maschinen, Transport, Material, Zeit und Risiko." })] }) }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Grabentiefe / Tiefe m", children: _jsx("input", { type: "number", step: "0.1", className: rlcClass(null, input), value: ctx.depthM, onChange: (e) => setCtx({ ...ctx, depthM: n(e.target.value) }) }) }), _jsx(Field, { label: "Entfernung Baustelle km", children: _jsx("input", { type: "number", step: "1", className: rlcClass(null, input), value: ctx.distanceKm, onChange: (e) => setCtx({ ...ctx, distanceKm: n(e.target.value) }) }) }), _jsx(Field, { label: "Bodenklasse", children: _jsxs("select", { className: rlcClass(null, input), value: ctx.soilClass, onChange: (e) => setCtx({ ...ctx, soilClass: e.target.value }), children: [_jsx("option", { value: "1", children: "BK 1" }), _jsx("option", { value: "2", children: "BK 2" }), _jsx("option", { value: "3", children: "BK 3" }), _jsx("option", { value: "4", children: "BK 4" }), _jsx("option", { value: "5", children: "BK 5" }), _jsx("option", { value: "6", children: "BK 6" }), _jsx("option", { value: "7", children: "BK 7" })] }) }), _jsx(Field, { label: "Leistung pro Tag", children: _jsx("input", { type: "number", step: "1", className: rlcClass(null, input), value: ctx.dailyOutput, onChange: (e) => setCtx({ ...ctx, dailyOutput: n(e.target.value) }) }) })] }), _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: ctx.restricted, onChange: (e) => setCtx({ ...ctx, restricted: e.target.checked }) }), "eingeschr\u00E4nkter Arbeitsraum"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: ctx.groundwater, onChange: (e) => setCtx({ ...ctx, groundwater: e.target.checked }) }), "Grundwasser"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: ctx.asphalt, onChange: (e) => setCtx({ ...ctx, asphalt: e.target.checked }) }), "Asphalt betroffen"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: ctx.trafficControl, onChange: (e) => setCtx({ ...ctx, trafficControl: e.target.checked }) }), "Verkehrssicherung"] })] })] }), _jsx(RlcKiDashboard, { row: rlcKiDashboardRow }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Position fertigstellen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Wenn Positionsdaten, Langtext und Ressourcen vollst\u00E4ndig sind, kann die Position \u00FCbernommen oder gespeichert werden." })] }) }), _jsxs("div", { className: rlcClass(null, buttonRowNoTop), children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: pushToKi, disabled: !lines.length, children: "Position in Kalkulation \u00FCbernehmen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: applyToLv, disabled: !lines.length, children: "Position ins LV speichern" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: saveAsCompanyRecipe, disabled: !lines.length, children: "Als Firmen-Rezept speichern" })] }), !lines.length ?
                                        _jsx("div", { className: rlcClass(null, sectionText), children: "Nach Abschluss der Urkalkulation wird die Position mit allen Ressourcen, Preisen und dem vollst\u00E4ndigen Preisaufbau in die Kalkulation \u00FCbernommen." }) :
                                        null] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "3. Importierte Bibliothek / Preise" }), _jsx("div", { className: rlcClass(null, sectionText), children: "CSV-Bibliothek durchsuchen und echte Artikel/Positionen direkt in die Urkalkulation \u00FCbernehmen." })] }), _jsxs("div", { className: rlcClass(null, buttonRowNoTop), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => libraryImportRef.current?.click(), children: "CSV importieren" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: refreshLibrary, children: "Aktualisieren" })] })] }), _jsxs("div", { className: rlcClass(null, libraryFilterGrid), children: [_jsx("input", { className: rlcClass(null, input), value: libraryQuery, onChange: (e) => setLibraryQuery(e.target.value), placeholder: "Bibliothek suchen: Frostschutz, Rasengitter, Bordstein, LKW..." }), _jsxs("select", { className: rlcClass(null, input), value: libraryGroupFilter, onChange: (e) => setLibraryGroupFilter(e.target.value), children: [_jsx("option", { value: "Alle", children: "Alle Gruppen" }), GROUPS.map((g) => _jsx("option", { value: g, children: g }, g))] })] }), _jsxs("div", { className: rlcClass(null, libraryList), children: [filteredLibraryRows.map((item, idx) => _jsxs("button", { type: "button", className: rlcClass(null, libraryItem), onClick: () => addLibraryItem(item), children: [_jsxs("b", { children: [libraryCode(item) || "—", " \u00B7 ", libraryTitle(item) || "Ohne Text"] }), _jsxs("span", { children: [libraryGroup(item), " \u00B7 ", libraryUnit(item), " \u00B7 ", money(libraryPrice(item))] })] }, `${libraryCode(item) || idx}-${libraryTitle(item)}`)), !filteredLibraryRows.length ?
                                                _jsx("div", { className: rlcClass(null, emptyCell), children: "Keine Bibliothekstreffer. Importiere zuerst eine CSV oder \u00E4ndere die Suche." }) :
                                                null] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "4. Urkalkulation / Ressourcen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Personal, Ger\u00E4te, Material, Transport, Entsorgung und Zuschl\u00E4ge bilden den EP." })] }) }), _jsx("div", { className: rlcClass(null, addGroupRow), children: GROUPS.map((g) => _jsxs("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => addLine(g), children: ["+ ", g] }, g)) }), _jsx("div", { className: rlcClass("rlc-recipes-table-wrap", tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Gruppe" }), _jsx("th", { className: rlcClass(null, th), children: "Ressource" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge" }), _jsx("th", { className: rlcClass(null, thRight), children: "Preis" }), _jsx("th", { className: rlcClass(null, thRight), children: "Gesamt" }), _jsx("th", { className: rlcClass(null, th), children: "Hinweis" }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsxs("tbody", { children: [lines.map((line) => {
                                                            const hasKnownOption = resourceOptions.some((x) => x.id === line.resourceId);
                                                            return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, groupBadge(line.group)), children: line.group }) }), _jsxs("td", { className: rlcClass(null, td), children: [_jsxs("select", { className: rlcClass(null, cellInput), value: line.resourceId || "", onChange: (e) => updateLine(line.id, { resourceId: e.target.value }), children: [!line.resourceId ?
                                                                                        _jsx("option", { value: "", children: line.name ? `Manuell · ${line.name}` : "Manuell" }) :
                                                                                        null, line.resourceId && !hasKnownOption ?
                                                                                        _jsx("option", { value: line.resourceId, children: line.resourceId.startsWith("LIB-") ?
                                                                                                `Bibliothek · ${line.name || line.resourceId}` :
                                                                                                line.name || line.resourceId }) :
                                                                                        null, _jsx("option", { value: "", children: "Manuell" }), _jsx("optgroup", { label: "Standard-Ressourcen", children: RESOURCE_CATALOG.map((r) => _jsxs("option", { value: r.id, children: [r.group, " \u00B7 ", r.name] }, r.id)) }), libraryRows.length ?
                                                                                        _jsx("optgroup", { label: "Importierte Bibliothek", children: resourceOptions.
                                                                                                filter((option) => option.source === "library").
                                                                                                slice(0, 1000).
                                                                                                map((option) => _jsx("option", { value: option.id, children: option.label }, option.id)) }) :
                                                                                        null] }), !line.resourceId || line.resourceId.startsWith("LIB-") ?
                                                                                _jsx("input", { className: rlcClass(null, { ...cellInput, marginTop: 6 }), value: line.name, onChange: (e) => updateLine(line.id, { name: e.target.value }), placeholder: "Eigene Ressource" }) :
                                                                                null] }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, { ...cellInput, width: 80 }), value: line.unit, onChange: (e) => updateLine(line.id, { unit: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", className: rlcClass(null, { ...cellInput, width: 90, textAlign: "right" }), value: line.qty, onChange: (e) => updateLine(line.id, { qty: n(e.target.value) }), disabled: line.unit === "%" }) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("input", { type: "number", className: rlcClass(null, { ...cellInput, width: 95, textAlign: "right" }), value: line.price, onChange: (e) => updateLine(line.id, { price: n(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("b", { children: line.unit === "%" ? "—" : money(lineTotal(line)) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, cellInput), value: line.note, onChange: (e) => updateLine(line.id, { note: e.target.value }), placeholder: "Hinweis" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { type: "button", className: rlcClass(null, btnDangerMini), onClick: () => deleteLine(line.id), children: "L\u00F6schen" }) })] }, line.id));
                                                        }), !lines.length ?
                                                            _jsx("tr", { children: _jsx("td", { colSpan: 8, className: rlcClass(null, emptyCell), children: "Noch keine Ressourcen. Erfasse die Positionsdaten und klicke auf \u201EUrkalkulation starten\u201C oder \u00FCbernimm Artikel aus der Bibliothek." }) }) :
                                                            null] })] }) })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "5. Preisaufbau f\u00FCr KI-Kalkulation" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Diese Struktur wird in die Kalkulation mit KI \u00FCbernommen." })] }) }), _jsx("div", { className: rlcClass("rlc-recipes-table-wrap", tableWrap), children: _jsxs("table", { className: rlcClass(null, { ...table, minWidth: 900 }), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Gruppe" }), _jsx("th", { className: rlcClass(null, th), children: "Bezeichnung" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge je Einheit" }), _jsx("th", { className: rlcClass(null, thRight), children: "Preis" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP-Anteil" }), _jsx("th", { className: rlcClass(null, th), children: "Hinweis" })] }) }), _jsxs("tbody", { children: [priceBreakdown.map((line) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: line.group }), _jsx("td", { className: rlcClass(null, td), children: line.name }), _jsx("td", { className: rlcClass(null, td), children: line.unit }), _jsx("td", { className: rlcClass(null, tdRight), children: num(line.qty, 3) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(line.price) }), _jsx("td", { className: rlcClass(null, tdRight), children: _jsx("b", { children: money(line.total) }) }), _jsx("td", { className: rlcClass(null, td), children: line.note || "" })] }, line.id)), !priceBreakdown.length ?
                                                            _jsx("tr", { children: _jsx("td", { colSpan: 7, className: rlcClass(null, emptyCell), children: "Noch kein Preisaufbau vorhanden." }) }) :
                                                            null, priceBreakdown.length ?
                                                            _jsxs("tr", { children: [_jsx("td", { colSpan: 5, className: rlcClass(null, { ...tdRight, fontWeight: 700 }), children: "Summe EP" }), _jsx("td", { className: rlcClass(null, { ...tdRight, fontWeight: 700 }), children: money(summary.ep) }), _jsx("td", { className: rlcClass(null, td) })] }) :
                                                            null] })] }) })] })] })] })] }));
}
/* ================= UI ================= */
function KpiCard({ label, value, sub }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-recipes-tsx-846", children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
function groupBadge(group) {
    if (group === "Personal")
        return badgeBlue;
    if (group === "Maschinen")
        return badgeOrange;
    if (group === "LKW / Transport")
        return badgePurple;
    if (group === "Material")
        return badgeGreen;
    if (group === "Entsorgung")
        return badgeRed;
    if (group === "Fremdleistung")
        return badgePurple;
    if (group === "Gemeinkosten")
        return badgeNeutral;
    if (group === "Risiko")
        return badgeWarn;
    if (group === "Gewinn")
        return badgeGreen;
    if (group === "Zeit / Leistung")
        return badgeNeutral;
    return badgeWarn;
}
/* ================= STYLES ================= */
const page = {
    display: "grid",
    gap: 12,
    padding: 12,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "hidden"
};
const heroCard = {
    minWidth: 0,
    maxWidth: "100%",
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    display: "grid",
    gap: 14,
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
    maxWidth: 1040,
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
const grid5 = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
    gap: 12
};
const quickNavCard = {
    minWidth: 0,
    maxWidth: "100%",
    background: "#FFFFFF",
    border: "1px solid #DBEAFE",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap"
};
const stickyActionBar = {
    minWidth: 0,
    maxWidth: "100%",
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #DBEAFE",
    borderRadius: 16,
    padding: 10,
    boxShadow: "0 8px 24px rgba(15,23,42,0.10)",
    backdropFilter: "blur(12px)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap"
};
const kpiCard = {
    minWidth: 0,
    maxWidth: "100%",
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
    fontSize: 22,
    color: "#0F172A",
    fontWeight: 700
};
const kpiSub = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const layout = {
    display: "grid",
    gridTemplateColumns: "minmax(250px,300px) minmax(0,1fr)",
    gap: 16,
    alignItems: "start"
};
const leftCard = {
    minWidth: 0,
    maxWidth: "100%",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    position: "sticky",
    top: 12
};
const mainStack = {
    display: "grid",
    gap: 16,
    minWidth: 0
};
const card = {
    minWidth: 0,
    maxWidth: "100%",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
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
const input = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    background: "#FFFFFF"
};
const labelStyle = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const formGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 12
};
const buttonRow = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12
};
const buttonRowNoTop = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const checkLabel = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: 600
};
const lvList = {
    display: "grid",
    gap: 8,
    marginTop: 12,
    maxHeight: "68vh",
    overflow: "auto"
};
const lvItem = {
    display: "grid",
    gap: 4,
    textAlign: "left",
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    cursor: "pointer",
    color: "#0F172A"
};
const lvItemActive = {
    borderColor: "#146EF5",
    background: "#EAF2FF"
};
const addGroupRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12
};
const tableWrap = {
    minWidth: 0,
    maxWidth: "100%",
    overflow: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
    minWidth: 980,
    borderCollapse: "collapse"
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
const thRight = {
    ...th,
    textAlign: "right"
};
const td = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle"
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap"
};
const cellInput = {
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
    width: "100%",
    boxSizing: "border-box",
    background: "#FFFFFF"
};
const emptyCell = {
    padding: 16,
    color: "#64748B",
    fontSize: 13
};
const emptyState = {
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    color: "#64748B",
    fontSize: 13
};
const warningPill = {
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#B45309",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700
};
const okPill = {
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700
};
const libraryFilterGrid = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(160px,220px)",
    gap: 10,
    marginBottom: 10
};
const libraryList = {
    display: "grid",
    gap: 8,
    maxHeight: 310,
    overflow: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: 8,
    background: "#F8FAFC"
};
const libraryItem = {
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    display: "grid",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
    color: "#0F172A"
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
const btnDangerMini = {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
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
const badgeBlue = {
    ...badgeNeutral,
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    color: "#0B5BD3"
};
const badgeOrange = {
    ...badgeNeutral,
    border: "1px solid #FED7AA",
    background: "#FFF7ED",
    color: "#C2410C"
};
const badgePurple = {
    ...badgeNeutral,
    border: "1px solid #DDD6FE",
    background: "#F5F3FF",
    color: "#6D28D9"
};
const badgeGreen = {
    ...badgeNeutral,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D"
};
const badgeRed = {
    ...badgeNeutral,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const badgeWarn = {
    ...badgeNeutral,
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#B45309"
};
