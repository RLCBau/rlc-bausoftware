// apps/web/src/pages/kalkulation/store.lv.ts

export type PriceBreakdownGroup =
  | "Personal"
  | "Maschinen"
  | "LKW / Transport"
  | "Material"
  | "Entsorgung"
  | "Fremdleistung"
  | "Gemeinkosten"
  | "Risiko"
  | "Gewinn";

export type PriceBreakdownLine = {
  id: string;
  group: PriceBreakdownGroup;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  note?: string;
};

export type AuftragType = "haupt" | "unter";

export type Auftrag = {
  id: string;
  projectId?: string;
  name: string;
  type: AuftragType;
  parentId?: string;
  sortIndex?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type LVPos = {
  id: string;

  // Auftrag-Struktur
  auftragId?: string;
  auftragName?: string;
  auftragType?: AuftragType;

  // struttura posizione
  posNr: string;
  parentPosNr?: string;
  sortIndex?: number;

  // testi GAEB / AVA
  kurztext: string;
  langtext: string;
  bemerkung?: string;

  // quantità / unità
  einheit: string;
  menge: number;

  // prezzi
  preis?: number;
  gesamt?: number;
  waehrung?: string;

  // KI / Kalkulation / Urkalkulation
  materialCost?: number;
  laborCost?: number;
  machineCost?: number;
  subcontractorCost?: number;
  disposalCost?: number;
  overheadCost?: number;
  riskCost?: number;
  profitCost?: number;

  baseUnitPrice?: number;
  suggestedUnitPrice?: number;
  finalUnitPrice?: number;

  riskLevel?: "low" | "medium" | "high";
  calculationStatus?: "ok" | "warning" | "critical" | "manual";

  gewerk?: string;
  leistungsart?: string;
  bauverfahren?: string;

  warning?: string;
  aiReason?: string;

  priceBreakdown?: PriceBreakdownLine[];


  // RLC Preisbibliothek / Plausibilitätsrange
  rlcPreisMin?: number;
  rlcPreisAvg?: number;
  rlcPreisMax?: number;
  rlcPreisSource?: string;
  
  rlcPreisGroup?: string;// metadati
  confidence?: number;
  source?:
    | "manual"
    | "csv"
    | "cad"
    | "gaeb"
    | "json"
    | "ki"
    | "rezept"
    | "import"
    | "unknown";
  createdAt?: string;
  updatedAt?: string;

  meta?: any;
};

export type CadPayload = Partial<LVPos>;

const KEY = "rlc_lv_data_v1";

function currentLvProjectKey(): string {
  try {
    const keys = [
      "rlc_current_project",
      "rlc_selected_project",
      "selectedProject",
      "currentProject",
      "project",
      "rlc_project",
    ];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const p = JSON.parse(raw);
        const v =
          p?.code ||
          p?.projectCode ||
          p?.number ||
          p?.projektnummer ||
          p?.id ||
          p?.projectId;

        if (v) return String(v).trim();
      } catch {
        if (raw.trim()) return raw.trim();
      }
    }
  } catch {
    //
  }

  return "NO_PROJECT";
}

function isValidProjectKey(value: unknown): boolean {
  const v = String(value ?? "").trim().toUpperCase();
  return !!v && v !== "NO_PROJECT" && v !== "UNDEFINED" && v !== "NULL";
}

function lvStorageKey(): string | null {
  const projectKey = currentProjectStorageKey();
  if (!isValidProjectKey(projectKey)) return null;
  return `${KEY}:${projectKey}`;
}
const AUFTRAG_KEY = "rlc_kalkulation_auftraege_v1";
const PROJECT_KEY_STORAGE = "rlc_current_project_key_v1";

function currentProjectStorageKey(): string {
  try {
    const raw =
      localStorage.getItem(PROJECT_KEY_STORAGE) ||
      localStorage.getItem("rlc_current_project") ||
      localStorage.getItem("currentProject") ||
      "";

    if (!raw) return "NO_PROJECT";

    try {
      const parsed = JSON.parse(raw);
      return String(
        parsed?.code ||
          parsed?.number ||
          parsed?.projektnummer ||
          parsed?.id ||
          raw
      )
        .trim()
        .toUpperCase() || "NO_PROJECT";
    } catch {
      return String(raw).trim().toUpperCase() || "NO_PROJECT";
    }
  } catch {
    return "NO_PROJECT";
  }
}

function lvKey(): string {
  return `${KEY}:${currentProjectStorageKey()}`;
}

function auftragKey(): string | null {
  const projectKey = currentProjectStorageKey();
  if (!isValidProjectKey(projectKey)) return null;
  return `${AUFTRAG_KEY}:${projectKey}`;
}


/* =========================================
   interne Helper
========================================= */

function nowIso(): string {
  return new Date().toISOString();
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `lv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePosNr(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, ".")
    .replace(/,+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
}

function toNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;

  const raw = String(value).trim();
  if (!raw) return undefined;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = toNumber(value);
  return typeof n === "number" ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(value: unknown): string {
  const v = String(value ?? "").trim().toUpperCase();
  return v || "EUR";
}

function sanitizeAuftragType(value: unknown): AuftragType | undefined {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "haupt" || v === "unter") return v;
  return undefined;
}

function sanitizeSource(value: unknown): LVPos["source"] {
  const v = String(value ?? "").trim().toLowerCase();

  if (
    v === "manual" ||
    v === "csv" ||
    v === "cad" ||
    v === "gaeb" ||
    v === "json" ||
    v === "ki" ||
    v === "rezept" ||
    v === "import" ||
    v === "unknown"
  ) {
    return v;
  }

  return "unknown";
}

function sanitizeRiskLevel(value: unknown): LVPos["riskLevel"] {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return undefined;
}

function sanitizeCalcStatus(value: unknown): LVPos["calculationStatus"] {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "ok" || v === "warning" || v === "critical" || v === "manual") {
    return v;
  }
  return undefined;
}

function sanitizeBreakdownGroup(value: unknown): PriceBreakdownGroup {
  const v = String(value ?? "").trim();

  if (
    v === "Personal" ||
    v === "Maschinen" ||
    v === "LKW / Transport" ||
    v === "Material" ||
    v === "Entsorgung" ||
    v === "Fremdleistung" ||
    v === "Gemeinkosten" ||
    v === "Risiko" ||
    v === "Gewinn"
  ) {
    return v;
  }

  return "Material";
}

function normalizePriceBreakdownLine(
  line: Partial<PriceBreakdownLine>
): PriceBreakdownLine {
  const qty = toSafeNumber(line.qty, 1);
  const price = toSafeNumber(line.price, 0);
  const total =
    typeof toNumber(line.total) === "number"
      ? toSafeNumber(line.total, 0)
      : round2(qty * price);

  return {
    id: String(line.id || safeId()),
    group: sanitizeBreakdownGroup(line.group),
    name: normalizeText(line.name) || "Kostenansatz",
    unit: normalizeText(line.unit) || "EH",
    qty,
    price,
    total: round2(total),
    note: normalizeText(line.note),
  };
}

function normalizePriceBreakdown(value: unknown): PriceBreakdownLine[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((x) => normalizePriceBreakdownLine(x as Partial<PriceBreakdownLine>))
    .filter((x) => x.total > 0 || x.price > 0 || x.qty > 0);
}

function sumPriceBreakdown(lines?: PriceBreakdownLine[]): number {
  if (!Array.isArray(lines)) return 0;
  return round2(lines.reduce((sum, line) => sum + toSafeNumber(line.total), 0));
}

function computeGesamt(
  menge: number,
  preis?: number,
  gesamt?: number
): number | undefined {
  if (typeof gesamt === "number" && Number.isFinite(gesamt)) {
    return round2(gesamt);
  }

  if (typeof preis === "number" && Number.isFinite(preis)) {
    return round2(menge * preis);
  }

  return undefined;
}

function makeAuftrag(row: Partial<Auftrag>): Auftrag {
  const type = sanitizeAuftragType(row.type) ?? "unter";

  return {
    id: String(row.id || safeId()),
    projectId: normalizeText(row.projectId),
    name:
      normalizeText(row.name) ||
      (type === "haupt" ? "Hauptauftrag" : "Neuer Unterauftrag"),
    type,
    parentId: normalizeText(row.parentId),
    sortIndex: toNumber(row.sortIndex),
    createdAt: normalizeText(row.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function comparePosNr(a: string, b: string): number {
  return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
}

function sortAuftraege(rows: Auftrag[]): Auftrag[] {
  return [...rows].sort((a, b) => {
    const ai =
      typeof a.sortIndex === "number" ? a.sortIndex : Number.MAX_SAFE_INTEGER;
    const bi =
      typeof b.sortIndex === "number" ? b.sortIndex : Number.MAX_SAFE_INTEGER;

    if (a.type !== b.type) return a.type === "haupt" ? -1 : 1;
    if (ai !== bi) return ai - bi;

    return (a.name || "").localeCompare(b.name || "", "de", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function dedupeAuftraege(rows: Auftrag[]): Auftrag[] {
  const seen = new Set<string>();
  const out: Auftrag[] = [];

  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }

  return out;
}

function readAuftraege(): Auftrag[] {
  try {
    const key = auftragKey();
    if (!key) return [];

    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortAuftraege(dedupeAuftraege(parsed.map(makeAuftrag)));
  } catch {
    return [];
  }
}

function writeAuftraege(rows: Auftrag[]) {
  const key = auftragKey();
  if (!key) return;

  localStorage.setItem(
    key,
    JSON.stringify(sortAuftraege(dedupeAuftraege(rows)))
  );
}

function findAuftrag(id?: string): Auftrag | undefined {
  if (!id) return undefined;
  return readAuftraege().find((a) => a.id === id);
}

function makeRow(row: Partial<LVPos>): LVPos {
  const menge = toSafeNumber(row.menge, 0);
  const priceBreakdown = normalizePriceBreakdown(row.priceBreakdown);
  const breakdownEp = sumPriceBreakdown(priceBreakdown);

  const finalUnitPrice =
    toNumber(row.finalUnitPrice) ??
    toNumber(row.preis) ??
    toNumber(row.suggestedUnitPrice) ??
    toNumber(row.baseUnitPrice) ??
    (breakdownEp > 0 ? breakdownEp : undefined);

  const preis = toNumber(row.preis) ?? finalUnitPrice;
  const gesamt = computeGesamt(menge, preis, toNumber(row.gesamt));

  const linkedAuftrag = findAuftrag(row.auftragId);

  return {
    id: String(row.id || safeId()),

    auftragId: normalizeText(row.auftragId),
    auftragName: normalizeText(row.auftragName) || linkedAuftrag?.name || "",
    auftragType:
      sanitizeAuftragType(row.auftragType) ?? linkedAuftrag?.type ?? undefined,

    posNr: normalizePosNr(row.posNr),
    parentPosNr: normalizePosNr(row.parentPosNr),
    sortIndex: toNumber(row.sortIndex),

    kurztext: normalizeText(row.kurztext),
    langtext: normalizeText(row.langtext),
    bemerkung: normalizeText(row.bemerkung),

    einheit: normalizeText(row.einheit),
    menge,

    preis,
    gesamt,
    waehrung: normalizeCurrency(row.waehrung),

    materialCost: toNumber(row.materialCost),
    laborCost: toNumber(row.laborCost),
    machineCost: toNumber(row.machineCost),
    subcontractorCost: toNumber(row.subcontractorCost),
    disposalCost: toNumber(row.disposalCost),
    overheadCost: toNumber(row.overheadCost),
    riskCost: toNumber(row.riskCost),
    profitCost: toNumber(row.profitCost),

    baseUnitPrice: toNumber(row.baseUnitPrice),
    suggestedUnitPrice: toNumber(row.suggestedUnitPrice),
    finalUnitPrice,

    riskLevel: sanitizeRiskLevel(row.riskLevel),
    calculationStatus: sanitizeCalcStatus(row.calculationStatus),

    gewerk: normalizeText(row.gewerk),
    leistungsart: normalizeText(row.leistungsart),
    bauverfahren: normalizeText(row.bauverfahren),

    warning: normalizeText(row.warning),
    aiReason: normalizeText(row.aiReason),    priceBreakdown,

    rlcPreisMin: toNumber((row as any).rlcPreisMin),
    rlcPreisAvg: toNumber((row as any).rlcPreisAvg),
    rlcPreisMax: toNumber((row as any).rlcPreisMax),
    rlcPreisSource: normalizeText((row as any).rlcPreisSource),
    rlcPreisGroup: normalizeText((row as any).rlcPreisGroup),

    confidence: toNumber(row.confidence),
    source: sanitizeSource(row.source),
    createdAt: normalizeText(row.createdAt) || nowIso(),
    updatedAt: nowIso(),

    meta: row.meta,
  };
}

function parseStoredRow(input: any): LVPos {
  return makeRow({
    id: input?.id,

    auftragId: input?.auftragId,
    auftragName: input?.auftragName,
    auftragType: input?.auftragType,

    posNr: input?.posNr,
    parentPosNr: input?.parentPosNr,
    sortIndex: input?.sortIndex,

    kurztext: input?.kurztext,
    langtext: input?.langtext,
    bemerkung: input?.bemerkung,

    einheit: input?.einheit,
    menge: input?.menge,

    preis: input?.preis,
    gesamt: input?.gesamt,
    waehrung: input?.waehrung,

    materialCost: input?.materialCost,
    laborCost: input?.laborCost,
    machineCost: input?.machineCost,
    subcontractorCost: input?.subcontractorCost,
    disposalCost: input?.disposalCost,
    overheadCost: input?.overheadCost,
    riskCost: input?.riskCost,
    profitCost: input?.profitCost,

    baseUnitPrice: input?.baseUnitPrice,
    suggestedUnitPrice: input?.suggestedUnitPrice,
    finalUnitPrice: input?.finalUnitPrice,

    riskLevel: input?.riskLevel,
    calculationStatus: input?.calculationStatus,

    gewerk: input?.gewerk,
    leistungsart: input?.leistungsart,
    bauverfahren: input?.bauverfahren,

    warning: input?.warning,
    aiReason: input?.aiReason,    priceBreakdown: input?.priceBreakdown,

    rlcPreisMin: (input as any)?.rlcPreisMin,
    rlcPreisAvg: (input as any)?.rlcPreisAvg,
    rlcPreisMax: (input as any)?.rlcPreisMax,
    rlcPreisSource: (input as any)?.rlcPreisSource,
    rlcPreisGroup: (input as any)?.rlcPreisGroup,

    confidence: input?.confidence,
    source: input?.source,
    createdAt: input?.createdAt,
    updatedAt: input?.updatedAt,

    meta: input?.meta,
  });
}

function sortRows(rows: LVPos[]): LVPos[] {
  return [...rows].sort((a, b) => {
    const aa = a.auftragName || "";
    const ba = b.auftragName || "";
    if (aa !== ba) return aa.localeCompare(ba, "de", { sensitivity: "base" });

    const ai =
      typeof a.sortIndex === "number" ? a.sortIndex : Number.MAX_SAFE_INTEGER;
    const bi =
      typeof b.sortIndex === "number" ? b.sortIndex : Number.MAX_SAFE_INTEGER;

    if (ai !== bi) return ai - bi;

    const ap = a.posNr || "";
    const bp = b.posNr || "";
    if (ap !== bp) return comparePosNr(ap, bp);

    return (a.kurztext || "").localeCompare(b.kurztext || "", "de", {
      sensitivity: "base",
    });
  });
}

function dedupeById(rows: LVPos[]): LVPos[] {
  const seen = new Set<string>();
  const out: LVPos[] = [];

  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }

  return out;
}

function readAll(): LVPos[] {
  try {
    const key = lvStorageKey();
    if (!key) return [];

    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortRows(dedupeById(parsed.map(parseStoredRow)));
  } catch {
    return [];
  }
}

function writeAll(rows: LVPos[]) {
  const key = lvStorageKey();
  if (!key) return;

  const cleaned = sortRows(dedupeById(rows));
  const payload = JSON.stringify(cleaned);

  try {
    localStorage.setItem(key, payload);
  } catch (e) {
    const msg = String((e as any)?.name || (e as any)?.message || e);

    if (msg.includes("QuotaExceeded") || msg.includes("quota")) {
      try {
        const currentProjectKey = currentLvProjectKey();

        Object.keys(localStorage)
          .filter((k) =>
            k.startsWith(`${KEY}:`) &&
            currentProjectKey &&
            k !== `${KEY}:${currentProjectKey}`
          )
          .forEach((k) => localStorage.removeItem(k));

        localStorage.setItem(key, payload);
        console.warn("[LV] localStorage quota bereinigt, alte LV-Projekte entfernt.");
        return;
      } catch (retryError) {
        console.warn("[LV] localStorage voll. LV wird nur im Speicher/Server weitergeführt.", retryError);
        return;
      }
    }

    console.warn("[LV] writeAll localStorage failed:", e);
  }
}

function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (
    s.includes('"') ||
    s.includes(";") ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
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

function headerIndex(headers: string[], alternatives: string[]): number {
  return headers.findIndex((h) => alternatives.includes(h));
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value !== "string") return fallback;
    if (!value.trim()) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/* =========================================
   Auftrag Store
========================================= */

export const AuftragStore = {
  key: AUFTRAG_KEY,

  list(): Auftrag[] {
    return readAuftraege();
  },

  getById(id: string): Auftrag | null {
    return readAuftraege().find((r) => r.id === id) ?? null;
  },

  haupt(): Auftrag | null {
    return readAuftraege().find((r) => r.type === "haupt") ?? null;
  },

  unter(parentId?: string): Auftrag[] {
    return readAuftraege().filter((r) => {
      if (r.type !== "unter") return false;
      if (!parentId) return true;
      return r.parentId === parentId;
    });
  },

  ensureDefault(projectId?: string): Auftrag {
    const existing = this.haupt();
    if (existing) return existing;

    const haupt = makeAuftrag({
      projectId,
      name: "Hauptauftrag",
      type: "haupt",
      sortIndex: 0,
    });

    writeAuftraege([haupt, ...readAuftraege()]);
    return haupt;
  },

  upsert(row: Partial<Auftrag>): Auftrag {
    const all = readAuftraege();
    const next = makeAuftrag(row);
    const idx = all.findIndex((r) => r.id === next.id);

    if (idx >= 0) {
      next.createdAt = all[idx].createdAt || next.createdAt;
      all[idx] = next;
    } else {
      all.push(next);
    }

    writeAuftraege(all);
    return next;
  },

  createUnterauftrag(name: string, parentId?: string, projectId?: string): Auftrag {
    const haupt = parentId ? null : this.ensureDefault(projectId);

    return this.upsert({
      projectId,
      name,
      type: "unter",
      parentId: parentId || haupt?.id || "",
      sortIndex: readAuftraege().filter((x) => x.type === "unter").length + 1,
    });
  },

  remove(id: string) {
    const all = readAuftraege();
    const next = all.filter((r) => r.id !== id && r.parentId !== id);
    writeAuftraege(next);

    const lvRows = readAll().map((row) => {
      if (row.auftragId !== id) return row;
      return makeRow({
        ...row,
        auftragId: "",
        auftragName: "",
        auftragType: undefined,
      });
    });

    writeAll(lvRows);
  },

  clear() {
    const key = auftragKey();
    if (!key) return;

    localStorage.removeItem(key);
  },
};

/* =========================================
   Public Store
========================================= */

export const LV = {
  key: KEY,

  list(): LVPos[] {
    return readAll();
  },

  getById(id: string): LVPos | null {
    const row = readAll().find((r) => r.id === id);
    return row ?? null;
  },

  getByPosNr(posNr: string): LVPos | null {
    const key = normalizePosNr(posNr);
    if (!key) return null;
    return readAll().find((r) => normalizePosNr(r.posNr) === key) ?? null;
  },

  listByAuftrag(auftragId: string): LVPos[] {
    return readAll().filter((r) => r.auftragId === auftragId);
  },

  upsert(row: LVPos): LVPos {
    const all = readAll();
    const next = makeRow(row);
    const idx = all.findIndex((r) => r.id === next.id);

    if (idx >= 0) {
      next.createdAt = all[idx].createdAt || next.createdAt;
      all[idx] = next;
    } else {
      all.unshift(next);
    }

    writeAll(all);
    return next;
  },

  bulkUpsert(rows: LVPos[]): LVPos[] {
    const existing = readAll();
    const map = new Map(existing.map((r) => [r.id, r] as const));

    for (const row of rows) {
      const next = makeRow(row);
      const old = map.get(next.id);
      if (old?.createdAt) next.createdAt = old.createdAt;
      map.set(next.id, next);
    }

    const merged = Array.from(map.values());
    writeAll(merged);
    return sortRows(merged);
  },

  setAll(rows: LVPos[]): LVPos[] {
    const next = rows.map((r) => makeRow(r));
    writeAll(next);
    return sortRows(next);
  },

  assignAuftrag(rowIds: string[], auftragId: string): LVPos[] {
    const auftrag = AuftragStore.getById(auftragId);
    const ids = new Set(rowIds);

    const next = readAll().map((row) => {
      if (!ids.has(row.id)) return row;

      return makeRow({
        ...row,
        auftragId: auftrag?.id || "",
        auftragName: auftrag?.name || "",
        auftragType: auftrag?.type,
      });
    });

    writeAll(next);
    return sortRows(next);
  },

  remove(id: string) {
    const next = readAll().filter((r) => r.id !== id);
    writeAll(next);
  },

  clear() {
    const key = lvStorageKey();
    if (!key) return;

    localStorage.removeItem(key);
  },

  renumber(prefix = "01", start = 1, digits = 4): LVPos[] {
    const rows = readAll();
    const next = rows.map((row, idx) =>
      makeRow({
        ...row,
        posNr: `${prefix}.${String(start + idx).padStart(digits, "0")}`,
      })
    );

    writeAll(next);
    return next;
  },

  exportCSV(rows?: LVPos[]): string {
    const data = Array.isArray(rows) ? rows : readAll();

    const header = [
      "AuftragId",
      "AuftragName",
      "AuftragType",
      "PosNr",
      "ParentPosNr",
      "Kurztext",
      "Langtext",
      "Bemerkung",
      "Einheit",
      "Menge",
      "Preis",
      "Gesamt",
      "Waehrung",
      "Confidence",
      "Source",
      "SortIndex",
      "MaterialCost",
      "LaborCost",
      "MachineCost",
      "SubcontractorCost",
      "DisposalCost",
      "OverheadCost",
      "RiskCost",
      "ProfitCost",
      "BaseUnitPrice",
      "SuggestedUnitPrice",
      "FinalUnitPrice",
      "RiskLevel",
      "CalculationStatus",
      "Gewerk",
      "Leistungsart",
      "Bauverfahren",
      "Warning",
      "AiReason",
      "PriceBreakdownJson",
      "CreatedAt",
      "UpdatedAt",
    ];

    const lines = sortRows(data).map((row) =>
      [
        csvEscape(row.auftragId),
        csvEscape(row.auftragName),
        csvEscape(row.auftragType),
        csvEscape(row.posNr),
        csvEscape(row.parentPosNr),
        csvEscape(row.kurztext),
        csvEscape(row.langtext),
        csvEscape(row.bemerkung),
        csvEscape(row.einheit),
        csvEscape(row.menge ?? 0),
        csvEscape(row.preis ?? ""),
        csvEscape(row.gesamt ?? ""),
        csvEscape(row.waehrung ?? "EUR"),
        csvEscape(row.confidence ?? ""),
        csvEscape(row.source ?? "unknown"),
        csvEscape(row.sortIndex ?? ""),
        csvEscape(row.materialCost ?? ""),
        csvEscape(row.laborCost ?? ""),
        csvEscape(row.machineCost ?? ""),
        csvEscape(row.subcontractorCost ?? ""),
        csvEscape(row.disposalCost ?? ""),
        csvEscape(row.overheadCost ?? ""),
        csvEscape(row.riskCost ?? ""),
        csvEscape(row.profitCost ?? ""),
        csvEscape(row.baseUnitPrice ?? ""),
        csvEscape(row.suggestedUnitPrice ?? ""),
        csvEscape(row.finalUnitPrice ?? ""),
        csvEscape(row.riskLevel ?? ""),
        csvEscape(row.calculationStatus ?? ""),
        csvEscape(row.gewerk ?? ""),
        csvEscape(row.leistungsart ?? ""),
        csvEscape(row.bauverfahren ?? ""),
        csvEscape(row.warning ?? ""),
        csvEscape(row.aiReason ?? ""),
        csvEscape(JSON.stringify(row.priceBreakdown || [])),
        csvEscape(row.createdAt ?? ""),
        csvEscape(row.updatedAt ?? ""),
      ].join(";")
    );

    return [header.join(";"), ...lines].join("\n");
  },

  importCSV(text: string): number {
    const content = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!content) return 0;

    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return 0;

    const firstLine = parseCsvLine(lines[0]);
    const first = firstLine.map((x) => normalizeHeader(x));

    const hasHeader =
      first.includes("posnr") ||
      first.includes("position") ||
      first.includes("positionsnummer") ||
      first.includes("kurztext") ||
      first.includes("langtext") ||
      first.includes("einheit") ||
      first.includes("menge") ||
      first.includes("preis");

    const body = hasHeader ? lines.slice(1) : lines;

    let iAuftragId = -1;
    let iAuftragName = -1;
    let iAuftragType = -1;
    let iPos = 0;
    let iParent = -1;
    let iKurz = 1;
    let iLang = 2;
    let iBem = -1;
    let iEinheit = 3;
    let iMenge = 4;
    let iPreis = 5;
    let iGesamt = -1;
    let iWaehrung = -1;
    let iConfidence = 6;
    let iSource = -1;
    let iSortIndex = -1;

    let iMaterialCost = -1;
    let iLaborCost = -1;
    let iMachineCost = -1;
    let iSubcontractorCost = -1;
    let iDisposalCost = -1;
    let iOverheadCost = -1;
    let iRiskCost = -1;
    let iProfitCost = -1;
    let iBaseUnitPrice = -1;
    let iSuggestedUnitPrice = -1;
    let iFinalUnitPrice = -1;
    let iRiskLevel = -1;
    let iCalculationStatus = -1;
    let iGewerk = -1;
    let iLeistungsart = -1;
    let iBauverfahren = -1;
    let iWarning = -1;
    let iAiReason = -1;
    let iPriceBreakdownJson = -1;

    let iCreatedAt = -1;
    let iUpdatedAt = -1;

    if (hasHeader) {
      iAuftragId = headerIndex(first, ["auftragid"]);
      iAuftragName = headerIndex(first, ["auftragname", "auftrag"]);
      iAuftragType = headerIndex(first, ["auftragtype", "auftragstyp"]);
      iPos = headerIndex(first, ["posnr", "position", "pos", "positionsnummer"]);
      iParent = headerIndex(first, ["parentposnr", "parentposition", "parentpos"]);
      iKurz = headerIndex(first, ["kurztext", "kurz", "text", "bezeichnung"]);
      iLang = headerIndex(first, ["langtext", "beschreibung", "longtext"]);
      iBem = headerIndex(first, ["bemerkung", "notiz", "note"]);
      iEinheit = headerIndex(first, ["einheit", "me", "unit", "eh"]);
      iMenge = headerIndex(first, ["menge", "qty", "quantity"]);
      iPreis = headerIndex(first, ["preis", "ep", "einheitspreis", "einzelpreis"]);
      iGesamt = headerIndex(first, ["gesamt", "gesamtpreis", "total"]);
      iWaehrung = headerIndex(first, ["waehrung", "währung", "currency"]);
      iConfidence = headerIndex(first, ["confidence"]);
      iSource = headerIndex(first, ["source", "quelle"]);
      iSortIndex = headerIndex(first, ["sortindex", "sortierung", "sort"]);

      iMaterialCost = headerIndex(first, ["materialcost", "material"]);
      iLaborCost = headerIndex(first, ["laborcost", "lohn", "personalcost"]);
      iMachineCost = headerIndex(first, ["machinecost", "maschinen", "maschine"]);
      iSubcontractorCost = headerIndex(first, [
        "subcontractorcost",
        "fremdleistung",
      ]);
      iDisposalCost = headerIndex(first, ["disposalcost", "entsorgung"]);
      iOverheadCost = headerIndex(first, ["overheadcost", "gemeinkosten"]);
      iRiskCost = headerIndex(first, ["riskcost", "risiko"]);
      iProfitCost = headerIndex(first, ["profitcost", "gewinn"]);
      iBaseUnitPrice = headerIndex(first, ["baseunitprice", "basispreis"]);
      iSuggestedUnitPrice = headerIndex(first, [
        "suggestedunitprice",
        "vorgeschlagenerep",
      ]);
      iFinalUnitPrice = headerIndex(first, ["finalunitprice", "epfinal"]);
      iRiskLevel = headerIndex(first, ["risklevel", "risikostufe"]);
      iCalculationStatus = headerIndex(first, ["calculationstatus", "status"]);
      iGewerk = headerIndex(first, ["gewerk"]);
      iLeistungsart = headerIndex(first, ["leistungsart"]);
      iBauverfahren = headerIndex(first, ["bauverfahren"]);
      iWarning = headerIndex(first, ["warning", "warnung"]);
      iAiReason = headerIndex(first, ["aireason", "kibegruendung"]);
      iPriceBreakdownJson = headerIndex(first, [
        "pricebreakdownjson",
        "pricebreakdown",
        "preisaufbaujson",
      ]);

      iCreatedAt = headerIndex(first, ["createdat"]);
      iUpdatedAt = headerIndex(first, ["updatedat"]);
    }

    const rows: LVPos[] = body
      .map((line, idx) => {
        const parts = parseCsvLine(line);

        return makeRow({
          id: safeId(),
          auftragId: iAuftragId >= 0 ? parts[iAuftragId] ?? "" : "",
          auftragName: iAuftragName >= 0 ? parts[iAuftragName] ?? "" : "",
          auftragType:
            iAuftragType >= 0 ? (parts[iAuftragType] as AuftragType) : undefined,

          posNr: iPos >= 0 ? parts[iPos] ?? "" : parts[0] ?? "",
          parentPosNr: iParent >= 0 ? parts[iParent] ?? "" : "",
          kurztext: iKurz >= 0 ? parts[iKurz] ?? "" : parts[1] ?? "",
          langtext: iLang >= 0 ? parts[iLang] ?? "" : "",
          bemerkung: iBem >= 0 ? parts[iBem] ?? "" : "",
          einheit: iEinheit >= 0 ? parts[iEinheit] ?? "" : parts[3] ?? "",
          menge: toNumber(iMenge >= 0 ? parts[iMenge] : parts[4]) ?? 0,
          preis: toNumber(iPreis >= 0 ? parts[iPreis] : parts[5]),
          gesamt: toNumber(iGesamt >= 0 ? parts[iGesamt] : undefined),
          waehrung: iWaehrung >= 0 ? parts[iWaehrung] ?? "EUR" : "EUR",
          confidence: toNumber(iConfidence >= 0 ? parts[iConfidence] : parts[6]),
          source: sanitizeSource(iSource >= 0 ? parts[iSource] ?? "csv" : "csv"),
          sortIndex: toNumber(iSortIndex >= 0 ? parts[iSortIndex] : idx),

          materialCost:
            iMaterialCost >= 0 ? toNumber(parts[iMaterialCost]) : undefined,
          laborCost: iLaborCost >= 0 ? toNumber(parts[iLaborCost]) : undefined,
          machineCost:
            iMachineCost >= 0 ? toNumber(parts[iMachineCost]) : undefined,
          subcontractorCost:
            iSubcontractorCost >= 0
              ? toNumber(parts[iSubcontractorCost])
              : undefined,
          disposalCost:
            iDisposalCost >= 0 ? toNumber(parts[iDisposalCost]) : undefined,
          overheadCost:
            iOverheadCost >= 0 ? toNumber(parts[iOverheadCost]) : undefined,
          riskCost: iRiskCost >= 0 ? toNumber(parts[iRiskCost]) : undefined,
          profitCost: iProfitCost >= 0 ? toNumber(parts[iProfitCost]) : undefined,
          baseUnitPrice:
            iBaseUnitPrice >= 0 ? toNumber(parts[iBaseUnitPrice]) : undefined,
          suggestedUnitPrice:
            iSuggestedUnitPrice >= 0
              ? toNumber(parts[iSuggestedUnitPrice])
              : undefined,
          finalUnitPrice:
            iFinalUnitPrice >= 0 ? toNumber(parts[iFinalUnitPrice]) : undefined,

          riskLevel: iRiskLevel >= 0 ? (parts[iRiskLevel] as any) : undefined,
          calculationStatus:
            iCalculationStatus >= 0 ? (parts[iCalculationStatus] as any) : undefined,

          gewerk: iGewerk >= 0 ? parts[iGewerk] ?? "" : "",
          leistungsart: iLeistungsart >= 0 ? parts[iLeistungsart] ?? "" : "",
          bauverfahren: iBauverfahren >= 0 ? parts[iBauverfahren] ?? "" : "",

          warning: iWarning >= 0 ? parts[iWarning] ?? "" : "",
          aiReason: iAiReason >= 0 ? parts[iAiReason] ?? "" : "",

          priceBreakdown:
            iPriceBreakdownJson >= 0
              ? parseJsonField<PriceBreakdownLine[]>(
                  parts[iPriceBreakdownJson],
                  []
                )
              : [],

          createdAt: iCreatedAt >= 0 ? parts[iCreatedAt] ?? "" : nowIso(),
          updatedAt: iUpdatedAt >= 0 ? parts[iUpdatedAt] ?? "" : nowIso(),
        });
      })
      .filter((row) => {
        return (
          row.posNr.length > 0 ||
          row.kurztext.length > 0 ||
          row.langtext.length > 0 ||
          row.einheit.length > 0 ||
          row.menge !== 0 ||
          row.preis != null ||
          row.priceBreakdown?.length
        );
      });

    writeAll(rows);
    return rows.length;
  },
};

/* =========================================
   CAD Helper
========================================= */

export const LV_CAD = {
  addFromCad(payload: CadPayload): LVPos {
    const row = makeRow({
      id: safeId(),
      auftragId: payload.auftragId,
      auftragName: payload.auftragName,
      auftragType: payload.auftragType,

      posNr: payload.posNr ?? "",
      parentPosNr: payload.parentPosNr ?? "",
      kurztext: payload.kurztext ?? "",
      langtext: payload.langtext ?? "",
      bemerkung: payload.bemerkung ?? "",
      einheit: payload.einheit ?? "m",
      menge: payload.menge ?? 0,
      preis: payload.preis,
      gesamt: payload.gesamt,
      waehrung: payload.waehrung ?? "EUR",
      confidence: payload.confidence,
      source: payload.source ?? "cad",

      materialCost: payload.materialCost,
      laborCost: payload.laborCost,
      machineCost: payload.machineCost,
      subcontractorCost: payload.subcontractorCost,
      disposalCost: payload.disposalCost,
      overheadCost: payload.overheadCost,
      riskCost: payload.riskCost,
      profitCost: payload.profitCost,

      baseUnitPrice: payload.baseUnitPrice,
      suggestedUnitPrice: payload.suggestedUnitPrice,
      finalUnitPrice: payload.finalUnitPrice,

      riskLevel: payload.riskLevel,
      calculationStatus: payload.calculationStatus,

      gewerk: payload.gewerk,
      leistungsart: payload.leistungsart,
      bauverfahren: payload.bauverfahren,

      warning: payload.warning,
      aiReason: payload.aiReason,      priceBreakdown: payload.priceBreakdown,

      rlcPreisMin: (payload as any).rlcPreisMin,
      rlcPreisAvg: (payload as any).rlcPreisAvg,
      rlcPreisMax: (payload as any).rlcPreisMax,
      rlcPreisSource: (payload as any).rlcPreisSource,
      rlcPreisGroup: (payload as any).rlcPreisGroup,

      meta: payload.meta,
    });

    const all = readAll();
    all.unshift(row);
    writeAll(all);
    return row;
  },

  addManyFromCad(list: CadPayload[]): number {
    const existing = readAll();

    const mapped = list.map((payload) =>
      makeRow({
        id: safeId(),
        auftragId: payload.auftragId,
        auftragName: payload.auftragName,
        auftragType: payload.auftragType,

        posNr: payload.posNr ?? "",
        parentPosNr: payload.parentPosNr ?? "",
        kurztext: payload.kurztext ?? "",
        langtext: payload.langtext ?? "",
        bemerkung: payload.bemerkung ?? "",
        einheit: payload.einheit ?? "m",
        menge: payload.menge ?? 0,
        preis: payload.preis,
        gesamt: payload.gesamt,
        waehrung: payload.waehrung ?? "EUR",
        confidence: payload.confidence,
        source: payload.source ?? "cad",

        materialCost: payload.materialCost,
        laborCost: payload.laborCost,
        machineCost: payload.machineCost,
        subcontractorCost: payload.subcontractorCost,
        disposalCost: payload.disposalCost,
        overheadCost: payload.overheadCost,
        riskCost: payload.riskCost,
        profitCost: payload.profitCost,

        baseUnitPrice: payload.baseUnitPrice,
        suggestedUnitPrice: payload.suggestedUnitPrice,
        finalUnitPrice: payload.finalUnitPrice,

        riskLevel: payload.riskLevel,
        calculationStatus: payload.calculationStatus,

        gewerk: payload.gewerk,
        leistungsart: payload.leistungsart,
        bauverfahren: payload.bauverfahren,

        warning: payload.warning,
        aiReason: payload.aiReason,      priceBreakdown: payload.priceBreakdown,

      rlcPreisMin: (payload as any).rlcPreisMin,
      rlcPreisAvg: (payload as any).rlcPreisAvg,
      rlcPreisMax: (payload as any).rlcPreisMax,
      rlcPreisSource: (payload as any).rlcPreisSource,
      rlcPreisGroup: (payload as any).rlcPreisGroup,

      meta: payload.meta,
      })
    );

    writeAll([...mapped, ...existing]);
    return mapped.length;
  },
};








