export type RlcGeometryResult = {
  value: number | null;
  unit: "m" | "m2" | "m3";
  formula: string;
  inputs: Record<string, number>;
  status: "resolved" | "missing_input";
};

function valid(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v) && v > 0);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function rectangleArea(
  lengthM?: number,
  widthM?: number
): RlcGeometryResult {
  if (!valid(Number(lengthM), Number(widthM))) {
    return {
      value: null,
      unit: "m2",
      formula: "L × B",
      inputs: {},
      status: "missing_input",
    };
  }

  return {
    value: round3(Number(lengthM) * Number(widthM)),
    unit: "m2",
    formula: "L × B",
    inputs: {
      lengthM: Number(lengthM),
      widthM: Number(widthM),
    },
    status: "resolved",
  };
}

export function rectangularVolume(
  lengthM?: number,
  widthM?: number,
  heightM?: number
): RlcGeometryResult {
  if (!valid(Number(lengthM), Number(widthM), Number(heightM))) {
    return {
      value: null,
      unit: "m3",
      formula: "L × B × H",
      inputs: {},
      status: "missing_input",
    };
  }

  return {
    value: round3(
      Number(lengthM) * Number(widthM) * Number(heightM)
    ),
    unit: "m3",
    formula: "L × B × H",
    inputs: {
      lengthM: Number(lengthM),
      widthM: Number(widthM),
      heightM: Number(heightM),
    },
    status: "resolved",
  };
}

export function rectanglePerimeter(
  lengthM?: number,
  widthM?: number
): RlcGeometryResult {
  if (!valid(Number(lengthM), Number(widthM))) {
    return {
      value: null,
      unit: "m",
      formula: "2 × (L + B)",
      inputs: {},
      status: "missing_input",
    };
  }

  return {
    value: round3(2 * (Number(lengthM) + Number(widthM))),
    unit: "m",
    formula: "2 × (L + B)",
    inputs: {
      lengthM: Number(lengthM),
      widthM: Number(widthM),
    },
    status: "resolved",
  };
}

export function rectangularWallArea(
  lengthM?: number,
  widthM?: number,
  wallHeightM?: number
): RlcGeometryResult {
  if (!valid(Number(lengthM), Number(widthM), Number(wallHeightM))) {
    return {
      value: null,
      unit: "m2",
      formula: "2 × (L + B) × H",
      inputs: {},
      status: "missing_input",
    };
  }

  return {
    value: round3(
      2 *
        (Number(lengthM) + Number(widthM)) *
        Number(wallHeightM)
    ),
    unit: "m2",
    formula: "2 × (L + B) × H",
    inputs: {
      lengthM: Number(lengthM),
      widthM: Number(widthM),
      wallHeightM: Number(wallHeightM),
    },
    status: "resolved",
  };
}

export type RlcExplicitGeometry = {
  lengthM: number;
  widthM: number;
  heightM?: number;
  source: string;
};

/**
 * Extrahiert ausschließlich ausdrücklich angegebene rechteckige Abmessungen.
 *
 * Beispiele:
 *   8 x 6 m
 *   8 m x 6 m
 *   8 × 6 m
 *   8,5 x 6,2 m
 *   8 x 6 x 2,5 m
 *
 * Keine fachliche Zuordnung zu einer LV-Leistung.
 * Diese erfolgt anschließend semantisch.
 */
export function extractExplicitRectangularGeometry(
  text: string
): RlcExplicitGeometry[] {
  const source = String(text || "");
  const results: RlcExplicitGeometry[] = [];

  const numberPattern = String.raw`\d+(?:[.,]\d+)?`;

  const pattern = new RegExp(
    `(${numberPattern})\\s*(?:m\\s*)?[x×]\\s*` +
      `(${numberPattern})\\s*(?:m\\s*)?` +
      `(?:[x×]\\s*(${numberPattern})\\s*(?:m\\s*)?)?m\\b`,
    "gi"
  );

  for (const match of source.matchAll(pattern)) {
    const lengthM = Number(String(match[1]).replace(",", "."));
    const widthM = Number(String(match[2]).replace(",", "."));
    const heightM = match[3]
      ? Number(String(match[3]).replace(",", "."))
      : undefined;

    if (!valid(lengthM, widthM)) continue;
    if (heightM !== undefined && !valid(heightM)) continue;

    results.push({
      lengthM,
      widthM,
      ...(heightM !== undefined ? { heightM } : {}),
      source: String(match[0]).trim(),
    });
  }

  return results;
}
