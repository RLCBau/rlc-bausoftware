// apps/web/src/pages/kalkulation/projectStore.ts
const KEY = "rlc_projects_v2";
const LEGACY_KEY = "rlc_projects_v1";
const CUR = "rlc_current_project_id";
const CUR_CODE = "rlc_current_project_code";
function uid() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function now() {
    return Date.now();
}
function clean(value) {
    return String(value ?? "").trim();
}
function normalizeProjectCode(value) {
    return clean(value)
        .toUpperCase()
        .replace(/\s+/g, "-")
        .replace(/[^A-Z0-9_.-]/g, "");
}
function isProjectLike(value) {
    return !!value && typeof value === "object";
}
function normalizeProject(raw) {
    if (!isProjectLike(raw))
        return null;
    const id = clean(raw.id) || uid();
    const number = normalizeProjectCode(raw.number ?? raw.code ?? raw.projectCode ?? raw.projektnummer);
    const name = clean(raw.name ?? raw.projectName ?? raw.projektname);
    if (!number && !name)
        return null;
    const finalNumber = number || `BA-${new Date().getFullYear()}-${id.slice(0, 6).toUpperCase()}`;
    const createdAtRaw = Number(raw.createdAt);
    const updatedAtRaw = Number(raw.updatedAt);
    return {
        id,
        name,
        number: finalNumber,
        code: finalNumber,
        projectCode: finalNumber,
        client: clean(raw.client ?? raw.auftraggeber ?? raw.kunde),
        location: clean(raw.location ?? raw.place ?? raw.ort),
        place: clean(raw.place ?? raw.location ?? raw.ort),
        createdAt: Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : now(),
        updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : now(),
        dbId: raw.dbId ?? undefined,
        companyId: clean(raw.companyId) || undefined,
    };
}
function sortProjects(rows) {
    return [...rows].sort((a, b) => {
        const au = Number(a.updatedAt || a.createdAt || 0);
        const bu = Number(b.updatedAt || b.createdAt || 0);
        return bu - au;
    });
}
function dedupe(rows) {
    const byId = new Map();
    const byCode = new Map();
    for (const row of rows) {
        const normalized = normalizeProject(row);
        if (!normalized)
            continue;
        const codeKey = normalizeProjectCode(normalized.code || normalized.number);
        const existingIdByCode = codeKey ? byCode.get(codeKey) : "";
        if (existingIdByCode && byId.has(existingIdByCode)) {
            const old = byId.get(existingIdByCode);
            byId.set(existingIdByCode, {
                ...old,
                ...normalized,
                id: old.id,
                createdAt: old.createdAt || normalized.createdAt,
                updatedAt: Math.max(old.updatedAt || 0, normalized.updatedAt || 0),
            });
            continue;
        }
        byId.set(normalized.id, normalized);
        if (codeKey)
            byCode.set(codeKey, normalized.id);
    }
    return sortProjects(Array.from(byId.values()));
}
function readRaw(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function readAll() {
    const current = readRaw(KEY);
    const legacy = readRaw(LEGACY_KEY);
    const safeLegacy = Array.isArray(legacy) ? legacy : [];
    const rows = dedupe([...current, ...safeLegacy]);
    // migrazione automatica da v1 a v2
    if (rows.length && current.length === 0) {
        writeAll(rows);
    }
    return rows;
}
function writeAll(rows) {
    localStorage.setItem(KEY, JSON.stringify(dedupe(rows)));
}
function findProject(idOrCode) {
    const key = clean(idOrCode);
    const codeKey = normalizeProjectCode(key);
    return (readAll().find((p) => p.id === key ||
        normalizeProjectCode(p.number) === codeKey ||
        normalizeProjectCode(p.code) === codeKey ||
        normalizeProjectCode(p.projectCode) === codeKey) || null);
}
export const Projects = {
    list() {
        return readAll();
    },
    count() {
        return readAll().length;
    },
    get(idOrCode) {
        return findProject(idOrCode);
    },
    upsert(p) {
        const all = readAll();
        const incoming = normalizeProject({
            ...p,
            id: p.id || uid(),
            number: p.number ?? p.code ?? p.projectCode,
            code: p.code ?? p.number ?? p.projectCode,
            projectCode: p.projectCode ?? p.code ?? p.number,
        });
        if (!incoming) {
            throw new Error("Projekt ungÃ¼ltig: BaustellenNummer oder Projektname fehlt.");
        }
        const idx = all.findIndex((x) => x.id === incoming.id ||
            normalizeProjectCode(x.number) === normalizeProjectCode(incoming.number));
        const createdAt = idx >= 0 ? all[idx].createdAt : incoming.createdAt;
        const item = {
            ...incoming,
            createdAt,
            updatedAt: now(),
        };
        if (idx >= 0)
            all[idx] = item;
        else
            all.unshift(item);
        writeAll(all);
        return item;
    },
    remove(idOrCode) {
        const target = findProject(idOrCode);
        if (!target)
            return;
        const next = readAll().filter((p) => p.id !== target.id);
        writeAll(next);
        if (Projects.getCurrentId() === target.id) {
            localStorage.removeItem(CUR);
            localStorage.removeItem(CUR_CODE);
        }
    },
    clear() {
        localStorage.removeItem(KEY);
        localStorage.removeItem(LEGACY_KEY);
        localStorage.removeItem(CUR);
        localStorage.removeItem(CUR_CODE);
    },
    setCurrent(idOrCode) {
        const p = findProject(idOrCode);
        if (!p)
            return;
        localStorage.setItem(CUR, p.id);
        localStorage.setItem(CUR_CODE, p.code || p.number);
    },
    getCurrentId() {
        return localStorage.getItem(CUR);
    },
    getCurrentCode() {
        return localStorage.getItem(CUR_CODE);
    },
    getCurrent() {
        const id = localStorage.getItem(CUR);
        const code = localStorage.getItem(CUR_CODE);
        if (id) {
            const byId = findProject(id);
            if (byId)
                return byId;
        }
        if (code) {
            const byCode = findProject(code);
            if (byCode)
                return byCode;
        }
        return null;
    },
    exportJSON() {
        return JSON.stringify(readAll(), null, 2);
    },
    importJSON(json) {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed))
            throw new Error("Invalid JSON: Array erwartet.");
        const imported = dedupe(parsed.map(normalizeProject).filter(Boolean));
        writeAll(imported);
        return imported.length;
    },
    mergeImportJSON(json) {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed))
            throw new Error("Invalid JSON: Array erwartet.");
        const imported = parsed.map(normalizeProject).filter(Boolean);
        const merged = dedupe([...imported, ...readAll()]);
        writeAll(merged);
        return imported.length;
    },
};
