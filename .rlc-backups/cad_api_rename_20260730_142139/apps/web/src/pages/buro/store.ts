import { Projekt, ID } from "./types";

const KEY = "rlc_buro_projekte_v1";

function read(): Projekt[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return demo();
    const arr = JSON.parse(raw) as Projekt[];
    return Array.isArray(arr) ? arr : demo();
  } catch { return demo(); }
}

function write(list: Projekt[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function demo(): Projekt[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      name: "TW-Leitung BA III – Musterstadt",
      baustellenNummer: "2025-0123",
      bauleiter: "M. Huber",
      ort: "Musterstadt",
      status: "aktiv",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Parkplatz Sanierung Süd",
      baustellenNummer: "2025-0042",
      bauleiter: "A. König",
      ort: "Bergdorf",
      status: "archiv",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export const ProjekteDB = {
  list(): Projekt[] { return read(); },
  get(id: ID): Projekt | undefined { return read().find(p => p.id === id); },
  upsert(p: Projekt) {
    const all = read();
    const i = all.findIndex(x => x.id === p.id);
    if (i >= 0) all[i] = { ...p, updatedAt: new Date().toISOString() };
    else all.unshift({ ...p, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    write(all);
    return p.id;
  },
  create(partial?: Partial<Projekt>): Projekt {
    const now = new Date().toISOString();
    const p: Projekt = {
      id: crypto.randomUUID(),
      name: partial?.name ?? "Neues Projekt",
      baustellenNummer: partial?.baustellenNummer ?? "",
      bauleiter: partial?.bauleiter ?? "",
      ort: partial?.ort ?? "",
      status: partial?.status ?? "aktiv",
      createdAt: now,
      updatedAt: now,
    };
    const all = read();
    all.unshift(p);
    write(all);
    return p;
  },
  remove(id: ID) {
    const all = read().filter(p => p.id !== id);
    write(all);
  },
  importCSV(csv: string) {
    const rows = csv.split(/\r?\n/).filter(Boolean).slice(1); // skip header
    const toAdd: Projekt[] = rows.map(line => {
      const cols = line.split(";").map(c => c.replace(/^"|"$/g, "").replace(/""/g, `"`));
      const [name, nr, ort, bauleiter, status] = cols;
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        name: name || "Importiertes Projekt",
        baustellenNummer: nr || "",
        ort: ort || "",
        bauleiter: bauleiter || "",
        status: (status as any) === "archiv" ? "archiv" : "aktiv",
        createdAt: now,
        updatedAt: now,
      };
    });
    const all = [...toAdd, ...read()];
    write(all);
    return toAdd.length;
  },
  exportCSV(list: Projekt[]) {
    const header = `\"Name\";\"BaustellenNr\";\"Ort\";\"Bauleiter\";\"Status\";\"Erstellt\";\"Geändert\"`;
    const lines = list.map(p =>
      [
        p.name, p.baustellenNummer ?? "", p.ort ?? "", p.bauleiter ?? "",
        p.status, p.createdAt, p.updatedAt,
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")
    );
    return [header, ...lines].join("\r\n");
  }
};
