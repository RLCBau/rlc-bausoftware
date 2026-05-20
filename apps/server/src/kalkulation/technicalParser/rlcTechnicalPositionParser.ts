// apps/server/src/kalkulation/technicalParser/rlcTechnicalPositionParser.ts

export type RlcSurfaceType =
  | "ASPHALT"
  | "PFLASTER"
  | "RASENGITTER"
  | "BETON"
  | "SCHOTTER"
  | "RASEN"
  | "UNBEFESTIGT"
  | "UNKNOWN";

export type RlcSoilClass =
  | "BK3"
  | "BK4"
  | "BK5"
  | "BK6"
  | "FELS"
  | "NASS"
  | "KONTAMINIERT"
  | "BESTAND"
  | "UNKNOWN";

export type RlcTechnicalParseResult = {
  gewerk: string;
  leistungsart: string;
  bauverfahren: string;

  surface: RlcSurfaceType;
  soilClass: RlcSoilClass;

  length_m: number;
  area_m2: number;
  volume_m3: number;
  count: number;

  depth_m: number;
  width_m: number;
  thickness_cm: number;

  layer_m3_per_m2: number;

  sand_m3_per_m2: number;
  splitt_m3_per_m2: number;
  frostschutz_m3_per_m2: number;
  schotter_m3_per_m2: number;
  kies_m3_per_m2: number;

  aushub_m3_per_m2: number;
  disposal_t_per_m2: number;

  trench_m3_per_m: number;
  bedding_sand_m3_per_m: number;
  backfill_m3_per_m: number;
  surface_m2_per_m: number;

  transport_distance_km: number;

  materialHints: string[];
  riskHints: string[];
  tags: string[];

  confidence: number;
};

function n(value: any, fallback = 0): number {
  const x = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : fallback;
}

function round2(value: number): number {
  return Math.round((n(value) + Number.EPSILON) * 100) / 100;
}

function norm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normUnit(value: any): string {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw === "m²" || raw === "m2" || raw === "qm" || raw === "m^2") return "m2";
  if (raw === "m³" || raw === "m3" || raw === "cbm" || raw === "m^3") return "m3";
  if (raw === "st" || raw === "stk" || raw === "stck" || raw === "stück" || raw === "stueck") return "st";

  return norm(raw);
}

function extractFirstMeter(text: string): number {
  const t = norm(text);
  const m = t.match(/(\d+(?:[,.]\d+)?)\s*m\b/);
  return m?.[1] ? n(m[1]) : 0;
}

function extractDepth(text: string): number {
  const t = norm(text);

  const explicit = t.match(/(?:tiefe|tief|grabentiefe|verlegetiefe)\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*m/);
  if (explicit?.[1]) return n(explicit[1]);

  const after = t.match(/(\d+(?:[,.]\d+)?)\s*m\s*(?:tiefe|tief|grabentiefe|verlegetiefe)/);
  if (after?.[1]) return n(after[1]);

  if (t.includes("1 20") || t.includes("120 cm")) return 1.2;
  if (t.includes("1 50") || t.includes("150 cm")) return 1.5;
  if (t.includes("2 00") || t.includes("200 cm")) return 2.0;

  return 0;
}

function extractWidth(text: string): number {
  const t = norm(text);

  const explicit = t.match(/(?:breite|grabenbreite)\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*m/);
  if (explicit?.[1]) return n(explicit[1]);

  const after = t.match(/(\d+(?:[,.]\d+)?)\s*m\s*(?:breite|grabenbreite)/);
  if (after?.[1]) return n(after[1]);

  return 0;
}

function extractThicknessCm(text: string): number {
  const t = norm(text);

  const m = t.match(/(\d+(?:[,.]\d+)?)\s*cm/);
  if (m?.[1]) return n(m[1]);

  return 0;
}

function extractTransportKm(text: string): number {
  const t = norm(text);

  const km = t.match(/(?:bis|ca\.?)?\s*(\d+(?:[,.]\d+)?)\s*km/);
  if (km?.[1]) return n(km[1]);

  return 0;
}

function detectSurface(text: string): RlcSurfaceType {
  const t = norm(text);

  if (t.includes("rasengitter")) return "RASENGITTER";
  if (t.includes("pflaster") || t.includes("verbundstein") || t.includes("betonstein")) return "PFLASTER";
  if (t.includes("asphalt") || t.includes("bitumen") || t.includes("ac 11") || t.includes("ac11")) return "ASPHALT";
  if (t.includes("beton")) return "BETON";
  if (t.includes("schotter") || t.includes("kies")) return "SCHOTTER";
  if (t.includes("rasen") || t.includes("gruenflaeche") || t.includes("grünfläche")) return "RASEN";
  if (t.includes("unbefestigt")) return "UNBEFESTIGT";

  return "UNKNOWN";
}

function detectSoilClass(text: string): RlcSoilClass {
  const t = norm(text);

  if (t.includes("fels")) return "FELS";
  if (t.includes("nass") || t.includes("grundwasser")) return "NASS";
  if (t.includes("kontaminiert") || t.includes("belastet") || t.includes("pak")) return "KONTAMINIERT";
  if (t.includes("bestand") || t.includes("querung") || t.includes("leitungskreuzung")) return "BESTAND";
  if (t.includes("bodenklasse 3") || t.includes("bk3")) return "BK3";
  if (t.includes("bodenklasse 4") || t.includes("bk4")) return "BK4";
  if (t.includes("bodenklasse 5") || t.includes("bk5")) return "BK5";
  if (t.includes("bodenklasse 6") || t.includes("bk6")) return "BK6";

  return "BK4";
}

function detectMaterialHints(text: string): string[] {
  const t = norm(text);
  const out: string[] = [];

  if (t.includes("frostschutz")) out.push("frostschutz");
  if (t.includes("splitt")) out.push("splitt");
  if (t.includes("sandbett") || t.includes("sand")) out.push("sand");
  if (t.includes("schotter")) out.push("schotter");
  if (t.includes("kies")) out.push("kies");
  if (t.includes("rasengitter")) out.push("rasengitter");
  if (t.includes("pflaster")) out.push("pflaster");
  if (t.includes("asphalt")) out.push("asphalt");

  if (t.includes("speedpipe") || t.includes("mikroduct") || t.includes("mikror") || t.includes("microrohr")) out.push("speedpipe");
  if (t.includes("kabelschutzrohr") || t.includes("schutzrohr")) out.push("kabelschutzrohr");
  if (t.includes("warnband") || t.includes("trassenband")) out.push("warnband");

  if (t.includes("bordstein") || t.includes("randstein") || t.includes("tiefbord") || t.includes("hochbord") || t.includes("leistenstein")) out.push("bordstein");
  if (t.includes("rinne") || t.includes("entwaesserungsrinne") || t.includes("entwässerungsrinne") || t.includes("ablaufrinne")) out.push("rinne");
  if (t.includes("strassenablauf") || t.includes("straßenablauf") || t.includes("sinkkasten") || t.includes("gully")) out.push("strassenablauf");

  if (t.includes("kg rohr") || t.includes("kg/pvc") || t.includes("pvc rohr") || t.includes("kanal") || t.includes("abwasser") || t.includes("regenwasser") || t.includes("entwaesserungsleitung") || t.includes("entwässerungsleitung")) out.push("kg-rohr");
  if (t.includes("dn100") || t.includes("dn 100")) out.push("dn100");
  if (t.includes("dn125") || t.includes("dn 125")) out.push("dn125");
  if (t.includes("dn150") || t.includes("dn 150")) out.push("dn150");
  if (t.includes("dn200") || t.includes("dn 200")) out.push("dn200");

  if (t.includes("kontrollschacht") || t.includes("kanalschacht") || t.includes("betonschacht")) out.push("kontrollschacht");
  if (t.includes("schachtanschluss") || t.includes("rohranschluss") || t.includes("anschluss schacht")) out.push("schachtanschluss");
  if (t.includes("dichtheitsprüfung") || t.includes("dichtheitspruefung") || t.includes("kanalprüfung") || t.includes("kanalpruefung")) out.push("dichtheitspruefung");
  if (t.includes("kamerabefahrung") || t.includes("kanal tv") || t.includes("kanal-tv")) out.push("kamerabefahrung");

  if (t.includes("drainagerohr") || t.includes("drainage rohr") || t.includes("sickerleitung")) out.push("drainagerohr");
  if (t.includes("filterkies") || t.includes("sickerkies") || t.includes("drainagekies")) out.push("filterkies");
  if (t.includes("filtervlies") || t.includes("geotextil") || t.includes("vlies")) out.push("vlies");
  if (t.includes("sickerschicht") || t.includes("rigole")) out.push("sickerschicht");

  return Array.from(new Set(out));
}

function detectRiskHints(text: string): string[] {
  const t = norm(text);
  const out: string[] = [];

  if (t.includes("unter verkehr")) out.push("Arbeiten unter Verkehr");
  if (t.includes("innenstadt") || t.includes("beengt")) out.push("Beengte Baustelle");
  if (t.includes("bestand") || t.includes("leitung")) out.push("Bestandsleitungen beachten");
  if (t.includes("grundwasser") || t.includes("nass")) out.push("Wasserhaltung / nasser Boden");
  if (t.includes("kontaminiert") || t.includes("belastet")) out.push("Belasteter Boden / Entsorgung prüfen");

  return out;
}

function detectLeistungsart(text: string): { leistungsart: string; bauverfahren: string; gewerk: string } {
  const t = norm(text);
  const raw = String(text || "").toLowerCase();

  // X83_SEMANTIC_FIX_031_043_054_068
  if (t.includes("leitungsgraben herstellen")) {
    return {
      gewerk: "Erdarbeiten",
      leistungsart: "Leitungsgraben herstellen",
      bauverfahren: "Graben ausheben / Leitungsgraben herstellen",
    };
  }

  if (t.includes("übergangsstück") || t.includes("uebergangsstueck") || t.includes("pp-beton")) {
    return {
      gewerk: "Kanalbau / PP Formteile",
      leistungsart: "Übergangsstück PP-Beton einbauen",
      bauverfahren: "Übergangsstück PP-Beton DN 300 einbauen",
    };
  }

  // X84_TRAINING_BLOCK_A_RULES
  if (t.includes("baustelleneinricht") && t.includes("vorhalten")) {
    return {
      gewerk: "Baustelleneinrichtung",
      leistungsart: "Baustelleneinrichtung vorhalten",
      bauverfahren: "Baustelleneinrichtung vorhalten X84",
    };
  }

  if (
    (t.includes("straßenablauf") || t.includes("strassenablauf")) &&
    t.includes("fertigteil") &&
    (t.includes("ausb") || t.includes("ausbauen"))
  ) {
    return {
      gewerk: "Entwässerung / Straßenablauf",
      leistungsart: "Straßenablauf Fertigteil ausbauen",
      bauverfahren: "Straßenablauf Fertigteil ausbauen",
    };
  }

  // X84_TRAINING_BLOCK_B_PLANUM_FORCE
  if (
    t.includes("planum herstellen") ||
    t.includes("planie herstellen") ||
    t === "planum"
  ) {
    return {
      gewerk: "Straßenbau / Erdplanum",
      leistungsart: "Planum herstellen",
      bauverfahren: "Planum herstellen",
    };
  }

  if (t.includes("fss herstellen")) {
    return {
      gewerk: "Straßenbau / Frostschutz",
      leistungsart: "Frostschutzschicht herstellen",
      bauverfahren: "Frostschutzschicht herstellen",
    };
  }

  if (raw.includes("bagger>1") || raw.includes("bagger >1") || raw.includes("bagger&#x3e;1")) {
    return {
      gewerk: "Geräte",
      leistungsart: "Bagger 8–14 t",
      bauverfahren: "Bagger 8–14 t",
    };
  }


  // X83_MICRO_FIX_056_MEHR_MINDERSTAERKE
  if (
    t.includes("zulage") &&
    t.includes("mehr") &&
    t.includes("minder")
  ) {
    return {
      gewerk: "Straßenbau / Asphalt",
      leistungsart: "Zulage Mehr-/Minderstärke",
      bauverfahren: "Zulage Mehr-/Minderstärke",
    };
  }


  // X83_MICRO_FIX_026_BODEN_ZWISCHENLAGERN
  if (
    (t.includes("boden lösen") || t.includes("boden loesen")) &&
    t.includes("zwischenlagern")
  ) {
    return {
      gewerk: "Erdarbeiten",
      leistungsart: "Boden lösen und zwischenlagern",
      bauverfahren: "Boden lösen und zwischenlagern",
    };
  }


  // X83_MICRO_FIX_024_FSK
  if (t.includes("fsk") && (t.includes("korrigieren") || t.includes("korrig"))) {
    return {
      gewerk: "Straßenbau / Frostschutz",
      leistungsart: "Frostschutzschicht korrigieren",
      bauverfahren: "Frostschutzschicht korrigieren",
    };
  }


  // X83_REAL_FIX_3_SUPER_PRIORITY

  if (t.includes("fsk")) {
    return { gewerk: "Straßenbau / Frostschutz", leistungsart: "Frostschutzschicht korrigieren", bauverfahren: "Frostschutzschicht korrigieren" };
  }

  if (t.includes("boden") && (t.includes("zwischenlagern") || t.includes("zwischengelagert"))) {
    return { gewerk: "Erdarbeiten", leistungsart: "Boden lösen und zwischenlagern", bauverfahren: "Boden lösen und zwischenlagern" };
  }

  if (t.includes("überschiebmuffe") || t.includes("ueberschiebmuffe")) {
    return { gewerk: "Kanalbau / PP Formteile", leistungsart: "PP-Überschiebmuffe einbauen", bauverfahren: "PP-Überschiebmuffe DN 300 einbauen" };
  }

  if (t.includes("gelenkstück") || t.includes("gelenkstueck")) {
    return { gewerk: "Kanalbau / PP Formteile", leistungsart: "PP-Gelenkstück einbauen", bauverfahren: "PP-Gelenkstück DN 300 einbauen" };
  }

  if (t.includes("mehr") && t.includes("minder") && t.includes("stärke")) {
    return { gewerk: "Straßenbau / Asphalt", leistungsart: "Zulage Mehr-/Minderstärke", bauverfahren: "Zulage Mehr-/Minderstärke" };
  }

  if (t.includes("zuschlag hand ats") || t.includes("zuschlag hand ads")) {
    return {
      gewerk: "Straßenbau / Asphalt",
      leistungsart: "Zuschlag Handeinbau Asphalt",
      bauverfahren: "Zuschlag Handeinbau Asphalt",
    };
  }

  if (t.includes("bagger") && (t.includes(">1") || t.includes("größer 1") || t.includes("groesser 1"))) {
    return { gewerk: "Geräte", leistungsart: "Bagger 8–14 t", bauverfahren: "Bagger 8–14 t" };
  }


  // X83_REAL_FIX_2_EXACT_PRIORITY

  if (t.includes("fsk korrigieren")) {
    return { gewerk: "Straßenbau / Frostschutz", leistungsart: "Frostschutzschicht korrigieren", bauverfahren: "Frostschutzschicht korrigieren" };
  }

  if (t.includes("boden lösen und zwischenlagern") || t.includes("boden loesen und zwischenlagern")) {
    return { gewerk: "Erdarbeiten", leistungsart: "Boden lösen und zwischenlagern", bauverfahren: "Boden lösen und zwischenlagern" };
  }

  if (t.includes("pp-überschiebmuffe") || t.includes("pp-ueberschiebmuffe") || t.includes("überschiebmuffe")) {
    return { gewerk: "Kanalbau / PP Formteile", leistungsart: "PP-Überschiebmuffe einbauen", bauverfahren: "PP-Überschiebmuffe DN 300 einbauen" };
  }

  if (t.includes("pp-gelenkstück") || t.includes("pp-gelenkstueck")) {
    return { gewerk: "Kanalbau / PP Formteile", leistungsart: "PP-Gelenkstück einbauen", bauverfahren: "PP-Gelenkstück DN 300 einbauen" };
  }

  if (t.includes("erschwernisszuschlag anschluss") || t.includes("erschwerniszuschlag anschluss") || (t.includes("anschluss") && t.includes("best") && t.includes("schacht"))) {
    return { gewerk: "Kanalbau / Schachtanschluss", leistungsart: "Erschwerniszuschlag Anschluss Bestandsschacht", bauverfahren: "Erschwerniszuschlag Anschluss Bestandsschacht" };
  }

  if (t.includes("zulage mehr- minderstärke") || t.includes("zulage mehr- minderstärke") || t.includes("mehr-/minderstärke") || t.includes("mehr- minderstärke")) {
    return { gewerk: "Straßenbau / Asphalt", leistungsart: "Zulage Mehr-/Minderstärke", bauverfahren: "Zulage Mehr-/Minderstärke" };
  }

  if (t.includes("asphalt feinfräsen") || t.includes("asphalt feinfräsen") || t.includes("feinfräsen") || t.includes("feinfraesen")) {
    return { gewerk: "Straßenbau / Asphalt", leistungsart: "Asphalt feinfräsen", bauverfahren: "Asphalt feinfräsen" };
  }

  if (t.includes("leitungsgraben herstellen")) {
    return { gewerk: "Erdarbeiten", leistungsart: "Graben ausheben", bauverfahren: "Graben ausheben / Leitungsgraben herstellen" };
  }

  if (t.includes("erschwerniszuschlag leitungskreuzung") || t.includes("erschwernisszuschlag leitungskreuzung") || t.includes("leitungskreuzung")) {
    return { gewerk: "Erdarbeiten / Erschwernis", leistungsart: "Erschwerniszuschlag Leitungskreuzung", bauverfahren: "Erschwerniszuschlag Leitungskreuzung" };
  }

  if (t.includes("ats aus ac 32") || t.includes("ac 32 ts") || t.includes("asphalttragschicht")) {
    return { gewerk: "Straßenbau / Asphalt", leistungsart: "Asphalttragschicht herstellen", bauverfahren: "Asphalttragschicht herstellen" };
  }

  if (t.includes("bagger>1") || t.includes("bagger >1") || t.includes("bagger&#x3e;1") || t.includes("bagger größer 1") || t.includes("bagger groesser 1")) {
    return { gewerk: "Geräte", leistungsart: "Bagger 8–14 t", bauverfahren: "Bagger 8–14 t" };
  }


  // X83_REAL_FIX_1_PARSER

  if (t.includes("bauzaun")) return { gewerk: "Absperrung", leistungsart: "Bauzaun stellen", bauverfahren: "Bauzaun stellen und vorhalten" };
  if (t.includes("verk.fl.unterh") || t.includes("verkehrsfläche unterhalten") || t.includes("verkehrsflaeche unterhalten")) return { gewerk: "Verkehrssicherung", leistungsart: "Verkehrsfläche unterhalten", bauverfahren: "Verkehrssicherung einrichten und vorhalten" };
  if (t.includes("höhenfestpunkt") || t.includes("hoehenfestpunkt")) return { gewerk: "Vermessung", leistungsart: "Höhenfestpunkt herstellen", bauverfahren: "Bestandsaufnahme / Geländeaufnahme" };
  if (t.includes("verkehrssicherung") && t.includes("längerer")) return { gewerk: "Verkehrssicherung", leistungsart: "Verkehrssicherung", bauverfahren: "Verkehrssicherung einrichten und vorhalten" };

  if (t.includes("rasenansaat")) return { gewerk: "Straßenbau / Nebenflächen", leistungsart: "Rasenansaat herstellen", bauverfahren: "Rasenansaat herstellen" };
  if (t.includes("oberboden") && (t.includes("andecken") || t.includes("zwischengelagert"))) return { gewerk: "Erdarbeiten", leistungsart: "Oberboden andecken", bauverfahren: "Oberboden / Boden abtragen" };
  if (t.includes("handschacht")) return { gewerk: "Suchschachtung", leistungsart: "Handschachtung herstellen", bauverfahren: "Handschachtung herstellen" };
  // X83_SUCHSCHLITZ_PARSER
  if (t.includes("suchschlitz")) {
    return {
      gewerk: "Tiefbau / Erkundung",
      leistungsart: "Suchschlitz herstellen",
      bauverfahren: "Suchschlitz herstellen",
    };
  }
  if (t.includes("verdichtbares material")) return { gewerk: "Material Lieferung", leistungsart: "Verdichtbares Material liefern", bauverfahren: "Recyclingmaterial liefern und einbauen" };

  if (t.includes("boden entsorgen z0") || t.includes("belast.boden entsorgen z0") || t.includes("boden z0")) return { gewerk: "Entsorgung", leistungsart: "Boden Z0 entsorgen", bauverfahren: "Boden Z0 entsorgen" };
  if (t.includes("z 1.1") || t.includes("z1.1") || t.includes("boden z1")) return { gewerk: "Entsorgung", leistungsart: "Boden Z1 entsorgen", bauverfahren: "Boden Z1 entsorgen" };
  if (t.includes("z 1.2") || t.includes("z1.2") || t.includes("boden z2")) return { gewerk: "Entsorgung", leistungsart: "Boden Z2 entsorgen", bauverfahren: "Boden Z2 entsorgen" };

  if (t.includes("bagger 0,5") || t.includes("bagger 0.5") || t.includes("bagger 1")) return { gewerk: "Geräte", leistungsart: "Minibagger", bauverfahren: "Minibagger bis 3,5 t" };
  if (t.includes("bagger>1") || t.includes("bagger&#x3e;1") || t.includes("bagger >1") || t.includes("bagger größer 1")) return { gewerk: "Geräte", leistungsart: "Bagger 8–14 t", bauverfahren: "Bagger 8–14 t" };

  if (t.includes("reinigung von straßen") || t.includes("reinigung von strassen") || t.includes("straße reinigen") || t.includes("strasse reinigen")) return { gewerk: "X83 Real", leistungsart: "Reinigung von Straßen", bauverfahren: "Reinigung von Straßen" };
  if (t.includes("spartenerkundung") || t.includes("sparten erkundung")) return { gewerk: "X83 Real", leistungsart: "Spartenerkundung durchführen", bauverfahren: "Spartenerkundung durchführen" };
  if (t.includes("zulage asphalt gering verunreinigt") || t.includes("asphalt gering verunreinigt")) return { gewerk: "X83 Real", leistungsart: "Zulage Asphalt gering verunreinigt", bauverfahren: "Zulage Asphalt gering verunreinigt" };
  if (t.includes("aufbruch fels") || t.includes("fels aufbrechen") || t.includes("fels lösen") || t.includes("fels loesen")) return { gewerk: "X83 Real", leistungsart: "Fels aufbrechen / lösen", bauverfahren: "Fels aufbrechen / lösen" };
  if (t.includes("aufsatz ausbauen") || t.includes("ablaufaufsatz ausbauen")) return { gewerk: "X83 Real", leistungsart: "Ablaufaufsatz ausbauen", bauverfahren: "Ablaufaufsatz ausbauen" };
  if (t.includes("aufsatz liefern und einbauen") || t.includes("ablaufaufsatz liefern")) return { gewerk: "X83 Real", leistungsart: "Ablaufaufsatz liefern und einbauen", bauverfahren: "Ablaufaufsatz liefern und einbauen" };
  if (t.includes("granitbord ausbauen") || t.includes("bord ausbauen") || t.includes("bordstein ausbauen")) return { gewerk: "X83 Real", leistungsart: "Granitbord / Bordstein ausbauen", bauverfahren: "Granitbord / Bordstein ausbauen" };
  if (t.includes("boden lösen und zwischenlagern") || t.includes("boden loesen und zwischenlagern")) return { gewerk: "X83 Real", leistungsart: "Boden lösen und zwischenlagern", bauverfahren: "Boden lösen und zwischenlagern" };
  if (t.includes("probenahme") || t.includes("deklarationsanalyse")) return { gewerk: "X83 Real", leistungsart: "Probenahme und Deklarationsanalyse", bauverfahren: "Probenahme und Deklarationsanalyse" };
  if (t.includes("erschwerniszuschlag leitungskreuzung") || t.includes("leitungskreuzung")) return { gewerk: "X83 Real", leistungsart: "Erschwerniszuschlag Leitungskreuzung", bauverfahren: "Erschwerniszuschlag Leitungskreuzung" };
  if (t.includes("mehraufwand vorh. leitungen") || t.includes("mehraufwand vorhandene leitungen")) return { gewerk: "X83 Real", leistungsart: "Mehraufwand vorhandene Leitungen", bauverfahren: "Mehraufwand vorhandene Leitungen" };
  if (t.includes("rl ausbauen") || t.includes("rohrleitung ausbauen")) return { gewerk: "X83 Real", leistungsart: "Rohrleitung ausbauen bis DN 300", bauverfahren: "Rohrleitung ausbauen bis DN 300" };
  if (t.includes("kunststoffrohrlleitung dn 300") || t.includes("kunststoffrohrleitung dn 300")) return { gewerk: "X83 Real", leistungsart: "Kunststoffrohrleitung DN 300 herstellen", bauverfahren: "Kunststoffrohrleitung DN 300 herstellen" };
  if (t.includes("kunststoffrohrlleitung dn 160") || t.includes("kunststoffrohrleitung dn 160")) return { gewerk: "X83 Real", leistungsart: "Kunststoffrohrleitung DN 160 herstellen", bauverfahren: "Kunststoffrohrleitung DN 160 herstellen" };
  if (t.includes("pp-überschiebmuffe") || t.includes("pp-ueberschiebmuffe") || t.includes("überschiebmuffe")) return { gewerk: "X83 Real", leistungsart: "PP-Überschiebmuffe DN 300 einbauen", bauverfahren: "PP-Überschiebmuffe DN 300 einbauen" };
  if (t.includes("pp-gelenkstück") || t.includes("pp-gelenkstueck")) return { gewerk: "X83 Real", leistungsart: "PP-Gelenkstück DN 300 einbauen", bauverfahren: "PP-Gelenkstück DN 300 einbauen" };
  if (t.includes("pp-bogen") || t.includes("pp bogen")) return { gewerk: "X83 Real", leistungsart: "PP-Bogen DN 300 einbauen", bauverfahren: "PP-Bogen DN 300 einbauen" };
  if (t.includes("pp-abzweig") || t.includes("pp abzweig")) return { gewerk: "X83 Real", leistungsart: "PP-Abzweig DN 300/160 einbauen", bauverfahren: "PP-Abzweig DN 300/160 einbauen" };
  if (t.includes("pp-schnitt") || t.includes("pp schnitt")) return { gewerk: "X83 Real", leistungsart: "PP-Schnitt DN 160 herstellen", bauverfahren: "PP-Schnitt DN 160 herstellen" };
  if (t.includes("rohrleitung reinigen") || t.includes("rohr reinigen")) return { gewerk: "X83 Real", leistungsart: "Rohrleitung reinigen bis DN 300", bauverfahren: "Rohrleitung reinigen bis DN 300" };
  if (t.includes("kanal-tv") || t.includes("kanal tv") || t.includes("kamerabefahrung")) return { gewerk: "X83 Real", leistungsart: "Kanal-TV bis DN 300 durchführen", bauverfahren: "Kanal-TV bis DN 300 durchführen" };
  if (t.includes("fss herstellen") || t.includes("frostschutzschicht")) return { gewerk: "X83 Real", leistungsart: "Frostschutzschicht herstellen", bauverfahren: "Frostschutzschicht korrigieren" };
  if (t.includes("zulage mehr- minderstärke") || t.includes("mehr-/minderstärke") || t.includes("mehr- minderstärke")) return { gewerk: "X83 Real", leistungsart: "Zulage Mehr-/Minderstärke", bauverfahren: "Zulage Mehr-/Minderstärke" };
  if (t.includes("unterlage reinigen")) return { gewerk: "X83 Real", leistungsart: "Unterlage reinigen", bauverfahren: "Unterlage reinigen" };
  if (t.includes("schichtenverbund")) return { gewerk: "X83 Real", leistungsart: "Schichtenverbund herstellen", bauverfahren: "Schichtenverbund herstellen" };
  if (t.includes("anschluss als fuge") || t.includes("fuge herstellen")) return { gewerk: "X83 Real", leistungsart: "Anschluss als Fuge herstellen", bauverfahren: "Anschluss als Fuge herstellen" };
  if (t.includes("granittiefbord") || t.includes("granit tiefbord")) return { gewerk: "X83 Real", leistungsart: "Granittiefbord herstellen", bauverfahren: "Granittiefbord herstellen" };
  if (t.includes("flächenrüttler") || t.includes("flaechenruettler")) return { gewerk: "X83 Real", leistungsart: "Flächenrüttler einsetzen", bauverfahren: "Flächenrüttler einsetzen" };


  // MAXI_BLOCK_J_RESTMODULE_PARSER_FIX
  if (t.includes("personaleinsatzplanung") || t.includes("personal einsatzplanung")) return { gewerk: "Maxi Block J", leistungsart: "Personaleinsatzplanung erstellen", bauverfahren: "Personaleinsatzplanung erstellen" };
  if (t.includes("zeiterfassung prüfen") || t.includes("zeiterfassung pruefen")) return { gewerk: "Maxi Block J", leistungsart: "Zeiterfassung prüfen", bauverfahren: "Zeiterfassung prüfen" };
  if (t.includes("urlaubsplanung") || t.includes("abwesenheit verwalten")) return { gewerk: "Maxi Block J", leistungsart: "Urlaubsplanung / Abwesenheit verwalten", bauverfahren: "Urlaubsplanung / Abwesenheit verwalten" };
  if (t.includes("mitarbeiterschulung") || t.includes("schulung dokumentieren")) return { gewerk: "Maxi Block J", leistungsart: "Mitarbeiterschulung dokumentieren", bauverfahren: "Mitarbeiterschulung dokumentieren" };
  if (t.includes("sicherheitsunterweisung") || t.includes("unterweisung durchführen")) return { gewerk: "Maxi Block J", leistungsart: "Sicherheitsunterweisung durchführen", bauverfahren: "Sicherheitsunterweisung durchführen" };
  if (t.includes("fuhrpark einsatzplanung") || t.includes("fahrzeug einsatzplanung")) return { gewerk: "Maxi Block J", leistungsart: "Fuhrpark Einsatzplanung erstellen", bauverfahren: "Fuhrpark Einsatzplanung erstellen" };
  if (t.includes("fahrzeugakte") || t.includes("fahrzeug akte")) return { gewerk: "Maxi Block J", leistungsart: "Fahrzeugakte pflegen", bauverfahren: "Fahrzeugakte pflegen" };
  if (t.includes("tüv termin") || t.includes("tuev termin") || t.includes("uvv termin")) return { gewerk: "Maxi Block J", leistungsart: "TÜV / UVV Termin überwachen", bauverfahren: "TÜV / UVV Termin überwachen" };
  if (t.includes("kilometerstand") || t.includes("betriebsstunden erfassen")) return { gewerk: "Maxi Block J", leistungsart: "Kilometerstand / Betriebsstunden erfassen", bauverfahren: "Kilometerstand / Betriebsstunden erfassen" };
  if (t.includes("kraftstoffverbrauch") || t.includes("dieselverbrauch")) return { gewerk: "Maxi Block J", leistungsart: "Kraftstoffverbrauch erfassen", bauverfahren: "Kraftstoffverbrauch erfassen" };
  if (t.includes("gerätewartung") || t.includes("geraetewartung") || t.includes("wartung planen")) return { gewerk: "Maxi Block J", leistungsart: "Gerätewartung planen", bauverfahren: "Gerätewartung planen" };
  if (t.includes("geräteprüfung") || t.includes("geraetepruefung") || t.includes("prüfung gerät")) return { gewerk: "Maxi Block J", leistungsart: "Geräteprüfung dokumentieren", bauverfahren: "Geräteprüfung dokumentieren" };
  if (t.includes("gerätereparatur") || t.includes("geraetereparatur") || t.includes("reparatur koordinieren")) return { gewerk: "Maxi Block J", leistungsart: "Gerätereparatur koordinieren", bauverfahren: "Gerätereparatur koordinieren" };
  if (t.includes("gerätedisposition") || t.includes("geraetedisposition") || t.includes("geräte disponieren")) return { gewerk: "Maxi Block J", leistungsart: "Gerätedisposition erstellen", bauverfahren: "Gerätedisposition erstellen" };
  if (t.includes("gerätemiete") || t.includes("geraetemiete") || t.includes("maschine mieten")) return { gewerk: "Maxi Block J", leistungsart: "Gerätemiete organisieren", bauverfahren: "Gerätemiete organisieren" };
  if (t.includes("arbeitssicherheit dokumentation") || t.includes("sicherheitsdokumentation")) return { gewerk: "Maxi Block J", leistungsart: "Arbeitssicherheitsdokumentation erstellen", bauverfahren: "Arbeitssicherheitsdokumentation erstellen" };
  if (t.includes("dpi kontrolle") || t.includes("psa kontrolle") || t.includes("schutzausrüstung")) return { gewerk: "Maxi Block J", leistungsart: "DPI / PSA Kontrolle durchführen", bauverfahren: "DPI / PSA Kontrolle durchführen" };
  if (t.includes("gefährdungsbeurteilung") || t.includes("gefaehrdungsbeurteilung")) return { gewerk: "Maxi Block J", leistungsart: "Gefährdungsbeurteilung erstellen", bauverfahren: "Gefährdungsbeurteilung erstellen" };
  if (t.includes("baustellensicherheitskontrolle") || t.includes("sicherheitskontrolle")) return { gewerk: "Maxi Block J", leistungsart: "Baustellensicherheitskontrolle durchführen", bauverfahren: "Baustellensicherheitskontrolle durchführen" };
  if (t.includes("sicherheitsmangel") || t.includes("mangel sicherheit")) return { gewerk: "Maxi Block J", leistungsart: "Sicherheitsmangel dokumentieren", bauverfahren: "Sicherheitsmangel dokumentieren" };
  if (t.includes("mangel aufnehmen") || t.includes("mangel dokumentieren")) return { gewerk: "Maxi Block J", leistungsart: "Mangel aufnehmen / dokumentieren", bauverfahren: "Mangel aufnehmen / dokumentieren" };
  if (t.includes("nacharbeit koordinieren") || t.includes("nacharbeit")) return { gewerk: "Maxi Block J", leistungsart: "Nacharbeit koordinieren", bauverfahren: "Nacharbeit koordinieren" };
  if (t.includes("abnahme vorbereiten") || t.includes("bauabnahme")) return { gewerk: "Maxi Block J", leistungsart: "Abnahme vorbereiten", bauverfahren: "Abnahme vorbereiten" };
  if (t.includes("qualitätsprüfung") || t.includes("qualitaetspruefung")) return { gewerk: "Maxi Block J", leistungsart: "Qualitätsprüfung durchführen", bauverfahren: "Qualitätsprüfung durchführen" };
  if (t.includes("qualitätscheckliste") || t.includes("qualitaetscheckliste")) return { gewerk: "Maxi Block J", leistungsart: "Qualitätscheckliste bearbeiten", bauverfahren: "Qualitätscheckliste bearbeiten" };
  if (t.includes("bauzeitenplan") || t.includes("terminplan bau")) return { gewerk: "Maxi Block J", leistungsart: "Bauzeitenplan erstellen", bauverfahren: "Bauzeitenplan erstellen" };
  if (t.includes("gantt") || t.includes("gantt plan")) return { gewerk: "Maxi Block J", leistungsart: "Gantt-Plan aktualisieren", bauverfahren: "Gantt-Plan aktualisieren" };
  if (t.includes("projektstatusbericht") || t.includes("statusbericht")) return { gewerk: "Maxi Block J", leistungsart: "Projektstatusbericht erstellen", bauverfahren: "Projektstatusbericht erstellen" };
  if (t.includes("baubesprechungsprotokoll") || t.includes("besprechungsprotokoll")) return { gewerk: "Maxi Block J", leistungsart: "Baubesprechungsprotokoll erstellen", bauverfahren: "Baubesprechungsprotokoll erstellen" };
  if (t.includes("projektkoordination") || t.includes("koordination projekt")) return { gewerk: "Maxi Block J", leistungsart: "Projektkoordination durchführen", bauverfahren: "Projektkoordination durchführen" };
  if (t.includes("dokument ablegen") || t.includes("dokument archivieren")) return { gewerk: "Maxi Block J", leistungsart: "Dokument ablegen / archivieren", bauverfahren: "Dokument ablegen / archivieren" };
  if (t.includes("dokumentenfreigabe") || t.includes("freigabe dokument")) return { gewerk: "Maxi Block J", leistungsart: "Dokumentenfreigabe bearbeiten", bauverfahren: "Dokumentenfreigabe bearbeiten" };
  if (t.includes("schriftverkehr zuordnen") || t.includes("email zuordnen") || t.includes("e-mail zuordnen")) return { gewerk: "Maxi Block J", leistungsart: "E-Mail / Schriftverkehr zuordnen", bauverfahren: "E-Mail / Schriftverkehr zuordnen" };
  if (t.includes("datev export") || t.includes("excel export") || t.includes("pdf export")) return { gewerk: "Maxi Block J", leistungsart: "Export PDF / Excel / DATEV vorbereiten", bauverfahren: "Export PDF / Excel / DATEV vorbereiten" };
  if (t.includes("projektarchiv") || t.includes("archiv pflegen")) return { gewerk: "Maxi Block J", leistungsart: "Projektarchiv pflegen", bauverfahren: "Projektarchiv pflegen" };
  if (t.includes("kundendaten") || t.includes("kunde pflegen")) return { gewerk: "Maxi Block J", leistungsart: "Kundendaten pflegen", bauverfahren: "Kundendaten pflegen" };
  if (t.includes("angebotsnachverfolgung") || t.includes("angebot nachverfolgen")) return { gewerk: "Maxi Block J", leistungsart: "Angebotsnachverfolgung durchführen", bauverfahren: "Angebotsnachverfolgung durchführen" };
  if (t.includes("sales pipeline") || t.includes("vertrieb pipeline")) return { gewerk: "Maxi Block J", leistungsart: "Sales Pipeline aktualisieren", bauverfahren: "Sales Pipeline aktualisieren" };
  if (t.includes("kundenkontakt") || t.includes("kontakt dokumentieren")) return { gewerk: "Maxi Block J", leistungsart: "Kundenkontakt dokumentieren", bauverfahren: "Kundenkontakt dokumentieren" };
  if (t.includes("akquise") || t.includes("lead bearbeiten")) return { gewerk: "Maxi Block J", leistungsart: "Akquise / Lead bearbeiten", bauverfahren: "Akquise / Lead bearbeiten" };
  if (t.includes("bim modellprüfung") || t.includes("bim modellpruefung")) return { gewerk: "Maxi Block J", leistungsart: "BIM-Modellprüfung durchführen", bauverfahren: "BIM-Modellprüfung durchführen" };
  if (t.includes("5d bim") || t.includes("kostenmodell bim")) return { gewerk: "Maxi Block J", leistungsart: "5D-BIM Kostenmodell bearbeiten", bauverfahren: "5D-BIM Kostenmodell bearbeiten" };
  if (t.includes("4d bim") || t.includes("terminmodell bim")) return { gewerk: "Maxi Block J", leistungsart: "4D-BIM Terminmodell bearbeiten", bauverfahren: "4D-BIM Terminmodell bearbeiten" };
  if (t.includes("ki datenprüfung") || t.includes("ki datenpruefung")) return { gewerk: "Maxi Block J", leistungsart: "KI-Datenprüfung durchführen", bauverfahren: "KI-Datenprüfung durchführen" };
  if (t.includes("supportanfrage") || t.includes("support anfrage")) return { gewerk: "Maxi Block J", leistungsart: "Supportanfrage bearbeiten", bauverfahren: "Supportanfrage bearbeiten" };


  // BLOCK_I_MATERIAL_EINKAUF_PARSER_FIX
  if (t.includes("lieferschein") && (t.includes("ocr") || t.includes("ki") || t.includes("nachbearbeiten"))) return { gewerk: "Lieferschein", leistungsart: "Lieferschein OCR/KI nachbearbeiten", bauverfahren: "Lieferschein OCR/KI nachbearbeiten" };
  if (t.includes("lieferschein") && t.includes("kostenstelle")) return { gewerk: "Lieferschein", leistungsart: "Lieferschein Kostenstelle zuordnen", bauverfahren: "Lieferschein Kostenstelle zuordnen" };
  if (t.includes("lieferschein") && (t.includes("fachlich") || t.includes("kontrollieren"))) return { gewerk: "Lieferschein", leistungsart: "Lieferschein fachlich prüfen", bauverfahren: "Lieferschein fachlich prüfen" };
  if (t.includes("lieferschein") && (t.includes("erfassen") || t.includes("eingeben") || t.includes("importieren"))) return { gewerk: "Lieferschein", leistungsart: "Lieferschein erfassen", bauverfahren: "Lieferschein erfassen" };

  if (t.includes("material") && (t.includes("bestellen") || t.includes("bestellung"))) return { gewerk: "Einkauf", leistungsart: "Material bestellen", bauverfahren: "Material bestellen" };
  if (t.includes("angebot einholen") || t.includes("lieferantenangebot") || t.includes("preisanfrage")) return { gewerk: "Einkauf", leistungsart: "Lieferantenangebot einholen", bauverfahren: "Lieferantenangebot einholen" };
  if (t.includes("preisvergleich") || t.includes("preise vergleichen")) return { gewerk: "Einkauf", leistungsart: "Materialpreisvergleich", bauverfahren: "Materialpreisvergleich durchführen" };
  if (t.includes("bestellung") && (t.includes("prüfen") || t.includes("pruefen") || t.includes("freigeben"))) return { gewerk: "Einkauf", leistungsart: "Bestellung prüfen", bauverfahren: "Bestellung prüfen / freigeben" };

  if (t.includes("wareneingang") || t.includes("materialeingang")) return { gewerk: "Lager", leistungsart: "Wareneingang erfassen", bauverfahren: "Wareneingang erfassen" };
  if (t.includes("lagerbestand buchen") || t.includes("lager buchen") || t.includes("bestand buchen")) return { gewerk: "Lager", leistungsart: "Lagerbestand buchen", bauverfahren: "Lagerbestand buchen" };
  if (t.includes("material ausgeben") || t.includes("material auslagern") || t.includes("lagerausgabe")) return { gewerk: "Lager", leistungsart: "Material aus Lager ausgeben", bauverfahren: "Material aus Lager ausgeben" };
  if (t.includes("inventur") || t.includes("lagerkontrolle") || t.includes("bestand prüfen")) return { gewerk: "Lager", leistungsart: "Inventur / Lagerkontrolle", bauverfahren: "Inventur / Lagerkontrolle durchführen" };

  if (t.includes("material") && t.includes("kostenstelle")) return { gewerk: "Kostenstelle", leistungsart: "Material Kostenstelle zuordnen", bauverfahren: "Material Kostenstelle zuordnen" };
  if (t.includes("material") && (t.includes("lv position") || t.includes("position zuordnen"))) return { gewerk: "Kostenstelle", leistungsart: "Material LV-Position zuordnen", bauverfahren: "Material LV-Position zuordnen" };

  if (t.includes("baustofflieferung") || t.includes("materiallieferung") || t.includes("lieferung organisieren")) return { gewerk: "Materiallieferung", leistungsart: "Baustofflieferung organisieren", bauverfahren: "Baustofflieferung organisieren" };
  if (t.includes("kranentladung") || t.includes("entladung mit kran") || t.includes("material kran")) return { gewerk: "Materiallieferung", leistungsart: "Kranentladung Material", bauverfahren: "Kranentladung Material" };
  if (t.includes("entladung") || t.includes("abladen material") || t.includes("material abladen")) return { gewerk: "Materiallieferung", leistungsart: "Entladung / Abladen Material", bauverfahren: "Entladung / Abladen Material" };

  if (t.includes("materialreklamation") || (t.includes("reklamation") && t.includes("material"))) return { gewerk: "Einkauf", leistungsart: "Materialreklamation", bauverfahren: "Materialreklamation bearbeiten" };
  if (t.includes("materialrückgabe") || t.includes("materialrueckgabe") || t.includes("rückgabe material")) return { gewerk: "Einkauf", leistungsart: "Materialrückgabe", bauverfahren: "Materialrückgabe organisieren" };
  if (t.includes("lieferantenbewertung") || t.includes("lieferant bewerten")) return { gewerk: "Einkauf", leistungsart: "Lieferantenbewertung", bauverfahren: "Lieferantenbewertung durchführen" };


  // BLOCK_H_VERMESSUNG_CAD_PARSER_FIX
  // BLOCK_H_EXACT_OVERRIDE_CAD_EXPORT
  if (t.includes("dwg") && (t.includes("erstellen") || t.includes("zeichnen"))) {
    return { gewerk: "CAD", leistungsart: "DWG-Plan erstellen", bauverfahren: "DWG-Plan erstellen" };
  }
  if (t.includes("dwg") && (t.includes("bearbeiten") || t.includes("ändern") || t.includes("aendern"))) {
    return { gewerk: "CAD", leistungsart: "DWG-Plan bearbeiten", bauverfahren: "DWG-Plan bearbeiten" };
  }
  if (t.includes("pdf") && t.includes("digitalisieren")) {
    return { gewerk: "CAD", leistungsart: "PDF-Plan digitalisieren", bauverfahren: "PDF-Plan digitalisieren" };
  }
  if ((t.includes("as-built") || t.includes("as built")) && t.includes("plan")) {
    return { gewerk: "CAD / As-Built", leistungsart: "As-Built Plan", bauverfahren: "As-Built Plan erstellen" };
  }
  if (t.includes("dgm") && (t.includes("erstellen") || t.includes("geländemodell") || t.includes("gelaendemodell"))) {
    return { gewerk: "3D", leistungsart: "DGM / 3D-Geländemodell", bauverfahren: "DGM / 3D-Geländemodell erstellen" };
  }
  if (t.includes("landxml") || t.includes("land xml")) {
    return { gewerk: "Export", leistungsart: "LandXML Export", bauverfahren: "LandXML Export erstellen" };
  }
  if (t.includes("ifc")) {
    return { gewerk: "Export", leistungsart: "IFC Export", bauverfahren: "IFC Export erstellen" };
  }
  if (t.includes("machine control") || t.includes("maschinensteuerung") || t.includes("baggersteuerung")) {
    return { gewerk: "Machine Control", leistungsart: "Machine-Control Modell", bauverfahren: "Machine-Control Modell erstellen" };
  }
  if (t.includes("trimble") || t.includes("leica") || t.includes("topcon") || t.includes("maschinenmodell")) {
    return { gewerk: "Machine Control", leistungsart: "Datenaufbereitung Machine Control", bauverfahren: "Datenaufbereitung für Trimble / Leica" };
  }
  if (t.includes("drohnenbefliegung") || t.includes("drohne") || t.includes("uav")) {
    return { gewerk: "Drohne", leistungsart: "Drohnenbefliegung", bauverfahren: "Drohnenbefliegung durchführen" };
  }
  if (t.includes("orthofoto") || t.includes("punktwolke") || t.includes("photogrammetrie")) {
    return { gewerk: "Drohne", leistungsart: "Orthofoto / Punktwolke", bauverfahren: "Orthofoto / Punktwolke erstellen" };
  }

  if (t.includes("gnss") || t.includes("gps vermessung") || t.includes("satellitenvermessung")) return { gewerk: "Vermessung", leistungsart: "GNSS-Vermessung", bauverfahren: "GNSS-Vermessung durchführen" };
  if (t.includes("totalstation") || t.includes("tachymeter")) return { gewerk: "Vermessung", leistungsart: "Totalstation", bauverfahren: "Vermessung mit Totalstation" };
  if (t.includes("absteckung") || t.includes("punkte abstecken")) return { gewerk: "Vermessung", leistungsart: "Absteckung", bauverfahren: "Absteckung durchführen" };
  if (t.includes("nivellement") || t.includes("höhenaufnahme") || t.includes("hoehenaufnahme")) return { gewerk: "Vermessung", leistungsart: "Nivellement", bauverfahren: "Nivellement / Höhenaufnahme" };
  if (t.includes("bestandsaufnahme") || t.includes("geländeaufnahme") || t.includes("gelaendeaufnahme")) return { gewerk: "Vermessung", leistungsart: "Bestandsaufnahme", bauverfahren: "Bestandsaufnahme / Geländeaufnahme" };

  if (t.includes("querprofil") || t.includes("querschnitt")) return { gewerk: "Vermessung / Profile", leistungsart: "Querprofil", bauverfahren: "Querprofil erstellen" };
  if (t.includes("längsprofil") || t.includes("laengsprofil")) return { gewerk: "Vermessung / Profile", leistungsart: "Längsprofil", bauverfahren: "Längsprofil erstellen" };
  if (t.includes("massenermittlung vermessung") || t.includes("massen aus vermessung")) return { gewerk: "Vermessung / Massen", leistungsart: "Massenermittlung", bauverfahren: "Massenermittlung aus Vermessungsdaten" };
  if (t.includes("volumenberechnung") || t.includes("dgm volumen") || t.includes("geländemodell volumen")) return { gewerk: "Vermessung / Massen", leistungsart: "Volumenberechnung", bauverfahren: "Volumenberechnung mit DGM" };

  if (t.includes("dwg erstellen") || t.includes("cad plan erstellen")) return { gewerk: "CAD", leistungsart: "DWG-Plan erstellen", bauverfahren: "DWG-Plan erstellen" };
  if (t.includes("dwg bearbeiten") || t.includes("cad bearbeiten")) return { gewerk: "CAD", leistungsart: "DWG-Plan bearbeiten", bauverfahren: "DWG-Plan bearbeiten" };
  if (t.includes("pdf plan digitalisieren") || t.includes("plan digitalisieren")) return { gewerk: "CAD", leistungsart: "PDF-Plan digitalisieren", bauverfahren: "PDF-Plan digitalisieren" };
  if (t.includes("as-built plan") || t.includes("bestandsplan erstellen")) return { gewerk: "CAD / As-Built", leistungsart: "As-Built Plan", bauverfahren: "As-Built Plan erstellen" };

  if (t.includes("dgm erstellen") || t.includes("3d geländemodell") || t.includes("3d gelaendemodell")) return { gewerk: "3D", leistungsart: "DGM / 3D-Geländemodell", bauverfahren: "DGM / 3D-Geländemodell erstellen" };
  if (t.includes("landxml") || t.includes("land xml")) return { gewerk: "Export", leistungsart: "LandXML Export", bauverfahren: "LandXML Export erstellen" };
  if (t.includes("ifc export") || t.includes("ifc modell")) return { gewerk: "Export", leistungsart: "IFC Export", bauverfahren: "IFC Export erstellen" };
  if (t.includes("machine control") || t.includes("maschinensteuerung") || t.includes("baggersteuerung")) return { gewerk: "Machine Control", leistungsart: "Machine-Control Modell", bauverfahren: "Machine-Control Modell erstellen" };
  if (t.includes("trimble") || t.includes("leica") || t.includes("topcon") || t.includes("maschinenmodell")) return { gewerk: "Machine Control", leistungsart: "Datenaufbereitung Machine Control", bauverfahren: "Datenaufbereitung für Trimble / Leica" };

  if (t.includes("drohnenbefliegung") || t.includes("drohne") || t.includes("uav")) return { gewerk: "Drohne", leistungsart: "Drohnenbefliegung", bauverfahren: "Drohnenbefliegung durchführen" };
  if (t.includes("orthofoto") || t.includes("punktwolke") || t.includes("photogrammetrie")) return { gewerk: "Drohne", leistungsart: "Orthofoto / Punktwolke", bauverfahren: "Orthofoto / Punktwolke erstellen" };


  // BLOCK_G_ABRECHNUNG_PARSER_FIX
  if (t.includes("reb") || t.includes("da11") || t.includes("x31")) return { gewerk: "Abrechnung / Aufmaß", leistungsart: "REB-Aufmaß bearbeiten", bauverfahren: "REB-Aufmaß bearbeiten" };
  if (t.includes("massenprüfung") || t.includes("massenpruefung") || t.includes("mengenprüfung")) return { gewerk: "Abrechnung / Aufmaß", leistungsart: "Massenprüfung durchführen", bauverfahren: "Massenprüfung durchführen" };
  if (t.includes("aufmaßblatt") || t.includes("aufmassblatt")) return { gewerk: "Abrechnung / Aufmaß", leistungsart: "Aufmaßblatt erstellen", bauverfahren: "Aufmaßblatt erstellen" };
  if (t.includes("aufmaß vor ort") || t.includes("aufmass vor ort") || t.includes("örtliches aufmaß")) return { gewerk: "Abrechnung / Aufmaß", leistungsart: "Aufmaß vor Ort aufnehmen", bauverfahren: "Aufmaß vor Ort aufnehmen" };
  if (t.includes("aufmaß") || t.includes("aufmass") || t.includes("massenaufstellung")) return { gewerk: "Abrechnung / Aufmaß", leistungsart: "Aufmaß erstellen", bauverfahren: "Aufmaß erstellen" };

  if (t.includes("regiebericht") && (t.includes("abrechnung") || t.includes("prüfen") || t.includes("pruefen"))) return { gewerk: "Abrechnung / Regie", leistungsart: "Regiebericht prüfen", bauverfahren: "Regiebericht für Abrechnung prüfen" };
  if (t.includes("lieferschein") && (t.includes("abrechnung") || t.includes("prüfen") || t.includes("pruefen"))) return { gewerk: "Abrechnung / Lieferschein", leistungsart: "Lieferschein prüfen", bauverfahren: "Lieferschein für Abrechnung prüfen" };
  if (t.includes("stundenabrechnung") || t.includes("stunden abrechnen")) return { gewerk: "Abrechnung / Stunden", leistungsart: "Stundenabrechnung erstellen", bauverfahren: "Stundenabrechnung erstellen" };

  if (t.includes("abschlagsrechnung") || t.includes("abschlagrechnung")) return { gewerk: "Rechnung", leistungsart: "Abschlagsrechnung erstellen", bauverfahren: "Abschlagsrechnung erstellen" };
  if (t.includes("schlussrechnung") || t.includes("endgültige abrechnung") || t.includes("endgueltige abrechnung")) return { gewerk: "Rechnung", leistungsart: "Schlussrechnung erstellen", bauverfahren: "Schlussrechnung erstellen" };
  if (t.includes("rechnung prüfen") || t.includes("rechnung pruefen")) return { gewerk: "Rechnung", leistungsart: "Rechnung prüfen", bauverfahren: "Rechnung prüfen" };

  if (t.includes("nachtrag") && (t.includes("prüfen") || t.includes("pruefen"))) return { gewerk: "Nachtrag", leistungsart: "Nachtrag prüfen", bauverfahren: "Nachtrag prüfen" };
  if (t.includes("nachtrag")) return { gewerk: "Nachtrag", leistungsart: "Nachtrag erstellen", bauverfahren: "Nachtrag erstellen" };
  if (t.includes("mehrmengen") || t.includes("mindermengen") || t.includes("mengenänderung")) return { gewerk: "Nachtrag", leistungsart: "Mehrmengen / Mindermengen bewerten", bauverfahren: "Mehrmengen / Mindermengen bewerten" };

  if (t.includes("as-built") || t.includes("as built") || t.includes("bestandsdokumentation")) return { gewerk: "Dokumentation", leistungsart: "As-Built Dokumentation", bauverfahren: "As-Built Dokumentation abrechnungsreif erstellen" };
  if (t.includes("fotodokumentation") || t.includes("fotodoku")) return { gewerk: "Dokumentation", leistungsart: "Fotodokumentation", bauverfahren: "Fotodokumentation für Abrechnung erstellen" };
  if (t.includes("prüfprotokoll") || t.includes("pruefprotokoll")) return { gewerk: "Dokumentation", leistungsart: "Prüfprotokoll erstellen", bauverfahren: "Prüfprotokoll erstellen" };

  if (t.includes("abrechnungsfreigabe")) return { gewerk: "Abrechnung", leistungsart: "Bauleiter-Abrechnungsfreigabe", bauverfahren: "Bauleiter-Abrechnungsfreigabe bearbeiten" };
  if (t.includes("kostenstelle") || t.includes("lv position zuordnen")) return { gewerk: "Abrechnung", leistungsart: "Kostenstelle / LV-Position zuordnen", bauverfahren: "Kostenstelle / LV-Position zuordnen" };


  // GLOBAL_EXACT_OVERRIDE: Grundwasser/Bauwasser abpumpen muss vor Bauwasser-Baustelleneinrichtung erkannt werden
  if ((t.includes("grundwasser") || t.includes("bauwasser")) && t.includes("abpumpen")) {
    return {
      gewerk: "Wasserhaltung",
      leistungsart: "Bauwasser abpumpen",
      bauverfahren: "Bauwasser / Grundwasser abpumpen",
    };
  }


  // GLOBAL_EXACT_OVERRIDE: Betonpflaster muss vor Betonbau erkannt werden
  if (t.includes("betonpflaster")) {
    return {
      gewerk: "Straßenbau / Pflaster",
      leistungsart: "Betonpflaster verlegen",
      bauverfahren: "Betonpflaster liefern und verlegen",
    };
  }


  // BLOCK_F_REGIE_GERAETE_PARSER_FIX
  // BLOCK_F_EXACT_OVERRIDE
  if (t.includes("wartezeit") || t.includes("stillstand")) {
    return { gewerk: "Transport", leistungsart: "Wartezeit", bauverfahren: "Wartezeit LKW / Gerät" };
  }

  if (t.includes("facharbeiter")) return { gewerk: "Regie / Stunden", leistungsart: "Facharbeiter Regiestunde", bauverfahren: "Facharbeiter Regiestunde" };
  if (t.includes("helfer") || t.includes("bauhelfer")) return { gewerk: "Regie / Stunden", leistungsart: "Helfer Regiestunde", bauverfahren: "Helfer Regiestunde" };
  if (t.includes("polier") || t.includes("vorarbeiter")) return { gewerk: "Regie / Stunden", leistungsart: "Polier Regiestunde", bauverfahren: "Polier / Vorarbeiter Regiestunde" };
  if (t.includes("bauleiter") || t.includes("projektleiter")) return { gewerk: "Regie / Stunden", leistungsart: "Bauleiter Regiestunde", bauverfahren: "Bauleiter Regiestunde" };

  if (t.includes("minibagger") || t.includes("kleinbagger")) return { gewerk: "Geräte", leistungsart: "Minibagger", bauverfahren: "Minibagger bis 3,5 t" };
  if ((t.includes("bagger") && (t.includes("8") || t.includes("14") || t.includes("kettenbagger")))) return { gewerk: "Geräte", leistungsart: "Bagger 8–14 t", bauverfahren: "Bagger 8–14 t" };
  if (t.includes("radlader")) return { gewerk: "Geräte", leistungsart: "Radlader", bauverfahren: "Radlader" };
  if (t.includes("rüttelplatte") || t.includes("ruettelplatte") || t.includes("verdichtungsgerät")) return { gewerk: "Geräte", leistungsart: "Rüttelplatte", bauverfahren: "Rüttelplatte / Verdichtungsgerät" };
  if (t.includes("stampfer") || t.includes("grabenstampfer")) return { gewerk: "Geräte", leistungsart: "Stampfer", bauverfahren: "Stampfer / Grabenstampfer" };
  if (t.includes("asphaltschneider") || t.includes("fugenschneider")) return { gewerk: "Geräte", leistungsart: "Asphaltschneider", bauverfahren: "Asphaltschneider / Fugenschneider" };

  if ((t.includes("lkw") && t.includes("kran")) || t.includes("ladekran") || t.includes("kranwagen")) return { gewerk: "Transport", leistungsart: "LKW mit Kran", bauverfahren: "LKW mit Ladekran" };
  if (t.includes("lkw") || t.includes("kipper") || t.includes("dreiachser")) return { gewerk: "Transport", leistungsart: "LKW Kipper", bauverfahren: "LKW Kipper" };
  if (t.includes("tieflader") || t.includes("maschinentransport")) return { gewerk: "Transport", leistungsart: "Tiefladertransport", bauverfahren: "Tiefladertransport" };
  if (t.includes("an- und abfahrt") || t.includes("anfahrt") || t.includes("abfahrt")) return { gewerk: "Transport", leistungsart: "An- und Abfahrt", bauverfahren: "An- und Abfahrt" };
  if (t.includes("wartezeit") || t.includes("stillstand")) return { gewerk: "Transport", leistungsart: "Wartezeit", bauverfahren: "Wartezeit LKW / Gerät" };

  if (t.includes("kolonne 2") || t.includes("zweimannkolonne")) return { gewerk: "Regie / Kolonne", leistungsart: "Kolonne 2 Mann", bauverfahren: "Kolonne 2 Mann" };
  if (t.includes("kolonne 3") || t.includes("dreimannkolonne")) return { gewerk: "Regie / Kolonne", leistungsart: "Kolonne 3 Mann", bauverfahren: "Kolonne 3 Mann" };
  if (t.includes("regiearbeit") || t.includes("regiearbeiten") || t.includes("arbeiten auf nachweis")) return { gewerk: "Regie", leistungsart: "Regiearbeiten pauschal", bauverfahren: "Regiearbeiten pauschal" };
  if (t.includes("gerätepauschale") || t.includes("geraetepauschale") || t.includes("kleingeräte")) return { gewerk: "Geräte", leistungsart: "Gerätepauschale", bauverfahren: "Gerätepauschale Kleingeräte" };
  if (t.includes("kleinmaterial") || t.includes("verbrauchsmaterial")) return { gewerk: "Material", leistungsart: "Kleinmaterial", bauverfahren: "Kleinmaterial pauschal" };


  // BLOCK_E_BAUSTELLE_VERKEHR_PARSER_FIX
  // BLOCK_E_EXACT_OVERRIDE
  if (t.includes("tagesbaustelle")) {
    return { gewerk: "Nebenleistungen", leistungsart: "Tagesbaustelle einrichten", bauverfahren: "Tagesbaustelle einrichten" };
  }

  if (t.includes("baustelleneinrichtung") || t.includes("baustelle einrichten") || t.includes("be einrichten")) return { gewerk: "Baustelleneinrichtung", leistungsart: "Baustelleneinrichtung", bauverfahren: "Baustelleneinrichtung pauschal" };
  if (t.includes("baustelle räumen") || t.includes("baustelle raeumen") || t.includes("baustellenräumung")) return { gewerk: "Baustelleneinrichtung", leistungsart: "Baustelle räumen", bauverfahren: "Baustelle räumen" };
  if (t.includes("baustellencontainer") || t.includes("container stellen")) return { gewerk: "Baustelleneinrichtung", leistungsart: "Baustellencontainer stellen", bauverfahren: "Baustellencontainer stellen" };
  if (t.includes("baustrom")) return { gewerk: "Baustelleneinrichtung", leistungsart: "Baustrom herstellen", bauverfahren: "Baustrom herstellen / vorhalten" };
  if (t.includes("bauwasser")) return { gewerk: "Baustelleneinrichtung", leistungsart: "Bauwasser herstellen", bauverfahren: "Bauwasser herstellen / vorhalten" };

  if (t.includes("bauzaun")) return { gewerk: "Absperrung", leistungsart: "Bauzaun stellen", bauverfahren: "Bauzaun stellen und vorhalten" };
  if (t.includes("absturzsicherung") || t.includes("bauabsperrung") || t.includes("absperrung")) return { gewerk: "Absperrung", leistungsart: "Absperrung herstellen", bauverfahren: "Absperrung / Absturzsicherung herstellen" };
  if (t.includes("leitbaken") || t.includes("absperrbaken") || t.includes("baken")) return { gewerk: "Verkehrssicherung", leistungsart: "Leitbaken stellen", bauverfahren: "Leitbaken / Absperrbaken stellen" };

  if (t.includes("ampelanlage") || t.includes("mobile ampel") || t.includes("lichtsignalanlage")) return { gewerk: "Verkehrssicherung", leistungsart: "Mobile Ampelanlage stellen", bauverfahren: "Mobile Ampelanlage stellen" };
  if (t.includes("beschilderungsplan") || t.includes("verkehrszeichenplan")) return { gewerk: "Verkehrssicherung", leistungsart: "Beschilderungsplan erstellen", bauverfahren: "Beschilderungsplan / Verkehrszeichenplan erstellen" };
  if (t.includes("verkehrsrechtliche anordnung") || t.includes("vra beantragen") || t.includes("anordnung beantragen")) return { gewerk: "Verkehrssicherung", leistungsart: "Verkehrsrechtliche Anordnung", bauverfahren: "Verkehrsrechtliche Anordnung beantragen" };
  if (t.includes("verkehrssicherung")) return { gewerk: "Verkehrssicherung", leistungsart: "Verkehrssicherung einrichten", bauverfahren: "Verkehrssicherung einrichten und vorhalten" };

  if (t.includes("tagesbaustelle")) return { gewerk: "Nebenleistungen", leistungsart: "Tagesbaustelle einrichten", bauverfahren: "Tagesbaustelle einrichten" };
  if (t.includes("nachtarbeit") || t.includes("nachtzuschlag")) return { gewerk: "Nebenleistungen", leistungsart: "Zuschlag Nachtarbeit", bauverfahren: "Zuschlag Nachtarbeit" };
  if (t.includes("wochenendarbeit") || t.includes("samstagsarbeit") || t.includes("sonntagsarbeit")) return { gewerk: "Nebenleistungen", leistungsart: "Zuschlag Wochenendarbeit", bauverfahren: "Zuschlag Wochenendarbeit" };

  if (t.includes("handschachtung")) return { gewerk: "Suchschachtung", leistungsart: "Handschachtung herstellen", bauverfahren: "Handschachtung herstellen" };
  if (t.includes("suchschachtung") || t.includes("suchgraben") || t.includes("probegrabung")) return { gewerk: "Suchschachtung", leistungsart: "Suchschachtung herstellen", bauverfahren: "Suchschachtung herstellen" };
  if (t.includes("bestandsleitung sichern") || t.includes("leitung sichern") || t.includes("bestand sichern")) return { gewerk: "Bestandsschutz", leistungsart: "Bestandsleitung sichern", bauverfahren: "Bestandsleitung sichern" };

  if (t.includes("provisorische umleitung") || t.includes("umleitung")) return { gewerk: "Provisorien", leistungsart: "Provisorische Umleitung herstellen", bauverfahren: "Provisorische Umleitung herstellen" };
  if (t.includes("provisorium") || t.includes("provisorisch")) return { gewerk: "Provisorien", leistungsart: "Provisorium herstellen", bauverfahren: "Provisorium herstellen" };


  // BLOCK_D_BETON_SCHACHT_PARSER_FIX
  if (t.includes("streifenfundament")) return { gewerk: "Beton / Fundamente", leistungsart: "Streifenfundament herstellen", bauverfahren: "Streifenfundament herstellen" };
  if (t.includes("punktfundament")) return { gewerk: "Beton / Fundamente", leistungsart: "Punktfundament herstellen", bauverfahren: "Punktfundament herstellen" };
  if (t.includes("betonfundament") || (t.includes("fundament") && t.includes("beton"))) return { gewerk: "Beton / Fundamente", leistungsart: "Betonfundament herstellen", bauverfahren: "Betonfundament herstellen" };

  if (t.includes("schalung") || t.includes("einschalen")) return { gewerk: "Beton / Schalung", leistungsart: "Schalung herstellen", bauverfahren: "Schalung herstellen" };
  if (t.includes("bewehrung") || t.includes("stahlbewehrung") || t.includes("mattenbewehrung")) return { gewerk: "Beton / Bewehrung", leistungsart: "Bewehrung einbauen", bauverfahren: "Bewehrung einbauen" };
  if (t.includes("magerbeton")) return { gewerk: "Beton", leistungsart: "Magerbeton einbauen", bauverfahren: "Magerbeton einbauen" };
  if ((t.includes("beton") && t.includes("liefern")) || t.includes("transportbeton")) return { gewerk: "Beton", leistungsart: "Beton liefern und einbauen", bauverfahren: "Beton liefern und einbauen" };

  if (t.includes("schachtunterteil")) return { gewerk: "Schächte", leistungsart: "Schachtunterteil setzen", bauverfahren: "Schachtunterteil setzen" };
  if (t.includes("schachtring") || t.includes("betonring")) return { gewerk: "Schächte", leistungsart: "Schachtring setzen", bauverfahren: "Schachtring setzen" };
  if (t.includes("schachtkonus") || t.includes("konus")) return { gewerk: "Schächte", leistungsart: "Schachtkonus setzen", bauverfahren: "Schachtkonus setzen" };
  if (t.includes("schachtabdeckung") && (t.includes("austauschen") || t.includes("tauschen"))) return { gewerk: "Schächte", leistungsart: "Schachtabdeckung austauschen", bauverfahren: "Schachtabdeckung austauschen" };
  if (t.includes("schachtabdeckung")) return { gewerk: "Schächte", leistungsart: "Schachtabdeckung setzen", bauverfahren: "Schachtabdeckung liefern und setzen" };
  if (t.includes("schacht") && (t.includes("erhöhen") || t.includes("erhoehen") || t.includes("regulieren"))) return { gewerk: "Schächte", leistungsart: "Schacht regulieren", bauverfahren: "Schacht erhöhen / regulieren" };

  if ((t.includes("straßenablauf") || t.includes("strassenablauf") || t.includes("sinkkasten")) && (t.includes("anschluss") || t.includes("anschließen") || t.includes("anschliessen"))) return { gewerk: "Entwässerung", leistungsart: "Straßenablauf anschließen", bauverfahren: "Straßenablauf anschließen" };
  if (t.includes("straßenablauf") || t.includes("strassenablauf") || t.includes("sinkkasten")) return { gewerk: "Entwässerung", leistungsart: "Straßenablauf setzen", bauverfahren: "Straßenablauf setzen" };
  if (t.includes("ablaufaufsatz") || t.includes("gussrost") || t.includes("rost setzen")) return { gewerk: "Entwässerung", leistungsart: "Ablaufaufsatz setzen", bauverfahren: "Ablaufaufsatz / Rost setzen" };

  if (t.includes("kabelschacht") && (t.includes("gross") || t.includes("groß") || t.includes("groesser") || t.includes("größer"))) return { gewerk: "Kabelschacht", leistungsart: "Kabelschacht groß setzen", bauverfahren: "Kabelschacht groß liefern und setzen" };
  if (t.includes("kabelschacht") || t.includes("kleinschacht")) return { gewerk: "Kabelschacht", leistungsart: "Kabelschacht klein setzen", bauverfahren: "Kabelschacht klein liefern und setzen" };
  if (t.includes("kunststoffschacht")) return { gewerk: "Schächte", leistungsart: "Kunststoffschacht setzen", bauverfahren: "Kunststoffschacht setzen" };
  if (t.includes("betonschacht")) return { gewerk: "Schächte", leistungsart: "Betonschacht setzen", bauverfahren: "Betonschacht setzen" };


  // BLOCK_C_ERDARBEITEN_PARSER_FIX
  // BLOCK_C_EXACT_OVERRIDE
  if (t.includes("grabenverbau") || t.includes("verbaukasten") || (t.includes("verbau") && t.includes("graben"))) {
    return { gewerk: "Verbau", leistungsart: "Grabenverbau herstellen", bauverfahren: "Grabenverbau herstellen" };
  }

  if ((t.includes("grundwasser") || t.includes("bauwasser")) && t.includes("abpumpen")) {
    return { gewerk: "Wasserhaltung", leistungsart: "Bauwasser abpumpen", bauverfahren: "Bauwasser / Grundwasser abpumpen" };
  }

  if (t.includes("baugrube") && (t.includes("aushub") || t.includes("ausheben") || t.includes("lösen") || t.includes("loesen"))) return { gewerk: "Erdarbeiten", leistungsart: "Baugrube ausheben", bauverfahren: "Baugrube ausheben / Boden lösen und laden" };
  if ((t.includes("graben") || t.includes("leitungsgraben") || t.includes("rohrgraben") || t.includes("kabelgraben")) && (t.includes("ausheben") || t.includes("aushub") || t.includes("herstellen"))) return { gewerk: "Erdarbeiten", leistungsart: "Graben ausheben", bauverfahren: "Graben ausheben / Leitungsgraben herstellen" };
  if (t.includes("oberboden") || t.includes("humus") || t.includes("boden abtragen")) return { gewerk: "Erdarbeiten", leistungsart: "Bodenabtrag", bauverfahren: "Oberboden / Boden abtragen" };
  if (t.includes("bodenaustausch") || t.includes("boden austauschen")) return { gewerk: "Erdarbeiten", leistungsart: "Bodenaustausch herstellen", bauverfahren: "Bodenaustausch herstellen" };

  if (t.includes("grabenverbau") || t.includes("verbaukasten") || (t.includes("verbau") && t.includes("graben"))) return { gewerk: "Verbau", leistungsart: "Grabenverbau herstellen", bauverfahren: "Grabenverbau herstellen" };
  if (t.includes("spundwand")) return { gewerk: "Verbau", leistungsart: "Spundwand herstellen", bauverfahren: "Spundwand herstellen" };
  if (t.includes("bohrträgerverbau") || t.includes("bohrtraegerverbau") || t.includes("berliner verbau") || t.includes("bohlträgerverbau")) return { gewerk: "Verbau", leistungsart: "Bohrträgerverbau herstellen", bauverfahren: "Bohrträgerverbau / Berliner Verbau herstellen" };

  if (t.includes("wasserhaltung") || (t.includes("pumpe") && (t.includes("wasser") || t.includes("baugrube")))) return { gewerk: "Wasserhaltung", leistungsart: "Wasserhaltung herstellen", bauverfahren: "Wasserhaltung mit Pumpe herstellen" };
  if ((t.includes("grundwasser") || t.includes("bauwasser")) && t.includes("abpumpen")) return { gewerk: "Wasserhaltung", leistungsart: "Bauwasser abpumpen", bauverfahren: "Bauwasser / Grundwasser abpumpen" };

  if (t.includes("boden z0")) return { gewerk: "Entsorgung", leistungsart: "Boden Z0 entsorgen", bauverfahren: "Boden Z0 entsorgen" };
  if (t.includes("boden z1")) return { gewerk: "Entsorgung", leistungsart: "Boden Z1 entsorgen", bauverfahren: "Boden Z1 entsorgen" };
  if (t.includes("boden z2")) return { gewerk: "Entsorgung", leistungsart: "Boden Z2 entsorgen", bauverfahren: "Boden Z2 entsorgen" };
  if (t.includes("bauschutt")) return { gewerk: "Entsorgung", leistungsart: "Bauschutt entsorgen", bauverfahren: "Bauschutt entsorgen" };
  if (t.includes("betonaufbruch") || (t.includes("beton") && t.includes("entsorgen"))) return { gewerk: "Entsorgung", leistungsart: "Beton entsorgen", bauverfahren: "Betonaufbruch entsorgen" };

  if (t.includes("lagenweise") && (t.includes("verdichten") || t.includes("verfüllen") || t.includes("verfuellen"))) return { gewerk: "Verfüllung / Verdichtung", leistungsart: "Lagenweise verfüllen und verdichten", bauverfahren: "Lagenweise verfüllen und verdichten" };
  if (t.includes("verfüllen") || t.includes("verfuellen") || t.includes("verfüllung") || t.includes("verfuellung")) return { gewerk: "Verfüllung", leistungsart: "Verfüllung herstellen", bauverfahren: "Graben / Baugrube verfüllen" };

  if (t.includes("füllsand") || t.includes("fuellsand")) return { gewerk: "Material Lieferung", leistungsart: "Füllsand liefern", bauverfahren: "Füllsand liefern und einbauen" };
  if (t.includes("kies liefern") || (t.includes("kies") && t.includes("einbauen"))) return { gewerk: "Material Lieferung", leistungsart: "Kies liefern", bauverfahren: "Kies liefern und einbauen" };
  if (t.includes("schotter liefern") || (t.includes("schotter") && t.includes("einbauen"))) return { gewerk: "Material Lieferung", leistungsart: "Schotter liefern", bauverfahren: "Schotter liefern und einbauen" };
  if (t.includes("recyclingmaterial") || t.includes("rc-material") || t.includes("rc material")) return { gewerk: "Material Lieferung", leistungsart: "Recyclingmaterial liefern", bauverfahren: "Recyclingmaterial liefern und einbauen" };


  // BLOCK_B_STRASSENBAU_PARSER_FIX
  // BLOCK_B_EXACT_OVERRIDE
  if (t.includes("pflaster aufnehmen") || (t.includes("pflaster") && (t.includes("aufnehmen") || t.includes("ausbauen") || t.includes("seitlich lagern")))) {
    return { gewerk: "Straßenbau / Aufbruch", leistungsart: "Pflaster aufnehmen", bauverfahren: "Pflaster aufnehmen und seitlich lagern" };
  }

  if (t.includes("pflasterrinne")) {
    return { gewerk: "Straßenbau / Rinnen", leistungsart: "Pflasterrinne herstellen", bauverfahren: "Pflasterrinne herstellen" };
  }

  if (t.includes("natursteinpflaster") || t.includes("granitpflaster") || t.includes("kleinsteinpflaster")) {
    return { gewerk: "Straßenbau / Pflaster", leistungsart: "Natursteinpflaster verlegen", bauverfahren: "Natursteinpflaster verlegen" };
  }

  if (t.includes("betonpflaster")) {
    return { gewerk: "Straßenbau / Pflaster", leistungsart: "Betonpflaster verlegen", bauverfahren: "Betonpflaster liefern und verlegen" };
  }

  if (t.includes("feinplanum") || t.includes("planum") || t.includes("planie")) {
    return { gewerk: "Erdarbeiten / Planum", leistungsart: "Planum herstellen", bauverfahren: "Planum herstellen" };
  }

  if (t.includes("asphaltbinderschicht") || (t.includes("binder") && t.includes("asphalt"))) return { gewerk: "Straßenbau / Asphalt", leistungsart: "Asphaltbinderschicht herstellen", bauverfahren: "Asphaltbinderschicht herstellen" };
  if (t.includes("ausgleichsschicht") && t.includes("asphalt")) return { gewerk: "Straßenbau / Asphalt", leistungsart: "Asphalt-Ausgleichsschicht herstellen", bauverfahren: "Asphalt-Ausgleichsschicht herstellen" };
  if ((t.includes("asphalt") && t.includes("handeinbau")) || (t.includes("asphalt") && t.includes("kleinfläche"))) return { gewerk: "Straßenbau / Asphalt", leistungsart: "Asphalt Kleinfläche herstellen", bauverfahren: "Asphalt Kleinfläche von Hand herstellen" };

  // X83_OBERBAU_AUFBRUCH_GROSSFLAECHE_FORCE
  if (
    (
      t.includes("gebundenen ober") ||
      t.includes("gebundener ober") ||
      t.includes("gebundene ober") ||
      t.includes("oberbau") ||
      t.includes("ober bau") ||
      t.includes("ober- bau")
    ) &&
    t.includes("aufbrechen")
  ) {
    return {
      gewerk: "Straßenbau / Aufbruch",
      leistungsart: "Gebundener Oberbau aufbrechen",
      bauverfahren: "Gebundener Oberbau aufbrechen Großfläche",
    };
  }

  if (t.includes("asphalt") && (t.includes("aufbrechen") || t.includes("aufnehmen") || t.includes("ausbauen"))) return { gewerk: "Straßenbau / Aufbruch", leistungsart: "Asphaltaufbruch herstellen", bauverfahren: "Asphaltfläche aufbrechen und aufnehmen" };
  if (t.includes("pflaster") && (t.includes("aufnehmen") || t.includes("ausbauen") || t.includes("seitlich lagern"))) return { gewerk: "Straßenbau / Aufbruch", leistungsart: "Pflaster aufnehmen", bauverfahren: "Pflaster aufnehmen und seitlich lagern" };
  if (t.includes("beton") && (t.includes("aufbrechen") || t.includes("aufnehmen") || t.includes("ausbauen"))) return { gewerk: "Straßenbau / Aufbruch", leistungsart: "Betonfläche aufbrechen", bauverfahren: "Betonfläche aufbrechen und aufnehmen" };

  if (t.includes("natursteinpflaster") || t.includes("granitpflaster") || t.includes("kleinsteinpflaster")) return { gewerk: "Straßenbau / Pflaster", leistungsart: "Natursteinpflaster verlegen", bauverfahren: "Natursteinpflaster verlegen" };
  if (t.includes("betonplatten") || t.includes("plattenbelag") || (t.includes("platten") && t.includes("verlegen"))) return { gewerk: "Straßenbau / Platten", leistungsart: "Betonplatten verlegen", bauverfahren: "Betonplatten liefern und verlegen" };
  if (t.includes("betonpflaster") || (t.includes("pflaster") && (t.includes("verlegen") || t.includes("herstellen")))) return { gewerk: "Straßenbau / Pflaster", leistungsart: "Betonpflaster verlegen", bauverfahren: "Betonpflaster liefern und verlegen" };

  if (t.includes("hochbord")) return { gewerk: "Straßenbau / Bord", leistungsart: "Hochbordstein setzen", bauverfahren: "Hochbordstein liefern und setzen" };
  if (t.includes("tiefbord")) return { gewerk: "Straßenbau / Bord", leistungsart: "Tiefbordstein setzen", bauverfahren: "Tiefbordstein liefern und setzen" };
  if (t.includes("rundbord")) return { gewerk: "Straßenbau / Bord", leistungsart: "Rundbordstein setzen", bauverfahren: "Rundbordstein liefern und setzen" };

  if (t.includes("pflasterrinne")) return { gewerk: "Straßenbau / Rinnen", leistungsart: "Pflasterrinne herstellen", bauverfahren: "Pflasterrinne herstellen" };
  if (t.includes("betonrinne") || t.includes("entwässerungsrinne") || t.includes("entwaesserungsrinne")) return { gewerk: "Straßenbau / Rinnen", leistungsart: "Betonrinne herstellen", bauverfahren: "Betonrinne / Entwässerungsrinne herstellen" };

  if (t.includes("fahrbahnmarkierung") || (t.includes("markierung") && t.includes("linie"))) return { gewerk: "Straßenbau / Markierung", leistungsart: "Fahrbahnmarkierung herstellen", bauverfahren: "Fahrbahnmarkierung Linie herstellen" };
  if (t.includes("verkehrsschild") || t.includes("beschilderung") || t.includes("schild setzen")) return { gewerk: "Straßenbau / Beschilderung", leistungsart: "Verkehrsschild setzen", bauverfahren: "Verkehrsschild liefern und setzen" };

  if (t.includes("bankett")) return { gewerk: "Straßenbau / Nebenflächen", leistungsart: "Bankett herstellen", bauverfahren: "Bankett herstellen" };
  if (t.includes("mulde") || t.includes("entwässerungsmulde") || t.includes("entwaesserungsmulde")) return { gewerk: "Straßenbau / Nebenflächen", leistungsart: "Mulde herstellen", bauverfahren: "Mulde profilieren / herstellen" };
  if (t.includes("rasenansaat") || t.includes("ansaat")) return { gewerk: "Straßenbau / Nebenflächen", leistungsart: "Rasenansaat herstellen", bauverfahren: "Rasenansaat herstellen" };

  if (t.includes("sauberkeitsschicht") || t.includes("magerbeton")) return { gewerk: "Betonbau", leistungsart: "Sauberkeitsschicht herstellen", bauverfahren: "Sauberkeitsschicht herstellen" };
  if (t.includes("feinplanum") || t.includes("planum") || t.includes("planie")) return { gewerk: "Erdarbeiten / Planum", leistungsart: "Planum herstellen", bauverfahren: "Planum herstellen" };
  if (t.includes("verdichten") || t.includes("verdichtung")) return { gewerk: "Erdarbeiten / Verdichtung", leistungsart: "Untergrund verdichten", bauverfahren: "Untergrund verdichten" };


  // BLOCK_A_VERSORGUNG_PARSER_FIX
  if (t.includes("lichtmast") || t.includes("beleuchtungsmast") || t.includes("straßenbeleuchtung") || t.includes("strassenbeleuchtung")) {
    if (t.includes("fundament")) return { gewerk: "Tiefbau / Straßenbeleuchtung", leistungsart: "Lichtmast Fundament herstellen", bauverfahren: "Lichtmast Fundament herstellen" };
    if (t.includes("anschluss") || t.includes("anschließen") || t.includes("anschliessen")) return { gewerk: "Tiefbau / Straßenbeleuchtung", leistungsart: "Straßenbeleuchtung anschließen", bauverfahren: "Straßenbeleuchtung anschließen" };
    return { gewerk: "Tiefbau / Straßenbeleuchtung", leistungsart: "Lichtmast setzen", bauverfahren: "Lichtmast setzen" };
  }

  if (t.includes("telekom") && (t.includes("kabelzug") || t.includes("einziehen"))) return { gewerk: "Tiefbau / Telekom", leistungsart: "Telekom-Kabelzug herstellen", bauverfahren: "Telekom-Kabel in Rohr einziehen" };
  if (t.includes("telekom") && t.includes("muffe")) return { gewerk: "Tiefbau / Telekom", leistungsart: "Telekom-Muffe herstellen", bauverfahren: "Telekom-Muffe herstellen" };
  if ((t.includes("telekom") || t.includes("mfg")) && (t.includes("schrank") || t.includes("verteilerschrank"))) return { gewerk: "Tiefbau / Telekom", leistungsart: "Telekom-Verteilerschrank setzen", bauverfahren: "Telekom-Verteilerschrank setzen" };

  if (t.includes("fernwärme") || t.includes("fernwaerme") || t.includes("wärmeleitung") || t.includes("waermeleitung")) {
    if (t.includes("hausanschluss")) return { gewerk: "Tiefbau / Fernwärme", leistungsart: "Fernwärme-Hausanschluss herstellen", bauverfahren: "Fernwärme-Hausanschluss herstellen" };
    if (t.includes("druckprüfung") || t.includes("druckpruefung") || t.includes("druckprobe")) return { gewerk: "Tiefbau / Fernwärme", leistungsart: "Druckprüfung Fernwärmeleitung", bauverfahren: "Druckprüfung Fernwärmeleitung" };
    return { gewerk: "Tiefbau / Fernwärme", leistungsart: "Fernwärmerohr verlegen", bauverfahren: "Fernwärmerohr verlegen" };
  }

  if (t.includes("druckleitung") && (t.includes("abwasser") || t.includes("schmutzwasser"))) return { gewerk: "Tiefbau / Abwasser", leistungsart: "Abwasser-Druckleitung verlegen", bauverfahren: "Abwasser-Druckleitung PE verlegen" };
  if (t.includes("pumpenschacht") || t.includes("pumpschacht")) return { gewerk: "Tiefbau / Pumpentechnik", leistungsart: "Pumpenschacht setzen", bauverfahren: "Pumpenschacht setzen" };
  if (t.includes("hebeanlage")) return { gewerk: "Tiefbau / Pumpentechnik", leistungsart: "Hebeanlage einbauen", bauverfahren: "Hebeanlage einbauen" };

  if (t.includes("absperrschieber") || t.includes("schieber")) return { gewerk: "Tiefbau / Armaturen", leistungsart: "Schieber einbauen", bauverfahren: "Schieber / Absperrschieber einbauen" };
  if (t.includes("ventil") || t.includes("klappe")) return { gewerk: "Tiefbau / Armaturen", leistungsart: "Ventil / Klappe einbauen", bauverfahren: "Ventil / Klappe einbauen" };

  if (t.includes("kernbohrung") || t.includes("rohrdurchführung") || t.includes("rohrdurchfuehrung") || t.includes("mauerdurchführung") || t.includes("mauerdurchfuehrung")) return { gewerk: "Tiefbau / Hauseinführung", leistungsart: "Rohrdurchführung herstellen", bauverfahren: "Kernbohrung / Rohrdurchführung herstellen" };
  if (t.includes("mehrsparten") || t.includes("hauseinführung") || t.includes("hauseinfuehrung")) return { gewerk: "Tiefbau / Hauseinführung", leistungsart: "Hauseinführung herstellen", bauverfahren: "Mehrsparten-Hauseinführung herstellen" };

  if (t.includes("trasse abstecken") || t.includes("absteckung")) return { gewerk: "Vermessung", leistungsart: "Trasse abstecken", bauverfahren: "Trasse abstecken" };
  if (t.includes("bestandsplan") || t.includes("as-built") || t.includes("as built")) return { gewerk: "Dokumentation", leistungsart: "Bestandsdokumentation erstellen", bauverfahren: "Bestandsplan / As-Built Dokumentation erstellen" };
  if (t.includes("leitungsortung") || t.includes("leitung orten") || t.includes("ortung")) return { gewerk: "Vermessung", leistungsart: "Leitungsortung durchführen", bauverfahren: "Leitungsortung durchführen" };


  if (
    t.includes("asphalt") &&
    (t.includes("schneiden") || t.includes("trennen") || t.includes("einschneiden"))
  ) {
    return {
      gewerk: "Straßenbau / Asphalt",
      leistungsart: "Asphalt schneiden",
      bauverfahren: "Asphalt schneiden / trennen",
    };
  }

  if (
    t.includes("asphalt") &&
    (t.includes("fraesen") || t.includes("fräsen") || t.includes("abfraesen") || t.includes("abfräsen") || t.includes("aufnehmen"))
  ) {
    return {
      gewerk: "Straßenbau / Asphalt",
      leistungsart: "Asphalt fräsen / aufnehmen",
      bauverfahren: "Asphaltfläche fräsen / aufnehmen",
    };
  }

  if (
    t.includes("asphalt") &&
    (t.includes("deckschicht") || t.includes("ac 11") || t.includes("ac11") || t.includes("ac 8") || t.includes("ac8"))
  ) {
    return {
      gewerk: "Straßenbau / Asphalt",
      leistungsart: "Asphaltdeckschicht herstellen",
      bauverfahren: "Asphaltdeckschicht herstellen",
    };
  }

  if (
    t.includes("asphalt") &&
    (t.includes("tragschicht") || t.includes("ac 22") || t.includes("ac22") || t.includes("ac 32") || t.includes("ac32"))
  ) {
    return {
      gewerk: "Straßenbau / Asphalt",
      leistungsart: "Asphalttragschicht herstellen",
      bauverfahren: "Asphalttragschicht herstellen",
    };
  }

  if (
    t.includes("stromkabel") ||
    t.includes("erdkabel") ||
    t.includes("nyy")
  ) {
    return {
      gewerk: "Tiefbau / Strom",
      leistungsart: "Stromkabel verlegen",
      bauverfahren: "Stromkabel / Erdkabel verlegen",
    };
  }

  if (
    t.includes("kabelzug") ||
    t.includes("kabel ziehen") ||
    t.includes("einziehen")
  ) {
    return {
      gewerk: "Tiefbau / Strom",
      leistungsart: "Kabelzug herstellen",
      bauverfahren: "Kabel in Leerrohr einziehen",
    };
  }

  if (
    t.includes("leerrohr") &&
    (t.includes("strom") || t.includes("stromleitung"))
  ) {
    return {
      gewerk: "Tiefbau / Strom",
      leistungsart: "Leerrohr verlegen",
      bauverfahren: "Leerrohr Strom verlegen",
    };
  }

  if (
    t.includes("kabelmuffe") ||
    t.includes("verbindungsmuffe")
  ) {
    return {
      gewerk: "Tiefbau / Strom",
      leistungsart: "Kabelmuffe herstellen",
      bauverfahren: "Kabelmuffe / Verbindungsmuffe herstellen",
    };
  }

  if (
    t.includes("kabelverteilerschrank") ||
    t.includes("kvz")
  ) {
    return {
      gewerk: "Tiefbau / Strom",
      leistungsart: "Kabelverteilerschrank setzen",
      bauverfahren: "Kabelverteilerschrank / KVZ setzen",
    };
  }

  if (
    t.includes("gas") &&
    t.includes("hausanschluss")
  ) {
    return {
      gewerk: "Tiefbau / Gasleitung",
      leistungsart: "Gas-Hausanschluss herstellen",
      bauverfahren: "Gas-Hausanschluss herstellen",
    };
  }

  if (
    (t.includes("pe-gas") || t.includes("pe gas") || t.includes("gasrohr") || t.includes("gasleitung")) &&
    (t.includes("verlegen") || t.includes("liefern") || t.includes("herstellen")) &&
    !t.includes("hausanschluss") &&
    !t.includes("druckprüfung") &&
    !t.includes("druckpruefung") &&
    !t.includes("druckprobe") &&
    !t.includes("schutzrohr")
  ) {
    return {
      gewerk: "Tiefbau / Gasleitung",
      leistungsart: "PE-Gasleitung verlegen",
      bauverfahren: "PE-Gasleitung verlegen",
    };
  }

  if (
    (t.includes("druckprüfung") || t.includes("druckpruefung") || t.includes("druckprobe")) &&
    t.includes("gas")
  ) {
    return {
      gewerk: "Tiefbau / Gasleitung",
      leistungsart: "Druckprüfung Gasleitung",
      bauverfahren: "Druckprüfung Gasleitung",
    };
  }

  if (
    t.includes("schutzrohr") &&
    t.includes("gas")
  ) {
    return {
      gewerk: "Tiefbau / Gasleitung",
      leistungsart: "Schutzrohr Gasleitung verlegen",
      bauverfahren: "Schutzrohr Gasleitung verlegen",
    };
  }

  if (
    (t.includes("wasser") || t.includes("trinkwasser")) &&
    t.includes("hausanschluss")
  ) {
    return {
      gewerk: "Tiefbau / Wasserleitung",
      leistungsart: "Wasser-Hausanschluss herstellen",
      bauverfahren: "Wasser-Hausanschluss herstellen",
    };
  }

  if (
    (t.includes("pe-rohr") || t.includes("pe rohr") || t.includes("wasserleitung") || t.includes("trinkwasser")) &&
    (t.includes("verlegen") || t.includes("liefern") || t.includes("herstellen")) &&
    !t.includes("hausanschluss")
  ) {
    return {
      gewerk: "Tiefbau / Wasserleitung",
      leistungsart: "PE-Wasserleitung verlegen",
      bauverfahren: "PE-Wasserleitung verlegen",
    };
  }

  if (
    t.includes("hydrant") ||
    t.includes("unterflurhydrant") ||
    t.includes("oberflurhydrant")
  ) {
    return {
      gewerk: "Tiefbau / Wasserleitung",
      leistungsart: "Hydrant einbauen",
      bauverfahren: "Hydrant einbauen",
    };
  }

  if (
    t.includes("druckprüfung") ||
    t.includes("druckpruefung") ||
    t.includes("druckprobe")
  ) {
    return {
      gewerk: "Tiefbau / Wasserleitung",
      leistungsart: "Druckprüfung Wasserleitung",
      bauverfahren: "Druckprüfung Wasserleitung",
    };
  }

  if (
    t.includes("microtrenching") &&
    (t.includes("komplett") || t.includes("verfüllung") || t.includes("verfuellung"))
  ) {
    return {
      gewerk: "Tiefbau / Glasfaser",
      leistungsart: "Microtrenching komplett",
      bauverfahren: "Microtrenching komplett inkl. Verfüllung",
    };
  }

  if (
    t.includes("microtrenching") ||
    (t.includes("schlitz") && t.includes("glasfaser"))
  ) {
    return {
      gewerk: "Tiefbau / Glasfaser",
      leistungsart: "Microtrenching schneiden",
      bauverfahren: "Microtrenching schneiden",
    };
  }

  if (
    t.includes("einblasen") ||
    t.includes("glasfaserkabel") ||
    t.includes("lwl")
  ) {
    return {
      gewerk: "Tiefbau / Glasfaser",
      leistungsart: "Glasfaserkabel einblasen",
      bauverfahren: "Glasfaserkabel einblasen",
    };
  }

  if (
    t.includes("glasfaser") &&
    t.includes("hausanschluss")
  ) {
    return {
      gewerk: "Tiefbau / Glasfaser",
      leistungsart: "Glasfaser-Hausanschluss herstellen",
      bauverfahren: "Glasfaser-Hausanschluss Tiefbau",
    };
  }

  if (
    t.includes("kabelzugschacht") ||
    t.includes("muffenschacht")
  ) {
    return {
      gewerk: "Tiefbau / Glasfaser",
      leistungsart: "Kabelzugschacht setzen",
      bauverfahren: "Kabelzugschacht / Muffenschacht setzen",
    };
  }

  if (
    t.includes("warnband") ||
    t.includes("trassenband") ||
    t.includes("trassenwarnband") ||
    t.includes("leitungsschutzband")
  ) {
    return {
      gewerk: "Tiefbau / Leitungsschutz",
      leistungsart: "Warnband verlegen",
      bauverfahren: "Warnband / Trassenband verlegen",
    };
  }

  if (
    t.includes("drainagerohr") ||
    t.includes("drainage rohr") ||
    t.includes("sickerleitung")
  ) {
    return {
      gewerk: "Tiefbau / Drainage",
      leistungsart: "Drainagerohr verlegen",
      bauverfahren: "Drainagerohr DN100 verlegen",
    };
  }

  if (
    t.includes("filtervlies") ||
    t.includes("geotextil") ||
    t.includes("vlies")
  ) {
    return {
      gewerk: "Tiefbau / Drainage",
      leistungsart: "Vlies verlegen",
      bauverfahren: "Filtervlies / Geotextil verlegen",
    };
  }

  if (
    t.includes("sickerschicht") ||
    t.includes("filterkies") ||
    t.includes("sickerkies") ||
    t.includes("drainagekies")
  ) {
    return {
      gewerk: "Tiefbau / Drainage",
      leistungsart: "Drainageschicht herstellen",
      bauverfahren: "Filterkies / Drainagekies einbauen",
    };
  }

  if (
    t.includes("kontrollschacht") ||
    t.includes("kanalschacht") ||
    t.includes("betonschacht")
  ) {
    return {
      gewerk: "Tiefbau / Kanal",
      leistungsart: "Kontrollschacht setzen",
      bauverfahren: "Kontrollschacht setzen",
    };
  }

  if (
    t.includes("schachtanschluss") ||
    t.includes("rohranschluss") ||
    t.includes("anschluss schacht")
  ) {
    return {
      gewerk: "Tiefbau / Kanal",
      leistungsart: "Schachtanschluss herstellen",
      bauverfahren: "Schachtanschluss herstellen",
    };
  }

  if (
    t.includes("dichtheitsprüfung") ||
    t.includes("dichtheitspruefung") ||
    t.includes("kanalprüfung") ||
    t.includes("kanalpruefung")
  ) {
    return {
      gewerk: "Tiefbau / Prüfung",
      leistungsart: "Dichtheitsprüfung Kanal",
      bauverfahren: "Dichtheitsprüfung Kanal",
    };
  }

  if (
    t.includes("kamerabefahrung") ||
    t.includes("kanal tv") ||
    t.includes("kanal-tv")
  ) {
    return {
      gewerk: "Tiefbau / Prüfung",
      leistungsart: "Kamerabefahrung Kanal",
      bauverfahren: "Kamerabefahrung Kanal",
    };
  }

  if (
    t.includes("kg rohr") ||
    t.includes("kg/pvc") ||
    t.includes("pvc rohr") ||
    t.includes("kanalrohr") ||
    t.includes("entwaesserungsleitung") ||
    t.includes("entwässerungsleitung") ||
    (
      (t.includes("abwasser") || t.includes("regenwasser") || t.includes("kanal")) &&
      (t.includes("dn100") || t.includes("dn 100") || t.includes("dn125") || t.includes("dn 125") || t.includes("dn150") || t.includes("dn 150") || t.includes("dn200") || t.includes("dn 200"))
    )
  ) {
    return {
      gewerk: "Tiefbau / Kanal",
      leistungsart: "KG/PVC Rohr verlegen",
      bauverfahren: "KG/PVC Rohr verlegen",
    };
  }

  if (
    t.includes("bordstein") ||
    t.includes("randstein") ||
    t.includes("tiefbord") ||
    t.includes("hochbord") ||
    t.includes("leistenstein")
  ) {
    return {
      gewerk: "Tiefbau / Bordstein",
      leistungsart: "Bordstein setzen",
      bauverfahren: t.includes("hochbord")
        ? "Hochbordstein setzen"
        : t.includes("tiefbord")
          ? "Tiefbordstein setzen"
          : "Bordstein / Randstein setzen",
    };
  }

  if (
    t.includes("entwaesserungsrinne") ||
    t.includes("entwässerungsrinne") ||
    t.includes("ablaufrinne") ||
    t.includes("rinne")
  ) {
    return {
      gewerk: "Tiefbau / Entwässerung",
      leistungsart: "Entwässerungsrinne herstellen",
      bauverfahren: "Entwässerungsrinne DN100 setzen",
    };
  }

  if (
    t.includes("strassenablauf") ||
    t.includes("straßenablauf") ||
    t.includes("sinkkasten") ||
    t.includes("gully")
  ) {
    return {
      gewerk: "Tiefbau / Entwässerung",
      leistungsart: "Straßenablauf setzen",
      bauverfahren: "Straßenablauf / Sinkkasten setzen",
    };
  }

  if (t.includes("hofablauf")) {
    return {
      gewerk: "Tiefbau / Entwässerung",
      leistungsart: "Hofablauf setzen",
      bauverfahren: "Hofablauf setzen",
    };
  }

  if (t.includes("sickerschacht")) {
    return {
      gewerk: "Tiefbau / Entwässerung",
      leistungsart: "Sickerschacht herstellen",
      bauverfahren: "Sickerschacht herstellen",
    };
  }

  /*
   * Leitungsbau-Reihenfolge:
   * Spezifische Rohr-/Speedpipe-Leistungen müssen VOR Rohrgraben kommen,
   * weil im Langtext oft "im Rohrgraben verlegen" steht.
   */
  const hasInstallVerb =
    t.includes("verlegen") ||
    t.includes("einziehen") ||
    t.includes("liefern und verlegen") ||
    t.includes("montieren") ||
    t.includes("einbauen");

  const hasGrabenHerstellen =
    (t.includes("rohrgraben") || t.includes("leitungsgraben") || t.includes("kabelgraben")) &&
    (t.includes("herstellen") || t.includes("boden") || t.includes("lösen") || t.includes("loesen") || t.includes("verfüllen") || t.includes("verfuellen"));

  if (
    !hasGrabenHerstellen &&
    hasInstallVerb &&
    (t.includes("speedpipe") || t.includes("mikroduct") || t.includes("mikror") || t.includes("microrohr"))
  ) {
    return {
      gewerk: "Tiefbau / Glasfaser",
      leistungsart: "Speedpipe verlegen",
      bauverfahren: "Speedpipe / Mikrorohr verlegen",
    };
  }

  if (
    hasInstallVerb &&
    (t.includes("kabelschutzrohr") || t.includes("schutzrohr"))
  ) {
    return {
      gewerk: "Tiefbau / Kabelschutz",
      leistungsart: "Kabelschutzrohr verlegen",
      bauverfahren: "Kabelschutzrohr verlegen",
    };
  }

  if (
    t.includes("rohrgraben") ||
    t.includes("leitungsgraben") ||
    t.includes("kabelgraben")
  ) {
    return {
      gewerk: "Tiefbau / Leitungsbau",
      leistungsart: "Leitungsgraben herstellen",
      bauverfahren: "Rohrgraben / Kabelgraben herstellen",
    };
  }

  if (t.includes("rohrbettung") || t.includes("kabelsand") || t.includes("rohrsand")) {
    return {
      gewerk: "Tiefbau / Leitungsbau",
      leistungsart: "Rohrbettung herstellen",
      bauverfahren: "Rohrbettung / Kabelsand herstellen",
    };
  }

  if (t.includes("rasengitter") && (t.includes("herstellen") || t.includes("verlegen"))) {
    return {
      gewerk: "Tiefbau / Oberfläche",
      leistungsart: "Oberfläche herstellen",
      bauverfahren: "Rasengitterpflaster herstellen",
    };
  }

  if (t.includes("pflaster") && (t.includes("herstellen") || t.includes("verlegen"))) {
    return {
      gewerk: "Tiefbau / Oberfläche",
      leistungsart: "Oberfläche herstellen",
      bauverfahren: "Pflasterfläche herstellen",
    };
  }

  if (t.includes("aushub") || t.includes("auskofferung") || t.includes("boden loesen") || t.includes("boden lösen")) {
    return {
      gewerk: "Tiefbau / Erdarbeiten",
      leistungsart: "Erdarbeiten",
      bauverfahren: "Aushub / Auskofferung",
    };
  }

  if (t.includes("abfuhr") || t.includes("transport")) {
    return {
      gewerk: "Tiefbau / Logistik",
      leistungsart: "Transport",
      bauverfahren: "Abfuhr / Transport",
    };
  }

  if (t.includes("entsorgung") || t.includes("deponie")) {
    return {
      gewerk: "Tiefbau / Entsorgung",
      leistungsart: "Entsorgung",
      bauverfahren: "Entsorgung / Deponie",
    };
  }

  if (t.includes("schottertragschicht") || t.includes("schotter")) {
    return {
      gewerk: "Tiefbau / Schichten",
      leistungsart: "Schicht herstellen",
      bauverfahren: "Schottertragschicht herstellen",
    };
  }

  if (t.includes("kiestragschicht") || t.includes("filterkies")) {
    return {
      gewerk: "Tiefbau / Schichten",
      leistungsart: "Schicht herstellen",
      bauverfahren: "Kiestragschicht / Filterkies herstellen",
    };
  }

  if (t.includes("frostschutz") || t.includes("frostschutzschicht")) {
    return {
      gewerk: "Tiefbau / Schichten",
      leistungsart: "Schicht herstellen",
      bauverfahren: "Frostschutzschicht korrigieren",
    };
  }

  if (t.includes("tragschicht")) {
    return {
      gewerk: "Tiefbau / Schichten",
      leistungsart: "Schicht herstellen",
      bauverfahren: "Tragschicht herstellen",
    };
  }

  if (t.includes("splitt") || t.includes("bettung") || t.includes("sandbett")) {
    return {
      gewerk: "Tiefbau / Schichten",
      leistungsart: "Bettung herstellen",
      bauverfahren: "Bettung / Splittbett / Sandbett herstellen",
    };
  }

  return {
    gewerk: "Tiefbau",
    leistungsart: "Unbekannte Leistung",
    bauverfahren: "Technisch zu prüfen",
  };
}

export function parseRlcTechnicalPosition(input: {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
}): RlcTechnicalParseResult {
  const text = `${input.kurztext || ""} ${input.langtext || ""}`;
  const t = norm(text);
  const unit = normUnit(input.einheit || "");
  const menge = n(input.menge);

  const surface = detectSurface(text);
  const soilClass = detectSoilClass(text);
  const thickness_cm = extractThicknessCm(text);
  const depth_m = extractDepth(text);
  const width_m = extractWidth(text);
  const transport_distance_km = extractTransportKm(text);

  const materialHints = detectMaterialHints(text);
  const riskHints = detectRiskHints(text);
  const detected = detectLeistungsart(text);

  const isArea = unit === "m2";
  const isLength = unit === "m";
  const isVolume = unit === "m3";
  const isCount = unit === "st";

  const area_m2 = isArea ? 1 : 0;
  const length_m = isLength ? 1 : 0;
  const volume_m3 = isVolume ? 1 : 0;
  const count = isCount ? 1 : 0;

  function extractLayerCmByKeywords(keys: string[], fallbackCm = 0): number {
    const parts = t.split(" ");
    let best = 0;

    for (let i = 0; i < parts.length; i++) {
      const windowText = parts
        .slice(Math.max(0, i - 8), Math.min(parts.length, i + 10))
        .join(" ");

      const hasKey = keys.some((k) => windowText.includes(k));
      if (!hasKey) continue;

      const patterns = [
        /(\d+(?:[,.]\d+)?)\s*cm\b/,
        /d\s*[=:]?\s*(\d+(?:[,.]\d+)?)\s*cm\b/,
        /staerke\s*(?:von)?\s*(\d+(?:[,.]\d+)?)\s*cm\b/,
        /starke\s*(?:von)?\s*(\d+(?:[,.]\d+)?)\s*cm\b/,
        /dicke\s*(?:von)?\s*(\d+(?:[,.]\d+)?)\s*cm\b/,
        /(\d+(?:[,.]\d+)?)\s*m\b/,
      ];

      for (const p of patterns) {
        const m = windowText.match(p);
        if (!m?.[1]) continue;

        const value = n(m[1]);
        if (value <= 0) continue;

        // Meter-Angaben wie 0,35 m in cm umrechnen.
        const cm = p.source.includes("\\s*m") && value <= 2 ? value * 100 : value;
        best = Math.max(best, cm);
      }
    }

    return best || fallbackCm;
  }

  function hasAnyKeyword(keys: string[]): boolean {
    return keys.some((k) => t.includes(k));
  }

  /*
   * Intelligente Default-Schichtdicken:
   * Nur verwenden, wenn das Material im LV-Text wirklich genannt wird,
   * aber keine konkrete cm/m-Angabe gefunden wurde.
   */
  const sand_cm = extractLayerCmByKeywords(
    ["sandbett", "rohrsand", "kabelsand", "rohrbettung"],
    hasAnyKeyword(["sandbett", "rohrsand", "kabelsand", "rohrbettung"]) ? 10 : 0
  );

  const splitt_cm = extractLayerCmByKeywords(
    ["splittbett", "splitt"],
    hasAnyKeyword(["splittbett", "splitt"]) ? 5 : 0
  );

  const frostschutz_cm = extractLayerCmByKeywords(
    ["frostschutz", "frostschutzschicht"],
    hasAnyKeyword(["frostschutz", "frostschutzschicht"]) ? 30 : 0
  );

  const schotter_cm = extractLayerCmByKeywords(
    ["schottertragschicht", "schotter"],
    hasAnyKeyword(["schottertragschicht", "schotter"]) ? 30 : 0
  );

  const kies_cm = extractLayerCmByKeywords(
    ["kiestragschicht"],
    hasAnyKeyword(["kiestragschicht"]) ? 30 : 0
  );

  const sand_m3_per_m2 = isArea && sand_cm > 0 ? round2(sand_cm / 100) : 0;
  const splitt_m3_per_m2 = isArea && splitt_cm > 0 ? round2(splitt_cm / 100) : 0;
  const frostschutz_m3_per_m2 = isArea && frostschutz_cm > 0 ? round2(frostschutz_cm / 100) : 0;
  const schotter_m3_per_m2 = isArea && schotter_cm > 0 ? round2(schotter_cm / 100) : 0;
  const kies_m3_per_m2 = isArea && kies_cm > 0 ? round2(kies_cm / 100) : 0;

  const layer_m3_per_m2 = round2(
    sand_m3_per_m2 +
      splitt_m3_per_m2 +
      frostschutz_m3_per_m2 +
      schotter_m3_per_m2 +
      kies_m3_per_m2
  );

  const trenchWidth_m = width_m > 0 ? width_m : 0.4;

  const isTrenchText =
    t.includes("rohrgraben") ||
    t.includes("leitungsgraben") ||
    t.includes("kabelgraben") ||
    t.includes("graben");

  const trench_m3_per_m =
    isLength && isTrenchText && depth_m > 0
      ? round2(depth_m * trenchWidth_m)
      : 0;

  const bedding_sand_m3_per_m =
    isLength && sand_cm > 0
      ? round2((sand_cm / 100) * trenchWidth_m)
      : 0;

  const backfill_m3_per_m =
    trench_m3_per_m > 0
      ? round2(Math.max(trench_m3_per_m - bedding_sand_m3_per_m, 0))
      : 0;

  const wantsSurfaceRestore =
    isLength &&
    (
      t.includes("wiederherstellen") ||
      t.includes("wieder einbauen") ||
      t.includes("ansaeen") ||
      t.includes("ansäen") ||
      t.includes("oberboden") ||
      t.includes("rasen")
    );

  const surface_m2_per_m =
    wantsSurfaceRestore && surface !== "UNKNOWN"
      ? round2(trenchWidth_m)
      : 0;

  const explicitAuskofferungCm = extractLayerCmByKeywords(
    ["auskofferung", "aushub", "ausheben", "boden abtragen", "boden loesen", "boden lösen"],
    0
  );

  const excludesAushub =
    t.includes("ohne aushub") ||
    t.includes("ohne auskofferung") ||
    t.includes("aushub bauseits") ||
    t.includes("auskofferung bauseits") ||
    t.includes("aushub separat") ||
    t.includes("auskofferung separat") ||
    t.includes("aushub gesondert") ||
    t.includes("auskofferung gesondert");

  const hasExplicitAushub =
    !excludesAushub &&
    (
      t.includes("auskofferung") ||
      t.includes("aushub") ||
      t.includes("ausheben") ||
      t.includes("boden abtragen") ||
      t.includes("boden loesen") ||
      t.includes("boden lösen")
    );

  /*
   * Aushublogik:
   * - Nur Splitt/Sand/Frostschutz erzeugt NICHT automatisch 30 cm Aushub.
   * - Aushub entsteht nur bei ausdrücklich genanntem Aushub/Auskofferung.
   * - Wenn Auskofferung ohne cm genannt ist, nehmen wir den erkannten Schichtaufbau,
   *   mindestens aber 30 cm als technische Mindestannahme.
   */
  const aushub_m3_per_m2 =
    isArea && hasExplicitAushub
      ? round2(
          explicitAuskofferungCm > 0
            ? explicitAuskofferungCm / 100
            : Math.max(layer_m3_per_m2, 0.3)
        )
      : 0;

  const disposal_t_per_m2 =
    aushub_m3_per_m2 > 0 ? round2(aushub_m3_per_m2 * 1.8) : 0;

  const tags = Array.from(
    new Set([
      detected.gewerk,
      detected.leistungsart,
      detected.bauverfahren,
      surface,
      soilClass,
      ...materialHints,
      ...riskHints,
    ].filter(Boolean))
  );

  let confidence = 0.45;
  if (detected.leistungsart !== "Unbekannte Leistung") confidence += 0.25;
  if (surface !== "UNKNOWN") confidence += 0.1;
  if (materialHints.length) confidence += 0.1;
  if (thickness_cm > 0 || depth_m > 0 || width_m > 0 || transport_distance_km > 0) confidence += 0.1;

  return {
    ...detected,
    surface,
    soilClass,

    length_m,
    area_m2,
    volume_m3,
    count,

    depth_m,
    width_m,
    thickness_cm,

    layer_m3_per_m2,

    sand_m3_per_m2,
    splitt_m3_per_m2,
    frostschutz_m3_per_m2,
    schotter_m3_per_m2,
    kies_m3_per_m2,

    aushub_m3_per_m2,
    disposal_t_per_m2,

    trench_m3_per_m,
    bedding_sand_m3_per_m,
    backfill_m3_per_m,
    surface_m2_per_m,

    transport_distance_km,

    materialHints,
    riskHints,
    tags,

    confidence: Math.min(0.98, round2(confidence)),
  };
}
