const KEY = "rlc-sicherheit-db";
const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const save = (a) => localStorage.setItem(KEY, JSON.stringify(a));
export const SafetyDB = {
    list() { return load(); },
    upsert(a) { const all = load(); const i = all.findIndex(x => x.id === a.id); if (i >= 0)
        all[i] = a;
    else
        all.push(a); save(all); },
    remove(id) { save(load().filter(x => x.id !== id)); },
    create() {
        const n = { id: crypto.randomUUID(), title: "Neue Unterweisung", date: new Date().toISOString(), nextDate: "", notes: "", attachments: [] };
        const all = load();
        all.push(n);
        save(all);
        return n;
    },
    attach: async (id, f) => {
        const all = load();
        const i = all.findIndex(x => x.id === id);
        if (i < 0)
            return;
        const data = await f.arrayBuffer();
        const base = URL.createObjectURL(new Blob([data], { type: f.type }));
        const a = { id: crypto.randomUUID(), name: f.name, mime: f.type, dataURL: base };
        all[i].attachments = [...(all[i].attachments || []), a];
        save(all);
    },
    exportCSV(rows) {
        const h = "id;title;person;project;date;nextDate;notes";
        const b = rows.map(r => [r.id, r.title, r.person ?? "", r.project ?? "", r.date ?? "", r.nextDate ?? "", (r.notes ?? "").replace(/;/g, ",")].join(";")).join("\n");
        return h + "\n" + b;
    }
};
