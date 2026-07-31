const KEY = "rlc_buro_docs_v2";
// --- storage helpers ---
const load = () => {
    try {
        return JSON.parse(localStorage.getItem(KEY) || "[]");
    }
    catch {
        return [];
    }
};
const save = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));
// --- CSV helpers (index: senza binari) ---
export function toCSV(list) {
    const header = `\"Titel\";\"Tags\";\"ProjektId\";\"LetzteDatei\";\"LetzteGroesse\";\"Geaendert\"`;
    const lines = list.map(d => {
        const v = d.versions[0];
        return [
            d.title,
            (d.tags ?? []).join(", "),
            d.projektId ?? "",
            v?.fileName ?? "",
            v?.size ?? 0,
            d.updatedAt,
        ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(";");
    });
    return [header, ...lines].join("\r\n");
}
export function fromCSV(csv) {
    const rows = csv.split(/\r?\n/).filter(Boolean).slice(1);
    const now = new Date().toISOString();
    return rows.map(line => {
        const cols = line.split(";").map(c => c.replace(/^"|"$/g, "").replace(/""/g, `"`));
        const [title, tags, projektId] = cols;
        return {
            id: crypto.randomUUID(),
            title: title || "Importiertes Dokument",
            projektId: projektId || undefined,
            tags: (tags || "").split(",").map(s => s.trim()).filter(Boolean),
            versions: [],
            createdAt: now,
            updatedAt: now,
        };
    });
}
// --- API ---
export const DocsDB = {
    list() { return load(); },
    byId(id) { return load().find(d => d.id === id); },
    create(title = "Neues Dokument", projektId) {
        const now = new Date().toISOString();
        const d = { id: crypto.randomUUID(), title, projektId, tags: [], versions: [], createdAt: now, updatedAt: now };
        const all = load();
        all.unshift(d);
        save(all);
        return d;
    },
    upsert(doc) {
        const all = load();
        const i = all.findIndex(x => x.id === doc.id);
        const v = { ...doc, updatedAt: new Date().toISOString() };
        if (i >= 0)
            all[i] = v;
        else
            all.unshift(v);
        save(all);
    },
    remove(id) { save(load().filter(d => d.id !== id)); },
    async addVersion(id, file) {
        const dataURL = await fileToDataURL(file);
        const v = {
            id: crypto.randomUUID(),
            fileName: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
            uploadedAt: new Date().toISOString(),
            dataURL,
        };
        const all = load();
        const i = all.findIndex(d => d.id === id);
        if (i < 0)
            return;
        all[i] = { ...all[i], versions: [v, ...all[i].versions], updatedAt: new Date().toISOString() };
        save(all);
    },
    restoreVersion(id, versionId) {
        const all = load();
        const i = all.findIndex(d => d.id === id);
        if (i < 0)
            return;
        const v = all[i].versions.find(x => x.id === versionId);
        if (!v)
            return;
        all[i].versions = [v, ...all[i].versions.filter(x => x.id !== versionId)];
        all[i].updatedAt = new Date().toISOString();
        save(all);
    },
    // --- Import/Export ---
    exportCSV(list) { return toCSV(list); },
    importCSV(csv) { const add = fromCSV(csv); const all = [...add, ...load()]; save(all); return add.length; },
    exportJSON() { return JSON.stringify(load(), null, 2); }, // backup completo
    importJSON(json) {
        const arr = JSON.parse(json);
        if (!Array.isArray(arr))
            return 0;
        save(arr);
        return arr.length;
    },
};
async function fileToDataURL(file) {
    return new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
}
