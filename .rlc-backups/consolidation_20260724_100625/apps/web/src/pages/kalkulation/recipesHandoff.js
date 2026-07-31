// apps/web/src/pages/kalkulation/recipesHandoff.ts
export const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
export function saveKiHandoff(p) {
    localStorage.setItem(KI_HANDOFF_KEY, JSON.stringify(p));
}
export function loadKiHandoff() {
    try {
        const raw = localStorage.getItem(KI_HANDOFF_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function clearKiHandoff() {
    localStorage.removeItem(KI_HANDOFF_KEY);
}
