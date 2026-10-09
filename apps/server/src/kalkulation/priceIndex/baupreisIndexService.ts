export type BaupreisIndexFamily =
  | "UNSUPPORTED"
  | "STRASSENBAU"
  | "KANALBAU"
  | "ERDARBEITEN"
  | "ASPHALT"
  | "PFLASTER"
  | "TIEFBAU";

export type BaupreisIndexPoint = {
  date: string;
  index: number;
};

import {
  detectPrimaryRlcConstructionFamily,
} from "../domain/constructionFamilyRegistry";

import {
  STRASSENBAU_SERIES,
  KANALBAU_SERIES,
  TIEFBAU_SERIES,
  ERDARBEITEN_SERIES,
  ASPHALT_SERIES,
  PFLASTER_SERIES,
} from "./destatisBaupreisIndexData";

export type BaupreisIndexResult = {
  factor: number;
  sourceIndex: number | null;
  targetIndex: number | null;
  sourceDate: string | null;
  targetDate: string | null;
  family: BaupreisIndexFamily;
  source: string;
  reliable: boolean;
};

/*
 * RLC Baupreisindex Service
 *
 * Einzige zulässige Quelle für historische Baupreisfortschreibung.
 *
 * Keine pauschale jährliche Inflationsrate.
 * Keine X84-Preise als Kalkulationsquelle.
 *
 * Die offiziellen Destatis-Zeitreihen werden separat versioniert
 * eingespielt. Solange keine belastbaren Indexpunkte vorhanden sind,
 * liefert der Service neutral Faktor 1.0.
 */

/*
 * Destatis Baupreisindizes Ingenieurbau
 * Basis 2021 = 100.
 *
 * Quelle:
 * Statistisches Bundesamt – Baupreisindizes Ingenieurbau.
 *
 * Referenzmonate:
 * Q1 = Februar
 * Q2 = Mai
 * Q3 = August
 * Q4 = November
 */

const SERIES: Partial<Record<
  BaupreisIndexFamily,
  BaupreisIndexPoint[]
>> = {
  STRASSENBAU: STRASSENBAU_SERIES,
  KANALBAU: KANALBAU_SERIES,
  ASPHALT: ASPHALT_SERIES,
  PFLASTER: PFLASTER_SERIES,
  ERDARBEITEN: ERDARBEITEN_SERIES,
  TIEFBAU: TIEFBAU_SERIES,
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function classifyBaupreisIndexFamily(
  text: unknown
): BaupreisIndexFamily {
  const raw = String(text ?? "");
  const t = normalizeText(raw);

  /*
   * Erst fachliche Construction Family bestimmen.
   * Dadurch darf z.B. "Bodenplatte" niemals wegen "boden"
   * als Erdarbeit indexiert werden.
   */
  const constructionFamily =
    detectPrimaryRlcConstructionFamily(raw).id;

  if (constructionFamily === "KANALBAU") {
    return "KANALBAU";
  }

  if (constructionFamily === "ERDARBEITEN") {
    return "ERDARBEITEN";
  }

  if (constructionFamily === "KABELBAU") {
    return "TIEFBAU";
  }

  if (constructionFamily === "STRASSENBAU") {
    if (/asphalt|bitumen|asphaltdecke|asphalttragschicht/.test(t)) {
      return "ASPHALT";
    }

    if (/pflaster|pflasterdecke|natursteinpflaster|betonpflaster/.test(t)) {
      return "PFLASTER";
    }

    return "STRASSENBAU";
  }

  return "UNSUPPORTED";
}

function validDate(value: unknown): Date | null {
  if (!value) return null;

  const d = new Date(String(value));

  return Number.isFinite(d.getTime()) ? d : null;
}

function pointAtOrBefore(
  series: BaupreisIndexPoint[],
  date: Date
): BaupreisIndexPoint | null {
  if (!series.length) return null;

  const target = date.getTime();

  const eligible = series
    .map((p) => ({
      point: p,
      date: validDate(p.date),
    }))
    .filter(
      (x): x is { point: BaupreisIndexPoint; date: Date } =>
        x.date !== null && x.date.getTime() <= target
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return eligible[0]?.point ?? null;
}

export function getBaupreisIndexFactor(input: {
  sourceDate?: unknown;
  targetDate?: unknown;
  text?: unknown;
  family?: BaupreisIndexFamily;
}): BaupreisIndexResult {
  const family =
    input.family ?? classifyBaupreisIndexFamily(input.text);

  const sourceDate = validDate(input.sourceDate);
  const targetDate = validDate(input.targetDate) ?? new Date();

  if (family === "UNSUPPORTED") {
    return {
      factor: 1,
      sourceIndex: null,
      targetIndex: null,
      sourceDate: sourceDate?.toISOString() ?? null,
      targetDate: targetDate.toISOString(),
      family,
      source: "DESTatis:no-compatible-series",
      reliable: false,
    };
  }

  if (!sourceDate) {
    return {
      factor: 1,
      sourceIndex: null,
      targetIndex: null,
      sourceDate: null,
      targetDate: targetDate.toISOString(),
      family,
      source: "DESTatis:pending-series",
      reliable: false,
    };
  }

  const series = SERIES[family] ?? [];

  if (sourceDate.getTime() > targetDate.getTime()) {
    return {
      factor: 1,
      sourceIndex: null,
      targetIndex: null,
      sourceDate: sourceDate.toISOString(),
      targetDate: targetDate.toISOString(),
      family,
      source: "DESTatis:invalid-date-range",
      reliable: false,
    };
  }

  const sourcePoint = pointAtOrBefore(series, sourceDate);
  const targetPoint = pointAtOrBefore(series, targetDate);

  if (
    !sourcePoint ||
    !targetPoint ||
    sourcePoint.index <= 0 ||
    targetPoint.index <= 0
  ) {
    return {
      factor: 1,
      sourceIndex: sourcePoint?.index ?? null,
      targetIndex: targetPoint?.index ?? null,
      sourceDate: sourceDate.toISOString(),
      targetDate: targetDate.toISOString(),
      family,
      source: "DESTatis:pending-series",
      reliable: false,
    };
  }

  return {
    factor: targetPoint.index / sourcePoint.index,
    sourceIndex: sourcePoint.index,
    targetIndex: targetPoint.index,
    sourceDate: sourcePoint.date,
    targetDate: targetPoint.date,
    family,
    source: "DESTatis",
    reliable: true,
  };
}
