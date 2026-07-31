export type ReverseUrkalkulationInput = {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
  x84UnitPrice?: number;
  x84Total?: number;
  projectDistanceKm?: number;
  projectDurationDays?: number;
};

export type ReverseUrkalkulationComponent = {
  group:
    | "Personal"
    | "Maschinen"
    | "LKW / Transport"
    | "Material"
    | "Entsorgung"
    | "Fremdleistung"
    | "Baustelleneinrichtung"
    | "Gemeinkosten"
    | "Risiko"
    | "Gewinn";
  label: string;
  sharePercent: number;
  unitAmount: number;
  totalAmount: number;
  reason: string;
};

export type ReverseUrkalkulationResult = {
  mode: "x84_reverse_urkalkulation";
  posNr?: string;
  einheit: string;
  menge: number;
  x84UnitPrice: number;
  x84Total: number;
  workClass: string;
  complexity: "low" | "medium" | "high";
  isMassPosition: boolean;
  isTimeSensitive: boolean;
  estimatedCrew: number;
  estimatedMachines: string[];
  estimatedDurationDays?: number;
  components: ReverseUrkalkulationComponent[];
  explanation: string;
  warnings: string[];
};

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, keys: string[]): boolean {
  return keys.some((k) => text.includes(k));
}

function classifyWork(text: string): string {
  if (hasAny(text, ["baustelleneinrichtung", "baustelle einrichten", "bauzaun", "container"])) {
    return "Baustelleneinrichtung";
  }

  if (hasAny(text, ["druckprobe", "druckprüfung", "kalibrierung", "einblasen", "spülung", "entkeimung"])) {
    return "Prüfung / Inbetriebnahme / Nebenleistung";
  }

  if (hasAny(text, ["ortungsband", "warnband", "trassenwarnband", "schutzband"])) {
    return "Trassenwarnung / Band / Nebenmaterial";
  }

  if (hasAny(text, ["baustahl", "bewehrung", "stahl 500", "500/550"])) {
    return "Material / Bewehrung";
  }

  if (hasAny(text, ["rohrumhüllung", "sand", "bettung", "sohlbettung", "splittüberdeckung"])) {
    return "Rohrbettung / Rohrumhüllung";
  }

  if (hasAny(text, ["kabelschutzrohr", "speedpipe", "mikrokabel", "leer rohr", "leerrohr"])) {
    return "Leitungsbau / Kabelschutz";
  }

  if (hasAny(text, ["aushub", "graben", "boden lösen", "verfüllen"])) {
    return "Erdbau / Tiefbau";
  }

  if (hasAny(text, ["asphalt", "fräsen", "tragschicht", "deckschicht"])) {
    return "Straßenbau / Asphalt";
  }

  return "Allgemeine Bauleistung";
}

function estimateComplexity(text: string, workClass: string): "low" | "medium" | "high" {
  if (
    workClass === "Baustelleneinrichtung" ||
    hasAny(text, ["verkehrssicherung", "nachtarbeit", "autobahn", "innenstadt", "wasserhaltung", "fels", "kontaminiert"])
  ) {
    return "high";
  }

  if (
    hasAny(text, ["dn 200", "dn200", "pehd", "hdpe", "tiefe", "kreuzung", "bestand", "anschluss", "prüfung"])
  ) {
    return "medium";
  }

  return "low";
}

function estimateCrew(workClass: string, complexity: "low" | "medium" | "high"): number {
  if (workClass === "Baustelleneinrichtung") return complexity === "high" ? 3 : 2;
  if (workClass.includes("Erdbau")) return complexity === "high" ? 4 : 3;
  if (workClass.includes("Straßenbau")) return complexity === "high" ? 5 : 3;
  if (workClass.includes("Prüfung")) return 2;
  if (workClass.includes("Trassenwarnung")) return 1;
  return complexity === "high" ? 3 : 2;
}

function estimateMachines(workClass: string): string[] {
  if (workClass === "Baustelleneinrichtung") {
    return ["LKW / Transporter", "Stapler/Kran bei Bedarf", "Montagegerät"];
  }

  if (workClass.includes("Erdbau")) {
    return ["Bagger", "Radlader", "LKW"];
  }

  if (workClass.includes("Straßenbau")) {
    return ["Fertiger/Fräse bei Bedarf", "Walze", "LKW"];
  }

  if (workClass.includes("Prüfung")) {
    return ["Servicefahrzeug", "Prüfgerät"];
  }

  if (workClass.includes("Leitungsbau")) {
    return ["Minibagger bei Bedarf", "Transporter", "Einzieh-/Verlegegerät"];
  }

  return ["Transporter / Servicefahrzeug"];
}

function estimateDurationDays(workClass: string, menge: number, einheit: string, projectDurationDays?: number): number | undefined {
  if (projectDurationDays && projectDurationDays > 0 && workClass === "Baustelleneinrichtung") {
    return projectDurationDays;
  }

  const unit = norm(einheit);

  if (workClass.includes("Prüfung")) {
    const daily = unit === "m" || unit === "lfm" ? 3000 : 1;
    return Math.max(1, Math.ceil(menge / daily));
  }

  if (workClass.includes("Trassenwarnung")) {
    const daily = unit === "m" || unit === "lfm" ? 1500 : 1;
    return Math.max(1, Math.ceil(menge / daily));
  }

  if (workClass.includes("Rohrbettung")) {
    const daily = unit === "m" || unit === "lfm" ? 250 : 1;
    return Math.max(1, Math.ceil(menge / daily));
  }

  if (workClass.includes("Leitungsbau")) {
    const daily = unit === "m" || unit === "lfm" ? 300 : 1;
    return Math.max(1, Math.ceil(menge / daily));
  }

  return undefined;
}

function sharesFor(workClass: string, complexity: "low" | "medium" | "high"): Array<[ReverseUrkalkulationComponent["group"], string, number, string]> {
  if (workClass === "Baustelleneinrichtung") {
    return [
      ["Baustelleneinrichtung", "Einrichtung, Container, Baustrom, Bauwasser, Absicherung", 45, "Zeitabhängige Baustellenkosten dominieren."],
      ["Personal", "Aufbau, Kontrolle, Wartung, Abbau", 15, "Personalanteil für Einrichtung und laufende Betreuung."],
      ["LKW / Transport", "Anlieferung, Umsetzen, Abtransport", 12, "Transportkosten hängen stark von Entfernung und Anzahl Fahrten ab."],
      ["Maschinen", "Stapler/Kran/Montagegeräte", 8, "Geräteanteil für Aufbau und Abbau."],
      ["Gemeinkosten", "Allgemeine Geschäftskosten", 10, "Gemeinkostenanteil."],
      ["Risiko", "Dauer-, Wetter-, Koordinationsrisiko", complexity === "high" ? 6 : 4, "Lange Laufzeit erhöht Risiko."],
      ["Gewinn", "Gewinnzuschlag", complexity === "high" ? 4 : 6, "Kalkulatorischer Gewinn."],
    ];
  }

  if (workClass.includes("Prüfung")) {
    return [
      ["Personal", "Prüfteam / Monteure", 42, "Prüfung ist überwiegend Personal- und Nebenzeit."],
      ["Maschinen", "Prüfgerät / Messgerät", 16, "Spezialgerät wird anteilig berücksichtigt."],
      ["LKW / Transport", "Servicefahrzeug / Anfahrt", 12, "Anfahrt und Fahrzeuganteil."],
      ["Gemeinkosten", "Dokumentation / Verwaltung", 12, "Prüfprotokolle und Gemeinkosten."],
      ["Risiko", "Wartezeit / Wiederholungsprüfung", 8, "Risiko aus Wartezeiten oder Wiederholungen."],
      ["Gewinn", "Gewinnzuschlag", 10, "Kalkulatorischer Gewinn."],
    ];
  }

  if (workClass.includes("Trassenwarnung")) {
    return [
      ["Material", "Warnband / Ortungsband", 55, "Material dominiert bei Bandpositionen."],
      ["Personal", "Verlegen / Einbauen", 18, "Personalanteil für Einbau."],
      ["Maschinen", "Kleingeräte / Verlegehilfe", 4, "Geringer Geräteanteil."],
      ["LKW / Transport", "Transport / Logistik", 6, "Materialtransport."],
      ["Gemeinkosten", "Gemeinkosten", 8, "Gemeinkostenanteil."],
      ["Risiko", "Schnittstellenrisiko", 3, "Geringes technisches Risiko."],
      ["Gewinn", "Gewinn", 6, "Kalkulatorischer Gewinn."],
    ];
  }

  if (workClass.includes("Material / Bewehrung")) {
    return [
      ["Material", "Materialeinkauf", 78, "Materialpreis dominiert."],
      ["LKW / Transport", "Lieferung / Logistik", 5, "Transportanteil."],
      ["Personal", "Handling / Einbauanteil falls enthalten", 7, "Personalanteil abhängig vom Langtext."],
      ["Gemeinkosten", "Gemeinkosten", 5, "Gemeinkostenanteil."],
      ["Risiko", "Preis-/Mengenrisiko", 2, "Materialpreisrisiko."],
      ["Gewinn", "Gewinn", 3, "Gewinnanteil."],
    ];
  }

  if (workClass.includes("Rohrbettung")) {
    return [
      ["Material", "Sand/Splitt/Riesel", 42, "Materialanteil für Bettung/Umhüllung."],
      ["Personal", "Einbau / Profilierung", 22, "Personalanteil für Einbau."],
      ["Maschinen", "Bagger / Verdichtung", 16, "Maschineneinsatz."],
      ["LKW / Transport", "Anlieferung Material", 8, "Transportkosten."],
      ["Gemeinkosten", "Gemeinkosten", 6, "Gemeinkostenanteil."],
      ["Risiko", "Mengen-/Einbaurisiko", 3, "Risiko aus Mengen und Einbaubedingungen."],
      ["Gewinn", "Gewinn", 3, "Gewinnanteil."],
    ];
  }

  return [
    ["Personal", "Arbeitsleistung", 35, "Standardanteil Personal."],
    ["Maschinen", "Maschineneinsatz", 20, "Standardanteil Maschinen."],
    ["Material", "Material", 20, "Standardanteil Material."],
    ["LKW / Transport", "Transport / Logistik", 8, "Standardanteil Transport."],
    ["Gemeinkosten", "Gemeinkosten", 8, "Gemeinkostenanteil."],
    ["Risiko", "Risiko", 4, "Risikozuschlag."],
    ["Gewinn", "Gewinn", 5, "Gewinnzuschlag."],
  ];
}

export function reverseUrkalkulationFromX84(input: ReverseUrkalkulationInput): ReverseUrkalkulationResult {
  const kurztext = input.kurztext ?? "";
  const langtext = input.langtext ?? "";
  const fullText = norm(`${kurztext} ${langtext}`);
  const einheit = String(input.einheit ?? "").trim() || "Stk";
  const menge = Math.max(0, n(input.menge));
  const x84UnitPrice = Math.max(0, n(input.x84UnitPrice));
  const x84Total = Math.max(0, n(input.x84Total) || x84UnitPrice * menge);

  const workClass = classifyWork(fullText);
  const complexity = estimateComplexity(fullText, workClass);
  const estimatedCrew = estimateCrew(workClass, complexity);
  const estimatedMachines = estimateMachines(workClass);
  const estimatedDurationDays = estimateDurationDays(
    workClass,
    menge,
    einheit,
    input.projectDurationDays
  );

  const isMassPosition =
    menge >= 1000 && ["m", "lfm", "m2", "m²", "kg"].includes(norm(einheit));

  const isTimeSensitive =
    workClass === "Baustelleneinrichtung" ||
    hasAny(fullText, ["monat", "monate", "jahr", "jahre", "wochen", "dauer", "vorhalten"]);

  const shares = sharesFor(workClass, complexity);
  const shareSum = shares.reduce((s, [, , p]) => s + p, 0) || 100;

  const components: ReverseUrkalkulationComponent[] = shares.map(
    ([group, label, rawShare, reason]) => {
      const sharePercent = (rawShare / shareSum) * 100;
      const totalAmount = x84Total * (sharePercent / 100);
      const unitAmount = menge > 0 ? totalAmount / menge : x84UnitPrice * (sharePercent / 100);

      return {
        group,
        label,
        sharePercent: round2(sharePercent),
        unitAmount: round2(unitAmount),
        totalAmount: round2(totalAmount),
        reason,
      };
    }
  );

  const warnings: string[] = [];

  if (!langtext || langtext.trim().length < 20) {
    warnings.push("Langtext fehlt oder ist zu kurz. Bewertung nur eingeschränkt belastbar.");
  }

  if (x84UnitPrice <= 0) {
    warnings.push("Kein gültiger X84-Einheitspreis vorhanden.");
  }

  if (isTimeSensitive && !input.projectDurationDays) {
    warnings.push("Zeitabhängige Position erkannt. Projektdauer sollte in der Kalkulation berücksichtigt werden.");
  }

  if (input.projectDistanceKm == null) {
    warnings.push("Baustellenentfernung fehlt. Anfahrt/Transport können nur pauschal bewertet werden.");
  }

  const explanation =
    `X84 wurde als Angebotsbasis übernommen und rückwärts in eine Urkalkulation zerlegt. ` +
    `Erkannte Leistungsart: ${workClass}. ` +
    `Komplexität: ${complexity}. ` +
    `Geschätztes Team: ${estimatedCrew} Mann. ` +
    `Relevante Mittel: ${estimatedMachines.join(", ")}.` +
    (estimatedDurationDays ? ` Geschätzte Dauer: ${estimatedDurationDays} Tag(e).` : "");

  return {
    mode: "x84_reverse_urkalkulation",
    posNr: input.posNr,
    einheit,
    menge,
    x84UnitPrice: round2(x84UnitPrice),
    x84Total: round2(x84Total),
    workClass,
    complexity,
    isMassPosition,
    isTimeSensitive,
    estimatedCrew,
    estimatedMachines,
    estimatedDurationDays,
    components,
    explanation,
    warnings,
  };
}
