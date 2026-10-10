import { calculateTiefbauFamilyCatalog } from "./tiefbauFamilyCatalog";
import { familyContradictions } from "./v3FamilyContradictionGate";
import type {
  RlcAutonomousCalcInput,
  RlcAutonomousCalcResult,
  RlcAutonomousProjectContext,
} from "./types";

/**
 * Production autonomous kalkulation entry point.
 *
 * Tiefbau Family Catalog V2 is the single active autonomous engine.
 * The former V1 heuristic engine was permanently disabled and has been removed.
 */
export function calculateAutonomousUrkalkulation(
  row: RlcAutonomousCalcInput,
  ctx: RlcAutonomousProjectContext,
  allRows: RlcAutonomousCalcInput[] = []
): RlcAutonomousCalcResult | null {
  const calculated = calculateTiefbauFamilyCatalog(row, ctx, allRows);
  if (!calculated) return null;
  const shortText = String(row.kurztext || "");
  const longText = String(row.langtext || "");
  const candidates = [calculated.leistungsart, ...calculated.costLines.map(line => line.name)];
  const conflicts = [...new Set(candidates.flatMap(name => familyContradictions(shortText, longText, name)))];
  if (!conflicts.length) return calculated;
  // Fail closed: rejected recipe cannot reach productive EP, GP or its cost-line breakdown.
  return { ...calculated, unitPrice: 0, total: 0, costLines: [],
    calculationStatus: "needs_review", confidence: 0, riskLevel: "high",
    warnings: [...calculated.warnings, ...conflicts.map(reason => `V3_RECIPE_CONTRADICTION:${reason}`)],
    aiReason: `${calculated.aiReason} Technisch unvereinbare Ressourcen erkannt; Preisberechnung gesperrt.` };

}
