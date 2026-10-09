import { TIEFBAU_COVERAGE_CASES } from "./autonomous/tiefbauCoverageCases";
import type { RlcPreisGroup, RlcPreisItem } from "./rlcPreisBibliothek";
import { calculateTiefbauFamilyCatalog } from "./autonomous/tiefbauFamilyCatalog";
import {
  BETONROHR_STANDARD_DN_MM,
  BETONSCHACHT_STANDARD_DN_MM,
  FERNWAERME_STANDARD_DN_MM,
  GAS_PE_STANDARD_OD_MM,
  GGG_STANDARD_DN_MM,
  GRABENLOS_STANDARD_DN_MM,
  KABELROHR_STANDARD_DN_MM,
  KG_STANDARD_DN_MM,
  PE_STANDARD_OD_MM,
  STEINZEUG_STANDARD_DN_MM,
  WATER_ARMATURE_STANDARD_DN_MM,
} from "./autonomous/tiefbauResourcePrices";
import type {
  RlcAutonomousCalcInput,
  RlcAutonomousProjectContext,
  RlcAutonomousCostLine,
} from "./autonomous/types";

type Seed = {
  id: string;
  category: string;
  kurztext: string;
  langtext?: string;
  unit: string;
  keywords: string[];
};

const NEUTRAL_CONTEXT: RlcAutonomousProjectContext = {
  projectType: "Tiefbau",
  trade: "Tiefbau",
  difficulty: "medium",
  logisticsRisk: "medium",
  trafficRisk: "medium",
  durationRisk: "medium",
  marketFactor: 1,
  distanceFactor: 1,
  confidence: 0.9,
  warnings: [],
};

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function slug(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapDominantGroup(lines: RlcAutonomousCostLine[]): RlcPreisGroup {
  const sums = new Map<string, number>();
  for (const line of lines) {
    const group = String(line.group || "");
    if (["Gemeinkosten", "Risiko", "Gewinn"].includes(group)) continue;
    sums.set(group, (sums.get(group) || 0) + Number(line.total || 0));
  }
  const dominant = [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Nachunternehmer";
  if (dominant === "Lohn") return "Personal";
  if (dominant === "Maschinen") return "Maschinen";
  if (dominant === "Material") return "Material";
  if (dominant === "Entsorgung") return "Entsorgung";
  return "Fremdleistung";
}

const SEEDS: Seed[] = [
  { id: "grabenaushub", category: "Erdbau", kurztext: "Grabenaushub Bodenklasse 3-5", unit: "m³", keywords: ["grabenaushub", "rohrgrabenaushub", "kabelgrabenaushub", "aushub"] },
  { id: "bodenverbesserung", category: "Erdbau", kurztext: "Bodenverbesserung mit Kalk/Zement", unit: "m²", keywords: ["bodenverbesserung", "bodenstabilisierung", "kalk", "zement"] },
  { id: "bodenaustausch", category: "Erdbau", kurztext: "Bodenaustausch nicht tragfähiger Untergrund", unit: "m³", keywords: ["bodenaustausch", "nicht tragfaehiger untergrund"] },
  { id: "geogitter", category: "Erdbau", kurztext: "Geogitter zur Bodenstabilisierung", unit: "m²", keywords: ["geogitter", "bewehrungsgitter", "bodenstabilisierung"] },
  { id: "frostschutz", category: "Straßenbau", kurztext: "Frostschutzkies 0/32 liefern und einbauen", unit: "m³", keywords: ["frostschutzkies", "frostschutzmaterial", "0/32"] },
  { id: "rc-frostschutz", category: "Straßenbau / RC", kurztext: "RC-Frostschutz RC-1 0/32 liefern und einbauen", unit: "t", keywords: ["rc-frostschutz", "rc 1", "recyclingbaustoff"] },
  { id: "rc-tragschicht", category: "Straßenbau / RC", kurztext: "RC-Tragschicht RC-1 0/32 liefern und einbauen", unit: "t", keywords: ["rc-tragschicht", "rc 1", "recyclingbaustoff"] },
  { id: "grabenverbau", category: "Verbau", kurztext: "Grabenverbau Verbaubox herstellen und vorhalten", unit: "m²", keywords: ["grabenverbau", "verbaubox", "rohrgrabenverbau"] },
  { id: "spundwand", category: "Spezialtiefbau", kurztext: "Spundwand Baugrube bis 8 m herstellen", unit: "m²", keywords: ["spundwand", "spundbohle"] },
  { id: "bohrpfahlwand", category: "Spezialtiefbau", kurztext: "Tangierende Bohrpfahlwand herstellen", unit: "m²", keywords: ["bohrpfahlwand", "tangierende bohrpfahlwand"] },

  ...KG_STANDARD_DN_MM.map((dn) => ({
    id: `kg-pvc-dn${dn}`,
    category: "Kanalbau / KG-PVC",
    kurztext: `KG-PVC DN${dn} SN8`,
    langtext: `Kanalleitung KG-PVC DN${dn} SN8 inklusive Sandbettung`,
    unit: "m",
    keywords: ["kg-pvc", `dn${dn}`, "sn8", "kanalrohr pvc"],
  })),
  ...KG_STANDARD_DN_MM.map((dn) => ({
    id: `kg-pp-dn${dn}`,
    category: "Kanalbau / KG-PP",
    kurztext: `KG-PP DN${dn} SN16`,
    langtext: `Kanalleitung KG-PP DN${dn} SN16 inklusive Sandbettung`,
    unit: "m",
    keywords: ["kg-pp", `dn${dn}`, "sn16", "kanalrohr pp"],
  })),
  ...STEINZEUG_STANDARD_DN_MM.map((dn) => ({
    id: `steinzeug-dn${dn}`,
    category: "Kanalbau / Steinzeug",
    kurztext: `Steinzeugrohr DN${dn} liefern und verlegen`,
    unit: "m",
    keywords: ["steinzeugrohr", "steinzeug", `dn${dn}`],
  })),
  ...BETONROHR_STANDARD_DN_MM.map((dn) => ({
    id: `stahlbetonrohr-dn${dn}`,
    category: "Kanalbau / Stahlbetonrohr",
    kurztext: `Stahlbetonrohr DN${dn} liefern und verlegen`,
    unit: "m",
    keywords: ["stahlbetonrohr", "betonrohr", `dn${dn}`],
  })),
  ...BETONSCHACHT_STANDARD_DN_MM.map((dn) => ({
    id: `betonschacht-dn${dn}`,
    category: "Kanalbau / Betonschacht",
    kurztext: `Betonschacht DN${dn} liefern und setzen`,
    unit: "St",
    keywords: ["betonschacht", "kontrollschacht", "revisionsschacht", `dn${dn}`],
  })),

  { id: "kanalreinigung", category: "Kanalservice", kurztext: "Kanalreinigung Hochdruckspülgerät", unit: "m", keywords: ["kanalreinigung", "hochdruckspuelung", "hochdruckspülung"] },
  { id: "kanal-tv", category: "Kanalservice", kurztext: "Kanalprüfung TV-Inspektion Kamerabefahrung", unit: "m", keywords: ["kanal-tv", "tv-inspektion", "kamerabefahrung", "kanalpruefung"] },
  { id: "strassenablauf-d400", category: "Straßenentwässerung", kurztext: "Straßenablauf D400 500x500 DN160", unit: "St", keywords: ["strassenablauf", "straßenablauf", "d400", "500x500", "dn160"] },
  { id: "aufsatz-d400", category: "Straßenentwässerung", kurztext: "Aufsatz Straßenablauf D400 500x500", unit: "St", keywords: ["aufsatz strassenablauf", "aufsatz straßenablauf", "d400", "500x500"] },
  { id: "rigole-m3", category: "Regenwasser", kurztext: "Versickerungsrigole Kunststoffblöcke herstellen", unit: "m³", keywords: ["rigole", "versickerungsrigole", "regenwasser"] },
  { id: "rigolenstrang", category: "Regenwasser", kurztext: "Rigolenstrang DN300 herstellen", unit: "m", keywords: ["rigolenstrang", "rigole", "dn300"] },
  { id: "wirbeldrossel", category: "Regenwasser", kurztext: "Drosselschacht mit Wirbeldrossel", unit: "St", keywords: ["drosselschacht", "wirbeldrossel", "regenwasser"] },

  ...PE_STANDARD_OD_MM.map((od) => ({
    id: `pe-da${od}-sdr11`,
    category: "Wasserleitung PE",
    kurztext: `PE-HD Trinkwasserleitung DA${od} SDR11 PN16`,
    unit: "m",
    keywords: ["pe-hd", `da${od}`, `dn${od}`, "sdr11", "pn16", "trinkwasserleitung", `wl dn${od}`],
  })),
  ...[40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315].map((od) => ({
    id: `pe-da${od}-pn25`,
    category: "Wasserleitung PE Hochdruck",
    kurztext: `PE-HD Trinkwasserleitung DA${od} SDR7,4 PN25`,
    unit: "m",
    keywords: ["pe-hd", `da${od}`, `dn${od}`, "sdr7,4", "pn25", "trinkwasserleitung"],
  })),
  ...GGG_STANDARD_DN_MM.map((dn) => ({
    id: `ggg-dn${dn}`,
    category: "Wasserleitung GGG",
    kurztext: `Duktiles Gussrohr GGG DN${dn} PN16`,
    unit: "m",
    keywords: ["ggg", "gussrohr", `dn${dn}`, "pn16", "wasserleitung"],
  })),
  ...WATER_ARMATURE_STANDARD_DN_MM.map((dn) => ({
    id: `absperrschieber-dn${dn}-pn16`,
    category: "Wasserleitung Armaturen",
    kurztext: `Absperrschieber DN${dn} PN16`,
    unit: "St",
    keywords: ["absperrschieber", "flanschenschieber", `dn${dn}`, "pn16", "wasserleitung"],
  })),
  ...[40, 50, 65, 80, 100, 125, 150, 200].map((dn) => ({
    id: `absperrschieber-dn${dn}-pn25`,
    category: "Wasserleitung Armaturen Hochdruck",
    kurztext: `Absperrschieber DN${dn} PN25`,
    unit: "St",
    keywords: ["absperrschieber", `dn${dn}`, "pn25", "wasserleitung"],
  })),
  { id: "unterflurhydrant-dn80", category: "Wasserleitung Armaturen", kurztext: "Unterflurhydrant DN80 PN16", langtext: "Freistrom-Unterflurhydrant DN80 PN16 inkl. Sickerpackung", unit: "St", keywords: ["unterflurhydrant", "dn80", "pn16"] },

  ...KABELROHR_STANDARD_DN_MM.map((dn) => ({
    id: `kabelleerrohr-dn${dn}`,
    category: "Kabelbau / Leerrohr",
    kurztext: `Kabelleerrohr DN${dn} verlegen`,
    unit: "m",
    keywords: ["kabelleerrohr", "kabelschutzrohr", `dn${dn}`],
  })),
  { id: "speedpipe-7x14", category: "Telekom", kurztext: "Mikrokabelleerrohrverbund 7 x 14/2 verlegen", unit: "m", keywords: ["speedpipe", "mikrokabelleerrohrverbund", "7x14", "7 x 14"] },
  { id: "lwl-einblasen", category: "Telekom", kurztext: "LWL Microkabel 12 Fasern einblasen", unit: "m", keywords: ["lwl", "microkabel", "12 fasern", "einblasen"] },

  ...GRABENLOS_STANDARD_DN_MM.map((dn) => ({
    id: `hdd-dn${dn}`,
    category: "Spezialtiefbau / HDD",
    kurztext: `Horizontalspülbohrung HDD DN${dn}`,
    unit: "m",
    keywords: ["hdd", "horizontalspuelbohrung", "horizontalspülbohrung", `dn${dn}`, `da${dn}`],
  })),
  ...[200, 300, 400, 500, 600, 800, 1000].map((dn) => ({
    id: `rohrvortrieb-dn${dn}`,
    category: "Spezialtiefbau / Rohrvortrieb",
    kurztext: `Rohrvortrieb DN${dn} Pressbohrung`,
    unit: "m",
    keywords: ["rohrvortrieb", "pressbohrung", "pressung", `dn${dn}`],
  })),
  { id: "erdrakete", category: "Spezialtiefbau", kurztext: "Erdrakete Bodenverdrängung DA90", unit: "m", keywords: ["erdrakete", "bodenverdraengung", "bodenverdrängung"] },

  { id: "wellpoint", category: "Wasserhaltung", kurztext: "Wellpoint Vakuum-Wasserhaltung", unit: "d", keywords: ["wellpoint", "vakuumwasserhaltung", "grundwasserabsenkung"] },
  { id: "absenkbrunnen", category: "Wasserhaltung", kurztext: "Absenkbrunnen herstellen", unit: "St", keywords: ["absenkbrunnen", "grundwasserabsenkung"] },
  { id: "vakuumlanze", category: "Wasserhaltung", kurztext: "Vakuumlanze Grundwasserabsenkung", unit: "St", keywords: ["vakuumlanze", "saugbohrung"] },

  { id: "regenrueckhaltebecken-erd", category: "Regenwasser / Rückhaltung", kurztext: "Regenrückhaltebecken Erdbecken herstellen", unit: "m³", keywords: ["regenrückhaltebecken", "regenrueckhaltebecken", "rückhaltebecken", "erdbecken"] },
  { id: "regenrueckhaltebecken-beton", category: "Regenwasser / Rückhaltung", kurztext: "Regenrückhaltebecken Stahlbeton herstellen", unit: "m³", keywords: ["regenrückhaltebecken", "regenrueckhaltebecken", "betonbecken", "stahlbeton"] },
  { id: "betonpflaster-10", category: "Straßenbau / Pflaster", kurztext: "Betonpflaster 10 cm herstellen", unit: "m²", keywords: ["betonpflaster", "pflasterstein", "10 cm"] },
  { id: "natursteinpflaster", category: "Straßenbau / Pflaster", kurztext: "Natursteinpflaster herstellen", unit: "m²", keywords: ["natursteinpflaster", "granitpflaster"] },
  { id: "hochbord", category: "Straßenbau / Bord", kurztext: "Hochbordstein setzen", unit: "m", keywords: ["hochbord", "bordstein"] },
  { id: "tiefbord", category: "Straßenbau / Bord", kurztext: "Tiefbordstein setzen", unit: "m", keywords: ["tiefbord", "bordstein"] },
  { id: "rundbord", category: "Straßenbau / Bord", kurztext: "Rundbordstein setzen", unit: "m", keywords: ["rundbord", "bordstein"] },
  { id: "entsorgung-dk0", category: "Entsorgung / Deponie", kurztext: "Bodenaushub DK 0 entsorgen", unit: "t", keywords: ["dk 0", "dk0", "deponieklasse 0", "bodenaushub"] },
  { id: "entsorgung-dki", category: "Entsorgung / Deponie", kurztext: "Bodenaushub DK I entsorgen", unit: "t", keywords: ["dk i", "dk1", "deponieklasse i", "bodenaushub"] },
  { id: "entsorgung-dkii", category: "Entsorgung / Deponie", kurztext: "Bodenaushub DK II entsorgen", unit: "t", keywords: ["dk ii", "dk2", "deponieklasse ii", "bodenaushub"] },
  { id: "bestandsvermessung", category: "Vermessung / As-Built", kurztext: "Bestandsvermessung Leitungen As-Built", unit: "h", keywords: ["bestandsvermessung", "as-built", "leitungsdokumentation"] },

  { id: "asphalt-ac11", category: "Straßenbau Asphalt", kurztext: "Asphaltdeckschicht AC 11 D S 4 cm", unit: "m²", keywords: ["ac 11 d", "ac11", "asphaltdeckschicht", "4 cm"] },
  { id: "leitplanke", category: "Straßenbau", kurztext: "Stahlschutzplanke Leitplanke setzen", unit: "m", keywords: ["leitplanke", "stahlschutzplanke", "schutzplanke"] },
  { id: "markierung-12cm", category: "Straßenbau", kurztext: "Fahrbahnmarkierung 12 cm herstellen", unit: "m", keywords: ["fahrbahnmarkierung", "12 cm", "laengsmarkierung", "längsmarkierung"] },

  { id: "stuetzwand", category: "Ingenieurbau", kurztext: "Stahlbeton Stützwand bis 1,5 m herstellen", unit: "m²", keywords: ["stuetzwand", "stützwand", "stahlbeton"] },
  { id: "gabionenwand", category: "Ingenieurbau", kurztext: "Gabionenwand herstellen", unit: "m²", keywords: ["gabione", "gabionenwand", "gabionenmauer"] },
  { id: "wurzelstock-31-50", category: "Landschaftsbau / Rodung", kurztext: "Wurzelstock roden 31-50 cm", unit: "St", keywords: ["wurzelstock", "31-50", "roden"] },

  ...GAS_PE_STANDARD_OD_MM.map((od) => ({
    id: `gas-pe-da${od}`,
    category: "Gas / PE-Leitung",
    kurztext: `PE-Gasleitung DA${od} SDR11 verlegen`,
    unit: "m",
    keywords: ["gasleitung", "pe-gas", `da${od}`, `dn${od}`, "sdr11"],
  })),
  ...FERNWAERME_STANDARD_DN_MM.map((dn) => ({
    id: `fernwaerme-dn${dn}`,
    category: "Fernwärme / KMR",
    kurztext: `Fernwärmerohr KMR DN${dn} liefern verlegen`,
    unit: "m",
    keywords: ["fernwärme", "fernwaerme", "kmr", `dn${dn}`],
  })),

  { id: "querung-kabel", category: "Querungen / Bestand", kurztext: "Querung Bestandskabel senkrecht", unit: "St", keywords: ["querung", "bestandskabel", "kreuzung kabel"] },
  { id: "querung-gas-dn100", category: "Querungen / Bestand", kurztext: "Querung Gasleitung DN100", unit: "St", keywords: ["querung", "gasleitung", "dn100"] },
  { id: "querung-wasser-dn150", category: "Querungen / Bestand", kurztext: "Querung Wasserleitung DN150", unit: "St", keywords: ["querung", "wasserleitung", "dn150"] },
  { id: "querung-kanal-dn300", category: "Querungen / Bestand", kurztext: "Querung Kanal DN300", unit: "St", keywords: ["querung", "kanal", "dn300"] },
  { id: "laengsquerung-kabel", category: "Querungen / Längsquerung", kurztext: "Längsquerung Kabel bis 5 m", unit: "m", keywords: ["längsquerung", "laengsquerung", "kabel"] },
  { id: "laengsquerung-rohr-10m", category: "Querungen / Längsquerung", kurztext: "Längsquerung Rohr DN300 über 10 m", unit: "m", keywords: ["längsquerung", "laengsquerung", "dn300", "über 10 m"] },
  { id: "querung-bach-offen", category: "Querungen / Gewässer", kurztext: "Querung Bachlauf offene Bauweise", unit: "St", keywords: ["querung", "bach", "gewässer", "offene bauweise"] },
  { id: "querung-strasse-offen", category: "Querungen / Straße", kurztext: "Querung Straße in offener Bauweise", unit: "St", keywords: ["querung", "straße", "strasse", "offene bauweise"] },
  { id: "querung-hdd-dn160", category: "Querungen / Grabenlos", kurztext: "Querung Straße grabenlos HDD DN160", unit: "m", keywords: ["querung", "hdd", "grabenlos", "dn160"] },

  ...[20, 30, 40, 50, 60, 80].map((cm) => ({
    id: `auskofferung-${cm}-seitlich`,
    category: "Erdbau / Auskofferung",
    kurztext: `Auskofferung ${cm} cm Material seitlich lagern`,
    unit: "m²",
    keywords: ["auskofferung", `${cm} cm`, "seitlich lagern"],
  })),
  { id: "auskofferung-50-abfahren", category: "Erdbau / Auskofferung", kurztext: "Auskofferung 50 cm Material abfahren", unit: "m²", keywords: ["auskofferung", "50 cm", "abfahren"] },
  { id: "auskofferung-60-dk0", category: "Erdbau / Auskofferung", kurztext: "Auskofferung 60 cm Material abfahren Deponie DK0", unit: "m²", keywords: ["auskofferung", "60 cm", "dk0", "deponie"] },
  { id: "auskofferung-80-dki", category: "Erdbau / Auskofferung", kurztext: "Auskofferung 80 cm Material abfahren Deponie DKI", unit: "m²", keywords: ["auskofferung", "80 cm", "dki", "deponie"] },
  { id: "auskofferung-hand-30", category: "Erdbau / Auskofferung", kurztext: "Auskofferung Handschachtung 30 cm", unit: "m²", keywords: ["auskofferung", "handschachtung", "30 cm"] },
  { id: "auskofferung-saugbagger-50", category: "Erdbau / Auskofferung", kurztext: "Auskofferung mit Saugbagger 50 cm", unit: "m²", keywords: ["auskofferung", "saugbagger", "50 cm"] },
  { id: "auskofferung-fels-40", category: "Erdbau / Auskofferung", kurztext: "Auskofferung Fels 40 cm", unit: "m²", keywords: ["auskofferung", "fels", "40 cm"] },

  { id: "boden-seitlich-lagern", category: "Erdbau / Materialverbleib", kurztext: "Aushub seitlich lagern", unit: "m³", keywords: ["aushub", "seitlich lagern", "miete"] },
  { id: "boden-wiederverwenden", category: "Erdbau / Materialverbleib", kurztext: "Aushub wiederverwenden und einbauen", unit: "m³", keywords: ["aushub", "wiederverwenden", "wiedereinbauen"] },
  { id: "boden-abfahren", category: "Erdbau / Materialverbleib", kurztext: "Aushub abfahren und verwerten", unit: "m³", keywords: ["aushub", "abfahren", "verwerten"] },
  { id: "boden-z0", category: "Entsorgung / Bodenverwertung", kurztext: "Boden Z0 verwerten", unit: "t", keywords: ["boden", "z0", "verwerten"] },
  { id: "boden-z11", category: "Entsorgung / Bodenverwertung", kurztext: "Boden Z1.1 verwerten", unit: "t", keywords: ["boden", "z1.1", "verwerten"] },
  { id: "boden-z12", category: "Entsorgung / Bodenverwertung", kurztext: "Boden Z1.2 verwerten", unit: "t", keywords: ["boden", "z1.2", "verwerten"] },
  { id: "boden-z2", category: "Entsorgung / Bodenverwertung", kurztext: "Boden Z2 verwerten", unit: "t", keywords: ["boden", "z2", "verwerten"] },

  ...["0/32", "0/45", "0/56"].flatMap((grain) =>
    [20, 30, 40, 50].map((cm) => ({
      id: `frostschutz-${grain.replace("/", "-")}-${cm}`,
      category: "Straßenbau / Frostschutz",
      kurztext: `Frostschutz ${grain} ${cm} cm einbauen`,
      unit: "m²",
      keywords: ["frostschutz", grain, `${cm} cm`],
    }))
  ),
  ...["0/32", "0/45"].flatMap((grain) =>
    [30, 40].map((cm) => ({
      id: `rc-frostschutz-${grain.replace("/", "-")}-${cm}`,
      category: "Straßenbau / RC-Frostschutz",
      kurztext: `RC Frostschutz ${grain} ${cm} cm einbauen`,
      unit: "m²",
      keywords: ["rc frostschutz", "recycling", grain, `${cm} cm`],
    }))
  ),

  ...["8/16", "16/32", "32/63"].map((grain) => ({
    id: `riesel-${grain.replace("/", "-")}`,
    category: "Baustoffe / Riesel",
    kurztext: `Riesel ${grain} liefern`,
    unit: "t",
    keywords: ["riesel", grain],
  })),
  { id: "filterkies-16-32", category: "Baustoffe / Filterkies", kurztext: "Filterkies 16/32 liefern", unit: "t", keywords: ["filterkies", "16/32"] },
  { id: "drainagekies-8-16", category: "Baustoffe / Filterkies", kurztext: "Drainagekies 8/16 liefern", unit: "t", keywords: ["drainagekies", "8/16"] },
  { id: "riesel-16-32-20cm", category: "Baustoffe / Riesel", kurztext: "Riesel 16/32 20 cm einbauen", unit: "m²", keywords: ["riesel", "16/32", "20 cm", "einbauen"] },

  { id: "bewehrte-erde-60", category: "Spezialtiefbau / Bewehrte Erde", kurztext: "Bewehrte Erde Geogitter 60 Grad", unit: "m²", keywords: ["bewehrte erde", "geogitter", "60 grad"] },
  { id: "bewehrte-erde-70", category: "Spezialtiefbau / Bewehrte Erde", kurztext: "Bewehrte Erde Böschung 70 Grad", unit: "m²", keywords: ["bewehrte erde", "70 grad"] },
  { id: "bewehrte-erde-80", category: "Spezialtiefbau / Bewehrte Erde", kurztext: "Bewehrte Erde Geogitter 80 Grad", unit: "m²", keywords: ["bewehrte erde", "geogitter", "80 grad"] },
  { id: "spritzbeton-8", category: "Spezialtiefbau / Spritzbeton", kurztext: "Spritzbeton Böschungssicherung 8 cm", unit: "m²", keywords: ["spritzbeton", "8 cm", "böschung"] },
  { id: "spritzbetonwanne-10", category: "Spezialtiefbau / Spritzbeton", kurztext: "Spritzbetonwanne 10 cm bewehrt herstellen", unit: "m²", keywords: ["spritzbetonwanne", "10 cm", "bewehrt"] },
  { id: "spritzbetonwanne-15", category: "Spezialtiefbau / Spritzbeton", kurztext: "Spritzbetonwanne 15 cm bewehrt herstellen", unit: "m²", keywords: ["spritzbetonwanne", "15 cm", "bewehrt"] },
  { id: "nagelwand-spritzbeton", category: "Spezialtiefbau / Nagelwand", kurztext: "Nagelwand mit Spritzbeton herstellen", unit: "m²", keywords: ["nagelwand", "spritzbeton"] },

  { id: "asphalt-ac32ts-8", category: "Straßenbau / Asphalttragschicht", kurztext: "Asphalttragschicht AC 32 TS 8 cm", unit: "m²", keywords: ["asphalttragschicht", "ac 32 ts", "8 cm"] },
  { id: "asphalt-ac32ts-10", category: "Straßenbau / Asphalttragschicht", kurztext: "Asphalttragschicht AC 32 TS 10 cm", unit: "m²", keywords: ["asphalttragschicht", "ac 32 ts", "10 cm"] },
  { id: "asphalt-ac16bs-4", category: "Straßenbau / Asphaltbinder", kurztext: "Asphaltbinderschicht AC 16 BS 4 cm", unit: "m²", keywords: ["asphaltbinderschicht", "ac 16 bs", "4 cm"] },
  { id: "asphalt-ac16bs-6", category: "Straßenbau / Asphaltbinder", kurztext: "Asphaltbinderschicht AC 16 BS 6 cm", unit: "m²", keywords: ["asphaltbinderschicht", "ac 16 bs", "6 cm"] },
  { id: "asphalt-sma8-3", category: "Straßenbau / SMA", kurztext: "SMA 8 S 3 cm", unit: "m²", keywords: ["sma 8 s", "3 cm"] },
  { id: "asphalt-sma11-4", category: "Straßenbau / SMA", kurztext: "SMA 11 S 4 cm", unit: "m²", keywords: ["sma 11 s", "4 cm"] },
  { id: "asphalt-ma11-35", category: "Straßenbau / Gussasphalt", kurztext: "Gussasphalt MA 11 S 3,5 cm", unit: "m²", keywords: ["gussasphalt", "ma 11 s", "3,5 cm"] },
  { id: "asphalt-ac16td-6", category: "Straßenbau / Tragdeckschicht", kurztext: "Asphalt Tragdeckschicht AC 16 TD 6 cm", unit: "m²", keywords: ["tragdeckschicht", "ac 16 td", "6 cm"] },
  { id: "asphaltbinder-hand", category: "Straßenbau / Asphaltbinder Handarbeit", kurztext: "Asphaltbinder in Handarbeit Kleinfläche", unit: "m²", keywords: ["asphaltbinder", "handarbeit", "kleinfläche"] },
  { id: "planum-ev2-45", category: "Erdbau / Planum", kurztext: "Planum EV2 45 MN/m2 herstellen", unit: "m²", keywords: ["planum", "ev2", "45 mn/m2"] },
  { id: "planum-ev2-120", category: "Erdbau / Planum", kurztext: "Planum EV2 120 MN/m2 herstellen", unit: "m²", keywords: ["planum", "ev2", "120 mn/m2"] },

];


const BREADTH_SEEDS: Seed[] = [
  { id: "boeschung-profil", category: "Erdbau / Böschung", kurztext: "Böschung 1:1,5 profilieren", unit: "m²", keywords: ["böschung", "boeschung", "profilieren", "1:1,5"] },
  { id: "dammschuettung", category: "Erdbau / Dammbau", kurztext: "Dammschüttung Mineralboden lagenweise verdichten", unit: "m³", keywords: ["damm", "dammschüttung", "verdichten"] },
  { id: "arbeitsraum-verfuellen", category: "Erdbau / Arbeitsraum", kurztext: "Arbeitsraum verfüllen und verdichten", unit: "m³", keywords: ["arbeitsraum", "verfüllen", "verdichten"] },
  { id: "leitungsgraben-125-080", category: "Erdbau / Leitungsgraben", kurztext: "Leitungsgraben Tiefe 1,25 m Breite 0,80 m herstellen", unit: "m", keywords: ["leitungsgraben", "1,25 m", "0,80 m"] },
  { id: "leitungsgraben-200-100", category: "Erdbau / Leitungsgraben", kurztext: "Leitungsgraben Tiefe 2,00 m Breite 1,00 m herstellen", unit: "m", keywords: ["leitungsgraben", "2,00 m", "1,00 m"] },
  { id: "baugrube-3m", category: "Erdbau / Baugrube", kurztext: "Baugrube Tiefe 3,00 m herstellen", unit: "m³", keywords: ["baugrube", "3,00 m", "aushub"] },
  { id: "bodenklasse-3", category: "Erdbau / Bodenlösen", kurztext: "Bodenklasse 3 lösen laden", unit: "m³", keywords: ["bodenklasse 3", "lösen", "laden"] },
  { id: "bodenklasse-5", category: "Erdbau / Bodenlösen", kurztext: "Bodenklasse 5 lösen laden", unit: "m³", keywords: ["bodenklasse 5", "lösen", "laden"] },
  { id: "bodenklasse-6", category: "Erdbau / Bodenlösen", kurztext: "Bodenklasse 6 lösen laden", unit: "m³", keywords: ["bodenklasse 6", "lösen", "laden"] },
  { id: "homogenbereich-a", category: "Erdbau / Bodenlösen", kurztext: "Homogenbereich A lösen laden", unit: "m³", keywords: ["homogenbereich a", "lösen", "laden"] },
  { id: "homogenbereich-b", category: "Erdbau / Bodenlösen", kurztext: "Homogenbereich B lösen laden", unit: "m³", keywords: ["homogenbereich b", "lösen", "laden"] },

  { id: "geogitter-40-40", category: "Erdbau / Geogitter", kurztext: "Geogitter biaxial 40/40 kN verlegen", unit: "m²", keywords: ["geogitter", "40/40", "biaxial"] },
  { id: "geokomposit-draenmatte", category: "Erdbau / Dränmatte", kurztext: "Geokomposit Dränmatte verlegen", unit: "m²", keywords: ["geokomposit", "dränmatte", "drainagematte"] },
  { id: "bentonitmatte-gcl", category: "Dichtung / Bentonitmatte", kurztext: "Bentonitmatte GCL verlegen", unit: "m²", keywords: ["bentonitmatte", "gcl"] },
  { id: "pehd-dichtungsbahn-2mm", category: "Dichtung / PEHD", kurztext: "PEHD Dichtungsbahn 2,0 mm verlegen", unit: "m²", keywords: ["pehd dichtungsbahn", "2,0 mm", "kunststoffdichtungsbahn"] },

  { id: "rohrbettung-sand-10", category: "Leitungsbau / Rohrbettung", kurztext: "Rohrbettung Sand 10 cm DN160 herstellen", unit: "m", keywords: ["rohrbettung", "sand", "10 cm", "dn160"] },
  { id: "rohrbettung-riesel-15", category: "Leitungsbau / Rohrbettung", kurztext: "Rohrbettung Riesel 15 cm DN300 herstellen", unit: "m", keywords: ["rohrbettung", "riesel", "15 cm", "dn300"] },
  { id: "rohrueberdeckung-splitt-20", category: "Leitungsbau / Rohrumhüllung", kurztext: "Rohrüberdeckung Splitt 20 cm herstellen", unit: "m", keywords: ["rohrüberdeckung", "splitt", "20 cm"] },
  { id: "schutzrohr-stahl-dn200", category: "Leitungsbau / Schutzrohr", kurztext: "Schutzrohr Stahl DN200 verlegen", unit: "m", keywords: ["schutzrohr", "stahl", "dn200"] },
  { id: "schutzrohr-pe-da160", category: "Leitungsbau / Schutzrohr", kurztext: "Schutzrohr PE DA160 verlegen", unit: "m", keywords: ["schutzrohr", "pe", "da160"] },
  { id: "ortungsdraht-wasser", category: "Leitungsbau / Ortung", kurztext: "Ortungsdraht Wasserleitung verlegen", unit: "m", keywords: ["ortungsdraht", "wasserleitung"] },
  { id: "warnband-wasser", category: "Leitungsbau / Kennzeichnung", kurztext: "Warnband Wasserleitung verlegen", unit: "m", keywords: ["warnband", "wasserleitung"] },

  { id: "schachtring-dn1000-500", category: "Kanalbau / Schachtring", kurztext: "Schachtring DN1000 H=500 setzen", unit: "St", keywords: ["schachtring", "dn1000", "h=500"] },
  { id: "schachtring-dn1200-1000", category: "Kanalbau / Schachtring", kurztext: "Schachtring DN1200 H=1000 setzen", unit: "St", keywords: ["schachtring", "dn1200", "h=1000"] },
  { id: "schachtkonus-1000-625", category: "Kanalbau / Schachtkonus", kurztext: "Schachtkonus DN1000/625 setzen", unit: "St", keywords: ["schachtkonus", "dn1000", "625"] },
  { id: "schachtunterteil-1000", category: "Kanalbau / Schachtunterteil", kurztext: "Schachtunterteil DN1000 mit Gerinne", unit: "St", keywords: ["schachtunterteil", "dn1000", "gerinne"] },
  { id: "ausgleichsring-625", category: "Kanalbau / Schachtaufbau", kurztext: "Ausgleichsringe DN625 setzen", unit: "St", keywords: ["ausgleichsringe", "dn625"] },
  { id: "steigeisen-schacht", category: "Kanalbau / Steighilfe", kurztext: "Steigeisen im Schacht montieren", unit: "St", keywords: ["steigeisen", "schacht"] },
  { id: "schachtabdeckung-b125", category: "Kanalbau / Schachtabdeckung", kurztext: "Schachtabdeckung B125 DN625", unit: "St", keywords: ["schachtabdeckung", "b125", "dn625"] },
  { id: "schachtabdeckung-f900", category: "Kanalbau / Schachtabdeckung", kurztext: "Schachtabdeckung F900 DN625", unit: "St", keywords: ["schachtabdeckung", "f900", "dn625"] },

  { id: "oekopflaster-10", category: "Straßenbau / Pflaster", kurztext: "Ökopflaster 10 cm verlegen", unit: "m²", keywords: ["ökopflaster", "oekopflaster", "10 cm"] },
  { id: "rasengittersteine", category: "Straßenbau / Pflaster", kurztext: "Rasengittersteine verlegen", unit: "m²", keywords: ["rasengittersteine"] },
  { id: "granitkleinpflaster-8-11", category: "Straßenbau / Natursteinpflaster", kurztext: "Granitkleinpflaster 8/11 verlegen", unit: "m²", keywords: ["granitkleinpflaster", "8/11"] },
  { id: "granitgrosspflaster-15-17", category: "Straßenbau / Natursteinpflaster", kurztext: "Granitgroßpflaster 15/17 verlegen", unit: "m²", keywords: ["granitgroßpflaster", "15/17"] },
  { id: "plattenbelag-40x40", category: "Straßenbau / Plattenbelag", kurztext: "Plattenbelag Beton 40x40 verlegen", unit: "m²", keywords: ["plattenbelag", "40x40", "betonplatte"] },
  { id: "busbord", category: "Straßenbau / Sonderbord", kurztext: "Busbord Sonderbord setzen", unit: "m", keywords: ["busbord", "sonderbord"] },

  { id: "sperrflaeche-markierung", category: "Straßenbau / Markierung", kurztext: "Sperrfläche markieren", unit: "m²", keywords: ["sperrfläche", "markierung"] },
  { id: "piktogramm-fahrrad", category: "Straßenbau / Markierung", kurztext: "Piktogramm Fahrrad markieren", unit: "St", keywords: ["piktogramm", "fahrrad", "markierung"] },
  { id: "markierung-entfernen", category: "Straßenbau / Markierungsrückbau", kurztext: "Markierung entfernen fräsen", unit: "m²", keywords: ["markierung entfernen", "fräsen"] },

  { id: "steinschuettung-boeschung", category: "Wasserbau / Steinschüttung", kurztext: "Steinschüttung Böschung herstellen", unit: "m³", keywords: ["steinschüttung", "böschung", "wasserbau"] },
  { id: "faschinen", category: "Wasserbau / Faschinen", kurztext: "Faschinen liefern und einbauen", unit: "m", keywords: ["faschinen"] },
  { id: "totholz-ufersicherung", category: "Wasserbau / Totholz", kurztext: "Totholzstamm Ufersicherung einbauen", unit: "St", keywords: ["totholz", "ufersicherung"] },
  { id: "gewaessersohle-profil", category: "Wasserbau / Sohlprofil", kurztext: "Gewässersohle profilieren", unit: "m²", keywords: ["gewässersohle", "profilieren"] },

  { id: "draenpackung-filterkies", category: "Drainage / Dränpackung", kurztext: "Dränpackung Filterkies herstellen", unit: "m³", keywords: ["dränpackung", "filterkies"] },
  { id: "draenvlies", category: "Drainage / Vlies", kurztext: "Dränvlies um Filterkies verlegen", unit: "m²", keywords: ["dränvlies", "filterkies"] },

  { id: "abbruch-mauerwerk", category: "Abbruch / Mauerwerk", kurztext: "Mauerwerk abbrechen", unit: "m³", keywords: ["mauerwerk", "abbrechen"] },
  { id: "abbruch-natursteinmauer", category: "Abbruch / Naturstein", kurztext: "Natursteinmauer abbrechen", unit: "m³", keywords: ["natursteinmauer", "abbrechen"] },
  { id: "abbruch-fundament-unbewehrt", category: "Abbruch / Betonfundament", kurztext: "Fundament abbrechen unbewehrt", unit: "m³", keywords: ["fundament", "abbrechen", "unbewehrt"] },
  { id: "abbruch-fundament-bewehrt", category: "Abbruch / Stahlbetonfundament", kurztext: "Fundament abbrechen bewehrt", unit: "m³", keywords: ["fundament", "abbrechen", "bewehrt"] },
  { id: "abbruch-strassenablauf", category: "Abbruch / Straßenablauf", kurztext: "Straßenablauf ausbauen", unit: "St", keywords: ["straßenablauf", "ausbauen"] },
  { id: "abbruch-hydrant", category: "Abbruch / Wasserarmatur", kurztext: "Hydrant ausbauen", unit: "St", keywords: ["hydrant", "ausbauen"] },
  { id: "abbruch-schieber", category: "Abbruch / Wasserarmatur", kurztext: "Absperrschieber ausbauen", unit: "St", keywords: ["absperrschieber", "ausbauen"] },

  { id: "verkehr-halbseitig", category: "Verkehrssicherung / Halbseitige Sperrung", kurztext: "Fahrbahn halbseitig sperren", unit: "Tag", keywords: ["halbseitig sperren", "verkehrssicherung"] },
  { id: "verkehr-vollsperrung", category: "Verkehrssicherung / Vollsperrung", kurztext: "Vollsperrung einrichten", unit: "Tag", keywords: ["vollsperrung"] },
  { id: "verkehr-fussgaenger", category: "Verkehrssicherung / Fußgänger", kurztext: "Fußgängerüberleitung herstellen", unit: "St", keywords: ["fußgängerüberleitung", "fussgaengerueberleitung"] },
  { id: "behelfsfahrbahn", category: "Verkehrsführung / Behelfsfahrbahn", kurztext: "Behelfsfahrbahn herstellen", unit: "m²", keywords: ["behelfsfahrbahn"] },

  { id: "proctorversuch", category: "Prüfung / Bodenmechanik", kurztext: "Proctorversuch Boden durchführen", unit: "St", keywords: ["proctorversuch"] },
  { id: "siebanalyse", category: "Prüfung / Bodenmechanik", kurztext: "Siebanalyse Boden durchführen", unit: "St", keywords: ["siebanalyse"] },
  { id: "cbr-versuch", category: "Prüfung / Bodenmechanik", kurztext: "CBR Versuch durchführen", unit: "St", keywords: ["cbr", "versuch"] },
  { id: "rammsondierung-dpl", category: "Prüfung / Baugrund", kurztext: "Rammsondierung DPL durchführen", unit: "m", keywords: ["rammsondierung", "dpl"] },
  { id: "rammsondierung-dph", category: "Prüfung / Baugrund", kurztext: "Rammsondierung DPH durchführen", unit: "m", keywords: ["rammsondierung", "dph"] },
  { id: "ebv-bodenanalyse", category: "Prüfung / EBV", kurztext: "Bodenprobe chemisch EBV analysieren", unit: "St", keywords: ["ebv", "bodenprobe", "analyse"] },

  { id: "l-steine-1m", category: "Ingenieurbau / Winkelstütze", kurztext: "L-Steine 1,0 m setzen", unit: "m", keywords: ["l-steine", "1,0 m"] },
  { id: "l-steine-2m", category: "Ingenieurbau / Winkelstütze", kurztext: "L-Steine 2,0 m setzen", unit: "m", keywords: ["l-steine", "2,0 m"] },
  { id: "winkelstuetzwand", category: "Ingenieurbau / Winkelstütze", kurztext: "Winkelstützwand Fertigteil setzen", unit: "m", keywords: ["winkelstützwand", "fertigteil"] },
  { id: "blockstufe-beton", category: "Ingenieurbau / Treppen", kurztext: "Blockstufen Beton setzen", unit: "St", keywords: ["blockstufe", "beton"] },
  { id: "natursteinstufe", category: "Ingenieurbau / Treppen", kurztext: "Natursteinstufen setzen", unit: "St", keywords: ["natursteinstufe"] },
];



const COVERAGE_SEEDS: Seed[] = TIEFBAU_COVERAGE_CASES.map((c, i) => ({
  id: "coverage-" + String(i + 1).padStart(4, "0"),
  category: "Tiefbau / " + c.group,
  kurztext: c.text,
  unit: c.unit,
  keywords: c.text.toLowerCase().split(/\s+/).filter((x) => x.length >= 3).slice(0, 10),
}));

export function generateRlcTiefbauPreisCatalog(): RlcPreisItem[] {
  const out: RlcPreisItem[] = [];
  const seenSeedKeys = new Set<string>();
  for (const seed of [...SEEDS, ...BREADTH_SEEDS, ...COVERAGE_SEEDS]) {
    const seedKey = (seed.kurztext.trim().toLowerCase() + "|" + seed.unit.trim().toLowerCase());
    if (seenSeedKeys.has(seedKey)) continue;
    seenSeedKeys.add(seedKey);
    const row: RlcAutonomousCalcInput = {
      posNr: "CAT." + seed.id,
      kurztext: seed.kurztext,
      langtext: seed.langtext || seed.kurztext,
      einheit: seed.unit,
      menge: 1,
    };
    const result = calculateTiefbauFamilyCatalog(row, NEUTRAL_CONTEXT, [row]);
    if (!result || !(result.unitPrice > 0)) continue;

    const risk = result.riskLevel;
    const minFactor = risk === "high" ? 0.7 : risk === "medium" ? 0.8 : 0.85;
    const maxFactor = risk === "high" ? 1.5 : risk === "medium" ? 1.3 : 1.2;

    out.push({
      id: "rlc-tiefbau-v2-" + slug(seed.id),
      group: mapDominantGroup(result.costLines),
      category: seed.category,
      name: seed.kurztext,
      unit: seed.unit,
      minPrice: round2(result.unitPrice * minFactor),
      avgPrice: round2(result.unitPrice),
      maxPrice: round2(result.unitPrice * maxFactor),
      keywords: Array.from(new Set([
        ...seed.keywords,
        seed.kurztext,
        result.leistungsart,
        result.trade,
        result.bauverfahren,
      ].filter(Boolean))),
      // This is search coverage only. It is mathematically derived from the
      // active family and must never be used as a list-price source or audit proof.
      priceOrigin: "DERIVED_FAMILY",
      notes: "RLC Tiefbau V2: aus dem Family Catalog abgeleitete Suchabdeckung; keine Preisquelle und kein Preisnachweis.",
    });
  }
  return out;
}
