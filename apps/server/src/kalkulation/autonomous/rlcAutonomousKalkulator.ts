import { runKalkulationAgents } from "../agents/orchestrator";
import type { KalkulationAgentsResult } from "../agents/types";
import { calculateAutonomousUrkalkulation } from "./autonomousUrkalkulationEngine";
import { analyzeRlcProjectContext } from "./projectContextAnalyzer";
import type {
  RlcAutonomousCalcInput,
  RlcAutonomousCalcResult,
  RlcAutonomousProjectContext,
} from "./types";

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

export function mapAutonomousResultToKiRow(
  row: RlcAutonomousCalcInput,
  resolved: RlcAutonomousResolveResult
): any | null {
  const r = resolved.result;
  if (!r) return null;

  return {
    ...row,
    finalUnitPrice: r.unitPrice,
    suggestedUnitPrice: r.unitPrice,
    baseUnitPrice: r.unitPrice,
    rlcKiUnitPrice: r.unitPrice,
    totalNet: r.total,
    rlcKiTotal: r.total,
    confidence: r.confidence,
    riskLevel: r.riskLevel,
    calculationStatus: r.calculationStatus,
    source: r.source,
    gewerk: r.trade,
    bauverfahren: r.bauverfahren,
    leistungsart: r.leistungsart,
    priceBreakdown: r.costLines,
    rlcAutonomousContext: resolved.context,
    rlcAgentSummary: resolved.agents.summary,
    rlcAgentReports: resolved.agents.reports,
    warning: r.warnings.join(" · "),
    aiReason: r.aiReason,
  };
}
