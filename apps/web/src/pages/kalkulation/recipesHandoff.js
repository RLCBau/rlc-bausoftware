// apps/web/src/pages/kalkulation/recipesHandoff.ts
export const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
function toNumber(value, fallback = 0) {
    const n = typeof value === "number"
        ? value
        : Number(String(value ?? "").replace(",", ".").trim());
    return Number.isFinite(n) ? n : fallback;
}
function toText(value) {
    return String(value ?? "").trim();
}
function normalizeRow(row) {
    const posNr = toText(row.posNr);
    const kurztext = toText(row.kurztext);
    const einheit = toText(row.einheit);
    const menge = toNumber(row.menge);
    const preis = toNumber(row.preis);
    const gesamt = row.gesamt !== undefined ? toNumber(row.gesamt) : Number((menge * preis).toFixed(2));
    if (!posNr && !kurztext)
        return null;
    return {
        posNr,
        kurztext,
        langtext: toText(row.langtext),
        einheit,
        menge,
        preis,
        gesamt,
        confidence: row.confidence !== undefined ? Math.max(0, Math.min(1, toNumber(row.confidence))) : undefined,
    };
}
export function normalizeKiHandoffPayload(payload) {
    const rows = Array.isArray(payload.rows)
        ? payload.rows.map(normalizeRow).filter(Boolean)
        : [];
    if (!rows.length)
        return null;
    return {
        source: "rezepte",
        ts: toNumber(payload.ts, Date.now()),
        projectId: toText(payload.projectId) || undefined,
        projectCode: toText(payload.projectCode) || undefined,
        projectKey: toText(payload.projectKey) ||
            toText(payload.projectCode) ||
            toText(payload.projectId) ||
            undefined,
        recipeKey: toText(payload.recipeKey) || undefined,
        variantId: toText(payload.variantId) || undefined,
        mwst: payload.mwst !== undefined ? toNumber(payload.mwst, 19) : undefined,
        pricingDate: toText(payload.pricingDate) || undefined,
        rows,
    };
}
export function saveKiHandoff(payload) {
    const normalized = normalizeKiHandoffPayload(payload);
    if (!normalized)
        return false;
    localStorage.setItem(KI_HANDOFF_KEY, JSON.stringify(normalized));
    return true;
}
export function loadKiHandoff() {
    try {
        const raw = localStorage.getItem(KI_HANDOFF_KEY);
        if (!raw)
            return null;
        return normalizeKiHandoffPayload(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
export function clearKiHandoff() {
    localStorage.removeItem(KI_HANDOFF_KEY);
}
