import type { RlcAutonomousCalcInput, RlcAutonomousProjectContext, RlcRiskLevel } from "./types";

function s(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function risk(high: boolean, medium: boolean): RlcRiskLevel {
  if (high) return "high";
  if (medium) return "medium";
  return "low";
}

export function analyzeRlcProjectContext(rows: RlcAutonomousCalcInput[] = [], projectCode?: string): RlcAutonomousProjectContext {
  const joined = rows.map((r) => `${r.kurztext ?? ""} ${r.langtext ?? ""}`).join(" ").toLowerCase();

  const isTiefbau = includesAny(joined, [
    "rohrgraben",
    "aushub",
    "leitung",
    "kanal",
    "wasserleitung",
    "kabel",
    "schutzrohr",
    "verfüllung",
    "verdichtung",
  ]);

  const hasTraffic = includesAny(joined, [
    "verkehr",
    "straße",
    "fahrbahn",
    "asphalt",
    "sperrung",
    "ampel",
    "verkehrssicherung",
  ]);

  const hasDifficultLogistics = includesAny(joined, [
    "enge",
    "bestand",
    "kreuzung",
    "erschwernis",
    "zufahrt",
    "hang",
    "steigung",
    "innerorts",
  ]);

  const hasLongDuration = includesAny(joined, [
    "vorhaltung",
    "bauzeit",
    "winter",
    "monate",
    "2022 / 2023",
    "2 jahre",
  ]);

  const hasSpecialRisk = includesAny(joined, [
    "wasserhaltung",
    "verbau",
    "kontaminiert",
    "deponie",
    "kampfmittel",
    "altlast",
    "fels",
    "bodenklasse 7",
  ]);

  const logisticsRisk = risk(hasDifficultLogistics || hasSpecialRisk, hasTraffic);
  const trafficRisk = risk(false, hasTraffic);
  const durationRisk = risk(hasLongDuration, false);

  const difficulty: RlcRiskLevel =
    hasSpecialRisk || logisticsRisk === "high"
      ? "high"
      : hasTraffic || hasDifficultLogistics
        ? "medium"
        : "low";

  const warnings: string[] = [];
  if (hasTraffic) warnings.push("Verkehrsführung/Verkehrssicherung technisch und preislich prüfen.");
  if (hasDifficultLogistics) warnings.push("Logistik, Zufahrt und Arbeiten im Bestand erhöhen Kalkulationsrisiko.");
  if (hasLongDuration) warnings.push("Vorhaltung/Bauzeit beeinflusst Baustellengemeinkosten und Geräteansätze.");
  if (hasSpecialRisk) warnings.push("Sonderrisiken wie Verbau, Wasserhaltung, Fels, Deponie oder Altlasten prüfen.");

  return {
    projectCode,
    projectType: isTiefbau ? "Tiefbau / Leitungsbau" : "Allgemeine Bauleistung",
    trade: isTiefbau ? "Tiefbau" : "Allgemein",
    difficulty,
    logisticsRisk,
    trafficRisk,
    durationRisk,
    marketFactor: 1.17,
    distanceFactor: 1.0,
    confidence: rows.length > 0 ? 0.7 : 0.45,
    warnings,
  };
}
