// apps/web/src/utils/cadImport.ts
// Bridge CAD → (Aufmaß/Kalkulation) via localStorage (queue-based)
const KEY = "rlc.cad.export.queue.v1";
const TTL = 2 * 60 * 1000; // 2 minuti
function safeParse(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function validatePayload(p) {
    if (!p.target || !p.kind || !p.layer)
        return false;
    if (p.kind === "AREA" && typeof p.area_m2 !== "number")
        return false;
    if (p.kind === "LINE" && typeof p.length_m !== "number")
        return false;
    return true;
}
/* =========================
   SAVE (queue)
   ========================= */
export function saveCadExport(payload) {
    const pack = {
        ...payload,
        ts: Date.now(),
    };
    if (!validatePayload(pack)) {
        console.warn("[CAD] invalid payload", pack);
        return;
    }
    try {
        const current = safeParse(localStorage.getItem(KEY));
        const next = [...current, pack];
        localStorage.setItem(KEY, JSON.stringify(next));
    }
    catch (e) {
        console.error("[CAD] save error", e);
    }
}
/* =========================
   CONSUME (per target)
   ========================= */
export function consumeCadExport(expectedTarget) {
    try {
        const current = safeParse(localStorage.getItem(KEY));
        if (!current.length)
            return [];
        const now = Date.now();
        const valid = current.filter((p) => p.target === expectedTarget &&
            typeof p.ts === "number" &&
            now - p.ts < TTL);
        const remaining = current.filter((p) => !p.ts ||
            now - p.ts >= TTL ||
            p.target !== expectedTarget);
        localStorage.setItem(KEY, JSON.stringify(remaining));
        return valid;
    }
    catch (e) {
        console.error("[CAD] consume error", e);
        return [];
    }
}
/* =========================
   CLEAR (manual debug)
   ========================= */
export function clearCadExport() {
    try {
        localStorage.removeItem(KEY);
    }
    catch { }
}
