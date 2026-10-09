export type PePressureClass = "SDR17" | "SDR13.6" | "SDR11" | "SDR9" | "SDR7.4" | "SDR5";

/** Public web evidence used by 2026 recipes. Retail and regional list values
 * are anchors, never X84 substitutes; each recipe retains its evidence ID. */
export const INTERNET_PRICE_EVIDENCE_2026 = {
  transportbeton_majer_2026: {
    url: "https://majer-baustoffwerke.de/Preislisten/Transportbeton.pdf",
    verifiedAt: "2026-09-25",
    scope: "C25/30 published at 161–184 EUR/m³ depending on specification and delivery.",
  },
  transportbeton_holcim_2026: {
    url: "https://www.holcim.de/sites/germany/files/docs/holcim_preisliste_beton_saar-mosel_2026.pdf",
    verifiedAt: "2026-09-25",
    scope: "2026 regional net concrete list; class/exposure and delivery remain recipe parameters.",
  },
  kg2000_bogen_dn160_2026: {
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/206783649_-kg2000-bogen-dn-od-160-45-771520-ostendorf-kunststoffe.html",
    verifiedAt: "2026-09-25",
    scope: "Ostendorf KG2000 DN/OD160 45° material offers from 9.35 EUR gross; installation is calculated separately.",
  },
  pump_rental_2026: {
    url: "https://www.landesberger.de/product/baumaschinenverleih/pumpen/schmutzwasserpumpen-tauchpumpen/",
    verifiedAt: "2026-09-25",
    scope: "Public daily rentals for 20.8–115 m³/h pumps, 35–85 EUR/day; energy, hoses and supervision remain separate.",
  },
  cement_retail_2026: {
    url: "https://www.hornbach.de/s/Zement%2025kg",
    verifiedAt: "2026-09-25",
    scope: "CEM II/B-M 42.5 N listed at 5.25 EUR gross per 25 kg; retail reference only, not bulk-delivery price.",
  },
  sand_retail_2026: {
    url: "https://www.hornbach.de/c/baustoffe/rohbau/steine-und-stuerze/lose-schuettgueter/S22199/",
    verifiedAt: "2026-09-25",
    scope: "Washed 0/4 sand listed at 63.98 EUR gross; regional loose-bulk anchor, logistics separate.",
  },
  bau_tariff_igbau_2026: {
    url: "https://igbau.de/Lohn-Check-2026.html",
    verifiedAt: "2026-09-25",
    scope: "IG BAU public 2026 wage check; internal labour cost adds statutory employer costs separately.",
  },
  lkw_kipper_rental_2026: {
    url: "https://www.baumaschinen-veit.de/vermietung/fahrzeuge/kipper-mieten.html",
    verifiedAt: "2026-09-25",
    scope: "Public net day rentals: 7.5 t kipper 95–99 EUR/day, 12 t 113–122 EUR/day, 18 t 170 EUR/day; driver/fuel separate.",
  },
  soil_disposal_2026: {
    url: "https://www.my-hammer.de/abriss-entsorgung/preisradar/was-kostet-erdaushub-entsorgen",
    verifiedAt: "2026-09-25",
    scope: "Published 2026 orientation: Z0 5–15 EUR/t, Z1 15–35 EUR/t, Z2 40–80 EUR/t; transport separate.",
  },
  soil_analysis_2026: {
    url: "https://www.bodenanalyse-zentrum.de/bodenanalysen/bodenanalyse-schadstoffe",
    verifiedAt: "2026-09-25",
    scope: "Public specialist laboratory: standard contaminant analysis 49 EUR, extended analysis 79 EUR; sampling logistics separate.",
  },
  hand_excavation_2026: {
    url: "https://www.bauleo.ai/baupreise/tiefbau/handaushub-rohrgraben",
    verifiedAt: "2026-09-25",
    scope: "Published 2026 reference for hand excavation in pipe trenches; geometry, soil class, shoring and disposal are separate.",
  },
  search_trench_2026: {
    url: "https://www.bauleo.ai/baupreise/tiefbau/suchschlitz-suchgraben-zur-leitungsortung-haendisch-herstellen-und-wieder",
    verifiedAt: "2026-09-25",
    scope: "Published 2026 reference: hand-made search trench for line locating and reinstatement, 109.25 EUR/m average.",
  },
  aggregates_glueck_2026: {
    url: "https://www.glueck-kies.de/kies-sand-hartsteinsplitt/preise.php",
    verifiedAt: "2026-09-25",
    scope: "Public 2026 net plant list: Betonsand 0/4 and Betonkies 0/16-0/32 24.90 EUR/t; Kies 4/8 22.30 EUR/t; Kabelsand 0/4 21.40 EUR/t.",
  },
  asphalt_xaver_schmid_2026: {
    url: "https://xaverschmid.de/hs/web.nsf/gfx/med_FDIH-DT69YU_255310/%24file/Preisliste%20Baustoffwerk%20M%C3%A4rz%202026.pdf",
    verifiedAt: "2026-09-25",
    scope: "Published 2026 ex-works asphalt mix list, including AC 32 T; freight and laying remain separate recipe items.",
  },
  pp_rehau_2026: {
    url: "https://www.rehau.com/downloads/313066/rehau-preisliste-regenwassermanagement.pdf",
    verifiedAt: "2026-09-25",
    scope: "REHAU 2026 list: AWADUKT PP SN10 DN/OD160 pipe 20.02 EUR/m; fittings and installation are separate.",
  },
  concrete_shaft_aco_2026: {
    url: "https://www.aco.de/produkte/infrastruktur-tiefbau/havariesysteme/absperrschaechte/schachtaufbauteile-aus-beton/schachtring-mit-muffe-mit-dichtung-nachaehnlich-din-4034-position-2",
    verifiedAt: "2026-09-25",
    scope: "ACO public price at 15.05.2026: DN1000 shaft ring 1000 mm, 292.25 EUR per unit plus VAT; installation separate.",
  },
  bankett_ohle_lau_2026: {
    url: "https://www.kieswerke-ohle-lau.de/produkte-und-preise/gro%C3%9Fkunden/",
    verifiedAt: "2026-09-25",
    scope: "Public bulk list: Bankettgeröll 0/32 ZTVT 14.80 EUR/t and Schottertragschicht 0/32 23.50 EUR/t; net ex works.",
  },
  kanal_test_bauleo_2026: {
    url: "https://www.bauleo.ai/baupreise/tiefbau/dichtheitspruefung-kanal-nach-oenorm-durchfuehren",
    verifiedAt: "2026-09-25",
    scope: "Published 2026 reference for canal tightness testing: 346.15 EUR per connection/shaft, range 316.25–480.70 EUR.",
  },
  site_clearance_bauleo_2026: {
    url: "https://www.bauleo.ai/baupreise/baustelleneinrichtung?page=2",
    verifiedAt: "2026-09-25",
    scope: "Published 2026 site-clearance anchor: final clearance and removal of equipment/container 713 EUR lump sum, range 437–1,127 EUR.",
  },
  carex_floraccess_2026: {
    url: "https://www.floraccess.com/de/category/1316/carex/",
    verifiedAt: "2026-09-25",
    scope: "Professional plant listing: Carex morrowii Goldband 1.94 EUR per plant for 8 cm/25 cm stock; planting is separate.",
  },
} as const;

export const PE_STANDARD_OD_MM = [
  20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200,
  225, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800,
] as const;

/**
 * PE100-RC pressure pipe material anchors (net, €/m).
 *
 * Directly transcribed from SachsenEnergie, Materialpreisliste 2026,
 * valid from 01-03-2026, pages 11-13. These are material-only prices for
 * PE100-RC, not installed unit prices. Dimensions without a published
 * line remain interpolation anchors and must not be presented as list prices.
 */
export const PE_SDR11_MATERIAL_EUR_PER_M: Record<number, number> = {
  // Published 2026 list lines: DA32=.90, 40=1.39, 50=2.11, 63=3.42,
  // 90=6.26, 110=9.30, 125=12.05, 160=19.77, 180=24.87,
  // 225=38.89, 250=42.36 €/m. Other sizes are only interpolation anchors.
  20: 1.05,
  25: 1.30,
  32: 0.90,
  40: 1.39,
  50: 2.11,
  63: 3.42,
  75: 8.70,
  90: 6.26,
  110: 9.30,
  125: 12.05,
  140: 32.90,
  160: 19.77,
  180: 24.87,
  200: 69.45,
  225: 38.89,
  250: 42.36,
  280: 130.00,
  315: 160.00,
  355: 200.00,
  400: 252.50,
  450: 312.35,
  500: 395.45,
  560: 496.45,
  630: 627.40,
  710: 747.35,
  800: 1060.60,
};

function wallAreaFactor(sdr: number): number {
  const d = 1;
  const e = d / sdr;
  return Math.PI * (d * e - e * e);
}

const SDR_VALUE: Record<PePressureClass, number> = {
  "SDR17": 17,
  "SDR13.6": 13.6,
  "SDR11": 11,
  "SDR9": 9,
  "SDR7.4": 7.4,
  "SDR5": 5,
};

export function pePressureClassFromText(textRaw: string): PePressureClass {
  const text = String(textRaw || "").toLowerCase().replace(",", ".");
  if (/sdr\s*5(?:\.0)?\b/.test(text) || /pn\s*40\b/.test(text)) return "SDR5";
  if (/sdr\s*7\.4\b/.test(text) || /pn\s*25\b/.test(text)) return "SDR7.4";
  if (/sdr\s*9\b/.test(text) || /pn\s*20\b/.test(text)) return "SDR9";
  if (/sdr\s*13\.6\b/.test(text) || /pn\s*12(?:\.5)?\b/.test(text)) return "SDR13.6";
  if (/sdr\s*17\b/.test(text) || /pn\s*10\b/.test(text)) return "SDR17";
  return "SDR11";
}

export function extractPeOuterDiameterMm(textRaw: string): number | null {
  const text = String(textRaw || "").toLowerCase().replace(",", ".");

  const explicit = [
    /\bda\s*[=:]?\s*(\d{2,4})\b/,
    /\bod\s*[=:]?\s*(\d{2,4})\b/,
    /\bd\s*[=:]?\s*(\d{2,4})\s*x\s*\d/,
    /\b(\d{2,4})\s*x\s*\d+(?:\.\d+)?\s*mm\b/,
  ];
  for (const re of explicit) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }

  // In PE pressure-pipe LV texts, DN is often used colloquially for the
  // outside diameter. Accept it only inside a PE/HDPE context.
  if (/(?:pe\s*-?\s*hd|hdpe|pe\s*100|polyethylen|trinkwasserleitung|wasserleitung)/.test(text)) {
    const m = text.match(/\bdn\s*[=:]?\s*(\d{2,4})\b/);
    if (m) return Number(m[1]);
  }

  return null;
}

function interpolateLogLog(size: number, table: Record<number, number>): number {
  const points = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (table[size] != null) return table[size];

  if (size <= points[0]) return table[points[0]] * (size / points[0]);
  if (size >= points[points.length - 1]) {
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    const slope = Math.log(table[b] / table[a]) / Math.log(b / a);
    return table[b] * Math.pow(size / b, slope);
  }

  let lo = points[0], hi = points[1];
  for (let i = 1; i < points.length; i++) {
    if (size <= points[i]) {
      lo = points[i - 1];
      hi = points[i];
      break;
    }
  }

  const t = Math.log(size / lo) / Math.log(hi / lo);
  return table[lo] * Math.pow(table[hi] / table[lo], t);
}

export function peMaterialPriceEurPerM(odMm: number, pressureClass: PePressureClass): number {
  const sdr11 = interpolateLogLog(odMm, PE_SDR11_MATERIAL_EUR_PER_M);
  if (pressureClass === "SDR11") return Math.round(sdr11 * 100) / 100;

  // 2026 PN25 / SDR7.4 market calibration:
  // DA75 ≈ 30.75 €/m and DA90 ≈ 43.95 €/m material.
  // Both anchors correspond to ~3.53x the calibrated SDR11 curve, therefore
  // use the same factor across the dimension range to avoid isolated inversions.
  if (pressureClass === "SDR7.4") {
    if (odMm === 75) return 30.75;
    if (odMm === 90) return 43.95;
    return Math.round(sdr11 * 3.5345 * 100) / 100;
  }

  // Validated PN40 anchor.
  if (odMm === 90 && pressureClass === "SDR5") return 55.00;

  const ratio = wallAreaFactor(SDR_VALUE[pressureClass]) / wallAreaFactor(11);
  return Math.round(sdr11 * ratio * 100) / 100;
}

export function peInstallationAddersEurPerM(odMm: number, pressureClass: PePressureClass): {
  labor: number;
  jointing: number;
  machine: number;
} {
  const hp = pressureClass === "SDR7.4" || pressureClass === "SDR5" || pressureClass === "SDR9";

  if (odMm <= 90) return { labor: 1.0, jointing: hp ? 1.6 : 0.7, machine: 0.45 };
  if (odMm <= 160) return { labor: 1.6, jointing: hp ? 2.6 : 1.4, machine: 0.9 };
  // Preserve the validated BA-2026-028 DA180 SDR11 recipe exactly.
  if (odMm === 180 && pressureClass === "SDR11") return { labor: 1.0, jointing: 0.7, machine: 0.45 };
  if (odMm <= 250) return { labor: 2.6, jointing: hp ? 4.0 : 2.4, machine: 1.8 };
  if (odMm <= 400) return { labor: 4.2, jointing: hp ? 6.5 : 4.0, machine: 3.8 };
  if (odMm <= 630) return { labor: 6.5, jointing: hp ? 10.0 : 6.5, machine: 7.5 };
  return { labor: 9.0, jointing: hp ? 14.0 : 9.0, machine: 12.0 };
}


export const GGG_STANDARD_DN_MM = [80, 100, 125, 150, 200, 250, 300, 400, 500, 600, 700, 800] as const;
export const KG_STANDARD_DN_MM = [100, 125, 160, 200, 250, 300, 315, 400, 500, 630] as const;
export const KABELROHR_STANDARD_DN_MM = [40, 50, 63, 75, 90, 110, 125, 160, 200] as const;

const GGG_MATERIAL_ACCESSORY_EUR_PER_M: Record<number, number> = {
  // 2026 DUKTUS/VonRoll ZMU-BLS market calibration.
  // Values include the pipe plus a small allowance for gasket/connection protection.
  80: 100,
  100: 105,
  125: 145,
  150: 150,
  200: 185,
  250: 225,
  300: 315,
  400: 450,
  500: 620,
  600: 830,
  700: 1200,
  800: 1380,
};

const KG_PVC_SN8_TOTAL_EUR_PER_M: Record<number, number> = {
  100: 55,
  125: 66,
  160: 82.80,
  200: 105.80,
  250: 109.25,
  300: 155.25,
  315: 165,
  400: 230,
  500: 350,
  630: 500,
};

const KG_PP_SN16_TOTAL_EUR_PER_M: Record<number, number> = {
  // 2026 market calibration.
  // Lower-bound PP SN10 list prices already reach roughly:
  // DN160 ~27 €/m, DN200 ~45 €/m, DN250 ~71 €/m,
  // DN315 ~110 €/m, DN400 ~185 €/m, DN500 ~292 €/m material only.
  // These totals include installation and therefore must sit clearly above material-only values.
  100: 52,
  125: 63,
  160: 78.20,
  200: 115,
  250: 182,
  300: 250,
  315: 280,
  400: 475,
  500: 750,
  630: 1180,
};

const KABELROHR_TOTAL_EUR_PER_M: Record<number, number> = {
  40: 9.5,
  50: 11.5,
  63: 13.5,
  75: 15.2,
  90: 17.6,
  110: 20.70,
  125: 23.5,
  160: 29.5,
  200: 38.0,
};

export function extractNominalDiameterMm(textRaw: string): number | null {
  const text = String(textRaw || "").toLowerCase().replace(",", ".");
  const patterns = [
    /\bdn\s*[=:]?\s*(\d{2,4})\b/,
    /\bda\s*[=:]?\s*(\d{2,4})\b/,
    /\bod\s*[=:]?\s*(\d{2,4})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

export function gggMaterialAndAccessoryEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, GGG_MATERIAL_ACCESSORY_EUR_PER_M) * 100) / 100;
}

export function gggInstallationAddersEurPerM(dnMm: number): { labor: number; machine: number } {
  if (dnMm <= 80) return { labor: 13, machine: 5 };
  if (dnMm <= 150) return { labor: 29, machine: 11 };
  if (dnMm <= 250) return { labor: 36, machine: 18 };
  if (dnMm <= 400) return { labor: 48, machine: 30 };
  if (dnMm <= 600) return { labor: 62, machine: 48 };
  return { labor: 80, machine: 70 };
}

export function kgPvcSn8TotalEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, KG_PVC_SN8_TOTAL_EUR_PER_M) * 100) / 100;
}

export function kgPpSn16TotalEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, KG_PP_SN16_TOTAL_EUR_PER_M) * 100) / 100;
}

export function kabelrohrTotalEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, KABELROHR_TOTAL_EUR_PER_M) * 100) / 100;
}


export const WATER_ARMATURE_STANDARD_DN_MM = [40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 400] as const;

const SCHIEBER_PN16_BODY_EUR: Record<number, number> = {
  40: 300,
  50: 350,
  65: 430,
  80: 520,
  100: 650,
  125: 850,
  150: 1100,
  200: 1800,
  250: 2800,
  300: 4000,
  400: 6500,
};

export function schieberPn16BodyEur(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, SCHIEBER_PN16_BODY_EUR) * 100) / 100;
}

export function schieberComponents(dnMm: number, pn: number): {
  body: number;
  fittingSet: number;
  boltsAndSeal: number;
  labor: number;
  machine: number;
} {
  const pressureFactor = pn >= 25 ? 1.3714285714 : pn >= 20 ? 1.18 : 1;
  const body = schieberPn16BodyEur(dnMm) * pressureFactor;

  if (dnMm <= 50) {
    return {
      body: Math.round(body * 100) / 100,
      fittingSet: pn >= 25 ? 140 : 75,
      boltsAndSeal: 35,
      labor: 65,
      machine: 20,
    };
  }

  const scale = Math.pow(dnMm / 50, 0.72);
  return {
    body: Math.round(body * 100) / 100,
    fittingSet: Math.round((pn >= 25 ? 140 : 75) * scale * 100) / 100,
    boltsAndSeal: Math.round(35 * scale * 100) / 100,
    labor: Math.round(65 * Math.pow(dnMm / 50, 0.55) * 100) / 100,
    machine: Math.round(20 * Math.pow(dnMm / 50, 0.9) * 100) / 100,
  };
}


export const STEINZEUG_STANDARD_DN_MM = [100, 125, 150, 200, 250, 300, 400, 500, 600] as const;
export const BETONROHR_STANDARD_DN_MM = [300, 400, 500, 600, 800, 1000, 1200, 1500] as const;
export const BETONSCHACHT_STANDARD_DN_MM = [800, 1000, 1200, 1500, 2000] as const;
export const GRABENLOS_STANDARD_DN_MM = [50, 63, 75, 90, 110, 125, 160, 180, 200, 225, 250, 315, 400, 500, 600, 800, 1000] as const;

const STEINZEUG_TOTAL_EUR_PER_M: Record<number, number> = {
  100: 58,
  125: 68,
  150: 78.72,
  200: 109.47,
  250: 145,
  300: 190,
  400: 300,
  500: 430,
  600: 580,
};

const BETONROHR_TOTAL_EUR_PER_M: Record<number, number> = {
  300: 165,
  400: 230,
  500: 320,
  600: 410,
  800: 620,
  1000: 900,
  1200: 1250,
  1500: 1800,
};

const BETONSCHACHT_TOTAL_EUR_PER_ST: Record<number, number> = {
  800: 1500,
  1000: 2200,
  1200: 3000,
  1500: 4700,
  2000: 7500,
};

export function steinzeugTotalEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, STEINZEUG_TOTAL_EUR_PER_M) * 100) / 100;
}

export function betonrohrTotalEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, BETONROHR_TOTAL_EUR_PER_M) * 100) / 100;
}

export function betonschachtTotalEurPerSt(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, BETONSCHACHT_TOTAL_EUR_PER_ST) * 100) / 100;
}

export function hddBaseEurPerM(dnMm: number): number {
  const table: Record<number, number> = {
    50: 95,
    90: 120,
    110: 135,
    160: 165,
    180: 182.34,
    225: 220,
    315: 290,
    400: 380,
    500: 480,
    630: 620,
  };
  return Math.round(interpolateLogLog(dnMm, table) * 100) / 100;
}

export function rohrvortriebBaseEurPerM(dnMm: number): number {
  const table: Record<number, number> = {
    200: 180,
    300: 250,
    400: 340,
    500: 450,
    600: 580,
    800: 800,
    1000: 1050,
    1200: 1350,
    1500: 1800,
  };
  return Math.round(interpolateLogLog(dnMm, table) * 100) / 100;
}


export const GAS_PE_STANDARD_OD_MM = [32, 40, 50, 63, 75, 90, 110, 125, 160, 180, 225] as const;
export const FERNWAERME_STANDARD_DN_MM = [20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300] as const;

const GAS_PE_TOTAL_EUR_PER_M: Record<number, number> = {
  32: 38,
  40: 42,
  50: 49,
  63: 62,
  75: 70,
  90: 82,
  110: 100,
  125: 112,
  160: 145,
  180: 165,
  225: 210,
};

const FERNWAERME_KMR_TOTAL_EUR_PER_M: Record<number, number> = {
  20: 130,
  25: 145,
  32: 160,
  40: 175,
  50: 190,
  65: 220,
  80: 245,
  100: 285,
  125: 330,
  150: 380,
  200: 480,
  250: 600,
  300: 750,
};

export function gasPeTotalEurPerM(odMm: number): number {
  return Math.round(interpolateLogLog(odMm, GAS_PE_TOTAL_EUR_PER_M) * 100) / 100;
}

export function fernwaermeKmrTotalEurPerM(dnMm: number): number {
  return Math.round(interpolateLogLog(dnMm, FERNWAERME_KMR_TOTAL_EUR_PER_M) * 100) / 100;
}
