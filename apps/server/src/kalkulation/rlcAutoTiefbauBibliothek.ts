import type { RlcPreisItem, RlcPreisGroup } from "./rlcPreisBibliothek";

type AddInput = {
  id: string;
  group: RlcPreisGroup;
  category: string;
  name: string;
  unit: string;
  min: number;
  avg: number;
  max: number;
  keywords: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

export function generateRlcAutoTiefbauBibliothek(): RlcPreisItem[] {
  const out: RlcPreisItem[] = [];

  function add(x: AddInput) {
    out.push({
      id: `rlc-auto-${slug(x.id)}`,
      group: x.group,
      category: x.category,
      name: x.name,
      unit: x.unit,
      minPrice: round2(x.min),
      avgPrice: round2(x.avg),
      maxPrice: round2(x.max),
      keywords: Array.from(new Set(x.keywords.filter(Boolean))),
      notes: "Automatisch generierter RLC-Preisrichtwert. Projekt-, Regions- und Firmenpreise prüfen.",
    });
  }

  const tiefen = [
    ["t060", "0,60 m", 0.6, 0.75],
    ["t080", "0,80 m", 0.8, 0.9],
    ["t100", "1,00 m", 1.0, 1.0],
    ["t120", "1,20 m", 1.2, 1.18],
    ["t150", "1,50 m", 1.5, 1.45],
    ["t180", "1,80 m", 1.8, 1.75],
    ["t200", "2,00 m", 2.0, 2.05],
    ["t250", "2,50 m", 2.5, 2.65],
    ["t300", "3,00 m", 3.0, 3.35],
    ["t350", "3,50 m", 3.5, 4.15],
    ["t400", "4,00 m", 4.0, 5.1],
  ] as const;

  const breiten = [
    ["b030", "0,30 m", 0.3, 0.7],
    ["b040", "0,40 m", 0.4, 0.85],
    ["b050", "0,50 m", 0.5, 1.0],
    ["b060", "0,60 m", 0.6, 1.15],
    ["b080", "0,80 m", 0.8, 1.45],
    ["b100", "1,00 m", 1.0, 1.8],
    ["b120", "1,20 m", 1.2, 2.15],
    ["b150", "1,50 m", 1.5, 2.65],
  ] as const;

  const boeden = [
    ["bk3", "Bodenklasse 3", 0.85],
    ["bk4", "Bodenklasse 4", 1.0],
    ["bk5", "Bodenklasse 5", 1.25],
    ["bk6", "Bodenklasse 6", 1.55],
    ["fels", "Fels / schwer lösbar", 2.4],
    ["nass", "nasser Boden", 1.45],
    ["bestand", "Leitungsbestand", 1.85],
    ["kontaminiert", "kontaminierter Boden", 2.2],
  ] as const;

  const regionen = [
    ["land", "ländlicher Bereich", 0.9],
    ["stadt", "innerstädtischer Bereich", 1.25],
    ["innenstadt", "Innenstadt / beengt", 1.55],
    ["verkehr", "unter Verkehr", 1.75],
  ] as const;

  const oberflaechen = [
    ["unbefestigt", "unbefestigte Fläche", 1.0],
    ["rasen", "Rasenfläche", 1.08],
    ["schotter", "Schotterfläche", 1.18],
    ["pflaster", "Pflasterfläche", 1.45],
    ["asphalt", "Asphaltfläche", 1.75],
    ["beton", "Betonfläche", 2.05],
  ] as const;

  const rohre = [
    ["speedpipe-1x10", "Speedpipe 1x10", "Glasfaser", 8],
    ["speedpipe-2x10", "Speedpipe 2x10", "Glasfaser", 12],
    ["speedpipe-4x10", "Speedpipe 4x10", "Glasfaser", 18],
    ["speedpipe-7x10", "Speedpipe 7x10", "Glasfaser", 28],
    ["speedpipe-12x10", "Speedpipe 12x10", "Glasfaser", 42],
    ["speedpipe-24x10", "Speedpipe 24x10", "Glasfaser", 78],
    ["kabelschutz-dn50", "Kabelschutzrohr DN50", "Kabelschutz", 22],
    ["kabelschutz-dn75", "Kabelschutzrohr DN75", "Kabelschutz", 28],
    ["kabelschutz-dn110", "Kabelschutzrohr DN110", "Kabelschutz", 42],
    ["kabelschutz-dn160", "Kabelschutzrohr DN160", "Kabelschutz", 78],
    ["pe-da32", "PE-Wasserleitung DA32", "Wasserleitung", 32],
    ["pe-da40", "PE-Wasserleitung DA40", "Wasserleitung", 38],
    ["pe-da50", "PE-Wasserleitung DA50", "Wasserleitung", 48],
    ["pe-da63", "PE-Wasserleitung DA63", "Wasserleitung", 58],
    ["pe-da90", "PE-Wasserleitung DA90", "Wasserleitung", 82],
    ["pe-da110", "PE-Wasserleitung DA110", "Wasserleitung", 110],
    ["pe-da160", "PE-Wasserleitung DA160", "Wasserleitung", 185],
    ["kg-dn100", "KG-Rohr DN100", "Kanal", 48],
    ["kg-dn150", "KG-Rohr DN150", "Kanal", 68],
    ["kg-dn200", "KG-Rohr DN200", "Kanal", 98],
    ["pp-dn250", "PP-Rohr DN250", "Kanal", 145],
    ["pp-dn300", "PP-Rohr DN300", "Kanal", 190],
    ["beton-dn300", "Betonrohr DN300", "Kanal", 240],
    ["beton-dn400", "Betonrohr DN400", "Kanal", 340],
    ["beton-dn500", "Betonrohr DN500", "Kanal", 480],
    ["beton-dn600", "Betonrohr DN600", "Kanal", 680],
    ["drainage-dn100", "Drainagerohr DN100", "Drainage", 34],
    ["drainage-dn150", "Drainagerohr DN150", "Drainage", 48],
  ] as const;

  const verbaue = [
    ["ohne-verbau", "ohne Verbau", 1.0],
    ["boeschung", "mit Böschung", 1.15],
    ["leichtverbau", "mit Leichtverbau", 1.55],
    ["plattenverbau", "mit Plattenverbau", 1.95],
    ["gleitschiene", "mit Gleitschienenverbau", 2.45],
  ] as const;

  const schichten = [
    ["sand-10", "Sandbett 10 cm", 8],
    ["sand-15", "Sandbett 15 cm", 12],
    ["leitungszone-sand", "Leitungszone Sand", 18],
    ["frostschutz-20", "Frostschutz 20 cm", 22],
    ["frostschutz-30", "Frostschutz 30 cm", 32],
    ["frostschutz-40", "Frostschutz 40 cm", 42],
    ["splitt-5", "Splittbett 5 cm", 7],
    ["schotter-30", "Schottertragschicht 30 cm", 36],
  ] as const;

  // 1) Leitungs-/Rohrgräben: ca. 8*11*8*4*6 = 16896 möglich, wir begrenzen sinnvoll
  for (const [bCode, bName, , bF] of breiten) {
    for (const [tCode, tName, , tF] of tiefen) {
      for (const [bodenCode, bodenName, bodenF] of boeden) {
        for (const [regCode, regName, regF] of regionen) {
          const base = 24 * Number(bF) * Number(tF) * Number(bodenF) * Number(regF);
          add({
            id: `graben-${bCode}-${tCode}-${bodenCode}-${regCode}`,
            group: "Maschinen",
            category: "Graben / Aushub",
            name: `Leitungsgraben herstellen, Breite ${bName}, Tiefe ${tName}, ${bodenName}, ${regName}`,
            unit: "m",
            min: base * 0.75,
            avg: base,
            max: base * 1.8,
            keywords: ["leitungsgraben", "rohrgraben", "kabelgraben", bName, tName, bodenName, regName],
          });
        }
      }
    }
  }

  // 2) Komplette Rohr-/Leitungspositionen
  for (const [rCode, rName, rCat, rBase] of rohre) {
    for (const [tCode, tName, , tF] of tiefen.slice(0, 8)) {
      for (const [oberCode, oberName, oberF] of oberflaechen) {
        for (const [verbauCode, verbauName, verbauF] of verbaue) {
          const base = Number(rBase) * Number(tF) * Number(oberF) * Number(verbauF);
          add({
            id: `${rCat}-${rCode}-${tCode}-${oberCode}-${verbauCode}`,
            group: "Fremdleistung",
            category: String(rCat),
            name: `${rName} liefern und verlegen, Tiefe ${tName}, ${oberName}, ${verbauName}`,
            unit: "m",
            min: base * 0.7,
            avg: base,
            max: base * 1.9,
            keywords: [rName, String(rCat), "liefern", "verlegen", tName, oberName, verbauName],
          });
        }
      }
    }
  }

  // 3) Oberflächenwiederherstellung
  for (const [oberCode, oberName, oberF] of oberflaechen) {
    for (const [schCode, schName, schBase] of schichten) {
      for (const [regCode, regName, regF] of regionen) {
        const base = Number(schBase) * Number(oberF) * Number(regF);
        add({
          id: `oberflaeche-${oberCode}-${schCode}-${regCode}`,
          group: "Fremdleistung",
          category: "Oberfläche / Wiederherstellung",
          name: `${oberName} wiederherstellen mit ${schName}, ${regName}`,
          unit: "m²",
          min: base * 0.75,
          avg: base,
          max: base * 1.85,
          keywords: ["oberfläche", "wiederherstellen", oberName, schName, regName],
        });
      }
    }
  }

  // 4) Entsorgung / Transport
  const entsorgungen = [
    ["boden-z0", "Boden Z0", 24],
    ["boden-z1", "Boden Z1", 55],
    ["boden-z2", "Boden Z2", 115],
    ["boden-dk1", "Boden DK I", 145],
    ["boden-dk2", "Boden DK II", 240],
    ["asphalt-teerfrei", "Asphalt teerfrei", 48],
    ["asphalt-pak", "Asphalt PAK/teerhaltig", 220],
    ["beton", "Beton/Bauschutt", 38],
    ["mischabfall", "Baumischabfall", 220],
  ] as const;

  const distanzen = [
    ["5km", "bis 5 km", 0.85],
    ["10km", "bis 10 km", 1.0],
    ["20km", "bis 20 km", 1.25],
    ["30km", "bis 30 km", 1.45],
    ["50km", "bis 50 km", 1.85],
  ] as const;

  for (const [eCode, eName, eBase] of entsorgungen) {
    for (const [dCode, dName, dF] of distanzen) {
      for (const [regCode, regName, regF] of regionen) {
        const base = Number(eBase) * Number(dF) * Number(regF);
        add({
          id: `entsorgung-${eCode}-${dCode}-${regCode}`,
          group: "Entsorgung",
          category: "Entsorgung / Deponie",
          name: `${eName} laden, transportieren und entsorgen, ${dName}, ${regName}`,
          unit: "t",
          min: base * 0.7,
          avg: base,
          max: base * 2.0,
          keywords: ["entsorgung", "deponie", "transport", eName, dName, regName],
        });
      }
    }
  }

  // 5) Schächte, Formstücke, Armaturen
  const stueck = [
    ["kabelschacht-klein", "Kabelschacht klein", "Glasfaser", 420],
    ["kabelschacht-mittel", "Kabelschacht mittel", "Glasfaser", 850],
    ["muffenschacht", "Muffenschacht", "Glasfaser", 980],
    ["schacht-dn800", "Betonschacht DN800", "Kanal", 1350],
    ["schacht-dn1000", "Betonschacht DN1000", "Kanal", 1850],
    ["schacht-dn1200", "Betonschacht DN1200", "Kanal", 2600],
    ["strassenablauf", "Straßenablauf", "Entwässerung", 1250],
    ["hydrant", "Hydrant", "Wasserleitung", 1450],
    ["schieber", "Absperrschieber", "Wasserleitung", 650],
    ["hausanschluss-wasser", "Hausanschluss Wasser", "Wasserleitung", 1850],
    ["hausanschluss-glasfaser", "Hausanschluss Glasfaser", "Glasfaser", 1250],
  ] as const;

  for (const [sCode, sName, sCat, sBase] of stueck) {
    for (const [tCode, tName, , tF] of tiefen.slice(0, 7)) {
      for (const [regCode, regName, regF] of regionen) {
        const base = Number(sBase) * Number(tF) * Number(regF);
        add({
          id: `stueck-${sCode}-${tCode}-${regCode}`,
          group: "Fremdleistung",
          category: String(sCat),
          name: `${sName} liefern und einbauen, Tiefe ${tName}, ${regName}`,
          unit: "St",
          min: base * 0.7,
          avg: base,
          max: base * 1.9,
          keywords: [sName, String(sCat), "einbauen", "setzen", tName, regName],
        });
      }
    }
  }

  // 6) Prüfungen / Dokumentation / Verkehr
  const nebenleistungen = [
    ["druckprobe", "Druckprüfung Wasserleitung", "St", 520],
    ["dichtheit", "Dichtheitsprüfung Kanal", "St", 680],
    ["kamerabefahrung", "Kamerabefahrung Kanal", "m", 7.5],
    ["verdichtung", "Verdichtungsnachweis EV2", "St", 240],
    ["absteckung", "Trasse abstecken", "m", 2.8],
    ["bestandsvermessung", "Bestandsvermessung", "h", 95],
    ["asbuilt", "As-Built Dokumentation", "St", 480],
    ["verkehr-tagesbaustelle", "Verkehrssicherung Tagesbaustelle", "d", 420],
    ["ampel", "Mobile Ampelanlage", "d", 180],
    ["halteverbot", "Halteverbot einrichten", "St", 350],
  ] as const;

  for (const [nCode, nName, unit, nBase] of nebenleistungen) {
    for (const [regCode, regName, regF] of regionen) {
      const base = Number(nBase) * Number(regF);
      add({
        id: `nebenleistung-${nCode}-${regCode}`,
        group: "Fremdleistung",
        category: "Nebenleistung / Dokumentation / Verkehr",
        name: `${nName}, ${regName}`,
        unit: String(unit),
        min: base * 0.65,
        avg: base,
        max: base * 1.85,
        keywords: [nName, regName, "prüfung", "dokumentation", "verkehr"],
      });
    }
  }

  return out;
}
