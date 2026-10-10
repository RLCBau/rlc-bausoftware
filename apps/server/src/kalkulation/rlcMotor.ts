/** RLC Motor: single authority for autonomous price-engine selection.
 * Currently delegates to verified V2 while V3 remains diagnostic.
 * No historic-price or X84 fallbacks are permitted here.
 */
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

  const engineResult = calculateAutonomousUrkalkulation(
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
