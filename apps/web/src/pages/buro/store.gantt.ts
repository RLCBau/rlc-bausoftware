import { GanttTask } from "./types";
const KEY = "rlc-gantt-db";

const load = (): GanttTask[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
};
const save = (a: GanttTask[]) => localStorage.setItem(KEY, JSON.stringify(a));

export const GanttDB = {
  list(): GanttTask[] { return load(); },

  create(): GanttTask {
    const now = new Date();
    const end = new Date(now.getTime() + 3 * 86400000);
    const t: GanttTask = {
      id: crypto.randomUUID(),
      name: "Neuer Vorgang",
      start: now.toISOString(),
      end: end.toISOString(),
      progress: 0,
      dependsOn: [],
    };
    const all = load();
    all.push(t);
    save(all);
    return t;
  },

  remove(id: string) {
    save(load().filter(x => x.id !== id));
  },

  upsert(t: GanttTask) {
    const all = load();
    const i = all.findIndex(x => x.id === t.id);
    if (i >= 0) all[i] = t; else all.push(t);
    save(all);
  },

  exportCSV(rows: GanttTask[]) {
    const header = "id;name;projectId;start;end;progress;dependsOn;notes";
    const body = rows.map(r => [
      r.id, esc(r.name), r.projectId ?? "", r.start, r.end,
      r.progress ?? 0, (r.dependsOn ?? []).join("|"), esc(r.notes ?? "")
    ].join(";")).join("\n");
    return header + "\n" + body;
  },

  importCSV(txt: string) {
    const lines = txt.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return 0;
    const rows = lines.slice(1).map(l => l.split(";"));
    const all = load();
    for (const r of rows) {
      const t: GanttTask = {
        id: r[0] || crypto.randomUUID(),
        name: unesc(r[1] || ""),
        projectId: r[2] || undefined,
        start: r[3] || new Date().toISOString(),
        end: r[4] || new Date().toISOString(),
        progress: +(r[5] || 0),
        dependsOn: (r[6] || "").split("|").filter(Boolean),
        notes: unesc(r[7] || "")
      };
      const i = all.findIndex(x => x.id === t.id);
      if (i >= 0) all[i] = t; else all.push(t);
    }
    save(all);
    return rows.length;
  }
};

function esc(s: string) { return (s || "").replace(/;/g, ","); }
function unesc(s: string) { return s; }
