import type { RlcAutonomousCalcInput, RlcAutonomousProjectContext, RlcRiskLevel } from "./types";
import { getBaupreisIndexFactor } from "../priceIndex/baupreisIndexService";
import {
  detectRlcConstructionFamilies,
  detectPrimaryRlcConstructionFamily,
} from "../domain/constructionFamilyRegistry";

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

  const detectedFamilies = detectRlcConstructionFamilies(joined);
  const primaryFamily = detectPrimaryRlcConstructionFamily(joined);

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
  const envBgk = Number(process.env.RLC_KALKULATION_BGK_RATE);
  const envProfit = Number(process.env.RLC_KALKULATION_PROFIT_RATE);
  const bgkRate = Number.isFinite(envBgk) && envBgk >= 0 ? envBgk : 0;
  const profitRate = Number.isFinite(envProfit) && envProfit >= 0 ? envProfit : 0;
  if (!Number.isFinite(envBgk) || !Number.isFinite(envProfit)) {
    warnings.push("Kaufmännisches Zuschlagsprofil nicht konfiguriert: BGK/Gewinn werden nicht erfunden und bleiben 0 %. Bitte Firmenprofil konfigurieren.");
  }
  if (hasTraffic) warnings.push("Verkehrsführung/Verkehrssicherung technisch und preislich prüfen.");
  if (hasDifficultLogistics) warnings.push("Logistik, Zufahrt und Arbeiten im Bestand erhöhen Kalkulationsrisiko.");
  if (hasLongDuration) warnings.push("Vorhaltung/Bauzeit beeinflusst Baustellengemeinkosten und Geräteansätze.");
  if (hasSpecialRisk) warnings.push("Sonderrisiken wie Verbau, Wasserhaltung, Fels, Deponie oder Altlasten prüfen.");

  const marketIndex = getBaupreisIndexFactor({
    sourceDate: "2024-02-01",
    targetDate: new Date(),
    text: joined,
  });

  const marketFactor =
    marketIndex.reliable
      ? marketIndex.factor
      : 1;

  return {
    projectCode,
    projectType:
      detectedFamilies.length > 1
        ? detectedFamilies.map((f) => f.label).join(" / ")
        : primaryFamily.label,
    trade: primaryFamily.trade,
    difficulty,
    logisticsRisk,
    trafficRisk,
    durationRisk,
    marketFactor,
    distanceFactor: 1.0,
    bgkRate,
    profitRate,
    confidence: rows.length > 0 ? 0.7 : 0.45,
    warnings,
  };
}
