const KEY = "rlc_projects_v1";
const CUR = "rlc_current_project_id";

export type Project = {
  id: string;
  name: string;            // Projektname
  number: string;          // BaustellenNummer
  client?: string;         // Auftraggeber
  location?: string;       // Ort
  createdAt: number;
};

const uid = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export const Projects = {
  list(): Project[] {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  },
  upsert(p: Partial<Project> & { id?: string }) {
    const all = Projects.list();
    const id = p.id ?? uid();
    const existing = all.findIndex(x => x.id === id);
    const item: Project = {
      id,
      name: (p.name || "").trim(),
      number: (p.number || "").trim(),
      client: p.client?.trim(),
      location: p.location?.trim(),
      createdAt: existing >= 0 ? all[existing].createdAt : Date.now()
    };
    if (existing >= 0) all[existing] = item; else all.unshift(item);
    localStorage.setItem(KEY, JSON.stringify(all));
    return item;
  },
  remove(id: string) {
    localStorage.setItem(KEY, JSON.stringify(Projects.list().filter(p => p.id !== id)));
    if (Projects.getCurrentId() === id) localStorage.removeItem(CUR);
  },
  clear() { localStorage.removeItem(KEY); localStorage.removeItem(CUR); },

  setCurrent(id: string) { localStorage.setItem(CUR, id); },
  getCurrentId(): string | null { return localStorage.getItem(CUR); },
  getCurrent(): Project | null { return Projects.list().find(p => p.id === Projects.getCurrentId()) || null; },

  exportJSON(): string { return JSON.stringify(Projects.list(), null, 2); },
  importJSON(json: string) {
    const arr = JSON.parse(json) as Project[];
    if (!Array.isArray(arr)) throw new Error("Invalid JSON");
    localStorage.setItem(KEY, JSON.stringify(arr));
  }
};
