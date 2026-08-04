import { ResAssign } from "./types";

const KEY = "rlc-ressourcen-db";

/* ================= LOAD / SAVE ================= */

const load = (): ResAssign[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (rows: ResAssign[]) => {
  localStorage.setItem(KEY, JSON.stringify(rows));
};

/* ================= HELPERS ================= */

function esc(s: string) {
  return (s || "").replace(/;/g, ",").replace(/\n/g, " ");
}

function normalize(a: ResAssign): ResAssign {
  return {
    id: a.id || crypto.randomUUID(),
    resourceId: a.resourceId || "",
    date: a.date || new Date().toISOString().slice(0, 10),
    projectId: a.projectId || undefined,
    hours: Number.isFinite(a.hours) ? a.hours : 0,
    notes: a.notes || "",
  };
}

/* ================= DB ================= */

export const ResDB = {
  list(): ResAssign[] {
    return load()
      .map(normalize)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  upsert(assign: ResAssign) {
    const a = normalize(assign);

    const all = load();
    const index = all.findIndex((x) => x.id === a.id);

    if (index >= 0) {
      all[index] = a;
    } else {
      all.push(a);
    }

    save(all);
    return a;
  },

  remove(id: string) {
    const all = load().filter((x) => x.id !== id);
    save(all);
  },

  clearWeek(dayKeys: string[]) {
    if (!Array.isArray(dayKeys) || dayKeys.length === 0) return;

    const all = load().filter((a) => !dayKeys.includes(a.date));
    save(all);
  },

  /* ================= CSV ================= */

  exportCSV(rows: ResAssign[]) {
    const header = "id;resourceId;date;projectId;hours;notes";

    const body = rows
      .map((r) => {
        const a = normalize(r);

        return [
          a.id,
          a.resourceId,
          a.date,
          a.projectId ?? "",
          a.hours ?? 0,
          esc(a.notes || ""),
        ].join(";");
      })
      .join("\n");

    return header + "\n" + body;
  },

  importCSV(txt: string) {
    if (!txt) return 0;

    const lines = txt.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return 0;

    const rows = lines.slice(1).map((l) => l.split(";"));
    const all = load();

    let count = 0;

    for (const r of rows) {
      try {
        const a: ResAssign = normalize({
          id: r[0] || crypto.randomUUID(),
          resourceId: r[1] || "",
          date: r[2] || new Date().toISOString().slice(0, 10),
          projectId: r[3] || undefined,
          hours: Number(r[4] || 0),
          notes: r[5] || "",
        } as ResAssign);

        const index = all.findIndex((x) => x.id === a.id);

        if (index >= 0) {
          all[index] = a;
        } else {
          all.push(a);
        }

        count++;
      } catch {
        // skip row
      }
    }

    save(all);
    return count;
  },
};





