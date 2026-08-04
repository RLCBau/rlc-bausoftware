const KEY = "rlc-uebergabe-db";
/* ================= LOAD / SAVE ================= */
const load = () => {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return [];
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
/* ================= HELPERS ================= */
function esc(s) {
    return (s || "").replace(/;/g, ",").replace(/\n/g, " ");
}
function normalize(d) {
    return {
        id: d.id || crypto.randomUUID(),
        title: d.title || "Abnahme",
        projectId: d.projectId || undefined,
        client: d.client || "",
        address: d.address || "",
        date: d.date || new Date().toISOString(),
        status: d.status || "Entwurf",
        checklist: Array.isArray(d.checklist) ? d.checklist : [],
        signs: d.signs || {},
        attachments: Array.isArray(d.attachments) ? d.attachments : [],
        updatedAt: d.updatedAt || Date.now(),
    };
}
/* ================= DB ================= */
export const UebergabeDB = {
    list() {
        return load()
            .map(normalize)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    create(projectId) {
        const doc = normalize({
            id: crypto.randomUUID(),
            title: "Abnahme",
            projectId,
            client: "",
            address: "",
            date: new Date().toISOString(),
            status: "Entwurf",
            checklist: [],
            signs: {},
            attachments: [],
            updatedAt: Date.now(),
        });
        const all = load();
        all.push(doc);
        save(all);
        return doc;
    },
    upsert(doc) {
        const d = normalize(doc);
        const all = load();
        const index = all.findIndex((x) => x.id === d.id);
        if (index >= 0) {
            all[index] = d;
        }
        else {
            all.push(d);
        }
        save(all);
        return d;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    /* ================= ATTACHMENTS ================= */
    async attach(docId, file) {
        const all = load();
        const index = all.findIndex((x) => x.id === docId);
        if (index === -1)
            return null;
        const d = normalize(all[index]);
        const dataURL = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(file);
        });
        const attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            mime: file.type,
            size: file.size,
            dataURL,
        };
        d.attachments = [attachment, ...(d.attachments ?? [])];
        d.updatedAt = Date.now();
        all[index] = d;
        save(all);
        return attachment;
    },
    /* ================= CSV ================= */
    exportCSV(rows) {
        const header = "id;title;projectId;client;address;date;status;done/total";
        const body = rows
            .map((r) => {
            const d = normalize(r);
            const total = d.checklist?.length || 0;
            const done = d.checklist?.filter((i) => i.status === "ok").length || 0;
            return [
                d.id,
                esc(d.title || ""),
                d.projectId ?? "",
                esc(d.client || ""),
                esc(d.address || ""),
                d.date ?? "",
                d.status ?? "",
                `${done}/${total}`,
            ].join(";");
        })
            .join("\n");
        return header + "\n" + body;
    },
    /* ================= JSON ================= */
    exportJSON() {
        return JSON.stringify(load());
    },
    importJSON(txt) {
        try {
            const data = JSON.parse(txt || "[]");
            const normalized = data.map(normalize);
            save(normalized);
            return normalized.length;
        }
        catch {
            return 0;
        }
    },
};
