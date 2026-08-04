// apps/web/src/pages/kalkulation/technicalPositionLibrary.ts

import type { WorkTypeKey } from "./workTypeLibrary";

export type TechnicalCategory =
  | "Erdarbeiten"
  | "Leitungsbau"
  | "Straßenbau"
  | "Asphaltbau"
  | "Pflasterbau"
  | "Bord / Rinnen"
  | "Schacht / Einbauteile"
  | "Entsorgung"
  | "Oberflächenwiederherstellung";

export type TechnicalPosition = {
  id: string;
  category: TechnicalCategory;
  workType: WorkTypeKey;
  title: string;
  unit: "m" | "m²" | "m³" | "t" | "St" | "pauschal";
  synonyms: string[];
  defaultDailyOutput: number;
  minUnitPrice: number;
  targetUnitPriceRange: [number, number];
  allowedResourceIds: string[];
  forbiddenResourceIds: string[];
  calculationHints: string[];
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

function slug(value: string): string {
  return norm(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function pos(args: Omit<TechnicalPosition, "id">): TechnicalPosition {
  return {
    id: `${slug(args.category)}_${slug(args.title)}`,
    ...args,
  };
}

const COMMON_SURCHARGES = ["Z-GEMEINKOSTEN", "Z-RISIKO", "Z-GEWINN"];

const PERSONAL_SMALL = ["P-FACHARBEITER", "P-HELFER"];
const EARTH_MACHINES = ["M-BAGGER-8T", "M-BAGGER-15T", "M-BAGGER-22T", "M-RADLADER"];
const COMPACTION = ["M-RUETTELPLATTE", "M-WALZE"];

const positions: TechnicalPosition[] = [];

/* ================= ERDARBEITEN ================= */

const soilWorks = [
  "Oberboden abtragen",
  "Oberboden seitlich lagern",
  "Oberboden wieder andecken",
  "Boden lösen und laden",
  "Boden lösen, laden und abfahren",
  "Baugrube herstellen",
  "Fundamentgraben herstellen",
  "Arbeitsraum herstellen",
  "Planum herstellen",
  "Feinplanum herstellen",
  "Graben verfüllen",
  "Arbeitsraum verfüllen",
  "Boden lagenweise einbauen und verdichten",
];

const soilDepths = ["bis 0,30 m", "bis 0,60 m", "bis 1,00 m", "bis 1,25 m", "bis 1,50 m", "bis 2,00 m", "bis 2,50 m", "über 2,50 m"];
const soilClasses = ["BK 3", "BK 4", "BK 5", "BK 6", "BK 7"];

for (const work of soilWorks) {
  for (const depth of soilDepths) {
    for (const bk of soilClasses) {
      const isPlanie = work.toLowerCase().includes("planum");
      const isFill = work.toLowerCase().includes("verfüll") || work.toLowerCase().includes("einbauen");

      positions.push(
        pos({
          category: "Erdarbeiten",
          workType: isPlanie ? "planie" : isFill ? "auffuellung" : "auskofferung",
          title: `${work}, ${depth}, ${bk}`,
          unit: isPlanie ? "m²" : "m³",
          synonyms: [work, depth, bk, "erdarbeiten", "tiefbau"],
          defaultDailyOutput: isPlanie ? 180 : isFill ? 70 : 45,
          minUnitPrice: isPlanie ? 3.5 : isFill ? 18 : 25,
          targetUnitPriceRange: isPlanie ? [3.5, 7] : isFill ? [22, 60] : [28, 85],
          allowedResourceIds: [...PERSONAL_SMALL, ...EARTH_MACHINES, ...COMPACTION, "T-LKW-4A", "E-BODEN", ...COMMON_SURCHARGES],
          forbiddenResourceIds: ["MAT-ASPHALT", "MAT-PFLASTER-BETON-8"],
          calculationHints: [
            "Bodenklasse, Tiefe, seitliche Lagerung und Abfuhr getrennt prüfen.",
            "Bei Planie keine Material-, Entsorgungs- oder Transportkosten ansetzen.",
          ],
        })
      );
    }
  }
}

/* ================= LEITUNGSGRÄBEN ================= */

const trenchTypes = [
  "Kabelgraben",
  "Leitungsgraben",
  "Rohrgraben",
  "Speedpipe-Trasse",
  "Glasfaser-Trasse",
  "Hausanschlussgraben",
  "Wasserleitungsgraben",
  "Kanalgraben",
];

const trenchDepths = ["0,40 m", "0,60 m", "0,80 m", "1,00 m", "1,20 m", "1,50 m", "1,80 m", "2,00 m"];
const trenchWidths = ["0,30 m", "0,40 m", "0,50 m", "0,60 m", "0,80 m", "1,00 m"];
const surfaces = ["unbefestigt", "Pflaster", "Asphalt", "Gehweg", "Straße", "Grünfläche"];

for (const type of trenchTypes) {
  for (const depth of trenchDepths) {
    for (const width of trenchWidths) {
      for (const surface of surfaces) {
        positions.push(
          pos({
            category: "Leitungsbau",
            workType: "leitung_graben",
            title: `${type} herstellen, Tiefe ${depth}, Breite ${width}, Oberfläche ${surface}`,
            unit: "m",
            synonyms: [type, "graben herstellen", "trasse herstellen", depth, width, surface],
            defaultDailyOutput: surface === "Asphalt" ? 25 : surface === "Pflaster" ? 28 : 35,
            minUnitPrice: surface === "Asphalt" ? 85 : surface === "Pflaster" ? 75 : 55,
            targetUnitPriceRange: surface === "Asphalt" ? [90, 220] : [65, 180],
            allowedResourceIds: [...PERSONAL_SMALL, "M-BAGGER-8T", "M-BAGGER-15T", "M-RUETTELPLATTE", "T-LKW-4A", "MAT-SAND", "MAT-WARNBAND", ...COMMON_SURCHARGES],
            forbiddenResourceIds: [],
            calculationHints: [
              "Oberfläche vor Grabenarbeiten prüfen.",
              "Leitungszone, Warnband, Verfüllung und Wiederherstellung getrennt berücksichtigen.",
            ],
          })
        );
      }
    }
  }
}

/* ================= ROHRE / SPEEDPIPE / KABELSCHUTZ ================= */

const pipeTypes = [
  "Speedpipe",
  "Speedpipe-Verband",
  "Kabelschutzrohr",
  "Kabelleerrohr",
  "PE-HD Wasserleitung",
  "KG-Rohr",
  "PVC-Rohr",
  "Druckrohr",
  "Mehrspartenrohr",
  "Mikrorohr",
];

const dns = ["DN 32", "DN 40", "DN 50", "DN 63", "DN 75", "DN 90", "DN 110", "DN 125", "DN 160", "DN 200", "DN 250", "DN 300"];
const pipeActions = ["liefern und verlegen", "nur verlegen", "in Sandbett verlegen", "in Leitungszone einbauen", "inkl. Warnband verlegen"];

for (const pipe of pipeTypes) {
  for (const dn of dns) {
    for (const action of pipeActions) {
      positions.push(
        pos({
          category: "Leitungsbau",
          workType: "rohr_verlegen",
          title: `${pipe} ${dn} ${action}`,
          unit: "m",
          synonyms: [pipe, dn, action, "rohr verlegen", "leitung verlegen"],
          defaultDailyOutput: pipe.toLowerCase().includes("speedpipe") ? 180 : 80,
          minUnitPrice: pipe.toLowerCase().includes("speedpipe") ? 6 : 12,
          targetUnitPriceRange: pipe.toLowerCase().includes("speedpipe") ? [8, 28] : [18, 75],
          allowedResourceIds: [...PERSONAL_SMALL, "M-RUETTELPLATTE", "MAT-SAND", "MAT-ROHR", "MAT-SPEEDPIPE", "MAT-WARNBAND", ...COMMON_SURCHARGES],
          forbiddenResourceIds: ["E-BODEN", "E-ASPHALT"],
          calculationHints: [
            "Rohrmaterial, Bettung und Warnband getrennt kalkulieren.",
            "Bei Speedpipe Mengen je Rohrverband prüfen.",
          ],
        })
      );
    }
  }
}

/* ================= ASPHALTBAU ================= */

const asphaltMixes = ["AC 32 T S", "AC 22 T S", "AC 16 B S", "AC 11 D S", "AC 8 D S", "SMA 8", "Gussasphalt"];
const asphaltThickness = ["2 cm", "3 cm", "4 cm", "5 cm", "6 cm", "8 cm", "10 cm", "12 cm", "14 cm", "16 cm"];
const asphaltActions = [
  "Asphalt fräsen",
  "Asphalt aufnehmen und entsorgen",
  "Asphalttragschicht einbauen",
  "Asphaltbinderschicht einbauen",
  "Asphaltdeckschicht einbauen",
  "Asphaltfläche wiederherstellen",
];

for (const action of asphaltActions) {
  for (const mix of asphaltMixes) {
    for (const thick of asphaltThickness) {
      const isFraesen = action.includes("fräsen");
      const isRemove = action.includes("entsorgen");

      positions.push(
        pos({
          category: "Asphaltbau",
          workType: isFraesen ? "asphalt_fraesen" : isRemove ? "asphalt_aufbrechen_entsorgen" : "asphalt_herstellen",
          title: `${action}, ${mix}, ${thick}`,
          unit: "m²",
          synonyms: [action, mix, thick, "asphalt", "straßenbau"],
          defaultDailyOutput: isFraesen ? 250 : isRemove ? 90 : 120,
          minUnitPrice: isFraesen ? 5 : isRemove ? 18 : 35,
          targetUnitPriceRange: isFraesen ? [5, 16] : isRemove ? [18, 45] : [35, 95],
          allowedResourceIds: isRemove
            ? [...PERSONAL_SMALL, "M-BAGGER-8T", "M-RADLADER", "T-LKW-4A", "E-ASPHALT", ...COMMON_SURCHARGES]
            : isFraesen
              ? [...PERSONAL_SMALL, "M-FUGENSCHNEIDER", "M-RADLADER", "T-LKW-4A", "E-ASPHALT", ...COMMON_SURCHARGES]
              : [...PERSONAL_SMALL, "M-RADLADER", "M-WALZE", "M-FUGENSCHNEIDER", "MAT-ASPHALT", "T-LKW-4A", ...COMMON_SURCHARGES],
          forbiddenResourceIds: isRemove || isFraesen ? ["MAT-ASPHALT"] : ["E-BODEN"],
          calculationHints: [
            "Schichtdicke, Mischgutart, Anschlusskanten und Verdichtung berücksichtigen.",
            "Bei Ausbau/Fräsen keine neue Asphaltlieferung ansetzen.",
          ],
        })
      );
    }
  }
}

/* ================= TRAGSCHICHTEN / FROSTSCHUTZ ================= */

const baseMaterials = [
  "Frostschutz 0/32",
  "Frostschutz 0/45",
  "Schottertragschicht 0/32",
  "Schottertragschicht 0/45",
  "Kiestragschicht 0/32",
  "Mineralgemisch 0/32",
  "RC-Schotter 0/45",
  "Splitttragschicht",
];

const baseThickness = ["10 cm", "15 cm", "20 cm", "25 cm", "30 cm", "35 cm", "40 cm", "45 cm", "50 cm", "60 cm"];
const baseActions = ["liefern und einbauen", "einbauen und verdichten", "profilgerecht herstellen", "lagenweise herstellen"];

for (const mat of baseMaterials) {
  for (const thick of baseThickness) {
    for (const action of baseActions) {
      const isFrost = mat.toLowerCase().includes("frostschutz");

      positions.push(
        pos({
          category: "Straßenbau",
          workType: isFrost ? "frostschutz" : "kies_tragschicht",
          title: `${mat} ${action}, Dicke ${thick}`,
          unit: "m²",
          synonyms: [mat, thick, action, "tragschicht", "frostschutz", "schotter"],
          defaultDailyOutput: 85,
          minUnitPrice: isFrost ? 28 : 24,
          targetUnitPriceRange: isFrost ? [32, 75] : [28, 68],
          allowedResourceIds: [...PERSONAL_SMALL, "M-RADLADER", "M-WALZE", isFrost ? "MAT-FROSTSCHUTZ-032" : "MAT-KIES", "T-LKW-4A", ...COMMON_SURCHARGES],
          forbiddenResourceIds: ["E-BODEN", "E-ASPHALT"],
          calculationHints: [
            "Schichtdicke in m³ umrechnen.",
            "Verdichtung und profilgerechtes Herstellen berücksichtigen.",
          ],
        })
      );
    }
  }
}

/* ================= PFLASTER / PLATTEN ================= */

const pavingTypes = [
  "Betonpflaster 6 cm",
  "Betonpflaster 8 cm",
  "Betonpflaster 10 cm",
  "Natursteinpflaster",
  "Großpflaster",
  "Kleinpflaster",
  "Gehwegplatten",
  "Rasengittersteine",
];

const pavingActions = [
  "verlegen",
  "liefern und verlegen",
  "aufnehmen",
  "aufnehmen und entsorgen",
  "wiederherstellen",
  "inkl. Splittbett und Fugen",
];

for (const p of pavingTypes) {
  for (const action of pavingActions) {
    const takeUp = action.includes("aufnehmen");

    positions.push(
      pos({
        category: "Pflasterbau",
        workType: takeUp ? "pflaster_aufnehmen" : "pflaster_verlegen",
        title: `${p} ${action}`,
        unit: "m²",
        synonyms: [p, action, "pflaster", "platten", "belag"],
        defaultDailyOutput: takeUp ? 80 : p.includes("Natur") || p.includes("Groß") ? 18 : 28,
        minUnitPrice: takeUp ? 10 : 35,
        targetUnitPriceRange: takeUp ? [12, 35] : [45, 140],
        allowedResourceIds: takeUp
          ? [...PERSONAL_SMALL, "M-RADLADER", "T-LKW-4A", "E-ALTPFLASTER", ...COMMON_SURCHARGES]
          : [...PERSONAL_SMALL, "M-RUETTELPLATTE", "M-PFLASTERKNACKER", "MAT-PFLASTER-BETON-8", "MAT-SPLITT", "MAT-FUGENSAND", "T-LKW-4A", ...COMMON_SURCHARGES],
        forbiddenResourceIds: takeUp ? ["MAT-PFLASTER-BETON-8", "MAT-SPLITT", "MAT-FUGENSAND"] : ["E-BODEN"],
        calculationHints: [
          "Bei Neuverlegung Bettung, Schneiden, Abrütteln und Fugen berücksichtigen.",
          "Bei Aufnahme kein neues Pflastermaterial ansetzen.",
        ],
      })
    );
  }
}

/* ================= BORDSTEINE / RINNEN ================= */

const borderTypes = [
  "Tiefbordstein",
  "Hochbordstein",
  "Rundbordstein",
  "Rasenkantenstein",
  "Leistenstein",
  "Granitbord",
  "Muldenrinne",
  "Entwässerungsrinne",
  "Betonrinne",
];

const borderActions = [
  "setzen",
  "liefern und setzen",
  "aufnehmen",
  "aufnehmen und entsorgen",
  "mit Rückenstütze setzen",
  "in Betonfundament setzen",
];

for (const b of borderTypes) {
  for (const action of borderActions) {
    const takeUp = action.includes("aufnehmen");

    positions.push(
      pos({
        category: "Bord / Rinnen",
        workType: takeUp ? "entsorgung" : "bordstein",
        title: `${b} ${action}`,
        unit: "m",
        synonyms: [b, action, "bord", "randstein", "rinne"],
        defaultDailyOutput: takeUp ? 90 : 45,
        minUnitPrice: takeUp ? 12 : 35,
        targetUnitPriceRange: takeUp ? [15, 35] : [45, 125],
        allowedResourceIds: takeUp
          ? [...PERSONAL_SMALL, "M-RADLADER", "T-LKW-3A", "E-BAUSCHUTT", ...COMMON_SURCHARGES]
          : [...PERSONAL_SMALL, "M-MINIBAGGER", "MAT-BORD-TIEF", "MAT-BETON-C20", "T-LKW-3A", ...COMMON_SURCHARGES],
        forbiddenResourceIds: takeUp ? ["MAT-BORD-TIEF", "MAT-BETON-C20"] : ["E-ASPHALT"],
        calculationHints: [
          "Fundament und Rückenstütze berücksichtigen.",
          "Bei Aufnahme keine Lieferpositionen ansetzen.",
        ],
      })
    );
  }
}

/* ================= SCHÄCHTE / EINBAUTEILE ================= */

const chamberTypes = [
  "Kontrollschacht",
  "Revisionsschacht",
  "Kabelschacht",
  "Betonschacht",
  "Kunststoffschacht",
  "Straßenablauf",
  "Sinkkasten",
  "Schieberkappe",
  "Hydrantenkappe",
  "Schachtabdeckung",
];

const chamberSizes = ["DN 300", "DN 400", "DN 600", "DN 800", "DN 1000", "DN 1200", "Klasse B125", "Klasse D400"];
const chamberActions = ["setzen", "liefern und setzen", "einbauen", "regulieren", "an Bestand anschließen", "höhenmäßig anpassen"];

for (const c of chamberTypes) {
  for (const size of chamberSizes) {
    for (const action of chamberActions) {
      positions.push(
        pos({
          category: "Schacht / Einbauteile",
          workType: "schacht_setzen",
          title: `${c} ${size} ${action}`,
          unit: "St",
          synonyms: [c, size, action, "schacht", "einbauteil"],
          defaultDailyOutput: c.includes("Kappe") ? 12 : c.includes("Ablauf") ? 5 : 3,
          minUnitPrice: c.includes("Kappe") ? 90 : c.includes("Ablauf") ? 280 : 450,
          targetUnitPriceRange: c.includes("Kappe") ? [120, 350] : c.includes("Ablauf") ? [350, 900] : [500, 2800],
          allowedResourceIds: [...PERSONAL_SMALL, "M-BAGGER-8T", "MAT-SCHACHT", ...COMMON_SURCHARGES],
          forbiddenResourceIds: ["MAT-ASPHALT", "E-BODEN"],
          calculationHints: [
            "Schachtgröße, Tiefe, Anschlussleitungen und Abdeckungsklasse prüfen.",
            "Bei Regulierung Asphalt/Pflasteranschluss separat prüfen.",
          ],
        })
      );
    }
  }
}

/* ================= ENTSORGUNG ================= */

const disposalMaterials = [
  "Bodenaushub",
  "Boden Z0",
  "Boden Z1.1",
  "Boden Z1.2",
  "Boden Z2",
  "Bauschutt",
  "Mischmaterial",
  "Asphaltaufbruch teerfrei",
  "Asphaltaufbruch teerhaltig",
  "Altpflaster",
  "Betonbruch",
  "RC-Material",
  "Fräsgut",
  "Aushub mit Fremdanteilen",
];

const disposalActions = ["laden und abfahren", "entsorgen", "verwerten", "inkl. Deponiegebühr", "mit Entsorgungsnachweis"];

for (const mat of disposalMaterials) {
  for (const action of disposalActions) {
    positions.push(
      pos({
        category: "Entsorgung",
        workType: "entsorgung",
        title: `${mat} ${action}`,
        unit: mat.includes("Asphalt") || mat.includes("Fräsgut") ? "t" : "m³",
        synonyms: [mat, action, "entsorgung", "deponie", "abfahren"],
        defaultDailyOutput: 80,
        minUnitPrice: mat.includes("teerhaltig") ? 90 : mat.includes("Asphalt") ? 45 : 30,
        targetUnitPriceRange: mat.includes("teerhaltig") ? [100, 220] : mat.includes("Asphalt") ? [50, 120] : [35, 95],
        allowedResourceIds: [...PERSONAL_SMALL, "M-RADLADER", "T-LKW-4A", mat.includes("Asphalt") ? "E-ASPHALT" : "E-BODEN", ...COMMON_SURCHARGES],
        forbiddenResourceIds: ["MAT-ASPHALT", "MAT-FROSTSCHUTZ-032", "MAT-PFLASTER-BETON-8"],
        calculationHints: [
          "Materialklasse und Entsorgungsnachweis prüfen.",
          "Transportentfernung beeinflusst den EP stark.",
        ],
      })
    );
  }
}

/* ================= OBERFLÄCHENWIEDERHERSTELLUNG ================= */

const restoreSurfaces = [
  "Grünfläche wiederherstellen",
  "Bankett wiederherstellen",
  "Schotterfläche wiederherstellen",
  "Pflasterfläche wiederherstellen",
  "Asphaltfläche wiederherstellen",
  "Gehweg wiederherstellen",
  "Straßenquerung wiederherstellen",
];

for (const r of restoreSurfaces) {
  const isAsphalt = r.toLowerCase().includes("asphalt");
  const isPflaster = r.toLowerCase().includes("pflaster");

  positions.push(
    pos({
      category: "Oberflächenwiederherstellung",
      workType: isAsphalt ? "asphalt_herstellen" : isPflaster ? "pflaster_verlegen" : "kies_tragschicht",
      title: r,
      unit: "m²",
      synonyms: [r, "wiederherstellung", "oberfläche", "oberflaeche"],
      defaultDailyOutput: isAsphalt ? 100 : isPflaster ? 25 : 80,
      minUnitPrice: isAsphalt ? 45 : isPflaster ? 40 : 18,
      targetUnitPriceRange: isAsphalt ? [50, 110] : isPflaster ? [45, 120] : [22, 60],
      allowedResourceIds: isAsphalt
        ? [...PERSONAL_SMALL, "M-WALZE", "MAT-ASPHALT", "T-LKW-4A", ...COMMON_SURCHARGES]
        : isPflaster
          ? [...PERSONAL_SMALL, "M-RUETTELPLATTE", "MAT-PFLASTER-BETON-8", "MAT-SPLITT", "MAT-FUGENSAND", ...COMMON_SURCHARGES]
          : [...PERSONAL_SMALL, "M-RADLADER", "M-WALZE", "MAT-KIES", ...COMMON_SURCHARGES],
      forbiddenResourceIds: ["E-BODEN"],
      calculationHints: [
        "Wiederherstellung immer nach vorhandener Oberfläche differenzieren.",
        "Anschluss an Bestand und Nebenflächen beachten.",
      ],
    })
  );
}

export const TECHNICAL_POSITIONS: TechnicalPosition[] = Array.from(
  new Map(positions.map((p) => [p.id, p])).values()
);

export function getTechnicalPositions(): TechnicalPosition[] {
  return TECHNICAL_POSITIONS;
}

export function getTechnicalPositionCount(): number {
  return TECHNICAL_POSITIONS.length;
}

export function detectTechnicalPosition(input: {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
}): TechnicalPosition | null {
  const text = norm(`${input.posNr || ""} ${input.kurztext || ""} ${input.langtext || ""}`);
  if (!text) return null;

  let best: { pos: TechnicalPosition; score: number } | null = null;

  for (const p of TECHNICAL_POSITIONS) {
    let score = 0;

    const title = norm(p.title);
    if (text.includes(title)) score += 100;

    for (const s of p.synonyms) {
      const ss = norm(s);
      if (!ss) continue;
      if (text.includes(ss)) score += Math.min(30, ss.length);
    }

    if (input.einheit && p.unit === input.einheit) score += 8;

    if (!best || score > best.score) best = { pos: p, score };
  }

  return best && best.score >= 35 ? best.pos : null;
}