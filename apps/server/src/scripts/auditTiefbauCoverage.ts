import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
import { TIEFBAU_COVERAGE_CASES } from "../kalkulation/autonomous/tiefbauCoverageCases";

const ctx: any = {
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

const generic = new Set([
  "Kanalbauleistung",
  "Wasserleitungsbau",
  "Oberflächenwiederherstellung",
  "Oberflächenbau",
  "Erdbau/Schüttgut",
  "Sonderbauverfahren",
  "Grabenloser Leitungsbau",
  "Sicherungsleistung",
  "Dokumentationsleistung",
  "Entsorgungsleistung",
  "Prüfleistung",
  "Logistikleistung",
  "Gasleitungsbau",
  "Fernwärmebau",
  "Glasfaser-Kabelbau",
  "Kabelbau",
  "Leitungskreuzung",
]);

const failures: string[] = [];

for (let i = 0; i < TIEFBAU_COVERAGE_CASES.length; i++) {
  const c = TIEFBAU_COVERAGE_CASES[i];
  const row: any = {
    posNr: "AUDIT." + (i + 1),
    kurztext: c.text,
    langtext: c.text,
    einheit: c.unit,
    menge: 1,
  };
  const result: any = calculateAutonomousUrkalkulation(row, ctx, [row]);
  const la = result?.leistungsart || "NULL";
  if (!result || generic.has(la)) {
    failures.push(c.group + "|" + c.text + "|" + c.unit + "|" + la);
  }
}

console.log("TIEFBAU_COVERAGE total=" + TIEFBAU_COVERAGE_CASES.length + " failures=" + failures.length);
if (failures.length) {
  for (const failure of failures) console.error("COVERAGE_GAP " + failure);
  process.exit(1);
}
