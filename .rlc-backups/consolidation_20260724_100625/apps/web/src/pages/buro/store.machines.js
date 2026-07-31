const KEY = "rlc-machines-db";
const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const save = (a) => localStorage.setItem(KEY, JSON.stringify(a));
export const MachinesDB = {
    list() { return load().sort((a, b) => (a.name || "").localeCompare(b.name || "")); },
    create() {
        const now = new Date().toISOString();
        const m = { id: crypto.randomUUID(), name: "", type: "", serial: "", projectId: "", location: "", status: "Betrieb",
            hours: 0, lastService: now, serviceIntervalDays: 180, nextService: now, maintenance: [], attachments: [], updatedAt: Date.now() };
        const all = load();
        all.push(m);
        save(all);
        return m;
    },
    upsert(m) { const all = load(); const i = all.findIndex(x => x.id === m.id); if (i >= 0)
        all[i] = m;
    else
        all.push(m); save(all); },
    remove(id) { save(load().filter(x => x.id !== id)); },
    async attach(machineId, f) {
        const dataURL = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
        const a = { id: crypto.randomUUID(), name: f.name, mime: f.type, size: f.size, dataURL };
        const all = load();
        const m = all.find(x => x.id === machineId);
        if (!m)
            return;
        m.attachments = [a, ...(m.attachments || [])];
        m.updatedAt = Date.now();
        save(all);
    },
    exportCSV(rows) {
        const h = "id;name;type;serial;projectId;location;status;hours;lastService;serviceIntervalDays;nextService";
        const b = rows.map(r => [
            r.id, esc(r.name ?? ""), esc(r.type ?? ""), esc(r.serial ?? ""), r.projectId ?? "", esc(r.location ?? ""),
            r.status ?? "", r.hours ?? 0, r.lastService ?? "", r.serviceIntervalDays ?? 0, r.nextService ?? ""
        ].join(";")).join("\n");
        return h + "\n" + b;
    },
    importCSV(txt) {
        const lines = txt.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1)
            return 0;
        const rows = lines.slice(1).map(l => l.split(";"));
        const all = load();
        for (const r of rows) {
            const m = { id: r[0] || crypto.randomUUID(), name: unesc(r[1] || ""), type: unesc(r[2] || ""), serial: unesc(r[3] || ""),
                projectId: r[4] || "", location: unesc(r[5] || ""), status: r[6] || "Betrieb", hours: +(r[7] || 0),
                lastService: r[8] || undefined, serviceIntervalDays: +(r[9] || 0), nextService: r[10] || undefined,
                maintenance: [], attachments: [], updatedAt: Date.now() };
            const i = all.findIndex(x => x.id === m.id);
            if (i >= 0)
                all[i] = m;
            else
                all.push(m);
        }
        save(all);
        return rows.length;
    },
    exportJSON() { return JSON.stringify(load()); },
    importJSON(txt) { const data = JSON.parse(txt || "[]"); save(data); return data.length; }
};
function esc(s) { return (s || "").replace(/;/g, ","); }
function unesc(s) { return s; }
