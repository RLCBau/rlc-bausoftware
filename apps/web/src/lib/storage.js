// apps/web/src/lib/storage.ts
/* =========================================================
   CONFIG
   ========================================================= */
const KEY = "rlc.mengenermittlung";
const VERSION = 1;
/* =========================================================
   HELPERS
   ========================================================= */
function buildKey(projektId) {
    return `${KEY}:${projektId}`;
}
function safeParse(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/* =========================================================
   LOAD
   ========================================================= */
export function loadAufmass(projektId) {
    const data = safeParse(localStorage.getItem(buildKey(projektId)));
    if (!data)
        return null;
    // 🔒 futura compatibilità versioni
    if (data.version !== VERSION) {
        console.warn("Aufmass version mismatch → fallback");
        return data.payload || null;
    }
    return data.payload;
}
/* =========================================================
   SAVE
   ========================================================= */
export function saveAufmass(doc) {
    try {
        const wrapped = {
            version: VERSION,
            payload: doc,
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem(buildKey(doc.projektId), JSON.stringify(wrapped));
    }
    catch (err) {
        console.error("Save Aufmass failed", err);
    }
}
/* =========================================================
   DELETE
   ========================================================= */
export function deleteAufmass(projektId) {
    try {
        localStorage.removeItem(buildKey(projektId));
    }
    catch { }
}
/* =========================================================
   LIST (utile per debug / futuro UI)
   ========================================================= */
export function listAufmassKeys() {
    return Object.keys(localStorage).filter((k) => k.startsWith(KEY));
}
