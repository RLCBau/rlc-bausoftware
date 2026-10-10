/** V3 diagnostic bridge. It does not call a model, certify resources or authorize EP. */
import path from "node:path";
import { loadFamilyProductivityCoverage } from "./v3FamilyProductivityCoverage";
import { rankTechnicalFamilies } from "./v3SemanticFamilyGate";
import type { LunaInterpretation } from "./v3LunaFamilyMatcher";
import type { RlcAutonomousCalcInput } from "./types";

const coveragePath = path.resolve(__dirname, "../../../audit/productivity/all-families-coverage-2026.json");
let cached: ReturnType<typeof loadFamilyProductivityCoverage> | null = null;
let names: string[] | null = null;

export function diagnoseV3LunaCandidate(row: RlcAutonomousCalcInput, trade: string, ai: LunaInterpretation = {}) {
  if (!cached || !names) {
    cached = loadFamilyProductivityCoverage(coveragePath);
    // Index is read from the same certified-for-routing-only coverage file.
    const raw = require(coveragePath) as { families: Array<{ family: string }> };
    names = raw.families.map(entry => entry.family);
  }
  const diagnosis = rankTechnicalFamilies(trade, String(row.kurztext || ""), String(row.langtext || ""), String(row.einheit || ""), ai, cached, names);
  // V3 operation is advisory, but contradictory routing must fail closed.
  const candidates = diagnosis.candidates.map(candidate => {
    const name = candidate.family.toLocaleLowerCase("de-DE");
    const operation = ai.operation || "unknown";
    const contradicts =
      (operation === "remove" && /wiedereinbau|wiederverleg|neumontage/.test(name)) ||
      (operation === "install" && /asphaltausbau|rückbau|abbruch|demontage/.test(name));
    return contradicts
      ? { ...candidate, eligible: false, issues: [...candidate.issues, "v3_operation_family_conflict"] }
      : candidate;
  });
  return {
    ...diagnosis,
    candidates,
    eligibleCount: candidates.filter(candidate => candidate.eligible).length,
    authority: "RLC_MOTOR" as const,
    modelCalled: false as const,
    priceApproved: false as const,
  };
}
