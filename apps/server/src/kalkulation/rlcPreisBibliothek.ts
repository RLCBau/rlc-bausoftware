import { generateRlcTiefbauPreisCatalog } from "./rlcTiefbauPreisCatalog";
import {
  PERSONNEL_INTERNAL_COST_2026,
  MACHINE_INTERNAL_COST_2026,
  COMMERCIAL_REGIE_2026,
} from "./autonomous/tiefbauCostRates2026";
// apps/server/src/kalkulation/rlcPreisBibliothek.ts

export type RlcPreisGroup =
  | "Personal"
  | "Maschinen"
  | "LKW / Transport"
  | "Material"
  | "Entsorgung"
  | "Fremdleistung"
  | "Gemeinkosten"
  | "Risiko"
  | "Gewinn";

export type RlcPriceOrigin =
  | "LIST_PRICE_VERIFIED"
  | "COMPANY_CALIBRATION"
  | "LEGACY_UNVERIFIED"
  | "DERIVED_FAMILY";

export type RlcPreisItem = {
  id: string;
  group: RlcPreisGroup;
  category: string;
  name: string;
  unit: string;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  keywords: string[];
  /**
   * Economic provenance is explicit. Items without a recorded external source
   * are legacy/unverified; generated family items are never list prices.
   */
  priceOrigin?: RlcPriceOrigin;
  sourcePublisher?: string;
  sourceUrl?: string;
  sourceDate?: string;
  validFrom?: string;
  validTo?: string;
  notes?: string;
};

/**
 * Manufacturer list prices with an explicit source and validity. These are
 * material-only prices; installation stays in the Urkalkulation as labor and
 * machine resources. Do not put installed EPs in this block.
 */
const RLC_VERIFIED_LIST_PRICES_2026: RlcPreisItem[] = [
  {
    id: "list-2026-ostendorf-kg2000-sn16-rohr-dn160",
    group: "Material", category: "Kanalbau / KG2000 SN16",
    name: "KG2000EM Rohr mit Muffe DN/OD 160 SN16, 6 m",
    unit: "m", minPrice: 13.45, avgPrice: 13.45, maxPrice: 13.45,
    keywords: ["kg2000", "kg-pp", "pp", "sn16", "dn160", "rohr", "muffe"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Ostendorf Kunststoffe",
    sourceUrl: "https://www.ostendorf-kunststoffe.com/downloads/kataloge/",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Hersteller-Preisliste 2026: 80,70 € je 6-m-Rohr = 13,45 €/m; Material ohne Verlegung.",
  },
  {
    id: "list-2026-ostendorf-kg2000-sn16-abzweig-110-110",
    group: "Material", category: "Kanalbau / KG2000 SN16",
    name: "KG2000 Abzweig 87,5° DN/OD 110/110 SN16",
    unit: "St", minPrice: 15.70, avgPrice: 15.70, maxPrice: 15.70,
    keywords: ["kg2000", "kg-pp", "pp", "sn16", "abzweig", "87,5", "dn110"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Ostendorf Kunststoffe",
    sourceUrl: "https://www.ostendorf-kunststoffe.com/downloads/kataloge/",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Hersteller-Preisliste 2026; Material ohne Montage.",
  },
  {
    id: "list-2026-ostendorf-kg2000-sn16-abzweig-125-125",
    group: "Material", category: "Kanalbau / KG2000 SN16",
    name: "KG2000 Abzweig 87,5° DN/OD 125/125 SN16",
    unit: "St", minPrice: 22.30, avgPrice: 22.30, maxPrice: 22.30,
    keywords: ["kg2000", "kg-pp", "pp", "sn16", "abzweig", "87,5", "dn125"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Ostendorf Kunststoffe",
    sourceUrl: "https://www.ostendorf-kunststoffe.com/downloads/kataloge/",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Hersteller-Preisliste 2026; Material ohne Montage.",
  },
  {
    id: "list-2026-ostendorf-kg2000-sn16-abzweig-200-110",
    group: "Material", category: "Kanalbau / KG2000 SN16",
    name: "KG2000 Abzweig 87,5° DN/OD 200/110 SN16",
    unit: "St", minPrice: 73.00, avgPrice: 73.00, maxPrice: 73.00,
    keywords: ["kg2000", "kg-pp", "pp", "sn16", "abzweig", "87,5", "dn200", "dn110"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Ostendorf Kunststoffe",
    sourceUrl: "https://www.ostendorf-kunststoffe.com/downloads/kataloge/",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Hersteller-Preisliste 2026; Material ohne Montage.",
  },
  {
    id: "list-2026-frostschutz-032-t",
    group: "Material", category: "Schüttgut / Frostschutz",
    name: "Frostschutz 0/32",
    unit: "t", minPrice: 29.41, avgPrice: 29.41, maxPrice: 29.41,
    keywords: ["frostschutz", "frostschutzkies", "0/32", "mineralgemisch", "tragschicht"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "baustoffe-liefern.de",
    sourceUrl: "https://www.baustoffe-liefern.de/Schotter/Preisliste-Schotter.html",
    sourceDate: "2026-07-01", validFrom: "2026-07-01",
    notes: "Öffentliche Preisliste Juli 2026, netto je t, Material ab Werk/ohne Einbau und Transport.",
  },
  {
    id: "list-2026-kabelsand-04-t",
    group: "Material", category: "Schüttgut / Sand",
    name: "Kabelsand 0/4",
    unit: "t", minPrice: 21.40, avgPrice: 21.40, maxPrice: 21.40,
    keywords: ["kabelsand", "sand", "0/4", "rohrsand", "bettung"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Glück Kies-Sand-Hartsteinsplitt",
    sourceUrl: "https://www.glueck-kies.de/kies-sand-hartsteinsplitt/preise.php",
    sourceDate: "2026-04-01", validFrom: "2026-04-01",
    notes: "Öffentliche Preisliste ab 01.04.2026, netto je t, Material ohne Transport/Einbau.",
  },
  {
    id: "list-2026-kies-816-t",
    group: "Material", category: "Schüttgut / Kies",
    name: "Kies 8/16",
    unit: "t", minPrice: 22.30, avgPrice: 22.30, maxPrice: 22.30,
    keywords: ["kies", "8/16", "filterkies", "drainage", "sickerkies"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Glück Kies-Sand-Hartsteinsplitt",
    sourceUrl: "https://www.glueck-kies.de/kies-sand-hartsteinsplitt/preise.php",
    sourceDate: "2026-04-01", validFrom: "2026-04-01",
    notes: "Öffentliche Preisliste ab 01.04.2026, netto je t, Material ohne Transport/Einbau.",
  },
  {
    id: "list-2026-asphalt-ac32tn-t",
    group: "Material", category: "Asphalt / Tragschicht",
    name: "Asphaltmischgut AC 32 TN 50/70",
    unit: "t", minPrice: 106.40, avgPrice: 106.40, maxPrice: 106.40,
    keywords: ["ac 32", "ac32", "tn", "asphalttragschicht", "tragschicht"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Xaver Schmid Asphaltmischwerk",
    sourceUrl: "https://www.xaverschmid.de/hs/web.nsf/gfx/med_fdih-dt69yt_2552e4/%24file/Preisliste%20Asphaltmischgut%20M%C3%A4rz%202026.pdf",
    sourceDate: "2026-03-01", validFrom: "2026-03-01",
    notes: "Preisliste März 2026, netto je t ab Werk; Einbau, Transport und Bindemittelzuschläge getrennt.",
  },
  {
    id: "list-2026-asphalt-ac32tn-late-t",
    group: "Material", category: "Asphalt / Tragschicht",
    name: "Asphaltmischgut AC 32 TN 50/70",
    unit: "t", minPrice: 136.10, avgPrice: 136.10, maxPrice: 136.10,
    keywords: ["ac 32", "ac32", "tn", "asphalttragschicht", "tragschicht"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Schwarzenbeck Asphaltmischwerk",
    sourceUrl: "https://www.schwarzenbeck.de/wp-content/uploads/preisliste-asphaltmischgut.pdf",
    sourceDate: "2026-06-15", validFrom: "2026-06-15",
    notes: "Preisliste ab 15.06.2026, netto je t ab Werk; regionaler Vergleichsanker, kein gemittelter Einbaupreis.",
  },
  ...[
    [32, 0.90], [40, 1.39], [50, 2.11], [63, 3.42], [90, 6.26],
    [110, 9.30], [125, 12.05], [160, 19.77], [180, 24.87],
    [225, 38.89], [250, 42.36],
  ].map(([diameterMm, priceEurPerM]) => ({
    id: `list-2026-sachsenenergie-pe100rc-da${diameterMm}`,
    group: "Material" as const,
    category: "Druckrohr / PE100-RC SDR11",
    name: `PE100-RC Rohr DA ${diameterMm}, SDR11 / PN16`,
    unit: "m" as const,
    minPrice: priceEurPerM!,
    avgPrice: priceEurPerM!,
    maxPrice: priceEurPerM!,
    keywords: ["pe100", "pe100-rc", "pe", "hdpe", "sdr11", "pn16", `da${diameterMm}`, `dn${diameterMm}`, "rohr"],
    priceOrigin: "LIST_PRICE_VERIFIED" as const,
    sourcePublisher: "SachsenEnergie AG",
    sourceUrl: "https://www.sachsenenergie.de/wps/wcm/connect/energie/dd0b32ea-32a4-4f5b-9669-05c3c9091c4d/Materialpreisliste-2026.pdf?CVID=pOJaMWE&MOD=AJPERES",
    sourceDate: "2026-03-01",
    validFrom: "2026-03-01",
    notes: "Materialpreisliste 2026, gültig ab 01.03.2026: PE100-RC Rohr; netto €/m inklusive Standardlieferung im ostsächsischen Raum, ohne Verlegung und Schweißung.",
  })),
  ...[
    [50, 0.638], [75, 0.8098], [90, 1.0552], [110, 1.2024], [160, 2.4416],
  ].map(([diameterMm, priceEurPerM]) => ({
    id: `list-2026-sachsenenergie-ksr-pe-flex-dn${diameterMm}`,
    group: "Material" as const,
    category: "Kabelbau / Kabelschutzrohr PE flexibel",
    name: `Kabelschutzrohr PE flexibel DN ${diameterMm}`,
    unit: "m" as const,
    minPrice: priceEurPerM!,
    avgPrice: priceEurPerM!,
    maxPrice: priceEurPerM!,
    keywords: ["kabelschutzrohr", "ksr", "pe", "flexibel", `dn${diameterMm}`, "rohr"],
    priceOrigin: "LIST_PRICE_VERIFIED" as const,
    sourcePublisher: "SachsenEnergie AG",
    sourceUrl: "https://www.sachsenenergie.de/wps/wcm/connect/energie/dd0b32ea-32a4-4f5b-9669-05c3c9091c4d/Materialpreisliste-2026.pdf?CVID=pOJaMWE&MOD=AJPERES",
    sourceDate: "2026-03-01",
    validFrom: "2026-03-01",
    notes: "Materialpreisliste 2026, gültig ab 01.03.2026, S. 60; netto €/m inklusive Standardlieferung im ostsächsischen Raum, ohne Verlegung und Muffen.",
  })),
  ...[
    [250, 173.25], [500, 212.50], [750, 248.75], [1000, 292.25],
  ].map(([heightMm, priceEurPerPiece]) => ({
    id: `list-2026-aco-schachtring-dn1000-h${heightMm}`,
    group: "Material" as const,
    category: "Schachtbau / Betonschachtring DN1000",
    name: `Betonschachtring DN 1000, Höhe ${heightMm} mm, mit Dichtung`,
    unit: "St" as const,
    minPrice: priceEurPerPiece!,
    avgPrice: priceEurPerPiece!,
    maxPrice: priceEurPerPiece!,
    keywords: ["betonschacht", "schachtring", "dn1000", `h${heightMm}`, "din 4034", "dichtung"],
    priceOrigin: "LIST_PRICE_VERIFIED" as const,
    sourcePublisher: "ACO GmbH",
    sourceUrl: "https://www.aco.de/produkte/infrastruktur-tiefbau/abscheider/leichtfluessigkeitsabscheider/lfa-filterlose-koaleszenzeinheit-beton/schachtaufbauteile-aus-beton/schachtring-mit-muffe-mit-dichtung-nachaehnlich-din-4034-position-2",
    sourceDate: "2026-05-15",
    validFrom: "2026-05-15",
    notes: "UVP netto 2026 je Stück; reines Schachtbauteil ohne Transport, Versetzen, Mörtel und Abdeckung.",
  })),
  {
    id: "list-2026-rehau-draenschacht-dn315",
    group: "Material", category: "Drainage / Dränschacht",
    name: "REHAU Dränschacht-Unterteil DN 315 mit 3 Abgängen DN/OD 200",
    unit: "St", minPrice: 176, avgPrice: 176, maxPrice: 176,
    keywords: ["rehau", "draenschacht", "dränschacht", "dn315", "dn 315", "dn200", "drainage", "sandfang"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/313066/rehau-preisliste-regenwassermanagement.pdf",
    sourceDate: "2026-04-20", validFrom: "2026-04-21",
    notes: "Regenwassermanagement Preisliste 2026; netto je Stück, Material ohne Einbau.",
  },
  {
    id: "list-2026-kuehne-sickerbrunnen-dn1000",
    group: "Material", category: "Schachtbau / Sickerbrunnen",
    name: "KÜHNE-IDEAL Schluck-/Sickerbrunnen DN 1000, Komplettsatz",
    unit: "St", minPrice: 1963.30, avgPrice: 1963.30, maxPrice: 1963.30,
    keywords: ["sickerbrunnen", "sickerschacht", "dn1000", "dn 1000", "schachtring", "versickerung"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Betonwerk Kühne GmbH & Co. KG",
    sourceUrl: "https://www.betonwerk-kuehne.de/wp-content/uploads/Kuehne_Preisliste_2026.pdf",
    sourceDate: "2026-01-21", validFrom: "2026-01-01",
    notes: "Preisliste 2026; Komplettsatz DN1000 gemäß Herstelleraufbau, Material ohne Einbau und Baustellentransport.",
  },
  {
    id: "list-2026-rehau-rausikko-frontgitter-dn110-200",
    group: "Material", category: "Regenwasser / RAUSIKKO",
    name: "REHAU RAUSIKKO Frontgitter PP, Anschluss KG DN110-200",
    unit: "St", minPrice: 6.50, avgPrice: 6.50, maxPrice: 6.50,
    keywords: ["rehau", "rausikko", "frontgitter", "pp", "dn110", "dn160", "dn200"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/1024590/rehau-preisliste-regenwassermanagement.pdf",
    sourceDate: "2025-11-01", validFrom: "2026-01-01",
    notes: "REHAU Regenwassermanagement Preisliste 2026; netto je Stück, Material ohne Einbau.",
  },
  {
    id: "list-2026-rehau-rausikko-box-86sc-dn160",
    group: "Material", category: "Regenwasser / RAUSIKKO Box",
    name: "REHAU RAUSIKKO Box 8.6 SC mit seitlichem Zulauf DN160",
    unit: "St", minPrice: 582.00, avgPrice: 582.00, maxPrice: 582.00,
    keywords: ["rehau", "rausikko", "box", "8.6 sc", "seitlicher zulauf", "dn160"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/1024590/rehau-preisliste-regenwassermanagement.pdf",
    sourceDate: "2025-11-01", validFrom: "2026-01-01",
    notes: "REHAU Regenwassermanagement Preisliste 2026; netto je Stück, Material ohne Einbau.",
  },
  {
    id: "list-2026-rehau-rausikko-box-86sc-dn200",
    group: "Material", category: "Regenwasser / RAUSIKKO Box",
    name: "REHAU RAUSIKKO Box 8.6 SC mit seitlichem Zulauf DN200",
    unit: "St", minPrice: 582.00, avgPrice: 582.00, maxPrice: 582.00,
    keywords: ["rehau", "rausikko", "box", "8.6 sc", "seitlicher zulauf", "dn200"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/1024590/rehau-preisliste-regenwassermanagement.pdf",
    sourceDate: "2025-11-01", validFrom: "2026-01-01",
    notes: "REHAU Regenwassermanagement Preisliste 2026; netto je Stück, Material ohne Einbau.",
  },
  {
    id: "list-2026-rehau-schmutzeimer-gross-ohne-filter",
    group: "Material", category: "Regenwasser / RAUSIKKO Zubehör",
    name: "REHAU RAUSIKKO Schmutzeimer groß ohne Feinfilter DN400-500",
    unit: "St", minPrice: 48.50, avgPrice: 48.50, maxPrice: 48.50,
    keywords: ["rehau", "rausikko", "schmutzeimer", "schlammfang", "dn400", "dn500"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/313066/rehau-preisliste-regenwassermanagement.pdf",
    sourceDate: "2026-04-20", validFrom: "2026-04-21",
    notes: "REHAU Regenwassermanagement Preisliste 2026; netto je Stück, ohne Feinfilter und ohne Einbau.",
  },
  {
    id: "list-2026-rehau-filtervliessack-schmutzeimer",
    group: "Material", category: "Regenwasser / RAUSIKKO Zubehör",
    name: "REHAU Filtervliessack für RAUSIKKO Schmutzeimer groß",
    unit: "St", minPrice: 92.29, avgPrice: 92.29, maxPrice: 92.29,
    keywords: ["rehau", "rausikko", "filtervliessack", "schmutzeimer", "feinfilter"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/313066/rehau-preisliste-regenwassermanagement.pdf",
    sourceDate: "2026-04-20", validFrom: "2026-04-21",
    notes: "REHAU Regenwassermanagement Preisliste 2026; netto je Stück, Material ohne Einbau.",
  },
  {
    id: "list-2026-rehau-awaschacht-konus-dn1000-625",
    group: "Material", category: "Schachtbau / Kunststoffschacht",
    name: "REHAU AWASCHACHT PP Konus DN 1000/625",
    unit: "St", minPrice: 361, avgPrice: 361, maxPrice: 361,
    keywords: ["rehau", "awaschacht", "schachtkonus", "konus", "dn1000", "dn625", "1000/625", "pp"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/1060386/regenwassermanagement.pdf",
    sourceDate: "2025-11-01", validFrom: "2026-01-01",
    notes: "REHAU Regenwassermanagement 2026; netto €/St, Konus ohne Dichtungen und ohne Einbau.",
  },
  ...[
    [125,238],[250,262],[500,338],[750,468],[1000,583],
  ].map(([heightMm, priceEurPerPiece]) => ({
    id: `list-2026-rehau-awaschacht-ring-dn1000-h${heightMm}`,
    group: "Material" as const,
    category: "Schachtbau / Kunststoffschacht",
    name: `REHAU AWASCHACHT PP Schachtring DN1000 Nutzhöhe ${heightMm} mm`,
    unit: "St" as const,
    minPrice: priceEurPerPiece!,
    avgPrice: priceEurPerPiece!,
    maxPrice: priceEurPerPiece!,
    keywords: ["rehau","awaschacht","schachtring","dn1000",`h${heightMm}`,`höhe ${heightMm}`,"pp"],
    priceOrigin: "LIST_PRICE_VERIFIED" as const,
    sourcePublisher: "REHAU Industries SE & Co. KG",
    sourceUrl: "https://www.rehau.com/downloads/1060386/regenwassermanagement.pdf",
    sourceDate: "2025-11-01",
    validFrom: "2026-01-01",
    notes: "REHAU Regenwassermanagement 2026; netto €/St, Ring ohne Elementdichtung und ohne Einbau.",
  })),
  {
    id: "list-2026-aco-schachtabdeckung-d400-lw600",
    group: "Material", category: "Schachtbau / Schachtabdeckung",
    name: "ACO Schachtabdeckung D400 LW600, Citytop/Bituplan-Ausführung",
    unit: "St", minPrice: 503.80, avgPrice: 503.80, maxPrice: 503.80,
    keywords: ["aco","schachtabdeckung","d400","lw600","dn625","guss","begu","citytop","bituplan"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "ACO Österreich",
    sourceUrl: "https://www.yumpu.com/de/document/view/70879230/aco-osterreich-bauelemente-preisliste-2026-03-schachtabdeckungen",
    sourceDate: "2026-07-01", validFrom: "2026-07-01",
    notes: "ACO Preisliste 2026/2; netto €/St für konkrete Citytop/Bituplan-Ausführung, ohne Versetzen/Mörtel.",
  },
  {
    id: "list-2026-aco-duropren-begu-d400-lw600",
    group: "Material", category: "Schachtbau / Schachtabdeckung",
    name: "ACO Duropren BEGU Schachtabdeckung rund D400 LW600",
    unit: "St", minPrice: 393, avgPrice: 393, maxPrice: 393,
    keywords: ["aco","duropren","begu","schachtabdeckung","d400","lw600","dn625","guss","din 19584"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "ACO GmbH",
    sourceUrl: "https://www.aco-detego.de/produkte/kanalguss/schachtabdeckungen-und-einlaufroste/schachtabdeckungen-rund-duropren-standard/klasse-d-400/lichte-weite-600/rahmenausfuehrung-duropren-begu-rund-und-begu-deckel",
    sourceDate: "2026-05-15", validFrom: "2026-05-15",
    notes: "UVP netto 2026 €/St; D400, lichte Weite 600, BEGU-Rahmen/Deckel; ohne Versetzen, Mörtel und Schmutzfänger.",
  },
  {
    id: "list-2026-alva-pe-endkappe-da32-sdr11",
    group: "Material", category: "PE-Formstücke / Endkappen",
    name: "ALVA PE Elektroschweiß-Endkappe DA32 SDR11",
    unit: "St", minPrice: 18.96, avgPrice: 18.96, maxPrice: 18.96,
    keywords: ["alva","pe","endkappe","elektroschweiss","elektroschweiß","da32","da 32","sdr11"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "SOLARVIC",
    sourceUrl: "https://solarvic.at/products/alva-pe-elektroschweiss-endkappe-da32-sdr11-oevgw-gepr-atpeek11-32",
    sourceDate: "2026-09-24", validFrom: "2026-09-24",
    notes: "Aktueller Webshoppreis 18,96 EUR netto/St; Material ohne Montage und Transport.",
  },
  {
    id: "list-2026-alva-pe-endkappe-da50-sdr11",
    group: "Material", category: "PE-Formstücke / Endkappen",
    name: "ALVA PE Elektroschweiß-Endkappe DA50 SDR11",
    unit: "St", minPrice: 31.21, avgPrice: 31.21, maxPrice: 31.21,
    keywords: ["alva","pe","endkappe","elektroschweiss","elektroschweiß","da50","da 50","sdr11"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "SOLARVIC",
    sourceUrl: "https://solarvic.at/products/alva-pe-elektroschweiss-endkappe-da50-sdr11-oevgw-gepr-atpeek11-50",
    sourceDate: "2026-09-24", validFrom: "2026-09-24",
    notes: "Aktueller Webshoppreis 31,21 EUR netto/St; Material ohne Montage und Transport.",
  },
  {
    id: "list-2026-dangl-schachtring-dn1000-h1000",
    group: "Material", category: "Schachtbau / Betonschacht",
    name: "Dangl Beton Schachtring SR-M DN1000 H1000 mit Steigeisen",
    unit: "St", minPrice: 186.20, avgPrice: 186.20, maxPrice: 186.20,
    keywords: ["dangl","beton","schachtring","sr-m","dn1000","h1000","steigeisen","din en 1917"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Dangl Beton",
    sourceUrl: "https://www.dangl-beton.de/pdfs/Dangl_Preisliste2026.pdf",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Preisliste 2026; 186,20 EUR/St ab Werk für SR-M DN1000 H1000 mit Steigeisen; Dichtung, Transport und Einbau separat.",
  },
  {
    id: "list-2026-dangl-gleitringdichtung-dn1000",
    group: "Material", category: "Schachtbau / Dichtung",
    name: "Dangl Gleitringdichtung selbstfettend für SR-M DN1000",
    unit: "St", minPrice: 61.10, avgPrice: 61.10, maxPrice: 61.10,
    keywords: ["dangl","gleitringdichtung","dichtung","dn1000","schachtring","sr-m","selbstfettend"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Dangl Beton",
    sourceUrl: "https://www.dangl-beton.de/pdfs/Dangl_Preisliste2026.pdf",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Preisliste 2026; 61,10 EUR/St ab Werk, selbstfettende Gleitringdichtung; Einbau separat.",
  },
  {
    id: "list-2026-dangl-schachthals-dn1000-625-h600",
    group: "Material", category: "Schachtbau / Betonschacht",
    name: "Dangl Beton Schachthals SH-M DN1000/625 H600",
    unit: "St", minPrice: 126.90, avgPrice: 126.90, maxPrice: 126.90,
    keywords: ["dangl","beton","schachthals","schachtkonus","konus","dn1000","dn625","1000/625","h600","din en 1917"],
    priceOrigin: "LIST_PRICE_VERIFIED", sourcePublisher: "Dangl Beton",
    sourceUrl: "https://www.dangl-beton.de/pdfs/Dangl_Preisliste2026.pdf",
    sourceDate: "2026-01-01", validFrom: "2026-01-01",
    notes: "Preisliste 2026; 126,90 €/St ab Werk für SH-M 1000/625 H600 mit Steigeisen; Transport, Dichtung und Einbau separat.",
  },
];

export const RLC_PREIS_BIBLIOTHEK: RlcPreisItem[] = [
  // ================= PERSONAL =================
  {
    id: "personal-facharbeiter",
    group: "Personal",
    category: "Personal",
    name: "Facharbeiter Tiefbau",
    unit: "h",
    minPrice: 45,
    avgPrice: PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4,
    maxPrice: 56,
    keywords: ["facharbeiter", "arbeiter", "tiefbauer", "kolonne"],
  },
  {
    id: "personal-helfer",
    group: "Personal",
    category: "Personal",
    name: "Bauhelfer",
    unit: "h",
    minPrice: 32,
    avgPrice: PERSONNEL_INTERNAL_COST_2026.helper_lg2,
    maxPrice: 41,
    keywords: ["helfer", "bauhelfer", "arbeiter"],
  },
  {
    id: "personal-polier",
    group: "Personal",
    category: "Personal",
    name: "Polier / Vorarbeiter",
    unit: "h",
    minPrice: 52,
    avgPrice: PERSONNEL_INTERNAL_COST_2026.polier_lg6,
    maxPrice: 66,
    keywords: ["polier", "vorarbeiter", "bauleiter", "aufsicht"],
  },
  {
    id: "personal-vermessungstechniker",
    group: "Personal",
    category: "Vermessung",
    name: "Vermessungstechniker",
    unit: "h",
    minPrice: 50,
    avgPrice: PERSONNEL_INTERNAL_COST_2026.vermessung,
    maxPrice: 68,
    keywords: ["vermessung", "aufmaß", "absteckung", "einmessung"],
  },

  // ================= MASCHINEN =================
  {
    id: "maschine-minibagger-2t",
    group: "Maschinen",
    category: "Bagger",
    name: "Minibagger 1,5–2,5 t",
    unit: "h",
    minPrice: 15,
    avgPrice: MACHINE_INTERNAL_COST_2026.mini_excavator_2t,
    maxPrice: 24,
    keywords: ["minibagger", "bagger", "aushub", "graben"],
  },
  {
    id: "maschine-bagger-5t",
    group: "Maschinen",
    category: "Bagger",
    name: "Kompaktbagger 5–6 t",
    unit: "h",
    minPrice: 24,
    avgPrice: MACHINE_INTERNAL_COST_2026.compact_excavator_6t,
    maxPrice: 34,
    keywords: ["bagger", "kompaktbagger", "aushub", "rohrgraben"],
  },
  {
    id: "maschine-bagger-12t",
    group: "Maschinen",
    category: "Bagger",
    name: "Mobil-/Kettenbagger 10–15 t",
    unit: "h",
    minPrice: 38,
    avgPrice: MACHINE_INTERNAL_COST_2026.excavator_14t,
    maxPrice: 54,
    keywords: ["bagger", "kettenbagger", "mobilbagger", "erdbau"],
  },
  {
    id: "maschine-radlader",
    group: "Maschinen",
    category: "Lader",
    name: "Radlader",
    unit: "h",
    minPrice: 21,
    avgPrice: MACHINE_INTERNAL_COST_2026.wheel_loader_09,
    maxPrice: 31,
    keywords: ["radlader", "laden", "material", "umschlag"],
  },
  {
    id: "maschine-ruettelplatte",
    group: "Maschinen",
    category: "Verdichtung",
    name: "Rüttelplatte",
    unit: "h",
    minPrice: 5,
    avgPrice: MACHINE_INTERNAL_COST_2026.plate_light,
    maxPrice: 12,
    keywords: ["rüttelplatte", "verdichten", "verdichtung", "pflaster"],
  },
  {
    id: "maschine-stampfer",
    group: "Maschinen",
    category: "Verdichtung",
    name: "Vibrationsstampfer",
    unit: "h",
    minPrice: 6,
    avgPrice: 9,
    maxPrice: 14,
    keywords: ["stampfer", "verdichten", "graben", "verfüllung"],
  },
  {
    id: "maschine-walze",
    group: "Maschinen",
    category: "Verdichtung",
    name: "Walze",
    unit: "h",
    minPrice: 30,
    avgPrice: MACHINE_INTERNAL_COST_2026.roller_14t,
    maxPrice: 48,
    keywords: ["walze", "asphalt", "verdichtung", "tragschicht"],
  },
  {
    id: "maschine-asphaltschneider",
    group: "Maschinen",
    category: "Asphalt",
    name: "Fugenschneider / Asphaltschneider",
    unit: "h",
    minPrice: 8,
    avgPrice: MACHINE_INTERNAL_COST_2026.joint_saw,
    maxPrice: 18,
    keywords: ["fugenschneider", "asphaltschneider", "schneiden", "asphalt"],
  },
  {
    id: "maschine-kernbohrgeraet",
    group: "Maschinen",
    category: "Bohrtechnik",
    name: "Kernbohrgerät",
    unit: "h",
    minPrice: 28,
    avgPrice: 45,
    maxPrice: 75,
    keywords: ["kernbohrung", "bohrung", "wanddurchbruch"],
  },

  // ================= LKW / TRANSPORT =================
  {
    id: "lkw-3achser",
    group: "LKW / Transport",
    category: "Transport",
    name: "LKW 3-Achser",
    unit: "h",
    minPrice: 68,
    avgPrice: 88,
    maxPrice: 125,
    keywords: ["lkw", "transport", "abfuhr", "anlieferung"],
  },
  {
    id: "lkw-4achser",
    group: "LKW / Transport",
    category: "Transport",
    name: "LKW 4-Achser",
    unit: "h",
    minPrice: 78,
    avgPrice: 105,
    maxPrice: 145,
    keywords: ["lkw", "vierachser", "transport", "abfuhr"],
  },
  {
    id: "transport-pauschal-klein",
    group: "LKW / Transport",
    category: "Transport",
    name: "Transportpauschale klein",
    unit: "St",
    minPrice: 85,
    avgPrice: 140,
    maxPrice: 260,
    keywords: ["transportpauschale", "anlieferung", "abholung"],
  },
  {
    id: "transport-baustelleneinrichtung",
    group: "LKW / Transport",
    category: "Baustelleneinrichtung",
    name: "An- und Abfahrt Maschinen",
    unit: "St",
    minPrice: 180,
    avgPrice: 350,
    maxPrice: 750,
    keywords: ["anfahrt", "abfahrt", "maschine", "transport", "baustelleneinrichtung"],
  },

  // ================= MATERIAL ERDBAU =================
  {
    id: "material-frostschutz-032",
    group: "Material",
    category: "Schüttgut",
    name: "Frostschutzkies 0/32",
    unit: "m³",
    minPrice: 35,
    avgPrice: 48,
    maxPrice: 68,
    keywords: ["frostschutz", "frostschutzkies", "0/32", "tragschicht"],
  },
  {
    id: "material-frostschutz-045",
    group: "Material",
    category: "Schüttgut",
    name: "Frostschutzkies 0/45",
    unit: "m³",
    minPrice: 32,
    avgPrice: 46,
    maxPrice: 65,
    keywords: ["frostschutz", "0/45", "tragschicht", "kies"],
  },
  {
    id: "material-splitt-25",
    group: "Material",
    category: "Schüttgut",
    name: "Splitt 2/5",
    unit: "m³",
    minPrice: 45,
    avgPrice: 58,
    maxPrice: 78,
    keywords: ["splitt", "2/5", "bettung", "splittbett"],
  },
  {
    id: "material-sand",
    group: "Material",
    category: "Schüttgut",
    name: "Sand / Kabelsand",
    unit: "m³",
    minPrice: 28,
    avgPrice: 42,
    maxPrice: 60,
    keywords: ["sand", "kabelsand", "rohrsand", "bettung"],
  },
  {
    id: "material-kies-816",
    group: "Material",
    category: "Schüttgut",
    name: "Kies 8/16",
    unit: "m³",
    minPrice: 36,
    avgPrice: 52,
    maxPrice: 72,
    keywords: ["kies", "8/16", "drainage", "filterkies"],
  },
  {
    id: "material-schotter",
    group: "Material",
    category: "Schüttgut",
    name: "Schottertragschicht",
    unit: "m³",
    minPrice: 38,
    avgPrice: 55,
    maxPrice: 78,
    keywords: ["schotter", "tragschicht", "schottertragschicht"],
  },
  {
    id: "material-fluessigboden",
    group: "Material",
    category: "Verfüllung",
    name: "Flüssigboden",
    unit: "m³",
    minPrice: 85,
    avgPrice: 115,
    maxPrice: 165,
    keywords: ["flüssigboden", "fluessigboden", "selbstverdichtend"],
  },

  // ================= MATERIAL PFLASTER / OBERFLÄCHE =================
  {
    id: "material-betonpflaster-standard",
    group: "Material",
    category: "Pflaster",
    name: "Betonpflaster Standard",
    unit: "m²",
    minPrice: 20,
    avgPrice: 32,
    maxPrice: 48,
    keywords: ["betonpflaster", "pflaster", "verbundstein"],
  },
  {
    id: "material-rasengitter-standard",
    group: "Material",
    category: "Pflaster",
    name: "Rasengitterpflaster Standard",
    unit: "m²",
    minPrice: 22,
    avgPrice: 36,
    maxPrice: 58,
    keywords: ["rasengitter", "rasengitterpflaster", "gitterstein"],
  },
  {
    id: "material-natursteinpflaster",
    group: "Material",
    category: "Pflaster",
    name: "Natursteinpflaster",
    unit: "m²",
    minPrice: 45,
    avgPrice: 78,
    maxPrice: 140,
    keywords: ["naturstein", "natursteinpflaster", "granitpflaster"],
  },
  {
    id: "material-bordstein",
    group: "Material",
    category: "Bordstein",
    name: "Bordstein / Randstein",
    unit: "m",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 55,
    keywords: ["bordstein", "randstein", "leistenstein", "tiefbord"],
  },
  {
    id: "material-asphalt-tragschicht",
    group: "Material",
    category: "Asphalt",
    name: "Asphalttragschicht",
    unit: "t",
    minPrice: 95,
    avgPrice: 125,
    maxPrice: 170,
    keywords: ["asphalttragschicht", "tragschicht", "asphalt"],
  },
  {
    id: "material-asphalt-deckschicht",
    group: "Material",
    category: "Asphalt",
    name: "Asphaltdeckschicht",
    unit: "t",
    minPrice: 115,
    avgPrice: 155,
    maxPrice: 220,
    keywords: ["asphaltdeckschicht", "deckschicht", "asphalt"],
  },

  // ================= ROHRE / LEITUNGEN =================
  {
    id: "material-speedpipe",
    group: "Material",
    category: "Glasfaser",
    name: "Speedpipe / Mikrorohr",
    unit: "m",
    minPrice: 0.75,
    avgPrice: 1.6,
    maxPrice: 3.5,
    keywords: ["speedpipe", "mikroduct", "microrohr", "glasfaser"],
  },
  {
    id: "leistung-speedpipe-verlegen",
    group: "Fremdleistung",
    category: "Glasfaser",
    name: "Speedpipe verlegen im offenen Graben",
    unit: "m",
    minPrice: 5.5,
    avgPrice: 9.5,
    maxPrice: 18,
    keywords: ["speedpipe verlegen", "mikroduct verlegen", "glasfaserrohr"],
  },
  {
    id: "material-kabelschutzrohr-dn50",
    group: "Material",
    category: "Kabelschutz",
    name: "Kabelschutzrohr DN 50",
    unit: "m",
    minPrice: 3.5,
    avgPrice: 6.5,
    maxPrice: 11,
    keywords: ["kabelschutzrohr", "dn50", "schutzrohr"],
  },
  {
    id: "material-kabelschutzrohr-dn110",
    group: "Material",
    category: "Kabelschutz",
    name: "Kabelschutzrohr DN 110",
    unit: "m",
    minPrice: 8,
    avgPrice: 14,
    maxPrice: 26,
    keywords: ["kabelschutzrohr", "dn110", "schutzrohr"],
  },
  {
    id: "material-pe-rohr-da32",
    group: "Material",
    category: "Rohrleitung",
    name: "PE-Rohr da 32",
    unit: "m",
    minPrice: 2.5,
    avgPrice: 4.8,
    maxPrice: 8.5,
    keywords: ["pe rohr", "da32", "wasserleitung"],
  },
  {
    id: "material-pe-rohr-da63",
    group: "Material",
    category: "Rohrleitung",
    name: "PE-Rohr da 63",
    unit: "m",
    minPrice: 6,
    avgPrice: 11,
    maxPrice: 20,
    keywords: ["pe rohr", "da63", "wasserleitung"],
  },
  {
    id: "material-pe-rohr-da110",
    group: "Material",
    category: "Rohrleitung",
    name: "PE-Rohr da 110",
    unit: "m",
    minPrice: 16,
    avgPrice: 28,
    maxPrice: 48,
    keywords: ["pe rohr", "da110", "wasserleitung"],
  },
  {
    id: "material-kg-rohr-dn100",
    group: "Material",
    category: "Kanal",
    name: "KG-Rohr DN 100",
    unit: "m",
    minPrice: 7,
    avgPrice: 12,
    maxPrice: 22,
    keywords: ["kg rohr", "dn100", "kanal", "abwasser"],
  },
  {
    id: "material-kg-rohr-dn150",
    group: "Material",
    category: "Kanal",
    name: "KG-Rohr DN 150",
    unit: "m",
    minPrice: 11,
    avgPrice: 19,
    maxPrice: 34,
    keywords: ["kg rohr", "dn150", "kanal", "abwasser"],
  },
  {
    id: "material-kg-rohr-dn200",
    group: "Material",
    category: "Kanal",
    name: "KG-Rohr DN 200",
    unit: "m",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 58,
    keywords: ["kg rohr", "dn200", "kanal", "abwasser"],
  },

  // ================= SCHÄCHTE / EINBAUTEILE =================
  {
    id: "material-kabelschacht-klein",
    group: "Material",
    category: "Schacht",
    name: "Kabelschacht klein",
    unit: "St",
    minPrice: 180,
    avgPrice: 320,
    maxPrice: 620,
    keywords: ["kabelschacht", "schacht", "glasfaser"],
  },
  {
    id: "material-schacht-dn1000",
    group: "Material",
    category: "Schacht",
    name: "Betonschacht DN 1000",
    unit: "St",
    minPrice: 900,
    avgPrice: 1450,
    maxPrice: 2600,
    keywords: ["betonschacht", "dn1000", "kontrollschacht"],
  },
  {
    id: "leistung-schacht-setzen",
    group: "Fremdleistung",
    category: "Schacht",
    name: "Schacht setzen / ausrichten",
    unit: "St",
    minPrice: 350,
    avgPrice: 650,
    maxPrice: 1200,
    keywords: ["schacht setzen", "schacht einbauen", "schacht ausrichten"],
  },

  // ================= ERDARBEITEN ALS LEISTUNG =================
  {
    id: "leistung-aushub-loesen-laden",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Aushub lösen und laden",
    unit: "m³",
    minPrice: 18,
    avgPrice: 28,
    maxPrice: 42,
    keywords: ["aushub", "auskofferung", "lösen", "laden"],
    notes: "RLC realistischer Richtwert: Lösen/Laden inkl. Geräte- und Kolonnenanteil, ohne Transport/Entsorgung.",
  },
  {
    id: "leistung-graben-herstellen",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Leitungsgraben herstellen",
    unit: "m³",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 58,
    keywords: ["leitungsgraben", "rohrgraben", "graben", "aushub"],
  },
  {
    id: "leistung-verfuellung",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Graben verfüllen und verdichten",
    unit: "m³",
    minPrice: 18,
    avgPrice: 30,
    maxPrice: 52,
    keywords: ["verfüllung", "verfuellung", "verfüllen", "verdichten"],
  },
  {
    id: "leistung-planum",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Planum herstellen",
    unit: "m²",
    minPrice: 0.35,
    avgPrice: 0.65,
    maxPrice: 1.2,
    keywords: ["planum", "planie", "profilieren", "feinplanum"],
  },

  // ================= PFLASTER / OBERFLÄCHE ALS LEISTUNG =================
  {
    id: "leistung-pflaster-verlegen",
    group: "Personal",
    category: "Pflaster",
    name: "Pflaster verlegen",
    unit: "m²",
    minPrice: 22,
    avgPrice: 38,
    maxPrice: 68,
    keywords: ["pflaster verlegen", "pflaster einbauen", "betonpflaster"],
  },
  {
    id: "leistung-rasengitter-verlegen",
    group: "Personal",
    category: "Pflaster",
    name: "Rasengitterpflaster verlegen",
    unit: "m²",
    minPrice: 24,
    avgPrice: 42,
    maxPrice: 75,
    keywords: ["rasengitter verlegen", "rasengitterpflaster", "gitterstein"],
  },
  {
    id: "leistung-bordstein-setzen",
    group: "Personal",
    category: "Bordstein",
    name: "Bordstein setzen",
    unit: "m",
    minPrice: 38,
    avgPrice: 65,
    maxPrice: 115,
    keywords: ["bordstein setzen", "randstein setzen", "leistenstein"],
  },
  {
    id: "leistung-asphalt-schneiden",
    group: "Maschinen",
    category: "Asphalt",
    name: "Asphalt schneiden",
    unit: "m",
    minPrice: 5,
    avgPrice: 9,
    maxPrice: 18,
    keywords: ["asphalt schneiden", "fugenschnitt", "asphaltschneiden"],
  },
  {
    id: "leistung-asphalt-aufbruch",
    group: "Maschinen",
    category: "Asphalt",
    name: "Asphalt aufbrechen und laden",
    unit: "m²",
    minPrice: 8,
    avgPrice: 16,
    maxPrice: 32,
    keywords: ["asphalt aufbrechen", "asphaltaufbruch", "aufbruch asphalt"],
  },
  {
    id: "leistung-asphalt-wiederherstellung",
    group: "Fremdleistung",
    category: "Asphalt",
    name: "Asphaltfläche wiederherstellen",
    unit: "m²",
    minPrice: 45,
    avgPrice: 75,
    maxPrice: 135,
    keywords: ["asphalt wiederherstellen", "asphaltfläche", "deckschicht"],
  },

  // ================= ENTSORGUNG =================
  {
    id: "entsorgung-boden-z0",
    group: "Entsorgung",
    category: "Entsorgung Boden",
    name: "Boden entsorgen Z0 / unbelastet",
    unit: "t",
    minPrice: 12,
    avgPrice: 24,
    maxPrice: 42,
    keywords: ["boden entsorgen", "aushub entsorgen", "z0", "unbelastet"],
  },
  {
    id: "entsorgung-boden-belastet",
    group: "Entsorgung",
    category: "Entsorgung Boden",
    name: "Boden entsorgen belastet",
    unit: "t",
    minPrice: 35,
    avgPrice: 75,
    maxPrice: 180,
    keywords: ["belastet", "kontaminiert", "deponie", "boden entsorgen"],
  },
  {
    id: "entsorgung-asphalt",
    group: "Entsorgung",
    category: "Entsorgung Asphalt",
    name: "Asphaltaufbruch entsorgen",
    unit: "t",
    minPrice: 25,
    avgPrice: 48,
    maxPrice: 95,
    keywords: ["asphalt entsorgen", "asphaltaufbruch", "teerfrei"],
  },
  {
    id: "entsorgung-beton",
    group: "Entsorgung",
    category: "Entsorgung Bauschutt",
    name: "Beton / Bauschutt entsorgen",
    unit: "t",
    minPrice: 18,
    avgPrice: 38,
    maxPrice: 75,
    keywords: ["beton entsorgen", "bauschutt", "bruchmaterial"],
  },
  {
    id: "entsorgung-mischabfall",
    group: "Entsorgung",
    category: "Entsorgung Abfall",
    name: "Baumischabfall entsorgen",
    unit: "t",
    minPrice: 120,
    avgPrice: 220,
    maxPrice: 380,
    keywords: ["mischabfall", "baumischabfall", "abfall entsorgen"],
  },

  // ================= FREMDLEISTUNG / SPEZIAL =================
  {
    id: "fremdleistung-kampfmittel",
    group: "Fremdleistung",
    category: "Spezialleistung",
    name: "Kampfmittelsondierung",
    unit: "m²",
    minPrice: 0.8,
    avgPrice: 1.8,
    maxPrice: 4.5,
    keywords: ["kampfmittel", "sondierung", "munition"],
  },
  {
    id: "fremdleistung-verkehrssicherung",
    group: "Fremdleistung",
    category: "Verkehrssicherung",
    name: "Verkehrssicherung klein",
    unit: "d",
    minPrice: 120,
    avgPrice: 280,
    maxPrice: 650,
    keywords: ["verkehrssicherung", "rsa", "absperrung", "beschilderung"],
  },
  {
    id: "fremdleistung-wasserhaltung",
    group: "Fremdleistung",
    category: "Wasserhaltung",
    name: "Wasserhaltung / Pumpe",
    unit: "d",
    minPrice: 80,
    avgPrice: 180,
    maxPrice: 450,
    keywords: ["wasserhaltung", "pumpe", "grundwasser"],
  },
  {
    id: "fremdleistung-bohrung",
    group: "Fremdleistung",
    category: "Bohrtechnik",
    name: "Horizontalbohrung",
    unit: "m",
    minPrice: 65,
    avgPrice: 120,
    maxPrice: 260,
    keywords: ["horizontalbohrung", "spülbohrung", "bohrung"],
  },

  // ================= GEMEINKOSTEN / RISIKO / GEWINN =================
  {
    id: "gemeinkosten-standard",
    group: "Gemeinkosten",
    category: "Zuschlag",
    name: "Baustellengemeinkosten",
    unit: "%",
    minPrice: 8,
    avgPrice: 12,
    maxPrice: 18,
    keywords: ["gemeinkosten", "bgk", "baustellengemeinkosten"],
  },
  {
    id: "risiko-standard",
    group: "Risiko",
    category: "Zuschlag",
    name: "Risikozuschlag normal",
    unit: "%",
    minPrice: 3,
    avgPrice: 6,
    maxPrice: 12,
    keywords: ["risiko", "risikozuschlag", "wagnis"],
  },
  {
    id: "gewinn-standard",
    group: "Gewinn",
    category: "Zuschlag",
    name: "Gewinnzuschlag",
    unit: "%",
    minPrice: 6,
    avgPrice: 10,
    maxPrice: 18,
    keywords: ["gewinn", "marge", "aufschlag"],
  },

  // ================= TIEFBAU ERWEITERUNG: BAUSTELLENEINRICHTUNG =================
  {
    id: "tiefbau-baustelleneinrichtung-klein",
    group: "Fremdleistung",
    category: "Baustelleneinrichtung",
    name: "Baustelleneinrichtung Tiefbau klein",
    unit: "St",
    minPrice: 450,
    avgPrice: 950,
    maxPrice: 2200,
    keywords: ["baustelleneinrichtung", "einrichten", "räumen", "baustelle klein"],
  },
  {
    id: "tiefbau-baustelleneinrichtung-mittel",
    group: "Fremdleistung",
    category: "Baustelleneinrichtung",
    name: "Baustelleneinrichtung Tiefbau mittel",
    unit: "St",
    minPrice: 1200,
    avgPrice: 2800,
    maxPrice: 6500,
    keywords: ["baustelleneinrichtung", "container", "lagerplatz", "baustelle mittel"],
  },
  {
    id: "tiefbau-absperrung-bauzaun",
    group: "Fremdleistung",
    category: "Baustelleneinrichtung",
    name: "Bauzaun liefern und stellen",
    unit: "m",
    minPrice: 5,
    avgPrice: 9,
    maxPrice: 18,
    keywords: ["bauzaun", "absperrung", "baustellensicherung"],
  },
  {
    id: "tiefbau-provisorische-ueberfahrt",
    group: "Fremdleistung",
    category: "Baustelleneinrichtung",
    name: "Provisorische Überfahrt / Stahlplatte",
    unit: "St",
    minPrice: 95,
    avgPrice: 180,
    maxPrice: 420,
    keywords: ["stahlplatte", "überfahrt", "ueberfahrt", "grabenabdeckung", "provisorisch"],
  },

  // ================= TIEFBAU ERWEITERUNG: SUCHSCHLITZ / HANDSCHACHTUNG =================
  {
    id: "tiefbau-suchschlitz-maschinell",
    group: "Maschinen",
    category: "Suchschacht / Suchschlitz",
    name: "Suchschlitz maschinell herstellen",
    unit: "m³",
    minPrice: 45,
    avgPrice: 78,
    maxPrice: 135,
    keywords: ["suchschlitz", "suchgraben", "leitungssuche", "erkundung"],
  },
  {
    id: "tiefbau-handschachtung-bis-125",
    group: "Personal",
    category: "Handschachtung",
    name: "Handschachtung bis 1,25 m Tiefe",
    unit: "m³",
    minPrice: 95,
    avgPrice: 145,
    maxPrice: 240,
    keywords: ["handschachtung", "handaushub", "vorsichtig", "bestand", "leitung"],
  },
  {
    id: "tiefbau-handschachtung-bestand",
    group: "Personal",
    category: "Handschachtung",
    name: "Handschachtung im Leitungsbestand",
    unit: "m³",
    minPrice: 135,
    avgPrice: 210,
    maxPrice: 360,
    keywords: ["handschachtung", "bestand", "querung", "versorgungsleitung"],
  },
  {
    id: "tiefbau-kabelortung",
    group: "Fremdleistung",
    category: "Bestandserkundung",
    name: "Kabel- und Leitungssuche / Ortung",
    unit: "h",
    minPrice: 75,
    avgPrice: 110,
    maxPrice: 165,
    keywords: ["ortung", "leitungssuche", "kabelortung", "bestand"],
  },

  // ================= TIEFBAU ERWEITERUNG: GRABEN / AUSHUB =================
  {
    id: "tiefbau-kabelgraben-040-080",
    group: "Maschinen",
    category: "Kabelgraben",
    name: "Kabelgraben herstellen bis 0,80 m Tiefe",
    unit: "m",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 58,
    keywords: ["kabelgraben", "graben", "glasfaser", "strom", "bis 0,80"],
  },
  {
    id: "tiefbau-kabelgraben-040-120",
    group: "Maschinen",
    category: "Kabelgraben",
    name: "Kabelgraben herstellen bis 1,20 m Tiefe",
    unit: "m",
    minPrice: 28,
    avgPrice: 48,
    maxPrice: 85,
    keywords: ["kabelgraben", "graben", "speedpipe", "bis 1,20", "1,20"],
  },
  {
    id: "tiefbau-rohrgraben-060-150",
    group: "Maschinen",
    category: "Rohrgraben",
    name: "Rohrgraben herstellen bis 1,50 m Tiefe",
    unit: "m",
    minPrice: 45,
    avgPrice: 78,
    maxPrice: 145,
    keywords: ["rohrgraben", "leitungsgraben", "wasserleitung", "kanal", "1,50"],
  },
  {
    id: "tiefbau-rohrgraben-verbau-bis-200",
    group: "Maschinen",
    category: "Rohrgraben",
    name: "Rohrgraben mit Verbau bis 2,00 m Tiefe",
    unit: "m",
    minPrice: 95,
    avgPrice: 165,
    maxPrice: 320,
    keywords: ["rohrgraben", "verbau", "grabenverbau", "2,00", "tiefe"],
  },
  {
    id: "tiefbau-graben-mehrtiefe-zuschlag",
    group: "Maschinen",
    category: "Rohrgraben",
    name: "Zuschlag Grabentiefe je weitere 0,50 m",
    unit: "m",
    minPrice: 12,
    avgPrice: 24,
    maxPrice: 48,
    keywords: ["mehrtiefe", "tiefer", "zuschlag", "grabentiefe"],
  },
  {
    id: "tiefbau-aushub-seitlich-lagern",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Aushub lösen und seitlich lagern",
    unit: "m³",
    minPrice: 8,
    avgPrice: 14,
    maxPrice: 24,
    keywords: ["aushub", "seitlich lagern", "lösen", "lagern"],
  },
  {
    id: "tiefbau-aushub-laden",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Aushub lösen und auf LKW laden",
    unit: "m³",
    minPrice: 11,
    avgPrice: 18,
    maxPrice: 32,
    keywords: ["aushub", "laden", "lkw", "abfahren"],
  },
  {
    id: "tiefbau-bodenaustausch",
    group: "Maschinen",
    category: "Erdarbeiten",
    name: "Bodenaustausch ausführen",
    unit: "m³",
    minPrice: 55,
    avgPrice: 85,
    maxPrice: 145,
    keywords: ["bodenaustausch", "boden austauschen", "nicht tragfähig"],
  },

  // ================= TIEFBAU ERWEITERUNG: VERBAU / WASSERHALTUNG =================
  {
    id: "tiefbau-grabenverbau-leicht",
    group: "Fremdleistung",
    category: "Verbau",
    name: "Grabenverbau leicht",
    unit: "m²",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 62,
    keywords: ["grabenverbau", "verbau", "verbautafel", "leicht"],
  },
  {
    id: "tiefbau-grabenverbau-schwer",
    group: "Fremdleistung",
    category: "Verbau",
    name: "Grabenverbau schwer / Gleitschienenverbau",
    unit: "m²",
    minPrice: 38,
    avgPrice: 68,
    maxPrice: 125,
    keywords: ["gleitschienenverbau", "schwerer verbau", "verbau", "tief"],
  },
  {
    id: "tiefbau-wasserhaltung-kleinpumpe",
    group: "Fremdleistung",
    category: "Wasserhaltung",
    name: "Wasserhaltung Kleinpumpe",
    unit: "d",
    minPrice: 65,
    avgPrice: 125,
    maxPrice: 280,
    keywords: ["wasserhaltung", "pumpe", "kleinpumpe", "bauwasser"],
  },
  {
    id: "tiefbau-wasserhaltung-brunnen",
    group: "Fremdleistung",
    category: "Wasserhaltung",
    name: "Offene Wasserhaltung / Brunnen",
    unit: "d",
    minPrice: 180,
    avgPrice: 420,
    maxPrice: 950,
    keywords: ["wasserhaltung", "brunnen", "grundwasser", "offene wasserhaltung"],
  },

  // ================= TIEFBAU ERWEITERUNG: ROHRBETTUNG / VERFÜLLUNG =================
  {
    id: "tiefbau-rohrbettung-sand",
    group: "Material",
    category: "Rohrbettung",
    name: "Rohrbettung Sand herstellen",
    unit: "m³",
    minPrice: 38,
    avgPrice: 58,
    maxPrice: 88,
    keywords: ["rohrbettung", "sandbett", "bettung", "rohrsand"],
  },
  {
    id: "tiefbau-leitungszone-sand",
    group: "Material",
    category: "Leitungszone",
    name: "Leitungszone mit Sand verfüllen",
    unit: "m³",
    minPrice: 42,
    avgPrice: 64,
    maxPrice: 95,
    keywords: ["leitungszone", "sand", "verfüllen", "rohrsand"],
  },
  {
    id: "tiefbau-verfuellen-vorhandener-boden",
    group: "Maschinen",
    category: "Verfüllung",
    name: "Graben mit vorhandenem Boden verfüllen",
    unit: "m³",
    minPrice: 16,
    avgPrice: 28,
    maxPrice: 48,
    keywords: ["verfüllen", "vorhandener boden", "wiedereinbau", "verdichten"],
  },
  {
    id: "tiefbau-verfuellen-frostschutz",
    group: "Material",
    category: "Verfüllung",
    name: "Graben mit Frostschutzmaterial verfüllen",
    unit: "m³",
    minPrice: 48,
    avgPrice: 72,
    maxPrice: 110,
    keywords: ["verfüllen", "frostschutz", "tragschicht", "kies"],
  },
  {
    id: "tiefbau-verdichtung-lagenweise",
    group: "Maschinen",
    category: "Verdichtung",
    name: "Lagenweise verdichten",
    unit: "m³",
    minPrice: 8,
    avgPrice: 16,
    maxPrice: 32,
    keywords: ["verdichten", "lagenweise", "rüttelplatte", "stampfer"],
  },
  {
    id: "tiefbau-verdichtungsnachweis",
    group: "Fremdleistung",
    category: "Prüfung",
    name: "Verdichtungsnachweis / Lastplattendruckversuch",
    unit: "St",
    minPrice: 120,
    avgPrice: 220,
    maxPrice: 420,
    keywords: ["verdichtungsnachweis", "lastplattendruckversuch", "ev2", "prüfung"],
  },

  // ================= TIEFBAU ERWEITERUNG: GLASFASER / SPEEDPIPE =================
  {
    id: "glasfaser-microtrenching-schneiden",
    group: "Maschinen",
    category: "Glasfaser",
    name: "Microtrenching schneiden",
    unit: "m",
    minPrice: 12,
    avgPrice: 22,
    maxPrice: 42,
    keywords: ["microtrenching", "schneiden", "glasfaser", "schlitz"],
  },
  {
    id: "glasfaser-microtrenching-komplett",
    group: "Fremdleistung",
    category: "Glasfaser",
    name: "Microtrenching komplett inkl. Verfüllung",
    unit: "m",
    minPrice: 38,
    avgPrice: 68,
    maxPrice: 125,
    keywords: ["microtrenching komplett", "glasfaser", "schlitz", "verfüllen"],
  },
  {
    id: "glasfaser-speedpipe-buendel-7x10",
    group: "Material",
    category: "Glasfaser",
    name: "Speedpipe-Bündel 7x10",
    unit: "m",
    minPrice: 4,
    avgPrice: 7.5,
    maxPrice: 14,
    keywords: ["speedpipe bündel", "7x10", "glasfaser", "mehrfachrohr"],
  },
  {
    id: "glasfaser-speedpipe-buendel-12x10",
    group: "Material",
    category: "Glasfaser",
    name: "Speedpipe-Bündel 12x10",
    unit: "m",
    minPrice: 6,
    avgPrice: 11,
    maxPrice: 22,
    keywords: ["speedpipe bündel", "12x10", "glasfaser", "mehrfachrohr"],
  },
  {
    id: "glasfaser-speedpipe-einblasen",
    group: "Fremdleistung",
    category: "Glasfaser",
    name: "Glasfaserkabel einblasen",
    unit: "m",
    minPrice: 0.85,
    avgPrice: 1.6,
    maxPrice: 3.5,
    keywords: ["einblasen", "glasfaserkabel", "speedpipe", "lwl"],
  },
  {
    id: "glasfaser-hausanschluss-tiefbau",
    group: "Fremdleistung",
    category: "Glasfaser",
    name: "Glasfaser-Hausanschluss Tiefbau",
    unit: "St",
    minPrice: 650,
    avgPrice: 1250,
    maxPrice: 2600,
    keywords: ["hausanschluss", "glasfaser", "hauseinführung", "tiefbau"],
  },
  {
    id: "glasfaser-hauseinfuehrung",
    group: "Material",
    category: "Glasfaser",
    name: "Hauseinführung Glasfaser",
    unit: "St",
    minPrice: 85,
    avgPrice: 180,
    maxPrice: 380,
    keywords: ["hauseinführung", "hauseinfuehrung", "glasfaser", "mauerdurchführung"],
  },
  {
    id: "glasfaser-kabelzugschacht",
    group: "Material",
    category: "Glasfaser",
    name: "Kabelzugschacht / Muffenschacht",
    unit: "St",
    minPrice: 320,
    avgPrice: 680,
    maxPrice: 1450,
    keywords: ["kabelzugschacht", "muffenschacht", "glasfaser", "schacht"],
  },

  // ================= TIEFBAU ERWEITERUNG: TRASSENWARNUNG / SCHUTZ =================
  {
    id: "tiefbau-warnband",
    group: "Material",
    category: "Leitungsschutz",
    name: "Warnband / Trassenwarnband",
    unit: "m",
    minPrice: 0.18,
    avgPrice: 0.35,
    maxPrice: 0.75,
    keywords: ["warnband", "trassenwarnband", "leitungsschutz"],
  },
  {
    id: "tiefbau-trassenband-ortbar",
    group: "Material",
    category: "Leitungsschutz",
    name: "Ortbares Trassenband",
    unit: "m",
    minPrice: 0.55,
    avgPrice: 1.1,
    maxPrice: 2.5,
    keywords: ["ortbares trassenband", "trassenband", "ortbar", "warnband"],
  },
  {
    id: "tiefbau-kabelabdeckplatte",
    group: "Material",
    category: "Leitungsschutz",
    name: "Kabelabdeckplatte",
    unit: "m",
    minPrice: 2.2,
    avgPrice: 4.5,
    maxPrice: 8.5,
    keywords: ["kabelabdeckplatte", "abdeckplatte", "leitungsschutz"],
  },
  {
    id: "tiefbau-kabelschutzsand-abdeckung",
    group: "Material",
    category: "Leitungsschutz",
    name: "Sandabdeckung Kabelschutz",
    unit: "m³",
    minPrice: 38,
    avgPrice: 58,
    maxPrice: 88,
    keywords: ["sandabdeckung", "kabelschutz", "sand", "abdeckung"],
  },



  // ================= TIEFBAU ERWEITERUNG: BLOCK I MATERIAL / EINKAUF / LAGER / LIEFERSCHEINE =================
  { id: "blocki-material-bestellen", group: "Personal", category: "Einkauf", name: "Material bestellen", unit: "h", minPrice: 45, avgPrice: 75, maxPrice: 130, keywords: ["material bestellen", "bestellung material", "einkauf material"] },
  { id: "blocki-angebot-einholen", group: "Personal", category: "Einkauf", name: "Lieferantenangebot einholen", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 150, keywords: ["angebot einholen", "lieferantenangebot", "preisanfrage"] },
  { id: "blocki-preisvergleich", group: "Personal", category: "Einkauf", name: "Materialpreisvergleich durchführen", unit: "h", minPrice: 55, avgPrice: 90, maxPrice: 160, keywords: ["preisvergleich", "materialpreisvergleich", "preise vergleichen"] },
  { id: "blocki-bestellung-pruefen", group: "Personal", category: "Einkauf", name: "Bestellung prüfen / freigeben", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 150, keywords: ["bestellung prüfen", "bestellung pruefen", "bestellung freigeben"] },

  { id: "blocki-wareneingang", group: "Personal", category: "Lager", name: "Wareneingang erfassen", unit: "h", minPrice: 45, avgPrice: 75, maxPrice: 130, keywords: ["wareneingang", "ware eingang", "materialeingang"] },
  { id: "blocki-lagerbestand-buchen", group: "Personal", category: "Lager", name: "Lagerbestand buchen", unit: "h", minPrice: 45, avgPrice: 70, maxPrice: 120, keywords: ["lagerbestand buchen", "lager buchen", "bestand buchen"] },
  { id: "blocki-material-auslagern", group: "Personal", category: "Lager", name: "Material aus Lager ausgeben", unit: "h", minPrice: 45, avgPrice: 70, maxPrice: 120, keywords: ["material ausgeben", "material auslagern", "lagerausgabe"] },
  { id: "blocki-inventur", group: "Personal", category: "Lager", name: "Inventur / Lagerkontrolle durchführen", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 150, keywords: ["inventur", "lagerkontrolle", "bestand prüfen"] },

  { id: "blocki-lieferschein-erfassen", group: "Personal", category: "Lieferschein", name: "Lieferschein erfassen", unit: "St", minPrice: 15, avgPrice: 35, maxPrice: 85, keywords: ["lieferschein erfassen", "lieferschein eingeben", "lieferschein importieren"] },
  { id: "blocki-lieferschein-pruefen", group: "Personal", category: "Lieferschein", name: "Lieferschein fachlich prüfen", unit: "St", minPrice: 20, avgPrice: 45, maxPrice: 95, keywords: ["lieferschein fachlich prüfen", "lieferschein fachlich pruefen", "lieferschein kontrollieren"] },
  { id: "blocki-lieferschein-kostenstelle", group: "Personal", category: "Lieferschein", name: "Lieferschein Kostenstelle zuordnen", unit: "St", minPrice: 18, avgPrice: 40, maxPrice: 90, keywords: ["lieferschein kostenstelle", "lieferschein zuordnen"] },
  { id: "blocki-lieferschein-ocr", group: "Personal", category: "Lieferschein", name: "Lieferschein OCR/KI nachbearbeiten", unit: "St", minPrice: 20, avgPrice: 50, maxPrice: 120, keywords: ["lieferschein ocr", "lieferschein ki", "ocr nachbearbeiten"] },

  { id: "blocki-material-kostenstelle", group: "Personal", category: "Kostenstelle", name: "Material Kostenstelle zuordnen", unit: "h", minPrice: 50, avgPrice: 80, maxPrice: 140, keywords: ["material kostenstelle", "material zuordnen", "kostenstelle material"] },
  { id: "blocki-lv-position-material", group: "Personal", category: "Kostenstelle", name: "Material LV-Position zuordnen", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 150, keywords: ["material lv position", "material position zuordnen", "lv material zuordnen"] },

  { id: "blocki-baustoff-liefern", group: "LKW / Transport", category: "Materiallieferung", name: "Baustofflieferung organisieren", unit: "St", minPrice: 75, avgPrice: 180, maxPrice: 450, keywords: ["baustofflieferung", "materiallieferung", "lieferung organisieren"] },
  { id: "blocki-entladung", group: "LKW / Transport", category: "Materiallieferung", name: "Entladung / Abladen Material", unit: "h", minPrice: 55, avgPrice: 95, maxPrice: 180, keywords: ["entladung", "abladen material", "material abladen"] },
  { id: "blocki-kranentladung", group: "LKW / Transport", category: "Materiallieferung", name: "Kranentladung Material", unit: "h", minPrice: 95, avgPrice: 150, maxPrice: 260, keywords: ["kranentladung", "entladung mit kran", "material kran"] },

  { id: "blocki-reklamation", group: "Personal", category: "Einkauf", name: "Materialreklamation bearbeiten", unit: "h", minPrice: 55, avgPrice: 90, maxPrice: 160, keywords: ["reklamation", "materialreklamation", "mängel material"] },
  { id: "blocki-rueckgabe", group: "Personal", category: "Einkauf", name: "Materialrückgabe organisieren", unit: "h", minPrice: 45, avgPrice: 75, maxPrice: 130, keywords: ["materialrückgabe", "materialrueckgabe", "rückgabe material"] },
  { id: "blocki-lieferantenbewertung", group: "Personal", category: "Einkauf", name: "Lieferantenbewertung durchführen", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 150, keywords: ["lieferantenbewertung", "lieferant bewerten"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK H VERMESSUNG / CAD / 3D / MACHINE CONTROL =================
  { id: "blockh-bestandsaufnahme", group: "Personal", category: "Vermessung", name: "Bestandsaufnahme / Geländeaufnahme", unit: "h", minPrice: 65, avgPrice: 95, maxPrice: 160, keywords: ["bestandsaufnahme", "geländeaufnahme", "gelaendeaufnahme"] },
  { id: "blockh-gnss-vermessung", group: "Personal", category: "Vermessung", name: "GNSS-Vermessung durchführen", unit: "h", minPrice: 75, avgPrice: 115, maxPrice: 190, keywords: ["gnss", "gps vermessung", "satellitenvermessung"] },
  { id: "blockh-totalstation", group: "Personal", category: "Vermessung", name: "Vermessung mit Totalstation", unit: "h", minPrice: 80, avgPrice: 125, maxPrice: 210, keywords: ["totalstation", "tachymeter"] },
  { id: "blockh-absteckung", group: "Personal", category: "Vermessung", name: "Absteckung durchführen", unit: "h", minPrice: 75, avgPrice: 115, maxPrice: 190, keywords: ["absteckung", "punkte abstecken", "trasse abstecken"] },
  { id: "blockh-nivellement", group: "Personal", category: "Vermessung", name: "Nivellement / Höhenaufnahme", unit: "h", minPrice: 65, avgPrice: 95, maxPrice: 160, keywords: ["nivellement", "höhenaufnahme", "hoehenaufnahme"] },

  { id: "blockh-querprofil", group: "Personal", category: "Vermessung / Profile", name: "Querprofil erstellen", unit: "St", minPrice: 65, avgPrice: 140, maxPrice: 320, keywords: ["querprofil", "querschnitt"] },
  { id: "blockh-laengsprofil", group: "Personal", category: "Vermessung / Profile", name: "Längsprofil erstellen", unit: "St", minPrice: 90, avgPrice: 220, maxPrice: 520, keywords: ["längsprofil", "laengsprofil"] },
  { id: "blockh-massenermittlung", group: "Personal", category: "Vermessung / Massen", name: "Massenermittlung aus Vermessungsdaten", unit: "h", minPrice: 75, avgPrice: 115, maxPrice: 190, keywords: ["massenermittlung vermessung", "massen aus vermessung"] },
  { id: "blockh-volumen-dgm", group: "Personal", category: "Vermessung / Massen", name: "Volumenberechnung mit DGM", unit: "h", minPrice: 85, avgPrice: 135, maxPrice: 240, keywords: ["volumenberechnung", "dgm volumen", "geländemodell volumen"] },

  { id: "blockh-dwg-erstellen", group: "Personal", category: "CAD", name: "DWG-Plan erstellen", unit: "h", minPrice: 65, avgPrice: 105, maxPrice: 180, keywords: ["dwg erstellen", "cad plan erstellen"] },
  { id: "blockh-dwg-bearbeiten", group: "Personal", category: "CAD", name: "DWG-Plan bearbeiten", unit: "h", minPrice: 55, avgPrice: 90, maxPrice: 160, keywords: ["dwg bearbeiten", "cad bearbeiten"] },
  { id: "blockh-pdf-digitalisieren", group: "Personal", category: "CAD", name: "PDF-Plan digitalisieren", unit: "h", minPrice: 55, avgPrice: 95, maxPrice: 180, keywords: ["pdf plan digitalisieren", "plan digitalisieren"] },
  { id: "blockh-asbuilt-plan", group: "Personal", category: "CAD / As-Built", name: "As-Built Plan erstellen", unit: "St", minPrice: 250, avgPrice: 750, maxPrice: 2200, keywords: ["as-built plan", "bestandsplan erstellen"] },

  { id: "blockh-dgm-erstellen", group: "Personal", category: "3D", name: "DGM / 3D-Geländemodell erstellen", unit: "h", minPrice: 85, avgPrice: 140, maxPrice: 260, keywords: ["dgm erstellen", "3d geländemodell", "3d gelaendemodell"] },
  { id: "blockh-landxml-export", group: "Personal", category: "Export", name: "LandXML Export erstellen", unit: "St", minPrice: 120, avgPrice: 320, maxPrice: 900, keywords: ["landxml", "land xml"] },
  { id: "blockh-ifc-export", group: "Personal", category: "Export", name: "IFC Export erstellen", unit: "St", minPrice: 180, avgPrice: 450, maxPrice: 1200, keywords: ["ifc export", "ifc modell"] },
  { id: "blockh-machine-control", group: "Personal", category: "Machine Control", name: "Machine-Control Modell erstellen", unit: "St", minPrice: 450, avgPrice: 1200, maxPrice: 3500, keywords: ["machine control", "maschinensteuerung", "baggersteuerung"] },
  { id: "blockh-trimble-leica", group: "Personal", category: "Machine Control", name: "Datenaufbereitung für Trimble / Leica", unit: "St", minPrice: 250, avgPrice: 650, maxPrice: 1800, keywords: ["trimble", "leica", "topcon", "maschinenmodell"] },

  { id: "blockh-drohne-befliegung", group: "Fremdleistung", category: "Drohne", name: "Drohnenbefliegung durchführen", unit: "h", minPrice: 120, avgPrice: 220, maxPrice: 520, keywords: ["drohnenbefliegung", "drohne", "uav"] },
  { id: "blockh-orthofoto", group: "Fremdleistung", category: "Drohne", name: "Orthofoto / Punktwolke erstellen", unit: "St", minPrice: 250, avgPrice: 750, maxPrice: 2200, keywords: ["orthofoto", "punktwolke", "photogrammetrie"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK G ABRECHNUNG / AUFMASS / NACHTRÄGE =================
  { id: "blockg-aufmass-erstellen", group: "Personal", category: "Abrechnung / Aufmaß", name: "Aufmaß erstellen", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 140, keywords: ["aufmaß erstellen", "aufmass erstellen", "massenaufstellung"] },
  { id: "blockg-massenpruefung", group: "Personal", category: "Abrechnung / Aufmaß", name: "Massenprüfung durchführen", unit: "h", minPrice: 65, avgPrice: 95, maxPrice: 160, keywords: ["massenprüfung", "massenpruefung", "mengenprüfung"] },
  { id: "blockg-reb-aufmass", group: "Personal", category: "Abrechnung / Aufmaß", name: "REB-Aufmaß bearbeiten", unit: "h", minPrice: 75, avgPrice: 115, maxPrice: 190, keywords: ["reb", "da11", "x31", "reb aufmaß"] },
  { id: "blockg-aufmassblatt", group: "Personal", category: "Abrechnung / Aufmaß", name: "Aufmaßblatt erstellen", unit: "St", minPrice: 45, avgPrice: 95, maxPrice: 220, keywords: ["aufmaßblatt", "aufmassblatt"] },

  { id: "blockg-regiebericht-abrechnung", group: "Personal", category: "Abrechnung / Regie", name: "Regiebericht für Abrechnung prüfen", unit: "St", minPrice: 35, avgPrice: 85, maxPrice: 180, keywords: ["regiebericht abrechnung", "regiebericht prüfen", "regiebericht pruefen"] },
  { id: "blockg-lieferschein-abrechnung", group: "Personal", category: "Abrechnung / Lieferschein", name: "Lieferschein für Abrechnung prüfen", unit: "St", minPrice: 25, avgPrice: 65, maxPrice: 140, keywords: ["lieferschein abrechnung", "lieferschein prüfen", "lieferschein pruefen"] },
  { id: "blockg-stundenabrechnung", group: "Personal", category: "Abrechnung / Stunden", name: "Stundenabrechnung erstellen", unit: "h", minPrice: 55, avgPrice: 82, maxPrice: 140, keywords: ["stundenabrechnung", "stunden abrechnen"] },

  { id: "blockg-abschlagsrechnung", group: "Personal", category: "Rechnung", name: "Abschlagsrechnung erstellen", unit: "St", minPrice: 120, avgPrice: 280, maxPrice: 650, keywords: ["abschlagsrechnung", "abschlagrechnung", "abschlag"] },
  { id: "blockg-schlussrechnung", group: "Personal", category: "Rechnung", name: "Schlussrechnung erstellen", unit: "St", minPrice: 220, avgPrice: 520, maxPrice: 1200, keywords: ["schlussrechnung", "endgültige abrechnung", "endgueltige abrechnung"] },
  { id: "blockg-rechnung-pruefen", group: "Personal", category: "Rechnung", name: "Rechnung prüfen", unit: "h", minPrice: 65, avgPrice: 95, maxPrice: 160, keywords: ["rechnung prüfen", "rechnung pruefen"] },

  { id: "blockg-nachtrag-erstellen", group: "Personal", category: "Nachtrag", name: "Nachtrag erstellen", unit: "St", minPrice: 180, avgPrice: 450, maxPrice: 1200, keywords: ["nachtrag erstellen", "nachtrag kalkulieren"] },
  { id: "blockg-nachtrag-pruefen", group: "Personal", category: "Nachtrag", name: "Nachtrag prüfen", unit: "h", minPrice: 75, avgPrice: 115, maxPrice: 190, keywords: ["nachtrag prüfen", "nachtrag pruefen"] },
  { id: "blockg-mehrmengen-bewerten", group: "Personal", category: "Nachtrag", name: "Mehrmengen / Mindermengen bewerten", unit: "h", minPrice: 65, avgPrice: 105, maxPrice: 180, keywords: ["mehrmengen", "mindermengen", "mengenänderung"] },

  { id: "blockg-dokumentation-asbuilt", group: "Personal", category: "Dokumentation", name: "As-Built Dokumentation abrechnungsreif erstellen", unit: "St", minPrice: 250, avgPrice: 750, maxPrice: 2200, keywords: ["as-built", "as built", "bestandsdokumentation abrechnung"] },
  { id: "blockg-fotodoku", group: "Personal", category: "Dokumentation", name: "Fotodokumentation für Abrechnung erstellen", unit: "St", minPrice: 45, avgPrice: 120, maxPrice: 320, keywords: ["fotodokumentation", "fotodoku", "bilder abrechnung"] },
  { id: "blockg-pruefprotokoll", group: "Personal", category: "Dokumentation", name: "Prüfprotokoll erstellen", unit: "St", minPrice: 85, avgPrice: 180, maxPrice: 450, keywords: ["prüfprotokoll", "pruefprotokoll", "protokoll erstellen"] },

  { id: "blockg-aufmass-vor-ort", group: "Personal", category: "Aufmaß vor Ort", name: "Aufmaß vor Ort aufnehmen", unit: "h", minPrice: 65, avgPrice: 95, maxPrice: 160, keywords: ["aufmaß vor ort", "aufmass vor ort", "örtliches aufmaß"] },
  { id: "blockg-abrechnung-bauleiter", group: "Personal", category: "Abrechnung", name: "Bauleiter-Abrechnungsfreigabe bearbeiten", unit: "h", minPrice: 75, avgPrice: 115, maxPrice: 190, keywords: ["bauleiter abrechnungsfreigabe", "abrechnungsfreigabe"] },
  { id: "blockg-kostenstelle-zuordnung", group: "Personal", category: "Abrechnung", name: "Kostenstelle / LV-Position zuordnen", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 140, keywords: ["kostenstelle zuordnen", "lv position zuordnen", "zuordnung abrechnung"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK F REGIE / STUNDEN / GERÄTE / TRANSPORTE =================
  { id: "blockf-facharbeiter", group: "Personal", category: "Regie / Stunden", name: "Facharbeiter Regiestunde", unit: "h", minPrice: 60, avgPrice: COMMERCIAL_REGIE_2026.facharbeiter, maxPrice: 95, keywords: ["facharbeiter", "regiestunde", "stundenlohn"] },
  { id: "blockf-helfer", group: "Personal", category: "Regie / Stunden", name: "Helfer Regiestunde", unit: "h", minPrice: 46, avgPrice: COMMERCIAL_REGIE_2026.helper, maxPrice: 75, keywords: ["helfer", "bauhelfer", "regiestunde"] },
  { id: "blockf-polier", group: "Personal", category: "Regie / Stunden", name: "Polier / Vorarbeiter Regiestunde", unit: "h", minPrice: 72, avgPrice: COMMERCIAL_REGIE_2026.polier, maxPrice: 120, keywords: ["polier", "vorarbeiter", "regiestunde"] },
  { id: "blockf-bauleiter", group: "Personal", category: "Regie / Stunden", name: "Bauleiter Regiestunde", unit: "h", minPrice: 95, avgPrice: COMMERCIAL_REGIE_2026.bauleiter, maxPrice: 165, keywords: ["bauleiter", "projektleiter", "regiestunde"] },

  { id: "blockf-minibagger", group: "Maschinen", category: "Geräte / Regie", name: "Minibagger bis 3,5 t mit Bediener Regiestunde", unit: "h", minPrice: 80, avgPrice: COMMERCIAL_REGIE_2026.miniExcavator2tWithOperator, maxPrice: 125, keywords: ["minibagger", "bagger 3,5", "kleinbagger", "regiestunde"], notes: "Verrechnungssatz inkl. Bediener; nicht mit internem Maschinenkostensatz verwechseln." },
  { id: "blockf-bagger-8t", group: "Maschinen", category: "Geräte / Regie", name: "Bagger 8–14 t mit Bediener Regiestunde", unit: "h", minPrice: 110, avgPrice: COMMERCIAL_REGIE_2026.excavator14tWithOperator, maxPrice: 165, keywords: ["bagger 8", "bagger 14", "kettenbagger", "regiestunde"], notes: "Verrechnungssatz inkl. Bediener; nicht mit internem Maschinenkostensatz verwechseln." },
  { id: "blockf-radlader", group: "Maschinen", category: "Geräte / Regie", name: "Radlader mit Bediener Regiestunde", unit: "h", minPrice: 95, avgPrice: COMMERCIAL_REGIE_2026.wheelLoaderWithOperator, maxPrice: 145, keywords: ["radlader", "regiestunde"], notes: "Verrechnungssatz inkl. Bediener." },
  { id: "blockf-rüttelplatte", group: "Maschinen", category: "Geräte / Regie", name: "Rüttelplatte Regiestunde", unit: "h", minPrice: 15, avgPrice: COMMERCIAL_REGIE_2026.plateLight, maxPrice: 32, keywords: ["rüttelplatte", "ruettelplatte", "verdichtungsgerät", "regiestunde"], notes: "Verrechnungssatz; interner Gerätepreis wird separat geführt." },
  { id: "blockf-stampfer", group: "Maschinen", category: "Geräte", name: "Stampfer / Grabenstampfer", unit: "h", minPrice: 10, avgPrice: 18, maxPrice: 38, keywords: ["stampfer", "grabenstampfer"] },
  { id: "blockf-asphaltschneider", group: "Maschinen", category: "Geräte / Regie", name: "Asphaltschneider / Fugenschneider Regiestunde", unit: "h", minPrice: 22, avgPrice: COMMERCIAL_REGIE_2026.jointSaw, maxPrice: 45, keywords: ["asphaltschneider", "fugenschneider", "regiestunde"], notes: "Verrechnungssatz; Scheibenverschleiß nach tatsächlichem Verbrauch separat." },

  { id: "blockf-lkw-kipper", group: "LKW / Transport", category: "Transport", name: "LKW Kipper", unit: "h", minPrice: 75, avgPrice: 110, maxPrice: 165, keywords: ["lkw", "kipper", "dreiachser"] },
  { id: "blockf-lkw-kran", group: "LKW / Transport", category: "Transport", name: "LKW mit Ladekran", unit: "h", minPrice: 95, avgPrice: 145, maxPrice: 220, keywords: ["lkw kran", "ladekran", "kranwagen"] },
  { id: "blockf-tieflader", group: "LKW / Transport", category: "Transport", name: "Tiefladertransport", unit: "St", minPrice: 280, avgPrice: 650, maxPrice: 1800, keywords: ["tieflader", "maschinentransport"] },
  { id: "blockf-an-abfahrt", group: "LKW / Transport", category: "Transport", name: "An- und Abfahrt", unit: "St", minPrice: 85, avgPrice: 180, maxPrice: 450, keywords: ["anfahrt", "abfahrt", "an- und abfahrt"] },
  { id: "blockf-wartezeit", group: "LKW / Transport", category: "Transport", name: "Wartezeit LKW / Gerät", unit: "h", minPrice: 45, avgPrice: 85, maxPrice: 145, keywords: ["wartezeit", "stillstand"] },

  { id: "blockf-regiearbeit-pauschal", group: "Fremdleistung", category: "Regie", name: "Regiearbeiten pauschal", unit: "h", minPrice: 55, avgPrice: 85, maxPrice: 145, keywords: ["regiearbeit", "regiearbeiten", "arbeiten auf nachweis"] },
  { id: "blockf-kolonne-2mann", group: "Personal", category: "Regie / Kolonne", name: "Kolonne 2 Mann", unit: "h", minPrice: 95, avgPrice: 135, maxPrice: 210, keywords: ["kolonne 2 mann", "zweimannkolonne"] },
  { id: "blockf-kolonne-3mann", group: "Personal", category: "Regie / Kolonne", name: "Kolonne 3 Mann", unit: "h", minPrice: 140, avgPrice: 195, maxPrice: 310, keywords: ["kolonne 3 mann", "dreimannkolonne"] },
  { id: "blockf-geraetepauschale", group: "Maschinen", category: "Geräte", name: "Gerätepauschale Kleingeräte", unit: "Tag", minPrice: 45, avgPrice: 95, maxPrice: 220, keywords: ["gerätepauschale", "geraetepauschale", "kleingeräte"] },
  { id: "blockf-material-klein", group: "Material", category: "Material", name: "Kleinmaterial pauschal", unit: "psch", minPrice: 25, avgPrice: 75, maxPrice: 250, keywords: ["kleinmaterial", "verbrauchsmaterial"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK E BAUSTELLENEINRICHTUNG / VERKEHRSSICHERUNG =================
  { id: "blocke-baustelleneinrichtung", group: "Gemeinkosten", category: "Baustelleneinrichtung", name: "Baustelleneinrichtung pauschal", unit: "psch", minPrice: 850, avgPrice: 2500, maxPrice: 9500, keywords: ["baustelleneinrichtung", "be einrichten", "baustelle einrichten"] },
  { id: "blocke-baustelle-raeumen", group: "Gemeinkosten", category: "Baustelleneinrichtung", name: "Baustelle räumen", unit: "psch", minPrice: 450, avgPrice: 1250, maxPrice: 4200, keywords: ["baustelle räumen", "baustelle raeumen", "baustellenräumung"] },
  { id: "blocke-container", group: "Gemeinkosten", category: "Baustelleneinrichtung", name: "Baustellencontainer stellen", unit: "Monat", minPrice: 180, avgPrice: 480, maxPrice: 1200, keywords: ["baustellencontainer", "container stellen"] },
  { id: "blocke-baustrom", group: "Gemeinkosten", category: "Baustelleneinrichtung", name: "Baustrom herstellen / vorhalten", unit: "psch", minPrice: 350, avgPrice: 950, maxPrice: 2800, keywords: ["baustrom", "stromanschluss baustelle"] },
  { id: "blocke-bauwasser", group: "Gemeinkosten", category: "Baustelleneinrichtung", name: "Bauwasser herstellen / vorhalten", unit: "psch", minPrice: 250, avgPrice: 750, maxPrice: 2200, keywords: ["bauwasser", "wasseranschluss baustelle"] },

  { id: "blocke-bauzaun", group: "Fremdleistung", category: "Absperrung", name: "Bauzaun stellen und vorhalten", unit: "m", minPrice: 4, avgPrice: 9.5, maxPrice: 24, keywords: ["bauzaun", "bauzaun stellen"] },
  { id: "blocke-absperrung", group: "Fremdleistung", category: "Absperrung", name: "Absperrung / Absturzsicherung herstellen", unit: "m", minPrice: 5, avgPrice: 12, maxPrice: 32, keywords: ["absperrung", "absturzsicherung", "bauabsperrung"] },
  { id: "blocke-baken", group: "Fremdleistung", category: "Verkehrssicherung", name: "Leitbaken / Absperrbaken stellen", unit: "St", minPrice: 8, avgPrice: 18, maxPrice: 45, keywords: ["leitbaken", "absperrbaken", "baken"] },

  { id: "blocke-verkehrssicherung", group: "Fremdleistung", category: "Verkehrssicherung", name: "Verkehrssicherung einrichten und vorhalten", unit: "Tag", minPrice: 180, avgPrice: 520, maxPrice: 1800, keywords: ["verkehrssicherung", "verkehrssicherung einrichten"] },
  { id: "blocke-ampelanlage", group: "Fremdleistung", category: "Verkehrssicherung", name: "Mobile Ampelanlage stellen", unit: "Tag", minPrice: 120, avgPrice: 280, maxPrice: 850, keywords: ["ampelanlage", "mobile ampel", "lichtsignalanlage"] },
  { id: "blocke-beschilderungsplan", group: "Fremdleistung", category: "Verkehrssicherung", name: "Beschilderungsplan / Verkehrszeichenplan erstellen", unit: "St", minPrice: 250, avgPrice: 650, maxPrice: 1800, keywords: ["beschilderungsplan", "verkehrszeichenplan", "verkehrsrechtliche anordnung"] },
  { id: "blocke-verkehrsrechtliche-anordnung", group: "Fremdleistung", category: "Verkehrssicherung", name: "Verkehrsrechtliche Anordnung beantragen", unit: "St", minPrice: 120, avgPrice: 320, maxPrice: 950, keywords: ["verkehrsrechtliche anordnung", "vra beantragen", "anordnung beantragen"] },

  { id: "blocke-tagesbaustelle", group: "Fremdleistung", category: "Nebenleistungen", name: "Tagesbaustelle einrichten", unit: "Tag", minPrice: 350, avgPrice: 850, maxPrice: 2500, keywords: ["tagesbaustelle", "tagesbaustelle einrichten"] },
  { id: "blocke-nachtarbeit", group: "Fremdleistung", category: "Nebenleistungen", name: "Zuschlag Nachtarbeit", unit: "h", minPrice: 18, avgPrice: 38, maxPrice: 95, keywords: ["nachtarbeit", "nachtzuschlag", "arbeiten nachts"] },
  { id: "blocke-wochenendarbeit", group: "Fremdleistung", category: "Nebenleistungen", name: "Zuschlag Wochenendarbeit", unit: "h", minPrice: 22, avgPrice: 45, maxPrice: 110, keywords: ["wochenendarbeit", "samstagsarbeit", "sonntagsarbeit"] },

  { id: "blocke-handschachtung", group: "Personal", category: "Suchschachtung", name: "Handschachtung herstellen", unit: "m³", minPrice: 5, avgPrice: 8.53, maxPrice: 16, keywords: ["handschachtung", "handschachtung herstellen"] },
  { id: "blocke-suchschachtung", group: "Fremdleistung", category: "Suchschachtung", name: "Suchschachtung herstellen", unit: "St", minPrice: 30, avgPrice: 44.67, maxPrice: 90, keywords: ["suchschachtung", "suchgraben", "probegrabung"] },
  { id: "blocke-bestandsleitung-sichern", group: "Fremdleistung", category: "Bestandsschutz", name: "Bestandsleitung sichern", unit: "m", minPrice: 25, avgPrice: 65, maxPrice: 180, keywords: ["bestandsleitung sichern", "leitung sichern", "bestand sichern"] },

  { id: "blocke-provisorium", group: "Fremdleistung", category: "Provisorien", name: "Provisorium herstellen", unit: "St", minPrice: 250, avgPrice: 850, maxPrice: 3500, keywords: ["provisorium", "provisorisch herstellen"] },
  { id: "blocke-umleitung", group: "Fremdleistung", category: "Provisorien", name: "Provisorische Umleitung herstellen", unit: "St", minPrice: 550, avgPrice: 1800, maxPrice: 6500, keywords: ["umleitung", "provisorische umleitung"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK D BETON / SCHÄCHTE / FUNDAMENTE =================
  { id: "blockd-betonfundament", group: "Fremdleistung", category: "Beton / Fundamente", name: "Betonfundament herstellen", unit: "m³", minPrice: 220, avgPrice: 420, maxPrice: 950, keywords: ["betonfundament", "fundament beton"] },
  { id: "blockd-streifenfundament", group: "Fremdleistung", category: "Beton / Fundamente", name: "Streifenfundament herstellen", unit: "m³", minPrice: 240, avgPrice: 460, maxPrice: 980, keywords: ["streifenfundament"] },
  { id: "blockd-punktfundament", group: "Fremdleistung", category: "Beton / Fundamente", name: "Punktfundament herstellen", unit: "St", minPrice: 180, avgPrice: 380, maxPrice: 850, keywords: ["punktfundament"] },

  { id: "blockd-schalung", group: "Fremdleistung", category: "Beton / Schalung", name: "Schalung herstellen", unit: "m²", minPrice: 28, avgPrice: 55, maxPrice: 125, keywords: ["schalung", "einschalen"] },
  { id: "blockd-bewehrung", group: "Fremdleistung", category: "Beton / Bewehrung", name: "Bewehrung einbauen", unit: "kg", minPrice: 1.8, avgPrice: 3.2, maxPrice: 7.5, keywords: ["bewehrung", "stahlbewehrung", "mattenbewehrung"] },
  { id: "blockd-beton-einbauen", group: "Fremdleistung", category: "Beton", name: "Beton liefern und einbauen", unit: "m³", minPrice: 160, avgPrice: 285, maxPrice: 620, keywords: ["beton liefern", "beton einbauen", "transportbeton"] },
  { id: "blockd-magerbeton", group: "Fremdleistung", category: "Beton", name: "Magerbeton einbauen", unit: "m³", minPrice: 120, avgPrice: 210, maxPrice: 450, keywords: ["magerbeton"] },

  { id: "blockd-schachtunterteil", group: "Fremdleistung", category: "Schächte", name: "Schachtunterteil setzen", unit: "St", minPrice: 850, avgPrice: 1650, maxPrice: 3800, keywords: ["schachtunterteil"] },
  { id: "blockd-schachtring", group: "Fremdleistung", category: "Schächte", name: "Schachtring setzen", unit: "St", minPrice: 220, avgPrice: 480, maxPrice: 1100, keywords: ["schachtring", "betonring"] },
  { id: "blockd-schachtkonus", group: "Fremdleistung", category: "Schächte", name: "Schachtkonus setzen", unit: "St", minPrice: 280, avgPrice: 620, maxPrice: 1450, keywords: ["schachtkonus", "konus"] },
  { id: "blockd-schachtabdeckung", group: "Fremdleistung", category: "Schächte", name: "Schachtabdeckung liefern und setzen", unit: "St", minPrice: 280, avgPrice: 680, maxPrice: 1600, keywords: ["schachtabdeckung", "abdeckung schacht"] },

  { id: "blockd-schacht-erhoehen", group: "Fremdleistung", category: "Schächte", name: "Schacht erhöhen / regulieren", unit: "St", minPrice: 220, avgPrice: 520, maxPrice: 1250, keywords: ["schacht erhöhen", "schacht erhoehen", "schacht regulieren"] },
  { id: "blockd-schachtabdeckung-tauschen", group: "Fremdleistung", category: "Schächte", name: "Schachtabdeckung austauschen", unit: "St", minPrice: 240, avgPrice: 580, maxPrice: 1350, keywords: ["schachtabdeckung austauschen", "deckel austauschen"] },

  { id: "blockd-strassenablauf-standard", group: "Fremdleistung", category: "Entwässerung", name: "Straßenablauf setzen", unit: "St", minPrice: 360, avgPrice: 550, maxPrice: 850, keywords: ["straßenablauf", "strassenablauf", "sinkkasten"] },
  { id: "blockd-strassenablauf-anschluss", group: "Fremdleistung", category: "Entwässerung", name: "Straßenablauf anschließen", unit: "St", minPrice: 280, avgPrice: 620, maxPrice: 1450, keywords: ["straßenablauf anschließen", "sinkkasten anschluss"] },
  { id: "blockd-ablaufaufsatz", group: "Fremdleistung", category: "Entwässerung", name: "Ablaufaufsatz / Rost setzen", unit: "St", minPrice: 160, avgPrice: 340, maxPrice: 780, keywords: ["ablaufaufsatz", "rost setzen", "gussrost"] },

  { id: "blockd-kabelschacht-klein", group: "Fremdleistung", category: "Kabelschacht", name: "Kabelschacht klein liefern und setzen", unit: "St", minPrice: 280, avgPrice: 620, maxPrice: 1450, keywords: ["kabelschacht klein", "kleinschacht"] },
  { id: "blockd-kabelschacht-gross", group: "Fremdleistung", category: "Kabelschacht", name: "Kabelschacht groß liefern und setzen", unit: "St", minPrice: 850, avgPrice: 1850, maxPrice: 4200, keywords: ["kabelschacht groß", "kabelschacht gross"] },
  { id: "blockd-kunststoffschacht", group: "Fremdleistung", category: "Schächte", name: "Kunststoffschacht setzen", unit: "St", minPrice: 450, avgPrice: 980, maxPrice: 2400, keywords: ["kunststoffschacht"] },
  { id: "blockd-betonschacht", group: "Fremdleistung", category: "Schächte", name: "Betonschacht setzen", unit: "St", minPrice: 950, avgPrice: 2200, maxPrice: 5200, keywords: ["betonschacht"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK C ERDARBEITEN / VERBAU / ENTSORGUNG =================
  { id: "blockc-baugrube-aushub", group: "Maschinen", category: "Erdarbeiten", name: "Baugrube ausheben / Boden lösen und laden", unit: "m³", minPrice: 18, avgPrice: 34, maxPrice: 75, keywords: ["baugrube", "aushub baugrube", "boden lösen", "boden loesen"] },
  { id: "blockc-graben-aushub", group: "Maschinen", category: "Erdarbeiten", name: "Graben ausheben / Leitungsgraben herstellen", unit: "m³", minPrice: 22, avgPrice: 42, maxPrice: 95, keywords: ["graben ausheben", "leitungsgraben", "rohrgraben", "kabelgraben"] },
  { id: "blockc-bodenabtrag", group: "Maschinen", category: "Erdarbeiten", name: "Oberboden / Boden abtragen", unit: "m²", minPrice: 4, avgPrice: 9, maxPrice: 24, keywords: ["oberboden abtragen", "boden abtragen", "humus abtragen"] },
  { id: "blockc-bodenaustausch", group: "Fremdleistung", category: "Erdarbeiten", name: "Bodenaustausch herstellen", unit: "m³", minPrice: 42, avgPrice: 85, maxPrice: 180, keywords: ["bodenaustausch", "boden austauschen"] },

  { id: "blockc-grabenverbau", group: "Fremdleistung", category: "Verbau", name: "Grabenverbau herstellen", unit: "m²", minPrice: 28, avgPrice: 58, maxPrice: 140, keywords: ["grabenverbau", "verbau", "verbaukasten"] },
  { id: "blockc-spundwand", group: "Fremdleistung", category: "Verbau", name: "Spundwand herstellen", unit: "m²", minPrice: 95, avgPrice: 210, maxPrice: 480, keywords: ["spundwand", "spundwandverbau"] },
  { id: "blockc-bohltraegerverbau", group: "Fremdleistung", category: "Verbau", name: "Bohrträgerverbau / Berliner Verbau herstellen", unit: "m²", minPrice: 120, avgPrice: 260, maxPrice: 620, keywords: ["bohrträgerverbau", "berliner verbau", "bohlträgerverbau"] },

  { id: "blockc-wasserhaltung-pumpe", group: "Fremdleistung", category: "Wasserhaltung", name: "Wasserhaltung mit Pumpe herstellen", unit: "Tag", minPrice: 120, avgPrice: 280, maxPrice: 750, keywords: ["wasserhaltung", "pumpe", "pumpen"] },
  { id: "blockc-drainagewasser-abpumpen", group: "Fremdleistung", category: "Wasserhaltung", name: "Bauwasser / Grundwasser abpumpen", unit: "h", minPrice: 45, avgPrice: 95, maxPrice: 220, keywords: ["bauwasser", "grundwasser", "abpumpen"] },

  { id: "blockc-entsorgung-boden-z0", group: "Entsorgung", category: "Entsorgung", name: "Boden Z0 entsorgen", unit: "t", minPrice: 18, avgPrice: 28, maxPrice: 55, keywords: ["boden z0", "boden entsorgen", "unbelastet"] },
  { id: "blockc-entsorgung-boden-z1", group: "Entsorgung", category: "Entsorgung", name: "Boden Z1 entsorgen", unit: "t", minPrice: 3.5, avgPrice: 6.14, maxPrice: 12, keywords: ["boden z1", "boden belastet"] },
  { id: "blockc-entsorgung-boden-z2", group: "Entsorgung", category: "Entsorgung", name: "Boden Z2 entsorgen", unit: "t", minPrice: 18, avgPrice: 30.85, maxPrice: 55, keywords: ["boden z2", "boden stark belastet"] },
  { id: "blockc-entsorgung-bauschutt", group: "Entsorgung", category: "Entsorgung", name: "Bauschutt entsorgen", unit: "t", minPrice: 35, avgPrice: 72, maxPrice: 160, keywords: ["bauschutt", "bauschutt entsorgen"] },
  { id: "blockc-entsorgung-beton", group: "Entsorgung", category: "Entsorgung", name: "Betonaufbruch entsorgen", unit: "t", minPrice: 28, avgPrice: 58, maxPrice: 130, keywords: ["betonaufbruch", "beton entsorgen"] },

  { id: "blockc-verfuellung", group: "Maschinen", category: "Verfüllung", name: "Graben / Baugrube verfüllen", unit: "m³", minPrice: 18, avgPrice: 32, maxPrice: 75, keywords: ["verfüllen", "verfuellen", "verfüllung", "verfuellung"] },
  { id: "blockc-lagenweise-verdichten", group: "Maschinen", category: "Verdichtung", name: "Lagenweise verfüllen und verdichten", unit: "m³", minPrice: 24, avgPrice: 45, maxPrice: 95, keywords: ["lagenweise", "verdichten", "verfüllen und verdichten"] },

  { id: "blockc-fuellsand-liefern", group: "Material", category: "Material Lieferung", name: "Füllsand liefern und einbauen", unit: "m³", minPrice: 22, avgPrice: 42, maxPrice: 85, keywords: ["füllsand", "fuellsand", "sand liefern"] },
  { id: "blockc-kies-liefern", group: "Material", category: "Material Lieferung", name: "Kies liefern und einbauen", unit: "m³", minPrice: 28, avgPrice: 52, maxPrice: 110, keywords: ["kies liefern", "kies einbauen"] },
  { id: "blockc-schotter-liefern", group: "Material", category: "Material Lieferung", name: "Schotter liefern und einbauen", unit: "m³", minPrice: 34, avgPrice: 62, maxPrice: 130, keywords: ["schotter liefern", "schotter einbauen"] },
  { id: "blockc-rc-material-liefern", group: "Material", category: "Material Lieferung", name: "Recyclingmaterial liefern und einbauen", unit: "m³", minPrice: 24, avgPrice: 46, maxPrice: 95, keywords: ["recyclingmaterial", "rc-material", "rc material"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK B STRASSENBAU / OBERFLÄCHEN =================
  { id: "blockb-asphalt-binder", group: "Fremdleistung", category: "Straßenbau / Asphalt", name: "Asphaltbinderschicht herstellen", unit: "m²", minPrice: 18, avgPrice: 32, maxPrice: 65, keywords: ["asphaltbinderschicht", "binder", "asphalt binder"] },
  { id: "blockb-asphalt-ausgleich", group: "Fremdleistung", category: "Straßenbau / Asphalt", name: "Asphalt-Ausgleichsschicht herstellen", unit: "m²", minPrice: 14, avgPrice: 26, maxPrice: 58, keywords: ["ausgleichsschicht", "profilierung asphalt", "asphalt ausgleich"] },
  { id: "blockb-asphalt-hand", group: "Fremdleistung", category: "Straßenbau / Asphalt", name: "Asphalt Kleinfläche von Hand herstellen", unit: "m²", minPrice: 38, avgPrice: 75, maxPrice: 160, keywords: ["asphalt handeinbau", "kleinfläche asphalt", "asphalt kleinfläche"] },

  { id: "blockb-asphalt-aufbruch", group: "Fremdleistung", category: "Straßenbau / Aufbruch", name: "Asphaltfläche aufbrechen und aufnehmen", unit: "m²", minPrice: 8, avgPrice: 18, maxPrice: 42, keywords: ["asphalt aufbrechen", "asphalt aufnehmen", "asphaltaufbruch"] },
  { id: "blockb-pflaster-aufnehmen", group: "Fremdleistung", category: "Straßenbau / Aufbruch", name: "Pflaster aufnehmen und seitlich lagern", unit: "m²", minPrice: 8, avgPrice: 18, maxPrice: 42, keywords: ["pflaster aufnehmen", "pflaster ausbauen", "pflaster seitlich lagern"] },
  { id: "blockb-beton-aufbrechen", group: "Fremdleistung", category: "Straßenbau / Aufbruch", name: "Betonfläche aufbrechen und aufnehmen", unit: "m²", minPrice: 18, avgPrice: 38, maxPrice: 85, keywords: ["betonfläche aufbrechen", "beton aufbrechen", "beton aufnehmen"] },

  { id: "blockb-pflaster-verlegen", group: "Fremdleistung", category: "Straßenbau / Pflaster", name: "Betonpflaster liefern und verlegen", unit: "m²", minPrice: 42, avgPrice: 78, maxPrice: 155, keywords: ["betonpflaster", "pflaster verlegen", "pflasterfläche herstellen"] },
  { id: "blockb-platten-verlegen", group: "Fremdleistung", category: "Straßenbau / Pflaster", name: "Betonplatten liefern und verlegen", unit: "m²", minPrice: 45, avgPrice: 85, maxPrice: 170, keywords: ["betonplatten", "platten verlegen", "plattenbelag"] },
  { id: "blockb-natursteinpflaster", group: "Fremdleistung", category: "Straßenbau / Pflaster", name: "Natursteinpflaster verlegen", unit: "m²", minPrice: 85, avgPrice: 155, maxPrice: 320, keywords: ["natursteinpflaster", "granitpflaster", "kleinsteinpflaster"] },

  { id: "blockb-bordstein-hochbord", group: "Fremdleistung", category: "Straßenbau / Bord", name: "Hochbordstein liefern und setzen", unit: "m", minPrice: 45, avgPrice: 82, maxPrice: 165, keywords: ["hochbord", "hochbordstein"] },
  { id: "blockb-bordstein-tiefbord", group: "Fremdleistung", category: "Straßenbau / Bord", name: "Tiefbordstein liefern und setzen", unit: "m", minPrice: 32, avgPrice: 58, maxPrice: 125, keywords: ["tiefbord", "tiefbordstein"] },
  { id: "blockb-rundbord", group: "Fremdleistung", category: "Straßenbau / Bord", name: "Rundbordstein liefern und setzen", unit: "m", minPrice: 38, avgPrice: 68, maxPrice: 140, keywords: ["rundbord", "rundbordstein"] },

  { id: "blockb-rinne-pflaster", group: "Fremdleistung", category: "Straßenbau / Rinnen", name: "Pflasterrinne herstellen", unit: "m", minPrice: 38, avgPrice: 72, maxPrice: 150, keywords: ["pflasterrinne", "muldenrinne pflaster", "rinne pflaster"] },
  { id: "blockb-rinne-beton", group: "Fremdleistung", category: "Straßenbau / Rinnen", name: "Betonrinne / Entwässerungsrinne herstellen", unit: "m", minPrice: 65, avgPrice: 125, maxPrice: 260, keywords: ["betonrinne", "entwässerungsrinne", "entwaesserungsrinne"] },

  { id: "blockb-markierung-linie", group: "Fremdleistung", category: "Straßenbau / Markierung", name: "Fahrbahnmarkierung Linie herstellen", unit: "m", minPrice: 1.8, avgPrice: 4.5, maxPrice: 12, keywords: ["fahrbahnmarkierung", "linie markieren", "markierung linie"] },
  { id: "blockb-beschilderung", group: "Fremdleistung", category: "Straßenbau / Beschilderung", name: "Verkehrsschild liefern und setzen", unit: "St", minPrice: 180, avgPrice: 420, maxPrice: 950, keywords: ["verkehrsschild", "beschilderung", "schild setzen"] },

  { id: "blockb-bankett", group: "Fremdleistung", category: "Straßenbau / Nebenflächen", name: "Bankett herstellen", unit: "m²", minPrice: 6, avgPrice: 14, maxPrice: 35, keywords: ["bankett", "bankett herstellen"] },
  { id: "blockb-mulde", group: "Fremdleistung", category: "Straßenbau / Nebenflächen", name: "Mulde profilieren / herstellen", unit: "m", minPrice: 8, avgPrice: 18, maxPrice: 45, keywords: ["mulde", "entwässerungsmulde", "mulde profilieren"] },
  { id: "blockb-rasenansaat", group: "Fremdleistung", category: "Straßenbau / Nebenflächen", name: "Rasenansaat herstellen", unit: "m²", minPrice: 2.5, avgPrice: 6.5, maxPrice: 18, keywords: ["rasenansaat", "ansaat", "rasen herstellen"] },

  { id: "blockb-planum", group: "Fremdleistung", category: "Erdarbeiten / Planum", name: "Planum herstellen", unit: "m²", minPrice: 2.5, avgPrice: 6.5, maxPrice: 18, keywords: ["planum", "feinplanum", "planie"] },
  { id: "blockb-verdichtung", group: "Fremdleistung", category: "Erdarbeiten / Verdichtung", name: "Untergrund verdichten", unit: "m²", minPrice: 2, avgPrice: 5.5, maxPrice: 16, keywords: ["verdichten", "untergrund verdichten", "verdichtung"] },
  { id: "blockb-sauberkeitsschicht", group: "Fremdleistung", category: "Betonbau", name: "Sauberkeitsschicht herstellen", unit: "m²", minPrice: 18, avgPrice: 36, maxPrice: 85, keywords: ["sauberkeitsschicht", "magerbeton", "betonsauberkeitsschicht"] },

  // ================= TIEFBAU ERWEITERUNG: BLOCK A VERSORGUNG / LEITUNGSBAU =================
  { id: "beleuchtung-mast-setzen", group: "Fremdleistung", category: "Straßenbeleuchtung", name: "Lichtmast / Straßenbeleuchtungsmast setzen", unit: "St", minPrice: 650, avgPrice: 1250, maxPrice: 2800, keywords: ["lichtmast", "beleuchtungsmast", "strassenbeleuchtung", "straßenbeleuchtung"] },
  { id: "beleuchtung-fundament-herstellen", group: "Fremdleistung", category: "Straßenbeleuchtung", name: "Fundament für Lichtmast herstellen", unit: "St", minPrice: 280, avgPrice: 620, maxPrice: 1400, keywords: ["mastfundament", "fundament lichtmast"] },
  { id: "beleuchtung-kabel-anschluss", group: "Fremdleistung", category: "Straßenbeleuchtung", name: "Straßenbeleuchtung anschließen", unit: "St", minPrice: 220, avgPrice: 480, maxPrice: 1100, keywords: ["lichtmast anschluss", "beleuchtung anschluss"] },

  { id: "telekom-kabelzug", group: "Fremdleistung", category: "Telekom", name: "Telekom-Kabel in Rohr einziehen", unit: "m", minPrice: 3.5, avgPrice: 7.5, maxPrice: 16, keywords: ["telekom", "kabelzug", "einziehen"] },
  { id: "telekom-muffe", group: "Fremdleistung", category: "Telekom", name: "Telekom-Muffe herstellen", unit: "St", minPrice: 180, avgPrice: 420, maxPrice: 950, keywords: ["telekom muffe", "muffe"] },
  { id: "telekom-schrank-setzen", group: "Fremdleistung", category: "Telekom", name: "Telekom-Verteilerschrank setzen", unit: "St", minPrice: 550, avgPrice: 1150, maxPrice: 2800, keywords: ["telekom schrank", "mfg", "verteilerschrank"] },

  { id: "fernwaerme-rohr-verlegen", group: "Fremdleistung", category: "Fernwärme", name: "Fernwärmerohr liefern und verlegen", unit: "m", minPrice: 95, avgPrice: 180, maxPrice: 420, keywords: ["fernwaerme", "fernwärme", "waermeleitung", "wärmeleitung"] },
  { id: "fernwaerme-hausanschluss", group: "Fremdleistung", category: "Fernwärme", name: "Fernwärme-Hausanschluss herstellen", unit: "St", minPrice: 2200, avgPrice: 4800, maxPrice: 9800, keywords: ["fernwaerme hausanschluss", "fernwärme hausanschluss"] },
  { id: "fernwaerme-druckprobe", group: "Fremdleistung", category: "Fernwärme", name: "Druckprüfung Fernwärmeleitung", unit: "St", minPrice: 450, avgPrice: 950, maxPrice: 2200, keywords: ["druckprüfung fernwärme", "druckprobe fernwaerme"] },

  { id: "abwasser-druckleitung-verlegen", group: "Fremdleistung", category: "Abwasser Druckleitung", name: "Abwasser-Druckleitung PE verlegen", unit: "m", minPrice: 45, avgPrice: 85, maxPrice: 180, keywords: ["abwasser druckleitung", "druckleitung", "pe druckleitung"] },
  { id: "pumpenschacht-setzen", group: "Fremdleistung", category: "Pumpentechnik", name: "Pumpenschacht setzen", unit: "St", minPrice: 2800, avgPrice: 6200, maxPrice: 14500, keywords: ["pumpenschacht", "pumpschacht"] },
  { id: "hebeanlage-einbauen", group: "Fremdleistung", category: "Pumpentechnik", name: "Hebeanlage einbauen", unit: "St", minPrice: 1800, avgPrice: 4200, maxPrice: 9500, keywords: ["hebeanlage"] },

  { id: "armatur-schieber-einbauen", group: "Fremdleistung", category: "Armaturen", name: "Schieber / Absperrschieber einbauen", unit: "St", minPrice: 280, avgPrice: 620, maxPrice: 1350, keywords: ["schieber", "absperrschieber", "armatur"] },
  { id: "armatur-ventil-einbauen", group: "Fremdleistung", category: "Armaturen", name: "Ventil / Klappe einbauen", unit: "St", minPrice: 220, avgPrice: 520, maxPrice: 1200, keywords: ["ventil", "klappe", "armatur"] },

  { id: "kernbohrung-rohrdurchfuehrung", group: "Fremdleistung", category: "Rohrdurchführung", name: "Kernbohrung / Rohrdurchführung herstellen", unit: "St", minPrice: 180, avgPrice: 420, maxPrice: 950, keywords: ["kernbohrung", "rohrdurchführung", "rohrdurchfuehrung"] },
  { id: "hauseinfuehrung-mehrsparten", group: "Fremdleistung", category: "Hauseinführung", name: "Mehrsparten-Hauseinführung herstellen", unit: "St", minPrice: 650, avgPrice: 1450, maxPrice: 3600, keywords: ["mehrsparten", "hauseinführung", "hauseinfuehrung"] },

  { id: "vermessung-trasse-abstecken", group: "Fremdleistung", category: "Vermessung / Dokumentation", name: "Trasse abstecken", unit: "m", minPrice: 1.2, avgPrice: 2.8, maxPrice: 6.5, keywords: ["trasse abstecken", "absteckung"] },
  { id: "doku-bestandsplan", group: "Fremdleistung", category: "Vermessung / Dokumentation", name: "Bestandsplan / As-Built Dokumentation erstellen", unit: "St", minPrice: 250, avgPrice: 750, maxPrice: 2200, keywords: ["bestandsplan", "as-built", "dokumentation"] },
  { id: "ortung-leitung", group: "Fremdleistung", category: "Vermessung / Dokumentation", name: "Leitungsortung durchführen", unit: "h", minPrice: 75, avgPrice: 125, maxPrice: 240, keywords: ["leitungsortung", "ortung", "leitung orten"] },

  // ================= TIEFBAU ERWEITERUNG: STROM / KABELBAU =================
  {
    id: "strom-erdkabel-verlegen",
    group: "Fremdleistung",
    category: "Strom / Kabelbau",
    name: "Stromkabel / Erdkabel liefern und verlegen",
    unit: "m",
    minPrice: 18,
    avgPrice: 34,
    maxPrice: 75,
    keywords: ["stromkabel", "erdkabel", "nyy", "strom", "verlegen"],
  },
  {
    id: "strom-kabelzug",
    group: "Fremdleistung",
    category: "Strom / Kabelbau",
    name: "Kabel in vorhandenes Leerrohr einziehen",
    unit: "m",
    minPrice: 4,
    avgPrice: 8.5,
    maxPrice: 18,
    keywords: ["kabelzug", "kabel ziehen", "einziehen", "leerrohr"],
  },
  {
    id: "strom-leerrohr-verlegen",
    group: "Fremdleistung",
    category: "Strom / Kabelbau",
    name: "Leerrohr für Stromleitung liefern und verlegen",
    unit: "m",
    minPrice: 12,
    avgPrice: 24,
    maxPrice: 52,
    keywords: ["leerrohr", "stromleitung", "schutzrohr strom"],
  },
  {
    id: "strom-kabelmuffe",
    group: "Fremdleistung",
    category: "Strom / Kabelbau",
    name: "Kabelmuffe / Verbindungsmuffe herstellen",
    unit: "St",
    minPrice: 180,
    avgPrice: 420,
    maxPrice: 950,
    keywords: ["kabelmuffe", "verbindungsmuffe", "muffe", "strom"],
  },
  {
    id: "strom-kvz-setzen",
    group: "Fremdleistung",
    category: "Strom / Kabelbau",
    name: "Kabelverteilerschrank / KVZ setzen",
    unit: "St",
    minPrice: 650,
    avgPrice: 1350,
    maxPrice: 3200,
    keywords: ["kabelverteilerschrank", "kvz", "verteilerschrank", "strom"],
  },

  // ================= TIEFBAU ERWEITERUNG: GASLEITUNG =================
  {
    id: "gas-pe-da32-verlegen",
    group: "Fremdleistung",
    category: "Gasleitung",
    name: "PE-Gasleitung da32 liefern und verlegen",
    unit: "m",
    minPrice: 22,
    avgPrice: 38,
    maxPrice: 72,
    keywords: ["gasleitung", "gasrohr", "pe gas", "da32", "verlegen"],
  },
  {
    id: "gas-pe-da63-verlegen",
    group: "Fremdleistung",
    category: "Gasleitung",
    name: "PE-Gasleitung da63 liefern und verlegen",
    unit: "m",
    minPrice: 34,
    avgPrice: 62,
    maxPrice: 115,
    keywords: ["gasleitung", "gasrohr", "pe gas", "da63", "verlegen"],
  },
  {
    id: "gas-hausanschluss",
    group: "Fremdleistung",
    category: "Gasleitung",
    name: "Gas-Hausanschluss herstellen",
    unit: "St",
    minPrice: 950,
    avgPrice: 1950,
    maxPrice: 4500,
    keywords: ["gas", "hausanschluss", "anschlussleitung"],
  },
  {
    id: "gas-druckprobe",
    group: "Fremdleistung",
    category: "Gasleitung",
    name: "Druckprüfung Gasleitung",
    unit: "St",
    minPrice: 280,
    avgPrice: 580,
    maxPrice: 1250,
    keywords: ["druckprüfung gas", "druckpruefung gas", "druckprobe gas", "gasleitung"],
  },
  {
    id: "gas-schutzrohr-verlegen",
    group: "Fremdleistung",
    category: "Gasleitung",
    name: "Schutzrohr für Gasleitung liefern und verlegen",
    unit: "m",
    minPrice: 12,
    avgPrice: 24,
    maxPrice: 48,
    keywords: ["schutzrohr gas", "gasleitung schutzrohr", "gas schutzrohr"],
  },

  // ================= TIEFBAU ERWEITERUNG: WASSERLEITUNG =================
  {
    id: "wasser-pe-da32-verlegen",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "PE-Wasserleitung da32 liefern und verlegen",
    unit: "m",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 58,
    keywords: ["pe da32", "wasserleitung", "trinkwasser", "verlegen"],
  },
  {
    id: "wasser-pe-da63-verlegen",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "PE-Wasserleitung da63 liefern und verlegen",
    unit: "m",
    minPrice: 28,
    avgPrice: 52,
    maxPrice: 95,
    keywords: ["pe da63", "wasserleitung", "trinkwasser", "verlegen"],
  },
  {
    id: "wasser-pe-da110-verlegen",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "PE-Wasserleitung da110 liefern und verlegen",
    unit: "m",
    minPrice: 55,
    avgPrice: 95,
    maxPrice: 180,
    keywords: ["pe da110", "wasserleitung", "trinkwasser", "verlegen"],
  },
  {
    id: "wasser-schieber-einbauen",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "Absperrschieber einbauen",
    unit: "St",
    minPrice: 280,
    avgPrice: 620,
    maxPrice: 1350,
    keywords: ["schieber", "absperrschieber", "wasserleitung", "armatur"],
  },
  {
    id: "wasser-hydrant-einbauen",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "Hydrant einbauen",
    unit: "St",
    minPrice: 650,
    avgPrice: 1250,
    maxPrice: 2600,
    keywords: ["hydrant", "unterflurhydrant", "oberflurhydrant", "wasser"],
  },
  {
    id: "wasser-hausanschluss",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "Wasser-Hausanschluss herstellen",
    unit: "St",
    minPrice: 850,
    avgPrice: 1800,
    maxPrice: 4200,
    keywords: ["hausanschluss", "wasser", "anschlussleitung", "trinkwasser"],
  },
  {
    id: "wasser-druckprobe",
    group: "Fremdleistung",
    category: "Wasserleitung",
    name: "Druckprüfung Wasserleitung",
    unit: "St",
    minPrice: 250,
    avgPrice: 520,
    maxPrice: 1100,
    keywords: ["druckprüfung", "druckprobe", "wasserleitung", "prüfung"],
  },

  // ================= TIEFBAU ERWEITERUNG: KANAL / ENTWÄSSERUNG =================
  {
    id: "kanal-kg-dn100-verlegen",
    group: "Fremdleistung",
    category: "Kanal",
    name: "KG-Rohr DN100 liefern und verlegen",
    unit: "m",
    minPrice: 28,
    avgPrice: 48,
    maxPrice: 85,
    keywords: ["kg rohr", "dn100", "kanal", "verlegen"],
  },
  {
    id: "kanal-kg-dn150-verlegen",
    group: "Fremdleistung",
    category: "Kanal",
    name: "KG-Rohr DN150 liefern und verlegen",
    unit: "m",
    minPrice: 38,
    avgPrice: 68,
    maxPrice: 125,
    keywords: ["kg rohr", "dn150", "kanal", "verlegen"],
  },
  {
    id: "kanal-kg-dn200-verlegen",
    group: "Fremdleistung",
    category: "Kanal",
    name: "KG-Rohr DN200 liefern und verlegen",
    unit: "m",
    minPrice: 55,
    avgPrice: 95,
    maxPrice: 175,
    keywords: ["kg rohr", "dn200", "kanal", "verlegen"],
  },
  {
    id: "kanal-betonrohr-dn300-verlegen",
    group: "Fremdleistung",
    category: "Kanal",
    name: "Betonrohr DN300 verlegen",
    unit: "m",
    minPrice: 95,
    avgPrice: 165,
    maxPrice: 320,
    keywords: ["betonrohr", "dn300", "kanal", "regenwasser"],
  },
  {
    id: "kanal-betonrohr-dn500-verlegen",
    group: "Fremdleistung",
    category: "Kanal",
    name: "Betonrohr DN500 verlegen",
    unit: "m",
    minPrice: 180,
    avgPrice: 320,
    maxPrice: 650,
    keywords: ["betonrohr", "dn500", "kanal", "regenwasser"],
  },
  {
    id: "kanal-kontrollschacht-setzen",
    group: "Fremdleistung",
    category: "Kanal",
    name: "Kontrollschacht setzen",
    unit: "St",
    minPrice: 950,
    avgPrice: 1850,
    maxPrice: 3900,
    keywords: ["kontrollschacht", "schacht setzen", "kanalschacht"],
  },
  {
    id: "kanal-schachtanschluss",
    group: "Fremdleistung",
    category: "Kanal",
    name: "Rohranschluss an Schacht herstellen",
    unit: "St",
    minPrice: 180,
    avgPrice: 380,
    maxPrice: 850,
    keywords: ["schachtanschluss", "rohranschluss", "anschluss schacht"],
  },
  {
    id: "kanal-dichtheitspruefung",
    group: "Fremdleistung",
    category: "Kanal",
    name: "Dichtheitsprüfung Kanal",
    unit: "St",
    minPrice: 280,
    avgPrice: 580,
    maxPrice: 1250,
    keywords: ["dichtheitsprüfung", "kanalprüfung", "prüfung", "kanal"],
  },
  {
    id: "kanal-kamerabefahrung",
    group: "Fremdleistung",
    category: "Kanal",
    name: "Kamerabefahrung Kanal",
    unit: "m",
    minPrice: 3.5,
    avgPrice: 7.5,
    maxPrice: 16,
    keywords: ["kamerabefahrung", "kanal tv", "inspektion", "kanal"],
  },

  // ================= TIEFBAU ERWEITERUNG: DRAINAGE =================
  {
    id: "drainage-rohr-dn100",
    group: "Fremdleistung",
    category: "Drainage",
    name: "Drainagerohr DN100 liefern und verlegen",
    unit: "m",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 65,
    keywords: ["drainage", "drainagerohr", "dn100", "sickerleitung"],
  },
  {
    id: "drainage-filterkies",
    group: "Material",
    category: "Drainage",
    name: "Filterkies Drainage einbauen",
    unit: "m³",
    minPrice: 45,
    avgPrice: 68,
    maxPrice: 105,
    keywords: ["filterkies", "drainage", "sickerkies", "kies"],
  },
  {
    id: "drainage-vlies",
    group: "Material",
    category: "Drainage",
    name: "Filtervlies / Geotextil",
    unit: "m²",
    minPrice: 1.2,
    avgPrice: 2.8,
    maxPrice: 6.5,
    keywords: ["filtervlies", "geotextil", "vlies", "drainage"],
  },
  {
    id: "drainage-rigole",
    group: "Fremdleistung",
    category: "Drainage",
    name: "Rigole herstellen",
    unit: "m³",
    minPrice: 75,
    avgPrice: 125,
    maxPrice: 240,
    keywords: ["rigole", "versickerung", "drainage", "sickerschacht"],
  },

  // ================= TIEFBAU ERWEITERUNG: OBERFLÄCHE AUFNEHMEN / WIEDERHERSTELLEN =================
  {
    id: "oberflaeche-pflaster-aufnehmen-lagern",
    group: "Personal",
    category: "Oberfläche",
    name: "Pflaster aufnehmen und seitlich lagern",
    unit: "m²",
    minPrice: 8,
    avgPrice: 16,
    maxPrice: 32,
    keywords: ["pflaster aufnehmen", "lagern", "wiederverwenden"],
  },
  {
    id: "oberflaeche-pflaster-wieder-einbauen",
    group: "Personal",
    category: "Oberfläche",
    name: "Pflaster wieder einbauen",
    unit: "m²",
    minPrice: 28,
    avgPrice: 48,
    maxPrice: 88,
    keywords: ["pflaster wieder einbauen", "pflaster wiederherstellen", "pflaster verlegen"],
  },
  {
    id: "oberflaeche-rasengitter-komplett",
    group: "Fremdleistung",
    category: "Oberfläche",
    name: "Rasengitterpflaster komplett herstellen",
    unit: "m²",
    minPrice: 75,
    avgPrice: 115,
    maxPrice: 165,
    keywords: ["rasengitterpflaster komplett", "rasengitter", "splitt", "frostschutz"],
  },
  {
    id: "oberflaeche-betonpflaster-komplett",
    group: "Fremdleistung",
    category: "Oberfläche",
    name: "Betonpflaster komplett herstellen",
    unit: "m²",
    minPrice: 65,
    avgPrice: 98,
    maxPrice: 150,
    keywords: ["betonpflaster komplett", "pflaster", "frostschutz", "bettung"],
  },
  {
    id: "oberflaeche-asphalt-schneiden-m",
    group: "Maschinen",
    category: "Oberfläche",
    name: "Asphalt schneiden",
    unit: "m",
    minPrice: 5,
    avgPrice: 9,
    maxPrice: 18,
    keywords: ["asphalt schneiden", "fugenschnitt", "schneiden"],
  },
  {
    id: "oberflaeche-asphalt-aufbrechen-m2",
    group: "Maschinen",
    category: "Oberfläche",
    name: "Asphalt aufbrechen und aufnehmen",
    unit: "m²",
    minPrice: 9,
    avgPrice: 18,
    maxPrice: 36,
    keywords: ["asphalt aufbrechen", "asphalt aufnehmen", "asphaltaufbruch"],
  },
  {
    id: "oberflaeche-asphalt-provisorisch",
    group: "Fremdleistung",
    category: "Oberfläche",
    name: "Asphalt provisorisch schließen",
    unit: "m²",
    minPrice: 28,
    avgPrice: 48,
    maxPrice: 90,
    keywords: ["provisorisch asphalt", "kaltasphalt", "provisorische wiederherstellung"],
  },
  {
    id: "oberflaeche-asphalt-endgueltig",
    group: "Fremdleistung",
    category: "Oberfläche",
    name: "Asphalt endgültig wiederherstellen",
    unit: "m²",
    minPrice: 55,
    avgPrice: 88,
    maxPrice: 155,
    keywords: ["asphalt endgültig", "asphalt wiederherstellen", "deckschicht"],
  },
  {
    id: "oberflaeche-schotterflaeche",
    group: "Fremdleistung",
    category: "Oberfläche",
    name: "Schotterfläche herstellen",
    unit: "m²",
    minPrice: 18,
    avgPrice: 32,
    maxPrice: 62,
    keywords: ["schotterfläche", "schotter", "fläche herstellen"],
  },

  // ================= TIEFBAU ERWEITERUNG: ENTWÄSSERUNG / RINNEN =================
  {
    id: "entwaesserung-rinne-dn100",
    group: "Fremdleistung",
    category: "Entwässerung",
    name: "Entwässerungsrinne DN100 setzen",
    unit: "m",
    minPrice: 65,
    avgPrice: 115,
    maxPrice: 220,
    keywords: ["entwässerungsrinne", "rinne", "dn100", "ablaufrinne"],
  },
  {
    id: "entwaesserung-strassenablauf",
    group: "Fremdleistung",
    category: "Entwässerung",
    name: "Straßenablauf setzen",
    unit: "St",
    minPrice: 650,
    avgPrice: 1250,
    maxPrice: 2600,
    keywords: ["straßenablauf", "strassenablauf", "gully", "ablauf"],
  },
  {
    id: "entwaesserung-hofablauf",
    group: "Fremdleistung",
    category: "Entwässerung",
    name: "Hofablauf setzen",
    unit: "St",
    minPrice: 280,
    avgPrice: 580,
    maxPrice: 1250,
    keywords: ["hofablauf", "ablauf", "entwässerung"],
  },
  {
    id: "entwaesserung-sickerschacht",
    group: "Fremdleistung",
    category: "Entwässerung",
    name: "Sickerschacht herstellen",
    unit: "St",
    minPrice: 850,
    avgPrice: 1650,
    maxPrice: 3600,
    keywords: ["sickerschacht", "versickerung", "regenwasser"],
  },

  // ================= TIEFBAU ERWEITERUNG: TRANSPORT / DEPONIE =================
  {
    id: "transport-aushub-kurzstrecke",
    group: "LKW / Transport",
    category: "Transport",
    name: "Aushubtransport Kurzstrecke",
    unit: "m³",
    minPrice: 12,
    avgPrice: 22,
    maxPrice: 38,
    keywords: ["aushub transport", "kurzstrecke", "abfuhr", "lkw"],
    notes: "RLC realistischer Richtwert: Kurzstreckentransport Baustelle/Deponie, ohne Deponiegebühr.",
  },
  {
    id: "transport-aushub-mittelstrecke",
    group: "LKW / Transport",
    category: "Transport",
    name: "Aushubtransport Mittelstrecke",
    unit: "m³",
    minPrice: 16,
    avgPrice: 28,
    maxPrice: 55,
    keywords: ["aushub transport", "mittelstrecke", "deponie", "lkw"],
  },
  {
    id: "transport-material-anlieferung",
    group: "LKW / Transport",
    category: "Transport",
    name: "Materialanlieferung Schüttgut",
    unit: "m³",
    minPrice: 8,
    avgPrice: 18,
    maxPrice: 38,
    keywords: ["materialanlieferung", "schüttgut", "kies", "sand", "transport"],
  },
  {
    id: "entsorgung-boden-z1",
    group: "Entsorgung",
    category: "Entsorgung Boden",
    name: "Boden entsorgen Z1",
    unit: "t",
    minPrice: 28,
    avgPrice: 55,
    maxPrice: 110,
    keywords: ["boden z1", "entsorgung", "deponie", "aushub"],
  },
  {
    id: "entsorgung-boden-z2",
    group: "Entsorgung",
    category: "Entsorgung Boden",
    name: "Boden entsorgen Z2",
    unit: "t",
    minPrice: 55,
    avgPrice: 110,
    maxPrice: 240,
    keywords: ["boden z2", "entsorgung", "deponie", "aushub"],
  },
  {
    id: "entsorgung-teerhaltiger-asphalt",
    group: "Entsorgung",
    category: "Entsorgung Asphalt",
    name: "Teerhaltigen Asphalt entsorgen",
    unit: "t",
    minPrice: 95,
    avgPrice: 180,
    maxPrice: 420,
    keywords: ["teerhaltig", "asphalt", "pak", "gefährlich", "entsorgung"],
  },

  // ================= TIEFBAU ERWEITERUNG: VERMESSUNG / DOKUMENTATION =================
  {
    id: "vermessung-absteckung-trasse",
    group: "Fremdleistung",
    category: "Vermessung",
    name: "Trasse abstecken",
    unit: "m",
    minPrice: 1.2,
    avgPrice: 2.8,
    maxPrice: 6.5,
    keywords: ["absteckung", "trasse", "vermessung", "einmessen"],
  },
  {
    id: "vermessung-bestandsaufnahme",
    group: "Fremdleistung",
    category: "Vermessung",
    name: "Bestandsaufnahme / Aufmaß",
    unit: "h",
    minPrice: 65,
    avgPrice: 95,
    maxPrice: 145,
    keywords: ["bestandsaufnahme", "aufmaß", "vermessung", "dokumentation"],
  },
  {
    id: "vermessung-asbuilt-doku",
    group: "Fremdleistung",
    category: "Dokumentation",
    name: "As-Built Dokumentation",
    unit: "St",
    minPrice: 180,
    avgPrice: 420,
    maxPrice: 950,
    keywords: ["as-built", "as built", "dokumentation", "bestandsplan"],
  },
  {
    id: "vermessung-drohnenaufnahme",
    group: "Fremdleistung",
    category: "Dokumentation",
    name: "Drohnenaufnahme Baustelle",
    unit: "St",
    minPrice: 250,
    avgPrice: 650,
    maxPrice: 1500,
    keywords: ["drohne", "drohnenaufnahme", "fotogrammetrie", "baustelle"],
  },

  // ================= TIEFBAU ERWEITERUNG: VERKEHRSSICHERUNG =================
  {
    id: "verkehrssicherung-tagesbaustelle",
    group: "Fremdleistung",
    category: "Verkehrssicherung",
    name: "Verkehrssicherung Tagesbaustelle",
    unit: "d",
    minPrice: 180,
    avgPrice: 420,
    maxPrice: 950,
    keywords: ["verkehrssicherung", "tagesbaustelle", "rsa", "absperrung"],
  },
  {
    id: "verkehrssicherung-ampelanlage",
    group: "Fremdleistung",
    category: "Verkehrssicherung",
    name: "Mobile Ampelanlage",
    unit: "d",
    minPrice: 85,
    avgPrice: 180,
    maxPrice: 420,
    keywords: ["ampel", "ampelanlage", "lichtsignalanlage", "verkehr"],
  },
  {
    id: "verkehrssicherung-halteverbot",
    group: "Fremdleistung",
    category: "Verkehrssicherung",
    name: "Halteverbot einrichten",
    unit: "St",
    minPrice: 180,
    avgPrice: 350,
    maxPrice: 750,
    keywords: ["halteverbot", "verkehrsrechtliche anordnung", "beschilderung"],
  },
  {
    id: "verkehrssicherung-genehmigung",
    group: "Fremdleistung",
    category: "Verkehrssicherung",
    name: "Verkehrsrechtliche Anordnung / Genehmigung",
    unit: "St",
    minPrice: 120,
    avgPrice: 280,
    maxPrice: 650,
    keywords: ["verkehrsrechtliche anordnung", "genehmigung", "verkehrssicherung"],
  },

  // ================= TIEFBAU ERWEITERUNG: SPEZIAL / RISIKO =================
  {
    id: "spezial-wurzelschutz",
    group: "Fremdleistung",
    category: "Spezialleistung",
    name: "Wurzelschutz / Handschachtung im Wurzelbereich",
    unit: "m",
    minPrice: 55,
    avgPrice: 110,
    maxPrice: 240,
    keywords: ["wurzelschutz", "baum", "wurzelbereich", "handschachtung"],
  },
  {
    id: "spezial-baumwurzel-fräsen",
    group: "Fremdleistung",
    category: "Spezialleistung",
    name: "Wurzelfräsen / Hindernis beseitigen",
    unit: "h",
    minPrice: 85,
    avgPrice: 140,
    maxPrice: 260,
    keywords: ["wurzel", "fräsen", "hindernis", "beseitigen"],
  },
  {
    id: "spezial-betonhindernis",
    group: "Maschinen",
    category: "Spezialleistung",
    name: "Betonhindernis abbrechen",
    unit: "m³",
    minPrice: 120,
    avgPrice: 220,
    maxPrice: 480,
    keywords: ["betonhindernis", "abbruch", "stemmen", "hindernis"],
  },
  {
    id: "spezial-nachtarbeit-zuschlag",
    group: "Risiko",
    category: "Zuschlag",
    name: "Zuschlag Nachtarbeit",
    unit: "%",
    minPrice: 20,
    avgPrice: 35,
    maxPrice: 60,
    keywords: ["nachtarbeit", "nacht", "zuschlag"],
  },
  {
    id: "spezial-kleinmengen-zuschlag",
    group: "Risiko",
    category: "Zuschlag",
    name: "Kleinmengenzuschlag",
    unit: "%",
    minPrice: 8,
    avgPrice: 15,
    maxPrice: 30,
    keywords: ["kleinmenge", "kleinmengen", "zuschlag", "mindermenge"],
  },

  // ================= RLC AUTO-GENERIERTE PROFI-TIEFBAU-BIBLIOTHEK =================
  {
    id: "transport-erdreich-abfuhr-bis-5km-t",
    group: "LKW / Transport",
    category: "Transport Erdreich",
    name: "Abfuhr Erdreich bis 5 km",
    unit: "t",
    minPrice: 18,
    avgPrice: 28,
    maxPrice: 42,
    keywords: [
      "abfuhr erdreich",
      "erdreich abfahren",
      "erdreich abfuhr",
      "aushub abfahren",
      "aushub abfuhr",
      "boden abfahren",
      "boden abfuhr",
      "bis 5 km",
      "kurzstrecke",
      "kipper",
      "lkw transport",
      "lade- und kippvorgang",
    ],
  },

];

RLC_PREIS_BIBLIOTHEK.push(...RLC_VERIFIED_LIST_PRICES_2026);
RLC_PREIS_BIBLIOTHEK.push(...generateRlcTiefbauPreisCatalog());

// Historical rows stay available for review, but their lack of a documented
// source is visible to every resolver/audit instead of being silently trusted.
for (const item of RLC_PREIS_BIBLIOTHEK) {
  item.priceOrigin ||= "LEGACY_UNVERIFIED";
}

function norm(value: any): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function findRlcPreisItems(input: {
  text?: string;
  unit?: string;
  group?: RlcPreisGroup;
  limit?: number;
  /** Only external list prices or calibrated company prices; never legacy/derived. */
  documentedOnly?: boolean;
}): RlcPreisItem[] {
  const text = norm(input.text);
  const unit = norm(input.unit);
  const limit = input.limit || 20;

  const scored = RLC_PREIS_BIBLIOTHEK.map((item) => {
    let score = 0;

    // Provenance decides priority: an externally documented material price
    // outranks legacy rows; a family-derived row is search coverage only.
    if (item.priceOrigin === "LIST_PRICE_VERIFIED") score += 140;
    else if (item.priceOrigin === "COMPANY_CALIBRATION") score += 120;
    else if (item.priceOrigin === "DERIVED_FAMILY") score -= 30;

    if (input.group && item.group === input.group) score += 20;
    if (unit && norm(item.unit) === unit) score += 20;

    // For auditable pricing, unit and explicit group are hard constraints.
    // A documented material price in €/t must never price an h/St/m³ resource.
    const documentedCompatible =
      (!input.documentedOnly || !unit || norm(item.unit) === unit) &&
      (!input.documentedOnly || !input.group || item.group === input.group);

    // Explicit technical dimensions are hard discriminators. Keyword overlap
    // must never allow a different DN/DA or component height to win.
    const itemText = norm(`${item.name} ${item.category} ${(item.keywords || []).join(" ")}`);
    const technicalPatterns = [
      /\b(?:dn|od|da)\s*(\d{2,4})\b/g,
      /\b(?:hoehe|hohe|höhe|h)\s*(\d{2,4})\s*(?:mm)?\b/g,
    ];
    for (const pattern of technicalPatterns) {
      const requestedSizes = Array.from(text.matchAll(new RegExp(pattern.source, "g"))).map((m) => m[1]);
      const itemSizes = Array.from(itemText.matchAll(new RegExp(pattern.source, "g"))).map((m) => m[1]);
      if (!requestedSizes.length) continue;
      if (!itemSizes.length) {
        if (input.documentedOnly) score -= 140;
        continue;
      }
      const requested = new Set(requestedSizes);
      const available = new Set(itemSizes);
      const exact = [...requested].every((size) => available.has(size));
      if (exact) score += 110;
      else score -= 220;
    }

    for (const kw of item.keywords) {
      const k = norm(kw);
      if (!k) continue;
      if (text.includes(k)) score += 18;
      else {
        const parts = k.split(" ").filter(Boolean);
        for (const p of parts) {
          if (p.length >= 4 && text.includes(p)) score += 4;
        }
      }
    }

    if (text.includes(norm(item.name))) score += 25;
    if (text.includes(norm(item.category))) score += 8;

    // Provenance never substitutes relevance. For a documented-only resource
    // lookup there must be a technical word/phrase hit beyond its provenance.
    const searchable = [item.name, item.category, ...(item.keywords || [])].map(norm).filter(Boolean);
    const relevant = searchable.some((term) => {
      if (term.length >= 4 && text.includes(term)) return true;
      return term.split(" ").some((part) => part.length >= 5 && text.includes(part));
    });

    return { item, score, relevant, documentedCompatible };
  })
    .filter((x) => !input.documentedOnly || ((x.item.priceOrigin === "LIST_PRICE_VERIFIED" || x.item.priceOrigin === "COMPANY_CALIBRATION") && x.relevant && x.documentedCompatible))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.item);
}

export function rlcPreisRangeForText(text: string, unit: string): {
  min: number;
  avg: number;
  max: number;
  matches: RlcPreisItem[];
} {
  /*
   * Exact matches have priority only when their price provenance is external
   * or company-calibrated. A family-derived catalog row must never become the
   * canonical price merely because it repeats the same text.
   */
  const ntInput = norm(text);
  const exactVerified = RLC_PREIS_BIBLIOTHEK.filter((m) =>
    (m.priceOrigin === "LIST_PRICE_VERIFIED" || m.priceOrigin === "COMPANY_CALIBRATION") &&
    norm(m.unit) === norm(unit) &&
    norm(m.name) === ntInput
  );

  if (exactVerified.length === 1) {
    const m = exactVerified[0];
    return {
      min: m.minPrice,
      avg: m.avgPrice,
      max: m.maxPrice,
      matches: [m],
    };
  }

  // A legacy or family-derived row is never a price source. If there is no
  // externally documented price or company calibration, return no range and
  // let the calling family mark the position for technical/source review.
  const matches = findRlcPreisItems({ text, unit, limit: 8, documentedOnly: true });

  if (!matches.length) {
    return { min: 0, avg: 0, max: 0, matches: [] };
  }

  const sameUnitRaw = matches.filter((m) => norm(m.unit) === norm(unit));

  // If the LV states a DN/OD/DA explicitly, never average it with another
  // size. This applies equally to pipe, fitting, cable-duct and shaft items.
  const requestedSizes = Array.from(ntInput.matchAll(/\b(?:dn|od|da)\s*(\d{2,4})\b/g)).map((m) => m[1]);
  const exactSizeMatches = requestedSizes.length
    ? sameUnitRaw.filter((m) => {
        const hay = norm(`${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);
        const sizes = new Set(Array.from(hay.matchAll(/\b(?:dn|od|da)\s*(\d{2,4})\b/g)).map((x) => x[1]));
        if (!requestedSizes.every((size) => sizes.has(size))) return false;
        // Size alone is not enough: a PE100 pressure pipe and a flexible PE
        // cable duct at the same diameter are different products.
        if (ntInput.includes("pe100") && !hay.includes("pe100")) return false;
        if (ntInput.includes("kabelschutz") && !hay.includes("kabelschutz")) return false;
        if (ntInput.includes("flexibel") && !hay.includes("flexibel")) return false;
        return true;
      })
    : [];
  const technicallyMatching = exactSizeMatches.length ? exactSizeMatches : sameUnitRaw;
  const sameUnit = technicallyMatching;

  /*
   * Entsorgungsklassen strikt trennen.
   * Ein LV-Text mit Z0/Z1.1/Z1.2/Z2, BM-* oder DK* darf nie mit anderen
   * Bodenklassen gemittelt werden. Die Preisbibliothek enthält bewusst
   * mehrere Klassen als Markt-/Regressionreferenzen.
   */
  const ntClass = norm(text);
  const disposalClass = (() => {
    if (/\bbm[- ]?f3\b/.test(ntClass)) return "bm-f3";
    if (/\bbm[- ]?f2\b/.test(ntClass)) return "bm-f2";
    if (/\bbm[- ]?f1\b/.test(ntClass)) return "bm-f1";
    if (/\bbm[- ]?f0\*?\b/.test(ntClass)) return "bm-f0";
    if (/\bbm[- ]?0\*?\b/.test(ntClass)) return "bm-0";
    if (/\bz\s*1[.,]?1\b/.test(ntClass)) return "z1.1";
    if (/\bz\s*1[.,]?2\b/.test(ntClass)) return "z1.2";
    if (/\bz\s*0\b/.test(ntClass)) return "z0";
    if (/\bz\s*2\b/.test(ntClass)) return "z2";
    if (/\bz\s*1\b/.test(ntClass)) return "z1";
    if (/\bdk\s*0\b/.test(ntClass)) return "dk0";
    if (/\bdk\s*(?:i|1)\b/.test(ntClass)) return "dki";
    if (/\bdk\s*(?:ii|2)\b/.test(ntClass)) return "dkii";
    return "";
  })();

  if (disposalClass && (ntClass.includes("entsorg") || ntClass.includes("verwert") || ntClass.includes("depon"))) {
    const allDisposal = RLC_PREIS_BIBLIOTHEK.filter(
      (m) => m.group === "Entsorgung" && norm(m.unit) === norm(unit),
    );

    const classHit = (m: RlcPreisItem) => {
      const hay = norm(`${m.id} ${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);
      switch (disposalClass) {
        case "z0": return /\bz\s*0\b/.test(hay) && !hay.includes("z1") && !hay.includes("z2");
        case "z1.1": return hay.includes("z1.1") || hay.includes("z11") || hay.includes("z 1.1");
        case "z1.2": return hay.includes("z1.2") || hay.includes("z12") || hay.includes("z 1.2");
        case "z1":
          return (hay.includes("z1.1") || hay.includes("z1.2") || /\bz\s*1\b/.test(hay)) &&
            !hay.includes("z0") && !hay.includes("z2") && !hay.includes("bm-");
        case "z2": return /\bz\s*2\b/.test(hay) && !hay.includes("z1");
        case "bm-0": return hay.includes("bm-0") && !hay.includes("bm-f");
        case "bm-f0": return hay.includes("bm-f0");
        case "bm-f1": return hay.includes("bm-f1");
        case "bm-f2": return hay.includes("bm-f2");
        case "bm-f3": return hay.includes("bm-f3");
        case "dk0": return hay.includes("dk 0") || hay.includes("dk0");
        case "dki": return (hay.includes("dk i") || hay.includes("dki") || hay.includes("dk1")) && !hay.includes("dkii");
        case "dkii": return hay.includes("dk ii") || hay.includes("dkii") || hay.includes("dk2");
        default: return false;
      }
    };

    const exactClass = allDisposal.filter(classHit);
    if (exactClass.length) {
      const generated = exactClass.filter((m) => String(m.id || "").startsWith("rlc-tiefbau-v2-"));
      const useClass = generated.length ? generated : exactClass;
      return {
        min: Math.min(...useClass.map((m) => m.minPrice)),
        avg: Math.round((useClass.reduce((sum, m) => sum + m.avgPrice, 0) / useClass.length) * 100) / 100,
        max: Math.max(...useClass.map((m) => m.maxPrice)),
        matches: useClass,
      };
    }
  }

    /*
     * Exakte Fachpriorität:
     * "Abfuhr Erdreich bis 5 km" ist Transport, auch wenn im automatisch
     * erzeugten Langtext "transport / entsorgung" steht.
     */
    const ntExact = norm(text);
    const wantsErdreichBis5Km =
      (ntExact.includes("abfuhr erdreich") ||
        ntExact.includes("erdreich abfahren") ||
        ntExact.includes("erdreich abfuhr") ||
        ntExact.includes("aushub abfahren") ||
        ntExact.includes("aushub abfuhr")) &&
      (ntExact.includes("bis 5 km") || ntExact.includes("5 km"));

    const exactTransportErdreich = wantsErdreichBis5Km
      ? RLC_PREIS_BIBLIOTHEK.filter((m) => {
          if (norm(m.unit) !== norm(unit)) return false;
          const name = norm(m.name);
          const cat = norm(m.category);
          const kw = (m.keywords || []).map((x) => norm(x)).join(" ");
          const isTransport =
            m.group === "LKW / Transport" ||
            cat.includes("transport");
          const isEarthHaul =
            name.includes("abfuhr erdreich") ||
            name.includes("aushub abfahren") ||
            kw.includes("abfuhr erdreich") ||
            kw.includes("aushub abfahren");
          return isTransport && isEarthHaul &&
            (name.includes("5 km") || kw.includes("5 km") || cat.includes("transport erdreich"));
        })
        .sort((a, b) =>
          Number(String(b.id || "").startsWith("rlc-tiefbau-v2-")) -
          Number(String(a.id || "").startsWith("rlc-tiefbau-v2-")),
        )
      : [];

    if (exactTransportErdreich.length) {
      const m = exactTransportErdreich[0];
      return {
        min: m.minPrice,
        avg: m.avgPrice,
        max: m.maxPrice,
        matches: exactTransportErdreich,
      };
    }


    /*
     * Generische Fachpriorität:
     * Wenn die Preisbibliothek einen klaren Treffer über Name/Keyword findet,
     * wird zuerst diese Fachfamilie verwendet. Dadurch werden Planie, Frostschutz,
     * Splittbett, Pflaster, Aushub, Transport usw. nicht mit falschen Gruppen vermischt.
     */

    /*
     * Exakte Schichten-Priorität:
     * Bei Frostschutz/Splitt/Sand/Schotter/Kies mit cm-Angabe darf nicht
     * mit anderen Schichten oder Oberflächen vermischt werden.
     */
    const ntLayer = norm(text);
    const cmMatch = ntLayer.match(/(\d+(?:[,.]\d+)?)\s*cm/);
    const cmKey = cmMatch ? `${cmMatch[1].replace(",", ".")} cm` : "";

    function layerFamilyHit(m: RlcPreisItem, family: string) {
      const hay = norm(`${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);
      return hay.includes(family);
    }

    const layerFamily =
      ntLayer.includes("frostschutz") ? "frostschutz" :
      ntLayer.includes("splitt") ? "splitt" :
      ntLayer.includes("sand") ? "sand" :
      ntLayer.includes("schotter") ? "schotter" :
      ntLayer.includes("kies") ? "kies" :
      "";

    const exactLayerByMaterialAndCm =
      layerFamily && cmKey
        ? sameUnit.filter((m) => {
            const hay = norm(`${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);
            return (
              m.group === "Material" &&
              layerFamilyHit(m, layerFamily) &&
              hay.includes(cmKey)
            );
          })
        : [];

    if (exactLayerByMaterialAndCm.length) {
      const useLayer = exactLayerByMaterialAndCm;
      return {
        min: Math.min(...useLayer.map((m) => m.minPrice)),
        avg: useLayer.reduce((sum, m) => sum + m.avgPrice, 0) / useLayer.length,
        max: Math.max(...useLayer.map((m) => m.maxPrice)),
        matches: useLayer,
      };
    }

    /*
     * Exakte Tiefbau-Leistungspriorität:
     * Aushub/Auskofferung, Asphalt fräsen/aufbrechen und Pflaster herstellen
     * dürfen nicht mit Transport, Material oder Wiederherstellung vermischt werden.
     */
    const ntWork = norm(text);

    const exactCivilWorkMatches = (() => {
      const hasAushub =
        ntWork.includes("aushub") ||
        ntWork.includes("baugrube") ||
        ntWork.includes("auskofferung");

      const hasAsphaltBreaking =
        ntWork.includes("asphalt") &&
        (ntWork.includes("fräsen") ||
          ntWork.includes("fraesen") ||
          ntWork.includes("frasen") ||
          ntWork.includes("aufbruch") ||
          ntWork.includes("aufbrechen")) &&
        !ntWork.includes("wiederherstellen") &&
        !ntWork.includes("wiederherstellung") &&
        !ntWork.includes("schließen") &&
        !ntWork.includes("schliessen");

      const hasPflasterHerstellen =
        ntWork.includes("pflaster") &&
        (ntWork.includes("herstellen") ||
          ntWork.includes("verlegen") ||
          ntWork.includes("wiederherstellen")) &&
        !ntWork.includes("material");

      if (hasAushub) {
        return sameUnit.filter((m) => {
          const hay = norm(`${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);
          return (
            m.group === "Maschinen" &&
            hay.includes("erdarbeiten") &&
            (hay.includes("aushub") ||
              hay.includes("baugrube") ||
              hay.includes("auskofferung") ||
              hay.includes("graben"))
          );
        });
      }

      if (hasAsphaltBreaking) {
        return sameUnit.filter((m) => {
          const hay = norm(`${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);
          return (
            m.group === "Maschinen" &&
            hay.includes("asphalt") &&
            (hay.includes("fräsen") ||
              hay.includes("fraesen") ||
              hay.includes("frasen") ||
              hay.includes("aufbruch") ||
              hay.includes("aufbrechen") ||
              hay.includes("aufnehmen"))
          );
        });
      }

      if (hasPflasterHerstellen) {
        const wantsNewComplete =
          !ntWork.includes("wiederherstellen") &&
          !ntWork.includes("wiederherstellung");

        const complete = sameUnit.filter((m) => {
          const hay = norm(`${m.name} ${m.category} ${(m.keywords || []).join(" ")}`);

          if (wantsNewComplete) {
            return (
              m.group !== "Material" &&
              hay.includes("pflaster") &&
              (hay.includes("komplett") ||
                hay.includes("neu herstellen") ||
                hay.includes("verlegen"))
            );
          }

          return (
            m.group !== "Material" &&
            hay.includes("pflaster") &&
            (hay.includes("wiederherstellen") ||
              hay.includes("herstellen") ||
              hay.includes("verlegen") ||
              hay.includes("komplett"))
          );
        });

        if (complete.length) return complete;

        return [
          {
            id: "rlc-fallback-pflaster-komplett-m2",
            group: "Fremdleistung",
            category: "Oberfläche / Pflaster",
            name: "Pflasterfläche komplett herstellen",
            unit,
            minPrice: 45,
            avgPrice: 75,
            maxPrice: 120,
            keywords: ["pflaster herstellen", "pflaster verlegen", "pflasterfläche herstellen"],
          } as RlcPreisItem,
        ];
      }

      return [];
    })();

    if (exactCivilWorkMatches.length) {
      const useWork = exactCivilWorkMatches;
      return {
        min: Math.min(...useWork.map((m) => m.minPrice)),
        avg: useWork.reduce((sum, m) => sum + m.avgPrice, 0) / useWork.length,
        max: Math.max(...useWork.map((m) => m.maxPrice)),
        matches: useWork,
      };
    }
    const topMatch = sameUnit[0] || matches[0];

    const exactRlcFamilyMatches = topMatch
      ? sameUnit.filter((m) => {
          const ntExact = norm(text);
          const topCat = norm(topMatch.category);
          const topGroup = topMatch.group;

          const name = norm(m.name);
          const cat = norm(m.category);
          const kwList = (m.keywords || []).map((x) => norm(x)).filter(Boolean);

          const exactNameHit = name.length >= 8 && ntExact.includes(name);
          const exactKeywordHits = kwList.filter((k) => k.length >= 6 && ntExact.includes(k)).length;

          return (
            m.group === topGroup &&
            (
              exactNameHit ||
              exactKeywordHits >= 1 ||
              (topCat && cat === topCat && exactKeywordHits >= 1)
            )
          );
        })
      : [];

    if (exactRlcFamilyMatches.length === 1) {
      const m = exactRlcFamilyMatches[0];
      return {
        min: m.minPrice,
        avg: m.avgPrice,
        max: m.maxPrice,
        matches: exactRlcFamilyMatches,
      };
    }
  /*
   * Präzisionsfilter:
   * Reine Transportpositionen wie "Abfuhr Erdreich bis 5 km" dürfen nicht
   * mit Entsorgung/Deponie-Positionen vermischt werden, wenn der LV-Text
   * keine Entsorgung/Deponie ausdrücklich nennt.
   */
  const nt = norm(text);
  const isPureTransport =
    (nt.includes("abfuhr") || nt.includes("abfahren") || nt.includes("transport")) &&
    !nt.includes("entsorgung") &&
    !nt.includes("deponie") &&
    !nt.includes("verwertung");

  const transportOnly = sameUnit.filter((m) => m.group === "LKW / Transport");

  const use =
    isPureTransport && transportOnly.length
      ? transportOnly
      : sameUnit.length
        ? sameUnit
        : matches;

  const min = Math.min(...use.map((m) => m.minPrice));
  const max = Math.max(...use.map((m) => m.maxPrice));
  const avg =
    use.reduce((sum, m) => sum + m.avgPrice, 0) / Math.max(1, use.length);

  return {
    min: Math.round(min * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    max: Math.round(max * 100) / 100,
    matches: use,
  };
}
