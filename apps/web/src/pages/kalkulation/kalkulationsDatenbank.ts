import { API_BASE } from "../../lib/apiBase";

export type KalkulationsQuelle =
  | "manual"
  | "ki"
  | "rezept"
  | "lv"
  | "import"
  | "nachtrag"
  | "server";

export type RisikoStufe = "niedrig" | "mittel" | "hoch" | "kritisch";

export type RessourcenTyp =
  | "personal"
  | "maschine"
  | "material"
  | "fremdleistung"
  | "entsorgung"
  | "transport"
  | "sonstiges";

export type KalkulationsRessource = {
  id: string;
  typ: RessourcenTyp;
  bezeichnung: string;
  kurztext?: string;
  beschreibung?: string;
  einheit: string;
  menge: number;
  einzelpreis: number;
  gesamtpreis: number;
  leistungswert?: number;
  leistungsEinheit?: string;
  bemerkung?: string;
};

export type KalkulationsParameter = {
  gewerk?: string;
  leistungsart?: string;
  bauverfahren?: string;
  positionstyp?: string;
  bodenklasse?: string;
  grabentiefeM?: number;
  grabenbreiteM?: number;
  rohrDurchmesserMm?: number;
  schichtdickeCm?: number;
  menge?: number;
  einheit?: string;
  baustellenEntfernungKm?: number;
  fahrzeitMin?: number;
  transportNotwendig?: boolean;
  innerorts?: boolean;
  beengterArbeitsraum?: boolean;
  grundwasser?: boolean;
  verkehrssicherung?: boolean;
  handarbeit?: boolean;
  nachtarbeit?: boolean;
  erschwerteBedingungen?: boolean;
  personalbedarfStd?: number;
  maschinenstunden?: number;
  bauzeitTage?: number;
  leistungProTag?: number;
  wetterRisiko?: RisikoStufe;
  technischesRisiko?: RisikoStufe;
  preisRisiko?: RisikoStufe;
};

export type KalkulationsKosten = {
  material: number;
  lohn: number;
  maschinen: number;
  fremdleistung: number;
  entsorgung: number;
  transport: number;
  gemeinkosten: number;
  risiko: number;
  gewinn: number;
  epNetto: number;
  gpNetto: number;
};

export type KalkulationsErfahrung = {
  id: string;
  createdAt: string;
  updatedAt: string;
  quelle: KalkulationsQuelle;
  projektId?: string;
  projektCode?: string;
  projektName?: string;
  posNr: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  menge: number;
  parameter: KalkulationsParameter;
  ressourcen: KalkulationsRessource[];
  kosten: KalkulationsKosten;
  risiko: RisikoStufe;
  confidence: number;
  kiHinweis?: string;
  kalkulatorNotiz?: string;
  tags: string[];
  verwendungen: number;
  letzterEinsatz?: string;
};

export type KalkulationsSuchTreffer = {
  eintrag: KalkulationsErfahrung;
  score: number;
  gruende: string[];
};

const STORE_KEY = "rlc_kalkulations_datenbank_v1";
const API_PATH = "/api/kalkulation";

let __rlcKdbCache: KalkulationsErfahrung[] | null = null;
let __rlcKdbCacheRaw = "";

/* ================= BASIC HELPERS ================= */

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function getAuthToken(): string {
  try {
    const directKeys = [
      "token",
      "authToken",
      "accessToken",
      "rlc_token",
      "rlc_auth_token",
      "rlc_access_token",
      "rlc.auth.token",
    ];

    for (const key of directKeys) {
      const value = localStorage.getItem(key);
      if (value?.trim()) return value.trim();
    }

    const jsonKeys = [
      "auth",
      "user",
      "session",
      "rlc_auth",
      "rlc_session",
      "rlc.auth",
      "rlc.session",
    ];

    for (const key of jsonKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const token =
          parsed?.token ??
          parsed?.accessToken ??
          parsed?.authToken ??
          parsed?.jwt ??
          parsed?.data?.token ??
          parsed?.data?.accessToken ??
          parsed?.user?.token ??
          parsed?.user?.accessToken;

        if (typeof token === "string" && token.trim()) return token.trim();
      } catch {
        //
      }
    }
  } catch {
    //
  }

  return "";
}

function authJsonHeaders(): HeadersInit {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(path), {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.headers || {}),
      },
    });

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return null;
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) return null;

    return json as T;
  } catch {
    return null;
  }
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `kdb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function n(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value).trim();

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const parsed = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function norm(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokenize(value: unknown): string[] {
  return Array.from(
    new Set(
      norm(value)
        .split(/[^a-z0-9Ã¤Ã¶Ã¼ÃŸ.]+/i)
        .map((x) => x.trim())
        .filter((x) => x.length >= 2)
    )
  );
}

function normUnit(value: unknown): string {
  const u = norm(value).replace(/\s+/g, "");

  if (["m2", "m²", "qm", "m^2"].includes(u)) return "m²";
  if (["m3", "m³", "cbm", "m^3"].includes(u)) return "m³";
  if (["st", "stk", "stuck", "stück"].includes(u)) return "stk";
  if (["psch", "ps", "pausch", "pauschal"].includes(u)) return "psch";
  if (["lfm", "mtr", "meter"].includes(u)) return "m";
  if (["to", "tonne", "tonnen"].includes(u)) return "t";

  return u;
}

function classifyWork(value: unknown): string {
  const t = norm(value);

  if (t.includes("bauzaun")) return "bauzaun";
  if (t.includes("verkehrssicherung") || t.includes("baustellenmarkierung")) return "verkehrssicherung";
  if (t.includes("baustelleneinricht")) return "baustelleneinrichtung";
  if (t.includes("baustelle") && (t.includes("räumen") || t.includes("raeumen"))) return "baustelleraeumen";
  if (t.includes("fss") || t.includes("frostschutz")) return "fss";
  if (t.includes("granitbord") || t.includes("bordstein") || t.includes("bord")) return "bord";
  if (t.includes("kunststoffrohr") || t.includes("rohrleitung") || t.includes("leitung")) return "rohr";
  if (t.includes("speedpipe") || t.includes("mikroroh")) return "speedpipe";
  if (t.includes("aushub") || t.includes("boden") || t.includes("graben")) return "erdarbeit";
  if (t.includes("asphalt")) return "asphalt";
  if (t.includes("pflaster")) return "pflaster";
  if (t.includes("hoehenfestpunkt") || t.includes("höhenfestpunkt") || t.includes("vermessung")) return "vermessung";

  return "";
}

function priceUsable(value: unknown): boolean {
  const v = n(value);
  return v > 0 && v < 1000000;
}

function hasPositive(value: unknown): boolean {
  return n(value) > 0;
}

/* ================= KOSTEN / RESSOURCEN ================= */

function emptyKosten(): KalkulationsKosten {
  return {
    material: 0,
    lohn: 0,
    maschinen: 0,
    fremdleistung: 0,
    entsorgung: 0,
    transport: 0,
    gemeinkosten: 0,
    risiko: 0,
    gewinn: 0,
    epNetto: 0,
    gpNetto: 0,
  };
}

function calcResourceTotal(r: Partial<KalkulationsRessource>): number {
  return round2(n(r.menge) * n(r.einzelpreis));
}

function normalizeResource(
  r: Partial<KalkulationsRessource>
): KalkulationsRessource {
  return {
    id: String(r.id || safeId()),
    typ: r.typ || "sonstiges",
    bezeichnung: String(r.bezeichnung || ""),
    kurztext: String(r.kurztext || ""),
    beschreibung: String(r.beschreibung || ""),
    einheit: String(r.einheit || ""),
    menge: n(r.menge, 1),
    einzelpreis: n(r.einzelpreis),
    gesamtpreis: calcResourceTotal({
      ...r,
      menge: n(r.menge, 1),
    }),
    leistungswert:
      r.leistungswert === undefined ? undefined : n(r.leistungswert),
    leistungsEinheit: String(r.leistungsEinheit || ""),
    bemerkung: String(r.bemerkung || ""),
  };
}

function sumKostenOhneEp(k?: Partial<KalkulationsKosten>): number {
  return round2(
    n(k?.material) +
      n(k?.lohn) +
      n(k?.maschinen) +
      n(k?.fremdleistung) +
      n(k?.entsorgung) +
      n(k?.transport) +
      n(k?.gemeinkosten) +
      n(k?.risiko) +
      n(k?.gewinn)
  );
}

function unitPriceFromResources(resources: KalkulationsRessource[]): number {
  return round2(
    resources.reduce((sum, r) => {
      /*
       * Wichtig:
       * In der Urkalkulation ist "einzelpreis" der EP-Anteil pro Einheit.
       * Deshalb fÃ¼r den EP nicht gesamtpreis summieren, sonst wird bei Menge 108
       * aus 69,86 plÃ¶tzlich ca. 7.544 oder mehr.
       */
      return sum + n(r.einzelpreis);
    }, 0)
  );
}

function totalsFromUnitResources(
  resources: KalkulationsRessource[],
  menge: number
): KalkulationsKosten {
  const epParts = emptyKosten();
  const factor = Math.max(n(menge), 0);

  for (const r of resources) {
    const value = n(r.einzelpreis);

    if (r.typ === "material") epParts.material += value;
    else if (r.typ === "personal") epParts.lohn += value;
    else if (r.typ === "maschine") epParts.maschinen += value;
    else if (r.typ === "fremdleistung") epParts.fremdleistung += value;
    else if (r.typ === "entsorgung") epParts.entsorgung += value;
    else if (r.typ === "transport") epParts.transport += value;
    else epParts.gemeinkosten += value;
  }

  const epNetto = unitPriceFromResources(resources);
  const gpNetto = round2(epNetto * factor);

  return {
    material: round2(epParts.material * factor),
    lohn: round2(epParts.lohn * factor),
    maschinen: round2(epParts.maschinen * factor),
    fremdleistung: round2(epParts.fremdleistung * factor),
    entsorgung: round2(epParts.entsorgung * factor),
    transport: round2(epParts.transport * factor),
    gemeinkosten: round2(epParts.gemeinkosten * factor),
    risiko: round2(epParts.risiko * factor),
    gewinn: round2(epParts.gewinn * factor),
    epNetto,
    gpNetto,
  };
}

function buildKosten(
  resources: KalkulationsRessource[],
  menge: number,
  old?: Partial<KalkulationsKosten>
): KalkulationsKosten {
  const qty = Math.max(n(menge), 0);

  const oldEp = n(old?.epNetto);
  const oldGp = n(old?.gpNetto);
  const oldTotal = sumKostenOhneEp(old);

  const resourceEp = unitPriceFromResources(resources);
  const resourceTotals = totalsFromUnitResources(resources, qty);

  /*
   * Fix Hauptproblem:
   * Wenn Ressourcen vorhanden sind, kommt der richtige EP aus der Summe der
   * Einzelpreise der Ressourcen. Alte falsche Werte wie 814,27 bei Pflaster
   * werden Ã¼berschrieben, sobald sie deutlich vom Ressourcen-EP abweichen.
   */
  const epLooksWrong =
    resourceEp > 0 &&
    (oldEp <= 0 || oldEp > resourceEp * 1.75 || oldEp < resourceEp * 0.35);

  if (resourceEp > 0 && epLooksWrong) {
    return resourceTotals;
  }

  if (oldEp > 0) {
    return {
      material:
        n(old?.material) > 0
          ? round2(n(old?.material))
          : round2(resourceTotals.material),
      lohn:
        n(old?.lohn) > 0 ? round2(n(old?.lohn)) : round2(resourceTotals.lohn),
      maschinen:
        n(old?.maschinen) > 0
          ? round2(n(old?.maschinen))
          : round2(resourceTotals.maschinen),
      fremdleistung:
        n(old?.fremdleistung) > 0
          ? round2(n(old?.fremdleistung))
          : round2(resourceTotals.fremdleistung),
      entsorgung:
        n(old?.entsorgung) > 0
          ? round2(n(old?.entsorgung))
          : round2(resourceTotals.entsorgung),
      transport:
        n(old?.transport) > 0
          ? round2(n(old?.transport))
          : round2(resourceTotals.transport),
      gemeinkosten:
        n(old?.gemeinkosten) > 0
          ? round2(n(old?.gemeinkosten))
          : round2(resourceTotals.gemeinkosten),
      risiko: round2(n(old?.risiko)),
      gewinn: round2(n(old?.gewinn)),
      epNetto: round2(oldEp),
      gpNetto:
        oldGp > 0
          ? round2(oldGp)
          : qty > 0
          ? round2(oldEp * qty)
          : round2(oldTotal),
    };
  }

  if (oldGp > 0 && qty > 0) {
    return {
      ...resourceTotals,
      epNetto: round2(oldGp / qty),
      gpNetto: round2(oldGp),
    };
  }

  if (oldTotal > 0 && qty > 0) {
    return {
      material: round2(n(old?.material)),
      lohn: round2(n(old?.lohn)),
      maschinen: round2(n(old?.maschinen)),
      fremdleistung: round2(n(old?.fremdleistung)),
      entsorgung: round2(n(old?.entsorgung)),
      transport: round2(n(old?.transport)),
      gemeinkosten: round2(n(old?.gemeinkosten)),
      risiko: round2(n(old?.risiko)),
      gewinn: round2(n(old?.gewinn)),
      epNetto: round2(oldTotal / qty),
      gpNetto: round2(oldTotal),
    };
  }

  return resourceTotals;
}

function normalizeEntry(
  row: Partial<KalkulationsErfahrung>
): KalkulationsErfahrung {
  const now = new Date().toISOString();

  const ressourcen = Array.isArray(row.ressourcen)
    ? row.ressourcen.map(normalizeResource)
    : [];

  const menge = n(row.menge);

  const kosten = buildKosten(ressourcen, menge, row.kosten);

  return {
    id: String(row.id || safeId()),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
    quelle: row.quelle || "manual",
    projektId: String(row.projektId || ""),
    projektCode: String(row.projektCode || ""),
    projektName: String(row.projektName || ""),
    posNr: String(row.posNr || ""),
    kurztext: String(row.kurztext || ""),
    langtext: String(row.langtext || ""),
    einheit: String(row.einheit || ""),
    menge,
    parameter: {
      ...(row.parameter || {}),
      menge: n(row.parameter?.menge, menge),
      einheit: String(row.parameter?.einheit || row.einheit || ""),
    },
    ressourcen,
    kosten,
    risiko: row.risiko || "mittel",
    confidence: Math.max(0, Math.min(1, n(row.confidence, 0.75))),
    kiHinweis: String(row.kiHinweis || ""),
    kalkulatorNotiz: String(row.kalkulatorNotiz || ""),
    tags: Array.isArray(row.tags)
      ? Array.from(new Set(row.tags.map((x) => String(x).trim()).filter(Boolean)))
      : [],
    verwendungen: n(row.verwendungen),
    letzterEinsatz: row.letzterEinsatz ? String(row.letzterEinsatz) : undefined,
  };
}

/* ================= STORAGE ================= */

function readDb(): KalkulationsErfahrung[] {
  try {
    const raw = localStorage.getItem(STORE_KEY) || "[]";

    if (__rlcKdbCache && __rlcKdbCacheRaw === raw) {
      return __rlcKdbCache;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      __rlcKdbCache = [];
      __rlcKdbCacheRaw = raw;
      return [];
    }

    const normalized = dedupeDbRows(parsed);

    __rlcKdbCache = normalized;
    __rlcKdbCacheRaw = raw;

    return normalized;
  } catch {
    __rlcKdbCache = [];
    __rlcKdbCacheRaw = "";
    return [];
  }
}

function writeDb(rows: KalkulationsErfahrung[]) {
  const normalized = rows.map(normalizeEntry);
  const raw = JSON.stringify(normalized);

  __rlcKdbCache = normalized;
  __rlcKdbCacheRaw = raw;

  localStorage.setItem(STORE_KEY, raw);
}

function entryKey(row: Partial<KalkulationsErfahrung>): string {
  return dbIdentityKey(row);
}



function normBusinessKey(v: any): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function businessOverwriteKey(row: Partial<KalkulationsErfahrung>): string {
  const projekt = normBusinessKey(row.projektCode || row.projektId || "GLOBAL");
  const pos = normBusinessKey(row.posNr);
  const unit = normBusinessKey(row.einheit);

  if (projekt && pos && unit) {
    return `projekt-pos-unit|${projekt}|${pos}|${unit}`;
  }

  return entryKey(row);
}

function epOf(row: Partial<KalkulationsErfahrung>): number {
  const v = Number((row as any)?.kosten?.epNetto ?? 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function gpOf(row: Partial<KalkulationsErfahrung>): number {
  const v = Number((row as any)?.kosten?.gpNetto ?? 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function mergeWithPriceHistory(
  oldRow: KalkulationsErfahrung,
  nextRow: KalkulationsErfahrung
): KalkulationsErfahrung {
  const oldEp = epOf(oldRow);
  const newEp = epOf(nextRow);
  const oldGp = gpOf(oldRow);
  const newGp = gpOf(nextRow);

  const changed =
    oldEp !== newEp ||
    oldGp !== newGp ||
    String(oldRow.quelle || "") !== String(nextRow.quelle || "");

  const history = Array.isArray((oldRow as any).priceHistory)
    ? [...((oldRow as any).priceHistory as any[])]
    : [];

  if (changed) {
    history.unshift({
      at: new Date().toISOString(),
      oldEpNetto: oldEp,
      newEpNetto: newEp,
      oldGpNetto: oldGp,
      newGpNetto: newGp,
      quelle: String(nextRow.quelle || ""),
      projektCode: String(nextRow.projektCode || oldRow.projektCode || ""),
      note: "Automatische Überschreibung: gleicher Projektcode + PosNr + Einheit.",
    });
  }

  return normalizeEntry({
    ...oldRow,
    ...nextRow,
    id: oldRow.id,
    createdAt: oldRow.createdAt,
    verwendungen: Math.max(oldRow.verwendungen, nextRow.verwendungen),
    priceHistory: history.slice(0, 25),
    updatedAt: nextRow.updatedAt,
  } as any);
}
function dbIdentityKey(row: Partial<KalkulationsErfahrung>): string {
  const posNr = norm(row.posNr);
  if (posNr) return posNr;

  return [
    norm(row.kurztext),
    norm(row.einheit),
    norm(row.parameter?.gewerk),
    norm(row.parameter?.bauverfahren),
  ].join("|");
}

function dedupeDbRows(rows: Partial<KalkulationsErfahrung>[]): KalkulationsErfahrung[] {
  const map = new Map<string, KalkulationsErfahrung>();

  for (const raw of rows) {
    const row = normalizeEntry(raw);
    const key = dbIdentityKey(row);
    const old = map.get(key);

    if (!old) {
      map.set(key, row);
      continue;
    }

    const oldSource = String((old as any).quelle || "");
    const newSource = String((row as any).quelle || "");

    const newWins =
      newSource === "x84-company-baseline" ||
      (oldSource !== "x84-company-baseline" &&
        row.updatedAt.localeCompare(old.updatedAt) > 0);

    if (newWins) {
      map.set(key, {
        ...old,
        ...row,
        id: old.id || row.id,
        createdAt: old.createdAt || row.createdAt,
        verwendungen: Math.max(old.verwendungen || 0, row.verwendungen || 0),
      });
    }
  }

  return Array.from(map.values());
}

/* ================= SEARCH ================= */

function scoreEntry(
  entry: KalkulationsErfahrung,
  query: Partial<KalkulationsErfahrung>
): KalkulationsSuchTreffer {
  let score = 0;
  const gruende: string[] = [];

  const qText = `${query.posNr || ""} ${query.kurztext || ""} ${
    query.langtext || ""
  }`;
  const eText = `${entry.posNr} ${entry.kurztext} ${entry.langtext}`;

  const qTokens = tokenize(qText);
  const eTokens = new Set(tokenize(eText));
  const hits = qTokens.filter((t) => eTokens.has(t)).length;

  const qUnit = normUnit(query.einheit || query.parameter?.einheit || "");
  const eUnit = normUnit(entry.einheit || entry.parameter?.einheit || "");

  const qWork = classifyWork(qText);
  const eWork = classifyWork(eText);

  const qPrice = n((query as any)?.kosten?.epNetto);
  const ePrice = n(entry.kosten?.epNetto);

  if (qWork && eWork && qWork === eWork) {
    score += 38;
    gruende.push(`Leistungsart erkannt: ${qWork}`);
  }

  if (hits) {
    score += Math.min(30, hits * 6);
    gruende.push(`${hits} Text-Treffer`);
  }

  if (query.posNr && entry.posNr && norm(query.posNr) === norm(entry.posNr)) {
    score += 18;
    gruende.push("Positionsnummer identisch");
  }

  if (qUnit && eUnit && qUnit === eUnit) {
    score += 14;
    gruende.push("Einheit identisch");
  } else if (qUnit && eUnit && qUnit !== eUnit) {
    score -= 25;
    gruende.push("Einheit abweichend");
  }

  const qp = query.parameter || {};
  const ep = entry.parameter || {};

  if (qp.gewerk && ep.gewerk && norm(qp.gewerk) === norm(ep.gewerk)) {
    score += 8;
    gruende.push("Gewerk identisch");
  }

  if (
    qp.leistungsart &&
    ep.leistungsart &&
    norm(qp.leistungsart) === norm(ep.leistungsart)
  ) {
    score += 8;
    gruende.push("Leistungsart identisch");
  }

  if (
    qp.bauverfahren &&
    ep.bauverfahren &&
    norm(qp.bauverfahren) === norm(ep.bauverfahren)
  ) {
    score += 8;
    gruende.push("Bauverfahren identisch");
  }

  if (
    typeof qp.schichtdickeCm === "number" &&
    typeof ep.schichtdickeCm === "number"
  ) {
    const diff = Math.abs(qp.schichtdickeCm - ep.schichtdickeCm);
    if (diff <= 2) {
      score += 6;
      gruende.push("Schichtdicke ähnlich");
    }
  }

  if (
    typeof qp.grabentiefeM === "number" &&
    typeof ep.grabentiefeM === "number"
  ) {
    const diff = Math.abs(qp.grabentiefeM - ep.grabentiefeM);
    if (diff <= 0.25) {
      score += 6;
      gruende.push("Grabentiefe ähnlich");
    }
  }

  if (priceUsable(qPrice) && priceUsable(ePrice)) {
    const ratio = ePrice / qPrice;

    if (ratio >= 0.75 && ratio <= 1.35) {
      score += 12;
      gruende.push("Preisniveau ähnlich");
    } else if (ratio < 0.35 || ratio > 2.8) {
      score -= 18;
      gruende.push("Preisniveau stark abweichend");
    }
  }

  if (entry.verwendungen > 0) {
    score += Math.min(7, entry.verwendungen);
    gruende.push("mehrfach verwendet");
  }

  score += Math.round(entry.confidence * 8);

  if (qWork && eWork && qWork !== eWork) {
    score -= 35;
    gruende.push("andere Leistungsart");
  }

  return {
    eintrag: entry,
    score: Math.max(0, Math.min(100, score)),
    gruende,
  };
}

function localSearch(
  query: Partial<KalkulationsErfahrung>,
  limit = 10
): KalkulationsSuchTreffer[] {
  return readDb()
    .map((entry) => scoreEntry(entry, query))
    .filter((x) => x.score >= 45 && priceUsable(x.eintrag.kosten?.epNetto))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.eintrag.confidence !== a.eintrag.confidence) {
        return b.eintrag.confidence - a.eintrag.confidence;
      }
      return b.eintrag.verwendungen - a.eintrag.verwendungen;
    })
    .slice(0, limit);
}

/* ================= LOCAL / SERVER ================= */

function localUpsert(row: Partial<KalkulationsErfahrung>): KalkulationsErfahrung {
  const nextRow = normalizeEntry({
    ...row,
    updatedAt: new Date().toISOString(),
  });

  const rows = readDb();

  const idxById = rows.findIndex((x) => x.id === nextRow.id);
  const idxByBusiness = rows.findIndex(
    (x) => businessOverwriteKey(x) === businessOverwriteKey(nextRow)
  );
  const idxByKey = rows.findIndex((x) => entryKey(x) === entryKey(nextRow));
  const idx = idxById >= 0 ? idxById : idxByBusiness >= 0 ? idxByBusiness : idxByKey;

  if (idx >= 0) {
    const old = rows[idx];

    rows[idx] = mergeWithPriceHistory(old, nextRow);

    writeDb(rows);
    return rows[idx];
  }

  rows.unshift(nextRow);
  writeDb(rows);
  return nextRow;
}

async function serverBulkUpsert(
  items: Partial<KalkulationsErfahrung>[]
): Promise<boolean> {
  const clean = items.map(normalizeEntry);


  const json = await fetchJson<{ ok?: boolean }>(
    `${API_PATH}/datenbank/bulk-upsert`,
    {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({ items: clean }),
    }
  );

  return !!json?.ok;
}

function riskFromInput(riskLevel?: string): RisikoStufe {
  if (riskLevel === "critical" || riskLevel === "kritisch") return "kritisch";
  if (riskLevel === "high" || riskLevel === "hoch") return "hoch";
  if (riskLevel === "low" || riskLevel === "niedrig") return "niedrig";
  return "mittel";
}

/* ================= EXPORT API ================= */

export const KalkulationsDatenbank = {
  key: STORE_KEY,

  list(): KalkulationsErfahrung[] {
    return readDb().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  count(): number {
    return readDb().length;
  },

  async countServer(): Promise<number> {
    const json = await fetchJson<{ ok?: boolean; count?: number }>(
      `${API_PATH}/datenbank/count`,
      {
        method: "GET",
        headers: authJsonHeaders(),
      }
    );

    return typeof json?.count === "number" ? json.count : this.count();
  },

  async listServerPage(
    limit = 200,
    offset = 0
  ): Promise<{
    rows: KalkulationsErfahrung[];
    total: number;
    limit: number;
    offset: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const json = await fetchJson<{
      ok?: boolean;
      count?: number;
      total?: number;
      limit?: number;
      offset?: number;
      hasNext?: boolean;
      hasPrev?: boolean;
      rows?: Partial<KalkulationsErfahrung>[];
      items?: Partial<KalkulationsErfahrung>[];
      data?: Partial<KalkulationsErfahrung>[];
    }>(`${API_PATH}/datenbank?limit=${safeLimit}&offset=${safeOffset}`, {
      method: "GET",
      headers: authJsonHeaders(),
    });

    const raw = json?.rows || json?.items || json?.data || null;

    if (!Array.isArray(raw)) {
      const fallback = this.list().slice(0, safeLimit);
      return {
        rows: fallback,
        total: fallback.length,
        limit: safeLimit,
        offset: safeOffset,
        hasNext: false,
        hasPrev: safeOffset > 0,
      };
    }

    const clean = raw
      .map(normalizeEntry)
      .sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
      );

    try {
      writeDb(clean.slice(0, 200));
    } catch {
      // localStorage voll: Serverdaten trotzdem verwenden
    }

    const total = Number(json?.total ?? json?.count ?? clean.length);
    const responseOffset = Number(json?.offset ?? safeOffset);
    const responseLimit = Number(json?.limit ?? safeLimit);

    return {
      rows: clean,
      total,
      limit: responseLimit,
      offset: responseOffset,
      hasNext:
        typeof json?.hasNext === "boolean"
          ? json.hasNext
          : responseOffset + clean.length < total,
      hasPrev:
        typeof json?.hasPrev === "boolean" ? json.hasPrev : responseOffset > 0,
    };
  },

  async listServer(): Promise<KalkulationsErfahrung[]> {
    const page = await this.listServerPage(200, 0);
    return page.rows;
  },

  get(id: string): KalkulationsErfahrung | null {
    return readDb().find((x) => x.id === id) || null;
  },

  upsert(row: Partial<KalkulationsErfahrung>): KalkulationsErfahrung {
    const saved = localUpsert(row);

    void serverBulkUpsert([saved]).catch(() => {
      //
    });

    return saved;
  },

  bulkUpsert(items: Partial<KalkulationsErfahrung>[]): KalkulationsErfahrung[] {
    const saved = items.map((item) => localUpsert(item));

    void serverBulkUpsert(saved).catch(() => {
      //
    });

    return saved;
  },

  async bulkUpsertServer(
    items: Partial<KalkulationsErfahrung>[]
  ): Promise<KalkulationsErfahrung[]> {
    const saved = this.bulkUpsert(items);
    await serverBulkUpsert(saved);
    return saved;
  },

  remove(id: string) {
    writeDb(readDb().filter((x) => x.id !== id));

    void fetchJson(`${API_PATH}/datenbank/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authJsonHeaders(),
    }).catch(() => {
      //
    });
  },

  clear() {
    localStorage.removeItem(STORE_KEY);
  },

  search(
    query: Partial<KalkulationsErfahrung>,
    limit = 10
  ): KalkulationsSuchTreffer[] {
    return localSearch(query, limit);
  },

  async searchServer(
    query: Partial<KalkulationsErfahrung>,
    limit = 10
  ): Promise<KalkulationsSuchTreffer[]> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));

    if (query.posNr) params.set("posNr", query.posNr);
    if (query.kurztext) params.set("q", query.kurztext);
    if (query.einheit) params.set("einheit", query.einheit);
    if (query.parameter?.gewerk) params.set("gewerk", query.parameter.gewerk);
    if (query.parameter?.leistungsart) {
      params.set("leistungsart", query.parameter.leistungsart);
    }
    if (query.parameter?.bauverfahren) {
      params.set("bauverfahren", query.parameter.bauverfahren);
    }

    const json = await fetchJson<{
      ok?: boolean;
      rows?: any[];
      items?: any[];
      data?: any[];

    }>(`${API_PATH}/datenbank?${params.toString()}`, {
      method: "GET",
      headers: authJsonHeaders(),
    });

    const raw = json?.rows || json?.items || json?.data || null;

    if (!Array.isArray(raw)) {
      return localSearch(query, limit);
    }

    const entries = raw
      .map((x) => normalizeEntry(x.eintrag || x.entry || x))
      .map((entry) => scoreEntry(entry, query))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return entries.length ? entries : localSearch(query, limit);
  },

  markUsed(id: string) {
    const rows = readDb();
    const idx = rows.findIndex((x) => x.id === id);

    if (idx >= 0) {
      rows[idx] = normalizeEntry({
        ...rows[idx],
        verwendungen: rows[idx].verwendungen + 1,
        letzterEinsatz: new Date().toISOString(),
      });

      writeDb(rows);
    }

    void fetchJson(`${API_PATH}/datenbank/${encodeURIComponent(id)}/used`, {
      method: "POST",
      headers: authJsonHeaders(),
    }).catch(() => {
      //
    });
  },

  exportJson(): string {
    return JSON.stringify(readDb(), null, 2);
  },

  importJson(text: string): number {
    const parsed = JSON.parse(text || "[]");
    if (!Array.isArray(parsed)) return 0;

    const rows = parsed.map(normalizeEntry);
    writeDb(rows);

    void serverBulkUpsert(rows).catch(() => {
      //
    });

    return rows.length;
  },

  exportCsv(): string {
    const header = [
      "ID",
      "Projekt",
      "PosNr",
      "Kurztext",
      "Einheit",
      "Menge",
      "EP Netto",
      "GP Netto",
      "Material",
      "Lohn",
      "Maschinen",
      "Fremdleistung",
      "Entsorgung",
      "Transport",
      "Gemeinkosten",
      "Risiko",
      "Gewinn",
      "Gewerk",
      "Leistungsart",
      "Bauverfahren",
      "Bodenklasse",
      "Tiefe m",
      "Entfernung km",
      "Bauzeit Tage",
      "RisikoStufe",
      "Confidence",
      "Verwendungen",
      "KI Hinweis",
    ];

    const rows = readDb().map((r) =>
      [
        r.id,
        r.projektCode,
        r.posNr,
        r.kurztext,
        r.einheit,
        r.menge,
        r.kosten.epNetto,
        r.kosten.gpNetto,
        r.kosten.material,
        r.kosten.lohn,
        r.kosten.maschinen,
        r.kosten.fremdleistung,
        r.kosten.entsorgung,
        r.kosten.transport,
        r.kosten.gemeinkosten,
        r.kosten.risiko,
        r.kosten.gewinn,
        r.parameter.gewerk || "",
        r.parameter.leistungsart || "",
        r.parameter.bauverfahren || "",
        r.parameter.bodenklasse || "",
        r.parameter.grabentiefeM || "",
        r.parameter.baustellenEntfernungKm || "",
        r.parameter.bauzeitTage || "",
        r.risiko,
        r.confidence,
        r.verwendungen,
        r.kiHinweis || "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";")
    );

    return [header.join(";"), ...rows].join("\n");
  },

  fromCalculatedPosition(input: {
    quelle?: KalkulationsQuelle;
    projektId?: string;
    projektCode?: string;
    projektName?: string;
    posNr?: string;
    kurztext?: string;
    langtext?: string;
    einheit?: string;
    menge?: number;
    materialCost?: number;
    laborCost?: number;
    machineCost?: number;
    subcontractorCost?: number;
    disposalCost?: number;
    transportCost?: number;
    overheadCost?: number;
    riskCost?: number;
    profitCost?: number;
    finalUnitPrice?: number;
    totalNet?: number;
    gewerk?: string;
    leistungsart?: string;
    bauverfahren?: string;
    riskLevel?: string;
    confidence?: number;
    aiReason?: string;
    warning?: string;
  }): KalkulationsErfahrung {
    const menge = Math.max(n(input.menge), 0);
    const qty = Math.max(menge, 1);

    const materialCost = n(input.materialCost);
    const laborCost = n(input.laborCost);
    const machineCost = n(input.machineCost);
    const subcontractorCost = n(input.subcontractorCost);
    const disposalCost = n(input.disposalCost);
    const transportCost = n(input.transportCost);
    const overheadCost = n(input.overheadCost);
    const riskCost = n(input.riskCost);
    const profitCost = n(input.profitCost);

    const epFromParts = round2(
      materialCost +
        laborCost +
        machineCost +
        subcontractorCost +
        disposalCost +
        transportCost +
        overheadCost +
        riskCost +
        profitCost
    );

    const explicitEp = n(input.finalUnitPrice);
    const explicitGp = n(input.totalNet);

    const epNetto = round2(
      explicitEp > 0 ? explicitEp : epFromParts > 0 ? epFromParts : 0
    );

    const gpNetto = round2(
      explicitGp > 0 ? explicitGp : epNetto > 0 ? epNetto * qty : 0
    );

    /*
     * Wichtig:
     * Ressourcen werden als EP-Bestandteile gespeichert, also Menge = 1.
     * Die Gesamtmenge der LV-Position bleibt in entry.menge.
     */
    const resourceCandidates: Partial<KalkulationsRessource>[] = [
      {
        typ: "material",
        bezeichnung: "Material",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: materialCost,
      },
      {
        typ: "personal",
        bezeichnung: "Lohn / Personal",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: laborCost,
      },
      {
        typ: "maschine",
        bezeichnung: "Maschinen",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: machineCost,
      },
      {
        typ: "transport",
        bezeichnung: "LKW / Transport",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: transportCost,
      },
      {
        typ: "fremdleistung",
        bezeichnung: "Fremdleistung",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: subcontractorCost,
      },
      {
        typ: "entsorgung",
        bezeichnung: "Entsorgung",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: disposalCost,
      },
      {
        typ: "sonstiges",
        bezeichnung: "Gemeinkosten",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: overheadCost,
      },
      {
        typ: "sonstiges",
        bezeichnung: "Risiko",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: riskCost,
      },
      {
        typ: "sonstiges",
        bezeichnung: "Gewinn",
        einheit: input.einheit || "",
        menge: 1,
        einzelpreis: profitCost,
      },
    ];

    const ressourcen = resourceCandidates
      .filter((r) => hasPositive(r.einzelpreis))
      .map(normalizeResource);

    const kosten: KalkulationsKosten = {
      material: round2(materialCost * qty),
      lohn: round2(laborCost * qty),
      maschinen: round2(machineCost * qty),
      fremdleistung: round2(subcontractorCost * qty),
      entsorgung: round2(disposalCost * qty),
      transport: round2(transportCost * qty),
      gemeinkosten: round2(overheadCost * qty),
      risiko: round2(riskCost * qty),
      gewinn: round2(profitCost * qty),
      epNetto,
      gpNetto,
    };

    return normalizeEntry({
      quelle: input.quelle || "ki",
      projektId: input.projektId,
      projektCode: input.projektCode,
      projektName: input.projektName,
      posNr: input.posNr || "",
      kurztext: input.kurztext || "",
      langtext: input.langtext || "",
      einheit: input.einheit || "",
      menge,

      parameter: {
        gewerk: input.gewerk || "",
        leistungsart: input.leistungsart || "",
        bauverfahren: input.bauverfahren || "",
        menge,
        einheit: input.einheit || "",
      },

      ressourcen,
      kosten,
      risiko: riskFromInput(input.riskLevel),
      confidence: n(input.confidence, 0.75),

      kiHinweis: [input.aiReason || "", input.warning || ""]
        .filter(Boolean)
        .join("\n"),

      tags: [
        input.gewerk || "",
        input.leistungsart || "",
        input.bauverfahren || "",
        input.quelle || "",
      ].filter(Boolean),
    });
  },
};























