const KEY = "rlc-machines-db";
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
function unesc(s) {
    return s || "";
}
function normalizeMachine(m) {
    const nowISO = new Date().toISOString();
    return {
        id: m.id || crypto.randomUUID(),
        name: m.name || "",
        type: m.type || "",
        serial: m.serial || "",
        projectId: m.projectId || undefined,
        location: m.location || "",
        status: m.status || "Betrieb",
        hours: Number.isFinite(m.hours) ? m.hours : 0,
        lastService: m.lastService || nowISO,
        serviceIntervalDays: Number.isFinite(m.serviceIntervalDays)
            ? m.serviceIntervalDays
            : 180,
        nextService: m.nextService || nowISO,
        maintenance: Array.isArray(m.maintenance) ? m.maintenance : [],
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        updatedAt: m.updatedAt || Date.now(),
    };
}
/* ================= DB ================= */
export const MachinesDB = {
    list() {
        return load()
            .map(normalizeMachine)
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
    create(projectId) {
        const nowISO = new Date().toISOString();
        const machine = normalizeMachine({
            id: crypto.randomUUID(),
            name: "",
            type: "",
            serial: "",
            projectId,
            location: "",
            status: "Betrieb",
            hours: 0,
            lastService: nowISO,
            serviceIntervalDays: 180,
            nextService: nowISO,
            maintenance: [],
            attachments: [],
            updatedAt: Date.now(),
        });
        const all = load();
        all.push(machine);
        save(all);
        return machine;
    },
    upsert(machine) {
        const m = normalizeMachine(machine);
        const all = load();
        const index = all.findIndex((x) => x.id === m.id);
        if (index >= 0) {
            all[index] = m;
        }
        else {
            all.push(m);
        }
        save(all);
        return m;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    async attach(machineId, file) {
        const all = load();
        const index = all.findIndex((x) => x.id === machineId);
        if (index === -1)
            return null;
        const m = normalizeMachine(all[index]);
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
        m.attachments = [attachment, ...(m.attachments ?? [])];
        m.updatedAt = Date.now();
        all[index] = m;
        save(all);
        return attachment;
    },
    /* ================= CSV ================= */
    exportCSV(rows) {
        const header = "id;name;type;serial;projectId;location;status;hours;lastService;serviceIntervalDays;nextService";
        const body = rows
            .map((r) => {
            const m = normalizeMachine(r);
            return [
                m.id,
                esc(m.name || ""),
                esc(m.type || ""),
                esc(m.serial || ""),
                m.projectId ?? "",
                esc(m.location || ""),
                m.status ?? "",
                m.hours ?? 0,
                m.lastService ?? "",
                m.serviceIntervalDays ?? 0,
                m.nextService ?? "",
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
                const machine = normalizeMachine({
                    id: r[0] || crypto.randomUUID(),
                    name: unesc(r[1] || ""),
                    type: unesc(r[2] || ""),
                    serial: unesc(r[3] || ""),
                    projectId: r[4] || undefined,
                    location: unesc(r[5] || ""),
                    status: r[6] || "Betrieb",
                    hours: Number(r[7] || 0),
                    lastService: r[8] || new Date().toISOString(),
                    serviceIntervalDays: Number(r[9] || 0),
                    nextService: r[10] || new Date().toISOString(),
                    maintenance: [],
                    attachments: [],
                    updatedAt: Date.now(),
                });
                const index = all.findIndex((x) => x.id === machine.id);
                if (index >= 0) {
                    all[index] = machine;
                }
                else {
                    all.push(machine);
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
    /* ================= JSON ================= */
    exportJSON() {
        return JSON.stringify(load());
    },
    importJSON(txt) {
        try {
            const data = JSON.parse(txt || "[]");
            const normalized = data.map(normalizeMachine);
            save(normalized);
            return normalized.length;
        }
        catch {
            return 0;
        }
    },
};
