const KEY = "rlc-personal-db";
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
function asString(v) {
    return typeof v === "string" ? v : "";
}
function asOptionalString(v) {
    return typeof v === "string" && v.trim() ? v : undefined;
}
function normalizeEmployee(e) {
    const raw = e;
    const normalized = {
        id: e.id || crypto.randomUUID(),
        name: e.name || "",
        role: e.role || "",
        email: e.email || "",
        phone: e.phone || "",
        hourlyRate: Number.isFinite(e.hourlyRate) ? e.hourlyRate : 0,
        costCenter: e.costCenter || "",
        projects: Array.isArray(e.projects) ? e.projects : [],
        employmentType: e.employmentType || "Vollzeit",
        contractStart: e.contractStart || new Date().toISOString(),
        contractEnd: e.contractEnd || undefined,
        vacationTotal: Number.isFinite(e.vacationTotal) ? e.vacationTotal : 25,
        vacationTaken: Number.isFinite(e.vacationTaken) ? e.vacationTaken : 0,
        certs: Array.isArray(e.certs) ? e.certs : [],
        attachments: Array.isArray(e.attachments) ? e.attachments : [],
        updatedAt: e.updatedAt || Date.now(),
    };
    if (raw.projectId) {
        normalized.projectId = raw.projectId;
    }
    return normalized;
}
/* ================= DB ================= */
export const PersonalDB = {
    list() {
        return load()
            .map(normalizeEmployee)
            .sort((a, b) => asString(a.name).localeCompare(asString(b.name)));
    },
    create(projectId) {
        const base = {
            id: crypto.randomUUID(),
            name: "",
            role: "",
            email: "",
            phone: "",
            hourlyRate: 0,
            costCenter: "",
            projects: [],
            employmentType: "Vollzeit",
            contractStart: new Date().toISOString(),
            contractEnd: undefined,
            vacationTotal: 25,
            vacationTaken: 0,
            certs: [],
            attachments: [],
            updatedAt: Date.now(),
        };
        const pid = asOptionalString(projectId);
        if (pid)
            base.projectId = pid;
        const employee = normalizeEmployee(base);
        const all = load();
        all.push(employee);
        save(all);
        return employee;
    },
    upsert(employee) {
        const e = normalizeEmployee(employee);
        const all = load();
        const index = all.findIndex((x) => x.id === e.id);
        if (index >= 0) {
            all[index] = e;
        }
        else {
            all.push(e);
        }
        save(all);
        return e;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    /* ================= ATTACHMENTS ================= */
    async attach(empId, file) {
        const all = load();
        const index = all.findIndex((x) => x.id === empId);
        if (index === -1)
            return null;
        const e = normalizeEmployee(all[index]);
        const dataURL = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result ?? ""));
            r.readAsDataURL(file);
        });
        const attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            mime: file.type,
            size: file.size,
            dataURL,
        };
        e.attachments = [attachment, ...(e.attachments ?? [])];
        e.updatedAt = Date.now();
        all[index] = e;
        save(all);
        return attachment;
    },
    /* ================= CSV ================= */
    exportCSV(rows) {
        const header = "id;name;role;email;phone;hourlyRate;costCenter;projects;employmentType;contractStart;contractEnd;vacationTotal;vacationTaken";
        const body = rows
            .map((r) => {
            const e = normalizeEmployee(r);
            return [
                e.id,
                esc(asString(e.name)),
                esc(asString(e.role)),
                e.email ?? "",
                e.phone ?? "",
                e.hourlyRate ?? 0,
                esc(asString(e.costCenter)),
                (e.projects ?? []).join("|"),
                e.employmentType ?? "",
                e.contractStart ?? "",
                e.contractEnd ?? "",
                e.vacationTotal ?? 0,
                e.vacationTaken ?? 0,
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
                const employee = normalizeEmployee({
                    id: r[0] || crypto.randomUUID(),
                    name: unesc(r[1] || ""),
                    role: unesc(r[2] || ""),
                    email: r[3] || "",
                    phone: r[4] || "",
                    hourlyRate: Number(r[5] || 0),
                    costCenter: unesc(r[6] || ""),
                    projects: (r[7] || "").split("|").filter(Boolean),
                    employmentType: r[8] || "Vollzeit",
                    contractStart: r[9] || undefined,
                    contractEnd: r[10] || undefined,
                    vacationTotal: Number(r[11] || 0),
                    vacationTaken: Number(r[12] || 0),
                    certs: [],
                    attachments: [],
                    updatedAt: Date.now(),
                });
                const index = all.findIndex((x) => x.id === employee.id);
                if (index >= 0) {
                    all[index] = employee;
                }
                else {
                    all.push(employee);
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
            const normalized = data.map(normalizeEmployee);
            save(normalized);
            return normalized.length;
        }
        catch {
            return 0;
        }
    },
};
