import { calculateTiefbauFamilyCatalog } from "./tiefbauFamilyCatalog";
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
  return calculateTiefbauFamilyCatalog(row, ctx, allRows);
}
