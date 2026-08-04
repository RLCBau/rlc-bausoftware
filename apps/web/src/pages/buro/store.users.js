const KEY = "rlc-users-db";
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
function asString(v) {
    return typeof v === "string" ? v : "";
}
function asOptionalString(v) {
    return typeof v === "string" && v.trim() ? v : undefined;
}
function normalize(u) {
    const raw = u;
    const normalized = {
        id: u.id || crypto.randomUUID(),
        name: u.name || "",
        email: u.email || "",
        role: u.role || "Mitarbeiter",
        active: typeof u.active === "boolean" ? u.active : true,
        rights: Array.isArray(u.rights) ? u.rights : [],
    };
    if (raw.projectId) {
        normalized.projectId = raw.projectId;
    }
    return normalized;
}
/* ================= DB ================= */
export const UserDB = {
    list() {
        return load()
            .map(normalize)
            .sort((a, b) => asString(a.name).localeCompare(asString(b.name)));
    },
    create(projectId) {
        const base = {
            id: crypto.randomUUID(),
            name: "",
            email: "",
            role: "Mitarbeiter",
            active: true,
            rights: [],
        };
        const pid = asOptionalString(projectId);
        if (pid)
            base.projectId = pid;
        const user = normalize(base);
        const all = load();
        all.push(user);
        save(all);
        return user;
    },
    upsert(user) {
        const u = normalize(user);
        const all = load();
        const index = all.findIndex((x) => x.id === u.id);
        if (index >= 0) {
            all[index] = u;
        }
        else {
            all.push(u);
        }
        save(all);
        return u;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
};
