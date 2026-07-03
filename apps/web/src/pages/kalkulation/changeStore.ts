// apps/web/src/pages/kalkulation/changeStore.ts

const KEY = "rlc_changes_v2";

export type ChangeStatus =
  | "Entwurf"
  | "Abgegeben"
  | "Beauftragt"
  | "Abgelehnt";

export type ChangeRow = {
  id: string;

  // LV Bezug
  posNr?: string;
  parentPosNr?: string;

  // Texte
  kurztext: string;
  langtext?: string;
  begruendung?: string;

  // Menge / Preis
  einheit?: string;
  mengeDelta: number;
  preis?: number;
  zeilenNetto?: number;

  // Workflow
  status?: ChangeStatus;

  // Server / Meta
  source?: "manual" | "regie" | "lv" | "ki" | "server" | "csv" | "unknown";
  serverId?: string;
  number?: string;
  createdAt?: string;
  updatedAt?: string;
};

type DB = Record<string, ChangeRow[]>;

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `chg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProjectId(projectId: unknown): string {
  const v = String(projectId ?? "").trim();
  return v || "_none_";
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): ChangeStatus {
  const v = cleanText(value);

  if (
    v === "Entwurf" ||
    v === "Abgegeben" ||
    v === "Beauftragt" ||
    v === "Abgelehnt"
  ) {
    return v;
  }

  return "Entwurf";
}

function normalizeSource(value: unknown): ChangeRow["source"] {
  const v = cleanText(value).toLowerCase();

  if (
    v === "manual" ||
    v === "regie" ||
    v === "lv" ||
    v === "ki" ||
    v === "server" ||
    v === "csv" ||
    v === "unknown"
  ) {
    return v;
  }

  return "unknown";
}

function calcLine(row: Pick<ChangeRow, "mengeDelta" | "preis">): number {
  return round2(toNumber(row.mengeDelta) * toNumber(row.preis));
}

function makeRow(input: Partial<ChangeRow> & { id?: string }): ChangeRow {
  const mengeDelta = toNumber(input.mengeDelta);
  const preis =
    input.preis === undefined || input.preis === null
      ? undefined
      : toNumber(input.preis);

  const createdAt = cleanText(input.createdAt) || nowIso();

  const row: ChangeRow = {
    id: cleanText(input.id) || uid(),

    posNr: cleanText(input.posNr),
    parentPosNr: cleanText(input.parentPosNr),

    kurztext: cleanText(input.kurztext),
    langtext: cleanText(input.langtext),
    begruendung: cleanText(input.begruendung),

    einheit: cleanText(input.einheit) || "m",
    mengeDelta,
    preis,
    zeilenNetto: calcLine({ mengeDelta, preis }),

    status: normalizeStatus(input.status),

    source: normalizeSource(input.source),
    serverId: cleanText(input.serverId),
    number: cleanText(input.number),
    createdAt,
    updatedAt: nowIso(),
  };

  return row;
}

function load(): DB {
  try {
    const rawV2 = localStorage.getItem(KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      return parsed && typeof parsed === "object" ? parsed : {};
    }

    // Legacy fallback: vecchia chiave
    const legacy = localStorage.getItem("rlc_changes_v1");
    if (legacy) {
      const parsed = JSON.parse(legacy);
      return parsed && typeof parsed === "object" ? parsed : {};
    }

    return {};
  } catch {
    return {};
  }
}

function save(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function sortRows(rows: ChangeRow[]): ChangeRow[] {
  return [...rows].sort((a, b) => {
    const au = cleanText(a.updatedAt || a.createdAt);
    const bu = cleanText(b.updatedAt || b.createdAt);

    if (au !== bu) return bu.localeCompare(au);

    return cleanText(a.posNr).localeCompare(cleanText(b.posNr), "de", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function dedupe(rows: ChangeRow[]): ChangeRow[] {
  const seen = new Set<string>();
  const out: ChangeRow[] = [];

  for (const row of rows) {
    const id = cleanText(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }

  return out;
}

function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");

  if (s.includes('"') || s.includes(";") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function idx(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(h));
}

export const Changes = {
  list(projectId: string): ChangeRow[] {
    const key = normalizeProjectId(projectId);
    const db = load();
    const rows = Array.isArray(db[key]) ? db[key] : [];

    return sortRows(dedupe(rows.map((r) => makeRow(r))));
  },

  get(projectId: string, id: string): ChangeRow | null {
    return Changes.list(projectId).find((r) => r.id === id) ?? null;
  },

  setAll(projectId: string, rows: ChangeRow[]): ChangeRow[] {
    const key = normalizeProjectId(projectId);
    const db = load();

    const next = sortRows(dedupe(rows.map((r) => makeRow(r))));
    db[key] = next;
    save(db);

    return next;
  },

  upsert(projectId: string, row: Partial<ChangeRow> & { id?: string }): ChangeRow {
    const key = normalizeProjectId(projectId);
    const db = load();
    const list = Array.isArray(db[key]) ? db[key].map((r) => makeRow(r)) : [];

    const next = makeRow(row);
    const i = list.findIndex((r) => r.id === next.id);

    if (i >= 0) {
      next.createdAt = list[i].createdAt || next.createdAt;
      list[i] = next;
    } else {
      list.unshift(next);
    }

    db[key] = sortRows(dedupe(list));
    save(db);

    return next;
  },

  bulkUpsert(projectId: string, rows: Array<Partial<ChangeRow> & { id?: string }>): ChangeRow[] {
    const key = normalizeProjectId(projectId);
    const db = load();

    const existing = Array.isArray(db[key]) ? db[key].map((r) => makeRow(r)) : [];
    const map = new Map(existing.map((r) => [r.id, r] as const));

    for (const item of rows) {
      const next = makeRow(item);
      const old = map.get(next.id);
      if (old?.createdAt) next.createdAt = old.createdAt;
      map.set(next.id, next);
    }

    const merged = sortRows(dedupe(Array.from(map.values())));
    db[key] = merged;
    save(db);

    return merged;
  },

  remove(projectId: string, id: string) {
    const key = normalizeProjectId(projectId);
    const db = load();

    db[key] = (Array.isArray(db[key]) ? db[key] : []).filter(
      (row) => row.id !== id
    );

    save(db);
  },

  clear(projectId: string) {
    const key = normalizeProjectId(projectId);
    const db = load();

    db[key] = [];
    save(db);
  },

  exportCSV(projectId: string): string {
    const rows = Changes.list(projectId);

    const header = [
      "PosNr",
      "ParentPosNr",
      "Kurztext",
      "Langtext",
      "Einheit",
      "DeltaMenge",
      "EP_Netto",
      "Zeilen_Netto",
      "Status",
      "Begruendung",
      "Source",
      "Number",
      "ServerId",
      "CreatedAt",
      "UpdatedAt",
    ];

    const body = rows.map((r) =>
      [
        csvEscape(r.posNr),
        csvEscape(r.parentPosNr),
        csvEscape(r.kurztext),
        csvEscape(r.langtext),
        csvEscape(r.einheit),
        csvEscape(r.mengeDelta),
        csvEscape(r.preis ?? ""),
        csvEscape(r.zeilenNetto ?? calcLine(r)),
        csvEscape(r.status ?? "Entwurf"),
        csvEscape(r.begruendung),
        csvEscape(r.source ?? "unknown"),
        csvEscape(r.number),
        csvEscape(r.serverId),
        csvEscape(r.createdAt),
        csvEscape(r.updatedAt),
      ].join(";")
    );

    return [header.join(";"), ...body].join("\n");
  },

  importCSV(projectId: string, text: string): number {
    const content = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!content) return 0;

    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return 0;

    const first = parseCsvLine(lines[0]).map(normalizeHeader);

    const hasHeader =
      first.includes("posnr") ||
      first.includes("kurztext") ||
      first.includes("deltamenge") ||
      first.includes("epnetto") ||
      first.includes("status");

    const body = hasHeader ? lines.slice(1) : lines;

    let iPos = 0;
    let iParent = -1;
    let iKurz = 1;
    let iLang = -1;
    let iEinheit = 2;
    let iMenge = 3;
    let iPreis = 4;
    let iStatus = 5;
    let iBegruendung = 6;
    let iSource = -1;
    let iNumber = -1;
    let iServerId = -1;

    if (hasHeader) {
      iPos = idx(first, ["posnr", "position", "positionsnummer", "pos"]);
      iParent = idx(first, ["parentposnr", "parentposition"]);
      iKurz = idx(first, ["kurztext", "text", "bezeichnung"]);
      iLang = idx(first, ["langtext", "beschreibung"]);
      iEinheit = idx(first, ["einheit", "me", "unit"]);
      iMenge = idx(first, ["deltamenge", "mengendelta", "menge", "qty"]);
      iPreis = idx(first, ["epnetto", "ep", "preis", "einheitspreis"]);
      iStatus = idx(first, ["status"]);
      iBegruendung = idx(first, ["begruendung", "begründung", "grund", "note"]);
      iSource = idx(first, ["source", "quelle"]);
      iNumber = idx(first, ["number", "nachtragsnummer", "nummer"]);
      iServerId = idx(first, ["serverid"]);
    }

    const rows = body
      .map((line) => {
        const p = parseCsvLine(line);

        return makeRow({
          id: uid(),
          posNr: iPos >= 0 ? p[iPos] : p[0],
          parentPosNr: iParent >= 0 ? p[iParent] : "",
          kurztext: iKurz >= 0 ? p[iKurz] : p[1],
          langtext: iLang >= 0 ? p[iLang] : "",
          einheit: iEinheit >= 0 ? p[iEinheit] : p[2],
          mengeDelta: toNumber(iMenge >= 0 ? p[iMenge] : p[3]),
          preis:
            iPreis >= 0 && p[iPreis] !== ""
              ? toNumber(p[iPreis])
              : undefined,
          status: iStatus >= 0 ? (p[iStatus] as ChangeStatus) : "Entwurf",
          begruendung: iBegruendung >= 0 ? p[iBegruendung] : p[6],
          source: iSource >= 0 ? normalizeSource(p[iSource]) : "csv",
          number: iNumber >= 0 ? p[iNumber] : "",
          serverId: iServerId >= 0 ? p[iServerId] : "",
        });
      })
      .filter(
        (r) =>
          r.posNr ||
          r.kurztext ||
          r.langtext ||
          r.begruendung ||
          r.mengeDelta !== 0 ||
          r.preis != null
      );

    Changes.setAll(projectId, rows);
    return rows.length;
  },

  totals(projectId: string, mwst: number) {
    const rows = Changes.list(projectId);
    const netto = round2(
      rows.reduce((s, r) => s + calcLine(r), 0)
    );
    const steuer = round2(netto * (toNumber(mwst) / 100));
    const brutto = round2(netto + steuer);

    return { netto, steuer, brutto, mwst: toNumber(mwst) };
  },
};