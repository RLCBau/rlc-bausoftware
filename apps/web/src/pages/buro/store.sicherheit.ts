import { SafetyRecord } from "./types";

const KEY = "rlc-sicherheit-db";

/* ================= LOAD / SAVE ================= */

const load = (): SafetyRecord[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (rows: SafetyRecord[]) => {
  localStorage.setItem(KEY, JSON.stringify(rows));
};

/* ================= HELPERS ================= */

function esc(s: string) {
  return (s || "").replace(/;/g, ",").replace(/\n/g, " ");
}

function normalize(r: SafetyRecord): SafetyRecord {
  return {
    id: r.id || crypto.randomUUID(),
    title: r.title || "Neue Unterweisung",
    person: (r as any).person || "",
    project: (r as any).project || "",
    projectId: (r as any).projectId || undefined,
    date: r.date || new Date().toISOString(),
    nextDate: r.nextDate || "",
    notes: r.notes || "",
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
  };
}

/* ================= DB ================= */

export const SafetyDB = {
  list(): SafetyRecord[] {
    return load()
      .map(normalize)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },

  create(projectId?: string): SafetyRecord {
    const record = normalize({
      id: crypto.randomUUID(),
      title: "Neue Unterweisung",
      projectId,
      date: new Date().toISOString(),
      nextDate: "",
      notes: "",
      attachments: [],
    } as SafetyRecord);

    const all = load();
    all.push(record);
    save(all);

    return record;
  },

  upsert(record: SafetyRecord) {
    const r = normalize(record);

    const all = load();
    const index = all.findIndex((x) => x.id === r.id);

    if (index >= 0) {
      all[index] = r;
    } else {
      all.push(r);
    }

    save(all);
    return r;
  },

  remove(id: string) {
    const all = load().filter((x) => x.id !== id);
    save(all);
  },

  /* ================= ATTACHMENTS ================= */

  async attach(id: string, file: File) {
    const all = load();
    const index = all.findIndex((x) => x.id === id);
    if (index === -1) return null;

    const r = normalize(all[index]);

    const dataURL = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result));
      reader.readAsDataURL(file);
    });

    const attachment = {
      id: crypto.randomUUID(),
      name: file.name,
      mime: file.type,
      size: file.size,
      dataURL,
    };

    r.attachments = [attachment, ...(r.attachments ?? [])];

    all[index] = r;
    save(all);

    return attachment;
  },

  /* ================= CSV ================= */

  exportCSV(rows: SafetyRecord[]) {
    const header = "id;title;person;project;date;nextDate;notes";

    const body = rows
      .map((r) => {
        const rec = normalize(r);

        return [
          rec.id,
          esc(rec.title || ""),
          esc((rec as any).person || ""),
          esc((rec as any).project || ""),
          rec.date ?? "",
          rec.nextDate ?? "",
          esc(rec.notes || ""),
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
        const record: SafetyRecord = normalize({
          id: r[0] || crypto.randomUUID(),
          title: r[1] || "Neue Unterweisung",
          person: r[2] || "",
          project: r[3] || "",
          date: r[4] || new Date().toISOString(),
          nextDate: r[5] || "",
          notes: r[6] || "",
          attachments: [],
        } as SafetyRecord);

        const index = all.findIndex((x) => x.id === record.id);

        if (index >= 0) {
          all[index] = record;
        } else {
          all.push(record);
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





