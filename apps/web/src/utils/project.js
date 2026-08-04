// apps/web/src/utils/project.ts
const KEY = "rlc.currentProjectId";
export function getCurrentProjectId() {
    try {
        const q = new URLSearchParams(window.location.search).get("projectId");
        if (q && !isNaN(Number(q))) {
            const id = Number(q);
            localStorage.setItem(KEY, String(id)); // sync
            return id;
        }
        const ls = localStorage.getItem(KEY);
        if (!ls)
            return null;
        const id = Number(ls);
        return Number.isFinite(id) ? id : null;
    }
    catch {
        return null;
    }
}
export function setCurrentProjectId(id) {
    try {
        if (id == null) {
            localStorage.removeItem(KEY);
            return;
        }
        localStorage.setItem(KEY, String(id));
    }
    catch { }
}
export function withProject(path) {
    const id = getCurrentProjectId();
    if (!id)
        return path;
    try {
        const url = new URL(path, window.location.origin);
        url.searchParams.set("projectId", String(id));
        return url.pathname + url.search;
    }
    catch {
        // fallback per path relativi senza base valida
        const sep = path.includes("?") ? "&" : "?";
        return `${path}${sep}projectId=${id}`;
    }
}
/**
 * Utility: aggiorna URL corrente senza reload
 */
export function syncProjectToUrl(id) {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("projectId", String(id));
        window.history.replaceState({}, "", url.toString());
    }
    catch { }
}
