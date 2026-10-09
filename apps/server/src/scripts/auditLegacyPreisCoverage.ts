import corpus from "../kalkulation/legacy/legacyPreisCoverageCorpus.json";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
import { RLC_PREIS_BIBLIOTHEK } from "../kalkulation/rlcPreisBibliothek";

type LegacyRow = {
  name: string;
  unit: string;
  category: string;
  group: string;
  kind: "auto-position" | "static-position" | "resource-reference";
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

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const rows = corpus as LegacyRow[];
const positionRows = rows.filter((x) => x.kind !== "resource-reference");
const resourceRows = rows.filter((x) => x.kind === "resource-reference");

let ok = 0;
let nullCount = 0;
let genericCount = 0;
let zeroCount = 0;
const failures: string[] = [];

for (let i = 0; i < positionRows.length; i++) {
  const x = positionRows[i];
  const row: any = {
    posNr: `LEGACY.${String(i + 1).padStart(5, "0")}`,
    kurztext: x.name,
    langtext: x.name,
    einheit: x.unit,
    menge: 1,
  };
  const result: any = calculateAutonomousUrkalkulation(row, ctx, [row]);

  if (!result) {
    nullCount++;
    failures.push(`NULL|${x.kind}|${x.category}|${x.unit}|${x.name}`);
    continue;
  }
  if (generic.has(String(result.leistungsart || ""))) {
    genericCount++;
    failures.push(
      `GENERIC|${x.kind}|${x.category}|${x.unit}|${x.name}|${result.leistungsart}`
    );
    continue;
  }
  if (!(Number(result.unitPrice) > 0)) {
    zeroCount++;
    failures.push(
      `ZERO|${x.kind}|${x.category}|${x.unit}|${x.name}|${result.leistungsart}`
    );
    continue;
  }
  ok++;
}

const currentNames = new Set(
  (RLC_PREIS_BIBLIOTHEK as any[]).map((x) => norm(x?.name))
);
const resourceExact = resourceRows.filter((x) => currentNames.has(norm(x.name))).length;
const resourceNoExact = resourceRows.length - resourceExact;

console.log(
  [
    "LEGACY_CORPUS",
    `TOTAL=${rows.length}`,
    `POSITIONS=${positionRows.length}`,
    `RESOURCES=${resourceRows.length}`,
  ].join("|")
);
console.log(
  [
    "LEGACY_POSITION_AUDIT",
    `OK=${ok}`,
    `NULL=${nullCount}`,
    `GENERIC=${genericCount}`,
    `ZERO=${zeroCount}`,
  ].join("|")
);
console.log(
  [
    "LEGACY_RESOURCE_REFERENCE",
    `EXACT_NAME=${resourceExact}`,
    `NO_EXACT_NAME=${resourceNoExact}`,
  ].join("|")
);

for (const f of failures.slice(0, 200)) console.error("LEGACY_GAP|" + f);

if (failures.length) {
  process.exitCode = 1;
}
