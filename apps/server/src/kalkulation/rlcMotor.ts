/** RLC Motor: single authority for autonomous price-engine selection.
 * Currently delegates to verified V2 while V3 remains diagnostic.
 * No historic-price or X84 fallbacks are permitted here.
 */
import { previewGaebResourceCosts } from "./autonomous/v3GaebCostPreview";
import type { CostPosition, CostRecipe } from "./autonomous/v3GaebCostPreview";
import { runKalkulationAgents } from "./agents/orchestrator";
import type { KalkulationAgentsResult } from "./agents/types";
import { calculateAutonomousUrkalkulation } from "./autonomous/autonomousUrkalkulationEngine";
import { analyzeRlcProjectContext } from "./autonomous/projectContextAnalyzer";
import type { RlcAutonomousCalcInput, RlcAutonomousCalcResult, RlcAutonomousProjectContext } from "./autonomous/types";

export type RlcAutonomousResolveResult = {
  context: RlcAutonomousProjectContext;
  agents: KalkulationAgentsResult;
  result: RlcAutonomousCalcResult | null;
};

/*
 * RLC SPEED: allRows è la stessa array per tutte le posizioni di un batch.
 * Il ProjectContext concatena/classifica l'intero LV e prima veniva ricalcolato
 * per ogni singola posizione. WeakMap evita il costo O(posizioni × LV completo)
 * senza conservare memoria oltre la vita del batch.
 */
const projectContextCache = new WeakMap<
  RlcAutonomousCalcInput[],
  Map<string, RlcAutonomousProjectContext>
>();

function getCachedProjectContext(
  rows: RlcAutonomousCalcInput[],
  projectCode?: string
): RlcAutonomousProjectContext {
  const key = String(projectCode || "");
  let byProject = projectContextCache.get(rows);
  if (!byProject) {
    byProject = new Map<string, RlcAutonomousProjectContext>();
    projectContextCache.set(rows, byProject);
  }
  const cached = byProject.get(key);
  if (cached) return cached;

  const context = analyzeRlcProjectContext(rows, projectCode);
  byProject.set(key, context);
  return context;
}

export function resolveRlcAutonomousCalculation(
  row: RlcAutonomousCalcInput,
  allRows: RlcAutonomousCalcInput[] = [],
  projectCode?: string
): RlcAutonomousResolveResult {
  const contextRows = allRows.length > 0 ? allRows : [row];
  const context = getCachedProjectContext(contextRows, projectCode);

  const agents = runKalkulationAgents({
    row,
    allRows: allRows.length > 0 ? allRows : [row],
    projectContext: context,
  });

  const engineResult = calculateRlcMotorWithContext(
    row,
    context,
    allRows.length > 0 ? allRows : [row]
  );

  const result = engineResult
    ? {
        ...engineResult,
        // Il Family Catalog V2 è l'autorità per rischio e Prüfstatus.
        // Gli agenti restano controllo/diagnostica, ma non possono trasformare
        // una posizione V2 risolta in needs_review solo per euristiche generiche.
        confidence: engineResult.confidence,
        riskLevel: engineResult.riskLevel,
        calculationStatus: engineResult.calculationStatus,
        warnings: Array.from(
          new Set([
            ...engineResult.warnings,
            ...(engineResult.calculationStatus === "needs_review" ? agents.warnings : []),
          ])
        ),
        aiReason:
          `${engineResult.aiReason} ` +
          `Agentenanalyse: ${agents.summary.trade}, ` +
          `${agents.summary.bauverfahren}, Risiko ${agents.summary.riskLevel}.`,
      }
    : null;

  return {
    context,
    agents,
    result,
  };
}

/** Central calculation entry for contexts already built by catalog/audit callers. */
export function calculateRlcMotorWithContext(
  row: RlcAutonomousCalcInput,
  context: RlcAutonomousProjectContext,
  allRows: RlcAutonomousCalcInput[] = []
): RlcAutonomousCalcResult | null {
  const result = calculateAutonomousUrkalkulation(row, context, allRows);
  if (!result || result.calculationStatus === "needs_review" || (result.unitPrice === 0 && result.total === 0 && result.costLines.length === 0)) return result;
  const amountValid = (value: number) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100));
  const linesValid = result.costLines.length > 0 && result.costLines.every(line =>
    amountValid(line.total) && amountValid(line.unitPrice) &&
    Number.isFinite(line.qty) && line.qty >= 0
  );
  const summedCents = result.costLines.reduce((sum, line) => sum + Math.round(line.total * 100), 0);
  const epCents = Math.round(result.unitPrice * 100);
  const quantity = Number(row.menge);
  const gpCents = Math.round(result.total * 100);
  const expectedGpCents = Math.round(result.unitPrice * Math.max(1, Number.isFinite(quantity) ? quantity : 0) * 100);
  const economicValid = amountValid(result.unitPrice) && amountValid(result.total) &&
    linesValid && result.unitPrice > 0 &&
    Number.isSafeInteger(summedCents) && Math.abs(summedCents - epCents) <= 2 &&
    Number.isSafeInteger(expectedGpCents) && Math.abs(expectedGpCents - gpCents) <= 1;
  if (economicValid) return result;
  return { ...result, unitPrice: 0, total: 0, costLines: [],
    calculationStatus: "needs_review", confidence: 0, riskLevel: "high",
    warnings: [...result.warnings, "RLC_MOTOR_ECONOMIC_INTEGRITY_FAILED"],
    aiReason: `${result.aiReason} RLC Motor: wirtschaftliche Konsistenzprüfung fehlgeschlagen; EP/GP gesperrt.` };

}

/** All unapproved V3 previews are controlled by RLC Motor, never the route.
 * Client-side approval flags and evidence references cannot authorize an EP. */
export function previewRlcMotorV3(position: CostPosition, recipe: CostRecipe) {
  const untrusted: CostRecipe = {
    ...recipe,
    components: recipe.components.map(component => ({...component, approved:false, evidenceId:null})),
    productivity: recipe.productivity ? {...recipe.productivity, approved:false, evidenceId:null} : undefined,
  };
  return previewGaebResourceCosts(position, untrusted);
}
