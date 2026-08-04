// apps/web/src/pages/kalkulation/useKiSuggest.ts
import { useState } from "react";
import { apiUrl } from "../../lib/apiBase";
/* ================= API ================= */
function getAuthToken() {
    try {
        const keys = [
            "rlc_token",
            "token",
            "authToken",
            "accessToken",
            "rlc.auth.token",
            "rlc_mobile_token",
            "rlc_auth_token",
            "rlc_access_token",
        ];
        for (const key of keys) {
            const value = localStorage.getItem(key);
            if (value && value.trim())
                return value.trim();
        }
        const jsonKeys = [
            "rlc_auth",
            "auth",
            "user",
            "session",
            "rlc_session",
            "rlc.auth",
            "rlc.session",
        ];
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
                    parsed?.data?.accessToken ??
                    parsed?.user?.token ??
                    parsed?.user?.accessToken;
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
function authJsonHeaders() {
    const token = getAuthToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
async function postJson(path, body) {
    try {
        const url = apiUrl(path);
        const res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: authJsonHeaders(),
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
            console.warn("[RLC Kalkulation KI] Server/OpenAI call failed:", {
                url,
                status: res.status,
                response: json,
            });
            return null;
        }
        return json;
    }
    catch (error) {
        console.warn("[RLC Kalkulation KI] Server/OpenAI not reachable:", error);
        return null;
    }
}
async function postKiSuggestBatchChunked(projectCode, inputRows, options) {
    /*
     * Professionelle KI-Strategie:
     * - Normal schnell in Chunks rechnen.
     * - Bei 504/Timeout nicht alles abbrechen.
     * - Fehlenden Chunk automatisch kleiner erneut rechnen.
     * - Erst wenn auch Einzelposition scheitert: lokaler Fallback nur für diese Position.
     */
    const forceRecalculate = options?.forceRecalculate === true;
    const completedRows = forceRecalculate
        ? []
        : inputRows.filter((r) => {
            const hasBreakdown = Array.isArray(r.priceBreakdown) && r.priceBreakdown.length > 0;
            const hasPrice = n(r.finalUnitPrice) > 0 ||
                n(r.suggestedUnitPrice) > 0 ||
                n(r.preis) > 0;
            const hasBasicData = cleanText(r.kurztext).length > 0 &&
                cleanText(r.einheit).length > 0 &&
                n(r.menge) > 0;
            return hasBreakdown && hasPrice && hasBasicData;
        });
    const completedIds = new Set(completedRows.map((r) => String(r.id || "")));
    const rowsNeedingKi = forceRecalculate
        ? inputRows.filter((r) => !isStructuralInputRow(r, projectCode))
        : inputRows.filter((r) => !completedIds.has(String(r.id || "")) &&
            !isStructuralInputRow(r, projectCode));
    if (!rowsNeedingKi.length) {
        const rows = inputRows.map(localEliteCalculateRow);
        return {
            ok: true,
            source: "local-rule-engine",
            rows,
            summary: {
                ...buildSummary(rows),
                checkedCount: inputRows.length,
                skippedCount: completedRows.length,
                serverRequestedCount: 0,
                serverReturnedCount: 0,
                localFallbackCount: 0,
                forceRecalculate,
            },
            error: "Prüfung abgeschlossen: Alle sichtbaren LV-Positionen haben EP, Menge, Einheit und Urkalkulation.",
        };
    }
    const serverRows = [];
    let localFallbackCount = 0;
    let retrySingleCount = 0;
    /*
     * SPEED FIX:
     * Vorher: sehr kleine Chunks + sequenzielles await.
     * Jetzt: größere Chunks + kontrollierte Parallelität.
     *
     * Ziel:
     * - 17 Positionen nicht mehr 8 Minuten.
     * - 500 Positionen nicht mehrere Stunden.
     * - Server/OpenAI wird trotzdem nicht unkontrolliert überlastet.
     */
    const primaryChunkSize = forceRecalculate ? 4 : 12;
    const maxParallelChunks = 1;
    const chunks = [];
    for (let i = 0; i < rowsNeedingKi.length; i += primaryChunkSize) {
        chunks.push(rowsNeedingKi.slice(i, i + primaryChunkSize));
    }
    function authHeaders() {
        try {
            const direct = localStorage.getItem("token") ||
                localStorage.getItem("authToken") ||
                localStorage.getItem("accessToken") ||
                localStorage.getItem("rlc_token");
            if (direct) {
                return { Authorization: `Bearer ${direct}` };
            }
            const authRaw = localStorage.getItem("auth") ||
                localStorage.getItem("rlc_auth") ||
                localStorage.getItem("user");
            if (authRaw) {
                const parsed = JSON.parse(authRaw);
                const token = parsed?.token ||
                    parsed?.accessToken ||
                    parsed?.authToken ||
                    parsed?.data?.token ||
                    parsed?.data?.accessToken;
                if (token) {
                    return { Authorization: `Bearer ${token}` };
                }
            }
        }
        catch {
            // keine Auth-Daten gefunden
        }
        return {};
    }
    async function requestChunk(chunk) {
        try {
            const res = await fetch(apiUrl("/api/kalkulation/ki/suggest-batch"), {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(),
                },
                body: JSON.stringify({
                    projectCode,
                    projectKey: projectCode,
                    rows: chunk,
                    options: {
                        ...options,
                        maxParallelRows: options?.maxParallelRows ?? (forceRecalculate ? 4 : 6),
                        maxOpenAiRowsPerBatch: options?.maxOpenAiRowsPerBatch ?? (forceRecalculate ? 20 : 8),
                        forceRecalculate,
                    },
                }),
            });
            if (!res.ok) {
                console.warn("[useKiSuggest] suggest-batch chunk failed", {
                    status: res.status,
                    chunkSize: chunk.length,
                });
                return null;
            }
            const json = await res.json().catch(() => null);
            const rows = json?.rows ||
                json?.suggestions ||
                json?.data?.rows ||
                json?.data?.suggestions ||
                [];
            if (!Array.isArray(rows))
                return null;
            return rows;
        }
        catch (e) {
            console.warn("[useKiSuggest] suggest-batch chunk error", e);
            return null;
        }
    }
    async function processChunk(chunk) {
        const chunkResult = await requestChunk(chunk);
        if (chunkResult) {
            serverRows.push(...chunkResult);
            return;
        }
        /*
         * Adaptive Retry:
         * Nur wenn ein ganzer Chunk scheitert, werden die Positionen einzeln erneut versucht.
         */
        for (const singleRow of chunk) {
            retrySingleCount += 1;
            const singleResult = await requestChunk([singleRow]);
            if (singleResult) {
                serverRows.push(...singleResult);
            }
            else {
                localFallbackCount += 1;
                serverRows.push(localEliteCalculateRow(singleRow));
            }
        }
    }
    let nextChunkIndex = 0;
    async function worker() {
        while (nextChunkIndex < chunks.length) {
            const currentIndex = nextChunkIndex;
            nextChunkIndex += 1;
            const chunk = chunks[currentIndex];
            if (chunk?.length) {
                await processChunk(chunk);
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(maxParallelChunks, chunks.length) }, () => worker()));
    const completedNormalized = completedRows.map(localEliteCalculateRow);
    const resultByKey = new Map();
    for (const r of [...completedNormalized, ...serverRows]) {
        const idKey = String(r?.id || "").trim();
        const posKey = String(r?.posNr || "").trim();
        if (idKey)
            resultByKey.set(`id:${idKey}`, r);
        if (posKey)
            resultByKey.set(`pos:${posKey}`, r);
    }
    const allRows = inputRows
        .filter((r) => !isStructuralInputRow(r, projectCode))
        .map((inputRow) => {
        const idKey = String(inputRow.id || "").trim();
        const posKey = String(inputRow.posNr || "").trim();
        return ((idKey ? resultByKey.get(`id:${idKey}`) : null) ||
            (posKey ? resultByKey.get(`pos:${posKey}`) : null) ||
            localEliteCalculateRow(inputRow));
    });
    return {
        ok: true,
        source: "server",
        engine: forceRecalculate
            ? "adaptive-force-openai-recalculate"
            : "adaptive-database-openai-rule-engine",
        rows: allRows,
        summary: {
            ...buildSummary(allRows),
            checkedCount: inputRows.length,
            skippedCount: completedRows.length,
            serverRequestedCount: rowsNeedingKi.length,
            serverReturnedCount: Math.max(0, serverRows.length - localFallbackCount),
            localFallbackCount,
            retrySingleCount,
            forceRecalculate,
            primaryChunkSize,
        },
    };
}
/* ================= HELPERS ================= */
function n(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    const raw = String(value).trim();
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/\s/g, "");
    const x = typeof value === "number" ? value : Number(normalized);
    return Number.isFinite(x) ? x : fallback;
}
function cleanText(value) {
    return String(value ?? "").trim();
}
function isStructuralInputRow(row, projectCode = "") {
    const pos = cleanText(row.posNr);
    const kurz = cleanText(row.kurztext);
    const lang = cleanText(row.langtext);
    const gewerk = cleanText(row.gewerk).toLowerCase();
    const leistungsart = cleanText(row.leistungsart).toLowerCase();
    const text = `${kurz} ${lang}`.toLowerCase();
    const unit = cleanText(row.einheit).toLowerCase();
    const pc = cleanText(projectCode).toLowerCase();
    if (pc && pos.toLowerCase() === pc)
        return true;
    if (/^ba-\d{4}/i.test(pos))
        return true;
    if (/^ba-\d{4}/i.test(kurz))
        return true;
    if (/^titel\s*\d*$/i.test(kurz))
        return true;
    if (/^abschnitt\s*\d*$/i.test(kurz))
        return true;
    if (/^kapitel\s*\d*$/i.test(kurz))
        return true;
    if (gewerk.includes("gliederung"))
        return true;
    if (leistungsart.includes("struktur"))
        return true;
    if (text.includes("keine kalkulatorische leistungsposition"))
        return true;
    if ((unit === "ps" || unit === "pauschal") && /^(\d{2}|\d{2}\.\d{2})$/.test(pos)) {
        return true;
    }
    return false;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `pb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function hasExistingCalculationData(row) {
    const breakdown = Array.isArray(row.priceBreakdown) && row.priceBreakdown.length > 0;
    const costs = n(row.materialCost) > 0 ||
        n(row.laborCost) > 0 ||
        n(row.machineCost) > 0 ||
        n(row.subcontractorCost) > 0 ||
        n(row.disposalCost) > 0 ||
        n(row.overheadCost) > 0 ||
        n(row.riskCost) > 0 ||
        n(row.profitCost) > 0;
    const prices = n(row.baseUnitPrice) > 0 ||
        n(row.suggestedUnitPrice) > 0 ||
        n(row.finalUnitPrice) > 0 ||
        n(row.preis) > 0;
    return breakdown || costs || prices;
}
function normalizePriceBreakdown(lines) {
    if (!Array.isArray(lines))
        return [];
    return lines
        .map((x) => ({
        id: String(x?.id || safeId()),
        group: String(x?.group || "Material"),
        name: cleanText(x?.name || "Kostenansatz"),
        unit: cleanText(x?.unit || "EH"),
        qty: n(x?.qty, 1),
        price: n(x?.price),
        total: x?.total !== undefined && x?.total !== null
            ? round2(n(x.total))
            : round2(n(x?.qty, 1) * n(x?.price)),
        note: cleanText(x?.note || ""),
    }))
        .filter((x) => x.total > 0);
}
function sumBreakdown(lines) {
    if (!Array.isArray(lines))
        return 0;
    return round2(lines.reduce((s, x) => s + n(x.total), 0));
}
function buildPriceBreakdownFromCosts(row) {
    const unit = cleanText(row.einheit) || "EH";
    const lines = [];
    function add(group, name, value, note = "") {
        const total = round2(n(value));
        if (total <= 0)
            return;
        lines.push({
            id: safeId(),
            group,
            name,
            unit,
            qty: 1,
            price: total,
            total,
            note,
        });
    }
    add("Material", "Materialansatz", row.materialCost);
    add("Personal", "Lohn / Kolonne", row.laborCost);
    add("Maschinen", "Maschinenansatz", row.machineCost);
    add("Fremdleistung", "Fremdleistung", row.subcontractorCost);
    add("Entsorgung", "Entsorgung / Deponie", row.disposalCost);
    add("Gemeinkosten", "Baustellengemeinkosten", row.overheadCost);
    add("Risiko", "Risikopuffer", row.riskCost);
    add("Gewinn", "Gewinnanteil", row.profitCost);
    return lines;
}
/* ================= DETECTION ================= */
function detectGewerk(text) {
    const t = text.toLowerCase();
    if (t.includes("aushub") ||
        t.includes("erde") ||
        t.includes("boden") ||
        t.includes("verfüll") ||
        t.includes("kies") ||
        t.includes("graben")) {
        return "Tiefbau / Erdarbeiten";
    }
    if (t.includes("rohr") ||
        t.includes("leitung") ||
        t.includes("kanal") ||
        t.includes("dn") ||
        t.includes("speedpipe") ||
        t.includes("kabelschutz")) {
        return "Tiefbau / Leitungsbau";
    }
    if (t.includes("beton") ||
        t.includes("schalung") ||
        t.includes("bewehrung") ||
        t.includes("fundament")) {
        return "Rohbau / Betonbau";
    }
    if (t.includes("asphalt") || t.includes("pflaster") || t.includes("decke")) {
        return "Straßenbau / Oberfläche";
    }
    return "Allgemein";
}
function detectLeistungsart(text) {
    const t = text.toLowerCase();
    if (t.includes("liefern") && t.includes("verlegen")) {
        return "Liefern und Einbauen";
    }
    if (t.includes("liefern"))
        return "Lieferleistung";
    if (t.includes("verlegen") || t.includes("einbauen"))
        return "Einbauleistung";
    if (t.includes("aushub") || t.includes("abtrag"))
        return "Erdbewegung";
    if (t.includes("abfuhr") || t.includes("entsorgung")) {
        return "Transport / Entsorgung";
    }
    if (t.includes("schalung"))
        return "Schalarbeiten";
    if (t.includes("bewehrung"))
        return "Bewehrungsarbeiten";
    if (t.includes("beton"))
        return "Betonarbeiten";
    return "Sonstige Leistung";
}
function detectBauverfahren(text, unit) {
    const t = text.toLowerCase();
    if (t.includes("aushub"))
        return "Baggeraushub mit Laden / ggf. Abtransport";
    if (t.includes("abfuhr"))
        return "LKW-Transport inklusive Lade-/Kippvorgang";
    if (t.includes("verfüll"))
        return "Einbau lagenweise mit Verdichtung";
    if (t.includes("speedpipe"))
        return "Rohr-/Speedpipe-Verlegung im Leitungsgraben";
    if (t.includes("kabelschutz"))
        return "Kabelschutzrohr liefern und verlegen";
    if (t.includes("schalung"))
        return "Schalung stellen, vorhalten und entfernen";
    if (t.includes("bewehrung"))
        return "Bewehrung schneiden, biegen, verlegen";
    if (t.includes("beton"))
        return "Beton liefern, einbauen und verdichten";
    if (unit === "m")
        return "Längenbezogene Ausführung";
    if (unit === "m²")
        return "Flächenbezogene Ausführung";
    if (unit === "m³")
        return "Volumenbezogene Ausführung";
    return "Standard-Ausführung";
}
function riskFromText(text, unit, menge) {
    const t = text.toLowerCase();
    const risky = t.includes("nach bedarf") ||
        t.includes("bauseits") ||
        t.includes("unbekannt") ||
        t.includes("entsorgung") ||
        t.includes("bodenklasse") ||
        t.includes("kontaminiert") ||
        t.includes("bestand") ||
        t.includes("anschluss") ||
        t.includes("provisorisch");
    if (!text || !unit || menge <= 0)
        return "high";
    if (risky)
        return "high";
    if (text.length < 12)
        return "medium";
    if (menge > 1000)
        return "medium";
    return "low";
}
function confidenceFrom(row, risk) {
    let score = 0.88;
    const text = cleanText(row.kurztext);
    const unit = cleanText(row.einheit);
    const menge = n(row.menge);
    if (!text)
        score -= 0.35;
    if (text.length < 12)
        score -= 0.12;
    if (!unit)
        score -= 0.2;
    if (menge <= 0)
        score -= 0.18;
    if (risk === "medium")
        score -= 0.1;
    if (risk === "high")
        score -= 0.22;
    return Math.max(0.25, Math.min(0.98, round2(score)));
}
function normUnit(value) {
    const u = cleanText(value).toLowerCase();
    if (u === "m2" || u === "m^2" || u === "qm")
        return "m²";
    if (u === "m3" || u === "m^3" || u === "cbm")
        return "m³";
    if (u === "stk" || u === "stck" || u === "stück" || u === "stueck")
        return "St";
    return value;
}
function getPlausibleUnitRange(text, unitRaw) {
    const t = text.toLowerCase();
    const unit = normUnit(unitRaw);
    if (unit === "m²") {
        if (t.includes("unterlage reinigen") ||
            t.includes("untergrund reinigen") ||
            t.includes("fläche reinigen") ||
            t.includes("flaeche reinigen")) {
            return { min: 0.15, avg: 0.45, max: 2.5, label: "Unterlage reinigen" };
        }
        if (t.includes("schichtenverbund") ||
            t.includes("haftkleber") ||
            t.includes("bitumenemulsion")) {
            return { min: 0.35, avg: 0.85, max: 2.5, label: "Schichtenverbund" };
        }
        if (t.includes("einfräsen") ||
            t.includes("einfraesen") ||
            t.includes("abfräsen") ||
            t.includes("abfraesen") ||
            t.includes("fräsen") ||
            t.includes("fraesen")) {
            return { min: 2, avg: 4.5, max: 9, label: "Asphalt fräsen" };
        }
        if (t.includes("ac 11 ds") ||
            t.includes("ads aus ac 11") ||
            t.includes("asphaltdeckschicht") ||
            t.includes("deckschicht")) {
            return { min: 10, avg: 18, max: 32, label: "Asphaltdeckschicht" };
        }
        if (t.includes("zulage") &&
            (t.includes("mehr") || t.includes("minder")) &&
            (t.includes("stärke") || t.includes("staerke"))) {
            return { min: 1, avg: 4.5, max: 12, label: "Asphalt Mehr-/Minderstärke" };
        }
        if (t.includes("planie")) {
            return { min: 2, avg: 5, max: 10, label: "Planie" };
        }
        if (t.includes("pflaster")) {
            return { min: 25, avg: 39, max: 75, label: "Pflaster" };
        }
        if (t.includes("asphalt")) {
            return { min: 8, avg: 18, max: 35, label: "Asphalt Oberfläche" };
        }
    }
    return { min: 0, avg: 0, max: 0, label: "" };
}
function clampToPlausibleRange(price, text, unitRaw) {
    const range = getPlausibleUnitRange(text, unitRaw);
    const p = n(price);
    if (p <= 0)
        return 0;
    if (range.min <= 0 || range.max <= 0 || range.avg <= 0)
        return round2(p);
    if (p < range.min || p > range.max)
        return round2(range.avg);
    return round2(p);
}
function unitBasePrice(text, unit) {
    const t = text.toLowerCase();
    const u = normUnit(unit);
    const range = getPlausibleUnitRange(t, u);
    if (range.avg > 0)
        return range.avg;
    if (t.includes("aushub") && u === "m³")
        return 18.5;
    if (t.includes("abfuhr") && (u === "t" || u === "m³"))
        return 22;
    if (t.includes("verfüll") && u === "m³")
        return 26;
    if (t.includes("kies") && u === "m³")
        return 38;
    if (t.includes("speedpipe") && u === "m")
        return 7.8;
    if (t.includes("kabelschutzrohr") && u === "m")
        return 18.5;
    if (t.includes("rohr") && u === "m")
        return 24;
    if (t.includes("schalung") && u === "m²")
        return 42;
    if (t.includes("bewehrung") && u === "kg")
        return 2.15;
    if (t.includes("beton") && u === "m³")
        return 165;
    if (u === "m")
        return 12;
    if (u === "m²")
        return 8;
    if (u === "m³")
        return 35;
    if (u === "kg")
        return 2;
    if (u === "t")
        return 30;
    if (u === "St")
        return 65;
    return 25;
}
/* ================= LOCAL FALLBACK ================= */
function localEliteCalculateRow(row) {
    const posNr = cleanText(row.posNr);
    const kurztext = cleanText(row.kurztext);
    const langtext = cleanText(row.langtext);
    const einheit = cleanText(row.einheit);
    const menge = n(row.menge);
    const oldBreakdown = normalizePriceBreakdown(row.priceBreakdown);
    const oldBreakdownEp = sumBreakdown(oldBreakdown);
    const text = `${kurztext} ${langtext}`.trim();
    const hasExistingCalc = hasExistingCalculationData(row);
    const detectedRisk = riskFromText(text, einheit, menge);
    const trustedExistingRisk = hasExistingCalc ||
        row.calculationStatus === "manual" ||
        row.calculationStatus === "critical";
    const riskLevel = trustedExistingRisk && row.riskLevel ? row.riskLevel : detectedRisk;
    const confidence = n(row.confidence, confidenceFrom(row, riskLevel));
    const base = oldBreakdownEp > 0 ? oldBreakdownEp : unitBasePrice(text, einheit);
    const materialCost = n(row.materialCost, round2(base * 0.28));
    const laborCost = n(row.laborCost, round2(base * 0.34));
    const machineCost = n(row.machineCost, round2(base * 0.18));
    const disposalCost = row.disposalCost !== undefined
        ? n(row.disposalCost)
        : text.toLowerCase().includes("abfuhr") ||
            text.toLowerCase().includes("entsorgung") ||
            text.toLowerCase().includes("aushub")
            ? round2(base * 0.16)
            : 0;
    const subcontractorCost = n(row.subcontractorCost);
    const direct = materialCost +
        laborCost +
        machineCost +
        disposalCost +
        subcontractorCost;
    const riskFactor = riskLevel === "high" ? 0.12 : riskLevel === "medium" ? 0.06 : 0.025;
    const overheadCost = n(row.overheadCost, round2(direct * 0.12));
    const riskCost = n(row.riskCost, round2(direct * riskFactor));
    const profitCost = n(row.profitCost, round2((direct + overheadCost + riskCost) * 0.1));
    const generatedBreakdown = buildPriceBreakdownFromCosts({
        einheit,
        materialCost,
        laborCost,
        machineCost,
        subcontractorCost,
        disposalCost,
        overheadCost,
        riskCost,
        profitCost,
    });
    const priceBreakdown = oldBreakdown.length ? oldBreakdown : generatedBreakdown;
    const breakdownEp = sumBreakdown(priceBreakdown);
    const suggestedUnitPrice = n(row.suggestedUnitPrice, breakdownEp > 0
        ? breakdownEp
        : round2(direct + overheadCost + riskCost + profitCost));
    const finalUnitPrice = n(row.finalUnitPrice ?? row.preis, suggestedUnitPrice);
    const warningParts = [];
    if (!posNr)
        warningParts.push("Positionsnummer fehlt");
    if (!kurztext)
        warningParts.push("Kurztext fehlt");
    if (!einheit)
        warningParts.push("Einheit fehlt");
    if (menge <= 0)
        warningParts.push("Menge fehlt oder ist 0");
    if (!hasExistingCalc) {
        warningParts.push("Keine Datenbank-/Rezeptbasis gefunden");
        warningParts.push("Lokaler Fallback verwendet");
    }
    if (riskLevel === "high")
        warningParts.push("Erhöhtes Kalkulations-/Nachtragsrisiko");
    if (confidence < 0.65)
        warningParts.push("Niedrige Kalkulationssicherheit");
    const calculationStatus = row.calculationStatus === "manual"
        ? "manual"
        : warningParts.some((x) => x.includes("fehlt")) || confidence < 0.55
            ? "critical"
            : warningParts.length || riskLevel !== "low"
                ? "warning"
                : "ok";
    const gewerk = cleanText(row.gewerk) || detectGewerk(text);
    const leistungsart = cleanText(row.leistungsart) || detectLeistungsart(text);
    const bauverfahren = cleanText(row.bauverfahren) || detectBauverfahren(text, einheit);
    return {
        id: row.id,
        posNr,
        kurztext,
        langtext,
        einheit,
        menge,
        materialCost,
        laborCost,
        machineCost,
        subcontractorCost,
        disposalCost,
        overheadCost,
        riskCost,
        profitCost,
        baseUnitPrice: n(row.baseUnitPrice, round2(base)),
        suggestedUnitPrice,
        finalUnitPrice,
        confidence,
        riskLevel,
        calculationStatus,
        gewerk,
        leistungsart,
        bauverfahren,
        warning: cleanText(row.warning) || warningParts.join(" · "),
        aiReason: cleanText(row.aiReason) ||
            `Lokaler Fallback: Der Server/OpenAI hat keine verwertbare KI-Kalkulation geliefert oder war nicht erreichbar. Preis wurde aus Regel-Engine geschätzt: Material, Lohn, Maschine, Gemeinkosten, Risiko und Gewinn. Erkannt: ${gewerk}, ${leistungsart}. Verfahren: ${bauverfahren}. Risiko: ${riskLevel}.`,
        priceBreakdown,
    };
}
function sanitizeEliteResultPrice(row, fallback) {
    const text = `${row.kurztext || ""} ${row.langtext || ""}`;
    const range = getPlausibleUnitRange(text, row.einheit);
    const offerEp = n(fallback?.angebotUnitPrice) ||
        n(fallback?.originalPreKiPrice) ||
        n(fallback?.preis) ||
        n(fallback?.finalUnitPrice) ||
        n(fallback?.suggestedUnitPrice);
    const rawEp = n(row.finalUnitPrice || row.suggestedUnitPrice || row.baseUnitPrice);
    if (rawEp <= 0)
        return row;
    /*
     * RLC-KI Sicherheitsbremse allgemein:
     * Server/OpenAI/Rule-Engine darf keine absurden Preise blind liefern.
     * X84 ist nicht Wahrheit, aber ein technischer Anker gegen Fehl-Mapping.
     */
    if (offerEp > 0) {
        const ratio = rawEp / offerEp;
        const unit = normUnit(row.einheit);
        const isPieceOrPauschal = unit === "St" ||
            unit.toLowerCase() === "st" ||
            unit.toLowerCase() === "stk" ||
            unit.toLowerCase() === "psch" ||
            unit.toLowerCase() === "ps" ||
            unit.toLowerCase() === "pauschal";
        const maxRatio = isPieceOrPauschal ? 2.0 : 2.5;
        const minRatio = isPieceOrPauschal ? 0.4 : 0.35;
        if (ratio > maxRatio || ratio < minRatio) {
            return {
                ...row,
                materialCost: 0,
                laborCost: 0,
                machineCost: 0,
                subcontractorCost: 0,
                disposalCost: 0,
                overheadCost: 0,
                riskCost: 0,
                profitCost: 0,
                baseUnitPrice: 0,
                suggestedUnitPrice: 0,
                finalUnitPrice: 0,
                calculationStatus: "warning",
                riskLevel: "high",
                confidence: Math.min(n(row.confidence, 0.5), 0.45),
                warning: [
                    row.warning,
                    `RLC-KI Sicherheitsbremse: Serverpreis ${rawEp} €/EH wurde verworfen, weil er stark vom X84-Anker ${offerEp} €/EH abweicht.`
                ]
                    .filter(Boolean)
                    .join(" · "),
                aiReason: [
                    row.aiReason,
                    `RLC-KI Preis verworfen: Verhältnis Server/X84 = ${round2(ratio)}. Erlaubt: ${minRatio}–${maxRatio}. Position muss fachlich oder über Firmen-Datenbank geprüft werden.`
                ]
                    .filter(Boolean)
                    .join("\n\n"),
                priceBreakdown: [],
            };
        }
    }
    /*
     * Spezifische Plausibilitätsbibliothek:
     * Nur für bekannte Leistungsarten mit belastbarer Range.
     */
    if (range.avg > 0 && range.min > 0 && range.max > 0) {
        const safeEp = clampToPlausibleRange(rawEp, text, row.einheit);
        if (safeEp > 0 && Math.abs(safeEp - rawEp) >= 0.01) {
            const materialCost = round2(safeEp * 0.35);
            const laborCost = round2(safeEp * 0.25);
            const machineCost = round2(safeEp * 0.18);
            const overheadCost = round2(safeEp * 0.08);
            const riskCost = round2(safeEp * 0.04);
            const profitCost = round2(safeEp * 0.10);
            const priceBreakdown = buildPriceBreakdownFromCosts({
                einheit: row.einheit,
                materialCost,
                laborCost,
                machineCost,
                subcontractorCost: 0,
                disposalCost: 0,
                overheadCost,
                riskCost,
                profitCost,
            });
            return {
                ...row,
                materialCost,
                laborCost,
                machineCost,
                subcontractorCost: 0,
                disposalCost: 0,
                overheadCost,
                riskCost,
                profitCost,
                baseUnitPrice: safeEp,
                suggestedUnitPrice: safeEp,
                finalUnitPrice: safeEp,
                calculationStatus: "warning",
                riskLevel: row.riskLevel === "high" ? "high" : "medium",
                warning: [
                    row.warning,
                    `RLC-Plausibilitätsbremse: Preis wurde für ${range.label} von ${rawEp} €/EH auf ${safeEp} €/EH korrigiert.`,
                ]
                    .filter(Boolean)
                    .join(" · "),
                aiReason: [
                    row.aiReason,
                    `RLC-Plausibilitätsbereich ${range.label}: ${range.min}–${range.max} €/EH, Ansatz ${range.avg} €/EH.`,
                ]
                    .filter(Boolean)
                    .join("\n\n"),
                priceBreakdown,
            };
        }
    }
    return row;
}
/* ================= SERVER NORMALIZATION ================= */
function normalizeServerRow(r, fallback) {
    const posNr = cleanText(r?.posNr ?? fallback?.posNr);
    const kurztext = cleanText(r?.kurztext ?? fallback?.kurztext);
    const langtext = cleanText(r?.langtext ?? fallback?.langtext);
    const einheit = cleanText(r?.einheit ?? fallback?.einheit);
    const menge = n(r?.menge ?? fallback?.menge);
    const fallbackBreakdown = normalizePriceBreakdown(fallback?.priceBreakdown);
    const serverBreakdown = normalizePriceBreakdown(r?.priceBreakdown);
    const priceBreakdown = serverBreakdown.length ? serverBreakdown : fallbackBreakdown;
    const materialCost = n(r?.materialCost ?? fallback?.materialCost);
    const laborCost = n(r?.laborCost ?? fallback?.laborCost);
    const machineCost = n(r?.machineCost ?? fallback?.machineCost);
    const subcontractorCost = n(r?.subcontractorCost ?? fallback?.subcontractorCost);
    const disposalCost = n(r?.disposalCost ?? fallback?.disposalCost);
    const overheadCost = n(r?.overheadCost ?? fallback?.overheadCost);
    const riskCost = n(r?.riskCost ?? fallback?.riskCost);
    const profitCost = n(r?.profitCost ?? fallback?.profitCost);
    const generatedBreakdown = buildPriceBreakdownFromCosts({
        einheit,
        materialCost,
        laborCost,
        machineCost,
        subcontractorCost,
        disposalCost,
        overheadCost,
        riskCost,
        profitCost,
    });
    const finalBreakdown = priceBreakdown.length ? priceBreakdown : generatedBreakdown;
    const breakdownEp = sumBreakdown(finalBreakdown);
    const suggestedUnitPrice = n(r?.suggestedUnitPrice ?? r?.unitPrice ?? r?.ep ?? r?.preis, breakdownEp || n(fallback?.suggestedUnitPrice ?? fallback?.preis));
    const finalUnitPrice = n(r?.finalUnitPrice ?? r?.suggestedUnitPrice ?? r?.unitPrice ?? r?.preis, suggestedUnitPrice || breakdownEp || n(fallback?.finalUnitPrice ?? fallback?.preis));
    const text = `${kurztext} ${langtext}`.trim();
    const detectedRisk = riskFromText(text, einheit, menge);
    const rawRisk = r?.riskLevel || r?.risk;
    const riskLevel = rawRisk === "low" || rawRisk === "medium" || rawRisk === "high"
        ? rawRisk
        : detectedRisk;
    const rawStatus = r?.calculationStatus || r?.status;
    const calculationStatus = rawStatus === "ok" ||
        rawStatus === "warning" ||
        rawStatus === "critical" ||
        rawStatus === "manual"
        ? rawStatus
        : riskLevel === "high"
            ? "warning"
            : "ok";
    const isStructureRow = cleanText(r?.leistungsart ?? fallback?.leistungsart).toLowerCase().includes("struktur") ||
        cleanText(r?.gewerk ?? fallback?.gewerk).toLowerCase().includes("gliederung") ||
        /^titel\s*\d*$/i.test(kurztext) ||
        /^abschnitt\s*\d*$/i.test(kurztext) ||
        /^kapitel\s*\d*$/i.test(kurztext);
    return {
        id: cleanText(r?.id ?? fallback?.id),
        posNr,
        kurztext,
        langtext,
        einheit,
        menge,
        materialCost,
        laborCost,
        machineCost,
        subcontractorCost,
        disposalCost,
        overheadCost,
        riskCost,
        profitCost,
        baseUnitPrice: n(r?.baseUnitPrice ?? fallback?.baseUnitPrice, suggestedUnitPrice),
        suggestedUnitPrice,
        finalUnitPrice,
        confidence: Math.max(0, Math.min(1, n(r?.confidence ?? fallback?.confidence, 0.78))),
        riskLevel,
        calculationStatus,
        gewerk: cleanText(r?.gewerk ?? fallback?.gewerk) || detectGewerk(text),
        leistungsart: cleanText(r?.leistungsart ?? fallback?.leistungsart) ||
            detectLeistungsart(text),
        bauverfahren: cleanText(r?.bauverfahren ?? fallback?.bauverfahren) ||
            detectBauverfahren(text, einheit),
        warning: cleanText(r?.warning ?? r?.hinweis) ||
            (riskLevel === "high"
                ? "KI-Kalkulation vorhanden, aber mit erhöhtem Prüfbedarf"
                : "KI-Kalkulation vom Server/OpenAI übernommen"),
        aiReason: cleanText(r?.aiReason ?? r?.explanation ?? r?.begruendung) ||
            "Server/OpenAI-Kalkulation: Preisansatz wurde über KI bzw. Backend-Kalkulationslogik erzeugt.",
        rlcPreisMin: n(r?.rlcPreisMin ?? fallback?.rlcPreisMin),
        rlcPreisAvg: n(r?.rlcPreisAvg ?? fallback?.rlcPreisAvg),
        rlcPreisMax: n(r?.rlcPreisMax ?? fallback?.rlcPreisMax),
        rlcPreisSource: cleanText(r?.rlcPreisSource ?? fallback?.rlcPreisSource),
        rlcPreisGroup: cleanText(r?.rlcPreisGroup ?? fallback?.rlcPreisGroup),
        priceBreakdown: finalBreakdown,
    };
}
/* ================= SUMMARY ================= */
function buildSummary(rows) {
    const totalNet = rows.reduce((sum, r) => sum + n(r.finalUnitPrice) * n(r.menge), 0);
    const avgConfidence = rows.length
        ? rows.reduce((sum, r) => sum + n(r.confidence), 0) / rows.length
        : 0;
    return {
        totalNet: round2(totalNet),
        avgConfidence: round2(avgConfidence),
        highRiskCount: rows.filter((r) => r.riskLevel === "high").length,
        warningCount: rows.filter((r) => r.calculationStatus === "warning").length,
        criticalCount: rows.filter((r) => r.calculationStatus === "critical").length,
    };
}
function toInputRows(rows) {
    return rows.map((r) => ({
        id: r.id,
        posNr: r.posNr,
        kurztext: r.kurztext,
        langtext: r.langtext,
        einheit: r.einheit,
        menge: r.menge,
        preis: r.preis,
        materialCost: r.materialCost,
        laborCost: r.laborCost,
        machineCost: r.machineCost,
        subcontractorCost: r.subcontractorCost,
        disposalCost: r.disposalCost,
        overheadCost: r.overheadCost,
        riskCost: r.riskCost,
        profitCost: r.profitCost,
        baseUnitPrice: r.baseUnitPrice,
        suggestedUnitPrice: r.suggestedUnitPrice,
        finalUnitPrice: r.finalUnitPrice,
        confidence: r.confidence,
        riskLevel: r.riskLevel,
        calculationStatus: r.calculationStatus,
        gewerk: r.gewerk,
        leistungsart: r.leistungsart,
        bauverfahren: r.bauverfahren,
        warning: r.warning,
        aiReason: r.aiReason,
        priceBreakdown: r.priceBreakdown,
    }));
}
/* ================= HOOK ================= */
export function useKiSuggest() {
    const [loading, setLoading] = useState(false);
    const mode = import.meta.env.VITE_KI_MODE || "server";
    async function suggest(text, unit) {
        const result = await eliteCalculateRows("", [
            {
                kurztext: text,
                einheit: unit,
                menge: 1,
            },
        ]);
        const first = result.rows[0];
        return {
            unitPrice: first?.suggestedUnitPrice ?? 0,
            confidence: first?.confidence ?? 0,
        };
    }
    async function eliteCalculateRows(projectCode, rows, optionsOverride = {}) {
        setLoading(true);
        try {
            const inputRows = Array.isArray(rows)
                ? rows.map((r) => ({
                    id: r.id,
                    posNr: r.posNr,
                    kurztext: r.kurztext,
                    langtext: r.langtext,
                    einheit: r.einheit,
                    menge: r.menge,
                    preis: r.preis,
                    confidence: r.confidence,
                    materialCost: r.materialCost,
                    laborCost: r.laborCost,
                    machineCost: r.machineCost,
                    subcontractorCost: r.subcontractorCost,
                    disposalCost: r.disposalCost,
                    overheadCost: r.overheadCost,
                    riskCost: r.riskCost,
                    profitCost: r.profitCost,
                    baseUnitPrice: r.baseUnitPrice,
                    suggestedUnitPrice: r.suggestedUnitPrice,
                    finalUnitPrice: r.finalUnitPrice,
                    riskLevel: r.riskLevel,
                    calculationStatus: r.calculationStatus,
                    gewerk: r.gewerk,
                    leistungsart: r.leistungsart,
                    bauverfahren: r.bauverfahren,
                    warning: r.warning,
                    aiReason: r.aiReason,
                    priceBreakdown: r.priceBreakdown,
                }))
                : [];
            const calculationOptions = {
                language: "de",
                sector: "Tiefbau/Hochbau",
                calculationLevel: "elite",
                includePriceBreakdown: true,
                includeRiskAnalysis: true,
                includeCostBreakdown: true,
                useKalkulationsDatenbank: true,
                useOpenAIIfNoDatabaseHit: true,
                forceOpenAIReview: false,
                rejectRuleEngineForRecipes: true,
                // SPEED OPTIONS -> Server /api/kalkulation/ki/suggest-batch
                maxParallelRows: optionsOverride?.forceRecalculate ? 4 : 6,
                maxOpenAiRowsPerBatch: optionsOverride?.forceRecalculate ? 20 : 8,
                ...optionsOverride,
            };
            if ((mode === "openai" || mode === "server") && inputRows.length) {
                const json = await postKiSuggestBatchChunked(projectCode || "NO_PROJECT", inputRows, calculationOptions);
                const rawRows = json?.rows ||
                    json?.suggestions ||
                    json?.data?.rows ||
                    json?.data?.suggestions;
                if (Array.isArray(rawRows) && rawRows.length) {
                    const rawById = new Map();
                    const rawByPos = new Map();
                    for (const raw of rawRows) {
                        const idKey = String(raw?.id || "").trim();
                        const posKey = String(raw?.posNr || raw?.positionNumber || "").trim();
                        if (idKey)
                            rawById.set(idKey, raw);
                        if (posKey)
                            rawByPos.set(posKey, raw);
                    }
                    const normalizedRows = inputRows.map((inputRow) => {
                        const idKey = String(inputRow.id || "").trim();
                        const posKey = String(inputRow.posNr || "").trim();
                        const matchedRaw = (idKey ? rawById.get(idKey) : null) ||
                            (posKey ? rawByPos.get(posKey) : null) ||
                            null;
                        return normalizeServerRow(matchedRaw, inputRow);
                    });
                    return {
                        ok: true,
                        source: "server",
                        rows: normalizedRows,
                        summary: json.summary || buildSummary(normalizedRows),
                    };
                }
            }
            const fallbackRows = inputRows.map((r) => sanitizeEliteResultPrice(localEliteCalculateRow(r), r));
            return {
                ok: true,
                source: "local-rule-engine",
                rows: fallbackRows,
                summary: buildSummary(fallbackRows),
                error: mode === "local"
                    ? "Lokaler KI-Modus aktiv. OpenAI/Server wurde nicht verwendet."
                    : "Server/OpenAI nicht erreichbar oder keine verwertbare Antwort. Lokaler Fallback wurde verwendet.",
            };
        }
        finally {
            setLoading(false);
        }
    }
    return {
        suggest,
        eliteCalculateRows,
        loading,
        toInputRows,
    };
}
