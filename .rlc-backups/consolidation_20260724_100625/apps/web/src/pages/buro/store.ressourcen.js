const KEY = "rlc-ressourcen-db";
const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const save = (a) => localStorage.setItem(KEY, JSON.stringify(a));
export const ResDB = {
    list() { return load(); },
    upsert(a) { const all = load(); const i = all.findIndex(x => x.id === a.id); if (i >= 0)
        all[i] = a;
    else
        all.push(a); save(all); },
    remove(id) { save(load().filter(x => x.id !== id)); },
    clearWeek(dayKeys) { save(load().filter(a => !dayKeys.includes(a.date))); },
    exportCSV(rows) {
        const h = "id;resourceId;date;projectId;hours;notes";
        const b = rows.map(r => [r.id, r.resourceId, r.date, r.projectId ?? "", r.hours ?? 0, (r.notes ?? "").replace(/;/g, ",")].join(";")).join("\n");
        return h + "\n" + b;
    }
};
