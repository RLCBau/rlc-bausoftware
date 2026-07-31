import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type InternetSource = {
  id: string;
  category: "PRICE" | "NORM" | "MARKET" | "TECHNOLOGY";
  label: string;
  url: string;
  enabled: boolean;
  trust: "OFFICIAL" | "SPECIALIST";
  allowedDomains: string[];
  requiredTerms: string[];
};

type PriceHint = {
  raw: string;
  value: number | null;
  currency: string | null;
  unit: string | null;
};

export type MarketDirection = "UP" | "DOWN" | "STABLE" | "UNKNOWN";
export type MarketRegion = "DE" | "EU" | "GLOBAL";

export type MarketImpact = {
  materials: string[];
  trades: string[];
  direction: MarketDirection;
  estimatedChangeMinPct: number | null;
  estimatedChangeMaxPct: number | null;
  confidence: number;
  cause: string | null;
  region: MarketRegion;
  lvTerms: string[];
};

export type MarketTrendSnapshot = {
  material: string;
  direction: MarketDirection;
  averageChangePct: number | null;
  eventCount: number;
  confidence: number;
  lastPublishedAt: string;
  updatedAt: string;
};

export type InternetEvent = {
  id: string;
  sourceId: string;
  category: InternetSource["category"];
  label: string;
  title: string;
  link: string | null;
  publishedAt: string;
  detectedAt: string;
  contentHash: string;
  priceHints: PriceHint[];
  publisherDomain: string | null;
  country: "DE";
  ageDays: number;
  relevanceScore: number;
  trustScore: number;
  totalScore: number;
  verification: "UNVERIFIED";
  approvalRequired: true;
  priority: "A" | "B";
  matchedSignals: string[];
  marketImpact: MarketImpact;
};

export type InternetRejection = {
  id: string;
  sourceId: string;
  title: string;
  link: string | null;
  publisherDomain: string | null;
  publishedAt: string | null;
  rejectedAt: string;
  reason:
    | "MISSING_DATE"
    | "INVALID_DATE"
    | "FUTURE_DATE"
    | "TOO_OLD"
    | "DOMAIN_NOT_ALLOWED"
    | "COUNTRY_NOT_GERMANY"
    | "NOT_CONSTRUCTION_RELEVANT"
    | "SOURCE_TERMS_MISSING"
    | "SCORE_TOO_LOW";
  details?: string;
};

export type InternetStatus = {
  enabled: boolean;
  state: "idle" | "running" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  nextRunAt: string | null;
  sourcesChecked: number;
  entriesRead: number;
  newEvents: number;
  rejectedEntries: number;
  lastError: string | null;
  message: string;
};

const DATA_ROOT = process.env.RLC_AUTONOMOUS_DATA_ROOT || "/app/data/autonomous";
const SOURCES_FILE = path.join(DATA_ROOT, "market-sources.json");
const EVENTS_FILE = path.join(DATA_ROOT, "market-events.ndjson");
const REJECTIONS_FILE = path.join(DATA_ROOT, "market-rejections.ndjson");
const SEEN_FILE = path.join(DATA_ROOT, "market-seen.json");
const STATUS_FILE = path.join(DATA_ROOT, "market-status.json");
const REJECTION_SEEN_FILE = path.join(DATA_ROOT, "market-rejection-seen.json");
const TRENDS_FILE = path.join(DATA_ROOT, "market-trends.json");

const INTERVAL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.RLC_INTERNET_INTELLIGENCE_INTERVAL_MS || 6 * 60 * 60 * 1000),
);
const MAX_AGE_DAYS = Math.max(7, Number(process.env.RLC_MARKET_MAX_AGE_DAYS || 90));
const MAX_FUTURE_HOURS = Math.max(0, Number(process.env.RLC_MARKET_MAX_FUTURE_HOURS || 12));
const MIN_SCORE = Math.max(1, Number(process.env.RLC_MARKET_MIN_SCORE || 48));

function newsQuery(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${MAX_AGE_DAYS}d`)}&hl=de&gl=DE&ceid=DE:de`;
}

const DEFAULT_SOURCES: InternetSource[] = [
  {
    id: "destatis-baupreise",
    category: "PRICE",
    label: "Destatis Baupreise",
    url: newsQuery("site:destatis.de Baupreise Baupreisindex Tiefbau Straßenbau Deutschland"),
    enabled: true,
    trust: "OFFICIAL",
    allowedDomains: ["destatis.de"],
    requiredTerms: ["baupreis", "tiefbau", "straßenbau", "bauleistung"],
  },
  {
    id: "destatis-materialien",
    category: "PRICE",
    label: "Destatis Baumaterialien",
    url: newsQuery("site:destatis.de Baumaterialien Beton Zement Stahl Preis Deutschland"),
    enabled: true,
    trust: "OFFICIAL",
    allowedDomains: ["destatis.de"],
    requiredTerms: ["baumaterial", "beton", "zement", "stahl", "preis"],
  },
  {
    id: "asphalt-bitumen",
    category: "PRICE",
    label: "Asphalt und Bitumen",
    url: newsQuery("Asphaltpreis Bitumenpreis Asphaltmischgut Deutschland"),
    enabled: true,
    trust: "SPECIALIST",
    allowedDomains: ["asphalt.de", "bauindustrie.de", "eurobitume.eu", "this-magazin.de", "destatis.de"],
    requiredTerms: ["asphalt", "bitumen", "mischgut"],
  },
  {
    id: "diesel-energie",
    category: "PRICE",
    label: "Diesel und Energie",
    url: newsQuery("Dieselpreis Energiepreis Kraftstoffpreis Deutschland Bauwirtschaft"),
    enabled: true,
    trust: "SPECIALIST",
    allowedDomains: ["adac.de", "destatis.de", "bundesnetzagentur.de", "bdew.de", "bauindustrie.de"],
    requiredTerms: ["diesel", "energie", "kraftstoff"],
  },
  {
    id: "lohn-bau",
    category: "MARKET",
    label: "Tarif und Lohn Bauwirtschaft",
    url: newsQuery("Tariflohn Mindestlohn Tarifvertrag Bauwirtschaft Deutschland IG BAU"),
    enabled: true,
    trust: "OFFICIAL",
    allowedDomains: ["bauindustrie.de", "zdb.de", "igbau.de", "bundesregierung.de", "bmas.de"],
    requiredTerms: ["tarif", "lohn", "mindestlohn", "bauwirtschaft"],
  },
  {
    id: "din-vob-gaeb-reb",
    category: "NORM",
    label: "DIN VOB GAEB REB",
    url: newsQuery("DIN VOB GAEB REB Änderung Bauwesen Deutschland"),
    enabled: true,
    trust: "OFFICIAL",
    allowedDomains: ["din.de", "vob-online.de", "gaeb.de", "bvbs.de", "bauindustrie.de", "bund.de"],
    requiredTerms: ["din", "vob", "gaeb", "reb", "norm"],
  },
  {
    id: "bautechnologie",
    category: "TECHNOLOGY",
    label: "Bautechnologie Deutschland",
    url: newsQuery("Bautechnologie Digitalisierung Bau BIM Deutschland"),
    enabled: true,
    trust: "SPECIALIST",
    allowedDomains: ["bimdeutschland.de", "building-smart.de", "bauindustrie.de", "this-magazin.de"],
    requiredTerms: ["bim", "digital", "bautechnologie", "bau"],
  },
];

const GERMANY_TERMS = [
  "deutschland", "deutsch", "bundesweit", "bundesregierung", "bundesministerium",
  "bundesrat", "bundestag", "bundesland", "deutscher markt", "deutsche bauwirtschaft",
  "bayern", "baden-württemberg", "nordrhein-westfalen", "niedersachsen", "hessen",
  "sachsen", "thüringen", "brandenburg", "berlin", "hamburg", "bremen", "saarland",
  "rheinland-pfalz", "schleswig-holstein", "mecklenburg-vorpommern", "sachsen-anhalt",
];
const FOREIGN_TERMS = [
  "schweiz", "schweizer", "zürich", "bern", "basel", "genf", "österreich", "österreichisch",
  "wien", "tirol", "salzburg", "vorarlberg", "liechtenstein",
];
const HIGH_VALUE_TERMS = [
  "baupreis", "baupreisindex", "baumaterial", "baustoff", "materialpreis", "erzeugerpreisindex",
  "einfuhrpreis", "bitumen", "asphalt", "asphaltmischgut", "beton", "zement", "stahl",
  "dieselpreis", "energiepreis", "kraftstoffpreis", "tariflohn", "mindestlohn", "tarifvertrag",
  "ig bau", "vob", "gaeb", "reb", "din", "norm", "novelle", "preissteigerung", "kostenanstieg",
];
const CONSTRUCTION_TERMS = [
  "bau", "bauen", "bauwirtschaft", "bauindustrie", "tiefbau", "hochbau", "straßenbau", "kanalbau",
  "leitungsbau", "rohrleitung", "erdarbeiten", "galabau", "gebäudereinigung", "handwerk",
  "asphalt", "bitumen", "beton", "zement", "stahl", "baumaterial", "baustoff", "baumaschine",
  "vob", "gaeb", "reb", "din", "bim", "tarif", "lohn", "mindestlohn", "preisindex",
];
const PRICE_CHANGE_TERMS = [
  "preis", "preise", "kosten", "index", "anstieg", "gestiegen", "erhöhung", "teurer", "verteuert",
  "rückgang", "gesunken", "senkung", "lohn", "tarif", "mindestlohn", "zuschlag",
];
const EXCLUDED_SECTOR_TERMS = [
  "telekom", "telekommunikation", "mobilfunk", "smartphone", "internetvertrag", "glasfaser-tarif",
  "wohnung kaufen", "wohnung mieten", "hypothek", "reise", "tourismus", "fußball", "kryptowährung",
  "promi", "streaming", "gaming",
];
const TRUSTED_GERMAN_DOMAINS = [
  "destatis.de", "genesis.destatis.de", "bund.de", "bundesregierung.de", "bmas.de",
  "bundesnetzagentur.de", "din.de", "gaeb.de", "bvbs.de", "bimdeutschland.de", "igbau.de",
  "zdb.de", "bauindustrie.de", "baulinks.de", "bau.bi", "handwerk.com", "zdf.de", "zdfheute.de",
  "adac.de", "bdew.de", "this-magazin.de", "building-smart.de", "arbeitsrechte.de",
];

const MARKET_MATERIALS: Array<{
  material: string;
  terms: string[];
  trades: string[];
  lvTerms: string[];
}> = [
  { material: "Bitumen", terms: ["bitumen", "bitumenpreis"], trades: ["Straßenbau", "Asphaltbau"], lvTerms: ["Bitumen", "Asphalt", "Asphalttragschicht", "Asphaltbinder", "Asphaltdeckschicht", "AC 32", "AC 22", "AC 16", "SMA"] },
  { material: "Asphalt", terms: ["asphalt", "asphaltmischgut", "mischgut"], trades: ["Straßenbau", "Asphaltbau"], lvTerms: ["Asphalt", "Asphalttragschicht", "Asphaltbinder", "Asphaltdeckschicht", "AC 32", "AC 22", "AC 16", "SMA"] },
  { material: "Beton", terms: ["beton", "transportbeton", "fertigbeton"], trades: ["Betonbau", "Tiefbau", "Hochbau"], lvTerms: ["Beton", "Transportbeton", "Fundament", "Bodenplatte", "Stahlbeton"] },
  { material: "Zement", terms: ["zement", "klinker"], trades: ["Betonbau", "Mauerwerksbau"], lvTerms: ["Zement", "Beton", "Mörtel", "Estrich"] },
  { material: "Stahl", terms: ["stahl", "baustahl", "bewehrungsstahl", "stahlpreis"], trades: ["Stahlbau", "Betonbau"], lvTerms: ["Stahl", "Bewehrung", "Betonstahl", "Mattenbewehrung", "Profilstahl"] },
  { material: "Diesel", terms: ["diesel", "dieselpreis", "kraftstoff", "kraftstoffpreis"], trades: ["Baustellenlogistik", "Erdarbeiten", "Transport"], lvTerms: ["Diesel", "Bagger", "LKW", "Transport", "Baumaschine", "Erdarbeiten"] },
  { material: "Energie", terms: ["energie", "energiepreis", "strompreis", "gaspreis"], trades: ["Baustellenbetrieb", "Produktion"], lvTerms: ["Energie", "Strom", "Baustelleneinrichtung", "Heizung", "Trocknung"] },
  { material: "Holz", terms: ["holz", "bauholz", "schnittholz", "holzpreis"], trades: ["Holzbau", "Dachbau"], lvTerms: ["Holz", "Bauholz", "Schalung", "Dachstuhl", "Kantholz"] },
  { material: "Kupfer", terms: ["kupfer", "kupferpreis"], trades: ["Elektro", "Sanitär"], lvTerms: ["Kupfer", "Kupferrohr", "Kabel", "Leitung"] },
  { material: "Kunststoff", terms: ["kunststoff", "pvc", "pe-hd", "polyethylen"], trades: ["Kanalbau", "Leitungsbau"], lvTerms: ["PVC", "PE-HD", "Kunststoffrohr", "Rohrleitung", "Kanalrohr"] },
  { material: "Lohn", terms: ["lohn", "tariflohn", "mindestlohn", "tarifvertrag", "lohnerhöhung"], trades: ["Personal", "Bauwirtschaft"], lvTerms: ["Lohn", "Arbeitszeit", "Facharbeiter", "Polier", "Bauhelfer", "Kolonne"] },
];

const UP_TERMS = ["anstieg", "gestiegen", "erhöhung", "erhöht", "teurer", "verteuert", "zunahme", "mehr", "verdoppelt", "steigerung"];
const DOWN_TERMS = ["rückgang", "gesunken", "senkung", "günstiger", "verbilligt", "abnahme", "weniger"];
const STABLE_TERMS = ["stabil", "unverändert", "gleichbleibend", "seitwärts"];

function unique(values: string[]): string[] { return [...new Set(values)]; }

function extractPercentRange(text: string): { min: number | null; max: number | null } {
  const lower = text.toLocaleLowerCase("de-DE");
  if (lower.includes("verdoppelt") || lower.includes("doppelt so teuer")) return { min: 100, max: 100 };
  const values = [...text.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|prozent)/gi)]
    .map((match) => Number.parseFloat(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value <= 500);
  if (!values.length) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function detectCause(text: string): string | null {
  const lower = text.toLocaleLowerCase("de-DE");
  if (containsAny(lower, ["iran", "krieg", "konflikt", "sanktion"])) return "Geopolitik und Lieferketten";
  if (containsAny(lower, ["energie", "strom", "gas", "ölpreis", "rohöl"])) return "Energie- und Rohstoffkosten";
  if (containsAny(lower, ["tarif", "mindestlohn", "lohnerhöhung", "gewerkschaft"])) return "Tarif- und Lohnentwicklung";
  if (containsAny(lower, ["knappheit", "lieferengpass", "lieferkette", "verfügbarkeit"])) return "Materialknappheit oder Lieferengpass";
  if (containsAny(lower, ["nachfrage", "konjunktur", "produktion"])) return "Nachfrage- und Produktionsentwicklung";
  return null;
}

function analyzeMarketImpact(title: string, source: InternetSource, totalScore: number): MarketImpact {
  const lower = title.toLocaleLowerCase("de-DE");
  const matched = MARKET_MATERIALS.filter((profile) => profile.terms.some((term) => lower.includes(term)));
  const materials = unique(matched.map((profile) => profile.material));
  const trades = unique(matched.flatMap((profile) => profile.trades));
  const lvTerms = unique(matched.flatMap((profile) => profile.lvTerms));
  let direction: MarketDirection = "UNKNOWN";
  if (containsAny(lower, UP_TERMS)) direction = "UP";
  else if (containsAny(lower, DOWN_TERMS)) direction = "DOWN";
  else if (containsAny(lower, STABLE_TERMS)) direction = "STABLE";
  const range = extractPercentRange(title);
  const region: MarketRegion = containsAny(lower, ["europa", "eu-weit", "europäisch"]) ? "EU" : containsAny(lower, ["weltweit", "global", "international"]) ? "GLOBAL" : "DE";
  let confidence = Math.round(totalScore * 0.72);
  if (materials.length) confidence += 12;
  if (direction !== "UNKNOWN") confidence += 8;
  if (range.min !== null) confidence += 8;
  if (source.trust === "OFFICIAL") confidence += 5;
  confidence = Math.max(0, Math.min(100, confidence));
  return {
    materials: materials.length ? materials : source.category === "MARKET" && containsAny(lower, ["lohn", "tarif", "mindestlohn"]) ? ["Lohn"] : [],
    trades: trades.length ? trades : source.category === "MARKET" ? ["Bauwirtschaft"] : [],
    direction,
    estimatedChangeMinPct: range.min,
    estimatedChangeMaxPct: range.max,
    confidence,
    cause: detectCause(title),
    region,
    lvTerms,
  };
}

function buildTrendSnapshots(events: InternetEvent[], previous: MarketTrendSnapshot[]): MarketTrendSnapshot[] {
  const byMaterial = new Map<string, InternetEvent[]>();
  for (const event of events) {
    for (const material of event.marketImpact.materials) {
      const list = byMaterial.get(material) || [];
      list.push(event);
      byMaterial.set(material, list);
    }
  }
  const previousMap = new Map(previous.map((item) => [item.material, item]));
  const now = new Date().toISOString();
  for (const [material, materialEvents] of byMaterial) {
    const old = previousMap.get(material);
    const allChanges = materialEvents
      .map((event) => event.marketImpact.estimatedChangeMaxPct ?? event.marketImpact.estimatedChangeMinPct)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const signed = materialEvents.map((event) => event.marketImpact.direction === "DOWN" ? -1 : event.marketImpact.direction === "UP" ? 1 : 0);
    const directionScore = signed.reduce<number>((sum, value) => sum + value, 0);
    const direction: MarketDirection = directionScore > 0 ? "UP" : directionScore < 0 ? "DOWN" : materialEvents.some((event) => event.marketImpact.direction === "STABLE") ? "STABLE" : "UNKNOWN";
    const currentAverage = allChanges.length ? allChanges.reduce((sum, value) => sum + value, 0) / allChanges.length : null;
    const oldCount = old?.eventCount || 0;
    const newCount = materialEvents.length;
    const averageChangePct = currentAverage === null ? old?.averageChangePct ?? null : old?.averageChangePct === null || old?.averageChangePct === undefined ? Number(currentAverage.toFixed(2)) : Number((((old.averageChangePct * oldCount) + (currentAverage * newCount)) / (oldCount + newCount)).toFixed(2));
    previousMap.set(material, {
      material, direction, averageChangePct, eventCount: oldCount + newCount,
      confidence: Math.round(materialEvents.reduce((sum, event) => sum + event.marketImpact.confidence, 0) / newCount),
      lastPublishedAt: materialEvents.map((event) => event.publishedAt).sort().slice(-1)[0] || now, updatedAt: now,
    });
  }
  return [...previousMap.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
let status: InternetStatus = {
  enabled: true,
  state: "idle",
  startedAt: null,
  finishedAt: null,
  nextRunAt: null,
  sourcesChecked: 0,
  entriesRead: 0,
  newEvents: 0,
  rejectedEntries: 0,
  lastError: null,
  message: "Market Intelligence bereit.",
};
let timer: NodeJS.Timeout | null = null;
let running = false;

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}
function extractLink(block: string): string | null {
  const direct = extractTag(block, "link");
  if (direct) return direct;
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return atom ? decodeXml(atom[1]) : null;
}
function normalizeDomain(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return value.toLowerCase().replace(/^www\./, ""); }
}
function parseFeed(xml: string): Array<{ title: string; link: string | null; publishedAt: string | null; sourceDomain: string | null }> {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => {
    const sourceMatch = block.match(/<source[^>]+url=["']([^"']+)["']/i);
    const link = extractLink(block);
    return {
      title: extractTag(block, "title") || "",
      link,
      publishedAt: extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated"),
      sourceDomain: normalizeDomain(sourceMatch?.[1] || link),
    };
  }).filter((entry) => entry.title.length > 0).slice(0, 100);
}
function containsAny(text: string, terms: string[]): boolean {
  const value = text.toLocaleLowerCase("de-DE");
  return terms.some((term) => value.includes(term.toLocaleLowerCase("de-DE")));
}
function domainAllowed(domain: string | null, allowed: string[]): boolean {
  if (!domain) return false;
  const value = domain.toLowerCase().replace(/^www\./, "");
  return allowed.some((item) => value === item || value.endsWith(`.${item}`));
}
function parseAge(value: string): { ageDays: number | null; futureHours: number } {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return { ageDays: null, futureHours: 0 };
  const delta = Date.now() - time;
  return { ageDays: Math.floor(delta / 86400000), futureHours: Math.max(0, -delta / 3600000) };
}
function classifyEntry(title: string, source: InternetSource, domain: string | null): {
  accepted: boolean;
  priority: "A" | "B" | "C";
  relevance: number;
  trust: number;
  total: number;
  signals: string[];
  reason?: InternetRejection["reason"];
  details?: string;
} {
  const signals: string[] = [];
  const lower = title.toLocaleLowerCase("de-DE");
  const hasForeign = containsAny(title, FOREIGN_TERMS);
  const hasGermany = containsAny(title, GERMANY_TERMS);
  const sourceMatches = source.requiredTerms.filter((term) => lower.includes(term.toLocaleLowerCase("de-DE"))).length;
  const constructionMatches = CONSTRUCTION_TERMS.filter((term) => lower.includes(term)).length;
  const highValueMatches = HIGH_VALUE_TERMS.filter((term) => lower.includes(term)).length;
  const priceMatches = PRICE_CHANGE_TERMS.filter((term) => lower.includes(term)).length;
  const sourceDomain = domainAllowed(domain, source.allowedDomains);
  const trustedDomain = domainAllowed(domain, TRUSTED_GERMAN_DOMAINS);
  const excluded = containsAny(title, EXCLUDED_SECTOR_TERMS);

  if (excluded && constructionMatches === 0 && highValueMatches === 0) {
    return { accepted: false, priority: "C", relevance: 0, trust: 0, total: 0, signals, reason: "NOT_CONSTRUCTION_RELEVANT", details: "Ausgeschlossener Fremdsektor ohne Bausignal" };
  }
  if (hasForeign && !hasGermany && !trustedDomain) {
    return { accepted: false, priority: "C", relevance: 0, trust: 0, total: 0, signals, reason: "COUNTRY_NOT_GERMANY" };
  }

  let relevance = 0;
  relevance += Math.min(34, highValueMatches * 17);
  relevance += Math.min(28, constructionMatches * 8);
  relevance += Math.min(18, sourceMatches * 9);
  relevance += Math.min(12, priceMatches * 6);
  if (hasGermany) { relevance += 10; signals.push("GERMANY_CONTEXT"); }
  if (sourceDomain) { relevance += 8; signals.push("SOURCE_DOMAIN"); }
  if (trustedDomain) { relevance += 8; signals.push("TRUSTED_DOMAIN"); }
  if (highValueMatches) signals.push(`HIGH_VALUE:${highValueMatches}`);
  if (constructionMatches) signals.push(`CONSTRUCTION:${constructionMatches}`);
  if (sourceMatches) signals.push(`SOURCE_TERMS:${sourceMatches}`);
  if (priceMatches) signals.push(`PRICE_CHANGE:${priceMatches}`);
  relevance = Math.min(100, relevance);

  let trust = source.trust === "OFFICIAL" ? 88 : 68;
  if (sourceDomain) trust += 7;
  if (trustedDomain) trust += 10;
  trust = Math.min(100, trust);
  const total = Math.round(relevance * 0.72 + trust * 0.28);
  const priority: "A" | "B" | "C" = highValueMatches >= 1 && total >= 58 ? "A" : total >= MIN_SCORE ? "B" : "C";

  if (constructionMatches === 0 && highValueMatches === 0 && sourceMatches === 0) {
    return { accepted: false, priority: "C", relevance, trust, total, signals, reason: "NOT_CONSTRUCTION_RELEVANT", details: `score=${total}` };
  }
  if (total < MIN_SCORE) {
    return { accepted: false, priority: "C", relevance, trust, total, signals, reason: "SCORE_TOO_LOW", details: `score=${total}; signals=${signals.join(",")}` };
  }
  return { accepted: true, priority, relevance, trust, total, signals };
}
function extractPriceHints(text: string): PriceHint[] {
  const matches = text.match(/(?:€\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|EUR))(?:\s?\/\s?(?:t|kg|m2|m²|m3|m³|l|Stk\.?|h))?/gi) || [];
  return matches.slice(0, 10).map((raw) => {
    const numeric = raw.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const value = Number.parseFloat(numeric);
    const unit = raw.match(/\/\s?(t|kg|m2|m²|m3|m³|l|Stk\.?|h)/i)?.[1] || null;
    return { raw, value: Number.isFinite(value) ? value : null, currency: /€|EUR/i.test(raw) ? "EUR" : null, unit };
  });
}
async function ensureFiles(): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  try { await fs.access(SOURCES_FILE); } catch { await fs.writeFile(SOURCES_FILE, JSON.stringify(DEFAULT_SOURCES, null, 2), "utf8"); }
  try { await fs.access(SEEN_FILE); } catch { await fs.writeFile(SEEN_FILE, JSON.stringify({}, null, 2), "utf8"); }
  try { await fs.access(REJECTION_SEEN_FILE); } catch { await fs.writeFile(REJECTION_SEEN_FILE, JSON.stringify({}, null, 2), "utf8"); }
  try { await fs.access(TRENDS_FILE); } catch { await fs.writeFile(TRENDS_FILE, JSON.stringify([], null, 2), "utf8"); }
}
async function writeStatus(): Promise<void> { await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), "utf8"); }
async function loadSources(): Promise<InternetSource[]> {
  const parsed = JSON.parse(await fs.readFile(SOURCES_FILE, "utf8")) as InternetSource[];
  return parsed.filter((source) => source.enabled && /^https?:\/\//i.test(source.url));
}
async function loadSeen(): Promise<Record<string, string>> {
  try { return JSON.parse(await fs.readFile(SEEN_FILE, "utf8")) as Record<string, string>; } catch { return {}; }
}
async function loadRejectionSeen(): Promise<Record<string, string>> {
  try { return JSON.parse(await fs.readFile(REJECTION_SEEN_FILE, "utf8")) as Record<string, string>; } catch { return {}; }
}
async function loadTrends(): Promise<MarketTrendSnapshot[]> {
  try { return JSON.parse(await fs.readFile(TRENDS_FILE, "utf8")) as MarketTrendSnapshot[]; } catch { return []; }
}
async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: { "user-agent": "RLC-Bausoftware-Internet-Intelligence/4.0", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}
async function appendNdjson<T>(file: string, items: T[]): Promise<void> {
  if (items.length) await fs.appendFile(file, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
}
async function readNdjsonTail<T>(file: string, limit: number): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(limit, 500))).map((line) => JSON.parse(line) as T).reverse();
  } catch { return []; }
}

async function migrateLegacyEvents(sources: InternetSource[]): Promise<InternetEvent[]> {
  try {
    const raw = await fs.readFile(EVENTS_FILE, "utf8");
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    let changed = false;
    const events = raw.split(/\r?\n/).filter(Boolean).map((line) => {
      const event = JSON.parse(line) as InternetEvent & { marketImpact?: MarketImpact };
      if (!event.marketImpact) {
        const source = sourceMap.get(event.sourceId);
        if (source) {
          event.marketImpact = analyzeMarketImpact(event.title, source, event.totalScore);
          changed = true;
        }
      }
      return event as InternetEvent;
    });
    if (changed) {
      await fs.writeFile(EVENTS_FILE, events.length ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n` : "", "utf8");
      const trends = buildTrendSnapshots(events.filter((event) => event.marketImpact), []);
      await fs.writeFile(TRENDS_FILE, JSON.stringify(trends, null, 2), "utf8");
      console.log(`[autonomous-market] ${events.length} Bestandsereignisse auf V4 migriert.`);
    }
    return events;
  } catch { return []; }
}

export async function runInternetIntelligenceCycle(force = false): Promise<InternetStatus> {
  if (running) return status;
  await ensureFiles();
  if (!force && status.finishedAt && Date.now() - new Date(status.finishedAt).getTime() < INTERVAL_MS) return status;
  running = true;
  const started = new Date();
  status = { ...status, state: "running", startedAt: started.toISOString(), finishedAt: null, lastError: null, sourcesChecked: 0, entriesRead: 0, newEvents: 0, rejectedEntries: 0, message: "Internetquellen werden geprüft." };
  await writeStatus();

  try {
    const sources = await loadSources();
    await migrateLegacyEvents(sources);
    const seen = await loadSeen();
    const rejectionSeen = await loadRejectionSeen();
    const previousTrends = await loadTrends();
    const newEvents: InternetEvent[] = [];
    const rejections: InternetRejection[] = [];

    const reject = (sourceId: string, entry: ReturnType<typeof parseFeed>[number], reason: InternetRejection["reason"], details?: string) => {
      const id = createHash("sha256").update(`${sourceId}|${entry.link || entry.title}|${reason}`).digest("hex");
      if (rejectionSeen[id]) return;
      const rejectedAt = new Date().toISOString();
      rejectionSeen[id] = rejectedAt;
      rejections.push({
        id, sourceId, title: entry.title, link: entry.link, publisherDomain: entry.sourceDomain,
        publishedAt: entry.publishedAt, rejectedAt, reason, details,
      });
    };

    for (const source of sources) {
      try {
        const entries = parseFeed(await fetchText(source.url));
        status.sourcesChecked += 1;
        status.entriesRead += entries.length;
        for (const entry of entries) {
          if (!entry.publishedAt) { reject(source.id, entry, "MISSING_DATE"); continue; }
          const age = parseAge(entry.publishedAt);
          if (age.ageDays === null) { reject(source.id, entry, "INVALID_DATE"); continue; }
          if (age.futureHours > MAX_FUTURE_HOURS) { reject(source.id, entry, "FUTURE_DATE", `${age.futureHours.toFixed(1)}h`); continue; }
          if (age.ageDays > MAX_AGE_DAYS) { reject(source.id, entry, "TOO_OLD", `${age.ageDays}d`); continue; }
          const classification = classifyEntry(entry.title, source, entry.sourceDomain);
          if (!classification.accepted) {
            reject(source.id, entry, classification.reason || "SCORE_TOO_LOW", classification.details);
            continue;
          }

          const identity = `${source.id}|${entry.link || entry.title}`;
          const contentHash = createHash("sha256").update(identity).digest("hex");
          if (seen[contentHash]) continue;
          const detectedAt = new Date().toISOString();
          seen[contentHash] = detectedAt;
          newEvents.push({
            id: contentHash, sourceId: source.id, category: source.category, label: source.label,
            title: entry.title, link: entry.link, publishedAt: new Date(entry.publishedAt).toISOString(),
            detectedAt, contentHash, priceHints: extractPriceHints(entry.title), publisherDomain: entry.sourceDomain,
            country: "DE", ageDays: Math.max(0, age.ageDays), relevanceScore: classification.relevance,
            trustScore: classification.trust, totalScore: classification.total, verification: "UNVERIFIED", approvalRequired: true,
            priority: classification.priority === "C" ? "B" : classification.priority, matchedSignals: classification.signals,
            marketImpact: analyzeMarketImpact(entry.title, source, classification.total),
          });
        }
      } catch (error) {
        console.error(`[autonomous-market] Quelle ${source.id} fehlgeschlagen:`, error);
      }
    }

    await appendNdjson(EVENTS_FILE, newEvents);
    await appendNdjson(REJECTIONS_FILE, rejections);
    await fs.writeFile(SEEN_FILE, JSON.stringify(seen, null, 2), "utf8");
    await fs.writeFile(REJECTION_SEEN_FILE, JSON.stringify(rejectionSeen, null, 2), "utf8");
    if (newEvents.length) {
      const trends = buildTrendSnapshots(newEvents, previousTrends);
      await fs.writeFile(TRENDS_FILE, JSON.stringify(trends, null, 2), "utf8");
    }
    const finished = new Date();
    status = { ...status, state: "idle", finishedAt: finished.toISOString(), nextRunAt: new Date(finished.getTime() + INTERVAL_MS).toISOString(), newEvents: newEvents.length, rejectedEntries: rejections.length, lastError: null, message: `Market Intelligence abgeschlossen: ${status.sourcesChecked} Quellen, ${status.entriesRead} Einträge, ${newEvents.length} neue Hinweise, ${rejections.length} abgelehnt.` };
    console.log(`[autonomous-market] ${status.message}`);
  } catch (error) {
    const finished = new Date();
    status = { ...status, state: "error", finishedAt: finished.toISOString(), nextRunAt: new Date(finished.getTime() + INTERVAL_MS).toISOString(), lastError: error instanceof Error ? error.message : String(error), message: "Internet Intelligence fehlgeschlagen." };
    console.error("[autonomous-market]", error);
  } finally { running = false; await writeStatus(); }
  return status;
}

export function startInternetIntelligenceAgent(): void {
  if (timer) return;
  void runInternetIntelligenceCycle(false);
  timer = setInterval(() => { void runInternetIntelligenceCycle(true); }, INTERVAL_MS);
  timer.unref?.();
  console.log(`[autonomous-market] Agent aktiv, Intervall ${Math.round(INTERVAL_MS / 3_600_000)} Stunden.`);
}
export async function getInternetIntelligenceStatus(): Promise<InternetStatus> { await ensureFiles(); try { return JSON.parse(await fs.readFile(STATUS_FILE, "utf8")) as InternetStatus; } catch { return status; } }
export async function getInternetIntelligenceEvents(limit = 100): Promise<InternetEvent[]> { await ensureFiles(); return readNdjsonTail<InternetEvent>(EVENTS_FILE, limit); }
export async function getInternetIntelligenceRejections(limit = 100): Promise<InternetRejection[]> { await ensureFiles(); return readNdjsonTail<InternetRejection>(REJECTIONS_FILE, limit); }
export async function getInternetMarketTrends(): Promise<MarketTrendSnapshot[]> { await ensureFiles(); return loadTrends(); }
