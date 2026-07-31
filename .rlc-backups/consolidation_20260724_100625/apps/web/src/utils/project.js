export function getCurrentProjectId() {
    const q = new URLSearchParams(window.location.search).get("projectId");
    if (q && !isNaN(Number(q)))
        return Number(q);
    const ls = localStorage.getItem("rlc.currentProjectId");
    return ls ? Number(ls) : 0;
}
export function setCurrentProjectId(id) {
    localStorage.setItem("rlc.currentProjectId", String(id));
}
export function withProject(path) {
    const id = getCurrentProjectId();
    return id ? `${path}?projectId=${id}` : path;
}
