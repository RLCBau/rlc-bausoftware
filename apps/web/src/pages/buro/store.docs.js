const KEY = "rlc_buro_docs_v2";
const load = () => {
    try {
        const raw = localStorage.getItem(KEY) || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const save = (rows) => {
    localStorage.setItem(KEY, JSON.stringify(rows));
};
export function toCSV(list) {
    const header = `"Titel";"Tags";"ProjektId";"LetzteDatei";"LetzteGroesse";"Geaendert"`;
    const lines = list.map((d) => {
        const v = d.versions?.[0];
        return [
            d.title,
            (d.tags ?? []).join(", "),
            d.projektId ?? "",
            v?.fileName ?? "",
            v?.size ?? 0,
            d.updatedAt,
        ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(";");
    });
    return [header, ...lines].join("\r\n");
}
export function fromCSV(csv) {
    const rows = csv.split(/\r?\n/).filter(Boolean).slice(1);
    const now = Date.now();
    return rows.map((line) => {
        const cols = splitCsvSemicolon(line).map((c) => unquoteCsv(c));
        const [title, tags, projektId] = cols;
        return {
            id: crypto.randomUUID(),
            title: title || "Importiertes Dokument",
            projektId: projektId || undefined,
            tags: (tags || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            versions: [],
            updatedAt: now,
        };
    });
}
export const DocsDB = {
    list() {
        return load().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    },
    byId(id) {
        return load().find((d) => d.id === id);
    },
    create(title = "Neues Dokument", projektId) {
        const now = Date.now();
        const d = {
            id: crypto.randomUUID(),
            title,
            projektId,
            tags: [],
            versions: [],
            updatedAt: now,
        };
        const all = load();
        all.unshift(d);
        save(all);
        return d;
    },
    upsert(doc) {
        const all = load();
        const i = all.findIndex((x) => x.id === doc.id);
        const next = {
            ...doc,
            tags: Array.isArray(doc.tags) ? doc.tags : [],
            versions: Array.isArray(doc.versions) ? doc.versions : [],
            updatedAt: Date.now(),
        };
        if (i >= 0)
            all[i] = next;
        else
            all.unshift(next);
        save(all);
    },
    remove(id) {
        save(load().filter((d) => d.id !== id));
    },
    async addVersion(id, file) {
        const dataURL = await fileToDataURL(file);
        const v = {
            id: crypto.randomUUID(),
            fileName: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
            uploadedAt: Date.now(),
            dataURL,
        };
        const all = load();
        const i = all.findIndex((d) => d.id === id);
        if (i < 0)
            return;
        const current = all[i];
        all[i] = {
            ...current,
            versions: [v, ...(current.versions ?? [])],
            updatedAt: Date.now(),
        };
        save(all);
    },
    restoreVersion(id, versionId) {
        const all = load();
        const i = all.findIndex((d) => d.id === id);
        if (i < 0)
            return;
        const doc = all[i];
        const versions = doc.versions ?? [];
        const v = versions.find((x) => x.id === versionId);
        if (!v)
            return;
        all[i] = {
            ...doc,
            versions: [v, ...versions.filter((x) => x.id !== versionId)],
            updatedAt: Date.now(),
        };
        save(all);
    },
    exportCSV(list) {
        return toCSV(list);
    },
    importCSV(csv) {
        const add = fromCSV(csv);
        const all = [...add, ...load()];
        save(all);
        return add.length;
    },
    exportJSON() {
        return JSON.stringify(load(), null, 2);
    },
    importJSON(json) {
        try {
            const arr = JSON.parse(json);
            if (!Array.isArray(arr))
                return 0;
            const cleaned = arr.map((doc) => ({
                ...doc,
                id: doc.id || crypto.randomUUID(),
                title: doc.title || "Importiertes Dokument",
                tags: Array.isArray(doc.tags) ? doc.tags : [],
                versions: Array.isArray(doc.versions) ? doc.versions : [],
                updatedAt: typeof doc.updatedAt === "number" ? doc.updatedAt : Date.now(),
            }));
            save(cleaned);
            return cleaned.length;
        }
        catch {
            return 0;
        }
    },
};
function splitCsvSemicolon(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ";" && !inQuotes) {
            result.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    result.push(current);
    return result;
}
function unquoteCsv(value) {
    return value.replace(/^"|"$/g, "").replace(/""/g, '"');
}
async function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
        r.readAsDataURL(file);
    });
}
