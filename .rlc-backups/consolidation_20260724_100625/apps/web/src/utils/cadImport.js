// utils/cadImport.ts
// Semplice bridge CAD → (Aufmaß/Kalkulation) via localStorage
const KEY = "rlc.cad.export.v1";
export function saveCadExport(p) {
    const pack = { ...p, ts: Date.now() };
    try {
        localStorage.setItem(KEY, JSON.stringify(pack));
    }
    catch { }
}
export function consumeCadExport(expectedTarget) {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return null;
        const obj = JSON.parse(raw);
        if (!obj || obj.target !== expectedTarget)
            return null;
        // opzionale: scadenza 2 min per evitare vecchi residui
        if (typeof obj.ts === "number" && Date.now() - obj.ts > 120000) {
            localStorage.removeItem(KEY);
            return null;
        }
        localStorage.removeItem(KEY);
        return obj;
    }
    catch {
        return null;
    }
}
