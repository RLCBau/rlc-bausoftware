// apps/server/prisma/kalkulation/catalog.v1.ts
export type ComponentType = "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE" | "OTHER";

export type CatalogTemplate = {
  key: string;
  title: string;
  category: string;
  unit: string;
  description?: string;
  tags?: string[];
  paramsJson?: any; // { defaultParams, schema, hints }
  components: Array<{
    type: ComponentType;
    refKey: string;
    qtyFormula: string;
    mandatory?: boolean;
    riskFactor?: number; // default 1.0
    sort?: number;
    note?: string;
  }>;
};

export const CATALOG_V1: CatalogTemplate[] = [
  // =========================
  // TB_GRABEN (Scavi)
  // =========================
  {
    key: "TB_GRABEN_AUSHUB_STANDARD",
    title: "Graben ausheben (Standard)",
    category: "TIEFBAU/GRABEN",
    unit: "m",
    tags: ["graben", "aushub", "tiefbau", "bk", "bodenklasse"],
    paramsJson: {
      defaultParams: { depth_m: 1.2, width_m: 0.6, soilClass: "BK4", restricted: false, groundwater: false },
      schema: {
        depth_m: { type: "number", min: 0.4, max: 3.0 },
        width_m: { type: "number", min: 0.3, max: 1.5 },
        soilClass: { type: "string", enum: ["BK2", "BK3", "BK4", "BK5", "BK6"] },
        restricted: { type: "boolean" },
        groundwater: { type: "boolean" }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "params.depth_m * 0.10 + (params.restricted?0.05:0) + (params.groundwater?0.06:0)", sort: 10 },
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "params.depth_m * 0.06 + (params.soilClass==='BK6'?0.03:0)", sort: 20 },
      { type: "MATERIAL", refKey: "MATERIAL:ABDECKFOLIE", qtyFormula: "(params.restricted?0.02:0)", mandatory: false, sort: 30 }
    ]
  },

  {
    key: "TB_GRABEN_AUSHUB_HANDARBEIT",
    title: "Graben ausheben (Handarbeit)",
    category: "TIEFBAU/GRABEN",
    unit: "m",
    tags: ["handarbeit", "spaten", "aushub"],
    paramsJson: {
      defaultParams: { depth_m: 1.0, width_m: 0.4, soilClass: "BK4", restricted: true, groundwater: false },
      schema: {
        depth_m: { type: "number", min: 0.4, max: 2.0 },
        width_m: { type: "number", min: 0.3, max: 1.0 },
        soilClass: { type: "string", enum: ["BK2", "BK3", "BK4", "BK5", "BK6"] },
        restricted: { type: "boolean" },
        groundwater: { type: "boolean" }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "params.depth_m * 0.35 + (params.soilClass==='BK6'?0.10:0)", sort: 10 },
      { type: "LABOR", refKey: "LABOR:HELFER", qtyFormula: "params.depth_m * 0.25", sort: 15 }
    ]
  },

  {
    key: "TB_GRABEN_VERBAU_STANDARD",
    title: "Graben verbauen (Standard)",
    category: "TIEFBAU/VERBAU",
    unit: "m",
    tags: ["verbau", "verbausystem", "sicherung"],
    paramsJson: {
      defaultParams: { depth_m: 1.2, system: "LEICHT", restricted: false },
      schema: {
        depth_m: { type: "number", min: 0.6, max: 3.0 },
        system: { type: "string", enum: ["LEICHT", "SCHWER"] },
        restricted: { type: "boolean" }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "0.08 + params.depth_m*0.04 + (params.system==='SCHWER'?0.05:0)", sort: 10 },
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "0.05 + (params.system==='SCHWER'?0.03:0)", sort: 20 },
      { type: "MATERIAL", refKey: "MATERIAL:VERBAU_SYSTEM", qtyFormula: "1.0", sort: 30, note: "als Nutzung/Abschreibung (refKey preislich definieren)" }
    ]
  },

  // =========================
  // TB_VERFUELLUNG (Riempimenti)
  // =========================
  {
    key: "TB_WIEDERVERFUELLUNG_AUSHUB",
    title: "Wiederverfüllung mit Aushub",
    category: "TIEFBAU/VERFUELLUNG",
    unit: "m",
    tags: ["wiederverfuellung", "aushub", "verdichten"],
    paramsJson: {
      defaultParams: { depth_m: 1.2, width_m: 0.6, compaction: "NORMAL" },
      schema: {
        depth_m: { type: "number", min: 0.4, max: 3.0 },
        width_m: { type: "number", min: 0.3, max: 1.5 },
        compaction: { type: "string", enum: ["LEICHT", "NORMAL", "HOCH"] }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "0.06 + (params.compaction==='HOCH'?0.05:0)", sort: 10 },
      { type: "MACHINE", refKey: "MACHINE:RUETTELPLATTE", qtyFormula: "0.10 + (params.compaction==='HOCH'?0.08:0)", sort: 20 }
    ]
  },

  {
    key: "TB_WIEDERVERFUELLUNG_FROSTSCHUTZ",
    title: "Wiederverfüllung mit Frostschutz",
    category: "TIEFBAU/VERFUELLUNG",
    unit: "m",
    tags: ["frostschutz", "kies", "verdichten"],
    paramsJson: {
      defaultParams: { depth_m: 1.2, width_m: 0.6, thickness_m: 0.3, compaction: "NORMAL" },
      schema: {
        depth_m: { type: "number", min: 0.4, max: 3.0 },
        width_m: { type: "number", min: 0.3, max: 1.5 },
        thickness_m: { type: "number", min: 0.1, max: 1.5 },
        compaction: { type: "string", enum: ["LEICHT", "NORMAL", "HOCH"] }
      }
    },
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:FROSTSCHUTZ_0_32", qtyFormula: "params.width_m * params.thickness_m * 1.0", sort: 10 },
      { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "0.08 + (params.compaction==='HOCH'?0.05:0)", sort: 20 },
      { type: "MACHINE", refKey: "MACHINE:RUETTELPLATTE", qtyFormula: "0.12 + (params.compaction==='HOCH'?0.08:0)", sort: 30 }
    ]
  },

  // =========================
  // TB_ENTSORGUNG (Smaltimenti)
  // =========================
  {
    key: "TB_ENTSORGUNG_AUSHUB",
    title: "Aushub entsorgen (inkl. Transport)",
    category: "TIEFBAU/ENTSORGUNG",
    unit: "m3",
    tags: ["entsorgung", "dk", "transport"],
    paramsJson: {
      defaultParams: { disposalClass: "DKII", distance_km: 10 },
      schema: {
        disposalClass: { type: "string", enum: ["DK0", "DKI", "DKII", "Z1.1", "Z2"] },
        distance_km: { type: "number", min: 0, max: 200 }
      }
    },
    components: [
      { type: "MACHINE", refKey: "MACHINE:LKW_3ACH", qtyFormula: "0.20 + params.distance_km*0.01", sort: 10 },
      { type: "DISPOSAL", refKey: "DISPOSAL:KIPPE_DKII", qtyFormula: "1.0", sort: 20, note: "refKey per classe; mappare nel pricing" }
    ]
  },

  // =========================
  // WASSER (Acquedotto)
  // =========================
  {
    key: "WASSER_ROHR_PEHD_VERLEGEN",
    title: "PE-HD Rohr verlegen (Wasser)",
    category: "WASSER/ROHR",
    unit: "m",
    tags: ["pehd", "wasser", "dn", "schweissen"],
    paramsJson: {
      defaultParams: { dn_mm: 63, pressureBar: 16, fittings_per_10m: 1 },
      schema: {
        dn_mm: { type: "number", enum: [32, 40, 50, 63, 90, 110] },
        pressureBar: { type: "number", enum: [10, 16] },
        fittings_per_10m: { type: "number", min: 0, max: 5 }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:ROHRLEGER", qtyFormula: "0.10 + (params.dn_mm>=90?0.05:0)", sort: 10 },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER_2_5T", qtyFormula: "0.05", sort: 20 },
      { type: "MATERIAL", refKey: "MATERIAL:PEHD_ROHR", qtyFormula: "1.0", sort: 30, note: "Preis in EUR/m per DN" },
      { type: "MATERIAL", refKey: "MATERIAL:FORMTEIL", qtyFormula: "params.fittings_per_10m/10", mandatory: false, sort: 40 }
    ]
  },

  {
    key: "WASSER_DRUCKPROBE",
    title: "Druckprobe Wasserleitung",
    category: "WASSER/PRUEFUNG",
    unit: "m",
    tags: ["druckprobe", "pruefung", "wasser"],
    paramsJson: {
      defaultParams: { dn_mm: 63, length_m: 100 },
      schema: {
        dn_mm: { type: "number", enum: [32, 40, 50, 63, 90, 110] },
        length_m: { type: "number", min: 10, max: 2000 }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:FACHARBEITER", qtyFormula: "0.02", sort: 10 },
      { type: "MACHINE", refKey: "MACHINE:DRUCKPUMPE", qtyFormula: "0.01", sort: 20 }
    ]
  },

  // =========================
  // KANAL (Fognatura)
  // =========================
  {
    key: "KANAL_ROHR_PVC_VERLEGEN",
    title: "PVC Kanalrohr verlegen",
    category: "KANAL/ROHR",
    unit: "m",
    tags: ["kanal", "pvc", "dn", "bettung"],
    paramsJson: {
      defaultParams: { dn_mm: 200, bedding: true },
      schema: {
        dn_mm: { type: "number", enum: [160, 200, 250, 300, 400] },
        bedding: { type: "boolean" }
      }
    },
    components: [
      { type: "LABOR", refKey: "LABOR:KANALBAUER", qtyFormula: "0.12 + (params.dn_mm>=300?0.06:0)", sort: 10 },
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "0.06", sort: 20 },
      { type: "MATERIAL", refKey: "MATERIAL:PVC_KANALROHR", qtyFormula: "1.0", sort: 30 },
      { type: "MATERIAL", refKey: "MATERIAL:BETTUNG_SAND", qtyFormula: "params.bedding?0.15:0", mandatory: false, sort: 40 }
    ]
  },

  // =========================
  // OBERFLAECHE (Ripristini)
  // =========================
  {
    key: "OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN",
    title: "Asphalt wiederherstellen",
    category: "OBERFLAECHE/ASPHALT",
    unit: "m2",
    tags: ["asphalt", "deckschicht", "tragschicht"],
    paramsJson: {
      defaultParams: { deck_cm: 4, trag_cm: 10 },
      schema: {
        deck_cm: { type: "number", enum: [3,4,5] },
        trag_cm: { type: "number", enum: [8,10,14] }
      }
    },
    components: [
      { type: "SURFACE", refKey: "SURFACE:ASPHALT_DECK", qtyFormula: "params.deck_cm/100", sort: 10 },
      { type: "SURFACE", refKey: "SURFACE:ASPHALT_TRAG", qtyFormula: "params.trag_cm/100", sort: 20 },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "0.05", sort: 30 }
    ]
  },

  // =========================
  // (Aggiungi qui altri template fino a 220)
  // =========================
];
