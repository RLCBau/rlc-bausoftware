import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/preise.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Catalog } from "./catalogStore";
import { LV } from "./store.lv";
import { useProject } from "../../store/useProject";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const QUALITY_GATE_STATUSES = [
    "KI-Vorschlag",
    "Geprüft",
    "Freigegeben",
    "Gesperrt",
    "Nicht verwenden"
];
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "";
const MANUELL_HANDOFF_KEY = "rlc_kalkulation_manuell_handoff_v1";
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const ANGEBOT_HANDOFF_KEY = "rlc_kalkulation_angebot_handoff_v1";
const gruppen = ["Alle", "Material", "Arbeiter", "Maschinen"];
function isPriceGroup(value) {
    return value === "Material" || value === "Arbeiter" || value === "Maschinen";
}
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function apiUrl(path) {
    const cleanApi = String(API || "").replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!cleanApi)
        return cleanPath;
    if (cleanApi.endsWith("/api") && cleanPath.startsWith("/api/")) {
        return `${cleanApi}${cleanPath.slice(4)}`;
    }
    return `${cleanApi}${cleanPath}`;
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
            if (value?.trim())
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
function withAuthHeaders(extra) {
    const token = getAuthToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function norm(value) {
    return String(value || "").
        toLowerCase().
        normalize("NFKD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/ß/g, "ss").
        trim();
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function money(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(Number.isFinite(n) ? n : 0);
}
function numberSafe(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }
    const raw = String(value).trim();
    const normalized = raw.includes(",") ?
        raw.replace(/\./g, "").replace(",", ".") :
        raw.replace(/\s/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function getProjectFromState(projectState) {
    const project = projectState?.project ||
        projectState?.currentProject ||
        projectState?.selectedProject ||
        projectState?.current ||
        projectState;
    if (!project || typeof project !== "object")
        return null;
    return project;
}
function projectCode(project) {
    return String(project?.code || project?.number || project?.id || "").trim();
}
function projectName(project) {
    return String(project?.name || "").trim();
}
function projectLabel(project) {
    if (!project)
        return "Kein Projekt ausgewählt";
    const code = project.code || project.number || project.id || "Projekt";
    const name = project.name || "Projekt";
    return `${code} — ${name}`;
}
function normalizeUnit(value) {
    const raw = String(value || "").trim();
    const v = norm(raw).replace(/\s/g, "");
    if (!v)
        return "";
    if (["m2", "qm", "m²", "m^2"].includes(v))
        return "m²";
    if (["m3", "cbm", "m³", "m^3"].includes(v))
        return "m³";
    if (["stk", "stuck", "stück", "st"].includes(v))
        return "St";
    if (["std", "stunden", "hour", "hours", "h"].includes(v))
        return "h";
    if (["to", "tonne", "tonnen", "t"].includes(v))
        return "t";
    if (["meter", "lfm", "m"].includes(v))
        return "m";
    if (["pausch", "pauschal", "psch"].includes(v))
        return "pauschal";
    return raw;
}
function inferGroupFromText(row) {
    const text = norm(`${row.posNr || ""} ${row.kurztext || ""} ${row.langtext || ""} ${row.einheit || ""}`);
    if (text.includes("facharbeiter") ||
        text.includes("bauhelfer") ||
        text.includes("polier") ||
        text.includes("vorarbeiter") ||
        text.includes("bauleiter") ||
        text.includes("vermessungstechniker") ||
        text.includes("lohn") ||
        text.includes("arbeitszeit") ||
        text.includes("kolonne")) {
        return "Arbeiter";
    }
    if (text.includes("bagger") ||
        text.includes("radlader") ||
        text.includes("walze") ||
        text.includes("ruttelplatte") ||
        text.includes("ruettelplatte") ||
        text.includes("maschine") ||
        text.includes("geraet") ||
        text.includes("gerät") ||
        text.includes("fraese") ||
        text.includes("frase") ||
        text.includes("fräs") ||
        text.includes("schneiden") ||
        text.includes("auskofferung") ||
        text.includes("aushub") ||
        text.includes("baugrube") ||
        text.includes("graben") ||
        text.includes("verdichtung")) {
        return "Maschinen";
    }
    return "Material";
}
function inferUnitFromText(row) {
    const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
    if (text.includes("aushub") ||
        text.includes("baugrube") ||
        text.includes("auskofferung") ||
        text.includes("boden") ||
        text.includes("kies") ||
        text.includes("splitt") ||
        text.includes("schotter") ||
        text.includes("frostschutz") ||
        text.includes("verfuellen") ||
        text.includes("verfüllen")) {
        return "m³";
    }
    if (text.includes("asphalt") ||
        text.includes("pflaster") ||
        text.includes("rasengitter") ||
        text.includes("anstrich") ||
        text.includes("grundierung") ||
        text.includes("flache") ||
        text.includes("fläche")) {
        return "m²";
    }
    if (text.includes("rohr") ||
        text.includes("leitung") ||
        text.includes("kabel") ||
        text.includes("bord") ||
        text.includes("randstein") ||
        text.includes("nym") ||
        text.includes("brandmeldekabel")) {
        return "m";
    }
    if (text.includes("steckdose") ||
        text.includes("datendose") ||
        text.includes("leitungsschutzschalter") ||
        text.includes("zählerschrank") ||
        text.includes("zaehlerschrank")) {
        return "St";
    }
    if (text.includes("arbeiter") || text.includes("helfer") || text.includes("bagger")) {
        return "h";
    }
    return normalizeUnit(row.einheit || "") || "m";
}
function extractDepthMeters(text) {
    const clean = norm(text).replace(",", ".");
    const m1 = clean.match(/tiefe\s*(?:bis)?\s*(\d+(?:\.\d+)?)\s*m/);
    if (m1)
        return numberSafe(m1[1]);
    const m2 = clean.match(/(\d+(?:\.\d+)?)\s*m\s*tief/);
    if (m2)
        return numberSafe(m2[1]);
    return 1;
}
function extractBodenklasse(text) {
    const clean = norm(text);
    const m = clean.match(/bodenklasse\s*(\d)/);
    return m ? numberSafe(m[1], 2) : 2;
}
function expectedRange(row) {
    const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
    const unit = normalizeUnit(row.einheit);
    if (text.includes("frostschutzschicht") || text.includes("frostschutz")) {
        return unit === "m³" ?
            { min: 28, max: 75, label: "Frostschutz €/m³" } :
            { min: 6, max: 45, label: "Frostschutz je Einheit" };
    }
    if (text.includes("aushub") || text.includes("auskofferung") || text.includes("baugrube")) {
        return unit === "m³" ?
            { min: 8, max: 110, label: "Aushub/Baugrube €/m³" } :
            { min: 5, max: 140, label: "Aushub/Baugrube je Einheit" };
    }
    if (text.includes("pflaster")) {
        return unit === "m²" ?
            { min: 35, max: 160, label: "Pflasterarbeiten €/m²" } :
            { min: 16, max: 100, label: "Pflaster je Einheit" };
    }
    if (text.includes("asphalt")) {
        return unit === "m²" ?
            { min: 25, max: 140, label: "Asphaltarbeiten €/m²" } :
            { min: 18, max: 100, label: "Asphalt je Einheit" };
    }
    if (text.includes("steckdose schuko") || text.includes("schuko")) {
        return { min: 8, max: 55, label: "Steckdose Schuko €/St" };
    }
    if (text.includes("datendose") || text.includes("rj45")) {
        return { min: 8, max: 60, label: "RJ45 Datendose €/St" };
    }
    if (text.includes("facharbeiter"))
        return { min: 38, max: 85, label: "Facharbeiter €/h" };
    if (text.includes("bauhelfer"))
        return { min: 30, max: 65, label: "Bauhelfer €/h" };
    if (text.includes("bagger"))
        return { min: 45, max: 180, label: "Bagger €/h" };
    if (text.includes("lkw"))
        return { min: 75, max: 170, label: "LKW €/h" };
    return null;
}
function suggestedPriceForRow(row) {
    const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
    const unit = normalizeUnit(row.einheit);
    if (text.includes("frostschutzschicht") || text.includes("frostschutz")) {
        return unit === "m³" ? 48 : 18;
    }
    if (text.includes("aushub") || text.includes("auskofferung") || text.includes("baugrube")) {
        if (unit !== "m³")
            return 35;
        const bk = extractBodenklasse(text);
        const depth = extractDepthMeters(text);
        const byBk = {
            1: 38,
            2: 48,
            3: 58,
            4: 70,
            5: 82,
            6: 95,
            7: 110
        };
        let base = byBk[bk] || 48;
        if (depth > 2)
            base += 10;
        if (depth > 3)
            base += 15;
        return round2(base);
    }
    if (text.includes("pflaster"))
        return 85;
    if (text.includes("asphalt"))
        return unit === "m²" ? 42.5 : 55;
    if (text.includes("steckdose schuko") || text.includes("schuko"))
        return 35;
    if (text.includes("datendose") || text.includes("rj45"))
        return 26;
    if (text.includes("leitungsschutzschalter"))
        return 32;
    if (text.includes("zaehlerschrank") || text.includes("zählerschrank"))
        return 650;
    if (text.includes("brandmeldekabel"))
        return 4.5;
    if (text.includes("nym") || text.includes("kabel verlegen"))
        return 8;
    const range = expectedRange(row);
    if (range)
        return round2((range.min + range.max) / 2);
    return null;
}
function normalizeDuplicateText(value) {
    return norm(String(value || "")).
        replace(/\b(liefern|einbauen|herstellen|ausfuehren|ausführen|montieren|verlegen)\b/g, "").
        replace(/\b(einschl|einschliesslich|einschließlich|inkl|inklusive)\b/g, "").
        replace(/\b(position|pos|lv)\b/g, "").
        replace(/\b[a-z]\b$/g, "").
        replace(/\s+/g, " ").
        trim();
}
function normalizeRow(row) {
    const normalizedUnit = normalizeUnit(row.einheit) || inferUnitFromText(row);
    const rawGroup = row.gruppe;
    const gruppe = isPriceGroup(rawGroup) ?
        rawGroup :
        inferGroupFromText({
            ...row,
            einheit: normalizedUnit
        });
    return {
        ...row,
        id: String(row.id || safeId()),
        posNr: String(row.posNr || "").trim(),
        kurztext: String(row.kurztext || "").trim(),
        langtext: String(row.langtext || "").trim(),
        einheit: normalizedUnit,
        gruppe,
        ep: round2(numberSafe(row.ep))
    };
}
function duplicateKey(row) {
    const normalized = normalizeRow(row);
    const unit = normalizeUnit(normalized.einheit || "");
    const text = normalizeDuplicateText(`${normalized.kurztext || ""} ${normalized.langtext || ""}`);
    return `${unit}|${text}`;
}
function buildDuplicateMap(rows) {
    const map = new Map();
    for (const raw of rows) {
        const row = normalizeRow(raw);
        const key = duplicateKey(row);
        if (!key.trim())
            continue;
        const arr = map.get(key) || [];
        arr.push(row);
        map.set(key, arr);
    }
    for (const [key, arr] of Array.from(map.entries())) {
        if (arr.length < 2)
            map.delete(key);
    }
    return map;
}
function rowProbabilityScore(row) {
    const normalized = normalizeRow(row);
    const ep = numberSafe(normalized.ep);
    const range = expectedRange(normalized);
    const suggested = suggestedPriceForRow(normalized);
    let score = 0;
    if (String(normalized.posNr || "").trim())
        score += 10;
    if (String(normalized.kurztext || "").trim())
        score += 18;
    if (String(normalized.einheit || "").trim())
        score += 12;
    if (ep > 0)
        score += 22;
    if (range && ep >= range.min && ep <= range.max)
        score += 35;
    if (range && (ep < range.min || ep > range.max))
        score -= 30;
    if (suggested && ep > 0) {
        const deviation = Math.abs(ep - suggested) / Math.max(suggested, 1);
        score += Math.max(0, 25 - deviation * 50);
    }
    return round2(score);
}
function bestDuplicateRow(rows) {
    return [...rows].sort((a, b) => rowProbabilityScore(b) - rowProbabilityScore(a))[0];
}
function autoCorrectRow(row) {
    const normalizedUnit = normalizeUnit(row.einheit) || inferUnitFromText(row);
    const baseRow = { ...row, einheit: normalizedUnit };
    const inferredGroup = inferGroupFromText(baseRow);
    const ep = numberSafe(row.ep);
    const checkRow = { ...baseRow, gruppe: inferredGroup };
    const suggestion = suggestedPriceForRow(checkRow);
    const range = expectedRange(checkRow);
    let nextEp = ep;
    if (suggestion !== null && suggestion !== undefined) {
        if (ep <= 0)
            nextEp = suggestion;
        else if (range && (ep < range.min || ep > range.max))
            nextEp = suggestion;
    }
    return normalizeRow({
        ...row,
        einheit: normalizedUnit,
        gruppe: inferredGroup,
        ep: round2(nextEp)
    });
}
function getVisibleRowId(row) {
    return String(row.id || `${row.posNr}-${row.kurztext}-${row.einheit}`);
}
function validatePriceRow(row, duplicates) {
    const normalized = normalizeRow(row);
    const rowId = getVisibleRowId(row);
    const issues = [];
    const ep = numberSafe(normalized.ep);
    const unit = normalizeUnit(normalized.einheit);
    const currentUnit = String(row.einheit || "").trim();
    const currentGroupRaw = row.gruppe;
    const currentGroup = isPriceGroup(currentGroupRaw) ?
        currentGroupRaw :
        "Material";
    const inferredGroup = inferGroupFromText(normalized);
    const inferredUnit = inferUnitFromText(normalized);
    const suggestedEp = suggestedPriceForRow(normalized);
    if (!String(row.posNr || row.kurztext || "").trim()) {
        issues.push({
            rowId,
            severity: "error",
            field: "text",
            title: "Text fehlt",
            message: "Position hat weder Positionsnummer noch Kurztext."
        });
    }
    if (!currentUnit) {
        issues.push({
            rowId,
            severity: "error",
            field: "einheit",
            title: "Einheit fehlt",
            message: "Ohne Einheit darf die Position nicht gespeichert werden.",
            suggestion: { einheit: inferredUnit }
        });
    }
    else if (unit !== currentUnit) {
        issues.push({
            rowId,
            severity: "warning",
            field: "einheit",
            title: "Einheit wird normalisiert",
            message: `${currentUnit} sollte als ${unit} gespeichert werden.`,
            suggestion: { einheit: unit }
        });
    }
    if (!isPriceGroup(currentGroupRaw)) {
        issues.push({
            rowId,
            severity: "warning",
            field: "gruppe",
            title: "Gruppe ungültig",
            message: `Aktuelle Gruppe: ${String(currentGroupRaw || "—")}. Fachlich gesetzt wird: ${inferredGroup}.`,
            suggestion: { gruppe: inferredGroup }
        });
    }
    else if (currentGroup !== inferredGroup) {
        issues.push({
            rowId,
            severity: "warning",
            field: "gruppe",
            title: "Gruppe wahrscheinlich falsch",
            message: `Aktuelle Gruppe: ${currentGroup}. Fachlich wahrscheinlicher: ${inferredGroup}.`,
            suggestion: { gruppe: inferredGroup }
        });
    }
    if (!Number.isFinite(ep) || ep < 0) {
        issues.push({
            rowId,
            severity: "error",
            field: "preis",
            title: "Preis ungültig",
            message: "EP netto ist ungültig oder negativ."
        });
    }
    if (ep === 0) {
        issues.push({
            rowId,
            severity: "warning",
            field: "preis",
            title: "Preis ist 0",
            message: "Preis 0 darf nur für bewusst kostenlose Positionen übernommen werden.",
            suggestion: suggestedEp ? { ep: suggestedEp } : undefined
        });
    }
    const range = expectedRange(normalized);
    if (range && ep > 0) {
        if (ep < range.min) {
            issues.push({
                rowId,
                severity: "warning",
                field: "preis",
                title: "Preis auffällig niedrig",
                message: `${money(ep)} liegt unter ${money(range.min)}–${money(range.max)} (${range.label}).`,
                suggestion: suggestedEp ? { ep: suggestedEp } : undefined
            });
        }
        if (ep > range.max) {
            issues.push({
                rowId,
                severity: "warning",
                field: "preis",
                title: "Preis auffällig hoch",
                message: `${money(ep)} liegt über ${money(range.min)}–${money(range.max)} (${range.label}).`,
                suggestion: suggestedEp ? { ep: suggestedEp } : undefined
            });
        }
    }
    if (duplicates) {
        const arr = duplicates.get(duplicateKey(row));
        if (arr && arr.length > 1) {
            const best = bestDuplicateRow(arr);
            const isBest = getVisibleRowId(best) === rowId;
            issues.push({
                rowId,
                severity: isBest ? "info" : "warning",
                field: "duplikat",
                title: isBest ?
                    "Doppelter Eintrag - bester Eintrag" :
                    "Doppelter Eintrag - löschen möglich",
                message: isBest ?
                    `Es gibt ${arr.length} fachlich gleiche Einträge. Dieser Eintrag bleibt bevorzugt.` :
                    `Es gibt ${arr.length} fachlich gleiche Einträge. Dieser Eintrag ist weniger plausibel.`
            });
        }
    }
    return issues;
}
function keepRowsAndEnsureIds(rows) {
    const used = new Set();
    return rows.map((row) => {
        const normalized = normalizeRow(row);
        let id = getVisibleRowId(normalized);
        if (used.has(id))
            id = `${id}-${safeId()}`;
        used.add(id);
        return {
            ...normalized,
            id
        };
    });
}
function rowToEditor(row) {
    const corrected = normalizeRow(row);
    return {
        posNr: String(corrected.posNr || ""),
        kurztext: String(corrected.kurztext || ""),
        langtext: String(corrected.langtext || ""),
        einheit: normalizeUnit(corrected.einheit || "m"),
        ep: String(numberSafe(corrected.ep)),
        gruppe: (corrected.gruppe || "Material")
    };
}
function editorToCatalogRow(form, previous) {
    return normalizeRow({
        ...(previous || {}),
        id: previous ? getVisibleRowId(previous) : `manual-${form.posNr}-${safeId()}`,
        posNr: form.posNr.trim(),
        kurztext: form.kurztext.trim(),
        langtext: form.langtext.trim(),
        einheit: normalizeUnit(form.einheit.trim() || "m"),
        ep: numberSafe(form.ep),
        gruppe: form.gruppe
    });
}
function catalogToLvPos(row, existing) {
    const corrected = normalizeRow(row);
    const ep = numberSafe(corrected.ep);
    const menge = numberSafe(existing?.menge);
    return {
        id: existing?.id || safeId(),
        posNr: String(corrected.posNr || ""),
        parentPosNr: existing?.parentPosNr || "",
        sortIndex: existing?.sortIndex,
        kurztext: String(corrected.kurztext || ""),
        langtext: String(existing?.langtext || corrected.langtext || ""),
        bemerkung: existing?.bemerkung || "",
        einheit: normalizeUnit(corrected.einheit || ""),
        menge,
        preis: ep,
        gesamt: menge ? round2(menge * ep) : 0,
        waehrung: existing?.waehrung || "EUR",
        confidence: existing?.confidence,
        source: existing?.source || "manual",
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}
function lvToCatalog(row) {
    return normalizeRow({
        id: `lv-${row.id || safeId()}`,
        posNr: String(row.posNr || ""),
        kurztext: String(row.kurztext || ""),
        langtext: String(row.langtext || ""),
        einheit: normalizeUnit(row.einheit || ""),
        ep: numberSafe(row.preis),
        gruppe: "Material"
    });
}
function payloadRowToCatalog(row, index) {
    const posNr = String(row.posNr || row.pos || row.lvPos || "").trim();
    const kurztext = String(row.kurztext || row.text || row.title || "").trim();
    const langtext = String(row.langtext || "").trim();
    const einheit = normalizeUnit(row.einheit || row.unit || "m");
    const ep = numberSafe(row.preis ?? row.ep ?? row.finalUnitPrice ?? row.suggestedUnitPrice);
    return normalizeRow({
        id: `handoff-${posNr || index}-${safeId()}`,
        posNr,
        kurztext,
        langtext,
        einheit,
        ep,
        gruppe: "Material"
    });
}
function toRefKey(row) {
    const normalized = normalizeRow(row);
    const pos = String(normalized.posNr || "").trim();
    if (/^(LABOR|MACHINE|MATERIAL|OTHER):/i.test(pos))
        return pos.toUpperCase();
    const gruppe = String(normalized.gruppe || "").trim();
    if (gruppe === "Arbeiter")
        return `LABOR:${pos}`;
    if (gruppe === "Maschinen")
        return `MACHINE:${pos}`;
    if (gruppe === "Material")
        return `MATERIAL:${pos}`;
    return `OTHER:${pos}`;
}
function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function catalogCsvFromRows(rows) {
    const header = "PosNr;Kurztext;Einheit;EP;Gruppe";
    const lines = rows.map((rawRow) => {
        const row = normalizeRow(rawRow);
        return [
            csvCell(row.posNr),
            csvCell(row.kurztext),
            csvCell(normalizeUnit(row.einheit)),
            String(numberSafe(row.ep)).replace(".", ","),
            csvCell(row.gruppe || "Material")
        ].
            join(";");
    });
    return [header, ...lines].join("\n");
}
function datenbankCsvFromRows(rows) {
    const header = "posNr;kurztext;langtext;einheit;preis;gewerk;leistungsart;region";
    const body = rows.map((rawRow) => {
        const row = normalizeRow(rawRow);
        const gruppe = String(row.gruppe || "Material");
        const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
        const gewerk = text.includes("asphalt") || text.includes("pflaster") ?
            "Straßenbau" :
            text.includes("aushub") || text.includes("baugrube") || text.includes("graben") ?
                "Tiefbau / Erdarbeiten" :
                text.includes("steckdose") ||
                    text.includes("datendose") ||
                    text.includes("kabel") ||
                    text.includes("leitungsschutzschalter") ?
                    "Elektro" :
                    gruppe === "Material" ?
                        "Material" :
                        "Bauleistung";
        return [
            csvCell(row.posNr),
            csvCell(row.kurztext),
            csvCell(row.langtext || ""),
            csvCell(normalizeUnit(row.einheit)),
            String(numberSafe(row.ep)).replace(".", ","),
            csvCell(gewerk),
            csvCell(gruppe),
            csvCell("DE")
        ].
            join(";");
    });
    return [header, ...body].join("\n");
}
async function extractTextFromPdf(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const parts = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        const pageText = content.items.
            map((item) => String(item?.str || "")).
            join(" ").
            replace(/\s+/g, " ").
            trim();
        if (pageText)
            parts.push(pageText);
    }
    return parts.join("\n");
}
function rowsFromPdfText(text) {
    const clean = text.replace(/\r/g, "\n");
    const chunks = clean.
        split(/(?=(?:\d{2}\.\d{2}(?:\.\d{2,4})?(?:-[A-Z])?))/g).
        map((x) => x.replace(/\s+/g, " ").trim()).
        filter(Boolean);
    const rows = [];
    for (const chunk of chunks) {
        const posMatch = chunk.match(/\b\d{2}\.\d{2}(?:\.\d{2,4})?(?:-[A-Z])?\b/);
        if (!posMatch)
            continue;
        const posNr = posMatch[0];
        const unitMatch = chunk.match(/\b(m²|m2|qm|m³|m3|cbm|St|Stk|t|h|m|pauschal)\b/i);
        const unit = normalizeUnit(unitMatch?.[1] || inferUnitFromText({ kurztext: chunk }));
        const priceMatches = Array.from(chunk.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})|\d+(?:\.\d{2}))\s*(?:€|EUR)?/gi));
        const lastPrice = priceMatches.length ?
            numberSafe(priceMatches[priceMatches.length - 1][1]) :
            0;
        let kurztext = chunk.
            replace(posNr, "").
            replace(/\b(m²|m2|qm|m³|m3|cbm|St|Stk|t|h|m|pauschal)\b/gi, " ").
            replace(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})|\d+(?:\.\d{2}))\s*(?:€|EUR)?/gi, " ").
            replace(/\s+/g, " ").
            trim();
        if (kurztext.length > 140)
            kurztext = kurztext.slice(0, 140).trim();
        if (!kurztext)
            kurztext = "PDF-Position";
        rows.push(normalizeRow({
            id: `pdf-${posNr}-${safeId()}`,
            posNr,
            kurztext,
            langtext: chunk,
            einheit: unit,
            ep: lastPrice,
            gruppe: "Material",
            source: "pdf"
        }));
    }
    return keepRowsAndEnsureIds(rows);
}
export default function PreisePage() {
    const projectState = useProject();
    const project = getProjectFromState(projectState);
    const [cat, setCat] = useState([]);
    const [sourceMode, setSourceMode] = useState("catalog");
    const [viewMode, setViewMode] = useState("alle");
    const [query, setQuery] = useState("");
    const [gruppe, setGruppe] = useState("Alle");
    const [allWords, setAllWords] = useState(false);
    const [wholeWords, setWholeWords] = useState(true);
    const [selected, setSelected] = useState({});
    const [stat, setStat] = useState("");
    const [kiLearningRows, setKiLearningRows] = useState([]);
    const [qualityBusyId, setQualityBusyId] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [busyText, setBusyText] = useState("");
    const [rowMeta, setRowMeta] = useState({});
    const [pruefungDone, setPruefungDone] = useState(false);
    const [companyId, setCompanyId] = useState("");
    const [manual, setManual] = useState({
        posNr: "",
        kurztext: "",
        langtext: "",
        einheit: "m",
        ep: "0",
        gruppe: "Material"
    });
    const [editor, setEditor] = useState(null);
    const [editorRowId, setEditorRowId] = useState("");
    const fileRef = useRef(null);
    useEffect(() => {
        const id = "rlc-preise-spinner-style";
        if (document.getElementById(id))
            return;
        const style = document.createElement("style");
        style.id = id;
        style.innerHTML = `
      @keyframes rlcSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
        document.head.appendChild(style);
    }, []);
    useEffect(() => {
        loadCatalog();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        let alive = true;
        setCompanyId(String(project?.companyId || ""));
        async function loadCompanyId() {
            if (project?.companyId)
                return;
            if (!project?.id)
                return;
            try {
                const res = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}`), {
                    credentials: "include",
                    headers: withAuthHeaders({
                        "Content-Type": "application/json"
                    })
                });
                if (!res.ok)
                    return;
                const json = await res.json().catch(() => null);
                const cid = json?.project?.companyId ||
                    json?.companyId ||
                    json?.data?.companyId ||
                    "";
                if (alive && cid)
                    setCompanyId(String(cid));
            }
            catch {
                //
            }
        }
        loadCompanyId();
        return () => {
            alive = false;
        };
    }, [project?.id, project?.companyId]);
    async function runBusy(label, job) {
        if (busy)
            return;
        setBusy(true);
        setBusyText(label);
        setErr("");
        try {
            await new Promise((resolve) => setTimeout(resolve, 50));
            await job();
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
            setBusy(false);
            setBusyText("");
        }
    }
    function clearCheck() {
        setRowMeta({});
        setPruefungDone(false);
        setViewMode("alle");
    }
    function persistCatalog(rows) {
        const clean = keepRowsAndEnsureIds(rows);
        Catalog.setAll(clean);
        setCat(clean);
        return clean;
    }
    async function saveRowsToDatenbank(rows) {
        const validRows = rows.
            map(normalizeRow).
            filter((r) => String(r.posNr || r.kurztext || "").trim() &&
            String(r.einheit || "").trim() &&
            Number.isFinite(numberSafe(r.ep)));
        if (!validRows.length)
            return;
        const entries = validRows.map((r) => KalkulationsDatenbank.fromCalculatedPosition({
            quelle: "import",
            projektCode: projectCode(project),
            projektName: projectName(project),
            posNr: String(r.posNr || ""),
            kurztext: String(r.kurztext || ""),
            langtext: String(r.langtext || ""),
            einheit: String(r.einheit || ""),
            menge: 1,
            finalUnitPrice: numberSafe(r.ep),
            totalNet: numberSafe(r.ep),
            confidence: 0.75
        }));
        KalkulationsDatenbank.bulkUpsert(entries);
        try {
            const csvText = datenbankCsvFromRows(validRows);
            await fetch(apiUrl("/api/kalkulation/datenbank/import-csv"), {
                method: "POST",
                credentials: "include",
                headers: withAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    source: "company",
                    projectKey: projectCode(project),
                    csvText
                })
            });
        }
        catch {
            //
        }
    }
    async function loadKiLearningRows() {
        try {
            const res = await fetch(apiUrl("/api/kalkulation/datenbank?source=ki-learning&limit=50"), {
                method: "GET",
                credentials: "include",
                headers: withAuthHeaders()
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "KI-Learning konnte nicht geladen werden.");
            }
            const rows = Array.isArray(json.rows) ? json.rows : [];
            setKiLearningRows(rows);
            setStat(`KI-Learning geladen: ${rows.length.toLocaleString("de-DE")} Vorschläge.`);
        }
        catch (e) {
            setErr(e?.message || "KI-Learning konnte nicht geladen werden.");
        }
    }
    async function setQualityGateStatus(entry, status) {
        if (!entry.id)
            return;
        setQualityBusyId(entry.id);
        try {
            const res = await fetch(apiUrl(`/api/kalkulation/datenbank/${entry.id}/quality-gate`), {
                method: "PATCH",
                credentials: "include",
                headers: withAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    status,
                    note: `Quality Gate über Preise-UI gesetzt: ${status}`
                })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Quality Gate konnte nicht gespeichert werden.");
            }
            setKiLearningRows((prev) => prev.map((row) => row.id === entry.id ?
                {
                    ...row,
                    parameter: {
                        ...(row.parameter || {}),
                        qualityGateStatus: status
                    }
                } :
                row));
            setStat(`Quality Gate gesetzt: ${entry.posNr || entry.kurztext} → ${status}`);
        }
        catch (e) {
            setErr(e?.message || "Quality Gate konnte nicht gespeichert werden.");
        }
        finally {
            setQualityBusyId("");
        }
    }
    function kiLearningToCatalog(row) {
        return normalizeRow({
            id: `ki-learning-${row.id}`,
            posNr: row.posNr || "",
            kurztext: row.kurztext || "",
            langtext: row.langtext || "",
            einheit: row.einheit || "",
            ep: numberSafe(row.kosten?.epNetto),
            gruppe: "Material",
            source: "ki-learning"
        });
    }
    function loadKiLearningIntoCatalog() {
        const rows = keepRowsAndEnsureIds(kiLearningRows.map(kiLearningToCatalog));
        setSourceMode("catalog");
        setCat(rows);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setStat(`KI-Learning in Preisliste geladen: ${rows.length.toLocaleString("de-DE")} Positionen.`);
    }
    function loadCatalog() {
        const rows = keepRowsAndEnsureIds(Catalog.list());
        setSourceMode("catalog");
        setCat(rows);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setErr("");
        setStat("Katalog geladen.");
    }
    function loadFromLV() {
        const rows = keepRowsAndEnsureIds(LV.list().map(lvToCatalog));
        setSourceMode("lv");
        setCat(rows);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setErr("");
        setStat(`Aus LV geladen: ${rows.length.toLocaleString("de-DE")} Positionen.`);
    }
    function loadFromKiOrManuell() {
        const allRows = [];
        for (const key of [KI_HANDOFF_KEY, MANUELL_HANDOFF_KEY, ANGEBOT_HANDOFF_KEY]) {
            try {
                const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
                if (!raw)
                    continue;
                const parsed = JSON.parse(raw);
                const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
                rows.forEach((row, index) => {
                    allRows.push(payloadRowToCatalog(row, index));
                });
            }
            catch {
                //
            }
        }
        const clean = keepRowsAndEnsureIds(allRows.filter((r) => String(r.posNr || r.kurztext || "").trim()));
        setSourceMode("handoff");
        setCat(clean);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setErr("");
        setStat(clean.length ?
            `Aus KI/Manuell geladen: ${clean.length.toLocaleString("de-DE")} Positionen.` :
            "Keine KI/Manuell-Daten gefunden.");
    }
    async function importFile(file) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".pdf")) {
            const text = await extractTextFromPdf(file);
            const rows = rowsFromPdfText(text);
            if (!rows.length) {
                setErr("PDF wurde gelesen, aber keine Preispositionen erkannt.");
                return;
            }
            setSourceMode("pdf");
            setCat(rows);
            setSelected({});
            setEditor(null);
            setEditorRowId("");
            clearCheck();
            setStat(`PDF gelesen: ${rows.length.toLocaleString("de-DE")} Positionen erkannt.`);
            return;
        }
        const text = await file.text();
        const count = Catalog.importCSV(text);
        const next = keepRowsAndEnsureIds(Catalog.list());
        setSourceMode("catalog");
        setCat(next);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setStat(`CSV importiert: ${count.toLocaleString("de-DE")} Positionen.`);
    }
    function exportCSV() {
        const csv = catalogCsvFromRows(cat);
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "preise.csv";
        a.click();
        URL.revokeObjectURL(url);
    }
    function startPruefung() {
        const rows = cat.map(normalizeRow);
        const duplicates = buildDuplicateMap(rows);
        const nextMeta = {};
        for (const row of rows) {
            const id = getVisibleRowId(row);
            const issues = validatePriceRow(row, duplicates);
            const hasError = issues.some((x) => x.severity === "error");
            const hasWarning = issues.some((x) => x.severity === "warning");
            const duplicateGroup = duplicates.get(duplicateKey(row));
            const isDuplicate = !!duplicateGroup;
            const best = duplicateGroup ? bestDuplicateRow(duplicateGroup) : null;
            const keepBestDuplicate = best ? getVisibleRowId(best) === id : false;
            nextMeta[id] = {
                status: hasError ?
                    "error" :
                    hasWarning ?
                        "warning" :
                        isDuplicate ?
                            "duplicate" :
                            "ok",
                issues,
                score: rowProbabilityScore(row),
                isDuplicate,
                keepBestDuplicate
            };
        }
        setRowMeta(nextMeta);
        setPruefungDone(true);
        const errors = Object.values(nextMeta).filter((x) => x.status === "error").length;
        const warnings = Object.values(nextMeta).filter((x) => x.status === "warning" || x.status === "duplicate").length;
        const dups = Object.values(nextMeta).filter((x) => x.isDuplicate).length;
        setStat(`Prüfung abgeschlossen: ${errors} Fehler, ${warnings} Prüfen, ${dups} Doppelte.`);
    }
    function addManualPosition() {
        setErr("");
        setStat("");
        if (!manual.posNr.trim()) {
            setErr("Bitte Positionsnummer eintragen.");
            return;
        }
        if (!manual.kurztext.trim()) {
            setErr("Bitte Kurztext eintragen.");
            return;
        }
        const row = editorToCatalogRow(manual);
        const next = persistCatalog([row, ...cat]);
        setSelected({ [getVisibleRowId(row)]: true });
        setEditor(rowToEditor(row));
        setEditorRowId(getVisibleRowId(row));
        clearCheck();
        setManual({
            posNr: "",
            kurztext: "",
            langtext: "",
            einheit: "m",
            ep: "0",
            gruppe: manual.gruppe
        });
        saveRowsToDatenbank([row]);
        setStat(`Preisposition gespeichert. Gesamt: ${next.length.toLocaleString("de-DE")}.`);
    }
    function startEdit(row) {
        const id = getVisibleRowId(row);
        const original = cat.find((x) => getVisibleRowId(x) === id) || row;
        setSelected((prev) => ({
            ...prev,
            [getVisibleRowId(original)]: true
        }));
        setEditor(rowToEditor(original));
        setEditorRowId(getVisibleRowId(original));
    }
    async function saveEditedPosition() {
        setErr("");
        if (!editor || !editorRowId) {
            setErr("Keine Preisposition ausgewählt.");
            return;
        }
        if (!editor.posNr.trim()) {
            setErr("Positionsnummer darf nicht leer sein.");
            return;
        }
        if (!editor.kurztext.trim()) {
            setErr("Kurztext darf nicht leer sein.");
            return;
        }
        const prevRow = cat.find((row) => getVisibleRowId(row) === editorRowId);
        const edited = editorToCatalogRow(editor, prevRow);
        const next = cat.map((row) => getVisibleRowId(row) === editorRowId ? edited : row);
        const clean = persistCatalog(next);
        setSelected({ [getVisibleRowId(edited)]: true });
        setEditor(rowToEditor(edited));
        setEditorRowId(getVisibleRowId(edited));
        clearCheck();
        await saveRowsToDatenbank([edited]);
        const existingLv = LV.list().find((x) => String(x.posNr || "") === String(edited.posNr || ""));
        if (existingLv) {
            LV.upsert(catalogToLvPos(edited, existingLv));
        }
        setStat(`Preisposition gespeichert und in Kalkulationsdatenbank übernommen. Gesamt: ${clean.length.toLocaleString("de-DE")}.`);
    }
    async function saveSingleRow(row) {
        const normalized = normalizeRow(row);
        const next = cat.map((x) => getVisibleRowId(x) === getVisibleRowId(row) ? normalized : x);
        persistCatalog(next);
        await saveRowsToDatenbank([normalized]);
        clearCheck();
        setStat("Preisposition gespeichert und in Kalkulationsdatenbank übernommen.");
    }
    function deleteSingleRow(row) {
        const id = getVisibleRowId(row);
        const next = cat.filter((x) => getVisibleRowId(x) !== id);
        persistCatalog(next);
        setSelected((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
        });
        if (editorRowId === id) {
            setEditor(null);
            setEditorRowId("");
        }
        clearCheck();
        setStat("Preisposition gelöscht.");
    }
    function toggleRow(row, checked) {
        const rowId = getVisibleRowId(row);
        setSelected((prev) => ({
            ...prev,
            [rowId]: checked
        }));
        if (checked)
            startEdit(row);
        else if (editorRowId === rowId) {
            setEditor(null);
            setEditorRowId("");
        }
    }
    function toggleAll(checked) {
        const next = {};
        if (checked) {
            view.forEach((row) => {
                next[getVisibleRowId(row)] = true;
            });
        }
        setSelected(next);
    }
    function selectDuplicatesForDelete() {
        if (!pruefungDone) {
            setStat("Bitte zuerst Prüfung starten.");
            return;
        }
        const next = {};
        for (const row of cat) {
            const id = getVisibleRowId(row);
            const meta = rowMeta[id];
            if (meta?.isDuplicate && !meta.keepBestDuplicate) {
                next[id] = true;
            }
        }
        setSelected(next);
        setViewMode("doppelte");
        const count = Object.keys(next).length;
        setStat(`${count} weniger plausible Doppelte ausgewählt.`);
    }
    function deleteSelectedRows() {
        const ids = new Set(Object.entries(selected).
            filter(([, checked]) => checked).
            map(([id]) => id));
        if (!ids.size) {
            alert("Bitte zuerst Positionen auswählen.");
            return;
        }
        const next = cat.filter((row) => !ids.has(getVisibleRowId(row)));
        persistCatalog(next);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setStat(`${ids.size} ausgewählte Position(en) gelöscht.`);
    }
    function autoCorrectSelected() {
        const ids = new Set(Object.entries(selected).
            filter(([, checked]) => checked).
            map(([id]) => id));
        if (!ids.size) {
            alert("Bitte zuerst Positionen auswählen.");
            return;
        }
        const next = cat.map((row) => ids.has(getVisibleRowId(row)) ? autoCorrectRow(row) : normalizeRow(row));
        persistCatalog(next);
        setSelected({});
        setEditor(null);
        setEditorRowId("");
        clearCheck();
        setStat("Auswahl automatisch korrigiert und gespeichert. Prüfung bitte neu starten.");
    }
    function writeSelectedToLV() {
        if (!selectedRows.length) {
            alert("Bitte mindestens eine Position auswählen.");
            return;
        }
        const current = LV.list();
        const map = new Map(current.map((x) => [String(x.posNr || ""), x]));
        let inserted = 0;
        let updated = 0;
        for (const rawRow of selectedRows) {
            const row = normalizeRow(rawRow);
            const found = map.get(String(row.posNr || ""));
            LV.upsert(catalogToLvPos(row, found));
            if (found)
                updated += 1;
            else
                inserted += 1;
        }
        setStat(`Zum LV übernommen — neu: ${inserted}, aktualisiert: ${updated}.`);
    }
    async function saveSelectedToDatenbank() {
        if (!selectedRows.length) {
            alert("Bitte mindestens eine Position auswählen.");
            return;
        }
        await saveRowsToDatenbank(selectedRows);
        setStat(`${selectedRows.length} Position(en) in Kalkulationsdatenbank gespeichert.`);
    }
    const tokens = useMemo(() => {
        const t = norm(query).split(/[^a-z0-9.]+/g).filter(Boolean);
        return Array.from(new Set(t));
    }, [query]);
    const view = useMemo(() => {
        const matchRow = (row) => {
            if (!tokens.length)
                return true;
            const hay = norm(`${row.posNr ?? ""} ${row.kurztext ?? ""} ${row.langtext ?? ""}`);
            const check = (tok) => {
                if (!wholeWords)
                    return hay.includes(tok);
                const re = new RegExp(`(^|\\W)${escapeRegex(tok)}(\\W|$)`, "i");
                return re.test(hay);
            };
            return allWords ? tokens.every(check) : tokens.some(check);
        };
        let rows = cat;
        if (gruppe !== "Alle") {
            rows = rows.filter((x) => (normalizeRow(x).gruppe || "") === gruppe);
        }
        rows = rows.filter(matchRow);
        if (viewMode !== "alle") {
            rows = rows.filter((row) => {
                const meta = rowMeta[getVisibleRowId(row)];
                const normalized = normalizeRow(row);
                if (viewMode === "epFehlt") {
                    return numberSafe(normalized.ep) <= 0;
                }
                if (viewMode === "einheitFehlt") {
                    return !String(normalizeUnit(normalized.einheit || "")).trim();
                }
                if (viewMode === "pruefen") {
                    return meta?.status === "warning" || meta?.status === "duplicate";
                }
                if (viewMode === "fehler")
                    return meta?.status === "error";
                if (viewMode === "doppelte")
                    return !!meta?.isDuplicate;
                return true;
            });
        }
        return rows.slice(0, 700);
    }, [cat, gruppe, tokens, allWords, wholeWords, viewMode, rowMeta]);
    const counts = useMemo(() => {
        const result = {
            Alle: 0,
            Material: 0,
            Arbeiter: 0,
            Maschinen: 0
        };
        for (const rawRow of cat) {
            const row = normalizeRow(rawRow);
            result.Alle += 1;
            if (row.gruppe === "Material")
                result.Material += 1;
            if (row.gruppe === "Arbeiter")
                result.Arbeiter += 1;
            if (row.gruppe === "Maschinen")
                result.Maschinen += 1;
        }
        return result;
    }, [cat]);
    const selectedRows = useMemo(() => view.filter((row) => selected[getVisibleRowId(row)]), [view, selected]);
    const selectedSum = useMemo(() => selectedRows.reduce((sum, row) => sum + numberSafe(row.ep), 0), [selectedRows]);
    const metaValues = useMemo(() => Object.values(rowMeta), [rowMeta]);
    const warningCount = metaValues.filter((x) => x.status === "warning" || x.status === "duplicate").length;
    const errorCount = metaValues.filter((x) => x.status === "error").length;
    const duplicateCount = metaValues.filter((x) => x.isDuplicate).length;
    React.useEffect(() => {
        function handlePreiseCommand(event) {
            const detail = event.detail;
            if (!detail)
                return;
            const filter = String(detail.filter || "");
            const action = String(detail.action || "");
            if (filter === "alle")
                setViewMode("alle");
            if (filter === "pruefen")
                setViewMode("pruefen");
            if (filter === "fehler")
                setViewMode("fehler");
            if (filter === "doppelte")
                setViewMode("doppelte");
            if (filter === "epFehlt")
                setViewMode("epFehlt");
            if (filter === "einheitFehlt")
                setViewMode("einheitFehlt");
            if (action === "loadCatalog") {
                void runBusy("Katalog wird geladen…", loadCatalog);
            }
            if (action === "loadFromLV") {
                void runBusy("LV wird geladen…", loadFromLV);
            }
            if (action === "loadFromKiOrManuell") {
                void runBusy("KI/Manuell wird geladen…", loadFromKiOrManuell);
            }
            if (action === "startPruefung") {
                void runBusy("Preisprüfung läuft…", startPruefung);
            }
            if (action === "selectDuplicates") {
                if (!pruefungDone)
                    startPruefung();
                window.setTimeout(() => selectDuplicatesForDelete(), 80);
            }
            if (action === "autoCorrectSelected") {
                void runBusy("Auswahl wird korrigiert…", autoCorrectSelected);
            }
            if (action === "deleteSelected") {
                deleteSelectedRows();
            }
            if (action === "saveSelectedToDatenbank") {
                void runBusy("Auswahl wird gespeichert…", saveSelectedToDatenbank);
            }
            if (action === "writeSelectedToLV") {
                writeSelectedToLV();
            }
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
        window.addEventListener("rlc:preise-command", handlePreiseCommand);
        return () => {
            window.removeEventListener("rlc:preise-command", handlePreiseCommand);
        };
    });
    return (_jsxs("div", { className: rlcClass(null, page), children: [busy ?
                _jsx("div", { className: rlcClass(null, busyOverlay), children: _jsxs("div", { className: rlcClass(null, busyBox), children: [_jsx("div", { className: rlcClass(null, spinner) }), _jsxs("div", { children: [_jsx("div", { className: rlcClass(null, busyTitle), children: "Bitte warten" }), _jsx("div", { className: rlcClass(null, busySub), children: busyText || "Vorgang läuft…" })] })] }) }) :
                null, _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Kalkulationsdatenbank" }), _jsx("h1", { className: rlcClass(null, title), children: "Preise einf\u00FCgen" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Preispositionen importieren, bearbeiten, speichern, Doppelte bereinigen und direkt in die Kalkulationsdatenbank \u00FCbernehmen." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: () => fileRef.current?.click(), children: "CSV / PDF importieren" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: exportCSV, children: "CSV-Export" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: () => runBusy("Katalog wird geladen…", loadCatalog), children: "Katalog laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: () => runBusy("LV wird geladen…", loadFromLV), children: "Aus LV laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: () => runBusy("KI/Manuell wird geladen…", loadFromKiOrManuell), children: "Aus KI / Manuell laden" }), _jsx("button", { className: rlcClass(null, btnWarning), disabled: busy || !cat.length, onClick: () => runBusy("Preisprüfung läuft…", startPruefung), children: "Pr\u00FCfung starten" }), _jsx("button", { className: rlcClass(null, btnWarning), disabled: busy || !pruefungDone, onClick: selectDuplicatesForDelete, children: "Doppelte ausw\u00E4hlen" }), _jsx("button", { className: rlcClass(null, btnDanger), disabled: busy || !Object.values(selected).some(Boolean), onClick: deleteSelectedRows, children: "Ausgew\u00E4hlte l\u00F6schen" }), _jsx("button", { className: rlcClass(null, btnPrimary), disabled: busy || !selectedRows.length, onClick: () => runBusy("Datenbank wird gespeichert…", saveSelectedToDatenbank), children: "Auswahl in Datenbank speichern" }), _jsx("button", { className: rlcClass(null, btnPrimary), disabled: busy || !selectedRows.length, onClick: writeSelectedToLV, children: "Auswahl ins LV" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectLabel(project) }), _jsx("span", { children: " \u00B7 Quelle: " }), _jsx("b", { children: sourceMode === "catalog" ?
                                    "Katalog" :
                                    sourceMode === "lv" ?
                                        "LV" :
                                        sourceMode === "pdf" ?
                                            "PDF" :
                                            "KI / Manuell" }), _jsx("span", { children: " \u00B7 Pr\u00FCfung: " }), _jsx("b", { children: pruefungDone ? "durchgeführt" : "nicht gestartet" }), _jsx("span", { children: " \u00B7 CompanyId: " }), _jsx("b", { children: companyId || "—" })] }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv,.pdf", onChange: (e) => {
                            const file = e.target.files?.[0];
                            if (!file)
                                return;
                            runBusy("Datei wird importiert…", () => importFile(file)).finally(() => {
                                if (fileRef.current)
                                    fileRef.current.value = "";
                            });
                        }, className: "rlc-migrated-pages-kalkulation-preise-tsx-920" })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(KpiCard, { label: "Katalog", value: cat.length.toLocaleString("de-DE"), sub: "geladene Positionen" }), _jsx(KpiCard, { label: "Ansicht", value: view.length.toLocaleString("de-DE"), sub: `Filter: ${viewMode}` }), _jsx(KpiCard, { label: "Ausgew\u00E4hlt", value: selectedRows.length.toLocaleString("de-DE"), sub: money(selectedSum) }), _jsx(KpiCard, { label: "Pr\u00FCfung", value: pruefungDone ?
                            `${errorCount} Fehler / ${warningCount} Prüfen` :
                            "nicht gestartet", sub: pruefungDone ? `${duplicateCount.toLocaleString("de-DE")} Doppelte` : "schneller Startmodus" })] }), editor ?
                _jsxs("section", { className: rlcClass(null, editCard), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Preisposition bearbeiten" }), _jsx("div", { className: rlcClass(null, sectionText), children: "\u00C4nderungen werden lokal und in der Kalkulationsdatenbank gespeichert." })] }), _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsx("button", { className: rlcClass(null, btnPrimary), disabled: busy, onClick: () => runBusy("Preisposition wird gespeichert…", saveEditedPosition), children: "Speichern" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: () => {
                                                if (editor && editorRowId) {
                                                    const row = cat.find((x) => getVisibleRowId(x) === editorRowId);
                                                    if (row)
                                                        LV.upsert(catalogToLvPos(editorToCatalogRow(editor, row)));
                                                    setStat("Preis ins LV geschrieben.");
                                                }
                                            }, children: "Ins LV schreiben" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy, onClick: () => {
                                                setEditor(null);
                                                setEditorRowId("");
                                            }, children: "Editor schlie\u00DFen" })] })] }), _jsxs("div", { className: rlcClass(null, manualGrid), children: [_jsx(Field, { label: "PosNr / Ref", children: _jsx("input", { value: editor.posNr, onChange: (e) => setEditor({ ...editor, posNr: e.target.value }), className: rlcClass(null, input) }) }), _jsx(Field, { label: "Kurztext", children: _jsx("input", { value: editor.kurztext, onChange: (e) => setEditor({ ...editor, kurztext: e.target.value }), className: rlcClass(null, input) }) }), _jsx(Field, { label: "Einheit", children: _jsx("input", { value: editor.einheit, onChange: (e) => setEditor({ ...editor, einheit: e.target.value }), className: rlcClass(null, input) }) }), _jsx(Field, { label: "EP netto", children: _jsx("input", { type: "number", value: editor.ep, onChange: (e) => setEditor({ ...editor, ep: e.target.value }), className: rlcClass(null, inputStrong) }) }), _jsx(Field, { label: "Gruppe", children: _jsxs("select", { value: editor.gruppe, onChange: (e) => setEditor({
                                            ...editor,
                                            gruppe: e.target.value
                                        }), className: rlcClass(null, input), children: [_jsx("option", { value: "Material", children: "Material" }), _jsx("option", { value: "Arbeiter", children: "Arbeiter" }), _jsx("option", { value: "Maschinen", children: "Maschinen" })] }) })] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-921", children: _jsx(Field, { label: "Langtext / Beschreibung", children: _jsx("textarea", { value: editor.langtext, onChange: (e) => setEditor({ ...editor, langtext: e.target.value }), className: rlcClass(null, { ...input, minHeight: 76 }) }) }) })] }) :
                null, _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Neue Preisposition" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Neue Position wird direkt lokal gespeichert und in die Datenbank \u00FCbernommen." })] }) }), _jsxs("div", { className: rlcClass(null, manualGrid), children: [_jsx(Field, { label: "PosNr / Ref", children: _jsx("input", { value: manual.posNr, onChange: (e) => setManual({ ...manual, posNr: e.target.value }), className: rlcClass(null, input), placeholder: "z.B. MAT-001" }) }), _jsx(Field, { label: "Kurztext", children: _jsx("input", { value: manual.kurztext, onChange: (e) => setManual({ ...manual, kurztext: e.target.value }), className: rlcClass(null, input), placeholder: "z.B. Facharbeiter / Bagger / Kies" }) }), _jsx(Field, { label: "Einheit", children: _jsx("input", { value: manual.einheit, onChange: (e) => setManual({ ...manual, einheit: e.target.value }), className: rlcClass(null, input), placeholder: "m, m\u00B2, m\u00B3, h, St" }) }), _jsx(Field, { label: "EP netto", children: _jsx("input", { type: "number", value: manual.ep, onChange: (e) => setManual({ ...manual, ep: e.target.value }), className: rlcClass(null, input) }) }), _jsx(Field, { label: "Gruppe", children: _jsxs("select", { value: manual.gruppe, onChange: (e) => setManual({
                                        ...manual,
                                        gruppe: e.target.value
                                    }), className: rlcClass(null, input), children: [_jsx("option", { value: "Material", children: "Material" }), _jsx("option", { value: "Arbeiter", children: "Arbeiter" }), _jsx("option", { value: "Maschinen", children: "Maschinen" })] }) })] }), _jsx("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-922", children: _jsx(Field, { label: "Langtext / Beschreibung", children: _jsx("textarea", { value: manual.langtext, onChange: (e) => setManual({ ...manual, langtext: e.target.value }), className: rlcClass(null, { ...input, minHeight: 70 }) }) }) }), _jsx("div", { className: rlcClass(null, buttonRow), children: _jsx("button", { className: rlcClass(null, btnPrimary), disabled: busy, onClick: () => runBusy("Preisposition wird gespeichert…", addManualPosition), children: "Preisposition speichern" }) })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Suche & Filter" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Pr\u00FCfung und Doppelerkennung laufen nur nach Klick auf \u201EPr\u00FCfung starten\u201C." })] }), _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsx("button", { className: rlcClass(null, viewMode === "alle" ? btnPrimary : btnSecondary), disabled: busy, onClick: () => setViewMode("alle"), children: "Alle" }), _jsx("button", { className: rlcClass(null, viewMode === "pruefen" ? btnWarning : btnSecondary), disabled: busy || !pruefungDone, onClick: () => setViewMode("pruefen"), children: "Pr\u00FCfen" }), _jsx("button", { className: rlcClass(null, viewMode === "fehler" ? btnDanger : btnSecondary), disabled: busy || !pruefungDone, onClick: () => setViewMode("fehler"), children: "Fehler" }), _jsx("button", { className: rlcClass(null, viewMode === "doppelte" ? btnWarning : btnSecondary), disabled: busy || !pruefungDone, onClick: () => setViewMode("doppelte"), children: "Doppelte" })] })] }), _jsxs("div", { className: rlcClass(null, toolbarGrid), children: [_jsx("input", { placeholder: "Suche\u2026 PosNr, Kurztext, Langtext", value: query, onChange: (e) => setQuery(e.target.value), className: rlcClass(null, input) }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: allWords, onChange: (e) => setAllWords(e.target.checked) }), "Alle W\u00F6rter"] }), _jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: wholeWords, onChange: (e) => setWholeWords(e.target.checked) }), "Ganze W\u00F6rter"] })] }), _jsx("div", { className: rlcClass(null, chipRow), children: gruppen.map((g) => _jsxs("button", { type: "button", disabled: busy, onClick: () => setGruppe(g), className: rlcClass(null, gruppe === g ? chipActive : chip), children: [g, _jsx("span", { className: "rlc-migrated-pages-kalkulation-preise-tsx-923", children: counts[g].toLocaleString("de-DE") })] }, g)) }), _jsx("div", { className: rlcClass(null, actionBox), children: _jsxs("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-924", children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "KI-Learning / Quality Gate" }), _jsx("div", { className: rlcClass(null, sectionText), children: "KI-Vorschl\u00E4ge pr\u00FCfen, freigeben, sperren oder in die Preisliste laden." })] }), _jsxs("div", { className: rlcClass(null, buttonRow), children: [_jsx("button", { className: rlcClass(null, btnPrimary), disabled: busy, onClick: () => runBusy("KI-Learning wird geladen…", loadKiLearningRows), children: "KI-Vorschl\u00E4ge laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: busy || !kiLearningRows.length, onClick: loadKiLearningIntoCatalog, children: "In Preisliste anzeigen" })] }), kiLearningRows.length ?
                                    _jsx("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-925", children: kiLearningRows.slice(0, 20).map((entry) => {
                                            const status = entry.parameter?.qualityGateStatus || "KI-Vorschlag";
                                            const ep = numberSafe(entry.kosten?.epNetto);
                                            return (_jsxs("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-926", children: [_jsxs("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-927", children: [entry.posNr || "ohne Pos.", " \u00B7 ", entry.kurztext || "Ohne Kurztext"] }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-928", children: ["EP: ", _jsx("b", { children: money(ep) }), " \u00B7 ME: ", _jsx("b", { children: entry.einheit || "-" }), " \u00B7 Vertrauen:", " ", _jsxs("b", { children: [Math.round(numberSafe(entry.confidence) * 100), "%"] }), " \u00B7 Status:", " ", _jsx("b", { children: status })] }), entry.parameter?.warning ?
                                                        _jsxs("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-929", children: ["\u26A0 ", entry.parameter.warning] }) :
                                                        null, _jsx("div", { className: "rlc-migrated-pages-kalkulation-preise-tsx-930", children: QUALITY_GATE_STATUSES.map((s) => _jsx("button", { type: "button", className: rlcClass(null, s === status ? btnPrimary : btnSecondary), disabled: qualityBusyId === entry.id, onClick: () => setQualityGateStatus(entry, s), children: s }, s)) })] }, entry.id));
                                        }) }) :
                                    null] }) }), _jsxs("div", { className: rlcClass(null, actionBox), children: [_jsx("button", { className: rlcClass(null, btnWarning), disabled: busy || !selectedRows.length, onClick: () => runBusy("Auswahl wird korrigiert…", autoCorrectSelected), children: "Auswahl automatisch korrigieren" }), _jsx("button", { className: rlcClass(null, btnWarning), disabled: busy || !pruefungDone, onClick: selectDuplicatesForDelete, children: "Doppelte ausw\u00E4hlen" }), _jsx("button", { className: rlcClass(null, btnDanger), disabled: busy || !Object.values(selected).some(Boolean), onClick: deleteSelectedRows, children: "Ausgew\u00E4hlte l\u00F6schen" }), _jsx("button", { className: rlcClass(null, btnPrimary), disabled: busy || !selectedRows.length, onClick: () => runBusy("Auswahl wird gespeichert…", saveSelectedToDatenbank), children: "Auswahl in Datenbank speichern" })] }), err ? _jsx("div", { className: rlcClass(null, alertError), children: err }) : null, stat ? _jsx("div", { className: rlcClass(null, alertSuccess), children: stat }) : null] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Preispositionen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Maximal 700 Zeilen sichtbar. F\u00FCr gro\u00DFe Preislisten Suche/Filter verwenden." })] }), _jsxs("label", { className: rlcClass(null, selectAllBox), children: [_jsx("input", { type: "checkbox", disabled: busy, onChange: (e) => toggleAll(e.target.checked) }), "Sichtbare ausw\u00E4hlen"] })] }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, thSmall) }), _jsx("th", { className: rlcClass(null, th), children: "Pr\u00FCfung" }), _jsx("th", { className: rlcClass(null, th), children: "PosNr" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "Langtext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP netto" }), _jsx("th", { className: rlcClass(null, th), children: "Gruppe" }), _jsx("th", { className: rlcClass(null, th), children: "Score" }), _jsx("th", { className: rlcClass(null, th), children: "refKey" }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsxs("tbody", { children: [view.map((row, i) => {
                                            const normalized = normalizeRow(row);
                                            const rowId = getVisibleRowId(row);
                                            const meta = rowMeta[rowId];
                                            const isSelected = !!selected[rowId];
                                            return (_jsxs("tr", { className: rlcClass(null, {
                                                    background: isSelected ?
                                                        "#EAF2FF" :
                                                        i % 2 ?
                                                            "#FCFCFC" :
                                                            "#FFFFFF"
                                                }), onDoubleClick: () => !busy && startEdit(row), children: [_jsx("td", { className: rlcClass(null, tdCenter), children: _jsx("input", { type: "checkbox", disabled: busy, checked: isSelected, onChange: (e) => toggleRow(row, e.target.checked) }) }), _jsx("td", { className: rlcClass(null, td), children: !pruefungDone ?
                                                            _jsx("span", { className: rlcClass(null, pillNeutral), children: "\u2014" }) :
                                                            meta?.status === "error" ?
                                                                _jsx("span", { className: rlcClass(null, pillError), children: "Fehler" }) :
                                                                meta?.status === "warning" ?
                                                                    _jsx("span", { className: rlcClass(null, pillWarning), children: "Pr\u00FCfen" }) :
                                                                    meta?.status === "duplicate" ?
                                                                        _jsx("span", { className: rlcClass(null, pillWarning), children: meta.keepBestDuplicate ? "Duplikat behalten" : "Duplikat" }) :
                                                                        _jsx("span", { className: rlcClass(null, pillOk), children: "OK" }) }), _jsx("td", { className: rlcClass(null, tdMono), children: normalized.posNr }), _jsx("td", { className: rlcClass(null, td), children: normalized.kurztext }), _jsx("td", { className: rlcClass(null, tdMuted), children: String(normalized.langtext || "").trim() || "—" }), _jsx("td", { className: rlcClass(null, td), children: normalizeUnit(normalized.einheit) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(normalized.ep) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, groupBadge(normalized.gruppe)), children: normalized.gruppe || "—" }) }), _jsx("td", { className: rlcClass(null, tdMono), children: pruefungDone ? meta?.score ?? "—" : "—" }), _jsx("td", { className: rlcClass(null, tdMono), children: toRefKey(normalized) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("div", { className: rlcClass(null, rowActions), children: [_jsx("button", { className: rlcClass(null, btnMini), disabled: busy, onClick: () => startEdit(row), children: "Bearbeiten" }), _jsx("button", { className: rlcClass(null, btnMiniPrimary), disabled: busy, onClick: () => runBusy("Preis wird gespeichert…", () => saveSingleRow(row)), children: "Speichern" }), _jsx("button", { className: rlcClass(null, btnMiniDanger), disabled: busy, onClick: () => deleteSingleRow(row), children: "L\u00F6schen" })] }) })] }, rowId));
                                        }), !view.length ?
                                            _jsx("tr", { children: _jsx("td", { colSpan: 11, className: rlcClass(null, emptyCell), children: "Kein Ergebnis. Bitte CSV/PDF importieren, Preisposition erfassen oder Daten aus LV / KI / Manuell laden." }) }) :
                                            null] })] }) })] })] }));
}
function KpiCard({ label, value, sub }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, kpiValue), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-preise-tsx-931", children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
function groupBadge(gruppe) {
    if (gruppe === "Material")
        return badgeGreen;
    if (gruppe === "Arbeiter")
        return badgeBlue;
    if (gruppe === "Maschinen")
        return badgeOrange;
    return badgeNeutral;
}
/* ================= STYLES ================= */
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const busyOverlay = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(15,23,42,0.28)",
    display: "grid",
    placeItems: "center",
    backdropFilter: "blur(2px)"
};
const busyBox = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: "18px 22px",
    boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
    minWidth: 340
};
const busyTitle = {
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A"
};
const busySub = {
    marginTop: 3,
    fontSize: 13,
    color: "#64748B",
    fontWeight: 600
};
const spinner = {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "4px solid #DBEAFE",
    borderTopColor: "#146EF5",
    animation: "rlcSpin 0.8s linear infinite"
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
    maxWidth: 1120,
    opacity: 0.88,
    lineHeight: 1.55
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.9
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
    fontSize: 22,
    color: "#0F172A",
    fontWeight: 700
};
const kpiSub = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const editCard = {
    ...card,
    border: "1px solid #BED6FF",
    background: "#F8FBFF"
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
const manualGrid = {
    display: "grid",
    gridTemplateColumns: "1fr 1.7fr 110px 120px 150px",
    gap: 10,
    alignItems: "end"
};
const toolbarGrid = {
    display: "grid",
    gridTemplateColumns: "minmax(260px,1fr) auto auto",
    gap: 10,
    alignItems: "center"
};
const input = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box"
};
const inputStrong = {
    ...input,
    border: "1px solid #146EF5",
    background: "#EAF2FF",
    fontWeight: 700
};
const labelStyle = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const checkLabel = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#334155",
    fontWeight: 600,
    whiteSpace: "nowrap"
};
const chipRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12
};
const chip = {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    borderRadius: 999,
    padding: "7px 12px",
    cursor: "pointer",
    fontWeight: 700,
    color: "#334155"
};
const chipActive = {
    ...chip,
    border: "1px solid #146EF5",
    background: "#EAF2FF",
    color: "#0B5BD3"
};
const actionBox = {
    marginTop: 14,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    paddingTop: 14,
    borderTop: "1px solid #E5E7EB"
};
const buttonRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
};
const selectAllBox = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#FFFFFF"
};
const alertError = {
    marginTop: 12,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600
};
const alertSuccess = {
    marginTop: 12,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600
};
const tableWrap = {
    overflow: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
    minWidth: 1380,
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
const thSmall = {
    ...th,
    width: 42,
    textAlign: "center"
};
const td = {
    padding: "9px",
    fontSize: 13,
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    verticalAlign: "middle"
};
const tdMuted = {
    ...td,
    color: "#64748B",
    maxWidth: 320,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap",
    fontWeight: 700
};
const tdCenter = {
    ...td,
    textAlign: "center"
};
const tdMono = {
    ...td,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12
};
const emptyCell = {
    padding: 16,
    color: "#64748B",
    fontSize: 13
};
const rowActions = {
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
const btnWarning = {
    ...btnBase,
    border: "1px solid #F59E0B",
    background: "#FFFBEB",
    color: "#92400E"
};
const btnDanger = {
    ...btnBase,
    border: "1px solid #EF4444",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const btnMini = {
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    background: "#FFFFFF",
    color: "#0F172A"
};
const btnMiniPrimary = {
    ...btnMini,
    border: "1px solid #146EF5",
    background: "#EAF2FF",
    color: "#0B5BD3"
};
const btnMiniDanger = {
    ...btnMini,
    border: "1px solid #EF4444",
    background: "#FEF2F2",
    color: "#B91C1C"
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
const badgeGreen = {
    ...badgeNeutral,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D"
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
const pillOk = {
    display: "inline-flex",
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700
};
const pillNeutral = {
    ...pillOk,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#64748B"
};
const pillWarning = {
    ...pillOk,
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#92400E"
};
const pillError = {
    ...pillOk,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
