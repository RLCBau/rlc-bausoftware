import type {
  RlcAutonomousCalcInput,
  RlcAutonomousCalcResult,
  RlcAutonomousCostLine,
  RlcAutonomousProjectContext,
  RlcRiskLevel,
} from "./types";

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string {
  return String(v ?? "");
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function textOf(row: RlcAutonomousCalcInput): string {
  return `${row.kurztext ?? ""} ${row.langtext ?? ""}`.toLowerCase();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function addLine(
  lines: RlcAutonomousCostLine[],
  group: RlcAutonomousCostLine["group"],
  name: string,
  unitPrice: number,
  unit: string,
  note?: string
): void {
  if (unitPrice <= 0) return;

  lines.push({
    id: `${group.toLowerCase()}-${lines.length + 1}`,
    group,
    name,
    qty: 1,
    unit,
    unitPrice: round2(unitPrice),
    total: round2(unitPrice),
    note,
  });
}

function riskFrom(ctx: RlcAutonomousProjectContext, forced?: RlcRiskLevel): RlcRiskLevel {
  if (forced) return forced;
  if (ctx.difficulty === "high" || ctx.logisticsRisk === "high") return "high";
  if (ctx.difficulty === "medium" || ctx.trafficRisk === "medium" || ctx.durationRisk === "medium") return "medium";
  return "low";
}

function statusFromRisk(risk: RlcRiskLevel): RlcAutonomousCalcResult["calculationStatus"] {
  if (risk === "high") return "needs_review";
  if (risk === "medium") return "warning";
  return "ok";
}

function sum(lines: RlcAutonomousCostLine[]): number {
  return round2(lines.reduce((a, l) => a + n(l.total), 0));
}

function finish(
  row: RlcAutonomousCalcInput,
  ctx: RlcAutonomousProjectContext,
  trade: string,
  bauverfahren: string,
  leistungsart: string,
  lines: RlcAutonomousCostLine[],
  riskLevel: RlcRiskLevel,
  extraWarnings: string[] = []
): RlcAutonomousCalcResult {
  const unit = s(row.einheit || "EH");
  const qty = Math.max(1, n(row.menge));

  const base = sum(lines);
  addLine(lines, "Gemeinkosten", "Baustellengemeinkosten", base * 0.1, unit, "10 % BGK");
  addLine(lines, "Risiko", "Risikopuffer", base * (riskLevel === "high" ? 0.08 : riskLevel === "medium" ? 0.05 : 0.03), unit);
  addLine(lines, "Gewinn", "Gewinnanteil", base * 0.08, unit, "8 % Zielgewinn");

  const unitPrice = round2(sum(lines) * ctx.marketFactor * ctx.distanceFactor);
  const total = round2(unitPrice * qty);

  return {
    unitPrice,
    total,
    confidence: riskLevel === "high" ? 0.6 : riskLevel === "medium" ? 0.7 : 0.8,
    riskLevel,
    source: "rlc-autonomous-urkalkulation-v2-tiefbau-family",
    calculationStatus: statusFromRisk(riskLevel),
    trade,
    bauverfahren,
    leistungsart,
    costLines: lines,
    warnings: [
      ...ctx.warnings,
      ...extraWarnings,
      "RLC Autonomous Tiefbau Family Catalog V2 verwendet. Preis aus Kostenbestandteilen kalkuliert, nicht aus X84.",
    ],
    aiReason:
      `RLC Autonomous Tiefbau Family Catalog V2.\n` +
      `Familie: ${trade}.\n` +
      `Bauverfahren: ${bauverfahren}.\n` +
      `Leistungsart: ${leistungsart}.\n` +
      `Kostenbestandteile: Lohn, Material, Maschinen, Entsorgung/Nachunternehmer, Gemeinkosten, Risiko und Gewinn.\n` +
      `Marktfaktor: ${ctx.marketFactor}, Distanzfaktor: ${ctx.distanceFactor}. Kein X84 als Preisquelle verwendet.`,
  };
}

export function calculateTiefbauFamilyCatalog(
  row: RlcAutonomousCalcInput,
  ctx: RlcAutonomousProjectContext
): RlcAutonomousCalcResult | null {
  const text = textOf(row);
  const unit = s(row.einheit || "EH");
  const lines: RlcAutonomousCostLine[] = [];

  if (hasAny(text, ["wasserhaltung", "pumpe", "grundwasser", "drainage", "ableitung wasser", "bauwasserhaltung"])) {
    addLine(lines, "Maschinen", "Pumpen/Leitungen/Vorhaltung", 48, unit);
    addLine(lines, "Lohn", "Einbau, Kontrolle, Wartung", 18, unit);
    addLine(lines, "Nachunternehmer", "Genehmigung/Analyse/Einleitung anteilig", 12, unit);
    return finish(row, ctx, "Wasserhaltung", "Wasserhaltung herstellen und betreiben", "Wasserhaltung", lines, riskFrom(ctx, "high"), ["Dauer, Fördermenge, Einleitstelle, Genehmigung und Wartung prüfen."]);
  }

  if (hasAny(text, ["kanal", "schacht", "kanalrohr", "kg-rohr", "betonrohr", "haltung"])) {
    addLine(lines, "Material", "Kanalrohr/Formstücke/Schachtmaterial", 32, unit);
    addLine(lines, "Lohn", "Kolonne Kanalbau", 18, unit);
    addLine(lines, "Maschinen", "Bagger, Verdichtung, Hebegerät", 14, unit);
    addLine(lines, "Entsorgung", "Aushub/Reststoffe", 8, unit);
    return finish(row, ctx, "Kanalbau", "Kanalrohr / Schacht / Haltung herstellen", "Kanalbauleistung", lines, riskFrom(ctx, "medium"), ["Gefälle, Bettung, Dichtheitsprüfung und Schachtanschlüsse prüfen."]);
  }

  if (hasAny(text, ["wasserleitung", "trinkwasser", "hydrant", "armatur", "schieber", "druckprüfung wasser"])) {
    addLine(lines, "Material", "Rohrleitung, Armaturen, Formstücke", 38, unit);
    addLine(lines, "Lohn", "Rohrleitungsbau Kolonne", 15, unit);
    addLine(lines, "Maschinen", "Bagger/Kleingeräte", 7, unit);
    addLine(lines, "Nachunternehmer", "Druckprüfung/Desinfektion anteilig", 5, unit);
    return finish(row, ctx, "Wasserbau", "Wasserleitung liefern, verlegen, prüfen", "Wasserleitungsbau", lines, riskFrom(ctx, "medium"), ["Druckstufe, Formstücke, Desinfektion und Druckprüfung prüfen."]);
  }

  if (hasAny(text, ["gasleitung", "gas", "pe-gas", "druckprüfung gas"])) {
    addLine(lines, "Material", "Gasrohr/Formstücke/Warnband", 34, unit);
    addLine(lines, "Lohn", "Gasleitungsbau Kolonne", 16, unit);
    addLine(lines, "Maschinen", "Bagger/Kleingeräte", 7, unit);
    addLine(lines, "Nachunternehmer", "Schweißung/Prüfung/Dokumentation", 6, unit);
    return finish(row, ctx, "Gas", "Gasleitung verlegen und prüfen", "Gasleitungsbau", lines, riskFrom(ctx, "high"), ["Zulassung, Schweißprotokolle, Druckprüfung und Sicherheitsvorgaben prüfen."]);
  }

  if (hasAny(text, ["fernwärme", "fw-leitung", "wärmeleitung", "mantelrohr", "kompensator"])) {
    addLine(lines, "Material", "Fernwärmerohr, Muffen, Zubehör", 85, unit);
    addLine(lines, "Lohn", "Montage Fernwärme", 24, unit);
    addLine(lines, "Maschinen", "Hebegerät/Bagger", 12, unit);
    addLine(lines, "Nachunternehmer", "Muffenmontage/Prüfung", 18, unit);
    return finish(row, ctx, "Fernwärme", "Fernwärmeleitung herstellen", "Fernwärmebau", lines, riskFrom(ctx, "high"), ["Muffen, Isolierung, Schweißung, Kompensatoren und Prüfungen gesondert prüfen."]);
  }

  if (hasAny(text, ["glasfaser", "lwl", "mikro", "speedpipe", "leerrohrverbund", "telekom", "vodafone", "bayernwerk"])) {
    addLine(lines, "Material", "Mikrorohr/Speedpipe/Zubehör", 6.5, unit);
    addLine(lines, "Lohn", "Kabelbau Kolonne", 5.8, unit);
    addLine(lines, "Maschinen", "Einblasen/Kleingeräte anteilig", 2.2, unit);
    addLine(lines, "Nachunternehmer", "Dokumentation/Messung anteilig", 1.8, unit);
    return finish(row, ctx, "Glasfaser/Telekom", "Mikrorohr/LWL-Trasse herstellen", "Glasfaser-Kabelbau", lines, riskFrom(ctx, "medium"), ["Einblaslänge, Hausanschlüsse, Muffen, Messprotokolle und Netzbetreiberstandard prüfen."]);
  }

  if (hasAny(text, ["stromkabel", "mittelspannung", "niederspannung", "kabelschutzrohr", "erdkabel", "schutzmatte"])) {
    addLine(lines, "Material", "Kabelschutz/Schutzmaterial", 12, unit);
    addLine(lines, "Lohn", "Kabelbau Kolonne", 7.5, unit);
    addLine(lines, "Maschinen", "Bagger/Kleingeräte/Verdichtung", 4.5, unit);
    return finish(row, ctx, "Strom/Kabelbau", "Stromtrasse / Kabelschutz herstellen", "Kabelbau", lines, riskFrom(ctx, "medium"), ["Kabeltyp, Schutzabdeckung, Netzbetreiberstandard und Kreuzungen prüfen."]);
  }

  if (hasAny(text, ["asphalt", "fahrbahn", "straße", "strasse", "fräsen", "tragschicht", "deckschicht"])) {
    addLine(lines, "Material", "Asphalt/Tragschichtmaterial", 18, unit);
    addLine(lines, "Lohn", "Straßenbau Kolonne", 8, unit);
    addLine(lines, "Maschinen", "Fertiger/Walze/Fräse anteilig", 10, unit);
    addLine(lines, "Entsorgung", "Ausbauasphalt/Fräsgut", 5, unit);
    return finish(row, ctx, "Straßenbau", "Asphalt / Fahrbahn wiederherstellen", "Oberflächenwiederherstellung", lines, riskFrom(ctx, "medium"), ["Schichtdicke, Fläche, Verkehrsphase, Asphaltart und Entsorgung prüfen."]);
  }

  if (hasAny(text, ["pflaster", "bordstein", "leistenstein", "naturstein", "rinnenstein", "plattenbelag"])) {
    addLine(lines, "Material", "Pflaster/Bordstein/Bettung", 24, unit);
    addLine(lines, "Lohn", "Pflasterbau Kolonne", 18, unit);
    addLine(lines, "Maschinen", "Rüttelplatte/Kleingeräte", 3, unit);
    return finish(row, ctx, "Pflaster/Bordsteine", "Pflaster/Bordstein herstellen", "Oberflächenbau", lines, riskFrom(ctx, "medium"), ["Materialqualität, Schnittanteil, Unterbau und Wiederverwendung prüfen."]);
  }

  if (hasAny(text, ["auskofferung", "auffüllung", "verfüllung", "frostschutz", "kies", "schotter", "sand", "splitt", "kippe"])) {
    addLine(lines, "Material", "Schüttgut/Baustoff", 14, unit);
    addLine(lines, "Lohn", "Einbau und Verdichtung", 5, unit);
    addLine(lines, "Maschinen", "Radlader/Bagger/Verdichtung", 7, unit);
    addLine(lines, "Entsorgung", "Kippe/Transport anteilig", 6, unit);
    return finish(row, ctx, "Auskofferung/Auffüllung/Schüttgüter", "Material lösen, liefern, einbauen, verdichten", "Erdbau/Schüttgut", lines, riskFrom(ctx), ["Materialklasse, Lieferentfernung, Verdichtungsanforderung und Kippe prüfen."]);
  }

  if (hasAny(text, ["regie", "stundenlohn", "facharbeiter", "arbeiter", "polier", "bauleiter", "baggerfahrer"])) {
    addLine(lines, "Lohn", "Regiepersonal", 62, unit);
    addLine(lines, "Gemeinkosten", "Regie-Gemeinkosten", 8, unit);
    return finish(row, ctx, "Regie/Personal", "Regieleistung Personal", "Regie", lines, riskFrom(ctx), ["Stundensatz, Zuschläge, Anfahrt und Nachweisführung prüfen."]);
  }

  if (hasAny(text, ["bagger", "radlader", "walze", "rüttelplatte", "lkw", "gerät", "maschine", "bohrgerät"])) {
    addLine(lines, "Maschinen", "Geräteeinsatz inkl. Betriebskosten", 85, unit);
    addLine(lines, "Lohn", "Bedienpersonal anteilig", 18, unit);
    addLine(lines, "Gemeinkosten", "Transport/Vorhaltung anteilig", 12, unit);
    return finish(row, ctx, "Maschinen/Geräte", "Maschineneinsatz", "Geräteleistung", lines, riskFrom(ctx, "medium"), ["Gerätegröße, Transport, Bedienpersonal, Vorhaltung und Stillstand prüfen."]);
  }

  if (hasAny(text, ["hausanschluss", "netzanschluss", "grundstücksanschluss", "anschlussleitung"])) {
    addLine(lines, "Material", "Anschlussleitung/Formstücke", 18, unit);
    addLine(lines, "Lohn", "Hausanschluss Kolonne", 14, unit);
    addLine(lines, "Maschinen", "Kleinbagger/Handarbeit", 8, unit);
    addLine(lines, "Nachunternehmer", "Dokumentation/Abnahme", 4, unit);
    return finish(row, ctx, "Hausanschlüsse", "Hausanschluss herstellen", "Anschlussleistung", lines, riskFrom(ctx, "medium"), ["Bestand, Hauseinführung, Kernbohrung, Abdichtung und Eigentümerkoordination prüfen."]);
  }

  if (hasAny(text, ["nachtrag", "mehrmenge", "zusatzleistung", "erschwernis", "stillstand", "behinderung"])) {
    addLine(lines, "Lohn", "Zusätzlicher Personalaufwand", 45, unit);
    addLine(lines, "Maschinen", "Zusätzlicher Geräteeinsatz", 35, unit);
    addLine(lines, "Gemeinkosten", "Bauleitung/Dokumentation", 20, unit);
    return finish(row, ctx, "Nachträge/Erschwernis", "Nachtrags- oder Erschwernisleistung", "Nachtrag", lines, riskFrom(ctx, "high"), ["Nachweis, Anordnung, Bauzeitfolge und Dokumentation zwingend prüfen."]);
  }

  if (hasAny(text, ["baustellenlogistik", "zufahrt", "lagerfläche", "transportweg", "umsetzen", "innerorts", "enge"])) {
    addLine(lines, "Lohn", "Logistikpersonal/Koordination", 16, unit);
    addLine(lines, "Maschinen", "Umsetzen/Transportgeräte", 14, unit);
    addLine(lines, "Gemeinkosten", "Bauleitung/Disposition", 8, unit);
    return finish(row, ctx, "Baustellenlogistik", "Logistik / Zufahrt / Umsetzen", "Logistikleistung", lines, riskFrom(ctx, "high"), ["Zufahrt, Lagerflächen, innerörtliche Behinderung und Taktung prüfen."]);
  }

  if (hasAny(text, ["spezialtiefbau", "bohrpfahl", "spundwand", "anker", "injektion", "düsenstrahl", "baugrube"])) {
    addLine(lines, "Nachunternehmer", "Spezialtiefbaugerät/Kolonne", 120, unit);
    addLine(lines, "Material", "Spezialmaterial", 45, unit);
    addLine(lines, "Gemeinkosten", "Technische Bearbeitung", 18, unit);
    return finish(row, ctx, "Spezialtiefbau", "Spezialtiefbauleistung", "Sonderbauverfahren", lines, riskFrom(ctx, "high"), ["Statik, Baugrund, Verfahren, Gerätelogistik und Nachunternehmerangebot prüfen."]);
  }

  if (hasAny(text, ["hdd", "spülbohr", "horizontalbohr", "pressbohr", "bohrung", "grabenlos"])) {
    addLine(lines, "Nachunternehmer", "HDD/Bohrkolonne", 95, unit);
    addLine(lines, "Material", "Bohrspülung/Rohreinzug/Zubehör", 22, unit);
    addLine(lines, "Maschinen", "Bohrgerät/Ortung", 35, unit);
    return finish(row, ctx, "HDD/Grabenlos", "Horizontalspülbohrung / grabenlos", "Grabenloser Leitungsbau", lines, riskFrom(ctx, "high"), ["Bodenklasse, Start-/Zielgrube, Ortung, Bohrlänge und Genehmigung prüfen."]);
  }

  if (hasAny(text, ["verbau", "grabenverbau", "spundwand", "kanaldielen", "verbaubox", "baugrubenverbau"])) {
    addLine(lines, "Material", "Verbaumaterial/Vorhaltung", 38, unit);
    addLine(lines, "Lohn", "Einbau/Ausbau Verbau", 22, unit);
    addLine(lines, "Maschinen", "Bagger/Hebegerät", 14, unit);
    return finish(row, ctx, "Verbau", "Graben- oder Baugrubenverbau", "Sicherungsleistung", lines, riskFrom(ctx, "high"), ["Statik, Grabentiefe, Boden, Wasser, Vorhaltung und Arbeitsschutz prüfen."]);
  }

  if (hasAny(text, ["vermessung", "einmessung", "dokumentation", "bestandsplan", "as-built", "aufmaß", "prüfprotokoll"])) {
    addLine(lines, "Lohn", "Vermessung/Dokumentation", 58, unit);
    addLine(lines, "Material", "Pläne/Protokolle/Datenaufbereitung", 8, unit);
    addLine(lines, "Gemeinkosten", "Qualitätssicherung", 7, unit);
    return finish(row, ctx, "Vermessung/Dokumentation", "Einmessung / Dokumentation / As-Built", "Dokumentationsleistung", lines, riskFrom(ctx, "medium"), ["Abgabeformat, Genauigkeit, Leitungsdokumentation und Auftraggeberstandard prüfen."]);
  }

  if (hasAny(text, ["verkehrssicherung", "rsa", "umleitung", "beschilderung", "absperrung", "lichtsignalanlage", "ampel"])) {
    addLine(lines, "Material", "Schilder/Absperrmaterial/Vorhaltung", 420, unit);
    addLine(lines, "Lohn", "Aufbau, Kontrolle, Wartung, Rückbau", 520, unit);
    addLine(lines, "Maschinen", "Transportfahrzeug", 160, unit);
    addLine(lines, "Nachunternehmer", "Verkehrsrechtliche Anordnung/Plan anteilig", 180, unit);
    return finish(row, ctx, "Verkehrssicherung", "Verkehrssicherung nach RSA einrichten und vorhalten", "Verkehrssicherung", lines, riskFrom(ctx, "high"), ["Dauer, Verkehrsphase, tägliche Kontrolle, Anordnung und LSA prüfen."]);
  }

  if (hasAny(text, ["deponie", "entsorgung", "dk 0", "dk i", "dk ii", "verwertung", "boden entsorgen", "belastet"])) {
    addLine(lines, "Entsorgung", "Deponie/Verwertung", 28, unit);
    addLine(lines, "Maschinen", "Laden/Transportlogistik", 9, unit);
    addLine(lines, "Lohn", "Disposition/Nachweise", 3, unit);
    return finish(row, ctx, "Entsorgung/Deponie", "Material entsorgen oder verwerten", "Entsorgungsleistung", lines, riskFrom(ctx, "high"), ["Deponieklasse, Analyse, Wiegescheine, Transportentfernung und Nachweise prüfen."]);
  }

  if (hasAny(text, ["prüfung", "dichtheitsprüfung", "druckprüfung", "tv-inspektion", "kamerabefahrung", "protokoll"])) {
    addLine(lines, "Nachunternehmer", "Prüfung/Messung/Inspektion", 380, unit);
    addLine(lines, "Lohn", "Vorbereitung/Begleitung", 120, unit);
    addLine(lines, "Gemeinkosten", "Dokumentation/Protokolle", 60, unit);
    return finish(row, ctx, "Prüfungen", "Technische Prüfung / Protokollierung", "Prüfleistung", lines, riskFrom(ctx, "medium"), ["Prüfumfang, Norm, Abnahme, Protokoll und Wiederholungsrisiko prüfen."]);
  }

  return null;
}
