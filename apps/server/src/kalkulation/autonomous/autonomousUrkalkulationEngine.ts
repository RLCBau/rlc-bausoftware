import { calculateTiefbauFamilyCatalog } from "./tiefbauFamilyCatalog";
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

function addLine(
  lines: RlcAutonomousCostLine[],
  group: RlcAutonomousCostLine["group"],
  name: string,
  qty: number,
  unit: string,
  unitPrice: number,
  note?: string
): void {
  const total = round2(qty * unitPrice);
  if (total <= 0) return;

  lines.push({
    id: `${group.toLowerCase()}-${lines.length + 1}`,
    group,
    name,
    qty: round2(qty),
    unit,
    unitPrice: round2(unitPrice),
    total,
    note,
  });
}

function riskFromContext(ctx: RlcAutonomousProjectContext, extraHigh: boolean): RlcRiskLevel {
  if (extraHigh || ctx.difficulty === "high") return "high";
  if (ctx.difficulty === "medium" || ctx.logisticsRisk === "medium" || ctx.trafficRisk === "medium") return "medium";
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

function withSurcharges(
  lines: RlcAutonomousCostLine[],
  base: number,
  unit: string,
  riskLevel: RlcRiskLevel
): void {
  addLine(lines, "Gemeinkosten", "Baustellengemeinkosten", 1, unit, base * 0.1, "10 % aus autonomer RLC-Urkalkulation");
  addLine(lines, "Risiko", "Risikopuffer", 1, unit, base * (riskLevel === "high" ? 0.08 : riskLevel === "medium" ? 0.05 : 0.03), "Risikozuschlag nach Kontext");
  addLine(lines, "Gewinn", "Gewinnanteil", 1, unit, base * 0.08, "8 % Zielgewinn");
}

export function calculateAutonomousUrkalkulation(
  row: RlcAutonomousCalcInput,
  ctx: RlcAutonomousProjectContext
): RlcAutonomousCalcResult | null {
  const text = textOf(row);
  const qty = Math.max(1, n(row.menge));
  const unit = s(row.einheit || "EH");
  const lines: RlcAutonomousCostLine[] = [];
  const warnings: string[] = [...ctx.warnings];

  let trade = ctx.trade;
  let bauverfahren = "Autonome RLC-Urkalkulation";
  let leistungsart = "Allgemeine Bauleistung";
  let riskExtraHigh = false;

  if (text.includes("rohrgrabenaushub") || text.includes("rohrgraben") || text.includes("leitungsgraben")) {
    trade = "Erdarbeiten";
    bauverfahren = "Graben ausheben / Leitungsgraben herstellen";
    leistungsart = "Rohrgrabenaushub";

    const deep = text.includes("2,5") || text.includes("3,5") || text.includes("tiefe");
    const bkl7 = text.includes("bodenklasse 7") || text.includes("bd-kl. 7");
    const bkl6 = text.includes("bodenklasse 6") || text.includes("bd-kl. 6");
    riskExtraHigh = bkl7 || text.includes("verbau") || text.includes("wasserhaltung");

    const lohn = deep ? 7.8 : 6.4;
    const maschine = deep ? 14.8 : 12.5;
    const entsorgung = bkl7 ? 18.5 : bkl6 ? 12.5 : 7.5;
    const material = 0;

    addLine(lines, "Lohn", "Kolonne Tiefbau", 1, unit, lohn, deep ? "tiefer Rohrgraben" : "Standard-Rohrgraben");
    addLine(lines, "Maschinen", "Bagger / Verdichtung / Baustellengerät", 1, unit, maschine);
    addLine(lines, "Entsorgung", "Aushub laden, transportieren, entsorgen/umladen", 1, unit, entsorgung);
    if (material > 0) addLine(lines, "Material", "Nebenmaterial", 1, unit, material);
  } else if (text.includes("kabelschutzrohr") || text.includes("schutzrohr")) {
    trade = "Kabelbau";
    bauverfahren = "Kabelschutzrohr liefern und verlegen";
    leistungsart = "Kabelschutzrohr";

    addLine(lines, "Material", "Kabelschutzrohr Material", 1, unit, 9.5);
    addLine(lines, "Lohn", "Kolonne Kabelbau", 1, unit, 6.2);
    addLine(lines, "Maschinen", "Kleingeräte / Verdichtung", 1, unit, 2.6);
  } else if (text.includes("schutzmatte")) {
    trade = "Kabelbau";
    bauverfahren = "Kabelschutzmatte verlegen";
    leistungsart = "Schutzmatte";

    addLine(lines, "Material", "Schutzmatte Material", 1, unit, 11.5);
    addLine(lines, "Lohn", "Verlegen Schutzmatte", 1, unit, 5.8);
    addLine(lines, "Maschinen", "Nebenmaschinen", 1, unit, 1.2);
  } else if (text.includes("trassenwarnband") || text.includes("warnband") || text.includes("ortungsband")) {
    trade = "Leitungsbau";
    bauverfahren = "Warnband / Ortungsband verlegen";
    leistungsart = "Trassenwarnband";

    addLine(lines, "Material", "Warnband / Ortungsband", 1, unit, 0.28);
    addLine(lines, "Lohn", "Einbau im Leitungsgraben", 1, unit, 0.22);
  } else if (text.includes("baustelleneinrichtung") || text.includes("vorhaltung")) {
    trade = "Baustelleneinrichtung";
    bauverfahren = "Baustelleneinrichtung / Vorhaltung";
    leistungsart = "Pauschalposition";
    riskExtraHigh = true;

    addLine(lines, "Lohn", "Einrichten, Unterhalten, Räumen", 1, unit, 2200);
    addLine(lines, "Maschinen", "Transport, Container, Gerätevorhaltung", 1, unit, 3800);
    addLine(lines, "Material", "Absperrung, Beschilderung, Verbrauchsmaterial", 1, unit, 1200);
  } else {
    const catalogResult = calculateTiefbauFamilyCatalog(row, ctx);
    if (catalogResult) return catalogResult;
    return null;
  }

  const riskLevel = riskFromContext(ctx, riskExtraHigh);
  const base = sum(lines);
  withSurcharges(lines, base, unit, riskLevel);

  const unitPrice = round2(sum(lines) * ctx.marketFactor * ctx.distanceFactor);
  const total = round2(unitPrice * qty);

  if (riskLevel !== "low") {
    warnings.push("Autonome Urkalkulation prüfpflichtig: Projektparameter, Bauzeit, Entfernung, Geräte und Personalansatz kontrollieren.");
  }

  return {
    unitPrice,
    total,
    confidence: riskLevel === "high" ? 0.62 : riskLevel === "medium" ? 0.72 : 0.82,
    riskLevel,
    source: "rlc-autonomous-urkalkulation-v1",
    calculationStatus: statusFromRisk(riskLevel),
    trade,
    bauverfahren,
    leistungsart,
    costLines: lines,
    warnings,
    aiReason:
      `RLC Autonomous Urkalkulation V1: Position wurde aus Leistungsbestandteilen kalkuliert.\n` +
      `Bauverfahren: ${bauverfahren}.\n` +
      `Kostenbestandteile: Lohn, Material, Maschinen, Entsorgung/Nachunternehmer, Gemeinkosten, Risiko und Gewinn.\n` +
      `Marktfaktor: ${ctx.marketFactor}, Distanzfaktor: ${ctx.distanceFactor}. Kein X84 als Preisquelle verwendet.`,
  };
}
