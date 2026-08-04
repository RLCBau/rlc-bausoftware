import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
import { API_BASE } from "../../lib/apiBase";
function projectObject(ctx) {
    return ctx?.project || ctx?.currentProject || ctx?.selectedProject || ctx?.current || ctx || {};
}
function projectKey(ctx) {
    const p = projectObject(ctx);
    return String(p?.code || p?.projectCode || p?.number || ctx?.projectCode || p?.id || ctx?.projectId || ctx?.id || "").trim();
}
function projectTitle(ctx) {
    const p = projectObject(ctx);
    const code = projectKey(ctx);
    return code ? `${code} — ${String(p?.name || p?.projectName || "Projekt")}` : "Kein Projekt gewählt";
}
function apiUrl(path) {
    const base = String(API_BASE || "").replace(/\/+$/, "");
    const clean = path.startsWith("/") ? path : `/${path}`;
    if (!base)
        return clean;
    if (base.endsWith("/api") && clean.startsWith("/api/"))
        return `${base}${clean.slice(4)}`;
    return `${base}${clean}`;
}
function token() {
    for (const key of ["token", "authToken", "accessToken", "jwt", "rlc_token", "rlc_auth_token", "rlc_access_token", "rlc.accessToken"]) {
        const value = localStorage.getItem(key);
        if (value?.trim())
            return value.trim();
    }
    for (const key of ["auth", "user", "session", "rlc_auth", "rlc_session"]) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "null");
            const value = parsed?.token ?? parsed?.accessToken ?? parsed?.authToken ?? parsed?.jwt ?? parsed?.data?.token ?? parsed?.data?.accessToken;
            if (typeof value === "string" && value.trim())
                return value.trim();
        }
        catch { }
    }
    return "";
}
async function getJson(path) {
    const auth = token();
    const response = await fetch(apiUrl(path), {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.json();
}
async function postJson(path) {
    const auth = token();
    const response = await fetch(apiUrl(path), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(auth ? { Authorization: `Bearer ${auth}` } : {})
        }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = String(payload?.error || payload?.message || `HTTP ${response.status}`);
        throw new Error(message);
    }
    return payload;
}
async function postJsonBody(path, body) {
    const auth = token();
    const response = await fetch(apiUrl(path), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(auth ? { Authorization: `Bearer ${auth}` } : {})
        },
        body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
        const message = String(payload?.error || payload?.message || `HTTP ${response.status}`);
        throw new Error(message);
    }
    return payload;
}
function readRows(key) {
    for (const storageKey of [
        `rlc_kalkulation_mit_ki_elite_v1:${key}`,
        `rlc_lv_data_v1:${key}`,
        `RLC_POSITIONLV_${key}`
    ]) {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
            const rows = Array.isArray(parsed) ? parsed : parsed?.rows || parsed?.items || parsed?.positions || [];
            if (Array.isArray(rows) && rows.length)
                return rows;
        }
        catch { }
    }
    return [];
}
function num(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim();
    if (!raw)
        return 0;
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\s/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
function ep(row) {
    return num(row?.finalUnitPrice ?? row?.rlcKiUnitPrice ?? row?.preis ?? row?.unitPriceNet ?? row?.ep);
}
function gp(row) {
    return num(row?.gesamt ?? row?.totalNet ?? row?.gp) || num(row?.menge ?? row?.quantity) * ep(row);
}
function confidence(row) {
    const value = num(row?.confidence);
    return value > 1 ? value / 100 : value;
}
function structure(row) {
    const text = `${row?.source || ""} ${row?.calculationStatus || ""} ${row?.aiReason || ""}`.toLowerCase();
    return text.includes("structure") || text.includes("gliederungsposition") || text.includes("keine kalkulatorische leistungsposition");
}
function hasUrk(row) {
    const method = sourceLabel(row);
    const technicalSource = String(row?.constructionIntelligence?.finalSource ||
        row?.finalSource ||
        row?.source ||
        row?.calculationSource ||
        row?.priceSource ||
        "").toLowerCase();
    return (method === "Urkalkulation" ||
        method === "Rückwärtskalkulation" ||
        technicalSource.includes("recipe") ||
        technicalSource.includes("urkalkulation") ||
        technicalSource.includes("reverse") ||
        Array.isArray(row?.priceBreakdown) && row.priceBreakdown.length > 0 ||
        Array.isArray(row?.recipeLines) && row.recipeLines.length > 0 ||
        Array.isArray(row?.breakdown) && row.breakdown.length > 0 ||
        Array.isArray(row?.costLines) && row.costLines.length > 0 ||
        num(row?.urkalkulationUnitPrice) > 0 ||
        num(row?.urkalkulationTotal) > 0 ||
        num(row?.recipeUnitPrice) > 0);
}
function sourceLabel(row) {
    const s = String(row?.constructionIntelligence?.finalSource || row?.finalSource || row?.source || "").toLowerCase();
    if (s.includes("company") || s.includes("firma"))
        return "Firmenwissen";
    if (s.includes("global"))
        return "Globales Wissen";
    if (s.includes("recipe") || s.includes("urkalkulation"))
        return "Urkalkulation";
    if (s.includes("reverse"))
        return "Rückwärtskalkulation";
    if (s.includes("technical") || s.includes("parser"))
        return "Technische Analyse";
    if (s.includes("market"))
        return "Marktbeobachtung";
    if (s.includes("internet"))
        return "Internetbeobachtung";
    if (s.includes("database") || s.includes("datenbank"))
        return "Vergleichbare Positionen";
    if (s.includes("rule") || s.includes("fallback"))
        return "Regelbasierte Berechnung";
    if (s.includes("server"))
        return "Serverberechnung";
    return s ? "Weitere Quelle" : "Nicht zugeordnet";
}
function engines(rows) {
    const relevant = rows.filter((r) => !structure(r));
    const map = new Map();
    for (const row of relevant) {
        const label = sourceLabel(row);
        const current = map.get(label) || { count: 0, conf: 0 };
        current.count += 1;
        current.conf += confidence(row);
        map.set(label, current);
    }
    return [...map.entries()].map(([label, v]) => ({
        label, count: v.count, share: relevant.length ? v.count / relevant.length * 100 : 0, confidence: v.count ? v.conf / v.count : 0
    })).sort((a, b) => b.count - a.count);
}
function candidates(rows) {
    const distinct = new Map();
    rows.filter((row) => !structure(row) &&
        String(row?.kurztext || row?.shortText || "").trim().length >= 8 &&
        String(row?.einheit || row?.unit || "").trim().length > 0 &&
        ep(row) > 0 && confidence(row) >= 0.75 &&
        String(row?.riskLevel || "").toLowerCase() !== "high" &&
        String(row?.calculationStatus || row?.status || "").toLowerCase() !== "critical").forEach((row) => {
        const posNr = String(row?.posNr || row?.positionNumber || "–").trim();
        const kurztext = String(row?.kurztext || row?.shortText || "–").trim();
        const einheit = String(row?.einheit || row?.unit || "–").trim();
        const distinctKey = [posNr, kurztext, einheit].
            map((part) => identity(part)).
            join("||");
        if (distinct.has(distinctKey))
            return;
        distinct.set(distinctKey, {
            id: distinctKey,
            posNr,
            kurztext,
            einheit,
            ep: ep(row),
            confidence: confidence(row),
            source: sourceLabel(row),
            row
        });
    });
    return [...distinct.values()];
}
function arrayFrom(payload) {
    for (const value of [
        payload,
        payload?.events,
        payload?.items,
        payload?.rows,
        payload?.candidates,
        payload?.recentEvents,
        payload?.recentCandidates,
        payload?.data,
        payload?.data?.events,
        payload?.data?.items,
        payload?.data?.candidates
    ]) {
        if (Array.isArray(value))
            return value;
    }
    return [];
}
function value(payload, paths, fallback = "–") {
    for (const path of paths) {
        let current = payload;
        for (const part of path.split("."))
            current = current?.[part];
        if (current !== undefined && current !== null && current !== "")
            return current;
    }
    return fallback;
}
function marketCandidateId(event) {
    return String(value(event, [
        "candidateId", "marketCandidateId", "candidate.id", "proposal.id"
    ], "")).trim();
}
function identity(valueToNormalize) {
    return String(valueToNormalize || "").trim().toLocaleLowerCase("de-DE");
}
function candidateForEvent(event, candidatesToSearch) {
    const source = marketEvent(event);
    const eventIds = new Set([
        source?.id,
        source?.externalId,
        event?.id,
        event?.externalId
    ].
        map(identity).filter(Boolean));
    const eventUrls = new Set([
        source?.url,
        source?.link,
        event?.url,
        event?.link
    ].
        map(identity).filter(Boolean));
    const title = identity(source?.title || event?.title);
    const priceCandidates = candidatesToSearch.filter((candidate) => String(candidate?.type || "").toUpperCase() === "PRICE_SUGGESTION");
    return priceCandidates.find((candidate) => [
        candidate?.eventId,
        candidate?.event?.id,
        candidate?.event?.externalId
    ].
        map(identity).some((id) => id && eventIds.has(id))) ||
        priceCandidates.find((candidate) => [
            candidate?.event?.url,
            candidate?.event?.link
        ].
            map(identity).some((url) => url && eventUrls.has(url))) ||
        priceCandidates.find((candidate) => title && identity(candidate?.event?.title || candidate?.title) === title) ||
        null;
}
function mergeMarketData(rawPayload, dashboardPayload, candidatesPayload) {
    const rawEvents = arrayFrom(rawPayload);
    const dashboardEvents = Array.isArray(dashboardPayload?.recentEvents) ?
        dashboardPayload.recentEvents :
        [];
    const allCandidates = [
        ...(Array.isArray(candidatesPayload) ? candidatesPayload : arrayFrom(candidatesPayload)),
        ...(Array.isArray(dashboardPayload?.recentCandidates) ? dashboardPayload.recentCandidates : [])
    ].
        filter((candidate, index, all) => all.findIndex((item) => identity(item?.id) === identity(candidate?.id)) === index);
    const eventsToDisplay = dashboardEvents.length ? dashboardEvents : rawEvents;
    return eventsToDisplay.map((event) => {
        const rawMatch = rawEvents.find((raw) => {
            const dashboardIds = [event?.id, event?.externalId].map(identity).filter(Boolean);
            const rawIds = [raw?.id, raw?.externalId].map(identity).filter(Boolean);
            if (rawIds.some((id) => dashboardIds.includes(id)))
                return true;
            const dashboardUrl = identity(event?.url || event?.link);
            const rawUrl = identity(raw?.url || raw?.link);
            return Boolean(dashboardUrl && rawUrl && dashboardUrl === rawUrl);
        });
        const merged = { ...(rawMatch || {}), ...event };
        const candidate = candidateForEvent(merged, allCandidates);
        return candidate ?
            { ...merged, candidateId: candidate.id, candidate } :
            merged;
    });
}
function marketEvent(event) {
    return event?.event || event?.marketEvent || event?.sourceEvent || event?.proposedData?.event || event || {};
}
function marketImpact(event) {
    const source = marketEvent(event);
    return source?.marketImpact || event?.marketImpact || event?.proposedData?.marketImpact || {};
}
function impactAnalysis(payload) {
    const options = [
        payload?.impactAnalysis,
        payload?.proposedData?.impactAnalysis,
        payload?.candidate?.proposedData?.impactAnalysis,
        payload?.proposal?.proposedData?.impactAnalysis,
        payload?.result?.impactAnalysis,
        payload?.data?.impactAnalysis,
        payload?.result,
        payload?.data,
        payload
    ];
    return options.find((item) => item && typeof item === "object" && (Array.isArray(item?.affectedPositions) || item?.status === "ANALYZED" || item?.status === "NO_MATCHES")) || null;
}
function affectedPositions(impact) {
    return Array.isArray(impact?.affectedPositions) ? impact.affectedPositions : [];
}
function eventTitle(event) {
    const source = marketEvent(event);
    return String(source?.title || source?.headline || source?.proposedData?.shortText ||
        event?.title || event?.headline || event?.proposedData?.shortText || "Neue Marktinformation");
}
function eventText(event) {
    const source = marketEvent(event);
    return String(source?.summary || source?.description || source?.impact || source?.text || source?.proposedData?.longText ||
        event?.summary || event?.description || event?.impact || event?.text || event?.proposedData?.longText ||
        "Neue Information aus der Internetbeobachtung.");
}
function eventDate(event) {
    const source = marketEvent(event);
    return source?.publishedAt || source?.createdAt || source?.detectedAt ||
        event?.publishedAt || event?.createdAt || event?.detectedAt;
}
function eventSource(event) {
    const source = marketEvent(event);
    const possibleSources = [
        source?.publisherDomain,
        source?.sourceName,
        source?.label,
        typeof source?.source === "string" ? source.source : source?.source?.name,
        event?.publisherDomain,
        event?.sourceName,
        event?.label,
        typeof event?.source === "string" ? event.source : event?.source?.name,
        event?.candidate?.event?.publisherDomain,
        event?.candidate?.event?.sourceName
    ];
    const label = possibleSources.find((item) => String(item || "").trim());
    if (label)
        return String(label);
    const url = eventUrl(event);
    try {
        return url ? new URL(url).hostname.replace(/^www\./i, "") : "Originalquelle";
    }
    catch {
        return "Originalquelle";
    }
}
function eventUrl(event) {
    const source = marketEvent(event);
    const url = source?.articleUrl || source?.originalUrl || source?.url || source?.link || source?.sourceUrl ||
        event?.articleUrl || event?.originalUrl || event?.url || event?.link || event?.sourceUrl ||
        event?.candidate?.event?.url;
    return /^https?:\/\//i.test(String(url || "")) ? String(url) : "";
}
function nestedValues(payload, maxDepth = 6) {
    const found = [];
    const seen = new Set();
    const visit = (current, depth) => {
        if (!current || typeof current !== "object" || depth > maxDepth || seen.has(current))
            return;
        seen.add(current);
        for (const [key, item] of Object.entries(current)) {
            found.push({ key: identity(key), value: item });
            if (item && typeof item === "object")
                visit(item, depth + 1);
        }
    };
    visit(payload, 0);
    return found;
}
function countValue(raw) {
    if (Array.isArray(raw))
        return raw.length;
    if (typeof raw === "number" && Number.isFinite(raw))
        return raw;
    if (typeof raw === "string" && /^\s*\d+(?:[.,]\d+)?\s*$/.test(raw))
        return num(raw);
    return null;
}
function observerCount(payload, preferredPaths, keyMatcher, messagePattern) {
    const explicit = [];
    for (const path of preferredPaths) {
        const candidate = countValue(value(payload, [path], null));
        if (candidate !== null)
            explicit.push(candidate);
    }
    const nested = nestedValues(payload).
        filter((entry) => keyMatcher(entry.key)).
        map((entry) => countValue(entry.value)).
        filter((item) => item !== null);
    const structured = [...explicit, ...nested];
    const positive = structured.find((item) => item > 0);
    if (positive !== undefined)
        return positive;
    const text = nestedValues(payload).
        filter((entry) => typeof entry.value === "string").
        map((entry) => String(entry.value)).
        join(" ");
    const match = text.match(messagePattern);
    if (match?.[1]) {
        const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(parsed))
            return parsed;
    }
    return structured.length ? 0 : "–";
}
function observerDate(payload) {
    const preferred = value(payload, [
        "lastRunAt", "lastRun", "lastRun.finishedAt", "lastRun.completedAt", "lastResult.finishedAt",
        "result.finishedAt", "status.finishedAt", "updatedAt", "observer.lastRunAt"
    ], null);
    if (preferred && typeof preferred !== "object")
        return preferred;
    const entry = nestedValues(payload).find((item) => /^(lastrunat|finishedat|completedat|updatedat)$/.test(item.key) && (typeof item.value === "string" || typeof item.value === "number"));
    return entry?.value || null;
}
function observerStatus(payload) {
    if (!payload)
        return "Nicht erreichbar";
    const state = String(value(payload, [
        "state", "status.state", "observer.state", "lastResult.state"
    ], "")).toUpperCase();
    if (["RUNNING", "STARTING"].includes(state))
        return "Läuft";
    if (["ERROR", "FAILED"].includes(state))
        return "Fehler";
    const enabled = value(payload, ["enabled", "status.enabled", "observer.enabled"], null);
    const ok = value(payload, ["ok", "status.ok", "observer.ok"], null);
    if (enabled === false)
        return "Deaktiviert";
    if (ok === false)
        return "Fehler";
    if (enabled === true || ok === true || ["IDLE", "READY", "COMPLETED"].includes(state))
        return "Aktiv";
    return "Aktiv";
}
function firstText(valueToRead) {
    if (Array.isArray(valueToRead))
        return String(valueToRead.find((item) => String(item || "").trim()) || "");
    return String(valueToRead || "");
}
function signedPct(v) {
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}
function pctRange(minValue, maxValue) {
    const min = Math.min(minValue, maxValue);
    const max = Math.max(minValue, maxValue);
    return Math.abs(max - min) < 0.05 ? signedPct(max) : `${signedPct(min)} bis ${signedPct(max)}`;
}
function marketChange(event) {
    const source = marketEvent(event);
    const impact = marketImpact(event);
    const material = germanMarketCategory(firstText(impact?.materials) ||
        firstText(impact?.lvTerms) ||
        String(source?.material || source?.category || source?.topic || event?.material || event?.category || "Markt"));
    let min = num(impact?.estimatedChangeMinPct ?? source?.estimatedChangeMinPct ?? event?.estimatedChangeMinPct);
    let max = num(impact?.estimatedChangeMaxPct ?? source?.estimatedChangeMaxPct ?? event?.estimatedChangeMaxPct);
    if (!min && !max) {
        min = num(impact?.estimatedChangePct ?? impact?.changePct ?? source?.changePct ?? event?.changePct);
        max = min;
    }
    const direction = String(impact?.direction || source?.direction || event?.direction || "").toUpperCase();
    if ((direction === "DOWN" || direction === "DECREASE") && min >= 0 && max >= 0) {
        min = -min;
        max = -max;
    }
    const change = min || max ? pctRange(min, max) : "Änderung erkannt";
    return {
        label: material === "Preis" && change === "Änderung erkannt" ?
            "Preisänderung erkannt" :
            `${material} ${change}`,
        min,
        max
    };
}
function projectName(position) {
    return String(value(position, [
        "projectCode", "projectKey", "projectNumber", "project.code", "project.number", "projectName", "project.name", "projectId"
    ], "–"));
}
function positionNumber(position) {
    return String(value(position, [
        "fullPositionNumber", "lvPositionNumber", "gaebOz", "positionOz", "outlineNumber",
        "position.fullPositionNumber", "position.lvPositionNumber", "position.gaebOz",
        "position.positionNumber", "position.posNr", "positionNumber", "posNr", "positionNo", "number"
    ], "–"));
}
function positionIdentity(position) {
    return String(value(position, [
        "positionId", "lvPositionId", "sourcePositionId", "position.id", "id"
    ], "")).trim();
}
function positionText(position) {
    return String(value(position, ["shortText", "kurztext", "title", "position.shortText", "position.kurztext"], "–"));
}
function currentPrice(position) {
    return num(value(position, ["currentUnitPrice", "unitPrice", "finalUnitPrice", "preis"], 0));
}
function suggestedPrices(position) {
    const current = currentPrice(position);
    let min = num(value(position, [
        "newSuggestedPriceMin", "suggestedNewUnitPriceMin", "suggestedUnitPriceMin", "recommendedUnitPriceMin", "recommendedNewUnitPriceMin", "proposedUnitPriceMin"
    ], 0));
    let max = num(value(position, [
        "newSuggestedPriceMax", "suggestedNewUnitPriceMax", "suggestedUnitPriceMax", "recommendedUnitPriceMax", "recommendedNewUnitPriceMax", "proposedUnitPriceMax"
    ], 0));
    const direct = num(value(position, [
        "newSuggestedPrice", "suggestedNewUnitPrice", "suggestedUnitPrice", "recommendedUnitPrice", "recommendedNewUnitPrice", "proposedUnitPrice", "newUnitPrice", "suggestedEp"
    ], 0));
    if (!min && !max && direct)
        min = max = direct;
    const delta = num(value(position, ["affectedCostDelta", "estimatedDelta", "unitPriceDelta"], 0));
    const deltaMin = num(value(position, ["affectedCostDeltaMin", "estimatedDeltaMin", "unitPriceDeltaMin"], 0));
    const deltaMax = num(value(position, ["affectedCostDeltaMax", "estimatedDeltaMax", "unitPriceDeltaMax"], 0));
    if (!min && current && (deltaMin || deltaMax)) {
        min = current + deltaMin;
        max = current + deltaMax;
    }
    else if (!min && current && delta) {
        min = max = current + delta;
    }
    return { min, max: max || min };
}
function positionAdjustment(position) {
    const current = currentPrice(position);
    const suggested = suggestedPrices(position);
    if (!current || !suggested.min)
        return null;
    return {
        min: (suggested.min - current) / current * 100,
        max: (suggested.max - current) / current * 100
    };
}
function summaryNumber(impact, paths, fallback) {
    return num(value(impact, paths, fallback));
}
function affectedProjectCount(impact) {
    const explicit = summaryNumber(impact, [
        "summary.projects", "summary.affectedProjects", "projects", "projectCount", "affectedProjectCount"
    ], 0);
    if (explicit)
        return explicit;
    const list = Array.isArray(impact?.affectedProjects) ? impact.affectedProjects : [];
    if (list.length)
        return list.length;
    return new Set(affectedPositions(impact).map(projectName).filter((item) => item !== "–")).size;
}
function affectedPositionCount(impact) {
    return summaryNumber(impact, [
        "summary.positions", "summary.affectedPositions", "positions", "positionCount", "affectedPositionCount"
    ], affectedPositions(impact).length);
}
function suggestedAdjustment(impact) {
    if (impact?.lvValidated) {
        const validatedAdjustments = affectedPositions(impact).
            map(positionAdjustment).
            filter(Boolean);
        if (validatedAdjustments.length) {
            return pctRange(Math.min(...validatedAdjustments.map((item) => item.min)), Math.max(...validatedAdjustments.map((item) => item.max)));
        }
        return "Urkalkulation prüfen";
    }
    let min = num(value(impact, [
        "summary.recommendedAdjustmentMinPct", "summary.recommendedAdjustmentPctMin", "summary.averageIncreasePct", "recommendedAdjustmentMinPct", "recommendedAdjustmentPctMin", "averageIncreasePct"
    ], 0));
    let max = num(value(impact, [
        "summary.recommendedAdjustmentMaxPct", "summary.recommendedAdjustmentPctMax", "summary.averageIncreasePct", "recommendedAdjustmentMaxPct", "recommendedAdjustmentPctMax", "averageIncreasePct"
    ], 0));
    if (!min && !max) {
        const adjustments = affectedPositions(impact).map(positionAdjustment).filter(Boolean);
        if (adjustments.length) {
            min = Math.min(...adjustments.map((item) => item.min));
            max = Math.max(...adjustments.map((item) => item.max));
        }
    }
    return min || max ? pctRange(min, max) : "Urkalkulation prüfen";
}
function impactStatus(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "ANALYZED")
        return "Analysiert";
    if (normalized === "NO_MATCHES")
        return "Keine betroffenen Positionen";
    if (normalized.includes("AFFECTED_COST") || normalized.includes("MATERIAL_SHARE"))
        return "Bitumenanteil fehlt";
    if (normalized.includes("MISSING") || normalized.includes("BREAKDOWN"))
        return "Urkalkulation fehlt";
    if (normalized.includes("CALCUL"))
        return "Berechenbar";
    return normalized ? "Vorschlag" : "Nicht analysiert";
}
function extractProjectLvRows(payload) {
    for (const candidate of [
        payload?.items,
        payload?.rows,
        payload?.positions,
        payload?.lv?.items,
        payload?.lv?.rows,
        payload?.lv?.positions,
        payload?.data?.items,
        payload?.data?.rows,
        payload?.data?.positions,
        payload?.data,
        payload
    ]) {
        if (Array.isArray(candidate))
            return candidate;
    }
    return [];
}
function normalizedLvNumber(raw) {
    return String(raw || "").
        trim().
        toLocaleUpperCase("de-DE").
        replace(/\s+/g, "").
        replace(/[‐‑‒–—]/g, "-");
}
function normalizedSearchText(raw) {
    return String(raw || "").
        toLocaleLowerCase("de-DE").
        normalize("NFKD").
        replace(/[\u0300-\u036f]/g, "").
        replace(/ß/g, "ss").
        replace(/[^a-z0-9]+/g, " ").
        replace(/\s+/g, " ").
        trim();
}
function stringList(raw) {
    if (Array.isArray(raw))
        return raw.flatMap((item) => stringList(item));
    if (typeof raw !== "string")
        return [];
    return raw.
        split(/[,;|]/).
        map((item) => item.trim()).
        filter(Boolean);
}
function projectCodeEquals(left, right) {
    return normalizedSearchText(left) === normalizedSearchText(right);
}
function marketLvTerms(event) {
    const source = marketEvent(event);
    const impact = marketImpact(event);
    const rawTerms = [
        ...stringList(impact?.lvTerms),
        ...stringList(impact?.materials),
        ...stringList(impact?.keywords),
        ...stringList(source?.material),
        ...stringList(source?.materials),
        ...stringList(source?.keywords)
    ];
    const normalized = rawTerms.
        map(normalizedSearchText).
        filter((term) => term.length >= 3 &&
        !["price", "preis", "material", "materials", "materialkosten", "bau", "bauwirtschaft", "strassenbau"].includes(term));
    const joined = `${normalized.join(" ")} ${normalizedSearchText(eventTitle(event))}`;
    if (/\b(bitumen|bitumenemulsion|asphalt)\b/.test(joined)) {
        return [
            "bitumen",
            "bitumenemulsion",
            "haftkleber",
            "schichtenverbund",
            "asphalttragschicht",
            "asphaltbinder",
            "asphaltdeckschicht",
            "binderschicht",
            "deckschicht",
            "splittmastix",
            "heissmischgut",
            "asphaltmischgut",
            "asphaltierung",
            "ats",
            "ads"
        ];
    }
    return Array.from(new Set(normalized));
}
function rowSearchText(row) {
    return normalizedSearchText([
        value(row, ["kurztext", "shortText", "shorttext", "text", "title", "description"], ""),
        value(row, ["langtext", "longText", "longtext", "descriptionLong"], ""),
        value(row, ["bemerkung", "note"], "")
    ].
        join(" "));
}
function isBitumenEvent(event) {
    const source = marketEvent(event);
    const impact = marketImpact(event);
    const text = normalizedSearchText([
        eventTitle(event),
        firstText(impact?.materials),
        firstText(impact?.lvTerms),
        source?.material,
        source?.topic
    ].
        join(" "));
    return /\b(bitumen|bitumenemulsion|asphalt)\b/.test(text);
}
function rowMatchesMarketEvent(row, event) {
    const text = rowSearchText(row);
    if (!text)
        return false;
    if (isBitumenEvent(event)) {
        const consumesBitumen = /\b(bitumen|bitumenemulsion|haftkleber|schichtenverbund|asphalttragschicht|asphaltbinder|asphaltdeckschicht|binderschicht|deckschicht|splittmastix|heissmischgut|asphaltmischgut|asphaltierung|ats|ads)\b/.test(text) ||
            /\bac\s*(?:8|11|16|22|32)\b/.test(text);
        const doesNotConsumeNewBitumen = /\b(trennen|schneiden|aufbruch|aufbrechen|ausbauen|abbruch|fraesen|entsorgen|abfahren|reinigen|beweissicherung|erschwernis)\b/.test(text);
        return consumesBitumen && !doesNotConsumeNewBitumen;
    }
    return marketLvTerms(event).some((term) => text.includes(term));
}
function projectPositionEquals(left, right) {
    const leftNumber = normalizedLvNumber(positionNumber(left));
    const rightNumber = normalizedLvNumber(positionNumber(right));
    if (leftNumber && leftNumber !== "–" && rightNumber && rightNumber !== "–") {
        return leftNumber === rightNumber;
    }
    const leftId = identity(positionIdentity(left));
    const rightId = identity(positionIdentity(right));
    return Boolean(leftId && rightId && leftId === rightId);
}
function mergeProjectLvRows(authoritativeRows, calculationRows) {
    if (!authoritativeRows.length)
        return calculationRows;
    return authoritativeRows.map((lvRow) => {
        const calculated = calculationRows.find((row) => projectPositionEquals(lvRow, row));
        if (!calculated)
            return lvRow;
        const canonicalNumber = positionNumber(lvRow);
        const canonicalText = positionText(lvRow);
        return {
            ...lvRow,
            ...calculated,
            positionId: positionIdentity(lvRow) || positionIdentity(calculated),
            fullPositionNumber: canonicalNumber && canonicalNumber !== "–" ?
                canonicalNumber :
                positionNumber(calculated),
            shortText: canonicalText && canonicalText !== "–" ?
                canonicalText :
                positionText(calculated)
        };
    });
}
function breakdownLines(row) {
    for (const candidate of [
        row?.priceBreakdown,
        row?.recipeLines,
        row?.breakdown,
        row?.costLines
    ]) {
        if (Array.isArray(candidate) && candidate.length)
            return candidate;
    }
    return [];
}
function breakdownLineTotal(line) {
    return num(line?.total ??
        line?.gesamt ??
        line?.cost ??
        line?.amount ??
        num(line?.qty ?? line?.quantity ?? line?.menge) * num(line?.price ?? line?.unitPrice ?? line?.ep));
}
function breakdownLineText(line) {
    return normalizedSearchText([
        line?.group,
        line?.costGroup,
        line?.name,
        line?.description,
        line?.material,
        line?.article,
        line?.note
    ].
        join(" "));
}
function isMaterialBreakdownLine(line) {
    const group = normalizedSearchText(line?.group || line?.costGroup || line?.category);
    return /\b(material|materials|stoff|baustoff)\b/.test(group);
}
function calculateMarketPriceProposal(row, event) {
    const current = ep(row);
    if (current <= 0)
        return null;
    const change = marketChange(event);
    if (!change.min && !change.max)
        return null;
    const lines = breakdownLines(row);
    const materialLines = lines.filter(isMaterialBreakdownLine);
    let affectedCost = 0;
    if (isBitumenEvent(event)) {
        affectedCost = materialLines.
            filter((line) => /\b(bitumen|bitumenemulsion|haftkleber)\b/.test(breakdownLineText(line))).
            reduce((sum, line) => sum + breakdownLineTotal(line), 0);
        const rowText = rowSearchText(row);
        if (affectedCost <= 0 &&
            /\b(bitumen|bitumenemulsion|haftkleber|schichtenverbund)\b/.test(rowText)) {
            affectedCost =
                materialLines.reduce((sum, line) => sum + breakdownLineTotal(line), 0) ||
                    num(row?.materialCost);
        }
    }
    else {
        const terms = marketLvTerms(event);
        affectedCost = materialLines.
            filter((line) => terms.some((term) => breakdownLineText(line).includes(term))).
            reduce((sum, line) => sum + breakdownLineTotal(line), 0);
    }
    if (affectedCost <= 0)
        return null;
    const minChange = Math.min(change.min, change.max || change.min);
    const maxChange = Math.max(change.min, change.max || change.min);
    return {
        current,
        min: Math.max(0, current + affectedCost * minChange / 100),
        max: Math.max(0, current + affectedCost * maxChange / 100),
        affectedCost,
        sharePct: affectedCost / current * 100
    };
}
function rowHasCostBreakdown(row) {
    return (breakdownLines(row).length > 0 ||
        num(row?.materialCost) > 0 ||
        num(row?.laborCost) > 0 ||
        num(row?.machineCost) > 0);
}
function validatedImpactPosition(reported, realRow, impact, event, activeCode) {
    const proposal = calculateMarketPriceProposal(realRow, event);
    const hasBreakdown = rowHasCostBreakdown(realRow);
    return {
        ...reported,
        projectCode: activeCode,
        positionId: positionIdentity(realRow) || positionIdentity(reported),
        fullPositionNumber: positionNumber(realRow),
        shortText: positionText(realRow),
        currentUnitPrice: ep(realRow) || currentPrice(reported),
        affectedCostGroup: impact?.affectedCostGroup || "MATERIAL",
        affectedSharePct: proposal?.sharePct || 0,
        affectedCost: proposal?.affectedCost || 0,
        newSuggestedPriceMin: proposal?.min || 0,
        newSuggestedPriceMax: proposal?.max || 0,
        calculationAvailable: Boolean(proposal),
        impactStatus: proposal ?
            "CALCULABLE" :
            hasBreakdown ?
                "MISSING_AFFECTED_COST_SHARE" :
                "MISSING_COST_BREAKDOWN",
        lvValidated: true
    };
}
function scopedImpactId(activeProjectCode, candidateId) {
    return `${normalizedSearchText(activeProjectCode) || "kein-projekt"}:${candidateId}`;
}
function germanMarketCategory(raw) {
    const label = String(raw || "").trim();
    const normalized = label.toUpperCase().replace(/[\s-]+/g, "_");
    if (["PRICE", "PRICES", "PRICE_CHANGE", "PRICE_SUGGESTION"].includes(normalized) ||
        normalized.startsWith("PRICE_")) {
        return "Preis";
    }
    return label || "Bauwirtschaft";
}
function germanCostGroup(raw) {
    const normalized = String(raw || "").trim().toUpperCase();
    const labels = {
        MATERIAL: "Material",
        LABOR: "Personal",
        LABOUR: "Personal",
        PERSONNEL: "Personal",
        MACHINE: "Maschinen",
        MACHINERY: "Maschinen",
        TRANSPORT: "Transport",
        DISPOSAL: "Entsorgung",
        SUBCONTRACTOR: "Fremdleistung",
        OVERHEAD: "Gemeinkosten"
    };
    return labels[normalized] || String(raw || "–");
}
async function validateImpactAgainstProjectLv(impact, event, activeProjectCode, localRows) {
    const activeCode = String(activeProjectCode || "").trim();
    const reportedPositions = affectedPositions(impact);
    if (!activeCode) {
        return {
            ...impact,
            status: "NO_PROJECT",
            affectedPositions: [],
            affectedProjects: [],
            summary: {
                ...(impact?.summary || {}),
                projects: 0,
                affectedProjects: 0,
                positions: 0,
                affectedPositions: 0,
                calculablePositions: 0,
                missingCostBreakdown: 0
            },
            lvValidated: true,
            validationDroppedCount: 0,
            validationFailedProjects: []
        };
    }
    let realRows = null;
    const [lvResult, kiResult] = await Promise.allSettled([
        getJson(`/api/projects/${encodeURIComponent(activeCode)}/lv`),
        getJson(`/api/kalkulation/${encodeURIComponent(activeCode)}/ki`)
    ]);
    const serverRows = lvResult.status === "fulfilled" ?
        extractProjectLvRows(lvResult.value) :
        [];
    const kiRows = kiResult.status === "fulfilled" ?
        extractProjectLvRows(kiResult.value) :
        [];
    const calculationRows = [...kiRows, ...localRows];
    if (serverRows.length) {
        realRows = mergeProjectLvRows(serverRows, calculationRows);
    }
    else if (calculationRows.length) {
        realRows = calculationRows;
    }
    const confirmedPositions = [];
    let validationDroppedCount = 0;
    const outOfScopeProjectCount = reportedPositions.filter((position) => {
        const reportedCode = projectName(position);
        return reportedCode !== "–" && !projectCodeEquals(reportedCode, activeCode);
    }).length;
    for (const reported of reportedPositions.filter((position) => projectCodeEquals(projectName(position), activeCode))) {
        if (!realRows) {
            validationDroppedCount += 1;
            continue;
        }
        const reportedNumber = normalizedLvNumber(positionNumber(reported));
        const reportedId = identity(positionIdentity(reported));
        const realRow = realRows.find((row) => {
            const realNumber = normalizedLvNumber(positionNumber(row));
            const realId = identity(positionIdentity(row));
            if (reportedNumber && reportedNumber !== "–")
                return realNumber === reportedNumber;
            return Boolean(reportedId && realId && reportedId === realId);
        });
        if (!realRow) {
            validationDroppedCount += 1;
            continue;
        }
        if (!rowMatchesMarketEvent(realRow, event)) {
            validationDroppedCount += 1;
            continue;
        }
        confirmedPositions.push(validatedImpactPosition(reported, realRow, impact, event, activeCode));
    }
    if (realRows) {
        for (const realRow of realRows) {
            if (!rowMatchesMarketEvent(realRow, event))
                continue;
            const realNumber = normalizedLvNumber(positionNumber(realRow));
            const realId = identity(positionIdentity(realRow));
            const alreadyIncluded = confirmedPositions.some((position) => {
                const confirmedNumber = normalizedLvNumber(positionNumber(position));
                const confirmedId = identity(positionIdentity(position));
                return Boolean(realNumber && confirmedNumber === realNumber ||
                    realId && confirmedId === realId);
            });
            if (alreadyIncluded)
                continue;
            confirmedPositions.push(validatedImpactPosition({ matchedDirectlyInActiveProject: true }, realRow, impact, event, activeCode));
        }
    }
    const affectedProjects = confirmedPositions.length ? [activeCode] : [];
    const calculablePositions = confirmedPositions.filter((position) => position?.calculationAvailable !== false).length;
    const missingAffectedCostShare = confirmedPositions.filter((position) => String(position?.impactStatus || "").toUpperCase() === "MISSING_AFFECTED_COST_SHARE").length;
    const trulyMissingCostBreakdown = confirmedPositions.filter((position) => String(position?.impactStatus || "").toUpperCase() === "MISSING_COST_BREAKDOWN").length;
    const validationFailedProjects = realRows === null ? [activeCode] : [];
    return {
        ...impact,
        status: confirmedPositions.length ? impact?.status || "ANALYZED" : "NO_MATCHES",
        affectedPositions: confirmedPositions,
        affectedProjects,
        summary: {
            ...(impact?.summary || {}),
            projects: affectedProjects.length,
            affectedProjects: affectedProjects.length,
            positions: confirmedPositions.length,
            affectedPositions: confirmedPositions.length,
            calculablePositions,
            missingCostBreakdown: trulyMissingCostBreakdown,
            missingAffectedCostShare
        },
        lvValidated: true,
        validationDroppedCount,
        validationFailedProjects,
        activeProjectCode: activeCode,
        outOfScopeProjectCount
    };
}
const money = (v) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (v) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
function dateText(v) {
    if (!v)
        return "–";
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("de-DE");
}
export default function Kalkulationszentrale() {
    const ctx = useProject();
    const navigate = useNavigate();
    const key = projectKey(ctx);
    const [rows, setRows] = React.useState(() => readRows(key));
    const [intel, setIntel] = React.useState(null);
    const [observer, setObserver] = React.useState(null);
    const [marketStatus, setMarketStatus] = React.useState(null);
    const [marketDashboard, setMarketDashboard] = React.useState(null);
    const [events, setEvents] = React.useState([]);
    const [rejections, setRejections] = React.useState([]);
    const [marketImpacts, setMarketImpacts] = React.useState({});
    const [openImpactId, setOpenImpactId] = React.useState("");
    const [impactLoadingId, setImpactLoadingId] = React.useState("");
    const [impactErrors, setImpactErrors] = React.useState({});
    const [notice, setNotice] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [candidatePageSize, setCandidatePageSize] = React.useState(20);
    const [selectedCandidateIds, setSelectedCandidateIds] = React.useState([]);
    const [databaseSaving, setDatabaseSaving] = React.useState(false);
    const reload = React.useCallback(async () => {
        setLoading(true);
        setNotice("");
        const results = await Promise.allSettled([
            key ?
                getJson(`/api/kalkulation/ki/construction-intelligence/status/${encodeURIComponent(key)}`) :
                Promise.resolve(null),
            getJson("/api/autonomous/status"),
            getJson("/api/autonomous/market/status"),
            getJson("/api/autonomous/market/events"),
            getJson("/api/autonomous/market/rejections"),
            getJson("/api/autonomous/market/dashboard"),
            getJson("/api/autonomous/market/candidates?limit=500")
        ]);
        const dashboard = results[5].status === "fulfilled" ? results[5].value : null;
        const rawEvents = results[3].status === "fulfilled" ? results[3].value : null;
        const candidatePayload = results[6].status === "fulfilled" ? results[6].value : null;
        setIntel(results[0].status === "fulfilled" ? results[0].value : null);
        setObserver(results[1].status === "fulfilled" ? results[1].value : null);
        setMarketStatus(results[2].status === "fulfilled" ? results[2].value : dashboard?.status || null);
        setMarketDashboard(dashboard);
        setEvents(mergeMarketData(rawEvents, dashboard, candidatePayload));
        setRejections(results[4].status === "fulfilled" ? arrayFrom(results[4].value) : []);
        setRows(readRows(key));
        const failed = results.slice(0, 5).filter((r) => r.status === "rejected").length;
        if (failed)
            setNotice(`${failed} Datenquelle(n) waren nicht erreichbar. Lokale Projektdaten bleiben sichtbar.`);
        setLoading(false);
    }, [key]);
    React.useEffect(() => { setRows(readRows(key)); void reload(); }, [key, reload]);
    const showAffectedPositions = React.useCallback(async (event) => {
        const id = marketCandidateId(event);
        if (!id)
            return;
        const scopeId = scopedImpactId(key, id);
        if (!key) {
            setImpactErrors((current) => ({
                ...current,
                [scopeId]: "Bitte zuerst ein Projekt auswählen."
            }));
            return;
        }
        if (openImpactId === scopeId) {
            setOpenImpactId("");
            return;
        }
        const savedImpact = marketImpacts[scopeId];
        if (savedImpact?.lvValidated) {
            setOpenImpactId(scopeId);
            return;
        }
        setImpactLoadingId(scopeId);
        setImpactErrors((current) => ({ ...current, [scopeId]: "" }));
        try {
            let result = impactAnalysis(event);
            if (!result) {
                const response = await postJson(`/api/autonomous/market/candidates/${encodeURIComponent(id)}/analyze-impact?projectCode=${encodeURIComponent(key)}`);
                result = impactAnalysis(response);
            }
            if (!result)
                throw new Error("Die Auswirkungsanalyse enthält keine verwertbaren Daten.");
            const validated = await validateImpactAgainstProjectLv(result, event, key, rows);
            setMarketImpacts((current) => ({ ...current, [scopeId]: validated }));
            setOpenImpactId(scopeId);
        }
        catch (error) {
            setImpactErrors((current) => ({
                ...current,
                [scopeId]: String(error?.message || "Die Auswirkungsanalyse konnte nicht geladen werden.")
            }));
        }
        finally {
            setImpactLoadingId("");
        }
    }, [key, marketImpacts, openImpactId, rows]);
    const openAffectedPosition = React.useCallback((position) => {
        if (!key) {
            setNotice("Bitte zuerst ein Projekt auswählen.");
            return;
        }
        const params = new URLSearchParams();
        params.set("projectCode", key);
        const affectedPositionId = positionIdentity(position);
        const affectedPositionNumber = positionNumber(position);
        const affectedShortText = positionText(position);
        if (affectedPositionId)
            params.set("positionId", affectedPositionId);
        if (affectedPositionNumber && affectedPositionNumber !== "–") {
            params.set("positionNumber", affectedPositionNumber);
        }
        if (affectedShortText && affectedShortText !== "–") {
            params.set("shortText", affectedShortText);
        }
        params.set("source", "market-observation");
        navigate(`/kalkulation/lv-import?${params.toString()}`);
    }, [key, navigate]);
    const relevant = React.useMemo(() => rows.filter((r) => !structure(r)), [rows]);
    const methods = React.useMemo(() => engines(rows), [rows]);
    const dbCandidates = React.useMemo(() => candidates(rows), [rows]);
    const visibleDbCandidates = React.useMemo(() => candidatePageSize === "all" ?
        dbCandidates :
        dbCandidates.slice(0, candidatePageSize), [candidatePageSize, dbCandidates]);
    const selectedCandidateSet = React.useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);
    const selectedDbCandidates = React.useMemo(() => dbCandidates.filter((candidate) => selectedCandidateSet.has(candidate.id)), [dbCandidates, selectedCandidateSet]);
    const allVisibleCandidatesSelected = visibleDbCandidates.length > 0 &&
        visibleDbCandidates.every((candidate) => selectedCandidateSet.has(candidate.id));
    React.useEffect(() => {
        const availableIds = new Set(dbCandidates.map((candidate) => candidate.id));
        setSelectedCandidateIds((current) => current.filter((id) => availableIds.has(id)));
    }, [dbCandidates]);
    const toggleCandidate = React.useCallback((candidateId) => {
        setSelectedCandidateIds((current) => current.includes(candidateId) ?
            current.filter((id) => id !== candidateId) :
            [...current, candidateId]);
    }, []);
    const toggleVisibleCandidates = React.useCallback(() => {
        setSelectedCandidateIds((current) => {
            const next = new Set(current);
            const shouldSelect = visibleDbCandidates.some((candidate) => !next.has(candidate.id));
            visibleDbCandidates.forEach((candidate) => {
                if (shouldSelect)
                    next.add(candidate.id);
                else
                    next.delete(candidate.id);
            });
            return [...next];
        });
    }, [visibleDbCandidates]);
    const transferSelectedCandidates = React.useCallback(async () => {
        if (!key) {
            setNotice("Bitte zuerst ein Projekt auswählen.");
            return;
        }
        if (!selectedDbCandidates.length) {
            setNotice("Bitte mindestens eine Position auswählen.");
            return;
        }
        setDatabaseSaving(true);
        setNotice("");
        try {
            const databaseRows = selectedDbCandidates.map((candidate) => {
                const row = candidate.row;
                return {
                    posNr: candidate.posNr,
                    kurztext: candidate.kurztext,
                    langtext: String(row?.langtext || row?.longText || ""),
                    einheit: candidate.einheit,
                    menge: num(row?.menge ?? row?.quantity),
                    finalUnitPrice: candidate.ep,
                    unitPriceNet: candidate.ep,
                    totalNet: gp(row),
                    materialCost: num(row?.materialCost),
                    laborCost: num(row?.laborCost),
                    machineCost: num(row?.machineCost),
                    transportCost: num(row?.transportCost),
                    subcontractorCost: num(row?.subcontractorCost),
                    disposalCost: num(row?.disposalCost),
                    overheadCost: num(row?.overheadCost),
                    riskCost: num(row?.riskCost),
                    profitCost: num(row?.profitCost),
                    gewerk: String(row?.gewerk || ""),
                    leistungsart: String(row?.leistungsart || ""),
                    bauverfahren: String(row?.bauverfahren || ""),
                    bodenklasse: String(row?.bodenklasse || ""),
                    source: String(row?.datenbankQuelle || row?.source || "ki"),
                    datenbankQuelle: String(row?.datenbankQuelle || row?.source || "ki"),
                    approvedForCompanyDb: true,
                    approvedForGlobalKnowledge: false,
                    confidence: candidate.confidence,
                    riskLevel: String(row?.riskLevel || "medium"),
                    aiReason: String(row?.aiReason || ""),
                    warning: String(row?.warning || "")
                };
            });
            const result = await postJsonBody("/api/kalkulation/datenbank/bulk-upsert", {
                projectKey: key,
                projectTitle: projectTitle(ctx),
                rows: databaseRows
            });
            const saved = num(result?.saved ?? result?.count ?? databaseRows.length);
            setNotice(`${saved} Position(en) wurden in die Kalkulationsdatenbank übernommen.`);
            setSelectedCandidateIds([]);
        }
        catch (error) {
            setNotice(`Datenbankübernahme fehlgeschlagen: ${String(error?.message || error)}`);
        }
        finally {
            setDatabaseSaving(false);
        }
    }, [ctx, key, selectedDbCandidates]);
    const calculated = relevant.filter((r) => ep(r) > 0).length;
    const missingEp = relevant.filter((r) => ep(r) <= 0).length;
    const missingUrk = relevant.filter((r) => !hasUrk(r)).length;
    const review = relevant.filter((r) => ["warning", "critical"].includes(String(r?.calculationStatus || r?.status || "").toLowerCase()) ||
        String(r?.riskLevel || "").toLowerCase() === "high" || confidence(r) < 0.7).length;
    const avgConf = relevant.length ? relevant.reduce((s, r) => s + confidence(r), 0) / relevant.length : 0;
    const net = relevant.reduce((s, r) => s + gp(r), 0);
    const summary = intel?.summary || {};
    const observerProjects = observerCount(observer, [
        "projectsObserved", "projects", "projectCount", "projectsCount", "summary.projects",
        "lastResult.projects", "lastResult.projectCount", "result.projects", "observer.projects"
    ], (name) => /project|projekt/.test(name), /(\d[\d.]*)\s+Projekte/i);
    const observerFiles = observerCount(observer, [
        "filesObserved", "filesAnalyzed", "files", "fileCount", "filesCount", "summary.files",
        "lastResult.files", "lastResult.fileCount", "result.files", "observer.files"
    ], (name) => /file|datei/.test(name), /(\d[\d.]*)\s+Dateien/i);
    const observerChanges = observerCount(observer, [
        "changesLast24h", "changes24h", "changes", "changeCount", "summary.changes24h",
        "lastResult.changes24h", "lastResult.changes", "result.changes", "observer.changes24h"
    ], (name) => /change|änder|aender/.test(name), /(\d[\d.]*)\s+(?:Ä|A|a|\?)nderungen/i);
    const observerErrors = observerCount(observer, [
        "errors", "errorCount", "errorsCount", "summary.errors", "lastResult.errors", "observer.errors"
    ], (name) => /error|fehler/.test(name) && !/lasterror/.test(name), /(\d[\d.]*)\s+Fehler/i);
    const latest = events.slice(0, 12);
    return _jsxs("main", { className: rlcClass(null, S.page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", S.hero), children: [_jsxs("div", { className: rlcClass(null, S.heroMain), children: [_jsx("div", { className: rlcClass(null, S.heroMark), children: "RLC" }), _jsxs("div", { children: [_jsx("div", { className: rlcClass(null, S.eyebrow), children: "KALKULATION \u00B7 LEITSTAND" }), _jsx("h1", { className: rlcClass(null, S.title), children: "Kalkulationszentrale" }), _jsx("p", { className: rlcClass(null, S.subtitle), children: "Berechnungsverfahren, Firmenwissen, Pr\u00FCfungen und Marktbeobachtung auf einen Blick." })] })] }), _jsxs("div", { className: rlcClass(null, S.heroRight), children: [_jsxs("div", { className: rlcClass(null, S.project), children: [_jsx("span", { className: rlcClass(null, S.projectLabel), children: "Aktives Projekt" }), _jsx("strong", { className: rlcClass(null, S.projectCode), children: key || "–" }), _jsx("small", { className: rlcClass(null, S.projectName), children: projectTitle(ctx) }), _jsxs("small", { className: rlcClass(null, S.projectDate), children: ["Stand ", dateText(intel?.generatedAt || intel?.updatedAt)] })] }), _jsx("button", { type: "button", className: rlcClass(null, S.heroButton), onClick: () => void reload(), children: loading ? "Wird aktualisiert…" : "Aktualisieren" })] })] }), notice ? _jsx("div", { className: rlcClass(null, S.warning), children: notice }) : null, _jsxs("section", { className: rlcClass(null, S.metrics), children: [_jsx(Metric, { label: "Positionen", value: String(relevant.length), hint: `${calculated} berechnet` }), _jsx(Metric, { label: "Netto", value: money(net), hint: "Aktueller Kalkulationsstand" }), _jsx(Metric, { label: "Vertrauensgrad", value: pct(avgConf * 100), hint: "Durchschnitt" }), _jsx(Metric, { label: "Zur Pr\u00FCfung", value: String(review), hint: "Fachliche Nachpr\u00FCfung" }), _jsx(Metric, { label: "Ohne EP", value: String(missingEp), hint: "Noch nicht kalkuliert" }), _jsx(Metric, { label: "Ohne Urkalkulation", value: String(missingUrk), hint: "Preisaufbau fehlt tats\u00E4chlich" }), _jsx(Metric, { label: "Preisschutz", value: summary?.priceModified ? "WARNUNG" : "AKTIV", hint: "Keine autonome EP-\u00C4nderung" })] }), _jsxs("section", { className: rlcClass(null, S.overviewGrid), children: [_jsx(Panel, { title: "Berechnungsverfahren", children: methods.length ? _jsx("div", { className: rlcClass(null, S.grid), children: methods.map((m) => _jsxs("div", { className: rlcClass(null, S.card), children: [_jsx("strong", { children: m.label }), _jsxs("span", { children: [m.count, " Positionen"] }), _jsxs("span", { children: ["Anteil ", pct(m.share)] }), _jsxs("span", { children: ["Vertrauensgrad ", pct(m.confidence * 100)] })] }, m.label)) }) : _jsx(Empty, { text: "Noch keine Berechnungsquellen erkannt." }) }), _jsxs(Panel, { title: "Berechnungsergebnis", children: [_jsx(Row, { label: "Positionen berechnet", value: calculated }), _jsx(Row, { label: "Positionen zur Pr\u00FCfung", value: review }), _jsx(Row, { label: "Positionen ohne EP", value: missingEp }), _jsx(Row, { label: "Positionen ohne Urkalkulation", value: missingUrk }), _jsx(Row, { label: "Vom \u00DCberwachungsmodul gepr\u00FCft", value: Number(summary?.annotatedRows || 0) }), _jsx(Row, { label: "Quellenabweichungen", value: Number(summary?.epSourceMismatches || 0) })] }), _jsxs(Panel, { title: "Empfehlungen", children: [_jsx(Recommendation, { n: dbCandidates.length, text: "Positionen eignen sich als Kandidaten f\u00FCr Firmenwissen." }), _jsx(Recommendation, { n: review, text: "Positionen sollten fachlich gepr\u00FCft werden." }), _jsx(Recommendation, { n: missingEp, text: "Positionen ben\u00F6tigen einen belastbaren Einheitspreis." }), _jsx(Recommendation, { n: missingUrk, text: "Positionen ben\u00F6tigen einen nachvollziehbaren Preisaufbau." })] })] }), _jsxs(Panel, { title: "Kandidaten f\u00FCr Firmenwissen", children: [_jsxs("div", { className: rlcClass(null, S.toolbar), children: [_jsxs("div", { className: rlcClass(null, S.toolbarGroup), children: [_jsxs("strong", { children: [dbCandidates.length, " unterschiedliche Positionen erkannt"] }), _jsx("span", { children: visibleDbCandidates.length ?
                                            `1–${visibleDbCandidates.length} von ${dbCandidates.length}` :
                                            "0 Positionen" }), _jsxs("label", { className: rlcClass(null, S.selectLabel), children: ["Anzeigen", _jsxs("select", { className: rlcClass(null, S.select), value: String(candidatePageSize), onChange: (event) => {
                                                    const next = event.target.value;
                                                    setCandidatePageSize(next === "all" ? "all" : Number(next));
                                                }, children: [_jsx("option", { value: "10", children: "10" }), _jsx("option", { value: "20", children: "20" }), _jsx("option", { value: "30", children: "30" }), _jsx("option", { value: "all", children: "Alle" })] })] })] }), _jsxs("div", { className: rlcClass(null, S.toolbarActions), children: [_jsx("button", { type: "button", className: rlcClass(null, { ...S.primary, ...(!selectedDbCandidates.length || databaseSaving ? S.disabledButton : {}) }), onClick: () => void transferSelectedCandidates(), disabled: !selectedDbCandidates.length || databaseSaving, children: databaseSaving ?
                                            "Wird übernommen…" :
                                            `Ausgewählte in Datenbank übernehmen (${selectedDbCandidates.length})` }), _jsx("button", { type: "button", className: rlcClass(null, S.secondary), onClick: () => navigate("/kalkulation/datenbank"), children: "Datenbank \u00F6ffnen" })] })] }), dbCandidates.length ? _jsx("div", { className: rlcClass(null, S.tableWrap), children: _jsxs("table", { className: rlcClass(null, S.table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, S.checkCell), children: _jsx("input", { type: "checkbox", "aria-label": "Alle sichtbaren Positionen ausw\u00E4hlen", checked: allVisibleCandidatesSelected, onChange: toggleVisibleCandidates }) }), _jsx("th", { className: rlcClass(null, S.th), children: "Pos." }), _jsx("th", { className: rlcClass(null, S.th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, S.th), children: "Quelle" }), _jsx("th", { className: rlcClass(null, S.th), children: "ME" }), _jsx("th", { className: rlcClass(null, S.thR), children: "EP" }), _jsx("th", { className: rlcClass(null, S.thR), children: "Vertrauensgrad" })] }) }), _jsx("tbody", { children: visibleDbCandidates.map((c) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, S.checkCell), children: _jsx("input", { type: "checkbox", "aria-label": `Position ${c.posNr} auswählen`, checked: selectedCandidateSet.has(c.id), onChange: () => toggleCandidate(c.id) }) }), _jsx("td", { className: rlcClass(null, S.tdB), children: c.posNr }), _jsx("td", { className: rlcClass(null, S.td), children: c.kurztext }), _jsx("td", { className: rlcClass(null, S.td), children: c.source }), _jsx("td", { className: rlcClass(null, S.td), children: c.einheit }), _jsx("td", { className: rlcClass(null, S.tdR), children: money(c.ep) }), _jsx("td", { className: rlcClass(null, S.tdR), children: pct(c.confidence * 100) })] }, c.id)) })] }) }) : _jsx(Empty, { text: "Keine freigabef\u00E4higen Kandidaten erkannt." })] }), _jsxs("section", { className: rlcClass(null, S.statusGrid), children: [_jsxs(Panel, { title: "Autonomes System", children: [_jsx(Row, { label: "Status", value: observerStatus(observer) }), _jsx(Row, { label: "Letzte Ausf\u00FChrung", value: dateText(observerDate(observer)) }), _jsx(Row, { label: "Beobachtete Projekte", value: observerProjects }), _jsx(Row, { label: "Analysierte Dateien", value: observerFiles }), _jsx(Row, { label: "\u00C4nderungen in 24 Stunden", value: observerChanges }), _jsx(Row, { label: "Fehler", value: observerErrors })] }), _jsxs(Panel, { title: "Internetbeobachtung", children: [_jsx(Row, { label: "Letzte Aktualisierung", value: dateText(value(marketStatus, ["finishedAt", "lastRunAt", "updatedAt", "lastUpdate"])) }), _jsx(Row, { label: "\u00DCberwachte Quellen", value: value(marketStatus, ["sourcesChecked", "sources", "sourceCount"], 0) }), _jsx(Row, { label: "Gespeicherte Informationen", value: value(marketDashboard, ["counters.events"], events.length) }), _jsx(Row, { label: "Abgelehnte Informationen", value: value(marketStatus, ["rejectedEntries", "rejected", "rejections"], rejections.length) }), _jsx(Row, { label: "Letzter Fehler", value: value(marketStatus, ["lastError", "error"], "Kein Fehler") })] })] }), _jsxs(Panel, { title: "Marktbeobachtung", children: [_jsxs("div", { className: rlcClass(null, S.toolbar), children: [_jsxs("span", { children: [events.length, " gespeicherte Informationen"] }), _jsx("button", { className: rlcClass(null, S.secondary), onClick: () => void reload(), children: loading ? "Wird aktualisiert…" : "Aktualisieren" })] }), latest.length ? _jsx("div", { className: rlcClass(null, S.news), children: latest.map((e, i) => {
                            const id = marketCandidateId(e) || String(i);
                            const scopeId = scopedImpactId(key, id);
                            const impact = marketImpacts[scopeId] || null;
                            return _jsx(MarketEventCard, { event: e, impact: impact, activeProjectCode: key, expanded: openImpactId === scopeId, loading: impactLoadingId === scopeId, error: impactErrors[scopeId] || "", onShow: () => void showAffectedPositions(e), onOpenPosition: openAffectedPosition }, scopeId);
                        }) }) : _jsx(Empty, { text: "Die Marktbeobachtung hat noch keine Ereignisse geliefert." })] }), _jsxs("section", { className: rlcClass(null, S.bottomGrid), children: [_jsx(Panel, { title: "\u00C4nderungsprotokoll", children: latest.length ? latest.map((e, i) => {
                            const sourceUrl = eventUrl(e);
                            return _jsxs("div", { className: rlcClass(null, S.log), children: [_jsx("span", { children: dateText(eventDate(e)) }), sourceUrl ?
                                        _jsx("a", { className: rlcClass(null, S.logLink), href: sourceUrl, target: "_blank", rel: "noreferrer", children: eventTitle(e) }) :
                                        _jsx("strong", { children: eventTitle(e) }), _jsx("small", { children: eventSource(e) })] }, i);
                        }) : _jsx(Empty, { text: "Noch keine autonomen \u00C4nderungen protokolliert." }) }), _jsx(Panel, { title: "Direkte Fachmodule", children: _jsxs("div", { className: rlcClass(null, S.links), children: [_jsx(LinkButton, { label: "LV / Positionen", onClick: () => navigate("/kalkulation/lv-import") }), _jsx(LinkButton, { label: "Kalkulation \u00F6ffnen", onClick: () => navigate("/kalkulation/mit-ki") }), _jsx(LinkButton, { label: "Urkalkulation", onClick: () => navigate("/kalkulation/rezepte") }), _jsx(LinkButton, { label: "Datenbank \u00F6ffnen", onClick: () => navigate("/kalkulation/datenbank") }), _jsx(LinkButton, { label: "Versionsvergleich", onClick: () => navigate("/kalkulation/versionsvergleich") }), _jsx(LinkButton, { label: "Nachtr\u00E4ge", onClick: () => navigate("/kalkulation/nachtraege") }), _jsx(LinkButton, { label: "Angebot", onClick: () => navigate("/kalkulation/angebot") }), _jsx(LinkButton, { label: "GAEB", onClick: () => navigate("/kalkulation/gaeb") })] }) })] })] });
}
function MarketEventCard(p) {
    const signal = marketChange(p.event);
    const rawImpact = marketImpact(p.event);
    const positions = affectedPositions(p.impact);
    const sourceUrl = eventUrl(p.event);
    const category = germanMarketCategory(firstText(rawImpact?.materials) ||
        firstText(rawImpact?.lvTerms) ||
        value(marketEvent(p.event), ["material", "category", "topic"], "Bauwirtschaft"));
    const trend = String(rawImpact?.direction || value(marketEvent(p.event), ["direction", "trend"], "nicht bewertet"));
    const candidateAvailable = Boolean(marketCandidateId(p.event));
    const validationDroppedCount = num(p.impact?.validationDroppedCount);
    const validationFailedProjects = Array.isArray(p.impact?.validationFailedProjects) ?
        p.impact.validationFailedProjects :
        [];
    const outOfScopeProjectCount = num(p.impact?.outOfScopeProjectCount);
    const calculable = p.impact ? summaryNumber(p.impact, [
        "summary.calculablePositions", "calculablePositions"
    ], positions.filter((position) => position?.calculationAvailable !== false).length) : 0;
    const missingBreakdown = p.impact ? summaryNumber(p.impact, [
        "summary.missingCostBreakdown", "missingCostBreakdown"
    ], positions.filter((position) => position?.calculationAvailable === false).length) : 0;
    const missingAffectedShare = p.impact ? summaryNumber(p.impact, [
        "summary.missingAffectedCostShare", "missingAffectedCostShare"
    ], positions.filter((position) => String(position?.impactStatus || "").toUpperCase() === "MISSING_AFFECTED_COST_SHARE").length) : 0;
    return _jsxs("article", { className: rlcClass(null, { ...S.newsCard, ...(p.expanded ? S.newsCardExpanded : {}) }), children: [_jsxs("div", { className: rlcClass(null, S.newsTop), children: [_jsx("span", { className: rlcClass(null, S.tag), children: category }), _jsx("small", { children: dateText(eventDate(p.event)) })] }), _jsx("h3", { className: rlcClass(null, S.newsTitle), children: sourceUrl ?
                    _jsx("a", { className: rlcClass(null, S.newsTitleLink), href: sourceUrl, target: "_blank", rel: "noreferrer", children: eventTitle(p.event) }) :
                    eventTitle(p.event) }), _jsx("p", { className: rlcClass(null, S.newsText), children: eventText(p.event) }), _jsxs("div", { className: rlcClass(null, S.priceSignal), children: [_jsx("span", { children: "Preis\u00E4nderung erkannt" }), _jsx("strong", { children: signal.label })] }), p.impact ? _jsxs("div", { className: rlcClass(null, S.impactSummary), children: [_jsx(ImpactFact, { label: "Betroffene Projekte", value: String(affectedProjectCount(p.impact)) }), _jsx(ImpactFact, { label: "Betroffene LV-Positionen", value: String(affectedPositionCount(p.impact)) }), _jsx(ImpactFact, { label: "Empfohlene Anpassung", value: suggestedAdjustment(p.impact) }), _jsx(ImpactFact, { label: "Status", value: "Vorschlag \u2013 nicht angewendet" })] }) : _jsxs("div", { className: rlcClass(null, S.proposalStatus), children: [_jsx("span", { children: "Status" }), _jsx("strong", { children: "Vorschlag \u2013 nicht angewendet" })] }), _jsxs("div", { className: rlcClass(null, S.newsMeta), children: [_jsxs("span", { children: ["Trend: ", trend] }), sourceUrl ?
                        _jsxs("a", { className: rlcClass(null, S.sourceLink), href: sourceUrl, target: "_blank", rel: "noreferrer", children: ["Quelle \u00F6ffnen: ", eventSource(p.event)] }) :
                        _jsxs("strong", { children: ["Quelle: ", eventSource(p.event)] })] }), _jsxs("div", { className: rlcClass(null, S.impactActions), children: [candidateAvailable ? _jsx("button", { type: "button", className: rlcClass(null, { ...S.secondary, ...(p.loading ? S.disabledButton : {}) }), disabled: p.loading, onClick: p.onShow, children: p.loading ? "Auswirkung wird analysiert…" : p.expanded ? "Betroffene Positionen schließen" : "Betroffene Positionen anzeigen" }) :
                        _jsx("small", { className: rlcClass(null, S.impactHint), children: "Keine belastbare Preisauswirkung f\u00FCr LV-Positionen erkannt." }), p.impact ? _jsxs("small", { children: [calculable, " berechenbar \u00B7 ", missingBreakdown, " ohne Kostenaufteilung", missingAffectedShare ? ` · ${missingAffectedShare} ohne Bitumenanteil` : "", " · ", impactStatus(p.impact?.status)] }) : null] }), p.error ? _jsx("div", { className: rlcClass(null, S.impactError), children: p.error }) : null, p.expanded && p.impact ? _jsxs("div", { className: rlcClass(null, S.impactDetails), children: [_jsxs("div", { className: rlcClass(null, S.impactScopeNote), children: ["Analyse nur f\u00FCr das aktive Projekt ", _jsx("strong", { children: p.activeProjectCode || "–" }), ". Angezeigt werden ausschlie\u00DFlich Positionen aus dessen echtem Projekt-LV."] }), outOfScopeProjectCount > 0 ? _jsxs("div", { className: rlcClass(null, S.validationNote), children: [outOfScopeProjectCount, " alter Treffer aus anderen Projekten wurde ignoriert."] }) : null, validationDroppedCount > 0 ? _jsxs("div", { className: rlcClass(null, S.validationNote), children: [validationDroppedCount, " gemeldete Position(en) wurden im Projekt-LV nicht als technisch betroffen best\u00E4tigt und deshalb ausgeblendet."] }) : null, validationFailedProjects.length ? _jsxs("div", { className: rlcClass(null, S.impactError), children: ["LV-Pr\u00FCfung derzeit nicht m\u00F6glich f\u00FCr: ", validationFailedProjects.join(", "), "."] }) : null, positions.length ? _jsx("div", { className: rlcClass(null, S.tableWrap), children: _jsxs("table", { className: rlcClass(null, S.table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, S.th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, S.th), children: "LV-OZ" }), _jsx("th", { className: rlcClass(null, S.th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, S.th), children: "Kostengruppe" }), _jsx("th", { className: rlcClass(null, S.thR), children: "Kostenanteil" }), _jsx("th", { className: rlcClass(null, S.thR), children: "EP aktuell" }), _jsx("th", { className: rlcClass(null, S.thR), children: "Anpassung" }), _jsx("th", { className: rlcClass(null, S.thR), children: "EP-Vorschlag" }), _jsx("th", { className: rlcClass(null, S.th), children: "Status" }), _jsx("th", { className: rlcClass(null, S.th), children: "LV" })] }) }), _jsx("tbody", { children: positions.map((position, index) => {
                                        const suggested = suggestedPrices(position);
                                        const adjustment = positionAdjustment(position);
                                        const canCalculate = position?.calculationAvailable !== false && suggested.min > 0;
                                        const proposedPrice = canCalculate ?
                                            Math.abs(suggested.max - suggested.min) < 0.005 ?
                                                money(suggested.min) :
                                                `${money(suggested.min)} bis ${money(suggested.max)}` :
                                            impactStatus(position?.impactStatus);
                                        return _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, S.tdB), children: projectName(position) }), _jsx("td", { className: rlcClass(null, S.tdB), children: _jsx("button", { type: "button", className: rlcClass(null, S.tableLink), title: `${projectName(position)} · ${positionNumber(position)} · ${positionText(position)}`, onClick: () => p.onOpenPosition(position), children: positionNumber(position) }) }), _jsx("td", { className: rlcClass(null, S.td), children: positionText(position) }), _jsx("td", { className: rlcClass(null, S.td), children: germanCostGroup(value(position, ["affectedCostGroup", "costGroup"], p.impact?.affectedCostGroup || "–")) }), _jsx("td", { className: rlcClass(null, S.tdR), children: pct(num(value(position, ["affectedSharePct", "materialShare", "costSharePct"], 0))) }), _jsx("td", { className: rlcClass(null, S.tdR), children: currentPrice(position) ? money(currentPrice(position)) : "–" }), _jsx("td", { className: rlcClass(null, S.tdR), children: adjustment ? pctRange(adjustment.min, adjustment.max) : "–" }), _jsx("td", { className: rlcClass(null, S.tdR), children: proposedPrice }), _jsx("td", { className: rlcClass(null, S.td), children: canCalculate ? "Vorschlag" : impactStatus(position?.impactStatus) }), _jsx("td", { className: rlcClass(null, S.td), children: _jsx("button", { type: "button", className: rlcClass(null, S.tableLink), onClick: () => p.onOpenPosition(position), children: "Im LV \u00F6ffnen" }) })] }, String(position?.id || `${projectName(position)}-${positionNumber(position)}-${index}`));
                                    }) })] }) }) : _jsx(Empty, { text: "F\u00FCr diese Marktinformation wurden keine betroffenen LV-Positionen gefunden." }), _jsx("div", { className: rlcClass(null, S.safetyNote), children: "Nur Analyse und Preisvorschlag. Einheitspreise, Rezepte und Firmendaten wurden nicht ge\u00E4ndert." })] }) : null] });
}
function ImpactFact(p) {
    return _jsxs("div", { className: rlcClass(null, S.impactFact), children: [_jsx("span", { children: p.label }), _jsx("strong", { children: p.value })] });
}
function Metric(p) { return _jsxs("div", { className: rlcClass(null, S.metric), children: [_jsx("span", { className: rlcClass(null, S.metricLabel), children: p.label }), _jsx("strong", { className: rlcClass(null, S.metricValue), children: p.value }), _jsx("small", { className: rlcClass(null, S.metricHint), children: p.hint })] }); }
function Panel(p) {
    return _jsxs("section", { className: rlcClass(null, S.panel), children: [_jsxs("div", { className: rlcClass(null, S.panelHeader), children: [_jsx("span", { className: rlcClass(null, S.panelAccent) }), _jsx("h2", { className: rlcClass(null, S.panelTitle), children: p.title })] }), _jsx("div", { className: rlcClass(null, S.panelBody), children: p.children })] });
}
function Row(p) { return _jsxs("div", { className: rlcClass(null, S.row), children: [_jsx("span", { children: p.label }), _jsx("strong", { children: p.value })] }); }
function Recommendation(p) { return _jsxs("div", { className: rlcClass(null, S.rec), children: [_jsx("strong", { className: rlcClass(null, S.recNumber), children: p.n }), _jsx("span", { children: p.text })] }); }
function LinkButton(p) { return _jsx("button", { className: rlcClass(null, S.linkButton), onClick: p.onClick, children: p.label }); }
function Empty(p) { return _jsx("div", { className: rlcClass(null, S.empty), children: p.text }); }
const S = {
    page: { width: "100%", maxWidth: 1640, margin: "0 auto", padding: "10px 12px 18px", color: "#172033", fontSize: 13, lineHeight: 1.38, background: "#f4f7fb" },
    hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "10px 12px", marginBottom: 8, border: "1px solid #dbe3ee", borderRadius: 8, background: "#fff", boxShadow: "0 2px 8px rgba(26,45,72,.05)", color: "#172033" },
    heroMain: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
    heroMark: { display: "grid", placeItems: "center", width: 38, height: 38, flex: "0 0 38px", borderRadius: 7, background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: ".08em" },
    heroRight: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, minWidth: 0 },
    eyebrow: { fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,.78)" },
    title: { margin: "1px 0 2px", fontSize: 21, lineHeight: 1.08, letterSpacing: "-.015em" },
    subtitle: { margin: 0, color: "#65748a", maxWidth: 720, fontSize: 11.5 },
    project: { minWidth: 260, maxWidth: 470, display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: "0 8px", padding: "3px 10px", borderLeft: "1px solid rgba(255,255,255,.28)", fontSize: 11, color: "rgba(255,255,255,.82)" },
    projectLabel: { fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.72)" },
    projectCode: { fontSize: 13, color: "#ffffff" },
    projectName: { gridColumn: "1 / -1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    projectDate: { gridColumn: "1 / -1", color: "rgba(255,255,255,.68)", fontSize: 10 },
    heroButton: { minHeight: 34, border: "1px solid rgba(255,255,255,.42)", borderRadius: 9, padding: "5px 11px", background: "#ffffff", color: "#0b5bd3", fontSize: 11.5, fontWeight: 650, cursor: "pointer", whiteSpace: "nowrap" },
    metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: 6, marginBottom: 8 },
    metric: { display: "grid", gap: 1, padding: "7px 9px", borderRadius: 6, background: "#fff", border: "1px solid #dbe3ec", boxShadow: "0 1px 3px rgba(26,45,72,.035)" },
    metricLabel: { color: "#66758a", fontSize: 9.5, fontWeight: 700, letterSpacing: ".045em", textTransform: "uppercase" },
    metricValue: { fontSize: 17, lineHeight: 1.12, color: "#1d3552", fontVariantNumeric: "tabular-nums" },
    metricHint: { color: "#7a8796", fontSize: 10.5 },
    overviewGrid: { display: "grid", gridTemplateColumns: "minmax(360px,1.25fr) repeat(2,minmax(270px,.8fr))", gap: 8, alignItems: "start" },
    statusGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 8 },
    bottomGrid: { display: "grid", gridTemplateColumns: "minmax(480px,1.5fr) minmax(310px,.7fr)", gap: 8, alignItems: "start" },
    panel: { marginBottom: 8, padding: 0, overflow: "hidden", background: "#fff", border: "1px solid #dbe3ec", borderRadius: 7, boxShadow: "0 1px 4px rgba(26,45,72,.035)" },
    panelHeader: { display: "flex", alignItems: "center", gap: 7, minHeight: 34, padding: "0 9px", borderBottom: "1px solid #e6ebf1", background: "#fbfcfe" },
    panelAccent: { width: 3, height: 16, borderRadius: 2, background: "#376da8" },
    panelTitle: { margin: 0, fontSize: 14, lineHeight: 1.2, color: "#223a58", letterSpacing: ".005em" },
    panelBody: { padding: "7px 9px 8px" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 5 },
    card: { display: "grid", gridTemplateColumns: "minmax(105px,1fr) auto", gap: "1px 8px", padding: "6px 7px", border: "1px solid #e3e8ef", borderRadius: 4, background: "#f8fafc", fontSize: 10.5 },
    row: { display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 1px", borderBottom: "1px solid #edf0f4", fontSize: 11.5 },
    rec: { display: "grid", gridTemplateColumns: "29px 1fr", gap: 7, alignItems: "center", padding: "4px 1px", borderBottom: "1px solid #edf0f4", fontSize: 11.5 },
    recNumber: { display: "grid", placeItems: "center", width: 25, height: 21, borderRadius: 4, background: "#e9f0f8", color: "#285b94", fontSize: 11 },
    toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, margin: "0 0 7px", color: "#66758a", fontSize: 11.5 },
    toolbarGroup: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 },
    toolbarActions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 },
    selectLabel: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600 },
    select: { height: 29, padding: "0 20px 0 7px", border: "1px solid #bcc8d6", borderRadius: 4, background: "#fff", color: "#172033", fontSize: 11.5, fontWeight: 600 },
    primary: { minHeight: 30, border: 0, borderRadius: 4, padding: "4px 10px", background: "#285f9f", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 1px 2px rgba(31,65,107,.12)" },
    secondary: { minHeight: 30, border: "1px solid #c5cfdb", borderRadius: 4, padding: "3px 10px", background: "#fff", color: "#24374f", fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
    tableWrap: { overflowX: "auto", border: "1px solid #dce2ea", borderRadius: 5 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 11.5, lineHeight: 1.25 },
    th: { padding: "6px 6px", textAlign: "left", color: "#53667d", borderBottom: "1px solid #cfd7e2", background: "#f1f4f8", fontSize: 10, fontWeight: 700, letterSpacing: ".035em", textTransform: "uppercase", whiteSpace: "nowrap" },
    thR: { padding: "6px 6px", textAlign: "right", color: "#53667d", borderBottom: "1px solid #cfd7e2", background: "#f1f4f8", fontSize: 10, fontWeight: 700, letterSpacing: ".035em", textTransform: "uppercase", whiteSpace: "nowrap" },
    td: { padding: "5.5px 6px", borderBottom: "1px solid #e8ecf1" },
    tdB: { padding: "5.5px 6px", borderBottom: "1px solid #e8ecf1", fontWeight: 700, color: "#263d59" },
    tdR: { padding: "5.5px 6px", borderBottom: "1px solid #e8ecf1", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
    checkCell: { width: 29, padding: "4px", textAlign: "center", borderBottom: "1px solid #e8ecf1" },
    news: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(390px,1fr))", gap: 7 },
    newsCard: { padding: 9, borderRadius: 6, border: "1px solid #dce3ec", borderTop: "3px solid #819bb9", background: "#fff", boxShadow: "0 1px 3px rgba(27,48,74,.035)" },
    newsCardExpanded: { gridColumn: "1 / -1", background: "#fff", borderTopColor: "#356ca8" },
    newsTop: { display: "flex", justifyContent: "space-between", gap: 8 },
    tag: { padding: "2px 6px", borderRadius: 999, background: "#e8eff8", color: "#2a578a", fontSize: 9.5, fontWeight: 700, letterSpacing: ".03em" },
    newsTitle: { margin: "6px 0 3px", fontSize: 13.5, lineHeight: 1.28, color: "#1d334d" },
    newsTitleLink: { color: "inherit", textDecoration: "none" },
    newsText: { margin: "3px 0", color: "#5d6d81", lineHeight: 1.3, fontSize: 11 },
    newsMeta: { display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, alignItems: "center", color: "#728094" },
    sourceLink: { color: "#1d5fd1", fontWeight: 700, textDecoration: "none" },
    priceSignal: { display: "flex", justifyContent: "space-between", gap: 7, margin: "6px 0", padding: "5px 7px", borderRadius: 4, border: "1px solid #f0dfb9", background: "#fff9ec", fontSize: 11 },
    impactSummary: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(128px,1fr))", gap: 4, margin: "6px 0" },
    impactFact: { display: "grid", gap: 1, padding: "5px 6px", borderRadius: 4, border: "1px solid #e2e7ee", background: "#f7f9fc", fontSize: 10 },
    proposalStatus: { display: "flex", justifyContent: "space-between", gap: 8, margin: "6px 0", padding: "5px 7px", borderRadius: 4, background: "#f7f9fc", fontSize: 11 },
    impactActions: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 5 },
    impactHint: { color: "#64748b" },
    disabledButton: { opacity: .55, cursor: "not-allowed" },
    impactDetails: { marginTop: 7, paddingTop: 7, borderTop: "1px solid #dce2ea" },
    impactError: { marginTop: 5, padding: 6, borderRadius: 4, border: "1px solid #edcccc", background: "#fff6f6", color: "#922d2d", fontSize: 11 },
    safetyNote: { marginTop: 6, padding: 6, borderRadius: 4, border: "1px solid #cfe4d7", background: "#f2f8f4", color: "#17643a", fontSize: 11, fontWeight: 600 },
    impactScopeNote: { marginBottom: 5, padding: 6, borderRadius: 4, border: "1px solid #cfdded", background: "#f3f7fc", color: "#244d7f", fontSize: 11, fontWeight: 600 },
    validationNote: { marginBottom: 5, padding: 6, borderRadius: 4, border: "1px solid #ead7b8", background: "#fff9ef", color: "#755019", fontSize: 11, fontWeight: 600 },
    tableLink: { border: 0, padding: 0, background: "transparent", color: "#1d5fd1", font: "inherit", fontWeight: 700, textAlign: "left", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" },
    log: { display: "grid", gridTemplateColumns: "132px minmax(220px,1fr) 150px", gap: 7, padding: "4px 1px", borderBottom: "1px solid #e8ecf1", fontSize: 10.5 },
    logLink: { color: "#0f172a", fontWeight: 700, textDecoration: "none" },
    links: { display: "grid", gridTemplateColumns: "repeat(2,minmax(125px,1fr))", gap: 5 },
    linkButton: { minHeight: 32, border: "1px solid #d4dde8", borderRadius: 5, padding: "4px 8px", background: "#f8fafc", color: "#273c55", fontSize: 11.5, fontWeight: 700, cursor: "pointer", textAlign: "left" },
    warning: { marginBottom: 8, padding: "7px 9px", borderRadius: 5, border: "1px solid #ead7b2", background: "#fff9ed", color: "#755019" },
    empty: { padding: "7px 0", color: "#66758a", fontSize: 11 }
};
