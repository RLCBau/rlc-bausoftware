// apps/web/src/pages/kalkulation/store.lv.ts

export type LVPos = {
  id: string;
  posNr: string;
  kurztext: string;
  einheit: string;
  menge: number;
  preis?: number;
  confidence?: number;
};

const KEY = "rlc_lv_data_v1";

/* =======================
   Helpers interni
======================= */
function toNumber(v: any): number | undefined {
  if (v == null || v === "") return undefined;
  // accetta 12,34 oppure 12.34
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeRow(r: LVPos): LVPos {
  return {
    ...r,
    posNr: r.posNr ?? "",
    kurztext: r.kurztext ?? "",
    einheit: r.einheit ?? "",
    menge: Number.isFinite(r.menge) ? r.menge : 0,
    preis: toNumber(r.preis),
    confidence: toNumber(r.confidence),
  };
}

/* =======================
   Store pubblico
======================= */
export const LV = {
  list(): LVPos[] {
    try {
      const raw = localStorage.getItem(KEY);
      const arr: LVPos[] = raw ? JSON.parse(raw) : [];
      // normalizza e (opzionale) ordina per posNr
      return arr.map(normalizeRow);
    } catch {
      return [];
    }
  },

  upsert(row: LVPos) {
    const all = LV.list();
    const idx = all.findIndex(r => r.id === row.id);
    const norm = normalizeRow(row);
    if (idx >= 0) all[idx] = norm;
    else all.unshift(norm);
    localStorage.setItem(KEY, JSON.stringify(all));
  },

  bulkUpsert(rows: LVPos[]) {
    const next = rows.map(normalizeRow);
    localStorage.setItem(KEY, JSON.stringify(next));
  },

  remove(id: string) {
    const all = LV.list().filter(r => r.id !== id);
    localStorage.setItem(KEY, JSON.stringify(all));
  },

  clear() {
    localStorage.removeItem(KEY);
  },

  /* ========= CSV =========
     Formato (separatore “;”):
     PosNr;Kurztext;Einheit;Menge;Preis;Confidence
  ======================== */
  exportCSV(rows: LVPos[]) {
    const header = ["PosNr","Kurztext","Einheit","Menge","Preis","Confidence"];
    const csv = [header.join(";")];

    for (const r of rows) {
      csv.push([
        r.posNr ?? "",
        JSON.stringify(r.kurztext ?? ""),  // mantiene i ; e le virgole nel testo
        r.einheit ?? "",
        r.menge ?? 0,
        r.preis ?? "",
        r.confidence ?? ""
      ].join(";"));
    }
    return csv.join("\n");
  },

  importCSV(text: string) {
    // accetta CRLF e LF
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return 0;
    // rimuovi header
    if (/posnr/i.test(lines[0])) lines.shift();

    const rows: LVPos[] = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      // split semplice sul “;” (il kurztext è JSON.stringify, quindi non contiene ;)
      const parts = l.split(";");
      if (parts.length < 4) continue;

      const posNr = parts[0] ?? "";
      const kurztext = (() => {
        const p = parts[1] ?? "";
        try { return JSON.parse(p); } catch { return p; }
      })();
      const einheit = parts[2] ?? "";
      const menge = toNumber(parts[3]) ?? 0;
      const preis = toNumber(parts[4]);
      const confidence = toNumber(parts[5]);

      rows.push({
        id: crypto.randomUUID(),
        posNr, kurztext, einheit, menge, preis, confidence
      });
    }

    LV.bulkUpsert(rows);
    return rows.length;
  },
};
// --- Aggiungi in fondo al file ---

export type CadPayload = {
  posNr?: string;
  kurztext?: string;
  einheit?: string;   // es. m, m², Stk
  menge?: number;     // quantità calcolata dal CAD
  preis?: number;     // opzionale
  confidence?: number;
};

export const LV_CAD = {
  addFromCad(p: CadPayload) {
    const row: LVPos = {
      id: crypto.randomUUID(),
      posNr: p.posNr ?? "",
      kurztext: p.kurztext ?? "",
      einheit: p.einheit ?? "m",
      menge: Number(p.menge ?? 0),
      preis: p.preis,
      confidence: p.confidence
    };
    const all = LV.list();
    all.unshift(row);
    localStorage.setItem(KEY, JSON.stringify(all));
    return row;
  },

  addManyFromCad(list: CadPayload[]) {
    const all = LV.list();
    for (const p of list) {
      all.unshift({
        id: crypto.randomUUID(),
        posNr: p.posNr ?? "",
        kurztext: p.kurztext ?? "",
        einheit: p.einheit ?? "m",
        menge: Number(p.menge ?? 0),
        preis: p.preis,
        confidence: p.confidence
      });
    }
    localStorage.setItem(KEY, JSON.stringify(all));
    return list.length;
  }
};

