// apps/web/src/pages/kalkulation/projectStore.ts

const KEY = "rlc_projects_v2";
const LEGACY_KEY = "rlc_projects_v1";

const CUR = "rlc_current_project_id";
const CUR_CODE = "rlc_current_project_code";

export type Project = {
  id: string;

  // Hauptdaten
  name: string; // Projektname
  number: string; // BaustellenNummer / BA-Code

  // Alias compatibili con altri moduli
  code: string;
  projectCode: string;

  client?: string; // Auftraggeber
  location?: string; // Ort
  place?: string;

  createdAt: number;
  updatedAt: number;

  // opzionali per compatibilitÃ  futura/server
  dbId?: string | number;
  companyId?: string;
};

type ProjectInput = Partial<Project> & {
  id?: string;
  code?: string;
  projectCode?: string;
  number?: string;
  name?: string;
  client?: string;
  location?: string;
  place?: string;
};

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function now(): number {
  return Date.now();
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeProjectCode(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_.-]/g, "");
}

function isProjectLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function normalizeProject(raw: unknown): Project | null {
  if (!isProjectLike(raw)) return null;

  const id = clean(raw.id) || uid();

  const number = normalizeProjectCode(
    raw.number ?? raw.code ?? raw.projectCode ?? raw.projektnummer
  );

  const name = clean(raw.name ?? raw.projectName ?? raw.projektname);

  if (!number && !name) return null;

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

    dbId: (raw.dbId as any) ?? undefined,
    companyId: clean(raw.companyId) || undefined,
  };
}

function sortProjects(rows: Project[]): Project[] {
  return [...rows].sort((a, b) => {
    const au = Number(a.updatedAt || a.createdAt || 0);
    const bu = Number(b.updatedAt || b.createdAt || 0);
    return bu - au;
  });
}

function dedupe(rows: Project[]): Project[] {
  const byId = new Map<string, Project>();
  const byCode = new Map<string, string>();

  for (const row of rows) {
    const normalized = normalizeProject(row);
    if (!normalized) continue;

    const codeKey = normalizeProjectCode(normalized.code || normalized.number);

    const existingIdByCode = codeKey ? byCode.get(codeKey) : "";
    if (existingIdByCode && byId.has(existingIdByCode)) {
      const old = byId.get(existingIdByCode)!;
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
    if (codeKey) byCode.set(codeKey, normalized.id);
  }

  return sortProjects(Array.from(byId.values()));
}

function readRaw(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readAll(): Project[] {
  const current = readRaw(KEY);
  const legacy = readRaw(LEGACY_KEY);

  const safeLegacy: Project[] = Array.isArray(legacy) ? (legacy as Project[]) : [];
  const rows = dedupe([...(current as Project[]), ...safeLegacy]);

  // migrazione automatica da v1 a v2
  if (rows.length && current.length === 0) {
    writeAll(rows);
  }

  return rows;
}

function writeAll(rows: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(dedupe(rows)));
}

function findProject(idOrCode: string): Project | null {
  const key = clean(idOrCode);
  const codeKey = normalizeProjectCode(key);

  return (
    readAll().find(
      (p) =>
        p.id === key ||
        normalizeProjectCode(p.number) === codeKey ||
        normalizeProjectCode(p.code) === codeKey ||
        normalizeProjectCode(p.projectCode) === codeKey
    ) || null
  );
}

export const Projects = {
  list(): Project[] {
    return readAll();
  },

  count(): number {
    return readAll().length;
  },

  get(idOrCode: string): Project | null {
    return findProject(idOrCode);
  },

  upsert(p: ProjectInput): Project {
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

    const idx = all.findIndex(
      (x) =>
        x.id === incoming.id ||
        normalizeProjectCode(x.number) === normalizeProjectCode(incoming.number)
    );

    const createdAt = idx >= 0 ? all[idx].createdAt : incoming.createdAt;

    const item: Project = {
      ...incoming,
      createdAt,
      updatedAt: now(),
    };

    if (idx >= 0) all[idx] = item;
    else all.unshift(item);

    writeAll(all);
    return item;
  },

  remove(idOrCode: string) {
    const target = findProject(idOrCode);
    if (!target) return;

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

  setCurrent(idOrCode: string) {
    const p = findProject(idOrCode);
    if (!p) return;

    localStorage.setItem(CUR, p.id);
    localStorage.setItem(CUR_CODE, p.code || p.number);
  },

  getCurrentId(): string | null {
    return localStorage.getItem(CUR);
  },

  getCurrentCode(): string | null {
    return localStorage.getItem(CUR_CODE);
  },

  getCurrent(): Project | null {
    const id = localStorage.getItem(CUR);
    const code = localStorage.getItem(CUR_CODE);

    if (id) {
      const byId = findProject(id);
      if (byId) return byId;
    }

    if (code) {
      const byCode = findProject(code);
      if (byCode) return byCode;
    }

    return null;
  },

  exportJSON(): string {
    return JSON.stringify(readAll(), null, 2);
  },

  importJSON(json: string): number {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error("Invalid JSON: Array erwartet.");

    const imported = dedupe(parsed.map(normalizeProject).filter(Boolean) as Project[]);
    writeAll(imported);

    return imported.length;
  },

  mergeImportJSON(json: string): number {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error("Invalid JSON: Array erwartet.");

    const imported = parsed.map(normalizeProject).filter(Boolean) as Project[];
    const merged = dedupe([...imported, ...readAll()]);
    writeAll(merged);

    return imported.length;
  },
};

