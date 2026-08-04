const KEY = "rlc-sicherheit-db";
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
function normalize(r) {
    return {
        id: r.id || crypto.randomUUID(),
        title: r.title || "Neue Unterweisung",
        person: r.person || "",
        project: r.project || "",
        projectId: r.projectId || undefined,
        date: r.date || new Date().toISOString(),
        nextDate: r.nextDate || "",
        notes: r.notes || "",
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
    };
}
/* ================= DB ================= */
export const SafetyDB = {
    list() {
        return load()
            .map(normalize)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    },
    create(projectId) {
        const record = normalize({
            id: crypto.randomUUID(),
            title: "Neue Unterweisung",
            projectId,
            date: new Date().toISOString(),
            nextDate: "",
            notes: "",
            attachments: [],
        });
        const all = load();
        all.push(record);
        save(all);
        return record;
    },
    upsert(record) {
        const r = normalize(record);
        const all = load();
        const index = all.findIndex((x) => x.id === r.id);
        if (index >= 0) {
            all[index] = r;
        }
        else {
            all.push(r);
        }
        save(all);
        return r;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    /* ================= ATTACHMENTS ================= */
    async attach(id, file) {
        const all = load();
        const index = all.findIndex((x) => x.id === id);
        if (index === -1)
            return null;
        const r = normalize(all[index]);
        const dataURL = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => res(String(reader.result));
            reader.readAsDataURL(file);
        });
        const attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            mime: file.type,
            size: file.size,
            dataURL,
        };
        r.attachments = [attachment, ...(r.attachments ?? [])];
        all[index] = r;
        save(all);
        return attachment;
    },
    /* ================= CSV ================= */
    exportCSV(rows) {
        const header = "id;title;person;project;date;nextDate;notes";
        const body = rows
            .map((r) => {
            const rec = normalize(r);
            return [
                rec.id,
                esc(rec.title || ""),
                esc(rec.person || ""),
                esc(rec.project || ""),
                rec.date ?? "",
                rec.nextDate ?? "",
                esc(rec.notes || ""),
            ].join(";");
        })
            .join("\n");
        return header + "\n" + body;
    },
    importCSV(txt) {
        if (!txt)
            return 0;
        const lines = txt.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1)
            return 0;
        const rows = lines.slice(1).map((l) => l.split(";"));
        const all = load();
        let count = 0;
        for (const r of rows) {
            try {
                const record = normalize({
                    id: r[0] || crypto.randomUUID(),
                    title: r[1] || "Neue Unterweisung",
                    person: r[2] || "",
                    project: r[3] || "",
                    date: r[4] || new Date().toISOString(),
                    nextDate: r[5] || "",
                    notes: r[6] || "",
                    attachments: [],
                });
                const index = all.findIndex((x) => x.id === record.id);
                if (index >= 0) {
                    all[index] = record;
                }
                else {
                    all.push(record);
                }
                count++;
            }
            catch {
                // skip row
            }
        }
        save(all);
        return count;
    },
};
