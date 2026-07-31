const KEY = "rlc.mengenermittlung";
export function loadAufmass(projektId) {
    try {
        const raw = localStorage.getItem(`${KEY}:${projektId}`);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function saveAufmass(doc) {
    try {
        localStorage.setItem(`${KEY}:${doc.projektId}`, JSON.stringify(doc));
    }
    catch { }
}
