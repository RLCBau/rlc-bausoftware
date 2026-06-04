import { Router } from "express";
import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import { rlcPreisRangeForText, findRlcPreisItems } from "../kalkulation/rlcPreisBibliothek";
import { calcRecipeKalkulationRow } from "../kalkulation/kalkulationsRecipeEngine";

const router = Router();

type RiskLevel = "low" | "medium" | "high";
type CalcStatus = "ok" | "warning" | "critical" | "manual";

type InputRow = {
  id?: string;
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
  preis?: number;
};

type PriceBreakdownGroup =
  | "Personal"
  | "Maschinen"
  | "LKW / Transport"
  | "Material"
  | "Entsorgung"
  | "Fremdleistung"
  | "Gemeinkosten"
  | "Risiko"
  | "Gewinn";

type PriceBreakdownLine = {
  id: string;
  group: PriceBreakdownGroup;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  note: string;
};

type DbMatch = {
  row: any;
  score: number;
  reasons: string[];
};

type CalcSource = "database" | "recipe" | "technical-parser" | "openai" | "rule-engine";

function qualityGateStatusOf(db: any): string {
  return s((db?.parameters as any)?.qualityGateStatus);
}

function isDbEntryBlockedByQualityGate(db: any): boolean {
  const status = qualityGateStatusOf(db);
  return status === "Gesperrt" || status === "Nicht verwenden";
}

function qualityGateScoreBonus(db: any): number {
  const status = qualityGateStatusOf(db);

  if (status === "Freigegeben") return 35;
  if (status === "Geprüft") return 24;
  if (status === "KI-Vorschlag") return 4;

  return 0;
}

function qualityGateWeightFactor(db: any): number {
  const status = qualityGateStatusOf(db);

  if (status === "Freigegeben") return 3.0;
  if (status === "Geprüft") return 2.0;
  if (status === "KI-Vorschlag") return 0.65;

  return 1.0;
}

function isApprovedDbMatch(match: DbMatch): boolean {
  const status = qualityGateStatusOf(match.row);
  return status === "Freigegeben" || status === "Geprüft";
}


function companyIdFromReq(req: Express.Request): string {
  return String(
    (req.auth as any)?.companyId ||
      (req.auth as any)?.company ||
      process.env.DEV_COMPANY_ID ||
      ""
  ).trim();
}

function s(value: any): string {
  return String(value ?? "").trim();
}

function n(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value).trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\s/g, "");

  const x = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function norm(value: any): string {
  return s(value).toLowerCase();
}

function safeId(prefix = "pb"): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function tokenize(value: any): string[] {
  return Array.from(
    new Set(
      norm(value)
        .replace(/[.,;:()[\]{}]/g, " ")
        .split(/\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 3)
    )
  );
}

function detectGewerk(text: string): string {
  const t = norm(text);

  if (
    t.includes("aushub") ||
    t.includes("graben") ||
    t.includes("boden") ||
    t.includes("verfüll")
  ) {
    return "Tiefbau / Erdarbeiten";
  }

  if (
    t.includes("rohr") ||
    t.includes("leitung") ||
    t.includes("speedpipe") ||
    t.includes("kabel")
  ) {
    return "Tiefbau / Leitungsbau";
  }

  if (t.includes("asphalt") || t.includes("pflaster") || t.includes("decke")) {
    return "Straßenbau / Oberfläche";
  }

  if (t.includes("beton") || t.includes("schalung") || t.includes("bewehrung")) {
    return "Rohbau / Betonbau";
  }

  return "Allgemein";
}

function detectLeistungsart(text: string): string {
  const t = norm(text);

  if (t.includes("liefern") && t.includes("verlegen")) return "Liefern und Einbauen";
  if (t.includes("liefern")) return "Lieferleistung";
  if (t.includes("verlegen") || t.includes("einbauen")) return "Einbauleistung";
  if (t.includes("aushub") || t.includes("abtrag")) return "Erdbewegung";
  if (t.includes("abfuhr") || t.includes("entsorgung")) return "Transport / Entsorgung";
  if (t.includes("asphalt")) return "Oberflächenwiederherstellung";
  if (t.includes("schacht")) return "Schachtbau / Bauwerk";
  if (t.includes("vermessen") || t.includes("aufmaß")) return "Vermessung / Dokumentation";

  return "Sonstige Leistung";
}

function detectBauverfahren(text: string, unit: string): string {
  const t = norm(text);

  if (t.includes("aushub")) return "Baggeraushub mit Laden / ggf. Abtransport";
  if (t.includes("verfüll")) return "Einbau lagenweise mit Verdichtung";
  if (t.includes("speedpipe")) return "Speedpipe-Verlegung im Leitungsgraben";
  if (t.includes("kabelschutz")) return "Kabelschutzrohr liefern und verlegen";
  if (t.includes("rohr")) return "Rohrleitung liefern/verlegen";
  if (t.includes("asphalt")) return "Asphaltaufbruch und Wiederherstellung";
  if (t.includes("pflaster")) return "Pflaster aufnehmen, lagern und wiederherstellen";
  if (t.includes("schacht")) return "Schacht setzen, ausrichten und anschließen";

  if (unit === "m") return "Längenbezogene Ausführung";
  if (unit === "m²") return "Flächenbezogene Ausführung";
  if (unit === "m³") return "Volumenbezogene Ausführung";

  return "Standard-Ausführung";
}

function normUnit(value: any): string {
  const u = norm(value);
  if (u === "m2" || u === "m^2" || u === "qm") return "m²";
  if (u === "m3" || u === "m^3" || u === "cbm") return "m³";
  if (u === "stk" || u === "stck" || u === "stück" || u === "stueck") return "St";
  return s(value);
}


function isContextSensitivePosition(textRaw: any, unitRaw: any): boolean {
  const text = norm(textRaw);
  const unit = normUnit(unitRaw);

  if (
    unit === "Psch" &&
    /(baustell|einrichtung|vorhaltung|verkehrssicherung|bestands|vermess|erschwernis|dokumentation|bauleitung|koordination|bauzeiten|pauschal|notleitung|temporär|temporaer|medienversorgung|ersatzversorgung|anschluss an bestand|druckprüfung|druckpruefung|absperrarmatur|formstück|formstueck|entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis|dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung|schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz)/i.test(text)
  ) {
    return true;
  }

  return /(baustelleneinrichtung|baustelle einrichten|baustellengemeinkosten|vorhaltung|gerätevorhaltung|geraetevorhaltung|verkehrssicherung|bestandspläne|bestandsplaene|bestandszeichnung|vermessung|erschwernis|beengte bauweise|bauleitung|baustellenkoordination|dokumentation|wartungs- und bedienungsanleitung|bauzeiten|anliegerverkehr|besucherinformation|bauschild|besprechungsraum|notleitung|temporärer anschluss|temporaerer anschluss|temporäre anschlüsse|temporaere anschluesse|provisorische leitung|medienversorgung|ersatzversorgung|anschluss an bestand|druckprüfung|druckpruefung|absperrarmatur|formstück|formstueck|entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis|dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung|schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz)/i.test(text);
}

function contextSensitiveWarning(textRaw: any): string {
  const text = norm(textRaw);

  if (/(schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz)/i.test(text)) {
    return "Kontextabhängige Position: Schutzmaßnahmen/Umwelt/Natur/Anwohner hängen stark von Bauzeit, Auflagen, Schutzumfang, Kontrollintervallen, Dokumentation, Rückbau, Risiken und örtlichen Bedingungen ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(baustelleneinrichtung|baustelle einrichten|vorhaltung|baustellengemeinkosten)/i.test(text)) {
    return "Kontextabhängige Position: Baustelleneinrichtung/Vorhaltung muss über Dauer, Entfernung, Personal, Geräte, Container, Logistik und Gemeinkosten urkalkuliert werden. Historische Datenbankpreise dürfen nur als Vergleich dienen.";
  }

  if (/(verkehrssicherung|erschwernis|beengte bauweise|bauzeiten|anliegerverkehr)/i.test(text)) {
    return "Kontextabhängige Position: Preis hängt stark von Bauzeit, Verkehrsführung, Platzverhältnissen, Auflagen und Bauablauf ab. Historische Preise nur als Orientierung verwenden.";
  }

  if (/(bestandspläne|bestandsplaene|bestandszeichnung|vermessung|dokumentation|wartungs- und bedienungsanleitung)/i.test(text)) {
    return "Kontextabhängige Position: Dokumentation/Vermessung hängt von Projektumfang, Laufzeit, Datenformaten, Behördenanforderungen und Nachbearbeitung ab. Historische Preise nur als Vergleich verwenden.";
  }

  return "Kontextabhängige Position: Preis muss aus Projektparametern urkalkuliert werden. Datenbankpreis nur als historischer Vergleich.";
}

function contextSensitiveAiHint(textRaw: any, unitRaw: any): string {
  if (!isContextSensitivePosition(textRaw, unitRaw)) return "";

  return `
WICHTIG - kontextabhängige Position:
- Diese Position ist baustellenabhängig.
- Verwende Datenbankpreise NICHT blind als direkten EP.
- Historische Preise dienen nur als Vergleich.
- Kalkuliere über Urkalkulation mit Dauer, Entfernung, Personal, Geräten, Logistik, Gemeinkosten, Risiko und Gewinn.
- Wenn Dauer/Entfernung/Projektgröße fehlen, gib eine Warnung und konservative prüfpflichtige Kalkulation aus.
`;
}


function lightSurfaceRange(text: string, unitRaw: string): { min: number; avg: number; max: number; label: string } {
  const t = norm(text);
  const u = normUnit(unitRaw);

  if (u !== "m²") return { min: 0, avg: 0, max: 0, label: "" };

  if (
    t.includes("unterlage reinigen") ||
    t.includes("untergrund reinigen") ||
    t.includes("fläche reinigen") ||
    t.includes("flaeche reinigen")
  ) {
    return { min: 0.15, avg: 0.45, max: 2.5, label: "Unterlage reinigen" };
  }

  if (
    t.includes("schichtenverbund") ||
    t.includes("haftkleber") ||
    t.includes("bitumenemulsion")
  ) {
    return { min: 0.35, avg: 0.85, max: 2.5, label: "Schichtenverbund" };
  }

  if (
    t.includes("einfräsen") ||
    t.includes("einfraesen") ||
    t.includes("abfräsen") ||
    t.includes("abfraesen") ||
    t.includes("fräsen") ||
    t.includes("fraesen")
  ) {
    return { min: 2, avg: 4.5, max: 9, label: "Asphalt fräsen" };
  }

  if (
    t.includes("ac 11 ds") ||
    t.includes("ads aus ac 11") ||
    t.includes("asphaltdeckschicht") ||
    t.includes("deckschicht")
  ) {
    return { min: 10, avg: 18, max: 32, label: "Asphaltdeckschicht" };
  }

  if (
    t.includes("zulage") &&
    (t.includes("mehr") || t.includes("minder")) &&
    (t.includes("stärke") || t.includes("staerke"))
  ) {
    return { min: 1, avg: 4.5, max: 12, label: "Asphalt Mehr-/Minderstärke" };
  }

  if (t.includes("planie")) {
    return { min: 2, avg: 5, max: 10, label: "Planie" };
  }

  return { min: 0, avg: 0, max: 0, label: "" };
}

function basePrice(text: string, unit: string): number {
  const t = norm(text);
  const u = normUnit(unit);

  const light = lightSurfaceRange(text, unit);
  if (light.avg > 0) return light.avg;

  if (t.includes("aushub") && u === "m³") return 18.5;
  if (t.includes("abfuhr") && (u === "t" || u === "m³")) return 24;
  if (t.includes("verfüll") && u === "m³") return 28;
  if (t.includes("kies") && u === "m³") return 38;
  if (t.includes("speedpipe") && u === "m") return 8.5;
  if (t.includes("kabelschutzrohr") && u === "m") return 18.5;
  if (t.includes("rohr") && u === "m") return 26;
  if (t.includes("pflaster") && u === "m²") return 39;
  if (t.includes("asphalt") && u === "m²") return 18;
  if (t.includes("schacht") && u === "St") return 650;
  if (u === "m") return 14;
  if (u === "m²") return 8;
  if (u === "m³") return 36;
  if (u === "t") return 32;
  if (u === "St") return 75;

  return 25;
}

function riskFromText(text: string, unit: string, menge: number): RiskLevel {
  const t = norm(text);

  if (!text || !unit || menge <= 0) return "high";

  if (
    t.includes("unbekannt") ||
    t.includes("bodenklasse") ||
    t.includes("kontaminiert") ||
    t.includes("bestand") ||
    t.includes("anschluss") ||
    t.includes("grundwasser") ||
    t.includes("entsorgung") ||
    t.includes("nach bedarf") ||
    t.includes("bauseits")
  ) {
    return "high";
  }

  if (text.length < 12 || menge > 1000) return "medium";

  return "low";
}

function scoreDbMatch(row: InputRow, db: any): DbMatch {
  let score = 0;
  const reasons: string[] = [];

  const rowText = `${s(row.posNr)} ${s(row.kurztext)} ${s(row.langtext)}`;
  const dbText = `${s(db.positionNumber)} ${s(db.shortText)} ${s(db.longText)}`;

  const rowTokens = tokenize(rowText);
  const dbTokens = new Set(tokenize(dbText));
  const tokenHits = rowTokens.filter((t) => dbTokens.has(t)).length;

  if (s(row.posNr) && norm(row.posNr) === norm(db.positionNumber)) {
    score += 35;
    reasons.push("Positionsnummer identisch");
  }

  if (s(row.einheit) && norm(row.einheit) === norm(db.unit)) {
    score += 15;
    reasons.push("Einheit identisch");
  }

  if (tokenHits > 0) {
    score += Math.min(30, tokenHits * 6);
    reasons.push(`${tokenHits} Text-Treffer`);
  }

  if (s(db.trade) && norm(detectGewerk(rowText)) === norm(db.trade)) {
    score += 8;
    reasons.push("Gewerk ähnlich");
  }

  if (n(db.useCount) > 0) {
    score += Math.min(8, n(db.useCount));
    reasons.push(`${n(db.useCount)}x verwendet`);
  }

  if (n(db.confidence) > 0) {
    score += Math.min(8, Math.round(n(db.confidence) * 8));
  }

  const qgBonus = qualityGateScoreBonus(db);
  if (qgBonus > 0) {
    score += qgBonus;
    reasons.push(`Quality Gate: ${qualityGateStatusOf(db)}`);
  }

  return {
    row: db,
    score: Math.min(100, score),
    reasons,
  };
}

async function findDbMatches(companyId: string, row: InputRow): Promise<DbMatch[]> {
  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const tokens = tokenize(`${posNr} ${kurztext} ${langtext}`).slice(0, 6);

  const or: any[] = [];

  if (posNr) {
    or.push({ positionNumber: { contains: posNr, mode: "insensitive" } });
  }

  if (kurztext) {
    or.push({ shortText: { contains: kurztext.slice(0, 80), mode: "insensitive" } });
    or.push({ longText: { contains: kurztext.slice(0, 80), mode: "insensitive" } });
  }

  for (const token of tokens) {
    or.push({ shortText: { contains: token, mode: "insensitive" } });
    or.push({ longText: { contains: token, mode: "insensitive" } });
  }

  if (!or.length) return [];

  const rows = await prisma.kalkulationsDbEntry.findMany({
    where: {
      companyId,
      OR: or,
    },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    take: 30,
  });

  return rows
    .filter((db) => !isDbEntryBlockedByQualityGate(db))
    .map((db) => scoreDbMatch(row, db))
    .filter((x) => x.score >= 12 && n(x.row.unitPriceNet) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function weightedDbPrice(matches: DbMatch[], unit: string): number {
  const usable = matches.filter((m) => {
    if (!unit) return true;
    return norm(m.row.unit) === norm(unit);
  });

  if (!usable.length) return 0;

  const totalWeight = usable.reduce(
    (sum, m) => sum + Math.max(1, m.score) * qualityGateWeightFactor(m.row),
    0
  );
  const weighted = usable.reduce(
    (sum, m) =>
      sum + n(m.row.unitPriceNet) * Math.max(1, m.score) * qualityGateWeightFactor(m.row),
    0
  );

  return totalWeight > 0 ? round2(weighted / totalWeight) : 0;
}

function strongDatabaseHit(matches: DbMatch[], unit: string): boolean {
  const ep = weightedDbPrice(matches, unit);
  if (ep <= 0) return false;

  const top = matches[0];
  if (!top) return false;

  if (isApprovedDbMatch(top) && top.score >= 45) return true;
  if (isApprovedDbMatch(top) && top.score >= 35 && norm(top.row.unit) === norm(unit)) {
    return true;
  }

  /*
   * KI-Vorschläge bleiben bewusst schwach:
   * Ohne Freigegeben/Geprüft dürfen sie niemals als starker Datenbanktreffer gelten.
   */
  return false;
}

function confidenceFrom(row: InputRow, risk: RiskLevel, matches: DbMatch[], source: CalcSource): number {
  let score = source === "openai" ? 0.82 : source === "database" ? 0.76 : 0.62;

  if (s(row.posNr)) score += 0.03;
  if (s(row.kurztext).length >= 12) score += 0.06;
  if (s(row.langtext).length >= 30) score += 0.04;
  if (s(row.einheit)) score += 0.03;
  if (n(row.menge) > 0) score += 0.03;

  if (source === "database") {
    if (matches.length) score += Math.min(0.12, matches.length * 0.02);
    if (matches[0]?.score >= 70) score += 0.08;
    else if (matches[0]?.score >= 45) score += 0.04;
  }

  if (risk === "medium") score -= 0.06;
  if (risk === "high") score -= 0.14;

  return Math.max(0.25, Math.min(0.98, round2(score)));
}

function buildPriceBreakdownFromCosts(row: {
  einheit?: string;
  materialCost?: number;
  laborCost?: number;
  machineCost?: number;
  subcontractorCost?: number;
  disposalCost?: number;
  overheadCost?: number;
  riskCost?: number;
  profitCost?: number;
}): PriceBreakdownLine[] {
  const unit = s(row.einheit) || "EH";
  const lines: PriceBreakdownLine[] = [];

  function add(group: PriceBreakdownGroup, name: string, value: any, note = "") {
    const total = round2(n(value));
    if (total <= 0) return;

    lines.push({
      id: safeId(),
      group,
      name,
      unit,
      qty: 1,
      price: total,
      total,
      note,
    });
  }

  add("Material", "Materialansatz", row.materialCost);
  add("Personal", "Lohn / Kolonne", row.laborCost);
  add("Maschinen", "Maschinenansatz", row.machineCost);
  add("Fremdleistung", "Fremdleistung", row.subcontractorCost);
  add("Entsorgung", "Entsorgung / Deponie", row.disposalCost);
  add("Gemeinkosten", "Baustellengemeinkosten", row.overheadCost);
  add("Risiko", "Risikopuffer", row.riskCost);
  add("Gewinn", "Gewinnanteil", row.profitCost);

  return lines;
}

function normalizePriceBreakdown(raw: any, unit: string): PriceBreakdownLine[] {
  if (!Array.isArray(raw)) return [];

  const allowed = new Set<PriceBreakdownGroup>([
    "Personal",
    "Maschinen",
    "LKW / Transport",
    "Material",
    "Entsorgung",
    "Fremdleistung",
    "Gemeinkosten",
    "Risiko",
    "Gewinn",
  ]);

  return raw
    .map((x: any) => {
      const group = allowed.has(x?.group) ? x.group : "Material";
      const qty = n(x?.qty, 1);
      const price = n(x?.price);
      const total =
        x?.total !== undefined && x?.total !== null
          ? round2(n(x.total))
          : round2(qty * price);

      return {
        id: s(x?.id) || safeId(),
        group,
        name: s(x?.name) || "Kostenansatz",
        unit: s(x?.unit) || unit || "EH",
        qty,
        price,
        total,
        note: s(x?.note),
      } satisfies PriceBreakdownLine;
    })
    .filter((x) => x.total > 0);
}

/**
 * OpenAI kann priceBreakdown manchmal für die Gesamtmenge liefern
 * z.B. 100 m × 3,50 € = 350 €.
 *
 * Für RLC müssen priceBreakdown-Linien aber immer pro Einheit gespeichert werden:
 * qty = 1
 * price = Kosten pro Einheit
 * total = Kosten pro Einheit
 *
 * Gesamtwerte werden später im Frontend/PDF über Menge × EP berechnet.
 */
function normalizePriceBreakdownPerUnit(
  raw: any,
  unit: string,
  rowMenge: number
): PriceBreakdownLine[] {
  const lines = normalizePriceBreakdown(raw, unit);
  const menge = Math.max(1, n(rowMenge, 1));

  return lines
    .map((line) => {
      let unitTotal = n(line.total);

      if (menge > 1) {
        const lineQty = Math.max(1, n(line.qty, 1));

        if (Math.abs(lineQty - menge) < 0.0001) {
          unitTotal = n(line.price, unitTotal / menge);
        } else if (line.total > line.price && line.total / menge > 0) {
          unitTotal = line.total / menge;
        } else if (lineQty > 1 && line.total / lineQty > 0) {
          unitTotal = line.total / lineQty;
        }
      }

      unitTotal = round2(unitTotal);

      return {
        ...line,
        unit: unit || line.unit || "EH",
        qty: 1,
        price: unitTotal,
        total: unitTotal,
      };
    })
    .filter((x) => x.total > 0);
}

function sumBreakdown(lines: PriceBreakdownLine[]): number {
  return round2(lines.reduce((sum, x) => sum + n(x.total), 0));
}



function isStructuralTitleRow(row: InputRow): boolean {
  const pos = s(row.posNr);
  const kurz = s(row.kurztext);
  const lang = s(row.langtext);
  const text = `${kurz} ${lang}`.trim();
  const t = norm(text);
  const unit = norm(row.einheit);
  const ep = n(row.preis);
  const menge = n(row.menge);

  if (!text) return false;

  /*
   * Reine Gliederungsnummern:
   * 01, 02, 03, 04 oder 01.00 / 02.00 sind Titel/Abschnitte.
   */
  if (/^\d{1,2}$/.test(pos)) return true;
  if (/^\d{1,2}\.0{1,3}$/.test(pos)) return true;

  /*
   * Klassische GAEB-/LV-Strukturzeilen.
   */
  if (
    /^titel\s*\d*$/i.test(kurz) ||
    /^abschnitt\s*\d*$/i.test(kurz) ||
    /^kapitel\s*\d*$/i.test(kurz) ||
    /^los\s*\d*$/i.test(kurz) ||
    /^bereich\s*\d*$/i.test(kurz)
  ) {
    return true;
  }

  /*
   * Generische Sammel-/Hilfszeilen, die keine echte Leistungsposition sind.
   */
  if (
    /^leistung\s+zu\s+position\s+\d+/i.test(kurz) ||
    /^leistung\s+zu\s+pos\.?\s*\d+/i.test(kurz) ||
    /^position\s+\d+$/i.test(kurz) ||
    /^titel\s+\d+/i.test(kurz)
  ) {
    return true;
  }

  if (
    t.includes("leistung zu position") ||
    t.includes("leistung zu pos.") ||
    t.includes("summe titel") ||
    t.includes("zwischensumme") ||
    t.includes("gesamtsumme")
  ) {
    return true;
  }

  /*
   * Titeltext ohne konkrete Bauleistung.
   */
  if (
    t.includes("titel ") &&
    !t.includes("ausführung") &&
    !t.includes("liefern") &&
    !t.includes("verlegen") &&
    !t.includes("einbauen") &&
    !t.includes("aushub") &&
    !t.includes("abfuhr") &&
    !t.includes("verfüll") &&
    !t.includes("asphalt") &&
    !t.includes("pflaster") &&
    !t.includes("beton") &&
    !t.includes("rohr") &&
    !t.includes("leitung")
  ) {
    return true;
  }

  /*
   * Pauschale Strukturpositionen mit kurzer Positionsnummer.
   */
  if ((unit === "ps" || unit === "pauschal") && /^(\d{1,2}|\d{1,2}\.\d{1,2})$/.test(pos)) {
    return true;
  }

  /*
   * Sehr generische Zeilen ohne Menge und ohne Preis nicht kalkulieren.
   */
  if (
    ep <= 0 &&
    menge <= 0 &&
    (
      t === "position" ||
      t === "leistung" ||
      t.startsWith("leistung zu") ||
      t.length < 12
    )
  ) {
    return true;
  }

  return false;
}
function plausibilityMinEp(text: string, unit: string): number {
  const light = lightSurfaceRange(text, unit);
  if (light.min > 0) return light.min;

  const t = norm(text);
  const u = normUnit(unit);

  if (u === "m²") {
    if (t.includes("schneiden") || t.includes("fugenschnitt")) return 5;
    if (t.includes("splittbett") || t.includes("splitt")) return 10;
    if (t.includes("sandbett") || t.includes("bettung")) return 8;
    if (t.includes("frostschutz") || t.includes("frostschutzschicht")) return 18;
    if (t.includes("schottertragschicht") || t.includes("tragschicht")) return 18;
    if (t.includes("asphalttragschicht") || t.includes("ac 22")) return 18;
    if (t.includes("asphalt")) return 8;
    if (t.includes("pflaster aufnehmen")) return 10;
    if (t.includes("pflaster") && (t.includes("wiederverlegen") || t.includes("wiederherstellen"))) return 35;
    if (t.includes("pflaster") && (t.includes("liefern") || t.includes("neu"))) return 55;
    if (t.includes("pflaster")) return 35;
    if (t.includes("schalung")) return 25;
    if (t.includes("bewehrung")) return 4;
    if (t.includes("beton")) return 25;
    return 0;
  }

  if (u === "m³") {
    if (t.includes("handschachtung") || t.includes("handschacht")) return 75;
    if (t.includes("aushub") || t.includes("baugrube") || t.includes("auskofferung")) return 18;
    if (t.includes("fels")) return 90;
    if (t.includes("verfüll") || t.includes("verfuell")) return 28;
    if (t.includes("frostschutz") || t.includes("kies") || t.includes("schotter")) return 35;
    if (t.includes("sand")) return 28;
    if (t.includes("beton")) return 120;
    return 0;
  }

  if (u === "m") {
    if (t.includes("asphalt") && (t.includes("schneiden") || t.includes("fugenschnitt"))) return 5;
    if (t.includes("speedpipe") || t.includes("microduct")) return 6;
    if (t.includes("kabelschutzrohr")) return 14;
    if (t.includes("leerrohr")) return 10;
    if (t.includes("wasser") || t.includes("pe-hd") || t.includes("pehd")) return 28;
    if (t.includes("kanal") || t.includes("kg rohr") || t.includes("dn")) return 35;
    if (t.includes("bordstein") || t.includes("randstein") || t.includes("leistenstein")) return 55;
    return 0;
  }

  if (u === "t") {
    if (t.includes("asphalt")) return 35;
    if (t.includes("boden") || t.includes("erde") || t.includes("aushub")) return 18;
    if (t.includes("bauschutt")) return 35;
    if (t.includes("teer") || t.includes("pak")) return 120;
    return 0;
  }

  if (u === "St") {
    if (t.includes("hausanschluss")) return 350;
    if (t.includes("schacht")) return 750;
    if (t.includes("ablauf") || t.includes("sinkkasten")) return 250;
    if (t.includes("bogen") || t.includes("abzweig") || t.includes("formstück")) return 35;
    return 0;
  }

  return 0;
}

function plausibilityMaxEp(text: string, unit: string): number {
  const light = lightSurfaceRange(text, unit);
  if (light.max > 0) return light.max;

  const t = norm(text);
  const u = normUnit(unit);

  if (u === "m²") {
    if (t.includes("schneiden") || t.includes("fugenschnitt")) return 18;
    if (t.includes("splittbett") || t.includes("splitt")) return 32;
    if (t.includes("sandbett") || t.includes("bettung")) return 28;
    if (t.includes("frostschutz") || t.includes("frostschutzschicht")) return 65;
    if (t.includes("schottertragschicht") || t.includes("tragschicht")) return 65;
    if (t.includes("asphalttragschicht") || t.includes("ac 22")) return 55;
    if (t.includes("asphalt")) return 35;
    if (t.includes("pflaster aufnehmen")) return 35;
    if (t.includes("pflaster") && (t.includes("wiederverlegen") || t.includes("wiederherstellen"))) return 95;
    if (t.includes("pflaster") && (t.includes("liefern") || t.includes("neu"))) return 145;
    if (t.includes("pflaster")) return 120;
    if (t.includes("rasengitter")) return 165;
    if (t.includes("plattenbelag") || t.includes("betonplatten")) return 130;
    if (t.includes("naturstein")) return 240;
    if (t.includes("schalung")) return 85;
    if (t.includes("bewehrung")) return 12;
    if (t.includes("beton")) return 95;
    return 0;
  }

  if (u === "m³") {
    if (t.includes("handschachtung") || t.includes("handschacht")) return 240;
    if (t.includes("aushub") || t.includes("baugrube") || t.includes("auskofferung")) return 85;
    if (t.includes("fels")) return 280;
    if (t.includes("verfüll") || t.includes("verfuell")) return 95;
    if (t.includes("frostschutz") || t.includes("kies") || t.includes("schotter")) return 125;
    if (t.includes("sand")) return 95;
    if (t.includes("beton")) return 260;
    return 0;
  }

  if (u === "m") {
    if (t.includes("asphalt") && (t.includes("schneiden") || t.includes("fugenschnitt"))) return 18;
    if (t.includes("speedpipe") || t.includes("microduct")) return 35;
    if (t.includes("kabelschutzrohr")) return 75;
    if (t.includes("leerrohr")) return 55;
    if (t.includes("wasser") || t.includes("pe-hd") || t.includes("pehd")) return 160;
    if (t.includes("kanal") || t.includes("kg rohr") || t.includes("dn")) return 260;
    if (t.includes("bordstein") || t.includes("randstein") || t.includes("leistenstein")) return 180;
    return 0;
  }

  if (u === "t") {
    if (t.includes("asphalt")) return 120;
    if (t.includes("boden") || t.includes("erde") || t.includes("aushub")) return 75;
    if (t.includes("bauschutt")) return 140;
    if (t.includes("teer") || t.includes("pak")) return 420;
    return 0;
  }

  if (u === "St") {
    if (t.includes("hausanschluss")) return 2500;
    if (t.includes("schacht")) return 8500;
    if (t.includes("ablauf") || t.includes("sinkkasten")) return 1500;
    if (t.includes("bogen") || t.includes("abzweig") || t.includes("formstück")) return 350;
    return 0;
  }

  return 0;
}

function oldReferenceEp(row: InputRow, matches: DbMatch[]): number {
  const oldEp = n(row.preis);
  const dbEp = weightedDbPrice(matches, s(row.einheit));
  return Math.max(oldEp, dbEp);
}

function applyPlausibilityGuard(row: InputRow, matches: DbMatch[], aiRow: any, forceRecalculate = false): any {
  const text = `${s(row.kurztext)} ${s(row.langtext)}`.trim();
  const unit = s(row.einheit);
  const minEp = plausibilityMinEp(text, unit);
  const maxEp = plausibilityMaxEp(text, unit);

  /*
   * Bei KI-Neuberechnung oder bei offensichtlich explodierten Altpreisen
   * darf der vorhandene EP nicht als stabiler Referenzpreis blockieren.
   */
  const existingRowEp = n(row.preis);
  const explodedExistingEp =
    maxEp > 0 && existingRowEp > maxEp * 1.15;

  const rowEp =
    forceRecalculate || explodedExistingEp
      ? 0
      : existingRowEp;

  const rawOldEp =
    forceRecalculate || explodedExistingEp
      ? 0
      : oldReferenceEp(row, matches);

  /*
   * Vecchio EP/Datenbank-EP viene usato come Referenz solo se plausibile.
   * Esempio: Speedpipe vecchio 55 €/m contro Mindestansatz 8,50 €/m non deve bloccare la KI.
   */
  const oldEp =
    minEp > 0 && rawOldEp > minEp * 3
      ? 0
      : rawOldEp;

  const aiEp = n(aiRow?.finalUnitPrice);

  let guardedEp = aiEp;
  const notes: string[] = [];

  /*
   * RLC Preisgruppen-Guard:
   * Materialpreise aus der Preisbibliothek dürfen den finalen EP nicht deckeln.
   * Material dient nur als Urkalkulations-/Materialansatz.
   * Finalpreis-Deckelung ist nur sinnvoll bei Transport, Maschinen,
   * Fremdleistung oder kompletten Oberflächenleistungen.
   */
  const rlcGroup = s(aiRow?.rlcPreisGroup).toLowerCase();
  const hasRlcGroup = rlcGroup.length > 0;
  const rlcCanLimitFinalPrice =
    !hasRlcGroup ||
    rlcGroup.includes("transport") ||
    rlcGroup.includes("maschine") ||
    rlcGroup.includes("fremdleistung") ||
    rlcGroup.includes("oberfläche") ||
    rlcGroup.includes("oberflaeche");

  /*
   * Direct Technical Recipe Override:
   * Diese Fälle wurden bewusst fachlich eindeutig erkannt.
   * Alte LV-Preise dürfen diese Korrektur nicht durch die Stabilitätsbremse blockieren.
   */
  const isDirectTechnicalRecipeOverride =
    s(aiRow?.leistungsart).toLowerCase().includes("direkte technische rezeptlogik") ||
    s(aiRow?.warning).toLowerCase().includes("direkte technische rlc-rezeptlogik") ||
    s(aiRow?.aiReason).toLowerCase().includes("direkte rlc-rezeptlogik");

  /*
   * RLC-KI Pipeline:
   * Der vorhandene LV-/X84-EP darf die eigentliche RLC-KI nicht blockieren.
   * X84 bleibt Vergleichswert im Frontend, aber nicht Server-Wahrheit für finalUnitPrice.
   */

  if (!isDirectTechnicalRecipeOverride && rlcCanLimitFinalPrice && minEp > 0 && guardedEp > 0 && guardedEp < minEp) {
    notes.push(
      `Plausibilitätsgrenze aktiv: KI-EP ${round2(guardedEp)} EUR liegt unter Mindestansatz ${round2(minEp)} EUR.`
    );
    guardedEp = minEp;
  }

  if (!isDirectTechnicalRecipeOverride && rlcCanLimitFinalPrice && maxEp > 0 && guardedEp > maxEp) {
    notes.push(
      `Plausibilitätsdeckel aktiv: KI-EP ${round2(guardedEp)} EUR liegt über dem fachlichen Maximalansatz ${round2(maxEp)} EUR. Finaler EP wurde gedeckelt.`
    );
    guardedEp = maxEp;
  }

  /*
   * Kein oldEp/X84-Preis-Limit mehr:
   * RLC-KI muss unabhängig rechnen. Alter LV-/X84-EP wird nur im Frontend verglichen.
   */

  /*
   * Keine Stabilitätsbremse gegen alten Referenz-EP:
   * RLC-KI muss ihren eigenen EP liefern. Abweichungen werden im Frontend verglichen.
   */

  if (!guardedEp || guardedEp <= 0 || guardedEp === aiEp) {
    return aiRow;
  }

  const factor = aiEp > 0 ? guardedEp / aiEp : 1;

  const priceBreakdown = Array.isArray(aiRow.priceBreakdown)
    ? aiRow.priceBreakdown.map((line: PriceBreakdownLine) => ({
        ...line,
        price: round2(n(line.price) * factor),
        total: round2(n(line.total) * factor),
        note: [s(line.note), "Plausibilitätsanpassung"].filter(Boolean).join(" · "),
      }))
    : aiRow.priceBreakdown;

  return {
    ...aiRow,
    materialCost: round2(n(aiRow.materialCost) * factor),
    laborCost: round2(n(aiRow.laborCost) * factor),
    machineCost: round2(n(aiRow.machineCost) * factor),
    subcontractorCost: round2(n(aiRow.subcontractorCost) * factor),
    disposalCost: round2(n(aiRow.disposalCost) * factor),
    overheadCost: round2(n(aiRow.overheadCost) * factor),
    riskCost: round2(n(aiRow.riskCost) * factor),
    profitCost: round2(n(aiRow.profitCost) * factor),

    baseUnitPrice: round2(guardedEp),
    suggestedUnitPrice: round2(guardedEp),
    finalUnitPrice: round2(guardedEp),

    calculationStatus: aiRow.calculationStatus === "critical" ? "critical" : "warning",
    riskLevel: aiRow.riskLevel === "high" ? "high" : "medium",

    warning: [s(aiRow.warning), ...notes].filter(Boolean).join(" · "),
    aiReason: [s(aiRow.aiReason), ...notes].filter(Boolean).join("\n\n"),
    priceBreakdown,
  };
}

function firstLayerCm(text: string, keys: string[]): number {
  const t = norm(text);

  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}[^0-9]{0,30}(\\d+(?:[,.]\\d+)?)\\s*cm`, "i"),
      new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*cm[^a-zA-ZäöüÄÖÜß]{0,30}${escaped}`, "i"),
    ];

    for (const pattern of patterns) {
      const m = t.match(pattern);
      if (m?.[1]) return n(m[1]);
    }
  }

  return 0;
}

function technicalLayerPostprocess(
  lines: PriceBreakdownLine[],
  rowText: string
): PriceBreakdownLine[] {
  const t = norm(rowText);

  const splittCm = firstLayerCm(rowText, ["splitt", "splittbett", "bettung"]);
  const frostCm = firstLayerCm(rowText, ["frostschutz", "frostschutzkies", "tragschicht"]);
  const auskofferungCm = firstLayerCm(rowText, ["auskofferung", "aushub", "auskoffern"]);

  const splittM3 = splittCm > 0 ? round2(splittCm / 100) : 0;
  const frostM3 = frostCm > 0 ? round2(frostCm / 100) : 0;
  const aushubM3 = auskofferungCm > 0 ? round2(auskofferungCm / 100) : 0;
  const entsorgungT = aushubM3 > 0 ? round2(aushubM3 * 1.8) : 0;

  const isRasengitter = t.includes("rasengitter");
  const isPflaster =
    t.includes("pflaster") ||
    t.includes("verbundstein") ||
    t.includes("betonstein") ||
    t.includes("naturstein") ||
    isRasengitter;
  const isAsphalt = t.includes("asphalt");
  const lightSurface = lightSurfaceRange(rowText, "m²");
  const isLightSurfaceWork = lightSurface.avg > 0;
  const isSurfaceWork = isPflaster || (isAsphalt && !isLightSurfaceWork);

  let droppedAushubMaterialTotal = 0;
  let hasAushubLine = false;

  const out = lines
    .map((line) => {
      const name = norm(line.name);
      const total = n(line.total);

      // Auskofferung/Aushub darf nicht als Material laufen.
      if (
        line.group === "Material" &&
        (name.includes("auskoffer") || name.includes("aushub"))
      ) {
        droppedAushubMaterialTotal += total;
        return null;
      }

      if (splittM3 > 0 && (name.includes("splitt") || name.includes("bettung"))) {
        return {
          ...line,
          unit: "m³",
          qty: splittM3,
          price: round2(total / splittM3),
          total,
          note: `Schichtdicke ${splittCm} cm = ${splittM3} m³/m²`,
        };
      }

      if (frostM3 > 0 && (name.includes("frostschutz") || name.includes("tragschicht"))) {
        return {
          ...line,
          unit: "m³",
          qty: frostM3,
          price: round2(total / frostM3),
          total,
          note: `Schichtdicke ${frostCm} cm = ${frostM3} m³/m²`,
        };
      }

      if (
        aushubM3 > 0 &&
        line.group === "Maschinen" &&
        (name.includes("auskoffer") ||
          name.includes("aushub") ||
          name.includes("bagger") ||
          name.includes("radlader"))
      ) {
        hasAushubLine = true;

        const minAushubTotal = round2(aushubM3 * 12);
        const realisticTotal = Math.max(total, droppedAushubMaterialTotal, minAushubTotal);

        return {
          ...line,
          group: "Maschinen",
          name: "Auskofferung lösen und laden",
          unit: "m³",
          qty: aushubM3,
          price: round2(realisticTotal / aushubM3),
          total: round2(realisticTotal),
          note: `Auskofferung ${auskofferungCm} cm = ${aushubM3} m³/m²`,
        };
      }

      if (
        entsorgungT > 0 &&
        line.group === "Entsorgung" &&
        (name.includes("aushub") || name.includes("boden") || name.includes("entsorg"))
      ) {
        return {
          ...line,
          name: "Aushubmaterial entsorgen",
          unit: "t",
          qty: entsorgungT,
          price: round2(total / entsorgungT),
          total,
          note: `${aushubM3} m³/m² × 1,8 t/m³ = ${entsorgungT} t/m²`,
        };
      }

      return line;
    })
    .filter(Boolean) as PriceBreakdownLine[];

  // Wenn Auskofferung erwähnt ist, muss sie als eigene Leistung sichtbar sein.
  if (aushubM3 > 0 && !hasAushubLine) {
    const total = round2(Math.max(droppedAushubMaterialTotal, aushubM3 * 12));

    out.push({
      id: safeId(),
      group: "Maschinen",
      name: "Auskofferung lösen und laden",
      unit: "m³",
      qty: aushubM3,
      price: round2(total / aushubM3),
      total,
      note: `Auskofferung ${auskofferungCm} cm = ${aushubM3} m³/m²`,
    });
  }

  const sumGroup = (group: PriceBreakdownGroup) =>
    round2(out.filter((x) => x.group === group).reduce((s, x) => s + n(x.total), 0));

  const personalTotal = sumGroup("Personal");
  const machineTotal = sumGroup("Maschinen");

  // Plausibilitätsprüfung für arbeitsintensive Oberflächenarbeiten.
  // Keine Fantasiepreise: Es werden nur fehlende Mindestanteile als transparente Korrekturzeilen ergänzt.
  const minPersonal = isLightSurfaceWork ? 0 : isRasengitter ? 10 : isPflaster ? 9 : isAsphalt ? 7 : 0;
  const minMachines =
    isLightSurfaceWork
      ? 0
      : isRasengitter || isPflaster
        ? Math.max(8, aushubM3 > 0 ? round2(aushubM3 * 12 + 3) : 8)
        : isAsphalt
          ? 6
          : 0;

  if (minPersonal > 0 && personalTotal < minPersonal) {
    const diff = round2(minPersonal - personalTotal);

    out.push({
      id: safeId(),
      group: "Personal",
      name: "Kolonne / Bauhelfer / Facharbeiter",
      unit: "m²",
      qty: 1,
      price: diff,
      total: diff,
      note: "Plausibilitätskorrektur: Mindestansatz für arbeitsintensive Oberflächenleistung",
    });
  }

  if (minMachines > 0 && machineTotal < minMachines) {
    const diff = round2(minMachines - machineTotal);

    out.push({
      id: safeId(),
      group: "Maschinen",
      name: "Geräte / Verdichtung / Radlader",
      unit: "m²",
      qty: 1,
      price: diff,
      total: diff,
      note: "Plausibilitätskorrektur: Geräte, Verdichtung und Baustellenlogistik",
    });
  }

  return out;
}


function mergePlausibilityLines(lines: PriceBreakdownLine[]): PriceBreakdownLine[] {
  const out = [...lines];

  function isPlausibility(line: PriceBreakdownLine) {
    return norm(line.note).includes("plausibilit") || norm(line.name).includes("geräte / verdichtung");
  }

  function mergeGroup(group: PriceBreakdownGroup, finalName: string, finalNote: string) {
    const groupLines = out.filter((x) => x.group === group);
    if (groupLines.length <= 1) return;

    const plausibility = groupLines.filter(isPlausibility);
    if (!plausibility.length) return;

    const target =
      groupLines.find((x) => !isPlausibility(x)) ||
      groupLines[0];

    const addTotal = plausibility
      .filter((x) => x.id !== target.id)
      .reduce((sum, x) => sum + n(x.total), 0);

    if (addTotal <= 0) return;

    const nextTotal = round2(n(target.total) + addTotal);

    target.name = finalName;
    target.unit = target.unit || "m²";
    target.qty = n(target.qty, 1) || 1;
    target.total = nextTotal;
    target.price = round2(nextTotal / Math.max(n(target.qty, 1), 0.0001));
    target.note = finalNote;

    for (let i = out.length - 1; i >= 0; i--) {
      const line = out[i];
      if (line.group === group && line.id !== target.id && isPlausibility(line)) {
        out.splice(i, 1);
      }
    }
  }

  mergeGroup(
    "Personal",
    "Kolonne / Bauhelfer / Facharbeiter",
    "Arbeitszeit für Verlegen, Ausrichten, Schneiden, Abrütteln und Nebenarbeiten"
  );

  mergeGroup(
    "Maschinen",
    "Auskofferung / Geräte / Verdichtung",
    "Auskofferung, Bagger/Radlader, Verdichtung und Baustellenlogistik"
  );

  return out;
}



function materialKey(value: any): string {
  const t = norm(value);

  if (t.includes("rasengitter")) return "rasengitter";
  if (t.includes("asphaltdeckschicht") || t.includes("asphalt")) return "asphalt";
  if (t.includes("frostschutz")) return "frostschutz";
  if (t.includes("splitt")) return "splitt";
  if (t.includes("pflaster")) return "pflaster";
  if (t.includes("bord")) return "bordstein";
  if (t.includes("rohr") || t.includes("speedpipe")) return "rohr";
  return "";
}

function isMaterialDatabaseEntry(match: DbMatch): boolean {
  const row = match.row || {};
  const text = norm(`${s(row.shortText)} ${s(row.longText)} ${s(row.serviceType)} ${s(row.trade)}`);

  if (text.includes("materialpreis")) return true;
  if (norm(row.serviceType) === "material") return true;
  if (norm(row.source) === "company" && text.includes("liefern")) return true;

  return false;
}

function applyDatabaseMaterialPrices(
  lines: PriceBreakdownLine[],
  matches: DbMatch[],
  rowText: string
): PriceBreakdownLine[] {
  if (!matches.length) return lines;

  const out = [...lines];
  const rowKeyText = norm(rowText);

  const materialMatches = matches
    .filter((m) => isMaterialDatabaseEntry(m))
    .filter((m) => n(m.row?.unitPriceNet) > 0)
    .sort((a, b) => b.score - a.score);

  for (const match of materialMatches) {
    const db = match.row;
    const dbPrice = round2(n(db.unitPriceNet));
    const dbUnit = s(db.unit) || "EH";
    const dbText = `${s(db.shortText)} ${s(db.longText)}`;
    const key = materialKey(dbText);

    if (!key) continue;
    if (!rowKeyText.includes(key)) continue;

    const target = out.find((line) => {
      if (line.group !== "Material") return false;
      const lineText = norm(`${line.name} ${line.note}`);
      return lineText.includes(key);
    });

    if (!target) continue;

    // Nur gleiche/kompatible Einheit überschreiben.
    // Beispiel: Rasengitter m² -> m², Asphaltdeckschicht m² -> m².
    if (dbUnit && target.unit && norm(dbUnit) !== norm(target.unit)) {
      continue;
    }

    target.price = dbPrice;
    target.total = round2(n(target.qty, 1) * dbPrice);
    target.note = `Firmen-/Datenbankpreis übernommen: ${s(db.shortText)} · ${dbPrice} €/` + dbUnit;

    console.log(
      `[kalkulation.ki] Materialpreis aus Datenbank übernommen: ${key} = ${dbPrice} €/${dbUnit}`
    );
  }

  return out;
}

function sanitizeOverheadRiskProfit(
  lines: PriceBreakdownLine[],
  options?: { skipCaps?: boolean }
): PriceBreakdownLine[] {
  const out = [...lines];

  if (options?.skipCaps) return out;

  const directGroups: PriceBreakdownGroup[] = [
    "Material",
    "Personal",
    "Maschinen",
    "LKW / Transport",
    "Entsorgung",
    "Fremdleistung",
  ];

  const directTotal = round2(
    out
      .filter((x) => directGroups.includes(x.group))
      .reduce((sum, x) => sum + n(x.total), 0)
  );

  if (directTotal <= 0) return out;

  const caps: Record<string, { maxPct: number; label: string }> = {
    Gemeinkosten: { maxPct: 0.15, label: "Gemeinkosten auf plausiblen Maximalwert begrenzt" },
    Risiko: { maxPct: 0.10, label: "Risikoaufschlag auf plausiblen Maximalwert begrenzt" },
    Gewinn: { maxPct: 0.15, label: "Gewinnaufschlag auf plausiblen Maximalwert begrenzt" },
  };

  for (const groupName of Object.keys(caps) as PriceBreakdownGroup[]) {
    const cap = caps[groupName];
    const maxTotal = round2(directTotal * cap.maxPct);

    const groupLines = out.filter((x) => x.group === groupName);
    const groupTotal = round2(groupLines.reduce((sum, x) => sum + n(x.total), 0));

    if (!groupLines.length || groupTotal <= maxTotal) continue;

    const first = groupLines[0];

    first.unit = first.unit || "EH";
    first.qty = 1;
    first.total = maxTotal;
    first.price = maxTotal;
    first.note = cap.label;

    for (let i = out.length - 1; i >= 0; i--) {
      const line = out[i];
      if (line.group === groupName && line.id !== first.id) {
        out.splice(i, 1);
      }
    }
  }

  return out;
}

function rejectClearlyUnrealisticBreakdown(lines: PriceBreakdownLine[]): boolean {
  const total = sumBreakdown(lines);
  if (total <= 0) return true;

  const directTotal = round2(
    lines
      .filter((x) =>
        ["Material", "Personal", "Maschinen", "LKW / Transport", "Entsorgung", "Fremdleistung"].includes(x.group)
      )
      .reduce((sum, x) => sum + n(x.total), 0)
  );

  const overheadRiskProfit = round2(
    lines
      .filter((x) => ["Gemeinkosten", "Risiko", "Gewinn"].includes(x.group))
      .reduce((sum, x) => sum + n(x.total), 0)
  );

  if (directTotal > 0 && overheadRiskProfit > directTotal * 0.45) return true;
  if (total > 500 && directTotal < total * 0.25) return true;

  return false;
}

function sumBreakdownGroup(
  lines: PriceBreakdownLine[],
  groups: PriceBreakdownGroup[]
): number {
  const allowed = new Set(groups);
  return round2(
    lines
      .filter((x) => allowed.has(x.group))
      .reduce((sum, x) => sum + n(x.total), 0)
  );
}

function buildWarnings(
  row: InputRow,
  riskLevel: RiskLevel,
  matches: DbMatch[],
  confidence: number,
  source: CalcSource
): string[] {
  const warnings: string[] = [];

  if (!s(row.posNr)) warnings.push("Positionsnummer fehlt");
  if (!s(row.kurztext)) warnings.push("Kurztext fehlt");
  if (!s(row.einheit)) warnings.push("Einheit fehlt");
  if (n(row.menge) <= 0) warnings.push("Menge fehlt oder ist 0");

  const text = norm(`${s(row.kurztext)} ${s(row.langtext)}`);

  if (source === "openai") warnings.push("OpenAI-Schätzung verwendet, bitte fachlich prüfen");
  if (source === "rule-engine") warnings.push("Nur Regel-Engine-Fallback verwendet");
  if (source === "database" && !matches.length) warnings.push("Keine passende Erfahrung in der Datenbank gefunden");
  if (source === "database" && matches.length > 0 && matches[0].score < 35) {
    warnings.push("Datenbanktreffer nur bedingt ähnlich");
  }

  if (riskLevel === "high") warnings.push("Erhöhtes Kalkulationsrisiko");
  if (text.includes("bodenklasse")) warnings.push("Bodenklasse muss geprüft werden");
  if (text.includes("entsorgung")) warnings.push("Entsorgung/Deponieklasse prüfen");
  if (text.includes("bestand") || text.includes("anschluss")) {
    warnings.push("Bestandsanschluss technisch prüfen");
  }
  if (text.includes("verkehr")) warnings.push("Verkehrssicherung/RSA prüfen");
  if (confidence < 0.65) warnings.push("Niedrige Kalkulationssicherheit");

  return Array.from(new Set(warnings));
}

function calculationStatusFrom(warnings: string[], riskLevel: RiskLevel, confidence: number): CalcStatus {
  if (warnings.some((x) => x.includes("fehlt")) || confidence < 0.55) return "critical";
  if (warnings.length || riskLevel !== "low") return "warning";
  return "ok";
}

function calcRuleRow(row: InputRow, matches: DbMatch[], sourceOverride?: CalcSource) {
  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const einheit = s(row.einheit);
  const menge = n(row.menge);
  const text = `${kurztext} ${langtext}`.trim();

  const contextSensitive = isContextSensitivePosition(text, einheit);
  const dbEpRaw = weightedDbPrice(matches, einheit);
  const dbEp = contextSensitive ? 0 : dbEpRaw;
  const ruleEp = basePrice(text, einheit);
  const rlcRange = rlcPreisRangeForText(text, einheit);
  const rlcAvgEp = n(rlcRange.avg);
  const source: CalcSource = sourceOverride || (dbEp > 0 ? "database" : "rule-engine");

  /*
   * RLC Preisbibliothek:
   * Wenn keine sichere Datenbank vorhanden ist, nutzt die Rule-Engine
   * den höheren plausiblen Wert aus Regelpreis und RLC-Preisbibliothek.
   */
  const base = dbEp > 0 ? dbEp : Math.max(ruleEp, rlcAvgEp);

  const riskLevel = riskFromText(text, einheit, menge);
  const confidence = confidenceFrom(row, riskLevel, matches, source);
  const riskFactor = riskLevel === "high" ? 0.12 : riskLevel === "medium" ? 0.06 : 0.025;

  const materialCost = round2(base * 0.28);
  const laborCost = round2(base * 0.34);
  const machineCost = round2(base * 0.18);

  const disposalCost =
    norm(text).includes("abfuhr") ||
    norm(text).includes("entsorgung") ||
    norm(text).includes("aushub")
      ? round2(base * 0.16)
      : 0;

  const subcontractorCost = 0;
  const direct = materialCost + laborCost + machineCost + disposalCost + subcontractorCost;
  const overheadCost = round2(direct * 0.12);
  const riskCost = round2(direct * riskFactor);
  const profitCost = round2((direct + overheadCost + riskCost) * 0.1);
  const suggestedUnitPrice = round2(direct + overheadCost + riskCost + profitCost);

  const warnings = [
    ...buildWarnings(row, riskLevel, matches, confidence, source),
    contextSensitive ? contextSensitiveWarning(text) : "",
  ].filter(Boolean);
  const calculationStatus = calculationStatusFrom(warnings, riskLevel, confidence);

  const gewerk = detectGewerk(text);
  const leistungsart = detectLeistungsart(text);
  const bauverfahren = detectBauverfahren(text, einheit);

  const matchText = matches.length
    ? matches
        .slice(0, 3)
        .map(
          (m, i) =>
            `${i + 1}. ${s(m.row.positionNumber) || "—"} · ${s(m.row.shortText) || "ohne Text"} · EP ${round2(n(m.row.unitPriceNet))} € · Score ${m.score}`
        )
        .join("; ")
    : "keine verwertbaren Treffer";

  const aiReason =
    contextSensitive
      ? `RLC Urkalkulation: Kontextabhängige Position erkannt. Historische Datenbankwerte wurden nur als Vergleich betrachtet und nicht blind als EP übernommen. Historischer DB-EP: ${dbEpRaw} €. Preis muss über Dauer, Entfernung, Personal, Geräte, Logistik, Gemeinkosten, Risiko und Gewinn geprüft werden.`
      : source === "database"
        ? `Server-KI/Datenbank: Der Preis wurde aus ${matches.length} ähnlichen Erfahrungswert(en) der Kalkulationsdatenbank abgeleitet. Gewichteter Datenbank-EP: ${dbEp} €. Zusätzlich plausibilisiert über Gewerk ${gewerk}, Leistungsart ${leistungsart}, Verfahren ${bauverfahren}. Top-Treffer: ${matchText}.`
        : `Server-Fallback: Kein ausreichend sicherer Datenbanktreffer und keine verwertbare OpenAI-Antwort. Preis wurde über Regel-Engine aus Einheit, Textmerkmalen, Risiko, Gemeinkosten und Gewinn aufgebaut. Regel-EP: ${ruleEp} €; Gewerk ${gewerk}, Leistungsart ${leistungsart}, Verfahren ${bauverfahren}.`;

  const priceBreakdown = buildPriceBreakdownFromCosts({
    einheit,
    materialCost,
    laborCost,
    machineCost,
    subcontractorCost,
    disposalCost,
    overheadCost,
    riskCost,
    profitCost,
  });

  return {
    id: row.id,
    posNr,
    kurztext,
    langtext,
    einheit,
    menge,

    materialCost,
    laborCost,
    machineCost,
    subcontractorCost,
    disposalCost,
    overheadCost,
    riskCost,
    profitCost,

    baseUnitPrice: round2(base),
    suggestedUnitPrice,
    finalUnitPrice: suggestedUnitPrice,

    confidence,
    riskLevel,
    calculationStatus,

    gewerk,
    leistungsart,
    bauverfahren,

      rlcPreisMin: round2(n(rlcRange.min)),
      rlcPreisAvg: round2(n(rlcRange.avg)),
      rlcPreisMax: round2(n(rlcRange.max)),
      rlcPreisSource: rlcAvgEp > 0 ? "RLC Preisbibliothek" : "",
      rlcPreisGroup: rlcAvgEp > 0 ? rlcRange.matches?.[0]?.group || "" : "",

    warning: warnings.join(" · "),
    aiReason,
    source,
    priceBreakdown,
  };
}

function extractJson(text: string): any | null {
  const clean = s(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(clean.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  return new OpenAI({ apiKey });
}

async function openAiCalcRow(row: InputRow, matches: DbMatch[]): Promise<any | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const posNr = s(row.posNr);
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const einheit = s(row.einheit);
  const menge = n(row.menge);
  const text = `${kurztext} ${langtext}`.trim();

  const gewerk = detectGewerk(text);
  const leistungsart = detectLeistungsart(text);
  const bauverfahren = detectBauverfahren(text, einheit);
  const rlcPreisTreffer = findRlcPreisItems({ text, unit: einheit, limit: 12 });
  const rlcPreisRange = rlcPreisRangeForText(text, einheit);
  const contextHint = contextSensitiveAiHint(text, einheit);

  const projectDurationDays =
    n((row as any).projectDurationDays) ||
    n((row as any).durationDays) ||
    n((row as any).bauzeitTage) ||
    0;

  const projectDistanceKm =
    n((row as any).projectDistanceKm) ||
    n((row as any).distanceKm) ||
    n((row as any).entfernungKm) ||
    0;

  const projectSize =
    s((row as any).projectSize) ||
    s((row as any).projektGroesse) ||
    s((row as any).baustellenGroesse);

  const projectPersonnel =
    s((row as any).projectPersonnel) ||
    s((row as any).personal) ||
    s((row as any).workers);

  const projectMachines =
    s((row as any).projectMachines) ||
    s((row as any).geraete) ||
    s((row as any).maschinen);

  const projectLogistics =
    s((row as any).projectLogistics) ||
    s((row as any).logistik) ||
    s((row as any).baustellenlogistik);

  const projectContextBlock = [
    projectDurationDays > 0 ? `- Projektdauer: ${projectDurationDays} Tage` : "- Projektdauer: nicht angegeben",
    projectDistanceKm > 0 ? `- Entfernung Baustelle/Firma: ${projectDistanceKm} km` : "- Entfernung Baustelle/Firma: nicht angegeben",
    projectSize ? `- Projektgröße/Baustellenumfang: ${projectSize}` : "- Projektgröße/Baustellenumfang: nicht angegeben",
    projectPersonnel ? `- Personalansatz: ${projectPersonnel}` : "- Personalansatz: nicht angegeben",
    projectMachines ? `- Geräte/Maschinen: ${projectMachines}` : "- Geräte/Maschinen: nicht angegeben",
    projectLogistics ? `- Logistik/Randbedingungen: ${projectLogistics}` : "- Logistik/Randbedingungen: nicht angegeben",
  ].join("\n");

  const prompt = `
${contextHint}
Du bist ein erfahrener deutscher Bau-Kalkulator für Tiefbau, Leitungsbau, Glasfaserbau, Straßenbau und Hochbau.

Erstelle eine fachlich plausible Urkalkulation pro Einheit für diese LV-Position.

Position:
- Positionsnummer: ${posNr || "—"}
- Kurztext: ${kurztext || "—"}
- Langtext: ${langtext || "—"}
- Einheit: ${einheit || "EH"}
- Menge: ${menge || 1}
- Erkanntes Gewerk: ${gewerk}
- Leistungsart: ${leistungsart}
- Bauverfahren: ${bauverfahren}

Projektkontext / Baustellenparameter:
${projectContextBlock}

RLC Preisbibliothek / interne Plausibilitätswerte:
${rlcPreisTreffer.length
  ? rlcPreisTreffer
      .map(
        (p, i) =>
          `${i + 1}. ${p.group} | ${p.name} | Einheit ${p.unit} | min ${p.minPrice} EUR | avg ${p.avgPrice} EUR | max ${p.maxPrice} EUR | Kategorie ${p.category}`
      )
      .join("\n")
  : "Keine passenden RLC-Bibliothekswerte."}
RLC Range für diese Position: min ${round2(n(rlcPreisRange.min))} EUR | avg ${round2(n(rlcPreisRange.avg))} EUR | max ${round2(n(rlcPreisRange.max))} EUR.

Datenbank-/Erfahrungswerte, falls vorhanden:
${matches.length
  ? matches
      .slice(0, 5)
      .map(
        (m, i) =>
          `${i + 1}. Pos ${s(m.row.positionNumber) || "—"} | ${s(m.row.shortText) || "ohne Text"} | Einheit ${s(m.row.unit) || "—"} | EP ${round2(n(m.row.unitPriceNet))} EUR | Score ${m.score}`
      )
      .join("\n")
  : "Keine verwertbaren Datenbanktreffer."}

Wichtig:
- Nutze vorhandene Datenbank-/Erfahrungswerte als wichtige Referenz, aber nicht blind.
- Prüfe immer die Plausibilität des Datenbankpreises gegen LV-Text, Schichtdicken, Material, Entsorgung, Transport, Personal und Maschinen.
- Wenn der Datenbankpreis nur Material oder nur Teilleistung abbildet, ergänze fehlende Leistungen.
- Wenn der Datenbankpreis für die vollständige Position offensichtlich zu niedrig oder zu hoch ist, gib eine Warnung und eine fachlich plausible korrigierte Urkalkulation aus.
- Wenn der Datenbankpreis plausibel ist, übernimm ihn bzw. leite den Preis daraus ab.
- Antworte ausschließlich als JSON.
- Keine Markdown-Erklärung.
- Alle Preise netto in EUR pro Einheit.
- WICHTIG: Gemeinkosten, Risiko und Gewinn müssen als absolute EUR-Beträge ausgegeben werden, niemals als Prozentzahl.
- Beispiel falsch: Gewinn price 15 total 15, wenn 15 % gemeint sind.
- Beispiel richtig: Gewinn 15 % von 100000 EUR = price 15000 total 15000.
- finalUnitPrice muss exakt die Summe der priceBreakdown-total-Werte pro Einheit sein.
- priceBreakdown muss eine professionelle Urkalkulation pro Einheit enthalten.
- Verwende realistische, konservative Baustellenwerte, nicht zu niedrige Fantasiepreise.
- Bei kontextabhängigen Positionen wie Baustelleneinrichtung, Vorhaltung, Verkehrssicherung, Dokumentation oder Vermessung musst du Projektdauer, Entfernung, Personal, Geräte, Container, Logistik und Gemeinkosten ausdrücklich berücksichtigen.
- Wenn Projektdauer oder Entfernung angegeben sind, darfst du nicht schreiben, dass Dauer/Entfernung/Projektgröße fehlen.
- Bei langen Baustellenlaufzeiten muss die Vorhaltung über die gesamte Laufzeit plausibel berücksichtigt werden.

Spezialregel für Baustelleneinrichtung / Vorhaltung / Baustellengemeinkosten:
- Kalkuliere nicht als grobe Pauschale, sondern als nachvollziehbare zeitabhängige Urkalkulation.
- Berechne die Laufzeit aus Projektdauer: Monate = Projektdauer / 30, Tage = Projektdauer.
- Container, Baustrom, Bauwasser, Sanitär, Lagerflächen und sonstige Baustelleneinrichtung müssen über die Laufzeit monatlich oder tageweise kalkuliert werden.
- Gerätevorhaltung darf nicht symbolisch mit kleinen Pauschalen angesetzt werden, sondern muss über Laufzeit, Geräteart und realistische Vorhaltekosten bewertet werden.
- Personal darf nicht als komplette Kolonne über 730 Tage voll gerechnet werden, wenn es sich nur um Baustelleneinrichtung/Vorhaltung handelt; kalkuliere stattdessen anteilige Einrichtung, Kontrolle, Bauleitung, Polier, Koordination und laufende Betreuung.
- Antransport, Abtransport, Geräteumsetzung und Entfernung zur Baustelle müssen separat berücksichtigt werden.
- Baustellengemeinkosten müssen zur Projektdauer passen und dürfen bei langen Laufzeiten nicht unrealistisch niedrig sein.
- Gib die priceBreakdown-Zeilen so aus, dass man Dauer, Monatsansatz oder Tagesansatz erkennen kann.
- Beispielstruktur:
  1. Antransport / Aufbau
  2. Container / Baustelleneinrichtung monatlich
  3. Baustrom / Bauwasser / Sanitär monatlich
  4. Gerätevorhaltung / Kleingeräte / Sicherung
  5. Bauleitung / Polier / Koordination anteilig
  6. Logistik / Fahrten / Entfernung
  7. Gemeinkosten
  8. Risiko
  9. Gewinn

Spezialregel für Verkehrssicherung / Verkehrsführung / RSA:
- Wenn der LV-Text Verkehrssicherung, Verkehrsführung, Straßensperrung, Beschilderung, Absperrung, Lichtsignalanlage oder Ampel enthält, kalkuliere zeitabhängig über die volle Projektdauer.
- Verwende die angegebene Projektdauer strikt. Beispiel: Bei 180 Tagen darf eine Lichtsignalanlage nicht nur über 30 Tage kalkuliert werden.
- Beschilderung, Absperrmaterial, Leitbaken, Verkehrszeichen, Sperrmaterial und mobile Lichtsignalanlage müssen als eigene priceBreakdown-Zeilen erscheinen, wenn sie im LV-Text genannt sind.
- Regelmäßige Kontrollen, Wartung, Anpassung der Verkehrsführung, RSA/StVO-Auflagen und Genehmigungs-/Koordinationsaufwand müssen separat berücksichtigt werden.
- Logistik, Anfahrt, Aufbau, Umbau und Abbau müssen separat kalkuliert werden, besonders wenn eine Entfernung angegeben ist.
- Bei langer Laufzeit müssen Miete/Vorhaltung der Lichtsignalanlage, Beschilderung und Absperrmaterial über die gesamte Laufzeit plausibel gerechnet werden.
- Beispielstruktur:
  1. Beschilderung / Verkehrszeichen
  2. Absperrmaterial / Leitbaken / Sperrmaterial
  3. Lichtsignalanlage / Ampel über komplette Laufzeit
  4. Kontrollen / Wartung / Anpassung Verkehrsführung
  5. Aufbau / Umbau / Abbau
  6. Logistik / Fahrten / Entfernung
  7. Gemeinkosten
  8. Risiko
  9. Gewinn

Spezialregel für Schutzmaßnahmen / Umwelt / Natur / Anwohner:
- Wenn der LV-Text Schutzmaßnahmen, Lärmschutz, Staubschutz, Erschütterungsschutz, Baumschutz, Wurzelschutz, Gewässerschutz, Ölbindemittel, Havarie-Schutz, Anwohnerinformation, Beweissicherung oder Zustandsdokumentation enthält, kalkuliere NICHT als allgemeine Dokumentation oder Baustelleneinrichtung.
- Diese Position muss als Schutzmaßnahmenpaket über Dauer, Aufbau, Kontrolle, Unterhaltung, Dokumentation und Rückbau kalkuliert werden.
- Lärmschutz/Staubschutz/Erschütterungsschutz müssen separat erscheinen, wenn genannt.
- Baum-/Wurzelschutz und Gewässerschutz müssen separat erscheinen, wenn genannt.
- Ölbindemittel/Havarie-Schutz müssen separat erscheinen, wenn genannt.
- Anwohnerinformation, Beweissicherung und Zustandsdokumentation müssen separat erscheinen, wenn genannt.
- Regelmäßige Kontrolle/Unterhaltung über die Laufzeit muss separat erscheinen.
- Rückbau/Abbau und Logistik müssen separat kalkuliert werden.
- Beispielstruktur:
  1. Lärmschutz / Staubschutz / Erschütterungsschutz
  2. Baumschutz / Wurzelschutz
  3. Gewässerschutz / Ölbindemittel / Havarie-Schutz
  4. Anwohnerinformation
  5. Beweissicherung / Zustandsdokumentation
  6. Kontrolle / Unterhaltung während Laufzeit
  7. Rückbau / Abbau / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Prüfungen / Abnahmen / technische Nachweise:
- Wenn der LV-Text Dichtheitsprüfung, Druckprüfung, Spülung, TV-Inspektion, Kamerabefahrung, Prüfprotokolle, Abnahmeunterlagen, Funktionsprüfung oder Bestandsfreigabe enthält, kalkuliere NICHT als allgemeine Dokumentation, Vorhaltung oder normale Rohrleitung.
- Diese Position muss als technische Prüf-/Nachweisleistung kalkuliert werden.
- Spülung/Reinigung muss separat erscheinen, wenn genannt.
- TV-Inspektion/Kamerabefahrung muss separat erscheinen, wenn genannt.
- Dichtheitsprüfung/Druckprüfung muss separat erscheinen, wenn genannt.
- Prüfgerät/Messgerät/TV-Kamera/Spülfahrzeug muss separat berücksichtigt werden.
- Auswertung, Prüfprotokolle, Dokumentation, Abnahmeunterlagen und Bestandsfreigabe müssen separat erscheinen.
- Anfahrt/Logistik muss separat kalkuliert werden, wenn Entfernung angegeben ist.
- Bei Einheit m muss der EP längenbezogen realistisch bleiben; Gemeinkosten, Risiko und Gewinn dürfen nicht als riesige €/m-Werte angesetzt werden.
- Beispielstruktur:
  1. Spülung / Reinigung Leitung
  2. TV-Inspektion / Kamerabefahrung
  3. Dichtheitsprüfung / Druckprüfung
  4. Prüfgerät / TV-Kamera / Spülfahrzeug
  5. Auswertung / Prüfprotokolle / Dokumentation
  6. Abnahmeunterlagen / Bestandsfreigabe
  7. Anfahrt / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Entsorgung / Deponie / belasteter Boden / Haufwerk / Analytik:
- Wenn der LV-Text Entsorgung, Deponie, belasteter Boden, Haufwerk, Probenahme, Deklarationsanalytik, ErsatzbaustoffV, LAGA, Wiegescheine oder Entsorgungsnachweise enthält, kalkuliere NICHT als Reinigung oder einfache Transportposition.
- Diese Position muss aus mehreren Kostenblöcken aufgebaut werden: Probenahme, Analytik, Klassifizierung, Laden, Transport, Deponiegebühren, Nachweise und Risiko.
- Deponieklasse/Materialklasse ist entscheidend. Wenn sie fehlt, muss die Kalkulation prüfpflichtig bleiben.
- Transport muss über Entfernung, LKW-Fahrten, Menge und Dichte plausibel gerechnet werden.
- Deponiegebühren müssen separat erscheinen.
- Analytik/Probenahme/Deklaration müssen separat erscheinen, wenn genannt.
- Wiegescheine, Entsorgungsnachweise und Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Probenahme / Haufwerksbeprobung
  2. Deklarationsanalytik / Einstufung ErsatzbaustoffV/LAGA
  3. Laden / Umschlag
  4. Transport zur Deponie
  5. Deponiegebühren / Annahmegebühren
  6. Wiegescheine / Entsorgungsnachweise
  7. Bauleitung / Nachweisführung
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für temporäre Anschlüsse / Notleitungen / provisorische Medienversorgung:
- Wenn der LV-Text temporärer Anschluss, temporäre Anschlüsse, Notleitung, provisorische Leitung, provisorische Medienversorgung, Ersatzversorgung, Anschluss an Bestand, Druckprüfung, Absperrarmaturen, Formstücke oder tägliche Kontrolle enthält, kalkuliere NICHT als normale Rohrleitungsposition.
- Diese Position muss als vollständige temporäre Versorgungsmaßnahme kalkuliert werden: Herstellen, Anschließen, Prüfen, Betreiben/Vorhalten, Kontrollieren und Rückbauen.
- Rohrmaterial, Formstücke, Absperrarmaturen und Verbindungsteile müssen separat erscheinen, wenn genannt.
- Anschluss an Bestand / Bestandseinbindung muss separat erscheinen.
- Druckprüfung / Spülung / Inbetriebnahme muss separat erscheinen, wenn genannt.
- Vorhaltung/Betrieb über die angegebene Laufzeit muss separat erscheinen.
- Tägliche/regelmäßige Kontrolle und Wartung müssen separat erscheinen.
- Rückbau, Trennung, Laden, Abtransport und Wiederherstellung müssen separat erscheinen.
- Logistik/Anfahrt/Materialanlieferung muss separat kalkuliert werden.
- Beispielstruktur:
  1. Rohrmaterial / Formstücke / Armaturen
  2. Herstellen / Verlegen temporäre Notleitung
  3. Anschluss an Bestand / Einbindung
  4. Druckprüfung / Spülung / Inbetriebnahme
  5. Vorhaltung / Betrieb über Laufzeit
  6. Kontrolle / Wartung
  7. Rückbau / Trennung / Abtransport
  8. Logistik / Anfahrt / Materialtransporte
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Schutzmaßnahmen / Umwelt / Natur / Anwohner:
- Wenn der LV-Text Schutzmaßnahmen, Lärmschutz, Staubschutz, Erschütterungsschutz, Baumschutz, Wurzelschutz, Gewässerschutz, Ölbindemittel, Havarie-Schutz, Anwohnerinformation, Beweissicherung oder Zustandsdokumentation enthält, kalkuliere NICHT als allgemeine Dokumentation oder Baustelleneinrichtung.
- Diese Position muss als Schutzmaßnahmenpaket über Dauer, Aufbau, Kontrolle, Unterhaltung, Dokumentation und Rückbau kalkuliert werden.
- Lärmschutz/Staubschutz/Erschütterungsschutz müssen separat erscheinen, wenn genannt.
- Baum-/Wurzelschutz und Gewässerschutz müssen separat erscheinen, wenn genannt.
- Ölbindemittel/Havarie-Schutz müssen separat erscheinen, wenn genannt.
- Anwohnerinformation, Beweissicherung und Zustandsdokumentation müssen separat erscheinen, wenn genannt.
- Regelmäßige Kontrolle/Unterhaltung über die Laufzeit muss separat erscheinen.
- Rückbau/Abbau und Logistik müssen separat kalkuliert werden.
- Beispielstruktur:
  1. Lärmschutz / Staubschutz / Erschütterungsschutz
  2. Baumschutz / Wurzelschutz
  3. Gewässerschutz / Ölbindemittel / Havarie-Schutz
  4. Anwohnerinformation
  5. Beweissicherung / Zustandsdokumentation
  6. Kontrolle / Unterhaltung während Laufzeit
  7. Rückbau / Abbau / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Prüfungen / Abnahmen / technische Nachweise:
- Wenn der LV-Text Dichtheitsprüfung, Druckprüfung, Spülung, TV-Inspektion, Kamerabefahrung, Prüfprotokolle, Abnahmeunterlagen, Funktionsprüfung oder Bestandsfreigabe enthält, kalkuliere NICHT als allgemeine Dokumentation, Vorhaltung oder normale Rohrleitung.
- Diese Position muss als technische Prüf-/Nachweisleistung kalkuliert werden.
- Spülung/Reinigung muss separat erscheinen, wenn genannt.
- TV-Inspektion/Kamerabefahrung muss separat erscheinen, wenn genannt.
- Dichtheitsprüfung/Druckprüfung muss separat erscheinen, wenn genannt.
- Prüfgerät/Messgerät/TV-Kamera/Spülfahrzeug muss separat berücksichtigt werden.
- Auswertung, Prüfprotokolle, Dokumentation, Abnahmeunterlagen und Bestandsfreigabe müssen separat erscheinen.
- Anfahrt/Logistik muss separat kalkuliert werden, wenn Entfernung angegeben ist.
- Bei Einheit m muss der EP längenbezogen realistisch bleiben; Gemeinkosten, Risiko und Gewinn dürfen nicht als riesige €/m-Werte angesetzt werden.
- Beispielstruktur:
  1. Spülung / Reinigung Leitung
  2. TV-Inspektion / Kamerabefahrung
  3. Dichtheitsprüfung / Druckprüfung
  4. Prüfgerät / TV-Kamera / Spülfahrzeug
  5. Auswertung / Prüfprotokolle / Dokumentation
  6. Abnahmeunterlagen / Bestandsfreigabe
  7. Anfahrt / Logistik
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für Entsorgung / Deponie / belasteter Boden / Haufwerk / Analytik:
- Wenn der LV-Text Entsorgung, Deponie, belasteter Boden, Haufwerk, Probenahme, Deklarationsanalytik, ErsatzbaustoffV, LAGA, Wiegescheine oder Entsorgungsnachweise enthält, kalkuliere NICHT als Reinigung oder einfache Transportposition.
- Diese Position muss aus mehreren Kostenblöcken aufgebaut werden: Probenahme, Analytik, Klassifizierung, Laden, Transport, Deponiegebühren, Nachweise und Risiko.
- Deponieklasse/Materialklasse ist entscheidend. Wenn sie fehlt, muss die Kalkulation prüfpflichtig bleiben.
- Transport muss über Entfernung, LKW-Fahrten, Menge und Dichte plausibel gerechnet werden.
- Deponiegebühren müssen separat erscheinen.
- Analytik/Probenahme/Deklaration müssen separat erscheinen, wenn genannt.
- Wiegescheine, Entsorgungsnachweise und Dokumentation müssen separat erscheinen.
- Beispielstruktur:
  1. Probenahme / Haufwerksbeprobung
  2. Deklarationsanalytik / Einstufung ErsatzbaustoffV/LAGA
  3. Laden / Umschlag
  4. Transport zur Deponie
  5. Deponiegebühren / Annahmegebühren
  6. Wiegescheine / Entsorgungsnachweise
  7. Bauleitung / Nachweisführung
  8. Gemeinkosten
  9. Risiko
  10. Gewinn

Spezialregel für temporäre Anschlüsse / Notleitungen / provisorische Medienversorgung:
- Wenn der LV-Text temporärer Anschluss, temporäre Anschlüsse, Notleitung, provisorische Leitung, provisorische Medienversorgung, Ersatzversorgung, Anschluss an Bestand, Druckprüfung, Absperrarmaturen, Formstücke oder tägliche Kontrolle enthält, kalkuliere NICHT als normale Rohrleitungsposition.
- Diese Position muss als vollständige temporäre Versorgungsmaßnahme kalkuliert werden: Herstellen, Anschließen, Prüfen, Betreiben/Vorhalten, Kontrollieren und Rückbauen.
- Rohrmaterial, Formstücke, Absperrarmaturen und Verbindungsteile müssen separat erscheinen, wenn genannt.
- Anschluss an Bestand / Bestandseinbindung muss separat erscheinen.
- Druckprüfung / Spülung / Inbetriebnahme muss separat erscheinen, wenn genannt.
- Vorhaltung/Betrieb über die angegebene Laufzeit muss separat erscheinen.
- Tägliche/regelmäßige Kontrolle und Wartung müssen separat erscheinen.
- Rückbau, Trennung, Laden, Abtransport und Wiederherstellung müssen separat erscheinen.
- Logistik/Anfahrt/Materialanlieferung muss separat kalkuliert werden.
- Beispielstruktur:
  1. Rohrmaterial / Formstücke / Armaturen
  2. Herstellen / Verlegen temporäre Notleitung
  3. Anschluss an Bestand / Einbindung
  4. Druckprüfung / Spülung / Inbetriebnahme
  5. Vorhaltung / Betrieb über Laufzeit
  6. Kontrolle / Wartung
  7. Rückbau / Trennung / Abtransport
  8. Logistik / Anfahrt / Materialtransporte
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Provisorien / Umleitungen / temporäre Baustraßen / temporäre Anschlüsse:
- Wenn der LV-Text Provisorium, provisorisch, Baustraße, Umleitung, Baustellenumleitung, temporärer Anschluss, temporäre Zufahrt, Vorhalten, Unterhalten oder Rückbau enthält, kalkuliere NICHT als normale Materialposition.
- Diese Position muss als vollständige temporäre Maßnahme kalkuliert werden: Herstellen, Vorhalten, Unterhalten, Anpassen, Reinigen und Rückbauen.
- Material wie Schottertragschicht, Geotextil, Platten, Rohre, Kabel, Absperrung oder Beschilderung muss als realistische Pauschale oder Mengenannahme erscheinen, niemals als symbolischer Kleinstwert.
- Vorhaltung über die angegebene Dauer muss separat berücksichtigt werden.
- Unterhaltung/Reinigung/Anpassung während der Laufzeit muss separat erscheinen.
- Rückbau, Laden, Abtransport und Entsorgung/Wiederverwertung müssen separat erscheinen.
- Logistik/Anfahrt/Materialanlieferung muss separat kalkuliert werden.
- Wenn Herstellen/Einbau genannt ist, muss eine eigene priceBreakdown-Zeile "Herstellung / Einbau provisorische Baustraße" erscheinen.
- Wenn Unterhalten/Reinigung/Anpassung genannt ist, muss EXAKT eine eigene priceBreakdown-Zeile "Unterhaltung / Reinigung / Anpassung während Laufzeit" erscheinen. Diese Kosten dürfen nicht in Gemeinkosten versteckt werden.
- Wenn Umleitung/Beschilderung genannt ist, muss EXAKT eine eigene priceBreakdown-Zeile "Beschilderung / Umleitung / Verkehrsführung" erscheinen. Diese Kosten dürfen nicht in Gemeinkosten versteckt werden.
- Wenn Rückbau genannt ist, muss eine eigene priceBreakdown-Zeile "Rückbau / Laden / Abtransport" erscheinen.
- Wenn eine dieser LV-Komponenten fehlt, ist die Kalkulation unvollständig.
- Beispielstruktur:
  1. Herstellen provisorische Baustraße / Umleitung
  2. Material Schotter / Geotextil / Tragschicht
  3. Maschinen / Einbau / Verdichtung
  4. Vorhaltung über Laufzeit
  5. Unterhaltung / Reinigung / Anpassung
  6. Beschilderung / Verkehrsführung
  7. Rückbau / Laden / Abtransport
  8. Logistik / Anfahrt / Materialtransporte
  9. Gemeinkosten
  10. Risiko
  11. Gewinn

Spezialregel für Wasserhaltung / Pumpen / Grundwasser / Baugrubenentwässerung:
- Wenn der LV-Text Wasserhaltung, Pumpen, Tauchpumpen, Grundwasser, Baugrubenentwässerung, Ableitung des Wassers, Vorfluter, Kanal, Schläuche oder Stromversorgung enthält, kalkuliere NICHT als Baustelleneinrichtungspauschale.
- Diese Position ist eine zeitabhängige Wasserhaltungs-/Pumpenkalkulation.
- Pumpen-Vorhaltung muss separat erscheinen: Tauchpumpen, Ersatzpumpe, Pumpentechnik.
- Schläuche, Leitungen, Ableitung in Kanal/Vorfluter müssen separat erscheinen, wenn genannt.
- Stromversorgung und Stromkosten müssen separat berücksichtigt werden.
- Regelmäßige Kontrolle, Wartung, Reinigung und Funktionsprüfung müssen separat erscheinen.
- Risiko für Pumpenausfall, Starkregen, höheren Grundwasserandrang und 24h-Betrieb muss berücksichtigt werden.
- Wenn Dauer angegeben ist, müssen Pumpen, Strom und Kontrolle über die volle Dauer plausibel gerechnet werden.
- Beispielstruktur:
  1. Pumpen-Vorhaltung / Tauchpumpen / Ersatzpumpe
  2. Schläuche / Leitungen / Ableitung
  3. Stromversorgung / Stromkosten
  4. Kontrolle / Wartung / Funktionsprüfung
  5. Aufbau / Abbau / Logistik / Anfahrt
  6. Gemeinkosten
  7. Risiko
  8. Gewinn

Spezialregel für Gerätevorhaltung / Bauzeitunterbrechung / Stillstand / Wartezeiten:
- Wenn der LV-Text Gerätevorhaltung, Vorhaltung, Bauzeitunterbrechung, Stillstand, Wartezeit, Wartezeiten, behördliche Freigaben, Leitungsfreigaben oder Bauablaufstörungen enthält, kalkuliere NICHT als Baustelleneinrichtungspauschale.
- Diese Position muss als zeitabhängige Vorhalte-/Stillstandskalkulation aufgebaut werden.
- Gerätevorhaltung muss separat erscheinen: z.B. Bagger, Verdichtungsgerät, Kleingeräte, Baustelleneinrichtung.
- Personal-Wartezeiten müssen separat erscheinen: z.B. Polier anteilig, Maschinist anteilig, Bauleitung/Koordination.
- Stillstand/Wartezeit darf nicht mit voller Kolonne über die gesamte Dauer gerechnet werden, sondern mit realistischen Anteilen oder betroffenen Tagen/Stunden.
- Erneute Anfahrt, Abfahrt, Umsetzen und Logistik müssen separat erscheinen, wenn Entfernung angegeben ist.
- Wenn Geräte teilweise auf der Baustelle bleiben, kalkuliere Vorhaltekosten über die Stillstands-/Unterbrechungsdauer.
- Beispielstruktur:
  1. Gerätevorhaltung Bagger / Kleingeräte
  2. Personal-Wartezeit / Polier / Maschinist anteilig
  3. Bauleitung / Koordination / Freigaben
  4. Stillstand / Bauablaufstörung
  5. Erneute Anfahrt / Logistik / Entfernung
  6. Gemeinkosten
  7. Risiko
  8. Gewinn

Spezialregel für Erschwernis / beengte Bauweise / schwierige Bauverhältnisse:
- Wenn der LV-Text Erschwernis, beengte Bauweise, beengte Verhältnisse, Handschachtung, Anliegerverkehr, bestehende Versorgungsleitungen, erschwerte Zugänglichkeit oder erschwerte Gerätebewegung enthält, kalkuliere NICHT als normale Tiefbauposition.
- Diese Position ist eine Zuschlags-/Erschwernisposition und muss aus Mehrzeit, Minderleistung, zusätzlicher Sicherung, Handarbeit, kleineren Geräten, Umsetzen der Geräte, Wartezeiten und Koordination berechnet werden.
- Kalkuliere nicht automatisch die komplette Kolonne über die gesamte Bauzeit als Vollleistung. Berechne stattdessen den zusätzlichen Mehraufwand gegenüber normaler Bauweise.
- Handschachtung muss separat erscheinen, wenn im LV genannt.
- Arbeiten neben bestehenden Versorgungsleitungen müssen separat als Sicherungs-/Suchschachtung-/Koordinationsaufwand erscheinen.
- Anliegerverkehr, beengte Zufahrt, Verkehrsbehinderung und zusätzliche Sicherung müssen separat bewertet werden, wenn genannt.
- Beispielstruktur:
  1. Mehrzeit Personal / Minderleistung
  2. Handschachtung / Arbeiten von Hand
  3. Kleingeräte / Minibagger / erschwerte Gerätebewegung
  4. Sicherung bestehender Leitungen / Suchschachtung
  5. Anliegerverkehr / beengte Logistik / Koordination
  6. Gemeinkosten
  7. Risiko
  8. Gewinn

Spezialregel für Dokumentation / Bestandspläne / Vermessung:
- Wenn der LV-Text Dokumentation, Fotodokumentation, Aufmaß, Bestandspläne, Vermessungsdaten, As-Built, Übergabeunterlagen oder Behördenabstimmung enthält, kalkuliere NICHT Bauleiter oder Vermessungstechniker full-time über die gesamte Bauzeit.
- Die Bauzeit ist nur ein Einflussfaktor für Umfang und Häufigkeit, aber keine Vollzeit-Arbeitszeit für Dokumentation.
- Kalkuliere realistische Teilaufwände: z.B. regelmäßige Fotodokumentation stundenweise, Aufmaßtermine tageweise, Vermessungseinsätze nach Anzahl Termine, CAD-/Bestandsplanbearbeitung als Büroaufwand, Übergabe/Abstimmung separat.
- Wenn keine genaue Anzahl Termine angegeben ist, verwende konservative Annahmen und schreibe sie in die note.
- Bestandsplan/CAD/DWG/PDF/LandXML/As-Built muss als eigene priceBreakdown-Zeile erscheinen, wenn im LV erwähnt.
- Fotodokumentation, Aufmaß, Vermessung, CAD-Bearbeitung, Übergabeunterlagen und Behörden-/AG-Abstimmung sollen getrennte Zeilen sein, wenn im LV genannt.
- Beispielstruktur:
  1. Fotodokumentation regelmäßig, stundenweise
  2. Aufmaß / Massenermittlung / Aufmaßunterlagen
  3. Vermessungseinsätze / GNSS / Tachymeter
  4. CAD-/Bestandsplanbearbeitung / As-Built
  5. Digitale Übergabeunterlagen / PDF/DWG/LandXML
  6. Abstimmung Auftraggeber / Behörden
  7. Gemeinkosten
  8. Risiko
  9. Gewinn
- Wenn der LV-Text Schichtdicken enthält, müssen diese technisch berechnet und als eigene Zeilen ausgegeben werden.
- Bei m²-Positionen gilt zwingend: cm-Schichtdicke / 100 = m³ je m².
- Verwende in priceBreakdown technische Einheiten, nicht pauschal immer m².
- Beispiel: Splittbett 5 cm = qty 0.05, unit "m³", price €/m³, total €/m².
- Beispiel: Frostschutzkies 35 cm = qty 0.35, unit "m³", price €/m³, total €/m².
- Beispiel: Auskofferung 50 cm = qty 0.50, unit "m³", price €/m³, total €/m².
- Entsorgung bei Aushub: m³ × ca. 1,8 t/m³ = t je m².
- Beispiel: 0,50 m³/m² Auskofferung × 1,8 t/m³ = 0,90 t/m² Entsorgung.
- Aushub/Auskofferung lösen und laden ist eine eigene Maschinen-/Personal- oder Erdarbeitszeile und darf nicht nur in Entsorgung versteckt werden.
- Entsorgung ist nur Deponie/Verwertung/Abfuhr des Materials.
- LKW / Transport für Materialanlieferung und LKW / Transport für Aushubabfuhr müssen getrennt werden, wenn beide vorkommen.
- Rasengitterpflaster / Pflasterflächen müssen getrennte Zeilen enthalten für:
  1. Rasengitter/Pflaster Material, unit "m²", qty 1
  2. Splittbett/Bettung, unit "m³", qty aus cm-Dicke berechnet
  3. Frostschutz/Tragschicht, unit "m³", qty aus cm-Dicke berechnet, falls erwähnt
  4. Auskofferung/Aushub lösen und laden, unit "m³", qty aus cm-Dicke berechnet, falls erwähnt
  5. Entsorgung Aushubmaterial, unit "t", qty aus m³ × 1,8 berechnet, falls Auskofferung/Aushub erwähnt
  6. LKW / Transport Materialanlieferung
  7. LKW / Transport Aushubabfuhr
  8. Personal/Facharbeiter/Helfer
  9. Maschinen/Bagger/Radlader/Rüttelplatte/Walze
  10. Gemeinkosten
  11. Risiko
  12. Gewinn
- Für Materialpreise verwende plausible Nettoansätze:
  Splitt 2/5 ca. 45–70 €/m³,
  Frostschutzkies 0/32 ca. 35–60 €/m³,
  Aushub lösen/laden ca. 8–18 €/m³,
  Aushub entsorgen ca. 18–45 €/t,
  Rasengitterpflaster Standard ca. 20–35 €/m², schwere/spezielle Ausführung ca. 35–60 €/m²,
  LKW/Transport je nach Anteil realistisch ansetzen.
- Transport darf nicht als Fremdleistung ausgegeben werden, sondern als Gruppe "LKW / Transport", außer es ist ausdrücklich Subunternehmerleistung.
- Entsorgung darf nicht generisch "Abfallentsorgung" heißen, sondern z.B. "Aushubmaterial entsorgen" oder "Asphaltaufbruch entsorgen".
- Bei Rasengitterpflaster mit 5 cm Splitt, 35 cm Frostschutz und 50 cm Auskofferung ist ein EP unter 70 €/m² in der Regel unplausibel, außer Material/Entsorgung/Transport sind ausdrücklich nicht enthalten.
- Kennzeichne die Schätzung als prüfpflichtig.

JSON-Schema:
{
  "materialCost": number,
  "laborCost": number,
  "machineCost": number,
  "subcontractorCost": number,
  "disposalCost": number,
  "overheadCost": number,
  "riskCost": number,
  "profitCost": number,
  "baseUnitPrice": number,
  "suggestedUnitPrice": number,
  "finalUnitPrice": number,
  "confidence": number,
  "riskLevel": "low" | "medium" | "high",
  "calculationStatus": "ok" | "warning" | "critical",
  "gewerk": string,
  "leistungsart": string,
  "bauverfahren": string,
  "warning": string,
  "aiReason": string,
  "priceBreakdown": [
    {
      "group": "Personal" | "Maschinen" | "LKW / Transport" | "Material" | "Entsorgung" | "Fremdleistung" | "Gemeinkosten" | "Risiko" | "Gewinn",
      "name": string,
      "unit": string,
      "qty": number,
      "price": number,
      "total": number,
      "note": string
    }
  ]
}
`;

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_KALKULATION_MODEL || "gpt-4o-mini",
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein präziser Bau-Kalkulator. Du lieferst ausschließlich valides JSON ohne Markdown.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== "object") return null;

  const materialCost = round2(n(parsed.materialCost));
  const laborCost = round2(n(parsed.laborCost));
  const machineCost = round2(n(parsed.machineCost));
  const subcontractorCost = round2(n(parsed.subcontractorCost));
  const disposalCost = round2(n(parsed.disposalCost));
  const overheadCost = round2(n(parsed.overheadCost));
  const riskCost = round2(n(parsed.riskCost));
  const profitCost = round2(n(parsed.profitCost));

  const directTotal =
    materialCost +
    laborCost +
    machineCost +
    subcontractorCost +
    disposalCost +
    overheadCost +
    riskCost +
    profitCost;

  const normalizedBreakdown = normalizePriceBreakdownPerUnit(parsed.priceBreakdown, einheit, menge);
  const fallbackBreakdown = buildPriceBreakdownFromCosts({
    einheit,
    materialCost,
    laborCost,
    machineCost,
    subcontractorCost,
    disposalCost,
    overheadCost,
    riskCost,
    profitCost,
  });

  const rawPriceBreakdown = normalizedBreakdown.length ? normalizedBreakdown : fallbackBreakdown;
  let priceBreakdown = sanitizeOverheadRiskProfit(
    mergePlausibilityLines(
      applyDatabaseMaterialPrices(technicalLayerPostprocess(rawPriceBreakdown, text), matches, text)
    ),
    {
      skipCaps: isContextSensitivePosition(text, einheit),
    }
  );
  let breakdownTotal = sumBreakdown(priceBreakdown);

  const disposalFallbackContext =
    /entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(norm(`${kurztext} ${langtext}`));

  if (disposalFallbackContext && breakdownTotal <= 0) {
    priceBreakdown = [
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Probenahme / Haufwerksbeprobung",
        unit: einheit,
        qty: 1,
        price: 10,
        total: 10,
        note: "Fallback: prüfpflichtige Schätzung, da Deponie-/Materialklasse fehlt.",
      },
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Deklarationsanalytik / Einstufung ErsatzbaustoffV/LAGA",
        unit: einheit,
        qty: 1,
        price: 15,
        total: 15,
        note: "Fallback: Analytik/Einstufung separat angesetzt.",
      },
      {
        id: crypto.randomUUID(),
        group: "Maschinen",
        name: "Laden / Umschlag",
        unit: einheit,
        qty: 1,
        price: 20,
        total: 20,
        note: "Fallback: Laden/Umschlag pro Einheit.",
      },
      {
        id: crypto.randomUUID(),
        group: "LKW / Transport",
        name: "Transport zur Deponie",
        unit: einheit,
        qty: 1,
        price: projectDistanceKm > 0 ? 30 : 20,
        total: projectDistanceKm > 0 ? 30 : 20,
        note: `Fallback: Transport prüfpflichtig kalkuliert${projectDistanceKm > 0 ? `, Entfernung ${projectDistanceKm} km` : ""}.`,
      },
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Deponiegebühren / Annahmegebühren",
        unit: einheit,
        qty: 1,
        price: 45,
        total: 45,
        note: "Fallback: Deponieklasse fehlt, daher konservative prüfpflichtige Annahme.",
      },
      {
        id: crypto.randomUUID(),
        group: "Entsorgung",
        name: "Wiegescheine / Entsorgungsnachweise",
        unit: einheit,
        qty: 1,
        price: 5,
        total: 5,
        note: "Fallback: Nachweise separat angesetzt.",
      },
      {
        id: crypto.randomUUID(),
        group: "Personal",
        name: "Bauleitung / Nachweisführung",
        unit: einheit,
        qty: 1,
        price: 6,
        total: 6,
        note: "Fallback: Nachweisführung/Bauleitung anteilig.",
      },
      {
        id: crypto.randomUUID(),
        group: "Gemeinkosten",
        name: "Gemeinkosten",
        unit: einheit,
        qty: 1,
        price: 10,
        total: 10,
        note: "Fallback: Gemeinkosten.",
      },
      {
        id: crypto.randomUUID(),
        group: "Risiko",
        name: "Risiko",
        unit: einheit,
        qty: 1,
        price: 8,
        total: 8,
        note: "Fallback: erhöhtes Risiko wegen fehlender Material-/Deponieklasse.",
      },
      {
        id: crypto.randomUUID(),
        group: "Gewinn",
        name: "Gewinn",
        unit: einheit,
        qty: 1,
        price: 12,
        total: 12,
        note: "Fallback: Gewinn.",
      },
    ];

    breakdownTotal = sumBreakdown(priceBreakdown);
  }

  /*
   * Harte Fachlogik:
   * Reine Abfuhr-/Transportpositionen ohne Entsorgung/Deponie dürfen von OpenAI
   * nicht wie Bodenentsorgung kalkuliert werden.
   */
  const ntOpenAi = norm(text);
  const isPureTransportWithoutDisposal =
    (ntOpenAi.includes("abfuhr") ||
      ntOpenAi.includes("abfahren") ||
      ntOpenAi.includes("transport")) &&
    !ntOpenAi.includes("entsorgung") &&
    !ntOpenAi.includes("deponie") &&
    !ntOpenAi.includes("verwertung");

  const rlcTransportAvg = round2(n(rlcPreisRange.avg));
  const rlcTransportMax = round2(n(rlcPreisRange.max));

  if (
    isPureTransportWithoutDisposal &&
    rlcTransportAvg > 0 &&
    rlcTransportMax > 0 &&
    breakdownTotal > rlcTransportMax
  ) {
    priceBreakdown = [
      {
        id: "openai-transport-rlc-deckel",
        group: "LKW / Transport",
        name: "Abfuhr / Transport gemäß RLC Preisbibliothek",
        unit: einheit || "t",
        qty: 1,
        price: rlcTransportAvg,
        total: rlcTransportAvg,
        note: "OpenAI-Wert wurde gedeckelt: reine Transportposition ohne Entsorgung/Deponie.",
      },
    ];
    breakdownTotal = rlcTransportAvg;
  }

  if (disposalFallbackContext && priceBreakdown.length) {
    const disposalDirectGroups: PriceBreakdownGroup[] = [
      "Material",
      "Personal",
      "Maschinen",
      "LKW / Transport",
      "Entsorgung",
      "Fremdleistung",
      "Gemeinkosten",
    ];

    const disposalBase = round2(
      priceBreakdown
        .filter((x) => disposalDirectGroups.includes(x.group))
        .reduce((sum, x) => sum + n(x.total), 0)
    );

    if (disposalBase > 0) {
      const maxRisk = round2(disposalBase * 0.12);
      const maxProfit = round2(disposalBase * 0.15);

      for (const line of priceBreakdown) {
        if (line.group === "Risiko" && n(line.total) > maxRisk) {
          line.qty = 1;
          line.price = maxRisk;
          line.total = maxRisk;
          line.note = "RLC Guard: Risiko für Entsorgung auf plausiblen Maximalwert begrenzt, da OpenAI Wert pro m³ unplausibel hoch war.";
        }

        if (line.group === "Gewinn" && n(line.total) > maxProfit) {
          line.qty = 1;
          line.price = maxProfit;
          line.total = maxProfit;
          line.note = "RLC Guard: Gewinn für Entsorgung auf plausiblen Maximalwert begrenzt, da OpenAI Wert pro m³ unplausibel hoch war.";
        }
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  const testingGuardContext =
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(norm(`${kurztext} ${langtext}`));

  if (testingGuardContext && priceBreakdown.length) {
    const testingDirectGroups: PriceBreakdownGroup[] = [
      "Material",
      "Personal",
      "Maschinen",
      "LKW / Transport",
      "Fremdleistung",
    ];

    const testingBase = round2(
      priceBreakdown
        .filter((x) => testingDirectGroups.includes(x.group))
        .reduce((sum, x) => sum + n(x.total), 0)
    );

    if (testingBase > 0) {
      const maxOverhead = round2(testingBase * 0.12);
      const maxRisk = round2(testingBase * 0.08);
      const maxProfit = round2(testingBase * 0.12);

      for (const line of priceBreakdown) {
        if (line.group === "Gemeinkosten" && n(line.total) > maxOverhead) {
          line.qty = 1;
          line.price = maxOverhead;
          line.total = maxOverhead;
          line.note = "RLC Guard: Gemeinkosten für Prüf-/Nachweisleistung auf plausiblen Maximalwert begrenzt.";
        }

        if (line.group === "Risiko" && n(line.total) > maxRisk) {
          line.qty = 1;
          line.price = maxRisk;
          line.total = maxRisk;
          line.note = "RLC Guard: Risiko für Prüf-/Nachweisleistung auf plausiblen Maximalwert begrenzt.";
        }

        if (line.group === "Gewinn" && n(line.total) > maxProfit) {
          line.qty = 1;
          line.price = maxProfit;
          line.total = maxProfit;
          line.note = "RLC Guard: Gewinn für Prüf-/Nachweisleistung auf plausiblen Maximalwert begrenzt.";
        }
      }

      const directAfterCaps = round2(
        priceBreakdown
          .filter((x) => testingDirectGroups.includes(x.group))
          .reduce((sum, x) => sum + n(x.total), 0)
      );

      const minRisk = round2(directAfterCaps * 0.03);
      const minProfit = round2(directAfterCaps * 0.05);

      for (const line of priceBreakdown) {
        if (line.group === "Risiko" && n(line.total) < minRisk) {
          line.qty = 1;
          line.price = minRisk;
          line.total = minRisk;
          line.note = "RLC Guard: Risiko für Prüf-/Nachweisleistung auf Mindestwert 3% der Direktkosten gesetzt.";
        }

        if (line.group === "Gewinn" && n(line.total) < minProfit) {
          line.qty = 1;
          line.price = minProfit;
          line.total = minProfit;
          line.note = "RLC Guard: Gewinn für Prüf-/Nachweisleistung auf Mindestwert 5% der Direktkosten gesetzt.";
        }
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }

    const testingRlcMax = n(rlcPreisRange?.max);
    const testingHardCap = round2(Math.max(testingRlcMax > 0 ? testingRlcMax * 1.8 : 0, 45));

    if (testingHardCap > 0 && breakdownTotal > testingHardCap) {
      const factor = testingHardCap / breakdownTotal;

      for (const line of priceBreakdown) {
        line.price = round2(n(line.price) * factor);
        line.total = round2(n(line.total) * factor);
        line.note = `${s(line.note)} · RLC Guard: Prüf-/Nachweisleistung auf fachlichen Maximalwert ${testingHardCap} EUR/${einheit} skaliert.`;
      }

      breakdownTotal = sumBreakdown(priceBreakdown);
    }
  }

  /**
   * Quelle der Wahrheit ist ab hier die Urkalkulation pro Einheit.
   * Dadurch bleiben Hauptkosten, EP, PDF und Frontend immer konsistent.
   */
  const normalizedMaterialCost = sumBreakdownGroup(priceBreakdown, ["Material"]);
  const normalizedLaborCost = sumBreakdownGroup(priceBreakdown, ["Personal"]);
  const normalizedMachineCost = sumBreakdownGroup(priceBreakdown, [
    "Maschinen",
    "LKW / Transport",
  ]);
  const normalizedSubcontractorCost = sumBreakdownGroup(priceBreakdown, ["Fremdleistung"]);
  const normalizedDisposalCost = sumBreakdownGroup(priceBreakdown, ["Entsorgung"]);
  const normalizedOverheadCost = sumBreakdownGroup(priceBreakdown, ["Gemeinkosten"]);
  const normalizedRiskCost = sumBreakdownGroup(priceBreakdown, ["Risiko"]);
  const normalizedProfitCost = sumBreakdownGroup(priceBreakdown, ["Gewinn"]);

  const suggestedUnitPrice = round2(breakdownTotal || directTotal);
  const finalUnitPrice = suggestedUnitPrice;

  const rawRisk = s(parsed.riskLevel);
  const riskLevel: RiskLevel =
    rawRisk === "low" || rawRisk === "medium" || rawRisk === "high"
      ? rawRisk
      : riskFromText(text, einheit, menge);

  const confidence = Math.max(
    0.25,
    Math.min(0.92, round2(n(parsed.confidence, confidenceFrom(row, riskLevel, matches, "openai"))))
  );

  const contextSensitiveOpenAi = isContextSensitivePosition(text, einheit);

  const contextQualityWarnings: string[] = [];

  if (contextSensitiveOpenAi) {
    const months = projectDurationDays > 0 ? projectDurationDays / 30 : 0;

    const contextBreakdownText = norm(
      priceBreakdown
        .map((x) => `${x.group} ${x.name} ${x.unit} ${x.qty} ${x.price} ${x.total} ${x.note}`)
        .join(" ")
    );

    const rowContextText = norm(`${kurztext} ${langtext}`);

    const isProtectionContext =
      /schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz/.test(rowContextText);

    const isTemporarySupplyContext =
      !isProtectionContext &&
      /notleitung|temporaer.*anschluss|temporär.*anschluss|temporaere.*anschluesse|temporäre.*anschlüsse|provisorische leitung|medienversorgung|ersatzversorgung|anschluss an bestand|druckpruefung|druckprüfung|absperrarmatur|formstueck|formstück/.test(rowContextText);

    const isProvisoriumContext =
      !isProtectionContext &&
      !isTemporarySupplyContext &&
      /provisor|baustrasse|baustraße|umleitung|baustellenumleitung|temporaer|temporär|rueckbau|rückbau|unterhalten|unterhaltung/.test(rowContextText);

    const isTrafficSafetyContext =
      !isProtectionContext &&
      !isProvisoriumContext &&
      /verkehrssicherung|verkehrsfuehrung|verkehrsführung|strassensperrung|straßensperrung|sperrung|beschilderung|lichtsignalanlage|ampel|\brsa\b/.test(rowContextText);

    const isTestingContext =
      !isProtectionContext &&
      /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(rowContextText);

    const isDocumentationContext =
      !isProtectionContext &&
      !isTestingContext &&
      /dokumentation|fotodokumentation|aufmass|aufmaß|bestandsplan|bestandsplaene|bestandspläne|vermessung|vermessungsdaten|as-built|as built|uebergabeunterlagen|übergabeunterlagen|behoerden|behörden|auftraggeber/.test(rowContextText);

    const isVorhaltungContext =
      !isProtectionContext &&
      !isTestingContext &&
      /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|freigabe|bauablaufstoerung|bauablaufstörung/.test(rowContextText);

    const isSiteSetupContext =
      !isProtectionContext &&
      !isTrafficSafetyContext &&
      !isDocumentationContext &&
      !isVorhaltungContext &&
      /baustelleneinrichtung|vorhaltung|baustellengemeinkosten|container|baustrom|bauwasser|sanitaer|sanitär/.test(rowContextText);

    const hasContainer = /container|baustelleneinrichtung/.test(contextBreakdownText);
    const hasUtilities = /baustrom|bauwasser|sanitaer|sanitär|toilette|wc/.test(contextBreakdownText);
    const hasTransport = /antransport|abtransport|transport|fahrt|fahrten|logistik|anfahrt/.test(contextBreakdownText);

    const hasProtectionNoiseDustVibration = /lärmschutz|laermschutz|staubschutz|erschütterung|erschuetterung/.test(contextBreakdownText);
    const hasProtectionTreeRoot = /baumschutz|wurzelschutz|baum|wurzel/.test(contextBreakdownText);
    const hasProtectionWaterHavarie = /gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie/.test(contextBreakdownText);
    const hasProtectionResidents = /anwohner|information|bürger|buerger/.test(contextBreakdownText);
    const hasProtectionEvidence = /beweissicherung|zustandsdokumentation|zustand|dokumentation/.test(contextBreakdownText);
    const hasProtectionControl = /kontrolle|unterhaltung|wartung|regelmäßig|regelmaessig/.test(contextBreakdownText);
    const hasProtectionRemovalLogistics = /rückbau|rueckbau|abbau|logistik|anfahrt/.test(contextBreakdownText);
    const hasCoordination = /bauleitung|polier|koordination|baustellenkoordination|kontrolle|kontrollen|wartung/.test(contextBreakdownText);
    const hasTemporalBasis = /monat|monate|monatlich|tag|tage|taeglich|täglich|laufzeit|vorhaltung|miete|wartung|stunde|stunden|\bh\b|termin|termine|einsatz|einsaetze|einsätze/.test(contextBreakdownText);

    const hasTrafficSigns = /beschilderung|schild|schilder|verkehrszeichen/.test(contextBreakdownText);
    const hasBarrierMaterial = /absperr|bake|leitbake|leitkegel|schranke|sperr/.test(contextBreakdownText);
    const hasTrafficLight = /lichtsignalanlage|ampel|lsa/.test(contextBreakdownText);
    const hasTrafficControl = /verkehrsfuehrung|verkehrsführung|kontrolle|kontrollen|wartung|anpassung|\brsa\b|stvo|genehmigung/.test(contextBreakdownText);

    const hasPhotoDocumentation = /fotodokumentation|foto|bilder/.test(contextBreakdownText);
    const hasAufmass = /aufmass|aufmaß|massenermittlung|massen/.test(contextBreakdownText);
    const hasSurvey = /vermessung|gnss|tachymeter|vermessungsdaten/.test(contextBreakdownText);
    const hasCadBestandsplan = /cad|bestandsplan|bestandsplaene|bestandspläne|as-built|as built|dwg|dxf/.test(contextBreakdownText);
    const hasDigitalHandover = /uebergabe|übergabe|pdf|dwg|landxml|unterlagen/.test(contextBreakdownText);
    const hasClientAuthorityCoordination = /auftraggeber|behoerde|behörde|behoerden|behörden|abstimmung/.test(contextBreakdownText);

    const hasVorhaltungMachines = /geraetevorhaltung|gerätevorhaltung|bagger|verdichtungsgeraet|verdichtungsgerät|kleingeraet|kleingerät|maschine|maschinen/.test(contextBreakdownText);
    const hasVorhaltungPersonnel = /personal-wartezeit|wartezeit|polier|maschinist|personal/.test(contextBreakdownText);
    const hasVorhaltungCoordination = /bauleitung|koordination|freigabe|freigaben|behoerde|behörde|leitungsfreigabe/.test(contextBreakdownText);
    const hasVorhaltungStillstand = /stillstand|bauzeitunterbrechung|bauablaufstoerung|bauablaufstörung|wartezeiten|wartezeit/.test(contextBreakdownText);
    const hasVorhaltungLogistics = /erneute anfahrt|anfahrt|abfahrt|umsetzen|logistik|entfernung|fahrt|fahrten/.test(contextBreakdownText);

    const hasProvisoriumHerstellung = /herstellen|herstellung|einbau|einbauen|verdichtung|baustrasse|baustraße|umleitung/.test(contextBreakdownText);
    const hasProvisoriumMaterial = /schotter|tragschicht|geotextil|platten|material/.test(contextBreakdownText);
    const hasProvisoriumVorhaltung = /vorhalten|vorhaltung|laufzeit|dauer|120 tage|tage/.test(contextBreakdownText);
    const hasProvisoriumUnterhaltung = /unterhalten|unterhaltung|reinigung|anpassung|wartung/.test(contextBreakdownText);
    const hasProvisoriumRueckbau = /rueckbau|rückbau|abtransport|entsorgung|laden/.test(contextBreakdownText);
    const hasProvisoriumLogistik = /logistik|anfahrt|materialanlieferung|transport|abtransport/.test(contextBreakdownText);
    const hasProvisoriumBeschilderung = /beschilderung|verkehrsfuehrung|verkehrsführung|umleitung|verkehrszeichen/.test(contextBreakdownText);

    const hasTempSupplyMaterial = /rohr|rohrmaterial|formstueck|formstück|armatur|absperr|material/.test(contextBreakdownText);
    const hasTempSupplyInstall = /herstellen|verlegen|einbau|montage|notleitung|provisorische leitung/.test(contextBreakdownText);
    const hasTempSupplyConnection = /anschluss|bestand|einbindung|anschliessen|anschließen/.test(contextBreakdownText);
    const hasTempSupplyPressureTest = /druckpruefung|druckprüfung|spuelung|spülung|inbetriebnahme|pruefung|prüfung/.test(contextBreakdownText);
    const hasTempSupplyOperation = /vorhaltung|betrieb|betreiben|laufzeit|dauer|90 tage|tage/.test(contextBreakdownText);
    const hasTempSupplyControl = /kontrolle|kontroll|wartung|taeglich|täglich/.test(contextBreakdownText);
    const hasTempSupplyRemoval = /rueckbau|rückbau|trennung|abtransport|laden/.test(contextBreakdownText);
    const hasTempSupplyLogistics = /logistik|anfahrt|materialanlieferung|transport|abtransport/.test(contextBreakdownText);

    if (isProtectionContext && /lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz/.test(rowContextText) && !hasProtectionNoiseDustVibration) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Lärm-/Staub-/Erschütterungsschutz fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /baumschutz|wurzelschutz/.test(rowContextText) && !hasProtectionTreeRoot) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Baum-/Wurzelschutz fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie/.test(rowContextText) && !hasProtectionWaterHavarie) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Gewässerschutz/Ölbindemittel/Havarie-Schutz fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /anwohnerinformation/.test(rowContextText) && !hasProtectionResidents) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Anwohnerinformation fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && /beweissicherung|zustandsdokumentation/.test(rowContextText) && !hasProtectionEvidence) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Beweissicherung/Zustandsdokumentation fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && projectDurationDays > 0 && !hasProtectionControl) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: regelmäßige Kontrolle/Unterhaltung über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProtectionContext && !hasProtectionRemovalLogistics) {
      contextQualityWarnings.push("Context-Guard: Schutzmaßnahmen: Rückbau/Abbau/Logistik fehlt oder ist nicht separat kalkuliert.");
    }

    if (!isProtectionContext && projectDurationDays >= 180 && !hasTemporalBasis) {
      contextQualityWarnings.push("Context-Guard: Bei langer Laufzeit fehlt eine erkennbare Monats-/Tages-/Vorhaltungsbasis im priceBreakdown.");
    }

    if (isSiteSetupContext && projectDurationDays >= 180 && !hasContainer) {
      contextQualityWarnings.push("Context-Guard: Container/Baustelleneinrichtung fehlt oder ist nicht separat erkennbar.");
    }

    if (isSiteSetupContext && projectDurationDays >= 180 && !hasUtilities) {
      contextQualityWarnings.push("Context-Guard: Baustrom/Bauwasser/Sanitär fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && !hasTrafficSigns) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Beschilderung/Verkehrszeichen fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && !hasBarrierMaterial) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Absperrmaterial/Leitbaken/Sperrmaterial fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && /lichtsignalanlage|ampel/.test(rowContextText) && !hasTrafficLight) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Lichtsignalanlage/Ampel ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isTrafficSafetyContext && projectDurationDays >= 30 && !hasTrafficControl) {
      contextQualityWarnings.push("Context-Guard: Verkehrssicherung: Kontrolle/Wartung/Verkehrsführung/RSA-Genehmigung fehlt oder ist nicht separat erkennbar.");
    }

    if (isDocumentationContext && !hasPhotoDocumentation && /foto|fotodokumentation/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Fotodokumentation ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasAufmass && /aufmass|aufmaß/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Aufmaß/Massenermittlung ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasSurvey && /vermessung|vermessungsdaten/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Vermessung/Vermessungsdaten sind im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasCadBestandsplan && /bestandsplan|bestandsplaene|bestandspläne|as-built|as built/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Bestandsplan/CAD/As-Built ist im LV erwähnt, aber nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasDigitalHandover && /uebergabe|übergabe|unterlagen|digital/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Digitale Übergabeunterlagen fehlen oder sind nicht separat kalkuliert.");
    }

    if (isDocumentationContext && !hasClientAuthorityCoordination && /auftraggeber|behoerde|behörde|behoerden|behörden|abstimmung/.test(rowContextText)) {
      contextQualityWarnings.push("Context-Guard: Dokumentation: Abstimmung mit Auftraggeber/Behörden fehlt oder ist nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungMachines) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Gerätevorhaltung ist erwähnt, aber nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungPersonnel) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Personal-Wartezeit/Polier/Maschinist fehlt oder ist nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungCoordination) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Bauleitung/Koordination/Freigaben fehlen oder sind nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && !hasVorhaltungStillstand) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: Stillstand/Wartezeiten/Bauablaufstörung fehlen oder sind nicht separat kalkuliert.");
    }

    if (isVorhaltungContext && projectDistanceKm > 0 && !hasVorhaltungLogistics) {
      contextQualityWarnings.push("Context-Guard: Vorhaltung/Stillstand: erneute Anfahrt/Logistik/Entfernung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumHerstellung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Herstellung/Einbau fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumMaterial) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Material wie Schotter/Geotextil/Tragschicht fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && projectDurationDays > 0 && !hasProvisoriumVorhaltung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Vorhaltung über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumUnterhaltung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Unterhaltung/Reinigung/Anpassung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && !hasProvisoriumRueckbau) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Rückbau/Laden/Abtransport fehlt oder ist nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && projectDistanceKm > 0 && !hasProvisoriumLogistik) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Logistik/Anfahrt/Materialtransporte fehlen oder sind nicht separat kalkuliert.");
    }

    if (isProvisoriumContext && /umleitung|beschilderung/.test(rowContextText) && !hasProvisoriumBeschilderung) {
      contextQualityWarnings.push("Context-Guard: Provisorium/Baustraße: Beschilderung/Umleitung/Verkehrsführung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && !hasTempSupplyMaterial) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Rohrmaterial/Formstücke/Armaturen fehlen oder sind nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && !hasTempSupplyInstall) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Herstellen/Verlegen/Montage der Notleitung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && !hasTempSupplyConnection) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Anschluss an Bestand/Einbindung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && /druckpruefung|druckprüfung|spuelung|spülung/.test(rowContextText) && !hasTempSupplyPressureTest) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Druckprüfung/Spülung/Inbetriebnahme fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && projectDurationDays > 0 && !hasTempSupplyOperation) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Vorhaltung/Betrieb über die Laufzeit fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && /kontrolle|wartung|taeglich|täglich/.test(rowContextText) && !hasTempSupplyControl) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Kontrolle/Wartung fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && /rueckbau|rückbau/.test(rowContextText) && !hasTempSupplyRemoval) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Rückbau/Trennung/Abtransport fehlt oder ist nicht separat kalkuliert.");
    }

    if (isTemporarySupplyContext && projectDistanceKm > 0 && !hasTempSupplyLogistics) {
      contextQualityWarnings.push("Context-Guard: Temporäre Versorgung: Logistik/Anfahrt/Materialtransporte fehlen oder sind nicht separat kalkuliert.");
    }

    if (!isProtectionContext && !isDocumentationContext && !isVorhaltungContext && !isProvisoriumContext && !isTemporarySupplyContext && projectDistanceKm > 0 && !hasTransport) {
      contextQualityWarnings.push("Context-Guard: Entfernung/Antransport/Abtransport/Logistik fehlt oder ist zu schwach ausgewiesen.");
    }

    if (!isDocumentationContext && !isVorhaltungContext && projectDurationDays >= 180 && !hasCoordination) {
      contextQualityWarnings.push("Context-Guard: Bauleitung/Polier/Koordination/Kontrolle fehlt oder ist nicht separat kalkuliert.");
    }

    const softMinForLongSite = months >= 12 ? round2(months * 2500) : 0;

    if (softMinForLongSite > 0 && finalUnitPrice > 0 && finalUnitPrice < softMinForLongSite) {
      contextQualityWarnings.push(
        `Context-Guard: EP ${round2(finalUnitPrice)} EUR wirkt für ${round2(months)} Monate Laufzeit auffällig niedrig. Weicher Prüfwert ca. ${softMinForLongSite} EUR.`
      );
    }

    const contextDirectCost = round2(
      normalizedMaterialCost +
      normalizedLaborCost +
      normalizedMachineCost +
      normalizedSubcontractorCost +
      normalizedDisposalCost
    );

    if (contextDirectCost > 0) {
      const minRisk = round2(contextDirectCost * 0.03);
      const minProfit = round2(contextDirectCost * 0.05);

      if (normalizedRiskCost > 0 && normalizedRiskCost < minRisk) {
        contextQualityWarnings.push(
          `Context-Guard: Risiko ${round2(normalizedRiskCost)} EUR wirkt zu niedrig. Mindest-Prüfansatz ca. 3% der Direktkosten = ${minRisk} EUR.`
        );
      }

      if (normalizedProfitCost > 0 && normalizedProfitCost < minProfit) {
        contextQualityWarnings.push(
          `Context-Guard: Gewinn ${round2(normalizedProfitCost)} EUR wirkt zu niedrig. Mindest-Prüfansatz ca. 5% der Direktkosten = ${minProfit} EUR.`
        );
      }
    }
  }

  const isErschwernisOpenAi =
    /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`));

  const isVorhaltungOpenAi =
    /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`));

  const isWasserhaltungOpenAi =
    /wasserhaltung|pumpe|pumpen|tauchpumpe|grundwasser|baugrubenentwaesserung|baugrubenentwässerung|vorfluter|ableitung.*wasser/.test(norm(`${kurztext} ${langtext}`));

  const isDisposalOpenAi =
    /entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(norm(`${kurztext} ${langtext}`));

  const isTestingOpenAi =
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(norm(`${kurztext} ${langtext}`));

  const baseWarnings = buildWarnings(row, riskLevel, matches, confidence, "openai").filter((w) => {
    const msg = String(w || "");

    if (isTestingOpenAi && /bestandsanschluss/i.test(msg)) return false;

    return isErschwernisOpenAi || isVorhaltungOpenAi || isDisposalOpenAi || isTestingOpenAi
      ? !/verkehrssicherung|rsa/i.test(msg)
      : true;
  });

  const warnings = [
    ...baseWarnings,
    contextSensitiveOpenAi
      ? isErschwernisOpenAi
        ? "Kontextabhängige Position: Erschwernis/beengte Bauweise hängt stark von Bauzeit, Platzverhältnissen, Handschachtung, Leitungsbestand, Anliegerverkehr, Gerätebewegung und Sicherungsaufwand ab. Historische Preise nur als Orientierung verwenden."
        : isTestingOpenAi
          ? "Kontextabhängige Position: Prüfungen/Abnahmen/technische Nachweise hängen stark von Leitungslänge, DN, Prüfverfahren, Spülung, TV-Inspektion, Geräteeinsatz, Auswertung, Protokollen, Abnahme und Anfahrt ab. Historische Preise nur als Orientierung verwenden."
          : isDisposalOpenAi
            ? "Kontextabhängige Position: Entsorgung/Deponie/belasteter Boden hängt stark von Materialklasse, Analytik, Deponieklasse, Menge, Transportentfernung, Deponiegebühren und Nachweispflichten ab. Historische Preise nur als Orientierung verwenden."
            : isWasserhaltungOpenAi
            ? "Kontextabhängige Position: Wasserhaltung/Pumpen/Baugrubenentwässerung hängt stark von Dauer, Grundwasserandrang, Pumpentechnik, Stromversorgung, Ableitung, Kontrolle/Wartung, Ausfallrisiko und Wetter ab. Historische Preise nur als Orientierung verwenden."
            : isVorhaltungOpenAi
            ? "Kontextabhängige Position: Gerätevorhaltung/Stillstand/Wartezeiten hängt stark von Unterbrechungsdauer, betroffenen Geräten, Personalbindung, Freigaben, Bauablaufstörungen, erneuter Anfahrt und Logistik ab. Historische Preise nur als Orientierung verwenden."
            : contextSensitiveWarning(text)
      : "",
    ...contextQualityWarnings,
  ].filter(Boolean);

  const rawStatus = s(parsed.calculationStatus);
  const calculationStatus = contextSensitiveOpenAi
    ? "needs_review"
    : rawStatus === "ok" || rawStatus === "warning" || rawStatus === "critical"
      ? rawStatus
      : calculationStatusFrom(warnings, riskLevel, confidence);

  const finalRiskLevel = contextSensitiveOpenAi ? "high" : riskLevel;
  const finalConfidence = contextSensitiveOpenAi
    ? Math.min(confidence, contextQualityWarnings.length ? 0.55 : 0.65)
    : confidence;

  const returnContextText = norm(`${kurztext} ${langtext}`);
  const isProtectionReturn =
    /schutzmaßnahme|schutzmassnahme|lärmschutz|laermschutz|staubschutz|erschütterungsschutz|erschuetterungsschutz|baumschutz|wurzelschutz|gewässerschutz|gewaesserschutz|ölbindemittel|oelbindemittel|havarie|anwohnerinformation|beweissicherung|zustandsdokumentation|umweltschutz|naturschutz/.test(returnContextText);

  const isTestingReturn =
    /dichtheitsprüfung|dichtheitspruefung|druckprüfung|druckpruefung|spülung|spuelung|tv-inspektion|kamerabefahrung|prüfprotokoll|pruefprotokoll|abnahmeunterlagen|bestandsfreigabe|funktionsprüfung|funktionspruefung/.test(returnContextText);

  const isDisposalReturn =
    /entsorgung|deponie|belasteter boden|belastet|haufwerk|analytik|deklarationsanalytik|laga|ersatzbaustoffv|wiegeschein|entsorgungsnachweis/.test(returnContextText);
  const isTempSupplyReturn =
    /notleitung|temporaer.*anschluss|temporär.*anschluss|temporaere.*anschluesse|temporäre.*anschlüsse|provisorische leitung|medienversorgung|ersatzversorgung|anschluss an bestand|druckpruefung|druckprüfung|absperrarmatur|formstueck|formstück/.test(returnContextText);
  const isProvisoriumReturn =
    !isTempSupplyReturn &&
    /provisor|baustrasse|baustraße|umleitung|baustellenumleitung|temporaer|temporär|rueckbau|rückbau/.test(returnContextText);
  const isWasserhaltungReturn =
    /wasserhaltung|pumpe|pumpen|tauchpumpe|grundwasser|baugrubenentwaesserung|baugrubenentwässerung|vorfluter|ableitung.*wasser/.test(returnContextText);
  const isVorhaltungReturn =
    /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(returnContextText);
  const isErschwernisReturn =
    /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(returnContextText);

  return {
    id: row.id,
    posNr,
    kurztext,
    langtext,
    einheit,
    menge,

    materialCost: normalizedMaterialCost,
    laborCost: normalizedLaborCost,
    machineCost: normalizedMachineCost,
    subcontractorCost: normalizedSubcontractorCost,
    disposalCost: normalizedDisposalCost,
    overheadCost: normalizedOverheadCost,
    riskCost: normalizedRiskCost,
    profitCost: normalizedProfitCost,

    baseUnitPrice: finalUnitPrice,
    suggestedUnitPrice,
    finalUnitPrice,

    confidence: finalConfidence,
    riskLevel: finalRiskLevel,
    calculationStatus,

    gewerk: isProtectionReturn
      ? "Tiefbau / Schutzmaßnahmen"
      : isTestingReturn
        ? "Tiefbau / Prüfungen"
      : isDisposalReturn
        ? "Tiefbau / Entsorgung"
      : isTempSupplyReturn
        ? "Tiefbau / Temporäre Versorgung"
      : isProvisoriumReturn
        ? "Tiefbau / Provisorien"
        : isWasserhaltungReturn
          ? "Tiefbau / Wasserhaltung"
      : /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`))
        ? "Tiefbau / Vorhaltung"
      : /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`))
        ? "Tiefbau / Erschwernis"
        : s(parsed.gewerk) || gewerk,
    leistungsart: isProtectionReturn
      ? "Umwelt-, Natur- und Anwohnerschutz"
      : isTestingReturn
        ? "Prüfung / Abnahme / technische Nachweise"
      : isDisposalReturn
        ? "Entsorgung / Deponie / belasteter Boden"
      : isTempSupplyReturn
        ? "Temporärer Anschluss / Notleitung / Medienversorgung"
      : isProvisoriumReturn
        ? "Provisorium / Baustraße / Umleitung"
        : isWasserhaltungReturn
          ? "Wasserhaltung / Pumpen / Baugrubenentwässerung"
      : /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`))
        ? "Gerätevorhaltung / Stillstand / Wartezeiten"
      : /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`))
        ? "Erschwernis / beengte Bauweise"
        : s(parsed.leistungsart) || leistungsart,
    bauverfahren: isProtectionReturn
      ? "Schutzmaßnahmen mit Aufbau, Kontrolle, Dokumentation und Rückbau"
      : isTestingReturn
        ? "Technische Prüfung mit Spülung, TV-Inspektion, Dichtheitsprüfung und Dokumentation"
      : isDisposalReturn
        ? "Entsorgungskalkulation mit Analytik, Transport, Deponie und Nachweisen"
      : isTempSupplyReturn
        ? "Temporäre Herstellung, Prüfung, Betrieb und Rückbau"
      : isProvisoriumReturn
        ? "Temporäre Herstellung, Vorhaltung, Unterhaltung und Rückbau"
        : isWasserhaltungReturn
          ? "Zeitabhängige Wasserhaltungs- und Pumpenkalkulation"
      : /geraetevorhaltung|gerätevorhaltung|bauzeitunterbrechung|stillstand|wartezeit|wartezeiten|leitungsfreigabe|behoerdliche freigabe|behördliche freigabe|bauablaufstoerung|bauablaufstörung/.test(norm(`${kurztext} ${langtext}`))
        ? "Zeitabhängige Vorhalte- und Stillstandskalkulation"
      : /erschwernis|beengte|beengt|handschachtung|anliegerverkehr|versorgungsleitung|erschwerte/.test(norm(`${kurztext} ${langtext}`))
        ? "Zuschlagskalkulation für erschwerte Bauausführung"
        : s(parsed.bauverfahren) || bauverfahren,

      rlcPreisMin: round2(n(rlcPreisRange.min)),
      rlcPreisAvg: round2(n(rlcPreisRange.avg)),
      rlcPreisMax: round2(n(rlcPreisRange.max)),
      rlcPreisSource: n(rlcPreisRange.avg) > 0 ? "RLC Preisbibliothek" : "",
      rlcPreisGroup: n(rlcPreisRange.avg) > 0 ? rlcPreisRange.matches?.[0]?.group || "" : "",

    warning: [s(parsed.warning), ...warnings].filter(Boolean).join(" · "),
    aiReason:
      [
        s(parsed.aiReason),
        contextQualityWarnings.length
          ? "RLC Context-Guard: Die Urkalkulation ist fachlich prüfpflichtig, weil bei einer kontextabhängigen Position einzelne Pflichtbestandteile fehlen oder auffällig niedrig angesetzt wurden."
          : "",
      ].filter(Boolean).join("\n\n") ||
      `OpenAI-Kalkulation: Keine ausreichend sichere Datenbankbasis vorhanden. Die Urkalkulation wurde per OpenAI aus LV-Text, Einheit, Menge, Gewerk, Leistungsart und Bauverfahren erstellt. Fachliche Prüfung erforderlich.`,

    source: "openai",
    priceBreakdown,
  };
}


function isSimpleKnownRow(row: InputRow): boolean {
  const text = `${s(row.kurztext)} ${s(row.langtext)}`.toLowerCase();
  const unit = s(row.einheit);
  const menge = n(row.menge);

  if (!text || !unit || menge <= 0) return false;

  const known =
    text.includes("speedpipe") ||
    text.includes("kabelschutzrohr") ||
    text.includes("rohr") ||
    text.includes("aushub") ||
    text.includes("verfüll") ||
    text.includes("frostschutz") ||
    text.includes("kies") ||
    text.includes("asphalt") ||
    text.includes("pflaster") ||
    text.includes("rasengitter") ||
    text.includes("bordstein") ||
    text.includes("randstein") ||
    text.includes("leistenstein");

  const complex =
    text.includes("nach bedarf") ||
    text.includes("bauseits") ||
    text.includes("unbekannt") ||
    text.includes("kontaminiert") ||
    text.includes("grundwasser") ||
    text.includes("bestand") ||
    text.includes("anschluss") ||
    text.includes("sonder") ||
    text.includes("provisorisch");

  return known && !complex;
}

function shouldUseOpenAIForRow(
  row: InputRow,
  matches: DbMatch[],
  useOpenAI: boolean,
  openAiBudgetLeft: number,
  forceRecalculate = false
): boolean {
  if (!useOpenAI) return false;
  if (openAiBudgetLeft <= 0) return false;
  if (isStructuralTitleRow(row)) return false;

  if (forceRecalculate) return true;

  const unit = s(row.einheit);
  const fullText = `${s(row.kurztext)} ${s(row.langtext)}`.trim();
  const contextSensitive = isContextSensitivePosition(fullText, unit);
  const hasStrongDb = contextSensitive ? false : strongDatabaseHit(matches, unit);

  /*
   * Qualität vor Geschwindigkeit:
   * - Starker DB-Treffer = keine OpenAI nötig.
   * - Ohne starken DB-Treffer darf OpenAI auch bei bekannten Positionen prüfen,
   *   sonst fallen Aushub/Pflaster/Leistenstein auf zu niedrige Rule-Engine-Werte.
   */
  if (hasStrongDb) return false;

  const text = `${s(row.kurztext)} ${s(row.langtext)}`.trim();
  const risk = riskFromText(text, unit, n(row.menge));

  if (risk === "high") return true;
  if (!s(row.kurztext) || !unit || n(row.menge) <= 0) return true;
  if (!matches.length) return true;

  return false;
}



import fs from "fs";
import path from "path";
import { reverseUrkalkulationFromX84 } from "../kalkulation/rlcReverseUrkalkulationEngine";

const KALKULATION_AI_CACHE_FILE =
  process.env.KALKULATION_AI_CACHE_FILE ||
  "/app/data/kalkulation-ai-cache.json";

function loadKalkulationAiCache() {
  try {
    if (!fs.existsSync(KALKULATION_AI_CACHE_FILE)) return;

    const raw = fs.readFileSync(KALKULATION_AI_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return;

    for (const [key, value] of Object.entries(parsed)) {
      kalkulationAiCache.set(key, value);
    }

    console.log(
      `[kalkulation.ki] AI cache loaded: ${kalkulationAiCache.size} entries`
    );
  } catch (e: any) {
    console.warn("[kalkulation.ki] AI cache load failed:", e?.message || e);
  }
}

let cacheSaveTimer: NodeJS.Timeout | null = null;

function scheduleKalkulationAiCacheSave() {
  if (cacheSaveTimer) return;

  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null;

    try {
      fs.mkdirSync(path.dirname(KALKULATION_AI_CACHE_FILE), { recursive: true });

      const obj: Record<string, any> = {};
      for (const [key, value] of kalkulationAiCache.entries()) {
        obj[key] = value;
      }

      fs.writeFileSync(
        KALKULATION_AI_CACHE_FILE,
        JSON.stringify(obj, null, 2),
        "utf8"
      );
    } catch (e: any) {
      console.warn("[kalkulation.ki] AI cache save failed:", e?.message || e);
    }
  }, 750);
}


const kalkulationAiCache = new Map<string, any>();
loadKalkulationAiCache();

function cacheKeyForRow(row: InputRow): string {
  const pos = s(row.posNr).toLowerCase();
  const kurz = s(row.kurztext).toLowerCase();
  const lang = s(row.langtext).toLowerCase();
  const unit = s(row.einheit).toLowerCase();
  const menge = round2(n(row.menge));

  return ["rlc-ki-pipeline-v2", pos, kurz, lang.slice(0, 500), unit, menge].join("|");
}

function cloneCachedRow(row: any, input: InputRow) {
  return {
    ...row,
    id: input.id,
    posNr: s(input.posNr),
    menge: n(input.menge, row.menge),
  };
}

async function calcSmartRow(
  row: InputRow,
  matches: DbMatch[],
  companyId: string,
  useOpenAI: boolean,
  openAiBudgetLeft = 999,
  forceRecalculate = false
) {
  if (isStructuralTitleRow(row)) {
    return {
      id: row.id,
      posNr: s(row.posNr),
      kurztext: s(row.kurztext),
      langtext: s(row.langtext),
      einheit: s(row.einheit) || "PS",
      menge: n(row.menge, 1),
      materialCost: 0,
      laborCost: 0,
      machineCost: 0,
      subcontractorCost: 0,
      disposalCost: 0,
      overheadCost: 0,
      riskCost: 0,
      profitCost: 0,
      baseUnitPrice: n(row.preis),
      suggestedUnitPrice: n(row.preis),
      finalUnitPrice: n(row.preis),
      confidence: 0.9,
      riskLevel: "low",
      calculationStatus: n(row.preis) > 0 ? "manual" : "ok",
      gewerk: "Gliederung / Titel",
      leistungsart: "Strukturposition",
      bauverfahren: "Keine kalkulatorische Leistungsposition",
      warning: "",
      aiReason: "Titel-/Gliederungsposition: Keine kalkulatorische Leistungsposition. Von OpenAI bewusst ausgeschlossen.",
      source: "rule-engine",
      priceBreakdown: [],
    };
  }

  const unit = s(row.einheit);
  const hasStrongDb = strongDatabaseHit(matches, unit);

  /*
   * Freigegeben/Geprüft darf nur greifen, wenn der Treffer wirklich zur LV-Position passt.
   * Sonst würde z.B. ein freigegebener Schalungswert fälschlich bei Pflaster/Kies/Aushub verwendet.
   */
  const approvedMatch = matches.find((m) => {
    if (!isApprovedDbMatch(m)) return false;
    if (unit && norm(m.row.unit) !== norm(unit)) return false;
    if (m.score < 65) return false;

    const hasExactPos = m.reasons.includes("Positionsnummer identisch");
    const textHitReason = m.reasons.find((r) => r.includes("Text-Treffer")) || "";
    const textHits = n(textHitReason.split(" ")[0]);

    return hasExactPos || textHits >= 3;
  });

  /*
   * Freigegebene / geprüfte Kalkulationsdaten sind stärker als Cache und OpenAI.
   * Ein vom Kalkulator freigegebener Wert darf nicht durch alte KI-Cachewerte überschrieben werden.
   */
  if (approvedMatch && hasStrongDb && !forceRecalculate) {
    const dbRow = calcRuleRow(row, matches, "database");
    return {
      ...dbRow,
      source: "database",
      confidence: Math.max(n(dbRow.confidence), qualityGateStatusOf(approvedMatch.row) === "Freigegeben" ? 0.96 : 0.92),
      calculationStatus: "ok",
      riskLevel: n(dbRow.finalUnitPrice) > 0 ? "low" : dbRow.riskLevel,
      warning: [
        qualityGateStatusOf(approvedMatch.row) === "Freigegeben"
          ? "Freigegebener Kalkulationswert aus Datenbank verwendet."
          : "Geprüfter Kalkulationswert aus Datenbank verwendet.",
        s(dbRow.warning),
      ].filter(Boolean).join(" · "),
      aiReason: [
        `Quality-Gate-Datenbanktreffer verwendet: ${qualityGateStatusOf(approvedMatch.row)}.`,
        s(dbRow.aiReason),
      ].filter(Boolean).join("\n\n"),
    };
  }

  const hasHistoricalOfferBaselineForDb =
    n((row as any)?.angebotUnitPrice) > 0 ||
    n((row as any)?.x84UnitPrice) > 0 ||
    n((row as any)?.angebotTotal) > 0 ||
    n((row as any)?.x84Total) > 0;

  /*
   * X83-only / Firmen-Datenbank DIREKT:
   * Wenn PosNr exakt in der Firmen-Datenbank existiert, wird exakt dieser EP verwendet.
   * Keine Gewichtung, kein Parser, keine Einheit-Blockade.
   */
  const directDbPosition = s(row.posNr);
  if (directDbPosition) {
    const directDb = await prisma.kalkulationsDbEntry.findFirst({
      where: {
        companyId,
        positionNumber: directDbPosition,
        unitPriceNet: { gt: 0 },
      },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    });

    if (hasHistoricalOfferBaselineForDb && directDb) {
      const exactDbEp = n(directDb.unitPriceNet);
      const menge = n(row.menge);
      const exactDbTotal = Math.round(exactDbEp * menge * 100) / 100;

      const companyDbRow = {
        ...row,
        source: "database",
        suggestedUnitPrice: exactDbEp,
        finalUnitPrice: exactDbEp,
        rlcKiUnitPrice: exactDbEp,
        unitPrice: exactDbEp,
        preis: exactDbEp,
        totalNet: exactDbTotal,
        rlcKiTotal: exactDbTotal,
        gesamt: exactDbTotal,
        confidence: 0.99,
        calculationStatus: "ok",
        riskLevel: "low",
        warning: "",
        aiReason: [
          "Firmen-Datenbank Direktmatch: exakter Firmenwert aus X84-Baseline verwendet.",
          "Position: " + s(directDb.positionNumber),
          "EP netto: " + exactDbEp,
        ].join("\n\n"),
      };

      const companyDbCacheKey = cacheKeyForRow(row);
      kalkulationAiCache.set(companyDbCacheKey, companyDbRow);
      scheduleKalkulationAiCacheSave();

      return companyDbRow;
    }
  }

  /*
   * X83-only / Firmen-Datenbank:
   * Wenn ein starker Firmen-Datenbanktreffer existiert, muss dieser VOR dem Technical Parser gewinnen.
   * forceRecalculate darf nur Cache/OpenAI neu berechnen, aber nicht geprüfte Firmenwerte ignorieren.
   */
  const strongCompanyDbMatch = matches.find((m) => {
    const dbEp = n(m.row.unitPriceNet);
    const rowUnit = s(row.einheit);
    const dbUnit = s(m.row.unit);
    const unitOk = !rowUnit || !dbUnit || norm(rowUnit) === norm(dbUnit);

    const rowPos = s(row.posNr);
    const dbPos = s(m.row.positionNumber);
    const posOk = rowPos && dbPos && norm(rowPos) === norm(dbPos);

    return dbEp > 0 && (posOk || (unitOk && m.score >= 60));
  });

  if (hasHistoricalOfferBaselineForDb && strongCompanyDbMatch) {
    const dbRow = calcRuleRow(row, [strongCompanyDbMatch], "database");
    const exactDbEp = n(strongCompanyDbMatch.row.unitPriceNet);
    const menge = n(row.menge);
    const exactDbTotal = Math.round(exactDbEp * menge * 100) / 100;

    const companyDbRow = {
      ...dbRow,
      source: "database",
      suggestedUnitPrice: exactDbEp,
      finalUnitPrice: exactDbEp,
      unitPrice: exactDbEp,
      preis: exactDbEp,
      totalNet: exactDbTotal,
      gesamt: exactDbTotal,
      confidence: 0.99,
      calculationStatus: "ok",
      riskLevel: "low",
      warning: "",
      aiReason: [
        "Firmen-Datenbank priorisiert: exakter Firmenwert aus X84-Baseline verwendet.",
        "Position: " + s(strongCompanyDbMatch.row.positionNumber),
        "EP netto: " + exactDbEp,
      ].filter(Boolean).join("\n\n"),
    };

    const companyDbCacheKey = cacheKeyForRow(row);
    kalkulationAiCache.set(companyDbCacheKey, companyDbRow);
    scheduleKalkulationAiCacheSave();

    return companyDbRow;
  }

  /*
   * RLC Technical Parser muss VOR KI-Cache / Rule-Engine / OpenAI gewinnen.
   * Grund: A-F Blöcke liefern geprüfte technische Kalkulationen.
   */
  const x83PriorityKurztext = String((row as any).kurztext || "").toLowerCase();

  
    const technicalContextText = `${s(row.kurztext)} ${s(row.langtext)}`.trim();
    const technicalContextSensitive = isContextSensitivePosition(
      technicalContextText,
      s(row.einheit)
    );

const technicalRecipeInput =
    x83PriorityKurztext.includes("fsk korrigieren") ||
    (
      x83PriorityKurztext.includes("boden") &&
      x83PriorityKurztext.includes("zwischenlagern")
    )
      ? {
          ...row,
          langtext: (row as any).kurztext || (row as any).langtext || "",
        }
      : row;

  const technicalRecipeRow = await calcRecipeKalkulationRow(technicalRecipeInput);

  if (!technicalContextSensitive && technicalRecipeRow?.source === "technical-parser") {
    const technicalRow = {
      ...technicalRecipeRow,
      source: "technical-parser",
      warning: [
        s(technicalRecipeRow.warning),
        "RLC Technical Parser priorisiert vor Cache, Rule-Engine und OpenAI.",
      ].filter(Boolean).join(" · "),
      aiReason: [
        s(technicalRecipeRow.aiReason),
        "RLC-KI: geprüfter technischer Komponentenpreis aus RecipeEngine / Preisbibliothek wurde direkt übernommen.",
      ].filter(Boolean).join("\n\n"),
    };

    const technicalCacheKey = cacheKeyForRow(row);
    kalkulationAiCache.set(technicalCacheKey, technicalRow);
    scheduleKalkulationAiCacheSave();
    return technicalRow;
  }

  const cacheKey = cacheKeyForRow(row);
  const cached = kalkulationAiCache.get(cacheKey);

  if (cached && !forceRecalculate) {
    return cloneCachedRow(
      {
        ...cached,
        warning: [s(cached.warning), "KI-Cache verwendet"].filter(Boolean).join(" · "),
      },
      row
    );
  }

  if (cached && forceRecalculate) {
    console.log("[kalkulation.ki] KI-Cache bypassed by forceRecalculate", {
      posNr: s(row.posNr),
      kurztext: s(row.kurztext).slice(0, 80),
    });
  }

  /*
   * RLC Recipe Engine zuerst:
   * RLC-KI nutzt interne Rezeptlogik + RLC Preisbibliothek vor OpenAI.
   * OpenAI bleibt Expertprüfung/Fallback, nicht Hauptquelle.
   */
  const recipeRow = await calcRecipeKalkulationRow(row);

  if (!technicalContextSensitive && recipeRow) {
    const guardedRecipeRow = applyPlausibilityGuard(
      row,
      matches,
      {
        ...recipeRow,
        source: recipeRow.source || "recipe",
      },
      forceRecalculate
    );
    kalkulationAiCache.set(cacheKey, guardedRecipeRow);
    scheduleKalkulationAiCacheSave();
    return guardedRecipeRow;
  }

  const useOpenAIForThisRow = forceRecalculate
    ? Boolean(useOpenAI && openAiBudgetLeft > 0 && !isStructuralTitleRow(row))
    : shouldUseOpenAIForRow(row, matches, useOpenAI, openAiBudgetLeft, forceRecalculate);

  if (useOpenAIForThisRow) {
    try {
      const aiRow = await openAiCalcRow(row, matches);

      if (aiRow) {
        if (hasStrongDb) {
          const dbEp = weightedDbPrice(matches, unit);
          const aiEp = n(aiRow.finalUnitPrice);

          aiRow.source = "openai";
          aiRow.warning = [
            s(aiRow.warning),
            `Datenbanktreffer vorhanden: EP ${round2(dbEp)} EUR wurde durch OpenAI plausibilisiert.`
          ]
            .filter(Boolean)
            .join(" · ");

          aiRow.aiReason = [
            s(aiRow.aiReason),
            `Datenbank wurde nicht blind übernommen, sondern gegen LV-Text, Mengen, Schichten, Transport, Entsorgung, Personal und Maschinen geprüft. Datenbank-EP: ${round2(dbEp)} EUR, geprüfter EP: ${round2(aiEp)} EUR.`
          ]
            .filter(Boolean)
            .join("\n\n");
        }

        const guarded = applyPlausibilityGuard(row, matches, aiRow, forceRecalculate);
        kalkulationAiCache.set(cacheKey, guarded);
        scheduleKalkulationAiCacheSave();
        return guarded;
      }
    } catch (e: any) {
      console.error("[kalkulation.ki] OpenAI plausibility check failed:", e?.message || e);
    }
  }

  if (hasStrongDb) {
      const dbRow = calcRuleRow(row, matches, "database");
      const guardedDbRow = applyPlausibilityGuard(row, matches, dbRow, forceRecalculate);
      kalkulationAiCache.set(cacheKey, guardedDbRow);
      scheduleKalkulationAiCacheSave();
      return guardedDbRow;
    }

  const ruleRow = calcRuleRow(row, matches, "rule-engine");
    const guardedRuleRow = applyPlausibilityGuard(row, matches, ruleRow, forceRecalculate);
    kalkulationAiCache.set(cacheKey, guardedRuleRow);
    scheduleKalkulationAiCacheSave();
    return guardedRuleRow;
}


function normalizeLearningRisk(value: any): string {
  const v = s(value).toLowerCase();

  if (v === "low" || v === "niedrig") return "niedrig";
  if (v === "high" || v === "hoch") return "hoch";
  if (v === "critical" || v === "kritisch") return "kritisch";

  return "mittel";
}

function isValidLearningRow(row: any): boolean {
  if (!row) return false;
  if (row.source === "rule-engine") return false;
  if (row.source === "database") return false;
  if (row.source === "x84-company-baseline") return false;
  if (isStructuralTitleRow(row)) return false;

  const ep = n(row.finalUnitPrice ?? row.suggestedUnitPrice ?? row.baseUnitPrice);
  const kurztext = s(row.kurztext);
  const unit = s(row.einheit);
  const confidence = n(row.confidence);

  if (!kurztext || !unit || ep <= 0) return false;
  if (confidence < 0.6) return false;

  return true;
}

async function saveKiLearningRows(
  companyId: string,
  projectKey: string,
  rows: any[]
): Promise<number> {
  const project = projectKey
    ? await prisma.project.findFirst({
        where: {
          companyId,
          OR: [{ id: projectKey }, { code: projectKey }, { number: projectKey }],
        },
        select: { id: true, code: true, name: true, number: true },
      })
    : null;

  let saved = 0;

  for (const row of rows) {
    if (!isValidLearningRow(row)) continue;

    const posNr = s(row.posNr);
    const kurztext = s(row.kurztext);
    const langtext = s(row.langtext);
    const einheit = s(row.einheit);
    const menge = n(row.menge);
    const ep = n(row.finalUnitPrice ?? row.suggestedUnitPrice ?? row.baseUnitPrice);
    const gp = round2(ep * Math.max(1, menge));

    const qualityGateStatus = "KI-Vorschlag";

    const existing = await prisma.kalkulationsDbEntry.findFirst({
      where: {
        companyId,
        positionNumber: posNr,
      },
      select: {
        id: true,
        source: true,
        useCount: true,
        parameters: true,
      },
    });

    const parameters = {
      ...((existing?.parameters as any) || {}),
      ...(row.parameters || {}),
      qualityGateStatus,
      learningSource: row.source || "ki",
      learnedAt: new Date().toISOString(),
      warning: s(row.warning),
      aiReason: s(row.aiReason),
      priceBreakdown: Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [],
    };

    const data = {
      companyId,
      projectId: project?.id || null,
      source: "ki-learning",
      projectCode: s(project?.code || project?.number || projectKey),
      projectName: s(project?.name),

      positionNumber: posNr,
      shortText: kurztext,
      longText: langtext,
      unit: einheit,
      quantity: menge,

      materialCost: n(row.materialCost),
      laborCost: n(row.laborCost),
      machineCost: n(row.machineCost),
      subcontractorCost: n(row.subcontractorCost),
      disposalCost: n(row.disposalCost),
      transportCost: 0,
      overheadCost: n(row.overheadCost),
      riskCost: n(row.riskCost),
      profitCost: n(row.profitCost),

      unitPriceNet: ep,
      totalNet: gp,

      trade: s(row.gewerk),
      serviceType: s(row.leistungsart),
      constructionMethod: s(row.bauverfahren),
      soilClass: "",

      riskLevel: normalizeLearningRisk(row.riskLevel),
      confidence: n(row.confidence, 0.75),

      parameters,
      resources: Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [],
      tags: ["ki-learning", "ki-vorschlag"],

      aiNote: s(row.aiReason),
      calculatorNote: s(row.warning),
      lastUsedAt: new Date(),
    };

    if (existing) {
      /*

       * X84-Firmen-Baseline ist die geprüfte Angebotsbasis.

       * KI-Learning darf diese Position niemals überschreiben.

       */

      if (existing.source === "x84-company-baseline") {

        continue;

      }


      const existingStatus = s((existing.parameters as any)?.qualityGateStatus);

      /*
       * Freigegebene oder gesperrte Einträge nicht automatisch überschreiben.
       * Das ist der erste Quality-Gate-Schutz.
       */
      if (
        existingStatus === "Freigegeben" ||
        existingStatus === "Gesperrt" ||
        existingStatus === "Nicht verwenden"
      ) {
        continue;
      }

      await prisma.kalkulationsDbEntry.update({
        where: { id: existing.id },
        data: {
          ...data,
          useCount: { increment: 1 },
        },
      });
    } else {
      await prisma.kalkulationsDbEntry.create({
        data: {
          ...data,
          useCount: 1,
        },
      });
    }

    saved += 1;
  }

  return saved;
}

function buildSummary(rows: any[]) {
  const totalNet = rows.reduce((sum, r) => sum + n(r.finalUnitPrice) * n(r.menge), 0);
  const avgConfidence = rows.length
    ? rows.reduce((sum, r) => sum + n(r.confidence), 0) / rows.length
    : 0;

  return {
    totalNet: round2(totalNet),
    avgConfidence: round2(avgConfidence),
    highRiskCount: rows.filter((r) => r.riskLevel === "high").length,
    warningCount: rows.filter((r) => r.calculationStatus === "warning").length,
    criticalCount: rows.filter((r) => r.calculationStatus === "critical").length,
    openAiCount: rows.filter((r) => r.source === "openai").length,
    databaseCount: rows.filter((r) => r.source === "database").length,
    ruleEngineCount: rows.filter((r) => r.source === "rule-engine").length,
    recipeCount: rows.filter((r) => r.source === "recipe").length,
    technicalParserCount: rows.filter((r) => r.source === "technical-parser").length,
  };
}




function hasHistoricalOfferBaseline(row: any): boolean {
  return (
    n(row?.angebotUnitPrice) > 0 ||
    n(row?.x84UnitPrice) > 0 ||
    n(row?.angebotTotal) > 0 ||
    n(row?.x84Total) > 0
  );
}



function guardNoX84UnsafeOkResult(row: any, result: any) {
  if (hasHistoricalOfferBaseline(row)) return result;

  const source = s(result?.source);
  if (!["technical-parser", "recipe", "rule-engine"].includes(source)) return result;

  const status = s(result?.calculationStatus).toLowerCase();
  const risk = s(result?.riskLevel).toLowerCase();

  const qty = n(row?.menge ?? result?.menge);
  const ep =
    n(result?.finalUnitPrice) ||
    n(result?.rlcKiUnitPrice) ||
    n(result?.suggestedUnitPrice) ||
    n(result?.unitPrice);
  const gp = round2(ep * qty);

  const unit = norm(row?.einheit ?? result?.einheit);
  const text = norm([
    row?.posNr,
    row?.position,
    row?.kurztext,
    row?.langtext,
    result?.kurztext,
    result?.langtext,
    result?.bauverfahren,
    result?.leistungsart,
    result?.aiReason,
  ].join(" "));

  const riskyByPattern =
    /(mehr- oder minderpreis|mehr.*minderpreis|mehr-.*mindertiefe|fahrzeugkosten|werkstattwagen|pkw|tieflader|verrechnungssaetze|verrechnungssätze|zwischenplanum|kabelschutzrohr|schutzrohr|kabelleerrohr|kabellehrrohr|mikrokabelleerrohr|auffuellmaterial|auffüllmaterial|dokumentation|bestandszeichnung|bohrprotokoll|hausanschluss|kabelmuffen|isolierbinde|rohrabschluss|anschluss und verbindung|verlegung ortsnetzkabel|verlegung hausanschlussleitung|zulage.*grabenaushub|rohr-.*kabelgrabenaushub|erdleitung|einbinden.*kabelleerrohre|hinweisschilder|hinweissteine|messingquetsch|messingkupplung|passstuecke|paßstücke|formstueck|formstück|boegen|bögen|strassenkappe|straßenkappe|schachtabdeckung|dichtkappen|haube|flaechen auflockern|flächen auflockern|baeume faellen|bäume fällen|betonsockel|pumpensumpf|durchlass|motorflex|endstopfen|verzinkte fittings|zulage.*zulauf|zulage.*kruemmung|zulage.*krümmung|hdpe.*schutzrohr|hdpe.*rohre|weidezaun|runddraht|schmutzfaenger|schmutzfänger|stromantrag|stromaggregat|riesel|sand 0|schroppen|trassenwarnband|pumpenstunden|ringraumdichtung|ringraumdichtungen|einsteighilfe|asphalt trennen|warnanlage|zusaetzliche anreise|zusätzliche anreise|losflansch|statik|druckerhoehungsschacht|druckerhöhungsschacht|spuelen|spülen|entkeimung|doppelsteckmuffen|einzelzugabdichtung|edelstahl.*dichtung|strassenbauvlies|straßenbauvlies|erschwernis|verkehrssicherung|mineralbeton|sprengarbeiten|besucherinformation|betonit|bentonit|bauschild|anliegerverkehr|bauzeiten|baustelleneinrichtung|besprechungsraum|transport und montage|zuschlag fabrikat|mutterboden|bachquerung|fugenband|steuerung|ferwirktechnik|fernwirktechnik|feinplanie|systemdeckel|pilotbohrung|schutzmassnahme|schutzmaßnahme|zulage.*asphaltierung|abstimmung.*projektbeteiligten|be- und entlueftungsrohr|be- und entlüftungsrohr|zulage mid|wasserbausteine|statische berechnung|wurzelstock|entwaesserungsrinne|entwässerungsrinne|lehm.*pfeiler|grenzsteine|flaechen und wege|flächen und wege|aeste zurueckschneiden|äste zurückschneiden|baustellenkoordination|ueberfahrten|überfahrten|frostsicheres kiesmaterial|frostschutzkies|frostsicheres material|90 grad-bogen|stampfbetonpfeiler|abdeckplatte|baggerstunden|kompressorstunden|zaehlerplatz|zählerplatz|elektroverteilung|wartungs- und bedienungsanleitung|einsteigleiter)/i.test(text);

  const riskyByScale =
    ((/(m|lfm|meter)/i.test(unit) && qty >= 500 && ep > 25) ||
     (/(kg)/i.test(unit) && qty >= 500 && ep > 8) ||
     (/(cm)/i.test(unit) && ep > 50) ||
     (gp > 25000 && (risk === "" || risk === "low" || risk === "medium")));

  if ((riskyByPattern || riskyByScale) && (status === "" || status === "ok" || status === "warning") && (risk === "" || risk === "low" || risk === "medium")) {
    return {
      ...result,
      calculationStatus: "needs_review",
      riskLevel: "high",
      confidence: Math.min(n(result?.confidence, 0.5), 0.45),
      warning: [
        s(result?.warning),
        "RLC No-X84 Outlier-Guard: Position ohne X84/Angebotsbasis darf nicht automatisch als sicher bewertet werden.",
        `Menge ${round2(qty)} ${row?.einheit || result?.einheit || ""}, EP ${round2(ep)}, GP ${round2(gp)}.`,
      ].filter(Boolean).join(" · "),
      aiReason: [
        s(result?.aiReason),
        "RLC No-X84 Outlier-Guard: Ergebnis bleibt prüfpflichtig, weil keine historische Angebotsbasis vorhanden ist und Muster/Menge/Preis ein hohes Abweichungsrisiko zeigen.",
      ].filter(Boolean).join("\n\n"),
    };
  }

  return result;
}



type NoX84CompanyCalibrationItem = {
  posNr?: string;
  match?: string;
  unit?: string;
  calibratedEp?: number;
  title?: string;
};

let noX84CompanyCalibrationCache: NoX84CompanyCalibrationItem[] | null = null;

function noX84NormText(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadNoX84CompanyCalibration(): NoX84CompanyCalibrationItem[] {
  if (noX84CompanyCalibrationCache) return noX84CompanyCalibrationCache;

  const candidates = [
    path.join(process.cwd(), "src/kalkulation/data/noX84CompanyCalibration.json"),
    path.join(__dirname, "../kalkulation/data/noX84CompanyCalibration.json"),
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        noX84CompanyCalibrationCache = Array.isArray(parsed) ? parsed : [];
        return noX84CompanyCalibrationCache;
      }
    } catch (e) {
      console.warn("[kalkulation.ki] noX84CompanyCalibration load failed", file, e);
    }
  }

  noX84CompanyCalibrationCache = [];
  return noX84CompanyCalibrationCache;
}

function applyNoX84CompanyCalibration(row: any, result: any) {
  if (hasHistoricalOfferBaseline(row)) return result;

  const source = s(result?.source);
  if (!["technical-parser", "recipe", "rule-engine"].includes(source)) return result;

  const list = loadNoX84CompanyCalibration();
  if (!list.length) return result;

  const rowPos = s(row?.posNr || row?.position).replace(/^0+/, "");
  const rowUnit = noX84NormText(row?.einheit || result?.einheit);
  const rowText = noX84NormText([
    row?.kurztext,
    row?.langtext,
    result?.kurztext,
    result?.langtext,
    result?.bauverfahren,
    result?.leistungsart,
  ].join(" "));

  const hit = list.find((x) => {
    const p = s(x.posNr).replace(/^0+/, "");
    const u = noX84NormText(x.unit);
    const m = noX84NormText(x.match || x.title);

    const posOk = p && rowPos && p === rowPos;
    const unitOk = !u || !rowUnit || u === rowUnit;
    const textOk = m && (rowText.includes(m) || m.includes(rowText));

    // Sicherheitsregel:
    // Firmenkalibrierung aus alter X84 darf bei No-X84 zunächst NUR über exakte PosNr greifen.
    // Textmatch wie "Zuschlag" ist zu gefährlich und hat Preise auf falsche Positionen übertragen.
    if (posOk) return true;

    return false;
  });

  const ep = n(hit?.calibratedEp);
  const qty = n(row?.menge ?? result?.menge);

  if (!hit || ep <= 0 || qty <= 0) return result;

  const total = round2(ep * qty);

  return {
    ...result,
    source: "company-calibration",
    baseUnitPrice: round2(ep),
    suggestedUnitPrice: round2(ep),
    finalUnitPrice: round2(ep),
    rlcKiUnitPrice: round2(ep),
    unitPrice: round2(ep),
    preis: round2(ep),
    totalNet: total,
    rlcKiTotal: total,
    gesamt: total,
    confidence: Math.min(n(result?.confidence, 0.62), 0.62),
    calculationStatus: "needs_review",
    riskLevel: "high",
    warning: [
      s(result?.warning),
      "RLC No-X84 Company Calibration: Preis aus historischem Firmenwert + Preissteigerung abgeleitet.",
      "Kein X84 im aktuellen Projekt vorhanden; Position bleibt prüfpflichtig.",
    ].filter(Boolean).join(" · "),
    aiReason: [
      s(result?.aiReason),
      `RLC No-X84 Company Calibration: Match ${hit.posNr || ""} / ${hit.title || hit.match || ""}. Kalibrierter EP: ${round2(ep)}.`,
    ].filter(Boolean).join("\n\n"),
  };
}


function applyNoX84TechnicalUnitNormalizer(row: any, result: any) {
  if (hasHistoricalOfferBaseline(row)) return result;

  const source = s(result?.source);
  if (!["technical-parser", "recipe", "rule-engine"].includes(source)) return result;

  const text = norm(
    [
      row?.posNr,
      row?.position,
      row?.kurztext,
      row?.langtext,
      result?.kurztext,
      result?.langtext,
      result?.bauverfahren,
      result?.leistungsart,
      result?.aiReason,
    ].join(" ")
  );

  const unit = norm(row?.einheit ?? result?.einheit);
  const qty = n(row?.menge ?? result?.menge);

  if (qty <= 0) return result;
  if (!/(m|lfm|meter|kg)/i.test(unit)) return result;

  const oldEp =
    n(result?.finalUnitPrice) ||
    n(result?.rlcKiUnitPrice) ||
    n(result?.suggestedUnitPrice) ||
    n(result?.unitPrice);

  if (oldEp <= 0) return result;

  let normalizedEp = 0;
  let reason = "";

  /*
   * WICHTIG:
   * Diese Werte sind keine endgültige Firmenkalkulation.
   * Sie verhindern nur die falsche Umrechnung von St/Pauschal auf m/lfm/kg.
   * Später werden sie durch echte Firmen-Erfahrungswerte + Urkalkulation ersetzt.
   */
  if (/(druckprobe|druckpruefung|druckprüfung)/i.test(text) && /(speedpipe|mikro|kabel|leer|pe|hdpe)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 0.25;
    reason = "Druckprobe/Speedpipe wurde als Meterleistung normalisiert; St-/Pauschalansatz darf nicht als €/m übernommen werden.";
  } else if (/(kalibrierung)/i.test(text) && /(speedpipe|mikro|kabel|leer)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 0.18;
    reason = "Kalibrierung Speedpipe wurde als Meterleistung normalisiert.";
  } else if (/(ortungsband|trassenwarnband|warnband)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 0.45;
    reason = "Ortungs-/Warnband wurde als Meterleistung normalisiert.";
  } else if (/(kanal.*spuelen|kanal.*spülen|spuelen|spülen)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 3.50;
    reason = "Kanalspülung wurde als Meterleistung normalisiert.";
  } else if (/(baustahl|bewehrung|stahl)/i.test(text) && /kg/i.test(unit)) {
    normalizedEp = 2.80;
    reason = "Baustahl kg wurde auf plausiblen kg-Ansatz normalisiert.";
  } else if (/(wasserhaltung).*leitungsverlegung/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 8.50;
    reason = "Wasserhaltung/Leitungsverlegung wurde als Meterleistung normalisiert.";
  } else if (/(rohrumhuellung|rohrumhüllung|sandueberdeckung|sandüberdeckung|sohlbettung|splittueberdeckung|splittüberdeckung)/i.test(text) && /(hdpe|pe|dn|da|rohr)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 14.50;
    reason = "Rohrbettung/Rohrumhüllung wurde als Meterleistung normalisiert; Recipe-Ansatz war für No-X84 zu hoch.";
  } else if (/(schutzmatte|rohrschutz|kabelschutzmatte)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 6.50;
    reason = "Schutzmatte wurde als Meterleistung normalisiert; Recipe-Ansatz war ohne X84 nicht plausibel.";
  } else if (/(drainageleitung|drainageleitungen)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 28.00;
    reason = "Drainageleitung wurde als Meterleistung normalisiert; technischer Parser hatte falsche schwere Bauleistung übernommen.";
  } else if (/(polyethylenrohr|pe-trinkwasserdruckrohr|pe 100|hdpe|pehd).*dn|dn.*(polyethylenrohr|pe-trinkwasserdruckrohr|pe 100|hdpe|pehd)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 38.00;
    reason = "PE/HDPE-Rohr wurde als Meterleistung normalisiert; extrem hoher Parserwert wurde blockiert.";
  } else if (/(polyethylenrohr|pe-rohr|pehd|pe-r\.weich)/i.test(text) && /(m|lfm|meter)/i.test(unit) && oldEp > 120) {
    normalizedEp = 42.00;
    reason = "PE-Rohr Meterposition wurde normalisiert; Parserwert war ohne X84 unplausibel hoch.";
  } else if (/(forststrassen|forststraßen).*wiederherstellen/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 24.50;
    reason = "Forststraßen-Wiederherstellung wurde aus historischer Plausibilität als Meterleistung normalisiert.";
  } else if (/(gesondertes haufwerk|zulage.*haufwerk)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    normalizedEp = 12.50;
    reason = "Zulage Haufwerk wurde als Meter-Zulage normalisiert; technischer Parserwert war zu hoch.";
  } else if (/(flaechen auflockern|flächen auflockern)/i.test(text) && /(m²|m2|qm)/i.test(unit)) {
    normalizedEp = 2.50;
    reason = "Flächen auflockern wurde als leichte Flächenleistung normalisiert.";
  } else if (/(kernbohrung|kernbohrungen)/i.test(text) && /cm/i.test(unit) && oldEp > 100) {
    normalizedEp = 18.00;
    reason = "Kernbohrung in cm wurde normalisiert; Parserwert €/cm war unplausibel.";
  } else if (/(zulage baugrubenaushub|baugrubenaushub)/i.test(text) && /(m³|m3|cbm)/i.test(unit) && oldEp > 150) {
    normalizedEp = 85.00;
    reason = "Baugrubenaushub wurde auf plausiblen m³-Ansatz normalisiert.";
  }

  if (normalizedEp <= 0) return result;

  if (oldEp <= normalizedEp * 2) return result;

  const total = round2(normalizedEp * qty);

  return {
    ...result,
    baseUnitPrice: round2(normalizedEp),
    suggestedUnitPrice: round2(normalizedEp),
    finalUnitPrice: round2(normalizedEp),
    rlcKiUnitPrice: round2(normalizedEp),
    unitPrice: round2(normalizedEp),
    preis: round2(normalizedEp),
    totalNet: total,
    rlcKiTotal: total,
    gesamt: total,
    confidence: Math.min(n(result?.confidence, 0.55), 0.55),
    calculationStatus: "needs_review",
    riskLevel: "high",
    warning: [
      s(result?.warning),
      "RLC No-X84 Unit-Normalisierung: technischer St-/Pauschalansatz wurde nicht als EP der LV-Einheit übernommen.",
      reason,
      `Alter EP ${round2(oldEp)} wurde auf ${round2(normalizedEp)} €/` + (row?.einheit || result?.einheit || "EH") + " normalisiert.",
    ].filter(Boolean).join(" · "),
    aiReason: [
      s(result?.aiReason),
      "RLC No-X84 Technical Unit Normalizer: Ohne X84/Angebotsbasis wurde eine offensichtliche Einheitenverwechslung korrigiert. Ergebnis bleibt prüfpflichtig.",
    ].filter(Boolean).join("\n\n"),
  };
}


function guardNoX84ImplausibleKiResult(row: any, result: any) {
  if (hasHistoricalOfferBaseline(row)) return result;

  const source = s(result?.source);
  if (!["technical-parser", "recipe", "rule-engine"].includes(source)) return result;

  const text = norm(
    [
      row?.posNr,
      row?.position,
      row?.kurztext,
      row?.langtext,
      result?.kurztext,
      result?.langtext,
      result?.aiReason,
    ].join(" ")
  );

  const unit = norm(row?.einheit ?? result?.einheit);
  const qty = n(row?.menge ?? result?.menge);
  const ep =
    n(result?.finalUnitPrice) ||
    n(result?.rlcKiUnitPrice) ||
    n(result?.suggestedUnitPrice) ||
    n(result?.unitPrice);

  if (ep <= 0) return result;

  let maxEp = 0;
  let reason = "";

  // Sehr günstige Prüf-/Nebenleistungen dürfen nicht wie komplette Bauleistungen kalkuliert werden.
  if (/(druckprobe|druckpruefung|kalibrierung|ortungsband|trassenwarnband)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    maxEp = 10;
    reason = "Prüf-/Nebenleistung pro Meter ohne X84-Baseline darf nicht als schwere Bauleistung kalkuliert werden.";
  }

  // Spülen / Reinigung pro Meter darf nicht automatisch mehrere hundert EUR/m werden.
  if (/(kanal.*spuelen|kanal.*spülen|spuelen|spülen)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    maxEp = 25;
    reason = "Spül-/Reinigungsleistung pro Meter ohne X84-Baseline ist über dem Plausibilitätsrahmen.";
  }

  // Schutzmatten, Sandbettung, Rohrumhüllung sind bei großen Längen kritisch.
  if (/(schutzmatte|rohrumhuellung|rohrumhüllung|sandueberdeckung|sandüberdeckung|sohlbettung|splittueberdeckung|splittüberdeckung)/i.test(text) && /(m|lfm|meter)/i.test(unit)) {
    maxEp = 60;
    reason = "Rohrbettung/Schutzlage pro Meter ohne X84-Baseline überschreitet Plausibilitätsrahmen.";
  }

  // Stahl kg darf nicht als Bauteil pauschal mit hunderten EUR/kg laufen.
  if (/(baustahl|bewehrung|stahl)/i.test(text) && /kg/i.test(unit)) {
    maxEp = 8;
    reason = "Stahlposition in kg ohne X84-Baseline wurde zu hoch klassifiziert.";
  }

  // Generische Sicherheitsleine: große Mengen mit extremem EP nicht automatisch sicher.
  if (!maxEp && qty >= 1000 && /(m|lfm|kg)/i.test(unit) && ep > 150) {
    maxEp = 150;
    reason = "Große Mengen ohne X84-Baseline mit sehr hohem EP müssen manuell geprüft werden.";
  }

  if (maxEp > 0 && ep > maxEp) {    return {
      ...result,
      calculationStatus: "needs_review",
      riskLevel: "high",
      confidence: Math.min(n(result?.confidence, 0.5), 0.45),
      warning: [
        s(result?.warning),
        "RLC Plausibilitätsstopp: KI-Preis ohne X84/Angebot nicht automatisch freigegeben.",
        reason,
        `EP ${round2(ep)} €/` + (row?.einheit || result?.einheit || "EH") + ` > Plausibilitätsgrenze ${round2(maxEp)}.`,
      ].filter(Boolean).join(" "),
      aiReason: [
        s(result?.aiReason),
        "RLC Guard No-X84: Der Preis wurde nicht als sicher freigegeben, weil keine historische Angebots-/X84-Baseline vorhanden ist und der technische Parser/Recipe einen unplausiblen EP erzeugt hat.",
      ].filter(Boolean).join("\n"),
    };
  }

  return result;
}


function evaluateDbComparability(row: any, result: any) {
  const x84Ep =
    n(row?.angebotUnitPrice) ||
    n(row?.x84UnitPrice) ||
    n(row?.preis) ||
    n(row?.unitPrice) ||
    0;

  const kiEp =
    n(result?.rlcKiUnitPrice) ||
    n(result?.finalUnitPrice) ||
    n(result?.suggestedUnitPrice) ||
    0;

  const unit = norm(row?.einheit ?? result?.einheit);
  const text = norm(
    [
      row?.kurztext,
      row?.langtext,
      result?.kurztext,
      result?.langtext,
    ].filter(Boolean).join(" ")
  );

  const source = s(result?.source);
  const reverse = result?.reverseUrkalkulation || null;

  if (!x84Ep || !kiEp) {
    return {
      status: "not_checked",
      comparable: true,
      reason: "X84/KI-EP fehlt. Vergleich nicht möglich.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: x84Ep > 0 ? round2(kiEp / x84Ep) : 0,
    };
  }

  if (source !== "database") {
    return {
      status: "x84_baseline",
      comparable: true,
      reason: "Keine direkte Datenbankbewertung. X84 wurde als Angebotsbasis rückwärts in eine Urkalkulation zerlegt.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: x84Ep > 0 ? round2(kiEp / x84Ep) : 0,
      workClass: reverse?.workClass || "",
    };
  }

  const factor = kiEp / x84Ep;

  /*
   * Historische Angebotsbasis:
   * Wenn X84/Angebotspreis vorhanden ist, kann er aus einem alten, real kalkulierten Projekt stammen.
   * Für die aktuelle Plausibilitätsprüfung wird deshalb ein Preisindex angesetzt.
   * Standard aktuell: +12% Preissteigerung, mit ±12% Toleranz.
   */
  const historicalIndexFactor = 1.12;
  const historicalTolerance = 0.12;
  const expectedHistoricalEp = x84Ep * historicalIndexFactor;
  const minHistoricalEp = expectedHistoricalEp * (1 - historicalTolerance);
  const maxHistoricalEp = expectedHistoricalEp * (1 + historicalTolerance);

  if (
    source === "database" &&
    x84Ep > 0 &&
    kiEp > 0 &&
    (kiEp < minHistoricalEp || kiEp > maxHistoricalEp)
  ) {
    return {
      status: "needs_review",
      comparable: false,
      reason:
        "Datenbankwert liegt außerhalb der historischen X84-Basis (+12% Preisindex, ±12% Toleranz). Prüfung über Langtext, Menge, Einheit und Urkalkulation erforderlich.",
      x84UnitPrice: round2(x84Ep),
      expectedHistoricalUnitPrice: round2(expectedHistoricalEp),
      minOkUnitPrice: round2(minHistoricalEp),
      maxOkUnitPrice: round2(maxHistoricalEp),
      kiUnitPrice: round2(kiEp),
      factor: round2(kiEp / expectedHistoricalEp),
      workClass: reverse?.workClass || "",
    };
  }

  const lightWork =
    text.includes("druckprobe") ||
    text.includes("druckprüfung") ||
    text.includes("kalibrierung") ||
    text.includes("ortungsband") ||
    text.includes("warnband") ||
    text.includes("trassenwarnband") ||
    text.includes("schutzband") ||
    text.includes("spülung") ||
    text.includes("entkeimung");

  const massUnit =
    unit === "m" ||
    unit === "lfm" ||
    unit === "m²" ||
    unit === "m2" ||
    unit === "kg";

  const massPosition = n(row?.menge ?? result?.menge) >= 1000 && massUnit;

  if (lightWork && factor > 20) {
    return {
      status: "not_comparable",
      comparable: false,
      reason:
        "Datenbankwert ist für eine leichte Neben-/Prüfleistung im Verhältnis zum X84-Preis extrem hoch. Wahrscheinlich anderer Leistungsumfang oder falscher Lernwert.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: round2(factor),
      workClass: reverse?.workClass || "",
    };
  }

  if (massPosition && factor > 50) {
    return {
      status: "not_comparable",
      comparable: false,
      reason:
        "Massposition mit sehr großer Preisabweichung. Datenbankwert wird nicht direkt als vergleichbarer EP bewertet.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: round2(factor),
      workClass: reverse?.workClass || "",
    };
  }

  if (factor > 10 || factor < 0.1) {
    return {
      status: "needs_review",
      comparable: false,
      reason:
        "Datenbankwert weicht stark vom X84-Preis ab. Vergleich nur mit Langtext- und Urkalkulationsprüfung zulässig.",
      x84UnitPrice: round2(x84Ep),
      kiUnitPrice: round2(kiEp),
      factor: round2(factor),
      workClass: reverse?.workClass || "",
    };
  }

  return {
    status: "comparable",
    comparable: true,
    reason: "Datenbankwert liegt in einem plausiblen Verhältnis zum X84-Preis.",
    x84UnitPrice: round2(x84Ep),
    kiUnitPrice: round2(kiEp),
    factor: round2(factor),
    workClass: reverse?.workClass || "",
  };
}

function enrichRowWithReverseUrkalkulation(row: any, result: any) {
  const x84UnitPrice =
    n(row?.angebotUnitPrice) ||
    n(row?.x84UnitPrice) ||
    n(row?.preis) ||
    n(row?.unitPrice) ||
    n(result?.angebotUnitPrice) ||
    n(result?.x84UnitPrice) ||
    0;

  const menge =
    n(row?.menge) ||
    n(row?.qty) ||
    n(row?.quantity) ||
    n(result?.menge) ||
    0;

  const x84Total =
    n(row?.angebotTotal) ||
    n(row?.x84Total) ||
    n(row?.gesamt) ||
    (x84UnitPrice > 0 && menge > 0 ? x84UnitPrice * menge : 0);

  if (!x84UnitPrice || !menge) {
    return {
      ...result,
      reverseUrkalkulation: null,
    };
  }

  const reverseUrkalkulation = reverseUrkalkulationFromX84({
    posNr: row?.posNr ?? row?.position ?? row?.pos ?? result?.posNr,
    kurztext: row?.kurztext ?? row?.shortText ?? row?.text ?? result?.kurztext,
    langtext: row?.langtext ?? row?.longText ?? row?.description ?? result?.langtext,
    einheit: row?.einheit ?? row?.unit ?? result?.einheit,
    menge,
    x84UnitPrice,
    x84Total,
    projectDistanceKm:
      n(row?.projectDistanceKm) ||
      n(result?.projectDistanceKm) ||
      undefined,
    projectDurationDays:
      n(row?.projectDurationDays) ||
      n(result?.projectDurationDays) ||
      undefined,
  });

  let enriched = {
    ...result,
    reverseUrkalkulation,
  };

  enriched = guardNoX84ImplausibleKiResult(row, enriched);
  const dbComparability = evaluateDbComparability(row, enriched);

  if (
    dbComparability?.status === "not_comparable" ||
    dbComparability?.status === "needs_review"
  ) {
    return {
      ...enriched,
      dbComparability,
      suggestedUnitPrice: round2(x84UnitPrice),
      finalUnitPrice: round2(x84UnitPrice),
      rlcKiUnitPrice: round2(x84UnitPrice),
      unitPrice: round2(x84UnitPrice),
      preis: round2(x84UnitPrice),
      totalNet: round2(x84Total),
      rlcKiTotal: round2(x84Total),
      gesamt: round2(x84Total),
      calculationStatus: "warning",
      riskLevel: "medium",
      source: "x84-reverse-urkalkulation",
      warning: [
        s(result?.warning),
        dbComparability?.status === "not_comparable"
          ? "DB-Treffer nicht vergleichbar mit X84-Urkalkulation. X84 wurde rückwärts zerlegt und als belastbare Angebotsbasis verwendet."
          : "DB-Treffer weicht stark von X84 ab. X84 wurde als Angebotsbasis beibehalten; DB nur als Prüfhinweis.",
      ].filter(Boolean).join(" · "),
      aiReason: [
        s(result?.aiReason),
        "RLC Reverse-Urkalkulation: X84 ist bei vorhandener Angebotsbasis führend. Datenbankwerte dürfen nur bei echter Vergleichbarkeit und gleichem Kontext übernommen werden.",
        reverseUrkalkulation?.explanation || "",
      ].filter(Boolean).join("\n\n"),
    };
  }

  const finalSource =
    dbComparability?.status === "x84_baseline" &&
    n(enriched?.finalUnitPrice) === round2(x84UnitPrice)
      ? "x84-reverse-urkalkulation"
      : enriched?.source;

  return {
    ...enriched,
    source: finalSource,
    dbComparability,
    warning: [
      s(result?.warning),
      dbComparability?.status === "needs_review" ? "DB-Treffer nur nach Langtext-/Urkalkulationsprüfung vergleichbar." : "",
    ].filter(Boolean).join(" · "),
  };
}

router.post("/suggest-batch", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const rows: InputRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: "NO_ROWS" });

    const options = req.body?.options || {};
      const useOpenAIIfNoDatabaseHit = options.useOpenAIIfNoDatabaseHit !== false;
      const maxOpenAiRowsPerBatch = Math.max(
        0,
        Math.min(20, n(options.maxOpenAiRowsPerBatch, 5))
      );
      const forceRecalculate =
        options.forceRecalculate === true ||
        options.ignoreCache === true ||
        options.noCache === true ||
        req.body?.forceRecalculate === true;

      const startedAt = Date.now();

      const out: any[] = new Array(rows.length);
      let openAiUsed = 0;
      let nextRowIndex = 0;

      /*
       * SPEED FIX SERVER:
       * Vorher wurde jede Position sequenziell gerechnet.
       * Jetzt laufen mehrere Positionen kontrolliert parallel.
       * OpenAI bleibt über maxOpenAiRowsPerBatch begrenzt.
       */
      const maxParallelRows = Math.max(
        1,
        Math.min(2, n(options.maxParallelRows, forceRecalculate ? 1 : 2))
      );

      async function processRow(index: number) {
        const row = rows[index];

        let budgetLeft = 0;

        try {
          const matches = await findDbMatches(companyId, row);

          if (openAiUsed < maxOpenAiRowsPerBatch) {
            openAiUsed += 1;
            budgetLeft = 1;
          }

          out[index] = await calcSmartRow(row, matches, companyId, useOpenAIIfNoDatabaseHit,
            budgetLeft,
            forceRecalculate
          );

          if (out[index]?.source !== "openai" && budgetLeft > 0) {
            openAiUsed = Math.max(0, openAiUsed - 1);
          }
        } catch (rowError: any) {
          if (budgetLeft > 0) {
            openAiUsed = Math.max(0, openAiUsed - 1);
          }

          console.error("[kalkulation.ki] row fallback", {
            index,
            posNr: s(row?.posNr),
            kurztext: s(row?.kurztext).slice(0, 120),
            error: rowError?.message || rowError,
          });

          out[index] = calcRuleRow(row, [], "rule-engine");
        }
      }

      async function worker() {
        while (nextRowIndex < rows.length) {
          const index = nextRowIndex;
          nextRowIndex += 1;
          await processRow(index);
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(maxParallelRows, rows.length) },
          () => worker()
        )
      );

      const finalRows = out.map((r, index) => {
        const base = r || calcRuleRow(rows[index], [], "rule-engine");
        const enriched = enrichRowWithReverseUrkalkulation(rows[index], base);
        const normalized = applyNoX84TechnicalUnitNormalizer(rows[index], enriched);
        const calibrated = applyNoX84CompanyCalibration(rows[index], normalized);
        const unsafeGuarded = guardNoX84UnsafeOkResult(rows[index], calibrated);
        return guardNoX84ImplausibleKiResult(rows[index], unsafeGuarded);
      });

      const learningProjectKey = s(req.body?.projectCode || req.body?.projectKey);
      const learnedCount = await saveKiLearningRows(
        companyId,
        learningProjectKey,
        finalRows
      );

      console.log("[kalkulation.ki] learning", {
        rows: finalRows.length,
        learnedCount,
        durationMs: Date.now() - startedAt,
        maxParallelRows,
        maxOpenAiRowsPerBatch,
        openAiUsed,
        sources: finalRows.reduce((acc: any, r: any) => {
          const key = r?.source || "unknown";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      });

      return res.json({
        ok: true,
        source: "server",
        engine: "database-recipe-openai-rule-engine-parallel-v2",
        rows: finalRows,
        summary: {
          ...buildSummary(finalRows),
          learnedCount,
          forceRecalculate,
          cacheBypassed: forceRecalculate,
          durationMs: Date.now() - startedAt,
          maxParallelRows,
          maxOpenAiRowsPerBatch,
          openAiUsed,
        },
    });
  } catch (e: any) {
    console.error("[kalkulation.ki] suggest-batch failed:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "KI_SUGGEST_FAILED",
    });
  }
});

export default router;
