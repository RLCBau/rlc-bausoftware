import {
  BAU_TARIFF_2026,
  BAU_LOHNZUSATZ_WEST_2026,
  PERSONNEL_INTERNAL_COST_2026,
  MACHINE_INTERNAL_COST_2026,
  COMMERCIAL_REGIE_2026,
  tariffInternalCost,
} from "../kalkulation/autonomous/tiefbauCostRates2026";

const problems: string[] = [];

for (const [name, anchor] of Object.entries(BAU_TARIFF_2026)) {
  const calc = tariffInternalCost(anchor);
  if (!(calc > anchor.gtl)) problems.push(`PERSONNEL_NOT_ABOVE_GTL|${name}|${calc}|${anchor.gtl}`);
}

const personnelChecks: Array<[string, number, number]> = [
  ["helper", PERSONNEL_INTERNAL_COST_2026.helper_lg2, COMMERCIAL_REGIE_2026.helper],
  ["facharbeiter", PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4, COMMERCIAL_REGIE_2026.facharbeiter],
  ["spezial", PERSONNEL_INTERNAL_COST_2026.spezial_lg5, COMMERCIAL_REGIE_2026.spezialbaufacharbeiter],
  ["polier", PERSONNEL_INTERNAL_COST_2026.polier_lg6, COMMERCIAL_REGIE_2026.polier],
  ["bauleiter", PERSONNEL_INTERNAL_COST_2026.bauleiter, COMMERCIAL_REGIE_2026.bauleiter],
];
for (const [name, internal, commercial] of personnelChecks) {
  if (!(internal > 0 && commercial > internal)) problems.push(`PERSONNEL_MARGIN|${name}|${internal}|${commercial}`);
}

const machineChecks: Array<[string, number, number]> = [
  ["mini2t", MACHINE_INTERNAL_COST_2026.mini_excavator_2t, COMMERCIAL_REGIE_2026.miniExcavator2tWithOperator],
  ["compact6t", MACHINE_INTERNAL_COST_2026.compact_excavator_6t, COMMERCIAL_REGIE_2026.compactExcavator6tWithOperator],
  ["excavator14t", MACHINE_INTERNAL_COST_2026.excavator_14t, COMMERCIAL_REGIE_2026.excavator14tWithOperator],
  ["excavator22t", MACHINE_INTERNAL_COST_2026.excavator_22t, COMMERCIAL_REGIE_2026.excavator22tWithOperator],
  ["wheelLoader", MACHINE_INTERNAL_COST_2026.wheel_loader_09, COMMERCIAL_REGIE_2026.wheelLoaderWithOperator],
  ["plateLight", MACHINE_INTERNAL_COST_2026.plate_light, COMMERCIAL_REGIE_2026.plateLight],
  ["plateHeavy", MACHINE_INTERNAL_COST_2026.plate_heavy, COMMERCIAL_REGIE_2026.plateHeavy],
  ["roller14t", MACHINE_INTERNAL_COST_2026.roller_14t, COMMERCIAL_REGIE_2026.roller14tWithOperator],
  ["jointSaw", MACHINE_INTERNAL_COST_2026.joint_saw, COMMERCIAL_REGIE_2026.jointSaw],
];
for (const [name, internal, commercial] of machineChecks) {
  if (!(internal > 0 && commercial > internal)) problems.push(`MACHINE_MARGIN|${name}|${internal}|${commercial}`);
}

console.log(`COST_RATES_2026|LOHNZUSATZ=${BAU_LOHNZUSATZ_WEST_2026}|PERSONNEL=${personnelChecks.length}|MACHINES=${machineChecks.length}|FAILURES=${problems.length}`);
console.log("PERSONNEL_INTERNAL", PERSONNEL_INTERNAL_COST_2026);
console.log("MACHINE_INTERNAL", MACHINE_INTERNAL_COST_2026);
for (const p of problems) console.error(p);
if (problems.length) process.exitCode = 1;
