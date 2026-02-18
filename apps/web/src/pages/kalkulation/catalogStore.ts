// Catalogo master (≈11.700 pos.) con salvataggio a chunk per non sforare localStorage
export type CatalogPos = {
  id: string;         // uuid
  posNr: string;
  kurztext: string;
  einheit: string;
  ep: number;         // prezzo (netto)
  gruppe?: string;    // Material/Arbeiter/Maschinen o altro tag
};

const KEY = "rlc_catalog_v1";
const CHUNK = 500_000; // 500KB per chunk

const UID = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

function saveChunks(json: string) {
  // pulisci vecchi
  Object.keys(localStorage).forEach(k => { if (k.startsWith(KEY + "_")) localStorage.removeItem(k); });
  localStorage.setItem(KEY + "_n", String(Math.ceil(json.length / CHUNK)));
  for (let i = 0, j = 0; i < json.length; i += CHUNK, j++) {
    localStorage.setItem(`${KEY}_${j}`, json.slice(i, i + CHUNK));
  }
}

function loadChunks(): string | null {
  const n = Number(localStorage.getItem(KEY + "_n") || 0);
  if (!n) return null;
  let s = "";
  for (let i = 0; i < n; i++) s += localStorage.getItem(`${KEY}_${i}`) || "";
  return s;
}

function toNumber(v: any): number {
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export const Catalog = {
  list(): CatalogPos[] {
    try {
      const raw = loadChunks();
      const arr: CatalogPos[] = raw ? JSON.parse(raw) : [];
      return arr.map(r => ({
        id: r.id || UID(),
        posNr: r.posNr ?? "",
        kurztext: r.kurztext ?? "",
        einheit: r.einheit ?? "",
        ep: toNumber(r.ep),
        gruppe: r.gruppe ?? ""
      }));
    } catch { return []; }
  },

  count(): number {
    const raw = loadChunks();
    if (!raw) return 0;
    try { return JSON.parse(raw).length; } catch { return 0; }
  },

  clear() {
    Object.keys(localStorage).forEach(k => { if (k.startsWith(KEY)) localStorage.removeItem(k); });
  },

  importCSV(text: string): number {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return 0;
    if (/posnr/i.test(lines[0])) lines.shift();

    const rows: CatalogPos[] = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      // CSV: PosNr;Kurztext;Einheit;EP;Gruppe
      const p = l.split(";");
      const posNr = p[0] ?? "";
      const kurztext = (() => { const s = p[1] ?? ""; try { return JSON.parse(s); } catch { return s; }})();
      const einheit = p[2] ?? "";
      const ep = toNumber(p[3]);
      const gruppe = p[4] ?? "";
      rows.push({ id: UID(), posNr, kurztext, einheit, ep, gruppe });
    }
    saveChunks(JSON.stringify(rows));
    return rows.length;
  },

  exportCSV(rows?: CatalogPos[]): string {
    const arr = rows ?? Catalog.list();
    const head = "PosNr;Kurztext;Einheit;EP;Gruppe";
    const body = arr.map(r => [
      r.posNr,
      JSON.stringify(r.kurztext || ""),
      r.einheit || "",
      r.ep ?? 0,
      r.gruppe || ""
    ].join(";")).join("\n");
    return head + "\n" + body;
  }
};
