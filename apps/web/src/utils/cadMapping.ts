// ============================================================
// CAD → LV MAPPING ENGINE
// ============================================================

export type CadItem = {
  kind: "AREA" | "LINE" | "POINT" | "VOLUME";
  layer?: string;
  label?: string; // es. "Asphaltdeckschicht Pos1.00.14"
  area_m2?: number;
  length_m?: number;
  volume_m3?: number;
  count?: number;
};

export type LVUnit = "m" | "m2" | "m3" | "stk";

export type LVTarget = {
  pos: string;
  kurztext: string;
  einheit: LVUnit;
  ep?: number;
};

type CadRule = {
  match: {
    layer?: RegExp;
    text?: RegExp;
    kind?: CadItem["kind"];
  };
  target: LVTarget;
};

// ============================================================
// REGOLE BASE
// ============================================================

const RULES: CadRule[] = [
  {
    match: { layer: /asphalt/i, text: /asphaltdeckschicht/i, kind: "AREA" },
    target: {
      pos: "001.002",
      kurztext: "Asphaltdeckschicht wiederherstellen",
      einheit: "m2",
      ep: 39.9,
    },
  },
  {
    match: { layer: /(speedpipe|leitung|trasse|rohr)/i, kind: "LINE" },
    target: {
      pos: "001.001",
      kurztext: "Speedpipe Verlegung 1,20 m Tiefe",
      einheit: "m",
      ep: 24.5,
    },
  },
  {
    match: { layer: /(kabel|strom)/i, kind: "LINE" },
    target: {
      pos: "002.010",
      kurztext: "Stromkabel im Schutzrohr verlegen",
      einheit: "m",
      ep: 18.9,
    },
  },
  {
    match: { layer: /(pflaster|stein)/i, kind: "AREA" },
    target: {
      pos: "003.005",
      kurztext: "Pflasterfläche herstellen",
      einheit: "m2",
      ep: 42.5,
    },
  },
];

// ============================================================
// HELPERS
// ============================================================

function norm(v?: string): string {
  return (v || "").trim().toLowerCase();
}

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function unitTextFromEinheit(e: LVUnit): string {
  switch (e) {
    case "m2":
      return "m²";
    case "m3":
      return "m³";
    case "stk":
      return "Stk";
    default:
      return "m";
  }
}

function calcMenge(item: CadItem, einheit: LVUnit): number {
  switch (einheit) {
    case "m2":
      return safeNumber(item.area_m2);
    case "m3":
      return safeNumber(item.volume_m3);
    case "stk":
      return safeNumber(item.count) || 1;
    case "m":
    default:
      return safeNumber(item.length_m);
  }
}

function ruleScore(rule: CadRule, item: CadItem): number {
  let score = 0;

  if (rule.match.kind) {
    if (rule.match.kind !== item.kind) return -1;
    score += 3;
  }

  if (rule.match.layer) {
    if (!rule.match.layer.test(item.layer || "")) return -1;
    score += 2;
  }

  if (rule.match.text) {
    if (!rule.match.text.test(item.label || "")) return -1;
    score += 2;
  }

  return score;
}

// ============================================================
// Utility: "Pos1.00.14" -> "1.00.14"
// ============================================================

export function extractPosFromText(t?: string): string | null {
  if (!t) return null;
  const m = t.match(/pos\.?\s*([\d.]+)/i);
  return m?.[1] ?? null;
}

// ============================================================
// Euristica fallback
// ============================================================

function heuristic(item: CadItem): LVTarget | null {
  const text = `${norm(item.layer)} ${norm(item.label)}`;

  if (/(asphalt|deck|pflaster|fläche)/.test(text) && item.kind === "AREA") {
    return {
      pos: "001.002",
      kurztext: "Asphalt / Fläche",
      einheit: "m2",
    };
  }

  if (/(leitung|trasse|kanal|rohr|kabel|speedpipe)/.test(text) && item.kind === "LINE") {
    return {
      pos: "001.001",
      kurztext: "Leitungstrasse",
      einheit: "m",
    };
  }

  if (/(schacht|punkt|anschluss)/.test(text) && item.kind === "POINT") {
    return {
      pos: "009.001",
      kurztext: "Punkt / Anschluss",
      einheit: "stk",
    };
  }

  if (/(aushub|graben|boden)/.test(text) && item.kind === "VOLUME") {
    return {
      pos: "004.001",
      kurztext: "Aushub / Bodenbewegung",
      einheit: "m3",
    };
  }

  return null;
}

// ============================================================
// Resolver principale
// ============================================================

export function resolveCadToLV(
  item: CadItem
): (LVTarget & { menge: number; unitText: string }) | null {
  const bestRule = RULES
    .map((rule) => ({ rule, score: ruleScore(rule, item) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.rule;

  let base: LVTarget | null = bestRule ? bestRule.target : heuristic(item);
  if (!base) return null;

  const posFromLabel = extractPosFromText(item.label);
  if (posFromLabel) {
    base = { ...base, pos: posFromLabel };
  }

  const menge = calcMenge(item, base.einheit);
  const unitText = unitTextFromEinheit(base.einheit);

  return {
    ...base,
    menge,
    unitText,
  };
}





