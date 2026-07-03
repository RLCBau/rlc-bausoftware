// apps/web/src/pages/kalkulation/workTypeLibrary.ts

export type WorkTypeKey =
  | "planie"
  | "asphalt_fraesen"
  | "asphalt_herstellen"
  | "asphalt_aufbrechen_entsorgen"
  | "pflaster_verlegen"
  | "pflaster_aufnehmen"
  | "kies_tragschicht"
  | "frostschutz"
  | "auskofferung"
  | "auffuellung"
  | "leitung_graben"
  | "rohr_verlegen"
  | "schacht_setzen"
  | "bordstein"
  | "entsorgung"
  | "unknown";

export type WorkTypeDetection = {
  key: WorkTypeKey;
  confidence: number;
  ambiguous: boolean;
  title: string;
  message?: string;
  alternatives?: string[];
};

export type WorkTypeProfile = {
  key: WorkTypeKey;
  title: string;
  synonyms: string[];
  typicalUnits: string[];
  allowedResourceIds: string[];
  forbiddenResourceIds: string[];
  forbiddenGroups: string[];
  forbiddenWords: string[];
  defaultDailyOutput: number;

  /**
   * Technische Leitplanken für spätere Preislogik.
   * Werden aktuell noch nicht überall verwendet, sind aber bewusst vorbereitet.
   */
  minUnitPrice?: number;
  targetUnitPriceRange?: [number, number];
  typicalDepthM?: [number, number];
  requiresClarificationWords?: string[];
  examples?: string[];
  forceLocalCalculation?: boolean;
};

function norm(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[.,;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  const t = norm(text);
  return words.some((w) => t.includes(norm(w)));
}

function exactOrShortGeneric(kurz: string, values: string[]): boolean {
  const k = norm(kurz);
  return values.some((v) => k === norm(v));
}

export const WORK_TYPE_PROFILES: WorkTypeProfile[] = [
  {
    key: "planie",
    title: "Planie / Feinplanum herstellen",
    synonyms: [
      "planie",
      "planie herstellen",
      "planum",
      "planum herstellen",
      "feinplanum",
      "feinplanum herstellen",
      "untergrund profilieren",
      "untergrund abziehen",
      "untergrund herstellen",
      "oberfläche profilieren",
      "flaeche profilieren",
      "profilgerecht herstellen",
      "niveau herstellen",
      "höhenlage herstellen",
      "hoehenlage herstellen",
      "erdplanum",
      "planum fein herstellen",
      "rohplanum nacharbeiten",
    ],
    typicalUnits: ["m²"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RADLADER",
      "M-WALZE",
      "M-RUETTELPLATTE",
      "Z-LEISTUNG",
      "Z-BAUZEIT",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: [
      "MAT-FROSTSCHUTZ-032",
      "MAT-FROSTSCHUTZ-045",
      "MAT-KIES",
      "MAT-SPLITT",
      "MAT-SAND",
      "T-LKW-3A",
      "T-LKW-4A",
      "T-LKW-SATTEL",
      "E-BODEN",
      "E-ASPHALT",
      "E-BAUSCHUTT",
      "E-ALTPFLASTER",
    ],
    forbiddenGroups: ["Material", "Entsorgung", "LKW / Transport"],
    forbiddenWords: [
      "frostschutz",
      "splitt",
      "kies",
      "schotter",
      "sand",
      "bodenmaterial",
      "aushub",
      "auskofferung",
      "entsorgung",
      "deponie",
      "transport",
      "abfahren",
      "liefern",
    ],
    defaultDailyOutput: 180,
    minUnitPrice: 3.5,
    targetUnitPriceRange: [3.5, 6.5],
    examples: ["Planie herstellen", "Feinplanum herstellen", "Untergrund profilieren"],
    forceLocalCalculation: true,
  },

  {
    key: "asphalt_fraesen",
    title: "Asphalt fräsen",
    synonyms: [
      "asphalt fräsen",
      "asphalt fraesen",
      "asphalt abfräsen",
      "asphalt abfraesen",
      "fräsen asphalt",
      "fraesen asphalt",
      "deckschicht fräsen",
      "deckschicht fraesen",
      "fräsgut",
      "fraesgut",
      "asphaltdeckschicht abfräsen",
      "asphalttragschicht abfräsen",
      "kaltfräsen",
      "kaltfraesen",
    ],
    typicalUnits: ["m²"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-FUGENSCHNEIDER",
      "M-RADLADER",
      "T-LKW-4A",
      "E-ASPHALT",
      "Z-LEISTUNG",
      "Z-BAUZEIT",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["MAT-ASPHALT", "MAT-FROSTSCHUTZ-032", "MAT-FROSTSCHUTZ-045"],
    forbiddenGroups: [],
    forbiddenWords: ["asphalt liefern", "asphalt einbauen", "deckschicht einbauen"],
    defaultDailyOutput: 250,
    minUnitPrice: 5,
    targetUnitPriceRange: [5, 14],
    examples: ["Asphalt fräsen 4 cm", "Asphaltdeckschicht abfräsen"],
  },

  {
    key: "asphalt_herstellen",
    title: "Asphalt herstellen / wiederherstellen",
    synonyms: [
      "asphalt herstellen",
      "asphalt wiederherstellen",
      "asphalt einbauen",
      "asphaltieren",
      "asphaltfläche herstellen",
      "asphaltflaeche herstellen",
      "asphaltfläche wiederherstellen",
      "asphaltflaeche wiederherstellen",
      "asphalttragschicht",
      "asphalttragschicht einbauen",
      "asphaltdeckschicht",
      "asphaltdeckschicht einbauen",
      "asphaltbinderschicht",
      "ac 32",
      "ac 22",
      "ac 16",
      "ac 11",
      "ac 8",
      "tragschicht asphalt",
      "deckschicht asphalt",
      "anschluss asphalt herstellen",
      "graben asphalt schließen",
      "graben asphalt schliessen",
    ],
    typicalUnits: ["m²", "t"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RADLADER",
      "M-WALZE",
      "M-FUGENSCHNEIDER",
      "MAT-ASPHALT",
      "T-LKW-4A",
      "Z-LEISTUNG",
      "Z-BAUZEIT",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["E-BODEN"],
    forbiddenGroups: [],
    forbiddenWords: ["boden entsorgen", "frostschutz liefern", "pflaster liefern"],
    defaultDailyOutput: 120,
    minUnitPrice: 28,
    targetUnitPriceRange: [35, 85],
    examples: ["Asphalttragschicht einbauen", "Asphaltdeckschicht herstellen", "Asphaltfläche wiederherstellen"],
  },

  {
    key: "asphalt_aufbrechen_entsorgen",
    title: "Asphalt aufbrechen / aufnehmen / entsorgen",
    synonyms: [
      "asphalt aufbrechen",
      "asphalt ausbauen",
      "asphalt aufnehmen",
      "asphalt abbrechen",
      "asphalt entfernen",
      "asphalt entsorgen",
      "asphaltaufbruch",
      "asphaltaufbruch entsorgen",
      "gebundene decke aufnehmen",
      "gebundene schicht aufnehmen",
      "bitumen aufbruch",
      "bituminöse schicht ausbauen",
      "bituminoese schicht ausbauen",
    ],
    typicalUnits: ["m²", "t", "m³"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-BAGGER-8T",
      "M-RADLADER",
      "T-LKW-4A",
      "E-ASPHALT",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["MAT-ASPHALT"],
    forbiddenGroups: [],
    forbiddenWords: ["asphalt liefern", "deckschicht einbauen", "tragschicht einbauen"],
    defaultDailyOutput: 90,
    minUnitPrice: 12,
    targetUnitPriceRange: [18, 45],
    examples: ["Asphalt aufnehmen und entsorgen", "Asphaltaufbruch entsorgen"],
  },

  {
    key: "pflaster_verlegen",
    title: "Pflaster / Platten / Rasengitter verlegen",
    synonyms: [
      "pflaster verlegen",
      "pflaster herstellen",
      "pflasterfläche herstellen",
      "pflasterflaeche herstellen",
      "pflaster neu verlegen",
      "verbundstein verlegen",
      "betonstein verlegen",
      "natursteinpflaster verlegen",
      "großpflaster verlegen",
      "grosspflaster verlegen",
      "kleinpflaster verlegen",
      "platten verlegen",
      "gehwegplatten verlegen",
      "rasengitter",
      "rasengitterstein",
      "rasengittersteine verlegen",
      "fugen verfüllen",
      "fugen verfuellen",
      "splittbett herstellen",
      "bettung herstellen",
      "pflasterfläche wiederherstellen",
      "pflasterflaeche wiederherstellen",
    ],
    typicalUnits: ["m²"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RUETTELPLATTE",
      "M-PFLASTERKNACKER",
      "MAT-PFLASTER-BETON-6",
      "MAT-PFLASTER-BETON-8",
      "MAT-PFLASTER-BETON-10",
      "MAT-PFLASTER-NATUR",
      "MAT-RASENGITTER",
      "MAT-SPLITT",
      "MAT-FUGENSAND",
      "T-LKW-4A",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["E-BODEN"],
    forbiddenGroups: [],
    forbiddenWords: ["aushub entsorgen", "asphalt entsorgen"],
    defaultDailyOutput: 28,
    minUnitPrice: 35,
    targetUnitPriceRange: [45, 120],
    examples: ["Pflaster verlegen", "Rasengittersteine verlegen", "Betonpflaster 8 cm herstellen"],
  },

  {
    key: "pflaster_aufnehmen",
    title: "Pflaster aufnehmen / ausbauen",
    synonyms: [
      "pflaster aufnehmen",
      "pflaster ausbauen",
      "pflaster abbrechen",
      "pflaster entfernen",
      "verbundstein aufnehmen",
      "betonpflaster aufnehmen",
      "natursteinpflaster aufnehmen",
      "platten aufnehmen",
      "gehwegplatten aufnehmen",
      "rasengitter aufnehmen",
      "pflaster rückbauen",
      "pflaster rueckbauen",
    ],
    typicalUnits: ["m²"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RADLADER",
      "T-LKW-4A",
      "E-ALTPFLASTER",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: [
      "MAT-PFLASTER-BETON-6",
      "MAT-PFLASTER-BETON-8",
      "MAT-PFLASTER-BETON-10",
      "MAT-PFLASTER-NATUR",
      "MAT-SPLITT",
      "MAT-FUGENSAND",
    ],
    forbiddenGroups: [],
    forbiddenWords: ["pflaster liefern", "pflaster verlegen", "bettung herstellen"],
    defaultDailyOutput: 80,
    minUnitPrice: 10,
    targetUnitPriceRange: [12, 35],
    examples: ["Pflaster aufnehmen", "Betonpflaster ausbauen"],
  },

  {
    key: "kies_tragschicht",
    title: "Kies- / Schottertragschicht herstellen",
    synonyms: [
      "kiestragschicht",
      "schottertragschicht",
      "tragschicht herstellen",
      "tragschicht einbauen",
      "schotter einbauen",
      "kies einbauen",
      "mineralgemisch einbauen",
      "mineralbeton einbauen",
      "rc material einbauen",
      "rc schotter einbauen",
      "schotter 0/32 einbauen",
      "schotter 0/45 einbauen",
      "kies 0/32 einbauen",
      "kies 0/45 einbauen",
      "ungebundene tragschicht",
      "scht herstellen",
      "kts herstellen",
    ],
    typicalUnits: ["m³", "m²"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RADLADER",
      "M-WALZE",
      "MAT-KIES",
      "T-LKW-4A",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["E-BODEN", "E-ASPHALT"],
    forbiddenGroups: [],
    forbiddenWords: ["entsorgen", "deponie", "asphalt liefern"],
    defaultDailyOutput: 85,
    minUnitPrice: 22,
    targetUnitPriceRange: [28, 65],
    examples: ["Kiestragschicht herstellen", "Schottertragschicht 0/32 einbauen"],
  },

  {
    key: "frostschutz",
    title: "Frostschutzschicht herstellen",
    synonyms: [
      "frostschutz",
      "frostschutzschicht",
      "frostschutzschicht herstellen",
      "frostschutzschicht einbauen",
      "frostschutzmaterial",
      "frostschutzmaterial einbauen",
      "frostschutzkies",
      "frostschutzkies einbauen",
      "fss herstellen",
      "fss einbauen",
      "frostsichere tragschicht",
    ],
    typicalUnits: ["m³", "m²"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RADLADER",
      "M-WALZE",
      "MAT-FROSTSCHUTZ-032",
      "MAT-FROSTSCHUTZ-045",
      "T-LKW-4A",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["E-BODEN", "E-ASPHALT"],
    forbiddenGroups: [],
    forbiddenWords: ["entsorgen", "deponie", "asphalt liefern"],
    defaultDailyOutput: 85,
    minUnitPrice: 25,
    targetUnitPriceRange: [32, 70],
    examples: ["Frostschutzschicht 0/45 herstellen", "Frostschutzkies liefern und einbauen"],
  },

  {
    key: "auskofferung",
    title: "Auskofferung / Aushub / Erdarbeiten",
    synonyms: [
      "auskofferung",
      "auskoffern",
      "aushub",
      "aushub herstellen",
      "boden lösen",
      "boden loesen",
      "boden lösen und laden",
      "boden loesen und laden",
      "baugrube",
      "baugrube herstellen",
      "erdarbeiten",
      "erdbewegung",
      "abtrag",
      "bodenabtrag",
      "oberboden abtragen",
      "mutterboden abtragen",
      "humus abtragen",
      "graben aushub",
      "arbeitsraum ausheben",
      "fundamentgraben",
      "kabelgraben aushub",
      "leitungsgraben aushub",
    ],
    typicalUnits: ["m³"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-BAGGER-8T",
      "M-BAGGER-15T",
      "M-BAGGER-22T",
      "T-LKW-4A",
      "E-BODEN",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["MAT-FROSTSCHUTZ-032", "MAT-FROSTSCHUTZ-045", "MAT-ASPHALT"],
    forbiddenGroups: [],
    forbiddenWords: ["pflaster liefern", "asphalt liefern", "rohr liefern"],
    defaultDailyOutput: 45,
    minUnitPrice: 18,
    targetUnitPriceRange: [25, 75],
    typicalDepthM: [0.3, 3.5],
    examples: ["Auskofferung herstellen", "Bodenaushub lösen, laden und abfahren"],
  },

  {
    key: "auffuellung",
    title: "Auffüllung / Verfüllung / Wiedereinbau",
    synonyms: [
      "auffüllung",
      "auffuellung",
      "auffüllung herstellen",
      "auffuellung herstellen",
      "verfüllung",
      "verfuellung",
      "verfüllen",
      "verfuellen",
      "graben verfüllen",
      "graben verfuellen",
      "leitungsgraben verfüllen",
      "leitungsgraben verfuellen",
      "arbeitsraum verfüllen",
      "arbeitsraum verfuellen",
      "wiedereinbau",
      "boden wieder einbauen",
      "material einbauen und verdichten",
      "lagenweise einbauen",
      "lagenweise verdichten",
      "einbauen und verdichten",
    ],
    typicalUnits: ["m³"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-RADLADER",
      "M-WALZE",
      "M-RUETTELPLATTE",
      "T-LKW-4A",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["E-BODEN", "E-ASPHALT"],
    forbiddenGroups: ["Entsorgung"],
    forbiddenWords: ["entsorgen", "deponie", "abfahren entsorgung"],
    defaultDailyOutput: 70,
    minUnitPrice: 16,
    targetUnitPriceRange: [22, 55],
    examples: ["Leitungsgraben verfüllen", "Auffüllung lagenweise herstellen"],
  },

  {
    key: "leitung_graben",
    title: "Leitungsgraben / Kabelgraben / Trasse herstellen",
    synonyms: [
      "leitungsgraben",
      "leitungsgraben herstellen",
      "graben herstellen",
      "kabelgraben",
      "kabelgraben herstellen",
      "trasse herstellen",
      "rohrgraben",
      "rohrgraben herstellen",
      "speedpipe graben",
      "glasfaser graben",
      "hausanschlussgraben",
      "versorgungsgraben",
      "kanalgraben",
      "wasserleitungsgraben",
      "gasleitungsgraben",
      "stromtrasse",
      "telekom trasse",
      "lwl trasse",
      "mehrsparten graben",
      "grabensohle herstellen",
      "leitungszone herstellen",
    ],
    typicalUnits: ["m"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-BAGGER-8T",
      "M-BAGGER-15T",
      "M-BAGGER-22T",
      "M-RUETTELPLATTE",
      "T-LKW-4A",
      "MAT-SAND",
      "MAT-WARNBAND",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: [],
    forbiddenGroups: [],
    forbiddenWords: [],
    defaultDailyOutput: 35,
    minUnitPrice: 45,
    targetUnitPriceRange: [65, 180],
    typicalDepthM: [0.6, 2.5],
    examples: ["Leitungsgraben herstellen", "Kabelgraben für Glasfaser herstellen"],
  },

  {
    key: "rohr_verlegen",
    title: "Rohr / Kabelschutzrohr / Speedpipe verlegen",
    synonyms: [
      "rohr verlegen",
      "rohrleitung verlegen",
      "leitung verlegen",
      "wasserleitung verlegen",
      "kanalrohr verlegen",
      "kg rohr verlegen",
      "druckrohr verlegen",
      "kabelschutzrohr verlegen",
      "kabelleerrohr verlegen",
      "speedpipe verlegen",
      "speedpipe",
      "speedpipeverband",
      "rohrverband",
      "glasfaser rohrverband",
      "kabel verlegen",
      "kabel einziehen",
      "rohr einbauen",
      "leitung einbauen",
      "warnband verlegen",
      "trassenband verlegen",
      "bettung rohr",
      "leitungszone",
      "sandbett rohr",
    ],
    typicalUnits: ["m"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-BAGGER-8T",
      "M-RUETTELPLATTE",
      "MAT-SAND",
      "MAT-ROHR",
      "MAT-SPEEDPIPE",
      "MAT-WARNBAND",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: [],
    forbiddenGroups: [],
    forbiddenWords: [],
    defaultDailyOutput: 45,
    minUnitPrice: 12,
    targetUnitPriceRange: [18, 65],
    examples: ["Speedpipe verlegen", "Kabelschutzrohr verlegen", "Rohrleitung verlegen"],
  },

  {
    key: "schacht_setzen",
    title: "Schacht / Kontrollschacht / Formteil setzen",
    synonyms: [
      "schacht setzen",
      "schacht einbauen",
      "schacht herstellen",
      "kontrollschacht",
      "kontrollschacht setzen",
      "revisionsschacht",
      "revisionsschacht setzen",
      "schachtbauwerk",
      "schachtunterteil",
      "schachtring",
      "schachtabdeckung",
      "schachtabdeckung setzen",
      "schacht regulieren",
      "schacht anpassen",
      "schachthöhe anpassen",
      "schachthoehe anpassen",
      "straßenablauf setzen",
      "strassenablauf setzen",
      "sinkkasten setzen",
      "einlauf setzen",
      "schieberkappe setzen",
      "hydrantenkappe setzen",
      "muffe setzen",
      "formteil einbauen",
    ],
    typicalUnits: ["St"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-BAGGER-8T",
      "MAT-SCHACHT",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: [],
    forbiddenGroups: [],
    forbiddenWords: [],
    defaultDailyOutput: 3,
    minUnitPrice: 350,
    targetUnitPriceRange: [450, 2500],
    examples: ["Kontrollschacht setzen", "Schachtabdeckung anpassen"],
  },

  {
    key: "bordstein",
    title: "Bordstein / Randstein / Einfassung setzen",
    synonyms: [
      "bordstein",
      "bordstein setzen",
      "randstein",
      "randstein setzen",
      "tiefbord",
      "tiefbord setzen",
      "hochbord",
      "hochbord setzen",
      "rundbord",
      "rundbord setzen",
      "einfassung",
      "einfassung setzen",
      "rasenkantenstein",
      "rasenkantenstein setzen",
      "leistenstein",
      "leistenstein setzen",
      "rückenstütze",
      "rueckenstuetze",
      "fundament bordstein",
      "bordrinne",
      "rinne setzen",
      "muldenrinne setzen",
      "entwässerungsrinne setzen",
      "entwaesserungsrinne setzen",
    ],
    typicalUnits: ["m"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "P-HELFER",
      "M-MINIBAGGER",
      "MAT-BORD-TIEF",
      "MAT-BORD-HOCH",
      "MAT-BORD-RUND",
      "MAT-BETON-C20",
      "T-LKW-3A",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["E-BODEN", "E-ASPHALT"],
    forbiddenGroups: [],
    forbiddenWords: ["asphalt liefern", "frostschutz liefern"],
    defaultDailyOutput: 45,
    minUnitPrice: 35,
    targetUnitPriceRange: [45, 110],
    examples: ["Tiefbord setzen", "Hochbord mit Rückenstütze setzen"],
  },

  {
    key: "entsorgung",
    title: "Entsorgung / Verwertung / Abfuhr",
    synonyms: [
      "entsorgung",
      "entsorgen",
      "deponie",
      "verwertung",
      "verwerten",
      "abfahren",
      "boden abfahren",
      "boden entsorgen",
      "aushub entsorgen",
      "material entsorgen",
      "bauschutt entsorgen",
      "mischmaterial entsorgen",
      "altpflaster entsorgen",
      "fräsgut entsorgen",
      "fraesgut entsorgen",
      "asphalt entsorgen",
      "lkw abfuhr",
      "transport zur deponie",
      "deponiegebühr",
      "deponiegebuehr",
      "entsorgungsnachweis",
    ],
    typicalUnits: ["t", "m³"],
    allowedResourceIds: [
      "P-FACHARBEITER",
      "M-RADLADER",
      "T-LKW-4A",
      "E-BODEN",
      "E-ASPHALT",
      "E-BAUSCHUTT",
      "E-ALTPFLASTER",
      "Z-GEMEINKOSTEN",
      "Z-RISIKO",
      "Z-GEWINN",
    ],
    forbiddenResourceIds: ["MAT-FROSTSCHUTZ-032", "MAT-ASPHALT", "MAT-PFLASTER-BETON-8"],
    forbiddenGroups: ["Material"],
    forbiddenWords: ["liefern", "einbauen", "verlegen", "herstellen"],
    defaultDailyOutput: 80,
    minUnitPrice: 25,
    targetUnitPriceRange: [35, 95],
    examples: ["Bodenaushub entsorgen", "Asphaltaufbruch verwerten"],
  },
];

export function getWorkTypeProfile(key: WorkTypeKey): WorkTypeProfile | null {
  return WORK_TYPE_PROFILES.find((p) => p.key === key) || null;
}

export function shouldForceLocalCalculation(key: WorkTypeKey): boolean {
  return !!getWorkTypeProfile(key)?.forceLocalCalculation;
}

export function isForbiddenForWorkType(args: {
  workType: WorkTypeKey;
  group?: string;
  resourceId?: string;
  name?: string;
  note?: string;
}): boolean {
  const profile = getWorkTypeProfile(args.workType);
  if (!profile) return false;

  const group = String(args.group || "");
  const resourceId = String(args.resourceId || "");
  const text = norm(`${args.name || ""} ${args.note || ""} ${args.resourceId || ""}`);

  if (profile.forbiddenGroups.includes(group)) return true;
  if (profile.forbiddenResourceIds.includes(resourceId)) return true;
  if (profile.forbiddenWords.some((w) => text.includes(norm(w)))) return true;

  return false;
}

function ambiguous(
  title: string,
  message: string,
  alternatives: string[]
): WorkTypeDetection {
  return {
    key: "unknown",
    confidence: 0.2,
    ambiguous: true,
    title,
    message,
    alternatives,
  };
}

export function detectWorkType(input: {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
}): WorkTypeDetection {
  const text = norm(`${input.posNr || ""} ${input.kurztext || ""} ${input.langtext || ""}`);
  const kurz = norm(input.kurztext || "");

  if (!kurz) {
    return {
      key: "unknown",
      confidence: 0,
      ambiguous: true,
      title: "Leistung fehlt",
      message: "Kurztext fehlt. Die KI kann keine sichere Urkalkulation erstellen.",
    };
  }

  if (exactOrShortGeneric(kurz, ["asphalt", "asphaltarbeiten"])) {
    return ambiguous(
      "Asphalt-Leistung unklar",
      "Asphalt ist zu ungenau. Es muss klar sein, ob gefräst, aufgenommen, eingebaut oder wiederhergestellt wird.",
      [
        "Asphalt fräsen",
        "Asphalttragschicht einbauen",
        "Asphaltdeckschicht einbauen",
        "Asphalt aufbrechen und entsorgen",
        "Asphaltfläche wiederherstellen",
      ]
    );
  }

  if (exactOrShortGeneric(kurz, ["pflaster", "pflasterarbeiten"])) {
    return ambiguous(
      "Pflaster-Leistung unklar",
      "Pflaster ist zu ungenau. Es muss klar sein, ob aufgenommen, neu verlegt oder nur die Bettung/Fuge bearbeitet wird.",
      [
        "Pflaster aufnehmen",
        "Pflaster neu verlegen",
        "Pflasterfläche wiederherstellen",
        "Splittbett herstellen",
        "Fugen verfüllen",
      ]
    );
  }

  if (exactOrShortGeneric(kurz, ["kies", "schotter", "tragschicht", "material"])) {
    return ambiguous(
      "Tragschicht / Material unklar",
      "Der Begriff ist zu allgemein. Es muss klar sein, ob Material geliefert, eingebaut, verdichtet oder entsorgt wird.",
      [
        "Kiestragschicht herstellen",
        "Schottertragschicht herstellen",
        "Frostschutzschicht herstellen",
        "Material nur liefern",
        "Material aufnehmen und entsorgen",
      ]
    );
  }

  if (exactOrShortGeneric(kurz, ["rohr", "leitung", "kabel", "speedpipe"])) {
    return ambiguous(
      "Leitungsleistung unklar",
      "Die Leitungsleistung ist zu ungenau. Es muss klar sein, ob ein Graben hergestellt oder nur Rohr/Speedpipe/Kabel verlegt wird.",
      [
        "Leitungsgraben herstellen",
        "Rohrleitung verlegen",
        "Speedpipe verlegen",
        "Kabelschutzrohr verlegen",
        "Leitungszone herstellen",
      ]
    );
  }

  if (exactOrShortGeneric(kurz, ["graben"])) {
    return ambiguous(
      "Graben-Leistung unklar",
      "Graben ist zu allgemein. Bitte unterscheiden zwischen Aushub, Leitungsgraben, Verfüllung oder kompletter Leitungsbauleistung.",
      [
        "Leitungsgraben herstellen",
        "Grabenaushub herstellen",
        "Graben verfüllen",
        "Rohr im Graben verlegen",
      ]
    );
  }

  if (hasAny(text, ["asphalt fräsen", "asphalt fraesen", "asphalt abfräsen", "asphalt abfraesen", "fräsgut", "fraesgut", "kaltfräsen", "kaltfraesen"])) {
    return { key: "asphalt_fraesen", confidence: 0.96, ambiguous: false, title: "Asphalt fräsen" };
  }

  if (hasAny(text, ["asphalt aufbrechen", "asphalt ausbauen", "asphalt aufnehmen", "asphalt abbrechen", "asphalt entfernen", "asphalt entsorgen", "asphaltaufbruch"])) {
    return { key: "asphalt_aufbrechen_entsorgen", confidence: 0.94, ambiguous: false, title: "Asphalt aufbrechen / entsorgen" };
  }

  if (hasAny(text, ["asphalt herstellen", "asphalt wiederherstellen", "asphalt einbauen", "asphalttragschicht", "asphaltdeckschicht", "asphaltbinderschicht", "asphaltieren", "ac 32", "ac 22", "ac 16", "ac 11", "ac 8"])) {
    return { key: "asphalt_herstellen", confidence: 0.94, ambiguous: false, title: "Asphalt herstellen" };
  }

  if (hasAny(text, ["planie", "planum", "feinplanum", "untergrund profilieren", "untergrund abziehen", "untergrund herstellen", "erdplanum", "rohplanum"])) {
    return { key: "planie", confidence: 0.98, ambiguous: false, title: "Planie / Feinplanum" };
  }

  if (hasAny(text, ["pflaster aufnehmen", "pflaster ausbauen", "pflaster abbrechen", "pflaster entfernen", "platten aufnehmen", "rasengitter aufnehmen"])) {
    return { key: "pflaster_aufnehmen", confidence: 0.94, ambiguous: false, title: "Pflaster aufnehmen" };
  }

  if (hasAny(text, ["pflaster", "verbundstein", "betonstein", "naturstein", "rasengitter", "platten verlegen", "gehwegplatten", "splittbett", "fugen verfüllen", "fugen verfuellen"])) {
    return { key: "pflaster_verlegen", confidence: 0.88, ambiguous: false, title: "Pflaster / Platten verlegen" };
  }

  if (hasAny(text, ["frostschutz", "frostschutzschicht", "frostschutzmaterial", "frostschutzkies", "fss"])) {
    return { key: "frostschutz", confidence: 0.94, ambiguous: false, title: "Frostschutzschicht" };
  }

  if (hasAny(text, ["kiestragschicht", "schottertragschicht", "tragschicht herstellen", "tragschicht einbauen", "schotter einbauen", "kies einbauen", "mineralgemisch", "mineralbeton", "rc schotter", "ungebundene tragschicht"])) {
    return { key: "kies_tragschicht", confidence: 0.9, ambiguous: false, title: "Kies- / Schottertragschicht" };
  }

  if (hasAny(text, ["auskofferung", "auskoffern", "aushub", "baugrube", "erdarbeiten", "boden lösen", "boden loesen", "bodenabtrag", "oberboden abtragen", "mutterboden abtragen", "humus abtragen"])) {
    return { key: "auskofferung", confidence: 0.9, ambiguous: false, title: "Auskofferung / Erdarbeiten" };
  }

  if (hasAny(text, ["auffüllung", "auffuellung", "verfüllung", "verfuellung", "verfüllen", "verfuellen", "wiedereinbau", "lagenweise einbauen", "lagenweise verdichten", "einbauen und verdichten"])) {
    return { key: "auffuellung", confidence: 0.88, ambiguous: false, title: "Auffüllung / Verfüllung" };
  }

  if (hasAny(text, ["schacht setzen", "schacht einbauen", "kontrollschacht", "revisionsschacht", "schachtbauwerk", "schachtabdeckung", "schacht regulieren", "schachthöhe", "schachthoehe", "sinkkasten", "straßenablauf", "strassenablauf", "schieberkappe", "hydrantenkappe"])) {
    return { key: "schacht_setzen", confidence: 0.9, ambiguous: false, title: "Schacht / Einbauteil setzen" };
  }

  if (hasAny(text, ["bordstein", "randstein", "tiefbord", "hochbord", "rundbord", "einfassung", "rasenkantenstein", "leistenstein", "rückenstütze", "rueckenstuetze", "rinne setzen", "muldenrinne", "entwässerungsrinne", "entwaesserungsrinne"])) {
    return { key: "bordstein", confidence: 0.88, ambiguous: false, title: "Bordstein / Einfassung setzen" };
  }

  if (hasAny(text, ["rohr verlegen", "rohrleitung verlegen", "leitung verlegen", "wasserleitung verlegen", "kanalrohr verlegen", "kg rohr", "druckrohr", "kabelschutzrohr", "kabelleerrohr", "speedpipe verlegen", "speedpipe", "rohrverband", "kabel verlegen", "warnband verlegen", "trassenband", "leitungszone", "sandbett rohr"])) {
    return { key: "rohr_verlegen", confidence: 0.88, ambiguous: false, title: "Rohr / Leitung verlegen" };
  }

  if (hasAny(text, ["leitungsgraben", "graben herstellen", "kabelgraben", "trasse herstellen", "rohrgraben", "hausanschlussgraben", "versorgungsgraben", "kanalgraben", "wasserleitungsgraben", "gasleitungsgraben", "stromtrasse", "telekom trasse", "lwl trasse", "mehrsparten graben", "grabensohle"])) {
    return { key: "leitung_graben", confidence: 0.86, ambiguous: false, title: "Leitungsgraben / Trasse" };
  }

  if (hasAny(text, ["entsorgung", "entsorgen", "deponie", "verwertung", "verwerten", "abfahren", "boden abfahren", "boden entsorgen", "aushub entsorgen", "bauschutt entsorgen", "mischmaterial entsorgen", "altpflaster entsorgen", "deponiegebühr", "deponiegebuehr", "entsorgungsnachweis"])) {
    return { key: "entsorgung", confidence: 0.86, ambiguous: false, title: "Entsorgung / Verwertung" };
  }

  return {
    key: "unknown",
    confidence: 0.15,
    ambiguous: true,
    title: "Leistungsart unklar",
    message:
      "Die Leistungsart konnte nicht sicher erkannt werden. Bitte genauer beschreiben, z. B. Planie herstellen, Asphalt fräsen, Frostschutzschicht herstellen, Leitungsgraben herstellen, Speedpipe verlegen, Schacht setzen oder Bordstein setzen.",
  };
}