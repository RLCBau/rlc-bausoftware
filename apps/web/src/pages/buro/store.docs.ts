import { Dokument, DocID, DocVersion } from "./types";

const KEY = "rlc_buro_docs_v2";

const load = (): Dokument[] => {
  try {
    const raw = localStorage.getItem(KEY) || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Dokument[]) : [];
  } catch {
    return [];
  }
};

const save = (rows: Dokument[]) => {
  localStorage.setItem(KEY, JSON.stringify(rows));
};

export function toCSV(list: Dokument[]): string {
  const header = `"Titel";"Tags";"ProjektId";"LetzteDatei";"LetzteGroesse";"Geaendert"`;

  const lines = list.map((d) => {
    const v = d.versions?.[0];
    return [
      d.title,
      (d.tags ?? []).join(", "),
      d.projektId ?? "",
      v?.fileName ?? "",
      v?.size ?? 0,
      d.updatedAt,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(";");
  });

  return [header, ...lines].join("\r\n");
}

export function fromCSV(csv: string): Dokument[] {
  const rows = csv.split(/\r?\n/).filter(Boolean).slice(1);
  const now = Date.now();

  return rows.map((line) => {
    const cols = splitCsvSemicolon(line).map((c) => unquoteCsv(c));
    const [title, tags, projektId] = cols;

    return {
      id: crypto.randomUUID(),
      title: title || "Importiertes Dokument",
      projektId: projektId || undefined,
      tags: (tags || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      versions: [],
      updatedAt: now,
    } as Dokument;
  });
}

export const DocsDB = {
  list(): Dokument[] {
    return load().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },

  byId(id: DocID) {
    return load().find((d) => d.id === id);
  },

  create(title = "Neues Dokument", projektId?: string): Dokument {
    const now = Date.now();
    const d: Dokument = {
      id: crypto.randomUUID(),
      title,
      projektId,
      tags: [],
      versions: [],
      updatedAt: now,
    };

    const all = load();
    all.unshift(d);
    save(all);
    return d;
  },

  upsert(doc: Dokument) {
    const all = load();
    const i = all.findIndex((x) => x.id === doc.id);

    const next: Dokument = {
      ...doc,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      versions: Array.isArray(doc.versions) ? doc.versions : [],
      updatedAt: Date.now(),
    };

    if (i >= 0) all[i] = next;
    else all.unshift(next);

    save(all);
  },

  remove(id: DocID) {
    save(load().filter((d) => d.id !== id));
  },

  async addVersion(id: DocID, file: File) {
    const dataURL = await fileToDataURL(file);

    const v: DocVersion = {
      id: crypto.randomUUID(),
      fileName: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      uploadedAt: Date.now(),
      dataURL,
    };

    const all = load();
    const i = all.findIndex((d) => d.id === id);
    if (i < 0) return;

    const current = all[i];
    all[i] = {
      ...current,
      versions: [v, ...(current.versions ?? [])],
      updatedAt: Date.now(),
    };

    save(all);
  },

  restoreVersion(id: DocID, versionId: DocID) {
    const all = load();
    const i = all.findIndex((d) => d.id === id);
    if (i < 0) return;

    const doc = all[i];
    const versions = doc.versions ?? [];
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;

    all[i] = {
      ...doc,
      versions: [v, ...versions.filter((x) => x.id !== versionId)],
      updatedAt: Date.now(),
    };

    save(all);
  },

  exportCSV(list: Dokument[]) {
    return toCSV(list);
  },

  importCSV(csv: string): number {
    const add = fromCSV(csv);
    const all = [...add, ...load()];
    save(all);
    return add.length;
  },

  exportJSON(): string {
    return JSON.stringify(load(), null, 2);
  },

  importJSON(json: string): number {
    try {
      const arr = JSON.parse(json) as Dokument[];
      if (!Array.isArray(arr)) return 0;

      const cleaned = arr.map((doc) => ({
        ...doc,
        id: doc.id || crypto.randomUUID(),
        title: doc.title || "Importiertes Dokument",
        tags: Array.isArray(doc.tags) ? doc.tags : [],
        versions: Array.isArray(doc.versions) ? doc.versions : [],
        updatedAt: typeof doc.updatedAt === "number" ? doc.updatedAt : Date.now(),
      })) as Dokument[];

      save(cleaned);
      return cleaned.length;
    } catch {
      return 0;
    }
  },
};

function splitCsvSemicolon(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ";" && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}

function unquoteCsv(value: string): string {
  return value.replace(/^"|"$/g, "").replace(/""/g, '"');
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    r.readAsDataURL(file);
  });
}





