const KEY = "rlc_projects_v1";
const CUR = "rlc_current_project_id";
const uid = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
export const Projects = {
    list() {
        try {
            return JSON.parse(localStorage.getItem(KEY) || "[]");
        }
        catch {
            return [];
        }
    },
    upsert(p) {
        const all = Projects.list();
        const id = p.id ?? uid();
        const existing = all.findIndex(x => x.id === id);
        const item = {
            id,
            name: (p.name || "").trim(),
            number: (p.number || "").trim(),
            client: p.client?.trim(),
            location: p.location?.trim(),
            createdAt: existing >= 0 ? all[existing].createdAt : Date.now()
        };
        if (existing >= 0)
            all[existing] = item;
        else
            all.unshift(item);
        localStorage.setItem(KEY, JSON.stringify(all));
        return item;
    },
    remove(id) {
        localStorage.setItem(KEY, JSON.stringify(Projects.list().filter(p => p.id !== id)));
        if (Projects.getCurrentId() === id)
            localStorage.removeItem(CUR);
    },
    clear() { localStorage.removeItem(KEY); localStorage.removeItem(CUR); },
    setCurrent(id) { localStorage.setItem(CUR, id); },
    getCurrentId() { return localStorage.getItem(CUR); },
    getCurrent() { return Projects.list().find(p => p.id === Projects.getCurrentId()) || null; },
    exportJSON() { return JSON.stringify(Projects.list(), null, 2); },
    importJSON(json) {
        const arr = JSON.parse(json);
        if (!Array.isArray(arr))
            throw new Error("Invalid JSON");
        localStorage.setItem(KEY, JSON.stringify(arr));
    }
};
