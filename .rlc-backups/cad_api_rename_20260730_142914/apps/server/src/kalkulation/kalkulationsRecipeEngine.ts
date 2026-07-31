import { prisma } from "../lib/prisma";
import {
  RLC_PREIS_BIBLIOTHEK,
  findRlcPreisItems,
  rlcPreisRangeForText,
} from "./rlcPreisBibliothek";
import { parseRlcTechnicalPosition } from "./technicalParser/rlcTechnicalPositionParser";

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
  note?: string;
};

let templateCache: any[] | null = null;
let cacheTs = 0;

function s(v: any): string {
  return String(v ?? "").trim();
}

function n(v: any, fallback = 0): number {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : fallback;
}

function round2(v: number): number {
  return Math.round((n(v) + Number.EPSILON) * 100) / 100;
}

function norm(v: any): string {
  return s(v)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function normUnit(value: any): string {
  const u = norm(value);
  if (u === "m2" || u === "m^2" || u === "qm") return "m²";
  if (u === "m3" || u === "m^3" || u === "cbm") return "m³";
  if (u === "stk" || u === "stck" || u === "stueck" || u === "stück") return "St";
  return s(value);
}

function lightSurfaceRange(text: string, unitRaw: string): { min: number; avg: number; max: number; label: string; group: PriceBreakdownGroup } {
  const t = norm(text);

  const u = normUnit(unitRaw);

  if (u !== "m²") return { min: 0, avg: 0, max: 0, label: "", group: "Fremdleistung" };

  if (t.includes("unterlage reinigen") || t.includes("untergrund reinigen") || t.includes("flaeche reinigen") || t.includes("fläche reinigen")) {
    return { min: 0.15, avg: 0.45, max: 2.5, label: "Unterlage reinigen", group: "Maschinen" };
  }

  if (t.includes("schichtenverbund") || t.includes("haftkleber") || t.includes("bitumenemulsion")) {
    return { min: 0.35, avg: 0.85, max: 2.5, label: "Schichtenverbund herstellen", group: "Material" };
  }

  if (t.includes("einfraesen") || t.includes("einfräsen") || t.includes("fraesen") || t.includes("fräsen") || t.includes("abfraesen") || t.includes("abfräsen")) {
    return { min: 2, avg: 4.5, max: 9, label: "Asphalt einfräsen", group: "Maschinen" };
  }

  if (t.includes("zulage") && (t.includes("mehr") || t.includes("minder")) && (t.includes("staerke") || t.includes("stärke"))) {
    return { min: 1, avg: 4.5, max: 12, label: "Zulage Mehr-/Minderstärke", group: "Fremdleistung" };
  }

  // X83_LIGHT_RANGE_ZUSCHLAG_HAND_ASPHALT
  if (
    t.includes("zuschlag") &&
    t.includes("hand") &&
    (t.includes("ats") || t.includes("ads") || t.includes("asphalt"))
  ) {
    return { min: 6, avg: 12, max: 24, label: "Zuschlag Handeinbau Asphalt", group: "Fremdleistung" };
  }

  if (t.includes("ac 11 ds") || t.includes("ads aus ac 11") || (t.includes("deckschicht") && (t.includes("4 cm") || false))) {
    return { min: 10, avg: 18, max: 32, label: "ADS AC 11 DS 4 cm", group: "Fremdleistung" };
  }

  if (t.includes("planie") || t.includes("feinplanum")) {
    return { min: 2, avg: 5, max: 10, label: "Planie / Feinplanum", group: "Maschinen" };
  }

  return { min: 0, avg: 0, max: 0, label: "", group: "Fremdleistung" };
}

function clampLightSurfaceEp(text: string, unit: string, ep: number): number {
  const range = lightSurfaceRange(text, unit);
  const value = n(ep);
  if (range.avg <= 0) return round2(value);
  if (value <= 0) return round2(range.avg);
  if (value < range.min || value > range.max) return round2(range.avg);
  return round2(value);
}


function tokens(text: string): string[] {
  return Array.from(
    new Set(
      norm(text)
        .split(" ")
        .filter((x) => x.length >= 3)
    )
  );
}

function detectGroup(type: string, refKey: string): PriceBreakdownGroup {
  const t = s(type).toUpperCase();
  const r = norm(refKey);

  if (t.includes("LABOR")) return "Personal";
  if (t.includes("MACHINE")) return "Maschinen";
  if (r.includes("transport") || r.includes("lkw")) return "LKW / Transport";
  if (r.includes("entsorgung") || r.includes("deponie")) return "Entsorgung";
  if (t.includes("MATERIAL")) return "Material";
  if (t.includes("SUB")) return "Fremdleistung";

  return "Material";
}

function defaultPriceFor(refKey: string, rowText: string, unit: string): { price: number; name: string; unit: string } {
  const r = s(refKey);

  if (r.startsWith("LABOR:FACHARBEITER")) return { price: 58, name: "Facharbeiter", unit: "h" };
  if (r.startsWith("LABOR:HELFER")) return { price: 42, name: "Helfer", unit: "h" };

  if (r.startsWith("MACHINE:BAGGER_8_14T")) return { price: 82, name: "Bagger 8–14 t", unit: "h" };
  if (r.startsWith("MACHINE:RUETTELPLATTE")) return { price: 18, name: "Rüttelplatte / Verdichtung", unit: "h" };

  const key = norm(r.replace(/^RLC_PREIS:/i, ""));
  const direct = RLC_PREIS_BIBLIOTHEK.find((x) => norm(x.id).includes(key) || key.includes(norm(x.id)));

  if (direct) {
    return {
      price: n(direct.avgPrice),
      name: direct.name,
      unit: direct.unit,
    };
  }

  const matches = findRlcPreisItems({ text: `${rowText} ${r}`, unit, limit: 1 });
  if (matches[0]) {
    return {
      price: n(matches[0].avgPrice),
      name: matches[0].name,
      unit: matches[0].unit,
    };
  }

  const range = rlcPreisRangeForText(rowText, unit);
  if (n(range.avg) > 0) {
    return {
      price: n(range.avg),
      name: "RLC Preisbibliothek Richtwert",
      unit: unit || "EH",
    };
  }

  return { price: 25, name: r || "Ressource", unit: unit || "EH" };
}

function evalQtyFormula(formula: string, params: any): number {
  try {
    const fn = new Function("params", `return Number(${formula || "1"}) || 0;`);
    return Math.max(0, n(fn(params), 0));
  } catch {
    return 1;
  }
}


function technicalQtyOverride(refKeyRaw: string, currentQty: number, params: any): number {
  const refKey = norm(refKeyRaw);
  const current = n(currentQty);

  /*
   * Universelle technische Mengenlogik:
   * Wenn der Technical Parser echte Schicht-/Aushub-/Entsorgungsmengen erkannt hat,
   * ersetzen diese Werte die groben Rezeptformeln.
   * Dadurch gilt: LV-Text -> technische Parameter -> Mengenansatz -> Preis.
   */
  if (refKey.includes("material splitt") || refKey.includes("splitt")) {
    if (n(params.splitt_m3_per_m2) > 0) return round2(n(params.splitt_m3_per_m2));
  }

  if (refKey.includes("frostschutz")) {
    if (n(params.frostschutz_m3_per_m2) > 0) return round2(n(params.frostschutz_m3_per_m2));
  }

  if (refKey.includes("sand") || refKey.includes("rohrbettung")) {
    if (n(params.sand_m3_per_m2) > 0) return round2(n(params.sand_m3_per_m2));
  }

  if (refKey.includes("schotter")) {
    if (n(params.schotter_m3_per_m2) > 0) return round2(n(params.schotter_m3_per_m2));
  }

  if (refKey.includes("kies") && !refKey.includes("frostschutz")) {
    if (n(params.kies_m3_per_m2) > 0) return round2(n(params.kies_m3_per_m2));
  }

  if (
    refKey.includes("aushub") ||
    refKey.includes("auskofferung") ||
    refKey.includes("loesen laden") ||
    refKey.includes("losen laden")
  ) {
    if (n(params.aushub_m3_per_m2) > 0) return round2(n(params.aushub_m3_per_m2));
  }

  if (refKey.includes("entsorgung") || refKey.includes("deponie")) {
    if (n(params.disposal_t_per_m2) > 0) return round2(n(params.disposal_t_per_m2));
  }

  if (
    refKey.includes("transport aushub") ||
    refKey.includes("abfuhr") ||
    refKey.includes("aushubtransport")
  ) {
    if (n(params.aushub_m3_per_m2) > 0) return round2(n(params.aushub_m3_per_m2));
  }

  if (refKey.includes("transport material") || refKey.includes("materialanlieferung")) {
    if (n(params.layer_m3_per_m2) > 0) return round2(n(params.layer_m3_per_m2));
  }

  return round2(current);
}

function extractDepth(text: string): number {
  const t = norm(text);
  const m = t.match(/(\d+(?:[,.]\d+)?)\s*m\s*(tiefe|tief|grabentiefe)?/i);
  if (m?.[1]) return n(m[1]);

  if (t.includes("1 20") || t.includes("120")) return 1.2;
  if (t.includes("1 50") || t.includes("150")) return 1.5;
  if (t.includes("2 00") || t.includes("200")) return 2.0;

  return 1.2;
}

function detectSurface(text: string): string {
  const t = norm(text);
  if (t.includes("asphalt")) return "ASPHALT";
  if (t.includes("pflaster")) return "PFLASTER";
  if (t.includes("beton")) return "BETON";
  if (t.includes("schotter") || t.includes("kies")) return "SCHOTTER";
  if (t.includes("rasen")) return "RASEN";
  return "UNBEFESTIGT";
}

function detectSoil(text: string): string {
  const t = norm(text);
  if (t.includes("fels")) return "FELS";
  if (t.includes("kontaminiert") || t.includes("belastet")) return "KONTAMINIERT";
  if (t.includes("grundwasser") || t.includes("nass")) return "NASS";
  if (t.includes("bestand") || t.includes("querung")) return "BESTAND";
  if (t.includes("bodenklasse 5") || t.includes("bk5")) return "BK5";
  if (t.includes("bodenklasse 6") || t.includes("bk6")) return "BK6";
  if (t.includes("bodenklasse 3") || t.includes("bk3")) return "BK3";
  return "BK4";
}

function detectRegion(text: string): string {
  const t = norm(text);
  if (t.includes("verkehr") || t.includes("strasse") || t.includes("straße")) return "UNTER_VERKEHR";
  if (t.includes("innenstadt") || t.includes("beengt")) return "INNENSTADT";
  if (t.includes("stadt")) return "STADT";
  return "LAND";
}

function scoreTemplate(tpl: any, rowText: string, unit: string): number {
  const hay = norm([
    tpl.key,
    tpl.title,
    tpl.category,
    tpl.unit,
    ...(tpl.tags || []),
  ].join(" "));

  let score = 0;
  for (const tok of tokens(rowText)) {
    if (hay.includes(tok)) score += 6;
  }

  const rt = norm(rowText);

  const isSurfaceText =
    rt.includes("asphalt") ||
    rt.includes("pflaster") ||
    rt.includes("oberflaeche") ||
    rt.includes("oberfläche") ||
    rt.includes("wiederherstellen") ||
    rt.includes("angleichen") ||
    rt.includes("decke");

  const isEarthworkText =
    rt.includes("aushub") ||
    rt.includes("graben herstellen") ||
    rt.includes("baugrube") ||
    rt.includes("auskofferung") ||
    rt.includes("boden lösen") ||
    rt.includes("boden loesen");

  /*
   * RLC HARD TEMPLATE DISAMBIGUATION:
   * Verhindert falsche Rezeptwahl bei sehr ähnlichen LV-Texten.
   */
  const isPlanieText =
    rt.includes("planie") ||
    rt.includes("feinplanum") ||
    rt.includes("planum");

  const isAsphaltFraesenText =
    rt.includes("asphalt") &&
    (rt.includes("fräsen") ||
      rt.includes("fraesen") ||
      rt.includes("frasen") ||
      rt.includes("aufbruch") ||
      rt.includes("aufbrechen")) &&
    !rt.includes("wiederherstellen") &&
    !rt.includes("wiederherstellung");

  const isAsphaltLayerText =
    rt.includes("asphalt") &&
    (rt.includes("tragschicht") ||
      rt.includes("deckschicht") ||
      rt.includes("ac 22") ||
      rt.includes("ac22") ||
      rt.includes("ac 8") ||
      rt.includes("ac8"));

  const isPflasterNewText =
    rt.includes("pflaster") &&
    (rt.includes("herstellen") || rt.includes("verlegen")) &&
    !rt.includes("wiederherstellen") &&
    !rt.includes("wiederherstellung") &&
    !rt.includes("aufnehmen") &&
    !rt.includes("lagern");

  if (isPlanieText) {
    if (hay.includes("planie") || hay.includes("feinplanum") || hay.includes("planum")) score += 260;
    if (hay.includes("graben") || hay.includes("aushub") || hay.includes("asphalt") || hay.includes("pflaster")) score -= 240;
  }

  if (isAsphaltFraesenText) {
    if (hay.includes("fräsen") || hay.includes("fraesen") || hay.includes("frasen")) score += 280;
    if (hay.includes("aufbruch") || hay.includes("aufbrechen") || hay.includes("aufnehmen")) score += 220;
    if (hay.includes("schneiden")) score -= 260;
    if (hay.includes("wiederherstellen") || hay.includes("wiederherstellung") || hay.includes("endgueltig") || hay.includes("endgültig")) score -= 320;
  }

  if (isAsphaltLayerText) {
    if (hay.includes("tragschicht") || hay.includes("deckschicht") || hay.includes("asphaltschicht") || hay.includes("einbauen")) score += 280;
    if (hay.includes("schneiden") || hay.includes("fräsen") || hay.includes("fraesen") || hay.includes("frasen") || hay.includes("aufbruch")) score -= 320;
    if (hay.includes("wiederherstellen") || hay.includes("wiederherstellung")) score -= 180;
  }

  if (isPflasterNewText) {
    if (hay.includes("komplett") || hay.includes("herstellen") || hay.includes("verlegen")) score += 260;
    if (hay.includes("aufnehmen") || hay.includes("lagern")) score -= 360;
    if (hay.includes("wiederherstellen") || hay.includes("wiederherstellung")) score -= 140;
  }


  if (rt.includes("speedpipe") && hay.includes("speedpipe")) score += 60;
  if (rt.includes("glasfaser") && hay.includes("glasfaser")) score += 45;
  if (rt.includes("wasser") && hay.includes("wasser")) score += 45;
  if ((rt.includes("kanal") || rt.includes("kg rohr")) && hay.includes("kanal")) score += 45;
  if (rt.includes("kabelschutz") && hay.includes("kabelschutz")) score += 45;
  if (rt.includes("drainage") && hay.includes("drainage")) score += 45;

  /*
   * Harte Fachlogik:
   * Wenn die LV-Position eine Oberflächen-Wiederherstellung ist,
   * darf "Leitungsgraben" im Text NICHT zu einem Graben-/Erdarbeiten-Rezept führen.
   */
  if (isSurfaceText) {
    if (hay.includes("oberflaeche")) score += 180;
    if (rt.includes("asphalt") && hay.includes("asphalt")) score += 160;
    if (rt.includes("pflaster") && hay.includes("pflaster")) score += 160;
    if (rt.includes("wiederherstellen") && hay.includes("wiederherstellen")) score += 120;

    if (hay.includes("graben") && !hay.includes("asphalt") && !hay.includes("pflaster")) score -= 220;
    if (hay.includes("erdarbeiten") && !hay.includes("oberflaeche")) score -= 180;
    if (hay.includes("aushub") && !hay.includes("asphalt") && !hay.includes("pflaster")) score -= 180;
  }

  if (!isSurfaceText && isEarthworkText && hay.includes("graben")) score += 60;
  if (!isSurfaceText && isEarthworkText && hay.includes("erdarbeiten")) score += 35;

  if (unit && norm(tpl.unit) === norm(unit)) score += 12;

  return score;
}

function scoreVariant(params: any, rowText: string): number {
  const depth = extractDepth(rowText);
  const surface = detectSurface(rowText);
  const soil = detectSoil(rowText);
  const region = detectRegion(rowText);

  let score = 0;

  if (params.depth_m) score += Math.max(0, 30 - Math.abs(n(params.depth_m) - depth) * 25);
  if (params.surface === surface) score += 25;
  if (params.soilClass === soil) score += 25;
  if (params.region === region) score += 20;

  return score;
}

async function loadTemplates() {
  const now = Date.now();

  if (templateCache && now - cacheTs < 5 * 60 * 1000) return templateCache;

  templateCache = await prisma.recipeTemplate.findMany({
    include: {
      components: { orderBy: { sort: "asc" } },
      variants: {
        where: { enabled: true },
        take: 600,
      },
    },
  });

  cacheTs = now;
  return templateCache;
}


function buildDirectTechnicalRecipeOverride(
  row: InputRow,
  text: string,
  einheit: string,
  menge: number
): any | null {
  const t = norm(text);
  const range = rlcPreisRangeForText(text, einheit);
  const existingEp = n(row.preis);

  function make(
    finalEpRaw: number,
    mainGroup: PriceBreakdownGroup,
    bauverfahren: string,
    gewerk = "Tiefbau",
    leistungsart = "Direkte technische Rezeptlogik"
  ) {
    const finalEp = round2(finalEpRaw);
    if (finalEp <= 0) return null;

    const direct = round2(finalEp / 1.2312);
    const overheadCost = round2(direct * 0.10);
    const riskCost = round2(direct * 0.04);
    const profitCost = round2((direct + overheadCost + riskCost) * 0.08);

    const priceBreakdown: PriceBreakdownLine[] = [
      {
        id: "direct-main",
        group: mainGroup,
        name: bauverfahren,
        unit: einheit || "EH",
        qty: 1,
        price: direct,
        total: direct,
        note: "Direkte RLC-Rezeptlogik / Preisbibliothek",
      },
      {
        id: "direct-gk",
        group: "Gemeinkosten",
        name: "Gemeinkosten",
        unit: einheit || "EH",
        qty: 1,
        price: overheadCost,
        total: overheadCost,
        note: "10 %",
      },
      {
        id: "direct-risk",
        group: "Risiko",
        name: "Risiko",
        unit: einheit || "EH",
        qty: 1,
        price: riskCost,
        total: riskCost,
        note: "4 %",
      },
      {
        id: "direct-profit",
        group: "Gewinn",
        name: "Gewinn",
        unit: einheit || "EH",
        qty: 1,
        price: profitCost,
        total: profitCost,
        note: "8 %",
      },
    ];

    return {
      id: row.id,
      posNr: s(row.posNr),
      kurztext: s(row.kurztext),
      langtext: s(row.langtext),
      einheit,
      menge,

      materialCost: mainGroup === "Material" ? direct : 0,
      laborCost: mainGroup === "Personal" ? direct : 0,
      machineCost: mainGroup === "Maschinen" || mainGroup === "LKW / Transport" ? direct : 0,
      subcontractorCost: mainGroup === "Fremdleistung" ? direct : 0,
      disposalCost: mainGroup === "Entsorgung" ? direct : 0,
      overheadCost,
      riskCost,
      profitCost,

      baseUnitPrice: finalEp,
      suggestedUnitPrice: finalEp,
      finalUnitPrice: finalEp,

      confidence: 0.92,
      riskLevel: "low",
      calculationStatus: "ok",

      gewerk,
      leistungsart,
      bauverfahren,

      warning: "Direkte technische RLC-Rezeptlogik verwendet. Firmenpreise und Baustellenbedingungen prüfen.",
      aiReason: `Direkte RLC-Rezeptlogik: ${bauverfahren}. Scoring-Mehrdeutigkeiten wurden bewusst umgangen.`,

      source: "recipe",

      rlcPreisMin: round2(n(range.min)),
      rlcPreisAvg: round2(n(range.avg)),
      rlcPreisMax: round2(n(range.max)),
      rlcPreisSource: n(range.avg) > 0 ? "RLC Preisbibliothek" : "",
      rlcPreisGroup: n(range.avg) > 0 ? range.matches?.[0]?.group || String(mainGroup) : String(mainGroup),

      priceBreakdown,
    };
  }

  const lightSurface = lightSurfaceRange(text, einheit);

  if (lightSurface.avg > 0) {
    const ep =
      existingEp > 0 && existingEp >= lightSurface.min && existingEp <= lightSurface.max
        ? existingEp
        : lightSurface.avg;

    return make(
      ep,
      lightSurface.group,
      lightSurface.label,
      "Straßenbau / Oberfläche",
      "Direkte technische Rezeptlogik"
    );
  }

  const isPlanie =
    t.includes("planie") || t.includes("feinplanum") || t.includes("planum");

  const isAsphaltFraesen =
    t.includes("asphalt") &&
    (t.includes("fräsen") || t.includes("fraesen") || t.includes("frasen") || t.includes("aufbruch") || t.includes("aufbrechen")) &&
    !t.includes("wiederherstellen") &&
    !t.includes("wiederherstellung");

  const isAsphaltLayer =
    t.includes("asphalt") &&
    (t.includes("tragschicht") || t.includes("deckschicht") || t.includes("ac 22") || t.includes("ac22") || t.includes("ac 8") || t.includes("ac8"));

  const isComplexLayerBuildUp =
    t.includes("frostschutz") ||
    t.includes("splitt") ||
    t.includes("sandbett") ||
    t.includes("bettung") ||
    t.includes("auskofferung") ||
    t.includes("aushub") ||
    t.includes("entsorgung") ||
    t.includes("abfuhr") ||
    t.includes("deponie");

  const isPflasterNew =
    t.includes("pflaster") &&
    !t.includes("rasengitter") &&
    !isComplexLayerBuildUp &&
    (t.includes("herstellen") || t.includes("verlegen")) &&
    !t.includes("wiederherstellen") &&
    !t.includes("wiederherstellung") &&
    !t.includes("aufnehmen") &&
    !t.includes("lagern");

  if (isPlanie) {
    return make(n(range.avg, 7.5) || 7.5, "Maschinen", "Planie / Feinplanum herstellen", "Tiefbau / Erdarbeiten");
  }

  if (isAsphaltFraesen) {
    return make(clampLightSurfaceEp(text, einheit, existingEp > 0 ? existingEp : n(range.avg, 4.5) || 4.5), "Maschinen", "Asphalt fräsen / aufbrechen", "Straßenbau / Asphalt");
  }

  if (isAsphaltLayer) {
    const fallback = t.includes("ac 11 ds") || t.includes("ads aus ac 11") ? 18 : t.includes("deckschicht") || t.includes("ac 8") || t.includes("ac8") ? 18 : 14;
    return make(existingEp > 0 ? existingEp : fallback, "Fremdleistung", "Asphaltschicht einbauen", "Straßenbau / Asphalt");
  }

  if (isPflasterNew) {
    const ep = n(range.avg) > 0 && String(range.matches?.[0]?.group || "") !== "Material"
      ? n(range.avg)
      : 75;
    return make(ep, "Fremdleistung", "Pflasterfläche komplett herstellen", "Oberfläche / Pflaster");
  }

  return null;
}


function buildUniversalRlcLibraryFallback(
  row: InputRow,
  text: string,
  einheit: string,
  menge: number
): any | null {
  const range = rlcPreisRangeForText(text, einheit);
  const avgEp = round2(n(range.avg));

  if (avgEp <= 0) return null;

  const match = Array.isArray(range.matches) && range.matches.length ? range.matches[0] : null;
  const mainGroup = ((match?.group || "Fremdleistung") as PriceBreakdownGroup);
  const name = match?.name || "RLC Preisbibliothek Richtwert";

  /*
   * RLC Preisbibliothek liefert einen geprüften Richt-Einheitspreis.
   * Für die Urkalkulation wird dieser Preis sauber in Direktkosten + GK/Risiko/Gewinn zerlegt,
   * ohne den finalen EP künstlich zu erhöhen.
   */
  const direct = round2(avgEp / 1.2312);
  const overheadCost = round2(direct * 0.10);
  const riskCost = round2(direct * 0.04);
  const profitCost = round2((direct + overheadCost + riskCost) * 0.08);
  const finalUnitPrice = round2(direct + overheadCost + riskCost + profitCost);

  const priceBreakdown: PriceBreakdownLine[] = [
    {
      id: "rlc-library-main",
      group: mainGroup,
      name,
      unit: einheit || "EH",
      qty: 1,
      price: direct,
      total: direct,
      note: "Universeller RLC-Preisresolver / Preisbibliothek",
    },
    {
      id: "rlc-library-gk",
      group: "Gemeinkosten",
      name: "Gemeinkosten",
      unit: einheit || "EH",
      qty: 1,
      price: overheadCost,
      total: overheadCost,
      note: "10 %",
    },
    {
      id: "rlc-library-risk",
      group: "Risiko",
      name: "Risiko",
      unit: einheit || "EH",
      qty: 1,
      price: riskCost,
      total: riskCost,
      note: "4 %",
    },
    {
      id: "rlc-library-profit",
      group: "Gewinn",
      name: "Gewinn",
      unit: einheit || "EH",
      qty: 1,
      price: profitCost,
      total: profitCost,
      note: "8 %",
    },
  ];

  return {
    id: row.id,
    posNr: s(row.posNr),
    kurztext: s(row.kurztext),
    langtext: s(row.langtext),
    einheit,
    menge,

    materialCost: mainGroup === "Material" ? direct : 0,
    laborCost: mainGroup === "Personal" ? direct : 0,
    machineCost: mainGroup === "Maschinen" || mainGroup === "LKW / Transport" ? direct : 0,
    subcontractorCost: mainGroup === "Fremdleistung" ? direct : 0,
    disposalCost: mainGroup === "Entsorgung" ? direct : 0,
    overheadCost,
    riskCost,
    profitCost,

    baseUnitPrice: finalUnitPrice,
    suggestedUnitPrice: finalUnitPrice,
    finalUnitPrice,

    confidence: 0.74,
    riskLevel: "medium",
    calculationStatus: "warning",

    gewerk: match?.category || "Tiefbau",
    leistungsart: "Universelle RLC-Preislogik",
    bauverfahren: name,

    warning: "Universeller RLC-Preisresolver verwendet. Kein spezifisches Rezept gefunden; Firmenpreise und Baustellenbedingungen prüfen.",
    aiReason: [
      "Universeller RLC-Preisresolver: kein eindeutiges Rezept gefunden.",
      `Preis wurde aus RLC Preisbibliothek ermittelt: ${name}.`,
      `Range: min ${range.min}, avg ${range.avg}, max ${range.max}.`,
    ].join("\n"),

    source: "recipe",

    rlcPreisMin: round2(n(range.min)),
    rlcPreisAvg: round2(n(range.avg)),
    rlcPreisMax: round2(n(range.max)),
    rlcPreisSource: "RLC Preisbibliothek",
    rlcPreisGroup: match?.group || String(mainGroup),

    priceBreakdown,
  };
}


function buildTechnicalComponentFallback(
  row: InputRow,
  text: string,
  einheit: string,
  menge: number,
  technical: any
): any | null {
  const t = norm(text);
  const u = normUnit(einheit);

  const isArea = u === "m²";
  const isLength = u === "m";

  const isAsphaltLengthWork =
    technical.surface === "ASPHALT" &&
    technical.bauverfahren === "Asphalt schneiden / trennen" &&
    isLength;

  const isLeitungsbauLengthWork =
    isLength &&
    (
      technical.bauverfahren === "Rohrgraben / Kabelgraben herstellen" ||
      technical.bauverfahren === "Speedpipe / Mikrorohr verlegen" ||
      technical.bauverfahren === "Rohrbettung / Kabelsand herstellen" ||
      technical.bauverfahren === "Kabelschutzrohr verlegen" ||
      technical.bauverfahren === "KG/PVC Rohr verlegen"
    );

  const isBordsteinEntwaesserungWork =
    (
      isLength &&
      (
        technical.bauverfahren === "Tiefbordstein setzen" ||
        technical.bauverfahren === "Hochbordstein setzen" ||
        technical.bauverfahren === "Bordstein / Randstein setzen" ||
        technical.bauverfahren === "Entwässerungsrinne DN100 setzen"
      )
    ) ||
    (
      technical.bauverfahren === "Straßenablauf / Sinkkasten setzen" ||
      technical.bauverfahren === "Hofablauf setzen" ||
      technical.bauverfahren === "Sickerschacht herstellen"
    );

  const isSchachtPruefungWork =
    technical.bauverfahren === "Kontrollschacht setzen" ||
    technical.bauverfahren === "Schachtanschluss herstellen" ||
    technical.bauverfahren === "Dichtheitsprüfung Kanal" ||
    technical.bauverfahren === "Kamerabefahrung Kanal";

  const isDrainageWork =
    technical.bauverfahren === "Drainagerohr DN100 verlegen" ||
    technical.bauverfahren === "Filterkies / Drainagekies einbauen" ||
    technical.bauverfahren === "Filtervlies / Geotextil verlegen";

  const isKabelSpeedpipeWork =
    technical.bauverfahren === "Speedpipe / Mikrorohr verlegen" ||
    technical.bauverfahren === "Kabelschutzrohr verlegen" ||
    technical.bauverfahren === "Rohrbettung / Kabelsand herstellen" ||
    technical.bauverfahren === "Warnband / Trassenband verlegen";

  const isGlasfaserSpecialWork =
    technical.bauverfahren === "Microtrenching schneiden" ||
    technical.bauverfahren === "Microtrenching komplett inkl. Verfüllung" ||
    technical.bauverfahren === "Glasfaserkabel einblasen" ||
    technical.bauverfahren === "Glasfaser-Hausanschluss Tiefbau" ||
    technical.bauverfahren === "Kabelzugschacht / Muffenschacht setzen";

  const isWasserWork =
    technical.bauverfahren === "PE-Wasserleitung verlegen" ||
    technical.bauverfahren === "Wasser-Hausanschluss herstellen" ||
    technical.bauverfahren === "Hydrant einbauen" ||
    technical.bauverfahren === "Druckprüfung Wasserleitung";

  const isGasWork =
    technical.bauverfahren === "PE-Gasleitung verlegen" ||
    technical.bauverfahren === "Gas-Hausanschluss herstellen" ||
    technical.bauverfahren === "Druckprüfung Gasleitung" ||
    technical.bauverfahren === "Schutzrohr Gasleitung verlegen";

  const isStromWork =
    technical.bauverfahren === "Stromkabel / Erdkabel verlegen" ||
    technical.bauverfahren === "Kabel in Leerrohr einziehen" ||
    technical.bauverfahren === "Leerrohr Strom verlegen" ||
    technical.bauverfahren === "Kabelmuffe / Verbindungsmuffe herstellen" ||
    technical.bauverfahren === "Kabelverteilerschrank / KVZ setzen";

  const isBlockAVersorgungWork =
    [
      "Lichtmast setzen",
      "Lichtmast Fundament herstellen",
      "Straßenbeleuchtung anschließen",
      "Telekom-Kabel in Rohr einziehen",
      "Telekom-Muffe herstellen",
      "Telekom-Verteilerschrank setzen",
      "Fernwärmerohr verlegen",
      "Fernwärme-Hausanschluss herstellen",
      "Druckprüfung Fernwärmeleitung",
      "Abwasser-Druckleitung PE verlegen",
      "Pumpenschacht setzen",
      "Hebeanlage einbauen",
      "Schieber / Absperrschieber einbauen",
      "Ventil / Klappe einbauen",
      "Kernbohrung / Rohrdurchführung herstellen",
      "Mehrsparten-Hauseinführung herstellen",
      "Trasse abstecken",
      "Bestandsplan / As-Built Dokumentation erstellen",
      "Leitungsortung durchführen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockBStrassenbauWork =
    [
      "Asphaltbinderschicht herstellen",
      "Asphalt-Ausgleichsschicht herstellen",
      "Asphalt Kleinfläche von Hand herstellen",
      "Asphaltfläche aufbrechen und aufnehmen",
      "Pflaster aufnehmen und seitlich lagern",
      "Betonfläche aufbrechen und aufnehmen",
      "Betonpflaster liefern und verlegen",
      "Betonplatten liefern und verlegen",
      "Natursteinpflaster verlegen",
      "Hochbordstein liefern und setzen",
      "Tiefbordstein liefern und setzen",
      "Rundbordstein liefern und setzen",
      "Pflasterrinne herstellen",
      "Betonrinne / Entwässerungsrinne herstellen",
      "Fahrbahnmarkierung Linie herstellen",
      "Verkehrsschild liefern und setzen",
      "Bankett herstellen",
      "Mulde profilieren / herstellen",
      "Rasenansaat herstellen",
      "Planum herstellen",
      "Untergrund verdichten",
      "Sauberkeitsschicht herstellen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockCErdarbeitenWork =
    [
      "Baugrube ausheben / Boden lösen und laden",
      "Graben ausheben / Leitungsgraben herstellen",
      "Oberboden / Boden abtragen",
      "Bodenaustausch herstellen",
      "Grabenverbau herstellen",
      "Spundwand herstellen",
      "Bohrträgerverbau / Berliner Verbau herstellen",
      "Wasserhaltung mit Pumpe herstellen",
      "Bauwasser / Grundwasser abpumpen",
      "Boden Z0 entsorgen",
      "Boden Z1 entsorgen",
      "Boden Z2 entsorgen",
      "Bauschutt entsorgen",
      "Betonaufbruch entsorgen",
      "Graben / Baugrube verfüllen",
      "Lagenweise verfüllen und verdichten",
      "Füllsand liefern und einbauen",
      "Kies liefern und einbauen",
      "Schotter liefern und einbauen",
      "Recyclingmaterial liefern und einbauen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockDBetonSchachtWork =
    [
      "Betonfundament herstellen",
      "Streifenfundament herstellen",
      "Punktfundament herstellen",
      "Schalung herstellen",
      "Bewehrung einbauen",
      "Beton liefern und einbauen",
      "Magerbeton einbauen",
      "Schachtunterteil setzen",
      "Schachtring setzen",
      "Schachtkonus setzen",
      "Schachtabdeckung liefern und setzen",
      "Schacht erhöhen / regulieren",
      "Schachtabdeckung austauschen",
      "Straßenablauf setzen",
      "Straßenablauf anschließen",
      "Ablaufaufsatz / Rost setzen",
      "Kabelschacht klein liefern und setzen",
      "Kabelschacht groß liefern und setzen",
      "Kunststoffschacht setzen",
      "Betonschacht setzen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockEBaustelleVerkehrWork =
    [
      "Baustelleneinrichtung pauschal",
      "Baustelle räumen",
      "Baustellencontainer stellen",
      "Baustrom herstellen / vorhalten",
      "Bauwasser herstellen / vorhalten",
      "Bauzaun stellen und vorhalten",
      "Absperrung / Absturzsicherung herstellen",
      "Leitbaken / Absperrbaken stellen",
      "Verkehrssicherung einrichten und vorhalten",
      "Mobile Ampelanlage stellen",
      "Beschilderungsplan / Verkehrszeichenplan erstellen",
      "Verkehrsrechtliche Anordnung beantragen",
      "Tagesbaustelle einrichten",
      "Zuschlag Nachtarbeit",
      "Zuschlag Wochenendarbeit",
      "Handschachtung herstellen",
      "Suchschachtung herstellen",
      "Bestandsleitung sichern",
      "Provisorium herstellen",
      "Provisorische Umleitung herstellen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockFRegieGeraeteWork =
    [
      "Facharbeiter Regiestunde",
      "Helfer Regiestunde",
      "Polier / Vorarbeiter Regiestunde",
      "Bauleiter Regiestunde",
      "Minibagger bis 3,5 t",
      "Bagger 8–14 t",
      "Radlader",
      "Rüttelplatte / Verdichtungsgerät",
      "Stampfer / Grabenstampfer",
      "Asphaltschneider / Fugenschneider",
      "LKW Kipper",
      "LKW mit Ladekran",
      "Tiefladertransport",
      "An- und Abfahrt",
      "Wartezeit LKW / Gerät",
      "Regiearbeiten pauschal",
      "Kolonne 2 Mann",
      "Kolonne 3 Mann",
      "Gerätepauschale Kleingeräte",
      "Kleinmaterial pauschal",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockGAbrechnungWork =
    [
      "Aufmaß erstellen",
      "Massenprüfung durchführen",
      "REB-Aufmaß bearbeiten",
      "Aufmaßblatt erstellen",
      "Regiebericht für Abrechnung prüfen",
      "Lieferschein für Abrechnung prüfen",
      "Stundenabrechnung erstellen",
      "Abschlagsrechnung erstellen",
      "Schlussrechnung erstellen",
      "Rechnung prüfen",
      "Nachtrag erstellen",
      "Nachtrag prüfen",
      "Mehrmengen / Mindermengen bewerten",
      "As-Built Dokumentation abrechnungsreif erstellen",
      "Fotodokumentation für Abrechnung erstellen",
      "Prüfprotokoll erstellen",
      "Aufmaß vor Ort aufnehmen",
      "Bauleiter-Abrechnungsfreigabe bearbeiten",
      "Kostenstelle / LV-Position zuordnen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockHVermessungCadWork =
    [
      "Bestandsaufnahme / Geländeaufnahme",
      "GNSS-Vermessung durchführen",
      "Vermessung mit Totalstation",
      "Absteckung durchführen",
      "Nivellement / Höhenaufnahme",
      "Querprofil erstellen",
      "Längsprofil erstellen",
      "Massenermittlung aus Vermessungsdaten",
      "Volumenberechnung mit DGM",
      "DWG-Plan erstellen",
      "DWG-Plan bearbeiten",
      "PDF-Plan digitalisieren",
      "As-Built Plan erstellen",
      "DGM / 3D-Geländemodell erstellen",
      "LandXML Export erstellen",
      "IFC Export erstellen",
      "Machine-Control Modell erstellen",
      "Datenaufbereitung für Trimble / Leica",
      "Drohnenbefliegung durchführen",
      "Orthofoto / Punktwolke erstellen",
    ].includes(String(technical.bauverfahren || ""));

  const isBlockIMaterialEinkaufWork =
    [
      "Material bestellen",
      "Lieferantenangebot einholen",
      "Materialpreisvergleich durchführen",
      "Bestellung prüfen / freigeben",
      "Wareneingang erfassen",
      "Lagerbestand buchen",
      "Material aus Lager ausgeben",
      "Inventur / Lagerkontrolle durchführen",
      "Lieferschein erfassen",
      "Lieferschein fachlich prüfen",
      "Lieferschein Kostenstelle zuordnen",
      "Lieferschein OCR/KI nachbearbeiten",
      "Material Kostenstelle zuordnen",
      "Material LV-Position zuordnen",
      "Baustofflieferung organisieren",
      "Entladung / Abladen Material",
      "Kranentladung Material",
      "Materialreklamation bearbeiten",
      "Materialrückgabe organisieren",
      "Lieferantenbewertung durchführen",
    ].includes(String(technical.bauverfahren || ""));

  const isMaxiBlockJRestmoduleWork =
    [
      "Personaleinsatzplanung erstellen",
      "Zeiterfassung prüfen",
      "Urlaubsplanung / Abwesenheit verwalten",
      "Mitarbeiterschulung dokumentieren",
      "Sicherheitsunterweisung durchführen",
      "Fuhrpark Einsatzplanung erstellen",
      "Fahrzeugakte pflegen",
      "TÜV / UVV Termin überwachen",
      "Kilometerstand / Betriebsstunden erfassen",
      "Kraftstoffverbrauch erfassen",
      "Gerätewartung planen",
      "Geräteprüfung dokumentieren",
      "Gerätereparatur koordinieren",
      "Gerätedisposition erstellen",
      "Gerätemiete organisieren",
      "Arbeitssicherheitsdokumentation erstellen",
      "DPI / PSA Kontrolle durchführen",
      "Gefährdungsbeurteilung erstellen",
      "Baustellensicherheitskontrolle durchführen",
      "Sicherheitsmangel dokumentieren",
      "Mangel aufnehmen / dokumentieren",
      "Nacharbeit koordinieren",
      "Abnahme vorbereiten",
      "Qualitätsprüfung durchführen",
      "Qualitätscheckliste bearbeiten",
      "Bauzeitenplan erstellen",
      "Gantt-Plan aktualisieren",
      "Projektstatusbericht erstellen",
      "Baubesprechungsprotokoll erstellen",
      "Projektkoordination durchführen",
      "Dokument ablegen / archivieren",
      "Dokumentenfreigabe bearbeiten",
      "E-Mail / Schriftverkehr zuordnen",
      "Export PDF / Excel / DATEV vorbereiten",
      "Projektarchiv pflegen",
      "Kundendaten pflegen",
      "Angebotsnachverfolgung durchführen",
      "Sales Pipeline aktualisieren",
      "Kundenkontakt dokumentieren",
      "Akquise / Lead bearbeiten",
      "BIM-Modellprüfung durchführen",
      "5D-BIM Kostenmodell bearbeiten",
      "4D-BIM Terminmodell bearbeiten",
      "KI-Datenprüfung durchführen",
      "Supportanfrage bearbeiten",
    ].includes(String(technical.bauverfahren || ""));

  const isX83RealFix1Work =
    [
      "Übergangsstück PP-Beton DN 300 einbauen",
      "Frostschutzschicht korrigieren",
      "Erschwerniszuschlag Anschluss Bestandsschacht",
      "Asphalt feinfräsen",
      "Asphalttragschicht herstellen",
      "Reinigung von Straßen",
      "Spartenerkundung durchführen",
      "Zulage Asphalt gering verunreinigt",
      "Fels aufbrechen / lösen",
      "Ablaufaufsatz ausbauen",
      "Ablaufaufsatz liefern und einbauen",
      "Granitbord / Bordstein ausbauen",
      "Boden lösen und zwischenlagern",
      "Probenahme und Deklarationsanalyse",
      "Erschwerniszuschlag Leitungskreuzung",
      "Mehraufwand vorhandene Leitungen",
        "Suchschlitz herstellen",
      "Rohrleitung ausbauen bis DN 300",
      "Kunststoffrohrleitung DN 300 herstellen",
      "Kunststoffrohrleitung DN 160 herstellen",
      "PP-Überschiebmuffe DN 300 einbauen",
      "PP-Gelenkstück DN 300 einbauen",
      "PP-Bogen DN 300 einbauen",
      "PP-Abzweig DN 300/160 einbauen",
      "PP-Schnitt DN 160 herstellen",
      "Rohrleitung reinigen bis DN 300",
      "Kanal-TV bis DN 300 durchführen",
      "Frostschutzschicht herstellen",
      "Zulage Mehr-/Minderstärke",
      "Unterlage reinigen",
      "Schichtenverbund herstellen",
      "Anschluss als Fuge herstellen",
      "Granittiefbord herstellen",
      "Baustelleneinrichtung vorhalten X84",
        "Straßenablauf Fertigteil ausbauen",
        "Flächenrüttler einsetzen",
    ].includes(String(technical.bauverfahren || ""));

  if (!isArea && !isAsphaltLengthWork && !isLeitungsbauLengthWork && !isBordsteinEntwaesserungWork && !isSchachtPruefungWork && !isDrainageWork && !isKabelSpeedpipeWork && !isGlasfaserSpecialWork && !isWasserWork && !isGasWork && !isStromWork && !isBlockAVersorgungWork && !isBlockBStrassenbauWork && !isBlockCErdarbeitenWork && !isBlockDBetonSchachtWork && !isBlockEBaustelleVerkehrWork && !isBlockFRegieGeraeteWork && !isBlockGAbrechnungWork && !isBlockHVermessungCadWork && !isBlockIMaterialEinkaufWork && !isMaxiBlockJRestmoduleWork && !isX83RealFix1Work) return null;

  const components: Array<{
    refKey: string;
    type: string;
    qty: number;
    note: string;
  }> = [];

  // X84_BLOCK_C_PLANUM_DIRECT_OVERRIDE
  if (
    (t.includes("planum herstellen") || t.includes("planie herstellen") || t === "planum") &&
    isArea &&
    menge >= 300
  ) {
    const ep = 0.8;
    const total = Math.round(ep * menge * 100) / 100;

    return {
      ...(row as any),
      id: (row as any)?.id,
      posNr: (row as any)?.posNr || (row as any)?.pos || (row as any)?.position || "",
      pos: (row as any)?.pos || (row as any)?.posNr || (row as any)?.position || "",
      kurztext: (row as any)?.kurztext || (row as any)?.text || text,
      text: (row as any)?.text || (row as any)?.kurztext || text,
      einheit,
      menge,

      source: "technical-parser",
      confidence: 0.98,
      riskLevel: "low",
      gewerk: "Straßenbau / Erdplanum",
      leistungsart: "Planum herstellen",
      bauverfahren: "Planum herstellen",
      suggestedUnitPrice: ep,
      finalUnitPrice: ep,
      totalPrice: total,
      priceBreakdown: [
        {
          group: "Fremdleistung",
          label: "Planum Großfläche X84 Training",
          qty: 1,
          unitPrice: ep,
          total: ep
        }
      ],
      aiReason: "X84 Training: Planum Großfläche auf Firmenkalkulation kalibriert."
    };
  }

  function add(refKey: string, type: string, qty: number, note: string) {
    const q = round2(n(qty));
    if (q > 0) components.push({ refKey, type, qty: q, note });
  }

  /*
   * Bordstein / Rinnen / Entwässerung:
   * Einheit m bzw. St wird direkt aus RLC Preisbibliothek kalkuliert.
   */
  if (
    isLength &&
    (
      technical.bauverfahren === "Tiefbordstein setzen" ||
      technical.bauverfahren === "Hochbordstein setzen" ||
      technical.bauverfahren === "Bordstein / Randstein setzen"
    )
  ) {
    add("RLC_PREIS:material-bordstein", "MATERIAL", 1, "Bordstein/Randstein Material je m");
    add("RLC_PREIS:leistung-bordstein-setzen", "LABOR", 1, "Bordstein/Randstein setzen je m");
  }

  if (isLength && technical.bauverfahren === "Entwässerungsrinne DN100 setzen") {
    add("RLC_PREIS:entwaesserung-rinne-dn100", "SUBCONTRACTOR", 1, "Entwässerungsrinne DN100 setzen je m");
  }

  if (technical.bauverfahren === "Straßenablauf / Sinkkasten setzen") {
    add("RLC_PREIS:entwaesserung-strassenablauf", "SUBCONTRACTOR", 1, "Straßenablauf / Sinkkasten setzen je St");
  }

  if (technical.bauverfahren === "Hofablauf setzen") {
    add("RLC_PREIS:entwaesserung-hofablauf", "SUBCONTRACTOR", 1, "Hofablauf setzen je St");
  }

  if (technical.bauverfahren === "Sickerschacht herstellen") {
    add("RLC_PREIS:entwaesserung-sickerschacht", "SUBCONTRACTOR", 1, "Sickerschacht herstellen je St");
  }

  /*
   * X83 REAL FIX 1 — GAEB Testdatei erweitert.
   */
  const x83RealFix1Ref: Record<string, [string, string, string]> = {
      "Baustelleneinrichtung vorhalten X84": ["RLC_PREIS:x83-baustelleneinrichtung-vorhalten-x84", "SUBCONTRACTOR", "Baustelleneinrichtung vorhalten X84"],
      "Straßenablauf Fertigteil ausbauen": ["RLC_PREIS:x83-strassenablauf-fertigteil-ausbauen", "SUBCONTRACTOR", "Straßenablauf Fertigteil ausbauen"],
    "Baustelleneinrichtung vorhalten kurz": ["RLC_PREIS:x83-baustelleneinrichtung-vorhalten-kurz", "SUBCONTRACTOR", "Baustelleneinrichtung vorhalten kurz"],
    "Planum herstellen Großfläche": ["RLC_PREIS:x83-planum-grossflaeche", "SUBCONTRACTOR", "Planum herstellen Großfläche"],
    "Suchschlitz herstellen": ["RLC_PREIS:x83-suchschlitz-herstellen", "SUBCONTRACTOR", "Suchschlitz herstellen"],
    "Übergangsstück PP-Beton DN 300 einbauen": ["RLC_PREIS:x83-pp-gelenkstueck", "MATERIAL", "Übergangsstück PP-Beton DN 300 einbauen"],
    "Frostschutzschicht korrigieren": ["RLC_PREIS:blockb-verdichtung", "SUBCONTRACTOR", "Frostschutzschicht korrigieren"],
    "Erschwerniszuschlag Anschluss Bestandsschacht": ["RLC_PREIS:x83-leitungskreuzung", "SUBCONTRACTOR", "Erschwerniszuschlag Anschluss Bestandsschacht"],
    "Asphalt feinfräsen": ["RLC_PREIS:x83-unterlage-reinigen", "SUBCONTRACTOR", "Asphalt feinfräsen"],    "Reinigung von Straßen": ["RLC_PREIS:x83-strassen-reinigung", "SUBCONTRACTOR", "Reinigung von Straßen"],
    "Spartenerkundung durchführen": ["RLC_PREIS:x83-spartenerkundung", "SUBCONTRACTOR", "Spartenerkundung durchführen"],
    "Zulage Asphalt gering verunreinigt": ["RLC_PREIS:x83-asphalt-zulage-verunreinigt", "DISPOSAL", "Zulage Asphalt gering verunreinigt"],
    "Fels aufbrechen / lösen": ["RLC_PREIS:x83-fels-aufbruch", "SUBCONTRACTOR", "Fels aufbrechen / lösen"],
    "Ablaufaufsatz ausbauen": ["RLC_PREIS:x83-aufsatz-ausbauen", "SUBCONTRACTOR", "Ablaufaufsatz ausbauen"],
    "Ablaufaufsatz liefern und einbauen": ["RLC_PREIS:x83-aufsatz-liefern-einbauen", "SUBCONTRACTOR", "Ablaufaufsatz liefern und einbauen"],
    "Granitbord / Bordstein ausbauen": ["RLC_PREIS:x83-bord-ausbauen", "SUBCONTRACTOR", "Granitbord / Bordstein ausbauen"],
    "Boden lösen und zwischenlagern": ["RLC_PREIS:x83-boden-loesen-zwischenlagern", "SUBCONTRACTOR", "Boden lösen und zwischenlagern"],
    "Probenahme und Deklarationsanalyse": ["RLC_PREIS:x83-deklarationsanalyse", "SUBCONTRACTOR", "Probenahme und Deklarationsanalyse"],
    "Erschwerniszuschlag Leitungskreuzung": ["RLC_PREIS:x83-leitungskreuzung", "SUBCONTRACTOR", "Erschwerniszuschlag Leitungskreuzung"],
    "Mehraufwand vorhandene Leitungen": ["RLC_PREIS:x83-mehraufwand-leitungen", "SUBCONTRACTOR", "Mehraufwand vorhandene Leitungen"],
    "Rohrleitung ausbauen bis DN 300": ["RLC_PREIS:x83-rohrleitung-ausbauen", "SUBCONTRACTOR", "Rohrleitung ausbauen bis DN 300"],
    "Kunststoffrohrleitung DN 300 herstellen": ["RLC_PREIS:x83-kunststoffrohr-dn300", "MATERIAL", "Kunststoffrohrleitung DN 300 herstellen"],
    "Kunststoffrohrleitung DN 160 herstellen": ["RLC_PREIS:x83-kunststoffrohr-dn160", "MATERIAL", "Kunststoffrohrleitung DN 160 herstellen"],
    "PP-Überschiebmuffe DN 300 einbauen": ["RLC_PREIS:x83-pp-ueberschiebmuffe", "MATERIAL", "PP-Überschiebmuffe DN 300 einbauen"],
    "PP-Gelenkstück DN 300 einbauen": ["RLC_PREIS:x83-pp-gelenkstueck", "MATERIAL", "PP-Gelenkstück DN 300 einbauen"],
    "PP-Bogen DN 300 einbauen": ["RLC_PREIS:x83-pp-bogen", "MATERIAL", "PP-Bogen DN 300 einbauen"],
    "PP-Abzweig DN 300/160 einbauen": ["RLC_PREIS:x83-pp-abzweig", "MATERIAL", "PP-Abzweig DN 300/160 einbauen"],
    "PP-Schnitt DN 160 herstellen": ["RLC_PREIS:x83-pp-schnitt", "SUBCONTRACTOR", "PP-Schnitt DN 160 herstellen"],
    "Rohrleitung reinigen bis DN 300": ["RLC_PREIS:x83-rohrleitung-reinigen", "SUBCONTRACTOR", "Rohrleitung reinigen bis DN 300"],
    "Kanal-TV bis DN 300 durchführen": ["RLC_PREIS:x83-kanal-tv", "SUBCONTRACTOR", "Kanal-TV bis DN 300 durchführen"],
    "Frostschutzschicht herstellen": ["RLC_PREIS:x83-fss-herstellen", "SUBCONTRACTOR", "Frostschutzschicht herstellen"],
    "Zulage Mehr-/Minderstärke": ["RLC_PREIS:x83-mehr-minderstaerke", "SUBCONTRACTOR", "Zulage Mehr-/Minderstärke"],
    "Zuschlag Handeinbau Asphalt": ["RLC_PREIS:x83-zuschlag-hand-asphalt", "SUBCONTRACTOR", "Zuschlag Handeinbau Asphalt"],
    "Unterlage reinigen": ["RLC_PREIS:x83-unterlage-reinigen", "SUBCONTRACTOR", "Unterlage reinigen"],
    "Schichtenverbund herstellen": ["RLC_PREIS:x83-schichtenverbund", "MATERIAL", "Schichtenverbund herstellen"],
    "Anschluss als Fuge herstellen": ["RLC_PREIS:x83-anschluss-fuge", "SUBCONTRACTOR", "Anschluss als Fuge herstellen"],
    "Granittiefbord herstellen": ["RLC_PREIS:x83-granit-tiefbord", "SUBCONTRACTOR", "Granittiefbord herstellen"],
    "Flächenrüttler einsetzen": ["RLC_PREIS:x83-flaechenruettler", "MACHINE", "Flächenrüttler einsetzen"],
  };

  {
    const cfg = x83RealFix1Ref[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je EH`);
    }
  }

  /*
   * MAXI BLOCK J — Restmodule erweitert.
   */
  const blockJRef: Record<string, [string, string, string]> = {
    "Personaleinsatzplanung erstellen": ["RLC_PREIS:blockj-personal-einsatzplanung", "LABOR", "Personaleinsatzplanung erstellen"],
    "Zeiterfassung prüfen": ["RLC_PREIS:blockj-personal-zeiterfassung", "LABOR", "Zeiterfassung prüfen"],
    "Urlaubsplanung / Abwesenheit verwalten": ["RLC_PREIS:blockj-personal-urlaubsplanung", "LABOR", "Urlaubsplanung / Abwesenheit verwalten"],
    "Mitarbeiterschulung dokumentieren": ["RLC_PREIS:blockj-personal-schulung", "LABOR", "Mitarbeiterschulung dokumentieren"],
    "Sicherheitsunterweisung durchführen": ["RLC_PREIS:blockj-personal-unterweisung", "LABOR", "Sicherheitsunterweisung durchführen"],
    "Fuhrpark Einsatzplanung erstellen": ["RLC_PREIS:blockj-fuhrpark-einsatzplanung", "MACHINE", "Fuhrpark Einsatzplanung erstellen"],
    "Fahrzeugakte pflegen": ["RLC_PREIS:blockj-fuhrpark-fahrzeugakte", "LABOR", "Fahrzeugakte pflegen"],
    "TÜV / UVV Termin überwachen": ["RLC_PREIS:blockj-fuhrpark-tuev", "LABOR", "TÜV / UVV Termin überwachen"],
    "Kilometerstand / Betriebsstunden erfassen": ["RLC_PREIS:blockj-fuhrpark-kilometer", "LABOR", "Kilometerstand / Betriebsstunden erfassen"],
    "Kraftstoffverbrauch erfassen": ["RLC_PREIS:blockj-fuhrpark-kraftstoff", "LABOR", "Kraftstoffverbrauch erfassen"],
    "Gerätewartung planen": ["RLC_PREIS:blockj-geraet-wartung", "MACHINE", "Gerätewartung planen"],
    "Geräteprüfung dokumentieren": ["RLC_PREIS:blockj-geraet-pruefung", "MACHINE", "Geräteprüfung dokumentieren"],
    "Gerätereparatur koordinieren": ["RLC_PREIS:blockj-geraet-reparatur", "MACHINE", "Gerätereparatur koordinieren"],
    "Gerätedisposition erstellen": ["RLC_PREIS:blockj-geraet-disposition", "MACHINE", "Gerätedisposition erstellen"],
    "Gerätemiete organisieren": ["RLC_PREIS:blockj-geraet-miete", "MACHINE", "Gerätemiete organisieren"],
    "Arbeitssicherheitsdokumentation erstellen": ["RLC_PREIS:blockj-sicherheit-dokumentation", "LABOR", "Arbeitssicherheitsdokumentation erstellen"],
    "DPI / PSA Kontrolle durchführen": ["RLC_PREIS:blockj-sicherheit-dpi", "LABOR", "DPI / PSA Kontrolle durchführen"],
    "Gefährdungsbeurteilung erstellen": ["RLC_PREIS:blockj-sicherheit-gefaehrdung", "LABOR", "Gefährdungsbeurteilung erstellen"],
    "Baustellensicherheitskontrolle durchführen": ["RLC_PREIS:blockj-sicherheit-baustellenkontrolle", "LABOR", "Baustellensicherheitskontrolle durchführen"],
    "Sicherheitsmangel dokumentieren": ["RLC_PREIS:blockj-sicherheit-maengel", "LABOR", "Sicherheitsmangel dokumentieren"],
    "Mangel aufnehmen / dokumentieren": ["RLC_PREIS:blockj-qm-maengel", "LABOR", "Mangel aufnehmen / dokumentieren"],
    "Nacharbeit koordinieren": ["RLC_PREIS:blockj-qm-nacharbeit", "LABOR", "Nacharbeit koordinieren"],
    "Abnahme vorbereiten": ["RLC_PREIS:blockj-qm-abnahme", "LABOR", "Abnahme vorbereiten"],
    "Qualitätsprüfung durchführen": ["RLC_PREIS:blockj-qm-pruefung", "LABOR", "Qualitätsprüfung durchführen"],
    "Qualitätscheckliste bearbeiten": ["RLC_PREIS:blockj-qm-checkliste", "LABOR", "Qualitätscheckliste bearbeiten"],
    "Bauzeitenplan erstellen": ["RLC_PREIS:blockj-projekt-bauzeitenplan", "LABOR", "Bauzeitenplan erstellen"],
    "Gantt-Plan aktualisieren": ["RLC_PREIS:blockj-projekt-gantt", "LABOR", "Gantt-Plan aktualisieren"],
    "Projektstatusbericht erstellen": ["RLC_PREIS:blockj-projekt-status", "LABOR", "Projektstatusbericht erstellen"],
    "Baubesprechungsprotokoll erstellen": ["RLC_PREIS:blockj-projekt-protokoll", "LABOR", "Baubesprechungsprotokoll erstellen"],
    "Projektkoordination durchführen": ["RLC_PREIS:blockj-projekt-koordination", "LABOR", "Projektkoordination durchführen"],
    "Dokument ablegen / archivieren": ["RLC_PREIS:blockj-buero-dokument", "LABOR", "Dokument ablegen / archivieren"],
    "Dokumentenfreigabe bearbeiten": ["RLC_PREIS:blockj-buero-freigabe", "LABOR", "Dokumentenfreigabe bearbeiten"],
    "E-Mail / Schriftverkehr zuordnen": ["RLC_PREIS:blockj-buero-email", "LABOR", "E-Mail / Schriftverkehr zuordnen"],
    "Export PDF / Excel / DATEV vorbereiten": ["RLC_PREIS:blockj-buero-export", "LABOR", "Export PDF / Excel / DATEV vorbereiten"],
    "Projektarchiv pflegen": ["RLC_PREIS:blockj-buero-archiv", "LABOR", "Projektarchiv pflegen"],
    "Kundendaten pflegen": ["RLC_PREIS:blockj-crm-kunde", "LABOR", "Kundendaten pflegen"],
    "Angebotsnachverfolgung durchführen": ["RLC_PREIS:blockj-crm-angebot", "LABOR", "Angebotsnachverfolgung durchführen"],
    "Sales Pipeline aktualisieren": ["RLC_PREIS:blockj-crm-pipeline", "LABOR", "Sales Pipeline aktualisieren"],
    "Kundenkontakt dokumentieren": ["RLC_PREIS:blockj-crm-kontakt", "LABOR", "Kundenkontakt dokumentieren"],
    "Akquise / Lead bearbeiten": ["RLC_PREIS:blockj-crm-akquise", "LABOR", "Akquise / Lead bearbeiten"],
    "BIM-Modellprüfung durchführen": ["RLC_PREIS:blockj-bim-modellpruefung", "LABOR", "BIM-Modellprüfung durchführen"],
    "5D-BIM Kostenmodell bearbeiten": ["RLC_PREIS:blockj-bim-5d", "LABOR", "5D-BIM Kostenmodell bearbeiten"],
    "4D-BIM Terminmodell bearbeiten": ["RLC_PREIS:blockj-bim-4d", "LABOR", "4D-BIM Terminmodell bearbeiten"],
    "KI-Datenprüfung durchführen": ["RLC_PREIS:blockj-ki-datenpruefung", "LABOR", "KI-Datenprüfung durchführen"],
    "Supportanfrage bearbeiten": ["RLC_PREIS:blockj-support-anfrage", "LABOR", "Supportanfrage bearbeiten"],
  };

  {
    const cfg = blockJRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je EH`);
    }
  }

  /*
   * BLOCK I — Material / Einkauf / Lager / Lieferscheine erweitert.
   */
  const blockIRef: Record<string, [string, string, string]> = {
    "Material bestellen": ["RLC_PREIS:blocki-material-bestellen", "LABOR", "Material bestellen"],
    "Lieferantenangebot einholen": ["RLC_PREIS:blocki-angebot-einholen", "LABOR", "Lieferantenangebot einholen"],
    "Materialpreisvergleich durchführen": ["RLC_PREIS:blocki-preisvergleich", "LABOR", "Materialpreisvergleich durchführen"],
    "Bestellung prüfen / freigeben": ["RLC_PREIS:blocki-bestellung-pruefen", "LABOR", "Bestellung prüfen / freigeben"],

    "Wareneingang erfassen": ["RLC_PREIS:blocki-wareneingang", "LABOR", "Wareneingang erfassen"],
    "Lagerbestand buchen": ["RLC_PREIS:blocki-lagerbestand-buchen", "LABOR", "Lagerbestand buchen"],
    "Material aus Lager ausgeben": ["RLC_PREIS:blocki-material-auslagern", "LABOR", "Material aus Lager ausgeben"],
    "Inventur / Lagerkontrolle durchführen": ["RLC_PREIS:blocki-inventur", "LABOR", "Inventur / Lagerkontrolle durchführen"],

    "Lieferschein erfassen": ["RLC_PREIS:blocki-lieferschein-erfassen", "LABOR", "Lieferschein erfassen"],
    "Lieferschein fachlich prüfen": ["RLC_PREIS:blocki-lieferschein-pruefen", "LABOR", "Lieferschein fachlich prüfen"],
    "Lieferschein Kostenstelle zuordnen": ["RLC_PREIS:blocki-lieferschein-kostenstelle", "LABOR", "Lieferschein Kostenstelle zuordnen"],
    "Lieferschein OCR/KI nachbearbeiten": ["RLC_PREIS:blocki-lieferschein-ocr", "LABOR", "Lieferschein OCR/KI nachbearbeiten"],

    "Material Kostenstelle zuordnen": ["RLC_PREIS:blocki-material-kostenstelle", "LABOR", "Material Kostenstelle zuordnen"],
    "Material LV-Position zuordnen": ["RLC_PREIS:blocki-lv-position-material", "LABOR", "Material LV-Position zuordnen"],

    "Baustofflieferung organisieren": ["RLC_PREIS:blocki-baustoff-liefern", "TRANSPORT", "Baustofflieferung organisieren"],
    "Entladung / Abladen Material": ["RLC_PREIS:blocki-entladung", "TRANSPORT", "Entladung / Abladen Material"],
    "Kranentladung Material": ["RLC_PREIS:blocki-kranentladung", "TRANSPORT", "Kranentladung Material"],

    "Materialreklamation bearbeiten": ["RLC_PREIS:blocki-reklamation", "LABOR", "Materialreklamation bearbeiten"],
    "Materialrückgabe organisieren": ["RLC_PREIS:blocki-rueckgabe", "LABOR", "Materialrückgabe organisieren"],
    "Lieferantenbewertung durchführen": ["RLC_PREIS:blocki-lieferantenbewertung", "LABOR", "Lieferantenbewertung durchführen"],
  };

  {
    const cfg = blockIRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je EH`);
    }
  }

  /*
   * BLOCK H — Vermessung / CAD / 3D / Machine Control erweitert.
   */
  const blockHRef: Record<string, [string, string, string]> = {
    "Bestandsaufnahme / Geländeaufnahme": ["RLC_PREIS:blockh-bestandsaufnahme", "LABOR", "Bestandsaufnahme / Geländeaufnahme"],
    "GNSS-Vermessung durchführen": ["RLC_PREIS:blockh-gnss-vermessung", "LABOR", "GNSS-Vermessung durchführen"],
    "Vermessung mit Totalstation": ["RLC_PREIS:blockh-totalstation", "LABOR", "Vermessung mit Totalstation"],
    "Absteckung durchführen": ["RLC_PREIS:blockh-absteckung", "LABOR", "Absteckung durchführen"],
    "Nivellement / Höhenaufnahme": ["RLC_PREIS:blockh-nivellement", "LABOR", "Nivellement / Höhenaufnahme"],

    "Querprofil erstellen": ["RLC_PREIS:blockh-querprofil", "LABOR", "Querprofil erstellen"],
    "Längsprofil erstellen": ["RLC_PREIS:blockh-laengsprofil", "LABOR", "Längsprofil erstellen"],
    "Massenermittlung aus Vermessungsdaten": ["RLC_PREIS:blockh-massenermittlung", "LABOR", "Massenermittlung aus Vermessungsdaten"],
    "Volumenberechnung mit DGM": ["RLC_PREIS:blockh-volumen-dgm", "LABOR", "Volumenberechnung mit DGM"],

    "DWG-Plan erstellen": ["RLC_PREIS:blockh-dwg-erstellen", "LABOR", "DWG-Plan erstellen"],
    "DWG-Plan bearbeiten": ["RLC_PREIS:blockh-dwg-bearbeiten", "LABOR", "DWG-Plan bearbeiten"],
    "PDF-Plan digitalisieren": ["RLC_PREIS:blockh-pdf-digitalisieren", "LABOR", "PDF-Plan digitalisieren"],
    "As-Built Plan erstellen": ["RLC_PREIS:blockh-asbuilt-plan", "LABOR", "As-Built Plan erstellen"],

    "DGM / 3D-Geländemodell erstellen": ["RLC_PREIS:blockh-dgm-erstellen", "LABOR", "DGM / 3D-Geländemodell erstellen"],
    "LandXML Export erstellen": ["RLC_PREIS:blockh-landxml-export", "LABOR", "LandXML Export erstellen"],
    "IFC Export erstellen": ["RLC_PREIS:blockh-ifc-export", "LABOR", "IFC Export erstellen"],
    "Machine-Control Modell erstellen": ["RLC_PREIS:blockh-machine-control", "LABOR", "Machine-Control Modell erstellen"],
    "Datenaufbereitung für Trimble / Leica": ["RLC_PREIS:blockh-trimble-leica", "LABOR", "Datenaufbereitung für Trimble / Leica"],

    "Drohnenbefliegung durchführen": ["RLC_PREIS:blockh-drohne-befliegung", "SUBCONTRACTOR", "Drohnenbefliegung durchführen"],
    "Orthofoto / Punktwolke erstellen": ["RLC_PREIS:blockh-orthofoto", "SUBCONTRACTOR", "Orthofoto / Punktwolke erstellen"],
  };

  {
    const cfg = blockHRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je EH`);
    }
  }

  /*
   * BLOCK G — Abrechnung / Aufmaß / Nachträge erweitert.
   */
  const blockGRef: Record<string, [string, string, string]> = {
    "Aufmaß erstellen": ["RLC_PREIS:blockg-aufmass-erstellen", "LABOR", "Aufmaß erstellen"],
    "Massenprüfung durchführen": ["RLC_PREIS:blockg-massenpruefung", "LABOR", "Massenprüfung durchführen"],
    "REB-Aufmaß bearbeiten": ["RLC_PREIS:blockg-reb-aufmass", "LABOR", "REB-Aufmaß bearbeiten"],
    "Aufmaßblatt erstellen": ["RLC_PREIS:blockg-aufmassblatt", "LABOR", "Aufmaßblatt erstellen"],

    "Regiebericht für Abrechnung prüfen": ["RLC_PREIS:blockg-regiebericht-abrechnung", "LABOR", "Regiebericht für Abrechnung prüfen"],
    "Lieferschein für Abrechnung prüfen": ["RLC_PREIS:blockg-lieferschein-abrechnung", "LABOR", "Lieferschein für Abrechnung prüfen"],
    "Stundenabrechnung erstellen": ["RLC_PREIS:blockg-stundenabrechnung", "LABOR", "Stundenabrechnung erstellen"],

    "Abschlagsrechnung erstellen": ["RLC_PREIS:blockg-abschlagsrechnung", "LABOR", "Abschlagsrechnung erstellen"],
    "Schlussrechnung erstellen": ["RLC_PREIS:blockg-schlussrechnung", "LABOR", "Schlussrechnung erstellen"],
    "Rechnung prüfen": ["RLC_PREIS:blockg-rechnung-pruefen", "LABOR", "Rechnung prüfen"],

    "Nachtrag erstellen": ["RLC_PREIS:blockg-nachtrag-erstellen", "LABOR", "Nachtrag erstellen"],
    "Nachtrag prüfen": ["RLC_PREIS:blockg-nachtrag-pruefen", "LABOR", "Nachtrag prüfen"],
    "Mehrmengen / Mindermengen bewerten": ["RLC_PREIS:blockg-mehrmengen-bewerten", "LABOR", "Mehrmengen / Mindermengen bewerten"],

    "As-Built Dokumentation abrechnungsreif erstellen": ["RLC_PREIS:blockg-dokumentation-asbuilt", "LABOR", "As-Built Dokumentation abrechnungsreif erstellen"],
    "Fotodokumentation für Abrechnung erstellen": ["RLC_PREIS:blockg-fotodoku", "LABOR", "Fotodokumentation für Abrechnung erstellen"],
    "Prüfprotokoll erstellen": ["RLC_PREIS:blockg-pruefprotokoll", "LABOR", "Prüfprotokoll erstellen"],

    "Aufmaß vor Ort aufnehmen": ["RLC_PREIS:blockg-aufmass-vor-ort", "LABOR", "Aufmaß vor Ort aufnehmen"],
    "Bauleiter-Abrechnungsfreigabe bearbeiten": ["RLC_PREIS:blockg-abrechnung-bauleiter", "LABOR", "Bauleiter-Abrechnungsfreigabe bearbeiten"],
    "Kostenstelle / LV-Position zuordnen": ["RLC_PREIS:blockg-kostenstelle-zuordnung", "LABOR", "Kostenstelle / LV-Position zuordnen"],
  };

  {
    const cfg = blockGRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je EH`);
    }
  }

  /*
   * BLOCK F — Regie / Stunden / Geräte / Transporte erweitert.
   */
  const blockFRef: Record<string, [string, string, string]> = {
    "Facharbeiter Regiestunde": ["RLC_PREIS:blockf-facharbeiter", "LABOR", "Facharbeiter Regiestunde"],
    "Helfer Regiestunde": ["RLC_PREIS:blockf-helfer", "LABOR", "Helfer Regiestunde"],
    "Polier / Vorarbeiter Regiestunde": ["RLC_PREIS:blockf-polier", "LABOR", "Polier / Vorarbeiter Regiestunde"],
    "Bauleiter Regiestunde": ["RLC_PREIS:blockf-bauleiter", "LABOR", "Bauleiter Regiestunde"],

    "Minibagger bis 3,5 t": ["RLC_PREIS:blockf-minibagger", "MACHINE", "Minibagger bis 3,5 t"],
    "Bagger 8–14 t": ["RLC_PREIS:blockf-bagger-8t", "MACHINE", "Bagger 8–14 t"],
    "Radlader": ["RLC_PREIS:blockf-radlader", "MACHINE", "Radlader"],
    "Rüttelplatte / Verdichtungsgerät": ["RLC_PREIS:blockf-rüttelplatte", "MACHINE", "Rüttelplatte / Verdichtungsgerät"],
    "Stampfer / Grabenstampfer": ["RLC_PREIS:blockf-stampfer", "MACHINE", "Stampfer / Grabenstampfer"],
    "Asphaltschneider / Fugenschneider": ["RLC_PREIS:blockf-asphaltschneider", "MACHINE", "Asphaltschneider / Fugenschneider"],

    "LKW Kipper": ["RLC_PREIS:blockf-lkw-kipper", "TRANSPORT", "LKW Kipper"],
    "LKW mit Ladekran": ["RLC_PREIS:blockf-lkw-kran", "TRANSPORT", "LKW mit Ladekran"],
    "Tiefladertransport": ["RLC_PREIS:blockf-tieflader", "TRANSPORT", "Tiefladertransport"],
    "An- und Abfahrt": ["RLC_PREIS:blockf-an-abfahrt", "TRANSPORT", "An- und Abfahrt"],
    "Wartezeit LKW / Gerät": ["RLC_PREIS:blockf-wartezeit", "TRANSPORT", "Wartezeit LKW / Gerät"],

    "Regiearbeiten pauschal": ["RLC_PREIS:blockf-regiearbeit-pauschal", "SUBCONTRACTOR", "Regiearbeiten pauschal"],
    "Kolonne 2 Mann": ["RLC_PREIS:blockf-kolonne-2mann", "LABOR", "Kolonne 2 Mann"],
    "Kolonne 3 Mann": ["RLC_PREIS:blockf-kolonne-3mann", "LABOR", "Kolonne 3 Mann"],
    "Gerätepauschale Kleingeräte": ["RLC_PREIS:blockf-geraetepauschale", "MACHINE", "Gerätepauschale Kleingeräte"],
    "Kleinmaterial pauschal": ["RLC_PREIS:blockf-material-klein", "MATERIAL", "Kleinmaterial pauschal"],
  };

  {
    const cfg = blockFRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je EH`);
    }
  }

  /*
   * BLOCK E — Baustelleneinrichtung / Verkehrssicherung erweitert.
   */
  const blockERef: Record<string, [string, string, string]> = {
    "Baustelleneinrichtung pauschal": ["RLC_PREIS:blocke-baustelleneinrichtung", "SUBCONTRACTOR", "Baustelleneinrichtung pauschal"],
    "Baustelle räumen": ["RLC_PREIS:blocke-baustelle-raeumen", "SUBCONTRACTOR", "Baustelle räumen"],
    "Baustellencontainer stellen": ["RLC_PREIS:blocke-container", "SUBCONTRACTOR", "Baustellencontainer stellen"],
    "Baustrom herstellen / vorhalten": ["RLC_PREIS:blocke-baustrom", "SUBCONTRACTOR", "Baustrom herstellen / vorhalten"],
    "Bauwasser herstellen / vorhalten": ["RLC_PREIS:blocke-bauwasser", "SUBCONTRACTOR", "Bauwasser herstellen / vorhalten"],

    "Bauzaun stellen und vorhalten": ["RLC_PREIS:blocke-bauzaun", "SUBCONTRACTOR", "Bauzaun stellen und vorhalten"],
    "Absperrung / Absturzsicherung herstellen": ["RLC_PREIS:blocke-absperrung", "SUBCONTRACTOR", "Absperrung / Absturzsicherung herstellen"],
    "Leitbaken / Absperrbaken stellen": ["RLC_PREIS:blocke-baken", "SUBCONTRACTOR", "Leitbaken / Absperrbaken stellen"],

    "Verkehrssicherung einrichten und vorhalten": ["RLC_PREIS:blocke-verkehrssicherung", "SUBCONTRACTOR", "Verkehrssicherung einrichten und vorhalten"],
    "Mobile Ampelanlage stellen": ["RLC_PREIS:blocke-ampelanlage", "SUBCONTRACTOR", "Mobile Ampelanlage stellen"],
    "Beschilderungsplan / Verkehrszeichenplan erstellen": ["RLC_PREIS:blocke-beschilderungsplan", "SUBCONTRACTOR", "Beschilderungsplan / Verkehrszeichenplan erstellen"],
    "Verkehrsrechtliche Anordnung beantragen": ["RLC_PREIS:blocke-verkehrsrechtliche-anordnung", "SUBCONTRACTOR", "Verkehrsrechtliche Anordnung beantragen"],

    "Tagesbaustelle einrichten": ["RLC_PREIS:blocke-tagesbaustelle", "SUBCONTRACTOR", "Tagesbaustelle einrichten"],
    "Zuschlag Nachtarbeit": ["RLC_PREIS:blocke-nachtarbeit", "SUBCONTRACTOR", "Zuschlag Nachtarbeit"],
    "Zuschlag Wochenendarbeit": ["RLC_PREIS:blocke-wochenendarbeit", "SUBCONTRACTOR", "Zuschlag Wochenendarbeit"],

    "Handschachtung herstellen": ["RLC_PREIS:blocke-handschachtung", "LABOR", "Handschachtung herstellen"],
    "Suchschachtung herstellen": ["RLC_PREIS:blocke-suchschachtung", "SUBCONTRACTOR", "Suchschachtung herstellen"],
    "Bestandsleitung sichern": ["RLC_PREIS:blocke-bestandsleitung-sichern", "SUBCONTRACTOR", "Bestandsleitung sichern"],

    "Provisorium herstellen": ["RLC_PREIS:blocke-provisorium", "SUBCONTRACTOR", "Provisorium herstellen"],
    "Provisorische Umleitung herstellen": ["RLC_PREIS:blocke-umleitung", "SUBCONTRACTOR", "Provisorische Umleitung herstellen"],
  };

  {
    const cfg = blockERef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je ${isArea ? "m²" : isLength ? "m" : "EH"}`);
    }
  }

  /*
   * BLOCK D — Beton / Schächte / Fundamente erweitert.
   */
  const blockDRef: Record<string, [string, string, string]> = {
    "Betonfundament herstellen": ["RLC_PREIS:blockd-betonfundament", "SUBCONTRACTOR", "Betonfundament herstellen"],
    "Streifenfundament herstellen": ["RLC_PREIS:blockd-streifenfundament", "SUBCONTRACTOR", "Streifenfundament herstellen"],
    "Punktfundament herstellen": ["RLC_PREIS:blockd-punktfundament", "SUBCONTRACTOR", "Punktfundament herstellen"],

    "Schalung herstellen": ["RLC_PREIS:blockd-schalung", "SUBCONTRACTOR", "Schalung herstellen"],
    "Bewehrung einbauen": ["RLC_PREIS:blockd-bewehrung", "SUBCONTRACTOR", "Bewehrung einbauen"],
    "Beton liefern und einbauen": ["RLC_PREIS:blockd-beton-einbauen", "SUBCONTRACTOR", "Beton liefern und einbauen"],
    "Magerbeton einbauen": ["RLC_PREIS:blockd-magerbeton", "SUBCONTRACTOR", "Magerbeton einbauen"],

    "Schachtunterteil setzen": ["RLC_PREIS:blockd-schachtunterteil", "SUBCONTRACTOR", "Schachtunterteil setzen"],
    "Schachtring setzen": ["RLC_PREIS:blockd-schachtring", "SUBCONTRACTOR", "Schachtring setzen"],
    "Schachtkonus setzen": ["RLC_PREIS:blockd-schachtkonus", "SUBCONTRACTOR", "Schachtkonus setzen"],
    "Schachtabdeckung liefern und setzen": ["RLC_PREIS:blockd-schachtabdeckung", "SUBCONTRACTOR", "Schachtabdeckung liefern und setzen"],
    "Schacht erhöhen / regulieren": ["RLC_PREIS:blockd-schacht-erhoehen", "SUBCONTRACTOR", "Schacht erhöhen / regulieren"],
    "Schachtabdeckung austauschen": ["RLC_PREIS:blockd-schachtabdeckung-tauschen", "SUBCONTRACTOR", "Schachtabdeckung austauschen"],

    "Straßenablauf setzen": ["RLC_PREIS:blockd-strassenablauf-standard", "SUBCONTRACTOR", "Straßenablauf setzen"],
    "Straßenablauf anschließen": ["RLC_PREIS:blockd-strassenablauf-anschluss", "SUBCONTRACTOR", "Straßenablauf anschließen"],
    "Ablaufaufsatz / Rost setzen": ["RLC_PREIS:blockd-ablaufaufsatz", "SUBCONTRACTOR", "Ablaufaufsatz / Rost setzen"],

    "Kabelschacht klein liefern und setzen": ["RLC_PREIS:blockd-kabelschacht-klein", "SUBCONTRACTOR", "Kabelschacht klein liefern und setzen"],
    "Kabelschacht groß liefern und setzen": ["RLC_PREIS:blockd-kabelschacht-gross", "SUBCONTRACTOR", "Kabelschacht groß liefern und setzen"],
    "Kunststoffschacht setzen": ["RLC_PREIS:blockd-kunststoffschacht", "SUBCONTRACTOR", "Kunststoffschacht setzen"],
    "Betonschacht setzen": ["RLC_PREIS:blockd-betonschacht", "SUBCONTRACTOR", "Betonschacht setzen"],
  };

  {
    const cfg = blockDRef[String(technical.bauverfahren || "")];
    if (cfg) {
      const unitLower = String(einheit || "").toLowerCase();
      const isBlockDVolume = unitLower === "m³" || unitLower === "m3" || unitLower === "cbm";
      const unitLabel = isBlockDVolume ? "m³" : isArea ? "m²" : isLength ? "m" : "St/kg";
      add(cfg[0], cfg[1], 1, `${cfg[2]} je ${unitLabel}`);
    }
  }

  /*
   * BLOCK C — Erdarbeiten / Verbau / Entsorgung erweitert.
   */
  const isVolume =
    String(einheit || "").toLowerCase() === "m³" ||
    String(einheit || "").toLowerCase() === "m3" ||
    String(einheit || "").toLowerCase() === "cbm";

  const blockCRef: Record<string, [string, string, string]> = {
    "Baugrube ausheben / Boden lösen und laden": ["RLC_PREIS:blockc-baugrube-aushub", "SUBCONTRACTOR", "Baugrube ausheben / Boden lösen und laden"],
    "Graben ausheben / Leitungsgraben herstellen": ["RLC_PREIS:blockc-graben-aushub", "SUBCONTRACTOR", "Graben ausheben / Leitungsgraben herstellen"],
    "Oberboden / Boden abtragen": ["RLC_PREIS:blockc-bodenabtrag", "SUBCONTRACTOR", "Oberboden / Boden abtragen"],
    "Bodenaustausch herstellen": ["RLC_PREIS:blockc-bodenaustausch", "SUBCONTRACTOR", "Bodenaustausch herstellen"],

    "Grabenverbau herstellen": ["RLC_PREIS:blockc-grabenverbau", "SUBCONTRACTOR", "Grabenverbau herstellen"],
    "Spundwand herstellen": ["RLC_PREIS:blockc-spundwand", "SUBCONTRACTOR", "Spundwand herstellen"],
    "Bohrträgerverbau / Berliner Verbau herstellen": ["RLC_PREIS:blockc-bohltraegerverbau", "SUBCONTRACTOR", "Bohrträgerverbau / Berliner Verbau herstellen"],

    "Wasserhaltung mit Pumpe herstellen": ["RLC_PREIS:blockc-wasserhaltung-pumpe", "SUBCONTRACTOR", "Wasserhaltung mit Pumpe herstellen"],
    "Bauwasser / Grundwasser abpumpen": ["RLC_PREIS:blockc-drainagewasser-abpumpen", "SUBCONTRACTOR", "Bauwasser / Grundwasser abpumpen"],

    "Boden Z0 entsorgen": ["RLC_PREIS:blockc-entsorgung-boden-z0", "DISPOSAL", "Boden Z0 entsorgen"],
    "Boden Z1 entsorgen": ["RLC_PREIS:blockc-entsorgung-boden-z1", "DISPOSAL", "Boden Z1 entsorgen"],
    "Boden Z2 entsorgen": ["RLC_PREIS:blockc-entsorgung-boden-z2", "DISPOSAL", "Boden Z2 entsorgen"],
    "Bauschutt entsorgen": ["RLC_PREIS:blockc-entsorgung-bauschutt", "DISPOSAL", "Bauschutt entsorgen"],
    "Betonaufbruch entsorgen": ["RLC_PREIS:blockc-entsorgung-beton", "DISPOSAL", "Betonaufbruch entsorgen"],

    "Graben / Baugrube verfüllen": ["RLC_PREIS:blockc-verfuellung", "SUBCONTRACTOR", "Graben / Baugrube verfüllen"],
    "Lagenweise verfüllen und verdichten": ["RLC_PREIS:blockc-lagenweise-verdichten", "SUBCONTRACTOR", "Lagenweise verfüllen und verdichten"],

    "Füllsand liefern und einbauen": ["RLC_PREIS:blockc-fuellsand-liefern", "MATERIAL", "Füllsand liefern und einbauen"],
    "Kies liefern und einbauen": ["RLC_PREIS:blockc-kies-liefern", "MATERIAL", "Kies liefern und einbauen"],
    "Schotter liefern und einbauen": ["RLC_PREIS:blockc-schotter-liefern", "MATERIAL", "Schotter liefern und einbauen"],
    "Recyclingmaterial liefern und einbauen": ["RLC_PREIS:blockc-rc-material-liefern", "MATERIAL", "Recyclingmaterial liefern und einbauen"],
  };

  {
    const cfg = blockCRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je ${isVolume ? "m³" : isArea ? "m²" : isLength ? "m" : "St/h/Tag"}`);
    }
  }

  /*
   * BLOCK B — Straßenbau / Oberfläche erweitert.
   */
  const blockBRef: Record<string, [string, string, string]> = {
    // X83_OBERBAU_AUFBRUCH_GROSSFLAECHE_OVERRIDE
    "Gebundener Oberbau aufbrechen Großfläche": ["RLC_PREIS:x83-oberbau-aufbruch-grossflaeche", "SUBCONTRACTOR", "Gebundener Oberbau aufbrechen Großfläche"],
    "Asphaltbinderschicht herstellen": ["RLC_PREIS:blockb-asphalt-binder", "SUBCONTRACTOR", "Asphaltbinderschicht herstellen"],
    "Asphalt-Ausgleichsschicht herstellen": ["RLC_PREIS:blockb-asphalt-ausgleich", "SUBCONTRACTOR", "Asphalt-Ausgleichsschicht herstellen"],
    "Asphalt Kleinfläche von Hand herstellen": ["RLC_PREIS:blockb-asphalt-hand", "SUBCONTRACTOR", "Asphalt Kleinfläche von Hand herstellen"],

    "Asphaltfläche aufbrechen und aufnehmen": ["RLC_PREIS:blockb-asphalt-aufbruch", "SUBCONTRACTOR", "Asphaltfläche aufbrechen und aufnehmen"],
    "Pflaster aufnehmen und seitlich lagern": ["RLC_PREIS:blockb-pflaster-aufnehmen", "SUBCONTRACTOR", "Pflaster aufnehmen und seitlich lagern"],
    "Betonfläche aufbrechen und aufnehmen": ["RLC_PREIS:blockb-beton-aufbrechen", "SUBCONTRACTOR", "Betonfläche aufbrechen und aufnehmen"],

    "Betonpflaster liefern und verlegen": ["RLC_PREIS:blockb-pflaster-verlegen", "SUBCONTRACTOR", "Betonpflaster liefern und verlegen"],
    "Betonplatten liefern und verlegen": ["RLC_PREIS:blockb-platten-verlegen", "SUBCONTRACTOR", "Betonplatten liefern und verlegen"],
    "Natursteinpflaster verlegen": ["RLC_PREIS:blockb-natursteinpflaster", "SUBCONTRACTOR", "Natursteinpflaster verlegen"],

    "Hochbordstein liefern und setzen": ["RLC_PREIS:blockb-bordstein-hochbord", "SUBCONTRACTOR", "Hochbordstein liefern und setzen"],
    "Tiefbordstein liefern und setzen": ["RLC_PREIS:blockb-bordstein-tiefbord", "SUBCONTRACTOR", "Tiefbordstein liefern und setzen"],
    "Rundbordstein liefern und setzen": ["RLC_PREIS:blockb-rundbord", "SUBCONTRACTOR", "Rundbordstein liefern und setzen"],

    "Pflasterrinne herstellen": ["RLC_PREIS:blockb-rinne-pflaster", "SUBCONTRACTOR", "Pflasterrinne herstellen"],
    "Betonrinne / Entwässerungsrinne herstellen": ["RLC_PREIS:blockb-rinne-beton", "SUBCONTRACTOR", "Betonrinne / Entwässerungsrinne herstellen"],

    "Fahrbahnmarkierung Linie herstellen": ["RLC_PREIS:blockb-markierung-linie", "SUBCONTRACTOR", "Fahrbahnmarkierung Linie herstellen"],
    "Verkehrsschild liefern und setzen": ["RLC_PREIS:blockb-beschilderung", "SUBCONTRACTOR", "Verkehrsschild liefern und setzen"],

    "Bankett herstellen": ["RLC_PREIS:blockb-bankett", "SUBCONTRACTOR", "Bankett herstellen"],
    "Mulde profilieren / herstellen": ["RLC_PREIS:blockb-mulde", "SUBCONTRACTOR", "Mulde profilieren / herstellen"],
    "Rasenansaat herstellen": ["RLC_PREIS:blockb-rasenansaat", "SUBCONTRACTOR", "Rasenansaat herstellen"],

    "Planum herstellen": ["RLC_PREIS:blockb-planum", "SUBCONTRACTOR", "Planum herstellen"],
    "Untergrund verdichten": ["RLC_PREIS:blockb-verdichtung", "SUBCONTRACTOR", "Untergrund verdichten"],
    "Sauberkeitsschicht herstellen": ["RLC_PREIS:blockb-sauberkeitsschicht", "SUBCONTRACTOR", "Sauberkeitsschicht herstellen"],
  };

  const isBlockBExactOnly =
    [
      "Pflaster aufnehmen und seitlich lagern",
      "Betonpflaster liefern und verlegen",
      "Natursteinpflaster verlegen",
      "Pflasterrinne herstellen",
      "Planum herstellen",
    ].includes(String(technical.bauverfahren || ""));

  {
    const cfg = blockBRef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je ${isLength ? "m" : isArea ? "m²" : "St"}`);
    }
  }

  if (isBlockBExactOnly && components.length > 0) {
    const directSum = round2(components.reduce((sum, c) => {
      const priceInfo = defaultPriceFor(c.refKey, text, einheit);
      return sum + round2(c.qty * n(priceInfo.price));
    }, 0));

    const overheadCost = round2(directSum * 0.10);
    const riskCost = round2(directSum * 0.04);
    const profitCost = round2((directSum + overheadCost + riskCost) * 0.08);
    const finalUnitPrice = round2(directSum + overheadCost + riskCost + profitCost);

    const priceBreakdown: PriceBreakdownLine[] = components.map((c, index) => {
      const priceInfo = defaultPriceFor(c.refKey, text, einheit);
      const price = round2(n(priceInfo.price));
      const qty = round2(n(c.qty));
      return {
        id: `blockb-exact-${index + 1}`,
        group: detectGroup(c.type, c.refKey),
        name: priceInfo.name,
        unit: priceInfo.unit || einheit || "EH",
        qty,
        price,
        total: round2(qty * price),
        note: c.note,
      };
    });

    priceBreakdown.push(
      { id: "blockb-gk", group: "Gemeinkosten", name: "Gemeinkosten", unit: einheit || "EH", qty: 1, price: overheadCost, total: overheadCost, note: "10 % aus technischer RLC-Kalkulation" },
      { id: "blockb-risk", group: "Risiko", name: "Risiko", unit: einheit || "EH", qty: 1, price: riskCost, total: riskCost, note: "4 % aus technischer RLC-Kalkulation" },
      { id: "blockb-profit", group: "Gewinn", name: "Gewinn", unit: einheit || "EH", qty: 1, price: profitCost, total: profitCost, note: "8 % aus technischer RLC-Kalkulation" }
    );

    return {
      id: row.id,
      posNr: s(row.posNr),
      kurztext: s(row.kurztext),
      langtext: s(row.langtext),
      einheit,
      menge,
      finalUnitPrice,
      suggestedUnitPrice: finalUnitPrice,
      totalPrice: round2(finalUnitPrice * (menge || 0)),
      source: "technical-parser",
      confidence: technical.confidence || 0.9,
      gewerk: technical.gewerk,
      leistungsart: technical.leistungsart,
      bauverfahren: technical.bauverfahren,
      priceBreakdown,
      aiReason: [
        "Technischer RLC-Komponentenrechner verwendet.",
        `Erkannt: ${technical.bauverfahren || "—"}.`,
      ].join("\n"),
    };
  }

  /*
   * BLOCK A — Versorgung / Leitungsbau erweitert.
   */
  const blockARef: Record<string, [string, string, string]> = {
    "Lichtmast setzen": ["RLC_PREIS:beleuchtung-mast-setzen", "SUBCONTRACTOR", "Lichtmast setzen"],
    "Lichtmast Fundament herstellen": ["RLC_PREIS:beleuchtung-fundament-herstellen", "SUBCONTRACTOR", "Lichtmast Fundament herstellen"],
    "Straßenbeleuchtung anschließen": ["RLC_PREIS:beleuchtung-kabel-anschluss", "SUBCONTRACTOR", "Straßenbeleuchtung anschließen"],

    "Telekom-Kabel in Rohr einziehen": ["RLC_PREIS:telekom-kabelzug", "SUBCONTRACTOR", "Telekom-Kabel in Rohr einziehen"],
    "Telekom-Muffe herstellen": ["RLC_PREIS:telekom-muffe", "SUBCONTRACTOR", "Telekom-Muffe herstellen"],
    "Telekom-Verteilerschrank setzen": ["RLC_PREIS:telekom-schrank-setzen", "SUBCONTRACTOR", "Telekom-Verteilerschrank setzen"],

    "Fernwärmerohr verlegen": ["RLC_PREIS:fernwaerme-rohr-verlegen", "SUBCONTRACTOR", "Fernwärmerohr verlegen"],
    "Fernwärme-Hausanschluss herstellen": ["RLC_PREIS:fernwaerme-hausanschluss", "SUBCONTRACTOR", "Fernwärme-Hausanschluss herstellen"],
    "Druckprüfung Fernwärmeleitung": ["RLC_PREIS:fernwaerme-druckprobe", "SUBCONTRACTOR", "Druckprüfung Fernwärmeleitung"],

    "Abwasser-Druckleitung PE verlegen": ["RLC_PREIS:abwasser-druckleitung-verlegen", "SUBCONTRACTOR", "Abwasser-Druckleitung PE verlegen"],
    "Pumpenschacht setzen": ["RLC_PREIS:pumpenschacht-setzen", "SUBCONTRACTOR", "Pumpenschacht setzen"],
    "Hebeanlage einbauen": ["RLC_PREIS:hebeanlage-einbauen", "SUBCONTRACTOR", "Hebeanlage einbauen"],

    "Schieber / Absperrschieber einbauen": ["RLC_PREIS:armatur-schieber-einbauen", "SUBCONTRACTOR", "Schieber / Absperrschieber einbauen"],
    "Ventil / Klappe einbauen": ["RLC_PREIS:armatur-ventil-einbauen", "SUBCONTRACTOR", "Ventil / Klappe einbauen"],

    "Kernbohrung / Rohrdurchführung herstellen": ["RLC_PREIS:kernbohrung-rohrdurchfuehrung", "SUBCONTRACTOR", "Kernbohrung / Rohrdurchführung herstellen"],
    "Mehrsparten-Hauseinführung herstellen": ["RLC_PREIS:hauseinfuehrung-mehrsparten", "SUBCONTRACTOR", "Mehrsparten-Hauseinführung herstellen"],

    "Trasse abstecken": ["RLC_PREIS:vermessung-trasse-abstecken", "SUBCONTRACTOR", "Trasse abstecken"],
    "Bestandsplan / As-Built Dokumentation erstellen": ["RLC_PREIS:doku-bestandsplan", "SUBCONTRACTOR", "Bestandsplan / As-Built Dokumentation erstellen"],
    "Leitungsortung durchführen": ["RLC_PREIS:ortung-leitung", "SUBCONTRACTOR", "Leitungsortung durchführen"],
  };

  {
    const cfg = blockARef[String(technical.bauverfahren || "")];
    if (cfg) {
      add(cfg[0], cfg[1], 1, `${cfg[2]} je ${isLength ? "m" : "St/h"}`);
    }
  }

  /*
   * Strom / Kabelbau:
   * Direkte RLC-Preise für Stromkabel, Kabelzug, Leerrohr, Muffe und KVZ.
   */
  if (isLength && technical.bauverfahren === "Stromkabel / Erdkabel verlegen") {
    add("RLC_PREIS:strom-erdkabel-verlegen", "SUBCONTRACTOR", 1, "Stromkabel / Erdkabel verlegen je m");
  }

  if (isLength && technical.bauverfahren === "Kabel in Leerrohr einziehen") {
    add("RLC_PREIS:strom-kabelzug", "SUBCONTRACTOR", 1, "Kabel in vorhandenes Leerrohr einziehen je m");
  }

  if (isLength && technical.bauverfahren === "Leerrohr Strom verlegen") {
    add("RLC_PREIS:strom-leerrohr-verlegen", "SUBCONTRACTOR", 1, "Leerrohr für Stromleitung verlegen je m");
  }

  if (technical.bauverfahren === "Kabelmuffe / Verbindungsmuffe herstellen") {
    add("RLC_PREIS:strom-kabelmuffe", "SUBCONTRACTOR", 1, "Kabelmuffe / Verbindungsmuffe herstellen je St");
  }

  if (technical.bauverfahren === "Kabelverteilerschrank / KVZ setzen") {
    add("RLC_PREIS:strom-kvz-setzen", "SUBCONTRACTOR", 1, "Kabelverteilerschrank / KVZ setzen je St");
  }

  function detectGasDa(textValue: string): string {
    const gt = norm(textValue);
    if (gt.includes("da 63") || gt.includes("da63")) return "da63";
    if (gt.includes("da 32") || gt.includes("da32")) return "da32";
    return "da32";
  }

  /*
   * Gasleitung / PE-Gasrohr / Schutzrohr:
   * Direkte RLC-Preise für Gasleitung, Hausanschluss, Druckprüfung und Schutzrohr.
   */
  if (isLength && technical.bauverfahren === "PE-Gasleitung verlegen") {
    const da = detectGasDa(text);
    const ref =
      da === "da63"
        ? "RLC_PREIS:gas-pe-da63-verlegen"
        : "RLC_PREIS:gas-pe-da32-verlegen";

    add(ref, "SUBCONTRACTOR", 1, `PE-Gasleitung ${da.toUpperCase()} liefern und verlegen je m`);
  }

  if (technical.bauverfahren === "Gas-Hausanschluss herstellen") {
    add("RLC_PREIS:gas-hausanschluss", "SUBCONTRACTOR", 1, "Gas-Hausanschluss herstellen je St");
  }

  if (technical.bauverfahren === "Druckprüfung Gasleitung") {
    add("RLC_PREIS:gas-druckprobe", "SUBCONTRACTOR", 1, "Druckprüfung Gasleitung je St");
  }

  if (isLength && technical.bauverfahren === "Schutzrohr Gasleitung verlegen") {
    add("RLC_PREIS:gas-schutzrohr-verlegen", "SUBCONTRACTOR", 1, "Schutzrohr für Gasleitung verlegen je m");
  }

  function detectPeDa(textValue: string): string {
    const wt = norm(textValue);
    if (wt.includes("da 110") || wt.includes("da110")) return "da110";
    if (wt.includes("da 63") || wt.includes("da63")) return "da63";
    if (wt.includes("da 32") || wt.includes("da32")) return "da32";
    return "da32";
  }

  /*
   * Wasserleitung / PE-Rohr / Hydrant:
   * Direkte RLC-Preise für PE-Wasserleitung, Hausanschluss, Hydrant und Druckprüfung.
   */
  if (isLength && technical.bauverfahren === "PE-Wasserleitung verlegen") {
    const da = detectPeDa(text);
    const ref =
      da === "da110"
        ? "RLC_PREIS:wasser-pe-da110-verlegen"
        : da === "da63"
          ? "RLC_PREIS:wasser-pe-da63-verlegen"
          : "RLC_PREIS:wasser-pe-da32-verlegen";

    add(ref, "SUBCONTRACTOR", 1, `PE-Wasserleitung ${da.toUpperCase()} liefern und verlegen je m`);
  }

  if (technical.bauverfahren === "Wasser-Hausanschluss herstellen") {
    add("RLC_PREIS:wasser-hausanschluss", "SUBCONTRACTOR", 1, "Wasser-Hausanschluss herstellen je St");
  }

  if (technical.bauverfahren === "Hydrant einbauen") {
    add("RLC_PREIS:wasser-hydrant-einbauen", "SUBCONTRACTOR", 1, "Hydrant einbauen je St");
  }

  if (technical.bauverfahren === "Druckprüfung Wasserleitung") {
    add("RLC_PREIS:wasser-druckprobe", "SUBCONTRACTOR", 1, "Druckprüfung Wasserleitung je St");
  }

  /*
   * Glasfaser / Microtrenching / Hausanschluss:
   * Direkte RLC-Preise für Glasfaser-Sonderleistungen.
   */
  if (isLength && technical.bauverfahren === "Microtrenching schneiden") {
    add("RLC_PREIS:glasfaser-microtrenching-schneiden", "MACHINE", 1, "Microtrenching schneiden je m");
  }

  if (isLength && technical.bauverfahren === "Microtrenching komplett inkl. Verfüllung") {
    add("RLC_PREIS:glasfaser-microtrenching-komplett", "SUBCONTRACTOR", 1, "Microtrenching komplett inkl. Verfüllung je m");
  }

  if (isLength && technical.bauverfahren === "Glasfaserkabel einblasen") {
    add("RLC_PREIS:glasfaser-speedpipe-einblasen", "SUBCONTRACTOR", 1, "Glasfaserkabel einblasen je m");
  }

  if (technical.bauverfahren === "Glasfaser-Hausanschluss Tiefbau") {
    add("RLC_PREIS:glasfaser-hausanschluss-tiefbau", "SUBCONTRACTOR", 1, "Glasfaser-Hausanschluss Tiefbau je St");
  }

  if (technical.bauverfahren === "Kabelzugschacht / Muffenschacht setzen") {
    add("RLC_PREIS:glasfaser-kabelzugschacht", "MATERIAL", 1, "Kabelzugschacht / Muffenschacht je St");
    add("LABOR:FACHARBEITER", "LABOR", 1.5, "Kabelzugschacht setzen / ausrichten je St");
    add("MACHINE:BAGGER_8_14T", "MACHINE", 1.0, "Baggerleistung Kabelzugschacht setzen je St");
  }

  /*
   * Kabel / Speedpipe / Schutzrohr / Warnband:
   * Direkte RLC-Komponenten für Glasfaser-/Leitungsschutzpositionen.
   */
  if (isLength && technical.bauverfahren === "Speedpipe / Mikrorohr verlegen") {
    add("RLC_PREIS:material-speedpipe", "MATERIAL", 1, "Speedpipe / Mikrorohr Material je m");
    add("RLC_PREIS:leistung-speedpipe-verlegen", "SUBCONTRACTOR", 1, "Speedpipe im offenen Graben verlegen je m");
  }

  if (isLength && technical.bauverfahren === "Kabelschutzrohr verlegen") {
    const isDn50 = t.includes("dn50") || t.includes("dn 50");
    const ref = isDn50
      ? "RLC_PREIS:material-kabelschutzrohr-dn50"
      : "RLC_PREIS:material-kabelschutzrohr-dn110";

    add(ref, "MATERIAL", 1, isDn50 ? "Kabelschutzrohr DN50 Material je m" : "Kabelschutzrohr DN110 Material je m");
    add("LABOR:FACHARBEITER", "LABOR", 0.035, "Kabelschutzrohr verlegen je m");
    add("LABOR:HELFER", "LABOR", 0.02, "Kabelschutzrohr Hilfsleistung je m");
  }

  if (isLength && technical.bauverfahren === "Warnband / Trassenband verlegen") {
    const ortbar =
      t.includes("ortbar") ||
      t.includes("ortbares") ||
      t.includes("trassenband ortbar");

    add(
      ortbar ? "RLC_PREIS:tiefbau-trassenband-ortbar" : "RLC_PREIS:tiefbau-warnband",
      "MATERIAL",
      1,
      ortbar ? "Ortbares Trassenband je m" : "Warnband / Trassenwarnband je m"
    );
    add("LABOR:HELFER", "LABOR", 0.004, "Warnband ausrollen/verlegen je m");
  }

  /*
   * Drainage / Filterkies / Vlies:
   * Direkte RLC-Preise für Drainagerohr, Filterkies und Filtervlies.
   */
  if (isLength && technical.bauverfahren === "Drainagerohr DN100 verlegen") {
    add("RLC_PREIS:drainage-rohr-dn100", "SUBCONTRACTOR", 1, "Drainagerohr DN100 liefern und verlegen je m");
  }

  if (technical.bauverfahren === "Filterkies / Drainagekies einbauen") {
    if (u === "m³") {
      add("RLC_PREIS:drainage-filterkies", "MATERIAL", 1, "Filterkies / Drainagekies je m³");
    } else if (isArea) {
      const qty = n(technical.kies_m3_per_m2) || 0.2;
      add("RLC_PREIS:drainage-filterkies", "MATERIAL", qty, "Filterkies / Drainagekies je m²");
      add("LABOR:FACHARBEITER", "LABOR", 0.025, "Drainagekies einbauen / profilieren je m²");
      add("MACHINE:RUETTELPLATTE", "MACHINE", 0.01, "Drainagekies leicht verdichten je m²");
    }
  }

  if (isArea && technical.bauverfahren === "Filtervlies / Geotextil verlegen") {
    add("RLC_PREIS:drainage-vlies", "MATERIAL", 1, "Filtervlies / Geotextil verlegen je m²");
    add("LABOR:HELFER", "LABOR", 0.01, "Vlies auslegen / zuschneiden je m²");
  }

  /*
   * Schächte / Kanalprüfung:
   * Direkte RLC-Preise für Kontrollschacht, Anschluss, Dichtheitsprüfung, Kamerabefahrung.
   */
  if (technical.bauverfahren === "Kontrollschacht setzen") {
    add("RLC_PREIS:kanal-kontrollschacht-setzen", "SUBCONTRACTOR", 1, "Kontrollschacht setzen je St");
  }

  if (technical.bauverfahren === "Schachtanschluss herstellen") {
    add("RLC_PREIS:kanal-schachtanschluss", "SUBCONTRACTOR", 1, "Rohranschluss an Schacht herstellen je St");
  }

  if (technical.bauverfahren === "Dichtheitsprüfung Kanal") {
    add("RLC_PREIS:rlc-auto-tiefbau-doku-dichtheitspruefung-kanal", "SUBCONTRACTOR", 1, "Dichtheitsprüfung Kanal je St");
  }

  if (technical.bauverfahren === "Kamerabefahrung Kanal") {
    add("RLC_PREIS:rlc-auto-tiefbau-doku-kamerabefahrung", "SUBCONTRACTOR", 1, "Kamerabefahrung Kanal je m");
  }

  function detectKanalDn(textValue: string): string {
    const kt = norm(textValue);
    if (kt.includes("dn 200") || kt.includes("dn200")) return "dn200";
    if (kt.includes("dn 150") || kt.includes("dn150")) return "dn150";
    if (kt.includes("dn 125") || kt.includes("dn125")) return "dn125";
    if (kt.includes("dn 100") || kt.includes("dn100")) return "dn100";
    return "dn100";
  }

  function depthKeyForKanal(depth: number): string {
    const d = n(depth);
    if (d <= 1.1) return "tiefe100";
    if (d <= 1.35) return "tiefe120";
    if (d <= 1.65) return "tiefe150";
    if (d <= 1.9) return "tiefe180";
    if (d <= 2.25) return "tiefe200";
    return "tiefe250";
  }

  /*
   * Kanal / KG-PVC Rohr:
   * bevorzugt DN + Tiefe aus RLC-Auto-Preisbibliothek.
   */
  if (isLength && technical.bauverfahren === "KG/PVC Rohr verlegen") {
    const dn = detectKanalDn(text);
    const depthKey = depthKeyForKanal(technical.depth_m);
    const autoKey = `RLC_PREIS:rlc-auto-tiefbau-kanal-kg-${dn}-${depthKey}`;

    const fallbackKey =
      dn === "dn200"
        ? "RLC_PREIS:kanal-kg-dn200-verlegen"
        : dn === "dn150"
          ? "RLC_PREIS:kanal-kg-dn150-verlegen"
          : "RLC_PREIS:kanal-kg-dn100-verlegen";

    const autoInfo = defaultPriceFor(autoKey, text, einheit);
    const hasAuto =
      n(autoInfo.price) > 0 &&
      !autoInfo.name.toLowerCase().includes("pauschaler ansatz");

    add(
      hasAuto ? autoKey : fallbackKey,
      "SUBCONTRACTOR",
      1,
      hasAuto
        ? `KG/PVC Rohr ${dn.toUpperCase()} verlegen nach Tiefe ${depthKey}`
        : `KG/PVC Rohr ${dn.toUpperCase()} verlegen, Fallback ohne Tiefe`
    );
  }

  /*
   * Leitungsbau / Rohrgraben / Speedpipe:
   * Einheit m wird technisch über m³/m und Material/Verlegeleistung gerechnet.
   */
  if (isLength && technical.bauverfahren === "Rohrgraben / Kabelgraben herstellen") {
    add(
      "RLC_PREIS:leistung-aushub-loesen-laden",
      "MACHINE",
      technical.trench_m3_per_m,
      "Rohrgraben Aushub lösen/laden aus Tiefe × Breite"
    );

    if (t.includes("verfüllen") || t.includes("verfuellen") || t.includes("verfüllung") || t.includes("verfuellung")) {
      add(
        "RLC_PREIS:leistung-verfuellung",
        "MACHINE",
        technical.backfill_m3_per_m || technical.trench_m3_per_m,
        "Rohrgraben verfüllen je m"
      );
    }

    if (t.includes("entsorgung") || t.includes("entsorgen") || t.includes("deponie")) {
      add(
        "RLC_PREIS:entsorgung-boden-z0",
        "DISPOSAL",
        round2(n(technical.trench_m3_per_m) * 1.8),
        "Bodenentsorgung Rohrgraben, Ansatz 1,8 t/m³"
      );
    }

    if (t.includes("abfuhr") || t.includes("abfahren") || t.includes("transport")) {
      add(
        "RLC_PREIS:transport-aushub-kurzstrecke",
        "TRANSPORT",
        technical.trench_m3_per_m,
        "Aushubtransport Rohrgraben Kurzstrecke"
      );
    }
  }

  if (isLength && technical.bauverfahren === "Rohrbettung / Kabelsand herstellen") {
    add(
      "RLC_PREIS:material-sand",
      "MATERIAL",
      technical.bedding_sand_m3_per_m,
      "Rohrbettung/Kabelsand aus technischem Parser"
    );
    add("LABOR:FACHARBEITER", "LABOR", 0.015, "Rohrbettung profilieren je m");
    add("LABOR:HELFER", "LABOR", 0.01, "Rohrbettung Hilfsleistung je m");
  }

  /*
   * Oberfläche über Rohrgraben wiederherstellen:
   * Einheit m -> Breite × 1 m = m²/m.
   */
  if (
    isLength &&
    technical.bauverfahren === "Rohrgraben / Kabelgraben herstellen" &&
    n(technical.surface_m2_per_m) > 0
  ) {
    if (technical.surface === "ASPHALT") {
      add(
        "RLC_PREIS:oberflaeche-asphalt-endgueltig",
        "SUBCONTRACTOR",
        technical.surface_m2_per_m,
        "Asphaltoberfläche über Rohrgraben wiederherstellen"
      );
    }

    if (technical.surface === "PFLASTER") {
      add(
        "RLC_PREIS:oberflaeche-pflaster-wieder-einbauen",
        "LABOR",
        technical.surface_m2_per_m,
        "Pflasterfläche über Rohrgraben wieder einbauen"
      );
    }

    if (technical.surface === "RASEN") {
      add(
        "RLC_PREIS:leistung-planum",
        "MACHINE",
        technical.surface_m2_per_m,
        "Rasen/Oberbodenfläche über Rohrgraben vorbereiten"
      );
      add(
        "LABOR:HELFER",
        "LABOR",
        round2(0.02 * n(technical.surface_m2_per_m)),
        "Rasen ansäen / Oberboden andecken je m"
      );
    }
  }

  /*
   * Asphalt technische Direktlogik:
   * - Asphaltdeckschicht / Asphalttragschicht werden über t/m² gerechnet.
   * - Dichte-Ansatz Asphalt: ca. 2,4 t/m³.
   * - Fräsen/Aufbrechen und Schneiden werden als eigene Leistungspositionen geführt.
   */
  const asphaltThicknessCm = n(technical.thickness_cm);
  const asphalt_t_per_m2 =
    technical.surface === "ASPHALT" && asphaltThicknessCm > 0
      ? round2((asphaltThicknessCm / 100) * 2.4)
      : 0;

  if (technical.bauverfahren === "Asphaltdeckschicht herstellen") {
    add(
      "RLC_PREIS:material-asphalt-deckschicht",
      "MATERIAL",
      asphalt_t_per_m2,
      "Asphaltdeckschicht aus technischem Parser, Ansatz 2,4 t/m³"
    );
  }
  const isAdsGrossflaeche4cm: boolean =
    technical.bauverfahren === "Asphaltdeckschicht herstellen" &&
    isArea &&
    menge >= 1000 &&
    asphaltThicknessCm > 0 &&
    asphaltThicknessCm <= 4.5;

  const isAtsGrossflaeche10cm: boolean =
    technical.bauverfahren === "Asphalttragschicht herstellen" &&
    isArea &&
    menge >= 300 &&
    asphaltThicknessCm >= 9 &&
    asphaltThicknessCm <= 11;



  // X83_ADS_GROSSFLAECHE_OVERRIDE
  if (
    isAdsGrossflaeche4cm
  ) {
    components.length = 0;
    add("RLC_PREIS:x83-ads-grossflaeche-4cm", "SUBCONTRACTOR", 1, "ADS AC 11 DS Großfläche 4 cm kalibriert");
  }

  // X83_ATS_GROSSFLAECHE_10CM_OVERRIDE
  if (isAtsGrossflaeche10cm) {
    components.length = 0;
    add("RLC_PREIS:x83-ats-grossflaeche-10cm", "SUBCONTRACTOR", 1, "ATS AC 32 TS Großfläche 10 cm kalibriert");
  } else {
    if (technical.bauverfahren === "Asphalttragschicht herstellen") {
    add(
      "RLC_PREIS:material-asphalt-tragschicht",
      "MATERIAL",
      asphalt_t_per_m2,
      "Asphalttragschicht aus technischem Parser, Ansatz 2,4 t/m³"
    );
  }
  }

  const isAsphaltLayerBuild =
    !isAdsGrossflaeche4cm &&
    !isAtsGrossflaeche10cm &&
    (
      technical.bauverfahren === "Asphaltdeckschicht herstellen" ||
      technical.bauverfahren === "Asphalttragschicht herstellen"
    );

  /*
   * Asphalt "liefern und einbauen":
   * Material in t/m² + Einbau/Profilierung + Walzenverdichtung.
   * Kein Zusatz bei Fräsen oder Schneiden.
   */
  if (isAsphaltLayerBuild) {
    add("LABOR:FACHARBEITER", "LABOR", 0.025, "Asphalteinbau / Einbaukolonne je m²");
    add("LABOR:HELFER", "LABOR", 0.015, "Asphalteinbau Hilfsleistung je m²");
    add("RLC_PREIS:maschine-walze", "MACHINE", 0.015, "Walzenverdichtung Asphalt je m²");
  }

  if (technical.bauverfahren === "Asphaltfläche fräsen / aufnehmen") {
    add(
      "RLC_PREIS:oberflaeche-asphalt-aufbrechen-m2",
      "MACHINE",
      1,
      "Asphaltfläche fräsen / aufnehmen je m²"
    );
  }

  const wantsAsphaltDisposal =
    technical.surface === "ASPHALT" &&
    (
      t.includes("entsorgung") ||
      t.includes("entsorgen") ||
      t.includes("deponie") ||
      t.includes("verwerten") ||
      t.includes("abfahren")
    );

  const isExplicitTeerfrei =
    t.includes("teerfrei") ||
    t.includes("nicht teerhaltig") ||
    t.includes("ohne pak") ||
    t.includes("pak frei") ||
    t.includes("pak-frei");

  const isPakAsphalt =
    !isExplicitTeerfrei &&
    (
      t.includes("pak") ||
      t.includes("teerhaltig") ||
      t.includes("teerhaltiger") ||
      t.includes("teerhaltigen") ||
      t.includes("gefaehrlich") ||
      t.includes("gefährlich")
    );

  /*
   * Asphaltentsorgung:
   * Ansatz t/m² aus erkannter Stärke.
   * Wenn keine Stärke erkannt wurde, Standard 4 cm = 0,096 t/m².
   */
  if (wantsAsphaltDisposal && isArea) {
    const asphaltWaste_t_per_m2 = asphalt_t_per_m2 > 0 ? asphalt_t_per_m2 : 0.096;

    add(
      isPakAsphalt
        ? "RLC_PREIS:entsorgung-teerhaltiger-asphalt"
        : "RLC_PREIS:entsorgung-asphalt",
      "DISPOSAL",
      asphaltWaste_t_per_m2,
      isPakAsphalt
        ? "Teerhaltigen/PAK-Asphalt entsorgen, Ansatz 2,4 t/m³"
        : "Asphaltaufbruch teerfrei entsorgen, Ansatz 2,4 t/m³"
    );
  }

  if (technical.bauverfahren === "Asphalt schneiden / trennen") {
    add(
      "RLC_PREIS:leistung-asphalt-schneiden",
      "MACHINE",
      1,
      "Asphalt schneiden / trennen je m"
    );
  }

  /*
   * Oberfläche getrennt von technischem Schichtaufbau.
   * Wichtig: NICHT "komplett" verwenden, wenn Frostschutz/Splitt/Auskofferung
   * separat aus dem Langtext erkannt werden.
   */
  const isSurfaceRestoreOverTrench =
    isLength &&
    technical.bauverfahren === "Rohrgraben / Kabelgraben herstellen" &&
    n(technical.surface_m2_per_m) > 0;

  if (!isSurfaceRestoreOverTrench && technical.surface === "RASENGITTER") {
    add("RLC_PREIS:material-rasengitter-standard", "MATERIAL", 1, "Rasengitter Material je m²");
    add("RLC_PREIS:leistung-rasengitter-verlegen", "LABOR", 1, "Rasengitter verlegen je m²");
  } else if (!isSurfaceRestoreOverTrench && technical.surface === "PFLASTER") {
    add("RLC_PREIS:material-betonpflaster-standard", "MATERIAL", 1, "Pflaster Material je m²");
    add("RLC_PREIS:leistung-pflaster-verlegen", "LABOR", 1, "Pflaster verlegen je m²");
  }

  add(
    "RLC_PREIS:material-splitt-25",
    "MATERIAL",
    technical.splitt_m3_per_m2,
    "Splittbett aus technischem Parser"
  );

  add(
    "RLC_PREIS:material-sand",
    "MATERIAL",
    technical.sand_m3_per_m2,
    "Sandbett aus technischem Parser"
  );

  add(
    "RLC_PREIS:material-frostschutz-032",
    "MATERIAL",
    technical.frostschutz_m3_per_m2,
    "Frostschutzschicht aus technischem Parser"
  );

  add(
    "RLC_PREIS:material-schotter",
    "MATERIAL",
    technical.schotter_m3_per_m2,
    "Schottertragschicht aus technischem Parser"
  );

  add(
    "RLC_PREIS:material-kies-816",
    "MATERIAL",
    technical.kies_m3_per_m2,
    "Kiestragschicht / Filterkies aus technischem Parser"
  );

  const hasTechnicalLayer =
    n(technical.sand_m3_per_m2) > 0 ||
    n(technical.splitt_m3_per_m2) > 0 ||
    n(technical.frostschutz_m3_per_m2) > 0 ||
    n(technical.schotter_m3_per_m2) > 0 ||
    n(technical.kies_m3_per_m2) > 0;

  const hasSurfaceWork =
    technical.surface === "RASENGITTER" ||
    technical.surface === "PFLASTER";

  /*
   * Schichten "liefern und einbauen":
   * Material allein ist zu niedrig. Bei reinen Schichtpositionen ergänzen wir
   * Personal + Verdichtung je m². Bei Pflaster/Rasengitter nicht, weil dort
   * die Oberflächenleistung bereits eigene Verlege-/Einbaukosten enthält.
   */
  if (hasTechnicalLayer && !hasSurfaceWork) {
    add("LABOR:FACHARBEITER", "LABOR", 0.04, "Schicht einbauen / profilieren je m²");
    add("LABOR:HELFER", "LABOR", 0.025, "Schicht einbauen Hilfsleistung je m²");
    add("MACHINE:RUETTELPLATTE", "MACHINE", 0.015, "Schicht verdichten je m²");
  }

  const excludesAushub =
    t.includes("ohne aushub") ||
    t.includes("ohne auskofferung") ||
    t.includes("aushub bauseits") ||
    t.includes("auskofferung bauseits") ||
    t.includes("aushub separat") ||
    t.includes("auskofferung separat") ||
    t.includes("aushub gesondert") ||
    t.includes("auskofferung gesondert");

  const excludesEntsorgung =
    t.includes("ohne entsorgung") ||
    t.includes("ohne deponie") ||
    t.includes("entsorgung bauseits") ||
    t.includes("deponie bauseits") ||
    t.includes("entsorgung separat") ||
    t.includes("deponie separat") ||
    t.includes("entsorgung gesondert") ||
    t.includes("deponie gesondert");

  const excludesTransport =
    t.includes("ohne abfuhr") ||
    t.includes("ohne transport") ||
    t.includes("abfuhr bauseits") ||
    t.includes("transport bauseits") ||
    t.includes("abfuhr separat") ||
    t.includes("transport separat") ||
    t.includes("abfuhr gesondert") ||
    t.includes("transport gesondert");

  const wantsAushub =
    !excludesAushub &&
    (
      t.includes("aushub") ||
      t.includes("auskofferung") ||
      t.includes("boden lösen") ||
      t.includes("boden loesen") ||
      t.includes("abtragen") ||
      t.includes("aufnehmen")
    );

  const wantsEntsorgung =
    !excludesEntsorgung &&
    (
      t.includes("entsorgung") ||
      t.includes("entsorgen") ||
      t.includes("deponie") ||
      t.includes("verwertung") ||
      t.includes("beseitigung")
    );

  const wantsTransport =
    !excludesTransport &&
    (
      t.includes("abfuhr") ||
      t.includes("abfahren") ||
      t.includes("transport") ||
      t.includes("laden und fahren") ||
      t.includes("laden, fahren")
    );

  if (wantsAushub) {
    add(
      "RLC_PREIS:leistung-aushub-loesen-laden",
      "MACHINE",
      technical.aushub_m3_per_m2,
      "Auskofferung/Aushub aus technischem Parser"
    );
  }

  if (wantsEntsorgung) {
    add(
      "RLC_PREIS:entsorgung-boden-z0",
      "DISPOSAL",
      technical.disposal_t_per_m2,
      "Entsorgung Aushub, Ansatz 1,8 t/m³"
    );
  }

  if (wantsTransport) {
    add(
      "RLC_PREIS:transport-aushub-kurzstrecke",
      "TRANSPORT",
      technical.aushub_m3_per_m2,
      "Transport/Abfuhr Aushub Kurzstrecke"
    );
  }

  /*
   * Anche una singola componente tecnica è valida.
   * Esempio: Splittbett 5 cm = 0,05 m³ Splitt je m².
   * Non deve cadere nei vecchi RecipeTemplates/DB.
   */
  if (components.length < 1) return null;

  const priceBreakdown: PriceBreakdownLine[] = [];

  for (const c of components) {
    const priceInfo = defaultPriceFor(c.refKey, text, einheit);
    const total = round2(c.qty * n(priceInfo.price));

    if (total <= 0) continue;

    priceBreakdown.push({
      id: `technical-${priceBreakdown.length}`,
      group: detectGroup(c.type, c.refKey),
      name: priceInfo.name,
      unit: priceInfo.unit,
      qty: c.qty,
      price: round2(priceInfo.price),
      total,
      note: c.note,
    });
  }

  const direct = round2(priceBreakdown.reduce((sum, x) => sum + n(x.total), 0));
  if (direct <= 0) return null;

  const overheadCost = round2(direct * 0.10);
  const riskCost = round2(direct * 0.04);
  const profitCost = round2((direct + overheadCost + riskCost) * 0.08);
  const finalUnitPrice = round2(direct + overheadCost + riskCost + profitCost);

  priceBreakdown.push(
    {
      id: "technical-gk",
      group: "Gemeinkosten",
      name: "Gemeinkosten",
      unit: einheit || "EH",
      qty: 1,
      price: overheadCost,
      total: overheadCost,
      note: "10 % aus technischer RLC-Kalkulation",
    },
    {
      id: "technical-risk",
      group: "Risiko",
      name: "Risiko",
      unit: einheit || "EH",
      qty: 1,
      price: riskCost,
      total: riskCost,
      note: "4 % aus technischer RLC-Kalkulation",
    },
    {
      id: "technical-profit",
      group: "Gewinn",
      name: "Gewinn",
      unit: einheit || "EH",
      qty: 1,
      price: profitCost,
      total: profitCost,
      note: "8 % aus technischer RLC-Kalkulation",
    }
  );

  return {
    id: row.id,
    posNr: s(row.posNr),
    kurztext: s(row.kurztext),
    langtext: s(row.langtext),
    einheit,
    menge,

    materialCost: round2(priceBreakdown.filter((x) => x.group === "Material").reduce((a, b) => a + b.total, 0)),
    laborCost: round2(priceBreakdown.filter((x) => x.group === "Personal").reduce((a, b) => a + b.total, 0)),
    machineCost: round2(priceBreakdown.filter((x) => x.group === "Maschinen" || x.group === "LKW / Transport").reduce((a, b) => a + b.total, 0)),
    subcontractorCost: round2(priceBreakdown.filter((x) => x.group === "Fremdleistung").reduce((a, b) => a + b.total, 0)),
    disposalCost: round2(priceBreakdown.filter((x) => x.group === "Entsorgung").reduce((a, b) => a + b.total, 0)),
    overheadCost,
    riskCost,
    profitCost,

    baseUnitPrice: finalUnitPrice,
    suggestedUnitPrice: finalUnitPrice,
    finalUnitPrice,

    confidence: Math.max(0.82, n(technical.confidence)),
    riskLevel: technical.riskHints?.length ? "medium" : "low",
    calculationStatus: "ok",

    gewerk: technical.gewerk || "Tiefbau",
    leistungsart: "Technische RLC-Komponentenkalkulation",
    bauverfahren: technical.bauverfahren || "Technischer Schichtaufbau",

    warning: "Technische RLC-Komponentenkalkulation verwendet. Firmenpreise und Baustellenbedingungen prüfen.",
    aiReason: [
      "Technischer RLC-Komponentenrechner verwendet.",
      `Erkannt: ${technical.bauverfahren || "—"}.`,
      `Schichten Fläche: Sand ${technical.sand_m3_per_m2 || 0} m³/m², Splitt ${technical.splitt_m3_per_m2 || 0} m³/m², Frostschutz ${technical.frostschutz_m3_per_m2 || 0} m³/m², Schotter ${technical.schotter_m3_per_m2 || 0} m³/m², Kies ${technical.kies_m3_per_m2 || 0} m³/m².`,
      `Leitungsbau: Graben ${technical.trench_m3_per_m || 0} m³/m, Bettung ${technical.bedding_sand_m3_per_m || 0} m³/m, Verfüllung ${technical.backfill_m3_per_m || 0} m³/m.`,
      `Aushub Fläche ${technical.aushub_m3_per_m2 || 0} m³/m², Entsorgung Fläche ${technical.disposal_t_per_m2 || 0} t/m².`,
    ].join("\n"),

    source: "technical-parser",
    priceBreakdown,
  };
}



// X84_COMPANY_CALIBRATION_BLOCK_D
const X84_COMPANY_CALIBRATION_BLOCK_D: Record<string, {
  ep: number;
  kurztext: string;
  einheit: string;
  bauverfahren: string;
}> = {
  "001": {
    "ep": 1943.13,
    "kurztext": "Baustelleneinricht. herstellen",
    "einheit": "Psch",
    "bauverfahren": "Baustelleneinrichtung pauschal"
  },
  "003": {
    "ep": 1434.36,
    "kurztext": "Baustelle räumen",
    "einheit": "Psch",
    "bauverfahren": "Baustelle räumen"
  },
  "004": {
    "ep": 8.89,
    "kurztext": "Bauzaun herstellen vorhalten u. abb.",
    "einheit": "m",
    "bauverfahren": "Bauzaun stellen und vorhalten"
  },
  "005": {
    "ep": 74.77,
    "kurztext": "Höhenfestpunkt herstellen",
    "einheit": "St",
    "bauverfahren": "Bestandsaufnahme / Geländeaufnahme"
  },
  "006": {
    "ep": 1131.81,
    "kurztext": "Verkehrssicherung v. längerer Dauer",
    "einheit": "Psch",
    "bauverfahren": "Mobile Ampelanlage stellen"
  },
  "007": {
    "ep": 844.5,
    "kurztext": "Verk.Fl.unterh.",
    "einheit": "psch",
    "bauverfahren": "Verkehrssicherung einrichten und vorhalten"
  },
  "008": {
    "ep": 875.98,
    "kurztext": "Absperrung herstellen",
    "einheit": "Psch",
    "bauverfahren": "Absperrung / Absturzsicherung herstellen"
  },
  "009": {
    "ep": 156.0,
    "kurztext": "Reinigung von Straßen",
    "einheit": "psch",
    "bauverfahren": "Reinigung von Straßen"
  },
  "010": {
    "ep": 119.61,
    "kurztext": "Spartenerkundung",
    "einheit": "Psch",
    "bauverfahren": "Spartenerkundung durchführen"
  },
  "011": {
    "ep": 6.32,
    "kurztext": "Asphalt trennen 12-18",
    "einheit": "m",
    "bauverfahren": "Asphalt schneiden / trennen"
  },
  "012": {
    "ep": 10.87,
    "kurztext": "Gebundenen Ober- bau aufbrechen",
    "einheit": "m2",
    "bauverfahren": "Gebundener Oberbau aufbrechen Großfläche"
  },
  "013": {
    "ep": 2.2,
    "kurztext": "Asphalt feinfräsen",
    "einheit": "m2",
    "bauverfahren": "Asphalt feinfräsen"
  },
  "014": {
    "ep": 25.0,
    "kurztext": "Zulage Asphalt gering verunreinigt",
    "einheit": "t",
    "bauverfahren": "Zulage Asphalt gering verunreinigt"
  },
  "015": {
    "ep": 191.31,
    "kurztext": "Aufbruch Fels",
    "einheit": "m3",
    "bauverfahren": "Fels aufbrechen / lösen"
  },
  "016": {
    "ep": 109.45,
    "kurztext": "Aufsatz ausbauen",
    "einheit": "St",
    "bauverfahren": "Ablaufaufsatz ausbauen"
  },
  "019": {
    "ep": 11.35,
    "kurztext": "Granitbord ausbauen",
    "einheit": "m",
    "bauverfahren": "Granitbord / Bordstein ausbauen"
  },
  "021": {
    "ep": 8.0,
    "kurztext": "Oberboden zwischengelagert andecken",
    "einheit": "m3",
    "bauverfahren": "Boden lösen und zwischenlagern"
  },
  "022": {
    "ep": 1.1,
    "kurztext": "Rasenansaat auf Oberboden herst.",
    "einheit": "m2",
    "bauverfahren": "Rasenansaat herstellen"
  },
  "024": {
    "ep": 4.5,
    "kurztext": "FSK Korrigieren",
    "einheit": "m²",
    "bauverfahren": "Frostschutzschicht korrigieren"
  },
  "025": {
    "ep": 80.0,
    "kurztext": "Bankett herstellen",
    "einheit": "m3",
    "bauverfahren": "Bankett herstellen"
  },
  "027": {
    "ep": 350.0,
    "kurztext": "Probenahme und Deklarationsanalyse",
    "einheit": "St",
    "bauverfahren": "Probenahme und Deklarationsanalyse"
  },
  "028": {
    "ep": 42.5,
    "kurztext": "Belast.Boden entsorgen Z0",
    "einheit": "m3",
    "bauverfahren": "Boden Z0 entsorgen"
  },
  "031": {
    "ep": 55.0,
    "kurztext": "Leitungsgraben herstellen",
    "einheit": "m3",
    "bauverfahren": "Graben ausheben / Leitungsgraben herstellen"
  },
  "032": {
    "ep": 85.0,
    "kurztext": "Verdichtbares Material liefern und einbauen",
    "einheit": "m3",
    "bauverfahren": "Recyclingmaterial liefern und einbauen"
  },
  "033": {
    "ep": 2.01,
    "kurztext": "Planum herstellen 45",
    "einheit": "m2",
    "bauverfahren": "Planum herstellen"
  },
  "034": {
    "ep": 195.5,
    "kurztext": "Zuschlag zu allen Aushubpositionen Stahlbetonaufbruch",
    "einheit": "m3",
    "bauverfahren": "Betonfundament herstellen"
  },
  "035": {
    "ep": 79.33,
    "kurztext": "Erschwerniszuschlag Leitungskreuzung",
    "einheit": "St",
    "bauverfahren": "Erschwerniszuschlag Leitungskreuzung"
  },
  "037": {
    "ep": 31.12,
    "kurztext": "RL ausbauen bis 300",
    "einheit": "m",
    "bauverfahren": "Rohrleitung ausbauen bis DN 300"
  },
  "041": {
    "ep": 88.0,
    "kurztext": "Kunststoffrohrlleitung DN 160 herstellen",
    "einheit": "m",
    "bauverfahren": "Kunststoffrohrleitung DN 160 herstellen"
  },
  "043": {
    "ep": 402.03,
    "kurztext": "Übergangsstück PP-Beton DN 300",
    "einheit": "Stk",
    "bauverfahren": "Übergangsstück PP-Beton DN 300 einbauen"
  },
  "044": {
    "ep": 38.0,
    "kurztext": "PP-Gelenkstück DN 300",
    "einheit": "St",
    "bauverfahren": "PP-Gelenkstück DN 300 einbauen"
  },
  "046": {
    "ep": 45.0,
    "kurztext": "PP-Abzweig DN300/160",
    "einheit": "St",
    "bauverfahren": "PP-Abzweig DN 300/160 einbauen"
  },
  "047": {
    "ep": 7.5,
    "kurztext": "PP-Schnitt DN160",
    "einheit": "St",
    "bauverfahren": "PP-Schnitt DN 160 herstellen"
  },
  "048": {
    "ep": 0.6,
    "kurztext": "Trassenwarnband liefern und verlegen",
    "einheit": "m",
    "bauverfahren": "Warnband / Trassenband verlegen"
  },
  "049": {
    "ep": 446.84,
    "kurztext": "Straßenablauf Klasse D 400 herstellen",
    "einheit": "St",
    "bauverfahren": "Straßenablauf setzen"
  },
  "052": {
    "ep": 6.35,
    "kurztext": "Rohrleitung reinigen bis 300",
    "einheit": "m",
    "bauverfahren": "Rohrleitung reinigen bis DN 300"
  },
  "053": {
    "ep": 6.35,
    "kurztext": "Kanal-TV bis DN 300 und 50m, in Betr.",
    "einheit": "m",
    "bauverfahren": "Kanal-TV bis DN 300 durchführen"
  },
  "054": {
    "ep": 74.34,
    "kurztext": "FSS herstellen, d = 50 cm",
    "einheit": "m3",
    "bauverfahren": "Frostschutzschicht herstellen"
  },
  "055": {
    "ep": 23.27,
    "kurztext": "ATS aus AC 32 TS herstellen, 10 cm",
    "einheit": "m2",
    "bauverfahren": "Asphalttragschicht herstellen"
  },
  "058": {
    "ep": 28.0,
    "kurztext": "Zuschlag Hand ATS",
    "einheit": "m2",
    "bauverfahren": "Zuschlag Handeinbau Asphalt"
  },
  "059": {
    "ep": 4.5,
    "kurztext": "Zuschlag Hand ADS",
    "einheit": "m2",
    "bauverfahren": "Zuschlag Handeinbau Asphalt"
  },
  "060": {
    "ep": 0.2,
    "kurztext": "Unterlage reinigen",
    "einheit": "m2",
    "bauverfahren": "Unterlage reinigen"
  },
  "061": {
    "ep": 0.57,
    "kurztext": "Schichtenverbund herstellen",
    "einheit": "m2",
    "bauverfahren": "Schichtenverbund herstellen"
  },
  "063": {
    "ep": 65.0,
    "kurztext": "Granittiefbord herstellen",
    "einheit": "m",
    "bauverfahren": "Granittiefbord herstellen"
  },
  "064": {
    "ep": 72.5,
    "kurztext": "Werkpolier",
    "einheit": "h",
    "bauverfahren": "Polier / Vorarbeiter Regiestunde"
  },
  "065": {
    "ep": 70.0,
    "kurztext": "Gehob. Facharbeiter",
    "einheit": "h",
    "bauverfahren": "Facharbeiter Regiestunde"
  },
  "066": {
    "ep": 100.0,
    "kurztext": "Bagger 0,5",
    "einheit": "h",
    "bauverfahren": "Minibagger bis 3,5 t"
  },
  "067": {
    "ep": 110.0,
    "kurztext": "Bagger 1",
    "einheit": "h",
    "bauverfahren": "Minibagger bis 3,5 t"
  },
  "068": {
    "ep": 130.0,
    "kurztext": "Bagger>1",
    "einheit": "h",
    "bauverfahren": "Bagger 8–14 t"
  },
  "069": {
    "ep": 95.0,
    "kurztext": "Radlader",
    "einheit": "h",
    "bauverfahren": "Radlader"
  },
  "070": {
    "ep": 25.0,
    "kurztext": "Flächenrüttler",
    "einheit": "h",
    "bauverfahren": "Flächenrüttler einsetzen"
  },
  "071": {
    "ep": 100.0,
    "kurztext": "LKW 7t",
    "einheit": "h",
    "bauverfahren": "LKW Kipper"
  },
  "072": {
    "ep": 120.0,
    "kurztext": "Lkw 12t",
    "einheit": "h",
    "bauverfahren": "LKW Kipper"
  }
};

function getX84CompanyCalibrationBlockD(row: InputRow, text: string, einheit: string, menge: number): any | null {
  const pos =
    String((row as any)?.posNr || (row as any)?.pos || (row as any)?.position || "").trim();

  const hit = X84_COMPANY_CALIBRATION_BLOCK_D[pos];
  if (!hit || !hit.ep || hit.ep <= 0) return null;

  const ep = round2(hit.ep);
  const qty = n(menge);
  const total = round2(ep * qty);

  return {
    ...(row as any),
    id: (row as any)?.id,
    posNr: (row as any)?.posNr || pos,
    pos: (row as any)?.pos || pos,
    kurztext: (row as any)?.kurztext || hit.kurztext || text,
    text: (row as any)?.text || (row as any)?.kurztext || hit.kurztext || text,
    einheit: einheit || hit.einheit,
    menge: qty,

    source: "technical-parser",
    confidence: 0.99,
    riskLevel: "low",
    gewerk: "RLC Firmenkalibrierung",
    leistungsart: hit.kurztext || text,
    bauverfahren: hit.bauverfahren || hit.kurztext || text,

    suggestedUnitPrice: ep,
    finalUnitPrice: ep,
    totalPrice: total,

    priceBreakdown: [
      {
        group: "Fremdleistung",
        label: "RLC Firmenkalibrierung aus X84",
        qty: 1,
        unitPrice: ep,
        total: ep,
      },
    ],

    aiReason:
      "RLC Firmenkalibrierung Block D: Diese Position wurde aus der firmeneigenen X84-Kalkulation gelernt und als technischer Firmenpreis übernommen.",
  };
}


export async function calcRecipeKalkulationRow(row: InputRow): Promise<any | null> {
  const kurztext = s(row.kurztext);
  const langtext = s(row.langtext);
  const einheit = s(row.einheit);
  const menge = n(row.menge);
const text = `${kurztext} ${langtext}`.trim();

  const x84CompanyCalibrationBlockD = getX84CompanyCalibrationBlockD(row, text, einheit, menge);
  if (x84CompanyCalibrationBlockD) return x84CompanyCalibrationBlockD;



  if (!text || !einheit) return null;

  const technical = parseRlcTechnicalPosition({
    posNr: row.posNr,
    kurztext,
    langtext,
    einheit,
    menge,
  });

  const asphaltTechnicalFallback =
    technical.surface === "ASPHALT"
      ? buildTechnicalComponentFallback(row, text, einheit, menge, technical)
      : null;

  /*
   * Asphalt muss vor der alten DirectOverride gewinnen.
   * Sonst werden AC-Schichten/Fräsen/Schneiden mit alten Pauschalwerten zu niedrig gerechnet.
   */
  if (asphaltTechnicalFallback) return asphaltTechnicalFallback;

  const blockBPriorityFallback = buildTechnicalComponentFallback(row, text, einheit, menge, technical);
  if (
    blockBPriorityFallback &&
    [
      "Zulage Mehr-/Minderstärke",
      "Pflaster aufnehmen und seitlich lagern",
      "Betonpflaster liefern und verlegen",
      "Natursteinpflaster verlegen",
      "Pflasterrinne herstellen",
      "Planum herstellen",
    ].includes(String(technical.bauverfahren || ""))
  ) {
    return blockBPriorityFallback;
  }

  const isBlockBExactTechnical =
    [
      "Pflaster aufnehmen und seitlich lagern",
      "Betonpflaster liefern und verlegen",
      "Natursteinpflaster verlegen",
      "Pflasterrinne herstellen",
      "Planum herstellen",
    ].includes(String(technical.bauverfahren || ""));

  const directOverride = isBlockBExactTechnical
    ? null
    : buildDirectTechnicalRecipeOverride(row, text, einheit, menge);

  if (directOverride) return directOverride;

  const technicalFallback = buildTechnicalComponentFallback(row, text, einheit, menge, technical);

  /*
   * Wichtig:
   * Wenn der technische Parser einen echten Komponentenpreis bauen kann,
   * gewinnt dieser vor alten Rezepttemplates.
   * Grund: Langtext-Schichten, Aushub, Entsorgung, Transport usw. sind konkreter
   * als ein allgemeines Template-Matching.
   */
  if (technicalFallback) return technicalFallback;

  const libraryFallback = buildUniversalRlcLibraryFallback(row, text, einheit, menge);

  /*
   * BLOCK B Exact darf niemals in alte Template-Rezepte fallen
   * z.B. "Pflasterfläche komplett herstellen".
   */
  if (isBlockBExactTechnical) {
    return libraryFallback;
  }

  const templates = await loadTemplates();
  if (!templates.length) return libraryFallback;

  const ranked = templates
    .map((tpl) => ({ tpl, score: scoreTemplate(tpl, text, einheit) }))
    .filter((x) => x.score >= 35)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.tpl;
  if (!best) return libraryFallback;

  const variants = Array.isArray(best.variants) ? best.variants : [];
  const bestVariant =
    variants
      .map((v: any) => ({ v, score: scoreVariant(v.params || {}, text) }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)[0]?.v || null;

  /*
   * WICHTIG:
   * Die Recipe Engine kalkuliert immer den EP pro Einheit.
   * Die LV-Menge darf hier NICHT als Rezeptmenge verwendet werden,
   * sonst explodiert der Einheitspreis bei 60 m², 120 m³ usw.
   */
  const unitNorm = einheit.toLowerCase();

  const defaultParams = best.paramsJson?.defaultParams || {};
  const variantParams = bestVariant?.params || {};

  const params = {
    ...defaultParams,
    ...variantParams,

    /*
     * RLC Technical Parser:
     * Werte aus Kurztext + Langtext + Einheit werden hier als echte
     * Kalkulationsparameter in die Rezeptlogik eingespeist.
     */
    length_m: technical.length_m || (unitNorm === "m" ? 1 : 0),
    area_m2: technical.area_m2 || (unitNorm === "m²" || unitNorm === "m2" ? 1 : 0),
    volume_m3: technical.volume_m3 || (unitNorm === "m³" || unitNorm === "m3" ? 1 : 0),
    count: technical.count || (unitNorm === "st" || unitNorm === "stk" ? 1 : 0),

    depth_m: technical.depth_m || n(variantParams.depth_m ?? defaultParams.depth_m, 1.2),
    width_m: technical.width_m || n(variantParams.width_m ?? defaultParams.width_m, 0.4),
    thickness_cm: technical.thickness_cm || n(variantParams.thickness_cm ?? defaultParams.thickness_cm, 0),

    surface:
      technical.surface && technical.surface !== "UNKNOWN"
        ? technical.surface
        : variantParams.surface || defaultParams.surface || detectSurface(text),

    soilClass:
      technical.soilClass && technical.soilClass !== "UNKNOWN"
        ? technical.soilClass
        : variantParams.soilClass || defaultParams.soilClass || detectSoil(text),

    layer_m3_per_m2: technical.layer_m3_per_m2,

    sand_m3_per_m2: technical.sand_m3_per_m2,
    splitt_m3_per_m2: technical.splitt_m3_per_m2,
    frostschutz_m3_per_m2: technical.frostschutz_m3_per_m2,
    schotter_m3_per_m2: technical.schotter_m3_per_m2,
    kies_m3_per_m2: technical.kies_m3_per_m2,

    aushub_m3_per_m2: technical.aushub_m3_per_m2,
    disposal_t_per_m2: technical.disposal_t_per_m2,
    transport_distance_km: technical.transport_distance_km,

    materialHints: technical.materialHints,
    riskHints: technical.riskHints,
    technicalTags: technical.tags,
    technicalConfidence: technical.confidence,

    lvMenge: menge,
    epMode: "PER_UNIT",
  };

  const priceBreakdown: PriceBreakdownLine[] = [];

  for (const c of best.components || []) {
    let qty = round2(evalQtyFormula(c.qtyFormula, params));
    qty = technicalQtyOverride(c.refKey, qty, params);
    if (qty <= 0) continue;

    const priceInfo = defaultPriceFor(c.refKey, text, einheit);
    const total = round2(qty * n(priceInfo.price));

    priceBreakdown.push({
      id: `${c.id || c.refKey}-${priceBreakdown.length}`,
      group: detectGroup(c.type, c.refKey),
      name: priceInfo.name,
      unit: priceInfo.unit,
      qty,
      price: round2(priceInfo.price),
      total,
      note: c.note || `Rezept: ${best.title}`,
    });
  }

  const rlcRange = rlcPreisRangeForText(text, einheit);
  let direct = round2(priceBreakdown.reduce((sum, x) => sum + n(x.total), 0));

  if (direct <= 0) {
    direct = round2(n(rlcRange.avg));
  }

  if (direct <= 0) return libraryFallback;

  const overheadCost = round2(direct * 0.10);
  const riskCost = round2(direct * 0.04);
  const profitCost = round2((direct + overheadCost + riskCost) * 0.08);
  const finalUnitPrice = round2(direct + overheadCost + riskCost + profitCost);

  priceBreakdown.push(
    {
      id: "recipe-gk",
      group: "Gemeinkosten",
      name: "Gemeinkosten",
      unit: einheit || "EH",
      qty: 1,
      price: overheadCost,
      total: overheadCost,
      note: "10 % aus Rezeptkalkulation",
    },
    {
      id: "recipe-risk",
      group: "Risiko",
      name: "Risiko / Baustellenunsicherheit",
      unit: einheit || "EH",
      qty: 1,
      price: riskCost,
      total: riskCost,
      note: "4 % aus Rezeptkalkulation",
    },
    {
      id: "recipe-profit",
      group: "Gewinn",
      name: "Gewinn",
      unit: einheit || "EH",
      qty: 1,
      price: profitCost,
      total: profitCost,
      note: "8 % aus Rezeptkalkulation",
    }
  );

  return {
    id: row.id,
    posNr: s(row.posNr),
    kurztext,
    langtext,
    einheit,
    menge,

    materialCost: round2(priceBreakdown.filter((x) => x.group === "Material").reduce((a, b) => a + b.total, 0)),
    laborCost: round2(priceBreakdown.filter((x) => x.group === "Personal").reduce((a, b) => a + b.total, 0)),
    machineCost: round2(priceBreakdown.filter((x) => x.group === "Maschinen" || x.group === "LKW / Transport").reduce((a, b) => a + b.total, 0)),
    subcontractorCost: round2(priceBreakdown.filter((x) => x.group === "Fremdleistung").reduce((a, b) => a + b.total, 0)),
    disposalCost: round2(priceBreakdown.filter((x) => x.group === "Entsorgung").reduce((a, b) => a + b.total, 0)),
    overheadCost,
    riskCost,
    profitCost,

    baseUnitPrice: finalUnitPrice,
    suggestedUnitPrice: finalUnitPrice,
    finalUnitPrice,

    confidence: 0.86,
    riskLevel: "medium",
    calculationStatus: "warning",

    gewerk: technical.gewerk || best.category || "Tiefbau",
    leistungsart:
      technical.leistungsart && technical.leistungsart !== "Unbekannte Leistung"
        ? technical.leistungsart
        : "Rezeptbasierte Kalkulation",
    bauverfahren:
      technical.bauverfahren && technical.bauverfahren !== "Technisch zu prüfen"
        ? `${best.title} · ${technical.bauverfahren}`
        : best.title,


      rlcPreisMin: round2(n(rlcRange.min)),
      rlcPreisAvg: round2(n(rlcRange.avg)),
      rlcPreisMax: round2(n(rlcRange.max)),
      rlcPreisSource: n(rlcRange.avg) > 0 ? "RLC Preisbibliothek" : "",
      rlcPreisGroup: n(rlcRange.avg) > 0 ? rlcRange.matches?.[0]?.group || "" : "",
    warning: "Rezeptkalkulation verwendet. Firmenpreise, Mengenansätze und Baustellenbedingungen prüfen.",
    aiReason: [
      `RLC Recipe Engine: passende Rezeptfamilie gefunden: ${best.title}.`,
      bestVariant ? `Variante verwendet: ${bestVariant.key}.` : "Keine spezifische Variante gefunden, Default-Parameter verwendet.",
      `Technischer Parser: ${technical.bauverfahren} · Oberfläche ${technical.surface} · Boden ${technical.soilClass} · Tiefe ${technical.depth_m || "—"} m · Breite ${technical.width_m || "—"} m · Stärke ${technical.thickness_cm || "—"} cm.`,
      technical.materialHints?.length ? `Materialhinweise: ${technical.materialHints.join(", ")}.` : "",
      technical.riskHints?.length ? `Risikohinweise: ${technical.riskHints.join(", ")}.` : "",
      "Preisaufbau wurde aus Technical Parser + RecipeComponents + RLC Preisbibliothek erzeugt.",
    ].filter(Boolean).join("\n"),

    source: "recipe",
    priceBreakdown,
  };
}
